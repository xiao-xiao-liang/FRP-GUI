use chrono::{Local, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex};
use tokio::time::timeout;

pub const CONFIRM_WINDOW: Duration = Duration::from_millis(800);
pub const CORE_VERSION_TIMEOUT: Duration = Duration::from_secs(5);
pub const MAX_SAFE_RUNTIME_TEXT_LENGTH: usize = 4096;
pub const STOP_CONFIRM_TIMEOUT: Duration = Duration::from_millis(3000);
pub const MAX_RUNTIME_LOGS_PER_PROFILE: usize = 500;
pub const MAX_RUNTIME_LOG_SNAPSHOT: usize = 2_000;

pub const STATUS_STOPPED: &str = "stopped";
pub const STATUS_STARTING: &str = "starting";
pub const STATUS_RUNNING: &str = "running";
pub const STATUS_STOPPING: &str = "stopping";
pub const STATUS_ERROR: &str = "error";

pub const ERR_INVALID_PROFILE_ID: &str = "非法的配置方案标识 (profileId)";
pub const ERR_CORE_NOT_FOUND: &str = "指定的核心程序不存在或无效";
pub const ERR_CORE_VERIFY_FAILED: &str = "核心程序校验失败，请检查程序是否为有效的 frpc 可执行文件";
pub const ERR_CORE_TIMEOUT: &str = "核心程序版本检查超时，请检查程序是否响应正常";
pub const ERR_WRITE_CONFIG_FAILED: &str = "写入受控配置文件失败";
pub const ERR_ALREADY_RUNNING: &str = "该方案已处于运行或启动状态，不可重复启动";
pub const ERR_SPAWN_FAILED: &str = "启动 FRPC 进程失败";
pub const ERR_EARLY_EXIT: &str = "FRPC 在启动确认阶段退出，请查看桌面端真实日志";
pub const ERR_UNEXPECTED_EXIT: &str = "FRPC 进程已意外退出";
pub const ERR_NOT_FOUND_OR_STOPPED: &str = "未找到受监管的运行中 FRPC 进程";
pub const ERR_STOP_FAILED: &str = "停止 FRPC 实例失败";
pub const ERR_STOP_TIMEOUT: &str = "停止 FRPC 实例超时";

pub const FAILURE_CORE_INVALID: &str = "core_invalid";
pub const FAILURE_STARTUP: &str = "startup";
pub const FAILURE_EARLY_EXIT: &str = "early_exit";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FrpcRuntimeStateEvent {
    pub profile_id: String,
    pub status: String,
    pub pid: Option<u32>,
    pub timestamp: u64,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FrpcRuntimeLogEvent {
    pub sequence: u64,
    pub profile_id: String,
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessCommandResult {
    pub accepted: bool,
    pub pid: Option<u32>,
    pub error: Option<String>,
    pub failure_kind: Option<String>,
}

/// 运行时事件发射抽象（解耦 Tauri App 与纯单元测试环境）
pub trait RuntimeEventSink: Send + Sync {
    fn emit_state(&self, event: &FrpcRuntimeStateEvent);
    fn emit_log(&self, event: &FrpcRuntimeLogEvent);
}

pub struct TauriEventSink {
    app: AppHandle,
}

impl TauriEventSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl RuntimeEventSink for TauriEventSink {
    fn emit_state(&self, event: &FrpcRuntimeStateEvent) {
        let _ = self.app.emit("frp-runtime-state", event);
    }
    fn emit_log(&self, event: &FrpcRuntimeLogEvent) {
        let _ = self.app.emit("frp-runtime-log", event);
    }
}

/// 校验 profile_id，必须符合 ^[A-Za-z0-9_-]{1,128}$
pub fn validate_profile_id(profile_id: &str) -> bool {
    let trimmed = profile_id.trim();
    if trimmed.is_empty() || trimmed.len() > 128 {
        return false;
    }
    trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// 校验核心程序是否为存在且合规的本地文件（使用固定安全错误，不泄露路径）
pub fn validate_core_path(core_path: &str) -> Result<PathBuf, String> {
    if core_path.trim().is_empty() {
        return Err(ERR_CORE_NOT_FOUND.to_string());
    }
    let path = PathBuf::from(core_path);
    if !path.exists() || !path.is_file() {
        return Err(ERR_CORE_NOT_FOUND.to_string());
    }
    std::fs::canonicalize(&path).map_err(|_| ERR_CORE_NOT_FOUND.to_string())
}

pub fn validate_frpc_file_name(path: &Path) -> Result<(), String> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if name.eq_ignore_ascii_case("frpc") || name.eq_ignore_ascii_case("frpc.exe") {
        Ok(())
    } else {
        Err(ERR_CORE_VERIFY_FAILED.to_string())
    }
}

static RE_VERSION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)(?:^|\s)v?(\d+\.\d+\.\d+)(?:\s|$)").expect("合法版本正则")
});

pub fn parse_frpc_version_output(stdout: &str, stderr: &str) -> Result<String, String> {
    let stdout_lower = stdout.to_lowercase();
    let stderr_lower = stderr.to_lowercase();
    let combined_lower = format!("{} {}", stdout_lower, stderr_lower);
    if combined_lower.contains("frps") && !combined_lower.contains("frpc") {
        return Err(ERR_CORE_VERIFY_FAILED.to_string());
    }

    let combined = format!("{} {}", stdout, stderr);
    let matched = RE_VERSION
        .captures(&combined)
        .and_then(|caps| caps.get(1).map(|value| value.as_str().to_string()));
    matched
        .map(|version| format!("v{}", version))
        .ok_or_else(|| ERR_CORE_VERIFY_FAILED.to_string())
}

/// 解析并校验版本输出是否确认为 frpc 客户端程序
pub fn check_version_output(stdout: &str, stderr: &str) -> Result<(), String> {
    parse_frpc_version_output(stdout, stderr).map(|_| ())
}

pub fn new_frpc_command(executable: &Path) -> Command {
    let mut command = Command::new(executable);
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// 执行核心程序 --version，并验证其为 frpc 客户端（超时 5 秒），返回版本号
pub async fn verify_frpc_executable(canonical_path: &Path) -> Result<String, String> {
    validate_frpc_file_name(canonical_path)?;

    let output_future = new_frpc_command(canonical_path).arg("--version").output();

    let output = match timeout(CORE_VERSION_TIMEOUT, output_future).await {
        Ok(Ok(out)) => out,
        Ok(Err(_)) => {
            return Err(ERR_CORE_VERIFY_FAILED.to_string());
        }
        Err(_) => {
            return Err(ERR_CORE_TIMEOUT.to_string());
        }
    };

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let stderr_str = String::from_utf8_lossy(&output.stderr);
    parse_frpc_version_output(&stdout_str, &stderr_str)
}

/// 供外部 (如 Tauri inspect_frpc_core 命令) 调用的统一核心校验入口
pub async fn inspect_frpc_executable(core_path: &str) -> Result<String, String> {
    let canonical = validate_core_path(core_path)?;
    verify_frpc_executable(&canonical).await
}

pub fn strip_ansi_escape_sequences(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();

    while let Some(current) = chars.next() {
        match current {
            '\u{1b}' => match chars.next() {
                Some('[') => {
                    while let Some(value) = chars.next() {
                        if ('@'..='~').contains(&value) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    while let Some(value) = chars.next() {
                        if value == '\u{7}' {
                            break;
                        }
                        if value == '\u{1b}' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some('P' | 'X' | '^' | '_') => {
                    while let Some(value) = chars.next() {
                        if value == '\u{1b}' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some(_) | None => {}
            },
            '\u{009b}' => {
                while let Some(value) = chars.next() {
                    if ('@'..='~').contains(&value) {
                        break;
                    }
                }
            }
            value => output.push(value),
        }
    }

    output
}

static RE_PEM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)-----BEGIN [A-Z0-9_\s\-]+PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9_\s\-]+PRIVATE KEY-----").expect("合法PEM正则")
});

static RE_AUTH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(authorization\s*[:=]\s*)(?:bearer\s+|basic\s+)?[^\r\n,;]+").expect("合法Auth正则")
});

