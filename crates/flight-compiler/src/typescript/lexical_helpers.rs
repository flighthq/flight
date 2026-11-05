use std::collections::{BTreeSet, HashSet};

use syn::{Pat, Type};

use super::{
    BINDING_FACT_MARKER, BINDING_MARKER, BINDING_SITE_MARKER, BindingFact,
    binding_fact_from_marker, binding_site_key, unique_marker_suffix,
};

// The BindingId of the lexical value binding of `name` in scope, `Some("")` for an in-scope binding
// whose site was not resolved, or `None` when no value binding of `name` is in scope.
pub(super) fn lexical_binding(entities: &HashSet<String>, name: &str) -> Option<String> {
    return unique_marker_suffix(entities, &format!("{BINDING_MARKER}{name}="));
}

// The fact proven for the lexical binding of `name` in scope.
pub(super) fn lexical_fact(entities: &HashSet<String>, name: &str) -> Option<BindingFact> {
    let id = lexical_binding(entities, name).filter(|id| !id.is_empty())?;
    return unique_marker_suffix(entities, &format!("{BINDING_FACT_MARKER}{id}="))
        .map(|fact| binding_fact_from_marker(&fact));
}

pub(super) fn local_pattern_name(pattern: &Pat) -> Option<String> {
    return match pattern {
        Pat::Ident(identifier) => Some(identifier.ident.to_string()),
        Pat::TupleStruct(tuple)
            if (tuple.path.is_ident("Some") || tuple.path.is_ident("Ok"))
                && tuple.elems.len() == 1 =>
        {
            let Pat::Ident(identifier) = &tuple.elems[0] else {
                return None;
            };
            Some(identifier.ident.to_string())
        }
        Pat::Type(typed) => local_pattern_name(&typed.pat),
        _ => None,
    };
}

pub(crate) fn local_pattern_binding_id(
    entities: &HashSet<String>,
    pattern: &Pat,
) -> Option<String> {
    let identifier = match pattern {
        Pat::Ident(identifier) => &identifier.ident,
        Pat::Type(typed) => return local_pattern_binding_id(entities, &typed.pat),
        _ => return None,
    };
    return unique_marker_suffix(
        entities,
        &format!("{BINDING_SITE_MARKER}{}=", binding_site_key(identifier)),
    );
}

pub(super) fn statement_binds_name(pattern: &Pat, name: &str) -> bool {
    match pattern {
        Pat::Ident(ident) => ident.ident == name,
        Pat::Type(typed) => statement_binds_name(&typed.pat, name),
        Pat::TupleStruct(ts) => ts.elems.iter().any(|elem| statement_binds_name(elem, name)),
        Pat::Struct(s) => s.fields.iter().any(|f| statement_binds_name(&f.pat, name)),
        Pat::Tuple(t) => t.elems.iter().any(|elem| statement_binds_name(elem, name)),
        _ => false,
    }
}

// The suffixes of every marker starting with `prefix`, in sorted order.
// flight-lint: allow(hashmap-iteration) the matches are collected into a BTreeSet, so order is never observed
pub(super) fn marker_suffixes(entities: &HashSet<String>, prefix: &str) -> BTreeSet<String> {
    return entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(prefix).map(str::to_string))
        .collect();
}

// The segments of a full module identity (`crate::path::to::module`), or `None` for any other source
// key (a synthetic or path-shaped key carries no module identity).
pub(super) fn module_identity_segments(module: &str) -> Option<Vec<String>> {
    let segments = module.split("::").map(str::to_string).collect::<Vec<_>>();
    let valid = segments.iter().all(|segment| {
        !segment.is_empty()
            && segment
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
    });
    return valid.then_some(segments);
}

pub(super) fn type_is_named(rust_type: &Type, expected: &str) -> bool {
    let Type::Path(path) = rust_type else {
        return false;
    };
    return path.path.is_ident(expected);
}

pub(super) fn type_kind(rust_type: &Type) -> &'static str {
    return match rust_type {
        Type::BareFn(_) => "bare function",
        Type::ImplTrait(_) => "impl trait",
        Type::Infer(_) => "inferred type",
        Type::Macro(_) => "type macro",
        Type::Never(_) => "never type",
        Type::Ptr(_) => "raw pointer",
        Type::TraitObject(_) => "trait object",
        Type::Verbatim(_) => "verbatim type tokens",
        _ => "unknown type",
    };
}
