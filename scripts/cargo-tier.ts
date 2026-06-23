// Runs a cargo subcommand across one TIER of the Rust workspace. The workspace splits in two
// by what a crate's build needs:
//
//   core   — builds with `cargo` + the rustup toolchain alone. The everyday default; this is
//            what `*:rust` / `*:rust:core` run, so no agent needs a C toolchain to check.
//   extras — needs native build deps. Today only flighthq-host-sdl: its `sdl3` dependency
//            compiles vendored SDL3 C source via CMake, needing a C toolchain and (on Linux)
//            X11/Wayland dev headers — see the "Install SDL build dependencies" step in
//            .github/workflows/tests.yml. CI installs those before running the extras tier.
//
// `*:rust:all` needs no wrapper — it is plain `cargo <sub> --workspace`. host-winit and the
// cfg-gated wasm shells (host-web, surface-wasm) are core: they build with nothing extra
// (winit/wgpu need a display only at runtime; the wasm crates compile as thin native shells).
//
// This is the single source of truth for the split. Add a crate to EXTRA_CRATES only when it
// pulls a non-rustup build dep (a future host-tauri / host-capacitor, or any `*-sys` crate that
// shells a C build). New core crates need no change — core picks them up via `--workspace`.
//
// Usage: tsx ./scripts/cargo-tier.ts <core|extras> <cargo-subcommand> [args…]
//   build:rust:core   → tsx ./scripts/cargo-tier.ts core build
//   test:rust:extras  → tsx ./scripts/cargo-tier.ts extras test

import { spawnSync } from 'node:child_process';

// The EXTRAS tier: crates whose build needs more than the rustup toolchain. Keep alphabetized.
const EXTRA_CRATES = ['flighthq-host-sdl'];

const [tier, subcommand, ...rest] = process.argv.slice(2);

if (tier !== 'core' && tier !== 'extras') {
  console.error(`[cargo-tier] first argument must be 'core' or 'extras', got '${tier ?? ''}'.`);
  process.exit(1);
}
if (!subcommand) {
  console.error('[cargo-tier] expected a cargo subcommand, e.g. `build`, `clippy`, or `test`.');
  process.exit(1);
}

// core = the whole workspace minus the extras; extras = only the extra crates (by -p).
// Selection flags go after the subcommand and before any caller `--` separator, which cargo requires.
const selection =
  tier === 'core'
    ? ['--workspace', ...EXTRA_CRATES.flatMap((crate) => ['--exclude', crate])]
    : EXTRA_CRATES.flatMap((crate) => ['-p', crate]);
const args = [subcommand, ...selection, ...rest];

console.log(`$ cargo ${args.join(' ')}`);
process.exit(spawnSync('cargo', args, { stdio: 'inherit' }).status ?? 1);
