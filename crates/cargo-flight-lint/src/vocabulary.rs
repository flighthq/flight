//! The IR vocabulary: the closed set of Rust constructs the contract may use, each with exactly
//! one mapping per transpile target. This table is the single source for both the
//! `contract-vocabulary` rule and `cargo flight-lint vocabulary` (agents/rust/ir-vocabulary.md).

use std::collections::HashSet;

use syn::{GenericArgument, PathArguments, ReturnType, TraitBoundModifier, Type, TypeParamBound};

#[derive(Clone, Copy, PartialEq)]
pub enum Status {
    /// In use in user-approved code (flight-geometry) or ruled on.
    Established,
    /// Proposed; awaiting a ruling.
    Proposed,
    /// Known gap; the mapping is not mechanical yet.
    Open,
}

pub struct Entry {
    pub rust: &'static str,
    pub ts: &'static str,
    pub cpp: &'static str,
    pub haxe: &'static str,
    pub status: Status,
    pub note: &'static str,
}

pub const ENTRIES: &[Entry] = &[
    Entry { rust: "f32", ts: "number", cpp: "float", haxe: "Single", status: Status::Established, note: "Default numeric type (D1)" },
    Entry { rust: "f64", ts: "number", cpp: "double", haxe: "Float", status: Status::Established, note: "Only with `allow(f64) <reason>` (D1)" },
    Entry { rust: "bool", ts: "boolean", cpp: "bool", haxe: "Bool", status: Status::Established, note: "" },
    Entry { rust: "i8 i16 i32 u8 u16 u32 usize", ts: "number", cpp: "int8_t … uint32_t, size_t", haxe: "Int / UInt", status: Status::Established, note: "`usize` for indices; `i32` where TS uses a -1 sentinel" },
    Entry { rust: "i64 u64", ts: "number", cpp: "int64_t / uint64_t", haxe: "haxe.Int64", status: Status::Established, note: "Only with a declared range ≤ 2^53 (allow marker); 32-bit is the default (user 2026-10-21)" },
    Entry { rust: "()", ts: "void", cpp: "void", haxe: "Void", status: Status::Established, note: "Return type only" },
    Entry { rust: "String", ts: "string", cpp: "std::string", haxe: "String", status: Status::Established, note: "Owned text" },
    Entry { rust: "&str", ts: "string", cpp: "std::string_view", haxe: "String", status: Status::Established, note: "Borrowed text; `&'static str` for constants" },
    Entry { rust: "Kind", ts: "Kind (= string)", cpp: "std::string", haxe: "String", status: Status::Established, note: "Alias for `String`, defined in flight-entity; object identity tag (D2)" },
    Entry { rust: "struct (named fields)", ts: "interface + create_* fn", cpp: "struct", haxe: "class", status: Status::Established, note: "Value type when held inline: assignment is a copy in every target" },
    Entry { rust: "&T", ts: "Readonly<T>", cpp: "const T&", haxe: "T", status: Status::Established, note: "Parameters" },
    Entry { rust: "&mut T", ts: "T", cpp: "T&", haxe: "T", status: Status::Established, note: "Parameters; `out` first, alias-safe" },
    Entry { rust: "Option<T>", ts: "T | null", cpp: "std::optional<T> (pointer for Ref)", haxe: "Null<T>", status: Status::Established, note: "" },
    Entry { rust: "Vec<T>", ts: "T[]", cpp: "std::vector<T>", haxe: "Array<T>", status: Status::Established, note: "Growable (user 2026-10-20): `Vec<f32>` → `number[]`. Also the type for iterated collections (D3)" },
    Entry { rust: "Vec<T> (nonempty at consuming API boundary)", ts: "readonly [T, ...T[]]", cpp: "std::vector<T>", haxe: "Array<T>", status: Status::Established, note: "Validate nonemptiness at the consuming API boundary; no distinct Rust wrapper type" },
    Entry { rust: "&mut [N] / [N; LEN] (N numeric)", ts: "Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array", cpp: "std::span<N> / std::array<N, LEN>", haxe: "haxe.io.Float32Array etc.", status: Status::Established, note: "Fixed length (user 2026-10-20): the typed array is picked by element type. `usize`/`bool` slices have no typed array (open)" },
    Entry { rust: "Box<[N]> (N numeric)", ts: "the matching typed array", cpp: "std::unique_ptr<N[]> + length", haxe: "haxe.io.Float32Array etc.", status: Status::Established, note: "Owned, fixed length set at creation (vertex data, pixels, index buffers); user 2026-10-20" },
    Entry { rust: "Box<[T]> (T non-numeric)", ts: "readonly T[] with fixed creation-time length", cpp: "std::vector<T> with fixed creation-time length", haxe: "Array<T>", status: Status::Established, note: "Principal batch 10 AudioBuffer channel table: Box<[Ref<Box<[f32]>>]> owns a fixed set of shared mutable Float32Array channel handles; this row does not turn ordinary TS arrays into typed arrays" },
    Entry { rust: "&Vec<N> (read-only)", ts: "readonly number[]", cpp: "const std::vector<N>&", haxe: "Array<N>", status: Status::Established, note: "Input that must be a plain array (user 2026-10-20: specific over permissive). Workspace allows clippy::ptr_arg" },
    Entry { rust: "Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array (aliases of [f32] etc., defined in flight-entity)", ts: "the same typed array", cpp: "std::span<N>", haxe: "haxe.io.Float32Array etc.", status: Status::Established, note: "For a TS API that declares a typed array: `&Float32Array` → `Readonly<Float32Array>` while Rust still accepts any f32 slice; `&mut Float32Array` / `Box<Float32Array>` also allowed. Specific in TS, idiomatic in Rust" },
    Entry { rust: "&[N] (N numeric, read-only)", ts: "ArrayLike<number>", cpp: "std::span<const N>", haxe: "haxe.io.Float32Array etc.", status: Status::Established, note: "Input that is deliberately general: accepts either array kind (user 2026-10-20). Use it only when general is intended; prefer the specific forms" },
    Entry { rust: "&[T] / &mut [T] / [T; LEN] (T non-numeric)", ts: "readonly T[] / T[]", cpp: "std::span<const T> / std::span<T> / std::array", haxe: "Array<T>", status: Status::Established, note: "No typed array exists for structs or strings" },
    Entry { rust: "HashMap<K, V>", ts: "Map<K, V>", cpp: "std::unordered_map<K, V>", haxe: "Map<K, V>", status: Status::Established, note: "Lookup only; never iterated (D3)" },
    Entry { rust: "HashSet<T>", ts: "Set<T>", cpp: "std::unordered_set<T>", haxe: "Map<T, Bool>", status: Status::Established, note: "Membership only; never iterated (D3)" },
    Entry { rust: "Record<V>", ts: "Record<string, V>", cpp: "ordered string map<V>", haxe: "Dynamic<V>", status: Status::Established, note: "Plain dictionary defined in flight-entity; ordered Vec storage plus lookup index; integer-index keys enumerate numerically, then other strings in insertion order. Ordered iteration is allowed (D3)" },
    Entry { rust: "C-like enum", ts: "string-literal union / const", cpp: "enum class", haxe: "enum abstract", status: Status::Established, note: "String table via get_<enum>_string / parse_<enum> free functions; strings exactly as TS (D9e)" },
    Entry { rust: "data enum (one named struct payload per variant)", ts: "untagged union of interfaces; discriminated only by existing literal kind fields", cpp: "std::variant<…>", haxe: "enum", status: Status::Established, note: "Never synthesize a discriminant. Closed sets only; open sets use Kind + dispatch tables (D2)" },
    Entry { rust: "AnySlot", ts: "unknown (read via get_*_data cast)", cpp: "std::any", haxe: "Dynamic", status: Status::Established, note: "Alias for `Option<Box<dyn Any + Send + Sync>>`, defined in flight-entity; owned and non-clone" },
    Entry { rust: "Unknown", ts: "unknown", cpp: "nullable std::shared_ptr<const std::any>", haxe: "Dynamic", status: Status::Established, note: "Alias for `Option<Arc<dyn Any + Send + Sync>>`, defined in flight-entity. None is explicit null and Some preserves identity; Option<Unknown> distinguishes absent/undefined from null" },
    Entry { rust: "UnknownValue", ts: "unknown", cpp: "std::shared_ptr<const std::any>", haxe: "Dynamic", status: Status::Established, note: "Alias for `Arc<dyn Any + Send + Sync>`, defined in flight-entity: the non-null payload of Unknown, for positions that are never null (e.g. LogValue::Object)" },
    Entry { rust: "unknown_from_panic / CaughtPanic", ts: "caught unknown value", cpp: "caught exception payload in shared std::any", haxe: "Dynamic", status: Status::Established, note: "D10 catch bridge in flight-entity. The exact Rust-only input is Box<dyn Any + Send>. FlightError remains the concrete Unknown value; every other payload is retained losslessly in a mutex-backed CaughtPanic so Send-only values remain safely downcastable under a borrowed guard" },
    Entry { rust: "unknown_to_js_string", ts: "`String(value)` for a caught unknown", cpp: "exact ruled Unknown-to-string projection", haxe: "exact ruled Unknown-to-string projection", status: Status::Established, note: "flight-entity projection for FlightError Error.toString (including the NotReadableError DOMException name), strings, concrete JS numbers, booleans and null; every other object is `[object Object]`. An outer Option<Unknown> models omitted undefined at the caller. Custom user stringification is deliberately not modeled, and no Debug/Display fallback is used" },
    Entry { rust: "ProviderRef", ts: "field omitted; containing capability record is the provider object", cpp: "std::shared_ptr<const std::any>", haxe: "Dynamic", status: Status::Established, note: "Alias for `Arc<dyn Any + Send + Sync>`, defined in flight-host (the bottom host vocabulary, D26). Every capability record carries `provider: ProviderRef`; facets from one provider clone the same token. Compare providers with `Arc::ptr_eq`, never callbacks. Rust provider identity `Arc::ptr_eq(&cap_a.provider, &cap_b.provider)` lowers to TS `capA === capB`. Plain identity, not Entity or a numeric id" },
    Entry { rust: "HostSpawnCapability", ts: "field omitted; `spawn(fut)` lowers to `void fut`", cpp: "host-owned executor callback", haxe: "host-owned Future executor", status: Status::Established, note: "Fire-and-forget async foundation in flight-host. The explicit Rust capability carries canonical ProviderRef identity and accepts Pin<Box<dyn Future<Output=()> + Send>>; the SDK never chooses an executor or blocks" },
    Entry { rust: "HostTimerCapability", ts: "host object implementing `setTimeout`, `setInterval`, and `Date.now`", cpp: "host timer capability record", haxe: "host timer capability record", status: Status::Established, note: "Explicit flight-host context with canonical ProviderRef identity. Providers enqueue callbacks (never inline), normalize negative/NaN timeout delays to 0 ms, and clamp interval delays to at least 1 ms. No SDK runtime or native timer is selected" },
    Entry { rust: "TimerHandle", ts: "owned closure calling `clearTimeout` or `clearInterval`", cpp: "owned cancellation callback", haxe: "owned cancellation callback", status: Status::Established, note: "Timer cancellation handle with an Arc callback and no public provider-specific numeric timer id" },
    Entry { rust: "ArrayBuffer", ts: "ArrayBuffer", cpp: "small shared byte buffer", haxe: "haxe.io.Bytes", status: Status::Established, note: "Named flight-buffer struct wrapping Ref<Box<[u8]>>: fixed-length shared storage; Clone and equality preserve allocation identity rather than copying or flattening through Vec" },
    Entry { rust: "ArrayBufferView", ts: "ArrayBufferView", cpp: "small shared byte view", haxe: "haxe.io.Bytes", status: Status::Established, note: "Named flight-buffer record carrying ArrayBuffer, byte_offset, byte_length and exact ArrayBufferViewKind; every view aliases the same shared storage" },
    Entry { rust: "Blob", ts: "Blob", cpp: "small shared blob", haxe: "Dynamic", status: Status::Established, note: "Immutable Arc<Blob> record in flight-buffer with mime_type, size, canonical Unknown provider payload, and an optional retained arrayBuffer reader. No other Blob I/O API is implied" },
    Entry { rust: "BlobArrayBufferReader", ts: "optional retained `() => Promise<ArrayBuffer>`", cpp: "optional shared async read callback", haxe: "optional Void->Future<ArrayBuffer>", status: Status::Established, note: "Exact flight-buffer alias for Arc<dyn Fn() -> Pin<Box<dyn Future<Output=Result<ArrayBuffer, Unknown>> + Send>> + Send + Sync>; preserves fulfillment allocation and rejection identity/null without type erasure" },
    Entry { rust: "Result<T, Unknown>", ts: "Promise<T> fulfillment/rejection channel", cpp: "result<T, nullable shared any>", haxe: "Future outcome<T, Dynamic>", status: Status::Established, note: "Exact async host rejection representation approved for Blob.arrayBuffer: the error arm is canonical Unknown, preserving provider error identity and explicit null" },
    Entry { rust: "TweenProp<T>", ts: "NumericProps<T>", cpp: "typed property-map entry (member pointer + destination value)", haxe: "typed property-map entry", status: Status::Established, note: "D22 (user 2026-10-21): `&[TweenProp<T>]` lowers to the plain property map `{ x: 100 }`. Each entry is `TweenProp<T> { get: fn(&mut T) -> &mut f32, to: f32 }`; `tween_prop!(field, value)` checks the field at compile time and `tween_with` is the nested/computed escape hatch. Non-capturing fn pointers only: no string lookup, hashing, boxed dispatch or runtime reflection" },
    Entry { rust: "Arc<dyn Fn(A) -> R + Send + Sync>", ts: "(a: A) => R", cpp: "std::function<R(A)>", haxe: "A->R", status: Status::Established, note: "Stored or returned capturing callback (D9); `FnMut` and `FnOnce` are also allowed; both thread-safety bounds are required" },
    Entry { rust: "&dyn Fn(A) -> R / &mut dyn FnMut(A) -> R", ts: "(a: A) => R", cpp: "const std::function<R(A)>& / std::function<R(A)>&", haxe: "A->R", status: Status::Established, note: "Borrowed callback parameter (D9); shared borrow for `Fn`, mutable borrow for `FnMut`" },
    Entry { rust: "fn(A) -> R", ts: "(a: A) => R", cpp: "R (*)(A)", haxe: "A->R", status: Status::Established, note: "Stateless function value (D9)" },
    Entry { rust: "Arc<T>", ts: "Readonly<T>", cpp: "std::shared_ptr<const T>", haxe: "T", status: Status::Established, note: "Immutable shared plain-record identity; T must itself be recognized vocabulary. Not Entity" },
    Entry { rust: "Ref<T>", ts: "T", cpp: "std::shared_ptr<T>", haxe: "T", status: Status::Established, note: "Shared object identity (A2, trial 2026-10-20): create_* returns it, dispose_* breaks cycles, memory frees at the last drop. Defined in flight-entity as Arc<RwLock<T>>: thread-safe by default (user 2026-10-20); swap the alias only if measurement shows a hot loop suffers" },
    Entry { rust: "WeakRef<T>", ts: "T | null", cpp: "std::weak_ptr<T>", haxe: "Null<T>", status: Status::Proposed, note: "Not for parent links: under A2 parents are strong, as in TS. Only for non-owning caches" },
    Entry { rust: "Handle<T>", ts: "T (object) or number", cpp: "handle / T*", haxe: "T", status: Status::Open, note: "Deferred: node-store option (D), revisit only if threading or bulk release requires it" },
    Entry { rust: "generic type parameter <T>", ts: "<T>", cpp: "template<typename T>", haxe: "<T>", status: Status::Established, note: "Bounds are lint-enforced: declared IR family traits, JSON Serialize/DeserializeOwned, and Rust-only Default/Clone/lifetimes" },
    Entry { rust: "trait Entity / T: Entity", ts: "extends Entity / T extends Entity", cpp: "base class / template<typename T>", haxe: "interface / <T:Entity>", status: Status::Established, note: "D12/WP8b: the private runtime slot is reached through this trait; it is the only workspace trait bound in the vocabulary. Qualified paths (flight_entity::Entity) map the same way" },
    Entry { rust: "T: Serialize / T: DeserializeOwned", ts: "generic <T>; bounds erased; JSON.stringify / JSON.parse", cpp: "template<typename T>; internal JSON engine", haxe: "<T>; internal JSON engine", status: Status::Established, note: "Principal 12ecb245: only serde::Serialize and serde::de::DeserializeOwned are accepted JSON generic bounds. serde_json stays internal; no public serde_json::Value or arbitrary serde/reflection trait surface" },
    Entry { rust: "private runtime field (runtime: EntityRuntimeSlot)", ts: "[EntityRuntimeKey] slot", cpp: "private member", haxe: "private field", status: Status::Established, note: "D12/WP8b: never pub; `impl_entity!(T)` implements Entity for T and exposes the slot through entity_runtime/entity_runtime_mut" },
    Entry { rust: "async fn(A) -> T", ts: "async (a: A) => Promise<T>", cpp: "T (*)(A) [coroutine]", haxe: "A->futures.Future<T>", status: Status::Established, note: "Executor-neutral async (D15); no SDK spawning/runtime choice" },
    Entry { rust: "Pin<Box<dyn Future<Output=T> + Send>>", ts: "Promise<T>", cpp: "std::future<T>", haxe: "futures.Future<T>", status: Status::Established, note: "Boxed future return type (D15); required Send bound; used in async callback returns" },
    Entry { rust: "SharedFuture<T>", ts: "Promise<T>", cpp: "std::shared_future<T>", haxe: "futures.Future<T>", status: Status::Established, note: "D20 (user 2026-10-21): a TS Promise stored in a field; cloneable and executor-neutral, settles once and every clone observes the same result; defined in flight-stream over futures::future::Shared. Use Ref/Arc as the output when T is not Clone; returned promises stay async fn" },
    Entry { rust: "ReadableStream", ts: "ReadableStream<Uint8Array>", cpp: "byte read handle (e.g. std::shared_ptr<std::istream>)", haxe: "haxe.io.Input", status: Status::Established, note: "D20: flight-stream vocabulary over futures-io AsyncRead; the exclusive borrow is the lock, the caller buffer is BYOB, pull polling is backpressure, and drop cancels" },
    Entry { rust: "WritableStream", ts: "WritableStream<Uint8Array>", cpp: "byte write handle (e.g. std::shared_ptr<std::ostream>)", haxe: "haxe.io.Output", status: Status::Established, note: "D20: flight-stream vocabulary over futures-io AsyncWrite; the exclusive borrow is the lock, a partial write is backpressure, close is explicit and drop aborts" },
    Entry { rust: "ByteChunkStream", ts: "AsyncIterable<Readonly<Uint8Array>>", cpp: "async byte-chunk generator", haxe: "Iterator<haxe.io.Bytes> (async)", status: Status::Established, note: "D20 (Principal ae8562b8): flight-stream vocabulary over futures::Stream<Item = Result<Box<Uint8Array>, Unknown>>; one item per logical chunk so boundaries survive, Err carries the iterator rejection with its original identity, None ends iteration" },
    Entry { rust: "WritableStreamAbortHook", ts: "UnderlyingSink.abort(reason)", cpp: "std::function<std::future<void>(reason)>", haxe: "Dynamic->futures.Future<Void>", status: Status::Established, note: "D20 (Principal ae8562b8): optional sink abort supplied at WritableStream construction; receives Option<Unknown> unchanged (None undefined, Some(None) null, Some(Some) original value) and its Unknown rejection is returned unchanged; without it abort_writable_stream is drop-as-abort" },
    Entry { rust: "AbortSignal / AbortController", ts: "AbortSignal / AbortController", cpp: "cancellation token / controller", haxe: "AbortSignal / AbortController", status: Status::Established, note: "Small shared cancellation primitive defined in flight-stream; plain data, not Entity" },
    Entry { rust: "(A, B) / (A, B, C) / (A, B, C, D)", ts: "readonly [A, B] / readonly [A, B, C] / readonly [A, B, C, D]", cpp: "std::pair / std::tuple", haxe: "Array<Dynamic>", status: Status::Established, note: "Fixed 2–4 element tuples of vocabulary types; unit tuple `()` is void (math #3)" },
    Entry { rust: "enum Scalar { Variant(primitive) }", ts: "number | string (scalar union)", cpp: "std::variant<int, std::string>", haxe: "Dynamic", status: Status::Established, note: "One primitive/scalar payload per variant; enum-payload-named exemption (binpack #5)" },
    Entry { rust: "Ref<dyn Node> / Ref<dyn Node2D> / Ref<dyn Node3D>", ts: "Node / Node2D / Node3D", cpp: "std::shared_ptr<Node> / …", haxe: "Node / Node2D / Node3D", status: Status::Established, note: "D16: node family trait objects; mixed children `Vec<Ref<dyn Node2D>>`; only declared family names accepted" },
    Entry { rust: "kind struct + Deref<Target = *Fields>", ts: "interface X extends Node2D", cpp: "class X : public Node2D", haxe: "class X extends Node2D", status: Status::Established, note: "D16: concrete kind (Sprite, Mesh, …) composes *Fields via Deref/DerefMut; data as separate pub field" },
    Entry { rust: "T: Node2D / T: Transform2DNode / T: BoundsNode", ts: "T extends Node2D / …", cpp: "template<typename T>", haxe: "<T:Node2D>", status: Status::Established, note: "D16: node family and feature traits as generic bounds; only declared trait names accepted" },
    Entry { rust: "Ref<dyn Adjustment> / &dyn Adjustment / T: Adjustment", ts: "Adjustment / T extends Adjustment", cpp: "std::shared_ptr<Adjustment> / template<typename T>", haxe: "Adjustment / <T:Adjustment>", status: Status::Established, note: "Adjustment family (principal batch 4, generalizes D16): kind structs Deref to AdjustmentFields; mixed stacks `Vec<Ref<dyn Adjustment>>`; only the declared family name accepted" },
    Entry { rust: "Ref<dyn MaterialData> / &dyn MaterialData / T: MaterialData", ts: "MaterialData / T extends MaterialData", cpp: "std::shared_ptr<MaterialData> / template<typename T>", haxe: "MaterialData / <T:MaterialData>", status: Status::Established, note: "D16 open MaterialData entity family: Ref preserves the original caller-owned custom-kind allocation through heterogeneous optional collections; only the declared family name is accepted" },
    Entry { rust: "Ref<dyn Physics3DJoint> / &dyn Physics3DJoint / T: Physics3DJoint", ts: "Physics3DJoint / T extends Physics3DJoint", cpp: "std::shared_ptr<Physics3DJoint> / template<typename T>", haxe: "Physics3DJoint / <T:Physics3DJoint>", status: Status::Established, note: "D16 open Physics3DJoint entity family (TS `Physics3DJoint extends Entity`, kind-dispatched to its registered solver): Ref preserves the original caller-owned custom-kind allocation; only the declared family name is accepted" },
    Entry { rust: "pub const / pub static LazyLock<T>", ts: "export const", cpp: "inline constexpr / static", haxe: "static final", status: Status::Established, note: "Immutable only (D5)" },
];

