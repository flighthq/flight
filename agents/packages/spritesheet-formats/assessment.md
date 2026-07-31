---
package: '@flighthq/spritesheet-formats'
updated: 2026-07-30
basedOn: ./review.md
---

# spritesheet-formats — Assessment

See [charter](./charter.md) for blessed direction.

## Closed 2026-07-30

Both prior items are closed — one done, one **retired as mis-prescribed**.

*Update package description* is done: it named three formats; the package ships five (TexturePacker,
Aseprite, Cocos plist, Starling, libGDX atlas).

*Unify dispatch to registry-only — built-in formats self-register via import* is retired. Its first
half is already true: `detectSpritesheetFormat`/`parseSpritesheet` dispatch entirely through the
registry and there is no hardcoded format switch. Its second half should not be built, for two
independent reasons, recorded so it is not re-attempted. First, it is banned — a top-level
`registerSpritesheetFormat` call in each parser module is exactly the import-time side effect the SDK
forbids, and this package declares `"sideEffects": false`. Second, it would make the bundle worse,
measured: importing `parseTexturePackerSpritesheet` directly bundles 2,724 B with no trace of the
other four formats, while importing the dispatcher bundles 15,134 B with all five. That is the store
invariant working as intended — the assembly costs all five because auto-detection cannot detect a
format it did not link, while the primitive is not inflated at all. Self-registration on import would
force every parser into every consumer and destroy exactly that.

## Recommended

1. **Decide whether an overlapping detector should be resolvable without relying on order.** An
   Aseprite export satisfies the TexturePacker detector as well as its own (`"meta":` + `"app":`), so
   the correct format is chosen *only* because Aseprite is seeded first and `Map` iterates in
   insertion order. That is now documented at the seeding site and pinned by
   `describe('registry ordering')` — a reorder fails two tests. But it remains an ordering invariant
   rather than a decidable one: a caller's `registerSpritesheetFormat` for a new JSON-based format
   lands last and cannot preempt a built-in, and the entry shape carries no specificity or priority
   signal. Options are a `priority` field, requiring detectors to be mutually exclusive, or accepting
   order as the contract and saying so in the public doc. **A seam decision on
   `registerSpritesheetFormat`'s entry shape, not a sweep.**
2. **`libgdxAtlasParse` has no serializer**, while the other four round-trippable formats do. Either
   add `serializeLibgdxAtlasSpritesheet` for symmetry, or record that libGDX is import-only by design.

## Approved

None.

## Backlog

- Multi-page atlas.
- Polygon/mesh trim.
- libGDX serialize.
- Grid slicing.
