use std::collections::HashSet;
use std::fmt::Write;

use syn::{Expr, Pat, Stmt};

use crate::{CompileError, compile_error};

use super::{
    ITER_MUT_ALIAS_MARKER, REFERENCE_PARAMETER_BINDING_MARKER, STRING_EXPRESSION_MARKER,
    emit_expression, emit_pattern, for_loop_iterates_chars, for_loop_iterates_strings,
    lexical_binding, lexical_pattern_context, local_pattern_name, pattern_identifiers,
    pattern_is_mutable, peel_reference_and_paren, write_indent,
};
pub(super) enum IterMutChain<'a> {
    Bare,
    Enumerate,
    Take(&'a Expr),
    EnumerateTake(&'a Expr),
    Zip(&'a Expr),
}

pub(super) fn is_mutable_reference(expression: &Expr) -> bool {
    match expression {
        Expr::Reference(reference) => reference.mutability.is_some(),
        Expr::Paren(paren) => is_mutable_reference(&paren.expr),
        Expr::Group(group) => is_mutable_reference(&group.expr),
        _ => false,
    }
}

pub(super) fn iter_mut_chain<'a>(expression: &'a Expr) -> Option<(&'a Expr, IterMutChain<'a>)> {
    if is_mutable_reference(expression) {
        let inner = peel_reference_and_paren(expression);
        if !matches!(inner, Expr::MethodCall(_)) {
            return Some((inner, IterMutChain::Bare));
        }
    }
    let call = match peel_reference_and_paren(expression) {
        Expr::MethodCall(call) => call,
        _ => return None,
    };
    if call.method == "iter_mut" && call.args.is_empty() {
        return Some((&call.receiver, IterMutChain::Bare));
    }
    if call.method == "enumerate" && call.args.is_empty() {
        if let Expr::MethodCall(inner) = call.receiver.as_ref() {
            if inner.method == "iter_mut" && inner.args.is_empty() {
                return Some((&inner.receiver, IterMutChain::Enumerate));
            }
        }
    }
    if call.method == "take" && call.args.len() == 1 {
        if let Expr::MethodCall(inner) = call.receiver.as_ref() {
            if inner.method == "iter_mut" && inner.args.is_empty() {
                return Some((&inner.receiver, IterMutChain::Take(&call.args[0])));
            }
            if inner.method == "enumerate" && inner.args.is_empty() {
                if let Expr::MethodCall(inner2) = inner.receiver.as_ref() {
                    if inner2.method == "iter_mut" && inner2.args.is_empty() {
                        return Some((
                            &inner2.receiver,
                            IterMutChain::EnumerateTake(&call.args[0]),
                        ));
                    }
                }
            }
        }
    }
    if call.method == "zip" && call.args.len() == 1 {
        if let Expr::MethodCall(inner) = call.receiver.as_ref() {
            if inner.method == "iter_mut" && inner.args.is_empty() {
                return Some((&inner.receiver, IterMutChain::Zip(&call.args[0])));
            }
        }
    }
    None
}

pub(super) fn emit_iter_mut_loop(
    out: &mut String,
    loop_expression: &syn::ExprForLoop,
    collection: &Expr,
    chain: IterMutChain<'_>,
    entities: &HashSet<String>,
    indent: usize,
    emit_body: fn(&mut String, &[Stmt], &HashSet<String>, usize) -> Result<(), CompileError>,
) -> Result<(), CompileError> {
    let collection_expr = emit_expression(collection, entities)?;
    let index_var = "__i";
    let (has_enumerate, take_bound) = match &chain {
        IterMutChain::Bare => (false, None),
        IterMutChain::Enumerate => (true, None),
        IterMutChain::Take(bound) => (false, Some(emit_expression(bound, entities)?)),
        IterMutChain::EnumerateTake(bound) => (true, Some(emit_expression(bound, entities)?)),
        IterMutChain::Zip(_) => (false, None),
    };
    let limit = match &take_bound {
        Some(bound) => format!("Math.min({collection_expr}.length, {bound})"),
        None => format!("{collection_expr}.length"),
    };

    let mut loop_context = lexical_pattern_context(entities, &loop_expression.pat);
    if for_loop_iterates_strings(&loop_expression.expr, entities) {
        if let Some(name) = local_pattern_name(&loop_expression.pat) {
            loop_context.insert(format!("{STRING_EXPRESSION_MARKER}{name}"));
        }
    }
    let mark_reference = |context: &mut HashSet<String>, pattern: &Pat| {
        for name in pattern_identifiers(pattern) {
            if let Some(id) = lexical_binding(context, &name.to_string()) {
                context.insert(format!("{REFERENCE_PARAMETER_BINDING_MARKER}{id}"));
            }
        }
    };
    match &chain {
        IterMutChain::Enumerate | IterMutChain::EnumerateTake(_) => {
            if let Pat::Tuple(tuple) = &*loop_expression.pat {
                if let Some(element_pat) = tuple.elems.last() {
                    mark_reference(&mut loop_context, element_pat);
                }
            }
        }
        IterMutChain::Zip(_) => {
            if let Pat::Tuple(tuple) = &*loop_expression.pat {
                if let Some(first_pat) = tuple.elems.first() {
                    mark_reference(&mut loop_context, first_pat);
                }
            }
        }
        _ => mark_reference(&mut loop_context, &loop_expression.pat),
    }

    let add_alias =
        |context: &mut HashSet<String>, pattern: &Pat, collection: &str, index: &str| {
            if let Some(name) = local_pattern_name(pattern)
                && let Some(id) = lexical_binding(context, &name)
            {
                context.insert(format!("{ITER_MUT_ALIAS_MARKER}{id}={collection}[{index}]"));
            }
        };

    if let IterMutChain::Zip(zip_expr) = &chain {
        let zip_collection = emit_expression(zip_expr, entities)?;
        let Pat::Tuple(tuple) = &*loop_expression.pat else {
            return Err(compile_error(
                "portable iter_mut().zip() requires a tuple pattern",
            ));
        };
        if tuple.elems.len() != 2 {
            return Err(compile_error(
                "portable iter_mut().zip() requires a 2-element tuple pattern",
            ));
        }
        let zip_name = emit_pattern(&tuple.elems[1])?;
        add_alias(
            &mut loop_context,
            &tuple.elems[0],
            &collection_expr,
            index_var,
        );
        write_indent(out, indent);
        writeln!(
            out,
            "for (let {index_var} = 0; {index_var} < Math.min({collection_expr}.length, {zip_collection}.length); {index_var}++) {{"
        )
        .expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "const {zip_name} = {zip_collection}[{index_var}];")
            .expect("writing to a String cannot fail");
        emit_body(out, &loop_expression.body.stmts, &loop_context, indent + 1)?;
        write_indent(out, indent);
        out.push_str("}\n");
        return Ok(());
    }

    if has_enumerate {
        let Pat::Tuple(tuple) = &*loop_expression.pat else {
            return Err(compile_error(
                "portable iter_mut().enumerate() requires a tuple pattern",
            ));
        };
        if tuple.elems.len() != 2 {
            return Err(compile_error(
                "portable iter_mut().enumerate() requires a 2-element tuple pattern",
            ));
        }
        let index_name = emit_pattern(&tuple.elems[0])?;
        add_alias(
            &mut loop_context,
            tuple
                .elems
                .last()
                .expect("two tuple elements were required"),
            &collection_expr,
            &index_name,
        );
        write_indent(out, indent);
        writeln!(
            out,
            "for (let {index_name} = 0; {index_name} < {limit}; {index_name}++) {{"
        )
        .expect("writing to a String cannot fail");
        emit_body(out, &loop_expression.body.stmts, &loop_context, indent + 1)?;
        write_indent(out, indent);
        out.push_str("}\n");
        return Ok(());
    }

    add_alias(
        &mut loop_context,
        &loop_expression.pat,
        &collection_expr,
        index_var,
    );
    write_indent(out, indent);
    writeln!(
        out,
        "for (let {index_var} = 0; {index_var} < {limit}; {index_var}++) {{"
    )
    .expect("writing to a String cannot fail");
    emit_body(out, &loop_expression.body.stmts, &loop_context, indent + 1)?;
    write_indent(out, indent);
    out.push_str("}\n");
    Ok(())
}

