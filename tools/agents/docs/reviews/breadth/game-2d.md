# Breadth Review: 2D Game Developer

**Lens:** Shipping a complete 2D action/platformer — sprites, tilemaps, batching, particles, animation, timelines, collision, multi-device input, audio, camera/viewport, pooling, and a render loop — without leaving the SDK.

**Coverage: 72/100**

## What a complete SDK owes this perspective

A 2D game built on this SDK needs, end to end:

- A render loop / main loop with frame timing and a fixed-step option.
- Sprites, atlas-based **sprite batching**, **tilemaps**, and 9-slice.
- **Particles** — emitters, spawn rules, lifetime, forces, color/size curves, pooling, blend modes, and importers for common authoring tools.
- **Frame animation** — spritesheet players and MovieClip-style **timelines** with labels and frame scripts.
- **Tweening + easing** for motion, plus a clock/timer.
- **Collision & hit detection** — pointer hit-testing for UI _and_ gameplay overlap/AABB/shape collision with a collision response or at least a broadphase.
- **Input** across mouse/touch, **keyboard** (held-key state), and **gamepad**.
- **Audio** — one-shot SFX with gain/rate/pan, looping music, and channel control.
- A **2D camera / viewport** — scroll, zoom, follow, world↔screen transform, parallax, culling.
- **Object pooling** and explicit allocation for hot loops.
- 2D vector **math** — vectors, matrices, intersection/geometry helpers, RNG.
- State/scene management (a screen stack: menu → level → pause).

## Well covered

- **Sprite rendering & batching.** `sprite` gives `Sprite`, `QuadBatch` (with `reserveQuadBatch`/`resizeQuadBatch`/capacity), `Tilemap` (`setTilemapTile`/`fillTilemapTiles`/`resizeTilemap`), and `ParticleEmitter` as a graph node, backed by GL/WGPU/Canvas leaf renderers. This is the strong core of the SDK for my use case.
- **Particles — AAA shape.** `particles` has emitter config, lifetime, **forces and collisions** (`applyParticleForces`, `applyParticleCollisions`, `applyParticleObjectCollisions`), prewarm, bursts, color/size **curves**, and capacity helpers. `particles-formats` imports Particle Designer (.plist), Unity, and Spine. This is exactly the maturity the project's "AAA completeness" rule asks for.
- **Animation & timelines.** `spritesheet` (players, queued animations, `createSpritesheetFromTileset`) plus `spritesheet-formats` (Aseprite, Starling, TexturePacker). `timeline` gives MovieClip with `gotoAndPlay/Stop`, frame labels (`findTimelineLabel`), play/stop/next/prev, and `timeline-spritesheet` bridges the two. OpenFL parity here is real.
- **Tweening.** `tween` + `easing` + `velocity`-adjacent timers cover motion; `tween` includes timers per the package map.
- **Input breadth.** `input` covers pointer, keyboard, and **gamepad** (`attachGamepadInput`, `pollGamepadInput`). `keyboard` (soft keyboard) and `sensors` round out device input. `interaction` provides per-kind hit-testing for every display/sprite kind plus pointer/keyboard dispatch and signal wiring — excellent for UI and click-to-select gameplay.
- **Audio for games.** `media` audio channels expose gain, playback rate, seek, pause/resume/stop, and loop options — enough for SFX and music. `resources`/`loader` handle async loading and batching.
- **Pooling & explicit allocation.** `geometry` has a full `acquire*`/`release*`/`clear*Pool` set for rects, vectors, matrices, quaternions — the hot-loop discipline a game needs.
- **Render loop & lifecycle.** `application` provides a main loop and lifecycle events; `app`/`lifecycle`/`power` give pause/resume/background, which matter for a real shipped game.

## Gaps & missing capabilities

