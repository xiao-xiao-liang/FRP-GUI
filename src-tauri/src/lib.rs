use serde::{Deserialize, Serialize};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tokio::net::TcpStream;
use tokio::time::timeout;

pub mod credential_store;
pub mod server_preflight;
pub mod frps_deployment;
pub mod frpc_runtime;
pub mod app_lifecycle;
pub mod core_import;
pub mod core_download;
pub mod app_paths;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStartResult {
    pub accepted: bool,
    pub success: bool,
    pub pid: Option<u32>,
    pub error: Option<String>,
    pub failure_kind: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalFrpcCoreInspection {
    pub version: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RecognizedLocalFrpcCore {
    path: String,
    version: String,
    os: String,
    arch: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalFrpcCoreScanResult {
    recognized: Vec<RecognizedLocalFrpcCore>,
    skipped: Vec<core_import::SkippedLocalCore>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TcpTestResult {
    #[serde(rename = "latencyMs")]
    pub latency_ms: u64,
    pub reachable: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CoreVersionResult {
    pub version: String,
    #[serde(rename = "isServer")]
    pub is_server: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LogPayload {
    pub id: String,
    #[serde(rename = "profileId")]
    pub profile_id: String,
    #[serde(rename = "profileName")]
    pub profile_name: String,
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub raw: String,
}

pub struct AppState {
    pub frpc_manager: Arc<frpc_runtime::FrpcRuntimeManager>,
    pub core_download_manager: Arc<core_download::CoreDownloadManager>,
    pub app_settings: Arc<Mutex<app_lifecycle::AppSettings>>,
    pub tray_available: Arc<Mutex<bool>>,
    pub exit_shutdown_started: Arc<AtomicBool>,
}

#[tauri::command]
async fn start_core_download(
    request: core_download::CoreDownloadRequest,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<core_download::CoreDownloadTask, String> {
    let task = state.core_download_manager.start(request)?;
    let manager = state.core_download_manager.clone();
    let task_id = task.task_id.clone();
    tauri::async_runtime::spawn(async move { core_download::run_task(manager, app, task_id).await; });
    Ok(task)
}

#[tauri::command]
fn list_core_download_tasks(state: State<'_, AppState>) -> Vec<core_download::CoreDownloadTask> {
    state.core_download_manager.list()
}

#[tauri::command]
async fn resume_core_download(task_id: String, state: State<'_, AppState>, app: AppHandle) -> Result<core_download::CoreDownloadTask, String> {
    let task = state.core_download_manager.resume(&task_id)?;
    let manager = state.core_download_manager.clone();
    tauri::async_runtime::spawn(async move { core_download::run_task(manager, app, task_id).await; });
    Ok(task)
}

#[tauri::command]
fn cancel_core_download(task_id: String, state: State<'_, AppState>) -> Result<(), String> { state.core_download_manager.cancel(&task_id) }

#[tauri::command]
fn clear_core_download_task(task_id: String, state: State<'_, AppState>) -> Result<(), String> { state.core_download_manager.clear(&task_id) }

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn stop_all_profiles(app: &AppHandle) {
    let manager = app.state::<AppState>().frpc_manager.clone();
    tauri::async_runtime::spawn(async move {
        manager.shutdown_all().await;
    });
}

fn exit_after_stopping_profiles(app: &AppHandle) {
    let state = app.state::<AppState>();
    if !app_lifecycle::begin_exit_shutdown(&state.exit_shutdown_started) {
        return;
    }
    let app_handle = app.clone();
    let manager = state.frpc_manager.clone();
    tauri::async_runtime::spawn(async move {
        manager.shutdown_all().await;
        app_handle.exit(0);
    });
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, app_lifecycle::TRAY_MENU_OPEN, "打开主窗口", true, None::<&str>)?;
    let stop_all = MenuItem::with_id(app, app_lifecycle::TRAY_MENU_STOP_ALL, "停止全部连接", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, app_lifecycle::TRAY_MENU_EXIT, "退出应用", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &stop_all, &separator, &exit])?;

    let mut tray = TrayIconBuilder::with_id("frp-gui-tray")
        .menu(&menu)
        .tooltip("FRP-GUI Pro")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match app_lifecycle::tray_menu_action(event.id().as_ref()) {
            Some(app_lifecycle::TrayMenuAction::OpenMainWindow) => show_main_window(app),
            Some(app_lifecycle::TrayMenuAction::StopAllProfiles) => stop_all_profiles(app),
            Some(app_lifecycle::TrayMenuAction::ExitAfterStoppingProfiles) => {
                exit_after_stopping_profiles(app);
            }
            None => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, .. } | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. }) {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

/// 在桌面端启动前将已部署 FRPS 节点的 Token 写入临时 FRPC 配置。
/// Token 只在后端内存与子进程配置文件中出现，绝不返回 WebView。
fn inject_server_node_token(toml_content: &str, token: &str) -> Result<String, String> {
    let mut document = toml_content
        .parse::<toml::Table>()
        .map_err(|_| "方案 TOML 格式无效，无法注入节点凭据".to_string())?;
    let auth = document
        .entry("auth".to_string())
        .or_insert_with(|| toml::Value::Table(toml::Table::new()))
        .as_table_mut()
        .ok_or_else(|| "方案 auth 配置格式无效".to_string())?;
    auth.insert("token".to_string(), toml::Value::String(token.to_string()));
    toml::to_string(&document).map_err(|_| "无法生成临时 FRPC 配置".to_string())
}

#[tauri::command]
async fn inspect_frpc_core(file_path: String) -> LocalFrpcCoreInspection {
    match frpc_runtime::inspect_frpc_executable(&file_path).await {
        Ok(version) => LocalFrpcCoreInspection {
            version,
            error: None,
        },
        Err(error) => LocalFrpcCoreInspection {
            version: String::new(),
            error: Some(error),
        },
    }
}

#[tauri::command]
async fn scan_local_frpc_cores(directory_path: String) -> LocalFrpcCoreScanResult {
    let discovery = match tokio::task::spawn_blocking(move || {
        core_import::discover_frpc_candidates(std::path::Path::new(&directory_path))
    })
    .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(error)) => {
            return LocalFrpcCoreScanResult {
                recognized: Vec::new(),
                skipped: Vec::new(),
                error: Some(error),
            };
        }
        Err(_) => {
            return LocalFrpcCoreScanResult {
                recognized: Vec::new(),
                skipped: Vec::new(),
                error: Some("扫描本地 FRP 文件夹任务异常中断".to_string()),
            };
        }
    };

    let platform = get_system_platform();
    let mut recognized = Vec::new();
    let mut skipped = discovery.skipped;

    for candidate in discovery.candidates {
        match frpc_runtime::inspect_frpc_executable(candidate.to_string_lossy().as_ref()).await {
            Ok(version) => {
                let size_bytes = std::fs::metadata(&candidate).map(|metadata| metadata.len()).unwrap_or(0);
                recognized.push(RecognizedLocalFrpcCore {
                    path: candidate.to_string_lossy().to_string(),
                    version,
                    os: platform.os.clone(),
                    arch: platform.arch.clone(),
                    size_bytes,
                });
            }
            Err(error) => skipped.push(core_import::SkippedLocalCore {
                file_name: candidate
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("frpc")
                    .to_string(),
                reason: error,
            }),
        }
    }

    LocalFrpcCoreScanResult {
        recognized,
        skipped,
        error: None,
    }
}

#[tauri::command]
async fn start_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
    profile_name: Option<String>,
    _profile_type: String,
    toml_content: String,
    core_path: String,
    server_credential_ref: Option<String>,
) -> Result<ProcessStartResult, String> {
    if toml_content.trim().is_empty() {
        return Ok(ProcessStartResult {
            accepted: false,
            success: false,
            pid: None,
            error: Some("启动失败：配置文件内容为空 (0 字节)，请在连接编辑中检查配置并重新保存".to_string()),
            failure_kind: Some("startup".to_string()),
        });
    }

    let effective_toml = if let Some(reference) = server_credential_ref {
        let credentials = credential_store::load_frps_deployment_credentials(&reference)
            .map_err(|_| "无法读取已部署 FRPS 节点的安全凭据".to_string())?;
        let token = credentials
            .frp_token
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "所选 FRPS 节点没有可用的认证 Token".to_string())?;
        inject_server_node_token(&toml_content, &token)?
    } else {
        toml_content
    };
    let sink: Arc<dyn frpc_runtime::RuntimeEventSink> = Arc::new(frpc_runtime::TauriEventSink::new(app));
    let res = state
        .frpc_manager
        .start_profile_with_name(Some(sink), profile_id, profile_name, effective_toml, core_path)
        .await;

    Ok(ProcessStartResult {
        accepted: res.accepted,
        success: res.accepted,
        pid: res.pid,
        error: res.error,
        failure_kind: res.failure_kind,
    })
}

#[tauri::command]
async fn save_profile_toml_to_core(
    core_path: String,
    profile_name: String,
    toml_content: String,
) -> Result<String, String> {
    if toml_content.trim().is_empty() {
        return Err("配置文件内容为空，拒绝保存到核心目录".to_string());
    }
    let canonical_core = frpc_runtime::validate_core_path(&core_path)?;
    let written_path = frpc_runtime::write_profile_toml_to_core_dir(&canonical_core, &profile_name, &toml_content)?;
    Ok(written_path.to_string_lossy().to_string())
}


#[tauri::command]
async fn stop_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<ProcessStartResult, String> {
    let sink: Arc<dyn frpc_runtime::RuntimeEventSink> = Arc::new(frpc_runtime::TauriEventSink::new(app));
    let res = state
        .frpc_manager
        .stop_profile(Some(sink), profile_id)
        .await;

    Ok(ProcessStartResult {
        accepted: res.accepted,
        success: res.accepted,
        pid: res.pid,
        error: res.error,
        failure_kind: None,
    })
}

#[tauri::command]
async fn get_runtime_states(
    state: State<'_, AppState>,
) -> Result<Vec<frpc_runtime::FrpcRuntimeStateEvent>, String> {
    Ok(state.frpc_manager.get_runtime_states().await)
}

#[tauri::command]
async fn get_runtime_logs(
    state: State<'_, AppState>,
    profile_id: Option<String>,
) -> Result<Vec<frpc_runtime::FrpcRuntimeLogEvent>, String> {
    state.frpc_manager.get_runtime_logs(profile_id).await
}

#[tauri::command]
fn update_app_settings(
    state: State<'_, AppState>,
    settings: app_lifecycle::AppSettings,
) -> Result<(), String> {
    let mut stored = state
        .app_settings
        .lock()
        .map_err(|_| "应用设置状态不可用".to_string())?;
    *stored = settings;
    Ok(())
}

#[tauri::command]
fn hide_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
async fn exit_desktop_app(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if app_lifecycle::begin_exit_shutdown(&state.exit_shutdown_started) {
        let manager = state.frpc_manager.clone();
        tauri::async_runtime::spawn(async move {
            manager.shutdown_all().await;
            app.exit(0);
        });
    }
    Ok(())
}

#[tauri::command]
async fn test_tcp_connection(host: String, port: u16) -> Result<TcpTestResult, String> {
    let addr = format!("{}:{}", host, port);
    let start = std::time::Instant::now();
    let timeout_duration = Duration::from_secs(3);

    match timeout(timeout_duration, TcpStream::connect(&addr)).await {
        Ok(Ok(_stream)) => {
            let latency = start.elapsed().as_millis() as u64;
            Ok(TcpTestResult {
                latency_ms: latency,
                reachable: true,
                error: None,
            })
        }
        Ok(Err(e)) => Ok(TcpTestResult {
            latency_ms: 0,
            reachable: false,
            error: Some(format!("握手失败: {}", e)),
        }),
        Err(_) => Ok(TcpTestResult {
            latency_ms: 0,
            reachable: false,
            error: Some("连接超时 (超过 3 秒未响应)".to_string()),
        }),
    }
}

#[tauri::command]
async fn pick_core_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let mut dialog = rfd::FileDialog::new()
            .set_title("选择 FRP 核心程序 (frpc / frps)");
        #[cfg(target_os = "windows")]
        {
            dialog = dialog.add_filter("FRP 可执行程序 (*.exe)", &["exe"]);
        }
        dialog.pick_file().map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("唤起系统文件选择框失败: {e}"))
}

#[tauri::command]
async fn detect_core_version(file_path: String) -> Result<CoreVersionResult, String> {
    let path_buf = std::path::PathBuf::from(&file_path);
    if !path_buf.exists() {
        return Ok(CoreVersionResult {
            version: "未知".to_string(),
            is_server: file_path.to_lowercase().contains("frps"),
            error: Some("指定的文件路径不存在".to_string()),
        });
    }

    let is_server = file_path.to_lowercase().contains("frps");

    // 1. 尝试直接执行 -v 获取标准输出（统一使用 new_frpc_command 附带 CREATE_NO_WINDOW 无黑框）
    let cli_output = timeout(
        Duration::from_millis(1500),
        crate::frpc_runtime::new_frpc_command(path_buf.as_path())
            .arg("-v")
            .output(),
    )
    .await;
    if let Ok(Ok(out)) = cli_output {
        let stdout_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let stderr_str = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let combined = format!("{} {}", stdout_str, stderr_str);
        
        // 提取版本号
        for word in combined.split_whitespace() {
            let clean = word.trim_start_matches('v').trim_matches(|c: char| !c.is_ascii_digit() && c != '.');
            let parts: Vec<&str> = clean.split('.').collect();
            if parts.len() >= 2 && parts[0].parse::<u32>().is_ok() && parts[1].parse::<u32>().is_ok() {
                return Ok(CoreVersionResult {
                    version: format!("v{}", clean),
                    is_server,
                    error: None,
                });
            }
        }
    }

    // 2. 静态分析文件二进制内容中的 Go buildinfo 或 FRP 特征字符串
    if let Ok(file_bytes) = std::fs::read(&file_path) {
        let scan_len = std::cmp::min(file_bytes.len(), 8 * 1024 * 1024);
        let sample = &file_bytes[..scan_len];
        let text = String::from_utf8_lossy(sample);

        // 查找 github.com/fatedier/frp 模块版本
        if let Some(pos) = text.find("github.com/fatedier/frp") {
            let sub = &text[pos..std::cmp::min(pos + 120, text.len())];
            for token in sub.split_whitespace() {
                let clean = token.trim_start_matches('v').trim_matches(|c: char| !c.is_ascii_digit() && c != '.');
                let parts: Vec<&str> = clean.split('.').collect();
                if parts.len() >= 2 && parts[0].parse::<u32>().is_ok() {
                    return Ok(CoreVersionResult {
                        version: format!("v{}", clean),
                        is_server,
                        error: None,
                    });
                }
            }
        }

        // 查找文件名中的版本
        let file_name = path_buf.file_name().and_then(|n| n.to_str()).unwrap_or("");
        for token in file_name.split(|c: char| c == '_' || c == '-' || c == ' ') {
            let clean = token.trim_start_matches('v').trim_matches(|c: char| !c.is_ascii_digit() && c != '.');
            let parts: Vec<&str> = clean.split('.').collect();
            if parts.len() >= 2 && parts[0].parse::<u32>().is_ok() {
                return Ok(CoreVersionResult {
                    version: format!("v{}", clean),
                    is_server,
                    error: None,
                });
            }
        }
    }

    Ok(CoreVersionResult {
        version: "v0.61.1".to_string(),
        is_server,
        error: None,
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemPlatformInfo {
    pub os: String,
    pub arch: String,
    #[serde(rename = "osDisplay")]
    pub os_display: String,
    #[serde(rename = "archDisplay")]
    pub arch_display: String,
    #[serde(rename = "platformDisplay")]
    pub platform_display: String,
}

#[tauri::command]
fn get_system_platform() -> SystemPlatformInfo {
    let os = match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "darwin",
        "linux" => "linux",
        "android" => "android",
        _ => "unknown",
    };
    let os_display = match os {
        "windows" => "Windows",
        "darwin" => "macOS",
        "linux" => "Linux",
        "android" => "Android",
        _ => "未知系统",
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        "x86" => "386",
        "arm" => "arm",
        _ => "amd64",
    };
    let arch_display = match arch {
        "amd64" => "x86_64 (amd64)",
        "arm64" => "ARM64 (aarch64)",
        "386" => "x86 (32位)",
        "arm" => "ARM (32位)",
        _ => arch,
    };
    SystemPlatformInfo {
        os: os.to_string(),
        arch: arch.to_string(),
        os_display: os_display.to_string(),
        arch_display: arch_display.to_string(),
        platform_display: format!("{} {}", os_display, arch_display),
    }
}

#[tauri::command]
async fn pick_directory() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("选择 FRP 核心目录")
            .pick_folder()
            .map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("唤起系统目录选择框失败: {e}"))
}

#[tauri::command]
async fn pick_archive_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("选择 FRP 压缩包")
            .add_filter("FRP 压缩包 (*.zip, *.tar.gz, *.tgz)", &["zip", "tar.gz", "gz", "tgz"])
            .pick_file()
            .map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("唤起系统压缩包选择框失败: {e}"))
}

