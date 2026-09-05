use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tokio::net::TcpStream;
use tokio::time::timeout;

pub mod credential_store;
pub mod server_preflight;
pub mod frps_deployment;
pub mod frpc_runtime;

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
async fn start_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
    _profile_type: String,
    toml_content: String,
    core_path: String,
) -> Result<ProcessStartResult, String> {
    let sink: Arc<dyn frpc_runtime::RuntimeEventSink> = Arc::new(frpc_runtime::TauriEventSink::new(app));
    let res = state
        .frpc_manager
        .start_profile(Some(sink), profile_id, toml_content, core_path)
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
    #[cfg(target_os = "windows")]
    {
        let script = r#"
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Title = "选择 FRP 核心程序 (frpc / frps)"
        $dialog.Filter = "FRP 可执行程序 (*frp*.exe;frpc.exe;frps.exe)|*frp*.exe;frpc.exe;frps.exe|所有可执行程序 (*.exe)|*.exe|所有文件 (*.*)|*.*"
        $dialog.InitialDirectory = [Environment]::GetFolderPath("Desktop")
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            Write-Output $dialog.FileName
        }
        "#;
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let output = cmd.output();
        match output {
            Ok(out) => {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if path.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(path))
                }
            }
            Err(e) => Err(format!("唤起系统文件选择框失败: {}", e)),
        }
    }
    #[cfg(target_os = "macos")]
    {
        let script = r#"POSIX path of (choose file with prompt "选择 FRP 核心程序 (frpc / frps)")"#;
        let output = std::process::Command::new("osascript")
            .args(["-e", script])
            .output();
        match output {
            Ok(out) => {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if path.is_empty() { Ok(None) } else { Ok(Some(path)) }
            }
            Err(e) => Err(format!("唤起系统文件选择框失败: {}", e)),
        }
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let output = std::process::Command::new("zenity")
            .args(["--file-selection", "--title=选择 FRP 核心程序 (frpc / frps)"])
            .output();
        match output {
            Ok(out) => {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if path.is_empty() { Ok(None) } else { Ok(Some(path)) }
            }
            Err(_) => Ok(None),
        }
    }
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
    #[cfg(target_os = "windows")]
    {
        let script = r#"
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = "选择 FRP 核心下载与解压目标目录"
        $dialog.ShowNewFolderButton = $true
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            Write-Output $dialog.SelectedPath
        }
        "#;
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let output = cmd.output();
        match output {
            Ok(out) => {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if path.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(path))
                }
            }
            Err(e) => Err(format!("唤起系统目录选择框失败: {}", e)),
        }
    }
    #[cfg(target_os = "macos")]
    {
        let script = r#"POSIX path of (choose folder with prompt "选择 FRP 核心下载与解压目标目录")"#;
        let output = std::process::Command::new("osascript")
            .args(["-e", script])
            .output();
        match output {
            Ok(out) => {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if path.is_empty() { Ok(None) } else { Ok(Some(path)) }
            }
            Err(e) => Err(format!("唤起系统目录选择框失败: {}", e)),
        }
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let output = std::process::Command::new("zenity")
            .args(["--file-selection", "--directory", "--title=选择 FRP 核心下载与解压目标目录"])
            .output();
        match output {
            Ok(out) => {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if path.is_empty() { Ok(None) } else { Ok(Some(path)) }
            }
            Err(_) => Ok(None),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadCoreResult {
    pub success: bool,
    #[serde(rename = "exePath")]
    pub exe_path: String,
    #[serde(rename = "targetDir")]
    pub target_dir: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    pub version: String,
    pub os: String,
    pub arch: String,
    pub error: Option<String>,
}

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

#[tauri::command]
async fn download_and_extract_core(
    download_url: String,
    target_dir: String,
    version: String,
    target_os: String,
    target_arch: String,
) -> Result<DownloadCoreResult, String> {
    // 0. 验证官方下载源
    let (tag, asset_name) = match validate_official_download_url(&download_url) {
        Ok(res) => res,
        Err(e) => {
            return Ok(DownloadCoreResult {
                success: false,
                exe_path: String::new(),
                target_dir: target_dir.clone(),
                size_bytes: 0,
                version,
                os: target_os,
                arch: target_arch,
                error: Some(e),
            });
        }
    };

    let target_path = std::path::PathBuf::from(&target_dir);
    if let Err(e) = std::fs::create_dir_all(&target_path) {
        return Ok(DownloadCoreResult {
            success: false,
            exe_path: String::new(),
            target_dir: target_dir.clone(),
            size_bytes: 0,
            version,
            os: target_os,
            arch: target_arch,
            error: Some(format!("创建目标目录失败: {}", e)),
        });
    }

    // 1. 构建 HTTP 客户端
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("FRP-GUI-Client/1.0")
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;

    // 2. 获取同 release 的官方 SHA-256 校验和文件
    let checksums_url = format!("https://github.com/fatedier/frp/releases/download/{tag}/frp_sha256_checksums.txt");
    let checksums_resp = client
        .get(&checksums_url)
        .send()
        .await
        .map_err(|e| format!("下载官方 SHA-256 校验文件失败: {}", e))?;

    if !checksums_resp.status().is_success() {
        return Ok(DownloadCoreResult {
            success: false,
            exe_path: String::new(),
            target_dir: target_dir.clone(),
            size_bytes: 0,
            version,
            os: target_os,
            arch: target_arch,
            error: Some("下载官方 SHA-256 校验文件失败，请检查版本是否存在".to_string()),
        });
    }

    let checksums_text = checksums_resp
        .text()
        .await
        .map_err(|e| format!("读取官方 SHA-256 校验内容失败: {}", e))?;

    let expected_hash = match crate::frps_deployment::checksum_for_asset(&checksums_text, asset_name) {
        Ok(h) => h,
        Err(e) => {
            return Ok(DownloadCoreResult {
                success: false,
                exe_path: String::new(),
                target_dir: target_dir.clone(),
                size_bytes: 0,
                version,
                os: target_os,
                arch: target_arch,
                error: Some(e),
            });
        }
    };

    // 3. 下载预编译压缩包
    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("下载 FRP 压缩包失败 ({}): {}", download_url, e))?;

    if !response.status().is_success() {
        return Ok(DownloadCoreResult {
            success: false,
            exe_path: String::new(),
            target_dir: target_dir.clone(),
            size_bytes: 0,
            version,
            os: target_os,
            arch: target_arch,
            error: Some(format!("下载响应异常: HTTP {}", response.status())),
        });
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取下载数据流失败: {}", e))?;

    // 4. 计算并校验 SHA-256 哈希
    use sha2::Digest;
    let actual_hash = format!("{:x}", sha2::Sha256::digest(&bytes));
    if actual_hash != expected_hash {
        return Ok(DownloadCoreResult {
            success: false,
            exe_path: String::new(),
            target_dir: target_dir.clone(),
            size_bytes: 0,
            version,
            os: target_os,
            arch: target_arch,
            error: Some("官方安装包 SHA-256 校验和不匹配，已拒绝安装".to_string()),
        });
    }

    // 5. 解压归档包
    let is_zip = download_url.ends_with(".zip") || bytes.starts_with(b"PK");

    if is_zip {
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("解析 Zip 压缩包失败: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| format!("读取 Zip 文件条目失败: {}", e))?;
            let outpath = match file.enclosed_name() {
                Some(path) => {
                    let filename = path.file_name().unwrap_or(path.as_os_str());
                    target_path.join(filename)
                }
                None => continue,
            };

            if (*file.name()).ends_with('/') {
                std::fs::create_dir_all(&outpath).ok();
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        std::fs::create_dir_all(p).ok();
                    }
                }
                let mut outfile = std::fs::File::create(&outpath)
                    .map_err(|e| format!("写入解压文件失败: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("拷贝文件内容失败: {}", e))?;
            }
        }
    } else {
        // tar.gz
        let cursor = std::io::Cursor::new(bytes);
        let gz = flate2::read::GzDecoder::new(cursor);
        let mut archive = tar::Archive::new(gz);

        if let Ok(entries) = archive.entries() {
            for entry in entries.flatten() {
                let mut entry = entry;
                if let Ok(path) = entry.path() {
                    let filename = path.file_name().unwrap_or(path.as_os_str());
                    let outpath = target_path.join(filename);
                    if let Some(p) = outpath.parent() {
                        std::fs::create_dir_all(p).ok();
                    }
                    entry.unpack(&outpath).ok();
                }
            }
        }
    }

    // 3. 寻找解压后的 frpc / frpc.exe
    let exe_name = if target_os == "windows" { "frpc.exe" } else { "frpc" };
    let mut exe_path = target_path.join(exe_name);

    if !exe_path.exists() {
        if let Ok(entries) = std::fs::read_dir(&target_path) {
            for entry in entries.flatten() {
                let sub_path = entry.path().join(exe_name);
                if sub_path.exists() {
                    exe_path = sub_path;
                    break;
                }
            }
        }
    }

    if !exe_path.exists() {
        return Ok(DownloadCoreResult {
            success: false,
            exe_path: String::new(),
            target_dir: target_dir.clone(),
            size_bytes: 0,
            version,
            os: target_os,
            arch: target_arch,
            error: Some(format!("未在解压目录中找到可执行文件 {}", exe_name)),
        });
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        let _ = std::fs::set_permissions(&exe_path, perms);
    }

    let size_bytes = std::fs::metadata(&exe_path).map(|m| m.len()).unwrap_or(16500000);

    Ok(DownloadCoreResult {
        success: true,
        exe_path: exe_path.to_string_lossy().to_string(),
        target_dir: target_dir.clone(),
        size_bytes,
        version,
        os: target_os,
        arch: target_arch,
        error: None,
    })
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

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let local_data_dir = app
                .path()
                .app_local_data_dir()
                .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::NotFound, format!("无法获取受控数据目录: {}", e))) as Box<dyn std::error::Error>)?;
            let manager = Arc::new(frpc_runtime::FrpcRuntimeManager::new(local_data_dir));
            app.manage(AppState {
                frpc_manager: manager,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_profile,
            stop_profile,
            get_runtime_states,
            get_runtime_logs,
            test_tcp_connection,
            detect_core_version,
            inspect_frpc_core,
            pick_core_file,
            pick_directory,
            get_system_platform,
            download_and_extract_core,
            credential_store::store_server_credential,
            credential_store::delete_server_credentials,
            run_server_preflight,
            run_frps_operation
        ])
        .build(tauri::generate_context!())
        .expect("运行 FRP-GUI Tauri 应用出错")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<AppState>();
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
}
