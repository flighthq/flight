# Render Oracle Repository — blessed reference images, and where they are stored

**Status: PROPOSAL, awaiting ruling.** Raised by the user 2026-08-14, drafted by principal and
expanded after user review. One new repository, one cross-repository commissioning workflow, and one
new verification tier are proposed. §10 is an open decision the schema depends on and is deliberately
not answered here.

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
| `sha256` | exact decoded pixels | absolute | any antialiasing jitter fails it |

**The missing tier is fuzzy comparison at full pixel resolution.** Capture already emits the PNG; the
work below makes that image a durable, reviewable, reproducibly fetched referent and wires the existing
comparison primitive to it.

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

**No new comparison primitive is missing.** The remaining work is the reference-image storage and
the cross-repository lifecycle that supplies it; the regression path simply has no full-resolution
referent to compare against today.

**Do not inherit the existing tolerance constants.** `CAPTURE_PARITY_TOLERANCE = 15` and
`CAPTURE_REGRESSION_TOLERANCE = 5` are mean-absolute-difference in *fingerprint space* — a mean over
256 cells. Pixel-space `fraction` and `maxChannelDelta` are different units over a different
distribution. Copying `5` across would look principled and mean nothing; the pixel thresholds need
their own calibration run against a known-good corpus, and that run is part of the work.

## 3. Repository topology

The prerequisite rename has happened: the former `flight-oracles` input-corpus repository is now
`flight-fixtures`, and `scripts/fixtures.ts` pins
`https://github.com/flighthq/flight-fixtures/releases/download`. The name is therefore free only after
the organization-side rename and its release assets have also been verified; the source-side redirect
hazard this proposal originally named is closed.

The proposed **new `flight-oracles`** repository holds the blessed reference-image records and release
packs consumed by Flight's full-resolution pixel-regression oracle. The precise Flight evidence-kind
name is **`referenceImage`**, not `oracle`: `oracle` already means the scene's in-page `assertRender`
mechanism in `captureBaselineCoverageManifest.ts` and `agents/commands.md`. Keeping those names distinct
prevents a static scan finding an `assertRender` export from being mistaken for proof that a reference
image exists.

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

The current denominator is reproducible rather than inferred: `npm run evidence -- --check` reports
493 functional targets, 450 with screenshot-hash pins and 43 without. A direct baseline census finds
483 renderer columns, so the 43 are 33 hashless columns plus 10 targets with no column. A full
`capture:functional -- --build --fail-on-error` plus exact retries emitted a ready PNG for all 493
targets (15.03 MiB total), including all 43 pinless targets; `git ls-files` and `git log --all` find no
committed functional PNG in the repository or its history. Thus 427 is neither a committed-corpus count
nor a screenshot-hash-column count; whether it once described an external runtime capture is not
reproducible from the tree.

Projected from that current capture: ~15 MB packed for the 493 functional PNGs, then **~1 MB permanently
per PR that re-blesses 30 images**, ~20 MB per full re-bless of all 625 functional and example targets,
~500 MB over 500 PRs of renderer work. Every clone pays it forever, and it never shrinks.

### The proposal: git holds text, releases hold images

```
oracles/functional/shape-fill-solid/webgl.json   ← identity, provenance, image hashes, pack
manifest.json                                     ← pack → sha256
```

Git stays permanently small, diffs are readable, and `git blame` on provenance is meaningful. Images
are release assets — which they must be anyway for the consumer path, so this introduces no second
permanent storage system. CI fetches previous images from the release pinned by Flight's
`oracle-lock.json`, verifies every pack checksum, and computes the diff. This means **the consumer
fetch path runs on every PR** rather than only at release.

The per-image `sha256` must not be left ambiguous. The record carries both:

- `artifactSha256` — SHA-256 of the encoded PNG bytes stored in the pack, used for transport and exact
  promotion; and
- `pixelSha256` — SHA-256 of the decoded top-down RGBA bytes, used to distinguish a changed render from
  a changed PNG encoder.

The existing capture baseline's `sha256` is over decoded pixels. A release pack needs the encoded-byte
hash as well; one field cannot truthfully answer both questions.

Rejected alternatives:

- **Git LFS** — still pays storage growth, adds quota and a checkout dependency, and buys back an
  image diff that §8 replaces with something better.
