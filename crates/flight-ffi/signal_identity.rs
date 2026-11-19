// Item C payload identity. A signal payload type is keyed by its bare name in the inventory, so
// every nominal type a payload names is first resolved to the crate and module that define it:
// one type spelled `crate::types::KeyboardEventData`, `KeyboardEventData` or through an import is
// one identity, two distinct types that share a name are rejected rather than merged into one
// wrapper, and a path no definition backs is an error rather than a guess.

use std::collections::{BTreeMap, BTreeSet};

// Names that are language, std or SDK container vocabulary rather than payload identities.
const BUILTIN_TYPE_NAMES: &[&str] = &[
    "Arc", "Box", "Fn", "FnMut", "FnOnce", "HashMap", "Option", "Ref", "RwLock", "Send", "Signal",
    "String", "Sync", "Vec", "bool", "f32", "f64", "i8", "i16", "i32", "i64", "isize", "str", "u8",
    "u16", "u32", "u64", "usize",
];

// Paths rooted here name language or std items, never payload identities.
const STD_CRATES: &[&str] = &["alloc", "core", "std"];

/// The type names one crate defines, by module path (`""` is the crate root, then `types`,
/// `a::b`).
#[derive(Clone, Debug, Default)]
pub struct CrateTypes {
    pub modules: BTreeMap<String, BTreeSet<String>>,
}

/// The crate that defines one nominal payload type, written `flight-crate::Name`.
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct PayloadIdentity {
    pub krate: String,
    pub name: String,
}

/// What one source file can name: its crate and module, the names its `use` items bind (name ->
/// absolute path `[crate, modules.., item]`), the absolute module paths it glob-imports, and the
/// types every crate defines.
pub struct TypeScope<'a> {
    pub owner: &'a str,
    pub module: &'a str,
    pub imports: &'a BTreeMap<String, Vec<String>>,
    pub globs: &'a [Vec<String>],
    pub defined: &'a BTreeMap<String, CrateTypes>,
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

/// The type names each module of one crate defines, from its parsed source files keyed by module
/// path. Structs, enums, unions and type aliases count at any visibility.
pub fn collect_crate_types(files: &[(String, syn::File)]) -> CrateTypes {
    let mut out = CrateTypes::default();
    for (module, file) in files {
        let names = out.modules.entry(module.clone()).or_default();
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
    return out;
}

/// The names one file's `use` items bind, as absolute paths, and the modules it glob-imports.
pub fn collect_file_imports(
    file: &syn::File,
    owner: &str,
    module: &str,
) -> (BTreeMap<String, Vec<String>>, Vec<Vec<String>>) {
    let mut imports = BTreeMap::new();
    let mut globs = Vec::new();
    for item in &file.items {
        if let syn::Item::Use(item) = item {
            collect_use_tree(
                &item.tree,
                &mut Vec::new(),
                owner,
                module,
                &mut imports,
                &mut globs,
            );
        }
    }
    return (imports, globs);
}

/// A field's declared type with every path reduced to its final name, for matching field shapes
/// (`Option<Ref<Signal<T>>>`) against a payload. Display only: payload identity is resolved and
/// checked by `resolve_payload`. An unsupported type form is an error.
pub fn display_type_text(ty: &syn::Type) -> Result<String, String> {
    return render_type(ty, &mut |_| Ok(()));
}

/// Resolves every nominal type `ty` names; `generics` are the enclosing item's own type
/// parameters, which are not nominal types. Returns the type's display text and the identities it
/// names. A name no definition backs, and a type form that cannot be resolved, are errors.
pub fn resolve_payload(
    ty: &syn::Type,
    scope: &TypeScope,
    generics: &BTreeSet<String>,
) -> Result<(String, BTreeSet<PayloadIdentity>), String> {
    let mut identities = BTreeSet::new();
    let text = render_type(ty, &mut |segments| {
        let name = segments.last().unwrap();
        if segments.len() == 1
            && (generics.contains(name) || BUILTIN_TYPE_NAMES.contains(&name.as_str()))
        {
            return Ok(());
        }
        if let Some(identity) = resolve_name(segments, scope)? {
            identities.insert(identity);
        }
        return Ok(());
    })?;
    return Ok((text, identities));
}

/// The type parameter names an item declares (`struct Holder<T>` or `fn f<T>()` -> `{T}`).
pub fn type_parameter_names(generics: &syn::Generics) -> BTreeSet<String> {
    return generics
        .type_params()
        .map(|param| param.ident.to_string())
        .collect();
}

// `[crate, modules..]` for a path written from `crate`, `self`, `super` or a Flight crate inside
// `owner::module`; `None` for any other root.
fn absolute_module(owner: &str, module: &str, prefix: &[String]) -> Option<Vec<String>> {
    let first = prefix.first()?;
    let mut path: Vec<String> = match first.as_str() {
        "crate" => vec![owner.to_string()],
        "self" => std::iter::once(owner.to_string())
            .chain(module_segments(module))
            .collect(),
        "super" => {
            let mut segments: Vec<String> = module_segments(module).collect();
            segments.pop()?;
            std::iter::once(owner.to_string()).chain(segments).collect()
        }
        other if other.starts_with("flight_") => vec![other.replace('_', "-")],
        _ => return None,
    };
    path.extend(prefix[1..].iter().cloned());
    return Some(path);
}

fn collect_use_tree(
    tree: &syn::UseTree,
    prefix: &mut Vec<String>,
    owner: &str,
    module: &str,
    imports: &mut BTreeMap<String, Vec<String>>,
    globs: &mut Vec<Vec<String>>,
) {
    match tree {
        syn::UseTree::Path(path) => {
            prefix.push(path.ident.to_string());
            collect_use_tree(&path.tree, prefix, owner, module, imports, globs);
            prefix.pop();
        }
        syn::UseTree::Name(name) => {
            prefix.push(name.ident.to_string());
            if let Some(path) = absolute_module(owner, module, prefix) {
                imports.insert(name.ident.to_string(), path);
            }
            prefix.pop();
        }
        syn::UseTree::Rename(rename) => {
            prefix.push(rename.ident.to_string());
            if let Some(path) = absolute_module(owner, module, prefix) {
                imports.insert(rename.rename.to_string(), path);
            }
            prefix.pop();
        }
        syn::UseTree::Glob(_) => {
            if let Some(path) = absolute_module(owner, module, prefix) {
                globs.push(path);
            }
        }
        syn::UseTree::Group(group) => {
            for item in &group.items {
                collect_use_tree(item, prefix, owner, module, imports, globs);
            }
        }
    }
}

// Whether `path` (`[crate, modules.., name]`) names a type its crate defines. A path straight
// under the crate (`flight_input::InputPointerData`) is a root re-export of a type the crate
// defines in some module.
fn defines(path: &[String], defined: &BTreeMap<String, CrateTypes>) -> bool {
    let Some(krate) = defined.get(&path[0]) else {
        return false;
    };
    let name = path.last().unwrap();
    if path.len() == 2 {
        return krate.modules.values().any(|names| names.contains(name));
    }
    let module = path[1..path.len() - 1].join("::");
    return krate
        .modules
        .get(&module)
        .is_some_and(|names| names.contains(name));
}

fn module_segments(module: &str) -> impl Iterator<Item = String> + '_ {
    return module
        .split("::")
        .filter(|segment| !segment.is_empty())
        .map(str::to_string);
}

