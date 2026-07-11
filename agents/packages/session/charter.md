---
package: '@flighthq/session'
crate: flighthq-session
draft: false
reserved: true
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# session — Charter

## What it is

**RESERVED — do not build yet.** `@flighthq/session` reserves the name and concept for a future **observable live-state container**: the mutable "current run / document / play session" model that the app reads and writes each frame, sitting between the `@flighthq/flow` mode machine (which sequences the app through modes) and `@flighthq/snapshot` (which freezes and restores that state).

For now, the live state is **just a plain `{}` object the app types itself** — Flight's plain-data ethos means an app owns its own model, and `@flighthq/snapshot` operates on that plain object generically (capture/restore/interpolate). This cell exists only to reserve the name and record the intent so nobody repurposes `session` and so the concept is captured when it's ready.

## When to build it

Build `@flighthq/session` **only if the plain-object approach proves to want structure** — i.e., when a real need appears for one or more of:

- **Change observation** — signals fired when a field of the live state mutates (for reactive UI, dirty-tracking, autosave triggers).
- **Structured composition** — composing sub-states (inventory + progress + settings) into a whole `session`, with typed slices.
- **Tight snapshot integration** — a session that knows how to `captureSnapshot`/`restoreSnapshot`/`diff` itself efficiently (structural sharing) rather than a generic deep clone.

Absent those, a mandated state container would over-prescribe how apps hold their model — which Flight deliberately avoids. So this stays reserved until the need is concrete.

## Boundaries (anticipated)

- Would depend on `@flighthq/types` (+ `@flighthq/signals` for change observation). No display, no scene graph.
- The **model** (game/app data: score, inventory, document), distinct from the **view** (display objects) and the **flow** (modes). It is not save/serialization (that's `@flighthq/snapshot` + `@flighthq/storage`) and not the mode machine (that's `@flighthq/flow`).

## Origin

- **[2026-07-10]** Blessed during the `gamestate` naming session: the "recoverable state" concept split into `@flighthq/flow` (mode machine, built), `@flighthq/snapshot` (immutable captures, built), and a reserved `@flighthq/session` (observable live-state container) — the live state being a plain app object until structure is genuinely wanted.
