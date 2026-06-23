# Depth Review: @flighthq/types

**Domain**

The shared, implementation-free **header layer** for the entire SDK: cross-package interfaces, type aliases, entity/runtime quartets, open base contracts, capability backend seams, and string `*Kind` identity constants. Unlike a typical leaf package, its "domain" is not a single subject (easing, path) but the _complete declared API surface_ of every other package. The bar for this package is therefore: does the header alone let a reader navigate and pin down the full shape of the SDK — every entity, every extensible family, every platform capability — without importing any implementation?

**Verdict: solid** — completeness 82/100.

As a header layer it is broad, internally consistent, and well-organized; it is the single strongest expression of the codebase's design rules. It falls short of "authoritative" on two counts: a near-total absence of test coverage for its own (admittedly type-only) contracts, and a handful of acknowledged design debts (closed unions that the project's own spec says should be open). Depth here means _fidelity and consistency of the contract surface_, and on that axis it is high; the deductions are for the unfinished edges, not the core.

## Present capabilities

The package follows the `types-layout.md` spec faithfully and covers the entire SDK breadth in ~320 one-concept-per-file modules:

- **Entity quartets** — `Entity`/`EntityRuntime`/`EntityRuntimeKey`/`Kind` foundation, then full `Data`+`Runtime`+entity+`Kind` (+`*Like`) quartets for `Node`, `DisplayObject`, `DisplayContainer`, `Bitmap`, `Shape`, `Sprite`, `Stage`, `Video`, `MovieClip`, `Tilemap`, text entities, etc. `BitmapData`/`BitmapRuntime`/`Bitmap`/`BitmapKind` is the canonical reference shape and it is applied uniformly.
- **Open base contracts** carrying a string `kind` discriminant, extensible without editing a central union: `Material` (+`MaterialLike`, `MaterialData`, `DefaultMaterialKind`), `RenderEffect`, `BitmapFilter`. These are documented with ownership/batching/serialization semantics inline.
- **Capability backend seams** — every platform package has its `*Backend` interface + options/enums here: `DialogBackend`, `Clipboard`, `FileSystem`, `Notification`, `Shell`, `Menu`, `Tray`, `Shortcut`, `Screen`, `Storage`, `Device`, `Share`, `Haptics`, `Geolocation`, `Webcam`, `StatusBar`, `Network`, `Power`, `Lifecycle`, `Keyboard`, `Sensors`, `Platform`, plus the app/process layer (`App`, `Protocol`, `Updater`, `Ipc`) and windowing (`Application`, `ApplicationWindow`).
- **Math/geometry value types** — `Matrix`, `Matrix3`, `Matrix4`, `Vector2/3/4`, `Quaternion`, `Rectangle`, `Aabb`, `Plane`, `Frustum`, `BoundingSphere`, with the `*Like` (runtime-stripped) variant convention.
- **Render seam types** — backend cores fully declared per technology: `Canvas*`, `Gl*`, `Wgpu*`, `Dom*` render state/target/options/pipeline, `Renderer`, `RendererData`, `RenderProxy`/`RenderProxy2D`/`SceneRenderProxy`, `RenderCache`(+adapter/signals/refresh), `RenderEffect` pipelines, velocity writers, shader/locations.
- **Feature-family breadth** is exhaustive: full PBR material set (`StandardPbrMaterial`, `Clearcoat`, `Sheen`, `Iridescence`, `Subsurface`, `Transmission`, `SpecularGlossiness`, `Anisotropy`, plus Blinn-Phong/Lambert/Toon/Matcap/Normal/Depth/Unlit/Wireframe/Emissive/VertexColor); a large post-processing `*Effect` family (~50: SSAO, SSR, TAA, SMAA, FXAA, bloom, god rays, DOF, motion blur, color grading, CRT/glitch/halftone, etc.); the OpenFL filter set (`Blur`, `Glow`, `Bevel`, `DropShadow`, `Gradient*`, `ColorMatrix`, `Convolution`, `Displacement`, `Sharpen`, `Median`, `Pixelate`, inner/outer variants); a full particles vocabulary (emitter/config/state/callbacks, forces, colliders, curves); lighting (`Directional`, `Point`, `Spot`, `Area`, `Hemisphere`, `Ambient`, `SceneLights`, `SceneLightBlock`); text stack (`TextFormat`, `RichText*`, `TextLayout`, `TextMetrics`, `TextShaper`, selection/input types); resources, spritesheet, timeline, tween/easing, surface, interaction, input.
- **Signal seam** — `Signal`/`SignalData`/`SignalConnectOptions` plus the per-subsystem signal-group interfaces (`NodeSignals`, `StageSignals`, `InteractionSignals`, `MovieClipSignals`, `InputSignals`, `RenderCacheAdapterSignals`).
- **Closed-vocabulary domains** correctly grouped or kept as enums/const objects: `BlendMode`, `PixelFormat`, `PixelOrder`, `ImageChannel`, `StageAlign`/`StageScaleMode`/`StageQuality`/`StageDisplayState`, `KeyCode`, `KeyModifier`, `MouseButton`, `PathCommand`/`PathWinding`.
- **Generic/utility types** — `MethodsOf`, `PartialNode`, `EntityWithoutRuntime`, `NodeOf`/`NodeAny`, `NodeTraitsKey`, `RandomSource`.

