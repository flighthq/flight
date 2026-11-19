# Item B: One node handle, handle borrowing, node fields

Design: `agents/ffi-usability.md` sections 2a, 2b, 2c. Read them first. This is the upstream form of flight-hx patches 0006 and 0012; do not apply those patches.

## Goal

A C consumer can build, mutate, query and free a scene graph soundly. Proves scenario G1.

## The defects

- **Unsound hierarchy.** Concrete node producers return `Box<Ref<T>>` (thin). Hierarchy and render-prepare functions cast their `void*` to `*const Ref<dyn Node>` or `Ref<dyn Node2D>` (fat). `as_node_ref<T>` is generic and skipped, so nothing converts. No test calls a hierarchy function through the ABI.
- **Unreachable fields.** `generate_field_accessors` (`build.rs` near line 1870) emits accessors against `*mut Node2DFields`, which no function produces, and takes no lock. Non-scalar fields (`blend_mode: Option<BlendMode>`, `name: Option<String>`) get nothing.
- **Unreachable `&T` APIs.** Functions over `&T` / `&mut T` lower to raw struct pointers even when `T` only exists inside a `Ref<T>`.

## What to build

### B1. Node handle

One carrier for every node crossing the ABI, typed in the header as `FlightNode*` (not `void*`):

```rust
struct FfiNodeHandle {
    node: Ref<dyn Node>,
    node2d: Option<Ref<dyn Node2D>>,
    node3d: Option<Ref<dyn Node3D>>,
    concrete: Option<Box<dyn Any + Send + Sync>>, // the original Ref<T> when the producer knew T
}
```

- **Producers.** Every function returning `Ref<T>` where `T: Node`, and every function returning `NodeRef` / `Node2DRef` / `Node3DRef` (including `Option<..>` and collections of them), returns this handle. Views are filled at the producer by unsizing the `Arc`. For abstract returns, fill `node2d` / `node3d` with the SDK's own `as_node2d_ref` / `as_node3d_ref`; `concrete` is `None`.
- **Consumers.** A `NodeRef` parameter reads `node`; `Node2DRef` reads `node2d`; `Node3DRef` reads `node3d`; `&Ref<T>` downcasts `concrete`. A missing view or failed downcast is API misuse: return the function's sentinel (null, false, -1, or no-op for void) and do not panic across the ABI.
- **Slices of nodes** (`&[NodeRef]`, as in `add_node_children`) take an array of `FlightNode*`.
- **Free.** One `flight_free_node`. It drops the handle; the node lives while the graph or another handle references it. Remove the per-type `flight_free_<type>_ref` functions for node kinds and `flight_free_node_ref` / `flight_free_node2_d_ref`.
- **Identity.** Add `flight_node_equals(a, b)` comparing the underlying allocation, since two handles to one node are distinct pointers.
- **No process-global state.** No registry, no static table.
- Decide how the generator learns "`T` is a node kind" from data it already parses (trait impls or the kind tables); do not hand-maintain a type list if it can be derived. If it cannot, a literal list with a test that fails on a missing node type is acceptable.

### B2. Borrowing through a handle

Classify each struct type by how the surface produces it, using Item A's carrier graph:

- **Ref-only** (only ever produced inside `Ref<T>`): `&T` and `&mut T` parameters take the handle. The wrapper locks for the call — read for `&T`, write for `&mut T` — and recovers from poisoning the way the existing `_ref` buffer accessors do. If one call borrows the same handle both ways, take the write lock once and do not deadlock.
- **Owned-only**: raw pointer, unchanged.
- **Both** (`Bitmap` is one): do not design this here. Report the list of such types and the number of functions affected in `agents/ffi-usability-reports.md`. Leave their lowering unchanged.

For node kinds, the handle is the `FlightNode*` from B1.

### B3. Node fields

Generate accessors against the node handle, through the SDK's own field views (`node2d_fields()`, `node2d_fields_mut()`, `appearance()`, `appearance_mut()`, and the `NodeFields` equivalents), under the lock.

- Names follow the node type, not the fields struct: `flight_get_node2d_alpha`, `flight_set_node2d_x`, `flight_get_node_name`. Fix the `node2_dfields` mangling by not exposing the fields struct at all.
- Cover every public field of `NodeFields`, `Node2DFields` and the 3D equivalent, including enums (`blend_mode` as the enum's integer with a presence flag for `Option`) and strings (`name`: read as an owned copy, write from UTF-8 bytes, null clears).
- Remove the raw `*mut Node2DFields` accessors.
- **Setters do not invalidate.** They assign and return. Confirm `invalidate_node_appearance` and the other `invalidate_*` verbs are themselves reachable with a node handle; a consumer composes the two calls. Do not add revision bumps to setters.
- Field types are whatever the crate declares at the time. Alpha is `f32` and stays `f32`. Transform fields are `f32` until `flight-scene2d` migrates under Task Q; do not pre-empt that.

## Tests

- Rust unit tests for handle production, each view, wrong-kind sentinel, and equality.
- Extend the strict-C consumer with scenario **G1**: create a container, sprite, shape, bitmap node and text node; add, add-at, swap, remove; get parent and root and compare with `flight_node_equals`; set and read x, y, rotation, scale, alpha, visible, blend mode, name; call the appearance invalidation; free every handle, including freeing a parent handle before its child handle and using the child afterwards.
- Run the C consumer under an address sanitizer in the test (or document exactly why the toolchain here cannot, and run it once manually with the output in the review).
- A negative test: pass a non-2D node to a `Node2DRef` parameter and assert the sentinel.

## Not in scope

- Bindgen changes (Item H).
- Signals (Item C), render (Item E).
- The dual-produced type lowering (reported, not built).

## Acceptance

- G1 passes under the sanitizer.
- Item A's baseline no longer lists any function blocked by a node carrier or by `Node2DFields`; the review states the before and after counts.
- No `void*` node parameters remain in the header for node kinds.
- Census pins are updated deliberately, with the delta explained (removed frees, added accessors).
- `cargo fmt`, lint, existing FFI tests pass.

## Dependencies

Item A. Coordinate with the f64 Task Q owner if both touch `flight-scene2d` field types in the same window.
