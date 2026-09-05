import { isTauriEnv } from './ipc';

export interface HostPlatformInfo {
  os: 'windows' | 'darwin' | 'linux' | 'android' | 'unknown';
  osDisplay: string;
  arch: 'amd64' | 'arm64' | '386' | 'arm' | 'unknown';
  archDisplay: string;
  platformDisplay: string;
}

export interface MatchedAssetResult {
  asset: any | null;
  assetName: string;
  downloadUrl: string;
  os: string;
  arch: string;
  platformDisplay: string;
  isExactMatch: boolean;
  sizeBytes: number;
  sizeDisplay: string;
  extension: string;
}

/**
 * 自动识别当前运行宿主机的操作系统和 CPU 架构
 */
export async function detectHostSystemPlatform(): Promise<HostPlatformInfo> {
  // 1. 若处于 Tauri 桌面宿主环境，直接读取 Rust 操作系统探测
  if (isTauriEnv()) {
    try {
      const tauri = (window as any).__TAURI__;
      const internals = (window as any).__TAURI_INTERNALS__;
      const invoke = tauri?.core?.invoke || internals?.invoke;
      if (typeof invoke === 'function') {
        const info = await invoke('get_system_platform');
        if (info && info.os) {
          return {
            os: info.os,
            osDisplay: info.osDisplay || (info.os === 'windows' ? 'Windows' : info.os === 'darwin' ? 'macOS' : 'Linux'),
            arch: info.arch || 'amd64',
            archDisplay: info.archDisplay || (info.arch === 'arm64' ? 'ARM64' : 'x86_64'),
            platformDisplay: info.platformDisplay || `${info.os} ${info.arch}`,
          };
        }
      }
    } catch (e) {
      console.warn('Failed to get platform from Tauri, falling back to navigator:', e);
    }
  }

  // 2. 浏览器环境下的 UserAgent 与 Client Hints 识别
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const platform = typeof navigator !== 'undefined' ? (navigator as any).platform || '' : '';

  let os: 'windows' | 'darwin' | 'linux' | 'android' | 'unknown' = 'windows';
  let osDisplay = 'Windows';
  let arch: 'amd64' | 'arm64' | '386' | 'arm' | 'unknown' = 'amd64';
  let archDisplay = 'x86_64 (amd64)';

  if (/Android/i.test(ua)) {
    os = 'android';
    osDisplay = 'Android';
  } else if (/Macintosh|MacIntel|MacPPC|Mac68K|Darwin/i.test(ua) || /Mac/i.test(platform)) {
    os = 'darwin';
    osDisplay = 'macOS (Darwin)';
  } else if (/Linux/i.test(ua) || /Linux/i.test(platform)) {
    os = 'linux';
    osDisplay = 'Linux';
  } else {
    os = 'windows';
    osDisplay = 'Windows';
  }

  // 架构识别 (x86_64 / arm64 / 386)
  if (/arm64|aarch64/i.test(ua) || (os === 'darwin' && /ARM/i.test(platform))) {
    arch = 'arm64';
    archDisplay = 'ARM64 (Apple Silicon / aarch64)';
  } else if (/x86_64|Win64|x64|amd64|WOW64/i.test(ua)) {
    arch = 'amd64';
    archDisplay = 'x86_64 (amd64)';
  } else if (/i686|i386|x86/i.test(ua)) {
    arch = '386';
    archDisplay = 'x86 (32位)';
  } else {
    arch = 'amd64';
    archDisplay = 'x86_64 (amd64)';
  }

  return {
    os,
    osDisplay,
    arch,
    archDisplay,
    platformDisplay: `${osDisplay} ${archDisplay}`,
  };
}

/**
 * 从 Release 资产列表中自动智能匹配当前或指定系统/架构的 FRP 官方预编译包
 */
