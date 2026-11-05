use std::collections::HashSet;

use syn::{Expr, Lit, UnOp};

use super::{
    BindingFact, PROVENANCE_SEPARATOR, RETURN_BINDING_FACT_MARKER, SEQUENCE_FIELD_MARKER,
    SEQUENCE_RETURN_MARKER, binding_fact_from_marker, call_fact, expression_external_struct,
    expression_is_known_string, expression_struct_name, lexical_fact,
};
pub(super) fn expression_is_sequence(expression: &Expr, entities: &HashSet<String>) -> bool {
    if expression_is_vec_construction(expression) {
        return true;
    }
    return match expression {
        Expr::Array(_) | Expr::Repeat(_) => true,
        Expr::Call(call) => match call.func.as_ref() {
            Expr::Path(path) if path.qself.is_none() => {
                call_fact(entities, SEQUENCE_RETURN_MARKER, &path.path).is_some()
                    || call_fact(entities, RETURN_BINDING_FACT_MARKER, &path.path)
                        .as_ref()
                        .is_some_and(|fact| {
                            matches!(
                                binding_fact_from_marker(fact),
                                BindingFact::Sequence(_) | BindingFact::TypedArray(_)
                            )
                        })
            }
            _ => false,
        },
        // Only the range forms whose `.slice` emission is valid: a prefix `..end` and inclusive ranges
        // are left unknown until range slices are lowered with Rust bounds.
        Expr::Index(index)
            if matches!(
                index.index.as_ref(),
                Expr::Range(range) if matches!(range.limits, syn::RangeLimits::HalfOpen(_))
                    && (range.start.is_some() || range.end.is_none())
            ) =>
        {
            expression_is_sequence(&index.expr, entities)
        }
        Expr::Field(field) => {
            let syn::Member::Named(field_name) = &field.member else {
                return false;
            };
            // A local struct's field, or a dependency struct's under its external identity
            // (`crate::Struct`); a dependency entity has both, so either may carry the fact.
            [
                expression_struct_name(&field.base, entities),
                expression_external_struct(&field.base, entities),
            ]
            .into_iter()
            .flatten()
            .any(|identity| {
                entities.contains(&format!(
                    "{SEQUENCE_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                ))
            })
        }
        Expr::Group(group) => expression_is_sequence(&group.expr, entities),
        Expr::Lit(literal) => matches!(&literal.lit, Lit::ByteStr(_)),
        Expr::If(if_expr) => {
            let then_is_seq = if_expr
                .then_branch
                .stmts
                .last()
                .is_some_and(|stmt| match stmt {
                    syn::Stmt::Expr(expr, None) => expression_is_sequence(expr, entities),
                    _ => false,
                });
            let else_is_seq = if_expr
                .else_branch
                .as_ref()
                .is_some_and(|(_, expr)| expression_is_sequence(expr, entities));
            then_is_seq || else_is_seq
        }
        Expr::Match(match_expr) => match_expr.arms.iter().any(|arm| match arm.body.as_ref() {
            Expr::Block(block) => block.block.stmts.last().is_some_and(|stmt| match stmt {
                syn::Stmt::Expr(expr, None) => expression_is_sequence(expr, entities),
                _ => false,
            }),
            expr => expression_is_sequence(expr, entities),
        }),
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "clone" | "to_vec" | "unwrap" | "expect" | "unwrap_or_default"
                ) =>
        {
            expression_is_sequence(&call.receiver, entities)
        }
        Expr::MethodCall(call)
            if call.args.len() == 1
                && matches!(
                    call.method.to_string().as_str(),
                    "unwrap_or" | "unwrap_or_else"
                ) =>
        {
            expression_is_sequence(&call.receiver, entities)
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "as_bytes" | "to_le_bytes" | "to_be_bytes" | "to_ne_bytes"
                ) =>
        {
            true
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && call.method == "encode_utf16"
                && expression_is_known_string(&call.receiver, entities) =>
        {
            true
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(call.method.to_string().as_str(), "bytes" | "chars")
                && expression_is_known_string(&call.receiver, entities) =>
        {
            true
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "lines" | "split_ascii_whitespace" | "split_whitespace"
                )
                && expression_is_known_string(&call.receiver, entities) =>
        {
            true
        }
        Expr::MethodCall(call)
            if call.args.len() == 1
                && matches!(
                    call.method.to_string().as_str(),
                    "split" | "split_terminator" | "splitn" | "rsplitn"
                )
                && expression_is_known_string(&call.receiver, entities) =>
        {
            true
        }
        Expr::MethodCall(call)
            if (call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "collect"
                        | "iter"
                        | "into_iter"
                        | "flatten"
                        | "rev"
                        | "enumerate"
                        | "peekable"
                        | "sorted"
                        | "dedup"
                        | "cloned"
                        | "copied"
                        | "keys"
                        | "values"
                ))
                || (call.args.len() == 1
                    && matches!(
                        call.method.to_string().as_str(),
                        "chunks"
                            | "chunks_exact"
                            | "chunks_exact_mut"
                            | "chunks_mut"
                            | "filter"
                            | "map"
                            | "flat_map"
                            | "filter_map"
                            | "skip"
                            | "step_by"
                            | "take"
                            | "skip_while"
                            | "take_while"
                            | "chain"
                            | "windows"
                    )) =>
        {
            expression_is_sequence(&call.receiver, entities)
        }
        Expr::Paren(paren) => expression_is_sequence(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            matches!(
                lexical_fact(entities, &path.path.segments[0].ident.to_string()),
                Some(BindingFact::Sequence(_) | BindingFact::TypedArray(_))
            )
        }
        Expr::Reference(reference) => expression_is_sequence(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_is_sequence(&unary.expr, entities)
        }
        _ => false,
    };
}

pub(super) fn expression_is_iterator_chain(expression: &Expr) -> bool {
    return match expression {
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "collect" | "iter" | "into_iter" | "cloned" | "copied"
                ) =>
        {
            true
        }
        Expr::MethodCall(call)
            if call.args.len() == 1
                && matches!(
                    call.method.to_string().as_str(),
                    "chunks"
                        | "chunks_exact"
                        | "chunks_exact_mut"
                        | "chunks_mut"
                        | "filter"
                        | "map"
                        | "skip"
                        | "step_by"
                        | "take"
                        | "flat_map"
                        | "filter_map"
                        | "windows"
                ) =>
        {
            true
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "flatten" | "rev" | "enumerate" | "peekable"
                ) =>
        {
            true
        }
        _ => false,
    };
}

pub(super) fn expression_is_vec_construction(expression: &Expr) -> bool {
    return matches!(
        expression,
        Expr::Macro(invocation) if invocation.mac.path.is_ident("vec") && !invocation.mac.tokens.is_empty()
    );
}
