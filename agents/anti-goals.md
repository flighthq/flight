# Anti-Goals — Deliberately Unbuilt Features

Features an agent will go looking for — often a familiar convenience from another graphics framework — that Flight **will not build**, plus the sanctioned explicit path to use instead.

**If you searched for a feature and couldn't find it, it may be absent on purpose.** Check this list before concluding it's a gap. Adding a deliberately-omitted feature — or worse, the implicit-runtime version of it — is not "completing" the SDK; it is undoing a design decision. If you believe an anti-goal here is wrong, raise it with the user; do not quietly build it.

## Why features land here

Flight rejects **implicit, stateful runtime behavior** (see the "Design posture" in [index.md](index.md)). The recurring anti-pattern is a **property you assign that the runtime quietly acts on later**. Flight replaces each with **explicit, caller-invoked functions over plain data**.

## The test — is an abstraction allowed?

It is *not* convenience that is forbidden — it is **implicit application** and **hidden cost**. An abstraction over the built primitives is welcome when it passes **both** tests:

1. **Explicit invocation** — the caller *calls* it. Nothing fires from a property setter, a scene-graph mutation, or "on the next frame."
2. **Transparent cost** — from the call site, a reader can see that (e.g.) an offscreen surface is allocated and N passes run. Allocation and passes are visible and documented, not hidden behind a value assignment.

A named function you invoke that visibly allocates a scratch surface and runs passes: **fine**. A `.filters =` that does the same next frame: **not fine**. The line is implicit-vs-explicit + cost-visibility — never the mere existence of a helper.

## Registry

### `displayObject.filters` — the auto-applying filter property

- **What an agent looks for:** a `displayObject.filters = [new BlurFilter(), …]` property, where the runtime applies the filter stack to the object every frame.
- **Will not build:** the auto-applying property. Assigning filters that the runtime *quietly applies next frame* is the exact implicit per-frame side effect Flight rejects.
- **Do instead:** image operations are plain data descriptors — **adjustments** (`@flighthq/adjustments`, pointwise, fold into the draw as data) and **effects** (`@flighthq/effects`, spatial/composite) — applied by **explicit per-backend functions** (`apply*EffectToGl`/`…ToWgpu`, the effects-canvas CSS path). You compose it explicitly: run the effect pipeline over the rendered target, or attach a color transform as a `HasColorTransform` trait. The caller owns — and can see — the offscreen allocation and the passes. (`@flighthq/filters` no longer exists — it dissolved into these two tiers; see [effect-adjustment-architecture](effect-adjustment-architecture.md).)
- **On a convenience helper:** an explicit `applyFiltersToDisplayObjectSurface(...)`-style helper over those primitives is **permitted** (an open call on whether it is worthwhile — not yet built), *provided* it passes the two tests above. It is a function you invoke, with visible offscreen allocation and pass count, never a property, never hidden state. If you build one, it is explicit and its cost is documented at the call site.

### `textField.htmlText` — the auto-parsing markup property

- **What an agent looks for:** a `textField.htmlText = "<b>hi</b>"` property, where assigning a markup string makes the runtime silently parse it and apply the resulting styles to the field.
- **Will not build:** the auto-parsing setter. Assigning markup that the runtime *quietly parses + applies* is the same implicit-on-assignment side effect Flight rejects — the parse cost and the style mutation are hidden behind a value assignment.
- **Do instead:** markup is parsed by an **explicit function you call** — `parseTextMarkup(html)` (`@flighthq/text-markup`) returns a plain `RichTextContent` (`text` + `TextFormatRange[]`) that you then assign to a `RichText`/`TextLabel` node. `formatTextMarkup(content)` serializes back. The caller owns — and can see — the parse step and the assignment; nothing fires from a property setter.
- **On a convenience helper:** a helper that parses and assigns in one call is permitted only if it stays an explicit function you invoke (visible parse, visible assignment), never a property whose setter parses. The line is the same: explicit invocation + visible cost.

_(This registry is append-only. Add an entry when you find another implicit-runtime behavior an agent will hunt for and be tempted to build. Same shape: what it looks like → what won't be built → the explicit path → the convenience boundary.)_
