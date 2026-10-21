# Sketch: GL and wgpu sprite rendering end to end (D17 checkpoint before L11)

Status: **REVIEW SKETCH.** Signatures and the parts of bodies that show the pattern. Applies D16 (node families), D15 (uid-keyed caches), D17 (render API shape, GPU cleanup), D23/D24.

TS sources: `render/src/{renderer,renderProxy}.ts`, `render-gl/src/glRenderState.ts`, `scene2d-gl/src/{glSprite,glNode2D}.ts`, `scene2d-wgpu/src/wgpuSprite.ts`, `types/src/{RenderState,NodeRenderer,RenderProxy,GlRenderState}.ts`.

## 1. Backend state family (D16 pattern)

```rust
// flight-render
pub struct RenderStateFields {                  // TS RenderState public fields (Canvas-only fields removed)
    pub allow_smoothing: bool,
    pub current_clip_depth: u32,
    pub pixel_ratio: f32,
    pub render_alpha: f32,
    pub render_blend_mode: Option<BlendMode>,
    pub round_pixels: bool,
    pub scene_graph_sync_policy: Scene3DGraphSyncPolicy,
    runtime: EntityRuntimeSlot,
}

pub trait RenderState: Entity + Sized + 'static {
    fn render_state(&self) -> &RenderStateFields;
    fn render_state_mut(&mut self) -> &mut RenderStateFields;
    fn render_registries(&self) -> &RenderRegistries<Self>;       // node renderers typed by backend
    fn render_registries_mut(&mut self) -> &mut RenderRegistries<Self>;
}

// flight-render-gl  (not Send: glow::Context is thread-bound, D17)
pub struct GlRenderState {
    render: RenderStateFields,
    pub gl: Rc<glow::Context>,                   // passed in by the host (D17)
    pub context_state: GlContextState,
    registries: RenderRegistries<GlRenderState>,
    gl_registries: Arc<GlRenderRegistries>,      // backend tables, copy-on-write
    gl_textures: HashMap<EntityUid, GlTextureEntry>,   // TS WeakMap<Texture, …> → uid map (D15)
    delete_queue: GlDeleteQueue,                 // §6
    // … quad batch writer, shaders, etc.
}

// flight-render-wgpu  (Send + Sync)
pub struct WgpuRenderState { render: RenderStateFields, pub device: wgpu::Device, pub queue: wgpu::Queue, /* … */ }
```

TS keeps `GlRenderState extends RenderState`; nothing changes there.

## 2. Renderer: a struct of function pointers, typed by backend

```rust
pub struct NodeRenderer<S: RenderState> {
    pub format: Option<BatchFormat>,
    pub create_data: fn(state: &mut S, source: &NodeRef) -> Option<RendererData>,
    pub destroy_data: Option<fn(state: &mut S, data: RendererData)>,
    pub is_dirty: Option<fn(state: &S, source: &NodeRef, data: Option<&RendererData>) -> bool>,
    pub submit: fn(state: &mut S, proxy: &RenderProxy2D),
}

pub struct RenderRegistries<S: RenderState> {
    pub node_renderers: Arc<HashMap<Kind, &'static NodeRenderer<S>>>,   // copy-on-write (D17)
    pub stroke_tessellator: Option<StrokeTessellator>,
    // … the rest of TS RenderRegistries
}
```

```ts
// TS mirror (the only TS change): the cast disappears from every renderer
export interface NodeRenderer<S extends RenderState = RenderState> {
  format?: BatchFormat;
  createData(state: S, source: NodeAny): RendererData | null;
  destroyData?(state: S, data: RendererData): void;
  isDirty?(state: S, source: NodeAny, data: RendererData | null): boolean;
  submit(state: S, node: RenderProxy): void;
}
```

Backend-agnostic helpers from scene2d are written once, generic, and each backend takes its own instance:

```rust
// flight-scene2d
pub fn create_sprite_renderer_data<S: RenderState>(state: &mut S, source: &NodeRef) -> Option<RendererData> { … }
pub fn is_sprite_renderer_dirty<S: RenderState>(state: &S, source: &NodeRef, data: Option<&RendererData>) -> bool { … }
```

