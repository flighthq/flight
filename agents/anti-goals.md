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
- **Will not build:** the auto-parsing setter. Assigning markup that the runtime *quietly parses + applies* is the same implicit-on-assignment side effect Flight rejects — the parse cost and the style mutation are hidden behind a value assignment. **Already removed:** the `RichTextData.htmlText` field, its `setRichTextHtml`/`getRichTextHtml` accessors, and the internal `parseHtmlText` that layout silently ran are gone. `@flighthq/text-markup` is the sole markup path; do not re-add a markup property or an in-layout parser.
- **Do instead:** markup is parsed by an **explicit function you call** — `parseTextMarkup(html)` (`@flighthq/text-markup`) returns a plain `RichTextContent` (`text` + `TextFormatRange[]`) that you then hand to a `RichText` node via `setRichTextContent(node, content)`. `formatTextMarkup(content)` serializes back. The caller owns — and can see — the parse step and the assignment; nothing fires from a property setter.
- **On a convenience helper:** a helper that parses and assigns in one call is permitted only if it stays an explicit function you invoke (visible parse, visible assignment), never a property whose setter parses. The line is the same: explicit invocation + visible cost.

### Running an imported artifact's embedded code — an ActionScript / script VM

- **What an agent looks for:** import a SWF (or a scripted SVG, or a Rive with logic) and *run its behavior* — an ActionScript (AVM1/AVM2) interpreter, or a general embedded script VM, so imported content is interactive as-authored.
- **Will not build:** a VM that **executes artifact-carried code**. A Turing-complete interpreter running imported bytecode is arbitrary code execution with hidden state driving the scene graph — the maximal form of the implicit-runtime behavior Flight rejects, and an *emulator* (Ruffle's domain), not an SDK feature. Importers parse structure to **data**; they never execute it. (SWF's ABC bytecode is exposed as an opaque blob, never run — see [`swf`](packages/swf/charter.md).)
- **The line — bounded runtime vs VM:** a **bounded declarative runtime** consuming a *descriptor as data* (a Rive state machine: inputs → transitions → blend; a behavior tree; an FSM) is **fine** — inspectable, non-Turing, explicitly invoked, the same node/sim split as `particles`/`particleemitter`. A **Turing-complete VM** executing embedded bytecode is **not**. Descriptor-consumed-by-a-bounded-runtime: yes. Arbitrary-code-execution: no.
- **Do instead:** the #3 model — the importer gives you the *named structure* (slots + linkage); **you write behavior in the host language, bound by name.** Faithful playback of interactive Flash is an external emulator built *on* Flight (substrate: yes; engine: no).
- **On scripting / Python:** a **host binding** (write Flight apps *in* Python, riding the C ABI the C/C++ backend produces) or **tooling automation** (à la Blender's `bpy`, if an editor exists) is host-authored code bound by name — **fine**, and future/post-C-ABI. That is the *opposite* of an embedded content VM auto-running an artifact's scripts, which is this anti-goal. Host it or tool with it; never embed it as a content VM.

_(This registry is append-only. Add an entry when you find another implicit-runtime behavior an agent will hunt for and be tempted to build. Same shape: what it looks like → what won't be built → the explicit path → the convenience boundary.)_
