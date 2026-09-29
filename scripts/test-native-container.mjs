import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// Linux domain verification only; this does not build a Tauri package.
const child = spawn('docker', [
  'run', '--rm', '--name', `servos-native-test-${randomUUID()}`,
  '--mount', `type=bind,source=${resolve('.')},target=/workspace,readonly`,
  '--mount', 'type=volume,source=servos-native-target,target=/build',
  '--mount', 'type=volume,source=servos-cargo-cache,target=/usr/local/cargo/registry',
  '-e', 'CARGO_TARGET_DIR=/build', '-w', '/workspace',
  'rust:1-slim-bookworm', 'cargo', 'test', '--locked', '--manifest-path', 'native-tests/Cargo.toml',
], { stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
