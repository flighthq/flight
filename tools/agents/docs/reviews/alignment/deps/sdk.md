# Dependency Alignment: @flighthq/sdk

**Verdict:** Clean — the barrel's declared deps are an exact 1:1 mirror of its re-exports with no unused, phantom, self, or cross-boundary edges; the only nit is the unsorted `dependencies` block in `package.json`.

`npm run packages:check` passes (86 packages valid). Everything below is judgment beyond that gate.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `dependencies` block in `package.json` | The 83-entry dep list is **not alphabetized** (e.g. `webcam` and `clip` appear early, out of order), while `src/index.ts` re-exports _are_ alphabetized. Cosmetic only; not enforced by `packages:check`. For a hand-maintained 83-line list this is the one thing that drifts. | Sort the `dependencies` keys to match the alphabetized `index.ts` so the two lists diff cleanly when packages are added/removed. |
| Info | breadth of declared deps (83) | The SDK depends on nearly every workspace package — including all four display-object backends (`-canvas`/`-dom`/`-gl`/`-wgpu`), all filter/effect backends, and both GPU render cores. This is a large, surprising-looking edge set for any _other_ package, but it is **correct and predictable** for the convenience barrel: its stated purpose is "single entry point re-exporting all packages." `sideEffects: false` + thin `export *` re-exports keep it tree-shakable, so the breadth costs nothing to a consumer importing one symbol. No action. | None — flagged only to confirm the breadth is intentional, not accidental coupling. |

No correctness, layering, or boundary violations found:

- **No `@flighthq/sdk` self-import.** Confirmed via grep over `src/`.
- **No inline cross-package types.** `src/` defines zero `interface`/`type`; all types flow through the re-exported `@flighthq/types` and owning packages.
- **Layering respected.** The barrel sits _above_ every layer and reaches down only; it does not introduce any backend→backend or up-a-layer edge of its own (it merely re-exposes packages that each already respect layering).
- **`host-*` correctly excluded.** `host-electron` is the only `host-*` package and is **not** re-exported — matching the rule that host adapters are installed in the host process, not app-facing SDK API.
- **`surface-rs` correctly excluded.** The Rust→wasm mixing package (a drop-in shim, not a TS source package) is the only other workspace package the barrel omits — appropriate.
- **All workspace deps pinned `"*"`.** No fixed or ranged versions.
- **TS build clean (`tsc -b`, exit 0).** No `export *` name-collision errors surfaced.

## Declared vs used

- **Unused declared deps:** none. All 83 declared deps are re-exported by `src/index.ts`.
- **Phantom (used-but-undeclared) deps:** none. Every `@flighthq/*` referenced in `src/` is declared.
- **Coverage:** 83 declared deps ↔ 83 `export * from` lines, exact 1:1. The only workspace packages absent from the barrel are `host-electron` and `surface-rs`, both correctly excluded.
