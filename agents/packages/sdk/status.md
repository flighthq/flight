---
package: '@flighthq/sdk'
updated: 2026-08-08
by: principal
---

# sdk — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/sdk/` and `scripts/` on 2026-08-08. A file:line here is
a claim about this tree, not about a session. The barrel re-exports 139 packages.

- **Six packages reach the public `.` lane but not `./contract`.** `abc`, `compression`, `layout`,
  `physics2d`, `skeleton2d-formats`, and `swf` are `export * from` lines in `src/index.ts` with no
  counterpart in `src/contract.ts` (139 vs 133 lines). That inverts the lane rule everywhere else in
  the SDK, where `./contract` is the full surface and `.` is the cultivated subset — here `.` is the
  superset, so an intra-SDK consumer cannot reach six packages the app lane exposes.
- **The barrel sync check reads one file.** `checkSdkBarrelSync` (`scripts/packages.ts:675`) parses
  only `packages/sdk/src/index.ts` and `package.json` (`:679-680`, `:693-701`). It never opens
  `contract.ts` or the thirteen group files, which is why the drift above passes `packages:check`.
- **`src/index.ts` export lines are unsorted** — seven inversions, including `@flighthq/abc` after
  `@flighthq/clock` (line 19), `@flighthq/easing` after `@flighthq/scene2d-wgpu` (line 34), and
  `@flighthq/bitmap` after `@flighthq/swf` (line 115). The manifest dependency block is sorted; the
  barrel it mirrors is not.
- **`src/index.ts` begins with a UTF-8 BOM.**
- **The barrel has no completeness or collision test of its own.** `src/index.test.ts` (112 lines) is
  a hand-written spot-check of about a dozen domains. `completeness.test.ts` and `collision.test.ts`
  do not exist, and `MIN_KEY_COUNT` / `SENTINEL_NAMES` appear nowhere in the repo, so nothing guards
  the runtime namespace against a silent `export *` shadowing — the case `tsc` cannot catch. The
  repo-level `checkSdkBarrelSync` covers presence of a package, not survival of its names.
- **`export * from '@flighthq/entity'` (`src/index.ts:39`) contributes nothing.** `@flighthq/entity`'s
  public lane is the single line `export {} from './contract';`, so the entity domain is absent from
  the barrel's namespace. Recorded here because it is invisible from this side; the ruling belongs to
  the `entity` cell.
- **Fifteen export subpaths against a two-lane rule.** `package.json` declares `.` and `./contract`
  plus thirteen categorized groups (`./animation` … `./text`). The groups partition `.` exactly —
  every one of the 139 packages appears in exactly one group, and no group names a package `.`
  lacks — so this is not drift but a deliberate third shape. AGENTS.md says "no other subpath is
  allowed", aimed at file-mirroring subpaths, and `packages:check` accepts these. Whether `sdk` is a
  blessed exception or the rule's wording needs the carve-out is a user question; do not settle it
  by editing either side.
- **No tree-shake conformance mode and no namespace snapshot.** `size-runner.ts` has no
  direct-vs-barrel comparison, so `import { X } from '@flighthq/sdk'` is never proven to shake to the
  same bytes as importing `X` from its owning package — the central promise of the barrel.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract, verified against source. The most
  significant false claim dropped is the entire test-gate story the 2026-06-24 entry recorded as
  landed: the "Silver: Collision regression gate (`src/collision.test.ts`)" with its
  `MIN_KEY_COUNT >= 4000` namespace bound and 47 sentinel names, and the "Bronze: Local completeness
  guard (`src/completeness.test.ts`)" reading every `packages/*/package.json`. Neither file exists —
  `src/` holds one test, `index.test.ts` — and neither constant appears anywhere in the repo, so the
  three "Gold" items that were framed as extensions of those gates were resting on nothing. The
  `bitmapfont` note also went: both packages are exported (`src/index.ts:10-11`) and depended on
  (`package.json:104-105`), so the stale commit subject it warned about is no longer contradicted by
  anything in the tree.
- **2026-08-05** — Roughly fifty packages added to the barrel and every large rename swept through
  (`scene`→`scene3d`, `displayobject`→`scene2d`, `camera2d` folded into `camera`, `filters*` split
  into `adjustments`+`effects`).
- **2026-06-25** — `package.json` dependency block alphabetized to match the barrel.
- **2026-06-24** — `scripts/sdk-policy.ts` created as the single inclusion policy, and
  `checkSdkBarrelSync` added to `scripts/packages.ts`; it found three packages missing from the
  barrel on its first run.
