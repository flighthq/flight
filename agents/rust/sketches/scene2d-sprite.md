# Sketch: Sprite + GL sprite renderer (D2, review only)

Status: **REVIEW SKETCH. Not applied anywhere, and not approved.** This file shows how pattern (A) from D2 would translate one real TS type end to end. Signatures only; bodies are elided unless they show the pattern.

TS sources: `types/src/{Node,Node2D,Sprite,NodeRenderer,Scene2DRenderer}.ts`, `scene2d/src/sprite.ts`, `scene2d-gl/src/glSprite.ts`, `render/src/renderer.ts`, `render/src/renderProxy.ts`.

## Ruling this builds on (user, 2026-10-20)

- An object says what it is (`kind`) and may carry type-specific data. In OOP terms, `kind` is the class identity, and `data` holds the subclass's own fields.
- Handlers are loosely coupled to types through dispatch tables keyed by kind. **No large switch** over kinds.
- The `data` field is always present, even when it holds null.

## 1. Kind and data slot

```ts
// TS
export type Kind = string;
interface NodeTraits { readonly data: NodeData | null; enabled: boolean; kind: Kind; name: string | null; }
export interface SpriteData extends Node2DData { texture: Texture | null; }
export interface Sprite extends Node2D { data: SpriteData; }
export const SpriteKind = 'Sprite';
```

```rust
// Rust IR
pub type Kind = String;
/// The one sanctioned erased slot type. The lint allows `dyn Any` only through this alias.
pub type EntitySlot = Option<Box<dyn Any + Send + Sync>>;

pub struct Node2D {
    pub data: EntitySlot,    // always present; None is TS null
    pub enabled: bool,
    pub kind: Kind,
    pub name: Option<String>,
    // ...Node2DTraits: appearance, blend_mode, bounds_rectangle, clip, material, transform2d
    pub runtime: EntitySlot, // TS [EntityRuntimeKey]: NodeRuntime, e.g. SpriteRuntime
}

pub struct SpriteData {
    pub texture: Option<Arc<Texture>>, // a shared object reference in TS (see open question 2)
}

pub const SPRITE_KIND: &str = "Sprite";
```

## 2. The cast: `(source as Sprite).data`

```ts
const texture = (renderProxy.source as Sprite).data.texture;
```

```rust
pub fn get_sprite_data(source: &Node2D) -> Option<&SpriteData> {
    return source.data.as_ref()?.downcast_ref::<SpriteData>();
}
pub fn get_sprite_data_mut(source: &mut Node2D) -> Option<&mut SpriteData> { ... }

// in draw_gl_sprite:
let Some(sprite) = get_sprite_data(source) else { return; };
let Some(texture) = &sprite.texture else { return; };
```

The TS cast is unchecked, so a mismatched `kind`/`data` lies silently. In Rust the mismatch shows up as `None`. The API is the same; the IR is slightly stricter. Transpilers emit `(source as Sprite).data` for TS and a tagged `static_cast` for C++.

## 3. Factory

```ts
export function createSprite(obj?: Readonly<PartialNode<Sprite>>): Sprite {
  return createNode2D(SpriteKind, obj, createSpriteData, createSpriteRuntime) as Sprite;
}
```

```rust
pub fn create_sprite(obj: Option<&PartialSprite>) -> Node2D {
    return create_node2d(SPRITE_KIND, obj, create_sprite_data, create_sprite_runtime);
}
```

## 4. Renderer: a struct of function pointers (no trait)

```ts
export interface NodeRenderer {
  format?: BatchFormat;
  createData(state: RenderState, source: NodeAny): RendererData | null;
  destroyData?(state: RenderState, data: RendererData): void;
  isDirty?(state: RenderState, source: NodeAny, data: RendererData | null): boolean;
  submit(state: RenderState, node: RenderProxy): void;
}
export const glSpriteRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad, createData: createSpriteRendererData,
  isDirty: isSpriteRendererDirty, submit: drawGlSprite,
};
```

```rust
pub struct NodeRenderer {
    pub format: Option<BatchFormat>,
    pub create_data: fn(state: &mut RenderState, source: &Node2D) -> EntitySlot,
    pub destroy_data: Option<fn(state: &mut RenderState, data: EntitySlot)>,
    pub is_dirty: Option<fn(state: &RenderState, source: &Node2D, data: &EntitySlot) -> bool>,
    pub submit: fn(state: &mut RenderState, node: &RenderProxy2D),
}

pub const GL_SPRITE_RENDERER: NodeRenderer = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_sprite_renderer_data,
    destroy_data: None,
    is_dirty: Some(is_sprite_renderer_dirty),
    submit: draw_gl_sprite,
};
```

The GL renderer takes the shared `RenderState` and reaches its backend state the way TS does, `get_gl_render_state_runtime(state)`. That is one more `EntitySlot` on `RenderState`. TS gets this through structural subtyping (`GlRenderState extends RenderState`), which Rust function-pointer types cannot express.

## 5. Registration and dispatch: lookup, no switch

```ts
export function registerNodeRenderer(state: RenderState, kind: Kind, renderer: NodeRenderer): void
// walk: registries.nodeRenderers.get(kind)
```

```rust
pub fn register_node_renderer(state: &mut RenderState, kind: &str, renderer: &'static NodeRenderer)
pub fn register_node_renderers(state: &mut RenderState, entries: &[(&str, &'static NodeRenderer)])

// walk (render_proxy.rs)
let Some(renderer) = resolve_render_proxy_renderer(state, &source.kind) else { return; }; // HashMap get
(renderer.submit)(state, proxy);
```

`registries.node_renderers: HashMap<Kind, &'static NodeRenderer>` is lookup-only, which satisfies D3. TS's `table.get(kind) === renderer` identity check becomes `std::ptr::eq`.

## 6. A third-party kind needs no edits to scene2d or scene2d-gl

```rust
pub const ACME_BLOB_KIND: &str = "acme.Blob";
pub struct AcmeBlobData { pub radius: f32 }
pub const GL_ACME_BLOB_RENDERER: NodeRenderer = NodeRenderer { /* ... */ };
register_node_renderer(&mut state, ACME_BLOB_KIND, &GL_ACME_BLOB_RENDERER);
```

## Open questions this sketch surfaces

1. **Tree ownership and `proxy.source`.** TS nodes are shared references: children live in `runtime.children`, and a proxy points at its source node. In Rust this means either an arena with handles (as in flight-rs-native's `NodeArena` + `NodeId`) or `Arc` nodes. This is the biggest open choice, and it affects every scene API.
2. **Shared resources** (`Texture`): `Arc<Texture>`, or a handle into a texture store.
3. **Renderer lifetime:** `&'static NodeRenderer` covers compile-time renderers, the TS `const` objects. `Arc<NodeRenderer>` would also allow renderers built at runtime.
4. **`Kind` as `String` or `&'static str`:** `String` allows kinds named at runtime (loaded content); `&'static str` is cheaper.
5. **Lint:** allow `dyn Any` only through the `EntitySlot` alias, so that designated slots are the only erased surface.
