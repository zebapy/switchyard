//! Repositions the macOS traffic-light buttons within their titlebar so Zen
//! mode can vertically center them in its tall toolbar and give them a left
//! inset that matches the toolbar's right padding. Zen and the standard UI
//! share one window, so this is applied on Zen enter and undone on exit.

#[cfg(target_os = "macos")]
mod imp {
    use objc2_app_kit::{NSWindow, NSWindowButton};
    use objc2_foundation::NSPoint;
    use std::sync::Mutex;
    use tauri::{Manager, Runtime, Window};

    #[derive(Clone, Copy)]
    struct Defaults {
        container_height: f64,
        origins: [NSPoint; 3],
    }

    #[derive(Default)]
    pub struct TrafficLightState {
        defaults: Mutex<Option<Defaults>>,
    }

    // SAFETY: must run on the main thread. Callers dispatch via run_on_main_thread.
    unsafe fn buttons(ns_window: &NSWindow) -> Option<[objc2::rc::Retained<objc2_app_kit::NSButton>; 3]> {
        let close = ns_window.standardWindowButton(NSWindowButton::CloseButton)?;
        let miniaturize = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton)?;
        let zoom = ns_window.standardWindowButton(NSWindowButton::ZoomButton)?;
        Some([close, miniaturize, zoom])
    }

    unsafe fn center(ns_window: &NSWindow, state: &TrafficLightState, left_inset: f64, band_height: f64) {
        let Some(buttons) = buttons(ns_window) else { return };

        // The container is the titlebar view two levels up from the close button.
        let container = buttons[0]
            .superview()
            .and_then(|view| view.superview());
        let Some(container) = container else { return };

        // Capture the untouched layout once so exit can restore it exactly.
        {
            let mut guard = state.defaults.lock().unwrap();
            if guard.is_none() {
                *guard = Some(Defaults {
                    container_height: container.frame().size.height,
                    origins: [
                        buttons[0].frame().origin,
                        buttons[1].frame().origin,
                        buttons[2].frame().origin,
                    ],
                });
            }
        }

        let window_height = ns_window.frame().size.height;
        let button_height = buttons[0].frame().size.height;

        // Grow the titlebar container to the toolbar band, pinned to the window top.
        let mut container_rect = container.frame();
        container_rect.size.height = band_height;
        container_rect.origin.y = window_height - band_height;
        container.setFrame(container_rect);

        // Buttons keep their spacing; recompute from the current pair (stable across calls).
        let spacing = buttons[1].frame().origin.x - buttons[0].frame().origin.x;
        let vertical = (band_height - button_height) / 2.0;
        for (index, button) in buttons.iter().enumerate() {
            button.setFrameOrigin(NSPoint {
                x: left_inset + (index as f64) * spacing,
                y: vertical,
            });
        }
    }

    unsafe fn reset(ns_window: &NSWindow, state: &TrafficLightState) {
        let Some(defaults) = *state.defaults.lock().unwrap() else { return };
        let Some(buttons) = buttons(ns_window) else { return };
        let container = buttons[0]
            .superview()
            .and_then(|view| view.superview());
        let Some(container) = container else { return };

        let window_height = ns_window.frame().size.height;
        let mut container_rect = container.frame();
        container_rect.size.height = defaults.container_height;
        container_rect.origin.y = window_height - defaults.container_height;
        container.setFrame(container_rect);

        for (index, button) in buttons.iter().enumerate() {
            button.setFrameOrigin(defaults.origins[index]);
        }
    }

    pub fn center_command<R: Runtime>(window: Window<R>, left_inset: f64, band_height: f64) -> Result<(), String> {
        let handle = window.clone();
        window
            .run_on_main_thread(move || {
                let Ok(ptr) = handle.ns_window() else { return };
                if ptr.is_null() {
                    return;
                }
                let ns_window: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
                let state = handle.state::<TrafficLightState>();
                let state = state.inner();
                unsafe { center(ns_window, &state, left_inset, band_height) };
            })
            .map_err(|error| error.to_string())
    }

    pub fn reset_command<R: Runtime>(window: Window<R>) -> Result<(), String> {
        let handle = window.clone();
        window
            .run_on_main_thread(move || {
                let Ok(ptr) = handle.ns_window() else { return };
                if ptr.is_null() {
                    return;
                }
                let ns_window: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
                let state = handle.state::<TrafficLightState>();
                let state = state.inner();
                unsafe { reset(ns_window, &state) };
            })
            .map_err(|error| error.to_string())
    }
}

#[cfg(target_os = "macos")]
pub use imp::TrafficLightState;

#[cfg(not(target_os = "macos"))]
#[derive(Default)]
pub struct TrafficLightState;

/// Center the traffic lights in a toolbar band of `band_height` px with a
/// `left_inset` px gap on the left. No-op off macOS.
#[tauri::command]
pub fn center_traffic_lights<R: tauri::Runtime>(
    window: tauri::Window<R>,
    left_inset: f64,
    band_height: f64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return imp::center_command(window, left_inset, band_height);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, left_inset, band_height);
        Ok(())
    }
}

/// Restore the traffic lights to their default macOS layout. No-op off macOS.
#[tauri::command]
pub fn reset_traffic_lights<R: tauri::Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return imp::reset_command(window);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Ok(())
    }
}