- **No 2D camera / viewport.** `camera` is a **3D** camera (perspective/orthographic projection, view-projection matrices, lookAt, motion-blur). There is nothing for the bread-and-butter 2D need: a scrolling/zooming world camera that follows a target, exposes world↔screen transforms, supports parallax layers, and drives culling. Today I'd hand-roll this from `geometry` matrices on a root container. For a platformer this is a first-class, expected feature and its absence is the single biggest hole.
- **No gameplay physics / collision response.** `interaction` is _hit-testing_ (point-in-object), and `particles` has internal particle-vs-object collision, but there is no general 2D collision system for gameplay: AABB/circle/polygon overlap tests, swept collision, tile-vs-body resolution, separation/penetration vectors, or a body/velocity/gravity integrator. A platformer's core loop (move, collide with tiles, resolve, apply gravity) has no home. `velocity` is a render motion-vector buffer for motion blur, **not** a gameplay velocity/physics package — the name is a trap from this lens.
- **No spatial partitioning / broadphase.** No quadtree, grid, or spatial hash for "what's near the player / on screen." Needed for both collision broadphase and culling at scale.
- **Thin 2D math.** `math` is nearly empty (RNG, `nextPowerOfTwo`). `geometry` has vectors/matrices/rects but I didn't find the game-math staples: segment/ray/circle intersection, line-of-sight, point-in-polygon (beyond hit-test internals), lerp/clamp/smoothstep, angle helpers, 2D vector ops like reflect/project/normalize as public utilities. Some live inside `geometry` vectors, but the "game math toolkit" is not a coherent surface.
- **No scene/screen state management.** No screen stack or state machine (menu/level/pause/game-over). `scene` is the 3D world graph, not a game-state manager. Most engines ship this; here every game reinvents it.
- **Audio gameplay polish missing.** No stereo/positional **panning** in the `media` channel API I saw (gain + rate + seek only), no audio bus/group mixing (master/sfx/music sliders), and no 2D spatial audio. Looping is present; ducking/crossfade are not.
- **No tile/level map importer.** `spritesheet-formats` and `particles-formats` exist, but there's no Tiled (`.tmx`/`.tlj`) or LDtk importer to feed `Tilemap`. Level authoring is a daily 2D-game workflow with no on-ramp.
- **No 9-slice / scale-grid** primitive surfaced (common for UI panels and HUD), and no obvious **sprite-stacking/parallax** helper.

## Missing or too-thin packages I would expect

- **`camera2d` (or fold a 2D mode into `camera`)** — world camera: position/zoom/rotation, follow-with-deadzone/lerp, bounds clamping, parallax layers, `worldToScreen`/`screenToWorld`, and a visible-bounds rect for culling. Highest priority.
- **`physics2d` / `collision`** — value-typed AABB/circle/polygon overlap and swept tests, penetration/separation vectors, a tile-collision resolver, and a minimal body integrator (velocity, gravity, restitution). Keep it data-and-free-functions per the SDK rules; a full rigid-body solver can be a neighbor package, but the platformer essentials should exist.
- **`spatial` (broadphase)** — quadtree / uniform grid / spatial hash for culling and collision broadphase.
- **`math2d` (or grow `math`)** — intersection tests, lerp/clamp/smoothstep, angle/vector convenience, deterministic seedable RNG with distributions, noise (value/Perlin/simplex) for procedural levels and particle jitter.
- **`gamestate` / `screen`** — a screen/scene stack and finite-state-machine helper for game flow and entity state.
- **`tilemap-formats`** — Tiled and LDtk import to `Tilemap`, mirroring the existing `*-formats` pattern.
- **Audio mixing in `media`** — panning, audio groups/buses, and crossfade/duck helpers; arguably a small `audio-mixer` neighbor.
- **`nineslice` / scale-grid** — could live in `displayobject` or `sprite`; needed for HUD/UI.

## Verdict

From a 2D game developer's seat, Flight's **content pipeline is genuinely strong**: sprites, batching, tilemaps, particles (with importers), spritesheet animation, MovieClip timelines, tweening, multi-device input including gamepad, audio channels, pooling, and a real application/lifecycle layer. The OpenFL/Lime feature target shows — display + timeline + particle breadth is better than most web SDKs. What's missing is the **gameplay runtime layer that sits between rendering and the game**: a 2D world **camera/viewport**, a **collision/physics** system for tile-and-body movement, **spatial partitioning**, a richer **2D/game math** toolkit, **scene/state management**, and **level (Tiled/LDtk) import**. I can render and animate a game beautifully today, but the core platformer loop — scroll the camera to follow the player, move and collide against tiles, resolve, cull off-screen — has no SDK home and must be hand-built. Add a `camera2d` and a `physics2d`/`collision` package and the set jumps from "great rendering toolkit you build a game _on_" to "SDK you build a game _in_." The naming collision on `camera` (3D-only) and `velocity` (render motion vectors, not gameplay) is also worth flagging: both read as gameplay features from this lens and are not.
