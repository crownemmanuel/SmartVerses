//window_commands.rs contains the commands for the window
use log::error;
use tauri::{AppHandle, Manager, WebviewWindowBuilder};

#[tauri::command]
pub async fn open_dialog(
    app_handle: AppHandle,
    _webview_window: tauri::WebviewWindow,
    dialog_window: String,
    monitor_index: Option<usize>,
) -> Result<(), String> {
    // Existing logic for other dialogs (if any)
    open_dialog_impl(app_handle, dialog_window, monitor_index)
        .await
        .map_err(|e| e.to_string())
}

async fn open_dialog_impl(
    handle: AppHandle,
    dialog_window: String,
    monitor_index: Option<usize>,
) -> Result<(), String> {
    let dialog_label = format!("dialog-{}", dialog_window);
    let title = if dialog_window == "audience-test" {
        "Audience Screen".to_string()
    } else {
        dialog_window.clone()
    };

    if let Some(existing_window) = handle.get_webview_window(&dialog_label) {
        if let Err(e) = existing_window.set_focus() {
            error!("Error focusing the dialog window: {:?}", e);
        }
    } else {
        // Check if this is the second screen window or the audience test window
        let is_second_screen = dialog_window == "second-screen" || dialog_window == "audience-test";
        
        // Define the URL to load.
        let url = tauri::WebviewUrl::default();
        
        let mut builder = WebviewWindowBuilder::new(&handle, &dialog_label, url)
            .title(title)
            .decorations(!is_second_screen) // Borderless for second screen and audience test
            .inner_size(800.0, 600.0)
            .min_inner_size(800.0, 600.0);

        // Calculate position if a monitor is selected
        if let Some(index) = monitor_index {
            if let Ok(mut monitors) = handle.available_monitors() {
                monitors.sort_by(|a, b| {
                    let a_pos = a.position();
                    let b_pos = b.position();
                    let a_primary = a_pos.x == 0 && a_pos.y == 0;
                    let b_primary = b_pos.x == 0 && b_pos.y == 0;
                    if a_primary != b_primary {
                        return if a_primary { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater };
                    }
                    if a_pos.x != b_pos.x {
                        return a_pos.x.cmp(&b_pos.x);
                    }
                    if a_pos.y != b_pos.y {
                        return a_pos.y.cmp(&b_pos.y);
                    }
                    let a_size = a.size();
                    let b_size = b.size();
                    if a_size.width != b_size.width {
                        return a_size.width.cmp(&b_size.width);
                    }
                    if a_size.height != b_size.height {
                        return a_size.height.cmp(&b_size.height);
                    }
                    let a_name = a.name().map(|s| s.as_str()).unwrap_or("");
                    let b_name = b.name().map(|s| s.as_str()).unwrap_or("");
                    a_name.cmp(&b_name)
                });

                if let Some(monitor) = monitors.get(index) {
                    let monitor_position = monitor.position();
                    let monitor_size = monitor.size();
                    let scale_factor = monitor.scale_factor();
                    
                    if is_second_screen {
                        // For second screen: set size to match monitor and position at monitor origin
                        let monitor_width_logical = monitor_size.width as f64 / scale_factor;
                        let monitor_height_logical = monitor_size.height as f64 / scale_factor;
                        let monitor_x_logical = monitor_position.x as f64 / scale_factor;
                        let monitor_y_logical = monitor_position.y as f64 / scale_factor;
                        
                        builder = builder
                            .inner_size(monitor_width_logical, monitor_height_logical)
                            .position(monitor_x_logical, monitor_y_logical);
                    } else {
                        // For other windows: center on monitor
                        let window_width = 800.0;
                        let window_height = 600.0;
                        
                        let monitor_x_logical = monitor_position.x as f64 / scale_factor;
                        let monitor_y_logical = monitor_position.y as f64 / scale_factor;
                        let monitor_width_logical = monitor_size.width as f64 / scale_factor;
                        let monitor_height_logical = monitor_size.height as f64 / scale_factor;
                        
                        let x = monitor_x_logical + (monitor_width_logical / 2.0) - (window_width / 2.0);
                        let y = monitor_y_logical + (monitor_height_logical / 2.0) - (window_height / 2.0);
                        
                        builder = builder.position(x, y);
                    }
                } else {
                    // Fallback to center if monitor index is invalid
                    builder = builder.center();
                }
            } else {
                // Fallback to center if monitors can't be retrieved
                builder = builder.center();
            }
        } else {
            // Default to center if no monitor is selected
            builder = builder.center();
        }

        // Build the window
        let builder_res = builder.build();
        
        match builder_res {
            Ok(window) => {
                // Set fullscreen for second screen
                if is_second_screen {
                    if let Err(e) = window.set_fullscreen(true) {
                        error!("Failed to set fullscreen: {:?}", e);
                    }
                }
            },
            Err(e) => {
                error!("Failed to build window: {:?}", e);
                return Err(format!("Failed to build window: {}", e));
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn close_dialog(app_handle: AppHandle, dialog_window: String) -> Result<(), String> {
    let dialog_label = format!("dialog-{}", dialog_window);
    if let Some(window) = app_handle.get_webview_window(&dialog_label) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

