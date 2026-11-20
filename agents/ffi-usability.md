# FFI usability: from "generated" to "usable"

_**Ratified 2026-11-18.** Supersedes the scoping of the dispatched tasks S, U, V and W; does not change K/L/M, the f64 migration (N/P/Q/R), or Task T._

## Why this record exists

The FFI alpha was accepted on a census: 4083 public sources, 3387 generated, zero actionable skips. That number measures whether a wrapper was **emitted**. It does not measure whether a C or Haxe consumer can **call** it. Reading the generator and its output against the alpha goal (flight-hx and openfl-flight driving the SDK through the C ABI) found that the central paths are generated and unusable:

| Path                   | State on current code                                                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build a scene graph    | **Unsound.** `flight_create_sprite` returns a boxed `Ref<Sprite>` (thin). `flight_add_node_child` reads its arguments as `Ref<dyn Node>` (fat, with vtable). Nothing converts one to the other: `as_node_ref<T>` is generic and generics are skipped. No test calls it. |
| Set a node property    | **Unreachable.** `flight_set_node2_dfields_alpha` and its siblings take `*mut Node2DFields`. Nothing produces that pointer from a node handle, and the setter takes no lock. `blend_mode` and `name` have no accessor at all.                                           |
| Call `&T` entity APIs  | **Partly unreachable.** Functions over `&T` / `&mut T` lower to raw struct pointers. Where `T` only ever exists inside a `Ref<T>`, C holds a handle and has no way to obtain the pointer.                                                                               |
| Listen to an event     | **Missing.** `connect_signal<T>` is generic. `flight_disconnect_signal_connection` is generated; no connect is.                                                                                                                                                         |
| Supply a host          | **Unreachable.** About 390 generated functions take a `Host*Capability` pointer. Two functions in the whole surface produce one.                                                                                                                                        |
| Draw a frame           | **Missing.** `flight-render-wgpu`, `flight-render-gl`, `flight-scene2d-wgpu`, `flight-scene2d-gl`, `flight-effects-wgpu` and `flight-scene3d-wgpu` are not in `SCAN_CRATES`. Adding them alone generates little (see [Render path](#4-render-path)).                    |
| Open a window          | **Missing.** No crate in the repository opens a window or creates a presentable device.                                                                                                                                                                                 |
| Bitmap region in place | **Unrepresentable** in Rust itself (see [BitmapRegion](#3-bitmapregion)).                                                                                                                                                                                               |

Evidence was read from `crates/flight-ffi/build.rs` (current) and from a generated `ffi_generated.rs` built before the final K/L/M landing. Each row must be re-confirmed on a fresh build by the first task below; the generator source gives no reason to expect a different answer.

## Principle

**A function is part of the FFI surface only if it is reachable**: every pointer or handle it consumes has a generated producer, transitively, starting from functions that consume nothing. Acceptance for FFI work is stated as reachability plus executable scenarios, never as a generated count.

## 1. Reachability gate and golden-path scenarios

### Reachability census

The generator already knows every wrapper's parameter and return carriers. Emit a type-producer graph and classify every generated function:

- **reachable** — all consumed carriers are producible;
- **unreachable** — names the first carrier with no producer.

A carrier is a distinct ABI type: `Box<Ref<Sprite>>`, `Box<Ref<dyn Node>>`, `*mut Node2DFields` and `*const HostTimerCapability` are four carriers. A thin handle does not satisfy a fat-handle parameter. Task K's "producer fixed point" proved this for consumed (owned) parameters only; this extends it to every pointer parameter.

Output: a committed baseline listing unreachable functions by carrier, and a check that fails when the unreachable set grows. Named policies may exempt a carrier with a reason, as skips do today. The census is the measure every later item in this record is tracked against.

### Golden-path scenarios

Each is an executable test through the C ABI (the existing strict-C consumer), and G6 repeats G1, G2 and G4 through generated Haxe externs on HashLink.

- **G1 scene graph** — create container, sprite, shape, bitmap and text nodes; add, reorder and remove children; set and read transform, alpha, visible, blend mode and name; free everything. Run under an address sanitizer.
- **G2 headless render** — render the G1 scene to an offscreen wgpu target and compare read-back pixels with the same scene rendered from Rust.
- **G3 window** — open a window with the native host, run a fixed number of frames, close. Runs locally; optional in CI.
- **G4 events** — connect a listener from C to a node signal, dispatch synthetic pointer input, observe the callback, disconnect, release the context.
- **G5 bitmap** — region operations including a true same-bitmap in-place case.
- **G6 Haxe** — G1, G2, G4 from HashLink, including a 16-float matrix round trip.

"ESM–FFI parity" is defined as: these scenarios have the same observable result as their TypeScript equivalents.

## 2. Handles

### 2a. One node handle

Every function that returns a node — concrete (`create_sprite`) or abstract (`get_node_parent`) — returns the same carrier, `FlightNode*`:

```rust
struct FfiNodeHandle {
    node: Ref<dyn Node>,
    node2d: Option<Ref<dyn Node2D>>,
    node3d: Option<Ref<dyn Node3D>>,
    concrete: Option<Box<dyn Any + Send + Sync>>, // the original Ref<T>, when the producer knew T
}
```

The views are filled at the producer, where the unsizing coercion is a plain `Arc` clone. Consumers read the view they need: a `NodeRef` parameter reads `node`; a `Node2DRef` parameter reads `node2d`; a `&Ref<Sprite>` parameter downcasts `concrete`. A wrong-kind handle is API misuse and returns the function's sentinel; a guard explains it. One handle, one `flight_free_node`, no process-global registry.

This replaces the per-type `flight_free_<type>_ref` functions for node kinds and makes the hierarchy functions sound. It is the upstream form of flight-hx patch 0006.

### 2b. Borrowing through a handle

Rule for lowering `&T` and `&mut T` parameters:

- `T` is only ever produced inside a `Ref<T>` → the parameter is the handle; the wrapper takes a read or write lock for the duration of the call.
- `T` is only ever produced owned → raw pointer, as today.
- `T` is produced both ways (`Bitmap` is) → the reachability census decides: the count of affected functions determines whether these get a second handle-taking wrapper or an explicit `begin`/`end` lock bracket.

### 2c. Node fields

Field accessors are generated against the node handle, through the SDK's own field views (`node2d_fields()`, `appearance()`), under the lock: `flight_get_node2d_alpha(node)`, `flight_set_node2d_x(node, v)`. Enum and string fields (`blend_mode: Option<BlendMode>`, `name: Option<String>`) are included.

**Setters do not invalidate.** They mirror the SDK, where assignment is bare and the caller names the invalidation (`invalidate_node_appearance` for alpha, visible and blend mode; nothing for transforms or name). A binding layer that wants `sprite.alpha = x` to "just work" composes the two calls itself. flight-hx patch 0012 bumped the revision inside the setter; that hides work the caller did not ask for and is not adopted.

Field types follow the f64 record: transforms become `f64` when `flight-scene2d` migrates; **alpha stays `f32`**.

### 2d. Signals

Monomorphise `connect_signal<T>` for each payload type that appears on a public signal field. Each connect takes `fn` + `ctx` (the Task M callback contract) plus a **context release callback**, and returns a connection handle. Disconnecting or freeing the connection calls the release exactly once. This is the retained-callback contract `connect_signal_at_frame_rate` already uses, applied uniformly.

## 3. BitmapRegion

### Finding

`BitmapRegion { bitmap: Bitmap, x, y, width, height }` owns its bitmap inline. Consequences on current code:

- `create_bitmap_region` moves the bitmap in. Written pixels are reachable only as `region.bitmap`.
- Two regions can never share a bitmap, so the in-place and same-bitmap cases that TypeScript documents and tests (`bitmapFlip.test.ts`, `bitmapHistogram.test.ts`, `bitmapCopy.ts`) cannot be expressed. `is_same_region` compares inline bitmaps by address and is never true. The Rust "in place" test passes a clone.
- The 20 functions taking a destination and a source region clone the **entire** source pixel buffer on every call as a defence.
- `flight-glyphatlas` holds `Ref<Bitmap>` and writes pixels by hand because it cannot use the type.
- The only caller outside the crate, `flight-bitmap-wasm`, copies in and copies back.

`BitmapRegion` is the only type with this defect; `TextureAtlas`, `TilemapData` and `Spritesheet` already hold `Ref<T>`.

### Proposed design

`bitmap: Ref<Bitmap>`. This is what the IR vocabulary already requires of anything with shared identity (`agents/rust/ir-vocabulary.md`), and it is the TypeScript semantics.

- `create_bitmap_region(bitmap: &Ref<Bitmap>, x, y, width, height)` shares; the caller keeps its bitmap. Through the FFI this is share, not consume.
- All locking lives in one crate-private access helper, not in 73 function bodies. For a destination and source pair:
  - different bitmaps → write lock on the destination, read lock on the source, taken in address order; zero copy;
  - same bitmap (`Arc::ptr_eq`) → one write lock; the source **rectangle** (not the whole bitmap) is copied to scratch.
- `is_same_region` becomes pointer equality plus rectangle equality.
- Overlap rules stay per operation, as TypeScript documents them.
- `BitmapDisplacementOptions.map` keeps holding a region.
- Tests add real aliasing: same bitmap disjoint, same bitmap identical rectangle, and the overlapping cases each operation documents.
- `flight-glyphatlas` returns to `create_bitmap_region` + `write_bitmap_pixels`, matching the TypeScript.

This moves a lock inside an operation, against the "caller locks once" guidance. The exception is deliberate and bounded to region operations, where the region — not the caller — holds the shared identity.

Alternatives considered: a plain rectangle with `(&mut Bitmap, rect)` arguments, and borrowed `BitmapRegion<'a>`. Both make the same-bitmap destination-and-source call impossible to write in safe Rust, change the emitted TypeScript shape, and (for lifetimes) cannot be stored or cross the ABI.

`agents/rust/manifests/flight-bitmap.api` is a frozen manifest; the owner approved this change on 2026-11-18.

## 4. Render path

### What blocks it

1. The render core is generic over the backend: `prepare_scene_2d_render<S>`, `register_node_renderer<S>`, `RenderProxies2D<S>`. The generator skips type generics.
2. The pass handle borrows the state: `begin_wgpu_render_pass<'a>(..) -> WgpuRenderPass<'a>`.
3. Renderers are `static` values (`WGPU_*_RENDERER`, `WGPU_SCENE2D_RENDER_PRESET`), not functions.
4. Device, surface and GL context wrap `Arc<dyn Any>` or closures; C cannot build them.

### Proposed design

- **Declared instantiations.** A table in the generator names the instantiations of the generic render core, `S ∈ { WgpuRenderState, GlRenderState }`, and emits one wrapper per entry with the backend in the name (`flight_prepare_wgpu_scene_2d_render`). Generic containers become one opaque carrier per instantiation. The table is explicit; nothing is inferred.
- **Renderer registration is a function.** Every renderer static must be registrable through a non-generic public `register_*` function in its own crate, which is what the TypeScript side already exposes. Where Rust only has the static, the function is added to the crate, not to the FFI.
- **Bracket handles.** `begin_*` / `end_*` pairs that return a borrowing value lower to an owned handle with the borrow erased. The contract — the state outlives the pass and is not otherwise used until `end_*` — is the caller's, stated in the header, and checked by a guard flag on the state. The pattern applies only to an allowlist of bracket pairs. This keeps the pass API one-to-one with the SDK, which multi-pass consumers (cached bitmaps, filter passes) need; a single "render scene to target" convenience wrapper would not serve them.
- **Devices and surfaces come from a host** (next section). C never constructs them.
- Then the six backend crates join `SCAN_CRATES`.

## 5. Hosts

### Model

**A native host is a Rust crate that produces capabilities. C consumes them by borrowed handle.** The host owns the platform; the SDK functions that take `&Host*Capability` become reachable because the host hands those out. No capability is constructed from C on the alpha path.

```
host = flight_create_winit_host(options)
loop_cap = flight_get_winit_host_app_loop_capability(host)   // borrowed
...
while flight_pump_winit_host(host):        // host delivers window + input events into the SDK
    flight_step_app_loop(app, dt, options) // the caller's frame, by name
    prepare / begin pass / render / end pass / submit / present
flight_destroy_winit_host(host)
```

- **`pump` is the primitive**: the consumer owns the loop and no callback crosses the ABI. This also serves a consumer that already has a loop of its own.
- **`run`** is offered as well — blocks, takes a per-frame `fn` + `ctx` — for platforms where the OS must own the loop or where pumping stalls during live resize.
- Both run on the thread that created the host. That is the ABI contract for windowing and for GL.

### Crates

- **`flight-host-winit`** — the reference host. Fills window, app-loop, lifecycle, screen, input-ingress and wgpu-acquisition capabilities. wgpu only; a GL context on winit needs a further dependency and is not in scope.
- **`flight-host-headless`** — instance → adapter → device, offscreen target, read-back; no window. Needed for G2 in CI, and replaces the per-crate copies of the test device bootstrap in `tests/support.rs`.
- **`flight-host-sdl`** — SDL3, built from source. Second host; the natural place for a caller-usable GL context later.

The archived v1port crates are **not a port source for structure**. They predate the capability model (backend traits, `set_*_backend` singletons, a directly-dispatched input manager); the SDL one never drew the scene and dropped keyboard modifiers. Reusable parts: the winit and SDL input translation tables and the surface bootstrap sequence. Everything else is written against the current capability structs.

### Packaging

- Host crates are workspace members excluded from `default-members`, so a plain `cargo build` needs neither winit nor SDL.
- `flight-ffi` gains features `host-winit`, `host-headless`, `host-sdl`. A feature adds that crate to the scan and links it. The default build has none.

### Capability constructors from C (Task S)

Deferred beyond the alpha. `agents/ffi-public-lane.md` already classes callback bridges as future work and stays as written. The dispatched spec also understated the job: capability structs carry a `provider` reference; 133 of 416 closure fields return futures; about 55 take a callback and return an unsubscribe closure; and the callback contract has no context release. When an external host (a Lime-backed one in flight-hx, an embedding engine) is wanted, it is designed against those facts.

## 6. Binding generator (flight-hx patches)

| Patch | Verdict                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0004  | **Adopt.** HashLink float-argument packing above six floats, HashLink target only. 23 functions affected today; recount after f64.                            |
| 0006  | **Adopt as §2a.**                                                                                                                                             |
| 0007  | **Bindgen only.** The FFI already returns owned byte handles with `_result_len/_get/_free`. Bindgen types them as `Dynamic` and emits no accessors; fix that. |
| 0008  | Already present.                                                                                                                                              |
| 0009  | **Replaced by §3.**                                                                                                                                           |
| 0010  | **Bindgen only.** The FFI already maps `Signal<()>`. Bindgen has no signal handling. Crate additions are Task T.                                              |
| 0011  | **Drop.** 4 of 270 free functions land outside their owner, at least 3 because the owner is unscanned. Re-check after Task T.                                 |
| 0012  | **Adopt as §2c**, without setter-side invalidation.                                                                                                           |
| 0013  | Stays in flight-hx (JavaScript target only).                                                                                                                  |
| 0014  | Stays in flight-hx (JavaScript target only).                                                                                                                  |

## Work items

Dependencies only; ordering and staffing are the foreman's.

| Item | Scope                                                                                    | Needs        | Proves |
| ---- | ---------------------------------------------------------------------------------------- | ------------ | ------ |
| A    | Reachability census + baseline + check; re-confirm the table at the top on a fresh build | —            | —      |
| B    | Node handle (§2a), handle borrowing (§2b), node fields (§2c)                             | A            | G1     |
| C    | Signal connect with context release (§2d)                                                | A            | G4     |
| D    | `BitmapRegion` shared ownership (§3)                                                     | —            | G5     |
| E    | Render instantiations, registration functions, bracket handles, backend crates in scan   | B            | —      |
| F    | `flight-host-headless` + FFI feature                                                     | E            | G2     |
| G    | `flight-host-winit` + FFI feature, `pump` and `run`                                      | E            | G3     |
| H    | Bindgen: node handle type, byte buffers, signals, HashLink float packing                 | B, C, T      | G6     |
| I    | `flight-host-sdl`                                                                        | G            | —      |

## Rulings

Decided by the owner on 2026-11-18:

1. **BitmapRegion** holds `Ref<Bitmap>`; the frozen `flight-bitmap` manifest changes accordingly (§3).
2. **Setters do not invalidate** (§2c). FFI field setters mirror the SDK; the caller names the invalidation.
3. **Bracket handles** (§4). Borrow-erased `begin`/`end` handles on an allowlist; no scoped convenience wrapper in their place.
4. **Both native renderers, GL and wgpu** (§5). _Revised 2026-11-20:_ the owner withdrew the earlier wgpu-first ruling. Rust supports GL and wgpu, TypeScript supports all four renderers, and "alpha" does not excuse leaving part of the SDK out. See [pass 4](ffi-usability/pass-4.md).
5. **Capability constructors from C are deferred** beyond the alpha (§5).
