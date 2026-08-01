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

Every extensible family in Flight — render effects, materials, node renderers, texture resolvers — is an
**open registry keyed by a string `kind`**. A registry maps a kind to the implementation that realizes it
for one backend, on one render state.

Two consequences follow, and together they explain most of what surprises a new consumer:

- **The SDK ships implementations; it does not install them.** Importing `@flighthq/effects-gl` registers
  nothing. Packages are `"sideEffects": false` and must stay that way, so no module writes to a registry at
  import time. An unregistered kind is not a broken build — it is a registry with nothing under that key.
- **Registration is per render state, not global.** You register into a `state`. A second state (an
  offscreen pass, a second canvas) starts empty. This is why `copyGlRenderStateRegistrations(offscreenState,
  screenState)` exists: it is the sanctioned way to give an offscreen state the registrations its screen
  state already has, rather than repeating the calls.

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

## 3. `register*` exists only for real implementations

**The load-bearing rule: a `register*` function exists only where there is a real implementation behind
it. No stub answers "yes" and then does nothing.** So the question "does the register function exist" is a
**true capability signal**. Absence is not an oversight to wait out — it is the answer.

This is the property that makes the API self-describing. You do not need permission, a changelog, or a
support ticket to find out whether a backend can do something: ask the module. If
`registerGlBloomEffect` exists, GL implements bloom. If the canvas equivalent does not exist, canvas does
not implement it, and no call you could write would unlock it.

**Two artifacts carry the signal, and they agree exactly.** Ask either:

- `registerGlBloomEffect` exists → GL implements bloom. So does `defaultGlBloomEffectRunner`.
- Neither exists for a kind a backend does not implement. There is nothing to register, and nothing coming
  that a call would unlock.

Measured on 2026-08-01, the per-kind registrar count equals the public runner count on **every** backend —
46/46 on GL, 44/44 on WGPU, 15/15 on canvas. That one-to-one correspondence is the rule holding in practice:
a wrapper exists exactly where an implementation does. The runner cannot drift from the implementation
because it *is* the implementation, and the wrapper cannot drift from the runner because it is a one-line
call to the generic door with that runner.

Current coverage, derived from source on 2026-08-01: **GL 46 effect kinds, WGPU 44, canvas 15.** WGPU lacks
two that GL has (`BokehDepthOfField`, `CustomShader`). Canvas implements the layer-style family
(`DropShadow`, `OuterGlow`, `InnerGlow`, `InnerShadow`, `Bevel`, `GradientBevel`, `GradientGlow`), plus
`Blur`/`Bloom`, `Blend`/`Composite`, and four stylize kinds (`Pixelate`, `Scanlines`, `FilmGrain`,
`Vignette`). What it lacks is what a 2D canvas context cannot cheaply do: anything reading a depth or
velocity G-buffer (`Ssao`, `GodRays`, `ScreenSpaceFog`, `MotionBlur`, `ContactShadows`), the advanced blur
and lens family, the antialiasing passes, and — worth noting because it is easy to assume otherwise — the
colour-grade kinds `ToneMap`, `WhiteBalance` and `Posterize`. Nothing exists on canvas that is missing on GL.

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
- The `register*`-means-real-implementation rule is explicit, so capability is answerable from the API
  surface (§3): if the register function exists, the backend implements the kind, and no stub says otherwise.
- The per-kind wrappers were audited and register exactly what the generic call does, so door 2 never
  under-registers a built-in (§2).
- DOM's batch exclusions are a recorded design position with two sanctioned embed paths (§6), not an
  unfinished area.
- Door 1 is filled in: every backend's per-kind registrar count now equals its runner count exactly (§3).
- Still in flight at the time of writing: the generated capability matrix, and canvas backend coverage,
  which is actively growing. Neither changes the model above.