// Mutable sequence iteration is one shared aliasing rule for generated sources and portable tests.
// The caller supplies its own statement emitter so Vitest assertions and production statements keep
// their distinct lowering while both write directly through the indexed collection slot.
pub(crate) fn emit_iter_mut_loop_if_supported(
    out: &mut String,
    loop_expression: &syn::ExprForLoop,
    entities: &HashSet<String>,
    indent: usize,
    emit_body: fn(&mut String, &[Stmt], &HashSet<String>, usize) -> Result<(), CompileError>,
) -> Result<bool, CompileError> {
    let Some((collection, chain)) = iter_mut_chain(&loop_expression.expr) else {
        return Ok(false);
    };
    emit_iter_mut_loop(
        out,
        loop_expression,
        collection,
        chain,
        entities,
        indent,
        emit_body,
    )?;
    return Ok(true);
}

pub(crate) fn emit_for_header(
    pattern: &Pat,
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let mutable = pattern_is_mutable(pattern);
    let pattern = emit_pattern(pattern)?;
    let (range_expr, step_override) = if let Expr::MethodCall(call) = expression {
        if call.method == "step_by" && call.args.len() == 1 {
            (call.receiver.as_ref(), Some(&call.args[0]))
        } else {
            (expression, None)
        }
    } else {
        (expression, None)
    };
    if let Expr::Range(range) = peel_reference_and_paren(range_expr) {
        let Some(end) = &range.end else {
            return Err(compile_error("portable Rust range needs an end"));
        };
        let start = range
            .start
            .as_deref()
            .map(|s| emit_expression(s, entities))
            .transpose()?
            .unwrap_or_else(|| "0".to_string());
        let end = emit_expression(end, entities)?;
        let comparison = match range.limits {
            syn::RangeLimits::HalfOpen(_) => "<",
            syn::RangeLimits::Closed(_) => "<=",
        };
        let step = if let Some(step_expr) = step_override {
            emit_expression(step_expr, entities)?
        } else {
            "1".to_string()
        };
        let increment = if step == "1" {
            format!("{pattern}++")
        } else {
            format!("{pattern} += {step}")
        };
        return Ok(format!(
            "let {pattern} = {start}; {pattern} {comparison} {end}; {increment}"
        ));
    }
    let mut iterable = if for_loop_iterates_chars(expression) {
        if let Expr::MethodCall(call) = expression {
            emit_expression(&call.receiver, entities)?
        } else if let Expr::Reference(reference) = expression {
            if let Expr::MethodCall(call) = reference.expr.as_ref() {
                emit_expression(&call.receiver, entities)?
            } else {
                emit_expression(expression, entities)?
            }
        } else {
            emit_expression(expression, entities)?
        }
    } else {
        emit_expression(expression, entities)?
    };
    if let Expr::Array(array) = expression
        && !array.elems.is_empty()
        && array
            .elems
            .iter()
            .all(|element| matches!(element, Expr::Tuple(_)))
    {
        // TypeScript otherwise widens heterogeneous tuple literals into arrays of unions before
        // destructuring them. A Rust array of tuples has fixed positional types, so retain those
        // facts for the loop binding with a const assertion.
        iterable = format!("{iterable} as const");
    }
    let keyword = if mutable { "let" } else { "const" };
    return Ok(format!("{keyword} {pattern} of {iterable}"));
}
