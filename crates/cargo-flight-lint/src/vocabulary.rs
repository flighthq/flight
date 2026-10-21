//! The IR vocabulary: the closed set of Rust constructs the contract may use, each with exactly
//! one mapping per transpile target. This table is the single source for both the
//! `contract-vocabulary` rule and `cargo flight-lint vocabulary` (agents/ir-vocabulary.md).

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
    Entry { rust: "ProviderRef", ts: "field omitted; containing capability record is the provider object", cpp: "std::shared_ptr<const std::any>", haxe: "Dynamic", status: Status::Established, note: "Alias for `Arc<dyn Any + Send + Sync>`, defined in flight-hostcapability. Every capability record carries `provider: ProviderRef`; facets from one provider clone the same token. Compare providers with `Arc::ptr_eq`, never callbacks. Rust provider identity `Arc::ptr_eq(&cap_a.provider, &cap_b.provider)` lowers to TS `capA === capB`. Plain identity, not Entity or a numeric id" },
    Entry { rust: "ArrayBuffer", ts: "ArrayBuffer", cpp: "small shared byte buffer", haxe: "haxe.io.Bytes", status: Status::Established, note: "Named flight-buffer struct wrapping Ref<Box<[u8]>>: fixed-length shared storage; Clone and equality preserve allocation identity rather than copying or flattening through Vec" },
    Entry { rust: "ArrayBufferView", ts: "ArrayBufferView", cpp: "small shared byte view", haxe: "haxe.io.Bytes", status: Status::Established, note: "Named flight-buffer record carrying ArrayBuffer, byte_offset, byte_length and exact ArrayBufferViewKind; every view aliases the same shared storage" },
    Entry { rust: "Blob", ts: "Blob", cpp: "small shared blob", haxe: "Dynamic", status: Status::Established, note: "Immutable Arc<Blob> record in flight-buffer with mime_type, size and canonical Unknown provider payload; no Blob I/O API is implied" },
    Entry { rust: "Arc<dyn Fn(A) -> R + Send + Sync>", ts: "(a: A) => R", cpp: "std::function<R(A)>", haxe: "A->R", status: Status::Established, note: "Stored or returned capturing callback (D9); `FnMut` and `FnOnce` are also allowed; both thread-safety bounds are required" },
    Entry { rust: "&dyn Fn(A) -> R / &mut dyn FnMut(A) -> R", ts: "(a: A) => R", cpp: "const std::function<R(A)>& / std::function<R(A)>&", haxe: "A->R", status: Status::Established, note: "Borrowed callback parameter (D9); shared borrow for `Fn`, mutable borrow for `FnMut`" },
    Entry { rust: "fn(A) -> R", ts: "(a: A) => R", cpp: "R (*)(A)", haxe: "A->R", status: Status::Established, note: "Stateless function value (D9)" },
    Entry { rust: "Arc<T>", ts: "Readonly<T>", cpp: "std::shared_ptr<const T>", haxe: "T", status: Status::Established, note: "Immutable shared plain-record identity; T must itself be recognized vocabulary. Not Entity" },
    Entry { rust: "Ref<T>", ts: "T", cpp: "std::shared_ptr<T>", haxe: "T", status: Status::Established, note: "Shared object identity (A2, trial 2026-10-20): create_* returns it, dispose_* breaks cycles, memory frees at the last drop. Defined in flight-entity as Arc<RwLock<T>>: thread-safe by default (user 2026-10-20); swap the alias only if measurement shows a hot loop suffers" },
    Entry { rust: "WeakRef<T>", ts: "T | null", cpp: "std::weak_ptr<T>", haxe: "Null<T>", status: Status::Proposed, note: "Not for parent links: under A2 parents are strong, as in TS. Only for non-owning caches" },
    Entry { rust: "Handle<T>", ts: "T (object) or number", cpp: "handle / T*", haxe: "T", status: Status::Open, note: "Deferred: node-store option (D), revisit only if threading or bulk release requires it" },
    Entry { rust: "generic type parameter <T>", ts: "<T>", cpp: "template<typename T>", haxe: "<T>", status: Status::Established, note: "Bounds: only T: Entity (and Rust-only Default/Clone/lifetimes) — lint-enforced" },
    Entry { rust: "trait Entity / T: Entity", ts: "extends Entity / T extends Entity", cpp: "base class / template<typename T>", haxe: "interface / <T:Entity>", status: Status::Established, note: "D12/WP8b: the private runtime slot is reached through this trait; it is the only workspace trait bound in the vocabulary. Qualified paths (flight_entity::Entity) map the same way" },
    Entry { rust: "private runtime field (runtime: EntityRuntimeSlot)", ts: "[EntityRuntimeKey] slot", cpp: "private member", haxe: "private field", status: Status::Established, note: "D12/WP8b: never pub; `impl_entity!(T)` implements Entity for T and exposes the slot through entity_runtime/entity_runtime_mut" },
    Entry { rust: "async fn(A) -> T", ts: "async (a: A) => Promise<T>", cpp: "T (*)(A) [coroutine]", haxe: "A->futures.Future<T>", status: Status::Established, note: "Executor-neutral async (D15); no SDK spawning/runtime choice" },
    Entry { rust: "Pin<Box<dyn Future<Output=T> + Send>>", ts: "Promise<T>", cpp: "std::future<T>", haxe: "futures.Future<T>", status: Status::Established, note: "Boxed future return type (D15); required Send bound; used in async callback returns" },
    Entry { rust: "SharedFuture<T>", ts: "Promise<T>", cpp: "std::shared_future<T>", haxe: "futures.Future<T>", status: Status::Established, note: "D20 (user 2026-10-21): a TS Promise stored in a field; cloneable and executor-neutral, settles once and every clone observes the same result; defined in flight-stream over futures::future::Shared. Use Ref/Arc as the output when T is not Clone; returned promises stay async fn" },
    Entry { rust: "ReadableStream", ts: "ReadableStream<Uint8Array>", cpp: "byte read handle (e.g. std::shared_ptr<std::istream>)", haxe: "haxe.io.Input", status: Status::Established, note: "D20: flight-stream vocabulary over futures-io AsyncRead; the exclusive borrow is the lock, the caller buffer is BYOB, pull polling is backpressure, and drop cancels" },
    Entry { rust: "WritableStream", ts: "WritableStream<Uint8Array>", cpp: "byte write handle (e.g. std::shared_ptr<std::ostream>)", haxe: "haxe.io.Output", status: Status::Established, note: "D20: flight-stream vocabulary over futures-io AsyncWrite; the exclusive borrow is the lock, a partial write is backpressure, close is explicit and drop aborts" },
    Entry { rust: "AbortSignal / AbortController", ts: "AbortSignal / AbortController", cpp: "cancellation token / controller", haxe: "AbortSignal / AbortController", status: Status::Established, note: "Small shared cancellation primitive defined in flight-stream; plain data, not Entity" },
    Entry { rust: "(A, B) / (A, B, C) / (A, B, C, D)", ts: "readonly [A, B] / readonly [A, B, C] / readonly [A, B, C, D]", cpp: "std::pair / std::tuple", haxe: "Array<Dynamic>", status: Status::Established, note: "Fixed 2–4 element tuples of vocabulary types; unit tuple `()` is void (math #3)" },
    Entry { rust: "enum Scalar { Variant(primitive) }", ts: "number | string (scalar union)", cpp: "std::variant<int, std::string>", haxe: "Dynamic", status: Status::Established, note: "One primitive/scalar payload per variant; enum-payload-named exemption (binpack #5)" },
    Entry { rust: "Ref<dyn Node> / Ref<dyn Node2D> / Ref<dyn Node3D>", ts: "Node / Node2D / Node3D", cpp: "std::shared_ptr<Node> / …", haxe: "Node / Node2D / Node3D", status: Status::Established, note: "D16: node family trait objects; mixed children `Vec<Ref<dyn Node2D>>`; only declared family names accepted" },
    Entry { rust: "kind struct + Deref<Target = *Fields>", ts: "interface X extends Node2D", cpp: "class X : public Node2D", haxe: "class X extends Node2D", status: Status::Established, note: "D16: concrete kind (Sprite, Mesh, …) composes *Fields via Deref/DerefMut; data as separate pub field" },
    Entry { rust: "T: Node2D / T: Transform2DNode / T: BoundsNode", ts: "T extends Node2D / …", cpp: "template<typename T>", haxe: "<T:Node2D>", status: Status::Established, note: "D16: node family and feature traits as generic bounds; only declared trait names accepted" },
    Entry { rust: "Ref<dyn Adjustment> / &dyn Adjustment / T: Adjustment", ts: "Adjustment / T extends Adjustment", cpp: "std::shared_ptr<Adjustment> / template<typename T>", haxe: "Adjustment / <T:Adjustment>", status: Status::Established, note: "Adjustment family (principal batch 4, generalizes D16): kind structs Deref to AdjustmentFields; mixed stacks `Vec<Ref<dyn Adjustment>>`; only the declared family name accepted" },
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
    "String", "Kind", "AnySlot", "Unknown", "ProviderRef", "ArrayBuffer", "ArrayBufferView", "Blob", "AbortSignal", "AbortController", "Self", "Float32Array", "Float64Array", "Uint8Array", "Uint16Array",
    "Uint32Array", "Int8Array", "Int16Array", "Int32Array",
];
const CONTAINERS: &[&str] = &[
    "Option", "Vec", "HashMap", "HashSet", "Record", "Ref", "WeakRef", "Handle", "LazyLock",
];

