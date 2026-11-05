use std::collections::HashSet;

use syn::{BinOp, Expr, Lit, UnOp};

use crate::CompileError;

use super::{
    BOOLEAN_EXPRESSION_MARKER, BOOLEAN_FIELD_MARKER, BindingFact, JSON_VALUE_MARKER,
    JSON_VALUE_OPTION_MARKER, PROVENANCE_SEPARATOR, RETURN_BINDING_FACT_MARKER,
    STRING_EXPRESSION_MARKER, STRING_FIELD_MARKER, STRING_RETURN_MARKER, binding_fact_from_marker,
    call_fact, emit_expression, expression_is_associated_path, expression_path_ends_with,
    expression_struct_name, flight_error_throw, lexical_fact, unwrap_option_payload_is_string,
    unwrap_result_payload_is_string,
};
pub(super) fn expression_is_known_boolean(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::Binary(binary) => matches!(
            binary.op,
            BinOp::Eq(_)
                | BinOp::Ne(_)
                | BinOp::Lt(_)
                | BinOp::Le(_)
                | BinOp::Gt(_)
                | BinOp::Ge(_)
                | BinOp::And(_)
                | BinOp::Or(_)
        ),
        Expr::Field(field) => {
            if let syn::Member::Named(field_name) = &field.member {
                if let Some(owner) = expression_struct_name(&field.base, entities) {
                    return entities.contains(&format!(
                        "{BOOLEAN_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{field_name}"
                    ));
                }
            }
            false
        }
        Expr::Group(group) => expression_is_known_boolean(&group.expr, entities),
        Expr::Lit(literal) => matches!(&literal.lit, Lit::Bool(_)),
        Expr::Paren(paren) => expression_is_known_boolean(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            let name = path.path.segments[0].ident.to_string();
            entities.contains(&format!("{BOOLEAN_EXPRESSION_MARKER}{name}"))
        }
        Expr::Unary(unary) => matches!(unary.op, UnOp::Not(_)),
        _ => false,
    };
}

pub(super) fn expression_is_known_string(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::Block(block) => block.block.stmts.last().is_some_and(|stmt| match stmt {
            syn::Stmt::Expr(expr, None) => expression_is_known_string(expr, entities),
            _ => false,
        }),
        Expr::Call(call) => match call.func.as_ref() {
            Expr::Path(path) => {
                let mut segments = path.path.segments.iter().rev();
                let Some(function) = segments.next() else {
                    return false;
                };
                entities.contains(&format!("{STRING_RETURN_MARKER}{}", function.ident))
                    || ((function.ident == "new" || function.ident == "with_capacity")
                        && segments.next().is_some_and(|owner| owner.ident == "String"))
                    || (path.qself.is_none()
                        && call_fact(entities, RETURN_BINDING_FACT_MARKER, &path.path)
                            .as_ref()
                            .is_some_and(|fact| {
                                matches!(
                                    binding_fact_from_marker(fact),
                                    BindingFact::Structure(s) if s == "String" || s == "str"
                                )
                            }))
            }
            _ => false,
        },
        Expr::Group(group) => expression_is_known_string(&group.expr, entities),
        Expr::If(if_expr) => {
            let then_is_string = if_expr
                .then_branch
                .stmts
                .last()
                .is_some_and(|stmt| match stmt {
                    syn::Stmt::Expr(expr, None) => expression_is_known_string(expr, entities),
                    _ => false,
                });
            let else_is_string = if_expr
                .else_branch
                .as_ref()
                .is_some_and(|(_, expr)| expression_is_known_string(expr, entities));
            then_is_string || else_is_string
        }
        Expr::Index(index) => expression_is_known_string(&index.expr, entities),
        Expr::Lit(literal) => matches!(&literal.lit, Lit::Str(_) | Lit::Char(_)),
        Expr::Macro(expression) => expression
            .mac
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "format"),
        Expr::MethodCall(call) => {
            call.method == "to_string"
                || matches!(
                    call.method.to_string().as_str(),
                    "repeat"
                        | "replace"
                        | "replacen"
                        | "to_ascii_lowercase"
                        | "to_ascii_uppercase"
                        | "to_lowercase"
                        | "to_uppercase"
                        | "trim"
                        | "trim_end"
                        | "trim_end_matches"
                        | "trim_matches"
                        | "trim_start"
                        | "trim_start_matches"
                )
                || (matches!(
                    call.method.to_string().as_str(),
                    "as_str" | "clone" | "to_str"
                ) && expression_is_known_string(&call.receiver, entities))
                || (matches!(
                    call.method.to_string().as_str(),
                    "unwrap" | "expect" | "unwrap_or" | "unwrap_or_else" | "unwrap_or_default"
                ) && (expression_is_known_string(&call.receiver, entities)
                    || unwrap_option_payload_is_string(&call.receiver, entities)
                    || unwrap_result_payload_is_string(&call.receiver, entities)))
        }
        Expr::Field(field) => {
            let syn::Member::Named(field_name) = &field.member else {
                return false;
            };
            expression_struct_name(&field.base, entities).is_some_and(|identity| {
                entities.contains(&format!(
                    "{STRING_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                ))
            })
        }
        Expr::Match(match_expr) => match_expr.arms.iter().any(|arm| match arm.body.as_ref() {
            Expr::Block(block) => block.block.stmts.last().is_some_and(|stmt| match stmt {
                syn::Stmt::Expr(expr, None) => expression_is_known_string(expr, entities),
                _ => false,
            }),
            expr => expression_is_known_string(expr, entities),
        }),
        Expr::Paren(paren) => expression_is_known_string(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments.first().is_some_and(|segment| {
                entities.contains(&format!("{STRING_EXPRESSION_MARKER}{}", segment.ident))
                    || matches!(
                        lexical_fact(entities, &segment.ident.to_string()),
                        Some(BindingFact::Structure(s)) if s == "String" || s == "str"
                    )
            })
        }
        Expr::Reference(reference) => expression_is_known_string(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_is_known_string(&unary.expr, entities)
        }
        _ => false,
    };
}

