use crate::{build_core_download_url, build_official_core_download_url, frpc_runtime, frps_deployment, MAX_CORE_ARCHIVE_BYTES};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, io::{Read, Write}, path::{Component, Path, PathBuf}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::Instant};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CoreDownloadPhase { Downloading, Verifying, Extracting, Inspecting, Completed, Failed, Cancelled }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreDownloadRequest {
    pub release_tag: String,
    pub asset_name: String,
    pub mirror: String,
    pub target_dir: String,
    pub target_os: String,
    pub target_arch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreDownloadInstallation { pub path: String, pub version: String, pub os: String, pub arch: String, pub size_bytes: u64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreDownloadTask {
    pub task_id: String,
    pub release_tag: String,
    pub asset_name: String,
    pub phase: CoreDownloadPhase,
    pub target_os: String,
    pub target_arch: String,
    pub target_dir: String,
    pub mirror: String,
    pub received_bytes: u64,
    pub total_bytes: Option<u64>,
    pub speed_bytes_per_second: Option<u64>,
    pub eta_seconds: Option<u64>,
    pub extracted_entries: Option<u64>,
    pub total_entries: Option<u64>,
    pub current_file_name: Option<String>,
    pub error: Option<String>,
    pub installation: Option<CoreDownloadInstallation>,
    #[serde(default)] pub etag: Option<String>,
}

pub struct CoreDownloadManager {
    cache_root: PathBuf,
    tasks: Mutex<HashMap<String, CoreDownloadTask>>,
    cancelled: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl CoreDownloadManager {
    pub fn new(cache_root: PathBuf) -> Self {
        let _ = fs::create_dir_all(&cache_root);
        let mut tasks = HashMap::new();
        if let Ok(entries) = fs::read_dir(&cache_root) {
            for entry in entries.flatten() {
                let task_file = entry.path().join("task.json");
                if let Ok(content) = fs::read_to_string(task_file) {
                    if let Ok(mut task) = serde_json::from_str::<CoreDownloadTask>(&content) {
                        if matches!(task.phase, CoreDownloadPhase::Downloading | CoreDownloadPhase::Verifying | CoreDownloadPhase::Extracting | CoreDownloadPhase::Inspecting) {
                            task.phase = CoreDownloadPhase::Cancelled;
                            task.error = Some("应用已退出，可继续下载".to_string());
                        }
                        tasks.insert(task.task_id.clone(), task);
                    }
                }
            }
        }
        Self { cache_root, tasks: Mutex::new(tasks), cancelled: Mutex::new(HashMap::new()) }
    }

    pub fn list(&self) -> Vec<CoreDownloadTask> {
        self.tasks.lock().map(|tasks| tasks.values().cloned().collect()).unwrap_or_default()
    }

    pub fn start(&self, request: CoreDownloadRequest) -> Result<CoreDownloadTask, String> {
        build_official_core_download_url(&request.release_tag, &request.asset_name)?;
        if !matches!(request.mirror.as_str(), "official" | "ghproxy" | "fastgit") { return Err("不支持的核心下载镜像".to_string()); }
        if request.target_dir.trim().is_empty() { return Err("请选择 FRP 核心安装目录".to_string()); }
        let task = CoreDownloadTask {
            task_id: Uuid::new_v4().to_string(), release_tag: request.release_tag, asset_name: request.asset_name,
            phase: CoreDownloadPhase::Downloading, target_os: request.target_os, target_arch: request.target_arch,
            target_dir: request.target_dir, mirror: request.mirror, received_bytes: 0, total_bytes: None,
            speed_bytes_per_second: None, eta_seconds: None, extracted_entries: None, total_entries: None,
            current_file_name: None, error: None, installation: None, etag: None,
        };
        self.save(&task)?;
        self.tasks.lock().map_err(|_| "下载任务状态不可用".to_string())?.insert(task.task_id.clone(), task.clone());
        Ok(task)
    }

    pub fn get(&self, task_id: &str) -> Result<CoreDownloadTask, String> {
        self.tasks.lock().map_err(|_| "下载任务状态不可用".to_string())?.get(task_id).cloned().ok_or_else(|| "下载任务不存在".to_string())
    }

    pub fn cancel(&self, task_id: &str) -> Result<(), String> {
        let flag = self.cancelled.lock().map_err(|_| "下载任务状态不可用".to_string())?.entry(task_id.to_string()).or_insert_with(|| Arc::new(AtomicBool::new(false))).clone();
        flag.store(true, Ordering::Release);
        Ok(())
    }

    pub fn resume(&self, task_id: &str) -> Result<CoreDownloadTask, String> {
        let mut task = self.get(task_id)?;
        if !matches!(task.phase, CoreDownloadPhase::Cancelled | CoreDownloadPhase::Failed) {
            return Err("当前下载任务不可继续".to_string());
        }
        let flag = self.cancelled.lock().map_err(|_| "下载任务状态不可用".to_string())?
            .entry(task_id.to_string()).or_insert_with(|| Arc::new(AtomicBool::new(false))).clone();
        flag.store(false, Ordering::Release);
        task.phase = CoreDownloadPhase::Downloading;
        task.error = None;
        self.save(&task)?;
        self.tasks.lock().map_err(|_| "下载任务状态不可用".to_string())?.insert(task_id.to_string(), task.clone());
        Ok(task)
    }

    pub fn clear(&self, task_id: &str) -> Result<(), String> {
        let task_dir = self.task_dir(task_id);
        if task_dir.parent() != Some(self.cache_root.as_path()) { return Err("非法下载任务标识".to_string()); }
        self.tasks.lock().map_err(|_| "下载任务状态不可用".to_string())?.remove(task_id);
        self.cancelled.lock().map_err(|_| "下载任务状态不可用".to_string())?.remove(task_id);
        if task_dir.exists() { fs::remove_dir_all(task_dir).map_err(|e| format!("清理下载缓存失败: {e}"))?; }
        Ok(())
    }

    fn task_dir(&self, task_id: &str) -> PathBuf { self.cache_root.join(task_id) }
    fn save(&self, task: &CoreDownloadTask) -> Result<(), String> {
        let dir = self.task_dir(&task.task_id); fs::create_dir_all(&dir).map_err(|e| format!("创建下载缓存失败: {e}"))?;
        fs::write(dir.join("task.json"), serde_json::to_vec_pretty(task).map_err(|e| format!("序列化下载任务失败: {e}"))?).map_err(|e| format!("保存下载任务失败: {e}"))
    }
    fn update(&self, app: &AppHandle, task: CoreDownloadTask) {
        let _ = self.save(&task);
        if let Ok(mut tasks) = self.tasks.lock() { tasks.insert(task.task_id.clone(), task.clone()); }
        let _ = app.emit("core-download-progress", task);
    }
}

pub fn validate_resume_response(status: u16, etag: Option<&str>, content_range: Option<&str>, received: u64, expected_etag: Option<&str>) -> Result<(), String> {
    if received == 0 { return Ok(()); }
    if status != 206 { return Err("服务器未返回可继续下载的分段响应，请重新下载".to_string()); }
    if expected_etag.is_none() || etag != expected_etag { return Err("下载文件已变更，不能继续下载".to_string()); }
    let expected_prefix = format!("bytes {received}-");
    if !content_range.unwrap_or_default().starts_with(&expected_prefix) { return Err("下载分段范围不匹配，不能继续下载".to_string()); }
    Ok(())
}

pub fn overall_progress(phase: CoreDownloadPhase, received: u64, total: Option<u64>, entries: u64, total_entries: u64) -> u8 {
    match phase {
        CoreDownloadPhase::Downloading => total.filter(|value| *value > 0).map(|value| ((received.saturating_mul(85) / value).min(85)) as u8).unwrap_or(0),
        CoreDownloadPhase::Verifying => 85,
        CoreDownloadPhase::Extracting => if total_entries == 0 { 90 } else { (90 + (entries.saturating_mul(9) / total_entries).min(9)) as u8 },
        CoreDownloadPhase::Inspecting => 99, CoreDownloadPhase::Completed => 100, _ => 0,
    }
}

pub fn safe_staging_path(staging: &Path, archive_path: &Path) -> Result<PathBuf, String> {
    if archive_path.components().any(|component| matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_))) { return Err("压缩包包含非法路径，已拒绝解压".to_string()); }
    Ok(staging.join(archive_path))
}

pub fn ensure_empty_install_target(target: &Path) -> Result<(), String> {
    if target.exists() && fs::read_dir(target).map_err(|e| format!("读取安装目录失败: {e}"))?.next().is_some() { return Err("目标安装目录已包含文件，请选择空目录".to_string()); }
    Ok(())
}

pub async fn run_task(manager: Arc<CoreDownloadManager>, app: AppHandle, task_id: String) {
    let mut task = match manager.get(&task_id) { Ok(task) => task, Err(_) => return };
    let flag = manager.cancelled.lock().ok().and_then(|mut flags| Some(flags.entry(task_id.clone()).or_insert_with(|| Arc::new(AtomicBool::new(false))).clone())).unwrap_or_else(|| Arc::new(AtomicBool::new(false)));
    let fail = |manager: &Arc<CoreDownloadManager>, app: &AppHandle, mut task: CoreDownloadTask, message: String| { task.phase = CoreDownloadPhase::Failed; task.error = Some(message); manager.update(app, task); };
    let official_url = match build_official_core_download_url(&task.release_tag, &task.asset_name) { Ok(url) => url, Err(error) => { fail(&manager, &app, task, error); return; } };
    let transport_url = match build_core_download_url(&official_url, &task.mirror) { Ok(url) => url, Err(error) => { fail(&manager, &app, task, error); return; } };
    if let Err(error) = ensure_empty_install_target(Path::new(&task.target_dir)) { fail(&manager, &app, task, error); return; }
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(120)).user_agent("FRP-GUI-Client/1.0").build() { Ok(client) => client, Err(error) => { fail(&manager, &app, task, format!("构建 HTTP 客户端失败: {error}")); return; } };
    let checksum_url = format!("https://github.com/fatedier/frp/releases/download/{}/frp_sha256_checksums.txt", task.release_tag);
    let checksum_response = match client.get(checksum_url).send().await.and_then(|response| response.error_for_status()) {
        Ok(response) => response,
        Err(error) => { fail(&manager, &app, task, format!("下载官方 SHA-256 校验文件失败: {error}")); return; }
    };
    let expected_hash = match checksum_response.text().await {
        Ok(text) => match frps_deployment::checksum_for_asset(&text, &task.asset_name) { Ok(hash) => hash, Err(error) => { fail(&manager, &app, task, error); return; } },
        Err(error) => { fail(&manager, &app, task, format!("下载官方 SHA-256 校验文件失败: {error}")); return; }
    };
    let archive_path = manager.task_dir(&task_id).join("archive.part");
    let received = fs::metadata(&archive_path).map(|m| m.len()).unwrap_or(0);
    task.received_bytes = received; task.phase = CoreDownloadPhase::Downloading;
    let mut request = client.get(transport_url);
    if received > 0 { request = request.header(reqwest::header::RANGE, format!("bytes={received}-")).header(reqwest::header::IF_RANGE, task.etag.clone().unwrap_or_default()); }
    let mut response = match request.send().await { Ok(response) => response, Err(error) => { fail(&manager, &app, task, format!("下载 FRP 安装包失败: {error}")); return; } };
    if let Err(error) = validate_resume_response(response.status().as_u16(), response.headers().get(reqwest::header::ETAG).and_then(|v| v.to_str().ok()), response.headers().get(reqwest::header::CONTENT_RANGE).and_then(|v| v.to_str().ok()), received, task.etag.as_deref()) { fail(&manager, &app, task, error); return; }
    if !response.status().is_success() { fail(&manager, &app, task, format!("下载响应异常: HTTP {}", response.status())); return; }
    task.etag = response.headers().get(reqwest::header::ETAG).and_then(|v| v.to_str().ok()).map(str::to_string).or(task.etag);
    task.total_bytes = response.content_length().map(|len| len + received);
    // 小型安装包可能在一秒采样周期内下载完成，先推送总大小避免前端长期停在 0%。
    manager.update(&app, task.clone());
    let mut output = match fs::OpenOptions::new().create(true).append(true).open(&archive_path) { Ok(file) => file, Err(error) => { fail(&manager, &app, task, format!("写入下载缓存失败: {error}")); return; } };
    let started = Instant::now(); let mut last_sample = Instant::now(); let mut last_bytes = received;
    loop {
        if flag.load(Ordering::Acquire) { task.phase = CoreDownloadPhase::Cancelled; task.error = Some("下载已取消，可继续下载".to_string()); manager.update(&app, task); return; }
        let chunk = match response.chunk().await { Ok(Some(chunk)) => chunk, Ok(None) => break, Err(error) => { fail(&manager, &app, task, format!("读取下载数据流失败: {error}")); return; } };
        if task.received_bytes.saturating_add(chunk.len() as u64) > MAX_CORE_ARCHIVE_BYTES as u64 { fail(&manager, &app, task, "FRP 安装包超过 100 MiB 安全限制，已拒绝安装".to_string()); return; }
        if let Err(error) = output.write_all(&chunk) { fail(&manager, &app, task, format!("写入下载缓存失败: {error}")); return; }
        task.received_bytes += chunk.len() as u64;
        if last_sample.elapsed() >= std::time::Duration::from_secs(1) {
            let elapsed = last_sample.elapsed().as_secs_f64().max(0.001); let speed = ((task.received_bytes - last_bytes) as f64 / elapsed) as u64;
            task.speed_bytes_per_second = Some(speed); task.eta_seconds = task.total_bytes.filter(|_| speed > 0).map(|total| total.saturating_sub(task.received_bytes) / speed);
            last_sample = Instant::now(); last_bytes = task.received_bytes; manager.update(&app, task.clone());
        }
    }
    // 若下载耗时不足一秒，仍需向前端提交已接收字节数。
    manager.update(&app, task.clone());
    let _ = output.flush(); task.phase = CoreDownloadPhase::Verifying; task.speed_bytes_per_second = None; task.eta_seconds = None; manager.update(&app, task.clone());
    let actual_hash = match hash_file(&archive_path, &flag) { Ok(value) => value, Err(error) => { if flag.load(Ordering::Acquire) { task.phase = CoreDownloadPhase::Cancelled; task.error = Some("下载已取消，可继续下载".to_string()); manager.update(&app, task); } else { fail(&manager, &app, task, error); } return; } };
    if actual_hash != expected_hash { fail(&manager, &app, task, "官方安装包 SHA-256 校验和不匹配，已拒绝安装".to_string()); return; }
    task.phase = CoreDownloadPhase::Extracting; manager.update(&app, task.clone());
    let staging = manager.task_dir(&task_id).join("staging"); let _ = fs::remove_dir_all(&staging);
    let asset_name = task.asset_name.clone();
    if let Err(error) = extract_archive(&archive_path, &asset_name, &staging, &mut task, &manager, &app, &flag) { if flag.load(Ordering::Acquire) { task.phase = CoreDownloadPhase::Cancelled; task.error = Some("下载已取消，可继续下载".to_string()); manager.update(&app, task); } else { fail(&manager, &app, task, error); } return; }
    task.phase = CoreDownloadPhase::Inspecting; manager.update(&app, task.clone());
    let exe_name = if task.target_os == "windows" { "frpc.exe" } else { "frpc" };
    let exe_path = match find_executable(&staging, exe_name) { Some(path) => path, None => { fail(&manager, &app, task, format!("未在解压目录中找到可执行文件 {exe_name}")); return; } };
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; let _ = fs::set_permissions(&exe_path, fs::Permissions::from_mode(0o755)); }
    let expected_version = task.release_tag.clone();
    let version = match frpc_runtime::inspect_frpc_executable(&exe_path.to_string_lossy()).await { Ok(version) if version == expected_version => version, Ok(version) => { fail(&manager, &app, task, format!("FRPC 实际版本 {version} 与 Release {expected_version} 不一致")); return; }, Err(error) => { fail(&manager, &app, task, error); return; } };
    let target = PathBuf::from(&task.target_dir); if let Some(parent) = target.parent() { if let Err(error) = fs::create_dir_all(parent) { fail(&manager, &app, task, format!("创建安装目录失败: {error}")); return; } }
    if target.exists() { let _ = fs::remove_dir(&target); }
    if let Err(error) = commit_staging(&staging, &target) { fail(&manager, &app, task, format!("提交已验证安装失败: {error}")); return; }
    let installed_exe = find_executable(&target, exe_name).expect("已验证 staging 包含 FRPC");
    task.phase = CoreDownloadPhase::Completed; task.error = None; task.installation = Some(CoreDownloadInstallation { path: installed_exe.to_string_lossy().to_string(), version, os: task.target_os.clone(), arch: task.target_arch.clone(), size_bytes: fs::metadata(&installed_exe).map(|m| m.len()).unwrap_or(0) }); manager.update(&app, task);
    let _ = started;
}

