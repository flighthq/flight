---
package: '@flighthq/permissions'
status: authoritative
score: 92
updated: 2026-08-30
ingested:
  - status.md
  - source
---

# permissions — Review

## Verdict

`authoritative` for the ratified explicit-Host facade slice. The remaining six native sites are explicit
migration holdings with named future owners, not hidden scope or a claim that Permissions owns them.

## Present capabilities

- `getPermissionState(host, name)` is read-only and projects a method-tight query outcome.
- `getPermissionStates(host, names)` captures each needed owner once before work, then preserves input
  order and repetitions.
- `requestPermission(host, name)` preserves owner reasons and never degrades to a query.
- Notification delegates exclusively to `Host.notification.permission`; no direct Web Notification
  or native-plugin permission path remains here.
- Persistent storage delegates query and request to their separate `Host.storage` slots; best-effort
  carries the owner's exact state or `null` and no direct Storage API path remains here.
- Media and wake-lock prompt-only acquisitions clean up in `finally`; cleanup failure remains distinct
  from user denial.
- An exact six-row ledger names media, geolocation, MIDI, wake lock, clipboard, and push as interim
  holdings and maps each to its future claiming domain. Its history retains the seven-row checkpoint.

## Structural fit

The package exports three functions through both blessed lanes, owns no exported types, has no log or
host-web dependency, and is import-side-effect-free. `PermissionBackend`, `system.permissions`,
`HasSystemPermissions`, ambient selection/mutation, observers, explainers, guards, sentinels, generic
subscriptions, and replacement ownership maps are structurally absent.

Permanent colocated suites name all three exports. The structural gate pins the exact holding rows and
modes, rejects growth, audits direct navigator sites, forbids a second native Notification owner, and
forbids the removed ambient/enabler symbols.

## Remaining migration surface

Each holding must move to its named domain and disappear from the ledger in the same slice. Clipboard
and push are query-only; their side-effecting request triggers are intentionally not guessed. No
owner/slot map or cross-domain aggregate is justified until multiple landed owner shapes derive it.
