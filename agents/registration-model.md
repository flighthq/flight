# Registration in Flight — how effects, materials, and renderers reach a render state

**Audience: a consumer building against Flight who has the published 1220 build in hand.** This describes
the model as it stands in source on 2026-07-31 and what changed since 1220. Read it once end to end; it is
meant to be enough to implement effects against without asking us anything.

**Two honesty notes before anything else.** Several of the fixes described here are **landed in source but
not published** — publishing is a decision made at the repository boundary, not something this document
grants. Treat the message as "here is the model, and here is what is fixed", not "upgrade and it works".
And where the model is settled but the implementation is still arriving, this document says so in the
section that covers it, rather than describing an intention as though it were shipped.

## 1. The model: open registries, and nothing registers itself

Every extensible family in Flight — render effects, materials, node renderers, texture resolvers, Shape
commands — is an **open registry keyed by a string `kind`**. Render implementations map a kind to the
implementation that realizes it for one backend, on one render state. Shape bounds are the deliberate
exception to that owner: they map a command key to backend-neutral geometry in one process registry,
because bounds are a scene-graph property pulled before and outside rendering.

Two consequences follow, and together they explain most of what surprises a new consumer:

- **The SDK ships implementations; it does not install them.** Importing `@flighthq/effects-gl` registers
  nothing. Packages are `"sideEffects": false` and must stay that way, so no module writes to a registry at
  import time. An unregistered kind is not a broken build — it is a registry with nothing under that key.
- **Render registration is per render state.** You register into a `state`. A second state (an
  offscreen pass, a second canvas) starts empty. This is why `copyGlRenderStateRegistrations(offscreenState,
  screenState)` exists: it is the sanctioned way to give an offscreen state the registrations its screen
  state already has, rather than repeating the calls.

  Shape bounds are process-global for the opposite reason: parent bounds, culling, hit testing, picking,
  and DOM canvas sizing may pull them before a render state exists. `registerCanvasShapeCommand` therefore
  binds the state-local draw handler and the command's mandatory `fillBounds`/`strokeBounds` pair together;
  the latter is forwarded into `@flighthq/shape`. Registration remains explicit, import-side-effect-free,
  and last-write-wins. A key names one backend-neutral geometry; genuinely different geometry needs a
  vendor-prefixed key rather than a state-specific meaning for the same key.

The payoff is that an application pays only for what it names. The cost is that **you must name it**, and
that is the whole subject of this document.

## 2. Two public doors, both legitimate

There are two ways in, and neither is a workaround for the other.

### Door 1 — per-kind, for built-ins

```ts
registerGlBlurEffect(state);
```

One call, no arguments beyond the state. It is a one-liner over door 2 that supplies the built-in kind
string and the built-in runner. This is the shape to reach for when you want a built-in and have no opinion
about how it is implemented.

The per-kind wrapper is **pure ergonomics, and that is worth stating because the opposite would be a
trap**: an audit of the wrappers confirmed each one registers *exactly* what the equivalent generic call
registers — same kind, same runner, no implicit companions registered on the side. So door 2 does **not**
under-register a built-in relative to door 1. If you register `'BloomEffect'` yourself with
`defaultGlBloomEffectRunner`, you have what `registerGlBloomEffect(state)` would have given you, and
nothing is silently missing. Choose between the doors on ergonomics, not on completeness.

Coverage is complete in the sense that matters: on every backend the number of per-kind registrars equals
the number of public runners exactly, so door 1 reaches every kind the backend implements and no more.

### Door 2 — generic, for built-ins today and for your own kinds always

```ts
registerGlRenderEffect(state, 'BloomEffect', defaultGlBloomEffectRunner);   // a built-in, by hand
registerGlRenderEffect(state, 'acme.Kaleidoscope', myKaleidoscopeRunner);   // your own
```

The generic door exists on all three backends: `registerGlRenderEffect`, `registerWgpuRenderEffect`,
`registerCanvasRenderEffect`. The `kind` is the string literal the effect descriptor carries — a
`BloomEffect` descriptor declares `kind: 'BloomEffect'`, and that same string is the registry key. Custom
kinds take a vendor prefix (`'acme.Foo'`); registration is last-write-wins, so a vendor prefix is how
collisions are avoided, not a guard.

**The `default*Runner` constants are public on purpose.** All forty-seven GL runners, forty-six WGPU, and
thirty-nine canvas are exported. They are what you hand door 2 when you want to compose, wrap, or re-key a
built-in — run the stock bloom under your own kind, wrap it to log timings, or swap in your own runner for
one kind while keeping the rest. The store sells the screw and the lawnmower: door 1 is the assembled
convenience, door 2 plus a public runner is the part, and neither is the "real" API.

