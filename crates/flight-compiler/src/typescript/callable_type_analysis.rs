use std::collections::HashSet;

use syn::{Expr, GenericArgument, PathArguments, Type, UnOp};

use crate::CompileError;

use super::{
    BindingFact, CLOSURE_PARAMETER_MARKER, FIXED_BUFFER_LOCAL_MARKER, NULLABLE_OPTION_FIELD_MARKER,
    NULLABLE_OPTION_LITERAL_FIELD_MARKER, NULLABLE_OPTIONS_MARKER, NULLABLE_OPTIONS_SOURCE_MARKER,
    OPTION_FIELD_MARKER, OPTION_RETURN_MARKER, PROVENANCE_SEPARATOR, RETURN_BINDING_FACT_MARKER,
    TYPE_SCRIPT_NULLABLE_OPTION_FIELD_MARKER, binding_fact_from_marker, call_fact, emit_type,
    expression_is_associated_path, expression_is_known_string, expression_is_rereadable,
    lexical_fact, typed_array_for_type,
};

// Whether a literal of the struct `identity`, built inside a `nullable-options` source (where `None` is
// `null`), stores `field` as `undefined`: an `Option` field its struct declares, outside any
// `nullable-options` source and with no nullable designation, which TypeScript types as optional
// (`field?: T`).
pub(super) fn is_ordinary_option_literal_field(
    entities: &HashSet<String>,
    identity: &str,
    field: &syn::Ident,
) -> bool {
    if !entities.contains(NULLABLE_OPTIONS_MARKER)
        || identity
            .rsplit_once(PROVENANCE_SEPARATOR)
            .is_none_or(|(module, _)| {
                entities.contains(&format!("{NULLABLE_OPTIONS_SOURCE_MARKER}{module}"))
            })
    {
        return false;
    }
    let option_field = format!(
        "{OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}{PROVENANCE_SEPARATOR}"
    );
    return entities
        .iter()
        .any(|marker| marker.starts_with(&option_field))
        && !entities.contains(&format!(
            "{NULLABLE_OPTION_LITERAL_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}"
        ))
        && !entities.contains(&format!(
            "{NULLABLE_OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}"
        ));
}

// Whether a literal of the struct `identity` stores `field` as `null`: a `nullable-option` field, or,
// built outside a `nullable-options` source (whose values are already `null`-based), a public
// `Option` field such a source declares.
pub(super) fn is_nullable_literal_field(
    entities: &HashSet<String>,
    identity: &str,
    field: &syn::Ident,
) -> bool {
    return entities.contains(&format!(
        "{NULLABLE_OPTION_LITERAL_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}"
    )) || !entities.contains(NULLABLE_OPTIONS_MARKER)
        && (entities.contains(&format!(
            "{NULLABLE_OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}"
        )) || is_type_script_nullable_option_field(entities, identity, field));
}

pub(super) fn is_type_script_nullable_option_field(
    entities: &HashSet<String>,
    identity: &str,
    field: &syn::Ident,
) -> bool {
    let owner = identity
        .rsplit_once(PROVENANCE_SEPARATOR)
        .map_or(identity, |(_, owner)| owner);
    return entities.contains(&format!(
        "{TYPE_SCRIPT_NULLABLE_OPTION_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{field}"
    ));
}

pub(super) fn nullable_type(inner: String) -> String {
    if inner.contains("=>") {
        return format!("({inner}) | null");
    }
    return format!("{inner} | null");
}

pub(super) fn callable_parameter_types(
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Result<Option<Vec<String>>, CompileError> {
    let Some(parameter_types) = callable_parameter_rust_types(rust_type) else {
        return Ok(None);
    };
    return parameter_types
        .iter()
        .map(|rust_type| emit_type(rust_type, entities))
        .collect::<Result<Vec<_>, _>>()
        .map(Some);
}

pub(super) fn callable_parameter_rust_types(rust_type: &Type) -> Option<Vec<&Type>> {
    return match rust_type {
        Type::Paren(paren) => callable_parameter_rust_types(&paren.elem),
        Type::Reference(reference) => callable_parameter_rust_types(&reference.elem),
        Type::Path(path) => {
            let segment = path.path.segments.last()?;
            if !matches!(
                segment.ident.to_string().as_str(),
                "Arc" | "Box" | "Option" | "Ref"
            ) {
                return None;
            }
            let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                return None;
            };
            let inner = arguments.args.iter().find_map(|argument| match argument {
                GenericArgument::Type(rust_type) => Some(rust_type),
                _ => None,
            })?;
            callable_parameter_rust_types(inner)
        }
        Type::TraitObject(object) => {
            for bound in &object.bounds {
                let syn::TypeParamBound::Trait(bound) = bound else {
                    continue;
                };
                let Some(segment) = bound.path.segments.last() else {
                    continue;
                };
                if !matches!(
                    segment.ident.to_string().as_str(),
                    "Fn" | "FnMut" | "FnOnce"
                ) {
                    continue;
                }
                let PathArguments::Parenthesized(arguments) = &segment.arguments else {
                    return None;
                };
                return Some(arguments.inputs.iter().collect());
            }
            None
        }
        _ => None,
    };
}

