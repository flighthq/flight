---
package: '@flighthq/xml'
updated: 2026-07-03
basedOn: ./review.md
---

# xml — Assessment

Sorted from the 2026-07-03 review (partial 35). The review's headline is a scope fork the charter must settle first: minimal internal parser for atlas/plist input (rename or re-describe honestly) vs a real XML library the name claims. Both paths share the fixes below.

## Recommended

Sweep-safe: within-package, no open design decision, valid under either scope.

1. **Fix `>` inside quoted attribute values** — an in-subset parsing defect (a TexturePacker/Starling attribute containing `>` breaks the document).
2. **Fix DOCTYPE internal-subset stripping** — the other in-subset defect.
3. **Correct the "pull-style" package description** — the parser builds a tree; the description misstates the model.
4. **Add the small query-helper layer** — `getXmlElementChildByName`, `getXmlElementChildrenByName`, attribute accessors — so `textureatlas-formats`/`spritesheet-formats` stop re-filtering `children` by hand.

## Approved

None.

## Backlog

- **Scope fork (charter):** minimal-internal-parser (honest description, stop here) vs full library (serializer → ordered mixed-content mode → positioned error reporting → namespaces; streaming stays out of scope). _Parked — design decision for the direction session._
- **Move `XmlElement` to `@flighthq/types` or record the carve-out** — two format packages already depend on its shape. _Parked — cross-package (types)._
- **Charter authoring** — the cell was scaffolded 2026-07-03; needs a direction session.
