---
package: '@flighthq/permissions'
status: partial
score: 68
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# permissions — Review

## Verdict

`partial` — **68/100** (high partial). The command core — `getPermissionState`/`requestPermission` over the seam trio, three-state result, sentinels everywhere — is exactly the charter's Decisions and is well tested. But the web backend's **request** side covers only 5 of the 10 built-in `PermissionName`s, and both charter Open directions that make this the suite's real "may I?" gate (change observation, batch query) are unbuilt.

## Present capabilities

All in `packages/permissions/src/permission.ts` (four exports), types in `packages/types/src/Permission.ts`:

- **Command pair per the Decision** — `getPermissionState(name)` (non-prompting query) and `requestPermission(name)` (may prompt), both `Promise<PermissionState>` with `PermissionState = 'granted' | 'denied' | 'prompt'`.
- **Seam trio** — `getPermissionBackend` (lazy web default), `setPermissionBackend(backend | null)`, `createWebPermissionBackend`. Import-side-effect-free; deps exactly `@flighthq/types`.
- **Web query path** — `navigator.permissions.query` with a per-name descriptor table (`_permissionQueryDescriptors`) and layered fallbacks: rejected/unqueryable → per-name fallback; `notifications` readable synchronously via `Notification.permission` (`'default'` → `'prompt'`); everything else → `'prompt'` sentinel. Never throws.
- **Web request routers** (`_permissionRequestRouters`) — the charter-named concrete triggers: `camera`/`microphone` → `getUserMedia` with immediate track stop (`stopMediaStreamTracks`, guarded against partial streams), `geolocation` → one-shot `getCurrentPosition` observing grant/deny (position discarded), `notifications` → `Notification.requestPermission`, `persistent-storage` → `navigator.storage.persist`. A name with no router falls back to a state query — the documented sentinel path.
- **`PermissionName`** — the open string union with the ten built-ins plus `(string & {})`, exactly the Decision's list.
- **Tests** (`permission.test.ts`, 22 cases) cover query mapping, fallback layers, all five request routers (grant/deny/absent-API), track stopping, and the seam trio including the fresh-default-on-null behavior.

## Gaps

1. **Request paths missing for 5 built-in names.** `clipboard-read`, `clipboard-write`, `push`, `midi`, and `screen-wake-lock` are in the built-in vocabulary but have no router, so `requestPermission` silently degrades to a query. Each has a real web trigger the charter's Decision pattern implies: clipboard-read → `navigator.clipboard.readText()`, midi → `navigator.requestMIDIAccess()`, screen-wake-lock → `navigator.wakeLock.request('screen')` (then release), push → `pushManager.subscribe` (needs a service-worker registration — genuinely harder). The Decision's trailing "…" gestures at these but the charter never lists which are in scope.
2. **Change signal** (charter Open direction 1) — no `enablePermissionSignals`/`onPermissionChange` over the Permissions API `change` event; an app cannot react to mid-session revocation.
3. **Batch query** (charter Open direction 2) — no `getPermissionStates(names[])` startup-audit convenience.
4. **Capability-package integration** (charter Open direction 3) — no ensure-then-use helpers; correctly absent from this package (they'd live in `webcam`/`geolocation`/`notification`), noted for the record.
5. **Diagnostics** — the `'prompt'` sentinel is triple-overloaded (genuinely undecided / unqueryable name / absent API) with no `explainPermissionState` query to disambiguate and no guard module, contra the diagnostics inversion rule. This is the sharpest sentinel-ambiguity in the suite.
6. **Duplicated permission vocabulary** — `packages/types/src/WebcamPermissionState.ts` exists in the header layer alongside `Permission.ts`, and `geolocation` has its own `GeolocationPermissionState`; the shared "may I?" gate has not yet unified the capability packages' per-package permission types. Cross-package observation, not a defect of this package's own code.

## Charter contradictions

None in what exists — the three 2026-07-10 Decisions are implemented faithfully. The gap list above is under-coverage, not contradiction. One near-miss: the Decision says a name with no mapping "resolves to `'prompt'`/`'denied'` sentinel"; the code resolves the request path to a **state query** first, which is more informative than a bare sentinel — a benign, arguably better, deviation.

## Contract & docs fit

- **Package side**: single root export, `sideEffects: false`, sentinels not throws, types in the header layer, module tables at file bottom, colocated tests for every export. Naming follows the suite's subject rule (`Permission*` singular, package `permissions` plural — same pattern as the charter's own title "permission — Charter"). Clean.
- **Docs side**: the Package Map line ("the shared 'may I?' gate over camera/mic/geolocation/notifications/clipboard/storage") slightly oversells — clipboard request is not actually wired. `_permissionQueryDescriptors` is currently an identity table; it earns its existence only when a Flight name diverges from a descriptor name, worth a comment or removal.

## Candidate open directions

1. Which of the five unrouted built-ins are in scope for the web request path, given their triggers have side effects (clipboard-read actually reads; midi prompts with an access object; push requires a service worker)? The charter's "…" needs an explicit list.
2. The change-signal shape: per-name subscription (`onPermissionChange(name)`) vs one signal carrying `(name, state)` — and whether it follows the suite's event-capability quartet.
3. Should the suite unify per-capability permission types (`WebcamPermissionState`, `GeolocationPermissionState`) onto `PermissionState`/`PermissionName`, making this package the single vocabulary owner? Cross-package; needs a ruling.
