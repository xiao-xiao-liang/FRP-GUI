/**
 * 全平台 FRP 二进制核心智能分析与版本识别引擎
 * 支持在浏览器纯前端（ArrayBuffer）与客户端环境下快速解析：
 * 1. 操作系统与目标架构（Windows PE / Linux ELF / macOS Mach-O）
 * 2. FRP 角色类型（frpc 客户端 / frps 服务端）
 * 3. 精确 FRP 引擎版本（基于 Go runtime buildinfo / FRP 字符串表 / 特征元数据）
 */

export interface FrpBinaryInspectionResult {
  success: boolean;
  version: string;
  os: 'windows' | 'linux' | 'darwin' | 'android' | 'unknown';
  osDisplay: string;
  arch: 'amd64' | 'arm64' | '386' | 'arm' | 'mips' | 'riscv64' | 'unknown';
  archDisplay: string;
  platformDisplay: string;
  type: 'frpc' | 'frps' | 'frp_unknown';
  typeDisplay: string;
  fileName: string;
  fileSize: number;
  sizeDisplay: string;
  suggestedName: string;
  rawDetails?: string;
  detectedBy: 'go_buildinfo' | 'frp_symbol' | 'binary_string' | 'file_name' | 'fallback';
}

/**
 * 格式化字节大小为可读字符串
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * 分析二进制 Header 判断操作系统和 CPU 架构
 */
function inspectBinaryHeader(bytes: Uint8Array): {
  os: 'windows' | 'linux' | 'darwin' | 'android' | 'unknown';
  osDisplay: string;
  arch: 'amd64' | 'arm64' | '386' | 'arm' | 'mips' | 'riscv64' | 'unknown';
  archDisplay: string;
} {
  const len = bytes.length;
  if (len < 16) {
    return { os: 'unknown', osDisplay: '未知系统', arch: 'unknown', archDisplay: '未知架构' };
  }

  // 1. Windows PE 格式 (0x4D 0x5A -> "MZ")
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
    let arch: 'amd64' | 'arm64' | '386' | 'arm' | 'unknown' = 'amd64';
    let archDisplay = 'x86_64 (amd64)';

    if (len >= 0x40) {
      const peOffset =
        bytes[0x3c] | (bytes[0x3d] << 8) | (bytes[0x3e] << 16) | (bytes[0x3f] << 24);
      if (
        peOffset > 0 &&
        peOffset + 6 < len &&
        bytes[peOffset] === 0x50 &&
        bytes[peOffset + 1] === 0x45 &&
        bytes[peOffset + 2] === 0x00 &&
        bytes[peOffset + 3] === 0x00
      ) {
        const machine = bytes[peOffset + 4] | (bytes[peOffset + 5] << 8);
        if (machine === 0x8664) {
          arch = 'amd64';
          archDisplay = 'x86_64 (amd64)';
        } else if (machine === 0xaa64) {
          arch = 'arm64';
          archDisplay = 'ARM64';
        } else if (machine === 0x014c) {
          arch = '386';
          archDisplay = 'x86 (32位)';
        } else if (machine === 0x01c0 || machine === 0x01c4) {
          arch = 'arm';
          archDisplay = 'ARM (32位)';
        }
      }
    }

    return {
      os: 'windows',
      osDisplay: 'Windows',
      arch,
      archDisplay,
    };
  }

  // 2. Linux / Android ELF 格式 (0x7F 0x45 0x4C 0x46 -> "\x7fELF")
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    let arch: 'amd64' | 'arm64' | '386' | 'arm' | 'mips' | 'riscv64' | 'unknown' = 'amd64';
    let archDisplay = 'x86_64 (amd64)';

    if (len >= 20) {
      const eMachine = bytes[18] | (bytes[19] << 8);
      if (eMachine === 0x3e) {
        arch = 'amd64';
        archDisplay = 'x86_64 (amd64)';
      } else if (eMachine === 0xb7) {
        arch = 'arm64';
        archDisplay = 'ARM64 (aarch64)';
      } else if (eMachine === 0x03) {
        arch = '386';
        archDisplay = 'x86 (32位)';
      } else if (eMachine === 0x28) {
        arch = 'arm';
        archDisplay = 'ARM (32位)';
      } else if (eMachine === 0x08) {
        arch = 'mips';
        archDisplay = 'MIPS';
      } else if (eMachine === 0xf3) {
        arch = 'riscv64';
        archDisplay = 'RISC-V 64';
      }
    }

    return {
      os: 'linux',
      osDisplay: 'Linux',
      arch,
      archDisplay,
    };
  }

  // 3. macOS Mach-O 格式 (0xfeedfacf / 0xcffaedfe / 0xfeedface / 0xcafebabe)
  const isMachO64 =
    (bytes[0] === 0xcf && bytes[1] === 0xfa && bytes[2] === 0xed && bytes[3] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xed && bytes[2] === 0xfa && bytes[3] === 0xcf);
  const isMachO32 =
    (bytes[0] === 0xce && bytes[1] === 0xfa && bytes[2] === 0xed && bytes[3] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xed && bytes[2] === 0xfa && bytes[3] === 0xce);
  const isMachOFat =
    (bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba && bytes[3] === 0xbe) ||
    (bytes[0] === 0xbe && bytes[1] === 0xba && bytes[2] === 0xfe && bytes[3] === 0xca);

  if (isMachO64 || isMachO32 || isMachOFat) {
    let arch: 'amd64' | 'arm64' | '386' | 'arm' | 'unknown' = 'arm64';
    let archDisplay = 'Apple Silicon / Intel (跨架构)';

    if (len >= 8 && isMachO64) {
      const cputype = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
      if (cputype === 0x0100000c || cputype === 12) {
        arch = 'arm64';
        archDisplay = 'Apple Silicon (arm64)';
      } else if (cputype === 0x01000007 || cputype === 7) {
        arch = 'amd64';
        archDisplay = 'Intel x86_64';
      }
    }

    return {
      os: 'darwin',
      osDisplay: 'macOS (Darwin)',
      arch,
      archDisplay,
    };
  }

  return { os: 'unknown', osDisplay: '未知操作系统', arch: 'unknown', archDisplay: '未知架构' };
}

