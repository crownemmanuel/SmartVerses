/**
 * AssemblyAI token helper (Universal Streaming v3)
 *
 * In Electron, token generation is done on the backend (IPC).
 * In Tauri, we do the same via a Rust `invoke` command to avoid WebView CORS issues.
 *
 * We keep a fetch() fallback for non-Tauri contexts (e.g., web preview),
 * but production Tauri should use the invoke path.
 *
 * IMPORTANT: v3 API has a maximum expires_in_seconds of 600 (10 minutes).
 * The endpoint changed from POST /v2/realtime/token to GET /v3/token.
 */

// v3 API limits expires_in_seconds to max 600 seconds (10 minutes)
const MAX_EXPIRES_IN_SECONDS = 600;

export async function getAssemblyAITemporaryToken(
  apiKey: string,
  expiresInSeconds: number = 600
): Promise<string> {
  // Clamp to v3 maximum
  const clampedExpires = Math.min(expiresInSeconds, MAX_EXPIRES_IN_SECONDS);

  // Prefer Tauri backend (bypasses WebView CORS)
  try {
    const mod = await import("@tauri-apps/api/core");
    const token = await mod.invoke<string>("assemblyai_create_streaming_token", {
      apiKey,
      expiresInSeconds: clampedExpires,
    });
    if (!token) throw new Error("Empty token returned from backend");
    return token;
  } catch (err) {
    // Fall back to browser fetch (may fail in Tauri due to CORS)
    try {
      // v3 uses GET with query parameters instead of POST with JSON body
      const url = new URL("https://streaming.assemblyai.com/v3/token");
      url.searchParams.set("expires_in_seconds", String(clampedExpires));

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: apiKey,
        },
      });

      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(
          `Token request failed: ${response.status} ${response.statusText}${bodyText ? ` - ${bodyText}` : ""}`
        );
      }

      const data = JSON.parse(bodyText) as { token?: string };
      if (!data.token) throw new Error("Token response missing `token`");
      return data.token;
    } catch (fetchErr) {
      const invokeMsg =
        err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      const fetchMsg =
        fetchErr instanceof Error
          ? fetchErr.message
          : typeof fetchErr === "string"
            ? fetchErr
            : JSON.stringify(fetchErr);
      throw new Error(`AssemblyAI token failed (invoke -> fetch). invoke=${invokeMsg}; fetch=${fetchMsg}`);
    }
  }
}

