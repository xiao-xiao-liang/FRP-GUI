use aes_gcm::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::sync::{LazyLock, Mutex};

const CREDENTIAL_PREFIX: &str = "frp-gui/server-node/";
const PROFILE_CREDENTIAL_PREFIX: &str = "frp-gui/profile/";

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

pub fn is_valid_profile_credential_reference(reference: &str) -> bool {
    if let Some(profile_id) = reference.strip_prefix(PROFILE_CREDENTIAL_PREFIX) {
        !profile_id.is_empty()
            && !profile_id
                .chars()
                .any(|c| c == '/' || c.is_control() || c.is_whitespace())
    } else {
        false
    }
}

// ---------------------------------------------------------------------------
// 自包含便携加密凭据保险箱（存储在 <app_root>/data/secrets/vault.enc）
// ---------------------------------------------------------------------------

static VAULT_CACHE: LazyLock<Mutex<Option<HashMap<String, String>>>> =
    LazyLock::new(|| Mutex::new(None));

fn get_or_create_key() -> Result<[u8; 32], String> {
    let secrets_dir = crate::app_paths::get_secrets_dir();
    fs::create_dir_all(&secrets_dir)
        .map_err(|e| format!("创建凭据存储目录失败: {e}"))?;

    let key_file = secrets_dir.join("vault.key");
    if key_file.exists() {
        let content = fs::read(&key_file).map_err(|e| format!("读取凭据密钥失败: {e}"))?;
        if content.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&content);
            return Ok(key);
        }
    }

    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    fs::write(&key_file, key).map_err(|e| format!("保存凭据密钥失败: {e}"))?;
    Ok(key)
}

fn load_vault_from_disk() -> Result<HashMap<String, String>, String> {
    let secrets_dir = crate::app_paths::get_secrets_dir();
    let vault_file = secrets_dir.join("vault.enc");

    if !vault_file.exists() {
        return Ok(HashMap::new());
    }

    let encrypted_data = fs::read(&vault_file).map_err(|e| format!("读取凭据保险箱失败: {e}"))?;
    if encrypted_data.len() < 12 {
        return Ok(HashMap::new());
    }

    let key_bytes = get_or_create_key()?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));

    let (nonce_bytes, ciphertext) = encrypted_data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let decrypted = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("解密凭据保险箱失败: {e}"))?;

    let map = serde_json::from_slice::<HashMap<String, String>>(&decrypted)
        .map_err(|e| format!("解析凭据数据失败: {e}"))?;

    Ok(map)
}

fn save_vault_to_disk(map: &HashMap<String, String>) -> Result<(), String> {
    let secrets_dir = crate::app_paths::get_secrets_dir();
    fs::create_dir_all(&secrets_dir)
        .map_err(|e| format!("创建凭据存储目录失败: {e}"))?;

    let key_bytes = get_or_create_key()?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let serialized = serde_json::to_vec(map).map_err(|e| format!("序列化凭据失败: {e}"))?;
    let ciphertext = cipher
        .encrypt(nonce, serialized.as_ref())
        .map_err(|e| format!("加密凭据失败: {e}"))?;

    let mut file_data = Vec::with_capacity(12 + ciphertext.len());
    file_data.extend_from_slice(&nonce_bytes);
    file_data.extend_from_slice(&ciphertext);

    let vault_file = secrets_dir.join("vault.enc");
    let temp_file = secrets_dir.join("vault.enc.tmp");

    fs::write(&temp_file, &file_data).map_err(|e| format!("写入凭据临时文件失败: {e}"))?;
    if let Err(_) = fs::rename(&temp_file, &vault_file) {
        let _ = fs::remove_file(&vault_file);
        if let Err(_) = fs::rename(&temp_file, &vault_file) {
            fs::write(&vault_file, &file_data).map_err(|e| format!("提交凭据保险箱失败: {e}"))?;
            let _ = fs::remove_file(&temp_file);
        }
    }

    Ok(())
}

fn with_vault<R, F: FnOnce(&mut HashMap<String, String>) -> Result<R, String>>(
    f: F,
) -> Result<R, String> {
    let mut lock = VAULT_CACHE
        .lock()
        .map_err(|_| "获取凭据保险箱锁失败".to_string())?;

    if lock.is_none() {
        let loaded = load_vault_from_disk()?;
        *lock = Some(loaded);
    }

    let map = lock.as_mut().expect("保险箱已初始化");
    f(map)
}