/**
 * 字符串与正则扫描抽取 FRP 版本及角色
 */
function scanFrpVersionAndType(
  rawText: string,
  fileName: string
): {
  version: string;
  type: 'frpc' | 'frps' | 'frp_unknown';
  detectedBy: 'go_buildinfo' | 'frp_symbol' | 'binary_string' | 'file_name' | 'fallback';
} {
  const lowerFileName = fileName.toLowerCase();

  // 1. 角色判断 (frps vs frpc)
  let type: 'frpc' | 'frps' | 'frp_unknown' = 'frpc';
  if (lowerFileName.includes('frps') || rawText.includes('cmd/frps') || rawText.includes('frps/')) {
    type = 'frps';
  } else if (lowerFileName.includes('frpc') || rawText.includes('cmd/frpc') || rawText.includes('frpc/')) {
    type = 'frpc';
  }

  // 2. 扫描 Go runtime/debug.BuildInfo 模块表 (最高优先级，官方签名精确模块版本)
  // 匹配形式: github.com/fatedier/frp  v0.61.1 或 github.com/fatedier/frp\tv0.61.1
  const goBuildInfoRegex = /github\.com\/fatedier\/frp(?:\/v\d+)?[\s\t]+v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/i;
  const goMatch = rawText.match(goBuildInfoRegex);
  if (goMatch && goMatch[1]) {
    return {
      version: `v${goMatch[1].replace(/^v/i, '')}`,
      type,
      detectedBy: 'go_buildinfo',
    };
  }

  // 3. 扫描 FRP 内部 version.go 特征与符号表
  const frpPkgRegex = /(?:frp\/pkg\/util\/version|frp\/pkg\/version)[^\x00\n\r]{0,64}?(?:v|version)?[:=\s_]*v?(\d+\.\d+\.\d+)/i;
  const pkgMatch = rawText.match(frpPkgRegex);
  if (pkgMatch && pkgMatch[1]) {
    return {
      version: `v${pkgMatch[1].replace(/^v/i, '')}`,
      type,
      detectedBy: 'frp_symbol',
    };
  }

  // 4. 扫描 CLI 输出或日志提示文本 (如 "frpc version 0.61.1" 或 "frps version 0.58.1")
  const cliTextRegex = /(?:frpc?|frps?)\s+version\s+v?(\d+\.\d+\.\d+)/i;
  const cliMatch = rawText.match(cliTextRegex);
  if (cliMatch && cliMatch[1]) {
    return {
      version: `v${cliMatch[1].replace(/^v/i, '')}`,
      type,
      detectedBy: 'binary_string',
    };
  }

  // 5. 扫描 FRP 打包归档或路径标记 (如 "frp_0.61.1_windows_amd64")
  const archiveRegex = /frp_(\d+\.\d+\.\d+)_/i;
  const archMatch = rawText.match(archiveRegex);
  if (archMatch && archMatch[1]) {
    return {
      version: `v${archMatch[1].replace(/^v/i, '')}`,
      type,
      detectedBy: 'binary_string',
    };
  }

  // 6. 从文件名中提取语义化版本 (如 "frpc_v0.61.1.exe" 或 "frp_0.61.1")
  const fileNameVerMatch = fileName.match(/(\d+\.\d+\.\d+)/);
  if (fileNameVerMatch && fileNameVerMatch[1]) {
    return {
      version: `v${fileNameVerMatch[1].replace(/^v/i, '')}`,
      type,
      detectedBy: 'file_name',
    };
  }

  // 7. 兜底默认版本 (当前最新 LTS 稳定版)
  return {
    version: 'v0.61.1',
    type,
    detectedBy: 'fallback',
  };
}

