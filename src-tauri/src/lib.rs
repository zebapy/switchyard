mod linear;
mod projects;
mod pty;
mod session;

use pty::PtyState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(PtyState::new())
        .setup(|app| {
            if let Err(e) = projects::write_settings_schema() {
                eprintln!("failed to write settings schema: {e}");
            }
            // Custom menu omitting the standard File > Close Window so that
            // Cmd+W reaches the webview and can be bound to "close active pane".
            let handle = app.handle();
            let settings_item = MenuItem::with_id(
                handle,
                "settings",
                "Settings…",
                true,
                Some("CmdOrCtrl+,"),
            )?;
            let app_menu = SubmenuBuilder::new(handle, "Switchyard")
                .item(&PredefinedMenuItem::about(handle, None, None)?)
                .separator()
                .item(&settings_item)
                .separator()
                .item(&PredefinedMenuItem::services(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(handle, None)?)
                .item(&PredefinedMenuItem::hide_others(handle, None)?)
                .item(&PredefinedMenuItem::show_all(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(handle, None)?)
                .build()?;
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .item(&PredefinedMenuItem::undo(handle, None)?)
                .item(&PredefinedMenuItem::redo(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(handle, None)?)
                .item(&PredefinedMenuItem::copy(handle, None)?)
                .item(&PredefinedMenuItem::paste(handle, None)?)
                .item(&PredefinedMenuItem::select_all(handle, None)?)
                .build()?;
            let view_menu = SubmenuBuilder::new(handle, "View")
                .item(&PredefinedMenuItem::fullscreen(handle, None)?)
                .build()?;
            let window_menu = SubmenuBuilder::new(handle, "Window")
                .item(&PredefinedMenuItem::minimize(handle, None)?)
                .build()?;
            let menu = Menu::with_items(handle, &[&app_menu, &edit_menu, &view_menu, &window_menu])?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                if event.id() == "settings" {
                    let _ = app.emit("menu:settings", ());
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // PTY commands.
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::list_tmux_sessions,
            pty::kill_tmux_session,
            // Project commands
            projects::scan_projects,
            projects::get_git_info,
            projects::get_pr_info,
            projects::gh_list_prs,
            projects::gh_list_issues,
            projects::gh_list_branches,
            projects::get_pinned_projects,
            projects::toggle_pin,
            projects::create_project,
            projects::clone_repo,
            projects::create_worktree,
            projects::delete_worktree,
            projects::get_app_settings,
            projects::get_settings_schema,
            projects::set_scan_root,
            projects::add_project_path,
            projects::remove_project_path,
            projects::set_use_tmux,
            projects::set_desktop_notifications,
            projects::set_agents,
            projects::find_package_jsons,
            projects::read_package_json_scripts,
            projects::set_project_scripts,
            // Session commands
            session::save_session,
            session::load_session,
            session::clear_session,
            // Linear commands
            linear::linear_login,
            linear::linear_query,
            linear::linear_logout,
            linear::linear_is_connected,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