#[tauri::command]
async fn import_local_frpc_archive(
    app: AppHandle,
    archive_path: String,
) -> Result<RecognizedLocalFrpcCore, String> {
    let archive = std::path::PathBuf::from(&archive_path);
    if !archive.is_file() {
        return Err("所选压缩包文件不存在或无法读取".to_string());
    }
    if !core_import::is_archive_candidate(&archive) {
        return Err("所选文件不是支持的 FRP 压缩包（仅支持 .zip, .tar.gz, .tgz）".to_string());
    }

    let temp_staging = std::env::temp_dir().join(format!("frp-import-{}", uuid::Uuid::new_v4()));
    let extract_archive_path = archive.clone();
    let extract_staging = temp_staging.clone();

    // 1. 解压到临时目录
    tokio::task::spawn_blocking(move || {
        core_import::extract_archive_safe(&extract_archive_path, &extract_staging)
    })
    .await
    .map_err(|e| format!("解压任务异常: {e}"))??;

    // 2. 发现解压出来的可执行候选
    let scan_staging = temp_staging.clone();
    let discovery = match tokio::task::spawn_blocking(move || {
        core_import::discover_frpc_candidates(&scan_staging)
    })
    .await
    {
        Ok(Ok(d)) => d,
        Ok(Err(err)) => {
            let _ = std::fs::remove_dir_all(&temp_staging);
            return Err(format!("扫描解压内容失败: {err}"));
        }
        Err(e) => {
            let _ = std::fs::remove_dir_all(&temp_staging);
            return Err(format!("扫描解压内容异常: {e}"));
        }
    };

    if discovery.candidates.is_empty() {
        let _ = std::fs::remove_dir_all(&temp_staging);
        if discovery.skipped.iter().any(|s| s.file_name.to_lowercase().contains("frps")) {
            return Err("所选压缩包中仅包含 FRPS 服务端程序，未找到可用的 FRPC 客户端程序".to_string());
        }
        return Err("所选压缩包中未找到 frpc 或 frpc.exe 可执行文件".to_string());
    }

    let frpc_candidate = discovery.candidates[0].clone();

    // 3. 在当前宿主运行只读检查 (frpc --version)
    let version = match frpc_runtime::inspect_frpc_executable(frpc_candidate.to_string_lossy().as_ref()).await {
        Ok(v) => v,
        Err(err) => {
            let _ = std::fs::remove_dir_all(&temp_staging);
            return Err(format!("无法运行压缩包中的 FRPC 核心（可能与当前操作系统架构不匹配）: {err}"));
        }
    };

    // 4. 获取受管应用数据目录 cores/
    let app_data = app.path().app_data_dir().map_err(|e| {
        let _ = std::fs::remove_dir_all(&temp_staging);
        format!("无法获取应用数据目录: {e}")
    })?;
    let cores_dir = app_data.join("cores");
    let file_stem = archive
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported_frpc")
        .trim_end_matches(".tar");
    let target_install_dir = cores_dir.join(file_stem);

    let _ = std::fs::create_dir_all(&cores_dir);

    // 5. 迁移临时目录到受管目标目录
    if target_install_dir.exists() {
        let _ = std::fs::remove_dir_all(&target_install_dir);
    }
    if let Err(err) = std::fs::rename(&temp_staging, &target_install_dir) {
        if let Err(copy_err) = core_download::copy_directory(&temp_staging, &target_install_dir) {
            let _ = std::fs::remove_dir_all(&temp_staging);
            return Err(format!("安装核心目录失败: {copy_err} (原重命名错误: {err})"));
        }
        let _ = std::fs::remove_dir_all(&temp_staging);
    }

    // 6. 重新定位目标目录中的 frpc
    let rel_path = frpc_candidate
        .strip_prefix(&temp_staging)
        .map_err(|e| format!("路径计算错误: {e}"))?;
    let final_frpc_path = target_install_dir.join(rel_path);

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&final_frpc_path, std::fs::Permissions::from_mode(0o755));
    }

    let platform = get_system_platform();
    let size_bytes = std::fs::metadata(&final_frpc_path).map(|m| m.len()).unwrap_or(0);

    Ok(RecognizedLocalFrpcCore {
        path: final_frpc_path.to_string_lossy().to_string(),
        version,
        os: platform.os,
        arch: platform.arch,
        size_bytes,
    })
}

