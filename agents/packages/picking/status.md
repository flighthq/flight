---
package: "@flighthq/picking"
updated: 2026-08-08
by: principal
---

# picking — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Nothing open. Every claim in this file was re-checked against `packages/picking/src/` on 2026-08-08
and had already closed: `Scene3DHit.node` is `Mesh | null`
(`packages/types/src/Scene3DHit.ts:13`), and all five node-dependent attribute queries guard the
null node before dereferencing geometry (`sceneHitAttributes.ts:15`, `:24`, `:31`, `:47`, `:76`).

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract; the 2026-07-31 entry was pure session
  narration and its every claim verified true, so nothing carried into `Open`.
- **2026-07-31** — `Scene3DHit.node` became `Mesh | null` and the node-dependent surface-attribute
  queries return `null` / `-1` / `false` on a fresh hit without touching caller-owned output vectors.
