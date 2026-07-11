# Anti-Goals — Deliberately Unbuilt Features

Features an agent — especially one carrying an OpenFL / Lime / Flash mental model — will go looking for, that Flight **will not build**, plus the sanctioned explicit path to use instead.

**If you searched for a feature and couldn't find it, it may be absent on purpose.** Check this list before concluding it's a gap. Adding a deliberately-omitted feature — or worse, the implicit-runtime version of it — is not "completing" the SDK; it is undoing a design decision. If you believe an anti-goal here is wrong, raise it with the user; do not quietly build it.

## Why features land here

Flight covers OpenFL/Lime's feature *set* but rejects their **implicit, stateful runtime behavior** (see "Relationship to OpenFL" in [index.md](index.md)). The recurring anti-pattern is a **property you assign that the runtime quietly acts on later**. Flight replaces each with **explicit, caller-invoked functions over plain data**.

## The test — is an abstraction allowed?

It is *not* convenience that is forbidden — it is **implicit application** and **hidden cost**. An abstraction over the built primitives is welcome when it passes **both** tests:

1. **Explicit invocation** — the caller *calls* it. Nothing fires from a property setter, a scene-graph mutation, or "on the next frame."
2. **Transparent cost** — from the call site, a reader can see that (e.g.) an offscreen surface is allocated and N passes run. Allocation and passes are visible and documented, not hidden behind a value assignment.

A named function you invoke that visibly allocates a scratch surface and runs passes: **fine**. A `.filters =` that does the same next frame: **not fine**. The line is implicit-vs-explicit + cost-visibility — never the mere existence of a helper.

## Registry

### `displayObject.filters` — the auto-applying filter property

- **What an agent looks for:** OpenFL's `displayObject.filters = [new BlurFilter(), …]`, where the runtime applies the filter stack to the object every frame.
- **Will not build:** the auto-applying property. Assigning filters that the runtime *quietly applies next frame* is the exact implicit per-frame side effect Flight rejects.
- **Do instead:** filters are plain data descriptors (`@flighthq/filters`) applied by **explicit per-backend functions** — `applyBlurFilterToSurface`/… (`@flighthq/filters-surface`), the `apply*FilterToCanvas` / CSS path (`@flighthq/filters-canvas`), or the WebGL leaf shaders (`@flighthq/filters-gl`). You compose it explicitly: render the display object to a surface → apply the filter functions → composite the result back. The caller owns — and can see — the offscreen allocation and the passes.
- **On a convenience helper:** an explicit `applyFiltersToDisplayObjectSurface(...)`-style helper over those primitives is **permitted** (an open call on whether it is worthwhile — not yet built), *provided* it passes the two tests above. It is a function you invoke, with visible offscreen allocation and pass count, never a property, never hidden state. If you build one, it is explicit and its cost is documented at the call site.

_(This registry is append-only. Add an entry when you find another OpenFL/Lime implicit-runtime behavior an agent will hunt for and be tempted to build. Same shape: what it looks like → what won't be built → the explicit path → the convenience boundary.)_