const PRIMITIVES: &[&str] = &[
    "f32", "f64", "bool", "i8", "i16", "i32", "u8", "u16", "u32", "usize", "char", "str",
];
const NUMERIC_TYPED_ARRAY_ELEMENTS: &[&str] =
    &["f32", "f64", "i8", "i16", "i32", "u8", "u16", "u32"];
const TYPED_ARRAY_ALIASES: &[&str] = &[
    "Float32Array", "Float64Array", "Uint8Array", "Uint16Array", "Uint32Array", "Int8Array", "Int16Array",
    "Int32Array",
];
const RESTRICTED_INTS: &[&str] = &["i64", "u64", "i128", "u128", "isize"];
const LEAF_NAMES: &[&str] = &[
    "String", "Kind", "AnySlot", "Unknown", "UnknownValue", "ProviderRef", "ArrayBuffer", "ArrayBufferView", "Blob", "BlobArrayBufferReader", "AbortSignal", "AbortController", "Self", "Float32Array", "Float64Array", "Uint8Array", "Uint16Array",
    "Uint32Array", "Int8Array", "Int16Array", "Int32Array",
];
const CONTAINERS: &[&str] = &[
    "Option", "Vec", "HashMap", "HashSet", "Record", "Ref", "WeakRef", "Handle", "LazyLock",
];

