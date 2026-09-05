use serde::Deserialize;

const CREDENTIAL_PREFIX: &str = "frp-gui/server-node/";

#[derive(Clone, Copy, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CredentialKind {
    Password,
    PrivateKey,
    PrivateKeyPassphrase,
    SudoPassword,
    FrpToken,
    DashboardPassword,
}

pub fn is_valid_credential_reference(reference: &str) -> bool {
    if let Some(node_id) = reference.strip_prefix(CREDENTIAL_PREFIX) {
        if node_id.is_empty() {
            return false;
        }
        !node_id.chars().any(|c| c == '/' || c.is_control() || c.is_whitespace())
    } else {
        false
    }
}

pub fn credential_username(reference: &str, kind: CredentialKind) -> String {
    let suffix = match kind {
        CredentialKind::Password => "password",
        CredentialKind::PrivateKey => "private-key",
        CredentialKind::PrivateKeyPassphrase => "private-key-passphrase",
        CredentialKind::SudoPassword => "sudo-password",
        CredentialKind::FrpToken => "frp-token",
        CredentialKind::DashboardPassword => "dashboard-password",
    };
    format!("{reference}/{suffix}")
}

fn entry(reference: &str, kind: CredentialKind) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.frpgui.pro.server-node", &credential_username(reference, kind))
        .map_err(|error| format!("无法访问系统安全凭据库: {error}"))
}

#[tauri::command]
pub fn store_server_credential(reference: String, kind: CredentialKind, secret: String) -> Result<(), String> {
    if !is_valid_credential_reference(&reference) || secret.trim().is_empty() {
        return Err("凭据引用或内容无效".to_string());
    }
    entry(&reference, kind)?
        .set_password(&secret)
        .map_err(|error| format!("保存系统安全凭据失败: {error}"))
}

#[tauri::command]
pub fn delete_server_credentials(reference: String) -> Result<(), String> {
    if !is_valid_credential_reference(&reference) {
        return Err("凭据引用无效".to_string());
    }
    for kind in [
        CredentialKind::Password,
        CredentialKind::PrivateKey,
        CredentialKind::PrivateKeyPassphrase,
        CredentialKind::SudoPassword,
        CredentialKind::FrpToken,
        CredentialKind::DashboardPassword,
    ] {
        match entry(&reference, kind)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(format!("删除系统安全凭据失败: {error}")),
        }
    }
    Ok(())
}

#[derive(Default)]
#[allow(dead_code)]
pub(crate) struct ResolvedServerCredentials {
    pub password: Option<String>,
    pub private_key: Option<String>,
    pub private_key_passphrase: Option<String>,
    pub sudo_password: Option<String>,
    pub frp_token: Option<String>,
    pub dashboard_password: Option<String>,
}

pub(crate) fn load_server_credentials(reference: &str, auth_method: &str) -> Result<ResolvedServerCredentials, String> {
    if !is_valid_credential_reference(reference) {
        return Err("服务器节点凭据引用无效".to_string());
    }
    let mut credentials = ResolvedServerCredentials::default();
    let read_optional = |kind| match entry(reference, kind)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("无法访问系统安全凭据库".to_string()),
    };
    match auth_method {
        "password" => credentials.password = read_optional(CredentialKind::Password)?,
        "private_key" => {
            credentials.private_key = read_optional(CredentialKind::PrivateKey)?;
            credentials.private_key_passphrase = read_optional(CredentialKind::PrivateKeyPassphrase)?;
        }
        _ => return Err("不支持的 SSH 认证方式".to_string()),
    }
    Ok(credentials)
}

#[allow(dead_code)]
pub(crate) fn load_frps_deployment_credentials(reference: &str) -> Result<ResolvedServerCredentials, String> {
    if !is_valid_credential_reference(reference) {
        return Err("服务器节点凭据引用无效".to_string());
    }
    let mut credentials = ResolvedServerCredentials::default();
    let read_optional = |kind| match entry(reference, kind)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("无法访问系统安全凭据库".to_string()),
    };
    credentials.sudo_password = read_optional(CredentialKind::SudoPassword)?;
    credentials.frp_token = read_optional(CredentialKind::FrpToken)?;
    credentials.dashboard_password = read_optional(CredentialKind::DashboardPassword)?;
    Ok(credentials)
}

#[cfg(test)]
mod tests {
    use super::{credential_username, is_valid_credential_reference, CredentialKind};

    #[test]
    fn credential_username_is_scoped_by_node_and_kind() {
        assert_eq!(
            credential_username("frp-gui/server-node/node-1", CredentialKind::Password),
            "frp-gui/server-node/node-1/password"
        );
        assert_eq!(
            credential_username("frp-gui/server-node/node-1", CredentialKind::PrivateKey),
            "frp-gui/server-node/node-1/private-key"
        );
        assert_eq!(
            credential_username("frp-gui/server-node/node-1", CredentialKind::PrivateKeyPassphrase),
            "frp-gui/server-node/node-1/private-key-passphrase"
        );
        assert_eq!(
            credential_username("frp-gui/server-node/node-1", CredentialKind::SudoPassword),
            "frp-gui/server-node/node-1/sudo-password"
        );
        assert_eq!(
            credential_username("frp-gui/server-node/node-1", CredentialKind::FrpToken),
            "frp-gui/server-node/node-1/frp-token"
        );
        assert_eq!(
            credential_username("frp-gui/server-node/node-1", CredentialKind::DashboardPassword),
            "frp-gui/server-node/node-1/dashboard-password"
        );
    }

    #[test]
    fn test_is_valid_credential_reference_accepts_valid() {
        assert!(is_valid_credential_reference("frp-gui/server-node/node_tokyo"));
        assert!(is_valid_credential_reference("frp-gui/server-node/node-1"));
        assert!(is_valid_credential_reference("frp-gui/server-node/123456"));
    }

    #[test]
    fn test_is_valid_credential_reference_rejects_invalid() {
        // 空 ID 或缺少节点 ID
        assert!(!is_valid_credential_reference(""));
        assert!(!is_valid_credential_reference("frp-gui/server-node/"));
        assert!(!is_valid_credential_reference("frp-gui/server-node"));

        // 错误前缀
        assert!(!is_valid_credential_reference("frp-gui/client-node/node-1"));
        assert!(!is_valid_credential_reference("custom-prefix/frp-gui/server-node/node-1"));
        assert!(!is_valid_credential_reference("server-node/node-1"));

        // 嵌套路径与斜杠
        assert!(!is_valid_credential_reference("frp-gui/server-node/node/nested"));
        assert!(!is_valid_credential_reference("frp-gui/server-node/node-1/password"));

        // 控制字符与空白字符
        assert!(!is_valid_credential_reference("frp-gui/server-node/node\n1"));
        assert!(!is_valid_credential_reference("frp-gui/server-node/node\r1"));
        assert!(!is_valid_credential_reference("frp-gui/server-node/node\t1"));
        assert!(!is_valid_credential_reference("frp-gui/server-node/node 1"));
    }
}
