// Item C payload identity. A signal payload type is keyed by its bare name in the inventory, so
// every nominal type a payload names is first resolved to the crate that defines it: one type
// spelled `crate::types::KeyboardEventData`, `KeyboardEventData` or through an import is one
// identity, and two distinct types that share a name are rejected rather than merged into one
// wrapper.

use std::collections::{BTreeMap, BTreeSet};

// Names that are language, std or SDK container vocabulary rather than payload identities.
const BUILTIN_TYPE_NAMES: &[&str] = &[
    "Arc", "Box", "HashMap", "Option", "Ref", "RwLock", "Signal", "String", "Vec", "bool", "f32",
    "f64", "i8", "i16", "i32", "i64", "isize", "str", "u8", "u16", "u32", "u64", "usize",
];

/// The crate that defines one nominal payload type, written `flight-crate::Name`.
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct PayloadIdentity {
    pub krate: String,
    pub name: String,
}

/// What one source file can name: the owning crate, the names its `use` items import (name ->
/// defining crate), the external crates it glob-imports, and the type names each crate defines.
pub struct TypeScope<'a> {
    pub owner: &'a str,
    pub imports: &'a BTreeMap<String, String>,
    pub glob_crates: &'a [String],
    pub defined: &'a BTreeMap<String, BTreeSet<String>>,
}

/// Rejects a payload name that resolves to more than one defining type, and two payload names
/// that would produce one wrapper stem, naming both origins.
pub fn check_payload_identities(
    payloads: &BTreeMap<String, BTreeSet<PayloadIdentity>>,
    stem: impl Fn(&str) -> String,
) -> Result<(), String> {
    let mut problems = Vec::new();
    for (payload, identities) in payloads {
        let mut names: BTreeMap<&str, Vec<String>> = BTreeMap::new();
        for identity in identities {
            names
                .entry(identity.name.as_str())
                .or_default()
                .push(format!("{}::{}", identity.krate, identity.name));
        }
        for (name, origins) in names {
            if origins.len() > 1 {
                problems.push(format!(
                    "payload `{payload}` names distinct types called `{name}`: {}",
                    origins.join(" and ")
                ));
            }
        }
    }
    let mut stems: BTreeMap<String, &str> = BTreeMap::new();
    for payload in payloads.keys() {
        if let Some(other) = stems.insert(stem(payload), payload) {
            problems.push(format!(
                "payloads `{other}` and `{payload}` would share the wrapper stem `{}`",
                stem(payload)
            ));
        }
    }
    if problems.is_empty() {
        return Ok(());
    }
    return Err(problems.join("; "));
}

