export const isDevModeEnabled = (): boolean =>
  import.meta.env.DEV &&
  (import.meta.env.VITE_DEV_MODE === "true" ||
    import.meta.env.VITE_SHOW_WINDOWS_WHISPER_ON_MAC === "true");
