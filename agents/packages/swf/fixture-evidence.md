---
package: '@flighthq/swf'
updated: 2026-08-05
fixturePolicy: provenance-and-derived-manifest-only
---

# SWF canonical fixture evidence

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
  "references": [
    {
      "kind": "Slot",
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
  references: document.references.map((reference) => ({
    kind: reference.kind,
    name: reference.name,
    linkage: reference.kind === "Slot" ? reference.linkage : null,
    localBounds: getNodeLocalBoundsRectangle(reference.target),
    localMatrix: getNodeLocalMatrix(reference.target),
    parentIsRoot: getNodeParent(reference.target) === document.root,
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
  1.9 MB, spanning `avm1`, `avm2`, Shumway, Gnash/Ming, and exporter fixtures.
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

The single divergence at that measurement commit is
`from_gnash/misc-ming.all/Video-EmbedSquareTest`: each frame moves depth 2 with a new ratio, and depth 2
holds character 4, a `DefineVideoStream`. Video characters were not imported there, so the placement
resolved to no node and eleven per-frame moves landed on nothing. That was the video gap surfacing as
animation loss, not a timeline defect — and it is the first time a real file named it. Ratified Stage A
now materializes that unnamed character as a sourceless `Sprite`; the hermetic test reproduces the eleven
move records, while this pinned table remains the pre-fix measurement rather than claiming an unrun corpus
resweep. Node identity is part of the comparison, which is what distinguishes a *replacement* at one depth
(`avm1/goto_execution_order` swaps character 1 for character 2 at depth 1, inheriting the matrix) from a
clip that truly did not move; without it that file reads as a false divergence.

The limit worth stating: the wire cross-check covers root timelines only. Of the 46 clips stepped, the
17 that are nested sprites are proven not to throw and are **not** proven to show the right thing —
mapping a sprite's own tag stream back to its instantiated subtree is the work that would close that,
and it is not done. Nothing here is a pixel comparison either; this measures the constructed tree.

### Reproduce the animated sweep

Fetch the corpus as above, then step every multi-frame clip: call `registerDeflateDecompressor()`, import
each file with `createScene2DFromSwf`, walk the tree for `MovieClipKind` nodes, and for each one whose
`getMovieClipTotalFrames` exceeds 1 call `gotoAndStopMovieClip` for every frame, recording child count,
child identity, each child's local matrix and alpha. For the wire cross-check, inflate the container,
walk the root tag stream (skipping each `DefineSprite` body whole), and count tags 4/26/70/94 and 5/28
between `ShowFrame`s.

## Mutation sweep

The package's whole error contract is a null sentinel, so the property that matters most is that **no
input throws**. Every corpus file was mutated twelve ways — scattered byte flips, corruption concentrated
in the structural head, and truncation to an arbitrary prefix — with a seeded generator so any failure is
reproducible.

| Measure | Value |
| --- | --- |
| Mutants run | 3,672 |
| Threw | **0** |
| Still imported | 500 |

The last row is what makes the first meaningful: if every mutant had been rejected at the header, the
property would pass without any parsing having happened. 500 of them reached real parsing and still
returned a document.

The same property runs hermetically in the suite over a synthetic file, and `@flighthq/abc` carries its
own version — 4,000 random byte sequences plus mutations of a well-formed container, none of which threw.