/// Trait bounds a contract generic parameter may carry. `Entity` is the approved IR trait
/// (D12/WP8b); a qualified path such as `flight_entity::Entity` matches by its last segment.
/// `Default` and `Clone` are the Rust-only construction bounds already used by approved
/// contracts (`allocate_entity<T: Default>`, `pick<T: Clone>`) and have no TS mapping of their
/// own. The node family and feature traits (D16), the adjustment family trait (principal batch
/// 4, generalizing D16), the MaterialData and Physics3DJoint entity families, and the exact JSON
/// generic bounds
/// `Serialize` / `DeserializeOwned`
/// (Principal 12ecb245) are also approved. Paths match by their final segment so imported and
/// canonical `serde::Serialize` / `serde::de::DeserializeOwned` spellings behave identically.
const APPROVED_TYPE_PARAM_BOUNDS: &[&str] = &[
    "Entity", "Default", "Clone", "Serialize", "DeserializeOwned",
    "Node", "Node2D", "Node3D",
    "Transform2DNode", "BoundsNode",
    "Adjustment", "MaterialData", "Physics3DJoint",
];

/// D16 node family traits, plus the adjustment, MaterialData and Physics3DJoint families, accepted as trait
/// objects in `Ref<dyn ...>`, `&dyn ...`, parameters, and mixed collections. Only these declared
/// names; arbitrary trait objects are rejected.
const APPROVED_NODE_TRAIT_OBJECTS: &[&str] = &[
    "Node",
    "Node2D",
    "Node3D",
    "Adjustment",
    "MaterialData",
    "Physics3DJoint",
];

