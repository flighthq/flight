//! The IR vocabulary: the closed set of Rust constructs the contract may use, each with exactly
//! one mapping per transpile target. This table is the single source for both the
//! `contract-vocabulary` rule and `cargo flight-lint vocabulary` (agents/ir-vocabulary.md).

use std::collections::HashSet;

use syn::{GenericArgument, PathArguments, ReturnType, Type};

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
    Entry { rust: "i64 u64", ts: "number", cpp: "int64_t / uint64_t", haxe: "haxe.Int64", status: Status::Open, note: "TS `number` is exact only to 2^53; needs `bigint` or a range rule" },
    Entry { rust: "()", ts: "void", cpp: "void", haxe: "Void", status: Status::Established, note: "Return type only" },
    Entry { rust: "String", ts: "string", cpp: "std::string", haxe: "String", status: Status::Proposed, note: "Owned text" },
    Entry { rust: "&str", ts: "string", cpp: "std::string_view", haxe: "String", status: Status::Proposed, note: "Borrowed text; `&'static str` for constants" },
    Entry { rust: "Kind", ts: "Kind (= string)", cpp: "std::string", haxe: "String", status: Status::Proposed, note: "Alias for `String`; object identity tag (D2)" },
    Entry { rust: "struct (named fields)", ts: "interface + create_* fn", cpp: "struct", haxe: "class", status: Status::Established, note: "Value type when held inline: assignment is a copy in every target" },
    Entry { rust: "&T", ts: "Readonly<T>", cpp: "const T&", haxe: "T", status: Status::Established, note: "Parameters" },
    Entry { rust: "&mut T", ts: "T", cpp: "T&", haxe: "T", status: Status::Established, note: "Parameters; `out` first, alias-safe" },
    Entry { rust: "Option<T>", ts: "T | null", cpp: "std::optional<T> (pointer for Ref)", haxe: "Null<T>", status: Status::Established, note: "" },
    Entry { rust: "Vec<T>", ts: "T[]", cpp: "std::vector<T>", haxe: "Array<T>", status: Status::Established, note: "Growable (user 2026-10-20): `Vec<f32>` → `number[]`. Also the type for iterated collections (D3)" },
    Entry { rust: "&mut [N] / [N; LEN] (N numeric)", ts: "Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array", cpp: "std::span<N> / std::array<N, LEN>", haxe: "haxe.io.Float32Array etc.", status: Status::Established, note: "Fixed length (user 2026-10-20): the typed array is picked by element type. `usize`/`bool` slices have no typed array (open)" },
    Entry { rust: "Box<[N]> (N numeric)", ts: "the matching typed array", cpp: "std::unique_ptr<N[]> + length", haxe: "haxe.io.Float32Array etc.", status: Status::Proposed, note: "Owned, fixed length set at creation (vertex data, pixels, index buffers)" },
    Entry { rust: "&[N] (N numeric, read-only)", ts: "ArrayLike<number>", cpp: "std::span<const N>", haxe: "haxe.io.Float32Array etc.", status: Status::Established, note: "Read-only input accepts either array kind (user 2026-10-20); keeps APIs reusable. Outputs and owned storage stay concrete" },
    Entry { rust: "&[T] / &mut [T] / [T; LEN] (T non-numeric)", ts: "readonly T[] / T[]", cpp: "std::span<const T> / std::span<T> / std::array", haxe: "Array<T>", status: Status::Proposed, note: "No typed array exists for structs or strings" },
    Entry { rust: "HashMap<K, V>", ts: "Map<K, V>", cpp: "std::unordered_map<K, V>", haxe: "Map<K, V>", status: Status::Established, note: "Lookup only; never iterated (D3)" },
    Entry { rust: "HashSet<T>", ts: "Set<T>", cpp: "std::unordered_set<T>", haxe: "Map<T, Bool>", status: Status::Proposed, note: "Membership only; never iterated (D3)" },
    Entry { rust: "C-like enum", ts: "string-literal union / const", cpp: "enum class", haxe: "enum abstract", status: Status::Open, note: "TS literal values vary ('Sprite', 'aabb', 'linear'); needs a declared string table" },
    Entry { rust: "data enum (one named struct per variant)", ts: "discriminated union", cpp: "std::variant<…>", haxe: "enum", status: Status::Proposed, note: "Closed sets only; open sets use Kind + dispatch tables (D2)" },
    Entry { rust: "EntitySlot", ts: "unknown (read via get_*_data cast)", cpp: "std::any", haxe: "Dynamic", status: Status::Proposed, note: "Alias for `Option<Box<dyn Any + Send + Sync>>`; the only erased type (D2)" },
    Entry { rust: "fn(A) -> R", ts: "(a: A) => R", cpp: "R (*)(A)", haxe: "A->R", status: Status::Proposed, note: "Stateless function values (e.g. easing)" },
    Entry { rust: "Callback<A, R>", ts: "(a: A) => R", cpp: "std::function<R(A)>", haxe: "A->R", status: Status::Proposed, note: "Alias for `Arc<dyn Fn(A) -> R + Send + Sync>`; function values that capture (renderer objects, slots, test spies)" },
    Entry { rust: "Ref<T>", ts: "T", cpp: "std::shared_ptr<T>", haxe: "T", status: Status::Established, note: "Shared object identity (A2, trial 2026-10-20): create_* returns it, dispose_* breaks cycles, memory frees at the last drop. Backing (Rc<RefCell> vs Arc<RwLock>) open" },
    Entry { rust: "WeakRef<T>", ts: "T | null", cpp: "std::weak_ptr<T>", haxe: "Null<T>", status: Status::Proposed, note: "Not for parent links: under A2 parents are strong, as in TS. Only for non-owning caches" },
    Entry { rust: "Handle<T>", ts: "T (object) or number", cpp: "handle / T*", haxe: "T", status: Status::Open, note: "Deferred: node-store option (D), revisit only if threading or bulk release requires it" },
    Entry { rust: "generic type parameter <T>", ts: "<T>", cpp: "template<typename T>", haxe: "<T>", status: Status::Proposed, note: "" },
    Entry { rust: "pub const / pub static LazyLock<T>", ts: "export const", cpp: "inline constexpr / static", haxe: "static final", status: Status::Proposed, note: "Immutable only (D5)" },
];

