import { invoke } from "@tauri-apps/api/core";

export async function setApiEnabled(enabled: boolean): Promise<void> {
  await invoke("set_api_enabled", { enabled });
}
