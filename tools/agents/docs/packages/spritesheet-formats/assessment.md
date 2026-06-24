---
package: '@flighthq/spritesheet-formats'
updated: 2026-06-24
basedOn: ./review.md
---

# spritesheet-formats — Assessment

The review verdict is `solid` (82/100): a well-factored `-formats` triad layer (fork B done right — open `Map` registry, last-write-wins, vendor-prefix convention) with five round-tripping text atlas formats, a tolerant diagnostics path, and 169 tests. The dominant gaps are not within-package: they hang off the single-page `SpritesheetData` model owned by `@flighthq/spritesheet`, off a `@flighthq/sprite` mesh-renderability decision, and off charter silence about format breadth. Those are routed to the charter's Open directions below, not into Recommended. What is left for Recommended is a small set of strictly within-package clarity/hygiene fixes.

The prior `reviews/maturation/depth/spritesheet-formats.md` roadmap **does not exist on disk** (the review confirms it: "absent — none on disk"); there is no maturation seed to absorb beyond what the review already carries.

## Recommended

Strictly sweep-safe: within `@flighthq/spritesheet-formats` (or its own docs), no cross-package coupling, no breaking change to a consumer that exists, no open design decision.

- **Fix the inverted libGDX schema field naming and its doc comments.** In `libgdxAtlasSchema.ts` the file's `orig:` key is mapped to `region.origSize` and `offset:` to `region.orig`, and the schema comments describe `orig` as "Offset…" / `offset` as "Packed position." The round-trip is numerically correct, so this is a naming/comment-clarity fix only — rename the fields to match libGDX's real semantics (`orig` = original size, `offset` = trim offset) and correct the comments so a Rust porter or contributor is not misled. Within-package; pixels stay identical. — review.md#contract--docs-fit (Drift / candidate revisions).
- **Remove the serialize `describe` blocks duplicated into the parse test files.** `serializeStarlingSpritesheet`, `serializeTexturePackerSpritesheet`, and `serializeAsepriteSpritesheet` each have a `describe` in _both_ the parse test file (`starlingParse.test.ts:185`, `texturePackerParse.test.ts:246`, `asepriteParse.test.ts:244`) and the dedicated `*Serialize.test.ts`. One test file per source file with `describe` mirroring that file's exports is the rule; keep the serialize describes only in the `*Serialize.test.ts`. This also clears the related `exports:check` (0/2) drift the status flagged on the three parse files. Within-package test hygiene. — review.md#contract--docs-fit.
- **Retire the dead Cocos `frameDuration` option.** `CocosPlistParseOptions.frameDuration` is accepted but unused (`_options`) because Cocos plist carries no animation data — speculative surface the contract's "no speculative surface" leaning would trim. Remove it (pre-release, no shipped consumer). Within-package. — review.md#contract--docs-fit.
- **Add the missing `@flighthq/spritesheet-formats` Package Map entry.** `tools/agents/docs/index.md` already references this package from the `@flighthq/particles-formats` line ("the same relationship as `@flighthq/spritesheet-formats` to `@flighthq/spritesheet`") but never lists it. Add a Package Map entry mirroring the `particles-formats` one. Docs-only fix, no design decision. — review.md#contract--docs-fit (Package Map silence).

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Each carries the reason it cannot sweep.

- **Multi-page support (`pages[]` + per-frame `pageIndex`).** The dominant gap — libGDX multi-page pages collapse to the first page and frames lose `pageIndex`; Texture Packer `meta.related_multi_packs` is unfollowed. **Parked:** blocked on `SpritesheetData` (owned by `@flighthq/spritesheet`) gaining a multi-page model — a cross-package design decision. Routed to Open directions. — review.md#gaps.
- **Re-home `SpritesheetParseResult` into `@flighthq/types`.** It is defined locally in `spritesheetDiagnostics.ts`, violating the header-layer rule. **Parked:** it embeds `SpritesheetData`, still in `@flighthq/spritesheet`; moving it to types would invert the dependency. Gated on the same `SpritesheetData`→types migration as multi-page. Cross-package. — review.md#gaps.
- **Polygon/mesh trim** (Texture Packer Phaser/Pixi `vertices`/`verticesUV`/`triangles`). **Parked:** blocked on a `@flighthq/sprite` mesh-renderability decision — cross-package; surface, don't assume. Routed to Open directions. — review.md#gaps.
- **Format breadth** (Unity sprite atlas, Godot `.tres`, Spine region attachments, Adobe Animate JSON, Phaser legacy variants, binary Aseprite `.ase`). **Parked:** needs a charter "where is bedrock" ruling on which formats are in scope before adding any — a design fork, not sweep-safe. The text formats are additive once the line is set; `.ase` is additionally a binary-parser scope question. Routed to Open directions. — review.md#gaps, #candidate-open-directions(2).
- **Symmetric `*Document` constructors / public `dataToDocument` for every format.** **Parked:** the review surfaces this as Open direction #4 (a serializer-input-symmetry decision), not settled within-package work. Bless the golden path first. — review.md#candidate-open-directions(4).
- **Rust conformance for the remaining formats.** `crates/flighthq-spritesheet-formats` mirrors only `aseprite`, `starling`, `texture_packer`; libGDX, Cocos plist, grid slicing, detection, and diagnostics have no Rust mirror or conformance fixtures. **Parked:** cross-worktree (the Rust port) coordination, and the review's Open direction #6 asks the user to confirm the "port after the TS API stabilizes per format" posture before fanning out. — review.md#gaps, #candidate-open-directions(6).
- **Format-support matrix doc + a round-trip functional/example.** A user cannot see at a glance which fields survive which format's round-trip. **Parked:** the matrix's rows depend on which formats are in scope (gated on the breadth ruling above), so it tracks an unsettled set; build it once breadth is decided. — review.md#gaps.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

### Routed to the charter's Open directions (not edited here)

The review's candidate open directions and the cross-package backlog items above belong in `charter.md › Open directions` for an explicit conversation. Note for the direction pass — do not add to Recommended:

- **Is multi-page in scope, and does it gate on moving `SpritesheetData` into `@flighthq/types`?** The package's central blocked thread; `SpritesheetParseResult` placement, polygon trim, and Rust conformance all hang off it. (review open direction 1.)
- **Format breadth: where is bedrock?** Which formats are in scope vs. explicitly out. (open direction 2.)
- **Polygon/mesh trim** — in this layer, or deferred until `@flighthq/sprite` decides mesh renderability? (open direction 3.)
- **Serializer-input symmetry** — should every format expose a public `*Document` constructor + `dataToDocument`? (open direction 4.)
- **Diagnostics as the default path** — is `parseSpritesheetWithDiagnostics` the canonical entry with `parseSpritesheet` the terse convenience, or a parallel API? Bless one golden path. (open direction 5.)
- **Rust conformance posture** — confirm "port after the TS API stabilizes per format," and which formats are conformance-gated vs. TS-only. (open direction 6.)
