---
package: '@flighthq/swf'
updated: 2026-07-30
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
