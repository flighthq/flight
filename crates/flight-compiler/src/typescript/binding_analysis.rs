use std::collections::HashSet;

use syn::{Expr, Lit, Member, Pat, Type};

use super::{
    BindingFact, OPTION_FIELD_MARKER, OPTION_RETURN_MARKER, PROVENANCE_SEPARATOR,
    RETURN_BINDING_FACT_MARKER, binding_fact_from_marker, call_fact, expression_is_associated_path,
    expression_is_known_string, expression_numeric_type, expression_struct_identity,
    expression_struct_name, lexical_fact, marker_suffixes, unique_marker_suffix,
};
pub(super) fn option_closure_parameter(pattern: &Pat) -> Option<&syn::Ident> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => Some(&identifier.ident),
        Pat::Reference(reference) => option_closure_parameter(&reference.pat),
        Pat::Type(typed) => option_closure_parameter(&typed.pat),
        Pat::Paren(paren) => option_closure_parameter(&paren.pat),
        _ => None,
    };
}

pub(super) fn closure_pattern_is_wildcard(pattern: &Pat) -> bool {
    return match pattern {
        Pat::Wild(_) => true,
        Pat::Reference(reference) => closure_pattern_is_wildcard(&reference.pat),
        Pat::Type(typed) => closure_pattern_is_wildcard(&typed.pat),
        Pat::Paren(paren) => closure_pattern_is_wildcard(&paren.pat),
        _ => false,
    };
}

pub(super) fn closure_pattern_is_tuple(pattern: &Pat) -> bool {
    return match pattern {
        Pat::Tuple(_) => true,
        Pat::Reference(reference) => closure_pattern_is_tuple(&reference.pat),
        Pat::Type(typed) => closure_pattern_is_tuple(&typed.pat),
        Pat::Paren(paren) => closure_pattern_is_tuple(&paren.pat),
        _ => false,
    };
}

