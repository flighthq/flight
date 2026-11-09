use std::cmp::Ordering;
use std::collections::HashSet;
use std::fmt::Write;

use syn::{BinOp, Expr, Lit};

use crate::{CompileError, compile_error};

use super::{
    DataUnionPatternTest, PROVENANCE_SEPARATOR, TYPE_USE_MARKER, TYPE_USE_TARGET_MARKER,
    data_union_pattern_test, emit_block, emit_data_union_tuple_binding, emit_expression,
    emit_option_binding, emit_value_block, expression_is_ordered_primitive, expression_is_reusable,
    lexical_pattern_context, ordering_variant_value, snake_to_lower_camel,
};
pub(super) fn emit_if_expression(
    expression: &syn::ExprIf,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if let Some(iife) = emit_if_let_value_expression(expression, entities)? {
        return Ok(iife);
    }
    let condition = emit_expression(&expression.cond, entities)?;
    let then_value = emit_value_block(&expression.then_branch, entities)?;
    let Some((_, otherwise)) = &expression.else_branch else {
        return Err(compile_error(
            "Rust if expression used as a value needs an else branch",
        ));
    };
    let otherwise = match otherwise.as_ref() {
        Expr::Block(block) => emit_value_block(&block.block, entities)?,
        Expr::If(nested) => emit_if_expression(nested, entities)?,
        _ => {
            return Err(compile_error(
                "unsupported non-block else branch in Rust if expression",
            ));
        }
    };
    return Ok(format!("{condition} ? {then_value} : {otherwise}"));
}

// Whether reading `expression` twice is the same as reading it once: a variable or a field of one,
// possibly parenthesized or borrowed. Anything else (a call, a method call, an `.await`) runs code.
pub(super) fn expression_is_plain_place(expression: &Expr) -> bool {
    return match expression {
        Expr::Path(path) => path.qself.is_none(),
        Expr::Field(field) => expression_is_plain_place(&field.base),
        Expr::Paren(paren) => expression_is_plain_place(&paren.expr),
        Expr::Group(group) => expression_is_plain_place(&group.expr),
        Expr::Reference(reference) => expression_is_plain_place(&reference.expr),
        _ => false,
    };
}

pub(super) fn emit_if_let_value_expression(
    expression: &syn::ExprIf,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    let option_binding = emit_option_binding(&expression.cond, entities)?;
    let tuple_binding = emit_data_union_tuple_binding(&expression.cond, entities)?;
    if option_binding.is_none() && tuple_binding.is_none() {
        if let Expr::Let(binding) = expression.cond.as_ref() {
            if let Some(test) = data_union_pattern_test(&binding.pat, "$ifLet", entities)? {
                return emit_if_let_data_union_value_expression(
                    expression, binding, &test, entities,
                )
                .map(Some);
            }
        }
        return Ok(None);
    }
    let Some((_, otherwise)) = &expression.else_branch else {
        return Err(compile_error(
            "Rust `if let` expression used as a value needs an else branch",
        ));
    };
    let then_context = if let Expr::Let(binding) = expression.cond.as_ref() {
        lexical_pattern_context(entities, &binding.pat)
    } else {
        entities.clone()
    };
    let mut out = "(() => {\n".to_string();
    if let Some((name, scrutinee, absent)) = &option_binding {
        // The scrutinee is both tested and bound, so a call (or `.await`) in it is evaluated once,
        // into `$ifLet` as the enum-variant form does; a plain variable or field is read in place.
        let scrutinee = match expression.cond.as_ref() {
            Expr::Let(binding) if !expression_is_plain_place(&binding.expr) => {
                writeln!(out, "  const $ifLet = {scrutinee};")
                    .expect("writing to a String cannot fail");
                "$ifLet".to_string()
            }
            _ => scrutinee.clone(),
        };
        writeln!(out, "  if ({scrutinee} !== {absent}) {{")
            .expect("writing to a String cannot fail");
        if *name != scrutinee {
            writeln!(out, "    const {name} = {scrutinee};")
                .expect("writing to a String cannot fail");
        }
    } else if let Some((condition, bindings)) = &tuple_binding {
        writeln!(out, "  if ({condition}) {{").expect("writing to a String cannot fail");
        for (name, value) in bindings {
            if name != value {
                writeln!(out, "    const {name} = {value};")
                    .expect("writing to a String cannot fail");
            }
        }
    }
    let then_value = emit_value_block(&expression.then_branch, &then_context)?;
    writeln!(out, "    return {then_value};").expect("writing to a String cannot fail");
    out.push_str("  } else {\n");
    let else_value = match otherwise.as_ref() {
        Expr::Block(block) => emit_value_block(&block.block, entities)?,
        Expr::If(nested) => emit_if_expression(nested, entities)?,
        _ => {
            return Err(compile_error(
                "unsupported non-block else branch in Rust if-let expression",
            ));
        }
    };
    writeln!(out, "    return {else_value};").expect("writing to a String cannot fail");
    out.push_str("  }\n})()");
    return Ok(Some(out));
}

