# Dependency Alignment: @flighthq/loader

**Verdict:** Clean — two minimal, correct dependencies that exactly match the package's purpose; nothing to fix.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/signals` | Used for `createSignal` / `emitSignal` (runtime). Declared, pinned `"*"`, value import as required for runtime use. | — |
| None | `@flighthq/types` | Used for the `ResourceLoader` contract via `import type`. Declared, pinned `"*"`. | — |
| Info | `ResourceLoaderInternal` (inline interface) | Not a cross-package type redefinition: it `extends ResourceLoader` to add package-private mutable slots (`items`, `loaded`, `started`, `total`). The public contract still lives in `@flighthq/types`. Legitimate package-private extension. | — |
| Info | `loader as ResourceLoaderInternal` cast | Uses the legacy `internal.ts`-style cast to reach private state rather than runtime slots. Style/design observation, not a dependency-hygiene issue. | (out of scope; consider runtime slots if revisited) |

`npm run packages:check` passes (86 packages valid). Beyond that gate: no `@flighthq/sdk` import; no cross-boundary or "upward" edges; both deps are runtime/type-correct and tree-shakable (`"sideEffects": false`). The dependency mapping is predictable — a group loader that emits progress/complete/error signals over a typed contract needs exactly `signals` + `types`.

## Declared vs used

- **Unused declared:** none. Both `@flighthq/signals` and `@flighthq/types` are imported in `src/`.
- **Phantom (used-but-undeclared):** none. The only `@flighthq/*` imports in `src/` are `signals` and `types`, both declared. (`@flighthq/signals` also appears in the test file, which is covered by the same declared dependency.)
- **devDependencies:** `typescript` only — appropriate.
