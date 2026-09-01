---
package: "@flighthq/encoding"
updated: 2026-09-01
by: manager
---

# encoding — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **Nothing in the repo calls it yet.** `@flighthq/sdk` re-exports it
  (`packages/sdk/src/index.ts:23`) and no other package depends on it. Twelve non-test source files
  still convert UTF-8 through the host globals. Eight of them are the portable ones this package
  exists for — the format readers: `abc/src/abcFile.ts`, `swf/src/swfDocument.ts`,
  `swf/src/swfReader.ts`, `scene3d-formats/src/gltfParse.ts`, `scene3d-formats/src/awd2Parse.ts`,
  `scene2d-formats/src/riveDocument.ts`,
  `scene2d-resources/src/builtInScene2DDocumentImporters.ts`,
  `skeleton2d-formats/src/spineBinaryReader.ts`. The other four are not candidates on the same
  footing: `host-web/src/webNet.ts` and `host-web/src/webShare.ts` are a web host adapter and are
  supposed to use web globals, `tool-capture/src/captureScreenshotHash.ts` is Node-only tooling
  outside the port surface, and `swf/src/swfFrameActionTestHelper.ts` is test support. So the
  portability this package exists for is not achieved until the eight readers migrate, and
  migration was not part of the commissioned scope. This is where the tree stands, not a
  dispatched task.
- **The charter has no North star, and the domain question is open.** Whether this cell is
  "UTF-8" or "text encoding" is unanswered; see the charter's Open direction. It decides where the
  next codec lands.
- **`review.md` and `assessment.md` do not exist.** No survey of this source has run.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-09-01** — Cell scaffolded after `@flighthq/encoding` landed with no
  `agents/packages/encoding/` cell, which failed `docs:check` cell coverage
  (`scripts/docs.ts` `checkCellCoverage`). Charter body is descriptive, not blessed. The package
  was also added to the `AGENTS.md` Package Map Core line and the `catalog.md` Core paragraph,
  neither of which had it.