pub(super) fn closure_parameter_types(entities: &HashSet<String>, local: &str) -> Vec<String> {
    let prefix = format!("{CLOSURE_PARAMETER_MARKER}{local}:");
    let mut parameters = entities
        .iter()
        .filter_map(|marker| {
            let suffix = marker.strip_prefix(&prefix)?;
            let (index, typescript_type) = suffix.split_once(':')?;
            Some((index.parse::<usize>().ok()?, typescript_type.to_string()))
        })
        .collect::<Vec<_>>();
    parameters.sort_by_key(|(index, _)| *index);
    return parameters
        .into_iter()
        .map(|(_, typescript_type)| typescript_type)
        .collect();
}

pub(super) fn fixed_buffer_type(rust_type: &Type) -> Option<&'static str> {
    return match rust_type {
        Type::Paren(paren) => fixed_buffer_type(&paren.elem),
        Type::Reference(reference) if reference.mutability.is_some() => {
            fixed_buffer_value_type(&reference.elem)
        }
        _ => None,
    };
}

pub(super) fn fixed_buffer_value_type(rust_type: &Type) -> Option<&'static str> {
    return match rust_type {
        Type::Array(array) => typed_array_for_type(&array.elem),
        Type::Paren(paren) => fixed_buffer_value_type(&paren.elem),
        Type::Path(path) => match path.path.segments.last()?.ident.to_string().as_str() {
            "Float32Array" => Some("Float32Array"),
            "Float64Array" => Some("Float64Array"),
            "Int8Array" => Some("Int8Array"),
            "Int16Array" => Some("Int16Array"),
            "Int32Array" => Some("Int32Array"),
            "Uint8Array" => Some("Uint8Array"),
            "Uint16Array" => Some("Uint16Array"),
            "Uint32Array" => Some("Uint32Array"),
            _ => None,
        },
        Type::Slice(slice) => typed_array_for_type(&slice.elem),
        _ => None,
    };
}

// The typed array a fixed array of a typed-array primitive lowers to (`[f64; 4]` is `Float64Array`),
// seen through references.
pub(super) fn fixed_typed_array_type(rust_type: &Type) -> Option<&'static str> {
    return match rust_type {
        Type::Array(array) => typed_array_for_type(&array.elem),
        Type::Group(group) => fixed_typed_array_type(&group.elem),
        Type::Paren(paren) => fixed_typed_array_type(&paren.elem),
        Type::Reference(reference) => fixed_typed_array_type(&reference.elem),
        _ => None,
    };
}

pub(super) fn inferred_fixed_buffer_type(
    entities: &HashSet<String>,
    local: &str,
) -> Option<String> {
    let prefix = format!("{FIXED_BUFFER_LOCAL_MARKER}{local}:");
    return entities
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix).map(str::to_string));
}

pub(super) fn unwrap_option_payload_is_string(receiver: &Expr, entities: &HashSet<String>) -> bool {
    match receiver {
        Expr::Call(call) => {
            if let Expr::Path(path) = call.func.as_ref() {
                if path.qself.is_none() {
                    return call_fact(entities, OPTION_RETURN_MARKER, &path.path)
                        .is_some_and(|payload| payload == "String" || payload == "str");
                }
            }
            false
        }
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            matches!(
                lexical_fact(entities, &path.path.segments[0].ident.to_string()),
                Some(BindingFact::Option(inner)) if matches!(inner.as_ref(), BindingFact::Structure(s) if s == "String" || s == "str")
            )
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "as_ref" | "as_mut" | "clone" | "cloned" | "copied"
                ) =>
        {
            unwrap_option_payload_is_string(&call.receiver, entities)
        }
        Expr::MethodCall(call)
            if call.method == "next"
                && call.args.is_empty()
                && matches!(call.receiver.as_ref(), Expr::MethodCall(inner)
                    if matches!(inner.method.to_string().as_str(),
                        "chars" | "split" | "splitn" | "rsplit" | "rsplitn"
                        | "split_whitespace" | "split_ascii_whitespace"
                        | "lines" | "split_terminator")
                        && expression_is_known_string(&inner.receiver, entities)) =>
        {
            true
        }
        Expr::Reference(reference) => unwrap_option_payload_is_string(&reference.expr, entities),
        Expr::Paren(paren) => unwrap_option_payload_is_string(&paren.expr, entities),
        Expr::Group(group) => unwrap_option_payload_is_string(&group.expr, entities),
        _ => false,
    }
}

