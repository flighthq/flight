use std::collections::{BTreeSet, HashSet};

use syn::{GenericArgument, PathArguments, Type};

use crate::model::Program;

use super::{
    CRATE_USE_BINDING_MARKER, CRATE_USE_GLOB_MARKER, PROVENANCE_SEPARATOR,
    PUBLIC_USE_BINDING_MARKER, PUBLIC_USE_GLOB_MARKER, SOURCE_TYPE_PATH_CONTEXT_MARKER,
    STRUCT_OWNER_MARKER, SourceAccess, TYPE_ALIAS_DEFINITION_MARKER, TYPE_ALIAS_OWNER_MARKER,
    USE_BINDING_MARKER, USE_GLOB_MARKER, identity_alias_tag, is_standard_arc_path, marker_suffixes,
    module_identity_segments, owner_marker, resolve_type_path, unique_marker_suffix,
};
pub(super) fn resolve_owner(
    entities: &HashSet<String>,
    marker: &str,
    from: &str,
    name: &str,
) -> Option<(String, String)> {
    return resolve_owner_inner(
        entities,
        marker,
        from,
        name,
        SourceAccess::Local,
        &mut BTreeSet::new(),
    );
}

pub(super) fn resolve_owner_inner(
    entities: &HashSet<String>,
    marker: &str,
    from: &str,
    name: &str,
    access: SourceAccess,
    visited: &mut BTreeSet<(String, String, SourceAccess)>,
) -> Option<(String, String)> {
    fn unique(mut candidates: BTreeSet<(String, String)>) -> Option<(String, String)> {
        return match (candidates.pop_first(), candidates.is_empty()) {
            (Some(candidate), true) => Some(candidate),
            _ => None,
        };
    }

    if !visited.insert((from.to_string(), name.to_string(), access)) {
        return None;
    }
    if entities.contains(&owner_marker(marker, from, name, SourceAccess::Public))
        || access != SourceAccess::Public
            && entities.contains(&owner_marker(marker, from, name, SourceAccess::Crate))
        || access == SourceAccess::Local
            && entities.contains(&owner_marker(marker, from, name, SourceAccess::Local))
    {
        return Some((from.to_string(), name.to_string()));
    }
    let binding_marker = match access {
        SourceAccess::Local => USE_BINDING_MARKER,
        SourceAccess::Crate => CRATE_USE_BINDING_MARKER,
        SourceAccess::Public => PUBLIC_USE_BINDING_MARKER,
    };
    let bindings = marker_suffixes(
        entities,
        &format!("{binding_marker}{from}{PROVENANCE_SEPARATOR}{name}{PROVENANCE_SEPARATOR}"),
    );
    if !bindings.is_empty() {
        return unique(
            bindings
                .into_iter()
                .filter_map(|binding| {
                    let (target, item) = binding.split_once(PROVENANCE_SEPARATOR)?;
                    let mut branch = visited.clone();
                    resolve_owner_inner(
                        entities,
                        marker,
                        target,
                        item,
                        next_source_access(access, from, target),
                        &mut branch,
                    )
                })
                .collect(),
        );
    }
    let glob_marker = match access {
        SourceAccess::Local => USE_GLOB_MARKER,
        SourceAccess::Crate => CRATE_USE_GLOB_MARKER,
        SourceAccess::Public => PUBLIC_USE_GLOB_MARKER,
    };
    return unique(
        marker_suffixes(
            entities,
            &format!("{glob_marker}{from}{PROVENANCE_SEPARATOR}"),
        )
        .into_iter()
        .filter_map(|target| {
            let mut branch = visited.clone();
            resolve_owner_inner(
                entities,
                marker,
                &target,
                name,
                next_source_access(access, from, &target),
                &mut branch,
            )
        })
        .collect(),
    );
}

fn next_source_access(access: SourceAccess, from: &str, target: &str) -> SourceAccess {
    if access == SourceAccess::Public || from == target {
        return access;
    }
    let same_crate = module_identity_segments(from)
        .and_then(|from| {
            module_identity_segments(target).map(|target| from.first() == target.first())
        })
        .unwrap_or(false);
    return if same_crate {
        SourceAccess::Crate
    } else {
        SourceAccess::Public
    };
}

// Resolve a Rust path from `from`. An unqualified name sees private bindings in its own source; a
// qualified path enters its target module through that module's public surface.
pub(super) fn resolve_path_owner(
    entities: &HashSet<String>,
    marker: &str,
    from: &str,
    path: &syn::Path,
) -> Option<(String, String)> {
    let mut segments = path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    let name = segments.pop()?;
    if segments.is_empty() {
        return resolve_owner(entities, marker, from, &name);
    }
    let target = resolve_source_use_prefix(entities, from, &segments)?.join("::");
    return resolve_owner_inner(
        entities,
        marker,
        &target,
        &name,
        next_source_access(SourceAccess::Local, from, &target),
        &mut BTreeSet::new(),
    );
}

// The module a qualified source path names. A leading source-local `use` binding can rename a
// module (`use crate::owner as renamed;`); otherwise ordinary crate/self/super and external roots
// resolve structurally.
fn resolve_source_use_prefix(
    entities: &HashSet<String>,
    from: &str,
    prefix: &[String],
) -> Option<Vec<String>> {
    let (first, rest) = prefix.split_first()?;
    let binding_prefix =
        format!("{USE_BINDING_MARKER}{from}{PROVENANCE_SEPARATOR}{first}{PROVENANCE_SEPARATOR}");
    let bindings = marker_suffixes(entities, &binding_prefix);
    if !bindings.is_empty() {
        let mut targets = bindings
            .into_iter()
            .filter_map(|binding| {
                let (target, item) = binding.split_once(PROVENANCE_SEPARATOR)?;
                Some(
                    target
                        .split("::")
                        .map(str::to_string)
                        .chain(std::iter::once(item.to_string()))
                        .chain(rest.iter().cloned())
                        .collect::<Vec<_>>(),
                )
            })
            .collect::<BTreeSet<_>>();
        return match (targets.pop_first(), targets.is_empty()) {
            (Some(target), true) => Some(target),
            _ => None,
        };
    }
    return resolve_use_prefix(&module_identity_segments(from)?, prefix);
}

