---
package: '@flighthq/spritesheet-formats'
updated: 2026-06-25
basedOn: ./review.md
---

# spritesheet-formats — Assessment (merge gate: integration-b2824e3d8)

> Sorts `review.md`'s findings into **Recommended** (strictly sweep-safe: within `@flighthq/spritesheet-formats`, no cross-package coupling, no breaking change, no open design decision) and **Backlog** (the rest, each with a reason). `Approved` is empty — approval is the user's verbal gate. Cross-package and design-fork items are routed to the charter's **Open directions**, not into Recommended.
>
> Base = `origin/main` (eb73c3d74), the approved floor — not under review. Evidence = the `integration-b2824e3d8` delta (head vs base). This assessment reasons over the new `review.md` (which judges that delta), **not** the stale `builder-67dc46d64` status/review the integration carries, which describe a richer `67dc46d64` branch whose serializers, diagnostics, grid slicer, and 14 test files did not land in this integration.

## Recommended

All within-package, no breaking change, no open design decision. These are the merge-blocking and hygiene fixes a worker can land in the integration sandbox without crossing a package boundary.

1. **Add colocated tests for every new export.** Create `cocosPlistParse.test.ts`, `libgdxAtlasParse.test.ts`, and `spritesheetDetect.test.ts`, `describe` blocks mirroring the exact exported function names, covering the structural logic that is currently untested: Cocos old-style (`frame`) vs new-style (`textureRect`) keys, the rotation w/h swap, alias arrays; the libGDX multi-page / blank-line state machine and `baseName_NNN` animation inference; and detect/parse/register/get round-trips through the registry. `exports:check` enforces this gate and the delta fails it today. — review.md#1.
2. **Delete `xmlParse.ts` and its barrel line.** Nothing imports `./xmlParse`; `cocosPlistParse.ts` imports XML helpers directly from `@flighthq/resource-formats` and `starlingParse.ts` uses its own attribute regex. Remove `src/xmlParse.ts` and its `export * from './xmlParse'` so the package root stops re-exporting another package's generic XML names (`parseXmlDocument`, `parseXmlAttributes`, `XmlElement`). — review.md#2.
3. **Drop the dangling `serializeCocosPlistSpritesheet` reference.** `cocosPlistParse.ts:184-185` and `:191` point callers at a `serializeCocosPlistSpritesheet` that does not exist. Remove the "round-trip serialisation" sentences from the doc comments (the sweep-safe arm), or land the serializer (Backlog). — review.md#secondary.
4. **Remove the banner divider comments and re-order exports.** Strip the `// ─── … ───` dividers from `cocosPlistParse.ts`, `libgdxAtlasParse.ts`, `spritesheetDetect.ts`, and run `npm run order:fix` so exported functions are alphabetized with the loose helpers below them, per Source Style. — review.md#secondary.
5. **Trim the dead Cocos option.** `CocosPlistParseOptions.frameDuration` and the `_options` parameter are accepted but never read (Cocos plist carries no animation timing). Remove them unless item 3's serializer/animation-inference work gives them a consumer. Pre-release, no shipped consumer. — review.md#secondary.

## Backlog

Parked for a reason — a design fork that wants a blessed ruling, a cross-package type move, or scope this merge does not have to settle. None are sweep-safe.

- **Cocos / libGDX serializers + a libGDX schema (round-trip symmetry).** The two new formats are parse-only while the base three round-trip. _Parked: whether parse-only is acceptable or round-trip is a hard `-formats` boundary is a charter ruling, not a mechanical fix. Routed to Open directions._ — review.md#secondary.
- **Promote the registry-entry shape into `@flighthq/types`.** The `{ detect; parse }` seam users pass to `registerSpritesheetFormat` is duplicated inline three times in `spritesheetDetect.ts` rather than living as a named `SpritesheetFormatEntry` in `@flighthq/types`. _Parked: a cross-package edit into `@flighthq/types`, and the shape references `SpritesheetData`, still owned by `@flighthq/spritesheet`; sequence it with the `SpritesheetData`→types thread._ — review.md#secondary.
- **Unify the XML path across the two XML formats.** Starling uses a hand-rolled regex attribute parser while Cocos uses `@flighthq/resource-formats`' tree parser; the (now-dead) `xmlParse.ts` gestured at unifying them but did neither. _Parked: reworking the Starling parser touches base code the merge gate does not require and is better done once the `resource-formats` API is settled._ — review.md#2.
- **Reconcile the committed docs with the landed source.** `status.md` (builder-67dc46d64) and the prior `review.md`/`assessment.md` describe serializers, a grid slicer, a diagnostics path, and 14 test files absent from this integration. _Parked here as a flag, not an action: the worker's job is to make the **code** merge-worthy; whether to rewrite the package's continuity docs is downstream of the user's decision on whether the missing work belongs in this merge or a later one. Surfaced as an Open question._ — review.md#3.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Forks this merge must not decide on its own; they belong in `charter.md › Open directions` (several already are):

- **Round-trip as a hard boundary?** Bless whether every `-formats` format must ship a serializer, or whether parse-only formats (Cocos, libGDX as delivered) are acceptable. Gates the two Backlog serializer items. (charter Open direction 6.)
- **`SpritesheetFormatEntry` → `@flighthq/types`, sequenced with `SpritesheetData`→types.** The registry entry shape (and, in the `67dc46d64` lineage, the locally-homed `SpritesheetParseResult`) wait on moving `SpritesheetData` out of `@flighthq/spritesheet`. (charter Open directions 1 & 4.)
- **Did the `67dc46d64` work intend to land in this integration?** The integration source is a strict subset of what its own docs claim. The user should confirm whether serializers / diagnostics / grid slicer are expected in this merge (then they are missing) or in a later one (then the committed docs are premature for this merge).
