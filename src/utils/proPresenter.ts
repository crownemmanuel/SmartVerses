import { invoke } from "@tauri-apps/api/core";

export const formatTimer = (
  totalSeconds: number,
  format: "mm:ss" | "h:mm:ss"
): string => {
  const isNegative = totalSeconds < 0;
  const secs = Math.abs(Math.floor(totalSeconds));
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  const body = format === "h:mm:ss"
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(hours * 60 + minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return isNegative ? `-${body}` : body;
};

export const writeProPresenterTimer = async (
  outputDir: string,
  fileName: string,
  content: string
): Promise<void> => {
  const filePath = `${outputDir.replace(/\/?$/, "/")}${fileName}`;
  await invoke("write_text_to_file", { filePath, content });
};