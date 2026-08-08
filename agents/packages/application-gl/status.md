---
package: '@flighthq/application-gl'
updated: 2026-08-08
by: principal
---

# application-gl — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **The cell has `charter.md` and `status.md` only** — no `review.md`, no `assessment.md`, so no
  survey has ever run and the cell emits no `Recommended` items into any queue.
- **Built as an assembly, unbuilt as a harness.** `createGlApplicationRenderView`
  (`packages/application-gl/src/glApplicationRenderView.ts:23`) and `destroyGlApplicationRenderView`
  (`:51`) exist and are tested; nothing composes them with the loop. Repo-wide, the only consumer is
  `functional/scenes/application-render-view.webgl.ts:2`. Across the 41 example packages, 39
  hand-roll `requestAnimationFrame`, 39 hand-roll canvas creation, and exactly one
  (`examples/packages/textinput/src/app.ts`) calls `startApplicationLoop`. The remaining work is loop
  composition and example adoption — do not start by rewriting `glApplicationRenderView.ts`.
- **This package's existence is under an open proposal.**
  [`agents/render-view-model.md`](../../render-view-model.md) is **unratified** and would extract a
  windowless `RenderView` into `@flighthq/render`, dissolving this package. Nothing in the tree acts
  on it today; do not build toward it as settled.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Every claim re-verified and still true
  (adoption counts re-measured today, unchanged); nothing was false. The only closed item dropped is
  the `AGENTS.md` Package Map gap — the entry is present.
- **2026-07-31** — Cell created (`charter.md` as an unblessed draft) and the package added to the
  `AGENTS.md` Package Map; no code touched.