// The payload type name of an expression declared as Rust `Option` (empty when unnamed), or `None` when
// the expression is not known to be an Option. Option-ness comes from declared types only.
pub(super) fn option_expression_payload(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    // A name declared as `Option` with different payloads is still an Option, of no known payload.
    let find = |prefix: String| {
        let mut payloads = marker_suffixes(entities, &prefix);
        return match payloads.len() {
            0 => None,
            1 => payloads.pop_first(),
            _ => Some(String::new()),
        };
    };
    return match expression {
        Expr::Call(call) => {
            let Expr::Path(path) = call.func.as_ref() else {
                return None;
            };
            if path.qself.is_some() {
                return None;
            }
            if expression_is_associated_path(&call.func, "char", "from_u32") && call.args.len() == 1
            {
                return Some("char".to_string());
            }
            call_fact(entities, OPTION_RETURN_MARKER, &path.path)
        }
        Expr::Field(field) => {
            let syn::Member::Named(field_name) = &field.member else {
                return None;
            };
            // A nested owner (`outer.inner.count`) resolves through declared struct field types.
            let structure = expression_struct_name(&field.base, entities)
                .or_else(|| expression_struct_identity(&field.base, entities))?;
            find(format!(
                "{OPTION_FIELD_MARKER}{structure}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
            ))
        }
        Expr::Group(group) => option_expression_payload(&group.expr, entities),
        Expr::MethodCall(call) if call.method == "and_then" || call.method == "map" => {
            option_expression_payload(&call.receiver, entities).map(|_| String::new())
        }
        Expr::MethodCall(call)
            if call.method == "find"
                && call.args.len() == 1
                && expression_is_known_string(&call.receiver, entities) =>
        {
            Some(String::new())
        }
        Expr::MethodCall(call) if call.method == "get" && call.args.len() == 1 => {
            Some(String::new())
        }
        Expr::MethodCall(call)
            if call.method == "remove"
                && call.args.len() == 1
                && call.args.first().is_some_and(|arg| {
                    matches!(
                        arg,
                        Expr::Reference(_)
                            | Expr::Lit(syn::ExprLit {
                                lit: Lit::Str(_),
                                ..
                            })
                    ) || expression_is_known_string(arg, entities)
                }) =>
        {
            Some(String::new())
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(call.method.to_string().as_str(), "first" | "last" | "pop") =>
        {
            Some(String::new())
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "as_mut" | "as_ref" | "cloned" | "copied"
                ) =>
        {
            option_expression_payload(&call.receiver, entities)
        }
        Expr::Paren(paren) => option_expression_payload(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            match lexical_fact(entities, &path.path.segments[0].ident.to_string()) {
                Some(BindingFact::Option(payload)) => match *payload {
                    BindingFact::Structure(identity) => Some(identity),
                    _ => Some(String::new()),
                },
                _ => None,
            }
        }
        Expr::Reference(reference) => option_expression_payload(&reference.expr, entities),
        _ => None,
    };
}

pub(super) fn option_binding_fact_default(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<&'static str> {
    let fact = match expression {
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "as_mut" | "as_ref" | "clone" | "cloned" | "copied"
                ) =>
        {
            return option_binding_fact_default(&call.receiver, entities);
        }
        Expr::MethodCall(call)
            if call.args.len() == 1
                && matches!(
                    call.method.to_string().as_str(),
                    "checked_add"
                        | "checked_div"
                        | "checked_mul"
                        | "checked_sub"
                        | "checked_rem"
                        | "checked_neg"
                        | "checked_shl"
                        | "checked_shr"
                ) =>
        {
            let numeric_type = expression_numeric_type(&call.receiver, entities)?;
            return binding_fact_default(&BindingFact::Structure(numeric_type));
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(call.method.to_string().as_str(), "as_str" | "to_str") =>
        {
            return Some("''");
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "as_f64" | "as_i64" | "as_u64"
                ) =>
        {
            return Some("0");
        }
        Expr::MethodCall(call) if call.args.is_empty() && call.method == "as_bool" => {
            return Some("false");
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "checked_neg" | "checked_abs"
                ) =>
        {
            let numeric_type = expression_numeric_type(&call.receiver, entities)?;
            return binding_fact_default(&BindingFact::Structure(numeric_type));
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(call.method.to_string().as_str(), "first" | "last" | "pop") =>
        {
            if let Some(element_fact) = sequence_element_binding_fact(&call.receiver, entities) {
                return binding_fact_default(&element_fact);
            }
            None
        }
        Expr::Field(field) => {
            if let syn::Member::Named(field_name) = &field.member {
                if let Some(owner) = expression_struct_name(&field.base, entities)
                    .or_else(|| expression_struct_identity(&field.base, entities))
                {
                    let payload = unique_marker_suffix(
                        entities,
                        &format!(
                            "{OPTION_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                        ),
                    );
                    if let Some(payload) = payload {
                        return binding_fact_default(&binding_fact_from_marker(&payload));
                    }
                }
            }
            None
        }
        // A call to a function declared to return `Option<payload>` of a named payload type.
        Expr::Call(call) => {
            let Expr::Path(path) = call.func.as_ref() else {
                return None;
            };
            if path.qself.is_some() {
                return None;
            }
            if let Some(BindingFact::Option(payload)) =
                call_fact(entities, RETURN_BINDING_FACT_MARKER, &path.path)
                    .map(|fact| binding_fact_from_marker(&fact))
            {
                return binding_fact_default(&payload);
            }
            let payload = call_fact(entities, OPTION_RETURN_MARKER, &path.path)?;
            if payload.is_empty() {
                return None;
            }
            return binding_fact_default(&BindingFact::Structure(payload));
        }
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            lexical_fact(entities, &path.path.segments[0].ident.to_string())
        }
        Expr::Reference(reference) => {
            return option_binding_fact_default(&reference.expr, entities);
        }
        Expr::Paren(paren) => return option_binding_fact_default(&paren.expr, entities),
        Expr::Group(group) => return option_binding_fact_default(&group.expr, entities),
        _ => None,
    };
    let Some(BindingFact::Option(payload)) = fact else {
        return None;
    };
    return binding_fact_default(&payload);
}

// The TypeScript `Default` of `option.map(|..| result)` when the closure's result expression spells its
// own type: a primitive cast or literal, `format!`, or a tuple of those (lowered as an array).
pub(super) fn option_map_closure_default(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    let Expr::MethodCall(call) = expression else {
        return None;
    };
    if call.method != "map" || call.args.len() != 1 {
        return None;
    }
    option_expression_payload(&call.receiver, entities)?;
    let Some(Expr::Closure(closure)) = call.args.first() else {
        return None;
    };
    return closure_result_default(&closure.body);
}

fn closure_result_default(expression: &Expr) -> Option<String> {
    return match expression {
        Expr::Block(block) => match block.block.stmts.last()? {
            syn::Stmt::Expr(Expr::Return(returned), _) => {
                closure_result_default(returned.expr.as_deref()?)
            }
            syn::Stmt::Expr(tail, None) => closure_result_default(tail),
            _ => None,
        },
        Expr::Cast(cast) => {
            let Type::Path(path) = cast.ty.as_ref() else {
                return None;
            };
            let name = path.path.get_ident()?.to_string();
            binding_fact_default(&BindingFact::Structure(name)).map(ToString::to_string)
        }
        Expr::Group(group) => closure_result_default(&group.expr),
        Expr::Lit(literal) => match &literal.lit {
            Lit::Bool(_) => Some("false".to_string()),
            Lit::Float(_) | Lit::Int(_) => Some("0".to_string()),
            Lit::Str(_) => Some("''".to_string()),
            _ => None,
        },
        Expr::Macro(invocation) if invocation.mac.path.is_ident("format") => Some("''".to_string()),
        Expr::Paren(paren) => closure_result_default(&paren.expr),
        Expr::Tuple(tuple) if !tuple.elems.is_empty() => {
            let elements = tuple
                .elems
                .iter()
                .map(closure_result_default)
                .collect::<Option<Vec<_>>>()?;
            Some(format!("[{}]", elements.join(", ")))
        }
        _ => None,
    };
}

pub(super) fn binding_fact_default(fact: &BindingFact) -> Option<&'static str> {
    return match fact {
        BindingFact::HashMap => Some("new Map()"),
        BindingFact::HashSet => Some("new Set()"),
        BindingFact::Sequence(_) => Some("[]"),
        BindingFact::Structure(name) => match name.as_str() {
            "String" | "str" => Some("''"),
            "bool" => Some("false"),
            "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128" | "isize" | "u8" | "u16"
            | "u32" | "u64" | "u128" | "usize" => Some("0"),
            _ => None,
        },
        BindingFact::TypedArray(array_type) => match array_type.as_str() {
            "Float32Array" => Some("new Float32Array(0)"),
            "Float64Array" => Some("new Float64Array(0)"),
            "Int8Array" => Some("new Int8Array(0)"),
            "Int16Array" => Some("new Int16Array(0)"),
            "Int32Array" => Some("new Int32Array(0)"),
            "Uint8Array" => Some("new Uint8Array(0)"),
            "Uint16Array" => Some("new Uint16Array(0)"),
            "Uint32Array" => Some("new Uint32Array(0)"),
            _ => None,
        },
        BindingFact::Unknown => None,
        BindingFact::Option(_) => None,
        BindingFact::Tuple(_) => None,
        BindingFact::UnresolvedPattern => None,
    };
}

pub(super) fn sequence_element_binding_fact(
    receiver: &Expr,
    entities: &HashSet<String>,
) -> Option<BindingFact> {
    match receiver {
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            let name = path.path.segments[0].ident.to_string();
            match lexical_fact(entities, &name)? {
                BindingFact::Sequence(element) => Some(*element),
                _ => None,
            }
        }
        Expr::Reference(reference) => sequence_element_binding_fact(&reference.expr, entities),
        Expr::Paren(paren) => sequence_element_binding_fact(&paren.expr, entities),
        Expr::Group(group) => sequence_element_binding_fact(&group.expr, entities),
        _ => None,
    }
}
