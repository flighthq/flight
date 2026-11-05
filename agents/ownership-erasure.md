# Ownership Erasure

_2026-11-05. Architecture record — the compiler's SharedRef model for lowering Rust ownership types to TS._

**Status: RATIFIED 2026-11-05 by the principal.** Read before adding `Arc<RwLock<T>>`, `Rc<T>`, `RefCell<T>`, or `Box<T>` to a Rust crate that generates TS, or before working on the compiler's ownership lowering.

## The problem

Rust uses `Arc<RwLock<T>>` for shared mutable access to entities. TS uses plain references — assignment copies a reference, and all references are mutable. The generation pass skipped 8 packages (animation, audio, signals, node, clip, log, host, storage) primarily because the compiler cannot yet erase these ownership wrappers.

The access patterns that need lowering:

```rust
// reading through a shared reference
let duration = player.clip.read().unwrap().duration;

// cloning a shared reference (copies the Arc, not the data)
out.track = track.clone();

// constructing a shared reference
out.clip = Arc::new(RwLock::new(clip));

// identity comparison
Arc::ptr_eq(&a, &b)
```

In TS, all four are trivial: `player.clip.duration`, `out.track = track`, `out.clip = clip`, `a === b`.

## SharedRef<T> — the wrapper type

`SharedRef<T>` is a Rust wrapper around `Arc<RwLock<T>>` that the compiler recognizes and erases per-target. It preserves Rust ownership semantics (the borrow checker still enforces correct access) while marking the intent: "this is a shared reference that erases to a plain reference in GC'd targets."

The compiler erases the full access chain:

| Rust | TS |
|---|---|
| `SharedRef<T>` (type position) | `T` |
| `x.read().unwrap().field` | `x.field` |
| `x.write().unwrap().field = v` | `x.field = v` |
| `SharedRef::new(v)` / `Arc::new(RwLock::new(v))` | `v` |
| `x.clone()` (on SharedRef) | `x` (reference copy) |
| `SharedRef::ptr_eq(&a, &b)` / `Arc::ptr_eq(&a, &b)` | `a === b` |

Type aliases (`AnimationPlayerRef = SharedRef<AnimationPlayer>`) erase to `AnimationPlayer` in TS.

## The erasure family

SharedRef is the most common case, but the same principle applies to the full Rust ownership wrapper family:

| Rust wrapper | Purpose | TS lowering |
|---|---|---|
| `SharedRef<T>` / `Arc<RwLock<T>>` | shared mutable access across threads | plain `T` |
| `Rc<T>` | shared immutable access, single-thread | plain `T` |
| `RefCell<T>` | interior mutability, single-thread | plain `T` |
| `Box<T>` | heap allocation with unique ownership | plain `T` |
| `.read().unwrap()` / `.borrow()` | guard acquisition | removed |
| `.write().unwrap()` / `.borrow_mut()` | mutable guard acquisition | removed |

In GC'd targets, all of these erase: the GC handles lifetime, the runtime handles mutability, and there is no threading model that requires synchronization. The Rust wrappers exist for the borrow checker and the allocator, both of which are compile-time concerns in Rust and non-concerns in TS/JS.

## What this unlocks

With ownership erasure, the following packages move from target-native (hand-written on both sides) to generated:

- **animation** — `Ref<T>` used for `AnimationClip`, `AnimationTrack`, player/blend-tree/state-machine references
- **audio** — `Ref<AudioResource>`, `Arc<RwLock<>>` on device state
- **node** — runtime tiers use interior mutability
- **clip** — depends on node

The compiler feature is part of the separate compiler refactor; this record captures the design, not the implementation timeline.

## Design constraints

- The erasure is per-target: Rust keeps full ownership semantics. A C/C++ target would lower differently (e.g., `std::shared_ptr<T>`).
- `SharedRef<T>` is the canonical marker. Existing `Arc<RwLock<T>>` patterns should migrate to `SharedRef<T>` for clarity, but the compiler should recognize both.
- Guard chains (`.read().unwrap()`, `.write().unwrap()`) must be erased completely, not partially — erasing `Arc` but leaving `.read().unwrap()` produces nonsense.
- The compiler proves the pattern structurally (method chain shape), not semantically (what the lock protects). This is safe because the erasure target (TS) has no concept of the lock.