## 3. What the presence of `register*` does and does not tell you

**The rule: a `register*` function is added only alongside a real implementation, and a kind a backend does
not implement gets no registrar and no runner rather than a stub that registers and does nothing.**

**Read the two directions differently, because only one of them is mechanically enforced.**

- **Absence is a reliable negative.** If `registerCanvasSsaoEffect` and `defaultCanvasSsaoEffectRunner` do
  not exist, canvas does not implement SSAO, and no call you could write would unlock it. Nothing is
  hiding behind a flag. This is the direction you can lean on without further checking.
- **Presence is a claim about shape, not proof of behaviour.** `npm run reachability:check` verifies that a
  registrar and a runner exist and pair up — it matches declaration *names* and compares the two sets. It
  never executes a runner. **A runner whose body is empty passes it**, which was demonstrated directly:
  replacing a real GL runner with an empty function still reported zero violations. So presence tells you
  a kind is wired, and is backed by convention and review rather than by a mechanical behaviour check.

That distinction is worth knowing before you plan around it. If a kind's *output* matters to you — not just
that registering it is possible — verify it the way any renderer output is verified, by rendering it and
looking, rather than by inferring behaviour from the API surface.

**Two artifacts carry the signal, and they agree with each other.** Ask either:

- `registerGlBloomEffect` exists → GL is wired for bloom. So is `defaultGlBloomEffectRunner`.
- Neither exists for a kind a backend does not implement. There is nothing to register, and nothing coming
  that a call would unlock.

Measured on 2026-09-01, the per-kind registrar count equals the public runner count on **every** backend —
47/47 on GL, 45/45 on WGPU, 18/18 on canvas. That one-to-one correspondence is what the reachability
check enforces: a wrapper exists exactly where a runner does, and the wrapper cannot drift from the runner
because it is a one-line call to the generic door with that runner. What the correspondence does **not**
establish is that either one draws anything — that is the shape-versus-behaviour boundary above.

Current coverage, derived from source on 2026-09-01: **GL 47 effect kinds, WGPU 45, canvas 18.** WGPU lacks
two that GL has (`BokehDepthOfField`, `CustomShader`). Canvas implements the layer-style family
(`DropShadow`, `OuterGlow`, `InnerGlow`, `InnerShadow`, `Bevel`, `GradientBevel`, `GradientGlow`), plus
`Blur`/`Bloom`, `Blend`/`Composite`, four stylize kinds (`Pixelate`, `Scanlines`, `FilmGrain`, `Vignette`),
and the realized `LensDistortion`, `TiltShift`, and `Posterize` passes. What it lacks includes anything
reading a depth or velocity G-buffer (`Ssao`, `GodRays`, `ScreenSpaceFog`, `MotionBlur`, `ContactShadows`),
the antialiasing passes, the remaining lens passes, and the `ToneMap`/`WhiteBalance` colour grades. Nothing
exists on canvas that is missing on GL.

These numbers move, and they moved recently in both directions: canvas gained `InnerGlow`, `InnerShadow`,
`Bevel`, `GradientBevel` and `GradientGlow` as real implementations, while a separate change removed runners
that were registered but unrealized. **The second kind of change is the rule being enforced, not a
regression** — a runner that answered "yes" and did nothing was exactly the stub this model forbids, and
deleting it makes the count smaller and the signal true. Re-derive rather than trusting a number in a
document: the registrars and runners in the build you hold are the register.


## 4. What a missed registration tells you now

This is the part that most directly answers the failure you reported. Previously, a missing registration was
**correct by contract and invisible**: the call returned a sentinel, the frame rendered, and the image was
silently wrong. Two specific cases, both now diagnosable:

- **`resolveGlTexture` returning `null`** for a source kind with no registered resolver — which left 3D
  content untextured under a green typecheck.
- **`applyGlRenderEffectsToRenderTexture` returning `false`** — it returns without writing `dest`, so
  anything sampling that texture reads whatever was last in it.

Diagnostics are **opt-in and per package**, emitted through `@flighthq/log`, warn-once, and free when not
installed:

```ts
enableGlTextureResolverGuards(state);   // @flighthq/render-gl
enableGlRenderEffectGuards(state);      // @flighthq/effects-gl
```

Each has a matching `explain*` query returning plain data rather than a message —
`explainGlTextureResolution`, `explainRenderRegistryMisses`, `explainGlRenderEffectApplication` — so a test
or a tool can assert on the reason instead of scraping a log line. All of these sit on the same `.` import
lane as the functions they cover, so they need no special import path.

