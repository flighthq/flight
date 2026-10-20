# IR Vocabulary

Status: **DRAFT.** Rows marked *established* are already in use in user-approved code (flight-geometry) or have been ruled on. *Proposed* rows await a ruling. *Open* rows have no mechanical mapping yet.

## Purpose

Rust is the IR, and TS, C++ and Haxe are produced from it by **mechanical transpilation**: one fixed mapping per construct, no case-by-case translation. That only works if the contract (pub signatures, pub fields, pub aliases and constants) is restricted to a closed vocabulary. This table is that vocabulary.

The table is generated from `crates/cargo-flight-lint/src/vocabulary.rs` (`cargo run -p cargo-flight-lint -- vocabulary`), and the `contract-vocabulary` lint rule checks the contract against the same source. To change the vocabulary, change that file and regenerate this table. The doc and the lint cannot drift apart.

`contract-vocabulary` is currently **warn**. When this table is approved it becomes **error**. At introduction (2026-10-20) it reports 87 items, all baselined. flight-geometry reports 0, which confirms the table against the crate the user approved. The flagged items are mostly `dyn Trait` (43), `Rc`/`Box`/`RefCell` (25/22/9), 64-bit integers (24) and tuples (5).

## Table

| Rust | TS | C++ | Haxe | Status | Notes |
|------|----|-----|------|--------|-------|
| `f32` | `number` | `float` | `Single` | established | Default numeric type (D1) |
| `f64` | `number` | `double` | `Float` | established | Only with `allow(f64) <reason>` (D1) |
| `bool` | `boolean` | `bool` | `Bool` | established |  |
| `i8 i16 i32 u8 u16 u32 usize` | `number` | `int8_t … uint32_t, size_t` | `Int / UInt` | established | `usize` for indices; `i32` where TS uses a -1 sentinel |
| `i64 u64` | `number` | `int64_t / uint64_t` | `haxe.Int64` | open | TS `number` is exact only to 2^53; needs `bigint` or a range rule |
| `()` | `void` | `void` | `Void` | established | Return type only |
| `String` | `string` | `std::string` | `String` | proposed | Owned text |
| `&str` | `string` | `std::string_view` | `String` | proposed | Borrowed text; `&'static str` for constants |
| `Kind` | `Kind (= string)` | `std::string` | `String` | proposed | Alias for `String`; object identity tag (D2) |
| `struct (named fields)` | `interface + create_* fn` | `struct` | `class` | established | Value type when held inline: assignment is a copy in every target |
| `&T` | `Readonly<T>` | `const T&` | `T` | established | Parameters |
| `&mut T` | `T` | `T&` | `T` | established | Parameters; `out` first, alias-safe |
| `Option<T>` | `T | null` | `std::optional<T> (pointer for Ref)` | `Null<T>` | established |  |
| `Vec<T>` | `T[]` | `std::vector<T>` | `Array<T>` | established | Growable (user 2026-10-20): `Vec<f32>` → `number[]`. Also the type for iterated collections (D3) |
| `&mut [N] / [N; LEN] (N numeric)` | `Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array` | `std::span<N> / std::array<N, LEN>` | `haxe.io.Float32Array etc.` | established | Fixed length (user 2026-10-20): the typed array is picked by element type. `usize`/`bool` slices have no typed array (open) |
| `&[N] (N numeric, read-only)` | `Readonly<Float32Array> or ArrayLike<number>` | `std::span<const N>` | `haxe.io.Float32Array etc.` | open | Read-only input: the typed array (consistent with &mut) vs ArrayLike (accepts both) |
| `&[T] / &mut [T] / [T; LEN] (T non-numeric)` | `readonly T[] / T[]` | `std::span<const T> / std::span<T> / std::array` | `Array<T>` | proposed | No typed array exists for structs or strings |
| `HashMap<K, V>` | `Map<K, V>` | `std::unordered_map<K, V>` | `Map<K, V>` | established | Lookup only; never iterated (D3) |
| `HashSet<T>` | `Set<T>` | `std::unordered_set<T>` | `Map<T, Bool>` | proposed | Membership only; never iterated (D3) |
| `C-like enum` | `string-literal union / const` | `enum class` | `enum abstract` | open | TS literal values vary ('Sprite', 'aabb', 'linear'); needs a declared string table |
| `data enum (one named struct per variant)` | `discriminated union` | `std::variant<…>` | `enum` | proposed | Closed sets only; open sets use Kind + dispatch tables (D2) |
| `EntitySlot` | `unknown (read via get_*_data cast)` | `std::any` | `Dynamic` | proposed | Alias for `Option<Box<dyn Any + Send + Sync>>`; the only erased type (D2) |
| `fn(A) -> R` | `(a: A) => R` | `R (*)(A)` | `A->R` | proposed | Stateless function values (e.g. easing) |
| `Callback<A, R>` | `(a: A) => R` | `std::function<R(A)>` | `A->R` | proposed | Alias for `Arc<dyn Fn(A) -> R + Send + Sync>`; function values that capture (renderer objects, slots, test spies) |
| `Ref<T>` | `T` | `std::shared_ptr<T>` | `T` | established | Shared object identity (A2, trial 2026-10-20): create_* returns it, dispose_* breaks cycles, memory frees at the last drop. Backing (Rc<RefCell> vs Arc<RwLock>) open |
| `WeakRef<T>` | `T | null` | `std::weak_ptr<T>` | `Null<T>` | proposed | Not for parent links: under A2 parents are strong, as in TS. Only for non-owning caches |
| `Handle<T>` | `T (object) or number` | `handle / T*` | `T` | open | Deferred: node-store option (D), revisit only if threading or bulk release requires it |
| `generic type parameter <T>` | `<T>` | `template<typename T>` | `<T>` | proposed |  |
| `pub const / pub static LazyLock<T>` | `export const` | `inline constexpr / static` | `static final` | proposed | Immutable only (D5) |

