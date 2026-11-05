use std::collections::HashSet;

use quote::ToTokens;
use syn::{Expr, Pat, Stmt};

use crate::CompileError;

use super::{
    FLIGHT_ERROR_RETURNS_MARKER, copy_expression_binding_sites, emit_block,
    emit_block_with_context, expression_is_associated_path, inject_tail_returns, write_indent,
};
// Whether a D15 future field's value is the closure it stores: `Arc::new(|..| ..)` or `|..| ..`.
pub(super) fn d15_future_field_closure(expression: &Expr) -> bool {
    return match expression {
        Expr::Closure(_) => true,
        Expr::Call(call) => {
            expression_is_associated_path(&call.func, "Arc", "new")
                && matches!(call.args.iter().collect::<Vec<_>>()[..], [Expr::Closure(_)])
        }
        _ => false,
    };
}

// The canonical D15 provider tail of a future-returning closure body:
//
//     let result = <value>;
//     return Box::pin(async move { result });   // or the same tail without `return`
//
// where `value` resolves only through `Ok(..)`/`Err(..)` tails of `match` arms and `if`/`else`
// branches (see `d15_result_tails`) and nothing else names `result`. Returns the statements before
// the `let` and `value`.
pub(super) fn d15_future_provider(statements: &[Stmt]) -> Option<(&[Stmt], &Expr)> {
    let [preceding @ .., Stmt::Local(local), last] = statements else {
        return None;
    };
    let returned = match last {
        Stmt::Expr(Expr::Return(returned), _) => returned.expr.as_deref()?,
        Stmt::Expr(expression, None) => expression,
        _ => return None,
    };
    let Expr::Call(pin) = returned else {
        return None;
    };
    let Expr::Path(function) = pin.func.as_ref() else {
        return None;
    };
    let segments = function
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    if !matches!(
        segments.iter().map(String::as_str).collect::<Vec<_>>()[..],
        ["Box", "pin"] | ["std" | "alloc", "boxed", "Box", "pin"]
    ) {
        return None;
    }
    let [Expr::Async(future)] = pin.args.iter().collect::<Vec<_>>()[..] else {
        return None;
    };
    let [Stmt::Expr(Expr::Path(output), None)] = &future.block.stmts[..] else {
        return None;
    };
    let Pat::Ident(binding) = &local.pat else {
        return None;
    };
    let initializer = local.init.as_ref()?;
    if initializer.diverge.is_some()
        || binding.by_ref.is_some()
        || binding.subpat.is_some()
        || !output.path.is_ident(&binding.ident)
        || !d15_result_tails(&initializer.expr)
    {
        return None;
    }
    return Some((preceding, &initializer.expr));
}

// Whether `expression` produces a `Result` only through `Ok(payload)`/`Err(payload)` tails of `match`
// arms, `if`/`else` branches and blocks, each payload naming neither `Ok` nor `Err`, with no other
// `Err` anywhere: then rewriting its tails as `return`s keeps every evaluation and its order.
pub(super) fn d15_result_tails(expression: &Expr) -> bool {
    fn names(tokens: proc_macro2::TokenStream, name: &str) -> bool {
        return tokens.into_iter().any(|token| match token {
            proc_macro2::TokenTree::Ident(identifier) => identifier == name,
            proc_macro2::TokenTree::Group(group) => names(group.stream(), name),
            _ => false,
        });
    }
    fn variant_tail(expression: &Expr) -> bool {
        return match expression {
            Expr::Call(call) => {
                matches!(call.func.as_ref(), Expr::Path(path)
                    if path.path.is_ident("Ok") || path.path.is_ident("Err"))
                    && call.args.len() == 1
                    && !names(call.args.to_token_stream(), "Ok")
                    && !names(call.args.to_token_stream(), "Err")
            }
            Expr::Block(block) if block.label.is_none() => match block.block.stmts.split_last() {
                Some((Stmt::Expr(tail, None), preceding)) => {
                    variant_tail(tail)
                        && preceding.iter().all(|statement| {
                            !names(statement.to_token_stream(), "Err")
                                && !names(statement.to_token_stream(), "Ok")
                        })
                }
                _ => false,
            },
            Expr::If(branch) => {
                !names(branch.cond.to_token_stream(), "Err")
                    && variant_tail(&Expr::Block(syn::ExprBlock {
                        attrs: Vec::new(),
                        label: None,
                        block: branch.then_branch.clone(),
                    }))
                    && branch
                        .else_branch
                        .as_ref()
                        .is_some_and(|(_, otherwise)| variant_tail(otherwise))
            }
            Expr::Match(choice) => {
                !names(choice.expr.to_token_stream(), "Err")
                    && choice.arms.iter().all(|arm| {
                        arm.guard
                            .as_ref()
                            .is_none_or(|(_, guard)| !names(guard.to_token_stream(), "Err"))
                            && !names(arm.pat.to_token_stream(), "Err")
                            && variant_tail(&arm.body)
                    })
            }
            Expr::Paren(paren) => variant_tail(&paren.expr),
            _ => false,
        };
    }
    return variant_tail(expression);
}

// Emits a proven D15 provider tail (see `d15_future_provider`) as the promise of an async arrow
// called at once. The arrow runs synchronously up to its first `await` (it has none), so `value`
// evaluates exactly when Rust computes `result`; its `Ok` tails return and its `Err` tails throw
// the canonical error, which rejects the promise exactly as the Rust future resolves `Err`.
pub(super) fn emit_d15_future_provider(
    out: &mut String,
    preceding: &[Stmt],
    value: &Expr,
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    let mut context = emit_block_with_context(out, preceding, entities, 1)?;
    let rewritten = inject_tail_returns(&[Stmt::Expr(value.clone(), None)]);
    let [returned] = &rewritten[..] else {
        unreachable!("one tail statement rewrites to one statement")
    };
    copy_expression_binding_sites(&mut context, value, returned);
    context.insert(FLIGHT_ERROR_RETURNS_MARKER.to_string());
    write_indent(out, 1);
    out.push_str("return (async () => {\n");
    emit_block(out, &rewritten, &context, 2)?;
    write_indent(out, 1);
    out.push_str("})();\n");
    return Ok(());
}
