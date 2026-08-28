# Backend lifecycle ownership

_Reconciled architecture record, 2026-08-28. The original audit population is frozen at 42
`*Backend` interfaces so its partition remains reproducible. A post-audit population change is
recorded separately below._

## Result

The 42-interface audit partitions exactly as:

```text
1 already-implemented whole-backend owner (LogTransport)
+ 7 additional whole-backend owners still needing hooks at the audit freeze
+ 19 entity/keyed/caller-owned lifetimes
+ 15 GC-managed, pure, or bounded-call backends
= 42 audited interfaces
```

The seven still-needing rows are not the total owner population. At the frozen audit, the total was
eight: already-implemented `LogTransportBackend` plus the seven named below. Since that audit,
`AccessibilityBackend` and `MediaSessionBackend` have landed their hooks. The live implementation
state is therefore five declared and exercised hooks (`AccessibilityBackend`, `LogTransportBackend`,
`MediaSessionBackend`, `MenuBackend`, and `PowerBackend`) with three still owed.

The live tree has since added four interfaces. `AudioBackend` is a pure `canPlayType` query and
joins the GC/bounded bucket. `WgpuHostBackend` and `InputIngressBackend` own acquisition- or
registration-scoped brackets, so they join the entity/keyed/caller-owned bucket. `AudioDeviceBackend`
landed after this record first anticipated it, and its shape settles it: every resource it makes is
handle-keyed with its own teardown (`createDevice`/`destroyDevice`, `createBuffer`/`destroyBuffer`,
`createSource`/`destroySource`) and it declares no zero-argument teardown, so it joins the
entity/keyed/caller-owned bucket by the same rule that places `TrayBackend.destroy(id)` there.

Therefore the live total is 46 and the live partition is `1 + 7 + 22 + 16 = 46`. None of the
post-audit rows changes the whole-owner population, which remains eight — so 8 − 5 = three still owed.

### Provenance of the live figures

These numbers are re-derived, not carried forward. The `42` above is the frozen audit population and
is deliberately never updated; the figures in this section track the live tree and move with it.

- **command** — `npx vitest run scripts/backend-lifecycle.test.ts` (`scripts/backend-lifecycle-core.ts`)
- **tree** — `bd6f4a8768d290641bd8eb33c9ce8b44094f2d83`, clean
- **scope** — every exported `*Backend` interface in `packages/types/src/*.ts`, plus every exported
  `set*Backend` body and top-level function body in `packages/*/src/*.ts`; `*.test.ts` excluded
- **counting predicate** — one unit = one interface; *owning* = declares a **zero-parameter**
  `destroy`/`dispose` in method or property syntax, so a per-object teardown taking an id is excluded
- **live output** — `5 of 46 backends declare a whole-backend teardown hook, 41 declare none`, followed
  by the scope caveat the gate now prints on every run:
  `STRUCTURAL: counts hook presence — a zero-parameter destroy/dispose named by its set*Backend;
  measures neither test depth nor audited behavior, so it cannot say whether destroy releases what a
  backend owns`

### Release audit of the five counted rows

Each counted row was read against its implementations: what the backend *owns* versus what its
`destroy()` *releases*. Every mismatch is listed. Every concrete whole-owner now has reachable teardown
for its host-installed backend, but the gate cannot see that reachability or the release behavior because
it reads only declarations and setter wiring. This section is the semantic column the gate is missing;
it is hand-derived and is a floor, not an oracle.

| row | owns | destroy releases | mismatch |
| --- | --- | --- | --- |
| `AccessibilityBackend` | mirrored element map, live-region map, overlay root (only when self-created) | identity-removes the tracked mirrored nodes and live regions; removes a self-created root; preserves a caller-supplied root and every untracked child; pins `rootResolved` so it cannot resurrect | **closed.** Owned identities are removed without selector/root-wide cleanup, including borrowed lookalikes; clear/reuse and destroy behavior are assertion-backed |
| `LogTransportBackend` | — | — | **nothing to audit:** no concrete implementation exists anywhere in `packages/`; only the interface and the single-slot management. Its count is purely structural |
| `MediaSessionBackend` | the action set it registered, plus `metadata`, `playbackState` and position state on each exact `navigator.mediaSession` identity it published to | releases only lanes still carrying that backend's provenance token; metadata and playback state additionally require the exact published value; explicit clears relinquish ownership; failed releases remain retryable | **closed.** A superseding backend or external publisher remains intact, shared-session lanes are released independently, and a session-identity change cannot redirect cleanup |
| `MenuBackend` | Electron/Tauri: the select listener; the installed application menu. Web: nothing | `destroyMenuBackend` clears both slots first, then releases every distinct unretained backend once; Electron clears the select listener and calls `Menu.setApplicationMenu(null)`; Tauri clears JS-owned state only (listener + guard flag) — the native menu stays until the replacement backend installs its own; web is a no-op | **closed.** Capability teardown is reachable, re-entrant-safe, alias-safe and assertion-backed. Tauri's JS-only teardown is the settled design: its async menu API cannot clear the native menu synchronously, and a fire-and-forget clear races with the replacement backend's install |
| `PowerBackend` | web: `_wakeLockSentinel` (an OS wake lock), a `'release'` listener on each sentinel, and module-level `_cachedLevel`/`_cachedCharging`/`_cachedChargingTime`/`_cachedDischargingTime` | releases and nulls the sentinel; detaches each retained `(sentinel, handler)` pair by identity; resets the four cached readings | **closed.** All three findings were remediated in order — teardown made reachable (`destroyPowerBackend`), then the release completed. This row is behaviorally assertion-backed; see *Behavioral completeness* below |

Battery, resume and freeze listeners are *not* mismatches: each is returned as an unsubscribe thunk and
is caller-owned, which is the correct bracket.

#### Behavioral completeness, recorded here because no gate can hold it