Workspace-defined structs, enums and aliases are allowed by name. Each one is itself checked where it is defined.

## Open rows

1. **Object identity.** Decided as A2, on trial (see below). Still open: whether `Ref<T>` is backed by `Rc<RefCell<T>>` or `Arc<RwLock<T>>`.
2. **Arrays. Decided (user, 2026-10-20):** `Vec<N>` (growable) → `number[]`; fixed-length `&mut [N]`/`[N; LEN]` → a typed array chosen by element type. Using these two Rust types thoughtfully is what carries the distinction. Survey of the 190 exported TS functions using `number[]`:
   - about 113 read-only input params;
   - 26 small fixed-slot outputs;
   - 26 caller-sized outputs;
   - 44 returns;
   - **10 outputs that grow** (which must stay `Vec`);
   - plus 178 type fields.

   Still open:
   - Read-only `&[N]`: `Readonly<Float32Array>` (consistent) or `ArrayLike<number>` (accepts both).
   - `usize`/`bool` slices, which have no typed array.
3. **Enums.** The user is open to `enum { A, B, C, Custom(String) }` for performance, or to strings if they perform as well. TS string-literal values vary (`'Sprite'`, `'aabb'`, `'linear'`), so any Rust enum needs a declared string table for the TS mapping. Proposal:
   - **Closed** TS unions become C-like enums with a string table.
   - **Open** sets keyed for dispatch (`Kind`) stay `String`. The TS render path already caches the resolved renderer on the proxy (`rendererMapId`), so per-frame dispatch does not hash the kind.
   - `Custom(String)` enums only where hot code branches on the built-in variants.
4. **Integers.** TS `number` is a 64-bit double, so integers are exact only up to 2^53, not to 32 bits. 32-bit behavior only appears where code asks for it: the TS sources use `>>> 0` (u32 wrap, 207 sites) and `| 0` (i32, 117 sites), and `BigInt` appears only in tests. Proposal:
   - `u32`/`i32` map to those idioms.
   - Values that legitimately exceed 32 bits, such as collision's packed feature ids (`FEATURE_INDEX_LIMIT = 1 << 25`), use `i64`/`u64` with a declared range of at most 2^53 (`allow(contract-vocabulary) <range>`).
   - `isize` is not used.