/**
 * 核心解析入口：根据用户选中的 File 对象（或 ArrayBuffer）进行全息探测
 */
export async function detectFrpBinaryFromFile(file: File): Promise<FrpBinaryInspectionResult> {
  const fileName = file.name;
  const fileSize = file.size;
  const sizeDisplay = formatBytes(fileSize);

  try {
    // 读取文件头部 8MB (对于 Go 可执行文件，Go buildinfo 与字符串段通常在前 8MB 即可完全命中)
    const sliceSize = Math.min(fileSize, 8 * 1024 * 1024);
    const slice = file.slice(0, sliceSize);
    const arrayBuffer = await slice.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 1. 解析系统与架构
    const headerInfo = inspectBinaryHeader(uint8Array);

    // 2. 解码文本段提取版本与类型
    // 使用 latin1 / utf-8 宽松解码避免编码异常中断
    let decodedText = '';
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      decodedText = decoder.decode(uint8Array);
    } catch {
      // 容错处理
      let binaryStr = '';
      const step = 4096;
      for (let i = 0; i < uint8Array.length; i += step) {
        const sub = uint8Array.subarray(i, Math.min(i + step, uint8Array.length));
        binaryStr += String.fromCharCode.apply(null, Array.from(sub));
      }
      decodedText = binaryStr;
    }

    const { version, type, detectedBy } = scanFrpVersionAndType(decodedText, fileName);

    const typeDisplay = type === 'frps' ? 'frps (服务端)' : 'frpc (客户端)';
    const platformDisplay = `${headerInfo.osDisplay} ${headerInfo.archDisplay}`;
    const suggestedName = `本地核心 ${fileName} (${version})`;

    return {
      success: true,
      version,
      os: headerInfo.os,
      osDisplay: headerInfo.osDisplay,
      arch: headerInfo.arch,
      archDisplay: headerInfo.archDisplay,
      platformDisplay,
      type,
      typeDisplay,
      fileName,
      fileSize,
      sizeDisplay,
      suggestedName,
      detectedBy,
    };
  } catch (err: any) {
    // 异常保底分析（仅依赖文件名和文件大小）
    const matchedVer = fileName.match(/(\d+\.\d+\.\d+)/);
    const isServer = fileName.toLowerCase().includes('frps');
    const version = matchedVer ? `v${matchedVer[1]}` : 'v0.61.1';

    return {
      success: true,
      version,
      os: 'windows',
      osDisplay: 'Windows',
      arch: 'amd64',
      archDisplay: 'x86_64',
      platformDisplay: 'Windows x86_64',
      type: isServer ? 'frps' : 'frpc',
      typeDisplay: isServer ? 'frps (服务端)' : 'frpc (客户端)',
      fileName,
      fileSize,
      sizeDisplay,
      suggestedName: `本地核心 ${fileName} (${version})`,
      detectedBy: 'fallback',
      rawDetails: err?.message,
    };
  }
}
