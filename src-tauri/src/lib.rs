mod git_ext;
mod github;
mod linear;
mod projects;
mod pty;
mod session;
mod token_store;
mod usage;

use pty::PtyState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(PtyState::new())
        .setup(|app| {
            // Rename the legacy `cc-tui` config dir to `switchyard` before any
            // config file is read or written, so existing settings/tokens carry over.
            projects::migrate_legacy_config_dir();
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
                .item(&PredefinedMenuItem::about(handle, Some("About Switchyard"), None)?)
                .separator()
                .item(&settings_item)
                .separator()
                .item(&PredefinedMenuItem::services(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(handle, Some("Hide Switchyard"))?)
                .item(&PredefinedMenuItem::hide_others(handle, None)?)
                .item(&PredefinedMenuItem::show_all(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(handle, Some("Quit Switchyard"))?)
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
            let reload_item = MenuItem::with_id(
                handle,
                "reload",
                "Reload",
                true,
                Some("CmdOrCtrl+R"),
            )?;
            let view_menu = SubmenuBuilder::new(handle, "View")
                .item(&reload_item)
                .separator()
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
                } else if event.id() == "reload" {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.eval("window.location.reload()");
                    }
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
            projects::get_git_remote_info,
            projects::remote_branch_url,
            projects::get_worktree_diff_stats,
            projects::get_pinned_projects,
            projects::toggle_pin,
            projects::create_project,
            projects::clone_repo,
            projects::create_worktree,
            projects::create_worktree_for_pr,
            projects::delete_worktree,
            projects::get_worktree_archive_status,
            projects::archive_worktree,
            projects::git_user_slug,
            projects::get_app_settings,
            projects::get_settings_schema,
            projects::settings_file_path,
            projects::set_scan_root,
            projects::add_project_path,
            projects::remove_project_path,
            projects::reorder_projects,
            projects::set_use_tmux,
            projects::set_desktop_notifications,
            projects::set_agents,
            projects::set_worktree_location,
            projects::discover_scripts,
            projects::set_project_scripts,
            projects::set_project_sort,
            projects::set_linear_issue_prefixes,
            // Session commands
            session::save_session,
            session::load_session,
            session::clear_session,
            // Claude usage
            usage::get_claude_usage,
            // Linear commands
            linear::linear_login,
            linear::linear_query,
            linear::linear_list_issues,
            linear::linear_issue_url,
            linear::linear_logout,
            linear::linear_is_connected,
            // GitHub commands (OAuth device flow + API, replacing the `gh` CLI)
            github::github_login,
            github::github_logout,
            github::github_is_connected,
            github::github_account,
            github::get_pr_info,
            github::gh_list_prs,
            github::gh_list_pull_requests,
            github::gh_list_issues,
            github::gh_list_branches,
            github::github_pr_checks,
            github::github_check_log,
            github::github_create_issue,
            // Git diff/status panel commands
            git_ext::git_changed_files,
            git_ext::git_file_diff,
            git_ext::git_default_branch,
            git_ext::git_local_branches,
            git_ext::git_checkout_branch,
            git_ext::git_list_tree,
            git_ext::read_file_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
