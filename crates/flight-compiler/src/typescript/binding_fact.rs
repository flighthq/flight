use std::collections::HashSet;

use syn::{GenericArgument, Pat, PathArguments, Type};

use super::{
    BINDING_FACT_SEPARATOR, BINDING_MARKER, BINDING_SITE_MARKER, CURRENT_SOURCE_MARKER,
    PROVENANCE_SEPARATOR, TYPE_ALIAS_DEFINITION_MARKER, TYPE_ALIAS_OWNER_MARKER,
    fixed_typed_array_type, function_fact, function_path_fact, marker_suffixes, named_type,
    option_inner_type, pattern_identifiers, primitive_type_identity, resolve_path_owner,
    resolved_type_identity, sequence_inner_type, unique_marker_suffix, vitest_struct_owner,
    vitest_struct_path_binding_name,
};

// A fact proven about a lexical binding's value.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum BindingFact {
    // A binding typed or constructed as `HashMap` (`Map` in TypeScript).
    HashMap,
    // A binding typed or constructed as `HashSet` (`Set` in TypeScript).
    HashSet,
    Option(Box<BindingFact>),
    Sequence(Box<BindingFact>),
    Structure(String),
    Tuple(Vec<BindingFact>),
    // A fixed array of a typed-array primitive (`[f64; 4]`), named by its TypeScript typed array.
    TypedArray(String),
    Unknown,
    UnresolvedPattern,
}

impl BindingFact {
    pub(super) fn has_source_structure(&self) -> bool {
        return match self {
            Self::Option(payload) | Self::Sequence(payload) => payload.has_source_structure(),
            Self::Structure(_) => true,
            Self::Tuple(facts) => facts.iter().any(Self::has_source_structure),
            Self::HashMap
            | Self::HashSet
            | Self::TypedArray(_)
            | Self::Unknown
            | Self::UnresolvedPattern => false,
        };
    }
}

// Binds each identifier a pattern introduces to the BindingId its site resolved to (or to no fact at
// all, when the site was not resolved), replacing any binding of that name in `context`.
pub(super) fn bind_lexical_pattern(context: &mut HashSet<String>, pattern: &Pat) {
    for identifier in pattern_identifiers(pattern) {
        let prefix = format!("{BINDING_MARKER}{identifier}=");
        context.retain(|marker| !marker.starts_with(&prefix));
        let id = unique_marker_suffix(
            context,
            &format!("{BINDING_SITE_MARKER}{}=", binding_site_key(identifier)),
        )
        .unwrap_or_default();
        context.insert(format!("{prefix}{id}"));
    }
}

pub(super) fn binding_fact_from_marker(encoded: &str) -> BindingFact {
    if encoded == "hash-map" {
        return BindingFact::HashMap;
    }
    if encoded == "hash-set" {
        return BindingFact::HashSet;
    }
    if encoded == "sequence" {
        return BindingFact::Sequence(Box::new(BindingFact::Unknown));
    }
    if let Some(fact) = encoded
        .strip_prefix("sequence")
        .and_then(|rest| rest.strip_prefix(PROVENANCE_SEPARATOR))
    {
        return BindingFact::Sequence(Box::new(binding_fact_from_marker(fact)));
    }
    if let Some(fact) = encoded
        .strip_prefix("option")
        .and_then(|rest| rest.strip_prefix(PROVENANCE_SEPARATOR))
    {
        return BindingFact::Option(Box::new(binding_fact_from_marker(fact)));
    }
    if let Some(identity) = encoded
        .strip_prefix("struct")
        .and_then(|rest| rest.strip_prefix(PROVENANCE_SEPARATOR))
    {
        return BindingFact::Structure(identity.to_string());
    }
    if let Some(facts) = encoded
        .strip_prefix("tuple")
        .and_then(|rest| rest.strip_prefix(PROVENANCE_SEPARATOR))
    {
        return BindingFact::Tuple(
            facts
                .split(BINDING_FACT_SEPARATOR)
                .map(binding_fact_from_marker)
                .collect(),
        );
    }
    if let Some(array_type) = encoded
        .strip_prefix("typed-array")
        .and_then(|rest| rest.strip_prefix(PROVENANCE_SEPARATOR))
    {
        return BindingFact::TypedArray(array_type.to_string());
    }
    if encoded == "unresolved-pattern" {
        return BindingFact::UnresolvedPattern;
    }
    return BindingFact::Unknown;
}

pub(super) fn binding_fact_marker(fact: &BindingFact) -> String {
    return match fact {
        BindingFact::Option(payload) => format!(
            "option{PROVENANCE_SEPARATOR}{}",
            binding_fact_marker(payload)
        ),
        BindingFact::Sequence(element) => format!(
            "sequence{PROVENANCE_SEPARATOR}{}",
            binding_fact_marker(element)
        ),
        BindingFact::Structure(identity) => format!("struct{PROVENANCE_SEPARATOR}{identity}"),
        BindingFact::Tuple(facts) => format!(
            "tuple{PROVENANCE_SEPARATOR}{}",
            facts
                .iter()
                .map(binding_fact_marker)
                .collect::<Vec<_>>()
                .join(&BINDING_FACT_SEPARATOR.to_string())
        ),
        BindingFact::HashMap => "hash-map".to_string(),
        BindingFact::TypedArray(array_type) => {
            format!("typed-array{PROVENANCE_SEPARATOR}{array_type}")
        }
        BindingFact::HashSet => "hash-set".to_string(),
        BindingFact::Unknown => "unknown".to_string(),
        BindingFact::UnresolvedPattern => "unresolved-pattern".to_string(),
    };
}

