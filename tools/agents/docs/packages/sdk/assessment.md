---
package: '@flighthq/sdk'
updated: 2026-06-24
basedOn: ./review.md
---

# sdk — Assessment

> Recommendation layer over `review.md` (authoritative, 96/100) and the absorbed maturation roadmap (`reviews/maturation/depth/sdk.md`). `sdk` is a convenience barrel: it has no domain, adds zero names, and must stay a thin, exhaustive, verified pass-through. Maturation here is never "more features" — it is drift-guarding and test depth. The Bronze tier of the roadmap has **already landed** in this bundle (completeness, collision, and reachability tests exist; the inclusion policy is centralized in `scripts/sdk-policy.ts`; `packages:check › checkSdkBarrelSync` is the repo-level drift gate), so what remains is a short cosmetic sweep plus a cluster of parked items that all wait on an Open direction or cross repo-tooling boundaries.

## Recommended

Strictly sweep-safe: within `packages/sdk/` (or the one repo script the work already owns), no cross-package coupling, no breaking change, no open design decision. Safe for a blanket "do all recommended."

- **Alphabetize the `package.json` dependency block.** `src/index.ts` is sorted but the manifest dependency block is not (`webcam`, `easing`, `loader`, `scene`/`scene-gl`/`scene-wgpu` out of position). Restores symmetry with the sorted barrel and honors the source-style "keep it ordered" intent. The completeness test enforces _set_ equality, not order, so nothing else catches it. — review.md#cosmetic--cleanliness-findings
- **De-duplicate `SENTINEL_NAMES` in `src/collision.test.ts`.** `DisplayObjectKind` and `BitmapKind` are each listed twice (once under display-object, once under the "types (re-exported kind identifiers)" tail), producing two identical `it()` registrations apiece. Drop the duplicates so the list is 46 unique names, matching the asserted count. — review.md#cosmetic--cleanliness-findings
- **Fix the stale count comment in `src/collision.test.ts`.** The inline "across all 83 packages" comment contradicts the actual **86** app-facing packages. One-token correction, no behavior change. — review.md#cosmetic--cleanliness-findings

## Backlog

Parked: each either waits on an Open direction (a design decision that is the user's gate, surfaced to the charter), crosses into shared repo tooling, or conflicts with the codebase-map testing philosophy. None of these belong in a blanket sweep.

- **Tree-shake conformance proof** (barrel-import == direct-import bytes). The load-bearing guarantee of a `sideEffects:false` barrel, currently only assumed (relied on transitively via example `size` baselines). Parked: needs a design ruling on _whether the SDK owns this test at all_ (Open direction
  1. **and** extending `scripts/size-runner.ts` with a barrel-vs-direct mode — outside the package boundary. — review.md#gaps, roadmap Gold.
- **Boundary-level side-effect proof** (importing the whole barrel registers no renderers / patches no globals / starts no timers). Per-package `checkNoTopLevelSideEffects` runs per file, but the aggregate is the case a user hits. Parked: requires extending the repo's side-effect-free invariant checker to run against the barrel — a tooling-integration item, not package-local code. — review.md#gaps, roadmap Gold.
- **Full export-surface snapshot** (committed sorted list of the entire flattened namespace, reviewed on change). Would turn any added/renamed/removed export into a reviewable diff at the barrel boundary; `MIN_KEY_COUNT` is today's pragmatic stand-in. Parked: the file location and churn cost across 86 packages is an open design decision (Open direction 3) — the user's gate. — review.md#gaps, roadmap Gold.
- **Per-domain reachability table** (promote the spot-check into a data-driven, domain-keyed list so a new domain package prompts a new row). Parked: the roadmap sequences this _into_ the export-surface snapshot (the snapshot subsumes it), so it should not be built independently of the snapshot decision. The current 22-`it` / 11-domain spot-check already covers the smoke-gate need. — roadmap Silver/Gold.
- **Single importable home for the inclusion policy.** Today the app-facing predicate lives in `scripts/sdk-policy.ts` with an acknowledged synced copy in `completeness.test.ts` (a package cannot import from repo-root `scripts/`). Parked: whether the two-copies-with-sync-comment arrangement is the accepted end state, or the policy should move somewhere a package _can_ import, is a repo-tooling design decision (Open direction 2). — review.md#candidate-open-directions.
- **Generated-and-diffed `index.ts`.** A generator that derives the expected `export *` + dependency block and diffs against the committed files. Parked: largely **already satisfied** by `packages:check › checkSdkBarrelSync` (the repo-level barrel-sync gate that caught the real `*-formats` drift); any remaining generate-and-diff hardening is the same cross-tooling / policy-home decision above, not new package code. — roadmap Silver.
- **Rust-port symmetry guard** (assert the app-facing TS set the barrel covers matches the expected crate set, recording "no `flighthq-sdk` crate by design"). Parked: cross-worktree design item — it touches the conformance divergence map (`rust/conformance.md`) and the crate-existence rule, both outside this package. Also entangled with the `crate:` front-matter question (Open direction 4: should `sdk` have a Rust crate at all? — the charter currently says `flighthq-sdk`). Raise with the Rust-port owner. — review.md#contract--docs-fit, roadmap Gold.
- **Consumer import-path integration test** (end-to-end user flow purely through `@flighthq/sdk`). Parked **and discouraged**: the codebase-map testing philosophy explicitly rejects standing api/integration buckets that only prove "the surface compiles" — cross-package wiring through the barrel is already exercised far more thoroughly by the functional/example/reference visual suites and by `packages:check`/`npm run api`. This item would recreate exactly that discouraged bucket. — roadmap Gold (conflicts with index.md Testing).

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Routed to the charter's Open directions

Surfaced for the user to settle (the assessment notes these; it does not edit the charter). All five match `review.md`'s candidate open directions:

1. **Is the tree-shake guarantee a tested contract or a trusted property?** The highest-value direction — the whole "hardware store" premise rests on barrel-import == direct-import bytes.
2. **Where is the inclusion policy's authoritative home?** Accept the two-copies-with-sync-comment, or move it somewhere a package can import (a tiny util, or generation over runtime parsing)?
3. **Is a full namespace snapshot wanted as an API-review surface?** Resolves the parked snapshot + per-domain-table items.
4. **Should `sdk` have a Rust crate at all?** The barrel may be the one legitimately TS-only package; the charter front matter currently asserts `crate: flighthq-sdk`. Settles the Rust-symmetry item.
5. **What is the named principle for a package _never_ entering the barrel beyond `host-*`/`*-rs`?** The policy is "everything app-facing in"; a future advanced-only / example-only package needs a named exclusion rule, not a one-off.

Also flagged in the review for the user (doc revisions, not package work): the codebase-map **Package Map is stale** against the realized package set (missing `velocity`, `device-formats`, `platform-formats`, `resource-formats`; still lists retired `render-canvas`/`render-dom`/ `timeline-spritesheet` and `text-shaping` as designed-not-built) — the barrel is the ground truth and the map should be reconciled against it.
