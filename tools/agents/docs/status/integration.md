# Integration — sync to builder's green tree (2026-06-25)

Per `assignments/_DISPATCH.md` (this round): make the working tree equal builder's just-completed green tree (`incoming/builder-1acf96627/head/`), confirm green, and stop for the user to commit from the host. No commit made here.

## What I synced

Builder forked from an earlier integration tip and did the full green run, so this was a fast-forward of builder's forward work — **not** a destructive mirror. The user flagged that this tree may be slightly ahead of builder (docs / script improvements from the review branch), so I applied **only builder's exact `base/`→`head/` delta** and left everything builder did not touch untouched.

Delta applied (computed directly from the bundle's `base/` vs `head/`):

- **405 modified + 494 added** source paths → copied from `head/` (authoritative). This carries the red-tree recovery, the lost-source recovery (~201 functions + ~94 `@flighthq/types` headers), the flat menu shape, the displayobject decisions, the camera 3D recovery, and the **`resources` split** into `@flighthq/{audio,font,image,textureatlas,tileset,video}` (+ matching `crates/flighthq-*`).
- **5 deletions** (builder's intentional removals): `packages/resources/` and `crates/flighthq-resources/` (split out), `packages/sdk/src/collision.test.ts` (builder removed it — confirmed in `_QUESTIONS.md`), and `packages/types/src/{DOMRenderOptions,DOMStageRectangle}.ts`.

Preserved (builder touched none of these, so they were not overwritten or deleted):

- All `scripts/` (builder's delta touched **zero** script files).
- Docs builder did not change, and all binary assets (example images/sounds, fonts, screenshot baselines) — the bundle is text-source only and captured **no** binaries, so a blanket mirror would have wrongly destroyed them; the delta approach leaves them intact.

Excluded from the sync per the dispatch: `node_modules/`, `dist/` (the bundle's `dist/*.d.ts` are captured build artifacts, not source — removed any that leaked in), `.tsbuildinfo`, and the gitignored `incoming/` bundle (moved aside after use).

`npm install` was run (lockfile + package manifests changed).

## Check result

`npm run check` → **exit 0** (packages:check ✓, typecheck `tsc -b` = 0 errors, lint ✓, format:check ✓, order:check ✓, exports:check ✓ / 0 untested exports).

Full suite → **9708 / 9708 tests pass** (900 files; 1 file does not load — see reconciliation). This exceeds builder's reported 9377 because some of this tree's extra tests were preserved.

## Reconciliation / divergences from a pure mirror

1. **`surface-rs/src/surfaceWasm.test.ts` — environmental, not source.** Fails to resolve `./wasm/surface_wasm.js`, the gitignored wasm-bindgen output produced by `npm run build:wasm` (Rust toolchain). `cargo` is not installed here, so the artifact can't be built. This is a build artifact that is **never committed**, so it does not affect the source the user commits; the test passes once `npm run install:rust && npm run build:wasm` is run in an environment with the toolchain. Same state as before the sync.
2. **Formatted 3 of builder's docs** to pass `format:check` — `ISSUE.md`, `status/_QUESTIONS.md`, `status/menu.md` arrived prettier-dirty in the bundle. Content unchanged; whitespace/wrapping only. (Flagged in `_QUESTIONS.md` — builder's own tree may have a latent doc-format gap, or excludes these from its format gate.)
3. **Broadened the eslint docs ignore** to `tools/agents/docs/**` (was `tools/agents/docs/assignments/**` + `tools/agents/docs/**/*.js`), at the user's request, so any docs/staging folder under the agent-docs tree can't reintroduce lint failures. Forward improvement, not a builder reconciliation.

No code conflicts: this tree's session work converged with builder's (useragent, the reconstructed `@flighthq/types` headers, etc. all exist in `head/`), so taking builder's authoritative versions was a clean overwrite, not a merge.

## Stop

No commit made — the user commits from the host. Output is under `status/` only.
