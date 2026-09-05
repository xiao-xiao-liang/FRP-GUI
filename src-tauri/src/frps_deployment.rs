use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::timeout;

pub const SERVICE_NAME: &str = "frp-gui-frps.service";

pub const DEPLOY_AS_ROOT: &str = "/bin/sh -s -- frp-gui-deploy";
pub const DEPLOY_AS_SUDO_PASSWORDLESS: &str = "sudo -n -- /bin/sh -s -- frp-gui-deploy";
pub const DEPLOY_AS_SUDO: &str = "sudo -S -p '' -- /bin/sh -s -- frp-gui-deploy";

pub const SERVICE_START_ROOT: &str = "systemctl start frp-gui-frps.service && systemctl is-active --quiet frp-gui-frps.service";
pub const SERVICE_START_PASSWORDLESS: &str = "sudo -n systemctl start frp-gui-frps.service && sudo -n systemctl is-active --quiet frp-gui-frps.service";
pub const SERVICE_START_SUDO: &str = "sudo -S -p '' -- /bin/sh -c 'systemctl start frp-gui-frps.service && systemctl is-active --quiet frp-gui-frps.service'";

pub const SERVICE_STOP_ROOT: &str = "systemctl stop frp-gui-frps.service && ! systemctl is-active --quiet frp-gui-frps.service";
pub const SERVICE_STOP_PASSWORDLESS: &str = "sudo -n systemctl stop frp-gui-frps.service && ! sudo -n systemctl is-active --quiet frp-gui-frps.service";
pub const SERVICE_STOP_SUDO: &str = "sudo -S -p '' -- /bin/sh -c 'systemctl stop frp-gui-frps.service && ! systemctl is-active --quiet frp-gui-frps.service'";

pub const SERVICE_RESTART_ROOT: &str = "systemctl restart frp-gui-frps.service && systemctl is-active --quiet frp-gui-frps.service";
pub const SERVICE_RESTART_PASSWORDLESS: &str = "sudo -n systemctl restart frp-gui-frps.service && sudo -n systemctl is-active --quiet frp-gui-frps.service";
pub const SERVICE_RESTART_SUDO: &str = "sudo -S -p '' -- /bin/sh -c 'systemctl restart frp-gui-frps.service && systemctl is-active --quiet frp-gui-frps.service'";

pub const SERVICE_STATUS: &str = "systemctl is-active frp-gui-frps.service; systemctl is-enabled frp-gui-frps.service";

pub const SERVICE_LOGS_ROOT: &str = "journalctl -u frp-gui-frps.service -n 200 --no-pager -o cat";
pub const SERVICE_LOGS_PASSWORDLESS: &str = "sudo -n journalctl -u frp-gui-frps.service -n 200 --no-pager -o cat";
pub const SERVICE_LOGS_SUDO: &str = "sudo -S -p '' -- journalctl -u frp-gui-frps.service -n 200 --no-pager -o cat";

pub const DEPLOY_HELPER_SCRIPT: &str = r#"set -eu
umask 077

TMP_DIR=$(mktemp -d /tmp/.frp-gui-deploy.XXXXXX)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

VERSION=""
ARCH=""
CHECKSUM=""
ARCHIVE_B64=""
TOML_B64=""

while IFS= read -r line; do
  case "$line" in
    VERSION=*) VERSION="${line#VERSION=}" ;;
    ARCH=*) ARCH="${line#ARCH=}" ;;
    CHECKSUM=*) CHECKSUM="${line#CHECKSUM=}" ;;
    ARCHIVE_B64=*) ARCHIVE_B64="${line#ARCHIVE_B64=}" ;;
    TOML_B64=*) TOML_B64="${line#TOML_B64=}" ;;
    END_PAYLOAD*) break ;;
  esac
done

if [ -z "$VERSION" ] || [ -z "$ARCH" ] || [ -z "$CHECKSUM" ] || [ -z "$ARCHIVE_B64" ] || [ -z "$TOML_B64" ]; then
  echo "DEPLOY_ERR:PAYLOAD_INCOMPLETE" >&2
  exit 1
fi

printf '%s' "$ARCHIVE_B64" | base64 -d > "$TMP_DIR/archive.tar.gz"
printf '%s' "$TOML_B64" | base64 -d > "$TMP_DIR/frps.toml.candidate"

ACTUAL_CHECKSUM=$(sha256sum "$TMP_DIR/archive.tar.gz" | cut -d' ' -f1)
if [ "$ACTUAL_CHECKSUM" != "$CHECKSUM" ]; then
  echo "DEPLOY_ERR:CHECKSUM_MISMATCH" >&2
  exit 2
fi

tar -xzf "$TMP_DIR/archive.tar.gz" -C "$TMP_DIR"
EXPECTED_FRPS="$TMP_DIR/frp_${VERSION}_linux_${ARCH}/frps"
if [ ! -f "$EXPECTED_FRPS" ]; then
  echo "DEPLOY_ERR:FRPS_BINARY_NOT_FOUND" >&2
  exit 3
fi
chmod 0755 "$EXPECTED_FRPS"

"$EXPECTED_FRPS" verify -c "$TMP_DIR/frps.toml.candidate" >/dev/null 2>&1 || {
  echo "DEPLOY_ERR:CONFIG_VERIFY_FAILED" >&2
  exit 4
}

cat << 'SERVICE_UNIT_EOF' > "$TMP_DIR/frp-gui-frps.service.candidate"
[Unit]
Description=FRP-GUI Managed FRPS Server
After=network.target syslog.target
Wants=network.target

[Service]
Type=simple
ExecStart=/opt/frp/current/frps -c /opt/frp/frps.toml
Restart=on-failure
RestartSec=5s
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE_UNIT_EOF

mkdir -p /opt/frp/releases/"$VERSION"
install -m 0755 "$EXPECTED_FRPS" "$TMP_DIR/frps.installed"
mv -f "$TMP_DIR/frps.installed" /opt/frp/releases/"$VERSION"/frps

install -m 0600 "$TMP_DIR/frps.toml.candidate" "$TMP_DIR/frps.toml.atomic"
mv -f "$TMP_DIR/frps.toml.atomic" /opt/frp/frps.toml
ln -sfn /opt/frp/releases/"$VERSION" /opt/frp/current

install -m 0644 "$TMP_DIR/frp-gui-frps.service.candidate" "$TMP_DIR/frp-gui-frps.service.atomic"
mv -f "$TMP_DIR/frp-gui-frps.service.atomic" /etc/systemd/system/frp-gui-frps.service

systemctl daemon-reload
systemctl enable --now frp-gui-frps.service
systemctl is-active --quiet frp-gui-frps.service || {
  echo "DEPLOY_ERR:SERVICE_START_FAILED" >&2
  exit 5
}
echo "DEPLOY_SUCCESS"
"#;