The structural lifecycle gate stays at **5 of 50** and must not move for this. It counts a declared
teardown named by its setter; it cannot observe whether that teardown releases what the backend owns,
which is exactly what the scope caveat it prints says. Advancing that number to reward behavioral work
would make it assert something it does not check — the failure this record exists to prevent.

So behavior is tracked separately, by assertion rather than by count. `PowerBackend` is the first row to
reach completeness in this remediation, and each claim below is pinned by a test that fails when its
guard is removed:

| claim | mutation that breaks it |
| --- | --- |
| a reading captured by a destroyed backend is never served afterwards | drop the cache reset → the successor serves the dead backend's last measurement |
| the release listener is detached from the exact sentinel it was added to | detach with a different function reference → fails on `Object.is` identity while a "some removal happened" check would still pass |
| teardown is idempotent | drop the registry clear → a second destroy detaches again |

The last two are distinct on purpose. `removeEventListener` matches on reference, so a test that only
counted removals would pass against an implementation that removes the wrong handler and leaks the real
one. Counting is not identity.

`Accessibility` cleanup is likewise assertion-backed by its borrowed-container identity tests. The
remaining rows are unchanged: `Menu` still carries the mismatch named above, while `LogTransport` has
no implementation to audit. `MediaSession` is now assertion-backed by per-backend, per-session,
per-lane ownership tests, including B-supersedes-A and failed-release retry cases.

### Mutation-audit ordering

MediaSession's test-depth closure used classification before optimization. Its initial focused run
found 21 survivors among 91 reachable mutants. Before closure tests were added, each survivor was
classified, and six bookkeeping-only mutants plus one type-equivalent mutant were individually
recorded and manager-ratified as non-actionable. Tests then closed the remaining 14 actionable gaps.
After reconciliation added three reachable mutants, the same seven semantic survivors remained among
94. Because the exemption set predated the tests, a stubborn mutant could not be retrospectively
relabelled to manufacture “zero actionable.”

Future mutation audits follow the same evidence order: record every current survivor's semantic
identity and rationale, obtain the required review or ratification, and only then write closure tests
for the actionable set. After source reconciliation, rerun against the new reachable denominator and
compare semantic identities rather than line numbers. A new or different survivor reopens
classification; it is never automatically exempted to restore a score. This is an audit procedure,
not a kill-rate gate: no percentage floor or zero-survivor target makes bookkeeping-only or
type-equivalent mutants actionable.

#### The four Power mutations, preserved verbatim so encoding is transcription

These were run by hand against `webPower.ts` and `webPower.test.ts` and are recorded here because nothing
re-runs them. They are the entire evidence behind `PowerBackend`'s `closed` row above. Written out in full
— anchor, edit, and the exact test names that must fail — so that whoever encodes them later transcribes
rather than rediscovers, and so that a reader can re-run them by hand today.

Each anchor occurs exactly once in the file; that uniqueness is part of the evidence, because an anchor
matching twice would splice a site nobody chose.

| # | anchor in `packages/host-web/src/webPower.ts` | edit | tests that MUST fail, by exact name | what it proves |
| --- | --- | --- | --- | --- |
| A | `resetCachedBatteryReadings();` (in `destroy`) | delete | `does not serve battery readings captured by a destroyed backend` | the four cached readings are module-scoped, so without the reset a destroyed backend's last measurement is served by its successor as if fresh |
| B | `detachWakeLockReleaseListeners();` (in `destroy`) | delete | `detaches the release listener from the exact sentinel it was added to` **and** `is idempotent: a second destroy detaches nothing more and does not throw` | teardown detaches at all. B kills **two** tests; a spec naming only one would pass while the other silently broke |
| C | `_wakeLockReleaseListeners.clear();` (in `detachWakeLockReleaseListeners`) | delete | `is idempotent: a second destroy detaches nothing more and does not throw` | the registry is emptied, so a second teardown detaches nothing further |
| D | `_wakeLockReleaseListeners.set(sentinel, onRelease);` | store `() => {}` instead of `onRelease` | `detaches the release listener from the exact sentinel it was added to` | **the identity claim itself.** A removal still happens and every count-based assertion still passes; only the `Object.is` check catches that the wrong reference was removed and the real listener leaked |

D is the one that would be lost first if these were summarised. It is the difference between "a listener
was removed" and "the listener that was added was removed", and only the second is the property
`removeEventListener` actually requires.

**A matching hazard to carry forward:** `webPower.test.ts` contains two tests whose names contain
`is idempotent` — the unrelated `enableHostWebPower` one, and B/C's. Any future encoding must match test
names by exact full string, never substring, or it will report a kill from a test that checked nothing
relevant.

#### Design: a separate instrument for behavioral completeness — DEFERRED, UNRATIFIED

**Manager ruling: DEFERRED** until the lifecycle behavioral audit derives its claim population. No runner
or spec machinery is to be built. The design below is kept unchanged and unratified so that it is ready
when that population exists; nothing here is implemented, and it deliberately produces **no number that
can be ratcheted**.

**The problem.** The structural gate answers "is a teardown declared and named by its setter". Whether
that teardown releases what the backend owns is a different question, and the section above currently
answers it in prose. Prose rots silently: every claim in that table would still read as true after
someone deleted the guard it describes.

**The trap to avoid, which the repo has already ruled on.** The obvious instrument — count the rows whose
behavior is verified and gate the count — recreates the exact failure the structural floor has, one level
up: a hand-written claim wearing a derived number's clothes. `npm run unchecked` already settled this for
mutation evidence and its reasoning transfers verbatim: *"a gated ratio is satisfied by deleting the
mutants you cannot kill, and the equivalent-mutant problem guarantees the achievable maximum is unknown
and unknowable."* So this instrument is a **list and a verdict per row, never a score**.

##### The evidence unit: an executable mutation pair

A row does not earn "behaviorally verified" by being described. It earns it by carrying, per claim, a
pair the machine can run:

