---
package: '@flighthq/notification'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/notification

The review (solid, 86/100) confirms two builder passes closed nearly every Bronze/Silver gap from the prior maturation roadmap. What remains splits cleanly: a short set of within-package, non-design, non-breaking cleanups (Recommended), and a larger set that is cross-package, breaking, or waiting on a charter decision (Backlog). Six candidate Open directions from the review are routed to the charter, not into Recommended — they each need a North-star / Boundary ruling the stub charter has not yet made.

## Recommended

Sweep-safe: within `@flighthq/notification` (or an additive, non-breaking touch to its own `@flighthq/types/Notification.ts` header), no cross-package coupling, no public-signature break, no open design decision.

- **Wire `_dispatchReply` in the service-worker backend so `onNotificationReply` can fire.** The review's first hard gap: `subscribeReply`/`onNotificationReply` exist but `createServiceWorkerNotificationBackend` defines only `_dispatchAction/_dispatchClick/_dispatchDismiss`, and `notifyServiceWorkerBackendAction` routes only `action`/`click`. Add the `_dispatchReply` hook and a reply branch to the forwarder so a `text-input` action's reply text round-trips on the SW path. This is making _already-shipped_ surface honest, not new surface — the _policy_ question of whether inert host-ahead surface should exist at all is the separate Open direction (routed below). — review.md "SW inline-reply can never fire"
- **Add `'provisional'` to the `NotificationPermission` union in `@flighthq/types`.** Additive, non-breaking string-union widening for the Apple provisional-grant case; no behavior change on the web backend (it never returns it). Closes the one named permission-state gap. — review.md gaps (final bullet) / roadmap Gold "permission flow polish"
- **`let` → `const` on the `subscribe*` listener registries.** `_clickListeners` et al. are `new Set(...)` once and never reassigned; the review flags the `let` as trivial cleanliness. Local, mechanical. — review.md "minor contract frictions" #1
- **Drop the structural-divider comments from `notification.test.ts`.** The test file uses `// ----- Helpers -----` / per-function banners that the source-style rule says to avoid; names and `describe` boundaries already carry the structure. Cosmetic, sweep-safe. — review.md "minor contract frictions" #3

## Backlog

Parked — each is cross-package, a public-signature reshape, or waiting on an Open direction the charter must settle first.

- **`getActiveNotifications` lossiness — `ActiveNotification` summary type vs. narrowed return vs. accept-the-cast.** Touches the `@flighthq/types` header _shape_ and is an explicit fork (Open direction #6). Routed to the charter; not a sweep. — review.md gaps / open direction 6
- **`progress?` / ongoing-notification field.** The one canonical rich field still missing, and `updateNotification`'s own doc promises it — but in-or-out is a Boundary decision (Open direction #3) and it widens the shared header. Charter first. — review.md gaps / open direction 3
- **`enableNotificationSignals` opt-in group.** Pulls a `@flighthq/signals` dependency and is a direction decision (Open direction #4); must stay behind the opt-in `enable*` to preserve tree-shaking. Cross-package + design. — review.md gaps / open direction 4
- **Promote the channel trio onto the `NotificationBackend` interface.** `createNotificationChannel` et al. currently reach the backend through structural casts. Putting the optional methods on the header seam type (vs. documenting them as intentionally off-interface) is an API-shape fork (Open direction #5). Charter first. — review.md "minor contract frictions" #2 / open direction 5
- **Replace the `SwBackendInternal` `_dispatch*` monkey-patch with a typed companion handle.** The cleaner shape (`createServiceWorkerNotificationBackend` returning `{ backend, dispatch }`) is a public-return reshape, not a within-body cleanup — it changes the factory's signature and the `notifyServiceWorkerBackendAction` contract. Pre-release-safe to break, but it is an API-shape decision, not a sweep. — review.md "minor contract frictions" #4
- **`flighthq-notification` Rust crate.** Cross-tier: mirror the seam (`notify`/`get_permission`/`close`/`schedule`/`get_pending`/`get_active`/`update`/`on_*` over a `NotificationBackend` trait, native default behind the `native` feature) and add it to the conformance map + parity matrix. Out of this package's worktree scope. — review.md gaps / roadmap Gold "Rust parity"
- **Native host coverage (Electron/Tauri/Capacitor).** `host-electron` notification work lives in a separate package; full action/reply/close/toast coverage and the Tauri/Capacitor/Cordova matrix are cross-package and host-owned. — review.md gaps / roadmap Gold "exhaustive host backends"
- **Stale admin-doc touch-ups (user-gated).** The Package Map one-liner in `tools/agents/docs/index.md` still reads "OS notifications and permission" (52/100-era, undersized), and `structural-forks.md`'s register does not yet track notification's built state (a fork-D / fork-E candidate entry). Both are edits to shared admin docs outside this package's cell — surfaced, not swept. — review.md "where the contract / admin docs need revising"

### Routed to the charter's Open directions (not edited here)

Surfaced for a direction pass — the stub charter must rule before these become work. Per the skill, the design forks/cross-package items are noted, not folded into Recommended:

1. **Is "web-tier authoritative" the bar, or native parity in scope?** (review open direction 1) — sets the North star and the home for the native-host / Rust backlog items.
2. **Inert-infrastructure policy** (open direction 2) — whether host-ready-but-currently-dead surface (`subscribeReply`, lossy `getActiveNotifications`) is the blessed posture. Governs the reply-wiring intent and the `getActiveNotifications` backlog item.
3. **`progress?` / ongoing notifications in or out** (open direction 3).
4. **Signals opt-in** (open direction 4).
5. **Channel methods on the `NotificationBackend` interface** (open direction 5).
6. **Lossy `getActiveNotifications` resolution** (open direction 6).

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._
