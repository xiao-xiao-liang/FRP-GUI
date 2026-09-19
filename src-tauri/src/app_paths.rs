use std::fs;
use std::path::{Path, PathBuf};

pub const PORTABLE_DATA_ENV: &str = "FRP_GUI_PORTABLE_DATA_DIR";
pub const MIGRATION_MARKER_FILE: &str = ".legacy_migrated";

/// 获取应用程序根目录（安装目录或工作区根目录）
pub fn get_app_root_dir() -> PathBuf {
    if let Ok(custom) = std::env::var(PORTABLE_DATA_ENV) {
        if !custom.trim().is_empty() {
            let p = PathBuf::from(custom);
            if let Some(parent) = p.parent() {
                return parent.to_path_buf();
            }
            return p;
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // 开发环境下，exe 位于 target/debug 或 target/release 内部
            // 回溯至项目工作区根目录，使开发调试的数据集中存放在 <workspace>/data
            let exe_dir_str = exe_dir.to_string_lossy().replace('\\', "/");
            if exe_dir_str.contains("/target/debug") || exe_dir_str.contains("/target/release") {
                if let Some(target_idx) = exe_dir_str.rfind("/target/") {
                    let workspace = PathBuf::from(&exe_dir_str[..target_idx]);
                    if workspace.ends_with("src-tauri") {
                        if let Some(parent) = workspace.parent() {
                            return parent.to_path_buf();
                        }
                    }
                    return workspace;
                }
            }
            return exe_dir.to_path_buf();
        }
    }

    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// 获取便携化数据根目录：<app_root>/data
pub fn get_portable_data_dir() -> PathBuf {
    if let Ok(custom) = std::env::var(PORTABLE_DATA_ENV) {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    get_app_root_dir().join("data")
}

/// 获取 FRPC 运行时受控配置目录：<data>/runtime-config
pub fn get_runtime_config_dir() -> PathBuf {
    get_portable_data_dir().join("runtime-config")
}

/// 获取核心下载缓存目录：<data>/core-downloads
pub fn get_core_downloads_dir() -> PathBuf {
    get_portable_data_dir().join("core-downloads")
}

/// 获取 WebView2 隔离用户数据目录：<data>/webview
pub fn get_webview_dir() -> PathBuf {
    get_portable_data_dir().join("webview")
}

/// 获取自包含安全凭据目录：<data>/secrets
pub fn get_secrets_dir() -> PathBuf {
    get_portable_data_dir().join("secrets")
}

/// 获取默认核心安装解压目录：<data>/cores
pub fn get_default_cores_dir() -> PathBuf {
    get_portable_data_dir().join("cores")
}

/// 初始化并确保数据子目录均已建立
pub fn ensure_data_subdirs() -> Result<PathBuf, String> {
    let data_dir = get_portable_data_dir();
    let subdirs = [
        get_runtime_config_dir(),
        get_core_downloads_dir(),
        get_webview_dir(),
        get_secrets_dir(),
        get_default_cores_dir(),
    ];

    for dir in subdirs {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("创建自包含数据目录失败 ({}): {e}", dir.display()))?;
    }

    Ok(data_dir)
}

/// 递归复制目录内容（用于旧数据迁移）
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !src.exists() || !src.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&from, &to)?;
        } else if ty.is_file() {
            // 目标文件若已存在则不覆盖
            if !to.exists() {
                let _ = fs::copy(&from, &to);
            }
        }
    }
    Ok(())
}

/// 从旧版用户目录（AppData）平滑迁移已有数据到安装目录的 data/
pub fn migrate_legacy_data_if_needed(app_handle: &tauri::AppHandle) {
    use tauri::Manager;
    let data_dir = get_portable_data_dir();
    let marker_file = data_dir.join(MIGRATION_MARKER_FILE);

    // 已经执行过迁移则直接跳过
    if marker_file.exists() {
        return;
    }

    // 1. 获取旧版 AppData 路径
    let legacy_local_data = app_handle.path().app_local_data_dir().ok();
    let legacy_roaming_data = app_handle.path().app_data_dir().ok();

    // 2. 迁移 runtime-config
    if let Some(ref local_dir) = legacy_local_data {
        let legacy_runtime = local_dir.join("runtime-config");
        let target_runtime = get_runtime_config_dir();
        if legacy_runtime.exists() && legacy_runtime.is_dir() {
            let _ = copy_dir_all(&legacy_runtime, &target_runtime);
        }
    }

    // 3. 迁移 core-downloads
    if let Some(ref roaming_dir) = legacy_roaming_data {
        let legacy_downloads = roaming_dir.join("core-downloads");
        let target_downloads = get_core_downloads_dir();
        if legacy_downloads.exists() && legacy_downloads.is_dir() {
            let _ = copy_dir_all(&legacy_downloads, &target_downloads);
        }
    }

    // 4. 迁移 WebView2 数据（EBWebView，包含 LocalStorage 与已存方案）
    if let Some(ref local_dir) = legacy_local_data {
        let legacy_webview = local_dir.join("EBWebView");
        let target_webview = get_webview_dir().join("EBWebView");
        if legacy_webview.exists() && legacy_webview.is_dir() && !target_webview.exists() {
            let _ = copy_dir_all(&legacy_webview, &target_webview);
        }
    }

    // 5. 写入迁移完成标记
    let timestamp = chrono::Utc::now().to_rfc3339();
    let _ = fs::write(&marker_file, format!("migrated_at: {}\n", timestamp));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_portable_paths_resolution() {
        let temp = std::env::temp_dir().join(format!("frp_gui_test_paths_{}", std::process::id()));
        std::env::set_var(PORTABLE_DATA_ENV, temp.to_str().unwrap());

        let data = get_portable_data_dir();
        assert_eq!(data, temp);

        let runtime = get_runtime_config_dir();
        assert_eq!(runtime, temp.join("runtime-config"));

        let webview = get_webview_dir();
        assert_eq!(webview, temp.join("webview"));

        let secrets = get_secrets_dir();
        assert_eq!(secrets, temp.join("secrets"));

        let cores = get_default_cores_dir();
        assert_eq!(cores, temp.join("cores"));

        assert!(ensure_data_subdirs().is_ok());
        assert!(runtime.exists());
        assert!(webview.exists());
        assert!(secrets.exists());
        assert!(cores.exists());

        // 清理测试目录
        let _ = fs::remove_dir_all(&temp);
        std::env::remove_var(PORTABLE_DATA_ENV);
    }
}