fn hash_file(path: &Path, cancelled: &AtomicBool) -> Result<String, String> { let mut file = fs::File::open(path).map_err(|e| format!("读取下载缓存失败: {e}"))?; let mut hasher = Sha256::new(); let mut buffer = [0u8; 64 * 1024]; loop { if cancelled.load(Ordering::Acquire) { return Err("下载已取消".to_string()); } let read = file.read(&mut buffer).map_err(|e| format!("读取下载缓存失败: {e}"))?; if read == 0 { break; } hasher.update(&buffer[..read]); } Ok(format!("{:x}", hasher.finalize())) }
fn commit_staging(staging: &Path, target: &Path) -> Result<(), String> {
    match fs::rename(staging, target) {
        Ok(()) => Ok(()),
        Err(error) if error.raw_os_error() == Some(17) => {
            copy_directory(staging, target)?;
            fs::remove_dir_all(staging).map_err(|e| format!("清理临时安装目录失败: {e}"))
        }
        Err(error) => Err(error.to_string()),
    }
}
fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|e| format!("创建目标安装目录失败: {e}"))?;
    for entry in fs::read_dir(source).map_err(|e| format!("读取临时安装目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取临时安装条目失败: {e}"))?;
        let from = entry.path();
        let to = destination.join(entry.file_name());
        if from.is_dir() { copy_directory(&from, &to)?; }
        else { fs::copy(&from, &to).map_err(|e| format!("跨盘复制安装文件失败: {e}"))?; }
    }
    Ok(())
}
fn find_executable(root: &Path, file_name: &str) -> Option<PathBuf> { if root.join(file_name).is_file() { return Some(root.join(file_name)); } fs::read_dir(root).ok()?.flatten().find_map(|entry| { let path = entry.path(); if path.is_dir() { find_executable(&path, file_name) } else { None } }) }
fn extract_archive(path: &Path, asset_name: &str, staging: &Path, task: &mut CoreDownloadTask, manager: &CoreDownloadManager, app: &AppHandle, cancelled: &AtomicBool) -> Result<(), String> {
    fs::create_dir_all(staging).map_err(|e| format!("创建临时解压目录失败: {e}"))?;
    if asset_name.to_ascii_lowercase().ends_with(".zip") {
        let mut archive = zip::ZipArchive::new(fs::File::open(path).map_err(|e| format!("打开 Zip 包失败: {e}"))?).map_err(|e| format!("解析 Zip 包失败: {e}"))?;
        let total = archive.len() as u64; task.total_entries = Some(total);
        for index in 0..archive.len() {
            if cancelled.load(Ordering::Acquire) { return Err("下载已取消".to_string()); }
            let mut entry = archive.by_index(index).map_err(|e| format!("读取 Zip 条目失败: {e}"))?;
            let name = PathBuf::from(entry.name()); let output = safe_staging_path(staging, &name)?;
            task.extracted_entries = Some(index as u64); task.current_file_name = name.file_name().map(|v| v.to_string_lossy().to_string()); manager.update(app, task.clone());
            if entry.is_dir() { fs::create_dir_all(output).map_err(|e| format!("创建解压目录失败: {e}"))?; }
            else { if let Some(parent) = output.parent() { fs::create_dir_all(parent).map_err(|e| format!("创建解压目录失败: {e}"))?; } let mut file = fs::File::create(output).map_err(|e| format!("写入解压文件失败: {e}"))?; std::io::copy(&mut entry, &mut file).map_err(|e| format!("写入解压文件失败: {e}"))?; }
        }
        task.extracted_entries = Some(total); manager.update(app, task.clone()); return Ok(());
    }
    let file = fs::File::open(path).map_err(|e| format!("打开 tar.gz 包失败: {e}"))?;
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(file));
    let mut extracted = 0u64;
    for entry in archive.entries().map_err(|e| format!("读取 tar.gz 条目失败: {e}"))? {
        if cancelled.load(Ordering::Acquire) { return Err("下载已取消".to_string()); }
        let mut entry = entry.map_err(|e| format!("读取 tar.gz 条目失败: {e}"))?;
        let name = entry.path().map_err(|e| format!("读取 tar.gz 路径失败: {e}"))?.into_owned();
        let output = safe_staging_path(staging, &name)?;
        task.extracted_entries = Some(extracted); task.current_file_name = name.file_name().map(|v| v.to_string_lossy().to_string()); manager.update(app, task.clone());
        if entry.header().entry_type().is_dir() { fs::create_dir_all(output).map_err(|e| format!("创建解压目录失败: {e}"))?; }
        else { if let Some(parent) = output.parent() { fs::create_dir_all(parent).map_err(|e| format!("创建解压目录失败: {e}"))?; } let mut output_file = fs::File::create(output).map_err(|e| format!("写入解压文件失败: {e}"))?; std::io::copy(&mut entry, &mut output_file).map_err(|e| format!("写入解压文件失败: {e}"))?; }
        extracted += 1;
    }
    task.extracted_entries = Some(extracted); task.total_entries = Some(extracted); manager.update(app, task.clone()); Ok(())
}

#[cfg(test)]
mod tests { use super::*; #[test] fn partial_response_requires_matching_etag_and_content_range() { assert!(validate_resume_response(206, Some("etag-a"), Some("bytes 20-99/100"), 20, Some("etag-a")).is_ok()); assert!(validate_resume_response(200, Some("etag-a"), None, 20, Some("etag-a")).is_err()); assert!(validate_resume_response(206, Some("etag-b"), Some("bytes 20-99/100"), 20, Some("etag-a")).is_err()); } #[test] fn total_progress_is_monotonic_across_phases() { assert_eq!(overall_progress(CoreDownloadPhase::Downloading, 50, Some(100), 0, 0), 42); assert_eq!(overall_progress(CoreDownloadPhase::Verifying, 0, None, 0, 0), 85); assert_eq!(overall_progress(CoreDownloadPhase::Extracting, 0, None, 4, 8), 94); } #[test] fn staging_path_rejects_traversal() { assert!(safe_staging_path(Path::new("cache"), Path::new("../../evil.exe")).is_err()); } }