The doc comments are a genuine strength: `Material.ts`, `RenderEffect.ts`, `Path.ts`, and `Node.ts` carry the ownership, allocation, batching, coordinate-space, and serialization rules that a header layer must encode so the contract is readable without the impl.

## Gaps vs an authoritative type-contract / header library

The bar for a header layer is "navigable, complete, internally consistent, and self-verifying." Concrete shortfalls:

- **No meaningful test coverage (the largest gap).** The only test file is `missing.test.ts`, a single `assert(true)` placeholder named "will have tests later," covering ~320 source files. The codebase mandates one colocated test per source file and runs `exports:check`. For a type-only package, runtime tests are mostly inapplicable, but an authoritative header still earns coverage from **type-level assertion tests** (e.g. `expectTypeOf`/`assertType`): that `*Like = EntityWithoutRuntime<T>` strips the runtime key, that quartets stay structurally assignable, that open-contract `kind` discriminants narrow, that `MethodsOf`/`PartialNode`/`NodeOf` behave, and that the closed unions (`ParticleForce`) remain exhaustive. None of this exists. This is the difference between "the types happen to compile" and "the contract is guaranteed."
- **Acknowledged closed-union debt vs the package's own spec.** `ParticleForce` (and by the same reasoning `ParticleCollider`) is a closed `A | B | C` union, with an inline NOTE conceding it should become an open `kind: Kind` contract once `@flighthq/particles` moves to registry dispatch. The spec explicitly allows closed unions for hot, finite, non-extensible families — so this is _defensible by design_ — but it is recorded as deferred work, not a settled decision, which leaves the contract surface inconsistent (effects/filters/materials are open; forces are not).
- **No build-time guarantee that the header stays self-contained.** The header's stated promise is "navigable from `@flighthq/types` alone, without importing any implementation package." Nothing in this package enforces that an implementation type didn't leak in or that every cross-package type actually lives here; that invariant is checked (if at all) by `packages:check` elsewhere, not by the header. An authoritative header would assert its own closure.
- **`Signal<T>` typed by function shape, not payload.** The TS `Signal` is parameterized by the slot function type (`T extends (...args) => void`) and leans on `any`. This is internally fine, but it diverges from the locked Rust port decision (`Signal<T>` by _payload_), so the two header layers describe the same seam with different generic shapes — a conformance seam that is slightly less than 1:1.
- **Minor surface omissions are by-design, not by-omission.** There are no free functions, constructors, validators, or guards here — correct for a pure header. Likewise the absence of `surface`/`geometry`/`easing` _algorithms_ is not a gap: those belong to impl packages. Judged as a header, the missing items above are the real ones.

## Naming / API-shape notes

- Naming is exemplary and is the package's strongest dimension. Filename = primary exported type, exact PascalCase casing (`Aabb`, `HtmlView`, `DomRenderState`, `StandardPbrMaterial`), flat layout with no category folders, full unabbreviated type words throughout. The barrel is a clean alphabetized re-export with a single `.` entry.
- The quartet convention (`*Data`/`*Runtime`/entity/`*Kind` + `*Like`/`*Factory`) is applied with rare consistency across dozens of entities; `Bitmap.ts` and `Node.ts` are textbook.
- String-kind identity is uniform (`export const BitmapKind = 'Bitmap'`), serving as registry key + serialized form + intent vocabulary, exactly as specified.
- `NodeAny` / the `Node<Traits>` invariance comment, and the `EntityRuntimeKey` symbol-vs-string split, show the package documents the _why_ at the points where a name alone cannot carry the rule — the right pattern for a header.
- One small inconsistency worth noting: `DOMRenderOptions.ts`/`DOMStageRectangle.ts` use `DOM` all-caps in the type name while `DomRenderState.ts` uses `Dom`; the spec calls for PascalCase acronyms (`Dom`). Cosmetic, but it is the kind of drift this package otherwise avoids perfectly.

## Recommendation

Keep the verdict at **solid**; this is a high-quality, near-exhaustive header and the canonical home of the codebase's design rules. To reach **authoritative**:

1. **Add type-level assertion tests.** Replace `missing.test.ts` with colocated `*.test.ts` using `expectTypeOf`/`assertType` for the structural invariants that actually matter: `*Like` strips the runtime key, quartets stay assignable, open-contract `kind` narrows, closed unions stay exhaustive, and the utility generics (`MethodsOf`, `PartialNode`, `NodeOf`, `EntityWithoutRuntime`) behave. This is the single highest-value change and is what converts "compiles" into "contract."
2. **Resolve the `ParticleForce`/`ParticleCollider` open-vs-closed decision.** Either convert to the open `kind: Kind` base contract (coordinated with the particles refactor) or upgrade the inline NOTE from "deferred" to a settled "closed by design (hot finite family)" rationale, so the contract surface is consistent rather than provisional.
3. **Reconcile the `Signal` generic shape with the Rust port** (payload-parameterized) or document the divergence in the conformance map, so the header-to-header seam is explicitly 1:1.
4. **Fix the `DOM`/`Dom` acronym-casing drift** to match the spec.
