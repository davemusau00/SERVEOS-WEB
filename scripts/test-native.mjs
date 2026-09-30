import { spawnSync } from 'node:child_process';

const manifest = ['--locked', '--manifest-path', 'native-tests/Cargo.toml'];
let args = ['test', ...manifest];
if (process.platform === 'win32') {
  const toolchains = spawnSync('rustup', ['toolchain', 'list'], { encoding: 'utf8' });
  if (toolchains.status === 0 && toolchains.stdout.includes('stable-x86_64-pc-windows-msvc')) {
    args = ['+stable-x86_64-pc-windows-msvc', ...args];
    console.log('Using installed Windows MSVC Rust toolchain for Native acceptance.');
  } else {
    console.warn('Windows MSVC Rust toolchain is unavailable; Cargo will report the configured toolchain failure.');
  }
}
const result = spawnSync('cargo', args, { stdio: 'inherit' });
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