The effect guard also reports a case worth knowing about, because it **succeeds**: if some effects in a
chain are registered and others are not, the call returns `true` having silently dropped the unregistered
ones. The output is wrong rather than absent, which is harder to notice than an outright failure. The guard
names it (`partial-registration`), and deliberately says nothing for an empty chain, since a no-op you asked
for is not a miss.

If you would rather not enable guards by name, `enableFlightDiagnostics(state)` in `@flighthq/debug` is an
existing convenience that installs a console sink, raises log levels, and switches on several of these at
once. It composes the per-package guards; it does not replace them, and it cannot currently carry every
guard, because its subsystem hooks are state-less while several guards are state-scoped.

### Asking before you miss: the scene↔render seam

Everything above is reactive — you learn at draw time, after a miss. For imported content there is also a
proactive answer, split across two packages so neither has to know the other's internals:

```ts
const usage = createScene3DKindUsage();                  // @flighthq/scene3d
getScene3DKindUsage(usage, scene);                       // WHAT the document uses — kinds only

if (!hasGlScene3DCoverage(state, usage)) {               // @flighthq/scene3d-gl
  const manifest: SceneCoverageEntry[] = [];
  explainGlScene3DCoverage(manifest, state, usage);      // WHICH kinds, and how badly
}
```

The 2D side is the same shape — `getScene2DKindUsage` then `explainGlScene2DCoverage`,
`explainCanvasScene2DCoverage`, or the shared `explainScene2DCoverage` for a backend with no specifics.
The resource layer answers for itself with `explainScene3DResourceCoverage`.

**A scene reports what is in it; only the holder of a registry knows whether anything is bound.** So
`Scene3DKindUsage` carries plain kinds — material, modifier, node, texture-source, and resource MIME
types — and no registry vocabulary, no backend token, and no registrar names. It takes no registry to
produce, so it cannot itself be the thing you forgot to wire. The backend package answers coverage against
its own registries, which is why it cannot go stale when a registrar is renamed: it reads the registry, not
a table of names.

Two tiers, sharing one implementation so they cannot disagree. `hasGlScene3DCoverage` stops at the first
shortfall and allocates nothing. `explainGlScene3DCoverage` is the debug-class tier, and it reports **every**
requirement — `Satisfied` alongside the four shortfall states — so one call is a manifest a caller can render
as a checklist. Reporting only the gaps would leave "covered" indistinguishable from "never asked about".
The predicate stays gap-only: a manifest of nothing but `Satisfied` entries still answers `true`.

The shortfall states are split by **remedy**, not by symptom. Nothing resolving and the content not drawing
is `Unregistered` when a call would fix it and `Unavailable` when no such call exists. Something resolving
that is not this kind's own implementation, so it draws differently than authored, is `FallbackRemediable`
or `FallbackUnavailable` on the same distinction. **Which of the two families applies is the backend's call,
not a shared convention** — a material with no renderer does not draw on GL, while on Canvas it falls back,
because a Canvas material only adds draw state over a draw that already happened.

Backends **compose** rather than copy. The node-renderer and shape-command registries live on the base
`RenderStateRuntime`, so `explainScene2DCoverage` in `@flighthq/render` answers them once for all four 2D
backends; `explainGlScene2DCoverage` calls it and appends only GL's own blend and material halves. A composed
`has*` must consult the delegate — that is the one thing this shape can get wrong, so test it.

`nodeKinds` is reported by the scene and deliberately ignored by the GL check: the 3D pipeline collects
meshes structurally (`geometry != null`), so no 3D node kind is registered against anything. Whether a kind
needs a renderer is a render-layer rule, so the scene reports and the consumer decides.

### Bags: an array you name is fine, a function that hides one is not

Two shapes look alike and are not:

```ts
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);  // fine
registerBuiltInGlModifierSnippets(state);                        // not
```

The first passes an **array the caller names**, whose every member is separately exported, over the
declaration-mergeable `keyof ShapeCommandRegistry` vocabulary in `@flighthq/types`. It grows only when the
caller opts into another separately exported command (including a vendor-prefixed extension). The second
names nothing, offers no per-item path, and grows
every time someone adds a modifier, so an app written last year silently pays for this year's additions.

So the test is not the plural, and not "does it register several things". It is:

- **Does it grow behind the caller's back**, as a side effect of ordinary feature work? Then it is poison.
- **Is every member separately exported**, so the bag is a convenience over a door that stays open?

That test also explains why `registerWebImageDecoders` is fine — six MIME keys over one shared
`decodeImageWithCanvas`, bounded by what one decoder handles — while `registerBuiltInScene3DMaterialTextures`
was not, and was split into `registerStandardPbrScene3DMaterialTextures` and
`registerUnlitScene3DMaterialTextures`. An assembly that wires several families should name them in its own
body, the way `createBuiltInScene3DResourceResolver` does, so the list is in the source a caller reads.

