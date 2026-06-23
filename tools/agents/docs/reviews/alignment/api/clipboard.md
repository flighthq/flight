# API Alignment: @flighthq/clipboard

**Verdict:** Strongly aligned — full type words, correct sentinels, and a backend seam identical to its sibling platform packages; the only blemish is inconsistent initialism casing (`Html` vs `RTF`).

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `readClipboardRTF`, `writeClipboardRTF`, `ClipboardBackend.readRTF`/`writeRTF` | Initialism casing is inconsistent with the package's own `Html` functions. `Html` is title-cased while `RTF` is fully uppercased, so two equivalent format initialisms read differently in the same barrel. | Pick one initialism convention package-wide. The SDK title-cases initialisms elsewhere (`dataUrl`, `Html`), so rename to `readClipboardRtf` / `writeClipboardRtf` and `readRtf` / `writeRtf` on the backend type for symmetry. |
| Info | `getClipboardBackend` | A `get*` accessor that lazily allocates on first call (`_backend = createWebClipboardBackend()`), which sits slightly outside the "allocation only in `create*`/`clone*`/`acquire*`" verb rule. | No change — this is the deliberate, cross-package backend-seam convention (identical lazy-init in `getShellBackend`, `getStorageBackend`, `getDeviceBackend`, `getPlatformBackend`). Recorded for transparency, not as a defect. |

## Clean

- **Full, unabbreviated type word everywhere.** Every exported function carries `Clipboard` (`readClipboardText`, `hasClipboardImage`, `writeClipboardBookmark`). No abbreviations of the type word.
- **Globally unique names.** No collisions across the package; the only sibling overlap is `host-electron`'s `createElectronClipboardBackend`, which is correctly distinct from `createWebClipboardBackend`.
- **Backend seam matches sibling packages exactly.** The `createWebClipboardBackend` / `getClipboardBackend` / `setClipboardBackend` trio mirrors `shell`, `storage`, `device`, `platform`, and `notification` one-for-one, including the lazy web default and `set*(null)` reset semantics.
- **Sentinels for expected failure, no throwing.** Reads resolve to `''` (text/HTML/image/RTF) or `null` (bookmark); writes/clear resolve to `false` when access is denied or the API is absent. No thrown errors for expected-missing cases; the web backend wraps every browser call in try/catch and returns the sentinel.
- **Boolean accessors use `has*`.** `hasClipboardText` / `hasClipboardImage` correctly use the boolean prefix; `get*` is reserved for the backend accessor.
- **No misused teardown verbs.** No `dispose*` / `destroy*` / `acquire*` / `release*` present; `clear*` is a domain operation, not a teardown verb, and is named appropriately.
- **`import type {}` on its own line.** `import type { ClipboardBackend, ClipboardBookmark } from '@flighthq/types';` — no inline `type` mixed with value imports.
- **Cross-package types live in `@flighthq/types`.** `ClipboardBackend` and `ClipboardBookmark` are defined in `packages/types/src/Clipboard.ts`, not inline.
- **`Readonly<T>` not applicable.** All parameters are primitives (`string`) or the nullable backend reference for `setClipboardBackend`; no object-shaped params that should be `Readonly`.
- **Out-param alias-safety N/A.** All functions are async value-returning; there are no `out`/`target` parameters.
- **Exports alphabetized** within `clipboard.ts` (order:check clean).