pub(super) fn emit_if_let_data_union_value_expression(
    expression: &syn::ExprIf,
    binding: &syn::ExprLet,
    test: &DataUnionPatternTest,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let Some((_, otherwise)) = &expression.else_branch else {
        return Err(compile_error(
            "Rust `if let` expression used as a value needs an else branch",
        ));
    };
    let then_context = lexical_pattern_context(entities, &binding.pat);
    let scrutinee = emit_expression(&binding.expr, entities)?;
    let predicate = test.predicate.as_deref().unwrap_or("true");
    let mut out = "(() => {\n".to_string();
    writeln!(out, "  const $ifLet = {scrutinee};").expect("writing to a String cannot fail");
    writeln!(out, "  if ({predicate}) {{").expect("writing to a String cannot fail");
    for (name, expr) in &test.bindings {
        let camel = snake_to_lower_camel(name);
        writeln!(out, "    const {camel} = {expr};").expect("writing to a String cannot fail");
    }
    let then_value = emit_value_block(&expression.then_branch, &then_context)?;
    writeln!(out, "    return {then_value};").expect("writing to a String cannot fail");
    out.push_str("  } else {\n");
    let else_value = match otherwise.as_ref() {
        Expr::Block(block) => emit_value_block(&block.block, entities)?,
        Expr::If(nested) => emit_if_expression(nested, entities)?,
        _ => {
            return Err(compile_error(
                "unsupported non-block else branch in Rust if-let expression",
            ));
        }
    };
    writeln!(out, "    return {else_value};").expect("writing to a String cannot fail");
    out.push_str("  }\n})()");
    return Ok(out);
}

pub(super) fn emit_loop_value_expression(
    loop_expr: &syn::ExprLoop,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let mut body = String::new();
    emit_block(&mut body, &loop_expr.body.stmts, entities, 2)?;
    let mut out = "(() => {\n  for (;;) {\n".to_string();
    out.push_str(&body);
    out.push_str("  }\n})()");
    return Ok(out);
}

pub(super) fn emit_inclusive_comparison(
    binary: &syn::ExprBinary,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    if !matches!(binary.op, BinOp::Or(_)) {
        return Ok(None);
    }
    let (Expr::Binary(left), Expr::Binary(right)) = (binary.left.as_ref(), binary.right.as_ref())
    else {
        return Ok(None);
    };
    let (strict, equal) = if matches!(left.op, BinOp::Gt(_) | BinOp::Lt(_))
        && matches!(right.op, BinOp::Eq(_))
    {
        (left, right)
    } else if matches!(right.op, BinOp::Gt(_) | BinOp::Lt(_)) && matches!(left.op, BinOp::Eq(_)) {
        (right, left)
    } else {
        return Ok(None);
    };
    let strict_left = emit_expression(&strict.left, entities)?;
    let strict_right = emit_expression(&strict.right, entities)?;
    let equal_left = emit_expression(&equal.left, entities)?;
    let equal_right = emit_expression(&equal.right, entities)?;
    if !((strict_left == equal_left && strict_right == equal_right)
        || (strict_left == equal_right && strict_right == equal_left))
    {
        return Ok(None);
    }
    let operator = if matches!(strict.op, BinOp::Gt(_)) {
        ">="
    } else {
        "<="
    };
    return Ok(Some(format!("{strict_left} {operator} {strict_right}")));
}

pub(crate) fn js_string_literal(s: &str) -> String {
    let has_single = s.contains('\'');
    let has_double = s.contains('"');
    let use_double = has_single && !has_double;
    let quote = if use_double { '"' } else { '\'' };
    let mut out = String::with_capacity(s.len() + 2);
    out.push(quote);
    for c in s.chars() {
        match c {
            '\'' if !use_double => out.push_str("\\'"),
            '"' if use_double => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\0' => out.push_str("\\0"),
            c if c.is_control() => {
                if (c as u32) < 0x100 {
                    write!(out, "\\x{:02x}", c as u32).unwrap();
                } else {
                    write!(out, "\\u{:04x}", c as u32).unwrap();
                }
            }
            c => out.push(c),
        }
    }
    out.push(quote);
    return out;
}

pub(super) fn emit_literal(literal: &Lit) -> Result<String, CompileError> {
    return match literal {
        Lit::Bool(value) => Ok(value.value.to_string()),
        Lit::Byte(value) => Ok(value.value().to_string()),
        Lit::ByteStr(value) => Ok(format!("new Uint8Array({:?})", value.value())),
        Lit::Char(value) => Ok(js_string_literal(&value.value().to_string())),
        Lit::Float(value) => Ok(numeric_literal_spelling(&value.to_string(), value.suffix())),
        Lit::Int(value) => Ok(numeric_literal_spelling(&value.to_string(), value.suffix())),
        Lit::Str(value) => Ok(js_string_literal(&value.value())),
        _ => Err(compile_error("unsupported Rust literal")),
    };
}

