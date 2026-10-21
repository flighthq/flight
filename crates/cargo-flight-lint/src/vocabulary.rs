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
    Entry { rust: "&mut [N] / [N; LEN] (N numeric)", ts: "Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array", cpp: "std::span<N> / std::array<N, LEN>", haxe: "haxe.io.Float32Array etc.", status: Status::Established, note: "Fixed length (user 2026-10-20): the typed array is picked by element type. `usize`/`bool` slices have no typed array (open)" },
    Entry { rust: "Box<[N]> (N numeric)", ts: "the matching typed array", cpp: "std::unique_ptr<N[]> + length", haxe: "haxe.io.Float32Array etc.", status: Status::Established, note: "Owned, fixed length set at creation (vertex data, pixels, index buffers); user 2026-10-20" },
    Entry { rust: "&Vec<N> (read-only)", ts: "readonly number[]", cpp: "const std::vector<N>&", haxe: "Array<N>", status: Status::Established, note: "Input that must be a plain array (user 2026-10-20: specific over permissive). Workspace allows clippy::ptr_arg" },
    Entry { rust: "Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array (aliases of [f32] etc., defined in flight-entity)", ts: "the same typed array", cpp: "std::span<N>", haxe: "haxe.io.Float32Array etc.", status: Status::Established, note: "For a TS API that declares a typed array: `&Float32Array` → `Readonly<Float32Array>` while Rust still accepts any f32 slice; `&mut Float32Array` / `Box<Float32Array>` also allowed. Specific in TS, idiomatic in Rust" },
    Entry { rust: "&[N] (N numeric, read-only)", ts: "ArrayLike<number>", cpp: "std::span<const N>", haxe: "haxe.io.Float32Array etc.", status: Status::Established, note: "Input that is deliberately general: accepts either array kind (user 2026-10-20). Use it only when general is intended; prefer the specific forms" },
    Entry { rust: "&[T] / &mut [T] / [T; LEN] (T non-numeric)", ts: "readonly T[] / T[]", cpp: "std::span<const T> / std::span<T> / std::array", haxe: "Array<T>", status: Status::Established, note: "No typed array exists for structs or strings" },
    Entry { rust: "HashMap<K, V>", ts: "Map<K, V>", cpp: "std::unordered_map<K, V>", haxe: "Map<K, V>", status: Status::Established, note: "Lookup only; never iterated (D3)" },
    Entry { rust: "HashSet<T>", ts: "Set<T>", cpp: "std::unordered_set<T>", haxe: "Map<T, Bool>", status: Status::Established, note: "Membership only; never iterated (D3)" },
    Entry { rust: "C-like enum", ts: "string-literal union / const", cpp: "enum class", haxe: "enum abstract", status: Status::Established, note: "String table via get_<enum>_string / parse_<enum> free functions; strings exactly as TS (D9e)" },
    Entry { rust: "data enum (one named struct per variant)", ts: "discriminated union", cpp: "std::variant<…>", haxe: "enum", status: Status::Established, note: "Closed sets only; open sets use Kind + dispatch tables (D2)" },
    Entry { rust: "AnySlot", ts: "unknown (read via get_*_data cast)", cpp: "std::any", haxe: "Dynamic", status: Status::Established, note: "Alias for `Option<Box<dyn Any + Send + Sync>>`, defined in flight-entity; the only erased type (D2)" },
    Entry { rust: "Arc<dyn Fn(A) -> R + Send + Sync>", ts: "(a: A) => R", cpp: "std::function<R(A)>", haxe: "A->R", status: Status::Established, note: "Stored or returned capturing callback (D9); `FnMut` and `FnOnce` are also allowed; both thread-safety bounds are required" },
    Entry { rust: "&dyn Fn(A) -> R / &mut dyn FnMut(A) -> R", ts: "(a: A) => R", cpp: "const std::function<R(A)>& / std::function<R(A)>&", haxe: "A->R", status: Status::Established, note: "Borrowed callback parameter (D9); shared borrow for `Fn`, mutable borrow for `FnMut`" },
    Entry { rust: "fn(A) -> R", ts: "(a: A) => R", cpp: "R (*)(A)", haxe: "A->R", status: Status::Established, note: "Stateless function value (D9)" },
    Entry { rust: "Ref<T>", ts: "T", cpp: "std::shared_ptr<T>", haxe: "T", status: Status::Established, note: "Shared object identity (A2, trial 2026-10-20): create_* returns it, dispose_* breaks cycles, memory frees at the last drop. Defined in flight-entity as Arc<RwLock<T>>: thread-safe by default (user 2026-10-20); swap the alias only if measurement shows a hot loop suffers" },
    Entry { rust: "WeakRef<T>", ts: "T | null", cpp: "std::weak_ptr<T>", haxe: "Null<T>", status: Status::Proposed, note: "Not for parent links: under A2 parents are strong, as in TS. Only for non-owning caches" },
    Entry { rust: "Handle<T>", ts: "T (object) or number", cpp: "handle / T*", haxe: "T", status: Status::Open, note: "Deferred: node-store option (D), revisit only if threading or bulk release requires it" },
    Entry { rust: "generic type parameter <T>", ts: "<T>", cpp: "template<typename T>", haxe: "<T>", status: Status::Established, note: "Bounds: only T: Entity (and Rust-only Default/Clone/lifetimes) — lint-enforced" },
    Entry { rust: "trait Entity / T: Entity", ts: "extends Entity / T extends Entity", cpp: "base class / template<typename T>", haxe: "interface / <T:Entity>", status: Status::Established, note: "D12/WP8b: the private runtime slot is reached through this trait; it is the only workspace trait bound in the vocabulary. Qualified paths (flight_entity::Entity) map the same way" },
    Entry { rust: "private runtime field (runtime: EntityRuntimeSlot)", ts: "[EntityRuntimeKey] slot", cpp: "private member", haxe: "private field", status: Status::Established, note: "D12/WP8b: never pub; `impl_entity!(T)` implements Entity for T and exposes the slot through entity_runtime/entity_runtime_mut" },
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
    "String", "Kind", "AnySlot", "Self", "Float32Array", "Float64Array", "Uint8Array", "Uint16Array",
    "Uint32Array", "Int8Array", "Int16Array", "Int32Array",
];
const CONTAINERS: &[&str] = &[
    "Option", "Vec", "HashMap", "HashSet", "Ref", "WeakRef", "Handle", "LazyLock",
];

