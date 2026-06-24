---
package: '@flighthq/notification'
status: solid
score: 86
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/notification.md
  - source
---

# Review: @flighthq/notification

## Verdict

**solid — 86/100.** Two builder passes turned a minimal seam (the prior depth review's 52/100) into a genuinely capable web-tier notifications library. Every gap the depth review flagged as highest-value — tri-state permission introspection, id-based identity + close/close-all, scheduling, rich content, lifecycle events, and a service-worker backend that actually delivers action buttons — is now present and tested. The package is a faithful, throw-free, side-effect-free implementation of the platform command-capability pattern. It is not yet 92/100 (the worker's self-estimate): the score sits below that because of the residual type-vs-behavior gaps (`getActiveNotifications` returns lossy partials, SW inline-reply infrastructure that can never fire) and because cross-tier maturity (native host coverage, Rust crate, signals opt-in) is still entirely deferred — and the charter is a stub, so the "is web-tier authoritative _enough_?" question is undecided rather than answered.

## Present capabilities

All grounded in `67dc46d6:packages/notification/src/notification.ts` (the realized public surface is confirmed in `dist/notification.d.ts` — 26 exports) and the cross-package types in `67dc46d6:packages/types/src/Notification.ts`.

**Permission & support.**

- `getNotificationPermission(): NotificationPermission` — restores the canonical tri-state (`'default' | 'granted' | 'denied'`), the depth review's #1 ask.
- `requestNotificationPermission(): Promise<NotificationPermission>` — also tri-state. This is the pass-2 breaking change from `Promise<boolean>`; `'denied'` doubles as the host-unavailable sentinel.
- `isNotificationSupported()`, `getNotificationCapabilities(): NotificationCapabilities` — the capability descriptor replaces ad-hoc `isSupported()` guessing with a plain-data branch surface.

**Show / identity / lifecycle.**

- `showNotification(request): Promise<string>` — returns an id (echoes `request.id` or generates one), closing the depth review's "no handle" gap. Returns `''` on not-granted / unsupported.
- `closeNotification(id)`, `closeAllNotifications()`, `updateNotification(id, partial): Promise<boolean>`. The web `updateNotification` simulates via close + re-open against a `_requests` registry so the partial merges onto the retained original.
- `onNotificationShow / onNotificationClick / onNotificationDismiss / onNotificationAction / onNotificationReply` — full lifecycle subscription set over the backend `subscribe*` methods, each returning an unsubscribe closure. The basic web backend wires per-instance `onclick/onshow/ onclose` so clicks and dismisses actually fire (no longer no-ops, contra the depth review).

**Scheduling.**

- `scheduleNotification`, `cancelScheduledNotification`, `getPendingNotifications` — best-effort `setTimeout` scheduler on web (documented as cleared on reload), with a `_repeatMs` cadence map for `minute|hour|day|week|month|year` repeats.

**Channels (Android-class).**

- `createNotificationChannel`, `deleteNotificationChannel`, `getNotificationChannels` — optional backend methods accessed via guarded `backend.method?.(...)` casts, no-op / `[]` on web.

**Backends.**

- `createWebNotificationBackend()` — the lazy default; fully guarded for jsdom / non-secure / absent `Notification`, every touch in try/catch, sentinel returns throughout.
- `createServiceWorkerNotificationBackend(registration)` — the pass-2 addition that closes the largest type-vs-behavior gap: it uses `registration.showNotification`, so action buttons can be delivered. Paired with `notifyServiceWorkerBackendAction(backend, message)`, the page-side forwarder for the SW `notificationclick` → `postMessage` → page round-trip (the canonical OneSignal/Workbox pattern, documented inline). `getActiveNotifications` reads `registration.getNotifications()`.
- `getNotificationBackend` / `setNotificationBackend(backend | null)` — the seam with lazy web default and `null`-to-reset, matching the platform-suite command grammar exactly.

