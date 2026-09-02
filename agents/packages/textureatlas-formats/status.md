---
package: "@flighthq/textureatlas-formats"
updated: 2026-09-01
by: manager
---

# textureatlas-formats — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Checked against `packages/textureatlas-formats/src/` on 2026-09-01, after the dead-options and
page-metadata work landed in `c6d625672` and `307d5619c`.

- **The charter is entirely TODO — no `What it is`, no North star, no Boundaries, no Decisions.**
  Nothing in this sweep changed that, and nothing should have: charter direction comes from the
  user, and a review of this package today would be judging the code against a description of
  itself. **This cell wants a direction pass.** It is the one thing here that no agent can supply.
- **Parsing only — no serializers.** All four formats (Aseprite, libGDX, Starling, TexturePacker)
  parse into a `TextureAtlas`; none writes one back out. The sibling `spritesheet-formats` does
  round-trip most of its formats, so the asymmetry between the two cells is a live question rather
  than a settled boundary.
- **No Cocos plist path**, though `spritesheet-formats` has one.
- **Multipage is nominal, not real.** Page metadata is now preserved per parse, but the atlas still
  models a single image; libGDX's multiple page headers and TexturePacker's `related_multi_packs`
  have no representation. Preserving the page's name and size is not the same as supporting pages.
- **Undeclared size and scale stay at their defaults silently.** `readTextureAtlasScale` returns `1`
  for an absent or unparseable value, and `resetTextureAtlasPageMeta` zeroes width/height, so a
  document that declares neither is indistinguishable from one that declares 0/1. There is no
  diagnostic seam here — unlike `spritesheet-formats`, this cell does not route through
  `@flighthq/importdiagnostics` at all.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-09-01** — Dead options removed, `TexturePackerAtlas` names spelled out in full, and image
  filename / size / scale / page metadata preserved across all four parsers, with
  `resetTextureAtlasPageMeta` giving them one shared definition of "unknown" so a reparse cannot
  leave a previous document's page name attached (`c6d625672`), plus Starling image-name
  reconciliation (`307d5619c`). No charter Decision recorded: the charter has no direction to
  resolve against, and inventing one to close a sweep item would manufacture authority the user
  never gave.