export function matchReleaseAsset(
  assets: any[],
  targetOs: string,
  targetArch: string,
  releaseTag?: string
): MatchedAssetResult {
  if (!assets || assets.length === 0) {
    const isWin = targetOs === 'windows';
    const tag = releaseTag || 'v0.61.1';
    const cleanTag = tag.replace(/^v/, '');
    const ext = isWin ? 'zip' : 'tar.gz';
    const assetName = `frp_${cleanTag}_${targetOs}_${targetArch}.${ext}`;
    const downloadUrl = `https://github.com/fatedier/frp/releases/download/${tag}/${assetName}`;

    return {
      asset: null,
      assetName,
      downloadUrl,
      os: targetOs,
      arch: targetArch,
      platformDisplay: `${targetOs === 'windows' ? 'Windows' : targetOs === 'darwin' ? 'macOS' : 'Linux'} ${targetArch}`,
      isExactMatch: true,
      sizeBytes: 16500000,
      sizeDisplay: '~16.5 MB',
      extension: ext,
    };
  }

  // 格式化搜索关键词
  const osKey = targetOs.toLowerCase();
  const archKey = targetArch.toLowerCase();

  // 1. 绝对精确匹配 (同时命中 OS 与 Arch)
  let found = assets.find((a) => {
    const name = (a.name || '').toLowerCase();
    const matchOs = name.includes(osKey);
    const matchArch = name.includes(archKey) || (archKey === 'amd64' && (name.includes('x86_64') || name.includes('x64')));
    return matchOs && matchArch;
  });

  // 2. 次级匹配 (命中 OS)
  if (!found) {
    found = assets.find((a) => (a.name || '').toLowerCase().includes(osKey));
  }

  // 3. 兜底取首个
  if (!found && assets.length > 0) {
    found = assets[0];
  }

  const assetName = found?.name || `frp_${releaseTag || 'v0.61.1'}_${targetOs}_${targetArch}.zip`;
  const downloadUrl = found?.downloadUrl || found?.browser_download_url || `https://github.com/fatedier/frp/releases/download/${releaseTag || 'v0.61.1'}/${assetName}`;
  const sizeBytes = found?.size || 16500000;
  const sizeDisplay = `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  const extension = assetName.endsWith('.tar.gz') ? 'tar.gz' : assetName.split('.').pop() || 'zip';

  return {
    asset: found,
    assetName,
    downloadUrl,
    os: targetOs,
    arch: targetArch,
    platformDisplay: `${targetOs === 'windows' ? 'Windows' : targetOs === 'darwin' ? 'macOS' : 'Linux'} ${targetArch}`,
    isExactMatch: Boolean(found),
    sizeBytes,
    sizeDisplay,
    extension,
  };
}

/**
 * 转换加速镜像下载链接
 */
export function getAcceleratedDownloadUrl(originalUrl: string, mirror: string): string {
  if (!originalUrl) return '';
  if (mirror === 'ghproxy') {
    return `https://ghproxy.net/${originalUrl}`;
  }
  if (mirror === 'fastgit') {
    return originalUrl.replace('https://github.com', 'https://download.fastgit.org');
  }
  return originalUrl;
}

/**
 * 唤起系统原生目录选择对话框选择下载目录（支持 Tauri 桌面与 Vite 宿主开发环境）
 */
export async function pickDirectoryNative(): Promise<string | null> {
  // 1. 如果在 Tauri 桌面环境中运行
  if (isTauriEnv()) {
    try {
      const tauri = (window as any).__TAURI__;
      const internals = (window as any).__TAURI_INTERNALS__;
      const invoke = tauri?.core?.invoke || internals?.invoke;
      if (typeof invoke === 'function') {
        const selected = await invoke('pick_directory');
        if (selected) return selected;
      }
    } catch (err) {
      console.error('Failed to pick directory via Tauri:', err);
    }
  }

  // 2. 如果在 Vite 开发服务器下运行 (调用本地 Node.js 触发原生对话框，完全消除上传提示)
  try {
    const res = await fetch('/api/dev/pick-dir');
    if (res.ok) {
      const data = await res.json();
      if (data && data.path) {
        return data.path;
      }
      if (data && data.path === null) {
        return null; // 用户取消了选择
      }
    }
  } catch {
    // 忽略异常并走保底逻辑
  }

  // 3. 现代浏览器纯前端 File System Access API
  if (typeof (window as any).showDirectoryPicker === 'function') {
    try {
      const handle = await (window as any).showDirectoryPicker();
      if (handle && handle.name) {
        return `D:\\Development-Kits\\${handle.name}`;
      }
    } catch {
      return null;
    }
  }

  return null;
}
