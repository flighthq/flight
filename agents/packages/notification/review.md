---
package: '@flighthq/notification'
status: solid
score: 72
updated: 2026-07-13
ingested:
  - packages/notification/src (live)
  - packages/types/src/Notification.ts (live)
  - host-electron/src/electronNotification.ts
  - charter.md
  - status.md
  - prior review (2026-06-25 merge-gate)
---

# notification — Review

Evidence: the **live worktree** `packages/notification/src/` (source + tests), `packages/types/src/Notification.ts`, and `packages/host-electron/src/electronNotification.ts`.

**Supersedes the 2026-06-25 merge-gate review.** That review's `status: solid / score: 40` pairing was a deliberate split: 40 was a *merge-gate* score for integration `b2824e3d8`, whose head did not typecheck because the rich `@flighthq/types` header was dropped in the merge; "solid" was its judgment of the worker's package on its own terms. **The blocker is resolved in the live tree**: `packages/types/src/Notification.ts` now contains the full header — `NotificationRequest` (17 fields), `NotificationAction`, `NotificationChannel`, `NotificationPermission`, `NotificationCapabilities`, `NotificationSchedule`, `ScheduledNotification`, and the 18-method `NotificationBackend` — and `notification.ts`'s imports all resolve. This review re-scores the compiling live package on the AAA depth rubric; the contradictory front matter is resolved to `solid / 72`.

## Verdict

