---
package: '@flighthq/share'
updated: 2026-08-08
by: principal
---

# share — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/share/src/`, `packages/types/src/Share.ts`, and the one shipped native
adapter on 2026-08-08. A file:line here is a claim about this tree, not about a session.

- **A source comment advertises options that no longer exist.** `shareContent`'s comment says "pass
  options to control presentation on native hosts (parentWindow, sourceRect on iPad)"
  (`share.ts:134-135`), but `ShareOptions` carries only `chooserTitle` and `excludedActivityTypes`
  (`types/src/Share.ts:20-25`). Neither field is anywhere in `packages/`.
- **The web backend ignores `ShareOptions` entirely** — the parameter is `_options` and unread in both
  `share` and `shareWithResult` (`share.ts:52`, `:65`). Both surviving fields are native-only, so
  nothing in the type is honorable on the web.
- **Only `shareContentWithResult` returns a `ShareResult`** (`share.ts:145`). `shareText`, `shareUrl`,
  and `shareFiles` (`:163-175`) are boolean-only, so the result-carrying path is reachable only
  through the general entry point. Whether the twins earn their surface is still an open decision.
- **`hasShareContentFields` checks presence, not validity** (`share.ts:111-117`). A malformed `url`
  passes the gate and surfaces later as an ordinary `false` from `navigator.share`. Deliberate under
  the sentinel-not-throw contract; recorded so it is not rediscovered as a bug.
- **Native coverage is Capacitor only.** `createCapacitorShareBackend`
  (`host-capacitor/src/capacitorShare.ts`) is the sole host adapter — no Electron, no Tauri. Two
  consequences carry into this cell's contract: Capacitor's `canShare` is async while the seam's
  probes are synchronous, so `isAvailable` and `canShare` both report **false** until a prefetch
  resolves (`capacitorShare.ts:5-9`, `:23-27`); and portable `ShareFile` data URLs cannot cross
  Capacitor's file-URI `files` field, so a files-only payload reports `canShare` false there.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The headline false claim: `ShareOptions`
  does **not** forward-declare `parentWindow` / `sourceRect` — `types/src/Share.ts:20-25` has neither,
  and the only trace left is the stale source comment now recorded above. Also dropped the
  `isShareContentValid` name (it is `hasShareContentFields`, `share.ts:111`) and the `_signalSubscriptions`
  dead-stub thread (removed; `_attachedSignals` is the single registry, `share.ts:180`).
- **2026-07-30** — Live-tree closure audit: `_signalSubscriptions` confirmed gone, the share types
  confirmed present in `@flighthq/types`, and the charter's stale names corrected.
- **2026-06-25** — Casing fix `shareFileTodomFile` → `shareFileToDomFile` and its lone callsite.
- **2026-06-24** — Share matured: portable `ShareFile` descriptors, `ShareResult` with the
  cancel-vs-failure distinction, `ShareOptions`, the `shareContentWithResult` signal-emitting path,
  and a web backend that converts data URLs to DOM `File`s at the boundary.