**Type header.** `@flighthq/types/Notification.ts` carries the full design surface: `NotificationRequest` (widened to ~30 rich fields — image, badge, sound, vibrate, priority, channelId, group/groupSummary, interruptionLevel, requireInteraction, ongoing, renotify, autoCancelMs, …), `NotificationAction` (incl. `type: 'button' | 'text-input'` + `inputPlaceholder` for inline reply), `NotificationChannel`, `NotificationCapabilities`, `NotificationSchedule`, `ScheduledNotification`, the three string-union enums (`Permission`/`Priority`/`Importance`), and the `NotificationBackend` seam. This is correctly header-first.

**Tests.** `notification.test.ts` — 64 tests, 26 alphabetized `describe` blocks mirroring the 26 exports exactly (verified). Covers the SW backend (9), `notifyServiceWorkerBackendAction` (4), `updateNotification` (3), tri-state permission (2), plus the full surface. Status-doc claim of "64 tests covering all 25 functions" verified (the true export count is 26; the claim undercounts).

## Gaps vs an authoritative notifications library

Most of the depth review's gaps are now closed. What remains:

- **`getActiveNotifications` is lossy on every backend.** Web returns `[]`; SW returns `{ title, tag }` partials cast to `Readonly<NotificationRequest>`. The type promises a full request; the runtime delivers two fields. Honest given the platform constraint (the Notification API exposes nothing more), but a caller cannot round-trip a delivered notification's body/icon/data — worth a documented narrowing or an explicit `ActiveNotification` summary type rather than a lossy cast.
- **SW inline-reply can never fire.** `subscribeReply` / `onNotificationReply` exist, but the SW backend defines only `_dispatchAction / _dispatchClick / _dispatchDismiss` — no `_dispatchReply`, and `notifyServiceWorkerBackendAction` only routes `action`/`click`. The reply listener registry is inert on every shipped backend. This is honest infrastructure-ahead-of-host, but it is dead surface until a native host arrives.
- **`progress?` field absent.** `updateNotification` is documented as "useful for progress bars," yet `NotificationRequest` has no `progress?: { value, max, indeterminate? }`. The canonical ongoing/download-progress notification cannot be expressed.
- **No `enableNotificationSignals` opt-in.** Lifecycle is direct-callback only. Per the codebase-map signals rule, multi-listener loose notification (click/action/dismiss across the public API) is a candidate for an opt-in signal group; deferred for the cross-package `@flighthq/signals` dependency.
- **No native host coverage in this package's orbit.** `host-electron` notification work exists in the same bundle (the SW patch touches it) but is its own package; Tauri/Capacitor are unbuilt.
- **No Rust crate.** `flighthq-notification` does not exist yet. The conformance map should track the seam (`notify`/`get_permission`/`close`/`schedule`/`get_pending`/`get_active`/`update`/`on_*` over a `NotificationBackend` trait, native default behind the `native` feature).
- **`'provisional'` permission** (Apple) not in the `NotificationPermission` union — minor, native-only.

## Charter contradictions

None — the charter's only authored section is "What it is" (system/OS notifications over a swappable web/native backend), and the package matches it precisely. North star, Boundaries, Decisions, and Open directions are all `TODO`, so there is nothing else to contradict. The silence is itself the finding: see Candidate open directions.

## Contract & docs fit

**Lives up to the contract — strongly:**

- **Types in `@flighthq/types` first** — the entire shape (request, backend, enums, capabilities) is in `Notification.ts`; the package imports them. Header-layer rule satisfied.
- **Full unabbreviated names** — every export carries the `Notification` type word (`getNotificationPermission`, `scheduleNotification`, `onNotificationDismiss`, …). Globally self-identifying.
- **Sentinels, not throws** — `''`, `false`, `null`, `[]`, no-op on every unsupported path; the `notify` comment in the type header explicitly frames denial as an expected outcome, not an error.
- **Single root export** — `index.ts` is a thin `export * from './notification'`; `package.json` has one `.` entry and `"sideEffects": false`; `_backend` is lazily created on first `getNotificationBackend`, never at module top level.
- **Alphabetized exports + mirrored tests** — confirmed across source and the 26 describe blocks.
- **Command-capability grammar** — `get*/set*/createWeb*Backend` + `on*` over backend `subscribe*` is exactly the platform-suite shape the codebase map prescribes for a command capability that also receives events.

**Minor contract frictions:**