## Object identity: decision (A2, trial, user 2026-10-20)

One uniform rule for every `create_*`:
- **Value types** (geometry, colors, options) are owned values.
- **Anything with shared identity** (nodes, textures, materials, managers) is a `Ref<T>`.
  - `create_*` returns it.
  - `dispose_*` does what TS does today: detach, dispose children, clear signals. That breaks every cycle, including listener closures that capture the object.
  - Memory is freed when the last reference drops.
  - A disposed object that something still holds stays valid but inert, as in TS today, where tests read getters after `disposeNode`.
- **Parent links are strong**, as in TS, so `getNodeParent` behaves identically.
- **The user's responsibility** is to call dispose on trees they are done with. If they forget, the parent/child cycle leaks, where TS GC would collect it. The user is never responsible for proving that nothing else holds the object.
- **No API change** in any target. The node store (D) is deferred.

Why this one: nodes and clocks are the only structural two-way graphs in TS. A store for nodes alone would add a second lifetime model, which goes against Flight's clarity tenet. Reference-count cost applies only when a reference is *stored*; ordinary calls borrow `&Ref<T>`.

## Object identity: options considered

TS today follows the Flash model: nodes and textures are shared object references, and the GC manages memory. The TS API already has one counter-example: `RenderState` owns its memory (renderer data, registries), and callers pass it explicitly. A scene could follow the same idea.

**(A) Shared references: `Ref<T>`, with `WeakRef<T>` for parents.**
- The TS API is unchanged. The Flash-style object graph stays.
- Rust: mutating through a shared reference needs interior mutability (`Rc<RefCell>` or `Arc<RwLock>`). Re-entrant mutation, such as a signal handler editing a node during the render walk, panics where TS would work.
- C++: `shared_ptr` costs, plus cycles must be broken with `weak_ptr`.
- Threads: the choice is single-threaded `Rc`, or a lock on every node access.

**(B) Scene-owned storage with handles in every target.** This follows the `RenderState` pattern.
- API shape: `create_sprite(scene) -> NodeId`, `add_node_child(scene, parent, child)`, `destroy_node(scene, node)`, `get_sprite_data(scene, node)`.
- Mechanical in every target, since a handle is just a number.
- Memory is managed explicitly: destroy frees immediately, and destroying the scene frees everything. No cycles, no borrow panics.
- A `Scene` is one ownable value, so it is `Send`, and the thread story is "move or lock the scene".
- Renderer data could be keyed by `NodeId` instead of identity maps.
- Costs:
  - **An API change in Rust and in every target.** TS users lose the Flash-style object graph.
  - Use-after-destroy becomes a stale-handle check (generational ids) instead of a dangling reference.
  - Most calls gain a `scene` parameter.

**(C) Hybrid: `Handle<T>` in the IR, mapped to an object in TS.**
- Rust and C++ use scene-owned storage. The TS mapping turns `Handle<T>` into `T` and `get_node(scene, h)` into `h`.
- TS keeps object references but still gains the `scene` parameter.
- Mechanical, but **the semantics differ per target**. For example, use-after-destroy works in TS and fails in Rust. That is the kind of divergence mechanical transpilation is meant to prevent.

User answers (2026-10-20):
- A node exists in at most one scene.
- In the Flash model, the scene comes into being as you stack nodes together; there is no scene object up front.
- Memory is reclaimed by GC once nothing references it.

