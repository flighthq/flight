// Item C payload identity. A signal payload type is keyed by its bare name in the inventory, so
// every nominal type a payload names is first resolved to its canonical definition: the crate,
// module and item where it is defined. Spellings unify only through real `use`/`pub use`
// bindings, same-named types in different modules stay distinct, and a path no definition backs
// is an error rather than a guess.

use std::collections::{BTreeMap, BTreeSet};

// Names that are language, std or SDK container vocabulary rather than payload identities.
const BUILTIN_TYPE_NAMES: &[&str] = &[
    "Arc", "Box", "Fn", "FnMut", "FnOnce", "HashMap", "Option", "Ref", "RwLock", "Send", "Signal",
    "String", "Sync", "Vec", "bool", "f32", "f64", "i8", "i16", "i32", "i64", "isize", "str", "u8",
    "u16", "u32", "u64", "usize",
];

// Re-export chains longer than this are treated as cycles.
const MAX_RESOLUTION_DEPTH: usize = 32;

// Paths rooted here name language or std items, never payload identities.
const STD_CRATES: &[&str] = &["alloc", "core", "std"];

/// Every module of one crate, keyed by module path (`""` is the crate root, then `types`, `a::b`).
#[derive(Clone, Debug, Default)]
pub struct CrateIndex {
    pub modules: BTreeMap<String, ModuleInfo>,
}

/// What one module defines and binds: its own type definitions, its child modules, and its
/// `use` bindings and globs (paths as written, resolved from this module).
#[derive(Clone, Debug, Default)]
pub struct ModuleInfo {
    pub children: BTreeSet<String>,
    pub globs: Vec<UseGlob>,
    pub types: BTreeSet<String>,
    pub uses: Vec<UseBinding>,
}

/// The canonical definition of one nominal payload type: its crate, defining module and name.
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct PayloadIdentity {
    pub krate: String,
    pub module: String,
    pub name: String,
}

/// One name a `use` item binds, with the path it was written with.
#[derive(Clone, Debug)]
pub struct UseBinding {
    pub name: String,
    pub path: Vec<String>,
    pub public: bool,
}

/// One `use path::*` item.
#[derive(Clone, Debug)]
pub struct UseGlob {
    pub path: Vec<String>,
    pub public: bool,
}

// A module location: crate directory name and module path segments.
#[derive(Clone, Debug, Eq, PartialEq)]
struct Location {
    krate: String,
    module: Vec<String>,
}

/// Rejects a payload name that resolves to more than one canonical definition, and two payload
/// names that would produce one wrapper stem, naming both origins.
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
                .push(get_identity_path(identity));
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
/// checked by `resolve_payload`. An unsupported type form is an error.
pub fn display_type_text(ty: &syn::Type) -> Result<String, String> {
    return render_type(ty, &mut |_| Ok(()));
}

/// `flight-crate::module::Name` (`flight-crate::Name` for a crate-root definition).
pub fn get_identity_path(identity: &PayloadIdentity) -> String {
    if identity.module.is_empty() {
        return format!("{}::{}", identity.krate, identity.name);
    }
    return format!("{}::{}::{}", identity.krate, identity.module, identity.name);
}

/// Indexes one crate from its parsed source files keyed by module path. Inline `mod name { .. }`
/// blocks are indexed as their own modules; `mod name;` and file paths declare children.
pub fn index_crate(files: &[(String, syn::File)]) -> CrateIndex {
    let mut index = CrateIndex::default();
    for (module, file) in files {
        index.modules.entry(module.clone()).or_default();
        let segments: Vec<String> = module_segments(module).collect();
        for depth in 0..segments.len() {
            index
                .modules
                .entry(segments[..depth].join("::"))
                .or_default()
                .children
                .insert(segments[depth].clone());
        }
        index_items(&mut index, module, &file.items);
    }
    return index;
}

