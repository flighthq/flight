---
package: '@flighthq/resource-formats'
updated: 2026-06-25
basedOn: ./review.md
---

# resource-formats — Assessment (merge gate b2824e3d8 → origin/main)

Sorts the review's grounded objections into what a within-package sweep can safely do now versus what is parked for a direction call. The two structural objections (mis-homed name, types-first) are **not** sweep-safe — both are design forks that change the package's identity or another package (`@flighthq/types`). They route to the charter's Open directions, not to Recommended.

## Recommended (sweep-safe, within-package only)

- **Align the package `description` to the shipped content.** `package.json` advertises "atlas, plist, and similar structured formats" while the package ships only an XML parser (`src/index.ts`). Until a rename/rehome decision is made, the description should state plainly that the package is a shared XML parse primitive consumed by the `*-formats` packages. Cosmetic, within the package, no API change — the only no-decision cleanup available here.

_(Nothing else is sweep-safe: the XML parser code is correct and well-tested as-is; the substantive objections all require a direction call — see Backlog and the charter note.)_

## Backlog (parked, with why)

- **Rehome the boundary-crossing `XmlElement` into `@flighthq/types`.** _Why parked:_ touches another package (`@flighthq/types`) — outside this package's boundary and a cross-package edit a sweep must not make autonomously. It is also entangled with the rename question (if the package becomes `xml`, the type may still want to live in the header layer). Decide alongside the rename.

- **Rename / rehome `resource-formats` → `xml` (or fold the primitive elsewhere).** _Why parked:_ a package-identity decision, not a sweep. The content is a generic XML parse primitive, not a format codec; the honest name is `xml`. This supersedes the stale register redirect (`→ textureatlas-formats`), which was about the now-deleted TextureAtlas codecs. Needs the user's bless.

- **Re-baseline the `register.md` `resource-formats` row against `b2824e3d8`.** _Why parked:_ edits a shared admin doc (`register.md`) outside this package's cell; and the new verdict depends on the rename decision above.

## Approved

_None. Approval is the user's verbal gate; this section is append-only and filled only when the user blesses an item._

## Notes for the charter's Open directions

The charter is a stub that itself asks "decide whether it should exist before authoring intent." This delta answers part of that: **as merged, the package is a generic XML parse primitive, not a `-formats` codec package.** Two forks for the direction session:

- **Honest home for the XML primitive (bedrock test rule #3, fork E).** Rename to `xml` and let the real `*-formats` packages compose it, or fold it into `@flighthq/types` + a parse helper. The `*-formats` name is currently a misnomer.
- **`textureatlas-formats` is now decoupled from this package.** The register's redirect assumed the TextureAtlas codecs lived here; they have been removed. `textureatlas-formats` (after `textureatlas` is extracted from `resources`) is now an independent build, and would _consume_ the XML primitive rather than _be_ it. The dissolution-of-`resources` direction (register "Standing decomposition directions") is unchanged; only this package's role in it narrowed.
