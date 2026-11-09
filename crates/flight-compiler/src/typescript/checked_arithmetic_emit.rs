use std::collections::HashSet;

use syn::{Expr, Pat, UnOp};

use crate::CompileError;

use super::{emit_expression, expression_numeric_type, pattern_identifiers};

// A Rust `checked_add` / `checked_sub` / `checked_mul` / `checked_neg`: the exact JavaScript result and
// the range test under which Rust reports `None` instead of a value.
pub(super) struct CheckedArithmetic {
    pub value: String,
    pub overflow: String,
}

// The representable range of a `checked_*` result, by the receiver's Rust numeric type. Unsigned
// types bottom out at 0; 8-, 16- and 32-bit types use their exact range. A 64-bit or pointer-sized
// type keeps the `i32` ceiling the lowering has always used (its values are array lengths and indices
// in TypeScript), and an unknown type keeps the full `i32` range.
pub(super) fn checked_arithmetic_bounds(
    numeric_type: Option<&str>,
) -> (&'static str, &'static str) {
    return match numeric_type {
        Some("u8") => ("0", "0xff"),
        Some("u16") => ("0", "0xffff"),
        Some("u32") => ("0", "0xffffffff"),
        Some("u64" | "u128" | "usize") => ("0", "0x7fffffff"),
        Some("i8") => ("-0x80", "0x7f"),
        Some("i16") => ("-0x8000", "0x7fff"),
        _ => ("-0x80000000", "0x7fffffff"),
    };
}

// The operator of a `checked_*` method over `(receiver, argument)`, or `None` for another method.
pub(super) fn checked_arithmetic_operator(method: &str, arguments: usize) -> Option<&'static str> {
    return match (method, arguments) {
        ("checked_add", 1) => Some("+"),
        ("checked_sub", 1) => Some("-"),
        ("checked_mul", 1) => Some("*"),
        ("checked_neg", 0) => Some("neg"),
        _ => None,
    };
}

