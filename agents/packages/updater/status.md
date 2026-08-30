---
package: '@flighthq/updater'
updated: 2026-08-30
by: builder3
---

# updater — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/updater/src/`, `packages/types/src/Updater.ts`, and the four Host assemblers
on 2026-08-30. No known correctness gap remains in the authorized Squirrel-only slice.

- The public package has three transaction functions: awaited check, provider-pinned install, and
  provider destroy. Native update events are private to the Electron adapter; no duplicate `AppUpdater`
  event/state/config model remains.
- `Host.updater.command` is the only provider path. Electron fills it with an Entity; web, Tauri, and
  Capacitor expose the required top-level group with an empty capability set because their current
  injected APIs provide no compatible Squirrel transaction.
- Feed URL is immutable Electron provider-construction policy. Downloaded metadata and handles are
  copied/frozen, unknown fields are null, and portable failures expose only reliable method-tight causes.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — Replaced the ambient 21-method command/event model with explicit
  `Host.updater.command`, one awaited Squirrel check transaction, origin-pinned `DownloadedUpdate`
  installation, exact provider teardown, nullable frozen metadata, and empty W/T/C capability groups.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Two recorded type claims are **false**:
  no `UpdaterErrorKind` / `UpdaterPhaseKind` string unions exist (`kind` is a bare `string` and the
  phase type is `UpdaterPhase`, `types/src/Updater.ts:29`, `:50`), and `subscribeError` does not wrap
  Electron errors as `kind: 'Unknown'` — it hardcodes `'Network'` (`electronUpdater.ts:75`).
- **2026-06-25** — Pinned `checkAndDownloadAppUpdate`'s fire-both semantics with a colocated test so
  the documented instant-trigger behavior cannot drift unnoticed.
- **2026-06-24** — Updater matured to a queryable lifecycle: `UpdaterState` per entity, ten signals,
  a 22-method `UpdaterBackend`, staged-rollout and signature-config seams; the Electron adapter was
  rewritten against the new shape.
