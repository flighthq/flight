use std::collections::HashSet;

use quote::ToTokens;
use syn::{Expr, FnArg, ItemFn, Pat, Stmt, Type};

use crate::CompileError;

use super::{
    ARRAY_LIKE_PARAMETER_MARKER, DEFAULT_NULL_OPTION_PARAMETER_MARKER,
    ENTITY_ALLOCATION_INITIALIZED_FIELD_MARKER, ENTITY_ALLOCATION_OMITTED_FIELD_MARKER,
    ENTITY_DEFINITELY_INITIALIZED_FIELD_MARKER, ENTITY_INITIALIZER_PREFIX_FIELD_MARKER,
    FLOAT32_ARRAY_PARAMETER_MARKER, NULLABLE_OPTION_PARAMETER_MARKER, PROVENANCE_SEPARATOR,
    RETURNS_CONTRACT_TYPED_ARRAY_MARKER, UINT8_ARRAY_PARAMETER_MARKER, UINT8_ARRAY_RETURN_MARKER,
    current_source, emit_type, expression_is_path_call, expression_typed_array,
    is_flight_entity_allocation, option_inner_type, snake_to_lower_camel,
    tokens_contain_identifier, unique_marker_suffix,
};

// Whether the allocation at `local` is followed by an initializer whose definitely-assigned fields
// may be omitted from the default object.
// flight-lint: allow(hashmap-iteration) markers are only copied into another set, so visit order is unobservable
pub(super) fn allocation_initialized_context(
    entities: &HashSet<String>,
    local: &syn::Local,
    name: &str,
    next: Option<&Stmt>,
) -> HashSet<String> {
    let Some(initializer) = &local.init else {
        return entities.clone();
    };
    if !expression_is_path_call(&initializer.expr, "allocate_entity") {
        return entities.clone();
    }
    let Some(Stmt::Expr(Expr::Call(call), _)) = next else {
        return entities.clone();
    };
    let Expr::Path(function) = call.func.as_ref() else {
        return entities.clone();
    };
    let Some(function) = function.path.get_ident() else {
        return entities.clone();
    };
    let Some(Expr::Reference(reference)) = call.args.first() else {
        return entities.clone();
    };
    let Expr::Path(argument) = reference.expr.as_ref() else {
        return entities.clone();
    };
    if reference.mutability.is_none() || !argument.path.is_ident(name) {
        return entities.clone();
    }
    let prefix = format!("{ENTITY_DEFINITELY_INITIALIZED_FIELD_MARKER}{function}:");
    let mut context = entities.clone();
    for marker in entities {
        if let Some(field) = marker.strip_prefix(&prefix) {
            context.insert(format!(
                "{ENTITY_ALLOCATION_INITIALIZED_FIELD_MARKER}{field}"
            ));
        }
    }
    // Omitting a default outright needs the stronger proof: the exact `flight_entity` allocation
    // intrinsic, and no other argument of the initializer call that could read the allocation
    // before the initializer's leading writes run.
    let other_arguments_observe = call
        .args
        .iter()
        .skip(1)
        .any(|argument| tokens_contain_identifier(argument.to_token_stream(), name));
    if is_flight_entity_allocation(&initializer.expr, entities) && !other_arguments_observe {
        let prefix = format!("{ENTITY_INITIALIZER_PREFIX_FIELD_MARKER}{function}:");
        for marker in entities {
            if let Some(field) = marker.strip_prefix(&prefix) {
                context.insert(format!("{ENTITY_ALLOCATION_OMITTED_FIELD_MARKER}{field}"));
            }
        }
    }
    return context;
}

pub(super) fn argument_is_option(argument: &FnArg) -> bool {
    let FnArg::Typed(argument) = argument else {
        return false;
    };
    return option_inner_type(&argument.ty).is_some();
}

pub(super) fn argument_is_nullable_guard(function: &ItemFn, argument: &FnArg) -> bool {
    let name = function.sig.ident.to_string();
    let FnArg::Typed(argument) = argument else {
        return false;
    };
    let Pat::Ident(pattern) = argument.pat.as_ref() else {
        return false;
    };
    return name.starts_with("set_")
        && name.ends_with("_guard")
        && pattern.ident == "guard"
        && option_inner_type(&argument.ty).is_some();
}