```
claim     "a reading captured by a destroyed backend is never served afterwards"
mutation  packages/host-web/src/webPower.ts :: delete `resetCachedBatteryReadings();`
expects   packages/host-web/src/webPower.test.ts ::
          "does not serve battery readings captured by a destroyed backend"  MUST FAIL
```

The instrument applies each mutation and asserts the named test **fails**. That inverts the usual rot:
the claim *is* the check, so a guard that stops being load-bearing turns the row red instead of leaving a
sentence that is quietly no longer true.

Reuse `unchecked`'s machinery rather than building a runner — in particular its load-hook splicing, which
never writes mutated text to disk, so an interrupt cannot leave corrupted source in a repo where agents
commit concurrently. The genuinely new part is small: a spec format and a runner that asserts failure
rather than success.

##### The derived roster

Both halves are derived, so neither is a list of claims:

- **denominator** — the structural gate's own enforced set (the rows that declare a teardown at all).
  A row cannot be behaviorally verified before it is structurally wired, so this is the correct universe
  and it already derives itself.
- **numerator** — rows whose every recorded mutation still kills, decided *by execution*, not by
  declaration.

The only hand-written artifacts are the mutation specs, and those are executable: a wrong one fails on
the next run rather than lying indefinitely.

##### Three states, not two

`verified` / `failing` / **`unverified`**. The third is what stops the instrument from misleading. With
two states, a row nobody has written evidence for must be lumped with either the passes or the failures,
and both readings are wrong — it is simply unmeasured. `LogTransport`, which has no implementation in the
repo at all, is permanently `unverified` and that is the correct answer rather than a gap to close.

##### Four rules that keep it from becoming a misleading count

1. **No ratio and no percentage.** Per-row verdicts only. "3 of 5" invites exactly the ratcheting this
   instrument exists to avoid.
2. **A missing anchor is an error, not a skip.** Mutation specs are text edits and rot when code moves. A
   spec whose anchor no longer matches must fail loudly — a silent skip turns a hole in the swept
   population into a smaller number that looks like an answer.
3. **A verdict is scoped to the claims named, never to the row.** "Power verified" must be unreadable as
   "Power is correct"; it means the listed claims hold and nothing more — the same discipline as the
   structural gate's printed scope caveat.
4. **It must not be wired to any floor.** If a future reader wants a ratchet, the thing to ratchet is the
   set of *claims*, never a count of rows.

##### Is `PowerBackend` the first earned row?

**Not yet, strictly — and the distinction is the point.** Power is the first *candidate*: it is the only
row whose release behavior has been proven by mutation at all, and its four mutations are recorded in the
table above. But they were run by hand in a session; nothing re-runs them. Under this design a row earns
its verdict only when its mutations are encoded and executable.

That makes Power the smallest possible first implementation: no new proofs to invent, only the four
existing ones to transcribe. If encoding them turns out to be more than a small slice, that is itself the
signal that this instrument is not worth its weight yet.

#### Design: a separate instrument for behavioral completeness — UNRATIFIED

Design only, pending a manager ruling. Nothing here is implemented, and it deliberately produces **no
number that can be ratcheted**.

**The problem.** The structural gate answers "is a teardown declared and named by its setter". Whether
that teardown releases what the backend owns is a different question, and the section above currently
answers it in prose. Prose rots silently: every claim in that table would still read as true after
someone deleted the guard it describes.

**The trap to avoid, which the repo has already ruled on.** The obvious instrument — count the rows whose
behavior is verified and gate the count — recreates the exact failure the structural floor has, one level
up: a hand-written claim wearing a derived number's clothes. `npm run unchecked` already settled this for
mutation evidence and its reasoning transfers verbatim: *"a gated ratio is satisfied by deleting the
mutants you cannot kill, and the equivalent-mutant problem guarantees the achievable maximum is unknown
and unknowable."* So this instrument is a **list and a verdict per row, never a score**.

##### The evidence unit: an executable mutation pair

A row does not earn "behaviorally verified" by being described. It earns it by carrying, per claim, a
pair the machine can run:

```
claim     "a reading captured by a destroyed backend is never served afterwards"
mutation  packages/host-web/src/webPower.ts :: delete `resetCachedBatteryReadings();`
expects   packages/host-web/src/webPower.test.ts ::
          "does not serve battery readings captured by a destroyed backend"  MUST FAIL
```

The instrument applies each mutation and asserts the named test **fails**. That inverts the usual rot:
the claim *is* the check, so a guard that stops being load-bearing turns the row red instead of leaving a
sentence that is quietly no longer true.

Reuse `unchecked`'s machinery rather than building a runner — in particular its load-hook splicing, which
never writes mutated text to disk, so an interrupt cannot leave corrupted source in a repo where agents
commit concurrently. The genuinely new part is small: a spec format and a runner that asserts failure
rather than success.

##### The derived roster

Both halves are derived, so neither is a list of claims:

- **denominator** — the structural gate's own enforced set (the rows that declare a teardown at all).
  A row cannot be behaviorally verified before it is structurally wired, so this is the correct universe
  and it already derives itself.
- **numerator** — rows whose every recorded mutation still kills, decided *by execution*, not by
  declaration.

The only hand-written artifacts are the mutation specs, and those are executable: a wrong one fails on
the next run rather than lying indefinitely.

##### Three states, not two

`verified` / `failing` / **`unverified`**. The third is what stops the instrument from misleading. With
two states, a row nobody has written evidence for must be lumped with either the passes or the failures,
and both readings are wrong — it is simply unmeasured. `LogTransport`, which has no implementation in the
repo at all, is permanently `unverified` and that is the correct answer rather than a gap to close.

##### Four rules that keep it from becoming a misleading count

1. **No ratio and no percentage.** Per-row verdicts only. "3 of 5" invites exactly the ratcheting this
   instrument exists to avoid.
