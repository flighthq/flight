# Render Oracle Repository — blessed reference images, and where they are stored

**Status: PROPOSAL, awaiting ruling.** Raised by the user 2026-08-14, drafted by principal. Two
repository changes and one new verification tier are proposed. §7 is an open decision the schema
depends on and is deliberately not answered here.

Read before changing how functional regression is verified, before adding a capture tier, or before
touching `FIXTURE_RELEASE_TAG` in `scripts/fixtures.ts`.

## 1. The gap this closes

Functional regression today compares a **16×16 averaged grid** — `createBitmapFingerprint`'s default
`gridSize` (`packages/bitmap/src/bitmapFingerprint.ts`). On an 800×600 capture each cell averages
~1,900 pixels. `evaluateCaptureRegression` already carries the consequence on its own doc comment:

> ⚠ A PASS MEANS THE FINGERPRINT DID NOT MOVE, WHICH IS NOT THE SAME AS THE RENDER NOT MOVING. […]
> Three separate defects in this repository passed this check while the pixels underneath disagreed,
> one of them by more than fifty times the distance reported here.

That is the whole motivation. It is not an ergonomic preference for looking at pictures: the current
tier has three logged escapes, and the failure mode is structural — any pattern finer than a cell
(scanlines, dithering, a fine periodic warp) can change completely while every cell average holds
still.

The repository stores **two** kinds of evidence per column today, and they sit at opposite extremes:

| Tier | Stored | Sensitivity | Problem |
| --- | --- | --- | --- |
| `fingerprint` | 256 averaged cells | far too coarse | the three escapes above |
| `sha256` | exact bytes | absolute | any antialiasing jitter fails it |

**The missing tier is fuzzy comparison at full pixel resolution.** Nothing else about the capture
pipeline needs to change to add it.

## 2. The comparison algorithm already exists

No new algorithm is proposed. `packages/bitmap/src/bitmapCompare.ts` already has it:

```ts
getBitmapMismatch(source, other, channelTolerance)
  → { mismatchedPixels, totalPixels, fraction, maxChannelDelta }
```

A pixel is mismatched when its largest RGBA channel difference exceeds `channelTolerance`; the result
carries both the mismatched `fraction` and the worst single-channel excursion. That is the standard
shape, it is in-tree, tested, and typed in `packages/types/src/BitmapMismatch.ts`. `compareBitmap` in
the same file produces the per-channel delta *image* for human review.

**So the missing piece is storage of the reference image, and nothing else.** The comparison
primitive exists; the tolerance vocabulary exists; the regression path simply has no full-resolution
referent to compare against.

**Do not inherit the existing tolerance constants.** `CAPTURE_PARITY_TOLERANCE = 15` and
`CAPTURE_REGRESSION_TOLERANCE = 5` are mean-absolute-difference in *fingerprint space* — a mean over
256 cells. Pixel-space `fraction` and `maxChannelDelta` are different units over a different
distribution. Copying `5` across would look principled and mean nothing; the pixel thresholds need
their own calibration run against a known-good corpus, and that run is part of the work.

## 3. Repository topology

Two changes, independent of each other:

- **`flight-oracles` → `flight-fixtures`.** The existing repo holds an *input corpus* for import
  conformance. A corpus is not an oracle: a test oracle is the mechanism that decides pass/fail. The
  repo's own vocabulary already uses the word that way (`functional-test/SKILL.md` §"Per-scene oracle",
  and the conformance adapters' "probe/oracle"). `flight-fixtures` also matches the code as written —
  `npm run fixtures`, `FIXTURE_RELEASE_TAG`, `FixturePackEntry`, `conformance/fixtures/` — so the
  rename costs no vocabulary change. `flight-conformance` was considered and rejected: the in-repo
  `conformance/` directory is the *harness*, and two things named conformance holding different
  contents is a name that needs explanation.
- **New `flight-oracles`** — blessed reference images for functional capture.

