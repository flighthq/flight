# Dependency Alignment: @flighthq/shortcut

**Verdict:** Clean — the single declared dependency (`@flighthq/types`) is the only thing imported, type-only, pinned `"*"`, and the dependency mapping is exactly what a reader would predict for a platform-suite command capability.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| — | `@flighthq/types` | None. Imported `import type`-only for `ShortcutBackend`, which is correctly defined in `@flighthq/types/src/Shortcut.ts` (the header layer), not inline. tsconfig `references` lists `../types` matching the runtime dep. | None |
| Info | (no `@flighthq/sdk` import) | Verified: package does not import the barrel. | None |
| Info | `"sideEffects": false` + module-level state | The lazy `let _backend` and `getShortcutBackend()` lazy-init are read/write _inside functions_, not executed at module top level, so the package stays genuinely import-side-effect-free. Matches the suite's "no eager backend registration" rule. | None |

## Declared vs used

- **Declared:** `@flighthq/types` (dep, pinned `"*"`), `typescript` (devDep). Both used.
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. The only non-relative import across `src/` (incl. the test file) is `@flighthq/types`, which is declared.
- **Type-only weight:** the sole import is `import type { ShortcutBackend }` on its own `import type {}` line in both `shortcut.ts` and `shortcut.test.ts` — pulls zero runtime weight; the package emits no `@flighthq/types` runtime dependency.

`npm run packages:check` passes (86 packages valid); this audit adds only the judgment confirmations above — no additional issues found.