// `x.checked_op(y)` whose operands may be read more than once: the inline value and overflow test.
// `None` when an operand could have an effect or a cost that repeating it would change.
pub(super) fn inline_checked_arithmetic(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<Option<CheckedArithmetic>, CompileError> {
    let Expr::MethodCall(call) = peel(expression) else {
        return Ok(None);
    };
    let Some(operator) = checked_arithmetic_operator(&call.method.to_string(), call.args.len())
    else {
        return Ok(None);
    };
    if !operand_is_rereadable(&call.receiver) || !call.args.iter().all(operand_is_rereadable) {
        return Ok(None);
    }
    let receiver = emit_operand(&call.receiver, entities)?;
    let value = if operator == "neg" {
        format!("-{receiver}")
    } else {
        format!(
            "{receiver} {operator} {}",
            emit_operand(&call.args[0], entities)?
        )
    };
    let numeric_type = expression_numeric_type(&call.receiver, entities);
    let (minimum, maximum) = checked_arithmetic_bounds(numeric_type.as_deref());
    return Ok(Some(CheckedArithmetic {
        overflow: format!("{value} > {maximum} || {value} < {minimum}"),
        value: format!("({value})"),
    }));
}

// `checked.map_or(default, |v| body)` and the other `Option` consumers over an inline `checked_*`:
// the overflow test chooses the `None` result, and the closure parameter reads the exact value.
pub(super) fn emit_checked_arithmetic_consumer(
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    let method = call.method.to_string();
    let arguments = call.args.iter().collect::<Vec<_>>();
    if !matches!(
        (method.as_str(), arguments.len()),
        ("map_or", 2)
            | ("unwrap_or", 1)
            | ("unwrap_or_else", 1)
            | ("is_some", 0)
            | ("is_none", 0)
            | ("is_none_or", 1)
            | ("is_some_and", 1)
    ) {
        return Ok(None);
    }
    let Some(checked) = inline_checked_arithmetic(&call.receiver, entities)? else {
        return Ok(None);
    };
    let Expr::MethodCall(arithmetic) = peel(&call.receiver) else {
        unreachable!("an inline checked operation is a method call");
    };
    let value_expression = checked_value_expression(arithmetic);
    let overflow = &checked.overflow;
    let value = &checked.value;
    let emitted = match method.as_str() {
        "is_none" => format!("({overflow})"),
        "is_some" => format!("!({overflow})"),
        "unwrap_or" => format!(
            "({overflow} ? {} : {value})",
            emit_expression(arguments[0], entities)?
        ),
        "unwrap_or_else" => {
            let Some(fallback) = closure_body(arguments[0], 0) else {
                return Ok(None);
            };
            format!(
                "({overflow} ? {} : {value})",
                emit_expression(fallback, entities)?
            )
        }
        "map_or" => {
            let Some(body) = substituted_closure_body(arguments[1], &value_expression) else {
                return Ok(None);
            };
            format!(
                "({overflow} ? {} : {})",
                emit_expression(arguments[0], entities)?,
                emit_expression(&body, entities)?
            )
        }
        "is_none_or" => {
            let Some(body) = substituted_closure_body(arguments[0], &value_expression) else {
                return Ok(None);
            };
            format!("({overflow} || {})", emit_expression(&body, entities)?)
        }
        "is_some_and" => {
            let Some(body) = substituted_closure_body(arguments[0], &value_expression) else {
                return Ok(None);
            };
            format!("(!({overflow}) && {})", emit_expression(&body, entities)?)
        }
        _ => unreachable!("guarded by the consumer match above"),
    };
    return Ok(Some(emitted));
}

// The Rust arithmetic a successful `checked_*` produces, for substitution into a closure body.
fn checked_value_expression(call: &syn::ExprMethodCall) -> Expr {
    let receiver = call.receiver.as_ref();
    return match call.method.to_string().as_str() {
        "checked_add" => {
            let argument = &call.args[0];
            syn::parse_quote!((#receiver + #argument))
        }
        "checked_sub" => {
            let argument = &call.args[0];
            syn::parse_quote!((#receiver - #argument))
        }
        "checked_mul" => {
            let argument = &call.args[0];
            syn::parse_quote!((#receiver * #argument))
        }
        _ => syn::parse_quote!((-#receiver)),
    };
}

fn closure_body(expression: &Expr, parameters: usize) -> Option<&Expr> {
    let Expr::Closure(closure) = peel(expression) else {
        return None;
    };
    return (closure.inputs.len() == parameters && closure.asyncness.is_none())
        .then_some(closure.body.as_ref());
}

// The body of `|v| body` with each read of `v` replaced by `value`. A typed or destructuring
// parameter, or a body that rebinds the parameter's name, keeps the general lowering.
fn substituted_closure_body(expression: &Expr, value: &Expr) -> Option<Expr> {
    let Expr::Closure(closure) = peel(expression) else {
        return None;
    };
    if closure.inputs.len() != 1 || closure.asyncness.is_some() {
        return None;
    }
    let Pat::Ident(parameter) = &closure.inputs[0] else {
        return None;
    };
    if parameter.by_ref.is_some() || parameter.subpat.is_some() {
        return None;
    }
    struct Substitute<'a> {
        name: &'a syn::Ident,
        value: &'a Expr,
        rebound: bool,
    }
    impl syn::visit_mut::VisitMut for Substitute<'_> {
        fn visit_pat_mut(&mut self, pattern: &mut Pat) {
            if pattern_identifiers(pattern).contains(&self.name) {
                self.rebound = true;
            }
        }
        fn visit_expr_mut(&mut self, expression: &mut Expr) {
            if let Expr::Path(path) = expression
                && path.qself.is_none()
                && path.path.is_ident(self.name)
            {
                *expression = self.value.clone();
                return;
            }
            syn::visit_mut::visit_expr_mut(self, expression);
        }
    }
    let mut body = closure.body.as_ref().clone();
    let mut substitute = Substitute {
        name: &parameter.ident,
        value,
        rebound: false,
    };
    syn::visit_mut::VisitMut::visit_expr_mut(&mut substitute, &mut body);
    return (!substitute.rebound).then_some(body);
}

fn emit_operand(expression: &Expr, entities: &HashSet<String>) -> Result<String, CompileError> {
    let emitted = emit_expression(expression, entities)?;
    if emitted
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | '$'))
    {
        return Ok(emitted);
    }
    return Ok(format!("({emitted})"));
}

// An operand the inline form may evaluate more than once: a literal, a variable or field read, or a
// `.len()` / cast / negation / dereference of one.
fn operand_is_rereadable(expression: &Expr) -> bool {
    return match expression {
        Expr::Lit(_) => true,
        Expr::Path(path) => path.qself.is_none(),
        Expr::Field(field) => operand_is_rereadable(&field.base),
        Expr::Cast(cast) => operand_is_rereadable(&cast.expr),
        Expr::Group(group) => operand_is_rereadable(&group.expr),
        Expr::Paren(paren) => operand_is_rereadable(&paren.expr),
        Expr::Reference(reference) => operand_is_rereadable(&reference.expr),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Neg(_) | UnOp::Deref(_)) => {
            operand_is_rereadable(&unary.expr)
        }
        Expr::MethodCall(call) => {
            call.method == "len" && call.args.is_empty() && operand_is_rereadable(&call.receiver)
        }
        _ => false,
    };
}

fn peel(expression: &Expr) -> &Expr {
    return match expression {
        Expr::Group(group) => peel(&group.expr),
        Expr::Paren(paren) => peel(&paren.expr),
        expression => expression,
    };
}