pub const MAX_CORE_ARCHIVE_BYTES: usize = 100 * 1024 * 1024;

pub fn validate_official_download_url(url: &str) -> Result<(&str, &str), String> {
    const PREFIX: &str = "https://github.com/fatedier/frp/releases/download/";
    if !url.starts_with(PREFIX) {
        return Err("仅支持从 GitHub 官方仓库下载 FRP 核心程序".to_string());
    }
    let remainder = &url[PREFIX.len()..];
    let parts: Vec<&str> = remainder.split('/').collect();
    if parts.len() != 2 || parts[0].trim().is_empty() || parts[1].trim().is_empty() {
        return Err("非法的 GitHub Release 资产下载地址".to_string());
    }
    let tag = parts[0];
    let asset_name = parts[1];
    Ok((tag, asset_name))
}

pub fn build_official_core_download_url(release_tag: &str, asset_name: &str) -> Result<String, String> {
    if !release_tag.starts_with('v')
        || !release_tag[1..].split('.').all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
        || !asset_name.starts_with("frp_")
        || !asset_name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
    {
        return Err("非法的 FRP Release 版本或资产名".to_string());
    }
    let url = format!("https://github.com/fatedier/frp/releases/download/{release_tag}/{asset_name}");
    validate_official_download_url(&url)?;
    Ok(url)
}

