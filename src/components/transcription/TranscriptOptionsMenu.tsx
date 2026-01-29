import React from "react";
import { FaEllipsisH } from "react-icons/fa";

type TranscriptOption = {
  id: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
};

type TranscriptAction =
  | {
      id: string;
      kind?: "action";
      label: string;
      icon?: React.ReactNode;
      onClick: () => void;
    }
  | {
      id: string;
      kind: "separator";
    };

type TranscriptMenuTheme = {
  menuBg: string;
  menuBorder: string;
  text: string;
  textSecondary: string;
  inputBg: string;
  inputBorder: string;
};

const defaultTheme: TranscriptMenuTheme = {
  menuBg: "var(--app-header-bg)",
  menuBorder: "var(--app-border-color)",
  text: "var(--app-text-color)",
  textSecondary: "var(--app-text-color-secondary)",
  inputBg: "var(--app-bg-color)",
  inputBorder: "var(--app-border-color)",
};

interface TranscriptOptionsMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  menuRef: React.RefObject<HTMLDivElement>;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClearSearch?: () => void;
  options: TranscriptOption[];
  actions?: TranscriptAction[];
  searchLabel?: string;
  searchPlaceholder?: string;
  optionsLabel?: string;
  showSearch?: boolean;
  triggerTitle?: string;
  triggerClassName?: string;
  triggerStyle?: React.CSSProperties;
  menuStyle?: React.CSSProperties;
  theme?: Partial<TranscriptMenuTheme>;
}

const TranscriptOptionsMenu: React.FC<TranscriptOptionsMenuProps> = ({
  isOpen,
  onToggle,
  menuRef,
  searchQuery,
  onSearchChange,
  onClearSearch,
  options,
  actions = [],
  searchLabel = "Search transcript",
  searchPlaceholder = "Type to filter...",
  optionsLabel = "Display options",
  showSearch = true,
  triggerTitle = "Transcript options",
  triggerClassName,
  triggerStyle,
  menuStyle,
  theme,
}) => {
  const resolvedTheme = { ...defaultTheme, ...theme };

  return (
    <>
      <button
        onClick={onToggle}
        className={triggerClassName}
        title={triggerTitle}
        style={triggerStyle}
      >
        <FaEllipsisH size={12} />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          style={{
            position: "absolute",
            top: "36px",
            right: 0,
            minWidth: "240px",
            backgroundColor: resolvedTheme.menuBg,
            border: `1px solid ${resolvedTheme.menuBorder}`,
            borderRadius: "8px",
            padding: "10px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            zIndex: 20,
            ...menuStyle,
          }}
        >
          {showSearch && (
            <div style={{ marginBottom: "8px" }}>
              <label style={{ fontSize: "0.75rem", color: resolvedTheme.textSecondary }}>
                {searchLabel}
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                style={{
                  width: "100%",
                  marginTop: "6px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: `1px solid ${resolvedTheme.inputBorder}`,
                  backgroundColor: resolvedTheme.inputBg,
                  color: resolvedTheme.text,
                  fontSize: "0.85rem",
                }}
              />
              {onClearSearch && searchQuery.trim() && (
                <button
                  onClick={onClearSearch}
                  className="secondary"
                  style={{
                    marginTop: "6px",
                    width: "100%",
                    padding: "6px 10px",
                    fontSize: "0.8rem",
                  }}
                >
                  Clear search
                </button>
              )}
            </div>
          )}
          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontSize: "0.75rem", color: resolvedTheme.textSecondary }}>
              {optionsLabel}
            </div>
            <div style={{ display: "grid", gap: "6px", marginTop: "6px" }}>
              {options.map((option) => (
                <label
                  key={option.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: resolvedTheme.text,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={option.checked}
                    onChange={option.onToggle}
                    style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          {actions.length > 0 && (
            <div style={{ display: "grid", gap: "6px" }}>
              {actions.map((action) => (
                <React.Fragment key={action.id}>
                  {action.kind === "separator" ? (
                    <div style={{ height: "1px", backgroundColor: resolvedTheme.menuBorder }} />
                  ) : (
                    <button
                      onClick={action.onClick}
                      className="secondary"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 10px",
                      }}
                    >
                      {action.icon}
                      {action.label}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default TranscriptOptionsMenu;
