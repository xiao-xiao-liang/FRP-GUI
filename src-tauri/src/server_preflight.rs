use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::timeout;

pub const PLATFORM_PROBE: &str = r#"set -eu
. /etc/os-release
printf 'ID=%s\n' "${ID:-unknown}"
printf 'ARCH=%s\n' "$(uname -m)"
printf 'UID=%s\n' "$(id -u)"
if command -v systemctl >/dev/null 2>&1 && systemctl --version >/dev/null 2>&1; then printf 'SYSTEMD=yes\n'; else printf 'SYSTEMD=no\n'; fi
if [ "$(id -u)" = "0" ]; then printf 'SUDO=not-needed\n'; elif sudo -n -v >/dev/null 2>&1; then printf 'SUDO=passwordless\n'; else printf 'SUDO=password-required\n'; fi
"#;

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum HostKeyDecision {
    Trusted,
    NeedsConfirmation,
    Changed,
}

pub fn classify_host_key(stored: Option<&str>, accepted: Option<&str>, presented: &str) -> HostKeyDecision {
    match stored {
        Some(value) if value != presented => HostKeyDecision::Changed,
        Some(_) => HostKeyDecision::Trusted,
        None if accepted == Some(presented) => HostKeyDecision::Trusted,
        None => HostKeyDecision::NeedsConfirmation,
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct ProbeParsed {
    pub os: Option<String>,
    pub architecture: Option<String>,
    pub privilege: Option<String>,
    pub systemd: Option<bool>,
}

pub fn parse_platform_probe(output: &str) -> Result<ProbeParsed, String> {
    let mut parsed = ProbeParsed::default();
    let mut id_val = None;
    let mut arch_val = None;
    let mut uid_val = None;
    let mut systemd_val = None;
    let mut sudo_val = None;

    for line in output.lines() {
        let line = line.trim();
        if let Some((k, v)) = line.split_once('=') {
            match k {
                "ID" => id_val = Some(v.to_lowercase()),
                "ARCH" => arch_val = Some(v.to_lowercase()),
                "UID" => uid_val = Some(v.to_string()),
                "SYSTEMD" => systemd_val = Some(v == "yes"),
                "SUDO" => sudo_val = Some(v.to_string()),
                _ => {}
            }
        }
    }

    match id_val.as_deref() {
        Some("ubuntu") => parsed.os = Some("ubuntu".to_string()),
        Some("debian") => parsed.os = Some("debian".to_string()),
        Some(_) => parsed.os = Some("unsupported".to_string()),
        None => parsed.os = Some("unknown".to_string()),
    }

    match arch_val.as_deref() {
        Some("x86_64") | Some("amd64") => parsed.architecture = Some("amd64".to_string()),
        Some("aarch64") | Some("arm64") => parsed.architecture = Some("arm64".to_string()),
        Some(_) => parsed.architecture = Some("unsupported".to_string()),
        None => parsed.architecture = Some("unknown".to_string()),
    }

    if uid_val.as_deref() == Some("0") {
        parsed.privilege = Some("root".to_string());
    } else if sudo_val.as_deref() == Some("passwordless") {
        parsed.privilege = Some("sudo_passwordless".to_string());
    } else if sudo_val.as_deref() == Some("password-required") {
        parsed.privilege = Some("sudo_password_required".to_string());
    } else {
        parsed.privilege = Some("unavailable".to_string());
    }

    parsed.systemd = systemd_val;

    Ok(parsed)
}

// 严禁在此类包含密码、私钥和口令的 DTO 上派生 Debug
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerPreflightRequest {
    pub node: ServerConnection,
    pub accepted_host_key_fingerprint: Option<String>,
    pub ephemeral_credentials: Option<EphemeralCredentials>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerConnection {
    pub id: String,
    pub host: String,
    pub ssh_port: u16,
    pub username: String,
    pub auth_method: String,
    pub credential_ref: Option<String>,
    pub credentials_remembered: bool,
    pub trusted_host_key_fingerprint: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EphemeralCredentials {
    pub password: Option<String>,
    pub private_key: Option<String>,
    pub private_key_passphrase: Option<String>,
}

// 不含秘密的预检返回 DTO 可以派生 Debug
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerPreflightResult {
    pub outcome: String,
    pub host_key_fingerprint: Option<String>,
    pub os: Option<String>,
    pub architecture: Option<String>,
    pub privilege: Option<String>,
    pub systemd: Option<bool>,
    pub requires_sudo_password: Option<bool>,
    pub checked_at: u64,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

pub fn format_host_key_fingerprint(public_key: &russh_keys::key::PublicKey) -> String {
    format!("SHA256:{}", public_key.fingerprint())
}

struct PreflightClientHandler {
    stored_fingerprint: Option<String>,
    accepted_fingerprint: Option<String>,
    presented_fingerprint: Arc<Mutex<Option<String>>>,
    decision: Arc<Mutex<Option<HostKeyDecision>>>,
}

#[async_trait::async_trait]
impl russh::client::Handler for PreflightClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        let fp = format_host_key_fingerprint(server_public_key);
        let dec = classify_host_key(
            self.stored_fingerprint.as_deref(),
            self.accepted_fingerprint.as_deref(),
            &fp,
        );
        *self.presented_fingerprint.lock().await = Some(fp);
        *self.decision.lock().await = Some(dec);

        Ok(dec == HostKeyDecision::Trusted)
    }
}

pub async fn run_server_preflight(request: ServerPreflightRequest) -> Result<ServerPreflightResult, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let node = &request.node;
    if node.host.trim().is_empty()
        || node.username.trim().is_empty()
        || node.id.trim().is_empty()
        || node.host.chars().any(|c| c.is_control() || c.is_whitespace())
        || node.username.chars().any(|c| c.is_control() || c.is_whitespace())
        || node.ssh_port == 0
    {
        return Ok(ServerPreflightResult {
            outcome: "failed".to_string(),
            host_key_fingerprint: None,
            os: None,
            architecture: None,
            privilege: None,
            systemd: None,
            requires_sudo_password: None,
            checked_at: now,
            error_code: Some("unknown".to_string()),
            error_message: Some("服务器节点连接参数非法".to_string()),
        });
    }

    if node.auth_method != "password" && node.auth_method != "private_key" {
        return Ok(ServerPreflightResult {
            outcome: "failed".to_string(),
            host_key_fingerprint: None,
            os: None,
            architecture: None,
            privilege: None,
            systemd: None,
            requires_sudo_password: None,
            checked_at: now,
            error_code: Some("unknown".to_string()),
            error_message: Some("不支持的 SSH 认证方式".to_string()),
        });
    }

    // 凭据解析：严格互斥
    let (password, private_key, passphrase) = if node.credentials_remembered {
        if request.ephemeral_credentials.is_some() {
            return Ok(ServerPreflightResult {
                outcome: "needs_credentials".to_string(),
                host_key_fingerprint: None,
                os: None,
                architecture: None,
                privilege: None,
                systemd: None,
                requires_sudo_password: None,
                checked_at: now,
                error_code: Some("credential_required".to_string()),
                error_message: Some("已记住凭据节点不应传入临时凭据".to_string()),
            });
        }
        let cred_ref = match node.credential_ref.as_deref() {
            Some(r) => r,
            None => {
                return Ok(ServerPreflightResult {
                    outcome: "needs_credentials".to_string(),
                    host_key_fingerprint: None,
                    os: None,
                    architecture: None,
                    privilege: None,
                    systemd: None,
                    requires_sudo_password: None,
                    checked_at: now,
                    error_code: Some("credential_required".to_string()),
                    error_message: Some("节点未配置系统安全凭据引用".to_string()),
                });
            }
        };
        match crate::credential_store::load_server_credentials(cred_ref, &node.auth_method) {
            Ok(creds) => (creds.password, creds.private_key, creds.private_key_passphrase),
            Err(_) => {
                return Ok(ServerPreflightResult {
                    outcome: "needs_credentials".to_string(),
                    host_key_fingerprint: None,
                    os: None,
                    architecture: None,
                    privilege: None,
                    systemd: None,
                    requires_sudo_password: None,
                    checked_at: now,
                    error_code: Some("credential_required".to_string()),
                    error_message: Some("无法从系统安全凭据库加载 SSH 凭据".to_string()),
                });
            }
        }
    } else {
        match request.ephemeral_credentials {
            Some(e) => (e.password, e.private_key, e.private_key_passphrase),
            None => {
                return Ok(ServerPreflightResult {
                    outcome: "needs_credentials".to_string(),
                    host_key_fingerprint: None,
                    os: None,
                    architecture: None,
                    privilege: None,
                    systemd: None,
                    requires_sudo_password: None,
                    checked_at: now,
                    error_code: Some("credential_required".to_string()),
                    error_message: Some("未提供本次 SSH 认证凭据".to_string()),
                });
            }
        }
    };

    if node.auth_method == "password" && password.as_deref().unwrap_or("").trim().is_empty() {
        return Ok(ServerPreflightResult {
            outcome: "needs_credentials".to_string(),
            host_key_fingerprint: None,
            os: None,
            architecture: None,
            privilege: None,
            systemd: None,
            requires_sudo_password: None,
            checked_at: now,
            error_code: Some("credential_required".to_string()),
            error_message: Some("请输入 SSH 密码".to_string()),
        });
    }

    if node.auth_method == "private_key" && private_key.as_deref().unwrap_or("").trim().is_empty() {
        return Ok(ServerPreflightResult {
            outcome: "needs_credentials".to_string(),
            host_key_fingerprint: None,
            os: None,
            architecture: None,
            privilege: None,
            systemd: None,
            requires_sudo_password: None,
            checked_at: now,
            error_code: Some("credential_required".to_string()),
            error_message: Some("请提供 SSH 私钥".to_string()),
        });
    }

    let config = Arc::new(russh::client::Config::default());
    let presented_fp = Arc::new(Mutex::new(None));
    let decision = Arc::new(Mutex::new(None));

    let handler = PreflightClientHandler {
        stored_fingerprint: node.trusted_host_key_fingerprint.clone(),
        accepted_fingerprint: request.accepted_host_key_fingerprint.clone(),
        presented_fingerprint: presented_fp.clone(),
        decision: decision.clone(),
    };

    let connect_res = timeout(
        Duration::from_secs(10),
        russh::client::connect(config, (node.host.as_str(), node.ssh_port), handler),
    )
    .await;

    let mut session = match connect_res {
        Ok(Ok(s)) => s,
        Ok(Err(_)) | Err(_) => {
            let fp = presented_fp.lock().await.clone();
            let dec = *decision.lock().await;
            if dec == Some(HostKeyDecision::NeedsConfirmation) {
                return Ok(ServerPreflightResult {
                    outcome: "needs_host_trust".to_string(),
                    host_key_fingerprint: fp,
                    os: None,
                    architecture: None,
                    privilege: None,
                    systemd: None,
                    requires_sudo_password: None,
                    checked_at: now,
                    error_code: None,
                    error_message: Some("请确认 SSH 主机指纹".to_string()),
                });
            }
            if dec == Some(HostKeyDecision::Changed) {
                return Ok(ServerPreflightResult {
                    outcome: "failed".to_string(),
                    host_key_fingerprint: fp,
                    os: None,
                    architecture: None,
                    privilege: None,
                    systemd: None,
                    requires_sudo_password: None,
                    checked_at: now,
                    error_code: Some("host_key_changed".to_string()),
                    error_message: Some("SSH 主机指纹发生变化，连接已安全中断".to_string()),
                });
            }
            return Ok(ServerPreflightResult {
                outcome: "failed".to_string(),
                host_key_fingerprint: fp,
                os: None,
                architecture: None,
                privilege: None,
                systemd: None,
                requires_sudo_password: None,
                checked_at: now,
                error_code: Some("network_failed".to_string()),
                error_message: Some("无法建立 SSH 连接".to_string()),
            });
        }
    };

    let host_key_fp = presented_fp.lock().await.clone();

    // 认证
    let auth_res = if node.auth_method == "password" {
        let pwd = password.unwrap_or_default();
        timeout(
            Duration::from_secs(10),
            session.authenticate_password(&node.username, pwd),
        )
        .await
    } else {
        let key_str = private_key.unwrap_or_default();
        let pass_str = passphrase.as_deref();
        let key_pair = match russh_keys::decode_secret_key(&key_str, pass_str) {
            Ok(k) => k,
            Err(_) => {
                return Ok(ServerPreflightResult {
                    outcome: "failed".to_string(),
                    host_key_fingerprint: host_key_fp,
                    os: None,
                    architecture: None,
                    privilege: None,
                    systemd: None,
                    requires_sudo_password: None,
                    checked_at: now,
                    error_code: Some("authentication_failed".to_string()),
                    error_message: Some("无法解析 SSH 私钥或私钥口令错误".to_string()),
                });
            }
        };
        timeout(
            Duration::from_secs(10),
            session.authenticate_publickey(&node.username, Arc::new(key_pair)),
        )
        .await
    };

    let authenticated = match auth_res {
        Ok(Ok(auth_ok)) => auth_ok,
        _ => false,
    };

    if !authenticated {
        return Ok(ServerPreflightResult {
            outcome: "failed".to_string(),
            host_key_fingerprint: host_key_fp,
            os: None,
            architecture: None,
            privilege: None,
            systemd: None,
            requires_sudo_password: None,
            checked_at: now,
            error_code: Some("authentication_failed".to_string()),
            error_message: Some("无法使用当前 SSH 凭据登录".to_string()),
        });
    }

    // 执行只读白名单探测
    let mut channel = match timeout(Duration::from_secs(10), session.channel_open_session()).await {
        Ok(Ok(ch)) => ch,
        _ => {
            return Ok(ServerPreflightResult {
                outcome: "failed".to_string(),
                host_key_fingerprint: host_key_fp,
                os: None,
                architecture: None,
                privilege: None,
                systemd: None,
                requires_sudo_password: None,
                checked_at: now,
                error_code: Some("network_failed".to_string()),
                error_message: Some("打开 SSH 会话通道失败".to_string()),
            });
        }
    };

    if let Err(_) = timeout(Duration::from_secs(10), channel.exec(true, PLATFORM_PROBE)).await {
        return Ok(ServerPreflightResult {
            outcome: "failed".to_string(),
            host_key_fingerprint: host_key_fp,
            os: None,
            architecture: None,
            privilege: None,
            systemd: None,
            requires_sudo_password: None,
            checked_at: now,
            error_code: Some("network_failed".to_string()),
            error_message: Some("执行预检命令超时".to_string()),
        });
    }

    // 独立 8 KiB 上限分别消费 stdout (Data) 与 stderr (ExtendedData)
    let mut stdout_buf = Vec::new();
    let mut stderr_buf = Vec::new();
    const MAX_READ_BYTES: usize = 8192;

    while let Ok(Some(msg)) = timeout(Duration::from_secs(10), channel.wait()).await {
        match msg {
            russh::ChannelMsg::Data { ref data } => {
                if stdout_buf.len() < MAX_READ_BYTES {
                    let take = std::cmp::min(data.len(), MAX_READ_BYTES - stdout_buf.len());
                    stdout_buf.extend_from_slice(&data[..take]);
                }
            }
            russh::ChannelMsg::ExtendedData { ref data, ext: _ } => {
                if stderr_buf.len() < MAX_READ_BYTES {
                    let take = std::cmp::min(data.len(), MAX_READ_BYTES - stderr_buf.len());
                    stderr_buf.extend_from_slice(&data[..take]);
                }
            }
            russh::ChannelMsg::Eof | russh::ChannelMsg::Close => break,
            _ => {}
        }
    }

    if stdout_buf.is_empty() && !stderr_buf.is_empty() {
        return Ok(ServerPreflightResult {
            outcome: "failed".to_string(),
            host_key_fingerprint: host_key_fp,
            os: None,
            architecture: None,
            privilege: None,
            systemd: None,
            requires_sudo_password: None,
            checked_at: now,
            error_code: Some("command_failed".to_string()),
            error_message: Some("服务器拒绝执行预检命令".to_string()),
        });
    }

    let output_str = String::from_utf8_lossy(&stdout_buf);
    let probe = match parse_platform_probe(&output_str) {
        Ok(p) => p,
        Err(_) => {
            return Ok(ServerPreflightResult {
                outcome: "failed".to_string(),
                host_key_fingerprint: host_key_fp,
                os: None,
                architecture: None,
                privilege: None,
                systemd: None,
                requires_sudo_password: None,
                checked_at: now,
                error_code: Some("unknown".to_string()),
                error_message: Some("解析服务器环境输出失败".to_string()),
            });
        }
    };

    if probe.os.as_deref() != Some("ubuntu") && probe.os.as_deref() != Some("debian") {
        return Ok(ServerPreflightResult {
            outcome: "failed".to_string(),
            host_key_fingerprint: host_key_fp,
            os: probe.os,
            architecture: probe.architecture,
            privilege: probe.privilege,
            systemd: probe.systemd,
            requires_sudo_password: None,
            checked_at: now,
            error_code: Some("unsupported_os".to_string()),
            error_message: Some("仅支持 Ubuntu 与 Debian 操作系统".to_string()),
        });
    }

    if probe.architecture.as_deref() != Some("amd64") && probe.architecture.as_deref() != Some("arm64") {
        return Ok(ServerPreflightResult {
            outcome: "failed".to_string(),
            host_key_fingerprint: host_key_fp,
            os: probe.os,
            architecture: probe.architecture,
            privilege: probe.privilege,
            systemd: probe.systemd,
            requires_sudo_password: None,
            checked_at: now,
            error_code: Some("unsupported_architecture".to_string()),
            error_message: Some("仅支持 x86_64 (amd64) 或 aarch64 (arm64) 架构".to_string()),
        });
    }

    if probe.systemd != Some(true) {
        return Ok(ServerPreflightResult {
            outcome: "failed".to_string(),
            host_key_fingerprint: host_key_fp,
            os: probe.os,
            architecture: probe.architecture,
            privilege: probe.privilege,
            systemd: probe.systemd,
            requires_sudo_password: None,
            checked_at: now,
            error_code: Some("systemd_unavailable".to_string()),
            error_message: Some("目标服务器未检测到可用的 systemd 服务管理器".to_string()),
        });
    }

    let is_sudo_password_required = probe.privilege.as_deref() == Some("sudo_password_required");
    let is_root_or_passwordless = probe.privilege.as_deref() == Some("root") || probe.privilege.as_deref() == Some("sudo_passwordless");

    if !is_root_or_passwordless && !is_sudo_password_required {
        return Ok(ServerPreflightResult {
            outcome: "failed".to_string(),
            host_key_fingerprint: host_key_fp,
            os: probe.os,
            architecture: probe.architecture,
            privilege: probe.privilege,
            systemd: probe.systemd,
            requires_sudo_password: None,
            checked_at: now,
            error_code: Some("sudo_required".to_string()),
            error_message: Some("未检测到可用的 root 或 sudo 部署权限".to_string()),
        });
    }

    Ok(ServerPreflightResult {
        outcome: "ready".to_string(),
        host_key_fingerprint: host_key_fp,
        os: probe.os,
        architecture: probe.architecture,
        privilege: probe.privilege,
        systemd: probe.systemd,
        requires_sudo_password: Some(is_sudo_password_required),
        checked_at: now,
        error_code: None,
        error_message: None,
    })
}

#[cfg(test)]
mod tests {
    use super::{classify_host_key, format_host_key_fingerprint, parse_platform_probe, HostKeyDecision};

    #[test]
    fn first_connection_requires_explicit_fingerprint_confirmation() {
        assert_eq!(classify_host_key(None, None, "SHA256:first"), HostKeyDecision::NeedsConfirmation);
        assert_eq!(classify_host_key(None, Some("SHA256:first"), "SHA256:first"), HostKeyDecision::Trusted);
    }

    #[test]
    fn changed_fingerprint_is_rejected_even_when_a_new_value_is_supplied() {
        assert_eq!(classify_host_key(Some("SHA256:old"), Some("SHA256:new"), "SHA256:new"), HostKeyDecision::Changed);
    }

    #[test]
    fn fingerprint_format_always_starts_with_sha256_prefix() {
        let key = russh_keys::key::KeyPair::generate_ed25519().unwrap().clone_public_key().unwrap();
        let fp = format_host_key_fingerprint(&key);
        assert!(fp.starts_with("SHA256:"));
        assert!(fp.len() > 10);
    }

    #[test]
    fn platform_probe_accepts_only_ubuntu_or_debian_with_supported_architecture() {
        let result = parse_platform_probe("ID=ubuntu\nARCH=x86_64\nUID=0\nSYSTEMD=yes\nSUDO=not-needed\n").unwrap();
        assert_eq!(result.os.as_deref(), Some("ubuntu"));
        assert_eq!(result.architecture.as_deref(), Some("amd64"));
        assert_eq!(result.privilege.as_deref(), Some("root"));
        assert_eq!(result.systemd, Some(true));
    }

    #[test]
    fn platform_probe_parses_debian_and_arm64() {
        let result = parse_platform_probe("ID=debian\nARCH=aarch64\nUID=1000\nSYSTEMD=yes\nSUDO=passwordless\n").unwrap();
        assert_eq!(result.os.as_deref(), Some("debian"));
        assert_eq!(result.architecture.as_deref(), Some("arm64"));
        assert_eq!(result.privilege.as_deref(), Some("sudo_passwordless"));
        assert_eq!(result.systemd, Some(true));
    }

    #[test]
    fn platform_probe_identifies_unsupported_os_and_sudo_password_required() {
        let result = parse_platform_probe("ID=centos\nARCH=x86_64\nUID=1000\nSYSTEMD=no\nSUDO=password-required\n").unwrap();
        assert_eq!(result.os.as_deref(), Some("unsupported"));
        assert_eq!(result.architecture.as_deref(), Some("amd64"));
        assert_eq!(result.privilege.as_deref(), Some("sudo_password_required"));
        assert_eq!(result.systemd, Some(false));
    }

    #[test]
    fn preflight_request_rejects_unknown_command_and_shell_fields() {
        use super::ServerPreflightRequest;

        // 顶层携带 command 字段
        let with_cmd = r#"{
            "node": {
                "id": "node-1",
                "host": "1.2.3.4",
                "sshPort": 22,
                "username": "root",
                "authMethod": "password",
                "credentialsRemembered": false
            },
            "command": "rm -rf /"
        }"#;
        assert!(serde_json::from_str::<ServerPreflightRequest>(with_cmd).is_err());

        // 顶层携带 shell 字段
        let with_shell = r#"{
            "node": {
                "id": "node-1",
                "host": "1.2.3.4",
                "sshPort": 22,
                "username": "root",
                "authMethod": "password",
                "credentialsRemembered": false
            },
            "shell": "/bin/bash"
        }"#;
        assert!(serde_json::from_str::<ServerPreflightRequest>(with_shell).is_err());

        // node 嵌套携带未知字段
        let with_node_cmd = r#"{
            "node": {
                "id": "node-1",
                "host": "1.2.3.4",
                "sshPort": 22,
                "username": "root",
                "authMethod": "password",
                "credentialsRemembered": false,
                "command": "whoami"
            }
        }"#;
        assert!(serde_json::from_str::<ServerPreflightRequest>(with_node_cmd).is_err());

        // ephemeralCredentials 嵌套携带未知字段
        let with_cred_cmd = r#"{
            "node": {
                "id": "node-1",
                "host": "1.2.3.4",
                "sshPort": 22,
                "username": "root",
                "authMethod": "password",
                "credentialsRemembered": false
            },
            "ephemeralCredentials": {
                "password": "secret",
                "command": "reboot"
            }
        }"#;
        assert!(serde_json::from_str::<ServerPreflightRequest>(with_cred_cmd).is_err());

        // 合法结构化请求正常解析
        let valid_json = r#"{
            "node": {
                "id": "node-1",
                "host": "1.2.3.4",
                "sshPort": 22,
                "username": "root",
                "authMethod": "password",
                "credentialsRemembered": false
            },
            "ephemeralCredentials": {
                "password": "secret"
            }
        }"#;
        assert!(serde_json::from_str::<ServerPreflightRequest>(valid_json).is_ok());
    }
}