pub fn build_core_download_url(official_url: &str, mirror: &str) -> Result<String, String> {
    validate_official_download_url(official_url)?;

    match mirror {
        "official" => Ok(official_url.to_string()),
        "ghproxy" => Ok(format!("https://ghproxy.net/{official_url}")),
        "fastgit" => Ok(official_url.replacen(
            "https://github.com",
            "https://download.fastgit.org",
            1,
        )),
        _ => Err("不支持的核心下载镜像".to_string()),
    }
}

pub fn append_core_download_chunk(
    archive: &mut Vec<u8>,
    hasher: &mut sha2::Sha256,
    max_size: usize,
    chunk: &[u8],
) -> Result<(), String> {
    let next_size = archive
        .len()
        .checked_add(chunk.len())
        .ok_or_else(|| "FRP 安装包大小超出安全限制".to_string())?;
    if next_size > max_size {
        return Err("FRP 安装包超过 100 MiB 安全限制，已拒绝安装".to_string());
    }

    use sha2::Digest;
    hasher.update(chunk);
    archive.extend_from_slice(chunk);
    Ok(())
}


#[tauri::command]
async fn run_server_preflight(
    request: server_preflight::ServerPreflightRequest,
) -> Result<server_preflight::ServerPreflightResult, String> {
    server_preflight::run_server_preflight(request).await
}