/// Trait bounds a contract generic parameter may carry. `Entity` is the approved IR trait
/// (D12/WP8b); a qualified path such as `flight_entity::Entity` matches by its last segment.
/// `Default` and `Clone` are the Rust-only construction bounds already used by approved
/// contracts (`allocate_entity<T: Default>`, `pick<T: Clone>`) and have no TS mapping of their
/// own. Nothing else is accepted: generic trait bounds are otherwise outside the vocabulary.
const APPROVED_TYPE_PARAM_BOUNDS: &[&str] = &["Entity", "Default", "Clone"];

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
            if !t.elems.is_empty() {
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
            "Ref<Vector2>", "AnySlot", "fn(f32) -> f32", "&'static str", "T", "()",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
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
            "Arc<dyn Fn(Unknown) -> f32 + Send + Sync>",
            "Arc<dyn Fn(f32) -> (f32, f32) + Send + Sync>",
            "&dyn Fn(Option<Unknown>) -> f32",
            "&mut dyn FnMut(f32) -> Rc<Vector2>",
            "fn(Unknown) -> Vector2",
        ] {
            assert!(!problems(ty).is_empty(), "{} unexpectedly accepted", ty);
        }
    }

    #[test]
    fn rejects_non_vocabulary_types() {
        assert_eq!(problems("Rc<RefCell<Vector2>>").len(), 2);
        assert_eq!(problems("Box<dyn Any>").len(), 2);
        assert_eq!(problems("(f32, f32)").len(), 1);
        assert_eq!(problems("u64").len(), 1);
        assert_eq!(problems("Unknown").len(), 1);
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