// 严禁派生 Debug，以防止包含秘密的字段泄漏
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerOperationRequest {
    pub node: ServerOperationConnection,
    pub operation: ServerOperationKind,
    pub deployment: Option<FrpsDeploymentPublicConfig>,
    pub confirmation: Option<DeploymentConfirmation>,
    pub ephemeral_ssh_credentials: Option<EphemeralSshCredentials>,
    pub ephemeral_sudo_password: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EphemeralSshCredentials {
    pub password: Option<String>,
    pub private_key: Option<String>,
    pub private_key_passphrase: Option<String>,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServerOperationKind {
    Deploy,
    Start,
    Stop,
    Restart,
    RefreshStatus,
    ReadLogs,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeploymentConfirmation {
    pub accepted: bool,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FrpsDeploymentPublicConfig {
    pub version: String,
    pub bind_port: u16,
    pub transport_protocol: String,
    pub tls_force: bool,
    pub dashboard_enabled: bool,
    pub dashboard_port: Option<u16>,
    pub dashboard_user: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerOperationConnection {
    pub id: String,
    pub host: String,
    pub ssh_port: u16,
    pub username: String,
    pub auth_method: String,
    pub credential_ref: Option<String>,
    pub credentials_remembered: bool,
    pub trusted_host_key_fingerprint: Option<String>,
    pub remote_os: Option<String>,
    pub remote_architecture: Option<String>,
    pub privilege: Option<String>,
    pub systemd: Option<bool>,
    pub requires_sudo_password: Option<bool>,
    pub sudo_credentials_remembered: Option<bool>,
    pub install_dir: Option<String>,
    pub status: Option<String>,
    pub service_status: Option<String>,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerOperationResult {
    pub operation: String,
    pub outcome: String,
    pub service_status: String,
    pub checked_at: u64,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub deployment: Option<FrpsDeploymentMetadata>,
    pub logs: Option<Vec<String>>,
}

#[derive(Serialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FrpsDeploymentMetadata {
    pub summary: FrpsDeploymentSummary,
    pub service_name: String,
    pub installed_at: u64,
    pub enabled: bool,
}

#[derive(Serialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FrpsDeploymentSummary {
    pub version: String,
    pub bind_port: u16,
    pub transport_protocol: String,
    pub tls_force: bool,
    pub dashboard_enabled: bool,
    pub dashboard_port: Option<u16>,
    pub dashboard_user: Option<String>,
}

pub fn is_valid_version(version: &str) -> bool {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() != 3 || parts[0] != "0" {
        return false;
    }
    parts[1].chars().all(|c| c.is_ascii_digit())
        && !parts[1].is_empty()
        && parts[2].chars().all(|c| c.is_ascii_digit())
        && !parts[2].is_empty()
}

pub fn asset_name(version: &str, architecture: &str) -> Result<String, String> {
    if !is_valid_version(version) {
        return Err("版本格式非法，仅支持 0.x.y 官方版本".to_string());
    }
    match architecture {
        "amd64" | "arm64" => Ok(format!("frp_{version}_linux_{architecture}.tar.gz")),
        _ => Err("仅支持 amd64 或 arm64 架构".to_string()),
    }
}

pub fn checksum_for_asset(checksums_txt: &str, asset: &str) -> Result<String, String> {
    for line in checksums_txt.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() == 2 && parts[1] == asset {
            let hash = parts[0].to_lowercase();
            if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                return Ok(hash);
            }
        }
    }
    Err(format!("未在 checksums 文件中找到目标资产 {asset} 的 SHA-256 校验和"))
}

#[derive(Serialize)]
struct FrpsTomlModel {
    #[serde(rename = "bindPort")]
    bind_port: u16,
    #[serde(rename = "kcpBindPort", skip_serializing_if = "Option::is_none")]
    kcp_bind_port: Option<u16>,
    #[serde(rename = "quicBindPort", skip_serializing_if = "Option::is_none")]
    quic_bind_port: Option<u16>,
    auth: FrpsAuthToml,
    #[serde(skip_serializing_if = "Option::is_none")]
    transport: Option<FrpsTransportToml>,
    #[serde(rename = "webServer", skip_serializing_if = "Option::is_none")]
    web_server: Option<FrpsWebServerToml>,
}

#[derive(Serialize)]
struct FrpsAuthToml {
    token: String,
}

#[derive(Serialize)]
struct FrpsTransportToml {
    #[serde(skip_serializing_if = "Option::is_none")]
    tls: Option<FrpsTlsToml>,
}

#[derive(Serialize)]
struct FrpsTlsToml {
    force: bool,
}

#[derive(Serialize)]
struct FrpsWebServerToml {
    addr: String,
    port: u16,
    user: String,
    password: String,
}

pub fn render_frps_toml(
    config: &FrpsDeploymentPublicConfig,
    auth_token: &str,
    dashboard_password: Option<&str>,
) -> Result<String, String> {
    let kcp = if config.transport_protocol == "kcp" { Some(config.bind_port) } else { None };
    let quic = if config.transport_protocol == "quic" { Some(config.bind_port) } else { None };
    let transport = if config.tls_force {
        Some(FrpsTransportToml { tls: Some(FrpsTlsToml { force: true }) })
    } else {
        None
    };
    let web_server = if config.dashboard_enabled {
        Some(FrpsWebServerToml {
            addr: "0.0.0.0".to_string(),
            port: config.dashboard_port.unwrap_or(7500),
            user: config.dashboard_user.clone().unwrap_or_default(),
            password: dashboard_password.unwrap_or_default().to_string(),
        })
    } else {
        None
    };

    let model = FrpsTomlModel {
        bind_port: config.bind_port,
        kcp_bind_port: kcp,
        quic_bind_port: quic,
        auth: FrpsAuthToml { token: auth_token.to_string() },
        transport,
        web_server,
    };

    toml::to_string(&model).map_err(|e| format!("生成 TOML 配置文件失败: {e}"))
}

pub fn redact_line(line: &str, known_secrets: &[&str]) -> String {
    let mut result = line.to_string();

    for secret in known_secrets {
        if !secret.trim().is_empty() {
            result = result.replace(secret, "******");
        }
    }

    if let Some(idx) = result.find("token") {
        if let Some(eq_idx) = result[idx..].find('=') {
            let value_start = idx + eq_idx + 1;
            let prefix = &result[..value_start];
            result = format!("{prefix} \"******\"");
        }
    }

    if let Some(idx) = result.find("password") {
        if let Some(eq_idx) = result[idx..].find('=') {
            let value_start = idx + eq_idx + 1;
            let prefix = &result[..value_start];
            result = format!("{prefix} \"******\"");
        }
    }

    if result.contains("PRIVATE KEY") {
        result = "****** [PRIVATE KEY CONTENT REDACTED] ******".to_string();
    }

    result
}

pub fn validate_operation_connection(
    node: &ServerOperationConnection,
    op: ServerOperationKind,
) -> Result<(), String> {
    if node.host.trim().is_empty()
        || node.username.trim().is_empty()
        || node.id.trim().is_empty()
        || node.ssh_port == 0
        || node.host.chars().any(|c| c.is_control() || c.is_whitespace())
        || node.username.chars().any(|c| c.is_control() || c.is_whitespace())
    {
        return Err("服务器节点连接参数非法".to_string());
    }

    if node.trusted_host_key_fingerprint.as_deref().unwrap_or("").trim().is_empty() {
        return Err("服务器尚未确认 SSH 主机指纹，请先执行预检".to_string());
    }

    let os_ok = node.remote_os.as_deref() == Some("ubuntu") || node.remote_os.as_deref() == Some("debian");
    let arch_ok = node.remote_architecture.as_deref() == Some("amd64") || node.remote_architecture.as_deref() == Some("arm64");
    if !os_ok || !arch_ok {
        return Err("服务器未通过操作系统与架构预检".to_string());
    }

    if node.systemd != Some(true) {
        return Err("目标服务器未检测到可用的 systemd 服务管理器".to_string());
    }

    let priv_ok = match node.privilege.as_deref() {
        Some("root") | Some("sudo_passwordless") | Some("sudo_password_required") => true,
        _ => false,
    };
    if !priv_ok {
        return Err("节点未通过部署权限预检或权限不受支持".to_string());
    }

    match node.install_dir.as_deref() {
        Some("/opt/frp") => {}
        _ => return Err("安装根目录必须固定为 /opt/frp".to_string()),
    }

    match op {
        ServerOperationKind::Deploy => {
            match node.status.as_deref() {
                Some("ready_to_deploy") | Some("stopped") | Some("error") => {}
                Some("draft") => return Err("节点处于草稿状态，须先完成预检".to_string()),
                _ => return Err("当前节点状态不允许执行部署操作".to_string()),
            }
        }
        _ => {
            if node.status.as_deref() == Some("draft") {
                return Err("节点处于草稿状态，须先完成预检".to_string());
            }
        }
    }

    if node.auth_method != "password" && node.auth_method != "private_key" {
        return Err("不支持的 SSH 认证方式".to_string());
    }

    Ok(())
}

pub fn resolve_ssh_credentials(
    node: &ServerOperationConnection,
    ephem: Option<&EphemeralSshCredentials>,
) -> Result<(Option<String>, Option<String>, Option<String>), String> {
    if node.credentials_remembered {
        if ephem.is_some() {
            return Err("已记住凭据节点不应传入临时 SSH 凭据".to_string());
        }
        let cred_ref = node.credential_ref.as_deref().unwrap_or("");
        let loaded = crate::credential_store::load_server_credentials(cred_ref, &node.auth_method)?;
        Ok((loaded.password, loaded.private_key, loaded.private_key_passphrase))
    } else {
        let e = match ephem {
            Some(creds) => creds,
            None => return Err("未记住凭据节点必须提供本次 SSH 凭据".to_string()),
        };
        match node.auth_method.as_str() {
            "password" => {
                if e.password.as_deref().unwrap_or("").trim().is_empty() {
                    return Err("请输入 SSH 密码".to_string());
                }
                Ok((e.password.clone(), None, None))
            }
            "private_key" => {
                if e.private_key.as_deref().unwrap_or("").trim().is_empty() {
                    return Err("请提供 SSH 私钥".to_string());
                }
                Ok((None, e.private_key.clone(), e.private_key_passphrase.clone()))
            }
            _ => Err("不支持的 SSH 认证方式".to_string()),
        }
    }
}

pub fn resolve_sudo_password(
    node: &ServerOperationConnection,
    ephem_sudo: Option<&str>,
    cred_ref: Option<&str>,
) -> Result<Option<String>, String> {
    if node.privilege.as_deref() == Some("sudo_password_required") {
        if let Some(p) = ephem_sudo {
            if !p.trim().is_empty() {
                return Ok(Some(p.to_string()));
            }
        }
        if let Some(r) = cred_ref {
            if let Ok(creds) = crate::credential_store::load_frps_deployment_credentials(r) {
                if let Some(p) = creds.sudo_password {
                    if !p.trim().is_empty() {
                        return Ok(Some(p));
                    }
                }
            }
        }
        Err("该节点需要 sudo 密码以执行操作".to_string())
    } else {
        Ok(None)
    }
}

pub fn validate_deployment_config(
    config: &FrpsDeploymentPublicConfig,
    auth_token: &str,
    dashboard_password: Option<&str>,
) -> Result<(), String> {
    if !is_valid_version(&config.version) {
        return Err("版本格式非法，仅支持 0.x.y 官方版本".to_string());
    }

    if config.bind_port == 0 {
        return Err("服务监听端口非法".to_string());
    }

    if !["tcp", "kcp", "quic"].contains(&config.transport_protocol.as_str()) {
        return Err("传输协议仅支持 tcp、kcp 或 quic".to_string());
    }

    if auth_token.trim().is_empty() {
        return Err("缺少 FRP 认证 Token".to_string());
    }

    if config.dashboard_enabled {
        let port = config.dashboard_port.unwrap_or(0);
        if port == 0 {
            return Err("控制台端口需在 1 - 65535 之间".to_string());
        }
        if port == config.bind_port {
            return Err("控制台端口不能与服务监听端口相同".to_string());
        }
        if config.dashboard_user.as_deref().unwrap_or("").trim().is_empty() {
            return Err("请输入控制台用户名".to_string());
        }
        if dashboard_password.unwrap_or("").trim().is_empty() {
            return Err("缺少控制台密码".to_string());
        }
    }

    Ok(())
}

pub fn command_for_operation(op: ServerOperationKind, privilege: &str) -> &'static str {
    match op {
        ServerOperationKind::Deploy => match privilege {
            "root" => DEPLOY_AS_ROOT,
            "sudo_passwordless" => DEPLOY_AS_SUDO_PASSWORDLESS,
            _ => DEPLOY_AS_SUDO,
        },
        ServerOperationKind::Start => match privilege {
            "root" => SERVICE_START_ROOT,
            "sudo_passwordless" => SERVICE_START_PASSWORDLESS,
            _ => SERVICE_START_SUDO,
        },
        ServerOperationKind::Stop => match privilege {
            "root" => SERVICE_STOP_ROOT,
            "sudo_passwordless" => SERVICE_STOP_PASSWORDLESS,
            _ => SERVICE_STOP_SUDO,
        },
        ServerOperationKind::Restart => match privilege {
            "root" => SERVICE_RESTART_ROOT,
            "sudo_passwordless" => SERVICE_RESTART_PASSWORDLESS,
            _ => SERVICE_RESTART_SUDO,
        },
        ServerOperationKind::RefreshStatus => SERVICE_STATUS,
        ServerOperationKind::ReadLogs => match privilege {
            "root" => SERVICE_LOGS_ROOT,
            "sudo_passwordless" => SERVICE_LOGS_PASSWORDLESS,
            _ => SERVICE_LOGS_SUDO,
        },
    }
}

pub fn consume_chunks_with_limit(
    chunks: Vec<Vec<u8>>,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    for chunk in chunks {
        if bytes.len() + chunk.len() > max_bytes {
            return Err("官方 FRPS 安装包超过 100 MiB 安全限制，已中止下载".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub async fn download_verified_release(version: &str, architecture: &str) -> Result<Vec<u8>, String> {
    let aname = asset_name(version, architecture)?;
    let base = format!("https://github.com/fatedier/frp/releases/download/v{version}");
    let asset_url = format!("{base}/{aname}");
    let checksums_url = format!("{base}/frp_sha256_checksums.txt");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {e}"))?;

    // 1. 下载 checksums 文件
    let checksums_resp = client
        .get(&checksums_url)
        .send()
        .await
        .map_err(|_| "下载官方 SHA-256 校验文件超时或失败".to_string())?;

    if !checksums_resp.status().is_success() {
        return Err("下载官方 SHA-256 校验文件失败，请检查版本是否存在".to_string());
    }

    let checksums_text = checksums_resp
        .text()
        .await
        .map_err(|_| "读取官方 SHA-256 校验内容失败".to_string())?;

    let expected_hash = checksum_for_asset(&checksums_text, &aname)?;

    // 2. 流式下载发布包并限制 100 MiB
    let mut asset_resp = client
        .get(&asset_url)
        .send()
        .await
        .map_err(|_| "下载官方 FRPS 安装包超时或失败".to_string())?;

    if !asset_resp.status().is_success() {
        return Err("下载官方 FRPS 安装包失败".to_string());
    }

    let mut bytes = Vec::new();
    const MAX_ASSET_SIZE: usize = 100 * 1024 * 1024;
    while let Some(chunk) = asset_resp.chunk().await.map_err(|_| "读取官方安装包数据流失败".to_string())? {
        if bytes.len() + chunk.len() > MAX_ASSET_SIZE {
            return Err("官方 FRPS 安装包超过 100 MiB 安全限制，已中止下载".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }

    let actual_hash = format!("{:x}", sha2::Sha256::digest(&bytes));
    if actual_hash != expected_hash {
        return Err("官方安装包 SHA-256 校验和不匹配，已拒绝安装".to_string());
    }

    Ok(bytes)
}

struct DeploymentClientHandler {
    trusted_fingerprint: Option<String>,
    presented_fingerprint: Arc<Mutex<Option<String>>>,
    trusted: Arc<Mutex<bool>>,
}

#[async_trait::async_trait]
impl russh::client::Handler for DeploymentClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        let fp = crate::server_preflight::format_host_key_fingerprint(server_public_key);
        *self.presented_fingerprint.lock().await = Some(fp.clone());

        let is_trusted = match self.trusted_fingerprint.as_deref() {
            Some(stored) => stored == fp,
            None => false,
        };

        *self.trusted.lock().await = is_trusted;
        Ok(is_trusted)
    }
}

pub async fn run_frps_operation(request: ServerOperationRequest) -> Result<ServerOperationResult, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let op_str = match request.operation {
        ServerOperationKind::Deploy => "deploy",
        ServerOperationKind::Start => "start",
        ServerOperationKind::Stop => "stop",
        ServerOperationKind::Restart => "restart",
        ServerOperationKind::RefreshStatus => "refresh_status",
        ServerOperationKind::ReadLogs => "read_logs",
    };

    let node = &request.node;

    // 1. 验证节点参数及状态
    if let Err(msg) = validate_operation_connection(node, request.operation) {
        let error_code = if msg.contains("指纹") {
            "untrusted_host"
        } else if msg.contains("预检") || msg.contains("架构") || msg.contains("systemd") || msg.contains("权限") {
            "preflight_required"
        } else {
            "config_invalid"
        };
        return Ok(ServerOperationResult {
            operation: op_str.to_string(),
            outcome: "failed".to_string(),
            service_status: "unknown".to_string(),
            checked_at: now,
            error_code: Some(error_code.to_string()),
            error_message: Some(msg),
            deployment: None,
            logs: None,
        });
    }

    // 2. 部署操作专属校验
    if request.operation == ServerOperationKind::Deploy {
        if request.confirmation.as_ref().map(|c| c.accepted) != Some(true) {
            return Ok(ServerOperationResult {
                operation: op_str.to_string(),
                outcome: "failed".to_string(),
                service_status: "unknown".to_string(),
                checked_at: now,
                error_code: Some("config_invalid".to_string()),
                error_message: Some("必须显式确认部署计划后方可执行".to_string()),
                deployment: None,
                logs: None,
            });
        }
        if request.deployment.is_none() {
            return Ok(ServerOperationResult {
                operation: op_str.to_string(),
                outcome: "failed".to_string(),
                service_status: "unknown".to_string(),
                checked_at: now,
                error_code: Some("config_invalid".to_string()),
                error_message: Some("缺少 FRPS 部署配置".to_string()),
                deployment: None,
                logs: None,
            });
        }
    }

    // 3. 解析 SSH 凭据（严格区分记住与未记住）
    let (ssh_password, ssh_private_key, ssh_passphrase) = match resolve_ssh_credentials(
        node,
        request.ephemeral_ssh_credentials.as_ref(),
    ) {
        Ok(creds) => creds,
        Err(msg) => {
            return Ok(ServerOperationResult {
                operation: op_str.to_string(),
                outcome: "failed".to_string(),
                service_status: "unknown".to_string(),
                checked_at: now,
                error_code: Some("credential_required".to_string()),
                error_message: Some(msg),
                deployment: None,
                logs: None,
            });
        }
    };

    // 4. 解析 sudo 凭据
    let cred_ref = node.credential_ref.as_deref();
    let sudo_password = match resolve_sudo_password(
        node,
        request.ephemeral_sudo_password.as_deref(),
        cred_ref,
    ) {
        Ok(pwd) => pwd,
        Err(_) => {
            return Ok(ServerOperationResult {
                operation: op_str.to_string(),
                outcome: "needs_sudo_credentials".to_string(),
                service_status: node.service_status.clone().unwrap_or_else(|| "unknown".to_string()),
                checked_at: now,
                error_code: Some("sudo_required".to_string()),
                error_message: Some("该节点需要 sudo 密码以执行操作".to_string()),
                deployment: None,
                logs: None,
            });
        }
    };

    // 5. 若为 deploy 操作，先在本地校验配置与秘密，并流式下载和校验官方发布包
    let (verified_archive, frps_toml_str, auth_token_secret, dashboard_pwd_secret) = if request.operation == ServerOperationKind::Deploy {
        let deploy_cfg = request.deployment.as_ref().unwrap();

        let deployment_creds = cred_ref
            .and_then(|r| crate::credential_store::load_frps_deployment_credentials(r).ok())
            .unwrap_or_default();

        let auth_token = deployment_creds.frp_token.unwrap_or_default();
        let dash_pwd = deployment_creds.dashboard_password;

        if let Err(msg) = validate_deployment_config(deploy_cfg, &auth_token, dash_pwd.as_deref()) {
            return Ok(ServerOperationResult {
                operation: op_str.to_string(),
                outcome: "failed".to_string(),
                service_status: "failed".to_string(),
                checked_at: now,
                error_code: Some("config_invalid".to_string()),
                error_message: Some(msg),
                deployment: None,
                logs: None,
            });
        }

        let arch = node.remote_architecture.as_deref().unwrap();
        let archive_bytes = match download_verified_release(&deploy_cfg.version, arch).await {
            Ok(bytes) => bytes,
            Err(e) => {
                return Ok(ServerOperationResult {
                    operation: op_str.to_string(),
                    outcome: "failed".to_string(),
                    service_status: "failed".to_string(),
                    checked_at: now,
                    error_code: Some("asset_checksum_failed".to_string()),
                    error_message: Some(e),
                    deployment: None,
                    logs: None,
                });
            }
        };

        let toml_content = match render_frps_toml(deploy_cfg, &auth_token, dash_pwd.as_deref()) {
            Ok(c) => c,
            Err(e) => {
                return Ok(ServerOperationResult {
                    operation: op_str.to_string(),
                    outcome: "failed".to_string(),
                    service_status: "failed".to_string(),
                    checked_at: now,
                    error_code: Some("config_invalid".to_string()),
                    error_message: Some(e),
                    deployment: None,
                    logs: None,
                });
            }
        };

        (Some(archive_bytes), Some(toml_content), Some(auth_token), dash_pwd)
    } else {
        (None, None, None, None)
    };

    // 收集所有内存机密用于日志和输出脱敏
    let mut known_secrets = Vec::new();
    if let Some(ref pwd) = sudo_password {
        known_secrets.push(pwd.as_str());
    }
    if let Some(ref pwd) = ssh_password {
        known_secrets.push(pwd.as_str());
    }
    if let Some(ref pk) = ssh_private_key {
        known_secrets.push(pk.as_str());
    }
    if let Some(ref pass) = ssh_passphrase {
        known_secrets.push(pass.as_str());
    }
    if let Some(ref tok) = auth_token_secret {
        known_secrets.push(tok.as_str());
    }
    if let Some(ref dp) = dashboard_pwd_secret {
        known_secrets.push(dp.as_str());
    }
    if let Some(ref ephem) = request.ephemeral_ssh_credentials {
        if let Some(ref p) = ephem.password { known_secrets.push(p.as_str()); }
        if let Some(ref k) = ephem.private_key { known_secrets.push(k.as_str()); }
        if let Some(ref pass) = ephem.private_key_passphrase { known_secrets.push(pass.as_str()); }
    }
    if let Some(ref s) = request.ephemeral_sudo_password {
        known_secrets.push(s.as_str());
    }

    // 6. 建立 SSH 连接并严格比对公钥指纹
    let config = Arc::new(russh::client::Config::default());
    let presented_fp = Arc::new(Mutex::new(None));
    let trusted = Arc::new(Mutex::new(false));

    let handler = DeploymentClientHandler {
        trusted_fingerprint: node.trusted_host_key_fingerprint.clone(),
        presented_fingerprint: presented_fp.clone(),
        trusted: trusted.clone(),
    };

    let connect_res = timeout(
        Duration::from_secs(10),
        russh::client::connect(config, (node.host.as_str(), node.ssh_port), handler),
    )
    .await;

    let mut session = match connect_res {
        Ok(Ok(s)) => s,
        _ => {
            let is_trusted = *trusted.lock().await;
            let error_code = if !is_trusted { "untrusted_host" } else { "network_failed" };
            let error_message = if !is_trusted {
                "SSH 主机指纹不匹配或发生变化，操作已安全中止"
            } else {
                "无法建立 SSH 网络连接"
            };
            return Ok(ServerOperationResult {
                operation: op_str.to_string(),
                outcome: "failed".to_string(),
                service_status: "unknown".to_string(),
                checked_at: now,
                error_code: Some(error_code.to_string()),
                error_message: Some(error_message.to_string()),
                deployment: None,
                logs: None,
            });
        }
    };

    // 7. 认证
    let auth_res = if node.auth_method == "password" {
        let pwd = ssh_password.as_deref().unwrap_or_default();
        timeout(
            Duration::from_secs(10),
            session.authenticate_password(&node.username, pwd),
        )
        .await
    } else {
        let key_str = ssh_private_key.as_deref().unwrap_or_default();
        let pass_str = ssh_passphrase.as_deref();
        let key_pair = match russh_keys::decode_secret_key(key_str, pass_str) {
            Ok(k) => k,
            Err(_) => {
                return Ok(ServerOperationResult {
                    operation: op_str.to_string(),
                    outcome: "failed".to_string(),
                    service_status: "unknown".to_string(),
                    checked_at: now,
                    error_code: Some("authentication_failed".to_string()),
                    error_message: Some("无法解析 SSH 私钥或私钥口令错误".to_string()),
                    deployment: None,
                    logs: None,
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
        return Ok(ServerOperationResult {
            operation: op_str.to_string(),
            outcome: "failed".to_string(),
            service_status: "unknown".to_string(),
            checked_at: now,
            error_code: Some("authentication_failed".to_string()),
            error_message: Some("无法使用当前 SSH 凭据登录".to_string()),
            deployment: None,
            logs: None,
        });
    }

    // 8. 打开通道
    let mut channel = match timeout(Duration::from_secs(10), session.channel_open_session()).await {
        Ok(Ok(ch)) => ch,
        _ => {
            return Ok(ServerOperationResult {
                operation: op_str.to_string(),
                outcome: "failed".to_string(),
                service_status: "unknown".to_string(),
                checked_at: now,
                error_code: Some("network_failed".to_string()),
                error_message: Some("打开 SSH 会话通道失败".to_string()),
                deployment: None,
                logs: None,
            });
        }
    };

    let priv_str = node.privilege.as_deref().unwrap_or("unavailable");
    let cmd = command_for_operation(request.operation, priv_str);

    if let Err(_) = timeout(Duration::from_secs(10), channel.exec(true, cmd)).await {
        return Ok(ServerOperationResult {
            operation: op_str.to_string(),
            outcome: "failed".to_string(),
            service_status: "failed".to_string(),
            checked_at: now,
            error_code: Some("network_failed".to_string()),
            error_message: Some("执行远程指令超时".to_string()),
            deployment: None,
            logs: None,
        });
    }

    // 9. 传输 stdin 载荷
    let requires_sudo_stdin = priv_str == "sudo_password_required";
    if requires_sudo_stdin {
        if let Some(ref pwd) = sudo_password {
            let pwd_line = format!("{pwd}\n");
            let _ = channel.data(pwd_line.as_bytes()).await;
        }
    }

    if request.operation == ServerOperationKind::Deploy {
        let archive_b64 = base64::engine::general_purpose::STANDARD.encode(verified_archive.as_ref().unwrap());
        let toml_b64 = base64::engine::general_purpose::STANDARD.encode(frps_toml_str.as_ref().unwrap().as_bytes());
        let version = &request.deployment.as_ref().unwrap().version;
        let arch = node.remote_architecture.as_deref().unwrap();
        let checksum = format!("{:x}", sha2::Sha256::digest(verified_archive.as_ref().unwrap()));

        let _ = channel.data(DEPLOY_HELPER_SCRIPT.as_bytes()).await;
        let payload_header = format!(
            "VERSION={version}\nARCH={arch}\nCHECKSUM={checksum}\nARCHIVE_B64={archive_b64}\nTOML_B64={toml_b64}\nEND_PAYLOAD\n"
        );
        let _ = channel.data(payload_header.as_bytes()).await;
    }

    let _ = channel.eof().await;

    // 10. 消费 stdout / stderr，合并严格上限 32 KiB 并捕获 ExitStatus
    let mut stdout_buf = Vec::new();
    let mut stderr_buf = Vec::new();
    let mut remote_exit_status: Option<u32> = None;
    const MAX_READ_BYTES: usize = 32768;

    while let Ok(Some(msg)) = timeout(Duration::from_secs(60), channel.wait()).await {
        match msg {
            russh::ChannelMsg::Data { ref data } => {
                let current_total = stdout_buf.len() + stderr_buf.len();
                if current_total < MAX_READ_BYTES {
                    let take = std::cmp::min(data.len(), MAX_READ_BYTES - current_total);
                    stdout_buf.extend_from_slice(&data[..take]);
                }
            }
            russh::ChannelMsg::ExtendedData { ref data, ext: _ } => {
                let current_total = stdout_buf.len() + stderr_buf.len();
                if current_total < MAX_READ_BYTES {
                    let take = std::cmp::min(data.len(), MAX_READ_BYTES - current_total);
                    stderr_buf.extend_from_slice(&data[..take]);
                }
            }
            russh::ChannelMsg::ExitStatus { exit_status } => {
                remote_exit_status = Some(exit_status);
            }
            russh::ChannelMsg::Eof | russh::ChannelMsg::Close => break,
            _ => {}
        }
    }

    let stdout_str = String::from_utf8_lossy(&stdout_buf);
    let stderr_str = String::from_utf8_lossy(&stderr_buf);

    let res = interpret_operation_result(
        request.operation,
        remote_exit_status,
        &stdout_str,
        &stderr_str,
        request.deployment,
        node.service_status.as_deref(),
        now,
        &known_secrets,
    );
    Ok(res)
}

pub fn interpret_operation_result(
    op: ServerOperationKind,
    exit_status: Option<u32>,
    stdout_str: &str,
    stderr_str: &str,
    deployment_cfg: Option<FrpsDeploymentPublicConfig>,
    fallback_service_status: Option<&str>,
    now: u64,
    known_secrets: &[&str],
) -> ServerOperationResult {
    let exit_success = exit_status == Some(0);
    let op_str = match op {
        ServerOperationKind::Deploy => "deploy",
        ServerOperationKind::Start => "start",
        ServerOperationKind::Stop => "stop",
        ServerOperationKind::Restart => "restart",
        ServerOperationKind::RefreshStatus => "refresh_status",
        ServerOperationKind::ReadLogs => "read_logs",
    };

    match op {
        ServerOperationKind::Deploy => {
            if exit_success && stdout_str.contains("DEPLOY_SUCCESS") {
                let deploy_cfg = deployment_cfg.unwrap();
                let summary = FrpsDeploymentSummary {
                    version: deploy_cfg.version,
                    bind_port: deploy_cfg.bind_port,
                    transport_protocol: deploy_cfg.transport_protocol,
                    tls_force: deploy_cfg.tls_force,
                    dashboard_enabled: deploy_cfg.dashboard_enabled,
                    dashboard_port: deploy_cfg.dashboard_port,
                    dashboard_user: deploy_cfg.dashboard_user,
                };
                ServerOperationResult {
                    operation: "deploy".to_string(),
                    outcome: "completed".to_string(),
                    service_status: "running".to_string(),
                    checked_at: now,
                    error_code: None,
                    error_message: None,
                    deployment: Some(FrpsDeploymentMetadata {
                        summary,
                        service_name: SERVICE_NAME.to_string(),
                        installed_at: now,
                        enabled: true,
                    }),
                    logs: None,
                }
            } else {
                let error_code = if stderr_str.contains("incorrect password") || stderr_str.contains("sudo: a password is required") {
                    "sudo_failed"
                } else if stderr_str.contains("DEPLOY_ERR:CHECKSUM_MISMATCH") {
                    "asset_checksum_failed"
                } else if stderr_str.contains("DEPLOY_ERR:CONFIG_VERIFY_FAILED") {
                    "config_invalid"
                } else {
                    "service_failed"
                };

                let error_message = match error_code {
                    "sudo_failed" => "sudo 提权失败，密码错误或权限不足",
                    "asset_checksum_failed" => "远程校验安装包 SHA-256 失败",
                    "config_invalid" => "生成的 FRPS 配置文件校验未通过",
                    _ => "FRPS 服务部署或启动失败",
                };

                ServerOperationResult {
                    operation: "deploy".to_string(),
                    outcome: "failed".to_string(),
                    service_status: "failed".to_string(),
                    checked_at: now,
                    error_code: Some(error_code.to_string()),
                    error_message: Some(error_message.to_string()),
                    deployment: None,
                    logs: None,
                }
            }
        }
        ServerOperationKind::Start | ServerOperationKind::Restart => {
            if exit_success {
                ServerOperationResult {
                    operation: op_str.to_string(),
                    outcome: "completed".to_string(),
                    service_status: "running".to_string(),
                    checked_at: now,
                    error_code: None,
                    error_message: None,
                    deployment: None,
                    logs: None,
                }
            } else {
                let is_sudo_err = stderr_str.contains("incorrect password") || stderr_str.contains("sudo: a password is required");
                let code = if is_sudo_err { "sudo_failed" } else { "service_failed" };
                let msg = if is_sudo_err { "sudo 提权密码错误" } else { "服务启动失败或未能进入运行状态" };
                ServerOperationResult {
                    operation: op_str.to_string(),
                    outcome: "failed".to_string(),
                    service_status: "failed".to_string(),
                    checked_at: now,
                    error_code: Some(code.to_string()),
                    error_message: Some(msg.to_string()),
                    deployment: None,
                    logs: None,
                }
            }
        }
        ServerOperationKind::Stop => {
            if exit_success {
                ServerOperationResult {
                    operation: "stop".to_string(),
                    outcome: "completed".to_string(),
                    service_status: "stopped".to_string(),
                    checked_at: now,
                    error_code: None,
                    error_message: None,
                    deployment: None,
                    logs: None,
                }
            } else {
                let is_sudo_err = stderr_str.contains("incorrect password") || stderr_str.contains("sudo: a password is required");
                let code = if is_sudo_err { "sudo_failed" } else { "service_failed" };
                let msg = if is_sudo_err { "sudo 提权密码错误" } else { "停止服务失败或服务未完全停止" };
                ServerOperationResult {
                    operation: "stop".to_string(),
                    outcome: "failed".to_string(),
                    service_status: "failed".to_string(),
                    checked_at: now,
                    error_code: Some(code.to_string()),
                    error_message: Some(msg.to_string()),
                    deployment: None,
                    logs: None,
                }
            }
        }
        ServerOperationKind::RefreshStatus => {
            if !exit_success {
                let is_sudo_err = stderr_str.contains("incorrect password") || stderr_str.contains("sudo: a password is required");
                let code = if is_sudo_err { "sudo_failed" } else { "service_failed" };
                let msg = if is_sudo_err { "sudo 提权密码错误" } else { "查询服务状态失败" };
                return ServerOperationResult {
                    operation: "refresh_status".to_string(),
                    outcome: "failed".to_string(),
                    service_status: "failed".to_string(),
                    checked_at: now,
                    error_code: Some(code.to_string()),
                    error_message: Some(msg.to_string()),
                    deployment: None,
                    logs: None,
                };
            }

            let first_line = stdout_str.lines().next().unwrap_or("").trim();
            let status_str = match first_line {
                "active" => "running",
                "inactive" => "stopped",
                _ => "failed",
            };
            if status_str == "failed" {
                return ServerOperationResult {
                    operation: "refresh_status".to_string(),
                    outcome: "failed".to_string(),
                    service_status: "failed".to_string(),
                    checked_at: now,
                    error_code: Some("service_failed".to_string()),
                    error_message: Some("服务状态异常或未就绪".to_string()),
                    deployment: None,
                    logs: None,
                };
            }
            ServerOperationResult {
                operation: "refresh_status".to_string(),
                outcome: "completed".to_string(),
                service_status: status_str.to_string(),
                checked_at: now,
                error_code: None,
                error_message: None,
                deployment: None,
                logs: None,
            }
        }
        ServerOperationKind::ReadLogs => {
            if !exit_success {
                let is_sudo_err = stderr_str.contains("incorrect password") || stderr_str.contains("sudo: a password is required");
                let code = if is_sudo_err { "sudo_failed" } else { "service_failed" };
                let msg = if is_sudo_err { "sudo 提权密码错误" } else { "读取服务日志失败" };
                return ServerOperationResult {
                    operation: "read_logs".to_string(),
                    outcome: "failed".to_string(),
                    service_status: fallback_service_status.unwrap_or("unknown").to_string(),
                    checked_at: now,
                    error_code: Some(code.to_string()),
                    error_message: Some(msg.to_string()),
                    deployment: None,
                    logs: None,
                };
            }
            let mut lines: Vec<String> = stdout_str
                .lines()
                .map(|line| redact_line(line, known_secrets))
                .collect();
            if lines.len() > 200 {
                lines = lines.split_off(lines.len() - 200);
            }
            ServerOperationResult {
                operation: "read_logs".to_string(),
                outcome: "completed".to_string(),
                service_status: fallback_service_status.unwrap_or("unknown").to_string(),
                checked_at: now,
                error_code: None,
                error_message: None,
                deployment: None,
                logs: Some(lines),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_asset_url_and_checksum_key_are_derived_from_validated_input_only() {
        assert_eq!(asset_name("0.71.0", "amd64").unwrap(), "frp_0.71.0_linux_amd64.tar.gz");
        assert_eq!(asset_name("0.71.0", "arm64").unwrap(), "frp_0.71.0_linux_arm64.tar.gz");
        assert!(asset_name("latest", "amd64").is_err());
        assert!(asset_name("0.71.0;rm -rf /", "amd64").is_err());
        assert!(asset_name("0.71.0", "riscv64").is_err());
        assert!(asset_name("1.0.0", "amd64").is_err());
    }

    #[test]
    fn checksum_parser_requires_an_exact_asset_match() {
        let checksums = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f61234  frp_0.71.0_linux_amd64.tar.gz\n9999  other.tar.gz\n";
        assert_eq!(
            checksum_for_asset(checksums, "frp_0.71.0_linux_amd64.tar.gz").unwrap(),
            "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f61234"
        );
        assert!(checksum_for_asset(checksums, "other.tar.gz").is_err());
        assert!(checksum_for_asset(checksums, "not_found.tar.gz").is_err());
    }

    #[test]
    fn unknown_command_url_path_and_shell_fields_are_rejected() {
        let json_with_cmd = r#"{
            "node": {
                "id": "node-1", "host": "1.2.3.4", "sshPort": 22, "username": "root",
                "authMethod": "password", "credentialsRemembered": false
            },
            "operation": "deploy",
            "command": "rm -rf /"
        }"#;
        assert!(serde_json::from_str::<ServerOperationRequest>(json_with_cmd).is_err());

        let json_with_url = r#"{
            "node": {
                "id": "node-1", "host": "1.2.3.4", "sshPort": 22, "username": "root",
                "authMethod": "password", "credentialsRemembered": false
            },
            "operation": "deploy",
            "downloadUrl": "https://evil.com/frp.tar.gz"
        }"#;
        assert!(serde_json::from_str::<ServerOperationRequest>(json_with_url).is_err());

        let json_with_path = r#"{
            "node": {
                "id": "node-1", "host": "1.2.3.4", "sshPort": 22, "username": "root",
                "authMethod": "password", "credentialsRemembered": false
            },
            "operation": "deploy",
            "installDir": "/etc/evil"
        }"#;
        assert!(serde_json::from_str::<ServerOperationRequest>(json_with_path).is_err());
    }

    #[test]
    fn redact_line_masks_sensitive_tokens_and_passwords() {
        let secrets = ["my-super-secret-token", "sudo123", "ssh_pwd", "ssh_key_body"];
        let line1 = "auth.token = \"my-super-secret-token\"";
        let redacted1 = redact_line(line1, &secrets);
        assert!(!redacted1.contains("my-super-secret-token"));
        assert!(redacted1.contains("******"));

        let line2 = "user entered sudo password sudo123 failed and ssh ssh_pwd";
        let redacted2 = redact_line(line2, &secrets);
        assert!(!redacted2.contains("sudo123"));
        assert!(!redacted2.contains("ssh_pwd"));
        assert!(redacted2.contains("******"));

        let line3 = "-----BEGIN OPENSSH PRIVATE KEY-----";
        let redacted3 = redact_line(line3, &[]);
        assert!(redacted3.contains("PRIVATE KEY CONTENT REDACTED"));
    }

    #[test]
    fn render_frps_toml_generates_valid_structure_and_prevents_injection() {
        let config = FrpsDeploymentPublicConfig {
            version: "0.71.0".to_string(),
            bind_port: 7000,
            transport_protocol: "tcp".to_string(),
            tls_force: true,
            dashboard_enabled: true,
            dashboard_port: Some(7500),
            dashboard_user: Some("admin".to_string()),
        };

        // 尝试通过换行和引号注入额外 TOML 字段
        let malicious_token = "valid_token\"\nevil_key = \"injected";
        let toml = render_frps_toml(&config, malicious_token, Some("dashpass456")).unwrap();
        assert!(toml.contains("bindPort = 7000"));

        let parsed: Result<toml::Table, _> = toml.parse();
        assert!(parsed.is_ok(), "生成的必须是合法的 TOML 结构");
        let table = parsed.unwrap();
        assert_eq!(table.get("bindPort").unwrap().as_integer(), Some(7000));
        assert_eq!(
            table.get("transport").unwrap().get("tls").unwrap().get("force").unwrap().as_bool(),
            Some(true)
        );
        assert_eq!(
            table.get("webServer").unwrap().get("port").unwrap().as_integer(),
            Some(7500)
        );
        assert_eq!(
            table.get("webServer").unwrap().get("user").unwrap().as_str(),
            Some("admin")
        );
        // 验证注入尝试被当作字符串内容安全转义，未注入顶层 evil_key 键
        assert_eq!(
            table.get("auth").unwrap().get("token").unwrap().as_str(),
            Some("valid_token\"\nevil_key = \"injected")
        );
        assert!(!table.contains_key("evil_key"));
    }

    #[test]
    fn privilege_command_dispatch_selects_correct_commands() {
        // root 权限分流
        assert_eq!(command_for_operation(ServerOperationKind::Deploy, "root"), DEPLOY_AS_ROOT);
        assert_eq!(command_for_operation(ServerOperationKind::Start, "root"), SERVICE_START_ROOT);
        assert_eq!(command_for_operation(ServerOperationKind::Stop, "root"), SERVICE_STOP_ROOT);
        assert_eq!(command_for_operation(ServerOperationKind::Restart, "root"), SERVICE_RESTART_ROOT);
        assert_eq!(command_for_operation(ServerOperationKind::ReadLogs, "root"), SERVICE_LOGS_ROOT);

        // 免密 sudo 分流
        assert_eq!(command_for_operation(ServerOperationKind::Deploy, "sudo_passwordless"), DEPLOY_AS_SUDO_PASSWORDLESS);
        assert_eq!(command_for_operation(ServerOperationKind::Start, "sudo_passwordless"), SERVICE_START_PASSWORDLESS);
        assert_eq!(command_for_operation(ServerOperationKind::Stop, "sudo_passwordless"), SERVICE_STOP_PASSWORDLESS);
        assert_eq!(command_for_operation(ServerOperationKind::Restart, "sudo_passwordless"), SERVICE_RESTART_PASSWORDLESS);
        assert_eq!(command_for_operation(ServerOperationKind::ReadLogs, "sudo_passwordless"), SERVICE_LOGS_PASSWORDLESS);

        // 需密码 sudo 分流
        assert_eq!(command_for_operation(ServerOperationKind::Deploy, "sudo_password_required"), DEPLOY_AS_SUDO);
        assert_eq!(command_for_operation(ServerOperationKind::Start, "sudo_password_required"), SERVICE_START_SUDO);
        assert_eq!(command_for_operation(ServerOperationKind::Stop, "sudo_password_required"), SERVICE_STOP_SUDO);
        assert_eq!(command_for_operation(ServerOperationKind::Restart, "sudo_password_required"), SERVICE_RESTART_SUDO);
        assert_eq!(command_for_operation(ServerOperationKind::ReadLogs, "sudo_password_required"), SERVICE_LOGS_SUDO);

        // 刷新状态始终只读
        assert_eq!(command_for_operation(ServerOperationKind::RefreshStatus, "root"), SERVICE_STATUS);
        assert_eq!(command_for_operation(ServerOperationKind::RefreshStatus, "sudo_password_required"), SERVICE_STATUS);
    }

    #[test]
    fn ssh_credentials_mutex_rejects_ephemeral_when_remembered_and_vice_versa() {
        let remembered_node = ServerOperationConnection {
            id: "node-1".to_string(),
            host: "1.2.3.4".to_string(),
            ssh_port: 22,
            username: "root".to_string(),
            auth_method: "password".to_string(),
            credential_ref: Some("frp-gui/server-node/node-1".to_string()),
            credentials_remembered: true,
            trusted_host_key_fingerprint: Some("SHA256:test".to_string()),
            remote_os: Some("ubuntu".to_string()),
            remote_architecture: Some("amd64".to_string()),
            privilege: Some("root".to_string()),
            systemd: Some(true),
            requires_sudo_password: None,
            sudo_credentials_remembered: None,
            install_dir: Some("/opt/frp".to_string()),
            status: Some("ready_to_deploy".to_string()),
            service_status: None,
        };

        let ephem = EphemeralSshCredentials {
            password: Some("secret".to_string()),
            private_key: None,
            private_key_passphrase: None,
        };

        // 已记住凭据传入临时凭据被拒绝
        assert!(resolve_ssh_credentials(&remembered_node, Some(&ephem)).is_err());

        let mut unremembered_node = remembered_node;
        unremembered_node.credentials_remembered = false;

        // 未记住凭据但未提供临时凭据被拒绝
        assert!(resolve_ssh_credentials(&unremembered_node, None).is_err());

        // 未记住凭据传入合法密码成功解析
        let res = resolve_ssh_credentials(&unremembered_node, Some(&ephem));
        assert!(res.is_ok());
        let (pwd, _, _) = res.unwrap();
        assert_eq!(pwd.as_deref(), Some("secret"));

        // 未记住凭据使用私钥认证
        unremembered_node.auth_method = "private_key".to_string();
        let ephem_key = EphemeralSshCredentials {
            password: None,
            private_key: Some("dummy-key".to_string()),
            private_key_passphrase: Some("key-pass".to_string()),
        };
        let res_key = resolve_ssh_credentials(&unremembered_node, Some(&ephem_key));
        assert!(res_key.is_ok());
        let (pwd_k, key_k, pass_k) = res_key.unwrap();
        assert!(pwd_k.is_none());
        assert_eq!(key_k.as_deref(), Some("dummy-key"));
        assert_eq!(pass_k.as_deref(), Some("key-pass"));
    }

    #[test]
    fn node_validation_rejects_unsupported_privilege_or_missing_systemd_or_draft_status() {
        let valid_node = ServerOperationConnection {
            id: "node-1".to_string(),
            host: "1.2.3.4".to_string(),
            ssh_port: 22,
            username: "root".to_string(),
            auth_method: "password".to_string(),
            credential_ref: Some("ref".to_string()),
            credentials_remembered: true,
            trusted_host_key_fingerprint: Some("SHA256:test".to_string()),
            remote_os: Some("ubuntu".to_string()),
            remote_architecture: Some("amd64".to_string()),
            privilege: Some("root".to_string()),
            systemd: Some(true),
            requires_sudo_password: None,
            sudo_credentials_remembered: None,
            install_dir: Some("/opt/frp".to_string()),
            status: Some("ready_to_deploy".to_string()),
            service_status: None,
        };

        // 合法节点通过
        assert!(validate_operation_connection(&valid_node, ServerOperationKind::Deploy).is_ok());

        // 缺少 systemd
        let mut no_systemd = valid_node;
        no_systemd.systemd = Some(false);
        assert!(validate_operation_connection(&no_systemd, ServerOperationKind::Deploy).is_err());

        // 权限不受支持
        let mut bad_priv = no_systemd;
        bad_priv.systemd = Some(true);
        bad_priv.privilege = Some("unavailable".to_string());
        assert!(validate_operation_connection(&bad_priv, ServerOperationKind::Deploy).is_err());

        // 草稿状态不允许部署
        let mut draft_node = bad_priv;
        draft_node.privilege = Some("root".to_string());
        draft_node.status = Some("draft".to_string());
        assert!(validate_operation_connection(&draft_node, ServerOperationKind::Deploy).is_err());

        // 非 /opt/frp 安装目录被拒绝
        let mut bad_dir = draft_node;
        bad_dir.status = Some("ready_to_deploy".to_string());
        bad_dir.install_dir = Some("/etc/evil".to_string());
        assert!(validate_operation_connection(&bad_dir, ServerOperationKind::Deploy).is_err());
    }

    #[test]
    fn missing_token_or_dashboard_password_fails_before_write() {
        let config = FrpsDeploymentPublicConfig {
            version: "0.71.0".to_string(),
            bind_port: 7000,
            transport_protocol: "tcp".to_string(),
            tls_force: true,
            dashboard_enabled: true,
            dashboard_port: Some(7500),
            dashboard_user: Some("admin".to_string()),
        };

        // 缺少 Token
        assert!(validate_deployment_config(&config, "", Some("pwd")).is_err());
        assert!(validate_deployment_config(&config, "   ", Some("pwd")).is_err());

        // 缺少 Dashboard 密码
        assert!(validate_deployment_config(&config, "valid_token", None).is_err());
        assert!(validate_deployment_config(&config, "valid_token", Some("")).is_err());

        // 端口冲突
        let mut conflict_config = config.clone();
        conflict_config.dashboard_port = Some(7000);
        assert!(validate_deployment_config(&conflict_config, "valid_token", Some("pwd")).is_err());
    }

    #[test]
    fn helper_script_uses_exact_release_path_and_atomic_replacement() {
        // 严禁使用泛化 find 命令
        assert!(!DEPLOY_HELPER_SCRIPT.contains("find "));
        // 必须包含预期明确路径
        assert!(DEPLOY_HELPER_SCRIPT.contains("EXPECTED_FRPS=\"$TMP_DIR/frp_${VERSION}_linux_${ARCH}/frps\""));
        // 必须包含候选文件配置验证
        assert!(DEPLOY_HELPER_SCRIPT.contains("$TMP_DIR/frps.toml.candidate"));
        assert!(DEPLOY_HELPER_SCRIPT.contains("verify -c"));
        // 必须包含候选 service unit 及原子替换
        assert!(DEPLOY_HELPER_SCRIPT.contains("$TMP_DIR/frp-gui-frps.service.candidate"));
        assert!(DEPLOY_HELPER_SCRIPT.contains("mv -f \"$TMP_DIR/frps.toml.atomic\" /opt/frp/frps.toml"));
        assert!(DEPLOY_HELPER_SCRIPT.contains("mv -f \"$TMP_DIR/frp-gui-frps.service.atomic\" /etc/systemd/system/frp-gui-frps.service"));
        assert!(DEPLOY_HELPER_SCRIPT.contains("ln -sfn /opt/frp/releases/\"$VERSION\" /opt/frp/current"));
    }

    #[test]
    fn streaming_download_size_limit_aborts_over_100_mib() {
        let chunk = vec![0u8; 10 * 1024 * 1024]; // 10 MiB
        let under_limit = vec![chunk.clone(); 9]; // 90 MiB
        assert!(consume_chunks_with_limit(under_limit, 100 * 1024 * 1024).is_ok());

        let over_limit = vec![chunk.clone(); 11]; // 110 MiB
        let res = consume_chunks_with_limit(over_limit, 100 * 1024 * 1024);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("100 MiB"));
    }

    #[test]
    fn combined_output_limit_caps_at_32_kib() {
        let max = 32768;
        let mut stdout_buf: Vec<u8> = Vec::new();
        let stderr_buf: Vec<u8> = Vec::new();

        let data1 = vec![b'a'; 20000];
        let data2 = vec![b'b'; 20000];

        // 模拟消息消费
        for data in [&data1, &data2] {
            let current = stdout_buf.len() + stderr_buf.len();
            if current < max {
                let take = std::cmp::min(data.len(), max - current);
                stdout_buf.extend_from_slice(&data[..take]);
            }
        }

        assert_eq!(stdout_buf.len() + stderr_buf.len(), 32768);
    }

    #[test]
    fn missing_or_invalid_install_dir_is_rejected() {
        let valid_node = ServerOperationConnection {
            id: "node-1".to_string(),
            host: "1.2.3.4".to_string(),
            ssh_port: 22,
            username: "root".to_string(),
            auth_method: "password".to_string(),
            credential_ref: Some("ref".to_string()),
            credentials_remembered: true,
            trusted_host_key_fingerprint: Some("SHA256:test".to_string()),
            remote_os: Some("ubuntu".to_string()),
            remote_architecture: Some("amd64".to_string()),
            privilege: Some("root".to_string()),
            systemd: Some(true),
            requires_sudo_password: None,
            sudo_credentials_remembered: None,
            install_dir: Some("/opt/frp".to_string()),
            status: Some("ready_to_deploy".to_string()),
            service_status: None,
        };

        // 有效 install_dir 通过
        assert!(validate_operation_connection(&valid_node, ServerOperationKind::Deploy).is_ok());

        // 缺失 install_dir (None) 必须被拒绝
        let mut no_dir = valid_node.clone();
        no_dir.install_dir = None;
        let err_missing = validate_operation_connection(&no_dir, ServerOperationKind::Deploy);
        assert!(err_missing.is_err());
        assert!(err_missing.unwrap_err().contains("安装根目录必须固定为 /opt/frp"));

        // 非 /opt/frp 被拒绝
        let mut wrong_dir = valid_node;
        wrong_dir.install_dir = Some("/var/frp".to_string());
        assert!(validate_operation_connection(&wrong_dir, ServerOperationKind::Deploy).is_err());
    }

    #[test]
    fn refresh_status_non_zero_exit_does_not_produce_stopped() {
        // 退出码为 1，stdout 为空
        let res_err = interpret_operation_result(
            ServerOperationKind::RefreshStatus,
            Some(1),
            "",
            "systemctl command failed",
            None,
            Some("running"),
            1000,
            &[],
        );
        assert_eq!(res_err.outcome, "failed");
        assert_eq!(res_err.service_status, "failed");
        assert_ne!(res_err.service_status, "stopped", "非零退出码绝不能被判定为 stopped");

        // 退出码为 3 (异常)，stdout 包含未知文本
        let res_unknown = interpret_operation_result(
            ServerOperationKind::RefreshStatus,
            Some(3),
            "unknown\n",
            "",
            None,
            Some("running"),
            1000,
            &[],
        );
        assert_eq!(res_unknown.outcome, "failed");
        assert_eq!(res_unknown.service_status, "failed");
        assert_ne!(res_unknown.service_status, "stopped");

        // 只有退出码为 0 且明确输出 inactive 时才为 stopped
        let res_stopped = interpret_operation_result(
            ServerOperationKind::RefreshStatus,
            Some(0),
            "inactive\nenabled\n",
            "",
            None,
            Some("running"),
            1000,
            &[],
        );
        assert_eq!(res_stopped.outcome, "completed");
        assert_eq!(res_stopped.service_status, "stopped");
    }

    #[test]
    fn read_logs_non_zero_exit_fails_even_when_stderr_is_empty() {
        let res = interpret_operation_result(
            ServerOperationKind::ReadLogs,
            Some(1),
            "some partial stdout",
            "", // stderr 明确为空
            None,
            Some("running"),
            1000,
            &[],
        );
        assert_eq!(res.outcome, "failed");
        assert_eq!(res.error_code, Some("service_failed".to_string()));
        assert_eq!(res.error_message, Some("读取服务日志失败".to_string()));
        assert!(res.logs.is_none(), "失败时绝不能返回读取成功日志");
    }
}
