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
const args = process.argv.slice(2);

const child = spawn(process.execPath, [tauriCliScript, ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