2. **A missing anchor is an error, not a skip.** Mutation specs are text edits and rot when code moves. A
   spec whose anchor no longer matches must fail loudly — a silent skip turns a hole in the swept
   population into a smaller number that looks like an answer.
3. **A verdict is scoped to the claims named, never to the row.** "Power verified" must be unreadable as
   "Power is correct"; it means the listed claims hold and nothing more — the same discipline as the
   structural gate's printed scope caveat.
4. **It must not be wired to any floor.** If a future reader wants a ratchet, the thing to ratchet is the
   set of *claims*, never a count of rows.

##### Is `PowerBackend` the first earned row?

**Not yet, strictly — and the distinction is the point.** Power is the first *candidate*: it is the only
row whose release behavior has been proven by mutation at all, and its four mutations are recorded in the
table above. But they were run by hand in a session; nothing re-runs them. Under this design a row earns
its verdict only when its mutations are encoded and executable.

That makes Power the smallest possible first implementation: no new proofs to invent, only the four
existing ones to transcribe. If encoding them turns out to be more than a small slice, that is itself the
signal that this instrument is not worth its weight yet.

#### A systemic defect the row-by-row reading did not surface — FIXED

`enableHostWeb*()` latched a module-level `_enabled` flag that **no `destroy()` reset**, while
`destroyAccessibilityBackend`/`destroyMediaSessionBackend` did clear the host slot. Together they made
teardown irreversible. Measured, not read — probing the tree with `explain*Operation().layer`:

```text
enableHostWebAccessibility()  → host
destroyAccessibilityBackend() → sentinel
enableHostWebAccessibility()  → sentinel     ← expected host
```

`MediaSession` probed identically: after teardown the capability was stuck on the sentinel for the life
of the process, recoverable only through the test-only `resetHostWeb*ForTest()`.

**Closed for Power, MediaSession, Accessibility and Menu.** Each capability now exports a host-slot
query (`hasPowerHostBackend`, `hasMediaSessionHostBackend`, `hasAccessibilityHostBackend`,
`hasMenuHostBackend`) and the host enables ask instead of remembering; their `_enabled` variables are
gone. Restoring the latch fails the re-enable test in all four. Menu's host teardown is now reachable;
Tauri's JS-only teardown is the settled design (native menu stays until replaced).

### Remediation design for the Power host slot and the irreversible enable

Historical design record — Power has completed all three steps without moving the structural lifecycle
floor. Menu has completed all three steps. Tauri's JS-only teardown is the settled design: its async menu
API cannot clear the native menu synchronously, and a fire-and-forget clear races with replacement.

#### The ordering constraint, which is the whole point

The obvious first move — give `Power` a `destroyPowerBackend` so its host backend can be torn down — is
the **wrong** first move. Today `Power` cannot exhibit the irreversible-enable defect *only because its
teardown is unreachable*. Making teardown reachable without first making enable re-entrant would move
`Power` out of one defect and into the other, and the second is worse: it is silent, and it leaves the
capability permanently on the sentinel rather than merely leaking one wake lock.

So the latch is fixed first, for every capability, and teardown is made reachable second.

#### Ownership, stated exactly

| owner | owns | must not |
| --- | --- | --- |
| the capability package (`packages/power/src/power.ts`) | the `_custom` and `_host` slots, their release ordering, and invariants 1–5 above | know that a host package exists, or that anything latches |
| the host package (`packages/host-web/src/webPower.ts`) | the backend instance and everything it holds — the wake-lock sentinel, that sentinel's `release` listener, and the cached battery values | reach into capability slots, or keep its own copy of "is a host backend installed" |

The present bug is exactly a violation of the second row: `_enabled` is a host-local cache of a fact the
capability owns, and the two go out of sync the moment the capability clears its slot.

#### Step 1 — make enable re-entrant by deriving the latch (fixes a live defect)

Add one export per capability, matching the existing `install*HostBackend` it pairs with, and named by
the `has*` convention for boolean queries:

```ts
export function hasPowerHostBackend(): boolean {
  return _host !== null;
}
```

The host then asks rather than remembers, and the `_enabled` module variable is deleted:

```ts
export function enableHostWebPower(): void {
  if (hasPowerHostBackend()) return;
  installPowerHostBackend(createWebPowerBackend());
}
```

Re-enabling after teardown now works because there is no second source of truth to go stale. No conflict
is raised on re-install: `installPowerHostBackend` only sets `_hostConflict` when `_host` is already
occupied by a *different* object, and after teardown it is null.

This step alone fixes the **already-reachable** form of the defect in `Accessibility` and `MediaSession`,
which today are stuck on the sentinel after any `destroy*Backend()`.

**Mutation test.** Restore the latch — reintroduce `if (_enabled) return; _enabled = true;` — and this
must fail:

```ts
it('reinstalls the host backend after teardown', () => {
  enableHostWebPower();
  expect(explainPowerOperation('setKeepAwake').layer).toBe('host');
  destroyPowerBackend();
  enableHostWebPower();
  expect(explainPowerOperation('setKeepAwake').layer).toBe('host');   // ← sentinel today
});
```

`Power` has no `explain*Operation` seam yet, so until it does this asserts on
`getPowerBackend() !== <the sentinel>`; for `Accessibility` and `MediaSession` the `layer` form works as
written and is the probe that produced the finding.

#### Step 2 — make the Power host slot tearable

Mirror `destroyAccessibilityBackend` exactly, including the layered-ownership release that must not
destroy an object still retained by the other slot:

```ts
export function destroyPowerBackend(): void {
  const previous = [_custom, _host] as const;
  _custom = null;
  _host = null;
  releasePowerBackends(previous);
}
```

with `releasePowerBackends` copied in shape from `releaseAccessibilityBackends`: a `retained` set of the
surviving slots, a `released` set for dedup, and `backend.destroy?.()` for anything in neither.