/// Checks the trait bounds on a contract item's generic parameters and where-clause. Lifetime
/// bounds are ignored (they carry no transpiled mapping). Returned problems are deduplicated.
pub fn check_generic_bounds(generics: &syn::Generics) -> Vec<String> {
    let mut problems = Vec::new();
    for param in &generics.params {
        if let syn::GenericParam::Type(type_param) = param {
            check_bounds(&type_param.bounds, &mut problems);
        }
    }
    if let Some(where_clause) = &generics.where_clause {
        for predicate in &where_clause.predicates {
            if let syn::WherePredicate::Type(predicate) = predicate {
                check_bounds(&predicate.bounds, &mut problems);
            }
        }
    }
    problems.sort();
    problems.dedup();
    return problems;
}

fn check_bounds(
    bounds: &syn::punctuated::Punctuated<TypeParamBound, syn::Token![+]>,
    out: &mut Vec<String>,
) {
    for bound in bounds {
        let TypeParamBound::Trait(trait_bound) = bound else {
            // Lifetime bounds (`T: 'static`) are Rust-only and carry no mapping.
            continue;
        };
        if !matches!(trait_bound.modifier, TraitBoundModifier::None) {
            out.push(String::from("relaxed generic trait bounds (`?Trait`) are not in the vocabulary"));
            continue;
        }
        let Some(last) = trait_bound.path.segments.last() else {
            continue;
        };
        let name = last.ident.to_string();
        if !APPROVED_TYPE_PARAM_BOUNDS.contains(&name.as_str()) {
            out.push(format!(
                "generic bound `{}` is not in the vocabulary",
                name
            ));
        }
    }
}

#[derive(Clone, Copy, PartialEq)]
enum CallbackKind {
    Fn,
    FnMut,
    FnOnce,
}

struct CallbackShape {
    kind: CallbackKind,
    has_send: bool,
    has_sync: bool,
    has_unsupported_bound: bool,
}

/// Checks one contract type against the vocabulary. `known` holds workspace-defined type names
/// and `generics` the item's type parameters. Returns human-readable problems (deduplicated).
pub fn check_type(ty: &Type, known: &HashSet<String>, generics: &HashSet<String>) -> Vec<String> {
    let mut problems = Vec::new();
    walk(ty, known, generics, &mut problems);
    problems.sort();
    problems.dedup();
    return problems;
}

fn walk(ty: &Type, known: &HashSet<String>, generics: &HashSet<String>, out: &mut Vec<String>) {
    match ty {
        Type::Reference(r) => {
            if let Type::TraitObject(trait_object) = r.elem.as_ref()
                && let Some(shape) = walk_callback(trait_object, known, generics, out)
            {
                let valid_borrow = match (r.mutability.is_some(), shape.kind) {
                    (false, CallbackKind::Fn) | (true, CallbackKind::FnMut) => true,
                    _ => false,
                };
                if !valid_borrow || shape.has_send || shape.has_sync || shape.has_unsupported_bound
                {
                    out.push(String::from(
                        "borrowed callbacks must use `&dyn Fn(...)` or `&mut dyn FnMut(...)`",
                    ));
                }
                return;
            }
            walk(&r.elem, known, generics, out);
        }
        Type::Slice(s) => walk(&s.elem, known, generics, out),
        Type::Array(a) => walk(&a.elem, known, generics, out),
        Type::Paren(p) => walk(&p.elem, known, generics, out),
        Type::Group(g) => walk(&g.elem, known, generics, out),
        Type::Never(_) => {}
        Type::Tuple(t) => {
            let len = t.elems.len();
            if len >= 2 && len <= 4 {
                for elem in &t.elems {
                    walk(elem, known, generics, out);
                }
            } else if len != 0 {
                out.push(String::from("tuple types are not in the vocabulary (use a named struct or out-params)"));
            }
        }
        Type::BareFn(f) => {
            for input in &f.inputs {
                walk(&input.ty, known, generics, out);
            }
            if let ReturnType::Type(_, r) = &f.output {
                walk(r, known, generics, out);
            }
        }
        Type::TraitObject(trait_object) => {
            if is_approved_node_trait_object(trait_object) {
                return;
            }
            walk_callback(trait_object, known, generics, out);
            out.push(String::from(
                "`dyn Trait` is not in the vocabulary (use AnySlot or Callback)",
            ));
        }
        Type::ImplTrait(_) => out.push(String::from("`impl Trait` is not in the vocabulary")),
        Type::Ptr(_) => out.push(String::from("raw pointers are not in the vocabulary")),
        Type::Path(p) => {
            let Some(last) = p.path.segments.last() else {
                return;
            };
            let name = last.ident.to_string();
            if name == "Box"
                && let PathArguments::AngleBracketed(arguments) = &last.arguments
                && arguments.args.len() == 1
                && let Some(GenericArgument::Type(inner)) = arguments.args.first()
                && is_owned_numeric_array(inner)
            {
                return;
            }
            if name == "Box"
                && let PathArguments::AngleBracketed(arguments) = &last.arguments
                && arguments.args.len() == 1
                && let Some(GenericArgument::Type(Type::Slice(slice))) = arguments.args.first()
            {
                walk(&slice.elem, known, generics, out);
                return;
            }
            if name == "Arc"
                && let PathArguments::AngleBracketed(arguments) = &last.arguments
                && arguments.args.len() == 1
                && let Some(GenericArgument::Type(Type::TraitObject(trait_object))) =
                    arguments.args.first()
                && let Some(shape) = walk_callback(trait_object, known, generics, out)
            {
                if !shape.has_send || !shape.has_sync || shape.has_unsupported_bound {
                    out.push(String::from(
                        "stored or returned callbacks must use `Arc<dyn Fn(...) + Send + Sync>` with both thread-safety bounds",
                    ));
                }
                return;
            }
            if name == "Arc" {
                match &last.arguments {
                    PathArguments::AngleBracketed(arguments) if arguments.args.len() == 1 => {
                        match arguments.args.first() {
                            Some(GenericArgument::Type(inner)) => walk(inner, known, generics, out),
                            _ => out.push(String::from(
                                "`Arc<T>` requires one vocabulary type argument",
                            )),
                        }
                    }
                    _ => out.push(String::from(
                        "`Arc<T>` requires one vocabulary type argument",
                    )),
                }
                return;
            }
            if name == "Pin"
                && let PathArguments::AngleBracketed(arguments) = &last.arguments
                && arguments.args.len() == 1
                && let Some(GenericArgument::Type(inner)) = arguments.args.first()
            {
                match check_pinned_future_box(inner, known, generics, out) {
                    PinCheck::Accepted => return,
                    PinCheck::Rejected => {
                        out.push(String::from(
                            "`Pin<Box<...>>` is only accepted as `Pin<Box<dyn Future<Output=T> + Send>>` (D15)",
                        ));
                        return;
                    }
                    PinCheck::NotPin => {}
                }
            }
            if name == "SharedFuture" {
                match &last.arguments {
                    PathArguments::AngleBracketed(arguments) if arguments.args.len() == 1 => {
                        match arguments.args.first() {
                            Some(GenericArgument::Type(inner)) => walk(inner, known, generics, out),
                            _ => out.push(String::from(
                                "`SharedFuture<T>` requires one output type argument",
                            )),
                        }
                    }
                    _ => out.push(String::from(
                        "`SharedFuture<T>` requires one output type argument",
                    )),
                }
                return;
            }
            if name == "Result" {
                match &last.arguments {
                    PathArguments::AngleBracketed(arguments) if arguments.args.len() == 2 => {
                        let mut arguments = arguments.args.iter();
                        match (arguments.next(), arguments.next()) {
                            (
                                Some(GenericArgument::Type(output)),
                                Some(GenericArgument::Type(Type::Path(error))),
                            ) if error.path.segments.last().is_some_and(|segment| {
                                segment.ident == "Unknown"
                                    && matches!(segment.arguments, PathArguments::None)
                            }) => walk(output, known, generics, out),
                            _ => out.push(String::from(
                                "`Result<T, E>` is only accepted with canonical `Unknown` as E",
                            )),
                        }
                    }
                    _ => out.push(String::from(
                        "`Result<T, Unknown>` requires one output and the canonical Unknown error type",
                    )),
                }
                return;
            }
            if name == "ReadableStream"
                || name == "WritableStream"
                || name == "ByteChunkStream"
                || name == "WritableStreamAbortHook"
            {
                if !matches!(last.arguments, PathArguments::None) {
                    out.push(format!("`{}` takes no type arguments", name));
                }
                return;
            }
            if name == "TweenProp" {
                match &last.arguments {
                    PathArguments::AngleBracketed(arguments) if arguments.args.len() == 1 => {
                        match arguments.args.first() {
                            Some(GenericArgument::Type(inner)) => walk(inner, known, generics, out),
                            _ => out.push(String::from(
                                "`TweenProp<T>` requires one vocabulary target type argument",
                            )),
                        }
                    }
                    _ => out.push(String::from(
                        "`TweenProp<T>` requires one vocabulary target type argument",
                    )),
                }
                return;
            }
            if name == "Record" {
                match &last.arguments {
                    PathArguments::AngleBracketed(arguments) if arguments.args.len() == 1 => {
                        match arguments.args.first() {
                            Some(GenericArgument::Type(inner)) => walk(inner, known, generics, out),
                            _ => out.push(String::from(
                                "`Record<V>` requires one vocabulary value type argument",
                            )),
                        }
                    }
                    _ => out.push(String::from(
                        "`Record<V>` requires one vocabulary value type argument",
                    )),
                }
                return;
            }
            if name == "Unknown"
                || name == "UnknownValue"
                || name == "ProviderRef"
                || name == "ArrayBuffer"
                || name == "ArrayBufferView"
                || name == "Blob"
                || name == "AbortSignal"
                || name == "AbortController"
            {
                if !matches!(last.arguments, PathArguments::None) {
                    out.push(format!("`{}` takes no type arguments", name));
                }
                return;
            }
            if PRIMITIVES.contains(&name.as_str())
                || LEAF_NAMES.contains(&name.as_str())
                || generics.contains(&name)
            {
                // fallthrough to generic args below (none expected)
            } else if RESTRICTED_INTS.contains(&name.as_str()) {
                out.push(format!("`{}` exceeds TS number precision (open vocabulary row)", name));
            } else if CONTAINERS.contains(&name.as_str()) || known.contains(&name) {
                // known container or workspace type
            } else {
                out.push(format!("`{}` is not in the vocabulary", name));
            }
            if let PathArguments::AngleBracketed(args) = &last.arguments {
                for arg in &args.args {
                    if let GenericArgument::Type(t) = arg {
                        walk(t, known, generics, out);
                    }
                }
            }
        }
        _ => out.push(String::from("unsupported type form")),
    }
}

