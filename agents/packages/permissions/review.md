---
package: '@flighthq/permissions'
status: authoritative
score: 91
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source (permission.ts, permissionNativeHoldings.ts, index.ts, contract.ts)
  - tests (permission.test.ts, getPermissionState.test.ts, getPermissionStates.test.ts, requestPermission.test.ts, geolocationDelegation.test.ts)
  - scripts/permission-native-holdings.test.ts (structural gate)
  - types (Permission.ts, PermissionNativeHolding.ts, Geolocation.ts, Storage.ts, Notification.ts, Host.ts, Midi.ts)
  - package.json, tsconfig.json
---

# permissions -- Review

## Verdict

`authoritative` for the ratified explicit-Host facade/projector. The package exports exactly three
functions, owns no types, holds no ambient state, and delegates every permission decision to its
capability owner through the supplied `Host`. The four remaining native holdings (media, wake lock,
clipboard, push) are bounded migration surface with named future owners, not hidden scope. The
structural gate in `scripts/permission-native-holdings.test.ts` enforces the monotonic drain
invariant, pins every native trigger to a live holding row, and rejects re-addition of drained rows.

Score reflects the clean facade boundary, thorough test coverage of all three exports including
batched owner-capture semantics, and the disciplined drain mechanism. Held back from a higher score
by (a) four undrained native holdings that still reach Web globals directly and (b) absence of a
guard/diagnostic layer -- the charter explicitly omits guards, but the diagnostics convention would
benefit a caller passing an unknown permission name.

## Present capabilities

- **`getPermissionState(host, name)`** -- read-only projection. Never escalates to a request. Routes
  `notifications` through `Host.notification.permission`, `persistent-storage` through
  `Host.storage.persistenceQuery`, `midi` through `Host.midi.permission`, and interim names through
  `navigator.permissions.query`. Notification `default` projects to the common `prompt` state.
  Storage `best-effort` carries `state: PermissionState | null`. Absent owners produce
  `{ reason: 'unsupported' }`.

- **`getPermissionStates(host, names)`** -- owner-captured batch. Captures every distinct owner
  (notification, MIDI, persistence, Web query origin) exactly once before starting work. Preserves
  input order and repeated names. A provider transition mid-batch cannot redirect any later entry.
  Empty batches short-circuit without resolving any owner.

- **`requestPermission(host, name)`** -- method-tight request. Never degrades to a query.
  - **Notification**: delegates to `Host.notification.permission.requestPermission`. Projects
    `granted`, `denied`, `dismissed`, and `operation-failed` with correct state mapping.
  - **Persistent storage**: delegates to `Host.storage.persistenceRequest`. Projects `persistent` to
    granted, `best-effort` carries exact state or `null`, `operation-failed` stays reason-only.
  - **Geolocation**: delegates to `Host.system.geolocation.promptForAccess`. Projects
    `GeolocationAccessOutcome` reasons to permission vocabulary. `timeout` is carried as a
    reason-only outcome with no state -- it represents an acquisition observable, not a decision.
    `cleanup-failed` preserves `state: 'granted'`.
  - **MIDI**: returns `{ reason: 'no-request-route' }` without touching `Host.midi.access` or any
    Web global.
  - **Media (camera/microphone)**: acquires via `getUserMedia`, stops all tracks attempt-all in
    `finally`. Cleanup failure produces `{ reason: 'cleanup-failed', state: 'granted' }`.
  - **Wake lock**: acquires via `navigator.wakeLock.request('screen')`, releases in `finally`.
    Cleanup failure is distinct from denial.
  - **Clipboard-read, clipboard-write, push**: return `{ reason: 'no-request-route' }`.
  - **Unknown names**: return `{ reason: 'unsupported' }`.

## Structural fit

**Export lanes.** `index.ts` re-exports `{ getPermissionState, getPermissionStates, requestPermission }`
from `./contract`. `contract.ts` re-exports `./permission`. Both lanes expose the same three
functions. No types are defined in this package -- all type surface lives in `@flighthq/types`
(`Permission.ts`, `PermissionNativeHolding.ts`).

**Dependencies.** Only `@flighthq/types` at runtime. No `@flighthq/log`, `@flighthq/sdk`,
`@flighthq/entity`, or host-backend dependencies. `devDependencies` contains only `typescript`.

**Side effects.** `"sideEffects": false` declared. Verified: no module-level state mutation, no
global registration, no listeners started at import time. The `PERMISSION_NATIVE_HOLDINGS` constant
is a frozen array literal, not a mutable registry.

**No ambient state.** No `PermissionBackend`, no `system.permissions`, no `HasSystemPermissions`, no
`setPermissionBackend`, no `getPermissionBackend`, no observers, no sentinels, no explainers, no
`enablePermissionGuards`/`disablePermissionGuards`. All confirmed absent from source. (Dist artifacts
are stale and still contain the deleted `enablePermissionGuards` module -- a `npm run build` would
clean this up, but it is a build-output issue, not a source issue.)

**Naming.** All three exported function names are globally self-identifying with full unabbreviated
type names. `getPermissionState` and `getPermissionStates` use the `get*` accessor prefix.
`requestPermission` uses an action verb.

**Error model.** Returns sentinel-like discriminated outcomes (`{ reason: '...' }`) for all expected
failures. Never throws for permission denial, missing capabilities, or unsupported names. Internal
helper errors (`catch` blocks) are projected to `operation-failed` reasons.

## Gaps