/// Trait bounds a contract generic parameter may carry. `Entity` is the approved IR trait
/// (D12/WP8b); a qualified path such as `flight_entity::Entity` matches by its last segment.
/// `Default` and `Clone` are the Rust-only construction bounds already used by approved
/// contracts (`allocate_entity<T: Default>`, `pick<T: Clone>`) and have no TS mapping of their
/// own. The node family and feature traits (D16) and the adjustment family trait (principal
/// batch 4, generalizing D16) are also approved bounds.
const APPROVED_TYPE_PARAM_BOUNDS: &[&str] = &[
    "Entity", "Default", "Clone",
    "Node", "Node2D", "Node3D",
    "Transform2DNode", "BoundsNode",
    "Adjustment",
];

/// D16 node family traits, plus the adjustment family (principal batch 4), accepted as trait
/// objects in `Ref<dyn ...>`, `&dyn ...`, parameters, and mixed collections. Only these declared
/// names; arbitrary trait objects are rejected.
const APPROVED_NODE_TRAIT_OBJECTS: &[&str] = &["Node", "Node2D", "Node3D", "Adjustment"];

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
                "generic bound `{}` is not in the vocabulary (approved: `T: Entity`)",
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
            if name == "ReadableStream" || name == "WritableStream" {
                if !matches!(last.arguments, PathArguments::None) {
                    out.push(format!("`{}` takes no type arguments", name));
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
    fn accepts_the_d20_shared_future_and_stream_rows() {
        for ty in ["SharedFuture<Vector2>", "ReadableStream", "WritableStream"] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
        for name in ["SharedFuture<T>", "ReadableStream", "WritableStream"] {
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
    fn accepts_only_owned_numeric_array_boxes() {
        for ty in ["Box<[f32]>", "Box<Float32Array>", "Box<Uint16Array>"] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
        }
        for ty in ["Box<[Vector2]>", "Box<Vector2>", "Box<dyn Fn(f32) -> f32>", "Box<dyn Any>"] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
        assert_eq!(problems("Box<dyn Any>").len(), 2);
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
        ] {
            let item: syn::ItemFn = syn::parse_str(source).unwrap();
            assert!(!bound_problems(&item.sig.generics).is_empty(), "{} unexpectedly accepted", source);
        }
    }
}
