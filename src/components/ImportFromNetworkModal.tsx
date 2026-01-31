import React, { useState, useEffect } from "react";
import { FaSync, FaCheck, FaCheckDouble, FaCloud } from "react-icons/fa";
import { Slide, LayoutType, Playlist, PlaylistItem } from "../types";
import {
  fetchPlaylistsFromMaster,
  MasterPlaylistsResponse,
  loadLiveSlidesSettings,
} from "../services/liveSlideService";
import { loadNetworkSyncSettings } from "../services/networkSyncService";
import "../App.css";

interface ImportFromNetworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (
    itemName: string,
    templateName: string,
    slides: Pick<Slide, "text" | "layout" | "isAutoScripture">[],
    options?: { liveSlidesSessionId?: string; liveSlidesLinked?: boolean }
  ) => boolean;
}

const itemKey = (playlistId: string, itemId: string) =>
  `${playlistId}::${itemId}`;

const ImportFromNetworkModal: React.FC<ImportFromNetworkModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterPlaylists, setMasterPlaylists] = useState<Playlist[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    new Set()
  );
  const [importedCount, setImportedCount] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  // Get connection info from settings
  const networkSyncSettings = loadNetworkSyncSettings();
  const liveSlidesSettings = loadLiveSlidesSettings();
  const masterHost = networkSyncSettings.remoteHost;
  const masterPort = liveSlidesSettings.serverPort || 9876;

  // Auto-fetch when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setMasterPlaylists([]);
      setSelectedSessionIds(new Set());
      setImportedCount(0);
      setShowSuccess(false);
      
      // Auto-fetch sessions
      handleFetch();
    }
  }, [isOpen]);

  const handleFetch = async () => {
    if (!masterHost.trim()) {
      setError("Master host not configured. Please set up network sync in Settings → Network.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setMasterPlaylists([]);
    setSelectedSessionIds(new Set());

    try {
      const response: MasterPlaylistsResponse = await fetchPlaylistsFromMaster(
        masterHost.trim(),
        masterPort
      );

      setMasterPlaylists(response.playlists || []);

      const selectableIds = (response.playlists || []).flatMap((playlist) =>
        playlist.items.map((item) => itemKey(playlist.id, item.id))
      );
      setSelectedSessionIds(new Set(selectableIds));

      if (!response.playlists || response.playlists.length === 0) {
        setError(
          "No slides found on master server. Make sure API is turned on on the master."
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const apiDisabled =
        msg.toLowerCase().includes("api_disabled") ||
        msg.toLowerCase().includes("403");
      setError(
        apiDisabled
          ? "API is disabled on the master. Make sure API is turned on on the master."
          : `Failed to connect to master (${masterHost}:${masterPort}): ${msg}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSession = (sessionId: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const selectAll = () => {
    const selectableSessions = masterPlaylists.flatMap((playlist) =>
      playlist.items.map((item) => itemKey(playlist.id, item.id))
    );
    setSelectedSessionIds(new Set(selectableSessions));
  };

  const selectNone = () => {
    setSelectedSessionIds(new Set());
  };

  const convertPlaylistItemSlides = (
    item: PlaylistItem
  ): Pick<Slide, "text" | "layout" | "isAutoScripture">[] => {
    const ordered = [...item.slides].sort((a, b) => a.order - b.order);
    return ordered.map((slide) => ({
      text: slide.text,
      layout: slide.layout as LayoutType,
      isAutoScripture: slide.isAutoScripture,
    }));
  };

  const handleImport = () => {
    let imported = 0;
    let attempted = 0;
    const failedItems: string[] = [];

    // Clear any previous errors
    setError(null);

    masterPlaylists.forEach((playlist) => {
      playlist.items.forEach((item) => {
        const key = itemKey(playlist.id, item.id);
        if (selectedSessionIds.has(key)) {
          attempted++;
          const slides = convertPlaylistItemSlides(item);
          const success = onImport(item.title, item.templateName, slides);
          if (success) {
            imported++;
          } else {
            failedItems.push(item.title);
          }
        }
      });
    });

    setImportedCount(imported);
    // Show success if at least one item imported, or show error if all failed
    if (imported > 0) {
      setShowSuccess(true);
      if (failedItems.length > 0) {
        // Store failed items info for display
        setError(
          `Some items failed to import (missing templates): ${failedItems.join(", ")}`
        );
      }
    } else if (attempted > 0) {
      // All imports failed
      setError(
        `Failed to import ${attempted} item${attempted !== 1 ? "s" : ""}. ` +
        `Template${failedItems.length !== 1 ? "s" : ""} not found: ${failedItems.join(", ")}`
      );
      setShowSuccess(false);
    }
  };

  const totalItemsCount = masterPlaylists.reduce(
    (sum, playlist) => sum + playlist.items.length,
    0
  );

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "650px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <FaCloud />
          Import Slides from Network
        </h2>

        {showSuccess ? (
          <div
            style={{
              padding: "24px",
              borderRadius: "8px",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              backgroundColor: "rgba(34, 197, 94, 0.1)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "24px", marginBottom: "12px" }}>✓</div>
            <div
              style={{
                fontWeight: 600,
                fontSize: "1.1em",
                marginBottom: "8px",
                color: "#22c55e",
              }}
            >
              Import Complete!
            </div>
            <div
              style={{
                color: "var(--app-text-color-secondary)",
                fontSize: "0.9em",
              }}
            >
              Successfully imported {importedCount} item
              {importedCount !== 1 ? "s" : ""} from master.
            </div>
            {error && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(220, 38, 38, 0.1)",
                  border: "1px solid rgba(220, 38, 38, 0.3)",
                  color: "#EF4444",
                  fontSize: "0.85em",
                }}
              >
                {error}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Connection Info */}
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid var(--app-border-color)",
                backgroundColor: "var(--app-header-bg)",
                marginBottom: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ color: "var(--app-text-color-secondary)", fontSize: "0.85em" }}>
                  Fetching from:
                </span>{" "}
                <span style={{ fontWeight: 500 }}>
                  {masterHost}:{masterPort}
                </span>
              </div>
              <button
                onClick={handleFetch}
                className="btn-sm"
                disabled={isLoading}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <FaSync className={isLoading ? "spin" : ""} />
                {isLoading ? "Fetching..." : "Refresh"}
              </button>
            </div>

            {isLoading && masterPlaylists.length === 0 && (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                <FaSync className="spin" style={{ fontSize: "24px", marginBottom: "12px" }} />
                <div>Fetching slides from master...</div>
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(220, 38, 38, 0.1)",
                  border: "1px solid rgba(220, 38, 38, 0.3)",
                  color: "#EF4444",
                  marginBottom: "16px",
                }}
              >
                {error}
              </div>
            )}

            {/* Sessions List */}
            {masterPlaylists.length > 0 && (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>
                      Found {totalItemsCount} item
                      {totalItemsCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={selectAll}
                      className="btn-sm"
                      disabled={totalItemsCount === 0}
                      title="Select all items"
                    >
                      <FaCheckDouble style={{ marginRight: "4px" }} /> Select All
                    </button>
                    <button
                      onClick={selectNone}
                      className="btn-sm"
                      disabled={selectedSessionIds.size === 0}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    maxHeight: "300px",
                    overflowY: "auto",
                    border: "1px solid var(--app-border-color)",
                    borderRadius: "8px",
                    marginBottom: "16px",
                  }}
                >
                  {masterPlaylists.map((playlist) => (
                    <div
                      key={playlist.id}
                      style={{
                        borderBottom: "1px solid var(--app-border-color)",
                      }}
                    >
                      <div
                        style={{
                          padding: "10px 14px",
                          backgroundColor: "var(--app-header-bg)",
                          fontWeight: 600,
                          fontSize: "0.9rem",
                        }}
                      >
                        {playlist.name} ({playlist.items.length} item
                        {playlist.items.length !== 1 ? "s" : ""})
                      </div>
                      {playlist.items.map((item) => {
                        const key = itemKey(playlist.id, item.id);
                        const isSelected = selectedSessionIds.has(key);
                        const slideCount = item.slides.length;
                        const preview = item.slides[0]?.text || "";

                        return (
                          <div
                            key={key}
                            onClick={() => toggleSession(key)}
                            style={{
                              padding: "12px 16px",
                              borderTop: "1px solid var(--app-border-color)",
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              cursor: "pointer",
                              backgroundColor: isSelected
                                ? "var(--app-playlist-item-selected-bg)"
                                : "transparent",
                              transition: "background-color 0.15s ease",
                            }}
                          >
                            <div
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "4px",
                                border: `2px solid ${
                                  isSelected
                                    ? "var(--app-primary-color)"
                                    : "var(--app-border-color)"
                                }`,
                                backgroundColor: isSelected
                                  ? "var(--app-primary-color)"
                                  : "transparent",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {isSelected && (
                                <FaCheck
                                  style={{ color: "white", fontSize: "10px" }}
                                />
                              )}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 500,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                {item.title}
                                <span
                                  style={{
                                    fontSize: "0.75em",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    backgroundColor:
                                      "var(--app-text-color-secondary)",
                                    color: "var(--app-bg-color)",
                                  }}
                                >
                                  {item.templateName}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: "0.85em",
                                  color: "var(--app-text-color-secondary)",
                                  marginTop: "2px",
                                }}
                              >
                                {slideCount} slide{slideCount !== 1 ? "s" : ""}
                                {preview.trim().length > 0 && (
                                  <span>
                                    {" "}
                                    •{" "}
                                    {preview.replace(/\s+/g, " ").slice(0, 60)}
                                    {preview.replace(/\s+/g, " ").length > 60
                                      ? "..."
                                      : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}

            {!isLoading && masterPlaylists.length === 0 && !error && (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                No slides available on master server. Make sure API is turned on
                on the master.
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          {showSuccess ? (
            <button onClick={onClose} className="primary">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} disabled={isLoading}>
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="primary"
                disabled={selectedSessionIds.size === 0 || isLoading}
              >
                Import {selectedSessionIds.size} Item
                {selectedSessionIds.size !== 1 ? "s" : ""}
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default ImportFromNetworkModal;