**Mutation tests**, three, because three separate invariants ride on this one function:

1. delete the `retained` check → an object occupying both slots is destroyed while one slot still owns it
   (invariant 3) → must fail;
2. delete the `released` dedup → a backend aliased into both slots is destroyed twice (invariant 1) →
   must fail;
3. clear the slots *after* the release rather than before → `getPowerBackend()` no longer returns the
   outgoing backend during its own `destroy()` (invariant 4) → must fail.

#### Step 3 — release the rest of what the web backend owns

`webPower.destroy` currently releases the sentinel and nothing else. It also owns, per the table above:

- `_cachedLevel` / `_cachedCharging` / `_cachedChargingTime` / `_cachedDischargingTime`, which survive
  teardown and are then served to the next backend as if fresh;
- the `'release'` listener attached to each sentinel, which is never removed.

Both are cleared in `destroy`. The listener needs the sentinel retained alongside its handler so the
exact pair can be detached — the same shape `ScreenBackend` owes for its `pointermove` handler.

**Mutation test.** Stop clearing the cached values and this must fail:

```ts
it('does not serve battery readings captured by a destroyed backend', () => {
  // …acquire readings through the host backend, then:
  destroyPowerBackend();
  expect(getPowerStatus(out).level).toBe(-1);   // the unknown sentinel value, not the stale reading
});
```

#### What this deliberately does not do

It does not advance the lifecycle floor. All three steps are invisible to that gate — it already counts
`Power` as wired, which is the point of the scope caveat the gate now prints. The floor should move only
when a row's *behavior* is verified, and verifying behavior is what these mutation tests are for.

The census partition (`5 + 41 = 46`) counts a different thing from the bucket partition
(`1 + 7 + 22 + 16 = 46`) above it: the census asks only whether a zero-argument hook is *declared*,
while the buckets record which lifetime *should* own cleanup. They agree on the denominator and on
nothing else, which is the point — the gate cannot supply the semantic column.

## Derivation rules

A backend needs a zero-argument `destroy?(): void` when its implementation does either of these:

- retains a releasable external/native object beyond the operation that acquired it; or
- installs persistent state into a host singleton and no provider-pinned entity, key, unsubscribe
  thunk, or caller-owned command lifetime owns the bracket.

`destroy` means that a non-GC resource or persistent host effect is freed and the backend becomes
invalid. `dispose` remains the entity verb: detach listeners and references so an entity is eligible
for collection. A parameterised operation such as `TrayBackend.destroy(id)` frees one keyed object;
it is not a whole-backend hook.

Entity/keyed classification is not a declaration that cleanup is finished. It answers only which
lifetime should own cleanup. Each row below separately says whether the current implementation pins
cleanup to the originating provider or still owes that provenance.

Provider replacement follows five invariants:

1. Teardown is idempotent and exactly once for each ownership loss.
2. Installing the identical backend again does not destroy it.
3. If the same object occupies more than one precedence slot, losing one slot does not destroy the
   object while another slot still owns it.
4. Teardown happens before install: the outgoing backend is destroyed while it is still the selected
   backend (`get*Backend()` returns it during its `destroy()` call), so teardown code that queries the
   active backend sees itself.
5. If teardown throws, the replacement is not installed and the outgoing backend remains the selected
   last-known-good backend, preserving ownership for retry or explicit documented recovery.

**Shared origin-pinned lifecycle doctrine (normative):** cleanup releases only the resources or
registrations acquired by the originating backend for that exact acquisition/source. Later backend
selection cannot reroute that cleanup, and a caller-supplied source or handle is borrowed and never
destroyed. This governs whole-backend teardown and every entity-, registration-, or acquisition-scoped
release: whole-backend teardown, WebGPU host acquisition, input ingress attachment, and Window
open/attach are concrete instances of the same rule.

The structural ratchet in `scripts/backend-lifecycle-core.ts` derives exported backend names, finds
zero-argument `destroy`/`dispose` members in both method and callable-property syntax, excludes
parameterised teardown, and checks that the corresponding `set*Backend` body references the hook.
`scripts/backend-lifecycle.test.ts` asserts `enforced + noTeardownHook === total` and holds two
separate lists: an immutable `HISTORICAL_BASELINE` (the three names and total of 43 recorded when the
gate was established, never updated, so growth shows as signed deltas such as `+7 new seams,
+2 newly enforced`) and the current ratchet of every backend that has landed a hook, which gates the
full present set and must never shrink.

That gate is intentionally a ratchet, not an ownership oracle. It can prevent a declared hook from
silently disappearing, but it cannot infer that a hook is missing: absence of the declaration places
an interface in `noTeardownHook`. The manually audited partition in this record supplies that missing
semantic evidence.

