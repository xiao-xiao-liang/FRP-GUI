# FRP 核心下载兼容与完整性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让受控国内镜像恢复可用，并在下载与解压前保持官方 SHA-256 校验和 100 MiB 归档上限。

**Architecture:** 前端传递官方资产 URL 与受控镜像标识，不再传递镜像改写 URL。Rust 校验官方身份、构造受控镜像传输地址、从官方 Release 获取校验和，并以分块读取限制归档大小和计算哈希。

**Tech Stack:** React 19、TypeScript、Vitest、Tauri v2、Rust、Reqwest、SHA-256。

---

### Task 1: 固化 IPC 下载契约

**Files:**
- Modify: `src/services/ipc.ts`
- Test: `src/services/ipc.test.ts`

- [x] **Step 1: 写出失败的 IPC 合约测试**

```ts
await downloadAndExtractCore({
  downloadUrl: officialUrl,
  mirror: 'ghproxy',
  targetDir: 'D:/frp', version: 'v0.61.1', targetOs: 'windows', targetArch: 'amd64',
});
expect(invoke).toHaveBeenCalledWith('download_and_extract_core', {
  downloadUrl: officialUrl, mirror: 'ghproxy', targetDir: 'D:/frp',
  version: 'v0.61.1', targetOs: 'windows', targetArch: 'amd64',
});
```

- [x] **Step 2: 运行 RED 验证**

Run: `pnpm vitest run src/services/ipc.test.ts`

Expected: 测试因 `mirror` 尚未向 Tauri IPC 传递而失败。

- [x] **Step 3: 仅扩展 `DownloadCoreParams` 与 Tauri 调用**

在参数类型中加入 `mirror: 'official' | 'ghproxy' | 'fastgit'`，并将该字段发送给 `download_and_extract_core`。

- [x] **Step 4: 运行 GREEN 验证**

Run: `pnpm vitest run src/services/ipc.test.ts`

Expected: 测试通过。

### Task 2: 在 Rust 端构造受控下载地址并限制归档

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/lib.rs`

- [x] **Step 1: 写出失败的纯函数测试**

```rust
assert_eq!(
    build_download_url(OFFICIAL_URL, "ghproxy").unwrap(),
    format!("https://ghproxy.net/{OFFICIAL_URL}"),
);
assert!(build_download_url(OFFICIAL_URL, "unknown").is_err());
assert!(append_download_chunk(&mut Vec::new(), &mut Sha256::new(), MAX_CORE_ARCHIVE_BYTES, &[0]).is_err());
```

- [x] **Step 2: 运行 RED 验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml core_download`

Expected: 测试因辅助函数不存在而失败。

- [x] **Step 3: 实施最小安全边界**

新增 `build_download_url`，它先调用 `validate_official_download_url`，仅接受三个镜像标识并在 Rust 中构造传输地址。以 `response.chunk().await` 读取归档，超过 `MAX_CORE_ARCHIVE_BYTES` 即返回错误；每块同时写入内存缓冲与 `Sha256`，完成后比对官方校验和。

- [x] **Step 4: 运行 GREEN 验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml core_download`

Expected: 测试通过。

### Task 3: 让核心管理页传递官方身份

**Files:**
- Modify: `src/features/cores/CoreManagerPage.tsx`
- Test: `src/features/cores/CoreManagerPage.test.tsx`

- [x] **Step 1: 写出失败的组件测试**

模拟默认 `ghproxy`，打开下载弹窗并确认下载；断言 `downloadAndExtractCore` 收到官方 GitHub URL 与 `mirror: 'ghproxy'`，而不是 `https://ghproxy.net/...`。

- [x] **Step 2: 运行 RED 验证**

Run: `pnpm vitest run src/features/cores/CoreManagerPage.test.tsx`

Expected: 测试显示参数仍是镜像改写 URL 或缺少镜像标识。

- [x] **Step 3: 移除 UI 层 URL 改写**

删除 `getAcceleratedDownloadUrl` 的页面调用，保留 `rawDownloadUrl` 作为 `downloadUrl`，并将 `selectedMirror` 作为 `mirror` 传递。

- [x] **Step 4: 运行 GREEN 与全量验证**

Run: `pnpm test; cargo test --manifest-path src-tauri/Cargo.toml; git diff --check`

Expected: 全部测试通过，差异检查退出码为 0。

### Task 4: 移除浏览器预览的未校验下载通道

**Files:**
- Modify: `src/services/ipc.ts`
- Modify: `vite.config.ts`
- Test: `src/services/ipc.test.ts`

- [x] **Step 1: 写出浏览器预览的失败测试**

```ts
vi.mocked(isTauriEnv).mockReturnValue(false);
await expect(downloadAndExtractCore(params)).resolves.toEqual(
  expect.objectContaining({ success: false }),
);
expect(fetch).not.toHaveBeenCalled();
```

- [x] **Step 2: 运行 RED 验证**

Run: `pnpm vitest run src/services/ipc.test.ts`

Expected: Vite 下载中间件被调用，测试失败。

- [x] **Step 3: 阻断浏览器下载并移除中间件**

`downloadAndExtractCore` 在非 Tauri 环境返回桌面端说明；删除 `/api/dev/download-core` 和仅供该接口使用的下载、解压辅助函数。

- [x] **Step 4: 运行 GREEN 与构建验证**

Run: `pnpm vitest run src/services/ipc.test.ts; pnpm build`

Expected: 浏览器测试通过，Vite 配置仍可编译。