static RE_QUOTED_SECRET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)((?:token|password|secret_key)\s*[:=]\s*)(?:"[^"]*"|'[^']*')"#).expect("合法QuotedSecret正则")
});

static RE_UNQUOTED_SECRET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)((?:token|password|secret_key)\s*[:=]\s*)[^\s,;\r\n"']+"#).expect("合法UnquotedSecret正则")
});

static RE_STANDARD_FRP_LOG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) \[(?P<level>[IWEDT])\] (?P<message>.*)$").expect("合法FRP日志前缀正则")
});

/// 针对运行期日志与错误信息实施纵深防御脱敏与长度截断
pub fn sanitize_runtime_text(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }

    let mut result = strip_ansi_escape_sequences(text);

    // 1. 脱敏各类 PEM 私钥块
    result = RE_PEM.replace_all(&result, "******").to_string();

    // 2. 脱敏 Authorization 标头
    result = RE_AUTH.replace_all(&result, "${1}******").to_string();

    // 3. 脱敏 token、password、secret_key 键值赋值（兼容双引号、单引号与无引号）
    result = RE_QUOTED_SECRET.replace_all(&result, "${1}******").to_string();
    result = RE_UNQUOTED_SECRET.replace_all(&result, "${1}******").to_string();

    // 4. 截断至 4 KiB
    if result.len() > MAX_SAFE_RUNTIME_TEXT_LENGTH {
        let mut end = MAX_SAFE_RUNTIME_TEXT_LENGTH;
        while !result.is_char_boundary(end) && end > 0 {
            end -= 1;
        }
        result.truncate(end);
    }

    result
}

#[derive(Debug, PartialEq, Eq)]
struct NormalizedRuntimeLogLine {
    timestamp: String,
    level: String,
    message: String,
}

fn normalize_runtime_log_line(
    fallback_timestamp: String,
    fallback_level: String,
    raw_line: String,
) -> NormalizedRuntimeLogLine {
    let sanitized = sanitize_runtime_text(&raw_line);

    let Some(captures) = RE_STANDARD_FRP_LOG.captures(&sanitized) else {
        return NormalizedRuntimeLogLine {
            timestamp: fallback_timestamp,
            level: fallback_level,
            message: sanitized,
        };
    };

    let level = match captures.name("level").expect("标准前缀必须含级别").as_str() {
        "I" => "info",
        "W" => "warn",
        "E" => "error",
        "D" => "debug",
        "T" => "trace",
        _ => unreachable!("正则已限制 FRP 标准级别"),
    };

    NormalizedRuntimeLogLine {
        timestamp: captures
            .name("timestamp")
            .expect("标准前缀必须含时间")
            .as_str()
            .to_string(),
        level: level.to_string(),
        message: captures
            .name("message")
            .expect("标准前缀必须含正文")
            .as_str()
            .to_string(),
    }
}

/// 根据日志行内容推导日志级别
pub fn derive_log_level(sanitized_line: &str) -> String {
    if sanitized_line.contains("[E]") || sanitized_line.to_lowercase().contains("error") {
        "error".to_string()
    } else if sanitized_line.contains("[W]") || sanitized_line.to_lowercase().contains("warn") {
        "warn".to_string()
    } else if sanitized_line.contains("[D]") || sanitized_line.to_lowercase().contains("debug") {
        "debug".to_string()
    } else if sanitized_line.contains("[T]") || sanitized_line.to_lowercase().contains("trace") {
        "trace".to_string()
    } else {
        "info".to_string()
    }
}

/// 生成受控配置文件路径：base_dir/runtime-config/<profile_id>.toml
pub fn get_runtime_config_path(base_dir: &Path, profile_id: &str) -> Result<PathBuf, String> {
    if !validate_profile_id(profile_id) {
        return Err(ERR_INVALID_PROFILE_ID.to_string());
    }
    let config_dir = base_dir.join("runtime-config");
    std::fs::create_dir_all(&config_dir).map_err(|_| ERR_WRITE_CONFIG_FAILED.to_string())?;
    Ok(config_dir.join(format!("{}.toml", profile_id)))
}

/// 写入受控配置文件
pub fn write_runtime_config(
    base_dir: &Path,
    profile_id: &str,
    toml_content: &str,
) -> Result<PathBuf, String> {
    let config_path = get_runtime_config_path(base_dir, profile_id)?;
    std::fs::write(&config_path, toml_content).map_err(|_| ERR_WRITE_CONFIG_FAILED.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        let _ = std::fs::set_permissions(&config_path, perms);
    }

    Ok(config_path)
}

pub enum ProcessControlCommand {
    Stop {
        responder: tokio::sync::oneshot::Sender<Result<(), String>>,
    },
}

#[derive(Debug, Clone)]
pub struct ProfileStateInner {
    pub status: String,
    pub pid: Option<u32>,
    pub timestamp: u64,
    pub error_message: Option<String>,
    pub cmd_sender: Option<mpsc::Sender<ProcessControlCommand>>,
}

pub struct ProfileProcessHandle {
    pub profile_id: String,
    pub inner: Mutex<ProfileStateInner>,
    pub stop_requested: AtomicBool,
    pub runtime_logs: Mutex<VecDeque<FrpcRuntimeLogEvent>>,
    pub next_log_sequence: AtomicU64,
}

impl ProfileProcessHandle {
    pub fn new(profile_id: String) -> Self {
        Self {
            profile_id,
            inner: Mutex::new(ProfileStateInner {
                status: STATUS_STOPPED.to_string(),
                pid: None,
                timestamp: Utc::now().timestamp_millis() as u64,
                error_message: None,
                cmd_sender: None,
            }),
            stop_requested: AtomicBool::new(false),
            runtime_logs: Mutex::new(VecDeque::new()),
            next_log_sequence: AtomicU64::new(0),
        }
    }

    pub async fn runtime_logs_snapshot(&self) -> Vec<FrpcRuntimeLogEvent> {
        self.runtime_logs.lock().await.iter().cloned().collect()
    }

    pub async fn clear_runtime_logs(&self) {
        self.runtime_logs.lock().await.clear();
        self.next_log_sequence.store(0, Ordering::SeqCst);
    }

    pub async fn to_state_event(&self) -> FrpcRuntimeStateEvent {
        let inner = self.inner.lock().await;
        FrpcRuntimeStateEvent {
            profile_id: self.profile_id.clone(),
            status: inner.status.clone(),
            pid: inner.pid,
            timestamp: inner.timestamp,
            error_message: inner.error_message.clone(),
        }
    }