// ---------------------------------------------------------------------------
// 旧版系统凭据管理器平滑回退与迁移
// ---------------------------------------------------------------------------

fn legacy_profile_entry(reference: &str) -> Option<keyring::Entry> {
    keyring::Entry::new("com.frpgui.pro.profile", reference).ok()
}

fn legacy_server_entry(reference: &str, kind: CredentialKind) -> Option<keyring::Entry> {
    keyring::Entry::new(
        "com.frpgui.pro.server-node",
        &credential_username(reference, kind),
    )
    .ok()
}

// ---------------------------------------------------------------------------
// 公共 IPC 接口实现（对前端完全兼容无感）
// ---------------------------------------------------------------------------

/// 将完整 Profile 配置保存到自包含加密凭据库
#[tauri::command]
pub fn store_profile_secret(reference: String, secret: String) -> Result<(), String> {
    if !is_valid_profile_credential_reference(&reference) || secret.trim().is_empty() {
        return Err("方案凭据引用或内容无效".to_string());
    }

    let key = format!("profile:{reference}");
    with_vault(|map| {
        map.insert(key, secret);
        save_vault_to_disk(map)
    })
}

/// 恢复已保存的方案配置；支持从旧系统凭据管理器静默迁移
#[tauri::command]
pub fn load_profile_secret(reference: String) -> Result<Option<String>, String> {
    if !is_valid_profile_credential_reference(&reference) {
        return Err("方案凭据引用无效".to_string());
    }

    let key = format!("profile:{reference}");

    // 1. 优先从自包含凭据保险箱读取
    let from_vault = with_vault(|map| Ok(map.get(&key).cloned()))?;
    if from_vault.is_some() {
        return Ok(from_vault);
    }

    // 2. 检查旧系统凭据管理器中是否有历史数据
    if let Some(entry) = legacy_profile_entry(&reference) {
        if let Ok(legacy_secret) = entry.get_password() {
            // 自动迁移入自包含保险箱并清理旧凭据
            let _ = store_profile_secret(reference, legacy_secret.clone());
            let _ = entry.delete_credential();
            return Ok(Some(legacy_secret));
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn delete_profile_secret(reference: String) -> Result<(), String> {
    if !is_valid_profile_credential_reference(&reference) {
        return Err("方案凭据引用无效".to_string());
    }

    let key = format!("profile:{reference}");
    with_vault(|map| {
        map.remove(&key);
        save_vault_to_disk(map)
    })?;

    if let Some(entry) = legacy_profile_entry(&reference) {
        let _ = entry.delete_credential();
    }

    Ok(())
}

#[tauri::command]
pub fn store_server_credential(
    reference: String,
    kind: CredentialKind,
    secret: String,
) -> Result<(), String> {
    if !is_valid_credential_reference(&reference) || secret.trim().is_empty() {
        return Err("凭据引用或内容无效".to_string());
    }

    let key = format!(
        "server-node:{}",
        credential_username(&reference, kind)
    );
    with_vault(|map| {
        map.insert(key, secret);
        save_vault_to_disk(map)
    })
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
        let key = format!(
            "server-node:{}",
            credential_username(&reference, kind)
        );
        let _ = with_vault(|map| {
            map.remove(&key);
            save_vault_to_disk(map)
        });

        if let Some(entry) = legacy_server_entry(&reference, kind) {
            let _ = entry.delete_credential();
        }
    }

    Ok(())
}

fn load_server_single_credential(reference: &str, kind: CredentialKind) -> Option<String> {
    let key = format!("server-node:{}", credential_username(reference, kind));
    if let Ok(Some(val)) = with_vault(|map| Ok(map.get(&key).cloned())) {
        return Some(val);
    }

    // 旧版回退迁移
    if let Some(entry) = legacy_server_entry(reference, kind) {
        if let Ok(val) = entry.get_password() {
            let _ = store_server_credential(reference.to_string(), kind, val.clone());
            let _ = entry.delete_credential();
            return Some(val);
        }
    }

    None
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

pub(crate) fn load_server_credentials(
    reference: &str,
    auth_method: &str,
) -> Result<ResolvedServerCredentials, String> {
    if !is_valid_credential_reference(reference) {
        return Err("服务器节点凭据引用无效".to_string());
    }

    let mut credentials = ResolvedServerCredentials::default();
    match auth_method {
        "password" => {
            credentials.password = load_server_single_credential(reference, CredentialKind::Password);
        }
        "private_key" => {
            credentials.private_key = load_server_single_credential(reference, CredentialKind::PrivateKey);
            credentials.private_key_passphrase =
                load_server_single_credential(reference, CredentialKind::PrivateKeyPassphrase);
        }
        _ => return Err("不支持的 SSH 认证方式".to_string()),
    }

    Ok(credentials)
}

#[allow(dead_code)]
pub(crate) fn load_frps_deployment_credentials(
    reference: &str,
) -> Result<ResolvedServerCredentials, String> {
    if !is_valid_credential_reference(reference) {
        return Err("服务器节点凭据引用无效".to_string());
    }

    let mut credentials = ResolvedServerCredentials::default();
    credentials.sudo_password = load_server_single_credential(reference, CredentialKind::SudoPassword);
    credentials.frp_token = load_server_single_credential(reference, CredentialKind::FrpToken);
    credentials.dashboard_password =
        load_server_single_credential(reference, CredentialKind::DashboardPassword);

    Ok(credentials)
}

#[cfg(test)]
mod tests {
    use super::*;

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
    }

    #[test]
    fn test_is_valid_credential_reference_accepts_valid() {
        assert!(is_valid_credential_reference("frp-gui/server-node/node_tokyo"));
        assert!(is_valid_credential_reference("frp-gui/server-node/node-1"));
    }

    #[test]
    fn test_is_valid_credential_reference_rejects_invalid() {
        assert!(!is_valid_credential_reference(""));
        assert!(!is_valid_credential_reference("frp-gui/server-node/"));
        assert!(!is_valid_credential_reference("frp-gui/server-node"));
    }

    #[test]
    fn profile_credential_reference_is_scoped_and_rejects_paths() {
        assert!(is_valid_profile_credential_reference("frp-gui/profile/profile-1"));
        assert!(!is_valid_profile_credential_reference("frp-gui/profile/"));
    }

    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    #[test]
    fn test_store_and_load_profile_secret() {
        let _guard = match TEST_MUTEX.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        let temp = std::env::temp_dir().join(format!("frp_gui_test_vault_{}", std::process::id()));
        std::env::set_var(crate::app_paths::PORTABLE_DATA_ENV, temp.to_str().unwrap());

        // 重置内存缓存
        if let Ok(mut lock) = VAULT_CACHE.lock() {
            *lock = None;
        }

        let reference = "frp-gui/profile/test_profile_id_123".to_string();
        let secret = r#"{"rawToml":"auth.token = \"test1234\"","config":{"authToken":"test1234"}}"#.to_string();

        let res = store_profile_secret(reference.clone(), secret.clone());
        assert!(res.is_ok(), "store_profile_secret failed: {:?}", res);

        let loaded = load_profile_secret(reference.clone());
        assert_eq!(loaded.unwrap(), Some(secret));

        let _ = delete_profile_secret(reference.clone());
        let deleted = load_profile_secret(reference);
        assert_eq!(deleted.unwrap(), None);

        // 清理测试目录
        let _ = fs::remove_dir_all(&temp);
        std::env::remove_var(crate::app_paths::PORTABLE_DATA_ENV);
    }

    #[test]
    fn test_store_and_load_server_credentials() {
        let _guard = match TEST_MUTEX.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        let temp = std::env::temp_dir().join(format!("frp_gui_test_server_vault_{}", std::process::id()));
        std::env::set_var(crate::app_paths::PORTABLE_DATA_ENV, temp.to_str().unwrap());

        if let Ok(mut lock) = VAULT_CACHE.lock() {
            *lock = None;
        }

        let reference = "frp-gui/server-node/node-test".to_string();
        assert!(store_server_credential(reference.clone(), CredentialKind::Password, "mypassword123".to_string()).is_ok());
        assert!(store_server_credential(reference.clone(), CredentialKind::SudoPassword, "sudopassword123".to_string()).is_ok());

        let creds = load_server_credentials(&reference, "password").unwrap();
        assert_eq!(creds.password, Some("mypassword123".to_string()));

        let deploy_creds = load_frps_deployment_credentials(&reference).unwrap();
        assert_eq!(deploy_creds.sudo_password, Some("sudopassword123".to_string()));

        assert!(delete_server_credentials(reference.clone()).is_ok());
        let creds_after = load_server_credentials(&reference, "password").unwrap();
        assert_eq!(creds_after.password, None);

        let _ = fs::remove_dir_all(&temp);
        std::env::remove_var(crate::app_paths::PORTABLE_DATA_ENV);
    }
}