pub(super) fn unwrap_result_payload_is_string(receiver: &Expr, entities: &HashSet<String>) -> bool {
    match receiver {
        Expr::Call(call) => {
            if let Expr::Path(path) = call.func.as_ref() {
                if expression_is_associated_path(call.func.as_ref(), "serde_json", "to_string")
                    || expression_is_associated_path(
                        call.func.as_ref(),
                        "serde_json",
                        "to_string_pretty",
                    )
                {
                    return true;
                }
                if path.qself.is_none() {
                    return call_fact(entities, RETURN_BINDING_FACT_MARKER, &path.path)
                        .as_ref()
                        .is_some_and(|fact| {
                            matches!(
                                binding_fact_from_marker(fact),
                                BindingFact::Structure(s) if s == "String" || s == "str"
                            )
                        });
                }
            }
            false
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "as_ref" | "as_mut" | "clone"
                ) =>
        {
            unwrap_result_payload_is_string(&call.receiver, entities)
        }
        Expr::Reference(reference) => unwrap_result_payload_is_string(&reference.expr, entities),
        Expr::Paren(paren) => unwrap_result_payload_is_string(&paren.expr, entities),
        Expr::Group(group) => unwrap_result_payload_is_string(&group.expr, entities),
        _ => false,
    }
}

pub(super) fn for_loop_iterates_strings(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::MethodCall(call) => {
            matches!(
                call.method.to_string().as_str(),
                "lines"
                    | "split"
                    | "split_ascii_whitespace"
                    | "split_terminator"
                    | "split_whitespace"
                    | "splitn"
            ) && expression_is_known_string(&call.receiver, entities)
        }
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            matches!(
                lexical_fact(entities, &path.path.segments[0].ident.to_string()),
                Some(BindingFact::Sequence(element))
                    if matches!(element.as_ref(), BindingFact::Structure(s) if s == "String" || s == "str")
            )
        }
        Expr::Reference(reference) => for_loop_iterates_strings(&reference.expr, entities),
        _ => false,
    };
}

// Whether an `if let` / `while let` scrutinee can be read twice with one result: a binding or a
// field chain over one, through the identity adapters `.as_ref()`, `.as_mut()` and `.as_deref()`.
pub(crate) fn option_scrutinee_is_rereadable(condition: &Expr) -> bool {
    let Expr::Let(binding) = condition else {
        return true;
    };
    return expression_is_rereadable(&binding.expr);
}

// Views of one allocation that `Arc::ptr_eq` sees through: borrows, clones, guards of an erased
// `RwLock`/`Mutex`, and the `Some` payload of an `Option` handle.
pub(super) fn peel_shared_view(expression: &Expr) -> &Expr {
    let mut expression = expression;
    loop {
        expression = match expression {
            Expr::Group(group) => &group.expr,
            Expr::Paren(paren) => &paren.expr,
            Expr::Reference(reference) => &reference.expr,
            Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => &unary.expr,
            Expr::MethodCall(call)
                if call.args.is_empty()
                    && matches!(
                        call.method.to_string().as_str(),
                        "as_deref"
                            | "as_mut"
                            | "as_ref"
                            | "clone"
                            | "lock"
                            | "read"
                            | "unwrap"
                            | "write"
                    ) =>
            {
                &call.receiver
            }
            Expr::Call(call)
                if (expression_is_associated_path(&call.func, "Arc", "clone")
                    || expression_is_associated_path(&call.func, "Rc", "clone"))
                    && call.args.len() == 1 =>
            {
                &call.args[0]
            }
            _ => return expression,
        };
    }
}
