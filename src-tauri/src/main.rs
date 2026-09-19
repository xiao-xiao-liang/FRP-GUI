#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 确保便携化数据子目录就绪，并将 WebView2 的用户数据目录收拢在安装目录的 data/webview 下，
    // 杜绝向用户主目录 (C:\Users\<user>\AppData\Local) 输出缓存与 LocalStorage。
    let _ = frp_gui_lib::app_paths::ensure_data_subdirs();
    let webview_dir = frp_gui_lib::app_paths::get_webview_dir();
    let _ = std::fs::create_dir_all(&webview_dir);
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_dir);

    frp_gui_lib::run();
}