## 3. The GL sprite renderer

```rust
// flight-scene2d-gl
pub fn draw_gl_sprite(state: &mut GlRenderState, proxy: &RenderProxy2D) {
    let source = proxy.source.read();
    let Some(sprite) = source.as_any().downcast_ref::<Sprite>() else { return; };  // D16: kind narrows
    let Some(texture) = sprite.data.texture.clone() else { return; };
    drop(source);
    let texture = texture.read();
    if !is_texture_2d(&texture) || !has_texture_source(&texture) { return; }

    let mut view_size = Vector2::default();                 // TS module scratch → stack value (D5)
    get_texture_view_size(&mut view_size, &texture);
    if view_size.x <= 0.0 || view_size.y <= 0.0 { return; }

    let Some(material_renderer) = resolve_gl_quad_material_renderer(state, proxy.material.as_ref()) else { return; };
    let Some(gl_texture) = resolve_gl_texture(state, &texture, true, SCENE2D_WORKING_COLOR_SPACE) else { return; };
    ensure_gl_quad_batch_shader(state);

    let mut uv = create_matrix3();
    get_texture_uv_matrix(&mut uv, &texture);
    // … top-origin reflection for render-target sources, exactly as TS …
    let instance = prepare_gl_quad_batch_write(state, gl_texture, /* … */ 1);
    write_gl_quad_batch_affine_instance(/* out */ &mut state.quad_batch_writer_instance_data, instance * QUAD_BATCH_INSTANCE_FLOATS,
                                        &proxy.transform2d, view_size.x, view_size.y, /* uv … */ proxy.alpha);
    // … material pack, color scale/bias, count++ — line for line with TS
}

pub static GL_SPRITE_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_sprite_renderer_data::<GlRenderState>,
    destroy_data: None,
    is_dirty: Some(is_sprite_renderer_dirty::<GlRenderState>),
    submit: draw_gl_sprite,
};
```

The wgpu renderer is the same shape with `WgpuRenderState`, `resolve_wgpu_texture`, and no Y reflection. Registering a GL renderer into a wgpu state is a compile error.

## 4. Registration and derived pipelines

```rust
pub fn register_node_renderer<S: RenderState>(state: &mut S, kind: &str, renderer: &'static NodeRenderer<S>) {
    let registries = state.render_registries_mut();
    if registries.node_renderers.get(kind).is_some_and(|r| std::ptr::eq(*r, renderer)) { return; }  // TS `===`
    Arc::make_mut(&mut registries.node_renderers).insert(kind.to_string(), renderer);   // copies only if shared
    // renderer_map_id += 1 (runtime)
}

pub fn copy_renderers_from_render_state<S: RenderState>(target: &mut S, source: &S) {
    // empty target: share the source snapshot (Arc clone) — TS's same-snapshot fast path
}
```

`register_node_renderers(state, &[(SPRITE_KIND, &GL_SPRITE_RENDERER), …])` is the batch form. No "register all" set (tree-shaking in TS, link-time in Rust).

## 5. The walk: proxies beside the state

TS stores proxies in `runtime.renderProxyMap` (inside the state) and the walk calls `renderer.submit(state, proxy)`. Rust cannot lend `&mut state` and `&proxy` from inside it at once, so proxies move to their own store, owned next to the state:

```rust
pub struct RenderProxies2D {                       // one per render state; owned by the caller or the app
    entries: Vec<RenderProxy2D>,                    // ordered (D3)
    by_uid: HashMap<EntityUid, usize>,              // TS WeakMap<Node, RenderProxy> (D15)
}

pub fn prepare_scene2d_render<S: RenderState>(state: &mut S, proxies: &mut RenderProxies2D, root: &Node2DRef) -> bool { … }

pub fn render_gl_scene2d(pass: &mut GlRenderPass, proxies: &mut RenderProxies2D, root: &Node2DRef,
                         render_transform: Option<&Matrix>) {
    // same stack walk as TS glNode2D.ts; the render-transform swap happens on &mut proxy before submit
    let proxy = proxies.get_mut(&current)?;
    // …
    if let Some(renderer) = proxy.renderer { (renderer.submit)(&mut pass.state, proxy); }
}
```