// An `Ordering` is lowered to a number whose sign is the ordering (`.partial_cmp()` yields a
// difference), so equality against a variant compares signs rather than exact values.
pub(super) fn emit_ordering_variant_comparison(
    binary: &syn::ExprBinary,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    let (ordering, variant) = match (binary.left.as_ref(), binary.right.as_ref()) {
        (ordering, Expr::Path(path)) if ordering_variant_value(&path.path).is_some() => {
            (ordering, ordering_variant_value(&path.path))
        }
        (Expr::Path(path), ordering) if ordering_variant_value(&path.path).is_some() => {
            (ordering, ordering_variant_value(&path.path))
        }
        _ => return Ok(None),
    };
    let variant = variant.expect("guarded by the match arm");
    let operator = if matches!(binary.op, BinOp::Ne(_)) {
        "!=="
    } else {
        "==="
    };
    return Ok(Some(format!(
        "Math.sign({}) {operator} {variant}",
        emit_expression(ordering, entities)?
    )));
}

pub(crate) fn numeric_literal_spelling(spelling: &str, suffix: &str) -> String {
    let base = if suffix.is_empty() {
        spelling
    } else {
        spelling
            .strip_suffix(suffix)
            .unwrap_or(spelling)
            .trim_end_matches('_')
    };
    if base.len() >= 3 && base.ends_with(".0") && base.as_bytes()[base.len() - 3].is_ascii_digit() {
        return base[..base.len() - 2].to_string();
    }
    if base.starts_with("0x") || base.starts_with("0X") {
        return base.to_ascii_lowercase();
    }
    return base.to_string();
}

pub(super) fn json_value_function_ref_lowering(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    let Expr::Path(path) = expression else {
        return None;
    };
    if path.qself.is_some() || path.path.segments.len() != 2 {
        return None;
    }
    let owner = path.path.segments[0].ident.to_string();
    let method = path.path.segments[1].ident.to_string();
    if !entities.contains(&format!("{TYPE_USE_MARKER}{owner}")) {
        return None;
    }
    let prefix = format!("{TYPE_USE_TARGET_MARKER}{owner}{PROVENANCE_SEPARATOR}");
    let is_json_value = entities
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix))
        .is_some_and(|imported| {
            matches!(imported, "serde_json::Value" | "serde_json::value::Value")
        });
    if !is_json_value {
        return None;
    }
    return match method.as_str() {
        "as_str" => Some(
            "(typeof value === 'string' ? value : undefined)".to_string(),
        ),
        "as_f64" => Some(
            "(typeof value === 'number' ? value : undefined)".to_string(),
        ),
        "as_i64" | "as_u64" => Some(
            "(typeof value === 'number' && Number.isInteger(value) ? value : undefined)"
                .to_string(),
        ),
        "as_bool" => Some(
            "(typeof value === 'boolean' ? value : undefined)".to_string(),
        ),
        "as_array" => Some(
            "(Array.isArray(value) ? value : undefined)".to_string(),
        ),
        "as_object" => Some(
            "(typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined)".to_string(),
        ),
        _ => None,
    };
}

pub(super) fn emit_encode_utf16_cmp(
    left: &Expr,
    right: &Expr,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    let left_string = match left {
        Expr::MethodCall(call) if call.args.is_empty() && call.method == "encode_utf16" => {
            Some(call.receiver.as_ref())
        }
        _ => None,
    };
    let right_string = match right {
        Expr::MethodCall(call) if call.args.is_empty() && call.method == "encode_utf16" => {
            Some(call.receiver.as_ref())
        }
        _ => None,
    };
    let (Some(left_inner), Some(right_inner)) = (left_string, right_string) else {
        return Ok(None);
    };
    let left_text = emit_expression(left_inner, entities)?;
    let right_text = emit_expression(right_inner, entities)?;
    if expression_is_reusable(left_inner) && expression_is_reusable(right_inner) {
        return Ok(Some(format!(
            "{left_text} < {right_text} ? -1 : {left_text} > {right_text} ? 1 : 0"
        )));
    }
    return Ok(Some(format!(
        "((left, right) => (left < right ? -1 : left > right ? 1 : 0))({left_text}, {right_text})"
    )));
}

pub(super) fn emit_ordered_comparison(
    left: &Expr,
    right: &Expr,
    left_text: &str,
    right_text: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if !expression_is_ordered_primitive(left, entities)
        || !expression_is_ordered_primitive(right, entities)
    {
        return Err(compile_error(
            "portable `.cmp()` requires operands declared as Rust integers or strings",
        ));
    }
    if expression_is_reusable(left) && expression_is_reusable(right) {
        return Ok(format!(
            "{left_text} < {right_text} ? -1 : {left_text} > {right_text} ? 1 : 0"
        ));
    }
    return Ok(format!(
        "((left, right) => (left < right ? -1 : left > right ? 1 : 0))({left_text}, {right_text})"
    ));
}