fn is_approved_node_trait_object(trait_object: &syn::TypeTraitObject) -> bool {
    let mut has_approved_node = false;
    for bound in &trait_object.bounds {
        let TypeParamBound::Trait(trait_bound) = bound else {
            return false;
        };
        if !matches!(trait_bound.modifier, TraitBoundModifier::None) {
            return false;
        }
        let Some(seg) = trait_bound.path.segments.last() else {
            return false;
        };
        let name = seg.ident.to_string();
        if APPROVED_NODE_TRAIT_OBJECTS.contains(&name.as_str()) {
            if has_approved_node || !matches!(seg.arguments, PathArguments::None) {
                return false;
            }
            has_approved_node = true;
        } else if name == "Send" || name == "Sync" {
            if !matches!(seg.arguments, PathArguments::None) {
                return false;
            }
        } else {
            return false;
        }
    }
    return has_approved_node;
}

fn is_owned_numeric_array(ty: &Type) -> bool {
    let element_name = match ty {
        Type::Slice(slice) => match slice.elem.as_ref() {
            Type::Path(path) => path.path.segments.last().map(|segment| segment.ident.to_string()),
            _ => None,
        },
        Type::Path(path) => path.path.segments.last().map(|segment| segment.ident.to_string()),
        _ => None,
    };
    let Some(element_name) = element_name else {
        return false;
    };
    return match ty {
        Type::Slice(_) => NUMERIC_TYPED_ARRAY_ELEMENTS.contains(&element_name.as_str()),
        Type::Path(_) => TYPED_ARRAY_ALIASES.contains(&element_name.as_str()),
        _ => false,
    };
}

enum PinCheck {
    Accepted,
    Rejected,
    NotPin,
}

fn check_pinned_future_box(
    ty: &Type,
    known: &HashSet<String>,
    generics: &HashSet<String>,
    out: &mut Vec<String>,
) -> PinCheck {
    let Type::Path(p) = ty else {
        return PinCheck::NotPin;
    };
    let Some(last) = p.path.segments.last() else {
        return PinCheck::NotPin;
    };
    if last.ident != "Box" {
        return PinCheck::NotPin;
    }
    let PathArguments::AngleBracketed(args) = &last.arguments else {
        return PinCheck::NotPin;
    };
    if args.args.len() != 1 {
        return PinCheck::NotPin;
    }
    let Some(GenericArgument::Type(Type::TraitObject(trait_obj))) = args.args.first() else {
        return PinCheck::NotPin;
    };

    let mut has_future = false;
    let mut has_send = false;
    let mut output_ty: Option<&Type> = None;
    let mut rejected = false;

    for bound in &trait_obj.bounds {
        let TypeParamBound::Trait(trait_bound) = bound else {
            rejected = true;
            continue;
        };
        if !matches!(trait_bound.modifier, TraitBoundModifier::None) {
            rejected = true;
            continue;
        }
        let Some(seg) = trait_bound.path.segments.last() else {
            rejected = true;
            continue;
        };
        match seg.ident.to_string().as_str() {
            "Future" => {
                if has_future {
                    rejected = true;
                    continue;
                }
                has_future = true;
                if let PathArguments::AngleBracketed(future_args) = &seg.arguments {
                    for arg in &future_args.args {
                        if let GenericArgument::AssocType(assoc) = arg {
                            if assoc.ident == "Output" {
                                output_ty = Some(&assoc.ty);
                            } else {
                                rejected = true;
                            }
                        } else {
                            rejected = true;
                        }
                    }
                } else {
                    rejected = true;
                }
            }
            "Send" if matches!(seg.arguments, PathArguments::None) => {
                if has_send {
                    rejected = true;
                }
                has_send = true;
            }
            _ => {
                rejected = true;
            }
        }
    }

    if !has_future {
        return PinCheck::NotPin;
    }
    if rejected || !has_send || output_ty.is_none() {
        return PinCheck::Rejected;
    }
    walk(output_ty.unwrap(), known, generics, out);
    return PinCheck::Accepted;
}

