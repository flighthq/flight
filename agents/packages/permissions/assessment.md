---
package: '@flighthq/permissions'
updated: 2026-07-13
basedOn: ./review.md
---

# permissions — Assessment

## Recommended

Sweep-safe, within-package, no design fork:

1. **`getPermissionStates(names)` batch query** — charter Open direction 2, explicitly gestured; a thin `Promise.all` over `getPermissionState`, pure convenience, no seam change.
2. **`screen-wake-lock` request router** — `navigator.wakeLock.request('screen')` then immediate release, mirroring the getUserMedia stop-tracks pattern already blessed in the Decision; the trigger has no lasting side effect, so it fits the established router model without a scope ruling.
3. **`midi` request router** — `navigator.requestMIDIAccess()` observing grant/deny (access object discarded), same prompt-only pattern as geolocation's discarded position.
4. **`explainPermissionState` query** — shakeable plain-data disambiguator for the triple-overloaded `'prompt'` sentinel (undecided vs unqueryable name vs absent API), per the diagnostics inversion rule; the backend already knows which branch it took, so this is a pure companion probe.
5. **Justify or remove the identity descriptor table** — `_permissionQueryDescriptors` maps every name to itself; either add the durable comment naming the future divergence it anticipates or drop it until one exists.
6. **Guard module `enablePermissionGuards`** — opt-in `@flighthq/log` warning when `requestPermission` falls back to a plain query (name with no request path), so the silent degradation is discoverable in dev.

## Backlog

- **`clipboard-read`/`clipboard-write`/`push` request routers** — parked: their triggers have real side effects (an actual clipboard read; a push subscription requiring a service-worker registration), so which are in scope needs the user's ruling (review open direction 1).
- **Change signal (`enablePermissionSignals`/`onPermissionChange`)** — parked: charter Open direction 1; the signal shape (per-name vs `(name, state)`) is an API-shape fork (review open direction 2) and adds the event-capability half to a command package.
- **Unify per-capability permission vocabularies** (`WebcamPermissionState`, `GeolocationPermissionState` → `PermissionState`) — parked: cross-package, touches `@flighthq/types` and at least two capability packages (review open direction 3).
- **Ensure-then-use helpers in capability packages** — parked permanently for this cell: charter Open direction 3 places them in `webcam`/`geolocation`/`notification`, not here.

## Approved

_Empty — awaiting the user's verbal gate._
