use std::collections::HashSet;

use syn::{BinOp, Expr, Lit};

use crate::CompileError;

use super::{
    BindingFact, NUMERIC_FIELD_TYPE_MARKER, PROVENANCE_SEPARATOR, RETURN_BINDING_FACT_MARKER,
    binding_fact_from_marker, bitand_mask_type, call_fact, expression_struct_name, lexical_fact,
    named_type, numeric_associated_call_type, typed_array_element_primitive, unique_marker_suffix,
};
pub(super) fn expression_numeric_type(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    let name = match expression {
        Expr::Group(group) => return expression_numeric_type(&group.expr, entities),
        Expr::Paren(paren) => return expression_numeric_type(&paren.expr, entities),
        Expr::Reference(reference) => return expression_numeric_type(&reference.expr, entities),
        Expr::Cast(cast) => {
            return named_type(&cast.ty).filter(|name| {
                matches!(
                    name.as_str(),
                    "f32"
                        | "f64"
                        | "i8"
                        | "i16"
                        | "i32"
                        | "i64"
                        | "i128"
                        | "isize"
                        | "u8"
                        | "u16"
                        | "u32"
                        | "u64"
                        | "u128"
                        | "usize"
                )
            });
        }
        Expr::Binary(binary) => {
            if matches!(binary.op, BinOp::BitAnd(_)) {
                if let Some(mask_type) =
                    bitand_mask_type(&binary.right).or_else(|| bitand_mask_type(&binary.left))
                {
                    return Some(mask_type);
                }
            }
            let left = expression_numeric_type(&binary.left, entities);
            let right = expression_numeric_type(&binary.right, entities);
            return match (left, right) {
                (Some(l), Some(r)) if l == r => Some(l),
                (Some(t), None) | (None, Some(t)) => Some(t),
                _ => None,
            };
        }
        Expr::Call(call) => {
            if let Some(numeric) = numeric_associated_call_type(&call.func) {
                return Some(numeric);
            }
            if let Expr::Path(function) = call.func.as_ref() {
                if function.qself.is_none() {
                    if let Some(fact) =
                        call_fact(entities, RETURN_BINDING_FACT_MARKER, &function.path)
                    {
                        let binding = binding_fact_from_marker(&fact);
                        if let BindingFact::Structure(identity) = binding {
                            return match identity.as_str() {
                                "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128" | "isize"
                                | "u8" | "u16" | "u32" | "u64" | "u128" | "usize" => Some(identity),
                                _ => None,
                            };
                        }
                    }
                }
            }
            return None;
        }
        Expr::Block(block) => {
            return block.block.stmts.last().and_then(|stmt| match stmt {
                syn::Stmt::Expr(expr, None) => expression_numeric_type(expr, entities),
                _ => None,
            });
        }
        Expr::If(if_expr) => {
            let then_type = if_expr
                .then_branch
                .stmts
                .last()
                .and_then(|stmt| match stmt {
                    syn::Stmt::Expr(expr, None) => expression_numeric_type(expr, entities),
                    _ => None,
                });
            let else_type = if_expr
                .else_branch
                .as_ref()
                .and_then(|(_, expr)| expression_numeric_type(expr, entities));
            return match (then_type, else_type) {
                (Some(t), Some(e)) if t == e => Some(t),
                (Some(t), None) | (None, Some(t)) => Some(t),
                _ => None,
            };
        }
        Expr::Match(match_expr) => {
            let mut result: Option<String> = None;
            for arm in &match_expr.arms {
                let arm_type = match arm.body.as_ref() {
                    Expr::Block(block) => block.block.stmts.last().and_then(|stmt| match stmt {
                        syn::Stmt::Expr(expr, None) => expression_numeric_type(expr, entities),
                        _ => None,
                    }),
                    expr => expression_numeric_type(expr, entities),
                };
                match (&result, &arm_type) {
                    (None, Some(_)) => result = arm_type,
                    (Some(prev), Some(cur)) if prev == cur => {}
                    (Some(_), Some(_)) => return None,
                    _ => {}
                }
            }
            return result;
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(call.method.to_string().as_str(), "len" | "count") =>
        {
            return Some("usize".to_string());
        }
        Expr::MethodCall(call)
            if call.method == "abs"
                || call.method == "min"
                || call.method == "max"
                || call.method == "pow"
                || call.method == "rem_euclid"
                || call.method == "signum"
                || call.method == "wrapping_add"
                || call.method == "wrapping_sub"
                || call.method == "wrapping_mul"
                || call.method == "wrapping_neg"
                || call.method == "wrapping_abs"
                || call.method == "wrapping_shl"
                || call.method == "wrapping_shr"
                || call.method == "saturating_add"
                || call.method == "saturating_sub"
                || call.method == "saturating_mul"
                || call.method == "saturating_neg"
                || call.method == "saturating_abs"
                || call.method == "checked_add"
                || call.method == "checked_neg"
                || call.method == "checked_sub"
                || call.method == "checked_mul"
                || call.method == "checked_div"
                || call.method == "checked_rem"
                || call.method == "unsigned_abs"
                || call.method == "clamp"
                || call.method == "div_euclid"
                || call.method == "unwrap"
                || call.method == "expect"
                || call.method == "unwrap_or"
                || call.method == "unwrap_or_default"
                || call.method == "unwrap_or_else" =>
        {
            return expression_numeric_type(&call.receiver, entities);
        }
        Expr::Index(index) => {
            if let Expr::Path(path) = index.expr.as_ref() {
                if path.qself.is_none() && path.path.segments.len() == 1 {
                    let name = path.path.segments[0].ident.to_string();
                    match lexical_fact(entities, &name) {
                        Some(BindingFact::Sequence(element)) => {
                            if let BindingFact::Structure(identity) = element.as_ref() {
                                return match identity.as_str() {
                                    "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128"
                                    | "isize" | "u8" | "u16" | "u32" | "u64" | "u128" | "usize" => {
                                        Some(identity.clone())
                                    }
                                    _ => None,
                                };
                            }
                        }
                        Some(BindingFact::TypedArray(ref array_name)) => {
                            return typed_array_element_primitive(array_name)
                                .map(|p| p.to_string());
                        }
                        _ => {}
                    }
                }
            }
            return None;
        }
        Expr::Field(field) => {
            if let syn::Member::Unnamed(index) = &field.member {
                if let Expr::Path(path) = field.base.as_ref() {
                    if path.qself.is_none() && path.path.segments.len() == 1 {
                        let name = path.path.segments[0].ident.to_string();
                        if let Some(BindingFact::Tuple(elements)) = lexical_fact(entities, &name) {
                            let i = index.index as usize;
                            if i < elements.len() {
                                if let BindingFact::Structure(identity) = &elements[i] {
                                    return match identity.as_str() {
                                        "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128"
                                        | "isize" | "u8" | "u16" | "u32" | "u64" | "u128"
                                        | "usize" => Some(identity.clone()),
                                        _ => None,
                                    };
                                }
                            }
                        }
                    }
                }
            }
            if let syn::Member::Named(field_name) = &field.member {
                if let Some(owner) = expression_struct_name(&field.base, entities) {
                    return unique_marker_suffix(
                        entities,
                        &format!(
                            "{NUMERIC_FIELD_TYPE_MARKER}{owner}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                        ),
                    );
                }
            }
            return None;
        }
        Expr::Unary(unary) => return expression_numeric_type(&unary.expr, entities),
        Expr::Lit(literal) => return literal_numeric_suffix(literal),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments[0].ident.to_string()
        }
        _ => return None,
    };
    match lexical_fact(entities, &name)? {
        BindingFact::Structure(identity) => match identity.as_str() {
            "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128" | "isize" | "u8" | "u16"
            | "u32" | "u64" | "u128" | "usize" => Some(identity),
            _ => None,
        },
        _ => None,
    }
}

pub(super) fn is_integer_division(binary: &syn::ExprBinary, entities: &HashSet<String>) -> bool {
    let left_type = expression_numeric_type(&binary.left, entities);
    let right_type = expression_numeric_type(&binary.right, entities);
    let is_float = |t: &str| matches!(t, "f32" | "f64");
    let has_integer = left_type.as_deref().is_some_and(|t| !is_float(t))
        || right_type.as_deref().is_some_and(|t| !is_float(t));
    let has_float =
        left_type.as_deref().is_some_and(is_float) || right_type.as_deref().is_some_and(is_float);
    return has_integer && !has_float;
}

pub(super) fn literal_numeric_suffix(literal: &syn::ExprLit) -> Option<String> {
    let suffix = match &literal.lit {
        Lit::Int(int_lit) => int_lit.suffix(),
        Lit::Float(float_lit) => float_lit.suffix(),
        _ => return None,
    };
    return match suffix {
        "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128" | "isize" | "u8" | "u16" | "u32"
        | "u64" | "u128" | "usize" => Some(suffix.to_string()),
        _ => None,
    };
}