fn walk_callback(
    trait_object: &syn::TypeTraitObject,
    known: &HashSet<String>,
    generics: &HashSet<String>,
    out: &mut Vec<String>,
) -> Option<CallbackShape> {
    let mut kind = None;
    let mut has_send = false;
    let mut has_sync = false;
    let mut has_unsupported_bound = false;

    for bound in &trait_object.bounds {
        let TypeParamBound::Trait(trait_bound) = bound else {
            has_unsupported_bound = true;
            continue;
        };
        if !matches!(trait_bound.modifier, TraitBoundModifier::None) {
            has_unsupported_bound = true;
        }
        let Some(last) = trait_bound.path.segments.last() else {
            has_unsupported_bound = true;
            continue;
        };
        match last.ident.to_string().as_str() {
            "Fn" | "FnMut" | "FnOnce" => {
                let next_kind = match last.ident.to_string().as_str() {
                    "Fn" => CallbackKind::Fn,
                    "FnMut" => CallbackKind::FnMut,
                    _ => CallbackKind::FnOnce,
                };
                if kind.replace(next_kind).is_some() {
                    has_unsupported_bound = true;
                }
                if let PathArguments::Parenthesized(arguments) = &last.arguments {
                    for input in &arguments.inputs {
                        walk(input, known, generics, out);
                    }
                    if let ReturnType::Type(_, result) = &arguments.output {
                        walk(result, known, generics, out);
                    }
                } else {
                    has_unsupported_bound = true;
                }
            }
            "Send" if matches!(last.arguments, PathArguments::None) => {
                if has_send {
                    has_unsupported_bound = true;
                }
                has_send = true;
            }
            "Sync" if matches!(last.arguments, PathArguments::None) => {
                if has_sync {
                    has_unsupported_bound = true;
                }
                has_sync = true;
            }
            _ => has_unsupported_bound = true,
        }
    }

    return kind.map(|kind| CallbackShape {
        kind,
        has_send,
        has_sync,
        has_unsupported_bound,
    });
}

