# API Alignment: @flighthq/scene

**Verdict:** Strong overall — full type words, consistent `create*`/`enable*Signals`/`get*Runtime`/`get*Signals`/`is*` verbs that mirror sibling node families; the one real issue is `get*Runtime` returning a mutable runtime instead of `Readonly<>`, diverging from the base `getNodeRuntime` and every sibling package.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| Medium | `getSceneNodeRuntime` | Returns mutable `SceneNodeRuntime`. The base `getNodeRuntime` returns `Readonly<NodeRuntime<Traits>>`, and every sibling accessor (`getDisplayObjectRuntime`, `getStageRuntime`, `getSpriteRuntime`, `getBitmapRuntime`, …) returns `Readonly<XRuntime>`. A getter handing back a writable reference breaks the "Readonly on every returned reference where mutation is not intended" rule and lets callers mutate package-private runtime state. | Return `Readonly<SceneNodeRuntime>` (cast internally where a write is genuinely needed, as siblings do). |
| Medium | `getMeshRuntime` | Same divergence: returns mutable `MeshRuntime` (`= SceneNodeRuntime`) where siblings return `Readonly<XRuntime>`. It also just delegates to `getSceneNodeRuntime`, so it inherits the mutability. | Return `Readonly<MeshRuntime>` once `getSceneNodeRuntime` is fixed. |
| Low | `getSceneNodeSignals` / `getMeshSignals` | Take a mutable `SceneNode` / `Mesh`. A pure read accessor should take `Readonly<…>`; `getStageSignals` already takes `Readonly<Stage>`. (The underlying `getNodeSignals` takes a mutable `Node`, so this matches the base but not the cleaner sibling.) | Widen params to `Readonly<SceneNode>` / `Readonly<Mesh>` to match `getStageSignals` and the read-only nature of a getter. |
| Low | `createMesh` (`materials: (Material | null)[]`) | The doc comment states `materials` is "stored by reference, not copied", yet the param is a mutable `(Material | null)[]`of mutable`Material`. If post-store mutation is not intended at this seam, the elements could be `Readonly<Material>`. The array itself is legitimately mutable because `Mesh.materials` is mutable, so this is element-level only. | Consider `(Readonly<Material> | null)[]`for the element type; leave the array mutable to match the`Mesh.materials` field. Minor — verify against intended mesh-material editing flow first. |
| Info | `createMesh` / `createScene` / `createSceneNode` | `obj?` is positional after `kind`, requiring `createMesh(geo, mats, MeshKind, { name })` to set a name without a custom kind. This is consistent across all three constructors and matches the `createSceneNode(kind, obj)` base, so it is a deliberate package-wide shape, not an inconsistency. No change. | None — noted for symmetry confirmation only. |

## Clean

- **Full, unabbreviated type words everywhere.** `createSceneNode`, `getSceneNodeRuntime`, `enableSceneNodeSignals`, `getMeshRuntime`, `isMesh` — no `getSNRuntime`/`getObjRuntime` style abbreviation.
- **Globally unique root exports.** No collision with `@flighthq/mesh` (which owns `MeshGeometry` / `createMeshGeometry`, the value type) — `@flighthq/scene` owns the `Mesh` _node_ (`createMesh`, `isMesh`), a clean value-type vs scene-node split. `Scene` is explicitly disambiguated in the doc comment from `@flighthq/node`'s 2D `Scene` layout descriptor.
- **Verb consistency with sibling node families.** `create*` for allocation, `enable*Signals` for opt-in signal groups, `get*Runtime` / `get*Signals` accessors, `is*` type guard — the exact quartet used by `@flighthq/displayobject` and `@flighthq/sprite`.
- **Allocation discipline.** Only `create*` functions allocate (`createScene`, `createSceneNode`, `createSceneNodeRuntime`, `createMesh`); accessors and `isMesh` do not.
- **`is*` boolean naming.** `isMesh` is a proper `source is Mesh` type guard returning boolean, named with the `is` prefix; it discriminates by the presence of `geometry` rather than by kind symbol, which is robust across custom kinds (documented).
- **Accessor naming.** `get*` accessors all return values, never booleans; signals getters correctly return `NodeSignals | null` (sentinel for the not-enabled case, not a throw).
- **Cross-package types from `@flighthq/types`.** `Scene`, `SceneNode`, `Mesh`, `Material`, `MeshGeometry`, `Kind`, `NodeSignals`, kinds, and traits keys are all imported from `@flighthq/types`; nothing cross-package is defined inline.
- **`import type {}` hygiene.** Type-only imports are on their own `import type { … }` lines (`scene.ts`, `sceneNode.ts`, `mesh.ts`); no mixed `import { type Foo, bar }`.
- **No top-level side effects.** Package is `"sideEffects": false`; no renderer registration or global mutation at module scope (rendering lives in `scene-gl` / `scene-wgpu` via `prepareSceneRender`).
- **`createSceneNodeRuntime` writes its own fresh `out`.** It mutates a newly allocated runtime, not a caller-supplied one, so the runtime write there is correct and not an aliasing/Readonly concern.