/// A field's declared type with every path reduced to its final name, for matching field shapes
/// (`Option<Ref<Signal<T>>>`) against a payload. Display only: payload identity is resolved and
/// checked by `resolve_payload`.
pub fn display_type_text(ty: &syn::Type) -> String {
    match ty {
        syn::Type::Path(path) if path.qself.is_none() => {
            let last = path.path.segments.last().unwrap();
            let mut out = last.ident.to_string();
            if let syn::PathArguments::AngleBracketed(arguments) = &last.arguments {
                let parts: Vec<String> = arguments
                    .args
                    .iter()
                    .map(|argument| match argument {
                        syn::GenericArgument::Type(inner) => display_type_text(inner),
                        other => compact_type_text(&quote::quote!(#other).to_string()),
                    })
                    .collect();
                out.push('<');
                out.push_str(&parts.join(", "));
                out.push('>');
            }
            return out;
        }
        syn::Type::Tuple(tuple) => {
            let parts: Vec<String> = tuple.elems.iter().map(display_type_text).collect();
            return format!("({})", parts.join(", "));
        }
        syn::Type::Reference(reference) => {
            return format!("&{}", display_type_text(&reference.elem));
        }
        syn::Type::Paren(paren) => return display_type_text(&paren.elem),
        other => return compact_type_text(&quote::quote!(#other).to_string()),
    }
}

/// Imports and glob-imported external crates declared by one file's `use` items.
pub fn collect_file_imports(
    file: &syn::File,
    owner: &str,
) -> (BTreeMap<String, String>, Vec<String>) {
    let mut imports = BTreeMap::new();
    let mut globs = Vec::new();
    for item in &file.items {
        if let syn::Item::Use(item) = item {
            collect_use_tree(&item.tree, &mut Vec::new(), owner, &mut imports, &mut globs);
        }
    }
    return (imports, globs);
}

/// The type names one crate defines at any module level (struct, enum, union, type alias).
pub fn collect_defined_type_names(files: &[syn::File]) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    for file in files {
        for item in &file.items {
            match item {
                syn::Item::Struct(item) => {
                    names.insert(item.ident.to_string());
                }
                syn::Item::Enum(item) => {
                    names.insert(item.ident.to_string());
                }
                syn::Item::Union(item) => {
                    names.insert(item.ident.to_string());
                }
                syn::Item::Type(item) => {
                    names.insert(item.ident.to_string());
                }
                _ => {}
            }
        }
    }
    return names;
}

/// Resolves every nominal type `ty` names; the enclosing function's own type parameters are not
/// nominal types. Returns the type's display text with each path reduced
/// to its resolved name, and the identities it names; a name no rule resolves is an error, never
/// a guess.
pub fn resolve_payload(
    ty: &syn::Type,
    scope: &TypeScope,
    generics: &BTreeSet<String>,
) -> Result<(String, BTreeSet<PayloadIdentity>), String> {
    let mut identities = BTreeSet::new();
    let text = display_type(ty, scope, generics, &mut identities)?;
    return Ok((text, identities));
}

fn collect_use_tree(
    tree: &syn::UseTree,
    prefix: &mut Vec<String>,
    owner: &str,
    imports: &mut BTreeMap<String, String>,
    globs: &mut Vec<String>,
) {
    match tree {
        syn::UseTree::Path(path) => {
            prefix.push(path.ident.to_string());
            collect_use_tree(&path.tree, prefix, owner, imports, globs);
            prefix.pop();
        }
        syn::UseTree::Name(name) => {
            if let Some(krate) = path_crate(prefix, owner) {
                imports.insert(name.ident.to_string(), krate);
            }
        }
        syn::UseTree::Rename(rename) => {
            if let Some(krate) = path_crate(prefix, owner) {
                imports.insert(rename.rename.to_string(), krate);
            }
        }
        syn::UseTree::Glob(_) => {
            if let Some(krate) = path_crate(prefix, owner)
                && krate != owner
            {
                globs.push(krate);
            }
        }
        syn::UseTree::Group(group) => {
            for item in &group.items {
                collect_use_tree(item, prefix, owner, imports, globs);
            }
        }
    }
}

fn display_type(
    ty: &syn::Type,
    scope: &TypeScope,
    generics: &BTreeSet<String>,
    identities: &mut BTreeSet<PayloadIdentity>,
) -> Result<String, String> {
    match ty {
        syn::Type::Path(path) if path.qself.is_none() => {
            let segments: Vec<String> = path
                .path
                .segments
                .iter()
                .map(|segment| segment.ident.to_string())
                .collect();
            let last = path.path.segments.last().unwrap();
            let name = last.ident.to_string();
            let generic = segments.len() == 1 && generics.contains(&name);
            if !generic && !BUILTIN_TYPE_NAMES.contains(&name.as_str()) {
                identities.insert(PayloadIdentity {
                    krate: resolve_name(&segments, scope)?,
                    name: name.clone(),
                });
            }
            let mut out = name;
            if let syn::PathArguments::AngleBracketed(arguments) = &last.arguments {
                let mut parts = Vec::new();
                for argument in &arguments.args {
                    match argument {
                        syn::GenericArgument::Type(inner) => {
                            parts.push(display_type(inner, scope, generics, identities)?)
                        }
                        other => {
                            return Err(format!(
                                "unsupported payload generic `{}`",
                                quote::quote!(#other)
                            ));
                        }
                    }
                }
                out.push('<');
                out.push_str(&parts.join(", "));
                out.push('>');
            }
            return Ok(out);
        }
        syn::Type::Tuple(tuple) => {
            let mut parts = Vec::new();
            for element in &tuple.elems {
                parts.push(display_type(element, scope, generics, identities)?);
            }
            return Ok(format!("({})", parts.join(", ")));
        }
        syn::Type::Reference(reference) => {
            let inner = display_type(&reference.elem, scope, generics, identities)?;
            return Ok(format!("&{inner}"));
        }
        syn::Type::Paren(paren) => return display_type(&paren.elem, scope, generics, identities),
        other => return Ok(compact_type_text(&quote::quote!(#other).to_string())),
    }
}

fn path_crate(prefix: &[String], owner: &str) -> Option<String> {
    let first = prefix.first()?;
    if first == "crate" || first == "self" || first == "super" {
        return Some(owner.to_string());
    }
    return first
        .starts_with("flight_")
        .then(|| first.replace('_', "-"));
}

fn resolve_name(segments: &[String], scope: &TypeScope) -> Result<String, String> {
    let name = segments.last().unwrap();
    if segments.len() > 1 {
        if let Some(krate) = path_crate(segments, scope.owner) {
            return Ok(krate);
        }
        // A module path inside the owning crate (`types::Foo`), or one rooted at an imported
        // crate alias.
        if let Some(krate) = scope.imports.get(&segments[0]) {
            return Ok(krate.clone());
        }
        return Ok(scope.owner.to_string());
    }
    if let Some(krate) = scope.imports.get(name) {
        return Ok(krate.clone());
    }
    if scope
        .defined
        .get(scope.owner)
        .is_some_and(|names| names.contains(name))
    {
        return Ok(scope.owner.to_string());
    }
    let mut candidates: Vec<&String> = scope
        .glob_crates
        .iter()
        .filter(|krate| {
            scope
                .defined
                .get(krate.as_str())
                .is_some_and(|names| names.contains(name))
        })
        .collect();
    candidates.dedup();
    match candidates.as_slice() {
        [krate] => return Ok((*krate).clone()),
        [] => {
            return Err(format!(
                "payload type `{name}` in {} resolves to no defining crate",
                scope.owner
            ));
        }
        many => {
            return Err(format!(
                "payload type `{name}` in {} is glob-imported from several crates: {many:?}",
                scope.owner
            ));
        }
    }
}

// `Ref < Signal < () > >` -> `Ref<Signal<()>>`: token text without the spacing `quote` inserts.
fn compact_type_text(text: &str) -> String {
    let mut out = text.split_whitespace().collect::<Vec<_>>().join(" ");
    for (from, to) in [
        (" <", "<"),
        ("< ", "<"),
        (" >", ">"),
        (" ,", ","),
        (" :: ", "::"),
        (":: ", "::"),
        (" ::", "::"),
        ("& ", "&"),
        ("( ", "("),
        (" )", ")"),
    ] {
        while out.contains(from) {
            out = out.replace(from, to);
        }
    }
    out
}
