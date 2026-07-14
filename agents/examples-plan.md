# New Example Set Plan

The existing 17 examples are OpenFL ports. They live on in `flight-reference` for side-by-side comparison but should be replaced in this repo with examples designed to exercise and illustrate Flight's actual feature surface.

## Design Principles

- Each example should demonstrate a clear capability or SDK group, not just port a legacy demo.
- Examples import from `@flighthq/sdk` (or an SDK group subpath) to demonstrate application-level usage.
- Each example should work across all applicable renderers (Canvas/DOM/WebGL/WebGPU) via the existing `render.ts` abstraction.
- Examples double as smoke tests — `npm run test:examples:smoke` must pass for all of them.
- Prefer small, focused examples over large multi-feature demos. One concept per example.
- Examples should be ordered from simple to complex within each domain.

## Proposed Examples

### Tier 1: Core (keep/rework from existing set)

These features are already covered by OpenFL ports but should be reworked to use Flight idioms and terminology rather than OpenFL naming.

| Example | Feature | Notes |
|---------|---------|-------|
| `bitmap` | Bitmap display, image loading | Rework of `displayingabitmap`. Minimal Flight setup. |
| `shapes` | Shape drawing: fills, strokes, curves | Rework of `drawingshapes`. Use `appendShape*` builders. |
| `text` | TextLabel, RichText, custom fonts | Rework of `addingtext`. Add RichText with markup. |
| `spritesheet` | Spritesheet animation playback | Rework of `animatedsprite`. |
| `tilemap` | Tilemap rendering from Tiled data | Rework of `usingtilemap`. Load from TMJ format. |
| `tween` | Tween animation with easing curves | Rework of `tweenexample`. Show multiple easing families. |
| `particles` | Particle emitter with forces and curves | Rework of `sparktrail`. Already Flight-native. |
| `sound` | Audio loading, playback, mixer buses | Rework of `playingsound`. Add mixer bus demo. |
| `video` | Video playback through media channels | Rework of `playingvideo`. |
| `benchmark` | Batching performance benchmark | Rework of `bunnymark`. |

### Tier 2: Flight-specific features (new)

These exercise features no existing example covers.

| Example | Feature | SDK group | What it proves |
|---------|---------|-----------|----------------|
| `scene3d` | 3D scene with PBR materials and lighting | `scene` | Mesh primitives, standard PBR material, point/directional lights, camera orbit |
| `effects` | Post-processing effect chain | `rendering` | Bloom + vignette + color grade chained on a 2D scene |
| `adjustments` | Color adjustments (brightness, contrast, hue) | `rendering` | Color matrix composition, per-instance tint |
| `pathboolean` | Path boolean operations visualized | `displayobject` | Union/intersect/difference of shapes rendered as filled paths |
| `collision` | 2D collision detection with manifolds | `game` | Circle, AABB, and polygon colliders with MTV visualization |
| `spring` | Spring-physics animation | `animation` | Interactive spring with frequency/damping controls, comparison with tween |
| `flowstates` | Screen/mode flow-state stack | `game` | Boot → menu → play → pause → game-over lifecycle |
| `camera2d` | 2D game camera with follow and parallax | `game` | Deadzone follow, zoom, parallax layers, visible bounds |
| `textinput` | Editable text field | `text` | Caret, selection, undo/redo, password masking, input restrictions |
| `formatloading` | Loading assets from standard formats | `formats` | glTF model + TexturePacker atlas + Tiled tilemap in one scene |
| `interaction` | Pointer interaction and hit testing | `interaction` | Drag, hover states, overlap detection, cursor changes |
| `snapshot` | State snapshot, restore, and interpolation | `game` | Capture/restore game state, lerp between snapshots |
| `skeleton` | Skeletal animation on a 3D mesh | `scene` | Joint hierarchy, skin-palette, animated character |
| `motionpath` | Path-following animation | `animation` | Object following a bezier path with orientation |
| `clock` | Hierarchical clocks with pause/scale | `application` | Parent clock controlling child clocks, time scaling |
| `spatial` | Broadphase spatial query visualization | `game` | Uniform grid, pair queries, region/point/ray queries |
| `movieclip` | Timeline-driven frame animation | `animation` | Frame labels, frame scripts, goto/play/stop |

### Tier 3: Integration demos (new, larger scope)

These combine multiple features into a realistic scenario.

| Example | Features combined | What it proves |
|---------|-------------------|----------------|
| `platformer` | Camera2D + collision + sprite + tween + input + flow | A minimal platformer with screen transitions |
| `materialshowcase` | All 20 3D materials + lighting + camera | Material gallery with live parameter controls |
| `particleeditor` | Particles + spring + input + text | Interactive particle config editor |

## Implementation Order

1. **Tier 2 first.** These are the gap — features that have never been demonstrated. Implement in SDK-group order: scene3d → effects → collision → spring → camera2d → flowstates → textinput → interaction → snapshot → pathboolean → motionpath → formatloading → skeleton → clock → spatial → movieclip.
2. **Tier 1 rework.** Replace the OpenFL ports with Flight-native versions. The existing code is a useful reference but naming and structure should match Flight conventions.
3. **Tier 3 integration demos.** Only after Tier 1 and 2 are solid.

## Open Questions

- Should the OpenFL-port examples be removed in one batch or replaced incrementally as new ones land?
- Should Tier 3 examples live in `examples/` or in a separate `demos/` directory given their larger scope?
- Should examples that require external assets (glTF models, Tiled maps) bundle them or download them via the existing `download-cached.ts` script?
