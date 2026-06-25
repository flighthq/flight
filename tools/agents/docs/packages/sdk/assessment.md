---
package: '@flighthq/sdk'
updated: 2026-06-25
basedOn: ./review.md
---

# sdk — Assessment

> Recommendation layer over `review.md` (solid, 90/100), reasoning over the **integration-b2824e3d8 delta** against the approved base origin/main (eb73c3d74). `sdk` is a convenience barrel: no domain, zero names of its own, a thin exhaustive verified pass-through. Maturation here is never "more features" — it is drift-guarding and test honesty. This delta is a strict correctness win (it closed real barrel drift by adding `device-formats` / `platform-formats` / `resource-formats`), with one honesty gap to reconcile and two cosmetic sweeps. The Gold tier remains parked behind Open directions / cross-tooling boundaries.

## Recommended

Strictly sweep-safe: within `packages/sdk/` (or the one repo script the work already owns), no cross-package coupling, no breaking change, no open design decision. Safe for a blanket "do all recommended."

- **Reconcile the missing `completeness.test.ts`.** `scripts/sdk-policy.ts` (new in this delta) comments that it is consumed by `packages/sdk/src/completeness.test.ts`, and `status.md` + the prior `review.md` describe that 9-`it` guard as implemented — but the file is absent from `head/packages/sdk/src/` and is not created in `changes.patch`. Either **land the test** (restoring the package-local completeness guard the docs promise) or **remove the dead claim** (the `sdk-policy.ts` comment line and the status/review prose). The functional drift gate (`packages:check › checkSdkBarrelSync`) is unaffected either way; this is about honesty, not enforcement. — review.md#standards-scorecard-delta-only (standard 7).
- **De-duplicate `SENTINEL_NAMES` in `src/collision.test.ts`.** `DisplayObjectKind` and `BitmapKind` are each listed twice (once under display-object, once under the "types (re-exported kind identifiers)" tail), producing two identical `it()` registrations apiece. Drop the duplicates so the list is 46 unique names. — review.md#standards-scorecard-delta-only (standard 7).
- **Fix the stale count comment in `src/collision.test.ts`.** The inline "across all 83 packages" contradicts the actual **86** app-facing packages (and the status doc's own "86 packages"). One-token correction, no behavior change. — review.md#standards-scorecard-delta-only (standard 7).

## Backlog

Parked: each either waits on an Open direction (the user's gate, surfaced to the charter), crosses into shared repo tooling, or conflicts with the codebase-map testing philosophy. None belong in a blanket sweep.

- **Alphabetize the pre-existing `package.json` dependency tail.** The three new `-formats` deps this delta added are correctly placed; the base manifest's out-of-order tail (`webcam`, `easing`, `loader`, `scene`/`scene-gl`/`scene-wgpu`) is **inherited from the approved base**, not introduced here, so it is out of scope for this merge gate. Parked as a standalone tidy, not a delta finding. — review.md#standards-scorecard-delta-only (standard 6).
- **Tree-shake conformance proof** (barrel-import == direct-import bytes). The load-bearing guarantee of a `sideEffects:false` barrel, currently only assumed via example `size` baselines. Parked: needs a design ruling on whether the SDK owns this test at all (Open direction 1) **and** a barrel-vs-direct mode in `scripts/size-runner.ts` — outside the package boundary. — review.md#gaps.
- **Boundary-level side-effect proof** (importing the whole barrel registers no renderers / patches no globals / starts no timers). Per-file `checkNoTopLevelSideEffects` runs, but the aggregate is the case a user hits. Parked: requires extending the repo's side-effect-free checker to run against the barrel — tooling integration, not package-local code. — review.md#gaps.
- **Full export-surface snapshot** (committed sorted flattened-namespace list, reviewed on change). Would turn any added/renamed/removed export into a reviewable diff; `MIN_KEY_COUNT` is today's stand-in. Parked: file location and churn cost across 86 packages is an open design decision (Open direction 3). — review.md#gaps.
- **Single importable home for the inclusion policy.** The predicate lives in `scripts/sdk-policy.ts`; a package cannot import from repo-root `scripts/`, hence the (currently dangling — see Recommended) synced-copy intent. Parked: two-copies-with-sync vs. a package-importable util is a repo-tooling design decision (Open direction 2). — review.md#charter-fit.
- **Rust-port symmetry guard / `crate:` front-matter question.** Whether `sdk` should have a Rust crate at all (a barrel has no Rust analogue; the front matter currently says `flighthq-sdk`) is a cross-worktree design item touching `rust/conformance.md` and the crate-existence rule. Raise with the Rust-port owner (Open direction 4). — review.md#charter-fit.
- **Consumer import-path integration test.** Parked **and discouraged**: the codebase-map testing philosophy rejects standing api/integration buckets that only prove "the surface compiles" — barrel wiring is already exercised by the functional/example/reference visual suites and by `packages:check`/`npm run api`. — codebase-map Testing (conflicts).

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Routed to the charter's Open directions

Surfaced for the user to settle (the assessment notes these; it does not edit the charter):

1. **Is the tree-shake guarantee a tested contract or a trusted property?** Highest-value direction — the "hardware store" premise rests on barrel-import == direct-import bytes.
2. **Where is the inclusion policy's authoritative home?** Accept two-copies-with-sync, or move it somewhere a package can import. (Sharpened by this delta: the synced _copy_ the comment names — `completeness.test.ts` — is currently missing, so "the policy is duplicated" is at present untrue.)
3. **Is a full namespace snapshot wanted as an API-review surface?** Resolves the parked snapshot item.
4. **Should `sdk` have a Rust crate at all?** The barrel may be the one legitimately TS-only package; the charter front matter currently asserts `crate: flighthq-sdk`.
5. **What is the named principle for a package _never_ entering the barrel beyond `host-*`/`*-rs`?** The policy is "everything app-facing in"; a future advanced-only / example-only package needs a named exclusion rule.
6. **Barrel-guard tests vs. the codebase-map "no barrel smoke test" rule.** The sdk charter blesses the completeness / collision / reachability guards as in-scope, while the codebase-map Testing section deprecates barrel smoke tests as "a strictly weaker version of work CI already does." Reconcile which governs — the package charter currently wins, but the conflict should be settled in the docs.

Also flagged (doc revision, not package work): the codebase-map **Package Map is stale** against the realized set — the barrel is the ground truth (now correctly including the three `-formats` packages) and the map should be reconciled against it.
