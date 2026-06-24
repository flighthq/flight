---
package: '@flighthq/sdk'
crate: flighthq-sdk
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# sdk — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/sdk` is the convenience barrel / single-entry aggregation package. It is **not** a feature domain: it owns no algorithms, types, or runtime behavior of its own. Its sole job is to re-export the entire app-facing `@flighthq/*` package set from one root `.` entry, so applications and examples can `import { … } from '@flighthq/sdk'` instead of naming individual packages. The barrel is a thin `export *` aggregation (86 lines today), `"sideEffects": false`, with every `@flighthq/*` dependency pinned to the workspace wildcard `"*"` and a single `.` export — no subpaths.

Where it ends and a neighbor begins: every _capability_ lives in its owning package; `sdk` adds only the aggregation. The "authoritative library" bar reframes for a barrel from _is the domain deep?_ to _is the aggregation complete, correct, collision-free, and faithful to the by-design inclusion / exclusion policy?_ The inclusion policy itself is centralized in `scripts/sdk-policy.ts` (`isSdkBarrelExcludedPackage`) and enforced repo-side by `npm run packages:check` (`checkSdkBarrelSync`); the package contributes three colocated tests that guard completeness, collision, and reachability.

## North star (proposed)

_Proposed durable principles, inferred from the design and the structural forks. Not blessed — edit or reject in review._

- **Complete and faithful, by construction.** Every app-facing `@flighthq/*` package is present exactly once; nothing excluded (`host-*`, `*-rs`, `sdk` itself) leaks in; nothing app-facing is missing. The barrel is the ground-truth manifest of the app-facing surface — drift is a build failure, not a review note.
- **Zero domain logic.** The barrel never grows behavior, types, or convenience wrappers. If a feature is worth having, it lives in its owning package; the barrel only re-exports. A thin re-export, not an entry point that does work.
- **Tree-shake transparency is the whole premise.** `import { X } from '@flighthq/sdk'` must shake to the same bytes as importing `X` from its owning package — the "hardware store" guarantee. Whether this is a _tested_ contract or a _trusted_ property is open (see below), but the principle that the barrel costs a user nothing they did not import is non-negotiable.
- **Side-effect-free aggregation.** Importing the whole barrel registers no renderers, patches no globals, starts no timers. Every package is `"sideEffects": false`; the aggregate must be too.
- **The inclusion policy is one canonical definition.** What stays out of the barrel is expressed once and enforced mechanically, not maintained by hand across the export list and the dependency block.

## Boundaries (proposed)

_Proposed scope lines, drawn from the review and neighboring packages. Not blessed._

**In scope:**

- Re-exporting the complete app-facing `@flighthq/*` set from the single `.` entry.
- The barrel-boundary guard tests (completeness, collision/namespace-size, reachability spot-checks).
- Keeping the export list and the dependency manifest in lockstep and policy-faithful.

**Non-goals:**

- No algorithms, types, runtime objects, or convenience wrappers of its own.
- No per-file / subpath exports — the barrel is the one entry, and subpaths buy no bundle savings under `"sideEffects": false`.
- Not the home of the inclusion policy's _definition_ (that is `scripts/sdk-policy.ts`), only its application as a re-export list.
- Not a curated or opinionated subset — the policy is "everything app-facing in," with `host-*` and `*-rs` the only standing exclusions.

## Decisions

None blessed yet.

## Open directions

_Every candidate question from the review, plus the structural forks that touch a barrel. These are the real uncertainties — an agent should ask, not assume._

1. **Is the tree-shake guarantee a tested contract or a trusted property?** The whole "hardware store" premise rests on barrel-import == direct-import bytes. Should the SDK own a conformance test for it (a Gold tree-shake test, e.g. extending `size-runner.ts` with a barrel-vs-direct comparison mode), or is the example `size` baseline considered sufficient proof? Highest-value direction for the package; needs a blessed answer.
2. **Should there be a boundary-level side-effect proof?** Per-package `checkNoTopLevelSideEffects` runs per file, but nothing asserts that importing the _whole barrel_ registers no renderers / patches no globals / starts no timers — the aggregate is the case a user actually hits. Worth a single barrel-level assertion, or redundant given the per-file gate?
3. **Where is the inclusion policy's authoritative home?** It is duplicated today by necessity — one copy in `scripts/sdk-policy.ts`, one in `completeness.test.ts` (a package cannot import from repo-root `scripts/`). Is two-copies-with-sync-comment the accepted end state, or should the policy live somewhere a package _can_ import (a tiny `@flighthq/*` util, or generated rather than runtime-parsed)?
4. **Is a full namespace snapshot wanted as an API-review surface?** A committed sorted list of the entire flattened namespace would turn any added/renamed/removed barrel export into a reviewable diff. The `MIN_KEY_COUNT` lower bound (baseline 4196) is the current pragmatic stand-in. Boundary: file location and churn cost across 86 packages — a design decision.
5. **Should `sdk` have a Rust crate at all?** A convenience barrel has no Rust analogue — the Rust port composes crates directly and there is no aggregation crate. Per the CONTRACT, `crate` may be `null`; `sdk` looks like a `null`-crate candidate. The front matter currently says `flighthq-sdk` — confirm or set to `null`.
6. **What is the rule for a package _never_ entering the barrel, beyond `host-*` / `*-rs`?** The policy is currently "everything app-facing in." If a future package is deliberately advanced-only or example-only, the exclusion set needs a _named principle_, not a one-off addition to the predicate.
7. **Doc reconciliation (fork E / the register):** the barrel is the ground truth for the app-facing set, and it currently includes packages the codebase-map Package Map omits or mislabels (`velocity`, `device-formats`, `platform-formats`, `resource-formats`; and the `displayobject-<backend>` / `effects-<backend>` / `filters-<backend>` / `scene-<backend>` families), while the map still lists retired names (`render-canvas`, `render-dom`, `timeline-spritesheet`, `text-shaping` as "designed-not-built"). Should the barrel be treated as the authoritative manifest the Package Map is reconciled against? Note this also intersects the **plurality guard** (fork A/B/E triad): `device-formats` / `platform-formats` were flagged as split-without-plurality cells — if they are retired to `useragent`, the barrel's inclusion list moves with that ruling.