// The key of a binding identifier node: its address, stable while the parsed program is borrowed for
// emission. It is a lookup key only and never reaches emitted output.
pub(super) fn binding_site_key(identifier: &syn::Ident) -> String {
    return format!("{identifier:p}");
}

// The typed array a `Box<Float32Array>`-style type's single argument names, or `None`; the caller
// proves the outer type is the standard `Box`.
pub(super) fn boxed_typed_array(segment: &syn::PathSegment) -> Option<&'static str> {
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return None;
    };
    let [GenericArgument::Type(Type::Path(inner))] = arguments.args.iter().collect::<Vec<_>>()[..]
    else {
        return None;
    };
    let inner_segment = inner.path.segments.last()?;
    if inner.qself.is_some() || !matches!(inner_segment.arguments, PathArguments::None) {
        return None;
    }
    return match inner_segment.ident.to_string().as_str() {
        "Float32Array" => Some("Float32Array"),
        "Float64Array" => Some("Float64Array"),
        "Int8Array" => Some("Int8Array"),
        "Int16Array" => Some("Int16Array"),
        "Int32Array" => Some("Int32Array"),
        "Uint8Array" => Some("Uint8Array"),
        "Uint16Array" => Some("Uint16Array"),
        "Uint32Array" => Some("Uint32Array"),
        _ => None,
    };
}

// The fact `marker` records for the function a call path names. A single-segment callee is subject to
// lexical shadowing (`function_fact`); a qualified path names a module item directly and resolves
// through the shared ModuleSource resolver (`function_path_fact`).
pub(super) fn call_fact(
    entities: &HashSet<String>,
    marker: &str,
    path: &syn::Path,
) -> Option<String> {
    if path.segments.len() == 1 {
        return function_fact(entities, marker, &path.segments[0].ident.to_string());
    }
    return function_path_fact(entities, marker, path);
}

// A concise arrow body that begins with `{` is parsed as a block, so an object literal (a lowered
// struct or record) is parenthesized to stay an expression.
pub(super) fn concise_arrow_body(body: String) -> String {
    if body.starts_with('{') {
        return format!("({body})");
    }
    return body;
}

// The canonical identity of the struct `rust_type` names in the code being emitted: resolved from the
// current source when emitting a program, or through the contract-selected struct binding when
// emitting a Vitest suite (whose test module is not itself a program source).
pub(super) fn context_type_identity(
    entities: &HashSet<String>,
    rust_type: &Type,
) -> Option<String> {
    if let Some(current) = current_source(entities) {
        return resolved_type_identity(entities, &current, rust_type);
    }
    let structure = match rust_type {
        Type::Group(group) => return context_type_identity(entities, &group.elem),
        Type::Paren(paren) => return context_type_identity(entities, &paren.elem),
        Type::Reference(reference) => return context_type_identity(entities, &reference.elem),
        Type::Path(path) if path.qself.is_none() => {
            vitest_struct_path_binding_name(&path.path, entities)
                .ok()
                .flatten()?
        }
        _ => named_type(rust_type)?,
    };
    return vitest_struct_owner(entities, &structure);
}

pub(super) fn binding_fact_for_type(
    entities: &HashSet<String>,
    from: Option<&str>,
    rust_type: &Type,
) -> BindingFact {
    if let Some(inner) = option_inner_type(rust_type) {
        return BindingFact::Option(Box::new(binding_fact_for_type(entities, from, inner)));
    }
    if let Some(array_type) = fixed_typed_array_type(rust_type) {
        return BindingFact::TypedArray(array_type.to_string());
    }
    if let Some(inner) = sequence_inner_type(rust_type) {
        let element = binding_fact_for_type(entities, from, inner);
        return BindingFact::Sequence(Box::new(
            if element.has_source_structure() || matches!(element, BindingFact::TypedArray(_)) {
                element
            } else {
                BindingFact::Unknown
            },
        ));
    }
    if let Type::Tuple(tuple) = rust_type {
        return BindingFact::Tuple(
            tuple
                .elems
                .iter()
                .map(|element| binding_fact_for_type(entities, from, element))
                .collect(),
        );
    }
    if let Some(name) = primitive_type_identity(rust_type) {
        return BindingFact::Structure(name);
    }
    if let Type::Path(path) = rust_type
        && path.qself.is_none()
    {
        let source = from.map(String::from).or_else(|| current_source(entities));
        if let Some(source) = &source {
            if let Some((owner, alias)) =
                resolve_path_owner(entities, TYPE_ALIAS_OWNER_MARKER, source, &path.path)
            {
                let definition = unique_marker_suffix(
                    entities,
                    &format!(
                        "{TYPE_ALIAS_DEFINITION_MARKER}{owner}{PROVENANCE_SEPARATOR}{alias}{PROVENANCE_SEPARATOR}"
                    ),
                );
                if let Some(Ok(resolved)) = definition.map(|d| syn::parse_str::<Type>(&d)) {
                    if !matches!(&resolved, Type::Path(_)) {
                        return binding_fact_for_type(entities, from, &resolved);
                    }
                }
            }
        }
    }
    let identity = match from {
        Some(from) => resolved_type_identity(entities, from, rust_type),
        None => context_type_identity(entities, rust_type),
    };
    return identity.map_or(BindingFact::Unknown, BindingFact::Structure);
}

// The module of the program being emitted, when exactly one is recorded.
pub(super) fn current_source(entities: &HashSet<String>) -> Option<String> {
    let mut modules = marker_suffixes(entities, CURRENT_SOURCE_MARKER);
    return match (modules.pop_first(), modules.is_empty()) {
        (Some(module), true) => Some(module),
        _ => None,
    };
}
