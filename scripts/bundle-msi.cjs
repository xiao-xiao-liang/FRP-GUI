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

const mode = process.argv[2]; // 'online' | 'offline'
if (mode !== 'online' && mode !== 'offline') {
  console.error('Usage: node scripts/bundle-msi.cjs [online|offline]');
  process.exit(1);
}

const tauriCliScript = require.resolve('@tauri-apps/cli/tauri.js');
const args = mode === 'offline'
  ? ['build', '--config', 'src-tauri/tauri.offline.conf.json']
  : ['build', '--bundles', 'msi'];

console.log(`[bundle-msi] Building ${mode} MSI bundle...`);

const child = spawn(process.execPath, [tauriCliScript, ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`[bundle-msi] Tauri build exited with code ${code}`);
    process.exit(code ?? 1);
  }

  const msiDir = path.resolve(__dirname, '../src-tauri/target/release/bundle/msi');
  if (!fs.existsSync(msiDir)) {
    console.error(`[bundle-msi] Directory not found: ${msiDir}`);
    process.exit(1);
  }

  const defaultMsiName = 'FRP-GUI Pro_1.0.0_x64_en-US.msi';
  const defaultMsiPath = path.join(msiDir, defaultMsiName);
  const targetMsiName = mode === 'offline'
    ? 'FRP-GUI-Pro-x64-offline.msi'
    : 'FRP-GUI-Pro-x64-online.msi';
  const targetMsiPath = path.join(msiDir, targetMsiName);

  if (fs.existsSync(defaultMsiPath)) {
    fs.copyFileSync(defaultMsiPath, targetMsiPath);
  } else {
    const msiFiles = fs.readdirSync(msiDir)
      .filter((f) => f.endsWith('.msi') && f !== 'FRP-GUI-Pro-x64-online.msi' && f !== 'FRP-GUI-Pro-x64-offline.msi')
      .map((f) => ({ name: f, time: fs.statSync(path.join(msiDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (msiFiles.length === 0) {
      console.error(`[bundle-msi] No generated MSI found in ${msiDir}`);
      process.exit(1);
    }
    fs.copyFileSync(path.join(msiDir, msiFiles[0].name), targetMsiPath);
  }

  const stats = fs.statSync(targetMsiPath);
  console.log(`[bundle-msi] Successfully generated and copied to: ${targetMsiName} (${stats.size} bytes)`);
});