**Do not reuse the name for the new repo while the old URL is still referenced.** `scripts/fixtures.ts:106`
pins `https://github.com/flighthq/flight-oracles/releases/download` at tag `0.1.1`. A GitHub rename
leaves a redirect, but that redirect dies the moment the old name is reoccupied — after which the
pinned URL resolves into the *new* repo and 404s. There are no external consumers, so this is
recoverable, but it is the same class of hazard the constant's own comment already names one level up
("a fixture set that moves under the tests makes every future conformance number irreproducible, and
the failure is silent"). Retire the name rather than recycle it.

## 4. Storage — measured, and the reason the obvious answer is wrong

The obvious design is loose PNGs committed to the oracle repo, reviewed through GitHub's native image
diff. **That was measured and rejected.**

Method: commit the real `webgl` functional captures; replace each with its `webgpu` sibling for the
same scene (visually similar, genuinely novel bytes, never previously committed — a stand-in for a
re-render); `git gc --aggressive`; compare pack size.

| Corpus | Images | Changed | Pack growth vs changed raw |
| --- | --- | --- | --- |
| Synthetic flat-block PNGs (11 KB avg) | 200 | 30 | **8%** |
| **Real screenshots (38 KB avg)** | 145 | 98 | **88%** |

Base pack 5,412 KB → 9,608 KB; 4,196 KB stored for 4,742 KB of changed images.

**Git cannot delta PNGs.** They are already deflate-compressed, so antialiasing noise scrambles the
compressed stream globally even where the image barely moved.

> The synthetic measurement said 8% and was wrong by **11×**. Flat blocks under a uniform channel
> shift are the easiest possible case for a binary delta and are not representative of a render. If
> this is ever re-measured, measure it on real captures — the shortcut does not merely lose precision,
> it inverts the conclusion.

Caveat held open: webgl→webgpu is a *larger* change than a typical re-bless, so 88% is a pessimistic
bound; 60–90% is the realistic band. It does not approach zero at any point in that band.

Projected: ~12 MB packed for the current 427 functional PNGs, then **~1 MB permanently per PR that
re-blesses 30 images**, ~18 MB per full re-bless of all 559, ~500 MB over 500 PRs of renderer work.
Every clone pays it forever, and it never shrinks.

### The proposal: git holds text, releases hold images

```
oracles/functional/shape-fill-solid/webgl.json   ← provenance + sha256 of the image
manifest.json                                     ← pack → sha256
```

Git stays permanently small, diffs are readable, and `git blame` on provenance is meaningful. Images
are release assets — which they must be anyway for the consumer path, so this introduces no second
storage system. CI fetches the previous images from the last release by checksum to compute the diff,
which means **the consumer fetch path runs on every PR** rather than only at release.

Rejected alternatives:

- **Git LFS** — still pays storage growth, adds quota and a checkout dependency, and buys back an
  image diff that §5 replaces with something better.
- **Commit images, periodically squash the branch** — viable fallback. Image *history* has near-zero
  value (nobody needs last year's oracle for a scene; release tags pin what shipped), so truncation is
  legitimate for a generated-artifact repo in a way it is not for source. Caps the clone at ~15 MB but
  loses the text audit trail the proposal keeps.

### Packs, not one archive

`scripts/fixtures.ts` already splits its corpus into packs with a per-pack manifest, sha256, and an
extraction stamp (`FixtureTreeStampPack`). Apply the same model: a scene3d-only change must not drag
the text and shape oracles down the wire. `scripts/fixtures-core.ts` is already factored into
reusable pieces — `parseFixtureManifest`, `planFixtureFetch`, `crossCheckFixtureChecksums`,
`parseFixtureChecksums` — so a second consumer is mostly wiring. Whether that layer is genuinely
generic is itself worth learning from this work.

## 5. What an approval PR contains

The reviewer is **blessing** an image. Everything in the PR exists to make that act mean something.

1. **A generated report** as the review surface — CI artifact or Pages preview — showing old │ new │
   delta per changed image with `fraction` and `maxChannelDelta`, sorted by magnitude. `compareBitmap`
   produces the delta image; it is derived and is never committed.
2. **Provenance per changed image.** The schema exists: `CaptureBaselineProvenance` in
   `packages/types/src/CaptureBaselineProvenance.ts` — `frames`, `sourceHash`, `targetKind`,
   `verifyPublished`, `warmupFrames`. Its own doc comment is this exact mistake caught one layer down:
   *"the record says what was measured and not what it was measured under […] Two records that
   disagree are then indistinguishable from two records taken under different conditions."* Two fields
   must be added for oracles: the **Flight commit SHA** that produced the capture, and the **capture
   environment id** (§7).
3. **Declared scope, and collateral split out.** A renderer change can legitimately move 200 images.
   Nobody reviews 200 screenshots; they scroll and approve, and the gate becomes ceremony. The PR body
   declares which scenes and backends are *expected* to move and why, and the report splits changed
   images into **in-scope** (reviewed in aggregate, spot-checked) and **out-of-scope** (moved without
   being predicted — this is the list that gets eyes). That makes collateral damage the most visible
   thing on the page rather than the most buried, and collateral damage is precisely the class the
   fingerprint tier was already missing.
4. **Unchanged images are not rewritten.** PNG encoder nondeterminism otherwise turns every
   regeneration into a full-corpus diff.

Approval is the merge plus the tag. The tgz is built by CI from the approved tree, so the release is
derived from a blessed state rather than uploaded alongside one. No approval field is invented; the
record is git-native.

## 6. Two gates, both required, both with firing tests

- **Missing captures are listed, never absent.** [capture verification tiers](capture-verification-tiers.md)
  §"A missing premise is labelled, never argued": *never fill in a missing premise from reasoning.* A
  scene that failed to capture must appear in the report as explicitly missing, or "all images
  approved" silently includes images nobody produced.
- **Every oracle image has a live referent.** Same doc, §"A fingerprint with no scene is not weak
  evidence — it is not evidence." The repo already fails on orphaned fingerprints via
  `findOrphanedBaselineFingerprints` in `scripts/support.ts`, for a measured reason: a package rename
  once swept four scenes' baselines and silently destroyed their evidence. Oracle images need the same
  orphan check.

That doc's gate table carries a **"proven to fire"** column and an explicit instruction: *"When adding
a gate of this family, add the row and the firing test together."* The zero-evidence gate here — the
PR check must fail when zero images were compared, not pass vacuously — needs its firing test written
alongside it and a row added to that table. This is not optional polish; it is the condition under
which the table stays honest.

## 7. Open decision — canonical capture environment

**This is the ruling the schema waits on, and it is deliberately not answered here.**

Fuzzy comparison narrows driver variance; it does not erase it. [commands](commands.md) records that
regression today is "coupled to where its baselines were captured," which is why it cannot gate PRs. A
blessed PNG captured on one GPU and verified against another is that same problem with a larger
payload.

- **One canonical environment** (Docker/SwiftShader; `scripts/reference-capture.ts` shows Docker
  capture already exists in some form). Bless and verify in the same deterministic environment,
  tolerances stay tight, and regression becomes environment-*independent* — after which it could join
  smoke and parity as a gate on every PR. That is a larger win than the storage change itself.
- **Per-environment oracle sets** keyed by GPU/driver. Combinatorial, and every new CI runner
  invalidates the set.

The choice determines whether the oracle set has one column per backend or one per backend ×
environment — that is, it determines the schema, which is why no schema is committed until it is
ruled on.

## 8. Scope

Proposed: the rename, the new repository, the pixel tier, the approval flow, the two gates.

Not proposed, and explicitly out of scope until the above lands: retiring the `fingerprint` tier
(it stays as the cheap first check), changing `sha256` semantics, changing which scenes are captured,
and any change to the parity leg — parity is environment-independent today and gains nothing here.