const PRIMITIVES: &[&str] = &[
    "f32", "f64", "bool", "i8", "i16", "i32", "u8", "u16", "u32", "usize", "char", "str",
];
const RESTRICTED_INTS: &[&str] = &["i64", "u64", "i128", "u128", "isize"];
const LEAF_NAMES: &[&str] = &["String", "Kind", "EntitySlot", "Self"];
const CONTAINERS: &[&str] = &[
    "Option", "Vec", "HashMap", "HashSet", "Ref", "WeakRef", "Callback", "Handle", "LazyLock",
];

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
        Type::Reference(r) => walk(&r.elem, known, generics, out),
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
        Type::TraitObject(_) => out.push(String::from(
            "`dyn Trait` is not in the vocabulary (use EntitySlot or Callback)",
        )),
        Type::ImplTrait(_) => out.push(String::from("`impl Trait` is not in the vocabulary")),
        Type::Ptr(_) => out.push(String::from("raw pointers are not in the vocabulary")),
        Type::Path(p) => {
            let Some(last) = p.path.segments.last() else {
                return;
            };
            let name = last.ident.to_string();
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
            "f32", "&mut Vector2", "Option<Vec<Vector2>>", "&[f32]", "[f32; 16]", "HashMap<Kind, Callback<f32, bool>>",
            "Ref<Vector2>", "EntitySlot", "fn(f32) -> f32", "&'static str", "T", "()",
        ] {
            assert!(problems(ty).is_empty(), "{} -> {:?}", ty, problems(ty));
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
}