`solid` — 72/100. This is one of the deeper platform-suite packages: a full 18-method backend seam covering permission (tri-state read + request), show-with-identity, update, close/closeAll, local scheduling with repeat cadence + cancel + pending introspection, capabilities feature-detection, launch-notification, and five lifecycle subscriptions (show/click/dismiss/action/reply) — with **two real web backends** (basic `Notification` API and a Service Worker variant that actually delivers action buttons, plus the `notifyServiceWorkerBackendAction` page-side forwarding helper) and an Electron backend implementing the same seam. Sentinels throughout (`''`, `'denied'`, `[]`, `null`, `false`), every DOM touch guarded. What keeps it out of the 80s: the ~95% duplicated backend factories (a charter-blessed extraction, still undone), the channel methods living off-header behind structural casts, a thin `NotificationChannel` (`{id, name}` — no importance/sound/description, so Android-class hosts can't express real channels), no priority/importance or progress vocabulary on `NotificationRequest`, and the lossy `getActiveNotifications` cast. Textbook shape, not yet textbook-complete vocabulary.

## Present capabilities (verified against live source)

- **Seam.** `NotificationBackend` (types) with 18 methods; `getNotificationBackend` lazily creates the web default; `setNotificationBackend(backend | null)` swaps/reverts.
- **Free-function surface — 25 exports**: `showNotification`, `updateNotification`, `closeNotification`, `closeAllNotifications`, `scheduleNotification`, `cancelScheduledNotification`, `getPendingNotifications`, `getActiveNotifications`, `getLaunchNotification`, `getNotificationPermission`, `requestNotificationPermission`, `isNotificationSupported`, `getNotificationCapabilities`, `createNotificationChannel`/`deleteNotificationChannel`/`getNotificationChannels`, `onNotificationShow`/`Click`/`Dismiss`/`Action`/`Reply`, `notifyServiceWorkerBackendAction`, the two backend factories, `getNotificationBackend`/`setNotificationBackend`.
- **Request vocabulary.** `NotificationRequest`: title, id, body, icon, badge, tag, silent, actions (with per-action icon), dir, image, lang, renotify, requireInteraction, timestamp, vibrate, data.
- **Basic web backend** (`createWebNotificationBackend`): live id→Notification map + id→request registry (so `updateNotification` can close-and-reopen with merged fields), per-instance onshow/onclick/onclose wiring, best-effort `setTimeout` scheduler with repeat, honest capabilities (`actions: false`, `listActive: false`).
- **Service-worker backend** (`createServiceWorkerNotificationBackend`): `registration.showNotification` with actions/image, `getNotifications`-based close/listActive, internal `_dispatch*` hooks fed by `notifyServiceWorkerBackendAction` for click/action/reply forwarding from the SW thread, documented SW-side wiring snippet.
- **Electron backend** (`electronNotification.ts`): implements the seam — notify with id registry, capabilities, permission mapped to supported/unsupported; `scheduleNotification`/`updateNotification` honestly report unsupported.
- **Tests.** 66 tests / 26 `describe` blocks, colocated, alphabetized, mirroring the 25 exports.

## Gaps

- **Backend duplication (charter Decision 2026-07-02, still open).** The two web factories each re-declare the five listener `Set`s, `_fire`, `_generateId`, and the entire `setTimeout` scheduler (~230 lines each, ~95% shared). The blessed extraction — one listener-registry + one scheduler primitive, backends as thin wrappers — has not happened.
- **Channels are off-header.** `createNotificationChannel`/`deleteNotificationChannel`/`getNotificationChannels` reach the backend through `getNotificationBackend() as NotificationBackend & {…}` structural casts (`notification.ts` lines 37–40, 532–535, 564–567) instead of seam methods; `NotificationCapabilities.channels` exists but the seam cannot actually be implemented against the header. The legacy-cast pattern the codebase map says not to extend.
- **`NotificationChannel` is a stub vocabulary.** `{id, name}` only — real channel models (Android) carry importance, sound, vibration, description, grouping. A native host cannot express what the type omits.
- **No priority/importance/urgency on `NotificationRequest`**, and no progress/ongoing vocabulary — `updateNotification`'s comment advertises "progress bars" the request type cannot express (charter Open direction 3).
- **Lossy `getActiveNotifications`.** The SW backend returns `{title, tag}` objects typed as full `Readonly<NotificationRequest>` (line 161 vs the `Promise<ReadonlyArray<Readonly<NotificationRequest>>>` header) — the type over-promises (charter Open direction 2).
- **Monkey-patched SW dispatch.** `_dispatchAction/Click/Dismiss/Reply` bolted onto the backend via cast (`SwBackendInternal`, lines 262–286) and read back via cast in `notifyServiceWorkerBackendAction` — works, but is the internal-cast pattern, not a designed seam.
- **Inert reply surface on both included backends** (`subscribeReply` never fires except via SW forwarding with a `text-input` action; the basic backend never fires action or reply) — charter Open direction 1's inert-infrastructure question stands.
- **No Rust `flighthq-notification` crate** (conformance-map gap, charter-tracked).

## Charter contradictions

None. The charter's "What it is" accurately describes the live surface (including "channels" — though the seam realizes them off-header, which the charter's Open directions don't yet name explicitly). The Decision's extraction remains valid and undone.

## Contract & docs fit

- Types-first: the full header now lives in `@flighthq/types`, `import type` only. ✔ (the June defect was an integration artifact, now healed)
- Sentinels-not-throws: consistent (`''`, `'denied'`, `[]`, `null`, `false`); every browser-API touch try/catch-guarded. ✔
- `sideEffects: false`, lazy backend, `_backend` at file bottom, single root export. ✔
- Exports alphabetized; tests mirror exports. ✔
- **Suite-pattern note:** notification uses `on*(listener) → unsubscribe` wrappers rather than the platform-suite "event capability = signal entity with `create*`/`attach*`/`detach*`/`dispose*`" shape, and has no `enable*Signals` group. Several suite packages share this drift (shortcut has a `ShortcutSignals` type; menu has `enableMenuSignals`); the suite-wide event-shape convention is inconsistently realized — a suite-level direction question, not a notification defect.
- Style nit (from the prior review, still present): `// ----` divider comments in `notification.ts`/`notification.test.ts` (e.g. line 11) violate the no-structural-divider rule.

## Structural-fork fit

- **Fork D (backend seam):** textbook.
- **Fork C:** `_repeatMs` closed `switch` over fixed calendar units — legitimate closed system.
- **Subject triad:** stays a thin subject; native delivery via `host-*`. No premature neighbors.

## Candidate open directions

1. **Channels on the seam** — promote `createNotificationChannel`/`deleteNotificationChannel`/`getNotificationChannels` to optional `NotificationBackend` methods (or a capability-gated sub-seam) and enrich `NotificationChannel` toward the canonical Android vocabulary. Header change → design decision.
2. **Request vocabulary completion** — `priority`/`importance`, progress/ongoing (charter Open direction 3), grouping/thread id.
3. **Inert-infrastructure policy** (charter Open direction 1) and **lossy active-notification type** (Open direction 2) still await rulings.
4. **Suite event-shape convention** — signal entity vs `on*` unsubscribe-return; notification should follow whatever the suite-wide ruling is.