pub fn print_table() {
    println!("| Rust | TS | C++ | Haxe | Status | Notes |");
    println!("|------|----|-----|------|--------|-------|");
    for e in ENTRIES {
        let status = match e.status {
            Status::Established => "established",
            Status::Proposed => "proposed",
            Status::Open => "open",
        };
        println!(
            "| `{}` | `{}` | `{}` | `{}` | {} | {} |",
            e.rust, e.ts, e.cpp, e.haxe, status, e.note
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn problems(ty: &str) -> Vec<String> {
        let t: Type = syn::parse_str(ty).unwrap();
        let known: HashSet<String> = ["Vector2".to_string()].into_iter().collect();
        let generics: HashSet<String> = ["T".to_string()].into_iter().collect();
        return check_type(&t, &known, &generics);
    }

    #[test]
    fn accepts_the_d22_tween_prop_row_and_requires_one_target_argument() {
        assert!(
            problems("TweenProp<Vector2>").is_empty(),
            "{:?}",
            problems("TweenProp<Vector2>")
        );
        assert!(
            problems("&[TweenProp<Vector2>]").is_empty(),
            "{:?}",
            problems("&[TweenProp<Vector2>]")
        );
        for ty in ["TweenProp", "TweenProp<Vector2, f32>"] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
        let entry = ENTRIES
            .iter()
            .find(|entry| entry.rust == "TweenProp<T>")
            .unwrap();
        assert_eq!(entry.ts, "NumericProps<T>");
        assert!(entry.note.contains("`tween_prop!(field, value)`"));
        assert!(entry.note.contains("get: fn(&mut T) -> &mut f32, to: f32"));
        assert!(
            entry
                .note
                .contains("no string lookup, hashing, boxed dispatch or runtime reflection")
        );
    }

    #[test]
    fn accepts_vocabulary_types() {
        for ty in [
            "f32", "&mut Vector2", "Option<Vec<Vector2>>", "&[f32]", "[f32; 16]", "HashMap<Kind, Vector2>",
            "Ref<Vector2>", "AnySlot", "Unknown", "fn(f32) -> f32", "&'static str", "T", "()",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
    }

    #[test]
    fn accepts_the_batch6_shared_foundation_rows() {
        for ty in [
            "Arc<Vector2>", "Arc<Option<Vec<Vector2>>>", "AbortSignal", "AbortController",
            "Unknown", "Option<Unknown>", "ProviderRef", "Record<Vector2>", "Record<Unknown>", "Vec<Vector2>",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
        for row in [
            "Arc<T>", "AbortSignal / AbortController", "Unknown", "ProviderRef", "Record<V>",
            "Vec<T> (nonempty at consuming API boundary)",
            "data enum (one named struct payload per variant)",
        ] {
            assert!(ENTRIES.iter().any(|entry| entry.rust == row), "missing batch6 vocabulary row: {}", row);
        }
    }

    #[test]
    fn accepts_the_batch8_shared_buffer_foundation_rows() {
        for ty in ["ArrayBuffer", "ArrayBufferView", "Blob", "Arc<Blob>"] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
        for row in ["ArrayBuffer", "ArrayBufferView", "Blob"] {
            assert!(
                ENTRIES.iter().any(|entry| entry.rust == row),
                "missing batch8 vocabulary row: {}",
                row
            );
        }
    }

    #[test]
    fn rejects_batch8_buffer_near_misses_without_widening_unknown_types() {
        for ty in [
            "ArrayBuffer<u8>",
            "ArrayBufferView<Unknown>",
            "Blob<Unknown>",
            "SharedArrayBuffer",
            "BlobPayload",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn rejects_batch6_near_misses_without_a_wildcard_waiver() {
        for ty in [
            "Arc", "Arc<Vector2, f32>", "Arc<NotVocabulary>", "Arc<dyn Any + Send + Sync>",
            "AbortSignal<Vector2>", "AbortController<Vector2>", "Unknown<Vector2>", "ProviderRef<Vector2>", "Record",
            "Record<Vector2, f32>", "Record<NotVocabulary>", "NonEmptyVec<Vector2>",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn records_the_exact_provider_ref_transpile_mapping() {
        let entry = ENTRIES
            .iter()
            .find(|entry| entry.rust == "ProviderRef")
            .unwrap();
        assert_eq!(
            entry.ts,
            "field omitted; containing capability record is the provider object"
        );
        assert!(entry.note.contains("`provider: ProviderRef`"));
        assert!(entry.note.contains("`Arc::ptr_eq`, never callbacks"));
        assert!(entry.note.contains("`capA === capB`"));
        assert!(entry.note.contains("not Entity or a numeric id"));
    }

    #[test]
    fn records_the_exact_host_spawn_capability_mapping() {
        let entry = ENTRIES
            .iter()
            .find(|entry| entry.rust == "HostSpawnCapability")
            .unwrap();
        assert_eq!(entry.ts, "field omitted; `spawn(fut)` lowers to `void fut`");
        assert_eq!(entry.cpp, "host-owned executor callback");
        assert_eq!(entry.haxe, "host-owned Future executor");
        assert!(entry.note.contains("canonical ProviderRef identity"));
        assert!(entry.note.contains("Pin<Box<dyn Future<Output=()> + Send>>"));
        assert!(entry.note.contains("never chooses an executor or blocks"));
        assert!(problems("Arc<dyn Fn(Pin<Box<dyn Future<Output = ()> + Send>>) + Send + Sync>").is_empty());
    }

    #[test]
    fn records_the_exact_host_timer_capability_mapping() {
        let capability = ENTRIES
            .iter()
            .find(|entry| entry.rust == "HostTimerCapability")
            .unwrap();
        assert!(capability.ts.contains("`setTimeout`"));
        assert!(capability.ts.contains("`setInterval`"));
        assert!(capability.ts.contains("`Date.now`"));
        assert!(capability.note.contains("enqueue callbacks (never inline)"));
        assert!(capability.note.contains("negative/NaN timeout delays to 0 ms"));
        assert!(capability.note.contains("interval delays to at least 1 ms"));
        assert!(capability.note.contains("No SDK runtime or native timer"));

        let handle = ENTRIES
            .iter()
            .find(|entry| entry.rust == "TimerHandle")
            .unwrap();
        assert!(handle.ts.contains("`clearTimeout`"));
        assert!(handle.ts.contains("`clearInterval`"));
        assert!(handle.note.contains("no public provider-specific numeric timer id"));
    }

    #[test]
    fn recognizes_the_exact_blob_array_buffer_result_without_type_erasure() {
        let entry = ENTRIES
            .iter()
            .find(|entry| entry.rust == "Result<T, Unknown>")
            .unwrap();
        assert!(entry.ts.contains("fulfillment/rejection"));
        assert!(entry.note.contains("canonical Unknown"));
        assert!(entry.note.contains("explicit null"));
        let reader = ENTRIES
            .iter()
            .find(|entry| entry.rust == "BlobArrayBufferReader")
            .unwrap();
        assert!(reader.note.contains("Result<ArrayBuffer, Unknown>"));
        assert!(reader.note.contains("without type erasure"));
        assert!(problems("BlobArrayBufferReader").is_empty());
        assert!(problems("Result<ArrayBuffer, Unknown>").is_empty());
        assert!(
            problems(
                "Pin<Box<dyn Future<Output = Result<ArrayBuffer, Unknown>> + Send>>"
            )
            .is_empty()
        );
        assert!(!problems("Result<ArrayBuffer, FlightError>").is_empty());
    }

    #[test]
    fn records_the_exact_unknown_from_panic_mapping() {
        let entry = ENTRIES
            .iter()
            .find(|entry| entry.rust == "unknown_from_panic / CaughtPanic")
            .unwrap();
        assert_eq!(entry.ts, "caught unknown value");
        assert_eq!(entry.cpp, "caught exception payload in shared std::any");
        assert_eq!(entry.haxe, "Dynamic");
        assert!(entry.note.contains("Box<dyn Any + Send>"));
        assert!(entry.note.contains("FlightError remains the concrete Unknown value"));
        assert!(entry.note.contains("Send-only values remain safely downcastable"));
    }

    #[test]
    fn records_the_exact_unknown_to_js_string_mapping() {
        let entry = ENTRIES
            .iter()
            .find(|entry| entry.rust == "unknown_to_js_string")
            .unwrap();
        assert!(entry.ts.contains("`String(value)`"));
        assert!(entry.note.contains("FlightError Error.toString"));
        assert!(entry.note.contains("outer Option<Unknown>"));
        assert!(entry.note.contains("omitted undefined"));
        assert!(entry.note.contains("Custom user stringification is deliberately not modeled"));
        assert!(entry.note.contains("no Debug/Display fallback"));
    }

    #[test]
    fn accepts_the_d20_shared_future_and_stream_rows() {
        for ty in [
            "SharedFuture<Vector2>",
            "ReadableStream",
            "WritableStream",
            "ByteChunkStream",
            "WritableStreamAbortHook",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
        for name in [
            "SharedFuture<T>",
            "ReadableStream",
            "WritableStream",
            "ByteChunkStream",
            "WritableStreamAbortHook",
        ] {
            assert!(
                ENTRIES.iter().any(|entry| entry.rust == name),
                "missing D20 vocabulary row: {}",
                name
            );
        }
    }

    #[test]
    fn rejects_unapproved_shared_future_and_stream_shapes() {
        for ty in [
            "SharedFuture",
            "SharedFuture<Vector2, Vector2>",
            "SharedFuture<NotVocabulary>",
            "ReadableStream<Vector2>",
            "WritableStream<f32>",
            "ByteChunkStream<u8>",
            "WritableStreamAbortHook<Vector2>",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn accepts_approved_callback_forms_and_nested_signatures() {
        for ty in [
            "Arc<dyn Fn(Option<Vector2>, fn(f32) -> bool) -> Vec<f32> + Send + Sync>",
            "Arc<dyn FnMut(f32) + Sync + Send>",
            "Arc<dyn FnOnce() -> Vector2 + Send + Sync>",
            "Option<Arc<dyn Fn(i32, Vector2) + Send + Sync>>",
            "&dyn Fn(Option<Vector2>) -> Vec<f32>",
            "&mut dyn FnMut(fn(f32) -> bool)",
            "fn(Option<Vector2>) -> Vec<f32>",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
    }

    #[test]
    fn accepts_owned_fixed_length_array_boxes() {
        for ty in ["Box<[f32]>", "Box<Float32Array>", "Box<Uint16Array>", "Box<[Vector2]>", "Box<[Ref<Box<[f32]>>]>"] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
        for ty in ["Box<[NotVocabulary]>", "Box<Vector2>", "Box<dyn Fn(f32) -> f32>", "Box<dyn Any>"] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
        assert_eq!(problems("Box<dyn Any>").len(), 2);
        assert!(ENTRIES.iter().any(|entry| entry.rust == "Box<[T]> (T non-numeric)"));
    }

    #[test]
    fn rejects_unapproved_callback_ownership_and_bounds() {
        for ty in [
            "Box<dyn Fn(f32) -> f32>",
            "Rc<dyn Fn(f32) -> f32>",
            "Arc<dyn Fn(f32) -> f32>",
            "Arc<dyn Fn(f32) -> f32 + Send>",
            "Arc<dyn Fn(f32) -> f32 + Sync>",
            "Arc<dyn Fn(f32) -> f32 + Send + Sync + Display>",
            "&mut dyn Fn(f32) -> f32",
            "&dyn FnMut(f32) -> f32",
            "&dyn FnOnce(f32) -> f32",
            "dyn Fn(f32) -> f32",
            "&dyn Display",
            "Arc<dyn Display + Send + Sync>",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn rejects_non_vocabulary_types_nested_in_callbacks() {
        for ty in [
            "Arc<dyn Fn(NotVocabulary) -> f32 + Send + Sync>",
            "Arc<dyn Fn(f32) -> (f32, NotVocabulary) + Send + Sync>",
            "&dyn Fn(Option<NotVocabulary>) -> f32",
            "&mut dyn FnMut(f32) -> Rc<Vector2>",
            "fn(NotVocabulary) -> Vector2",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn rejects_non_vocabulary_types() {
        assert_eq!(problems("Rc<RefCell<Vector2>>").len(), 2);
        assert_eq!(problems("Box<dyn Any>").len(), 2);
        assert!(problems("(f32, f32)").is_empty());
        assert_eq!(problems("u64").len(), 1);
        assert_eq!(problems("NotVocabulary").len(), 1);
    }

    fn bound_problems(generics: &syn::Generics) -> Vec<String> {
        return check_generic_bounds(generics);
    }

    #[test]
    fn accepts_the_entity_trait_bound() {
        for source in [
            "pub fn f<T: Entity>(x: &T) {}",
            "pub fn f<T: flight_entity::Entity>(x: &T) {}",
            "pub fn f<T: Entity + Default>(x: &T) {}",
            "pub fn f<T>(x: &T) where T: Entity {}",
        ] {
            let item: syn::ItemFn = syn::parse_str(source).unwrap();
            assert!(bound_problems(&item.sig.generics).is_empty(), "{}", source);
        }
    }

    #[test]
    fn accepts_existing_rust_construction_bounds() {
        for source in [
            "pub fn f<T: Default>() -> T { return T::default(); }",
            "pub fn f<T: Clone>(x: &T) -> T { return x.clone(); }",
            "pub fn f<T: 'static>(x: &T) {}",
        ] {
            let item: syn::ItemFn = syn::parse_str(source).unwrap();
            assert!(bound_problems(&item.sig.generics).is_empty(), "{}", source);
        }
    }

    #[test]
    fn accepts_only_the_exact_json_generic_bounds_and_spellings() {
        for source in [
            "pub fn f<T: Serialize>(x: &T) {}",
            "pub fn f<T: serde::Serialize>(x: &T) {}",
            "pub fn f<T: ::serde::Serialize>(x: &T) {}",
            "pub fn f<T: DeserializeOwned>(x: &T) {}",
            "pub fn f<T: serde::de::DeserializeOwned>(x: &T) {}",
            "pub fn f<T: Serialize + DeserializeOwned>(x: &T) {}",
            "pub fn f<T>(x: &T) where T: serde::Serialize + serde::de::DeserializeOwned {}",
        ] {
            let item: syn::ItemFn = syn::parse_str(source).unwrap();
            assert!(bound_problems(&item.sig.generics).is_empty(), "{}", source);
        }
        let row = ENTRIES
            .iter()
            .find(|entry| entry.rust == "T: Serialize / T: DeserializeOwned")
            .unwrap();
        assert!(row.ts.contains("JSON.stringify"));
        assert!(row.ts.contains("JSON.parse"));
        assert!(row.note.contains("no public serde_json::Value"));
    }

    #[test]
    fn rejects_other_serde_reflection_and_public_json_value_shapes() {
        for source in [
            "pub fn f<T: serde::Deserialize<'static>>(x: &T) {}",
            "pub fn f<T: serde::Serializer>(x: &T) {}",
            "pub fn f<T: serde::Deserializer<'static>>(x: &T) {}",
            "pub fn f<T: serde::de::DeserializeSeed<'static>>(x: &T) {}",
            "pub fn f<T: serde::de::Visitor<'static>>(x: &T) {}",
            "pub fn f<T: Reflect>(x: &T) {}",
            "pub fn f<T: Any>(x: &T) {}",
        ] {
            let item: syn::ItemFn = syn::parse_str(source).unwrap();
            assert!(!bound_problems(&item.sig.generics).is_empty(), "{} unexpectedly accepted", source);
        }
        for ty in ["serde_json::Value", "serde_json::Map<String, serde_json::Value>", "serde::Serializer"] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn accepts_pinned_future_box_with_send() {
        for ty in [
            "Pin<Box<dyn Future<Output = f32> + Send>>",
            "Pin<Box<dyn Future<Output = Vec<Vector2>> + Send>>",
            "Pin<Box<dyn Future<Output = ()> + Send>>",
            "Pin<Box<dyn Future<Output = Option<Vector2>> + Send>>",
            "Option<Pin<Box<dyn Future<Output = f32> + Send>>>",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
    }

    #[test]
    fn accepts_async_callbacks_returning_futures() {
        for ty in [
            "Arc<dyn Fn(f32) -> Pin<Box<dyn Future<Output = f32> + Send>> + Send + Sync>",
            "Arc<dyn Fn() -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync>",
            "&dyn Fn(Vector2) -> Pin<Box<dyn Future<Output = bool> + Send>>",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
    }

    #[test]
    fn rejects_pinned_future_box_without_send() {
        for ty in [
            "Pin<Box<dyn Future<Output = f32>>>",
            "Pin<Box<dyn Future<Output = f32> + Sync>>",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn rejects_non_future_pin_box() {
        for ty in [
            "Pin<Box<dyn Display + Send>>",
            "Pin<Box<f32>>",
            "Pin<f32>",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn rejects_future_with_non_vocabulary_output() {
        assert!(
            !problems("Pin<Box<dyn Future<Output = NotVocabulary> + Send>>").is_empty(),
            "Pin<Box<dyn Future<Output = NotVocabulary> + Send>> unexpectedly accepted"
        );
    }

    #[test]
    fn accepts_fixed_size_tuples_of_vocabulary_types() {
        for ty in [
            "(f32, f32)",
            "(f32, bool, i32)",
            "(Vector2, f32, String, bool)",
            "(Option<f32>, Vec<Vector2>)",
            "Option<(f32, f32)>",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
    }

    #[test]
    fn rejects_tuples_outside_2_to_4_elements() {
        assert!(!problems("(f32,)").is_empty(), "1-tuple unexpectedly accepted");
        assert!(
            !problems("(f32, f32, f32, f32, f32)").is_empty(),
            "5-tuple unexpectedly accepted"
        );
    }

    #[test]
    fn rejects_tuples_with_non_vocabulary_elements() {
        for ty in [
            "(f32, NotVocabulary)",
            "(NotVocabulary, f32, bool)",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn accepts_node_trait_objects() {
        for ty in [
            "Ref<dyn Node2D>",
            "Ref<dyn Node>",
            "Ref<dyn Node3D>",
            "Vec<Ref<dyn Node2D>>",
            "&dyn Node2D",
            "Option<Ref<dyn Node2D>>",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
    }

    #[test]
    fn accepts_adjustment_family_trait_objects() {
        for ty in [
            "Ref<dyn Adjustment>",
            "Vec<Ref<dyn Adjustment>>",
            "&dyn Adjustment",
            "&[Ref<dyn Adjustment>]",
            "Option<Vec<Ref<dyn Adjustment>>>",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
    }

    #[test]
    fn accepts_material_data_family_trait_objects() {
        for ty in [
            "Ref<dyn MaterialData>",
            "&dyn MaterialData",
            "Option<Ref<dyn MaterialData>>",
            "Option<Vec<Option<Ref<dyn MaterialData>>>>",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
    }

    #[test]
    fn records_material_data_identity_lowering() {
        let entry = ENTRIES
            .iter()
            .find(|entry| {
                entry.rust == "Ref<dyn MaterialData> / &dyn MaterialData / T: MaterialData"
            })
            .unwrap();
        assert_eq!(entry.ts, "MaterialData / T extends MaterialData");
        assert_eq!(entry.cpp, "std::shared_ptr<MaterialData> / template<typename T>");
        assert_eq!(entry.haxe, "MaterialData / <T:MaterialData>");
        assert!(entry.note.contains("original caller-owned custom-kind allocation"));
    }

    #[test]
    fn rejects_near_miss_material_data_trait_objects() {
        for ty in [
            "Ref<dyn MaterialDatas>",
            "Ref<dyn MaterialDataFields>",
            "Ref<dyn MaterialData + Display>",
            "Ref<dyn MaterialData + Node2D>",
            "Ref<dyn MaterialData<f32>>",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn accepts_physics3d_joint_family_trait_objects() {
        for ty in [
            "Ref<dyn Physics3DJoint>",
            "&dyn Physics3DJoint",
            "Option<Ref<dyn Physics3DJoint>>",
            "Vec<Ref<dyn Physics3DJoint>>",
            "&[Ref<dyn Physics3DJoint>]",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
    }

    #[test]
    fn records_physics3d_joint_identity_lowering() {
        let entry = ENTRIES
            .iter()
            .find(|entry| {
                entry.rust == "Ref<dyn Physics3DJoint> / &dyn Physics3DJoint / T: Physics3DJoint"
            })
            .unwrap();
        assert_eq!(entry.ts, "Physics3DJoint / T extends Physics3DJoint");
        assert_eq!(
            entry.cpp,
            "std::shared_ptr<Physics3DJoint> / template<typename T>"
        );
        assert_eq!(entry.haxe, "Physics3DJoint / <T:Physics3DJoint>");
        assert!(
            entry
                .note
                .contains("original caller-owned custom-kind allocation")
        );
    }

    #[test]
    fn rejects_near_miss_physics3d_joint_trait_objects() {
        for ty in [
            "Ref<dyn Physics3DJoints>",
            "Ref<dyn Physics3DJointFields>",
            "Ref<dyn Physics2DJoint>",
            "Ref<dyn Physics3DJointKind>",
            "Ref<dyn Physics3DJoint + Display>",
            "Ref<dyn Physics3DJoint + Node3D>",
            "Ref<dyn Physics3DJoint<f32>>",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn rejects_near_miss_adjustment_trait_objects() {
        for ty in [
            "Ref<dyn Adjustments>",
            "Ref<dyn AdjustmentFields>",
            "Ref<dyn Adjustment + Node2D>",
            "Ref<dyn Adjustment<f32>>",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn rejects_unapproved_trait_objects() {
        for ty in [
            "Ref<dyn Display>",
            "Ref<dyn Unknown>",
            "&dyn Iterator",
            "dyn Display",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn accepts_node_trait_bounds() {
        for source in [
            "pub fn f<T: Node2D>(x: &T) {}",
            "pub fn f<T: Node>(x: &T) {}",
            "pub fn f<T: Node3D>(x: &T) {}",
            "pub fn f<T: Transform2DNode>(x: &T) {}",
            "pub fn f<T: BoundsNode>(x: &T) {}",
            "pub fn f<T: Node2D + Entity>(x: &T) {}",
            "pub fn f<T: Adjustment>(x: &T) {}",
            "pub fn f<T: Adjustment + Entity>(x: &T) {}",
            "pub fn f<T: MaterialData>(x: &T) {}",
            "pub fn f<T: MaterialData + Entity>(x: &T) {}",
            "pub fn f<T: Physics3DJoint>(x: &T) {}",
            "pub fn f<T: Physics3DJoint + Entity>(x: &T) {}",
            "pub fn f<T>(x: &T) where T: Physics3DJoint {}",
        ] {
            let item: syn::ItemFn = syn::parse_str(source).unwrap();
            assert!(bound_problems(&item.sig.generics).is_empty(), "{}", source);
        }
    }

    #[test]
    fn rejects_unrelated_trait_bounds() {
        for source in [
            "pub fn f<T: Display>(x: &T) {}",
            "pub fn f<T: Send>(x: &T) {}",
            "pub fn f<T: ?Sized>(x: &T) {}",
            "pub fn f<T>(x: &T) where T: UnknownTrait {}",
            "pub fn f<T: Physics3DJoints>(x: &T) {}",
            "pub fn f<T: Physics2DJoint>(x: &T) {}",
            "pub fn f<T: Physics3DJoint + Display>(x: &T) {}",
        ] {
            let item: syn::ItemFn = syn::parse_str(source).unwrap();
            assert!(!bound_problems(&item.sig.generics).is_empty(), "{} unexpectedly accepted", source);
        }
    }
}