- **`Readonly<>` on internal collections.** `_requests`/`_live`/`_scheduled` store mutable values; the retained-original `_requests` map holds `Readonly<NotificationRequest>` (good), but `subscribe*` registries reassign `let _clickListeners = new Set(...)` where `const` suffices — they are never reassigned. Trivial cleanliness, not a violation.
- **Channel methods via structural casts.** `createNotificationChannel` etc. reach the backend through `getNotificationBackend() as NotificationBackend & { createNotificationChannel?: ... }` rather than putting the optional methods on the `NotificationBackend` interface. The seam type already lists the core methods; the channel trio living off-interface is a small header gap — either promote them to optional `NotificationBackend` members or document why they are intentionally out-of-band.
- **Structural-divider comments in the test file** (`// ----- Helpers -----`, per-function banners). The source style rule says avoid these; the test file uses them heavily. Cosmetic, sweep-safe.
- **Internal `_dispatch*` hooks attached by cast.** `createServiceWorkerNotificationBackend` bolts `_dispatchAction/_dispatchClick/_dispatchDismiss` onto the returned object via a `SwBackendInternal` cast, and `notifyServiceWorkerBackendAction` reads them back by cast. This is the legacy `internal.ts` pattern the codebase map warns against ("do not extend it; prefer runtime slots"). For a backend factory there is no runtime object to hang a slot on, so the cast is somewhat forced — but a typed companion handle (returning `{ backend, dispatch }`) would be cleaner than monkey-patching the backend and re-reading it through structural casts in a separate free function.

**Where the contract / admin docs need revising (candidate revisions, user-gated):**

- **Package Map line is now stale.** `tools/agents/docs/index.md` lists notification as "OS notifications and permission" — accurate for the 52/100 era, undersized for what shipped (rich content, scheduling, channels, lifecycle, SW backend, capability descriptor). Candidate: widen the one-liner to match the realized scope.
- **`structural-forks.md` register** does not track notification's built state; with the package now solid and the SW backend a distinct delivery tier, it is a candidate entry under the seam-dimension (fork D) and the bedrock track (fork E).

**Structural-forks fit (applied):**

- **Fork B (closed union vs registry).** `_repeatMs` is a closed `switch` over the six repeat cadences. This is a tight, genuinely closed system (calendar units do not grow), evaluated once per reschedule — not a hot loop. The exception clause in fork B applies; no registry needed. Clean.
- **Fork D (runtime backend seam).** The `*Backend` + `set*Backend` seam is textbook fork-D. The SW backend is a _second web backend_ alongside the basic one — a small, healthy plurality that justifies the seam without a `-formats`/`-backend` split (notification is a thin subject, not a triad).
- **No mis-homed type, no hot-loop feature inflation.** Types are correctly in `@flighthq/types`; there is no per-frame path to inflate. The only fused-layer smell is the channel-methods-off-interface noted above.

## Candidate open directions

The charter is a stub; these are the questions a future direction pass must settle, each surfaced because the review had to assume an answer:

1. **Is "web-tier authoritative" the bar, or is native parity in scope for the charter?** The package is excellent on web but has zero native delivery of its own. The charter should state whether notification's North star is "the seam + a complete web backend" (native lives in `host-*`) or "feature-complete across hosts."
2. **Inert infrastructure policy.** `subscribeReply` and `getActiveNotifications` ship surface that no included backend can fulfill. Is shipping host-ready-but-currently-dead API the blessed posture, or should the web tier expose only what it can deliver and let native hosts widen the type? This recurs across the platform suite and is a fork-worthy decision.
3. **`progress?` / ongoing notifications** — in or out? It is the one canonical rich field still missing, and `updateNotification`'s own doc promises it.
4. **Signals opt-in** — does notification get an `enableNotificationSignals` group, or stay callback-only? (Cross-package `@flighthq/signals` dependency; a direction decision, not a sweep.)
5. **Channel methods on the `NotificationBackend` interface** — promote the optional trio onto the header type, or keep them as documented off-interface extensions? A small but real API-shape fork.
6. **Lossy `getActiveNotifications`** — accept the partial cast, introduce an `ActiveNotification` summary type, or narrow the return? Determines whether the type tells the truth.