/// Resolves every nominal type `ty` names as written in `krate::module`; `generics` are the
/// enclosing item's own type parameters, which are not nominal types. Returns the type's display
/// text and the canonical identities it names. An unresolvable name or unsupported type form is
/// an error.
pub fn resolve_payload(
    ty: &syn::Type,
    index: &BTreeMap<String, CrateIndex>,
    krate: &str,
    module: &str,
    generics: &BTreeSet<String>,
) -> Result<(String, BTreeSet<PayloadIdentity>), String> {
    let from = Location {
        krate: krate.to_string(),
        module: module_segments(module).collect(),
    };
    let mut identities = BTreeSet::new();
    let text = render_type(ty, &mut |segments| {
        let name = segments.last().unwrap();
        if segments.len() == 1
            && (generics.contains(name) || BUILTIN_TYPE_NAMES.contains(&name.as_str()))
        {
            return Ok(());
        }
        if STD_CRATES.contains(&segments[0].as_str()) {
            if BUILTIN_TYPE_NAMES.contains(&name.as_str()) {
                return Ok(());
            }
            return Err(format!(
                "`{}` is a std type with no payload identity",
                segments.join("::")
            ));
        }
        let identity = resolve_path_item(index, &from, segments, 0).map_err(|error| {
            format!(
                "`{}` in {}: {error}",
                segments.join("::"),
                get_location_text(&from)
            )
        })?;
        identities.insert(identity);
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

fn collect_use_tree(
    tree: &syn::UseTree,
    prefix: &mut Vec<String>,
    public: bool,
    info: &mut ModuleInfo,
) {
    match tree {
        syn::UseTree::Path(path) => {
            prefix.push(path.ident.to_string());
            collect_use_tree(&path.tree, prefix, public, info);
            prefix.pop();
        }
        syn::UseTree::Name(name) => {
            // `use a::b::{self}` binds `b` to the module `a::b`.
            if name.ident == "self" {
                if let Some(last) = prefix.last() {
                    info.uses.push(UseBinding {
                        name: last.clone(),
                        path: prefix.clone(),
                        public,
                    });
                }
                return;
            }
            let mut path = prefix.clone();
            path.push(name.ident.to_string());
            info.uses.push(UseBinding {
                name: name.ident.to_string(),
                path,
                public,
            });
        }
        syn::UseTree::Rename(rename) => {
            let mut path = prefix.clone();
            if rename.ident != "self" {
                path.push(rename.ident.to_string());
            }
            info.uses.push(UseBinding {
                name: rename.rename.to_string(),
                path,
                public,
            });
        }
        syn::UseTree::Glob(_) => info.globs.push(UseGlob {
            path: prefix.clone(),
            public,
        }),
        syn::UseTree::Group(group) => {
            for item in &group.items {
                collect_use_tree(item, prefix, public, info);
            }
        }
    }
}

fn get_location_text(location: &Location) -> String {
    if location.module.is_empty() {
        return location.krate.clone();
    }
    return format!("{}::{}", location.krate, location.module.join("::"));
}

fn get_module<'a>(
    index: &'a BTreeMap<String, CrateIndex>,
    location: &Location,
) -> Result<&'a ModuleInfo, String> {
    return index
        .get(&location.krate)
        .and_then(|krate| krate.modules.get(&location.module.join("::")))
        .ok_or_else(|| format!("no module `{}`", get_location_text(location)));
}

fn index_items(index: &mut CrateIndex, module: &str, items: &[syn::Item]) {
    for item in items {
        let info = index.modules.entry(module.to_string()).or_default();
        match item {
            syn::Item::Struct(item) => {
                info.types.insert(item.ident.to_string());
            }
            syn::Item::Enum(item) => {
                info.types.insert(item.ident.to_string());
            }
            syn::Item::Union(item) => {
                info.types.insert(item.ident.to_string());
            }
            syn::Item::Type(item) => {
                info.types.insert(item.ident.to_string());
            }
            syn::Item::Use(item) => {
                let public = matches!(item.vis, syn::Visibility::Public(_));
                collect_use_tree(&item.tree, &mut Vec::new(), public, info);
            }
            syn::Item::Mod(item) => {
                let name = item.ident.to_string();
                info.children.insert(name.clone());
                let child = if module.is_empty() {
                    name
                } else {
                    format!("{module}::{name}")
                };
                index.modules.entry(child.clone()).or_default();
                if let Some((_, content)) = &item.content {
                    index_items(index, &child, content);
                }
            }
            _ => {}
        }
    }
}

// Whether a binding declared in `owner` is visible from `from`: public bindings always are, and
// private ones to the declaring module and its descendants.
fn is_visible(public: bool, owner: &Location, from: &Location) -> bool {
    return public || (owner.krate == from.krate && from.module.starts_with(&owner.module));
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

// The item `name` names inside the module at `location`, as seen from `from`: a definition there,
// a visible `use` binding (followed to its canonical definition), or exactly one visible glob.
fn resolve_item(
    index: &BTreeMap<String, CrateIndex>,
    location: &Location,
    name: &str,
    from: &Location,
    depth: usize,
) -> Result<PayloadIdentity, String> {
    if depth > MAX_RESOLUTION_DEPTH {
        return Err(format!("re-exports of `{name}` form a cycle"));
    }
    let info = get_module(index, location)?;
    if info.types.contains(name) {
        return Ok(PayloadIdentity {
            krate: location.krate.clone(),
            module: location.module.join("::"),
            name: name.to_string(),
        });
    }
    for binding in &info.uses {
        if binding.name == name && is_visible(binding.public, location, from) {
            return resolve_path_item(index, location, &binding.path, depth + 1);
        }
    }
    let mut found: BTreeSet<PayloadIdentity> = BTreeSet::new();
    for glob in &info.globs {
        if !is_visible(glob.public, location, from) {
            continue;
        }
        let Ok(target) = resolve_module_path(index, location, &glob.path, depth + 1) else {
            continue;
        };
        if let Ok(identity) = resolve_item(index, &target, name, location, depth + 1) {
            found.insert(identity);
        }
    }
    let mut found = found.into_iter();
    match (found.next(), found.next()) {
        (Some(identity), None) => return Ok(identity),
        (None, _) => {
            return Err(format!(
                "`{name}` is not defined in, imported into, or re-exported by `{}`",
                get_location_text(location)
            ));
        }
        (Some(first), Some(second)) => {
            return Err(format!(
                "`{name}` reaches `{}` through several globs: {} and {}",
                get_location_text(location),
                get_identity_path(&first),
                get_identity_path(&second)
            ));
        }
    }
}

// The module a path prefix names from `from`: `crate`, `self` and any number of `super` segments
// are normalized (leaving the crate is an error), a Flight crate name starts at that crate's root,
// and every other segment is a child module or a visible `use` binding of one.
fn resolve_module_path(
    index: &BTreeMap<String, CrateIndex>,
    from: &Location,
    segments: &[String],
    depth: usize,
) -> Result<Location, String> {
    if depth > MAX_RESOLUTION_DEPTH {
        return Err("module re-exports form a cycle".to_string());
    }
    let mut location = from.clone();
    let mut rest = segments;
    if let Some(first) = segments.first() {
        if first == "crate" {
            location.module.clear();
            rest = &segments[1..];
        } else if first.starts_with("flight_") {
            let krate = first.replace('_', "-");
            if !index.contains_key(&krate) {
                return Err(format!("no Flight crate `{krate}`"));
            }
            location = Location {
                krate,
                module: Vec::new(),
            };
            rest = &segments[1..];
        } else if STD_CRATES.contains(&first.as_str()) {
            return Err(format!("`{first}` paths name no Flight module"));
        }
    }
    for segment in rest {
        match segment.as_str() {
            "self" => continue,
            "super" => {
                if location.module.pop().is_none() {
                    return Err(format!(
                        "`super` leaves the crate root of {}",
                        location.krate
                    ));
                }
                continue;
            }
            _ => {}
        }
        let info = get_module(index, &location)?;
        if info.children.contains(segment) {
            location.module.push(segment.clone());
            continue;
        }
        let binding = info.uses.iter().find(|binding| {
            binding.name == *segment && is_visible(binding.public, &location, from)
        });
        let Some(binding) = binding else {
            return Err(format!(
                "`{segment}` is not a module of, or a module imported into, `{}`",
                get_location_text(&location)
            ));
        };
        location = resolve_module_path(index, &location, &binding.path, depth + 1)?;
    }
    return Ok(location);
}

// The canonical definition a path names from `from`.
fn resolve_path_item(
    index: &BTreeMap<String, CrateIndex>,
    from: &Location,
    segments: &[String],
    depth: usize,
) -> Result<PayloadIdentity, String> {
    let (name, prefix) = segments.split_last().unwrap();
    let location = resolve_module_path(index, from, prefix, depth)?;
    return resolve_item(index, &location, name, from, depth);
}
