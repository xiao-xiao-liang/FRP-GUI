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

pub fn is_archive_candidate(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    name.ends_with(".zip") || name.ends_with(".tar.gz") || name.ends_with(".tgz")
}

pub fn extract_archive_safe(archive_path: &Path, staging_dir: &Path) -> Result<(), String> {
    if !archive_path.is_file() {
        return Err("所选压缩包文件不存在或无法读取".to_string());
    }
    let metadata = std::fs::metadata(archive_path)
        .map_err(|e| format!("读取压缩包文件属性失败: {e}"))?;
    if metadata.len() > crate::MAX_CORE_ARCHIVE_BYTES as u64 {
        return Err(format!(
            "压缩包大小超出限制 ({} MiB)",
            crate::MAX_CORE_ARCHIVE_BYTES / (1024 * 1024)
        ));
    }

    let file_name = archive_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    std::fs::create_dir_all(staging_dir).map_err(|e| format!("创建临时解压目录失败: {e}"))?;

    if file_name.ends_with(".zip") {
        let file = std::fs::File::open(archive_path).map_err(|e| format!("打开 Zip 包失败: {e}"))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("解析 Zip 包失败: {e}"))?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| format!("读取 Zip 条目失败: {e}"))?;
            let rel_path = PathBuf::from(entry.name());
            let output = crate::core_download::safe_staging_path(staging_dir, &rel_path)?;
            if entry.is_dir() {
                std::fs::create_dir_all(&output).map_err(|e| format!("创建解压子目录失败: {e}"))?;
            } else {
                if let Some(parent) = output.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| format!("创建解压目录失败: {e}"))?;
                }
                let mut out_file = std::fs::File::create(&output).map_err(|e| format!("写入解压文件失败: {e}"))?;
                std::io::copy(&mut entry, &mut out_file).map_err(|e| format!("写入解压文件失败: {e}"))?;
            }
        }
        Ok(())
    } else if file_name.ends_with(".tar.gz") || file_name.ends_with(".tgz") {
        let file = std::fs::File::open(archive_path).map_err(|e| format!("打开 tar.gz 包失败: {e}"))?;
        let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(file));
        for entry_res in archive.entries().map_err(|e| format!("读取 tar.gz 条目失败: {e}"))? {
            let mut entry = entry_res.map_err(|e| format!("读取 tar.gz 条目失败: {e}"))?;
            let rel_path = entry.path().map_err(|e| format!("读取 tar.gz 路径失败: {e}"))?.into_owned();
            let output = crate::core_download::safe_staging_path(staging_dir, &rel_path)?;
            if entry.header().entry_type().is_dir() {
                std::fs::create_dir_all(&output).map_err(|e| format!("创建解压子目录失败: {e}"))?;
            } else {
                if let Some(parent) = output.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| format!("创建解压目录失败: {e}"))?;
                }
                let mut out_file = std::fs::File::create(&output).map_err(|e| format!("写入解压文件失败: {e}"))?;
                std::io::copy(&mut entry, &mut out_file).map_err(|e| format!("写入解压文件失败: {e}"))?;
            }
        }
        Ok(())
    } else {
        Err("仅支持导入 .zip 或 .tar.gz / .tgz 格式的官方压缩包".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{discover_frpc_candidates, extract_archive_safe, is_archive_candidate, is_frpc_candidate};
    use std::io::Write;
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
    fn archive_candidate_checks_extensions() {
        assert!(is_archive_candidate(Path::new("frp_0.61.1_windows_amd64.zip")));
        assert!(is_archive_candidate(Path::new("frp_0.61.1_linux_amd64.tar.gz")));
        assert!(is_archive_candidate(Path::new("frp_0.61.1_darwin_arm64.tgz")));
        assert!(!is_archive_candidate(Path::new("frpc.exe")));
        assert!(!is_archive_candidate(Path::new("frpc.toml")));
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

    #[test]
    fn extract_zip_archive_safely_extracts_frpc() {
        let root = temporary_scan_dir();
        let zip_path = root.join("test_frp.zip");
        let staging = root.join("extracted");
        std::fs::create_dir_all(&root).unwrap();

        {
            let file = std::fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("frp_test/frpc.exe", options).unwrap();
            zip.write_all(b"mock_frpc_binary").unwrap();
            zip.finish().unwrap();
        }

        assert!(extract_archive_safe(&zip_path, &staging).is_ok());
        let discovery = discover_frpc_candidates(&staging).unwrap();
        assert_eq!(discovery.candidates.len(), 1);
        assert!(discovery.candidates[0].ends_with("frpc.exe"));

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn extract_archive_rejects_non_archive() {
        let fake = Path::new("test.txt");
        assert!(extract_archive_safe(fake, Path::new("out")).is_err());
    }
}