#[tauri::command]
async fn run_frps_operation(
    request: frps_deployment::ServerOperationRequest,
) -> Result<frps_deployment::ServerOperationResult, String> {
    frps_deployment::run_frps_operation(request).await
}

#[tauri::command]
fn get_default_cores_dir() -> String {
    app_paths::get_default_cores_dir().to_string_lossy().to_string()
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let _ = app_paths::ensure_data_subdirs();
            app_paths::migrate_legacy_data_if_needed(app.handle());

            let portable_root = app_paths::get_portable_data_dir();
            let manager = Arc::new(frpc_runtime::FrpcRuntimeManager::new(portable_root));
            let core_download_manager = Arc::new(core_download::CoreDownloadManager::new(
                app_paths::get_core_downloads_dir(),
            ));
            app.manage(AppState {
                frpc_manager: manager,
                core_download_manager,
                app_settings: Arc::new(Mutex::new(app_lifecycle::AppSettings::default())),
                tray_available: Arc::new(Mutex::new(false)),
                exit_shutdown_started: Arc::new(AtomicBool::new(false)),
            });
            let tray_available = setup_tray(app).is_ok();
            let state = app.state::<AppState>();
            if let Ok(mut available) = state.tray_available.lock() {
                *available = tray_available;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                let settings = state
                    .app_settings
                    .lock()
                    .map(|settings| settings.clone())
                    .unwrap_or_default();
                let tray_available = state.tray_available.lock().map(|available| *available).unwrap_or(false);
                api.prevent_close();
                if app_lifecycle::should_hide_on_close(&settings, tray_available) {
                    let _ = window.hide();
                    return;
                }

                let app_handle = window.app_handle().clone();
                let manager = state.frpc_manager.clone();
                tauri::async_runtime::spawn(async move {
                    let has_running_profile = manager
                        .get_runtime_states()
                        .await
                        .iter()
                        .any(|profile| matches!(profile.status.as_str(), "running" | "starting"));

                    match app_lifecycle::close_requested_action(
                        &settings,
                        tray_available,
                        has_running_profile,
                    ) {
                        app_lifecycle::CloseRequestedAction::RequestAppExitConfirmation => {
                            let _ = app_handle.emit("app-close-requested", ());
                        }
                        app_lifecycle::CloseRequestedAction::ExitAfterStoppingProfiles => {
                            exit_after_stopping_profiles(&app_handle);
                        }
                        app_lifecycle::CloseRequestedAction::HideToTray => {}
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_profile,
            save_profile_toml_to_core,
            stop_profile,
            get_runtime_states,
            get_runtime_logs,
            update_app_settings,
            hide_main_window,
            exit_desktop_app,
            test_tcp_connection,
            detect_core_version,
            inspect_frpc_core,
            scan_local_frpc_cores,
            pick_core_file,
            pick_directory,
            pick_archive_file,
            import_local_frpc_archive,
            get_system_platform,
            get_default_cores_dir,
            start_core_download,
            list_core_download_tasks,
            resume_core_download,
            cancel_core_download,
            clear_core_download_task,
            credential_store::store_server_credential,
            credential_store::delete_server_credentials,
            credential_store::store_profile_secret,
            credential_store::load_profile_secret,
            credential_store::delete_profile_secret,
            run_server_preflight,
            run_frps_operation
        ])
        .build(tauri::generate_context!())
        .expect("运行 FRP-GUI Tauri 应用出错")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<AppState>();
                if state.exit_shutdown_started.load(Ordering::Acquire) {
                    return;
                }
                let manager = state.frpc_manager.clone();
                tauri::async_runtime::block_on(async move {
                    manager.shutdown_all().await;
                });
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;

    #[test]
    fn test_validate_official_download_url_rejects_non_official() {
        assert!(validate_official_download_url("http://malicious.com/frp.zip").is_err());
        assert!(validate_official_download_url("https://github.com/evil/frp/releases/download/v0.61.1/frp.zip").is_err());
        assert!(validate_official_download_url("https://github.com/fatedier/frp/releases/download/").is_err());
        assert!(validate_official_download_url("https://github.com/fatedier/frp/releases/download/v0.61.1/").is_err());
    }

    #[test]
    fn test_validate_official_download_url_accepts_valid() {
        let (tag, asset) = validate_official_download_url(
            "https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_windows_amd64.zip",
        )
        .unwrap();
        assert_eq!(tag, "v0.61.1");
        assert_eq!(asset, "frp_0.61.1_windows_amd64.zip");
    }

    #[test]
    fn core_download_builds_transport_url_only_from_official_identity_and_known_mirror() {
        let official_url = "https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_windows_amd64.zip";

        assert_eq!(
            build_core_download_url(official_url, "ghproxy").unwrap(),
            format!("https://ghproxy.net/{official_url}"),
        );
        assert_eq!(
            build_core_download_url(official_url, "official").unwrap(),
            official_url,
        );
        assert!(build_core_download_url(official_url, "unknown").is_err());
        assert!(build_core_download_url("https://example.com/frpc.zip", "ghproxy").is_err());
    }

    #[test]
    fn core_download_builds_official_identity_only_from_valid_tag_and_asset() {
        assert_eq!(
            build_official_core_download_url(
                "v0.61.1",
                "frp_0.61.1_windows_amd64.zip",
            )
            .unwrap(),
            "https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_windows_amd64.zip",
        );
        assert!(build_official_core_download_url("latest", "frp_0.61.1_windows_amd64.zip").is_err());
        assert!(build_official_core_download_url("v0.61.1", "../frpc.zip").is_err());
    }

    #[test]
    fn core_download_rejects_archive_larger_than_configured_limit() {
        let mut archive = Vec::new();
        let mut hasher = sha2::Sha256::new();

        append_core_download_chunk(&mut archive, &mut hasher, 4, &[1, 2, 3, 4]).unwrap();
        assert!(append_core_download_chunk(&mut archive, &mut hasher, 4, &[5]).is_err());
        assert_eq!(archive, vec![1, 2, 3, 4]);
    }

    #[test]
    fn server_node_token_is_injected_without_exposing_it_to_the_frontend() {
        let toml = "serverAddr = \"frp.example.test\"\nserverPort = 7000\n\n[[proxies]]\nname = \"ssh\"\ntype = \"tcp\"\nlocalPort = 22\nremotePort = 6022";

        let rendered = inject_server_node_token(toml, "node-token-secret").unwrap();
        let parsed = rendered.parse::<toml::Table>().unwrap();

        assert_eq!(parsed["auth"]["token"].as_str(), Some("node-token-secret"));
        assert_eq!(parsed["serverAddr"].as_str(), Some("frp.example.test"));
    }
}
