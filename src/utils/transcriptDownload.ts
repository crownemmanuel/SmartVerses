export type TranscriptSaveResult =
  | { status: "saved" }
  | { status: "cancelled" }
  | { status: "failed"; error: string }
  | { status: "fallback" };

type SaveTranscriptFileParams = {
  content: string;
  defaultBaseName: string;
  extension: "txt" | "json";
  mimeType: string;
  filterName: string;
};

function fallbackDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveTranscriptFile({
  content,
  defaultBaseName,
  extension,
  mimeType,
  filterName,
}: SaveTranscriptFileParams): Promise<TranscriptSaveResult> {
  const filename = `${defaultBaseName}.${extension}`;

  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const filePath = await dialog.save({
      defaultPath: filename,
      filters: [{ name: filterName, extensions: [extension] }],
    });
    if (!filePath) return { status: "cancelled" };
    let path = String(filePath);
    if (!path.toLowerCase().endsWith(`.${extension}`)) {
      path = `${path}.${extension}`;
    }
    try {
      await fs.writeTextFile(path, content);
      return { status: "saved" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: "failed", error: message };
    }
  } catch {
    fallbackDownload(content, filename, mimeType);
    return { status: "fallback" };
  }
}