    pub async fn update_state(
        &self,
        status: &str,
        pid: Option<u32>,
        error_message: Option<String>,
    ) {
        let mut inner = self.inner.lock().await;
        inner.status = status.to_string();
        inner.pid = pid;
        inner.error_message = error_message;
        inner.timestamp = Utc::now().timestamp_millis() as u64;
    }

    pub async fn get_status(&self) -> String {
        self.inner.lock().await.status.clone()
    }

    pub async fn get_pid(&self) -> Option<u32> {
        self.inner.lock().await.pid
    }

    pub async fn set_pid(&self, pid: Option<u32>) {
        self.inner.lock().await.pid = pid;
    }

    pub async fn get_cmd_sender(&self) -> Option<mpsc::Sender<ProcessControlCommand>> {
        self.inner.lock().await.cmd_sender.clone()
    }

    pub async fn set_cmd_sender(&self, sender: Option<mpsc::Sender<ProcessControlCommand>>) {
        self.inner.lock().await.cmd_sender = sender;
    }

    pub async fn set_stopping(&self) {
        let mut inner = self.inner.lock().await;
        inner.status = STATUS_STOPPING.to_string();
        inner.timestamp = Utc::now().timestamp_millis() as u64;
    }
}

pub struct FrpcRuntimeManager {
    pub registry: Mutex<HashMap<String, Arc<ProfileProcessHandle>>>,
    pub base_dir: PathBuf,
}

impl FrpcRuntimeManager {
    pub fn new(base_dir: PathBuf) -> Self {
        Self {
            registry: Mutex::new(HashMap::new()),
            base_dir,
        }
    }

    pub async fn capture_runtime_log(
        handle: Arc<ProfileProcessHandle>,
        sink: Option<Arc<dyn RuntimeEventSink>>,
        timestamp: String,
        level: String,
        message: String,
    ) {
        let sanitized = sanitize_runtime_text(&message);
        let sequence = handle.next_log_sequence.fetch_add(1, Ordering::SeqCst) + 1;
        let event = FrpcRuntimeLogEvent {
            sequence,
            profile_id: handle.profile_id.clone(),
            timestamp,
            level,
            message: sanitized,
        };

        {
            let mut logs = handle.runtime_logs.lock().await;
            logs.push_back(event.clone());
            while logs.len() > MAX_RUNTIME_LOGS_PER_PROFILE {
                logs.pop_front();
            }
        }

        if let Some(ref sink) = sink {
            sink.emit_log(&event);
        }
    }

    pub async fn get_runtime_logs(
        &self,
        profile_id: Option<String>,
    ) -> Result<Vec<FrpcRuntimeLogEvent>, String> {
        if let Some(ref pid) = profile_id {
            if !validate_profile_id(pid) {
                return Err(ERR_INVALID_PROFILE_ID.to_string());
            }
        }

        let handles: Vec<Arc<ProfileProcessHandle>> = {
            let reg = self.registry.lock().await;
            if let Some(ref pid) = profile_id {
                match reg.get(pid) {
                    Some(handle) => vec![handle.clone()],
                    None => return Ok(Vec::new()),
                }
            } else {
                reg.values().cloned().collect()
            }
        };

        let mut all_logs = Vec::new();
        for handle in handles {
            let mut logs = handle.runtime_logs_snapshot().await;
            all_logs.append(&mut logs);
        }

        all_logs.sort_by(|a, b| {
            a.timestamp
                .cmp(&b.timestamp)
                .then_with(|| a.profile_id.cmp(&b.profile_id))
                .then_with(|| a.sequence.cmp(&b.sequence))
        });

        if all_logs.len() > MAX_RUNTIME_LOG_SNAPSHOT {
            let start = all_logs.len() - MAX_RUNTIME_LOG_SNAPSHOT;
            all_logs = all_logs.split_off(start);
        }

        Ok(all_logs)
    }

    /// 启动配置对应的本地 FRPC 实例
    pub async fn start_profile(
        &self,
        event_sink: Option<Arc<dyn RuntimeEventSink>>,
        profile_id: String,
        toml_content: String,
        core_path: String,
    ) -> ProcessCommandResult {
        // 1. 严格校验 profile_id
        if !validate_profile_id(&profile_id) {
            return ProcessCommandResult {
                accepted: false,
                pid: None,
                error: Some(ERR_INVALID_PROFILE_ID.to_string()),
                failure_kind: Some(FAILURE_STARTUP.to_string()),
            };
        }

        // 2. 检查方案是否已在运行、启动中，或残留仍未退出的活跃 Child 控制通道
        let handle = {
            let mut reg = self.registry.lock().await;
            if let Some(existing) = reg.get(&profile_id) {
                let (status, has_active_channel) = {
                    let inner = existing.inner.lock().await;
                    (inner.status.clone(), inner.cmd_sender.is_some())
                };

                // 即使 status 处于 error，只要旧进程控制通道仍活跃（未确认退出），绝不允许重复启动
                if status == STATUS_STARTING || status == STATUS_RUNNING || has_active_channel {
                    return ProcessCommandResult {
                        accepted: false,
                        pid: None,
                        error: Some(ERR_ALREADY_RUNNING.to_string()),
                        failure_kind: Some(FAILURE_STARTUP.to_string()),
                    };
                }
                existing.clone()
            } else {
                let created = Arc::new(ProfileProcessHandle::new(profile_id.clone()));
                reg.insert(profile_id.clone(), created.clone());
                created
            }
        };

        // 3. 校验核心程序
        let canonical_core = match validate_core_path(&core_path) {
            Ok(p) => p,
            Err(e) => {
                return ProcessCommandResult {
                    accepted: false,
                    pid: None,
                    error: Some(e),
                    failure_kind: Some(FAILURE_CORE_INVALID.to_string()),
                };
            }
        };

        if let Err(e) = verify_frpc_executable(&canonical_core).await {
            return ProcessCommandResult {
                accepted: false,
                pid: None,
                error: Some(e),
                failure_kind: Some(FAILURE_CORE_INVALID.to_string()),
            };
        }

        // 4. 写入受控配置文件
        let config_path = match write_runtime_config(&self.base_dir, &profile_id, &toml_content) {
            Ok(p) => p,
            Err(e) => {
                return ProcessCommandResult {
                    accepted: false,
                    pid: None,
                    error: Some(e),
                    failure_kind: Some(FAILURE_STARTUP.to_string()),
                };
            }
        };

        // 5. 设置状态为 starting 并广播
        handle.update_state(STATUS_STARTING, None, None).await;
        handle.stop_requested.store(false, Ordering::SeqCst);
        handle.clear_runtime_logs().await;

        let starting_event = handle.to_state_event().await;
        if let Some(ref sink) = event_sink {
            sink.emit_state(&starting_event);
        }

        // 6. 构造命令并调用受控生命周期生成器
        let mut cmd = new_frpc_command(&canonical_core);
        cmd.arg("-c").arg(&config_path);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        self.spawn_and_confirm_child(handle, cmd, event_sink, profile_id)
            .await
    }