pub(super) fn expression_is_option_of_json_value(
    expression: &Expr,
    entities: &HashSet<String>,
) -> bool {
    return match expression {
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments.first().is_some_and(|segment| {
                entities.contains(&format!("{JSON_VALUE_OPTION_MARKER}{}", segment.ident))
            })
        }
        Expr::MethodCall(call)
            if call.method == "get"
                && call.args.len() == 1
                && expression_is_json_value(&call.receiver, entities) =>
        {
            true
        }
        Expr::MethodCall(call)
            if call.method == "and_then"
                && call.args.len() == 1
                && (expression_is_json_value(&call.receiver, entities)
                    || expression_is_option_of_json_value(&call.receiver, entities)) =>
        {
            matches!(call.args.first(), Some(Expr::Closure(closure))
                if matches!(closure.body.as_ref(), Expr::MethodCall(inner)
                    if inner.method == "get" && inner.args.len() == 1))
        }
        Expr::Reference(reference) => expression_is_option_of_json_value(&reference.expr, entities),
        Expr::Paren(paren) => expression_is_option_of_json_value(&paren.expr, entities),
        Expr::Group(group) => expression_is_option_of_json_value(&group.expr, entities),
        _ => false,
    };
}

pub(super) fn expression_is_json_value(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments.first().is_some_and(|segment| {
                entities.contains(&format!("{JSON_VALUE_MARKER}{}", segment.ident))
            })
        }
        Expr::Index(index) => expression_is_json_value(&index.expr, entities),
        Expr::Reference(reference) => expression_is_json_value(&reference.expr, entities),
        Expr::Paren(paren) => expression_is_json_value(&paren.expr, entities),
        Expr::Group(group) => expression_is_json_value(&group.expr, entities),
        Expr::MethodCall(call)
            if call.method == "get"
                && call.args.len() == 1
                && expression_is_json_value(&call.receiver, entities) =>
        {
            true
        }
        Expr::MethodCall(call)
            if call.method == "and_then"
                && call.args.len() == 1
                && (expression_is_json_value(&call.receiver, entities)
                    || expression_is_option_of_json_value(&call.receiver, entities)) =>
        {
            matches!(call.args.first(), Some(Expr::Closure(closure))
                if matches!(closure.body.as_ref(), Expr::MethodCall(inner)
                    if inner.method == "get" && inner.args.len() == 1))
        }
        Expr::Field(field) => expression_is_json_value(&field.base, entities),
        _ => false,
    };
}

pub(super) fn emit_diverging_statement(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return match expression {
        Expr::Call(call) if expression_is_associated_path(&call.func, "panic", "panic_any") => {
            if let Some((constructor, message)) = flight_error_throw(&call.args[0]) {
                Ok(format!(
                    "throw new {constructor}({});",
                    emit_expression(message, entities)?
                ))
            } else {
                Ok(format!(
                    "throw {};",
                    emit_expression(&call.args[0], entities)?
                ))
            }
        }
        Expr::Call(call) if expression_path_ends_with(&call.func, "throw_error") => Ok(format!(
            "throw new Error({});",
            emit_expression(&call.args[0], entities)?
        )),
        Expr::Call(call) if expression_path_ends_with(&call.func, "throw_range_error") => {
            Ok(format!(
                "throw new RangeError({});",
                emit_expression(&call.args[0], entities)?
            ))
        }
        Expr::Call(call) if expression_path_ends_with(&call.func, "throw_type_error") => {
            Ok(format!(
                "throw new TypeError({});",
                emit_expression(&call.args[0], entities)?
            ))
        }
        Expr::Call(call) if expression_path_ends_with(&call.func, "throw_syntax_error") => {
            Ok(format!(
                "throw new SyntaxError({});",
                emit_expression(&call.args[0], entities)?
            ))
        }
        Expr::Macro(_) => {
            let emitted = emit_expression(expression, entities)?;
            let unwrapped = emitted
                .strip_prefix("(() => { ")
                .and_then(|rest| rest.strip_suffix(" })()"))
                .unwrap_or(&emitted);
            Ok(unwrapped.to_string())
        }
        _ => Ok(format!("{};", emit_expression(expression, entities)?)),
    };
}

pub(super) fn expression_is_diverging(expression: &Expr) -> bool {
    return match expression {
        Expr::Call(call) => {
            expression_is_associated_path(&call.func, "panic", "panic_any")
                || expression_path_ends_with(&call.func, "throw_error")
                || expression_path_ends_with(&call.func, "throw_range_error")
                || expression_path_ends_with(&call.func, "throw_type_error")
                || expression_path_ends_with(&call.func, "throw_syntax_error")
                || expression_is_associated_path(&call.func, "process", "exit")
        }
        Expr::Macro(mac) => macro_is_diverging(&mac.mac),
        _ => false,
    };
}

pub(super) fn macro_is_diverging(mac: &syn::Macro) -> bool {
    return mac.path.segments.last().is_some_and(|segment| {
        segment.ident == "panic" || segment.ident == "unreachable" || segment.ident == "todo"
    });
}

pub(super) fn statement_macro_is_diverging(statement: &syn::StmtMacro) -> bool {
    return macro_is_diverging(&statement.mac);
}
