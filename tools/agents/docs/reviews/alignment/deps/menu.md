# Dependency Alignment: @flighthq/menu

**Verdict:** Clean — single `@flighthq/types` dependency (type-only), no violations; canonical platform-suite shape.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| — | — | No issues found. `packages:check` passes; deps minimal and correct; no `@flighthq/sdk` import; cross-package types (`MenuBackend`, `MenuItemTemplate`) live in `@flighthq/types/Menu.ts`, not redefined inline; `@flighthq/types` pinned `"*"` and imported via `import type`; `"sideEffects": false`. | — |

Notes beyond `packages:check`:

- The only production dependency is `@flighthq/types`, consumed exclusively through `import type { MenuBackend, MenuItemTemplate }` in both `src/menu.ts` and `src/menu.test.ts`. It pulls no runtime weight, so the package tree-shakes to nothing on import.
- The dependency mapping is predictable from the package's role: a platform-suite **command capability** (backend seam + `get*/set*Backend` + `createWeb*Backend` + an `on*` event subscriber) needs only the header layer. Its `package.json` is byte-for-byte identical in deps/devDeps to its siblings `clipboard` and `dialog`, confirming this is the canonical shape for the capability class.
- No cross-package, no host, no renderer, and no "up a layer" edges — none expected for this package, and none present.

## Declared vs used

- **Unused declared deps:** none. `@flighthq/types` is used.
- **Phantom (used-but-undeclared) deps:** none. The only import in `src/` is `@flighthq/types` (declared). `typescript` is the sole devDep and is used by the build.
