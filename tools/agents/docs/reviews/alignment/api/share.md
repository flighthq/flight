# API Alignment: @flighthq/share

**Verdict:** Strongly aligned — full type word everywhere, correct sentinels-not-throws, `Readonly<ShareContent>` on every content param, and a backend seam identical to its sibling platform packages; the only judgment call is the `can*` boolean prefix over the SDK's `is*`/`has*`.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `canShareContent` | Boolean-returning function uses the `can*` prefix; the SDK's stated convention for boolean returns is `has*`/`is*`, and the sibling capability-probe in `notification` is `isNotificationSupported`. `can*` is a third boolean prefix in the platform suite. | Either accept `can*` deliberately (it mirrors the Web Share API's `navigator.canShare`, and "can share this specific content" is genuinely a capability _for a given input_, which `is*Supported` does not express) and record it as the suite's convention for input-conditional capability checks, or rename to align with `is*`. Mirroring the native `canShare` is a reasonable reason to keep it — but the choice should be intentional and consistent if other input-conditional probes appear. |
| Info | `getShareBackend` | A `get*` accessor that lazily allocates on first call (`_backend = createWebShareBackend()`), slightly outside the "allocation only in `create*`/`clone*`/`acquire*`" verb rule. | No change — this is the deliberate, cross-package backend-seam convention (identical lazy-init in `getShellBackend`, `getClipboardBackend`, `getStorageBackend`, `getDeviceBackend`, `getNotificationBackend`). Recorded for transparency, not a defect. |

## Clean

- **Full, unabbreviated type word.** `canShareContent` and `shareContent` both carry the `Content` object word; the backend trio carries `Share`. No abbreviation of the type word anywhere (no `shareC`, no `getBackend`).
- **Command verb matches the action+object pattern.** `shareContent` reads as verb+object exactly like sibling commands (`showNotification`, `openExternalUrl`, `writeClipboardText`). The action `share` is also the domain noun, which is unavoidable and unambiguous here.
- **Globally unique names.** No collisions within the package; `createWebShareBackend` is distinct from any sibling, and a future `host-electron` adapter would be `createElectronShareBackend` (distinct).
- **Backend seam matches sibling packages exactly.** The `createWebShareBackend` / `getShareBackend` / `setShareBackend` trio mirrors `shell`, `clipboard`, `storage`, `device`, `platform`, and `notification` one-for-one, including the lazy web default and `set*(null)` reset semantics.
- **Sentinels for expected failure, never throws.** `shareContent` resolves to `false` and `canShareContent` returns `false` when the Web Share API is absent, unsupported, or the user cancels. The web backend wraps every `navigator.share` / `navigator.canShare` call in try/catch and returns the boolean sentinel — no thrown errors for expected-missing cases, matching the seam's documented contract in `types/src/Share.ts`.
- **`Readonly<T>` on object params.** Both `canShareContent(content: Readonly<ShareContent>)` and `shareContent(content: Readonly<ShareContent>)` mark the content object readonly; the `ShareBackend` interface methods do the same. `setShareBackend(backend: ShareBackend | null)` is a stored reference being installed (deliberately mutable ownership transfer), correctly not `Readonly`.
- **No misused teardown verbs.** No `dispose*` / `destroy*` / `acquire*` / `release*` present — correct, as the seam owns no GC roots or non-GC resources beyond a single module-level reference reset via `setShareBackend(null)`.
- **`import type {}` on its own line.** `import type { ShareBackend, ShareContent } from '@flighthq/types';` — no inline `type` mixed with value imports.
- **Cross-package types live in `@flighthq/types`.** `ShareContent` and `ShareBackend` are defined in `packages/types/src/Share.ts`, not inline in the package.
- **Out-param alias-safety N/A.** No `out`/`target` parameters; all functions are value-returning (`boolean` / `Promise<boolean>` / `ShareBackend` / `void`).
- **Module-private state placed correctly.** `let _backend` sits at the bottom of the file after the exported functions, per Source Style.
- **Exports alphabetized** within `share.ts` (`canShareContent`, `createWebShareBackend`, `getShareBackend`, `setShareBackend`, `shareContent`); test `describe` blocks mirror them.
