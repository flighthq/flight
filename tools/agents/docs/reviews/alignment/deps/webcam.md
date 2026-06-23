# Dependency Alignment: @flighthq/webcam

**Verdict:** Clean — a single `import type` from `@flighthq/types`, no phantom or unused deps, no boundary violations; nothing to fix.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (`*`) | Sole runtime dep; pinned `*`, imported `import type` only, types defined in `@flighthq/types/Webcam.ts` (not inline). Correct. | — |
| None | layering / barrel | No `@flighthq/sdk` import; no cross-package or up-a-layer edges. Browser globals (`document`, `navigator`, `FileReader`) are ambient, not deps. `"sideEffects": false`, package stays tree-shakable. | — |

## Declared vs used

- **Declared deps:** `@flighthq/types` (`*`); dev: `typescript`.
- **Used in src:** `@flighthq/types` only (type-only import in `webcam.ts` and `webcam.test.ts`).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none.

The mapping reads exactly as a reader would predict from the package purpose: a command-style platform-suite capability over a swappable `WebcamBackend`, defined as data in the header layer, with a lazily-created web default and no implementation-package dependencies. `packages:check` reports nothing for webcam; judgment adds nothing beyond confirming the type-only edge and the absence of phantom/unused deps.