1. **Four undrained native holdings.** Media (camera + microphone) and wake lock still reach Web
   globals directly (`navigator.mediaDevices.getUserMedia`, `navigator.wakeLock.request`). Clipboard
   and push are query-only with no request route. Each row names its future claiming domain. Draining
   requires those domains to land first.

2. **No guard/diagnostic layer.** The charter explicitly omits guards and the structural gate test
   rejects the deleted `enablePermissionGuards` symbol. However, the diagnostics convention says
   "every silent sentinel gets a shakeable `explain*` query returning plain data." A caller passing
   an unrecognized permission name receives `{ reason: 'unsupported' }` silently. An
   `explainPermissionQueryOutcome` or similar could help callers diagnose unexpected results without
   the package needing to take on `@flighthq/log`.

3. **Stale dist artifacts.** The `dist/` directory still contains `enablePermissionGuards.js`,
   `enablePermissionGuards.d.ts`, and references in `dist/contract.d.ts` and `dist/index.js` to the
   deleted guard/explain functions. A clean rebuild would resolve this.

4. **No `requestPermissions` (plural) batch.** `getPermissionStates` provides batched queries with
   owner-capture semantics, but there is no equivalent batch request function. The charter does not
   call for one, and the owner-capture pattern for requests would be more complex (each name may
   trigger a different native prompt), so this is noted rather than flagged.

## Charter contradictions

None identified. Source aligns with every ratified charter decision:

- **[2026-08-30] Explicit-Host facade**: verified -- all three exports require `Host` as first
  parameter. Compile-time `@ts-expect-error` tests in `getPermissionState.test.ts` and
  `requestPermission.test.ts` confirm ambient calls do not compile.
- **[2026-08-30] Notification sole seam**: verified -- `Host.notification.permission` is the only
  delegation path. Structural gate (`permission-native-holdings.test.ts`) forbids `Notification.`,
  `typeof Notification`, and `getWebNotification` in production source.
- **[2026-08-30] Method-tight calls**: verified -- `getPermissionState` never calls
  `requestPermission` on a provider. `requestPermission` never calls `getPermission`. Tests confirm
  query mocks are never invoked during request tests and vice versa.
- **[2026-08-30] Bounded temporary acquisition**: verified -- media tracks stopped attempt-all in
  `finally` via `stopMediaStreamTracksAttemptAll`. Wake lock released in `finally`. Tests cover
  partial cleanup failure (second track throws, third still stopped).
- **[2026-08-30] Four-row ledger**: verified -- `PERMISSION_NATIVE_HOLDINGS` contains exactly media,
  wake-lock, clipboard, push. `PermissionNativeHoldingId` in types matches. Structural gate pins
  exact rows, modes, and permission names, and rejects growth via history-transition-failure checks.
- **[2026-08-30] Persistence drained**: verified -- no `navigator.storage`, no `StorageManager`, no
  `.persist(` in production source. Query and request delegate to separate `Host.storage` slots.
- **[2026-08-30] Geolocation drained**: verified -- no `navigator.geolocation`, no
  `getCurrentPosition` in production source (structural gate narrows patterns to avoid matching the
  word as a permission name). `requestPermission` delegates to `Host.system.geolocation.promptForAccess`.
- **[2026-08-30] MIDI drained**: verified -- no `requestMIDIAccess`, no `MIDIAccess` in production
  source. Query delegates to `Host.midi.permission`. Request returns `no-request-route`.

## Contract & docs fit

- **Types home rule**: satisfied. No exported types defined in this package. All types consumed from
  `@flighthq/types/contract`.
- **Import type separation**: satisfied. Type imports use `import type { ... }` on dedicated lines
  separate from value imports.
- **sideEffects: false**: satisfied. Verified by source inspection.
- **Two blessed export lanes**: satisfied. `.` and `./contract` both present in `package.json`
  exports. No other subpath exports.
- **No @flighthq/sdk import**: satisfied.
- **Readonly usage**: the `names` parameter on `getPermissionStates` is `readonly PermissionName[]`.
  `PermissionQueryOrigins` fields are `readonly`. `StoragePersistenceResult` is wrapped in
  `Readonly<>`. `MediaStream` in `stopMediaStreamTracksAttemptAll` is `Readonly<MediaStream>`.
- **Function-first, no classes**: satisfied. All implementation is free functions.
- **Test colocated**: satisfied. `permission.test.ts` mirrors `permission.ts`. Additional focused
  test files (`getPermissionState.test.ts`, `getPermissionStates.test.ts`,
  `requestPermission.test.ts`, `geolocationDelegation.test.ts`) cover deeper behavioral scenarios.
- **Alphabetized describe blocks in permission.test.ts**: satisfied -- `getPermissionState`,
  `getPermissionStates`, `requestPermission` in order.

## Candidate open directions

1. **Drain the four remaining native holdings** as their named domains land (media, wake-lock,
   clipboard, push). Each drain deletes the native trigger and the holding row in the same slice.
   Clipboard and push are query-only; their request triggers are intentionally absent.

2. **Consider a lightweight diagnostic query** (e.g., `explainPermissionQueryOutcome`) that helps
   callers understand `unsupported` and `runtime-unavailable` outcomes without pulling in
   `@flighthq/log`. This would satisfy the diagnostics convention's "explain*" expectation for
   silent sentinels, and the charter's explicit absence of guards does not preclude a pure-data
   explainer.

3. **Derive an owner/slot map** only after multiple landed owner shapes justify it. The charter is
   clear: no guessed aggregate, no generic subscription until the pattern is empirically established.
