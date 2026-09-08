use serde::Serialize;
use std::path::{Path, PathBuf};

pub const MAX_CORE_SCAN_CANDIDATES: usize = 256;
pub const MAX_CORE_SCAN_DEPTH: usize = 4;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedLocalCore {
    pub file_name: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanDiscovery {
    pub candidates: Vec<PathBuf>,
    pub skipped: Vec<SkippedLocalCore>,
}

pub fn is_frpc_candidate(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("frpc") || name.eq_ignore_ascii_case("frpc.exe"))
}

pub fn discover_frpc_candidates(root: &Path) -> Result<ScanDiscovery, String> {
    if !root.is_dir() {
        return Err("所选目录不存在或无法读取".to_string());
    }

    let mut discovery = ScanDiscovery {
        candidates: Vec::new(),
        skipped: Vec::new(),
    };
    discover_in_directory(root, 0, &mut discovery)?;
    discovery.candidates.sort();
    Ok(discovery)
}

fn discover_in_directory(
    directory: &Path,
    depth: usize,
    discovery: &mut ScanDiscovery,
) -> Result<(), String> {
    let entries = std::fs::read_dir(directory)
        .map_err(|_| "所选目录无法读取，请选择包含 FRP 文件的目录".to_string())?;

    for entry in entries {
        let entry = entry.map_err(|_| "读取 FRP 目录条目失败".to_string())?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|_| "读取 FRP 文件属性失败".to_string())?;

        if metadata.file_type().is_symlink() {
            discovery.skipped.push(SkippedLocalCore {
                file_name,
                reason: "已跳过符号链接".to_string(),
            });
            continue;
        }

        if metadata.is_dir() {
            if depth >= MAX_CORE_SCAN_DEPTH {
                return Err(format!("目录层级超过 {} 层，请选择更精确的 FRP 文件夹", MAX_CORE_SCAN_DEPTH));
            }
            discover_in_directory(&path, depth + 1, discovery)?;
            continue;
        }

        if !metadata.is_file() {
            continue;
        }

        if is_frpc_candidate(&path) {
            if discovery.candidates.len() >= MAX_CORE_SCAN_CANDIDATES {
                return Err(format!("可识别 FRPC 候选超过 {} 个，请选择更精确的目录", MAX_CORE_SCAN_CANDIDATES));
            }
            discovery.candidates.push(path);
        } else if file_name.eq_ignore_ascii_case("frps") || file_name.eq_ignore_ascii_case("frps.exe") {
            discovery.skipped.push(SkippedLocalCore {
                file_name,
                reason: "已跳过 FRPS 服务端程序".to_string(),
            });
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{discover_frpc_candidates, is_frpc_candidate};
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_scan_dir() -> PathBuf {
        std::env::temp_dir().join(format!(
            "frp-gui-core-import-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("系统时间有效")
                .as_nanos()
        ))
    }

    #[test]
    fn candidate_filter_only_accepts_frpc_names() {
        assert!(is_frpc_candidate(Path::new("D:/frp/frpc.exe")));
        assert!(is_frpc_candidate(Path::new("/opt/frp/frpc")));
        assert!(!is_frpc_candidate(Path::new("D:/frp/frps.exe")));
        assert!(!is_frpc_candidate(Path::new("D:/frp/frpc.toml")));
    }

    #[test]
    fn recursive_discovery_returns_frpc_and_skips_frps() {
        let root = temporary_scan_dir();
        let nested = root.join("frp_0.71.0_windows_amd64");
        std::fs::create_dir_all(&nested).expect("创建测试目录");
        std::fs::write(nested.join("frpc.exe"), b"test").expect("写入候选文件");
        std::fs::write(nested.join("frps.exe"), b"test").expect("写入服务端文件");

        let discovery = discover_frpc_candidates(&root).expect("扫描成功");

        assert_eq!(discovery.candidates, vec![nested.join("frpc.exe")]);
        assert!(discovery.skipped.iter().any(|item| item.file_name == "frps.exe"));

        std::fs::remove_dir_all(&root).expect("清理测试目录");
    }
}
