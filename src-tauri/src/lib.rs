mod projects;
mod pty;
mod session;

use pty::PtyState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PtyState::new())
        .invoke_handler(tauri::generate_handler![
            // PTY commands
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            // Project commands
            projects::scan_projects,
            projects::get_git_info,
            projects::get_pr_info,
            projects::get_pinned_projects,
            projects::toggle_pin,
            projects::create_project,
            projects::create_worktree,
            projects::delete_worktree,
            // Session commands
            session::save_session,
            session::load_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