pub(super) fn argument_is_type_script_nullable_option_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> bool {
    let Some(module) = current_source(entities) else {
        return false;
    };
    let FnArg::Typed(argument) = argument else {
        return false;
    };
    let Pat::Ident(pattern) = argument.pat.as_ref() else {
        return false;
    };
    return entities.contains(&format!(
        "{NULLABLE_OPTION_PARAMETER_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    ));
}

pub(super) fn argument_is_type_script_default_null_option_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> bool {
    let Some(module) = current_source(entities) else {
        return false;
    };
    let FnArg::Typed(argument) = argument else {
        return false;
    };
    let Pat::Ident(pattern) = argument.pat.as_ref() else {
        return false;
    };
    return entities.contains(&format!(
        "{DEFAULT_NULL_OPTION_PARAMETER_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    ));
}

// The `name: ArrayLike<T>` parameter an `array-like` designation gives a `&[T]` argument, or `None`.
pub(super) fn array_like_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    let FnArg::Typed(typed) = argument else {
        return Ok(None);
    };
    let Pat::Ident(pattern) = typed.pat.as_ref() else {
        return Ok(None);
    };
    let Some(current) = current_source(entities) else {
        return Ok(None);
    };
    if !entities.contains(&format!(
        "{ARRAY_LIKE_PARAMETER_MARKER}{current}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    )) {
        return Ok(None);
    }
    let Type::Reference(reference) = typed.ty.as_ref() else {
        return Ok(None);
    };
    let Type::Slice(slice) = reference.elem.as_ref() else {
        return Ok(None);
    };
    return Ok(Some(format!(
        "{}: ArrayLike<{}>",
        snake_to_lower_camel(&pattern.ident.to_string()),
        emit_type(&slice.elem, entities)?
    )));
}

pub(super) fn float32_array_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> Option<String> {
    let FnArg::Typed(typed) = argument else {
        return None;
    };
    let Pat::Ident(pattern) = typed.pat.as_ref() else {
        return None;
    };
    let current = current_source(entities)?;
    if !entities.contains(&format!(
        "{FLOAT32_ARRAY_PARAMETER_MARKER}{current}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    )) {
        return None;
    }
    return Some(format!(
        "{}: Float32Array",
        snake_to_lower_camel(&pattern.ident.to_string())
    ));
}

pub(super) fn uint8_array_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> Option<String> {
    let FnArg::Typed(typed) = argument else {
        return None;
    };
    let Pat::Ident(pattern) = typed.pat.as_ref() else {
        return None;
    };
    let current = current_source(entities)?;
    if !entities.contains(&format!(
        "{UINT8_ARRAY_PARAMETER_MARKER}{current}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    )) {
        return None;
    }
    return Some(format!(
        "{}: Uint8Array",
        snake_to_lower_camel(&pattern.ident.to_string())
    ));
}

pub(crate) fn function_returns_uint8_array(function: &ItemFn, entities: &HashSet<String>) -> bool {
    return current_source(entities).map_or_else(
        || {
            entities.contains(&format!(
                "{UINT8_ARRAY_RETURN_MARKER}{}",
                function.sig.ident
            ))
        },
        |current| {
            entities.contains(&format!(
                "{UINT8_ARRAY_RETURN_MARKER}{current}{PROVENANCE_SEPARATOR}{}",
                function.sig.ident
            ))
        },
    );
}

pub(crate) fn contract_typed_array_return_value(
    expression: &Expr,
    emitted: String,
    entities: &HashSet<String>,
) -> String {
    let Some(array_type) = unique_marker_suffix(entities, RETURNS_CONTRACT_TYPED_ARRAY_MARKER)
    else {
        return emitted;
    };
    if expression_typed_array(expression, entities).as_deref() == Some(array_type.as_str()) {
        return emitted;
    }
    return format!("new {array_type}({emitted})");
}

pub(super) fn argument_is_array_like_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> bool {
    let FnArg::Typed(typed) = argument else {
        return false;
    };
    let Pat::Ident(pattern) = typed.pat.as_ref() else {
        return false;
    };
    let Some(current) = current_source(entities) else {
        return false;
    };
    return entities.contains(&format!(
        "{ARRAY_LIKE_PARAMETER_MARKER}{current}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    ));
}
