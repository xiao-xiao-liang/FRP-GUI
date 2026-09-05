const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 优先确保 WinLibs GNU GCC 位于 PATH 首位，避免 LLVM-MinGW clang-22 误接管导致链接器缺失 -lgcc_eh
if (process.platform === 'win32') {
  const winlibsCandidate = path.join(
    process.env.LOCALAPPDATA || '',
    'Microsoft/WinGet/Packages/BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe/mingw64/bin'
  );
  if (fs.existsSync(winlibsCandidate)) {
    process.env.PATH = winlibsCandidate + ';' + process.env.PATH;
  }
}

const tauriCliScript = require.resolve('@tauri-apps/cli/tauri.js');
const args = ['build', '--bundles', 'nsis'];

console.log('[bundle-setup] Building NSIS setup bundle...');

const child = spawn(process.execPath, [tauriCliScript, ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`[bundle-setup] Tauri build exited with code ${code}`);
    process.exit(code ?? 1);
  }

  const nsisDir = path.resolve(__dirname, '../src-tauri/target/release/bundle/nsis');
  if (!fs.existsSync(nsisDir)) {
    console.error(`[bundle-setup] Directory not found: ${nsisDir}`);
    process.exit(1);
  }

  const targetExeName = 'FRP-GUI-Pro-x64-setup.exe';
  const targetExePath = path.join(nsisDir, targetExeName);

  const exeFiles = fs.readdirSync(nsisDir)
    .filter((f) => f.endsWith('.exe') && f !== targetExeName)
    .map((f) => ({ name: f, time: fs.statSync(path.join(nsisDir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  if (exeFiles.length === 0) {
    console.error(`[bundle-setup] No generated NSIS installer found in ${nsisDir}`);
    process.exit(1);
  }

  const latestExe = exeFiles[0].name;
  fs.copyFileSync(path.join(nsisDir, latestExe), targetExePath);

  const stats = fs.statSync(targetExePath);
  console.log(`[bundle-setup] Successfully generated and copied to: ${targetExeName} (${stats.size} bytes)`);
});
