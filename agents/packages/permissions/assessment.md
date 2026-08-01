---
package: '@flighthq/permissions'
updated: 2026-08-01
basedOn: ./review.md
---

# permissions — Assessment

## Recommended

_None open._ All six items landed on 2026-08-01 and are recorded under [Landed](#landed) below, outside this
section so the TODO generator stops reporting them as work.

## Landed

1. ~~**`getPermissionStates(names)` batch query.**~~ Landed. Returns results in **input order as a parallel
   array**, not a keyed record: a caller may legitimately pass the same name twice, and an array preserves
   that where a record would silently collapse it. Queries run concurrently; a state read never throws, so
   neither does the batch.
2. ~~**`screen-wake-lock` request router.**~~ Landed. Takes the lock and **releases it immediately**, the
   same shape as getUserMedia's stop-tracks — holding it would be a lasting side effect the caller never
   asked for, which would break the observation-only router model.
3. ~~**`midi` request router.**~~ Landed via `navigator.requestMIDIAccess()`, access object discarded, the
   same prompt-only pattern as geolocation's discarded position. Deliberately does **not** request sysex:
   that is a strictly larger prompt than the `'midi'` name denotes.
4. ~~**`explainPermissionState` query.**~~ Landed. Disambiguates the triple-overloaded `'prompt'` into
   `decided` / `undecided` / `unqueryable` / `unsupported`. It reports `undecided` or `decided` for a custom
   backend rather than guessing: only the built-in web backend can distinguish "the API rejected this name"
   from "there is no API", because only it knows whether `navigator.permissions` exists.
5. ~~**Justify or remove the identity descriptor table.**~~ **Removed.** `_permissionQueryDescriptors` mapped
   all ten names to themselves, and `getPermissionQueryDescriptorName` fell back to the name for anything
   unlisted — so every branch returned its input and the table could not change behaviour. It was removed
   rather than justified because no divergence exists to anticipate today; pre-release policy is to delete
   rather than carry a placeholder. If a backend ever needs a different descriptor name, the lookup returns
   at the single call site in `readWebPermissionState`.
6. ~~**Guard module `enablePermissionGuards`.**~~ Landed. Warns once per name, through `@flighthq/log`, when
   `requestPermission` finds no request path and degrades to a plain state query — the failure where nothing
   throws, a plausible state comes back, and the OS prompt the caller was waiting for never appears.

## Backlog

- **`clipboard-read`/`clipboard-write`/`push` request routers** — parked: their triggers have real side effects (an actual clipboard read; a push subscription requiring a service-worker registration), so which are in scope needs the user's ruling (review open direction 1).
- **Change signal (`enablePermissionSignals`/`onPermissionChange`)** — parked: charter Open direction 1; the signal shape (per-name vs `(name, state)`) is an API-shape fork (review open direction 2) and adds the event-capability half to a command package.
- **Unify per-capability permission vocabularies** (`WebcamPermissionState`, `GeolocationPermissionState` → `PermissionState`) — parked: cross-package, touches `@flighthq/types` and at least two capability packages (review open direction 3).
- **Ensure-then-use helpers in capability packages** — parked permanently for this cell: charter Open direction 3 places them in `webcam`/`geolocation`/`notification`, not here.

## Approved

_Empty — awaiting the user's verbal gate._