### A registry, or just a function?

Not every kind-keyed family wants a registry:

- **Open family, or the answer is a policy choice** → registry. Which renderer draws a `Shape` is policy
  (Canvas `arc()`, a GL tessellation, and a DOM path are all correct), so shape *draw* commands are
  registered per state.
- **Closed vocabulary and exactly one right answer** → a plain function with an internal switch. A truly
  closed geometry kernel can keep that shape. Shape commands no longer qualify: their header registry is
  declaration-mergeable and custom draw commands need matching bounds knowledge.

Shape draw handlers remain per-backend, while bounds contributions are backend-neutral and paired into the
same `CanvasShapeCommand`: a draw command cannot be registered while accidentally omitting bounds.
`fillBounds`/`strokeBounds` are mandatory fields whose `null` means deliberately no geometry; an absent key
means nobody registered it. Bounds traversal reports `false` and contributes nothing for that command;
`explainShapeBounds` names every missing key, and `enableShapeBoundsGuards` adds opt-in warnings. There is no
invented fallback rectangle, and consumers that require a complete box reject the partial result.

Registries also need an owner, and the owner is not always a render state. Where policy varies by render
state, use it (`RenderStateRuntime.canvasShapeCommandRegistry`). Where callers need isolated policy, use a
caller-owned bag, as `ModifierRegistry`, `MarkupTagRegistry`, and `Scene3DMaterialTextureRegistry` do. A
process registry is reserved for backend-neutral capability consumed without either owner; Shape bounds
qualify because a Shape has bounds without drawing. Its revision participates in the existing
`isLocalBoundsRectangleValid` hook, so a late key binding invalidates cached Shape bounds without a second
cache path.

## 5. The capability matrix

A generated backend capability matrix is in flight (owned by another agent at the time of writing); this
section will name its location and format once it lands, and until then §3's derivation is the honest
answer — the public runners *are* the capability list, and they cannot drift from the implementation
because they are the implementation.

## 6. DOM: batch kinds are excluded by design

**DOM's leaf set is measured by identity, not by matching another backend's count.** The browser is the
renderer, and one scene node maps to one native element. `scene2d-dom` carries `Sprite`, `NativeText`,
`RichText`, `TextLabel`, `Shape`, and `Scale9Shape`, plus the browser-specific `HtmlView` and `TextInput`.
That is the intended set.

**Batch kinds — `QuadBatch`, `Tilemap`, `BitmapText`, `ParticleEmitter2D` — are declared DOM gaps, not
roadmap.** There will be no bespoke DOM batch renderers, and a general canvas-island renderer assembly is
explicitly "probably never". Do not wait for them.

Bounded batch content still reaches a document-shaped DOM scene, through two existing APIs and no new
types. Choose by asking whether the embed must stay portable across consumer backends:

- **Portable embed** — wrap the producer canvas with `createImageResourceFromCanvas(producerCanvas)`, put it
  in a `Texture`, and display it with a `Sprite`. Every backend produces a canvas and every backend consumes
  one. The producer owns pixels and cadence; the consumer owns placement; bump the resource `version` when
  the producer invalidates. **Footgun, this path only:** `drawImage` readback from a WebGL producer canvas
  requires `preserveDrawingBuffer: true` or a same-task copy, or you get a silently black sprite.
- **Live DOM embed** — an `HtmlView` whose `data.element` is the producer canvas. DOM mounts it directly:
  zero copy, live compositing, native DOM events on the element, and no readback hazard. Deliberately
  DOM-only; the node kind is how the scene declares its DOM commitment. You own the element and must keep it
  single-consumer.

Flattening one large batch into a canvas island also flattens its culling granularity. Embeds are for
bounded payloads inside otherwise document-shaped scenes; if batch content dominates, choose canvas, WebGL,
or WebGPU for the whole scene instead.

## What changed since 1220, in one list

- Missed registrations are **diagnosable** rather than silent, via per-package `enable*Guards` and `explain*`
  queries (§4) — including the partial-registration case that succeeds while dropping effects.
- Capability is answerable from the API surface, with the boundary stated (§3): **absence** is a reliable
  negative, while **presence** proves the kind is wired, not that its runner draws anything — the
  reachability check compares declaration names and never executes a runner.
- The per-kind wrappers were audited and register exactly what the generic call does, so door 2 never
  under-registers a built-in (§2).
- DOM's batch exclusions are a recorded design position with two sanctioned embed paths (§6), not an
  unfinished area.
- Door 1 is filled in: every backend's per-kind registrar count now equals its runner count exactly (§3).
- Still in flight at the time of writing: the generated capability matrix, and canvas backend coverage,
  which is actively growing. Neither changes the model above.
