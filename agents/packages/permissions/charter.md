---
package: '@flighthq/permissions'
crate: flighthq-permissions
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# permission — Charter

## What it is

`@flighthq/permissions` is the **OS-permission cell** of the platform-integration suite — a single place to query and request the runtime permissions a capability needs (camera, microphone, geolocation, notifications, clipboard, persistent storage, …) before using it. The capability packages (`webcam`, `geolocation`, `notification`, `clipboard`) each front a specific device; permission is the shared "may I?" layer over all of them, so an app checks and prompts through one uniform API instead of each capability's ad-hoc request path.

## North star

The complete permission surface: query the current state of a named permission, request it (triggering the OS prompt), and observe changes — over a `get/set/createWebPermissionBackend` seam so a native host maps the same names to its OS permission model. Plain string permission names + a three-state result (`granted`/`denied`/`prompt`), flat async functions, sentinels not throws.

## Boundaries

- **Platform-suite command capability.** Flat free functions over a swappable `PermissionBackend`; web backend always available, lazy, import-side-effect-free. `get/set/createWebPermissionBackend`. Web backend queries via the Permissions API and maps `request*` to each permission's concrete web request path; unknown/unsupported names return a `'prompt'`/sentinel rather than throwing.
- **Depends on `@flighthq/types`** (+ the DOM in the web backend). No display, no device I/O of its own — it only reports and requests permission *state*; actually using the camera/mic/location is the respective capability package's job.
- **State + request, not the capability.** permission never opens a stream, reads a location, or shows a notification; it answers "granted/denied/prompt" and triggers the prompt. The capability packages consume it.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Async command capability, three-state result.** `getPermissionState(name): Promise<PermissionState>` (query, non-prompting) and `requestPermission(name): Promise<PermissionState>` (may trigger the OS prompt). `PermissionState = 'granted' | 'denied' | 'prompt'` (the Permissions-API vocabulary; `'prompt'` = not yet decided). `PermissionName` = open string union (`'camera'|'microphone'|'geolocation'|'notifications'|'clipboard-read'|'clipboard-write'|'persistent-storage'|'push'|'midi'|'screen-wake-lock' | (string & {})`). Async because the web Permissions API and every request path are promise-based.
- **[2026-07-10] Web backend maps query + request per permission.** Query goes through `navigator.permissions.query({ name })` where supported; `request*` routes each name to its real web trigger (notifications → `Notification.requestPermission`, camera/mic → `getUserMedia`, geolocation → a one-shot position request, persistent-storage → `navigator.storage.persist`, …). A name with no mapping, or a missing API, resolves to `'prompt'`/`'denied'` sentinel — never throws.
- **[2026-07-10] `PermissionName`/`PermissionState`/`PermissionBackend` in `@flighthq/types`.** Header owns the shapes; functions carry the `Permission` name.

## Open directions

1. **Change signal (event capability).** An opt-in `enablePermissionSignals`/`onPermissionChange` over the Permissions API's `change` event, so an app reacts when the user revokes access mid-session — the event-capability half over the command core.
2. **Batch query.** `getPermissionStates(names[])` convenience for a startup permissions audit.
3. **Capability-package integration.** Thin helpers in `webcam`/`geolocation`/`notification` that call `requestPermission` before acting, so callers get one-call "ensure + use".
