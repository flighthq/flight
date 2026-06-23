---
id: permission
title: '@flighthq/permission'
type: new-package
target: permission
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/permission.md
  - tools/agents/docs/reviews/breadth/application-platform.md
depends_on: []
updated: 2026-06-23
---

## Summary

Unified permission capability — query, request, and observe the OS permission state (granted/denied/prompt) for the capabilities that gate behind a grant (geolocation, notifications, camera/microphone, sensors, persistent filesystem, and more) over a single swappable backend seam, so an app drives all permission UX from one place instead of per-capability calls.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable unifier: a single permission vocabulary, a one-shot status read, and a one-shot request, over the web Permissions API. Fills the "no single place to drive permission UX" gap.

Types in `@flighthq/types` first (`Permission.ts`):

- `PermissionKind` — open string union of the gated capabilities, canonical PascalCase-keyed lowercase values matching the web Permissions API names where they exist: `'geolocation' | 'notifications' | 'camera' | 'microphone' | 'sensors' | 'persistent-filesystem' | 'clipboard-read' | 'clipboard-write'` and so on. Open contract, not closed — vendor kinds namespace with a prefix (`'acme.foo'`), bare names reserved for built-ins. Exported `*Kind` string consts for the built-ins: `GeolocationPermissionKind`, `NotificationPermissionKind`, `CameraPermissionKind`, `MicrophonePermissionKind`, `SensorsPermissionKind`, `FilesystemPermissionKind`.
- `PermissionState` — `'granted' | 'denied' | 'prompt' | 'unsupported'`. `'prompt'` is the not-yet-decided web state; `'unsupported'` is the sentinel for "this host has no such permission concept" (distinct from `'denied'`).
- `PermissionBackend` — the seam:
  - `query(kind: PermissionKind): Promise<PermissionState>` — resolves `'unsupported'` rather than throwing when the host lacks the surface.
  - `request(kind: PermissionKind): Promise<PermissionState>` — drives the OS prompt, resolves the resulting state.
  - `isSupported(kind: PermissionKind): boolean` — cheap synchronous capability probe.

Functions in `@flighthq/permission`:

- `getPermissionState(kind): Promise<PermissionState>` — one-shot status read. Resolves `'unsupported'` for unknown/absent kinds (sentinel, not throw).
- `requestPermission(kind): Promise<PermissionState>` — drive the prompt for one capability; resolves the post-prompt state.
- `isPermissionGranted(kind): Promise<boolean>` — convenience boolean over `getPermissionState(kind) === 'granted'`.
- `isPermissionSupported(kind): boolean` — synchronous; reads the active backend.
- Backend seam: `getPermissionBackend()` (lazily creates the web default), `setPermissionBackend(backend | null)` (null restores the web default), `createWebPermissionBackend()` (over `navigator.permissions.query`, guarded for jsdom/insecure contexts; maps web `'prompt'`/`'granted'`/`'denied'` through, returns `'unsupported'` when the name is unknown to the host).

### Silver

Competitive and solid: batch operations, change observation, the prompt-rationale flow, and cross-backend consistency — what a well-regarded mobile/desktop permission layer offers.

Types (`@flighthq/types`):

- `PermissionStatus` — plain snapshot entity: `kind`, `state`, `canRequest` (false once the OS will no longer show a prompt — the "denied forever / blocked" terminal state), `lastChangedAt` (timestamp, `0` when unknown).
- `PermissionRequestOptions` — `rationale?` (string shown by hosts that support a pre-prompt rationale), `openSettingsOnBlocked?` (boolean; when blocked, route to OS app-settings instead of a no-op prompt).
- `PermissionBackend` extended: `subscribe(kind, listener: (state: PermissionState) => void): () => void` (web wraps `PermissionStatus.onchange`; returns a no-op unsubscribe when unsupported), `openSettings(kind): Promise<boolean>` (jump to the OS app-settings page; web returns `false`).
- `PermissionGroup` plain-data descriptor: `kinds: readonly PermissionKind[]` — a named bundle so an onboarding screen can request "location + camera" as one unit.

Functions:

- `getPermissionStatus(kind, out?: PermissionStatus): Promise<PermissionStatus>` — full snapshot with `out`-param reuse (alias-safe).
- `getPermissionStates(kinds: readonly PermissionKind[]): Promise<readonly PermissionState[]>` — batch query, index-aligned with input.
- `requestPermissions(kinds: readonly PermissionKind[], options?): Promise<readonly PermissionState[]>` — batch request, sequential prompts in input order.
- `requestPermissionWithRationale(kind, options): Promise<PermissionState>` — the pre-prompt-rationale flow.
- `isPermissionBlocked(kind): Promise<boolean>` — true when `state === 'denied'` and `canRequest === false` (the terminal denied state that needs a settings deep-link).
- `openPermissionSettings(kind): Promise<boolean>` — deep-link to OS app-settings; `false` when unavailable.
- `onPermissionChange(kind, listener: (state: PermissionState) => void): () => void` — single-callback change subscription returning an unsubscribe (direct-callback form, per the "strict single wiring" rule).
- `createPermissionGroup(kinds): PermissionGroup`, `getPermissionGroupState(group): Promise<PermissionState>` (collapses a group to the weakest member state — `denied` < `prompt` < `granted`).
- Cross-backend consistency contract: documented mapping of every `PermissionState` across web/native/Rust (e.g. iOS "not determined" → `'prompt'`, "restricted" → `'denied'` with `canRequest=false`), so a status means the same thing everywhere — verified by conformance cells.

### Gold

Authoritative / AAA: the canonical permission cell. Exhaustive kind coverage, multi-listener signal groups, the full request-lifecycle and edge cases, performance, tests, docs, and 1:1 Rust parity.

Types (`@flighthq/types`):

- `PermissionKind` exhaustive built-in set covering everything a packaged app gates on: the Bronze set plus `'contacts'`, `'calendar'`, `'reminders'`, `'bluetooth'`, `'nearby-devices'`, `'background-location'`, `'background-refresh'`, `'photos-add'` / `'photos-read'`, `'media-library'`, `'speech-recognition'`, `'screen-recording'`, `'accessibility'`, `'push'`, `'persistent-storage'`, `'midi'`, `'window-management'`, `'idle-detection'` — each with its exported `*PermissionKind` string const, namespaced built-ins only.
- `PermissionScope` — `'foreground' | 'background' | 'always'` (the iOS while-using / always location distinction and the Android background tiers), carried on `PermissionStatus` and acceptable on `request`.
- `Permissions` **event entity** of signals (the opt-in group): `onGrant`, `onDeny`, `onChange`, `onBlock`, each `Signal<(kind, status) => void>`. Mirrors the `Power`/`Sensors`/`Network` event-entity shape exactly.
- `PermissionPolicy` plain descriptor for declarative app requirements: `required: readonly PermissionKind[]`, `optional: readonly PermissionKind[]` — drives a one-call onboarding sweep.

Functions:

- `enablePermissionSignals(): Permissions` + `attachPermissions(permissions)` / `detachPermissions(permissions)` / `disposePermissions(permissions)` — the multi-listener / priority / cancellation path via `@flighthq/signals`, inert until attached, matching the event-capability pattern. (Use this when multiple subsystems must observe; `onPermissionChange` stays the single-callback fast path.)
- `requestPermissionPolicy(policy): Promise<PermissionPolicyResult>` — sweep required+optional in order, returning per-kind states and an overall `satisfied` boolean (all `required` granted).
- `getPermissionStatusAll(out?: PermissionStatus[]): Promise<readonly PermissionStatus[]>` — snapshot every supported kind in one pass (settings-screen driver).
- `requestPermissionScope(kind, scope, options)` / `getPermissionScope(kind): Promise<PermissionScope>` — the foreground→background escalation flow (request foreground first, escalate to background/always per OS rules).
- Full state-machine helpers: `isPermissionPromptable(kind)`, `parsePermissionState(raw): PermissionState` (host-string → canonical), `getWeakestPermissionState(states)` — exhaustive, side-effect-free.
- `createWebPermissionBackend` parity: every kind the web platform exposes mapped (notifications/push via `Notification.permission`, camera/mic via `navigator.permissions` where available with a `getUserMedia` probe fallback, persistent-storage via `navigator.storage.persisted()`, sensors via the device-sensor permission gate), with documented divergences (web has no settings deep-link, no background scope) recorded in the conformance divergence map rather than silently differing.
- Exhaustive colocated tests (one `*.test.ts` per source, alias-safe `out` cases, every `PermissionState`/`PermissionKind` path, a fake backend exercising query/request/subscribe/openSettings), functional/integration coverage of the public import path, and a `flighthq-permission` Rust crate passing the conformance cells for the value-typed `PermissionKind`/`PermissionState` round-trips.
- Performance: status queries cached per-kind with change-driven invalidation through the subscribe seam, so a settings screen polling all kinds does not re-hit the OS each frame.