TS gains one argument (`proxies`) on `prepareScene2DRender`, `renderGlScene2D`, `disposeScene2DRender`; or TS keeps the store on the runtime and only Rust splits it. **Open question A** below.

## 6. GPU cleanup: explicit destroy plus a deferred-delete queue (D17)

The key case is a texture the app drops without telling the renderer. `flight-texture` cannot know about GL, so render-gl leaves a small **lease** in the texture's runtime slot the first time it uploads it:

```rust
// flight-render-gl
#[derive(Clone)]
pub struct GlDeleteQueue(Arc<Mutex<Vec<GlDeletion>>>);       // Send: holds only uids / raw GL names
pub enum GlDeletion { Texture(EntityUid), Buffer(glow::NativeBuffer), Framebuffer(glow::NativeFramebuffer) /* … */ }

struct GlTextureLease { uid: EntityUid, queue: GlDeleteQueue }
impl Drop for GlTextureLease {
    fn drop(&mut self) { self.queue.0.lock().push(GlDeletion::Texture(self.uid.clone())); }  // any thread
}

pub fn resolve_gl_texture(state: &mut GlRenderState, texture: &Texture, /* … */) -> Option<&GlTextureEntry> {
    // first upload: create the GL texture, insert into state.gl_textures by uid,
    // and attach a GlTextureLease to the texture's runtime (one per render state)
}

pub fn begin_gl_render_frame(state: &mut GlRenderState) {            // GL thread, start of frame
    for deletion in state.delete_queue.drain() {
        match deletion {
            GlDeletion::Texture(uid) => if let Some(entry) = state.gl_textures.remove(&uid) { unsafe { state.gl.delete_texture(entry.texture) } },
            // …
        }
    }
}

pub fn destroy_gl_render_state(state: &mut GlRenderState) { /* drain queue, destroy every entry, as TS */ }
pub fn destroy_gl_texture(state: &mut GlRenderState, texture: &Texture) { /* explicit, immediate — TS parity */ }
```

- Dropping the last `Ref<Texture>` drops its runtime, the lease pushes the uid, and the next frame deletes the GL texture on the GL thread.
- Explicit `destroy_*` stays the contract and frees immediately; the queue is only the safety net.
- Proxies: `dispose_scene2d_render` and a node's drop do the same for `destroyData` (renderer data is per state, keyed by node uid).
- Context loss clears the queue and the uid maps (handles are already dead).
- **wgpu** needs none of this: dropping `wgpu::Texture` already defers destruction until the GPU is done; the uid map entry is removed by the same lease pattern so the map does not grow.
- TS keeps explicit destroy plus browser GC (`FinalizationRegistry` could mirror the lease later; not proposed).

## 7. Threading

- `GlRenderState` holds `Rc<glow::Context>` and is `!Send`; the walk and every GL renderer run on the GL thread.
- Scene nodes and textures stay `Send + Sync` (`Ref<T>`); the lease's `Drop` can run on any thread because it only pushes to a `Mutex<Vec>`.
- `WgpuRenderState` is `Send + Sync`.

## Open questions

A. **Proxy store in TS.** Option 1: TS mirrors Rust (proxies passed explicitly; more verbose, matches "explicit dependencies"). Option 2: TS keeps the store inside the runtime and only Rust splits it (no TS churn, one-argument difference recorded as a D0 exception). Principal leans **1** for transpile fidelity.
B. **Entity uid keys.** `get_entity_uid` is a lazily assigned `String`. Render maps are hot; principal proposes a `u64` entity id inside the runtime for map keys (the `String` uid stays the public identity). Needs a D12 note.
C. **Frame bracket.** TS has no per-frame begin for GL; `begin_gl_render_frame` (or draining inside `render_gl_scene2d`) is new. Principal leans to drain at the start of each `render_gl_*` pass entry, so no new verb is needed.
