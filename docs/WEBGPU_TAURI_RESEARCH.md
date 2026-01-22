# WebGPU Support in Tauri - Research Summary

## Current Status

**WebGPU is NOT officially supported in Tauri applications.**

### Key Findings:

1. **GitHub Issue #6381** - A feature request was opened in March 2023 asking for WebGPU support, but it was **closed as "not planned"** by the Tauri team.

2. **Underlying WebView Support:**
   - **Windows (WebView2)**: WebView2 (Chromium-based) does support WebGPU, but Tauri doesn't expose a way to enable it
   - **macOS/iOS (WebKit)**: WebKit has WebGPU support, but it's not exposed through Tauri
   - **Linux (WebKit)**: Similar situation to macOS

3. **The Problem:**
   - WebGPU requires experimental feature flags (like `--enable-unsafe-webgpu`) to be enabled
   - Tauri doesn't provide a configuration option to pass these flags to the underlying WebView
   - There's no API to access `CoreWebView2EnvironmentOptions` (Windows) or WebKit experimental features

## Why It's Slow

If WebGPU isn't available, your offline LLM models will use **WASM fallback**, which is **5-10x slower** than WebGPU. This is why you're experiencing slow performance.

## Potential Workarounds

### 1. **Check if WebGPU is Actually Available**

First, verify if WebGPU is actually available in your Tauri app:

```javascript
// In your app
const hasWebGPU = await (async () => {
  try {
    const nav = navigator as any;
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
})();
```

The test UI we created should show this status.

### 2. **Platform-Specific Considerations**

#### Windows:
- WebView2 should support WebGPU if:
  - You're using a recent version of Windows 10/11
  - You have a compatible GPU
  - Edge WebView2 runtime is up to date
- **Action**: Update Edge WebView2 runtime to the latest version

#### macOS:
- WebKit WebGPU support requires:
  - macOS 13+ (Ventura or later)
  - Compatible GPU
- **Action**: Ensure you're on macOS 13+ and have a compatible Mac

#### Linux:
- Requires Mesa drivers with WebGPU support
- **Action**: Update graphics drivers

### 3. **Possible Solutions (Advanced)**

#### Option A: Fork Tauri/Wry (Not Recommended)
- Fork the Tauri or Wry repository
- Modify the WebView initialization code to pass WebGPU flags
- Maintain your own fork
- **Downside**: High maintenance burden, breaks on Tauri updates

#### Option B: Use Native GPU Libraries
- Instead of WebGPU in the webview, use native GPU libraries (wgpu, Vulkan, Metal, DirectX)
- Render to a native window overlay
- **Downside**: Much more complex, requires Rust/C++ code

#### Option C: Use Electron Instead (Not Recommended)
- Electron has better WebGPU support
- **Downside**: Larger bundle size, different framework

### 4. **Check Tauri Version**

You're using Tauri 2. Check if there are any new features in recent versions:

```bash
# Check your Tauri version
cd src-tauri
cargo tree | grep tauri
```

### 5. **Monitor Tauri Updates**

- Watch the GitHub issue: https://github.com/tauri-apps/tauri/issues/6381
- Check Tauri 2.x release notes for WebGPU support
- Consider upvoting/commenting on the issue if it's reopened

## Recommendations

1. **Immediate**: Verify WebGPU availability in your test UI - it should show the actual device being used
2. **Short-term**: 
   - Update WebView2 runtime (Windows)
   - Ensure macOS 13+ (if on Mac)
   - Update graphics drivers
3. **Long-term**: 
   - Monitor Tauri GitHub for WebGPU support
   - Consider contributing to Tauri if you have Rust expertise
   - If WebGPU is critical, consider alternative approaches

## Testing WebGPU Availability

The test UI we created (`OfflineLLMTestUI`) now shows:
- Whether WebGPU is detected before loading
- Which device is actually being used (WebGPU vs WASM) after loading
- Performance stats that will help you see the difference

## References

- [Tauri Issue #6381](https://github.com/tauri-apps/tauri/issues/6381)
- [Tauri WebView Documentation](https://v2.tauri.app/reference/webview-versions/)
- [WebGPU Browser Support](https://caniuse.com/webgpu)