Principal's reading: these answers fit (A) and rule out (B), because B needs a scene to exist before any node can be created. They also leave one wrinkle for (A). GC collects cycles, but reference counting (Rust `Rc`/`Arc`, C++ `shared_ptr`) does not. If parent and child hold each other strongly, both leak. If the parent link is weak, holding only a child no longer keeps its parent alive: the detached parent is freed and `child.parent` becomes null. In Flash, a child keeps its parent alive. Options:
- **(A1)** Accept a weak parent link and document the difference.
- **(A2)** Keep the parent link strong and require explicit `remove_child`/`dispose` to break the cycle.
- **(A3)** Use a cycle-collecting reference type. This would be bespoke in Rust and C++.

**(D) Node store outside the hierarchy.** Raised after outside review (2026-10-20). The user agrees with the concept; it is not yet decided.
- A store exists outside any hierarchy, the way `RenderState` exists outside the render functions.
- Nodes are created in the store. A tree is just parent/child links between nodes, and a scene root is one more node. The scene therefore still comes into being as nodes are stacked, which answers the objection to (B).
- Rust/C++: the store owns the storage, and nodes are `Handle<T>` (generational ids).
- TS: the node is the object itself, so the single transpiler rule is that `Handle<T>` becomes `T`.
- `destroy_node(store, node)` has the same observable rule in every target: afterwards the node is invalid, and checks fail. Only *when memory is reclaimed* differs, and that is not observable: Rust/C++ hold it until the store is destroyed, while TS GC can collect earlier.
- Advantages: no refcount cycles (including listener closures that capture their node, which a weak parent link cannot prevent), the store is `Send`, and there are no borrow panics.
- Cost: a store parameter on structural calls, and explicit `destroy` instead of "GC collects it". This is an API change in every target.

### TS lifetime semantics (research, 2026-10-20)

File references are relative to `flight/packages`.

- **Creation takes no state.** `createNode(kind, obj?, createData?, runtimeFactory?)` (`node/src/node.ts:21`), `createSprite(obj?)`, and `createScene2D` (which builds its own root).
- **Parent and child links are strong in both directions** (`runtime.parent`, `runtime.children`).
  - `addNodeChild` removes a node from its old parent first.
  - It throws on adding a node to itself, on adding an ancestor (a cycle), on an out-of-range index, and when `canAddChild` refuses.
- **Removed nodes stay fully usable**, and tests rely on that: `render/src/renderProxy.test.ts:380` re-adds a removed child and expects its warm proxy to be reused, and `node/src/hierarchy.test.ts:91` moves a child between parents.
- **`disposeNode` is the only node teardown** (`node/src/node.ts:91`).
  - It detaches the node, recursively disposes its children, and clears and nulls `NodeSignals`.
  - It has no disposed flag. Tests read getters after dispose (`node/src/node.test.ts:142-188`).
  - It does not touch render proxies, tweens, interaction, or focus.
- **Strong outside holders with no invalidation:** `RenderState.renderProxySources` (a strong `Set`; the comment reads "WeakMap alone cannot support deterministic shutdown"), the InteractionManager targets and captures, `FocusManager.focused`, tween targets, animation targets, and `NodeOrderList`. Each is cleared only by an explicit dispose.
- **No `WeakRef` or `FinalizationRegistry` anywhere.** WeakMaps are used only as caches.

What this means:
- **(A1)** A weak parent link *changes observable behavior*. `getNodeParent` would return null when only a child is held.
- **(A2)** A strong parent link keeps TS behavior exactly. Memory is released by `disposeNode`, which TS already has, or never, if a tree is dropped without dispose. Listener cycles are broken by the same `disposeNode`, because it clears `NodeSignals`. It requires no API change. The costs are interior mutability (borrow panics on re-entrancy) and a choice between single-threaded `Rc` and `Arc` plus locks.
- **(D)** The node store changes every `create_*` signature and `add`/`remove`.
  - Post-dispose reads keep working only if dispose clears the node and keeps its slot, with a separate `destroy` to free it.
  - It adds deterministic bulk release (destroy the store), stale-holder detection, and a `Send` store.
  - TS already follows this "external state plus explicit dispose" pattern in `RenderState`.
