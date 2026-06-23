// `npm run install:rust` — installs the Rust-side build prerequisites for the
// `-rs` npm packages (the wasm bake). The intended first-time flow is:
//
//   npm install && npm run install:rust
//
// `npm install` stays pure npm; this is the explicit Rust half. It is
// idempotent (checks before installing) and does NOT bootstrap rustup itself —
// that modifies your shell profile and should be a deliberate, consented step,
// so if cargo is absent it points at https://rustup.rs and stops.
//
// "Ready" means `resolveWasmPack` can find wasm-pack — on PATH *or* in cargo's
// bin dir — because the bake (`run-wasm-pack.ts`) resolves it the same way and
// does not require it on PATH.

import { spawnSync } from 'node:child_process';

import { resolveWasmPack } from './resolve-wasm-pack';

function isReachable(command: string): boolean {
  return spawnSync(`${command} --version`, { shell: true, stdio: 'ignore' }).status === 0;
}

function run(command: string): number {
  return spawnSync(command, { shell: true, stdio: 'inherit' }).status ?? 1;
}

if (!isReachable('cargo')) {
  console.error(
    '\n[install:rust] cargo not found. Install the Rust toolchain first:\n' +
      "  https://rustup.rs  (e.g. `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)\n" +
      '  then re-run `npm run install:rust`.\n',
  );
  process.exit(1);
}

// rust-toolchain.toml already declares this target (rustup auto-installs it),
// but add it explicitly so older rustup is covered and any error surfaces here.
if (isReachable('rustup')) {
  if (run('rustup target add wasm32-unknown-unknown') !== 0) process.exit(1);
} else {
  console.warn(
    '[install:rust] rustup not found — ensure the wasm32-unknown-unknown target is available via your Rust manager.',
  );
}

if (!resolveWasmPack()) {
  console.log('[install:rust] installing wasm-pack via `cargo install`…');
  run('cargo install wasm-pack');
}

if (!resolveWasmPack()) {
  console.error('\n[install:rust] wasm-pack could not be installed. Try manually: cargo install wasm-pack\n');
  process.exit(1);
}

console.log('[install:rust] Rust build prerequisites ready — run `npm run build:wasm`.');
