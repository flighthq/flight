use std::collections::{BTreeMap, BTreeSet, HashSet};

use quote::ToTokens;
use syn::{Expr, GenericArgument, PathArguments, ReturnType, Type};

use crate::{CompileError, compile_error};

use super::{
    EXTERNAL_STRUCT_RETURN_MARKER, PROVENANCE_SEPARATOR, SEQUENCE_FIELD_MARKER,
    SHARED_IDENTITY_EXTERNAL_FIELD_MARKER, SHARED_IDENTITY_EXTERNAL_TYPE_MARKER, current_source,
    dependency_source_context, insert_type_path_context, is_public, peel_reference_and_paren,
    resolve_type_path, rust_type_is_sequence, shared_identity_type_at_depth, source_type_context,
    substitute_type_param, unique_marker_suffix,
};
pub(crate) fn external_shared_identity_facts(
    sources: &[(&str, &str)],
) -> Result<BTreeSet<String>, CompileError> {
    struct DependencySource {
        crate_name: String,
        context: HashSet<String>,
        aliases: BTreeMap<String, Type>,
        generic_aliases: BTreeMap<String, (Vec<String>, Type)>,
        structures: BTreeSet<String>,
        file: syn::File,
    }
    let mut parsed = Vec::new();
    for (source, module) in sources {
        let Some(package) = module
            .strip_prefix("@flighthq/")
            .and_then(|rest| rest.strip_suffix("/contract"))
        else {
            continue;
        };
        let file = syn::parse_file(source)
            .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
        let mut aliases = BTreeMap::new();
        let mut generic_aliases = BTreeMap::new();
        let mut structures = BTreeSet::new();
        let mut local_names = Vec::new();
        for item in &file.items {
            match item {
                syn::Item::Struct(structure) => {
                    structures.insert(structure.ident.to_string());
                    local_names.push(structure.ident.to_string());
                }
                syn::Item::Type(alias) => {
                    local_names.push(alias.ident.to_string());
                    if alias.generics.params.is_empty() {
                        aliases.insert(alias.ident.to_string(), alias.ty.as_ref().clone());
                    } else {
                        let params: Vec<String> = alias
                            .generics
                            .params
                            .iter()
                            .filter_map(|p| match p {
                                syn::GenericParam::Type(t) => Some(t.ident.to_string()),
                                _ => None,
                            })
                            .collect();
                        generic_aliases
                            .insert(alias.ident.to_string(), (params, alias.ty.as_ref().clone()));
                    }
                }
                syn::Item::Enum(item) => local_names.push(item.ident.to_string()),
                syn::Item::Trait(item) => local_names.push(item.ident.to_string()),
                _ => {}
            }
        }
        let mut context = HashSet::new();
        insert_type_path_context(
            &mut context,
            file.items.iter().filter_map(|item| match item {
                syn::Item::Use(item_use) => Some(item_use),
                _ => None,
            }),
            local_names.into_iter(),
        );
        parsed.push(DependencySource {
            crate_name: format!("flight_{}", package.replace('-', "_")),
            context,
            aliases,
            generic_aliases,
            structures,
            file,
        });
    }
    let mut known = parsed
        .iter()
        .flat_map(|source| {
            source
                .structures
                .iter()
                .map(|name| format!("{}::{name}", source.crate_name))
        })
        .collect::<BTreeSet<_>>();
    loop {
        let mut changed = false;
        for source in &parsed {
            let context =
                dependency_source_context(source.context.clone(), &known, &source.crate_name);
            for item in &source.file.items {
                let syn::Item::Type(alias) = item else {
                    continue;
                };
                let name = format!("{}::{}", source.crate_name, alias.ident);
                if alias.generics.params.is_empty()
                    && !known.contains(&name)
                    && external_type_is_shared_identity(
                        &context,
                        &source.aliases,
                        &source.generic_aliases,
                        &source.structures,
                        &alias.ty,
                        0,
                    )
                {
                    known.insert(name);
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    let mut facts = known
        .iter()
        .map(|name| format!("{SHARED_IDENTITY_EXTERNAL_TYPE_MARKER}{name}"))
        .collect::<BTreeSet<_>>();
    for source in &parsed {
        let context = dependency_source_context(source.context.clone(), &known, &source.crate_name);
        for item in &source.file.items {
            match item {
                syn::Item::Struct(structure) if is_public(&structure.vis) => {
                    for field in &structure.fields {
                        let Some(field_name) = &field.ident else {
                            continue;
                        };
                        if is_public(&field.vis)
                            && external_type_is_shared_identity(
                                &context,
                                &source.aliases,
                                &source.generic_aliases,
                                &source.structures,
                                &field.ty,
                                0,
                            )
                        {
                            facts.insert(format!(
                                "{SHARED_IDENTITY_EXTERNAL_FIELD_MARKER}{}::{}{PROVENANCE_SEPARATOR}{field_name}",
                                source.crate_name, structure.ident
                            ));
                        }
                        // A public `Vec` field is a sequence as a local struct's is, so the proven
                        // `Vec` lowerings (`.clear()` as `length = 0`, ...) apply through an external
                        // binding.
                        if is_public(&field.vis) && rust_type_is_sequence(&field.ty) {
                            facts.insert(format!(
                                "{SEQUENCE_FIELD_MARKER}{}::{}{PROVENANCE_SEPARATOR}{field_name}",
                                source.crate_name, structure.ident
                            ));
                        }
                    }
                }
                syn::Item::Fn(function) if is_public(&function.vis) => {
                    let ReturnType::Type(_, rust_type) = &function.sig.output else {
                        continue;
                    };
                    if let Some(structure) = external_dependency_struct_type(
                        &context,
                        &source.crate_name,
                        &known,
                        rust_type,
                    ) {
                        facts.insert(format!(
                            "{EXTERNAL_STRUCT_RETURN_MARKER}{}::{}{PROVENANCE_SEPARATOR}{structure}",
                            source.crate_name, function.sig.ident
                        ));
                    }
                }
                _ => {}
            }
        }
    }
    return Ok(facts);
}

// The dependency-crate struct a declared type names (`crate::Struct`), through references: a path
// resolving into another `flight_*` crate. Only its crate and item name are kept, so a re-export from
// the crate root and the defining module name the same struct.
pub(super) fn external_struct_type(entities: &HashSet<String>, rust_type: &Type) -> Option<String> {
    return match current_source(entities) {
        Some(from) => external_struct_type_in(entities, &from, rust_type),
        None => external_struct_type_with(entities, rust_type),
    };
}

pub(super) fn external_struct_type_in(
    entities: &HashSet<String>,
    from: &str,
    rust_type: &Type,
) -> Option<String> {
    return external_struct_type_with(&source_type_context(entities, from), rust_type);
}

// `external_struct_type` resolved through the type-namespace provenance `context`.
pub(super) fn external_struct_type_with(
    context: &HashSet<String>,
    rust_type: &Type,
) -> Option<String> {
    let path = match rust_type {
        Type::Group(group) => return external_struct_type_with(context, &group.elem),
        Type::Paren(paren) => return external_struct_type_with(context, &paren.elem),
        Type::Reference(reference) => return external_struct_type_with(context, &reference.elem),
        Type::Path(path) if path.qself.is_none() => &path.path,
        _ => return None,
    };
    if !matches!(path.segments.last()?.arguments, PathArguments::None) {
        return None;
    }
    let resolved = resolve_type_path(path, context)?;
    let (first, last) = (resolved.first()?, resolved.last()?);
    if resolved.len() < 2 || !first.starts_with("flight_") {
        return None;
    }
    return Some(format!("{first}::{last}"));
}

// A dependency function's declared return struct, canonicalized from that dependency's own source
// context. Local declarations resolve under `crate`; imported Flight structs keep their crate root.
pub(super) fn external_dependency_struct_type(
    context: &HashSet<String>,
    crate_name: &str,
    known: &BTreeSet<String>,
    rust_type: &Type,
) -> Option<String> {
    let path = match rust_type {
        Type::Group(group) => {
            return external_dependency_struct_type(context, crate_name, known, &group.elem);
        }
        Type::Paren(paren) => {
            return external_dependency_struct_type(context, crate_name, known, &paren.elem);
        }
        Type::Reference(reference) => {
            return external_dependency_struct_type(context, crate_name, known, &reference.elem);
        }
        Type::Path(path) if path.qself.is_none() => &path.path,
        _ => return None,
    };
    if !matches!(path.segments.last()?.arguments, PathArguments::None) {
        return None;
    }
    let resolved = resolve_type_path(path, context)?;
    let (first, last) = (resolved.first()?, resolved.last()?);
    let structure = if first == "crate" {
        format!("{crate_name}::{last}")
    } else if first.starts_with("flight_") {
        format!("{first}::{last}")
    } else {
        return None;
    };
    return known.contains(&structure).then_some(structure);
}

// The dependency struct a public factory call returns. This is deliberately separate from source
// struct provenance: it only licenses dependency field facts gathered from the dependency itself.
pub(super) fn external_struct_return(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    let Expr::Call(call) = peel_reference_and_paren(expression) else {
        return None;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return None;
    };
    if path.qself.is_some() {
        return None;
    }
    let context = current_source(entities)
        .map(|source| source_type_context(entities, &source))
        .unwrap_or_else(|| entities.clone());
    let resolved = resolve_type_path(&path.path, &context)?;
    let (first, function) = (resolved.first()?, resolved.last()?);
    if resolved.len() < 2 || !first.starts_with("flight_") {
        return None;
    }
    return unique_marker_suffix(
        entities,
        &format!("{EXTERNAL_STRUCT_RETURN_MARKER}{first}::{function}{PROVENANCE_SEPARATOR}"),
    );
}

// `rust_type_is_shared_identity` for a dependency source read on its own: its source structs are
// objects and its type aliases stand for their definitions; anything else must resolve through its
// `use` items to a standard identity-bearing type.
pub(super) fn external_type_is_shared_identity(
    context: &HashSet<String>,
    aliases: &BTreeMap<String, Type>,
    generic_aliases: &BTreeMap<String, (Vec<String>, Type)>,
    structures: &BTreeSet<String>,
    rust_type: &Type,
    depth: usize,
) -> bool {
    if depth > 16 {
        return false;
    }
    if let Type::Path(path) = rust_type
        && path.qself.is_none()
        && path.path.leading_colon.is_none()
        && path.path.segments.len() == 1
    {
        let name = path.path.segments[0].ident.to_string();
        if structures.contains(&name) {
            return true;
        }
        if let Some(definition) = aliases.get(&name) {
            return external_type_is_shared_identity(
                context,
                aliases,
                generic_aliases,
                structures,
                definition,
                depth + 1,
            );
        }
        if let Some((params, definition)) = generic_aliases.get(&name) {
            let type_args: Vec<&Type> = match &path.path.segments[0].arguments {
                PathArguments::AngleBracketed(args) => args
                    .args
                    .iter()
                    .filter_map(|a| match a {
                        GenericArgument::Type(t) => Some(t),
                        _ => None,
                    })
                    .collect(),
                _ => vec![],
            };
            if params.len() == type_args.len() {
                let mut def_str = definition.to_token_stream().to_string();
                for (param, arg) in params.iter().zip(type_args.iter()) {
                    def_str =
                        substitute_type_param(&def_str, param, &arg.to_token_stream().to_string());
                }
                if let Ok(substituted) = syn::parse_str::<Type>(&def_str) {
                    return external_type_is_shared_identity(
                        context,
                        aliases,
                        generic_aliases,
                        structures,
                        &substituted,
                        depth + 1,
                    );
                }
            }
        }
    }
    return shared_identity_type_at_depth(context, None, rust_type, depth);
}
