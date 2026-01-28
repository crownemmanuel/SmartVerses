# Multi-Window Implementation Guide (Single Binary Approach)

This document outlines the architectural patterns and fixes required to successfully implement multi-window functionality within a single Tauri application. This approach allows opening secondary windows (like an "Audience Display" or "Test Window") that are part of the main application binary but render different content.

## The Core Problem

When opening a new window in a Tauri React application, the new window by default loads `index.html` and executes the entire `src/main.tsx` entry point. This leads to:

1.  **Full App Re-initialization**: The new window tries to load the entire `App` component, including global providers (Context API), database connections, and Router logic.
2.  **Resource Conflicts**: Two windows trying to initialize the same heavy resources (like database connections or singleton services) can cause race conditions or crashes.
3.  **UI Flashes**: The user might momentarily see the main dashboard before the app switches to the intended "secondary" view.
4.  **Blank/Frozen Screens**: If the main app logic throws an error because it expects to be the primary window (e.g., missing DOM elements), the secondary window will crash and appear white/blank.

## The Solution: Synchronous Window Detection & Conditional Rendering

To fix this, the application must detect *which* window is loading **before** rendering the main application logic.

### 1. Synchronous Window Label Detection in `App.tsx`

Do not use `useEffect` to check the window label. `useEffect` runs *after* the first render, which is too late. instead, initialize state synchronously:

```typescript
import { getCurrentWindow } from "@tauri-apps/api/window";

function App() {
  // 1. Get the label synchronously during initial state setup
  const [windowLabel] = useState<string>(() => {
    try {
      return getCurrentWindow().label;
    } catch {
      return "unknown";
    }
  });

  // 2. Determine if this is a secondary window immediately
  const isSecondaryWindow = windowLabel.startsWith("dialog-");

  // ...
}
```

### 2. Early Return / Conditional Rendering

Prevent the main application stack (Router, Providers) from mounting if it is a secondary window.

```typescript
function App() {
  // ... detection logic above ...

  // 3. CRITICAL: Return specific component for secondary window immediately.
  // Do NOT render Router, StageAssistProvider, or global contexts here.
  if (isSecondaryWindow) {
    if (windowLabel === "dialog-audience-test") {
      return <AudienceDisplayTestWindow />;
    }
    return <DefaultSecondaryWindow />;
  }

  // 4. Only render the Main App if we are NOT a secondary window
  return (
    <Router>
      <StageAssistProvider>
        <AppContent />
      </StageAssistProvider>
    </Router>
  );
}
```

## Backend Configuration (Rust)

To support this frontend logic, the Rust backend must open windows correctly.

### 1. Capabilities & Permissions (`capabilities/default.json`)

Ensure the application has permissions to manage windows. Without these, `getCurrentWindow()` or window manipulation functions will fail.

```json
{
  "permissions": [
    "core:window:allow-set-focus",
    "core:window:allow-maximize",
    "core:window:allow-set-fullscreen",
    "core:window:allow-minimize",
    "core:window:allow-close",
    "window-state:default"
  ]
}
```

### 2. Window Creation Logic (`window_commands.rs`)

When creating the window in Rust, use `WebviewWindowBuilder`.

```rust
use tauri::{AppHandle, WebviewWindowBuilder, WebviewUrl};

async fn open_dialog_impl(handle: AppHandle, label: String) -> Result<(), String> {
    let dialog_label = format!("dialog-{}", label); // Convention used by frontend to detect type

    // Check if window already exists to avoid duplicates
    if let Some(existing_window) = handle.get_webview_window(&dialog_label) {
        existing_window.set_focus().unwrap();
        return Ok(());
    }

    // Load the default index.html (WebviewUrl::default())
    // The App.tsx logic we wrote above will handle what to RENDER inside it.
    let builder = WebviewWindowBuilder::new(
        &handle,
        &dialog_label,
        WebviewUrl::default()
    )
    .title("Secondary Window")
    .inner_size(800.0, 600.0);

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}
```

## Summary of Fixes

1.  **Frontend**: Switched from `useEffect` (asynchronous) to `useState` initializer (synchronous) for window label detection.
2.  **Architecture**: Implemented a "Gatekeeper" pattern in `App.tsx` that blocks the Main App from loading in secondary windows.
3.  **Permissions**: Added missing `core:window:*` permissions to allow the windows to function and be controlled.
