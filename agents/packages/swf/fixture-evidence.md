---
package: '@flighthq/swf'
updated: 2026-08-02
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

Ruffle offers the repository under Apache-2.0 or MIT at the recipient's option. This evidence selects
the MIT terms in the revision-pinned
[`LICENSE.md`](https://raw.githubusercontent.com/ruffle-rs/ruffle/f8d8de6bb15c3d7a799d7088997422b926c8478c/LICENSE.md)
(SHA-256 `e39a2fa3dfd7238f0924f568fabb659ee1a9d95ea6460dbae4bc9b67017a1c71`).
The SWF is not redistributed by Flight: only this provenance record and the derived manifest are
committed.

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

## Corpus sweep

Beyond the single canonical fixture, a breadth sweep runs the importer across a sample of Ruffle's test
SWFs. It exists to answer one question the synthetic suite cannot: does this importer survive real files
written by real tools? Like the fixture above, no binary is committed — only this procedure and the
aggregate result.

- Repository and revision: `ruffle-rs/ruffle` at `f8d8de6bb15c3d7a799d7088997422b926c8478c`, MIT terms as
  above.
- Sample: every `.swf` in the tree under 300 KB, sorted by path, taking every sixteenth — 306 files,
  1.9 MB, spanning `avm1`, `avm2`, Shumway, Gnash/Ming, and exporter fixtures.

Result at the revision that added shape geometry and End-tag tolerance:

| Measure | Value |
| --- | --- |
| Files swept | 306 |
| Threw | **0** |
| Imported | 59 |
| Rejected | 247 — **all** compressed (`CWS` 242, `ZWS` 5) |
| Uncompressed rejected | **0** |

Re-run after `registerSwfDecompressor` landed, with the repository's existing RFC 1951 inflate
(`inflateAwdDeflate`, from `scene3d-formats`) registered for zlib:

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
