// Locates the wasm-pack binary without depending on PATH configuration.
//
// `cargo install wasm-pack` places the binary in cargo's install bin dir
// (`$CARGO_INSTALL_ROOT`/`$CARGO_HOME`/bin, default `~/.cargo/bin`) — a
// deterministic, absolute location that is frequently NOT on PATH even when
// `cargo` itself is (distro-packaged cargo, or a shell that never sourced
// `~/.cargo/env`). That mismatch is what makes `wasm-pack build` fail with
// `wasm-pack: not found` right after a successful `cargo install`.
//
// Resolution order: PATH first (respects a user's deliberate install), then
// cargo's bin dir by absolute path. Returns the command/path to invoke, or null
// if wasm-pack is installed nowhere we can find.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveWasmPack(): string | null {
  const exe = process.platform === 'win32' ? 'wasm-pack.exe' : 'wasm-pack';

  // On PATH? (direct spawn, no shell — uses PATH resolution and ENOENTs if absent)
  if (spawnSync(exe, ['--version'], { stdio: 'ignore' }).status === 0) return exe;

  // Otherwise look where `cargo install` puts it.
  const roots = [process.env.CARGO_INSTALL_ROOT, process.env.CARGO_HOME, join(homedir(), '.cargo')];
  for (const root of roots) {
    if (!root) continue;
    const candidate = join(root, 'bin', exe);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}
