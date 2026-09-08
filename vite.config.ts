import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';

function devNativeDialogPlugin(): Plugin {
  return {
    name: 'dev-native-dialog',
    configureServer(server) {
      // 1. 现代化文件夹浏览对话框 (Windows 10/11 现代 IFileDialog 替代 WinXP 树形框)
      server.middlewares.use('/api/dev/pick-dir', (_req, res) => {
        if (process.platform === 'win32') {
          const script = `
          $code = @'
          using System;
          using System.Runtime.InteropServices;
          public class ModernFolderPicker {
              [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
              private class FileOpenDialogRCW { }
              [ComImport, Guid("42f85109-d1e4-4384-b6b2-25e2f2f182e7"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
              private interface IFileOpenDialog {
                  [PreserveSig] int Show(IntPtr parent);
                  void SetFileTypes();
                  void SetFileTypeIndex();
                  void GetFileTypeIndex();
                  void Advise();
                  void Unadvise();
                  void SetOptions(uint fos);
                  void GetOptions(out uint fos);
                  void SetDefaultFolder(IntPtr psi);
                  void SetFolder(IntPtr psi);
                  void GetFolder(out IntPtr ppsi);
                  void GetCurrentSelection(out IntPtr ppsi);
                  void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
                  void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
                  void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
                  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
                  void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
                  void GetResult(out IShellItem ppsi);
              }
              [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
              private interface IShellItem {
                  void BindToHandler();
                  void GetParent();
                  void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
              }
              public static string PickFolder(string title) {
                  var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
                  dialog.SetOptions(0x20 | 0x40); // FOS_FORCEFILESYSTEM | FOS_PICKFOLDERS
                  if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);
                  if (dialog.Show(IntPtr.Zero) == 0) {
                      IShellItem item;
                      dialog.GetResult(out item);
                      string path;
                      item.GetDisplayName(0x80058000, out path);
                      return path;
                  }
                  return null;
              }
          }
          '@
          Add-Type -TypeDefinition $code -Language CSharp
          $res = [ModernFolderPicker]::PickFolder("选择 FRP 核心下载与解压目标目录")
          if ($res) { Write-Output $res }
          `;
          execFile('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], (err, stdout) => {
            res.setHeader('Content-Type', 'application/json');
            if (err) {
              // 备用降级方案
              const fallbackScript = `
              Add-Type -AssemblyName System.Windows.Forms
              $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
              $dialog.Description = "选择 FRP 核心下载与解压目标目录"
              if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                  Write-Output $dialog.SelectedPath
              }
              `;
              execFile('powershell', ['-NoProfile', '-Command', fallbackScript], (_err2, stdout2) => {
                const selectedPath = (stdout2 || '').trim();
                res.end(JSON.stringify({ success: true, path: selectedPath || null }));
              });
            } else {
              const selectedPath = stdout.trim();
              res.end(JSON.stringify({ success: true, path: selectedPath || null }));
            }
          });
        } else if (process.platform === 'darwin') {
          const script = 'POSIX path of (choose folder with prompt "选择 FRP 核心下载与解压目标目录")';
          execFile('osascript', ['-e', script], (err, stdout) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: !err, path: stdout.trim() || null }));
          });
        } else {
          execFile('zenity', ['--file-selection', '--directory', '--title=选择 FRP 核心下载与解压目标目录'], (err, stdout) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: !err, path: stdout.trim() || null }));
          });
        }
      });

      // 2. 现代化文件选择对话框
      server.middlewares.use('/api/dev/pick-file', (_req, res) => {
        if (process.platform === 'win32') {
          const script = `
          Add-Type -AssemblyName System.Windows.Forms
          $dialog = New-Object System.Windows.Forms.OpenFileDialog
          $dialog.Title = "选择 FRP 核心可执行程序 (frpc / frps)"
          $dialog.Filter = "FRP 核心程序 (*frp*.exe;frpc.exe;frps.exe)|*frp*.exe;frpc.exe;frps.exe|所有可执行程序 (*.exe)|*.exe|所有文件 (*.*)|*.*"
          $dialog.RestoreDirectory = $true
          if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
              Write-Output $dialog.FileName
          }
          `;
          execFile('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], (err, stdout) => {
            res.setHeader('Content-Type', 'application/json');
            if (err) {
              res.end(JSON.stringify({ success: false, path: null, error: err.message }));
            } else {
              const selectedPath = stdout.trim();
              res.end(JSON.stringify({ success: true, path: selectedPath || null }));
            }
          });
        } else if (process.platform === 'darwin') {
          const script = 'POSIX path of (choose file with prompt "选择 FRP 核心程序 (frpc / frps)")';
          execFile('osascript', ['-e', script], (err, stdout) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: !err, path: stdout.trim() || null }));
          });
        } else {
          execFile('zenity', ['--file-selection', '--title=选择 FRP 核心程序 (frpc / frps)'], (err, stdout) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: !err, path: stdout.trim() || null }));
          });
        }
      });

      // 3. 文件系统目录内容罗列 API (供飞书 Universe Design 内置文件/目录选择器使用)
      server.middlewares.use('/api/dev/fs/list', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        try {
          const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
          let targetDir = urlObj.searchParams.get('dir');

          const homeDir = os.homedir();
          const desktopDir = path.join(homeDir, 'Desktop');
          const downloadsDir = path.join(homeDir, 'Downloads');
          const documentsDir = path.join(homeDir, 'Documents');

          // 获取系统可用驱动器 / 挂载点
          const drives: Array<{ label: string; path: string; type: 'system' | 'data' | 'home' }> = [];
          if (process.platform === 'win32') {
            for (let i = 65; i <= 90; i++) {
              const driveLetter = String.fromCharCode(i);
              const drivePath = `${driveLetter}:\\`;
              if (fs.existsSync(drivePath)) {
                drives.push({
                  label: `${driveLetter}: 盘`,
                  path: drivePath,
                  type: driveLetter === 'C' ? 'system' : 'data',
                });
              }
            }
          } else {
            drives.push({ label: '根目录 (/)', path: '/', type: 'system' });
          }

          // 常用快捷路径
          const shortcuts = [
            { label: '用户主目录', path: homeDir, icon: 'user' },
            { label: '桌面', path: desktopDir, icon: 'desktop' },
            { label: '下载', path: downloadsDir, icon: 'download' },
            { label: '文档', path: documentsDir, icon: 'document' },
            { label: '当前项目目录', path: process.cwd(), icon: 'folder' },
          ].filter((s) => fs.existsSync(s.path));

          // 默认浏览目录：如果没有传入，优先使用用户主目录或项目根目录
          if (!targetDir || !fs.existsSync(targetDir)) {
            targetDir = homeDir && fs.existsSync(homeDir) ? homeDir : process.cwd();
          }

          targetDir = path.resolve(targetDir);
          const stat = fs.statSync(targetDir);
          if (!stat.isDirectory()) {
            targetDir = path.dirname(targetDir);
          }

          const entries = fs.readdirSync(targetDir, { withFileTypes: true });
          const items: Array<{
            name: string;
            path: string;
            isDirectory: boolean;
            size: number;
            mtime: string;
            isExecutable: boolean;
            isFrpBinary: boolean;
            extension: string;
          }> = [];

          for (const entry of entries) {
            // 跳过系统隐藏保护文件以保持界面清爽
            if (entry.name.startsWith('$') || entry.name.startsWith('System Volume Information') || entry.name === 'pagefile.sys' || entry.name === 'hiberfil.sys') {
              continue;
            }

            const itemPath = path.join(targetDir, entry.name);
            let size = 0;
            let mtimeStr = '';
            try {
              const itemStat = fs.statSync(itemPath);
              size = itemStat.size;
              mtimeStr = itemStat.mtime.toISOString().replace('T', ' ').substring(0, 19);
            } catch {}

            const isDir = entry.isDirectory();
            const ext = path.extname(entry.name).toLowerCase();
            const lowerName = entry.name.toLowerCase();
            const isExe = ext === '.exe' || (!isDir && process.platform !== 'win32' && !ext);
            const isFrp = lowerName.includes('frpc') || lowerName.includes('frps') || lowerName.includes('frp');

            items.push({
              name: entry.name,
              path: itemPath,
              isDirectory: isDir,
              size,
              mtime: mtimeStr,
              isExecutable: isExe,
              isFrpBinary: isFrp,
              extension: ext,
            });
          }

          // 排序：文件夹排在前，文件排在后；优先按名称字母序
          items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            if (a.isFrpBinary && !b.isFrpBinary) return -1;
            if (!a.isFrpBinary && b.isFrpBinary) return 1;
            return a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
          });

          const parentDir = path.dirname(targetDir) !== targetDir ? path.dirname(targetDir) : null;

          res.end(
            JSON.stringify({
              success: true,
              currentPath: targetDir,
              parentPath: parentDir,
              drives,
              shortcuts,
              items,
            })
          );
        } catch (err: any) {
          res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
        }
      });

      // 4. 新建文件夹 API
      server.middlewares.use('/api/dev/fs/mkdir', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            const { dirPath } = data;
            if (!dirPath) {
              res.end(JSON.stringify({ success: false, error: '缺少 dirPath 参数' }));
              return;
            }
            fs.mkdirSync(dirPath, { recursive: true });
            res.end(JSON.stringify({ success: true, path: dirPath }));
          } catch (e: any) {
            res.end(JSON.stringify({ success: false, error: e.message || String(e) }));
          }
        });
      });

    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devNativeDialogPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname || '.', './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    open: false,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  clearScreen: false,
});