    /// 启动并执行受控生命周期管理：800ms 存活确认、立即管道脱敏读取、无死锁 Actor 监控
    pub async fn spawn_and_confirm_child(
        &self,
        handle: Arc<ProfileProcessHandle>,
        mut cmd: Command,
        event_sink: Option<Arc<dyn RuntimeEventSink>>,
        _profile_id: String,
    ) -> ProcessCommandResult {
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(_) => {
                let err_msg = ERR_SPAWN_FAILED.to_string();
                handle
                    .update_state(STATUS_ERROR, None, Some(err_msg.clone()))
                    .await;

                let err_event = handle.to_state_event().await;
                if let Some(ref sink) = event_sink {
                    sink.emit_state(&err_event);
                }
                return ProcessCommandResult {
                    accepted: false,
                    pid: None,
                    error: Some(err_msg),
                    failure_kind: Some(FAILURE_STARTUP.to_string()),
                };
            }
        };

        let pid = child.id().unwrap_or(0);
        handle.set_pid(Some(pid)).await;

        // 7. 立即接管 stdout/stderr 管道并在 800ms 存活确认前开始流式读取与脱敏转发
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        if let Some(stdout) = stdout {
            let handle_out = handle.clone();
            let sink_out = event_sink.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let fallback_timestamp =
                        Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
                    let normalized = normalize_runtime_log_line(
                        fallback_timestamp,
                        derive_log_level(&line),
                        line,
                    );
                    Self::capture_runtime_log(
                        handle_out.clone(),
                        sink_out.clone(),
                        normalized.timestamp,
                        normalized.level,
                        normalized.message,
                    )
                    .await;
                }
            });
        }

        if let Some(stderr) = stderr {
            let handle_err = handle.clone();
            let sink_err = event_sink.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let fallback_timestamp =
                        Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
                    let normalized =
                        normalize_runtime_log_line(fallback_timestamp, "error".to_string(), line);
                    Self::capture_runtime_log(
                        handle_err.clone(),
                        sink_err.clone(),
                        normalized.timestamp,
                        normalized.level,
                        normalized.message,
                    )
                    .await;
                }
            });
        }

        // 8. 800ms 存活确认期 (CONFIRM_WINDOW)
        let confirm_result = timeout(CONFIRM_WINDOW, child.wait()).await;
        match confirm_result {
            Ok(exit_status_res) => {
                // 子进程在 800ms 内提前退出了！
                let _ = exit_status_res;
                let err_msg = ERR_EARLY_EXIT.to_string();

                // 稍微让日志协程刷新捕获的早期错误输出（确保日志先于 error 状态进入通道）
                tokio::time::sleep(Duration::from_millis(60)).await;

                handle
                    .update_state(STATUS_ERROR, None, Some(err_msg.clone()))
                    .await;
                handle.set_cmd_sender(None).await;

                let err_event = handle.to_state_event().await;
                if let Some(ref sink) = event_sink {
                    sink.emit_state(&err_event);
                }

                ProcessCommandResult {
                    accepted: false,
                    pid: None,
                    error: Some(err_msg),
                    failure_kind: Some(FAILURE_EARLY_EXIT.to_string()),
                }
            }
            Err(_) => {
                // 800ms 内未退出，存活确认通过！进入 running
                handle.update_state(STATUS_RUNNING, Some(pid), None).await;

                let running_event = handle.to_state_event().await;
                if let Some(ref sink) = event_sink {
                    sink.emit_state(&running_event);
                }

                // 构建无死锁 Actor 监控通道，Child 完全由独立协程持有，零锁占用 wait()
                let (cmd_tx, cmd_rx) = mpsc::channel::<ProcessControlCommand>(8);
                handle.set_cmd_sender(Some(cmd_tx)).await;

                let handle_clone = handle.clone();
                let sink_clone = event_sink.clone();

                tokio::spawn(async move {
                    Self::run_process_monitor_actor(child, cmd_rx, handle_clone, sink_clone).await;
                });

                ProcessCommandResult {
                    accepted: true,
                    pid: Some(pid),
                    error: None,
                    failure_kind: None,
                }
            }
        }
    }

    /// 进程监控 Actor 协程：独立独占持有 Child，无锁等待，且为唯一落定 stopped/error 状态的位置
    pub async fn run_process_monitor_actor(
        mut child: Child,
        mut cmd_rx: mpsc::Receiver<ProcessControlCommand>,
        handle: Arc<ProfileProcessHandle>,
        event_sink: Option<Arc<dyn RuntimeEventSink>>,
    ) {
        loop {
            tokio::select! {
                // 分支 A：子进程自身退出（意外退出或由于已接收到的终止信号最终退出）
                exit_res = child.wait() => {
                    let _ = exit_res;
                    let was_stop_requested = handle.stop_requested.load(Ordering::SeqCst);
                    let current_status = handle.get_status().await;

                    if was_stop_requested || current_status == STATUS_STOPPING {
                        // 主动停止最终得到确认
                        handle.update_state(STATUS_STOPPED, None, None).await;
                    } else {
                        // 运行期意外退出
                        handle.update_state(STATUS_ERROR, None, Some(ERR_UNEXPECTED_EXIT.to_string())).await;
                    }

                    // 进程确实死亡，唯有在此处释放控制通道和 PID
                    handle.set_cmd_sender(None).await;

                    let state_event = handle.to_state_event().await;
                    if let Some(ref sink) = event_sink {
                        sink.emit_state(&state_event);
                    }

                    // 退出 Actor 循环
                    break;
                }
                // 分支 B：收到明确的停止控制命令
                cmd = cmd_rx.recv() => {
                    match cmd {
                        Some(ProcessControlCommand::Stop { responder }) => {
                            handle.stop_requested.store(true, Ordering::SeqCst);

                            // 执行进程终止操作
                            match child.kill().await {
                                Ok(_) => {
                                    // 有限超时等待进程退出确认
                                    match timeout(STOP_CONFIRM_TIMEOUT, child.wait()).await {
                                        Ok(Ok(_)) => {
                                            // 监控器确认进程已真正退出，落为 stopped 并释放控制权
                                            handle.update_state(STATUS_STOPPED, None, None).await;
                                            handle.set_cmd_sender(None).await;

                                            let stopped_event = handle.to_state_event().await;
                                            if let Some(ref sink) = event_sink {
                                                sink.emit_state(&stopped_event);
                                            }
                                            let _ = responder.send(Ok(()));
                                            break;
                                        }
                                        Ok(Err(_)) => {
                                            // wait() 调用异常，但子进程可能仍活着！保留 Child 与控制通道
                                            let pid = handle.get_pid().await;
                                            handle.update_state(STATUS_ERROR, pid, Some(ERR_STOP_FAILED.to_string())).await;
                                            let error_event = handle.to_state_event().await;
                                            if let Some(ref sink) = event_sink {
                                                sink.emit_state(&error_event);
                                            }
                                            let _ = responder.send(Err(ERR_STOP_FAILED.to_string()));
                                            // 不 break，继续持有 Child 允许后续重试停止
                                        }
                                        Err(_) => {
                                            // 超时未退出：子进程极可能仍然存活！绝不写 stopped，保留 Child 监管
                                            let pid = handle.get_pid().await;
                                            handle.update_state(STATUS_ERROR, pid, Some(ERR_STOP_TIMEOUT.to_string())).await;
                                            let error_event = handle.to_state_event().await;
                                            if let Some(ref sink) = event_sink {
                                                sink.emit_state(&error_event);
                                            }
                                            let _ = responder.send(Err(ERR_STOP_TIMEOUT.to_string()));
                                            // 不 break，继续持有 Child 允许后续重试停止
                                        }
                                    }
                                }
                                Err(_) => {
                                    // kill 失败：子进程仍存活！绝不写 stopped，保留控制通道供重试
                                    let pid = handle.get_pid().await;
                                    handle.update_state(STATUS_ERROR, pid, Some(ERR_STOP_FAILED.to_string())).await;
                                    let error_event = handle.to_state_event().await;
                                    if let Some(ref sink) = event_sink {
                                        sink.emit_state(&error_event);
                                    }
                                    let _ = responder.send(Err(ERR_STOP_FAILED.to_string()));
                                    // 不 break，继续在循环中监管
                                }
                            }
                        }
                        None => {
                            // 控制通道被关闭
                            let _ = child.kill().await;
                            let _ = child.wait().await;
                            break;
                        }
                    }
                }
            }
        }
    }

    /// 停止指定的 FRPC 实例
    pub async fn stop_profile(
        &self,
        event_sink: Option<Arc<dyn RuntimeEventSink>>,
        profile_id: String,
    ) -> ProcessCommandResult {
        if !validate_profile_id(&profile_id) {
            return ProcessCommandResult {
                accepted: false,
                pid: None,
                error: Some(ERR_INVALID_PROFILE_ID.to_string()),
                failure_kind: None,
            };
        }

        let handle = {
            let reg = self.registry.lock().await;
            match reg.get(&profile_id) {
                Some(h) => h.clone(),
                None => {
                    return ProcessCommandResult {
                        accepted: false,
                        pid: None,
                        error: Some(ERR_NOT_FOUND_OR_STOPPED.to_string()),
                        failure_kind: None,
                    };
                }
            }
        };

        let (current_status, cmd_sender) = {
            let inner = handle.inner.lock().await;
            (inner.status.clone(), inner.cmd_sender.clone())
        };

        // 若已是 stopped 且无有效控制通道，直接拒绝
        if current_status == STATUS_STOPPED && cmd_sender.is_none() {
            return ProcessCommandResult {
                accepted: false,
                pid: None,
                error: Some(ERR_NOT_FOUND_OR_STOPPED.to_string()),
                failure_kind: None,
            };
        }

        let tx = match cmd_sender {
            Some(sender) => sender,
            None => {
                return ProcessCommandResult {
                    accepted: false,
                    pid: None,
                    error: Some(ERR_NOT_FOUND_OR_STOPPED.to_string()),
                    failure_kind: None,
                };
            }
        };

        // 设置为 stopping 并广播
        handle.set_stopping().await;
        let stopping_event = handle.to_state_event().await;
        if let Some(ref sink) = event_sink {
            sink.emit_state(&stopping_event);
        }

        // 发送停止请求并通过 oneshot channel 等待监控器确认退出
        let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
        if tx
            .send(ProcessControlCommand::Stop { responder: resp_tx })
            .await
            .is_err()
        {
            // 通道已关闭，监控器已退出
            handle
                .update_state(STATUS_ERROR, None, Some(ERR_STOP_FAILED.to_string()))
                .await;
            handle.set_cmd_sender(None).await;

            let err_event = handle.to_state_event().await;
            if let Some(ref sink) = event_sink {
                sink.emit_state(&err_event);
            }
            return ProcessCommandResult {
                accepted: false,
                pid: None,
                error: Some(ERR_STOP_FAILED.to_string()),
                failure_kind: None,
            };
        }

        match timeout(STOP_CONFIRM_TIMEOUT + Duration::from_millis(500), resp_rx).await {
            Ok(Ok(Ok(()))) => {
                // 停止成功且由监控器确认落定 stopped
                ProcessCommandResult {
                    accepted: true,
                    pid: None,
                    error: None,
                    failure_kind: None,
                }
            }
            Ok(Ok(Err(e))) => {
                // 停止失败，状态由 Actor 保持为 error 并保留通道
                ProcessCommandResult {
                    accepted: false,
                    pid: None,
                    error: Some(e),
                    failure_kind: None,
                }
            }
            Ok(Err(_)) => {
                // oneshot 丢弃
                ProcessCommandResult {
                    accepted: false,
                    pid: None,
                    error: Some(ERR_STOP_FAILED.to_string()),
                    failure_kind: None,
                }
            }
            Err(_) => {
                // 停止超时
                ProcessCommandResult {
                    accepted: false,
                    pid: None,
                    error: Some(ERR_STOP_TIMEOUT.to_string()),
                    failure_kind: None,
                }
            }
        }
    }

    /// 获取所有受监管实例的当前状态（仅公开状态，不暴露路径或机密）
    pub async fn get_runtime_states(&self) -> Vec<FrpcRuntimeStateEvent> {
        let reg = self.registry.lock().await;
        let mut states = Vec::with_capacity(reg.len());
        for handle in reg.values() {
            states.push(handle.to_state_event().await);
        }
        states
    }

    /// 应用退出时并发等待全部受管子进程停止退出，未确认退出的保留并记录安全错误，绝不伪造 stopped
    pub async fn shutdown_all(&self) {
        let handles: Vec<Arc<ProfileProcessHandle>> = {
            let reg = self.registry.lock().await;
            reg.values().cloned().collect()
        };

        let mut join_set = tokio::task::JoinSet::new();

        for handle in handles {
            let cmd_sender = handle.get_cmd_sender().await;

            if let Some(tx) = cmd_sender {
                let p_id = handle.profile_id.clone();
                join_set.spawn(async move {
                    let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
                    if tx
                        .send(ProcessControlCommand::Stop { responder: resp_tx })
                        .await
                        .is_ok()
                    {
                        match timeout(STOP_CONFIRM_TIMEOUT, resp_rx).await {
                            Ok(Ok(Ok(()))) => (p_id, true),
                            _ => (p_id, false),
                        }
                    } else {
                        (p_id, false)
                    }
                });
            }
        }

        let mut confirmed_stopped_ids = std::collections::HashSet::new();
        while let Some(res) = join_set.join_next().await {
            if let Ok((profile_id, true)) = res {
                confirmed_stopped_ids.insert(profile_id);
            }
        }

        // 1. 先在 registry 锁内完成保留/移除决定，并收集未确认退出的 handles
        let unconfirmed_handles: Vec<Arc<ProfileProcessHandle>> = {
            let mut reg = self.registry.lock().await;
            let mut unconfirmed = Vec::new();
            reg.retain(|id, handle| {
                if confirmed_stopped_ids.contains(id) {
                    false // 已确认退出：从注册表清理
                } else {
                    unconfirmed.push(handle.clone());
                    true // 停止未确认：绝不从注册表移除，保留监管
                }
            });
            unconfirmed
        };

        // 2. 释放 registry 锁后，逐个异步可靠地更新为 error 状态并保留 PID 与控制权
        for handle in unconfirmed_handles {
            let current_pid = handle.get_pid().await;
            handle
                .update_state(
                    STATUS_ERROR,
                    current_pid,
                    Some(ERR_STOP_TIMEOUT.to_string()),
                )
                .await;
        }
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;

    #[test]
    fn standard_frpc_log_line_uses_native_timestamp_level_and_message() {
        let normalized = normalize_runtime_log_line(
            "2026-09-04 21:22:57.999".to_string(),
            "error".to_string(),
            "\x1b[1;34m2026-09-04 21:22:57.278 [I] [sub/root.go:194] start frpc\x1b[0m".to_string(),
        );

        assert_eq!(normalized.timestamp, "2026-09-04 21:22:57.278");
        assert_eq!(normalized.level, "info");
        assert_eq!(normalized.message, "[sub/root.go:194] start frpc");
    }

    #[test]
    fn standard_frpc_log_line_maps_every_supported_level_code() {
        for (code, expected) in [
            ('I', "info"),
            ('W', "warn"),
            ('E', "error"),
            ('D', "debug"),
            ('T', "trace"),
        ] {
            let normalized = normalize_runtime_log_line(
                "fallback".to_string(),
                "info".to_string(),
                format!("2026-09-04 21:22:57.278 [{code}] detail"),
            );
            assert_eq!(normalized.level, expected);
            assert_eq!(normalized.message, "detail");
        }
    }

    #[test]
    fn non_standard_runtime_output_keeps_fallback_metadata_and_sanitized_text() {
        let normalized = normalize_runtime_log_line(
            "2026-09-04 21:22:57.999".to_string(),
            "error".to_string(),
            "helper output: token = secret-value".to_string(),
        );

        assert_eq!(normalized.timestamp, "2026-09-04 21:22:57.999");
        assert_eq!(normalized.level, "error");
        assert_eq!(normalized.message, "helper output: token = ******");
    }

    #[derive(Clone)]
    pub struct InMemoryEventSink {
        pub states: Arc<Mutex<Vec<FrpcRuntimeStateEvent>>>,
        pub logs: Arc<Mutex<Vec<FrpcRuntimeLogEvent>>>,
    }

    impl InMemoryEventSink {
        pub fn new() -> Self {
            Self {
                states: Arc::new(Mutex::new(Vec::new())),
                logs: Arc::new(Mutex::new(Vec::new())),
            }
        }
    }

    impl RuntimeEventSink for InMemoryEventSink {
        fn emit_state(&self, event: &FrpcRuntimeStateEvent) {
            let states = self.states.clone();
            let ev = event.clone();
            tokio::spawn(async move {
                states.lock().await.push(ev);
            });
        }
        fn emit_log(&self, event: &FrpcRuntimeLogEvent) {
            let logs = self.logs.clone();
            let ev = event.clone();
            tokio::spawn(async move {
                logs.lock().await.push(ev);
            });
        }
    }

    #[test]
    fn test_profile_id_validation() {
        assert!(validate_profile_id("profile_1"));
        assert!(validate_profile_id("my-client-01"));
        assert!(validate_profile_id("ABC_123-xyz"));

        assert!(!validate_profile_id(""));
        assert!(!validate_profile_id("   "));
        assert!(!validate_profile_id("profile/../etc"));
        assert!(!validate_profile_id("profile with spaces"));
        assert!(!validate_profile_id("profile@#$"));
        let too_long = "a".repeat(129);
        assert!(!validate_profile_id(&too_long));
    }

    #[test]
    fn test_core_path_validation_rejects_empty_or_nonexistent() {
        assert!(validate_core_path("").is_err());
        assert_eq!(validate_core_path("").unwrap_err(), ERR_CORE_NOT_FOUND);

        assert!(validate_core_path("Z:\\path\\to\\nonexistent\\frpc.exe").is_err());
        assert_eq!(
            validate_core_path("Z:\\path\\to\\nonexistent\\frpc.exe").unwrap_err(),
            ERR_CORE_NOT_FOUND
        );
    }

    #[test]
    fn test_runtime_log_redaction_removes_secret_assignments() {
        let text = r#"
            connecting with token = super_secret_token_123
            db password: "ultra_secret_password_456"
            auth secret_key='top_secret_key_789'
            header Authorization: Bearer secret_bearer_token_abc
            -----BEGIN RSA PRIVATE KEY-----
            MIIEowIBAAKCAQEA0Y3J...
            -----END RSA PRIVATE KEY-----
        "#;

        let sanitized = sanitize_runtime_text(text);
        assert!(!sanitized.contains("super_secret_token_123"));
        assert!(!sanitized.contains("ultra_secret_password_456"));
        assert!(!sanitized.contains("top_secret_key_789"));
        assert!(!sanitized.contains("secret_bearer_token_abc"));
        assert!(!sanitized.contains("MIIEowIBAAKCAQEA0Y3J"));
        assert!(sanitized.contains("token = ******"));
        assert!(sanitized.contains("password: ******"));
        assert!(sanitized.contains("secret_key=******"));
        assert!(sanitized.contains("Authorization: ******"));
    }

    #[test]
    fn test_runtime_log_truncation() {
        let huge = "A".repeat(5000);
        let sanitized = sanitize_runtime_text(&huge);
        assert_eq!(sanitized.len(), 4096);
    }

    #[test]
    fn runtime_log_ansi_sequences_are_removed_before_redaction() {
        let raw = "\x1b[1;34m2026-09-04 [I] token = visible-secret\x1b[0m\n\x1b]8;;https://example.test\x07link\x1b]8;;\x07";
        let sanitized = sanitize_runtime_text(raw);

        assert_eq!(sanitized, "2026-09-04 [I] token = ******\nlink");
        assert!(!sanitized.contains('\x1b'));
        assert!(!sanitized.contains("visible-secret"));
    }

    #[test]
    fn runtime_log_ansi_cleanup_still_honors_utf8_safe_length_limit() {
        let raw = format!("\x1b[31m{}\x1b[0m", "日志".repeat(3_000));
        let sanitized = sanitize_runtime_text(&raw);

        assert!(!sanitized.contains('\x1b'));
        assert!(sanitized.len() <= MAX_SAFE_RUNTIME_TEXT_LENGTH);
        assert!(sanitized.is_char_boundary(sanitized.len()));
    }

    #[test]
    fn test_check_version_output() {
        // 合法 frpc 输出
        assert!(check_version_output("frpc version 0.61.1 (windows/amd64)", "").is_ok());
        assert!(check_version_output("0.61.1\nfrpc client", "").is_ok());

        // 拒绝 frps 输出
        assert!(check_version_output("frps version 0.61.1", "").is_err());
        assert_eq!(
            check_version_output("frps version 0.61.1", "").unwrap_err(),
            ERR_CORE_VERIFY_FAILED
        );

        // 拒绝无关程序
        assert!(check_version_output("nginx/1.24.0", "").is_err());
        assert_eq!(
            check_version_output("nginx/1.24.0", "").unwrap_err(),
            ERR_CORE_VERIFY_FAILED
        );
    }

    #[test]
    fn version_only_output_from_modern_frpc_is_valid() {
        assert_eq!(
            parse_frpc_version_output("0.71.0\n", "").unwrap(),
            "v0.71.0"
        );
    }

    #[test]
    fn non_semver_output_is_not_an_frpc_version() {
        assert_eq!(
            parse_frpc_version_output("hello", "").unwrap_err(),
            ERR_CORE_VERIFY_FAILED
        );
    }

    #[test]
    fn frps_file_name_is_rejected_for_frpc_runtime() {
        assert_eq!(
            validate_frpc_file_name(Path::new("C:/frp/frps.exe")).unwrap_err(),
            ERR_CORE_VERIFY_FAILED
        );
    }

    #[test]
    fn frpc_file_name_is_accepted_for_frpc_runtime() {
        assert!(validate_frpc_file_name(Path::new("C:/frp/frpc.exe")).is_ok());
    }

    #[test]
    fn test_version_timeout_constant_is_five_seconds() {
        assert_eq!(CORE_VERSION_TIMEOUT, Duration::from_secs(5));
    }

    #[test]
    fn test_config_path_containment() {
        let temp_dir = std::env::temp_dir().join("frp_gui_test_dir");
        let path = get_runtime_config_path(&temp_dir, "my_profile").unwrap();
        assert!(path.starts_with(&temp_dir));
        assert!(path.to_string_lossy().contains("runtime-config"));
        assert!(path.ends_with("my_profile.toml"));

        // 非法 ID 被拒绝
        assert!(get_runtime_config_path(&temp_dir, "../hack").is_err());
    }

    #[tokio::test]
    async fn test_duplicate_start_rejected() {
        let temp_dir = std::env::temp_dir().join("frp_gui_test_dup");
        let manager = FrpcRuntimeManager::new(temp_dir);

        let handle = Arc::new(ProfileProcessHandle::new("profile_1".to_string()));
        handle.update_state(STATUS_RUNNING, None, None).await;
        manager
            .registry
            .lock()
            .await
            .insert("profile_1".to_string(), handle);

        let res = manager
            .start_profile(
                None,
                "profile_1".to_string(),
                "".to_string(),
                "".to_string(),
            )
            .await;
        assert!(!res.accepted);
        assert_eq!(res.error, Some(ERR_ALREADY_RUNNING.to_string()));
    }

    #[tokio::test]
    async fn test_cannot_restart_while_error_process_channel_still_alive() {
        let temp_dir = std::env::temp_dir().join("frp_gui_test_error_restart");
        let manager = FrpcRuntimeManager::new(temp_dir);

        let handle = Arc::new(ProfileProcessHandle::new("profile_err".to_string()));
        // 状态为 error，但是旧控制通道依然存在（说明底层进程尚未退出确认）
        handle.update_state(STATUS_ERROR, None, None).await;
        let (tx, _rx) = mpsc::channel(1);
        handle.set_cmd_sender(Some(tx)).await;
        manager
            .registry
            .lock()
            .await
            .insert("profile_err".to_string(), handle);

        let res = manager
            .start_profile(
                None,
                "profile_err".to_string(),
                "".to_string(),
                "".to_string(),
            )
            .await;
        assert!(!res.accepted);
        assert_eq!(res.error, Some(ERR_ALREADY_RUNNING.to_string()));
    }

    #[tokio::test]
    async fn test_stop_unregistered_rejected() {
        let temp_dir = std::env::temp_dir().join("frp_gui_test_stop");
        let manager = FrpcRuntimeManager::new(temp_dir);

        let res = manager.stop_profile(None, "non_existent".to_string()).await;
        assert!(!res.accepted);
        assert_eq!(res.error, Some(ERR_NOT_FOUND_OR_STOPPED.to_string()));
    }

    #[tokio::test]
    async fn test_deadlock_free_stop_actor_flow() {
        #[cfg(target_os = "windows")]
        let mut cmd = Command::new("cmd.exe");
        #[cfg(target_os = "windows")]
        cmd.args(["/c", "ping -n 10 127.0.0.1 > nul"]);

        #[cfg(not(target_os = "windows"))]
        let mut cmd = Command::new("sleep");
        #[cfg(not(target_os = "windows"))]
        cmd.arg("10");

        let child = cmd
            .spawn()
            .expect("failed to spawn mock long-running process");
        let (cmd_tx, cmd_rx) = mpsc::channel(8);

        let handle = Arc::new(ProfileProcessHandle::new("test_stop_deadlock".to_string()));
        handle.update_state(STATUS_RUNNING, child.id(), None).await;
        handle.set_cmd_sender(Some(cmd_tx.clone())).await;

        let handle_clone = handle.clone();
        tokio::spawn(async move {
            FrpcRuntimeManager::run_process_monitor_actor(child, cmd_rx, handle_clone, None).await;
        });

        // 发起停止命令
        let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
        let send_res = cmd_tx
            .send(ProcessControlCommand::Stop { responder: resp_tx })
            .await;
        assert!(send_res.is_ok());

        // 等待停止完成，断言无死锁且正常返回 Ok
        let stop_res = timeout(Duration::from_secs(4), resp_rx).await;
        assert!(stop_res.is_ok(), "停止过程死锁或超时！");
        let inner_res = stop_res.unwrap();
        assert!(inner_res.is_ok());
        assert!(inner_res.unwrap().is_ok());

        // 验证状态最终由监控器正确落定为 stopped，且通道被释放
        let final_status = handle.get_status().await;
        assert_eq!(final_status, STATUS_STOPPED);
        assert!(handle.get_cmd_sender().await.is_none());
    }

    #[tokio::test]
    async fn test_early_exit_is_error_never_running_and_captures_real_logs() {
        let temp_dir = std::env::temp_dir().join("frp_gui_test_early_sink");
        let manager = FrpcRuntimeManager::new(temp_dir);
        let sink = Arc::new(InMemoryEventSink::new());

        let handle = Arc::new(ProfileProcessHandle::new("test_early_sink".to_string()));

        #[cfg(target_os = "windows")]
        let mut cmd = Command::new("cmd.exe");
        #[cfg(target_os = "windows")]
        cmd.args([
            "/c",
            "echo [E] login failed: token = super_secret_leak 1>&2 & exit 1",
        ]);

        #[cfg(not(target_os = "windows"))]
        let mut cmd = Command::new("sh");
        #[cfg(not(target_os = "windows"))]
        cmd.args([
            "-c",
            "echo '[E] login failed: token = super_secret_leak' >&2 && exit 1",
        ]);

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let res = manager
            .spawn_and_confirm_child(
                handle.clone(),
                cmd,
                Some(sink.clone()),
                "test_early_sink".to_string(),
            )
            .await;

        // 1. 结果断言：提前退出被阻断并返回结构化 failure_kind
        assert!(!res.accepted);
        assert_eq!(res.error, Some(ERR_EARLY_EXIT.to_string()));
        assert_eq!(res.failure_kind, Some(FAILURE_EARLY_EXIT.to_string()));

        // 2. 状态断言：最终为 error，绝不产生 running
        let final_status = handle.get_status().await;
        assert_eq!(final_status, STATUS_ERROR);

        // 3. 事件 Sink 断言：真实捕获 stderr 输出，且完成 Token 脱敏
        tokio::time::sleep(Duration::from_millis(100)).await;
        let logs = sink.logs.lock().await.clone();
        assert!(!logs.is_empty(), "必须提前捕获到进程退出前的输出日志！");

        let log_msg = &logs[0].message;
        assert!(
            log_msg.contains("token = ******"),
            "输出中 token 必须已被脱敏！"
        );
        assert!(
            !log_msg.contains("super_secret_leak"),
            "秘密原文绝不能出现在捕获日志中！"
        );
        assert_eq!(logs[0].level, "error");
        assert!(logs[0].sequence >= 1);

        // 4. 状态机事件断言：必须未曾发出 running
        let states = sink.states.lock().await.clone();
        for st in states {
            assert_ne!(
                st.status, STATUS_RUNNING,
                "提前退出绝对不能发出 running 事件！"
            );
        }
    }

    #[tokio::test]
    async fn test_start_profile_reports_structured_failure_kinds() {
        let temp_dir = std::env::temp_dir().join("frp_gui_test_failure_kinds");
        let manager = FrpcRuntimeManager::new(temp_dir);

        // 1. 无效 profile_id -> startup
        let res_id = manager
            .start_profile(
                None,
                "../invalid_id".to_string(),
                "".to_string(),
                "frpc.exe".to_string(),
            )
            .await;
        assert!(!res_id.accepted);
        assert_eq!(res_id.failure_kind, Some(FAILURE_STARTUP.to_string()));

        // 2. 核心不存在或非 frpc 文件名 -> core_invalid
        let res_core = manager
            .start_profile(
                None,
                "valid_profile".to_string(),
                "".to_string(),
                "Z:\\nonexistent\\frpc.exe".to_string(),
            )
            .await;
        assert!(!res_core.accepted);
        assert_eq!(
            res_core.failure_kind,
            Some(FAILURE_CORE_INVALID.to_string())
        );
    }

    #[tokio::test]
    async fn test_shutdown_all_awaits_confirmation_and_cleans_registry() {
        let temp_dir = std::env::temp_dir().join("frp_gui_test_shutdown");
        let manager = FrpcRuntimeManager::new(temp_dir);

        #[cfg(target_os = "windows")]
        let mut cmd = Command::new("cmd.exe");
        #[cfg(target_os = "windows")]
        cmd.args(["/c", "ping -n 10 127.0.0.1 > nul"]);

        #[cfg(not(target_os = "windows"))]
        let mut cmd = Command::new("sleep");
        #[cfg(not(target_os = "windows"))]
        cmd.arg("10");

        let child = cmd.spawn().expect("spawn mock");
        let (cmd_tx, cmd_rx) = mpsc::channel(8);

        let handle = Arc::new(ProfileProcessHandle::new("shutdown_p1".to_string()));
        handle.update_state(STATUS_RUNNING, child.id(), None).await;
        handle.set_cmd_sender(Some(cmd_tx)).await;

        let handle_clone = handle.clone();
        tokio::spawn(async move {
            FrpcRuntimeManager::run_process_monitor_actor(child, cmd_rx, handle_clone, None).await;
        });

        manager
            .registry
            .lock()
            .await
            .insert("shutdown_p1".to_string(), handle.clone());

        // 执行并发优雅关机
        manager.shutdown_all().await;

        // 验证已确认退出的方案已从注册表中清除
        let reg = manager.registry.lock().await;
        assert!(!reg.contains_key("shutdown_p1"));
    }

    #[tokio::test]
    async fn runtime_log_snapshot_is_sanitized_ordered_and_bounded() {
        let handle = Arc::new(ProfileProcessHandle::new("snapshot_profile".to_string()));
        for index in 0..(MAX_RUNTIME_LOGS_PER_PROFILE + 2) {
            FrpcRuntimeManager::capture_runtime_log(
                handle.clone(),
                None,
                "2026-09-04 16:18:19".to_string(),
                "info".to_string(),
                format!("line-{index} token = should_be_hidden"),
            )
            .await;
        }

        let logs = handle.runtime_logs_snapshot().await;
        assert_eq!(logs.len(), MAX_RUNTIME_LOGS_PER_PROFILE);
        assert_eq!(logs.first().unwrap().sequence, 3);
        assert!(logs
            .windows(2)
            .all(|pair| pair[0].sequence < pair[1].sequence));
        assert!(logs
            .iter()
            .all(|log| log.message.contains("token = ******")));
        assert!(logs
            .iter()
            .all(|log| !log.message.contains("should_be_hidden")));
    }

    #[tokio::test]
    async fn manager_returns_only_requested_profile_logs() {
        let manager = FrpcRuntimeManager::new(std::env::temp_dir());
        let first = Arc::new(ProfileProcessHandle::new("first".to_string()));
        let second = Arc::new(ProfileProcessHandle::new("second".to_string()));
        manager
            .registry
            .lock()
            .await
            .insert("first".to_string(), first.clone());
        manager
            .registry
            .lock()
            .await
            .insert("second".to_string(), second.clone());
        FrpcRuntimeManager::capture_runtime_log(
            first,
            None,
            "t".to_string(),
            "info".to_string(),
            "first".to_string(),
        )
        .await;
        FrpcRuntimeManager::capture_runtime_log(
            second,
            None,
            "t".to_string(),
            "info".to_string(),
            "second".to_string(),
        )
        .await;

        let logs = manager
            .get_runtime_logs(Some("first".to_string()))
            .await
            .unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].profile_id, "first");
    }

    #[test]
    fn test_lazylock_regex_performance_and_correctness() {
        let pem_log = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----";
        let auth_log = "Authorization: Bearer my-secret-jwt-token";
        let token_log = "token = \"top_secret_123\" and password = 'pwd' and secret_key = abc";
        let standard_log = "2026-09-05 22:00:00.123 [I] [service.go:123] login to server success";

        for _ in 0..1000 {
            let s_pem = sanitize_runtime_text(pem_log);
            assert_eq!(s_pem, "******");

            let s_auth = sanitize_runtime_text(auth_log);
            assert_eq!(s_auth, "Authorization: ******");

            let s_token = sanitize_runtime_text(token_log);
            assert_eq!(s_token, "token = ****** and password = ****** and secret_key = ******");

            let norm = normalize_runtime_log_line(
                "fallback".to_string(),
                "info".to_string(),
                standard_log.to_string(),
            );
            assert_eq!(norm.timestamp, "2026-09-05 22:00:00.123");
            assert_eq!(norm.level, "info");
            assert_eq!(norm.message, "[service.go:123] login to server success");
        }
    }

    #[tokio::test]
    async fn test_profile_handle_atomic_state_consistency() {
        let handle = Arc::new(ProfileProcessHandle::new("atomic_profile".to_string()));
        let initial_event = handle.to_state_event().await;
        assert_eq!(initial_event.status, STATUS_STOPPED);
        assert_eq!(initial_event.pid, None);

        // 更新为 running
        handle.update_state(STATUS_RUNNING, Some(12345), None).await;
        let running_event = handle.to_state_event().await;
        assert_eq!(running_event.status, STATUS_RUNNING);
        assert_eq!(running_event.pid, Some(12345));
        assert!(running_event.timestamp >= initial_event.timestamp);

        // 更新为 error
        handle.update_state(STATUS_ERROR, None, Some("出错了".to_string())).await;
        let error_event = handle.to_state_event().await;
        assert_eq!(error_event.status, STATUS_ERROR);
        assert_eq!(error_event.pid, None);
        assert_eq!(error_event.error_message, Some("出错了".to_string()));
    }
}