- **Commit images, periodically squash the branch** — viable fallback. Image *history* has near-zero
  value (nobody needs last year's oracle for a scene; release tags pin what shipped), so truncation is
  legitimate for a generated-artifact repo in a way it is not for source. Caps the clone at ~15 MB but
  loses the text audit trail the proposal keeps.

### Packs, not one archive

`scripts/fixtures.ts` already demonstrates the useful primitives: packs, a per-pack manifest, sha256,
a content-addressed cache, and an extraction stamp. Apply that model: a scene3d-only change must not
drag the text and shape reference images down the wire. Do not reuse its schema wholesale — variants,
merge groups, fixture counts, and shared extraction trees are fixture-specific. Extract only the
generic verified-download/cache pieces once the oracle consumer proves their common boundary.

## 5. Flight owns three records, with three different meanings

The commissioning queue, the required coverage, and the blessed bytes are not one state. Collapsing
them into one file would let an agent make CI green by deleting the thing CI was meant to require.

### Required coverage

`scripts/capture-baseline-coverage-manifest.json` remains the exact set of evidence identities. It gains
the `referenceImage` evidence kind. This record answers **which `subject/scene/renderer` cells owe a
full-resolution referent**; it does not say which release supplies the bytes.

An agent adding a new reference-image requirement adds that identity here in the same change that
commissions it. Removing an identity is a reviewed coverage reduction, never a side effect of asking
for a replacement image.

### Outstanding commissions

`oracle-requests/<id>.json` contains one still-outstanding request. The minimum shape is:

```json
{
  "schemaVersion": 2,
  "id": "shape-fill-solid-webgl-2026-08-14",
  "subject": "functional",
  "targets": [
    {
      "entry": "shape-fill-solid",
      "renderer": "webgl",
      "pixelSha256": "<64-hex decoded-pixel sha256>",
      "capture": {
        "hostInstanceId": "<capture host identity>",
        "environmentId": "<capture environment identity>"
      }
    }
  ],
  "frames": 1,
  "reason": "add the first full-resolution reference for the solid-fill scene"
}
```

Each target names one exact selected image, not merely a cell that a later capture may replace. The
commission workflow decodes the later PNG using the same `pixelSha256` definition and refuses to stage
it when the hash differs or cannot be established. The capture identity records where the selection was
made; it is provenance, not another dimension in the one-column-per-backend key.

The request also names why the image should move. It deliberately does **not** contain the
SHA of the commit that contains itself — that is a self-reference whose value cannot be known before
the commit exists, and an agent-local SHA may be replaced when work lands. The trusted Flight workflow
binds the request to the remotely reachable landed `github.sha` in its dispatch envelope.

The directory is a queue of outstanding work, not an archive of every completed request. The lock-bump
PR removes a fulfilled request. Flight's Git history preserves the original request, and the permanent
oracle record carries its id, content hash, and landed Flight commit.

### The immutable consumer lock

`scripts/oracle-lock.json` pins the blessed release Flight consumes:

```json
{
  "schemaVersion": 2,
  "repository": "flighthq/flight-oracles",
  "oracleCommit": "<40-hex commit>",
  "releaseTag": "<immutable release tag>",
  "manifestSha256": "<64-hex sha256>",
  "packs": {
    "functional-shapes": {
      "file": "functional-shapes-<tag>.tgz",
      "images": {
        "functional/shape-fill-solid/webgl": {
          "pixelSha256": "<64-hex decoded-pixel sha256>"
        }
      },
      "sha256": "<64-hex sha256>"
    }
  }
}
```

The lock pins releases, packs, and the per-image decoded-pixel identity each verified pack must carry.
The coverage manifest selects the identities CI must compare; the lock says exactly which immutable bytes satisfy them. An agent
never removes an existing image from the lock to ask for its replacement — the prior blessed image
stays pinned until a later lock update atomically selects the newly approved release.

## 6. Locked, pending, and missing are distinct CI states

For each `referenceImage` identity required by the coverage manifest, Flight CI joins the pinned
release with the outstanding-request queue:

| Pinned image | Matching request | Verdict |
| --- | --- | --- |
| yes | no | compare and gate normally |
| yes | yes | compare against the prior image; an in-scope mismatch is labelled **pending**, while out-of-scope movement still fails |
| no | yes | explicitly **pending**; no comparison is claimed |
| no | no | hard failure: required evidence is missing |

A pinned image with no live Flight target is an orphan and also fails. A pending cell may allow the
overall workflow to succeed so the asynchronous cross-repository process can start, but it never
prints as a comparison pass. The summary names every pending identity and links its request.

Pending is a narrow, deliberate allowance rather than deletion of evidence. A request must name live
targets exactly, may not overlap another open request for the same cell, and cannot suppress failures
outside its declared scope. Repository policy must also bound how long a request may remain pending;
otherwise the commissioning queue becomes a permanent skip list under a more reassuring name.

When the release is ready, one Flight lock-bump PR updates `oracle-lock.json` and removes the fulfilled
request. The `referenceImage` coverage identity remains in place throughout, so the state transition is
visible and monotonic: **pending → locked and gating**, never required → absent → required again.

## 7. Commissioning and GitHub Actions ownership

The local project agent commissions an image by committing the request and, for a new cell, its
`referenceImage` coverage identity. It does not push into `flight-oracles`, hold cross-repository
credentials, or invent the eventual landed Flight SHA. The user's normal merge/push is the boundary at
which remote automation can act.

The end-to-end sequence is:

1. **Flight agent** — changes the scene or renderer, writes `oracle-requests/<id>.json`, and adds any new
   coverage identity. Normal CI validates the request and reports the exact pending cells.
2. **Flight capture workflow** — on a trusted push containing a new request (or an explicit manual
   dispatch), checks out that exact Flight commit and captures only the requested cells in the canonical
   environment. It uploads a candidate bundle containing PNGs, capture status, provenance, and a
   checksum manifest.
3. **Flight bridge workflow** — sends `flight-oracles` only the repository, landed Flight SHA, request
   path and hash, candidate artifact id, workflow run id, and artifact digest.
4. **Oracle intake workflow** — downloads and verifies that bundle, creates the text metadata changes,
   stages an Oracle-owned copy of the candidate, generates the review report, and opens the PR in
   `flight-oracles`.
5. **Oracle reviewer** — reviews old │ new │ delta, including missing and out-of-scope cells, then
   approves by merging. The merge is the blessing; no mutable `approved: true` field is invented.
6. **Oracle release workflow** — promotes the exact reviewed candidate bytes into complete deterministic
   release packs and publishes the immutable release.
7. **Oracle completion workflow** — opens a Flight PR that updates `scripts/oracle-lock.json` and removes
   the fulfilled request. Flight CI downloads the new locked packs and proves the pending cells now
   compare normally before that PR merges.

There are therefore two automated PRs in the asynchronous, land-first flow: the Oracle approval PR,
opened by Oracle Actions, and the Flight lock-bump PR, opened after the Oracle release. Flight Actions
produce and dispatch the candidate; they do not directly author the Oracle repository's history.

### Credential boundary

The job that checks out and executes a commissioned Flight commit is untrusted-code execution. It must
have no Oracle contents, pull-request, release, or cross-repository write credential. It may upload an
artifact to its own run with read-only repository permissions.

The bridge is a separately triggered privileged workflow that does not execute the Flight checkout or
extract candidate-controlled archives; it forwards only the fixed dispatch envelope and recorded
digest. Oracle intake likewise separates unprivileged artifact extraction/report generation from the
privileged PR writer, which accepts only schema-validated metadata and writes allowlisted paths. The
Oracle intake and completion workflows use a narrowly-scoped GitHub App or bot installed on the two
repositories. This split prevents a commissioned source commit from reading the credential that can
rewrite the store it is being measured against.

## 8. Candidate bytes, the approval PR, and exact promotion

The generated PNG is neither committed to Git nor placed in the PR description. For the first
implementation, the Flight capture workflow stores the candidate bundle as a GitHub Actions artifact,
addressed by artifact id, workflow run id, and digest. After verifying it, Oracle intake copies the
bundle into an Oracle-owned candidate artifact and the Oracle PR commit records that locator and digest.
The PR description links to the generated report; it is a review index, not authoritative storage.

If Actions-artifact retention proves too short for real review times, the same role moves to a draft
release or content-addressed object store. The invariant does not change: candidate staging must return
the exact bytes by immutable identity until promotion. If the artifact is missing, expired, or hashes
differently, the PR becomes unmergeable and must be regenerated. Release automation never silently
recaptures an image after it was reviewed.

The reviewer is **blessing an image**. Everything in the PR exists to make that act mean something:

1. **A generated report** showing old │ new │ delta per changed image with `fraction` and
   `maxChannelDelta`, sorted by magnitude. `compareBitmap` produces the derived delta image; no delta is
   committed.
2. **A complete per-image record.** `CaptureBaselineProvenance` supplies the existing capture-condition
   subrecord (`frames`, `sourceHash`, `targetKind`, `verifyPublished`, `warmupFrames`), but it is not the
   whole cross-repository schema. The record also needs its own `schemaVersion`, stable identity,
   request id/hash, landed Flight commit, capture-environment id, width, height, pixel format and colour
   space, `artifactSha256`, `pixelSha256`, pack, and comparison-policy id.
3. **Declared scope, and collateral split out.** The committed request supplies which scenes and backends
   are expected to move and why. The report splits changed images into **in-scope** and **out-of-scope**;
   collateral damage is the most visible list rather than the most buried.
4. **Every requested cell represented.** A capture failure is an explicit missing row, never absence from
   the report.
5. **Unchanged images are not regenerated.** Their prior encoded bytes are copied forward byte-for-byte.

Release does not build a tgz from a text-only tree — that tree has no PNGs. PR CI downloads the
corresponding prior complete pack named by the parent Oracle manifest, verifies it, overlays the exact
candidate bytes, and deterministically constructs the prospective complete pack whose hash is committed
in `manifest.json`. Release repeats that construction from the approved candidate and requires the
result to match the committed hash before upload. A new release is created at the merged Oracle commit;
an existing tag or asset is a hard failure, never a `--clobber` path. Thus the published PNG is the byte
sequence the reviewer saw, not a later capture that happened to render similarly.

The comparison predicate is versioned by `comparisonPolicyId`. Its policy records the calibrated
`channelTolerance`, maximum mismatch fraction, and whether `maxChannelDelta` is report-only or gating.
The calibration required by §2 must choose those values before the first policy is published.

## 9. Gates, all required and all proven to fire

- **Missing and pending captures are listed, never absent.** [capture verification tiers](capture-verification-tiers.md)
  §"A missing premise is labelled, never argued": *never fill in a missing premise from reasoning.* A
  requested cell that failed to capture is explicitly missing; a pending cell is explicitly pending;
  neither is printed as approved or compared.
- **Every reference image has a live referent.** The repo already fails on orphaned fingerprints via
  `findOrphanedBaselineFingerprints` in `scripts/support.ts`, for a measured reason: a package rename once
  swept four scenes' baselines and silently destroyed their evidence. Reference images need the same
  orphan check.
- **The consumer lock is internally consistent.** The release tag resolves to `oracleCommit`; the fetched
  manifest matches `manifestSha256`; every pack matches the lock and manifest; and every extracted PNG
  matches its per-image `artifactSha256` before decoding.
- **Dimensions are a verdict, not a crash.** `getBitmapMismatch` correctly throws when dimensions differ,
  but the CI adapter converts that precondition failure into a named regression failure and report row so
  one resized scene does not abort the rest of the corpus.
- **Zero comparisons fail.** A gated run that compared zero non-pending images is unconfigured, not clean.
- **Pending scope is exact.** A request can demote only the named cells; an injected mismatch in any sibling
  remains a failure.

The gate table in [capture verification tiers](capture-verification-tiers.md) carries a **"proven to
fire"** column and an explicit instruction: *"When adding a gate of this family, add the row and the
firing test together."* Add the new rows and defeating tests with the implementation: zero comparison,
missing without request, orphan, corrupted pack, dimension mismatch, expired/overlapping request, and
out-of-scope movement must each be observed failing. This is not optional polish; it is what keeps the
table honest.

## 10. Canonical capture environment — RULED BY MEASUREMENT

**Ruled: one canonical environment. The reference set has ONE COLUMN PER BACKEND, and per-environment
sets are closed rather than deferred.** The measurement, its counts, and which of its fields are read
versus inferred are in [render oracle calibration record](render-oracle-calibration-record.md) — read
there rather than re-running `oracle-calibrate`, which is what that record exists to make unnecessary.

The section below is kept as the question that was asked, because the ruling is only meaningful against
it. It is history now, not an open decision.

Fuzzy comparison narrows driver variance; it does not erase it. [commands](commands.md) records that
regression today is "coupled to where its baselines were captured," which is why it cannot gate PRs. A
blessed PNG captured on one GPU and verified against another is that same problem with a larger
payload.

`scripts/reference-capture.ts` does not currently implement a canonical Docker environment; it invokes
the local Playwright capture path and mentions Docker only as a condition that path has encountered.
`tests.yml` also records that pinning SwiftShader alone did not make golden captures reproduce across
machines. A container plus SwiftShader is therefore a candidate to measure, not evidence that the
problem is already solved.

- **One canonical environment** — pin the container by digest and record the browser/Playwright build,
  SwiftShader configuration, fonts, locale, timezone, viewport, device-pixel ratio and colour profile in
  a descriptor whose hash is `environmentId`. Bless and verify there. Promote the tier to a PR gate only
  after repeated captures agree across independent clean hosts.
- **Per-environment reference sets** keyed by GPU/driver — combinatorial, and every new CI runner
  invalidates the set.

The choice determines whether the reference set has one column per backend or one per backend ×
environment — that is, it determines the schema, which is why no schema is committed until it is ruled
on. It has since been ruled: one canonical environment, one column per backend. See the record linked
at the top of this section.

## 11. Scope

Proposed: the new repository, Flight request/coverage/lock records, candidate staging, the two-PR
GitHub Actions flow, exact-byte release packs, the pixel tier, the approval report, and the gates.

Already complete as a prerequisite: renaming the input-corpus repository to `flight-fixtures` and
updating Flight's pinned URL.

Not proposed, and explicitly out of scope until the above lands: retiring the `fingerprint` tier (it
stays as the cheap first check), changing existing `sha256` semantics, changing which scenes are
captured, and any change to the parity leg — parity is environment-independent today and gains nothing
here.
