---
package: '@flighthq/application-gl'
updated: 2026-07-31
by: principal
---

# application-gl — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-07-31 — principal: cell created, no code touched

The package had **no cell at all** — no `charter.md`, so the generator never saw it and it produced
no queue items. It was also missing from the `AGENTS.md` Package Map. Both closed today; the Package
Map entry now reads `application` (main loop and windowing) with `application-gl` (the WebGL
`ApplicationRenderView` assembly).

Authored `charter.md` as an **unblessed draft** transcribing what the code already commits to, plus
the batteries-included harness direction the user gave today. It will surface in
`node agents/packages/bless-queue.mjs` for ratification.

**Still needed before this cell can feed the queue:** `review.md` (no survey has ever run) and
`assessment.md` (so it can emit `Recommended` items). Both are wave-1 work.

**The finding that matters for planning.** The `application` Directed item reads "Build
`ApplicationRenderView` as the explicit 95% assembly" — but the assembly is **already built and
tested**, here and in `application`. What is unbuilt is the *harness*: nothing composes the loop with
the view, and adoption is ~zero. Measured across the 41 example packages on 2026-07-31:

| bootstrap path | files |
| --- | --- |
| hand-roll `requestAnimationFrame` | 39 |
| hand-roll canvas creation | 50 |
| use `startApplicationLoop` | 1 |
| use `createGlApplicationRenderView` | 0 |

The only consumer of `createGlApplicationRenderView` anywhere in the repo is the single functional
scene `functional/scenes/application-render-view.webgl.ts`.

Anyone picking up that Directed item should read it as **built as an assembly, unbuilt as a
harness** — the remaining work is loop composition and example adoption, not re-implementing the
link. Do not start by rewriting `glApplicationRenderView.ts`.
