---
package: "@flighthq/tilemap-formats"
updated: 2026-09-01
by: manager
---

# tilemap-formats — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Checked against `packages/tilemap-formats/src/` on 2026-09-01, after import diagnostics landed in
`2082b3c7a`.

- **A compressed layer with no `inflate` seam still yields an empty map.** The all-zero grid is
  deliberate — it preserves the layer's dimensions so caller indexing does not shift — and it is now
  reported as `tiled.layer-inflate-unavailable` rather than dropped. But a caller who passes no
  `diagnostics` array still gets a silently blank layer, because the diagnostics parameter is
  optional. The reporting exists; opting into it is on the caller.
- **Diagnostics cover the parse paths only.** The six codes
  (`tiled.json-malformed`, `tiled.xml-malformed`, `tiled.root-unexpected`,
  `tiled.required-field-missing`, `tiled.layer-encoding-invalid`, `tiled.layer-inflate-unavailable`)
  are raised in `tiledJsonParse.ts` and `tiledXmlParse.ts`. The projection side —
  `buildTilemapLayersFromTiled` and the external-tileset/image resolvers — has no diagnostics, so a
  layer that parses cleanly and then projects to nothing still explains itself to no one.
- **The charter's open directions are unchanged by this work**: whole-map compose-down,
  non-tile-layer projections, LDtk, infinite/chunked maps, and Wang/terrain metadata all remain
  open. Diagnostics touched none of them.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-09-01** — Structured `ImportDiagnostic` reporting landed in `2082b3c7a` across both parse
  paths; charter Decision recorded, superseding the 2026-07-10 "dropped-with-warning" clause only.
  Status rewritten to the `Open`/`Log` contract from the old append-only log stub.
