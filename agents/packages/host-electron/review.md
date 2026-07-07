---
package: '@flighthq/host-electron'
status: solid
score: 78
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - changes.patch (packages/host-electron hunks)
  - source (head + base electronNotification.ts/.test.ts)
  - packages/types/src/Notification.ts (head + base)
---

# host-electron — Review (merge gate: integration-b2824e3d8 → origin/main)

## Verdict

`solid` package, **revise the incoming change before merge** — 78/100 for the delta as it stands. The package itself remains the exemplary host adapter the prior survey scored at 90; this re-review judges **only the b2824e3d8 delta** against the approved `origin/main` (`eb73c3d74`) baseline. The delta touches a single file pair — `electronNotification.ts` and its test — and makes two changes: one good (`updateNotification`), one **broken at the merge gate** (`requestPermission` retyped to a tri-state string that no longer conforms to the seam it implements, with its own tests left asserting the old boolean).

The `updateNotification` addition is exactly right; the `requestPermission` change is half-landed and does not compile or pass its tests as shipped.

## The delta (head vs base)

Two hunks in `packages/host-electron/`, plus an enabling additive hunk in `@flighthq/types`:

1. **`updateNotification` added** (`b2824e3d8:packages/host-electron/src/electronNotification.ts:55-59`):

   ```ts
   async updateNotification(_id, _partial) {
     // Electron's Notification has no in-place update; a caller must close and re-notify. Report
     // that the update was not applied rather than silently pretending success.
     return false;
   }
   ```

   This realizes the new `NotificationBackend.updateNotification(...)` method added to the seam in the same integration tree (`b2824e3d8:packages/types/src/Notification.ts:26`, `updateNotification(id, update): Promise<boolean>`). It returns the honest `false` sentinel — Electron's `Notification` genuinely has no in-place mutate — instead of pretending success. Colocated test added (`...electronNotification.test.ts:88-93`) asserting the `false` return. **Clean. Approve.**

2. **`requestPermission` retyped to tri-state** (`b2824e3d8:packages/host-electron/src/electronNotification.ts:35-38`):
   ```ts
   async requestPermission(): Promise<NotificationPermission> {
     // Electron requires no permission grant; support is the only gate.
     return electron.Notification.isSupported() ? 'granted' : 'denied';
   }
   ```
   Base returned `electron.Notification.isSupported()` — a `boolean`. **This change does not conform to the seam it implements and breaks its own tests** (details below).

## Must-fix before merge (each grounded in the delta)

### 1. `requestPermission` return type no longer matches the `NotificationBackend` seam → fails `tsc`

The factory is annotated `createElectronNotificationBackend(electron): NotificationBackend` (`b2824e3d8:packages/host-electron/src/electronNotification.ts:9`). The seam method it must satisfy is, in the **same integration tree**, still `requestPermission(): Promise<boolean>` (`b2824e3d8:packages/types/src/Notification.ts:22` — the types delta hunk adds only `updateNotification` and leaves `requestPermission(): Promise<boolean>` untouched). The head implementation annotates and returns `Promise<NotificationPermission>` (`'granted' | 'denied' | 'default'`, a `string` union). `string` is not assignable to `boolean`, so the returned object no longer satisfies `NotificationBackend` and the package will not typecheck under `npm run check`.

This is a delta defect, not a base one: in `base/`, `requestPermission` returned a boolean and matched the seam. The head change is internally inconsistent — the web default backend in `@flighthq/notification` (`b2824e3d8:packages/notification/src/notification.ts:182`, `:434`) and host-electron both assume a tri-state `NotificationPermission`, but `@flighthq/types/Notification.ts` was only partially updated (`updateNotification` added, `requestPermission` left `Promise<boolean>`). The merge is half-landed: either the seam must move to `Promise<NotificationPermission>` (and host-electron is then correct) or host-electron must return a `boolean`. As shipped, host-electron's hunk does not conform to the seam present in its own tree. (The seam itself lives in `@flighthq/types`, not this package — flagged as an open question, since the fix may belong upstream of host-electron.)

### 2. Stale tests assert booleans against the new string return → runtime test failure

`b2824e3d8:packages/host-electron/src/electronNotification.test.ts:44` and `:55` still assert:

```ts
expect(await backend.requestPermission()).toBe(true); // line 44
expect(await backend.requestPermission()).toBe(false); // line 55
```

These lines are unchanged from base (verified: identical in `base/` and `head/`), where they passed because `requestPermission` returned a boolean. With the head implementation returning `'granted'`/`'denied'`, `expect('granted').toBe(true)` and `expect('denied').toBe(false)` both **fail** — strict equality of a string against a boolean. The delta changed the implementation's return value but left its colocated assertions, so the package's own test file no longer passes. Standard 7 (tests match code) fails.

## What is clean in the delta

- **`updateNotification` sentinel + comment** — honest `false`, durable semantic comment explaining _why_ (no in-place Electron update; close-and-re-notify), not a transient TODO. Matches the new seam's `Promise<boolean>`. Colocated test present.
- **Naming** — `updateNotification` is the full, unabbreviated, self-identifying method name; consistent with the seam.
- **No structural regression** — single root `.` export unchanged (`index.ts:7` re-exports `./electronNotification`), `"sideEffects": false` unaffected, no new dependency, no eager registration, no new hot-loop branch or shared switch. The bundle invariant and tree-shaking posture are untouched by the delta.
- **Registry/triad/bedrock forks** — not implicated by this delta; no growing `kind` switch, no codec/backend split, no new package.

## Scope note

This re-review re-baselines the package's `review.md` from the prior `incoming/builder-67dc46d64` evidence to `base=origin/main(eb73c3d74)` + `evidence=integration-b2824e3d8 delta`. The package's standing capabilities (sixteen seam backends, the `withWindow` refactor, storage, modal-parent threading, notification close) are **in the approved base** and are not re-litigated here — they are the blessed floor. The score reflects the **incoming change only**: a strong package whose one incoming file pair is half-landed and would fail `npm run check`. Once the two must-fixes are resolved the delta is a clean, small, correct addition.