// The full module a `use` prefix names, written in the module `from`: `crate::` from the crate root,
// `self::` and `super::` relative to `from`, and anything else as an external crate path.
fn resolve_use_prefix(from: &[String], prefix: &[String]) -> Option<Vec<String>> {
    let (first, rest) = prefix.split_first()?;
    let mut module = match first.as_str() {
        "crate" => vec![from.first()?.clone()],
        "self" => from.to_vec(),
        "super" => from[..from.len().checked_sub(1).filter(|length| *length > 0)?].to_vec(),
        _ => vec![first.replace('-', "_")],
    };
    for segment in rest {
        if segment == "super" {
            module.pop();
            if module.is_empty() {
                return None;
            }
        } else if segment != "self" {
            module.push(segment.clone());
        }
    }
    return Some(module);
}

// Resolve a `use` prefix with the source's declared child modules in scope. In Rust 2018 a bare
// `use child::...` can name `mod child;`; treating every bare first segment as an external crate
// loses the ownership chain through crate-root re-export barrels.
pub(super) fn resolve_program_use_prefix(
    from: &[String],
    program: &Program,
    prefix: &[String],
) -> Option<Vec<String>> {
    let first = prefix.first()?;
    if !matches!(first.as_str(), "crate" | "self" | "super")
        && program.facts.external_modules.iter().any(|module| {
            module.inline_parents.is_empty()
                && (module.name == *first || module.component == *first)
        })
    {
        return Some(from.iter().cloned().chain(prefix.iter().cloned()).collect());
    }
    return resolve_use_prefix(from, prefix);
}

// The canonical identity (`module SEP Struct`) of the struct `rust_type` names, resolved from the
// source `from`.
pub(super) fn resolved_type_identity(
    entities: &HashSet<String>,
    from: &str,
    rust_type: &Type,
) -> Option<String> {
    return resolved_type_identity_at_depth(entities, from, rust_type, 0);
}

// `resolved_type_identity`, expanding at most 16 alias or `Arc` layers so an alias cycle fails closed.
fn resolved_type_identity_at_depth(
    entities: &HashSet<String>,
    from: &str,
    rust_type: &Type,
    depth: usize,
) -> Option<String> {
    if depth > 16 {
        return None;
    }
    let path = match rust_type {
        Type::Group(group) => {
            return resolved_type_identity_at_depth(entities, from, &group.elem, depth);
        }
        Type::Paren(paren) => {
            return resolved_type_identity_at_depth(entities, from, &paren.elem, depth);
        }
        Type::Reference(reference) => {
            return resolved_type_identity_at_depth(entities, from, &reference.elem, depth);
        }
        Type::Path(path) if path.qself.is_none() => &path.path,
        _ => return None,
    };
    // A proven standard `Arc<T>` is `T` in TypeScript, so it has `T`'s identity. Resolve the full
    // source-local type path instead of recognizing selected spellings: renamed `std`/`alloc` roots,
    // renamed `sync` modules and absolute paths must all reach the same canonical owner.
    let type_context = marker_suffixes(
        entities,
        &format!("{SOURCE_TYPE_PATH_CONTEXT_MARKER}{from}{PROVENANCE_SEPARATOR}"),
    )
    .into_iter()
    .collect::<HashSet<_>>();
    let standard_arc = resolve_type_path(path, &type_context)
        .is_some_and(|resolved| is_standard_arc_path(&resolved));
    let entity_ref = resolve_type_path(path, &type_context).is_some_and(|resolved| {
        matches!(
            resolved
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                .as_slice(),
            ["flight_entity", "Ref"] | ["flight_entity", "ir", "Ref"]
        )
    });
    let identity_alias = path
        .segments
        .last()
        .is_some_and(|segment| identity_alias_tag(entities, &segment.ident.to_string()).is_some());
    if standard_arc || entity_ref || identity_alias {
        let PathArguments::AngleBracketed(arguments) = &path.segments.last()?.arguments else {
            return None;
        };
        let [GenericArgument::Type(inner)] = arguments.args.iter().collect::<Vec<_>>()[..] else {
            return None;
        };
        return resolved_type_identity_at_depth(entities, from, inner, depth + 1);
    }
    if let Some((owner, declaration)) =
        resolve_path_owner(entities, STRUCT_OWNER_MARKER, from, path)
    {
        return Some(format!("{owner}{PROVENANCE_SEPARATOR}{declaration}"));
    }
    // A source type alias stands for its definition, read in the alias's own source.
    let (owner, alias) = resolve_path_owner(entities, TYPE_ALIAS_OWNER_MARKER, from, path)?;
    let definition = unique_marker_suffix(
        entities,
        &format!(
            "{TYPE_ALIAS_DEFINITION_MARKER}{owner}{PROVENANCE_SEPARATOR}{alias}{PROVENANCE_SEPARATOR}"
        ),
    )?;
    let definition = syn::parse_str::<Type>(&definition).ok()?;
    return resolved_type_identity_at_depth(entities, &owner, &definition, depth + 1);
}