The teardown-rejection scanner (`scripts/teardown-rejection-core.ts`, tested in
`scripts/teardown-rejection.test.ts` as "finds no uncatchable-rejection candidate in any host
package") produced its first production red on Tauri `MenuBackend`. On its first run against the
live tree, the scanner reported `packages/host-tauri/src/tauriMenu.ts destroy() →
emptyMenu.setAsAppMenu` — an async call inside a synchronous `destroy()` whose rejection could not
be caught by the caller. The flagged pattern was a fire-and-forget
`Menu.new({items:[]}).then(m => m.setAsAppMenu()).catch(()=>{})` that raced with the replacement
backend's `setApplicationMenu` and could overwrite the newly installed menu. Fixed at source by
removing the async clear; the scanner and its detection threshold are unchanged.

## Whole-backend owners

### Existing owner: LogTransportBackend

`LogTransportBackend` may retain a file descriptor, socket, or native writer. Its optional
`destroy()` is implemented by `destroyLogTransportBackend`: the slot is cleared before `flush()` and
`destroy()` run, so later file-sink writes cannot reach a freed transport and repeated teardown is a
no-op. `setLogTransportBackend` preserves identical-object assignment and destroys a different or
removed outgoing transport. This is the complete single-slot reference implementation.

### Seven additional owners

All seven rows needed a hook at the 42-interface audit freeze. `MediaSessionBackend` is retained in
this seven-row population because implementation progress changes a row's state, not its ownership
category; its subsequently landed hook is recorded in the row itself.

| Backend | Evidence for whole ownership | Required or current teardown |
| --- | --- | --- |
| `AccessibilityBackend` | `createWebAccessibilityBackend` retains mirrored DOM nodes, live regions, and sometimes an owned root appended to `document.body`. | **Landed hook:** web `destroy()` clears mirrored nodes and live regions, removes only a backend-created root, empties but preserves a caller-supplied container, and cannot lazily recreate a root afterward. Custom/host slots release only objects no longer referenced by either slot and deduplicate aliased final removal. |
| `AppBackend` | A backend can hold the process single-instance lock and start dock/attention requests; its event thunks alone do not release those host resources. | **Owed:** each implementation tracks locks and request ids it acquired; `destroy?()` releases its lock, cancels outstanding attention/bounce ids, and detaches any instance-owned host state. Durable user configuration such as login-at-startup is not rolled back merely because an adapter is replaced. |
| `MediaSessionBackend` | Metadata, playback state, scrubber state, and action handlers remain installed on the OS `mediaSession` singleton after the adapter reference is dropped. | **Landed hook:** web `destroy()` clears its registered action set, metadata, playback state, and position state. `setMediaSessionBackend` covers custom-slot replacement/removal. The two-slot final-loss/alias cases remain evidence still to add: `destroyMediaSessionBackend` currently clears both slots after invoking only the active object, and a host object aliased into the custom slot can be destroyed while the host slot still retains it. |
| `MenuBackend` | `setApplicationMenu` installs a process-global native menu whose callbacks can retain the backend selection listener. Popup menus are bounded caller promises and are not the reason for the hook. | **Landed hook:** `destroy?()` on the interface; `setMenuBackend` destroys the outgoing backend before installing the replacement (invariants 1–5). Electron clears the select listener and calls `Menu.setApplicationMenu(null)` to remove the native menu. Tauri clears JS-owned state only (select listener, idempotency flag); the native app menu cannot be cleared synchronously because Tauri's menu API is entirely async, so destroy preserves last-known-good (native menu stays until replaced by the next `setApplicationMenu`). Web is a no-op (holds no state — `setApplicationMenu` returns false). |
| `PowerBackend` | Electron retains a `powerSaveBlocker` id; web retains and may reacquire a `WakeLockSentinel`. Both outlive the initiating call. | **Landed hook:** `destroy?()` on the interface; `setPowerBackend` destroys the outgoing backend before installing the replacement (invariants 1–5). Electron stops any held power-save blocker; web releases the wake-lock sentinel. Entity subscriptions remain owned by `detachPower`/`disposePower`. |
| `ScreenBackend` | `createWebScreenBackend.ensureCursorTracking` installs one anonymous process-lifetime `pointermove` handler and retains cursor/cache/detail state outside any `ScreenSignals` entity. | **Owed:** retain the exact handler, remove it in idempotent `destroy?()`, detach any backend-level Screen Details listeners, and clear retained detail/cache state. Per-entity `subscribe` thunks continue to detach their own resize/orientation listeners. |
| `ShortcutBackend` | Successful registrations install OS-global callbacks and the Electron backend retains their accelerator set. They survive loss of the adapter reference. | **Owed:** `destroy?()` calls the implementation's `unregisterAll()` and clears its owned registry. Async hosts must observe/reject teardown failures without leaving an unhandled promise. |

The landed `AccessibilityBackend` and `MediaSessionBackend` hooks raise the structural gate to three
owners, but the layered-slot caveat above is why “gate enforced” and “all lifecycle cases proven” are
recorded separately.

## Entity, key, rebind, or caller-owned lifetimes

The result column uses **owned** only when the current path reaches the originating resource. **Owed**
names the exact provenance or cleanup work still required; it does not promote the backend to a
whole-owner.

Rows 1–19 reproduce the frozen audit population. Rows 20–22 are the post-audit
`WgpuHostBackend`, `InputIngressBackend`, and `AudioDeviceBackend` additions.

| # | Backend | Exact resource bracket and provenance | Result |
| ---: | --- | --- | --- |
| 1 | `WindowBackend` | **Per-entity host teardown:** successful open/attach binds each `ApplicationWindow` to its originating backend, whose adapter record retains the native handle, ownership (`flight` or `host`), and exact listener cleanup. Close through that backend removes forward/reverse identity plus native event ingress and destroys only a Flight-owned handle. **Entity-dispose reachability:** after the terminal `onClose` emits once, `disposeApplicationWindow` drains the separate application observer map so its closures cannot retain the entity. | **Owned.** Host teardown precedes the terminal signal; observer disposal follows it. Backend replacement cannot redirect either cleanup, synchronous native/facade close converges at one choke point, duplicate close is a no-op, and successful reopen re-arms both obligations for the next entity lifetime. |
| 2 | `ClipboardBackend` | `attachClipboardWatch` stores the exact unsubscribe thunk. `detachClipboardWatch`/`disposeClipboardWatch` invoke it, and `rebindClipboardWatches` unsubscribes before subscribing through a replacement. | **Owned.** Cleanup and replacement both reach the provider that created the subscription. |
| 3 | `ConnectivityBackend` | `attachConnectivity` captures the backend's unsubscribe thunk in the `Connectivity` side table; `detachConnectivity`/`disposeConnectivity` invoke it. A reachability probe is bounded by its promise, timeout, and optional `AbortSignal`. | **Owned.** An attached entity may intentionally stay pinned to its creator until detached; replacement semantics are not a resource leak. |
| 4 | `CursorBackend` | A backend is held by one `InteractionManager`; web `setCursor(null)` is the exact restoration (`element.style.cursor = ''`). No manager teardown calls it. | **Owed:** add a manager release/clear path that calls its pinned backend's `setCursor(null)` before dropping the backend, then clears pointer/capture state. Dropping a hovered manager currently leaves the host cursor mutation behind. |
| 5 | `DialogBackend` | Picker promises own transient UI. Returned `FileDialogHandle` objects key native web handles in `WeakMap`s; the browser handle contract has no close operation and the entries disappear with the caller's handle. Blob/file streams are owned by filesystem operations, not the dialog backend. | **Owned by call/GC.** Settle/cancel the picker and drop the returned handle; there is no backend-wide resource to destroy. |
| 6 | `FileSystemBackend` | `watchPath` returns the originating backend's unsubscribe thunk directly. Returned readable streams are cancelled by the reader; writable streams are closed or aborted by the writer (`writeBinaryFileChunks` demonstrates both paths). | **Owned by returned handles.** Cleanup never needs to rediscover the active backend. |
| 7 | `GeolocationBackend` | Permission subscriptions return an origin-capturing unsubscribe, but `watchGeolocationPosition` exposes only a provider-local number and `clearGeolocationWatch(id)` routes that number to the currently active backend. | **Owed:** allocate a Flight watch id mapped to `{ backend, providerWatchId }`; clear through the stored backend and remove the entry. On replacement, either keep watches creator-pinned until clear or explicitly clear/recreate them—never send an old numeric id to a new provider. |
| 8 | `ImageBackend` | A load is bounded by its promise and optional `AbortSignal`; blob loads revoke their object URL in `finally`. A settled `Image` carries a **borrowed** `HostImageSource`, whose contract explicitly says the resource never owns or frees it. | **Owned by call/borrower.** Abort an in-flight load; after settlement, the source creator/caller owns any source-specific close and the `Image` wrapper is GC-managed. A future owning native image handle would require an entity disposer and origin provenance. |
| 9 | `IpcBackend` | `onIpcMessage`/`onIpcMessageEvent` wrap and retain the exact backend unsubscribe; `removeAllIpcListeners` invokes those thunks. `onIpcInvoke` returns the backend's unregister thunk directly. | **Owned.** Listener and handler cleanup remain pinned to their registration provider. |
| 10 | `SoftKeyboardBackend` | `attachSoftKeyboard` captures the provider unsubscribe; `detachSoftKeyboard`/`disposeSoftKeyboard` invoke it. Show/hide and style/resize setters are explicit host policy commands, not acquired handles. | **Owned.** No whole-backend external object remains. |
| 11 | `LifecycleBackend` | `attachAppLifecycle` captures both state and memory-warning unsubscribes in one entity cleanup; `detachAppLifecycle` invokes it and `disposeAppLifecycle` also deletes saved state. | **Owned.** Both provider streams are released through their originating thunks. |
| 12 | `LoopBackend` | `startApplicationLoop` captures the chosen backend in a local constant. Every stored loop cleanup calls that same backend's `cancelFrame` with its latest handle; `stopApplicationLoop` and `disposeApplication` invoke the cleanup. | **Owned.** Frame cancellation is origin-pinned even if the global loop backend later changes. |
| 13 | `NotificationBackend` | Listener subscriptions are safely rebound by `registerNotificationSubscription`. Display ids, scheduled ids, and optional channel ids are unqualified strings: `closeNotification`, `cancelScheduledNotification`, `updateNotification`, and `deleteNotificationChannel` all route to the current backend. | **Owed:** map every returned/created id to its provider and kind, then route close/update/cancel/delete to that provider. Replacement must explicitly close/cancel/reconcile outgoing live and scheduled entries; `closeAllNotifications` on only the new provider is insufficient. |
| 14 | `ProtocolBackend` | `ProtocolHandler` owns an exact unsubscribe via `detachProtocolHandler`/`disposeProtocolHandler`. Registered/default schemes are provider-owned keys, but `unregisterProtocolScheme` and `removeProtocolSchemeAsDefault` route to the current backend. | **Owed:** record the provider and successful operations per normalized scheme; unregister/remove-default through that provider or deliberately reconcile durable OS registration on replacement. Event-subscription cleanup is already origin-pinned. |
| 15 | `SensorsBackend` | `attachSensors` combines every returned sensor unsubscribe into one closure; `detachSensors`/`disposeSensors` invoke the full set. Generic Sensor implementations stop the sensor and remove their exact reading handler inside those thunks. | **Owned.** Each sensor stream is released by its creator. |
| 16 | `SocketBackend` | `createSocket` stores the returned `SocketConnection` on `Socket.runtime`. `closeSocket` calls that connection directly; `disposeSocket` closes it, detaches delivery, drops the connection/signals, and marks the entity terminal. | **Owned.** No later lookup of the global backend is required. |
| 17 | `StatusBarBackend` | Event entities retain exact unsubscribe thunks. Style entries have `popStatusBarStyleEntry` and `clearStatusBarStyleStack`, but the global `_baseline`, `_applied`, and stack apply through whichever backend is current. | **Owed:** pin the stack baseline/applied state to its provider. Before that provider is lost, restore its baseline; if entries survive replacement, capture the new provider baseline and reapply them. Keep `detachStatusBar`/`disposeStatusBar` for per-entity subscriptions. |
| 18 | `TrayBackend` | `destroyTrayIcon` first calls `stopTrayIconAnimation`, then sends provider-local `tray.id` to the current backend. `_animations` is keyed only by that id. `onTrayEvent` does return an origin-capturing unsubscribe. | **Owed:** make a tray handle retain provider provenance (or keep an id-to-provider registry), key animations by that ownership identity, and route every query/mutation plus `destroy` to the creator. Then stop the local timer and call that creator's `destroy(id)` exactly once. |
| 19 | `UpdaterBackend` | `AppUpdater` subscriptions retain a combined origin-capturing unsubscribe and `disposeAppUpdater` invokes it. An in-flight download, however, is global backend work while `cancelAppUpdateDownload` routes to the backend active at cancellation time. | **Owed:** retain the backend that started a download (or prohibit replacement while one is active) and send cancellation to it before releasing that command lifetime. Entity subscriptions are already safe; feed/config values are durable policy to reapply, not resources to free. |
| 20 | `WgpuHostBackend` | `acquire` returns a `WgpuHostAcquisition` carrying the presentation context, device, format, and explicit `caller \| flight` ownership. `flight` is valid only for handles the backend created for Flight; `caller` borrows the exact supplied device, context, and native-surface identities. `createWgpuRenderState` retains the acquisition and selected backend in the reference-counted shared device runtime; initialization failure calls the captured backend's `release` immediately, while the last `destroyWgpuRenderState` sharing it calls `release` exactly once. Release unconfigures the context and destroys the device only for Flight-owned handles. For caller-owned handles it may detach Flight bookkeeping but must not destroy the device or destroy/unconfigure the presentation context or native surface, which may remain in use outside Flight. | **Owned.** Cleanup is per acquisition and provider-pinned, including failure and final-reference paths. Replacing the process-global backend cannot reroute an existing acquisition's release; derived-state teardown preserves borrowed caller handles, and no zero-argument whole-backend teardown is appropriate. |
| 21 | `InputIngressBackend` | One process-global backend receives many exact `InputIngressSource` identities. Each of the six attachment families returns an opaque release retained by `_inputBindings` under `(InputManager, source, family)`; the Web adapter's releases remove the exact listener records they installed. The backend selection is independent of `Application` and is not stored per source. | **Owned under the shared doctrine above.** Same-key replacement and detach consume the stored release exactly once, backend replacement cannot redirect it, distinct source/window records remain independent, and no zero-argument whole-backend teardown is appropriate. |
| 22 | `AudioDeviceBackend` | Devices, buffers, and sources are returned as keyed handles; each resource family exposes its own matching destroy operation. | **Owned by keyed handles.** Cleanup targets the originating handle rather than a zero-argument whole-backend teardown. |

This table deliberately does not collapse “has a cleanup-named API” into “done.” Geolocation,
notification, protocol, status-bar, and tray cleanup all exist by name yet lack enough provider
provenance to guarantee that cleanup reaches the resource which was created.

## GC-managed, pure, or bounded-call backends

These interfaces do not receive whole-backend hooks in the audited tree. Their implementations do
not retain a freeable external object or unbracketed host mutation beyond the lifetime named here.

| # | Backend | Evidence |
| ---: | --- | --- |
| 1 | `BidiClassBackend` | Pure codepoint-to-class lookup. |
| 2 | `CanvasTextShaperBackend` | Measurement plus a GC cache; `clearCache()` invalidates cached values and is not destruction. |
| 3 | `DeviceBackend` | Snapshot queries fill caller-owned output values. |
| 4 | `GlyphRasterizerBackend` | Per-call rasterization/measurement returns caller-owned data; web scratch canvas state is GC-managed. |
| 5 | `HapticsBackend` | Current web and Capacitor effects are bounded and expose explicit `cancel()`. Web ignores waveform repetition and Capacitor omits waveform. If a future provider honors `repeat >= 0`, that provider acquires a teardown obligation and this row must be reclassified. |
| 6 | `NetBackend` | One-shot request promise bracketed by response consumption and `AbortSignal`; no connection registry. |
| 7 | `PathBooleanBackend` | Pure contour operation over caller-owned arrays. |
| 8 | `PermissionBackend` | One-shot query/request promises returning snapshots. |
| 9 | `PlatformBackend` | Snapshot query into caller-owned output. |
| 10 | `ShareBackend` | One bounded share-sheet promise per call. |
| 11 | `ShellBackend` | Bounded host command promises; no returned live handle. |
| 12 | `StorageBackend` | Synchronous key/value operations. The optional cross-tab listener is package-owned: `disableStorageSignals` invokes the captured unsubscribe, and `setStorageBackend` unsubscribes before rebinding. |
| 13 | `TextSegmenterBackend` | Pure segmentation result; an `Intl.Segmenter` object is ordinary GC-managed state. |
| 14 | `TextShaperBackend` | Per-call measurement/shaping with GC-managed font/cache objects and no external handle contract. |
| 15 | `WebcamBackend` | Bounded picker/capture promises returning data URLs, not a retained camera stream. |

Post-audit row: `AudioBackend` exposes only `canPlayType(mimeType): boolean`; it joins this bucket as
row 16. It has no audio device, decoded buffer, source, stream, or playback ownership.
`AudioDeviceBackend` — anticipated here as a separate contract — has since landed, and is classified
from its actual lifetime shape in the entity/keyed bucket rather than this one, because it does own
resources; they are simply handle-keyed rather than whole-backend.

Post-audit `WgpuHostBackend` and `InputIngressBackend` join the entity/keyed bucket as rows 20–21,
and `AudioDeviceBackend` as row 22. The four new GC rows (17–20) and the three entity/keyed rows
move the live denominator from 43 to 50 and this bucket from 16 to 20. The structural lifecycle
census should therefore report five whole-backend hooks among 50 interfaces.

## Review checklist for the remaining slices

For each of the three missing whole-backend hooks, tests must cover replacement with a different
object, removal with `null`, identical-object reinstall, repeated explicit destruction, and aliasing
between custom and host slots. Assertions must inspect the real external effect—removed listener,
released handle, cleared singleton state—not only a mock call count.

For an entity/keyed row marked owed, tests must create the resource under provider A, replace the
global provider with B, then clean up through the public API and prove that A—not B—received the
resource-specific teardown. That is the smallest test that distinguishes a cleanup-shaped method
from correct ownership provenance.