## Boundaries

- **The capability-local `request*Permission()` calls stay in their own packages.** `requestGeolocationPermission`, `requestNotificationPermission`, `webcam`'s `requestPermission`, `sensors`' `requestPermission` are the "ask right before use" path and are **not** removed or moved. `permission` is the aggregator; it does not absorb the capabilities. (Open question below: whether those delegate down to `permission` internally.)
- **No capability _execution_ lives here.** `permission` reports and drives grants; it never reads a position, shows a notification, or captures a frame. Using a granted capability is the capability package's job.
- **No UI / no prompt rendering.** The OS owns the prompt dialog; `rationale` is a string handed to the host, not a Flight-rendered modal. Custom rationale UI is app code over `@flighthq/displayobject`/`text`, not this package.
- **Native realization lives in `host-*` adapters.** The web backend covers what the browser exposes; `'background-location'`, `openSettings`, scope escalation, and most mobile kinds only become real when `host-capacitor`/`host-electron`/`host-tauri` fill the `PermissionBackend`. The seam ships here; the native fills ship in the host crates.
- **No secure-storage / biometrics overlap.** Touch/Face-ID _authentication_ is a future `@flighthq/biometrics` concern, not a permission grant; `permission` may expose a `'biometrics-usage'` kind for the OS usage grant but does not perform authentication.
- **No `-formats` neighbor** — there is nothing to parse or import; the package is a pure seam + vocabulary.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Do the capability packages delegate down to `permission`, or stay independent?** Option A: `geolocation.requestGeolocationPermission()` internally calls `permission.requestPermission(GeolocationPermissionKind)` — single source of truth, but `geolocation` would then depend on `permission`, inverting the intended arrow. Option B (preferred): both call the _same backend pattern_ independently and `permission` re-derives state via its own backend, keeping zero cross-imports. Confirm B and document that the two surfaces must agree by conformance, not by shared code.
- **`PermissionKind` value casing.** Web Permissions API uses lowercase-hyphen names (`'clipboard-read'`); Flight `*Kind` convention is canonical PascalCase values (`'Bitmap'`). Permissions are a rare case where matching the platform string verbatim removes a mapping seam in the web backend. Proposal: keep the _values_ lowercase-hyphen (platform-aligned) while the exported const identifiers stay PascalCase (`CameraPermissionKind = 'camera'`). Lock this exception before building.
- **Is `'unsupported'` a `PermissionState` member or a separate `null` sentinel?** Folding it into the enum keeps one return type; using `null` matches the "sentinel for absent" rule. Lean: keep it in the enum since callers switch on state exhaustively, and reserve `null` for genuine errors. Confirm.
- **Scope modeling (`foreground`/`background`/`always`).** Should background location be a distinct `PermissionKind` (`'background-location'`) or a `PermissionScope` on `'geolocation'`? OSes model it both ways. Spec proposes _both_ a kind and a scope to cover Android (separate runtime permission) and iOS (escalation on the same authorization). Decide which is canonical.
- **Where does the per-kind cache invalidation live** — in `permission` over the subscribe seam, or pushed by each host backend? Affects whether `getPermissionStatusAll` is cheap. Lean: cache in `permission`, invalidate on `subscribe` change.
- **Clipboard permission overlap.** `clipboard-read`/`clipboard-write` are real web permissions but `@flighthq/clipboard` already guards its own access. Include them as kinds for completeness, or exclude to avoid two ways to ask? Lean: include (observation-only is useful) but document `clipboard` as the action path.

## Agent brief

> Create `@flighthq/permission` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
