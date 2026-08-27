---
package: '@flighthq/swf'
updated: 2026-08-07
fixturePolicy: provenance-and-derived-manifest-only
historicalDocument: 'HISTORICAL-DOCUMENT: every figure here is the result of one corpus run. RECOMPUTE ROUTE: refetch ruffle-rs/ruffle at the pinned revision recorded below and re-run the procedure beside each figure. A record with no route back to a current value is where the no-number rule bites, because a stale figure is only safe when the reader can replace it.'
---

# SWF canonical fixture evidence

## Every procedure here was executed, not read

Each recipe below was run against the working tree at Flight commit `6aff889db` on 2026-08-07, rather
than reviewed for plausibility. That distinction earned its place: the canonical manifest recipe had
stopped running at some earlier field rename and nobody had noticed, in a document whose entire purpose is
reproducibility.

| Procedure | Result |
| --- | --- |
| Canonical fixture hash + derived manifest | ran clean **after repair** — read `document.references` for a field named `document.slots`, and emitted a `kind` that `Scene2DSlotReference` no longer has; both the recipe and the committed manifest carried the stale names |
| Animated fixture hash + frame manifest | ran clean — every row of its table reproduces exactly |
| Commit-pin ancestry rule | ran clean — every Flight commit pinned in this cell is an ancestor of the development ref |
| Corpus tag-frequency table | ran clean — all eleven rows and the 301-readable count reproduce exactly |
| Placement appearance measurement | ran clean — 784 placements, 41 colour transforms, 1 blend mode, all exact |
| Animated sweep + root cross-check | ran clean — every aggregate reproduces; see the resweep section for what the surviving divergence means |
| Nested cross-check | new here, and falsified before being believed |
| Mutation sweep | ran clean on its **property**; its "still imported" figure was **not reproducible as written** and is now stated as a range with the reason |
| [Incidental SHA-token inventory](sha-pin-incidental-audit.md) | ran clean — 207 occurrences across 43 files reproduce exactly, and 207 of its 208 cited line references are still exact; the single exception is the repair that document itself records |
| Functional scenes `swf-import` / `swf-alpha-transform` / `swf-color-transform` | ran clean — `swf-import` is unchanged; the two split transform scenes each passed exact four-backend smoke and regression capture, with alpha parity comparing all three Canvas-reference pairs and color parity retaining only the unresolved same-arm Canvas↔DOM pair |
| `npm run check swf` / `npm run test swf` | ran clean; re-run for the current gate and test counts |
| Stated *reasons*, not just commands | one was false — the mutation sweep's "seeded generator so any failure is reproducible", which recorded no seed. The load-bearing justifications in [`status.md`](status.md) hold: `setMovieClipSource` does end in `gotoAndStopTimeline`, `updateMovieClip` does advance only the timeline it is handed, and `playMode` does default to `loop` |

Two steps were **not** re-run and are marked so rather than implied: the `curl` fetches, which need
network access, and the corpus selection against the upstream tree API, which is the pinned fetcher's job.
The selected corpus was verified locally instead — 306 files totalling 1,166,258 bytes.

## Source

The canonical real-file check uses Ruffle's uncompressed named-shape test:

- Repository: [ruffle-rs/ruffle](https://github.com/ruffle-rs/ruffle)
- Revision: `f8d8de6bb15c3d7a799d7088997422b926c8478c`
- Path: `tests/tests/swfs/avm1/named_shapes/test.swf`
- Pinned source:
  [test.swf](https://raw.githubusercontent.com/ruffle-rs/ruffle/f8d8de6bb15c3d7a799d7088997422b926c8478c/tests/tests/swfs/avm1/named_shapes/test.swf)
- Source size: 883 bytes
- Source SHA-256: `aebced01e85eb34a20c0358014fbe4155d686b10208602720f81bed4930cb24b`
- Container: uncompressed `FWS`, SWF version 32, declared length 883 bytes
- Relevant records: `DefineShape3`, named `PlaceObject2`, `ShowFrame`, and `End`

The SWF is not redistributed by Flight: only this provenance record and the derived manifest are
committed.

## Flight commit-pin verification

A Flight commit pin must already be landed and reachable from the integrated development ref, not merely
present in the author's object database. Never pin an in-flight author or integration commit: its replay
hash is not final. Cite its subject, date, and relevant content until it lands. Rebase replay leaves the old
object locally resolvable until garbage collection, so `git cat-file -e` cannot detect a dead historical
pin. Use the ancestry question instead:

```sh
git merge-base --is-ancestor <flight-commit> origin/develop
```

A negative in a Quimby workspace is not sufficient by itself because `origin/develop` may still be the
workspace seed while integration has landed newer work. Reconcile that case with integration's landed
commit before changing the pin; do not guess at a replay twin.

This rule applies to Flight commits. The pinned Ruffle revisions and source SHA-256 values in this record
are third-party fetch provenance, not candidates for ancestry in Flight's development ref.

The audit that produced this rule also recorded its out-of-cell findings as a data-only
[incidental SHA-token inventory](sha-pin-incidental-audit.md). That inventory does not classify or rewrite
the other cells; it preserves the locations for their owners.

## Derived document manifest

Running the fetched bytes through `createScene2DFromSwf` at this package revision produces:

```json
{
  "sourceKind": "swf",
  "rootBounds": {
    "x": 0,
    "y": 0,
    "width": 10,
    "height": 10
  },
  "slots": [
    {
      "name": "empty",
      "linkage": null,
      "localBounds": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0
      },
      "localMatrix": {
        "a": 1,
        "b": 0,
        "c": 0,
        "d": 1,
        "tx": 0,
        "ty": 0
      },
      "parentIsRoot": true
    }
  ]
}
```

The zero-size local bounds are authored data, not a missing definition: the fixture encodes its empty
`DefineShape3` bounds with a zero-bit RECT. A synthetic byte-level regression reproduces that legal
encoding without copying or depending on the upstream asset.

## Reproduce

Fetch into the repository's ignored `.test-assets` directory and verify the pinned bytes:

```sh
mkdir -p .test-assets/swf
curl --fail --location \
  https://raw.githubusercontent.com/ruffle-rs/ruffle/f8d8de6bb15c3d7a799d7088997422b926c8478c/tests/tests/swfs/avm1/named_shapes/test.swf \
  --output .test-assets/swf/ruffle-named-shapes.swf
echo 'aebced01e85eb34a20c0358014fbe4155d686b10208602720f81bed4930cb24b  .test-assets/swf/ruffle-named-shapes.swf' \
  | sha256sum --check
```

Then derive the manifest from the working tree:

```sh
npx tsx -e '
import { readFileSync } from "node:fs";
import {
  getNodeLocalBoundsRectangle,
  getNodeLocalMatrix,
  getNodeParent,
} from "@flighthq/node/contract";
import { createScene2DFromSwf } from "./packages/swf/src/swfDocument.ts";

const source = readFileSync(".test-assets/swf/ruffle-named-shapes.swf");
const document = createScene2DFromSwf(source);
if (document === null) throw new Error("fixture rejected");

console.log(JSON.stringify({
  sourceKind: document.sourceKind,
  rootBounds: getNodeLocalBoundsRectangle(document.root),
  slots: document.slots.map((slot) => ({
    name: slot.name,
    linkage: slot.linkage,
    localBounds: getNodeLocalBoundsRectangle(slot.target),
    localMatrix: getNodeLocalMatrix(slot.target),
    parentIsRoot: getNodeParent(slot.target) === document.root,
  })),
}, null, 2));
'
```

This procedure is intentionally separate from `npm run test`: the committed suite remains hermetic and
synthetic, and no checkout needs the network or the external SWF to pass.

## Canonical animated fixture

The real-file animation check uses a second file from the same pinned source tree:

- Repository: [ruffle-rs/ruffle](https://github.com/ruffle-rs/ruffle)
- Revision: `f8d8de6bb15c3d7a799d7088997422b926c8478c`
- Path: `tests/tests/swfs/avm1/goto_execution_order/test.swf`
- Pinned source:
  [test.swf](https://raw.githubusercontent.com/ruffle-rs/ruffle/f8d8de6bb15c3d7a799d7088997422b926c8478c/tests/tests/swfs/avm1/goto_execution_order/test.swf)
- Source size: 164 bytes
- Source SHA-256: `ea14536fb2d7c5bc4cb4d18b676fa70e5f36f57a7730d855f3eba666c01cb0d1`
- Container: zlib-compressed `CWS`, SWF version 15, declared uncompressed length 209 bytes
- Timeline: two declared root frames

An independent walk of the root tag stream gives the authored state change before Flight imports it:

| Frame | Root timeline record |
| --- | --- |
| 1 | `PlaceObject2`, character 1 at depth 1, fresh placement |
| 2 | `PlaceObject2`, character 2 at depth 1, move plus character flags |

The second record replaces the character at an occupied depth; it must not mutate the first character's
node into the second one. With `registerDeflateDecompressor()` registered, `createScene2DFromSwf` imports
the file as a two-frame `MovieClip`. Frame 1 has one identity-matrix `Shape`; after
`gotoAndStopMovieClip(root, 2)`, frame 2 has one identity-matrix `Shape` with the same authored bounds but
a different node identity. Returning to frame 1 restores the original node. This crosses a real compressed
external file through container decompression, timeline parsing, frame construction, depth replacement,
and retained-node reuse; those claims previously rested only on synthetic bytes.

| Derived manifest fact | Value |
| --- | --- |
| Source kind | `swf` |
| Root bounds | `(0, 0)`, 550 × 400 pixels |
| Total frames | 2 |
| Frame 1 | one `Shape`, identity matrix, bounds `(43.5, 37.5)`, 76 × 69 pixels |
| Frame 2 | one different `Shape`, with the same matrix and bounds |
| Seek back to frame 1 | restores the original frame-1 node |

### Reproduce the animated fixture

Fetch outside the repository and verify the pinned bytes:

```sh
mkdir -p /tmp/flight-swf-evidence
curl --fail --location \
  https://raw.githubusercontent.com/ruffle-rs/ruffle/f8d8de6bb15c3d7a799d7088997422b926c8478c/tests/tests/swfs/avm1/goto_execution_order/test.swf \
  --output /tmp/flight-swf-evidence/ruffle-goto-execution-order.swf
echo 'ea14536fb2d7c5bc4cb4d18b676fa70e5f36f57a7730d855f3eba666c01cb0d1  /tmp/flight-swf-evidence/ruffle-goto-execution-order.swf' \
  | sha256sum --check
```

Then derive the frame manifest from the working tree:

```sh
npx tsx -e '
import { readFileSync } from "node:fs";
import { registerDeflateDecompressor } from "@flighthq/compression/contract";
import { getMovieClipTotalFrames, gotoAndStopMovieClip } from "@flighthq/movieclip/contract";
import { getNodeChildren, getNodeLocalBoundsRectangle, getNodeLocalMatrix } from "@flighthq/node/contract";
import type { MovieClip } from "@flighthq/types/contract";
import { MovieClipKind } from "@flighthq/types/contract";
import { createScene2DFromSwf } from "./packages/swf/src/swfDocument.ts";

registerDeflateDecompressor();
const source = readFileSync("/tmp/flight-swf-evidence/ruffle-goto-execution-order.swf");
const document = createScene2DFromSwf(source);
if (document === null || document.root.kind !== MovieClipKind) throw new Error("fixture rejected");

const root = document.root as MovieClip;
const firstNodes = [...getNodeChildren(root)];
gotoAndStopMovieClip(root, 2);
const secondNodes = [...getNodeChildren(root)];
gotoAndStopMovieClip(root, 1);
console.log(JSON.stringify({
  sourceKind: document.sourceKind,
  totalFrames: getMovieClipTotalFrames(root),
  rootBounds: getNodeLocalBoundsRectangle(root),
  frames: [firstNodes, secondNodes].map((nodes, index) => ({
    frame: index + 1,
    children: nodes.map((node) => ({
      kind: node.kind,
      bounds: getNodeLocalBoundsRectangle(node),
      matrix: getNodeLocalMatrix(node),
    })),
  })),
  frameChangedIdentity: firstNodes[0] !== secondNodes[0],
  firstFrameRestored: getNodeChildren(root)[0] === firstNodes[0],
}, null, 2));
'
```

Verification was performed on the licensed rig. The file remains external; the repository commits only
its pinned provenance, hash, derived behavior, and obtain recipe. The ordinary test suite remains
network-independent.

## Corpus sweep

Beyond the single canonical fixture, a breadth sweep runs the importer across a sample of Ruffle's test
SWFs. It exists to answer one question the synthetic suite cannot: does this importer survive real files
written by real tools? Like the fixture above, no binary is committed — only this procedure and the
aggregate result.

- Repository and revision: `ruffle-rs/ruffle` at `f8d8de6bb15c3d7a799d7088997422b926c8478c`.
- Sample: every `.swf` in the tree under 300 KB, sorted by path, taking every sixteenth — 306 files,
  1,166,258 bytes, spanning `avm1`, `avm2`, Shumway, Gnash/Ming, and exporter fixtures. The byte total is
  the summed file size of a fetched selection, measured independently in two workspaces; an earlier
  "1.9 MB" here was on-disk rounding rather than a measurement.
- Flight measurement commit: `f0c56ba7d0d92b4bbd8910b458b22213d3ebac0d`.

Result at the revision that added shape geometry and End-tag tolerance:

| Measure | Value |
| --- | --- |
| Files swept | 306 |
| Threw | **0** |
| Imported | 59 |
| Rejected | 247 — **all** compressed (`CWS` 242, `ZWS` 5) |
| Uncompressed rejected | **0** |

Re-run with a decompressor registered — today that is `registerDeflateDecompressor()` from
`@flighthq/compression`, the one registry every container format resolves through:

| Measure | Value |
| --- | --- |
| Files swept | 306 |
| Threw | **0** |
| Imported | **301** |
| Rejected | 5 — all `ZWS`, the LZMA form, with no decompressor registered |
| Shape nodes with geometry | 108 across 27 files (49,142 shape commands) |

That second sweep is what backs the shape decoder at scale: 49,142 commands of real Flash-authored
artwork decode without a single throw, where the synthetic suite could only exercise hand-written bytes.

Two conclusions the synthetic suite could not reach. First, the null-sentinel contract holds against real
files: nothing throws, and every uncompressed file in the sample imports. Second, compression is not a
side issue — **79% of this corpus is compressed**, so a registered decompressor is what stands between
this importer and the bulk of real SWF content, ahead of any further tag coverage.

The sweep also found a real defect, now fixed and covered synthetically: requiring an explicit `End` tag
rejected whole documents whose sprite — or root — ended at its bounded end with the last content tag and
no terminator, which Flash's own tooling emits (`timeline/clip_action_no_key_code`,
`from_shumway/flash_net_URLLoader`). Truncation is still caught by the declared file length, by a tag body
reaching past its stream, and by the reader's overrun flag.

### Reproduce the sweep

```sh
mkdir -p .test-assets/swf/corpus
curl -sS --fail --location \
  "https://api.github.com/repos/ruffle-rs/ruffle/git/trees/f8d8de6bb15c3d7a799d7088997422b926c8478c?recursive=1" \
  -o /tmp/ruffle-tree.json
python3 - <<'SELECT'
import json
SHA = "f8d8de6bb15c3d7a799d7088997422b926c8478c"
tree = json.load(open("/tmp/ruffle-tree.json"))["tree"]
swfs = sorted([t for t in tree if t["path"].endswith(".swf") and t.get("size", 0) < 300000],
              key=lambda t: t["path"])[::16]
for t in swfs:
    print(f"https://raw.githubusercontent.com/ruffle-rs/ruffle/{SHA}/{t['path']}")
SELECT
```

Fetch that list into `.test-assets/swf/corpus/` (flattening `/` to `__`), then import each file through
`createScene2DFromSwf` and count throws, nulls, and container signatures. `.test-assets` is gitignored, and
`npm run test` neither reads the corpus nor touches the network.

**A checkout does not have the corpus, and no measurement here implies otherwise.** Every figure in this
record was derived from a locally fetched selection that is never committed, so reproducing one starts by
obtaining the files. Prefer the repository's pinned, hash-verified fixture fetcher over re-deriving the
selection by hand: a second ad-hoc download path is how two workspaces end up measuring two different
corpora and reporting both as "the corpus".

## Tag-frequency sweep

Run over the same corpus with deflate registered, counting how many of the 301 readable files carry each
tag. It exists to rank remaining work by what real files actually contain rather than by what a reader of
the spec would assume. The corpus skews toward AVM behaviour tests, so scripting tags are over-represented
— the visual-tag rows are the usable signal. Absolute counts below were recorded at Flight commit
`8dd53f4a24b493182514956cfdc0880d745b729e`.

| Tag | Files |
| --- | --- |
| `SetBackgroundColor` | 250 |
| `FrameLabel` | 125 |
| `DefineEditText` | 49 |
| `DefineFont2` | 38 |
| `DefineShape` (all four generations) | 49 |
| `DefineFont3` | 18 |
| `DefineButton2` | 6 |
| `DefineText` / `DefineText2` | 6 |
| `DefineMorphShape` | 4 |
| `DefineBitsLossless` / `2` | 5 |
| `DefineBitsJPEG3` | 1 |

Placement appearance, across 784 placements: **41** carry a colour transform, and **1** file uses a
`PlaceObject3` blend mode.

Two rankings came out of this and both contradicted the assumption they replaced. `SetBackgroundColor` is
in 83% of files and cost one tag to support. Text (`DefineEditText` plus the font tables behind it) is the
largest remaining visual hole, while per-frame colour transform and blend mode — which had been ranked
next — cover 5% of placements and one file respectively.

## Animated sweep

Every earlier sweep measured the *import*: does a file parse, and how much geometry comes out. None of
them ever ran a second frame. Multi-frame behaviour — attach, detach, reorder, re-transform — rested
entirely on synthetic bytes until this sweep, which steps every multi-frame clip in the corpus through
all of its frames with `gotoAndStopMovieClip` and records what the tree does. Absolute counts below were
recorded at Flight commit `59fa8c6fc6b959351ab94156866a382898996266`.

| Measure | Value |
| --- | --- |
| Files swept | 306 (301 readable, the 5 `ZWS` rejected) |
| Files carrying animation | 33 |
| Multi-frame clips stepped | 46 |
| Frames constructed | 411 |
| Longest timeline | 39 frames |
| Threw | **0** |

Counting "the tree changed" is not enough on its own, because a clip that legitimately shows the same
thing on every frame is indistinguishable from one whose per-frame data was dropped. So the 29 clips that
are *root* timelines are cross-checked against the byte stream: the raw tags are walked, placement and
removal tags are counted per frame, and that is compared with what the constructed tree shows.

| Root timelines | Meaning |
| --- | --- |
| 13 | No placement tag after the first `ShowFrame` — authored to hold still, and the tree holds still |
| 15 | The wire changes and the tree changes with it |
| **1** | The wire changes and the tree does **not** |

The single divergence is `from_gnash/misc-ming.all/Video-EmbedSquareTest`, and it **survives Stage A** —
see the resweep below. Node identity is part of the comparison, which is what distinguishes a
*replacement* at one depth (`avm1/goto_execution_order` swaps character 1 for character 2 at depth 1,
inheriting the matrix) from a clip that truly did not move; without it that file reads as a false
divergence.

Nothing here is a pixel comparison; this measures the constructed tree.

## Animated resweep, and the nested cross-check

Re-run at Flight commit `6aff889db9f76f8a0fa827772809e82cc418591f`, after structural video Stage A
landed. Every aggregate above reproduces exactly: 306 swept, 5 `ZWS` rejected, 0 threw, 33 files carrying
animation, 46 clips stepped, 411 frames constructed, 39-frame longest timeline. The root cross-check also
reproduces exactly — 13 authored-static, 15 agreed, **1** divergent.

That last row is the finding. **Stage A did not close the divergence**, and the earlier record implied it
had. What changed is the reason, and the correction matters because the two look identical to a check
that only asks whether the tree moved:

- *Before Stage A*: character 4 was not imported at all, so the placement resolved to **no node**.
- *At this commit*: the character materializes as a named `Sprite` (`vid`, 128×96) present on all 12
  frames — the graph shape is right — and the tree still does not change across frames, because the only
  thing the per-frame records change is the placement **ratio**, and Flight applies a placement ratio to
  `MorphShapeKind` alone.

The earlier "eleven per-frame moves" is also imprecise. Measured at this commit, depth 2 carries **eleven
placement records**: one `PlaceObject2` on frame 1 (character, matrix, and name) and **ten** ratio-only
moves on frames 2–11. The stream declares `DefineVideoStream` character 4, 11 frames, 128×96, codec id 2,
and carries 11 `VideoFrame` packets numbered 0–10.

The ratio's meaning here is measured rather than asserted: on every one of the ten move frames the
placement ratio equals the `VideoFrame` packet number carried on that same frame (1↔1 through 10↔10). So
on a video placement the ratio selects which decoded video frame to show — a different quantity from the
morph progress the same field carries on a `DefineMorphShape` placement. Flight has nowhere to put it: a
`Sprite` over a sourceless `Texture` has no frame to select, and `VideoFrame` payloads are skipped. This
is a representation question for the video Stage B/C rulings, not a timeline defect — `constructFrame`
applies every field that has a home.

### Nested sprites are now cross-checked too

The stated limit — root timelines only — is closed. Each `DefineSprite` body is walked for the
placement and removal records after its own first `ShowFrame`, each instantiated nested `MovieClip` is
paired to a sprite character by declared frame count, and the two are compared the way roots are.

| Nested multi-frame instances | Meaning |
| --- | --- |
| 8 | No placement record after the sprite's first `ShowFrame` — authored to hold still, and the tree holds still |
| 9 | The wire changes and the tree changes with it |
| **0** | Divergent |
| **0** | Unpaired (frame-count pairing was unambiguous for all 17) |

All 17 clips the earlier record listed as stepped-but-unproven are now proven. Pairing is by declared
frame count; where several sprite characters share one, the instance is only checked if those characters
agree on whether the wire changes at all, and is otherwise counted as unpaired rather than guessed. The
corpus needed no such exclusion.

Both cross-checks describe a child by identity, kind, local matrix, alpha, visibility, **and morph
progress** — the last added here, since a placement whose only per-frame change is its ratio moves
nothing a matrix can see, and without it a real morph animation reads as static.

The nested check was falsified before being believed: freezing the tree side to frame 1 flips all 9
agreements to divergences, so those 9 are observations rather than a check that cannot fail.

Still not a pixel comparison, and the ratio representation above remains open.

### Reproduce the animated sweep

Fetch the corpus as above, then step every multi-frame clip: call `registerDeflateDecompressor()`, import
each file with `createScene2DFromSwf`, walk the tree for `MovieClipKind` nodes, and for each one whose
`getMovieClipTotalFrames` exceeds 1 call `gotoAndStopMovieClip` for every frame, recording child count,
child identity, each child's local matrix, alpha, visibility, and — for a `MorphShapeKind` child — its
morph progress. For the wire cross-check, inflate the container,
walk the root tag stream (skipping each `DefineSprite` body whole), and count tags 4/26/70/94 and 5/28
between `ShowFrame`s.

For the nested cross-check, walk each `DefineSprite` body instead of skipping it: read its character id,
then count the same placement and removal tags appearing after its own first `ShowFrame`, and record how
many `ShowFrame`s the body carries. Pair each instantiated nested `MovieClip` to a sprite character by
declared frame count, skipping any instance whose candidate characters disagree on whether the wire
changes, and compare as for roots. To confirm the check can fail, re-run it with the frame argument to
`gotoAndStopMovieClip` pinned to 1: every agreement must turn into a divergence.

## What the corpus actually exercises

> **HISTORICAL: 50 of 80 documented capabilities are exercised by this corpus. The other 30 are unmeasured —
> not passing, not failing. And 13 of the 50 rest on a single file.**

> HISTORICAL: These numbers were **49 of 75** when first published, and both corrections moved them the unwelcome
> way. The enumeration is now the declared list in [capabilities.md](capabilities.md), which is where the
> ids the conformance work keys on live.
>
> - **+1 exercised**: the census probe's own self-check had flagged a capability it emitted that the
>   vocabulary forgot (`DefineSound`). Writing the declared list is what forced that to be reconciled
>   rather than noted — 75 should always have been 76.
> - **+4 unmeasured**: the four sub-axes below are now first-class capabilities rather than a footnote,
>   because a parent witness routinely never reaches the branch they name. All four are unexercised.
>
> The fraction fell from 65% to 62%. That is the correction working, not a regression.

Those are the two numbers that belong together. A pass rate quoted over the 49 without the `49/75` in
front of it would be true in every digit and would still say the opposite of what is the case, because the
26 would have quietly left the denominator.

A coverage table cannot tell an implemented-and-proven capability from an implemented-and-never-seen one:
both read as carried. This census separates them. It is characterisation, not conformance — it asks only
whether the corpus contains the construct, never whether the importer got it right.

**Unexercised here means unexercised by this 306-file Ruffle sample, not rare or absent in the wild.** The
sample is a deterministic every-sixteenth slice of one test suite, skewed toward AVM behaviour tests; it
was never chosen to cover visual features. A checkout does not carry it.

**Unexercised is not unimplemented.** Nothing below is a missing capability, and no coverage claim is
withdrawn on the strength of it. What is being reported is *evidence*, not *support*.

Measured at Flight commit `6aff889db` over the 301 readable files.

| Bucket | Count |
| --- | --- |
| Capabilities declared | 80 |
| **Exercised** — the corpus contains it | **50** |
| — of those, exercised by exactly **one** file | **13** |
| **Unexercised** — implemented, zero corpus instances | **30** |
| Undetermined | 0 |

Each capability's file count is measured on its own — a set of filenames per capability — not apportioned
from a corpus-wide total. A total that reconciles against the corpus size would look like confirmation and
would not be any. The enumeration is likewise an explicit declared list rather than whatever the walk
happened to emit, so "unexercised" is a measurement instead of an absence of evidence, and the probe
self-checks by reporting any capability it emitted that the list forgot — which is what found the
miscount above.

### Evidence depth, not just presence

One file and forty files are both "exercised" and are not the same evidence. Thirteen capabilities rest on
a single corpus file, which is a single-file dependency wearing a passing mark:

`DefineBits` + `JPEGTables` · `DefineBitsJPEG3` · bitmap fill clamp/smoothed · gradient spread mode ·
radial gradient · placement blend mode · cache-as-bitmap · **clip depth (masking)** · placement visible
flag · anonymous `DoABC` · `DefineText2` · `DefineVideoStream` · `VideoFrame`

Masking is the one worth naming: the whole clip-depth capability — depth-range masks resolved into each
covered instance's local space — is carried by exactly one file in this sample.

The depth distribution of the other 36 runs from `SetBackgroundColor` at 250 files down to
`SoundStreamHead` at 2, with the bulk of the visual constructs in single digits: solid fills 34,
`DefineShape` 25, stroke line styles 20, `DefineShape4` 15, morph shapes 4 and 3, colour transforms 3,
linear gradients 3.

### The 26 unexercised, and whether anything else covers them

Most are covered by the hermetic suite, which is the point of having one — a synthetic test reaches
constructs a sampled corpus never will.

| Unexercised capability | Covered by a colocated test? |
| --- | --- |
| `DefineFont` (v1) and `DefineFontInfo`/`2` | yes — both offset forms and their overrun rejections |
| Legacy `PlaceObject`, `PlaceObject4`, `RemoveObject` (v1) | yes — all four placement generations and both removals |
| Placement class name, background colour | yes — linkage and the bounded extended prefix |
| Lossless colormapped and 15-bit formats | yes |
| `DefineBitsJPEG2`, `DefineBitsJPEG4` | yes |
| `StartSound`, `StartSound2`, in/out points, loop count, envelope | yes |
| `SoundStreamBlock` | yes — though see the stream note below |
| `DefineScalingGrid` | yes |
| Bitmap fill repeat/smoothed and repeat/nearest | yes — the sampler axes are tested as a pair |
| **Focal gradients** | **no** |
| **Stroke caps, joints, and miter limit** | **no** |

The last two rows are the finding: **unexercised by the corpus *and* unreached by any test**, while
`status.md` lists both among what shape decoding carries. Source references exist (nine for the focal
path, twelve for `miterLimit`), so they are implemented; nothing observes them.

Per the rule that an unexercised capability which is also *wrong* is a source defect rather than an
evidence gap, both were inspected: the focal point is read as a signed 8.8 fixed value and a focal
gradient is emitted as a radial one carrying that ratio, which is what a focal gradient is; the cap and
join constants map `1 → none`, `2 → square`, `1 → bevel`, `2 → miter` with round as the default, matching
the format; and both callsites' argument order matches `appendShapeBeginGradientFill` and
`appendShapeLineStyle` exactly — the failure a path with no observer is most likely to hide. **No source
defect. This is an evidence gap.**

### The four sub-axes

These are sub-features of a carried construct rather than constructs of their own, so they are counted
over occurrences rather than files. All four are now declared capabilities in their own right — folding
them into their parent would let a fixture score as covering a branch it never reaches.

- **Colour transform channels.** Of 41 placements carrying a transform: RGB multiply 39, RGB add 39, alpha
  multiply 2, **alpha add 0**. The alpha-add normalization across the adjustment and node-alpha tiers is
  therefore unexercised.
- **Blend modes.** One file, one mode: `Multiply`. Every **advanced** (destination-reading and
  non-separable) mode is unexercised — which is the entire reason the advanced/fixed-function split and
  the `appearances` report exist.
- **Filter kinds.** Present: drop shadow, blur, glow, bevel, gradient glow, gradient bevel. Absent:
  **convolution** and **colour matrix**. The colour-matrix path is the one that folds a filter into the
  node adjustment stack rather than reporting it as an effect, so the corpus never takes that branch.
- **Sound formats.** Only MP3. ADPCM, Nellymoser, and raw PCM — the formats whose vendor media type
  carries the rate and channel parameters their bitstreams omit — are unexercised.

### The stream-audio caveat

`SoundStreamHead2` appears in two files and `SoundStreamBlock` in **none**. So the documented behaviour —
a stream's blocks concatenate into one payload with a cue on the frame it starts — has a head with no
blocks behind it in this corpus. True of the code, unexercised by real files, and it reads as covered in
any per-tag table because the tag row is present.

### What invalidates these numbers

This census is a dated measurement, not a fixture. Nothing downstream should treat a figure here as a
constant that stays true.

- **Every count moves if the corpus selection changes** — a different revision, a different size cut, or a
  different stride gives a different sample and therefore different evidence. The counts are pinned to the
  selection recorded above, not to SWF.
- **The exercised/unexercised split moves if the enumeration changes.** It is a list a person wrote; adding
  a capability to it adds to the denominator, and the `49/75` moves without anything about the importer or
  the corpus having changed.
- **The "covered by a colocated test?" column goes stale on any test change**, in the direction that
  matters least visibly: a deleted test silently converts a covered row into an uncovered one.
- **The two untested rows are the volatile ones.** Focal gradients and stroke caps/joints/miter limit are
  the finding here precisely because nothing observes them, so nothing will report it when they change.

Re-derive rather than cite, and if a number here is quoted elsewhere, quote the commit with it.

## Mutation sweep

The package's whole error contract is a null sentinel, so the property that matters most is that **no
input throws**. Every corpus file was mutated twelve ways — scattered byte flips, corruption concentrated
in the structural head, and truncation to an arbitrary prefix — with a seeded generator so any failure is
reproducible.

| Measure | Value | Reproducible? |
| --- | --- | --- |
| Mutants run | 3,672 | yes — 306 files × 12 variants |
| Threw | **0** | yes — the property, and it is seed-independent |
| Still imported | 649–658 | **no as a single number** — see below |

The second row is the claim. The third is what makes it meaningful: if every mutant had been rejected at
the header, the property would pass without any parsing having happened, so a large "still imported" count
is what proves the mutants reached real parsing.

**The "still imported" count is seed-dependent and this record does not pin the seed.** An earlier revision
stated a bare `500`, which cannot be reproduced from what is written here: the generator's seed and the
exact mutation mix (how many flips, how wide the "structural head" is, where truncation lands) are
parameters, not constants, and none of them was recorded. Re-derived independently from the prose above at
Flight commit `6aff889db`, two seeds give 658 and 649 — same order, different number. The range is stated
instead of a false constant. Anyone re-running this should expect their own number in that neighbourhood
and should treat a *large* count, not an exact one, as the supporting observation.

`Threw: 0` is the durable claim and it reproduced at both seeds. It was also falsified before being
believed: running the same counting shape over an importer that throws unconditionally reports every
mutant as a throw, so the zero is an observation rather than a dead branch.

The same property runs hermetically in the suite over a synthetic file, and `@flighthq/abc` carries its
own version — 4,000 random byte sequences plus mutations of a well-formed container, none of which threw.

### Reproduce the mutation sweep

Fetch the corpus as above, then for each file emit twelve mutants from a small seeded generator so a
failure is reproducible from (seed, file, variant): five with scattered byte flips across the whole file,
three with bytes overwritten inside the first 64 bytes where the header and opening tags live, and four
truncated to an arbitrary prefix. Import each mutant with `createScene2DFromSwf` inside a `try`/`catch`,
counting throws and non-null returns. Record the seed alongside any number you quote. To confirm the throw
counter is wired, re-run the same loop over a function that throws unconditionally: every mutant must be
counted as a throw.
