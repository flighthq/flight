---
package: '@flighthq/sdk'
status: authoritative
score: 96
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
  - charter.md
---

# sdk — Review

> Survey of `@flighthq/sdk` from the incoming bundle `builder-67dc46d64`. Evidence is the head tree at `incoming/builder-67dc46d64/head/packages/sdk/` plus `scripts/sdk-policy.ts`, `scripts/packages.ts`, and `changes.patch`. The prior depth review (`reviews/depth/sdk.md`) does **not** exist on disk — its domain line survives only as the charter's seeded "What it is", so there is no point-in-time review to supersede here; this is the first survey.

## Verdict

authoritative — 96/100. For a convenience barrel the "authoritative library" bar reframes to _is the aggregation complete, collision-free, and faithful to the inclusion/exclusion policy?_ — and it is. Every one of the 86 app-facing `@flighthq/*` packages is re-exported and depended on, the inclusion policy is centralized in one function and enforced by `packages:check`, and three colocated tests guard completeness, collision, and reachability. The deductions are small and cosmetic: an un-alphabetized `package.json` dependency block, two duplicated sentinel entries, and a couple of stale count comments.

## Present capabilities

Grounded in `67dc46d64:packages/sdk/src/` and the two repo scripts the work touched:

- **Complete, faithful barrel** (`src/index.ts`). 86 `export * from '@flighthq/<pkg>'` lines, verified by independent enumeration to cover exactly the app-facing set (all `@flighthq/*` workspace packages minus `sdk` itself, `host-*`, and `*-rs`). No app-facing package is missing; no excluded or non-existent package leaks in. `index.ts` is correctly alphabetized.
- **Centralized inclusion policy** (`scripts/sdk-policy.ts`). One exported predicate `isSdkBarrelExcludedPackage(name)` is the single canonical definition of what stays out of the barrel (`@flighthq/sdk`, `@flighthq/host-*`, `@flighthq/*-rs`). `scripts/packages.ts` imports it; the completeness test keeps an acknowledged local copy (`isExcludedPackage`) with a sync comment because a package cannot import from repo-root `scripts/`.
- **Repo-level barrel-sync gate** (`scripts/packages.ts › checkSdkBarrelSync`, lines ~346-422). Runs inside `npm run packages:check`: collects app-facing names, parses the `export *` lines and the `@flighthq/*` deps, and reports three error classes (missing-from-export, missing-from-deps, points-at-excluded/nonexistent) with actionable messages; `--json` surfaces a `barrelSync` section. Per the status doc, on first run this caught real drift (`device-formats`, `platform-formats`, `resource-formats` missing from the barrel) — evidence the gate earns its place.
- **Completeness test** (`src/completeness.test.ts`, 9 `it`s). Reads the monorepo at test time and asserts: every app-facing package appears as both an `export *` and a `"*"` dependency; `host-*` / `*-rs` / `host-electron` are absent from both; and the export↔dep manifest is bidirectionally in sync with all `@flighthq/*` deps pinned to the workspace wildcard `"*"`.
- **Collision regression gate** (`src/collision.test.ts`, 2 `describe`s). Runtime complement to `tsc -b` (which already makes an ambiguous `export *` a compile error): asserts the flattened namespace holds `>= 4000` keys (baseline 4196) to catch silent net loss from shadowing/removal, and asserts 46 unique sentinel names spanning ~25 domains resolve through the barrel.
- **Reachability spot-check** (`src/index.test.ts`, 22 `it`s). Eleven domain `describe` blocks assert representative `create*` exports are functions and that canonical `*Kind` strings carry their expected values (`BitmapKind='Bitmap'`, `DisplayObjectKind='DisplayObject'`, `SpriteKind='Sprite'`, `TextLabelKind='TextLabel'`, `ParticleEmitterKind='ParticleEmitter'`) — so a sub-package kind regression surfaces at the barrel.
- **Correct package envelope** (`package.json`). `"sideEffects": false`, single `.` export (`types`+`default`), `version: 1.0.0`, every `@flighthq/*` dep pinned `"*"`. No subpath exports — a thin re-export, exactly as the codebase map prescribes.

## Status-doc verification (AS-CLAIMED → verified)

Every load-bearing claim in `status.md` was checked against the diff and head source:

- **Barrel completeness / no drift** — VERIFIED. Independent `comm` of app-facing vs. barrel-export vs. barrel-dep sets is empty in both directions (the lone "dep not export" hit is the package's own `"name"` field, not a real dep entry).
- **Three new packages added to fix drift** (`device-formats`, `platform-formats`, `resource-formats`) — VERIFIED present in both `index.ts` and the deps.
- **`sdk-policy.ts` single export; `packages.ts` barrel-sync integration; three tests present** — VERIFIED at the cited symbols.
- **`index.ts` alphabetized** — VERIFIED.
- **"4196 keys across 86 packages" / "83 packages"** — the namespace key count cannot be verified from static source (it needs a build), but the package _count_ is **86** app-facing packages, so the collision test's inline comment "across all 83 packages" (and the status's "86 packages" elsewhere) is internally inconsistent and stale. Cosmetic.

## Gaps

A barrel has a low ceiling; these are the only meaningful absences, all of which the status doc already parks as deferred Gold items — recorded here as the gap inventory, not re-prescribed:

- **No tree-shake conformance proof.** Nothing asserts `import { X } from '@flighthq/sdk'` tree-shakes to the same bytes as importing `X` from its owning package. This is _the_ load-bearing guarantee of a `sideEffects:false` barrel and it is currently only assumed (relied on transitively via the example `size` baselines). Requires extending `size-runner.ts` with a barrel-vs-direct comparison mode.
- **No boundary-level side-effect proof.** Per-package `checkNoTopLevelSideEffects` runs on each file, but nothing asserts that importing the _whole barrel_ registers no renderers / patches no globals / starts no timers. The aggregate is the case a user actually hits.
- **No full export-surface snapshot.** The sentinel list covers 46 names; a committed sorted snapshot of the entire flattened namespace would turn any added/renamed/removed export into a reviewable diff at the barrel boundary. The `MIN_KEY_COUNT` lower bound is the pragmatic stand-in.

## Cosmetic / cleanliness findings

Small, within-file, sweep-safe:

- **`package.json` deps are not alphabetized.** `index.ts` is sorted but the manifest dependency block is not (`webcam`, `easing`, `loader`, `scene`/`scene-gl`/`scene-wgpu` are out of position). npm does not care, but it violates the source-style "keep it ordered / leave files cleaner" intent and breaks the symmetry with the sorted barrel. The completeness test enforces _set_ equality, not _order_, so nothing catches this.
- **Duplicate sentinels.** `SENTINEL_NAMES` lists `DisplayObjectKind` and `BitmapKind` twice (once under display-object, once under a "types (re-exported kind identifiers)" tail), producing two identical `it()` registrations each. Harmless, but the "47 sentinel names" claim is really 46 unique / 48 with dupes.
- **Stale count comment** in `collision.test.ts` ("across all 83 packages") vs. the actual 86.

## Charter contradictions

None. The charter's "What it is" frames the package exactly as the code behaves — a thin, complete, collision-free, policy-faithful re-export with no domain logic of its own — and the code upholds every clause. North star / Boundaries / Decisions are still `TODO`, so there is little to contradict; the silences are surfaced below as candidate Open directions rather than scored against.

## Contract & docs fit

**Package lives up to the contract:**

- Single root `.` export, `"sideEffects": false`, full unabbreviated re-exported names (inherited), workspace-wildcard deps — all satisfied.
- Tests are colocated `*.test.ts`, `describe` blocks alphabetized and domain-named.
- The barrel correctly _omits_ the non-existent `render-canvas`/`render-dom`/`timeline-spritesheet` and the Rust-only `*-rs` and `host-*` packages — faithful to the inclusion policy and to the Rust port's "TS is authoritative; `*-rs` is a mixing leaf, not app-facing API" rule.

**Candidate doc revisions (user's gate, not mine):**

- **Codebase-map Package Map is stale against the realized package set.** The barrel pulls in `@flighthq/log`, `@flighthq/math`, `@flighthq/velocity`, `@flighthq/clip`, `@flighthq/particles-formats`, `@flighthq/device-formats`, `@flighthq/platform-formats`, `@flighthq/resource-formats` and the `displayobject-<backend>` / `effects-<backend>` / `filters-<backend>` / `scene-<backend>` families. The _head_ `tools/agents/docs/index.md` documents some of these (`math`, `log`, `clip`, `particles-formats`) but still lists retired names (`render-canvas`, `render-dom`, `text-shaping` as "designed-not-built", `timeline-spritesheet`) and omits `velocity`, `device-formats`, `platform-formats`, `resource-formats`. The barrel is the ground truth for the app-facing set; the Package Map should be reconciled against it.
- **`crate: flighthq-sdk` in the charter front matter is questionable.** A convenience barrel has no Rust analogue — the Rust port composes crates directly and there is no aggregation crate. Per the CONTRACT, `crate` may be `null` for packages with no Rust crate; `sdk` looks like a `null`-crate candidate. Flag for the user.
- **`MANIFEST.json › packages` is empty** in this bundle (0 entries), yet the SKILL describes it as the ingest index. The ingest evidently proceeded from the flat `status/sdk.md` drop instead. Not an sdk finding per se, but worth noting the manifest index was not the working signal here.

## Candidate open directions

The charter's North star / Boundaries / Decisions are all `TODO`; these are the questions a reviewer had to assume, surfaced for the user to settle:

1. **Is the tree-shake guarantee a tested contract or a trusted property?** The whole "hardware store" premise rests on barrel-import == direct-import bytes. Should the SDK own a conformance test for it (Gold tree-shake test), or is the example `size` baseline considered sufficient proof? This is the single highest-value direction for the package and needs a blessed answer.
2. **Where is the inclusion policy's authoritative home?** Today it is duplicated by necessity — one copy in `scripts/sdk-policy.ts`, one in `completeness.test.ts`. Is the two-copies-with-sync-comment arrangement the accepted end state, or should the policy live somewhere a package _can_ import (e.g. a tiny `@flighthq/*` util, or generation rather than runtime parsing)?
3. **Is a full namespace snapshot wanted as an API-review surface?** A committed sorted key list would make every barrel-level API change a visible diff. Boundary (file location, churn cost across 86 packages) is a design decision.
4. **Should `sdk` have a Rust crate at all?** (See the `crate` front-matter note above.) A barrel may be the one package that is legitimately TS-only.
5. **Boundaries: what is the rule for a package _never_ entering the barrel beyond `host-*`/`*-rs`?** The policy is currently "everything app-facing in"; if a future package is deliberately advanced-only or example-only, the exclusion set needs a named principle, not a one-off.
