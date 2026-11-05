use std::collections::HashSet;

use syn::Expr;

use super::{
    FROZEN_OBJECT_MARKER, FUNCTION_OWNER_MARKER, PROVENANCE_SEPARATOR,
    VITEST_PUBLIC_FUNCTION_MARKER, current_source, lexical_binding, marker_suffixes, resolve_owner,
    resolve_path_owner, unique_marker_suffix, vitest_function_path_binding_name,
};

// flight-lint: allow(hashmap-iteration) frozen-object validation guarantees one target name per Rust constant
pub(crate) fn frozen_object_name<'a>(
    context: &'a HashSet<String>,
    rust_name: &str,
) -> Option<&'a str> {
    let prefix = format!("{FROZEN_OBJECT_MARKER}{rust_name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

pub(super) fn frozen_object_expression_name<'a>(
    expression: &Expr,
    context: &'a HashSet<String>,
) -> Option<&'a str> {
    return match expression {
        Expr::Group(group) => frozen_object_expression_name(&group.expr, context),
        Expr::Paren(paren) => frozen_object_expression_name(&paren.expr, context),
        Expr::Path(path)
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1 =>
        {
            frozen_object_name(context, &path.path.segments[0].ident.to_string())
        }
        _ => None,
    };
}

// The fact `marker` records for the free function `function_name` called from the current source,
// resolved to its declaring module; `None` when the function or its fact is unknown or ambiguous.
pub(super) fn function_fact(
    entities: &HashSet<String>,
    marker: &str,
    function_name: &str,
) -> Option<String> {
    if lexical_binding(entities, function_name).is_some() {
        return None;
    }
    let identity = match current_source(entities) {
        Some(current) => {
            let (owner, declaration) =
                resolve_owner(entities, FUNCTION_OWNER_MARKER, &current, function_name)?;
            format!("{owner}{PROVENANCE_SEPARATOR}{declaration}")
        }
        None => unique_marker_suffix(
            entities,
            &format!("{VITEST_PUBLIC_FUNCTION_MARKER}{function_name}{PROVENANCE_SEPARATOR}"),
        )?,
    };
    return function_identity_fact(entities, marker, &identity);
}

// The fact for a qualified or unqualified function path. The path resolver is deliberately neutral
// about the fact being requested; sequence, Option and struct-return consumers all receive the same
// canonical function identity.
pub(super) fn function_path_fact(
    entities: &HashSet<String>,
    marker: &str,
    path: &syn::Path,
) -> Option<String> {
    let identity = match current_source(entities) {
        Some(current) => {
            let (owner, declaration) =
                resolve_path_owner(entities, FUNCTION_OWNER_MARKER, &current, path)?;
            format!("{owner}{PROVENANCE_SEPARATOR}{declaration}")
        }
        None => {
            let function = vitest_function_path_binding_name(path, entities)
                .ok()
                .flatten()?;
            unique_marker_suffix(
                entities,
                &format!("{VITEST_PUBLIC_FUNCTION_MARKER}{function}{PROVENANCE_SEPARATOR}"),
            )?
        }
    };
    return function_identity_fact(entities, marker, &identity);
}

pub(super) fn function_identity_fact(
    entities: &HashSet<String>,
    marker: &str,
    identity: &str,
) -> Option<String> {
    let mut facts = marker_suffixes(
        entities,
        &format!("{marker}{identity}{PROVENANCE_SEPARATOR}"),
    );
    return match (facts.pop_first(), facts.is_empty()) {
        (Some(fact), true) => Some(fact),
        _ => None,
    };
}

pub(super) fn ordering_variant_value(path: &syn::Path) -> Option<&'static str> {
    let mut segments = path.segments.iter().rev();
    let variant = segments.next()?;
    if segments.next()?.ident != "Ordering" {
        return None;
    }
    return match variant.ident.to_string().as_str() {
        "Less" => Some("-1"),
        "Equal" => Some("0"),
        "Greater" => Some("1"),
        _ => None,
    };
}