fn render_bound(
    bound: &syn::TypeParamBound,
    visit: &mut dyn FnMut(&[String]) -> Result<(), String>,
) -> Result<Option<String>, String> {
    match bound {
        syn::TypeParamBound::Trait(trait_bound) => {
            return Ok(Some(render_path(&trait_bound.path, visit)?));
        }
        syn::TypeParamBound::Lifetime(_) => return Ok(None),
        other => {
            return Err(format!(
                "unsupported bound `{}` in a signal type",
                quote::quote!(#other)
            ));
        }
    }
}

fn render_path(
    path: &syn::Path,
    visit: &mut dyn FnMut(&[String]) -> Result<(), String>,
) -> Result<String, String> {
    let segments: Vec<String> = path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect();
    visit(&segments)?;
    let last = path.segments.last().unwrap();
    let mut out = last.ident.to_string();
    match &last.arguments {
        syn::PathArguments::None => {}
        syn::PathArguments::AngleBracketed(arguments) => {
            let mut parts = Vec::new();
            for argument in &arguments.args {
                match argument {
                    syn::GenericArgument::Type(inner) => parts.push(render_type(inner, visit)?),
                    syn::GenericArgument::Lifetime(_) => {}
                    other => {
                        return Err(format!(
                            "unsupported generic argument `{}` in a signal type",
                            quote::quote!(#other)
                        ));
                    }
                }
            }
            out.push('<');
            out.push_str(&parts.join(", "));
            out.push('>');
        }
        syn::PathArguments::Parenthesized(arguments) => {
            let mut inputs = Vec::new();
            for input in &arguments.inputs {
                inputs.push(render_type(input, visit)?);
            }
            out.push_str(&format!("({})", inputs.join(", ")));
            if let syn::ReturnType::Type(_, output) = &arguments.output {
                out.push_str(&format!(" -> {}", render_type(output, visit)?));
            }
        }
    }
    return Ok(out);
}

// Renders `ty` with paths reduced to their final names, calling `visit` with every nominal path's
// segments. Every form that can hold a nominal type is walked; any other form is an error.
fn render_type(
    ty: &syn::Type,
    visit: &mut dyn FnMut(&[String]) -> Result<(), String>,
) -> Result<String, String> {
    match ty {
        syn::Type::Path(path) if path.qself.is_none() => return render_path(&path.path, visit),
        syn::Type::Tuple(tuple) => {
            let mut parts = Vec::new();
            for element in &tuple.elems {
                parts.push(render_type(element, visit)?);
            }
            return Ok(format!("({})", parts.join(", ")));
        }
        syn::Type::Reference(reference) => {
            let mutability = if reference.mutability.is_some() {
                "mut "
            } else {
                ""
            };
            return Ok(format!(
                "&{mutability}{}",
                render_type(&reference.elem, visit)?
            ));
        }
        syn::Type::Ptr(pointer) => {
            let kind = if pointer.mutability.is_some() {
                "mut"
            } else {
                "const"
            };
            return Ok(format!("*{kind} {}", render_type(&pointer.elem, visit)?));
        }
        syn::Type::Slice(slice) => return Ok(format!("[{}]", render_type(&slice.elem, visit)?)),
        syn::Type::Array(array) => {
            let length = &array.len;
            return Ok(format!(
                "[{}; {}]",
                render_type(&array.elem, visit)?,
                quote::quote!(#length)
            ));
        }
        syn::Type::Paren(paren) => return render_type(&paren.elem, visit),
        syn::Type::Group(group) => return render_type(&group.elem, visit),
        syn::Type::BareFn(function) => {
            let mut inputs = Vec::new();
            for input in &function.inputs {
                inputs.push(render_type(&input.ty, visit)?);
            }
            let mut out = format!("fn({})", inputs.join(", "));
            if let syn::ReturnType::Type(_, output) = &function.output {
                out.push_str(&format!(" -> {}", render_type(output, visit)?));
            }
            return Ok(out);
        }
        syn::Type::TraitObject(object) => {
            let mut bounds = Vec::new();
            for bound in &object.bounds {
                bounds.extend(render_bound(bound, visit)?);
            }
            return Ok(format!("dyn {}", bounds.join(" + ")));
        }
        syn::Type::ImplTrait(implementation) => {
            let mut bounds = Vec::new();
            for bound in &implementation.bounds {
                bounds.extend(render_bound(bound, visit)?);
            }
            return Ok(format!("impl {}", bounds.join(" + ")));
        }
        other => {
            return Err(format!(
                "unsupported type form `{}` in a signal type",
                quote::quote!(#other)
            ));
        }
    }
}

fn resolve_name(segments: &[String], scope: &TypeScope) -> Result<Option<PayloadIdentity>, String> {
    let spelled = segments.join("::");
    let name = segments.last().unwrap();
    if STD_CRATES.contains(&segments[0].as_str()) {
        if BUILTIN_TYPE_NAMES.contains(&name.as_str()) {
            return Ok(None);
        }
        return Err(format!(
            "`{spelled}` in {} is a std type with no payload identity",
            scope.owner
        ));
    }
    let path = if let Some(imported) = scope.imports.get(&segments[0]) {
        imported.iter().chain(&segments[1..]).cloned().collect()
    } else if segments.len() > 1 {
        absolute_module(scope.owner, scope.module, segments).ok_or_else(|| {
            format!(
                "`{spelled}` in {} is not rooted at an import, `crate`, `self`, `super` or a Flight crate",
                scope.owner
            )
        })?
    } else {
        resolve_bare_name(name, scope)?
    };
    if !defines(&path, scope.defined) {
        return Err(format!(
            "`{spelled}` in {} resolves to `{}`, which defines no such type",
            scope.owner,
            path.join("::")
        ));
    }
    return Ok(Some(PayloadIdentity {
        krate: path[0].clone(),
        name: name.clone(),
    }));
}

// A bare name names a type its own module defines, or the one type exactly one glob import
// brings in; anything else is unresolved.
fn resolve_bare_name(name: &str, scope: &TypeScope) -> Result<Vec<String>, String> {
    let local: Vec<String> = std::iter::once(scope.owner.to_string())
        .chain(module_segments(scope.module))
        .chain(std::iter::once(name.to_string()))
        .collect();
    let local_defined = scope
        .defined
        .get(scope.owner)
        .and_then(|krate| krate.modules.get(scope.module))
        .is_some_and(|names| names.contains(name));
    if local_defined {
        return Ok(local);
    }
    let matches: Vec<Vec<String>> = scope
        .globs
        .iter()
        .map(|glob| {
            glob.iter()
                .cloned()
                .chain(std::iter::once(name.to_string()))
                .collect()
        })
        .filter(|path: &Vec<String>| defines(path, scope.defined))
        .collect();
    match matches.as_slice() {
        [path] => return Ok(path.clone()),
        [] => {
            return Err(format!(
                "`{name}` in {}::{} is not defined there, imported, or glob-imported",
                scope.owner, scope.module
            ));
        }
        many => {
            let origins: Vec<String> = many.iter().map(|path| path.join("::")).collect();
            return Err(format!(
                "`{name}` in {}::{} is glob-imported from several modules: {}",
                scope.owner,
                scope.module,
                origins.join(", ")
            ));
        }
    }
}
