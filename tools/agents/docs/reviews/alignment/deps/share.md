# Dependency Alignment: @flighthq/share

**Verdict:** Clean — a textbook platform-suite command capability; sole runtime dep is `@flighthq/types` (pinned `*`), every cross-package type lives in the header, and there are no unused or phantom dependencies.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (dep, `*`) | Only declared runtime dep; supplies `ShareBackend`/`ShareContent` via `import type`. Pinned `*`, used in both `share.ts` and `share.test.ts`. Correct. | — |
| None | `typescript` (devDep) | Standard build tooling. Correct. | — |
| Info | (no `@flighthq/sdk` import) | Package does not import the SDK barrel. Compliant. | — |
| Info | `"sideEffects": false` + lazy `_backend` | No top-level registration/side effects; backend is lazily created in `getShareBackend`. Tree-shakable and import-side-effect-free per the platform-suite pattern. | — |

Notes the checklist confirms positively:

- **Header layer respected.** `ShareContent` and `ShareBackend` are defined once in `@flighthq/types/src/Share.ts`, not redefined inline in the consumer. The package imports them with `import type` (no runtime weight).
- **Layering.** This is a leaf platform-integration cell — it depends only on the header, reaches across no boundaries, and depends on nothing surprising. The web backend is built in-package (`createWebShareBackend`) over the `navigator.share` global, matching the suite's "web default always lazily available, native host swaps via `set*Backend`" shape.
- **Mapping reads cleanly.** A reader predicting this package's deps from its purpose (a share-sheet seam) would expect exactly `@flighthq/types` and nothing else. The actual deps match that prediction.

## Declared vs used

- **Unused declared deps:** none. `@flighthq/types` is used by `share.ts` and `share.test.ts`; `typescript` is build tooling.
- **Phantom (used-but-undeclared) deps:** none. The only `@flighthq/*` import in `src/` is `@flighthq/types`, which is declared. `navigator` is a DOM global, not a package dependency.
- **Workspace pinning:** `@flighthq/types` pinned `"*"` per convention.

`npm run packages:check` passes (86 packages valid) with no share-specific findings; this report adds judgment only — the package is fully aligned.
