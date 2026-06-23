# Dependency Alignment: @flighthq/clipboard

**Verdict:** Clean — exactly one declared runtime dependency (`@flighthq/types`), matched 1:1 by the only `@flighthq` import, with no phantom, unused, or boundary-violating edges.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (`"*"`) | Sole runtime dep; pinned `"*"` per workspace convention; imported only as `import type` so it pulls zero runtime weight. `"sideEffects": false` and the value code is all free functions with a lazy `_backend`, so the package tree-shakes cleanly. | None. |
| Info | dependency mapping | Edge is fully predictable from purpose: a platform-suite command capability over a swappable `ClipboardBackend` needs the header layer for the backend trait + `ClipboardBookmark`, and nothing else. No web/native runtime dep — the web default backend is built inline against ambient DOM globals (`navigator.clipboard`, `ClipboardItem`, `Blob`, `FileReader`), exactly as the platform-suite "web backend always lazily available" pattern intends. | None. |

Cross-checks that passed and warrant no row:

- Does **not** import `@flighthq/sdk` (the barrel).
- Cross-package types (`ClipboardBackend`, `ClipboardBookmark`) live in `@flighthq/types` (`packages/types/src/Clipboard.ts`), not redefined inline in this consumer.
- No cross-boundary or "upward" layer reach; clipboard is a leaf platform capability and depends only on the header.
- Test file (`clipboard.test.ts`) imports only `@flighthq/types` and the local module — no undeclared test-only package deps.
- `npm run packages:check` passes for all 86 packages; this audit adds judgment only, nothing beyond it to flag.

## Declared vs used

- **Unused declared:** none. `@flighthq/types` is used; `typescript` (devDependency) is the build toolchain.
- **Phantom (used but undeclared):** none. The only `@flighthq` import is `@flighthq/types`, which is declared. Remaining identifiers (`navigator`, `Clipboard`, `ClipboardItem`, `Blob`, `FileReader`, `fetch`) are ambient DOM/web globals, correctly not declared as package deps.
