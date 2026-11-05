use std::collections::{BTreeMap, BTreeSet, HashSet};

use quote::ToTokens;
use syn::visit::Visit;
use syn::{Expr, ItemFn, Member, Stmt, Type};

use crate::model::Program;
use crate::{CompileError, compile_error};

use super::{emit_expression, expression_path_ends_with};
// The non-generic type aliases the loaded sources declare as `Result<T, FlightError>`. A name two
// sources declare differently is ambiguous and left out, so nothing proves it.
pub(crate) fn flight_error_result_aliases<'a>(
    programs: impl Iterator<Item = &'a Program>,
) -> BTreeSet<String> {
    let mut alias_definitions: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for alias in programs.flat_map(|program| &program.type_aliases) {
        alias_definitions
            .entry(alias.ident.to_string())
            .or_default()
            .insert(if alias.generics.params.is_empty() {
                alias.ty.to_token_stream().to_string()
            } else {
                String::new()
            });
    }
    return alias_definitions
        .into_iter()
        .filter(|(_, spellings)| {
            spellings.len() == 1
                && spellings.iter().all(|spelling| {
                    syn::parse_str::<Type>(spelling).is_ok_and(|definition| {
                        flight_error_result_type(&definition, &BTreeSet::new())
                    })
                })
        })
        .map(|(name, _)| name)
        .collect();
}

// Whether `rust_type` is `Result<T, FlightError>`, spelled out or through one proven alias (see
// `flight_error_result_aliases`): the D15 shape of a TypeScript promise that resolves `T` and rejects
// with the canonical `FlightError` error object.
pub(crate) fn flight_error_result_type(rust_type: &Type, d15_aliases: &BTreeSet<String>) -> bool {
    let Type::Path(path) = rust_type else {
        return false;
    };
    if path.qself.is_some() {
        return false;
    }
    if let Some(alias) = path.path.get_ident() {
        return d15_aliases.contains(&alias.to_string());
    }
    let Some(segment) = path.path.segments.last() else {
        return false;
    };
    let syn::PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return false;
    };
    let result = path.path.segments.len() == 1
        || path
            .path
            .segments
            .iter()
            .map(|segment| segment.ident.to_string())
            .collect::<Vec<_>>()
            .join("::")
            .ends_with("result::Result");
    return segment.ident == "Result"
        && result
        && arguments.args.len() == 2
        && matches!(&arguments.args[1], syn::GenericArgument::Type(Type::Path(error))
            if error.qself.is_none()
                && error.path.segments.last().is_some_and(|segment| {
                    segment.ident == "FlightError" && segment.arguments.is_empty()
                })
                && (error.path.segments.len() == 1
                    || error.path.segments.first().is_some_and(|first| first.ident == "flight_entity")));
}

// Proves every `Err` of a D15 async function (see `flight_error_result_type`) is one the function
// returns: a `return Err(..)` statement, or the tail of its body or of an `if`/`else` or plain
// block in tail position, reached without entering a closure, async block, loop or `match`. Only
// there does `throw` reject the promise exactly as Rust resolves `Err`; any other `Err` (a value, a
// pattern, a `match` arm) refuses, as does a `?` that would propagate through the function.
pub(super) fn flight_error_return_positions_are_proven(
    function: &ItemFn,
) -> Result<(), CompileError> {
    fn count_err(tokens: proc_macro2::TokenStream) -> usize {
        return tokens
            .into_iter()
            .map(|token| match token {
                proc_macro2::TokenTree::Ident(identifier) => usize::from(identifier == "Err"),
                proc_macro2::TokenTree::Group(group) => count_err(group.stream()),
                _ => 0,
            })
            .sum();
    }
    fn returned_err(expression: &Expr) -> bool {
        return matches!(expression, Expr::Call(call)
            if matches!(call.func.as_ref(), Expr::Path(path) if path.path.is_ident("Err"))
                && call.args.len() == 1
                && count_err(call.args.to_token_stream()) == 0);
    }
    fn tail(expression: &Expr) -> usize {
        return match expression {
            expression if returned_err(expression) => 1,
            Expr::If(branch) => {
                block(&branch.then_branch.stmts, true)
                    + branch
                        .else_branch
                        .as_ref()
                        .map_or(0, |(_, otherwise)| tail(otherwise))
            }
            Expr::Block(nested) if nested.label.is_none() => block(&nested.block.stmts, true),
            _ => 0,
        };
    }
    fn block(statements: &[Stmt], in_tail: bool) -> usize {
        let mut proven = 0;
        for (index, statement) in statements.iter().enumerate() {
            proven += match statement {
                Stmt::Expr(Expr::Return(returned), _) => returned
                    .expr
                    .as_deref()
                    .map_or(0, |value| usize::from(returned_err(value))),
                Stmt::Expr(expression, None) if in_tail && index + 1 == statements.len() => {
                    tail(expression)
                }
                Stmt::Expr(Expr::If(branch), _) => {
                    let mut proven = block(&branch.then_branch.stmts, false);
                    let mut otherwise = branch
                        .else_branch
                        .as_ref()
                        .map(|(_, otherwise)| otherwise.as_ref());
                    while let Some(next) = otherwise {
                        match next {
                            Expr::If(next) => {
                                proven += block(&next.then_branch.stmts, false);
                                otherwise = next
                                    .else_branch
                                    .as_ref()
                                    .map(|(_, otherwise)| otherwise.as_ref());
                            }
                            Expr::Block(next) => {
                                proven += block(&next.block.stmts, false);
                                otherwise = None;
                            }
                            _ => otherwise = None,
                        }
                    }
                    proven
                }
                Stmt::Expr(Expr::Block(nested), _) if nested.label.is_none() => {
                    block(&nested.block.stmts, false)
                }
                _ => 0,
            };
        }
        return proven;
    }
    struct Tries {
        found: bool,
    }
    impl<'ast> Visit<'ast> for Tries {
        fn visit_expr_try(&mut self, _: &'ast syn::ExprTry) {
            self.found = true;
        }
    }
    let name = &function.sig.ident;
    let mut tries = Tries { found: false };
    tries.visit_block(&function.block);
    if tries.found {
        return Err(compile_error(format!(
            "D15 async `{name}` uses `?` on a `Result`, whose `Err` would not reject the promise through a proven return"
        )));
    }
    if count_err(function.block.to_token_stream()) != block(&function.block.stmts, true) {
        return Err(compile_error(format!(
            "D15 async `{name}` uses `Err` outside a proven `return Err(..)` or tail, where it is a value TypeScript cannot reject with"
        )));
    }
    return Ok(());
}

// The canonical TypeScript error object of a `FlightError` value: a `FlightError { kind, message }`
// literal whose kind is a literal `Error`, `RangeError`, `TypeError` or `SyntaxError` constructs
// compares. A DOMException kind lowers without its name, and a computed kind has no static class, so
// both refuse. Any other `FlightError` expression already holds such an object.
pub(super) fn flight_error_value(
    literal: &syn::ExprStruct,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let mut kind = None;
    let mut message = None;
    for field in &literal.fields {
        match &field.member {
            Member::Named(name) if name == "kind" => kind = Some(&field.expr),
            Member::Named(name) if name == "message" => message = Some(&field.expr),
            _ => {}
        }
    }
    let (Some(kind), Some(message), None, 2) = (kind, message, &literal.rest, literal.fields.len())
    else {
        return Err(compile_error(
            "portable `FlightError` needs exactly a literal `kind` and a `message`",
        ));
    };
    let variant_path = |path: &syn::ExprPath| {
        let segments = path.path.segments.iter().collect::<Vec<_>>();
        return path.qself.is_none()
            && segments.len() >= 2
            && segments[segments.len() - 2].ident == "FlightErrorKind";
    };
    let constructor = match kind {
        Expr::Path(path) if variant_path(path) => match path
            .path
            .segments
            .last()
            .map(|segment| segment.ident.to_string())
            .as_deref()
        {
            Some(constructor @ ("Error" | "RangeError" | "TypeError" | "SyntaxError")) => {
                constructor.to_string()
            }
            Some(kind) => {
                return Err(compile_error(format!(
                    "portable `FlightError` kind `{kind}` is unrepresentable: a DOMException lowers without its name"
                )));
            }
            None => unreachable!("a path has a last segment"),
        },
        _ => {
            return Err(compile_error(
                "portable `FlightError` kind must be a literal `FlightErrorKind` variant",
            ));
        }
    };
    return Ok(format!(
        "new {constructor}({})",
        emit_expression(message, entities)?
    ));
}

pub(super) fn throw_call(call: &syn::ExprCall) -> Option<(&'static str, &Expr)> {
    if call.args.len() != 1 {
        return None;
    }
    let constructor = if expression_path_ends_with(&call.func, "throw_range_error") {
        "RangeError"
    } else if expression_path_ends_with(&call.func, "throw_error") {
        "Error"
    } else if expression_path_ends_with(&call.func, "throw_type_error") {
        "TypeError"
    } else if expression_path_ends_with(&call.func, "throw_syntax_error") {
        "SyntaxError"
    } else {
        return None;
    };
    return Some((constructor, &call.args[0]));
}

pub(super) fn flight_error_throw(expr: &Expr) -> Option<(&'static str, &Expr)> {
    let Expr::Struct(s) = expr else {
        return None;
    };
    let last_segment = s.path.segments.last()?;
    if last_segment.ident != "FlightError" {
        return None;
    }
    let mut kind_str: Option<&'static str> = None;
    let mut message_expr: Option<&Expr> = None;
    for field in &s.fields {
        let Member::Named(name) = &field.member else {
            continue;
        };
        if name == "kind" {
            if let Expr::Path(path) = &field.expr {
                let variant = path.path.segments.last().map(|s| s.ident.to_string());
                kind_str = match variant.as_deref() {
                    Some("Error") => Some("Error"),
                    Some("RangeError") => Some("RangeError"),
                    Some("TypeError") => Some("TypeError"),
                    Some("SyntaxError") => Some("SyntaxError"),
                    Some("NotReadableError") => Some("DOMException"),
                    Some("NotSupportedError") => Some("DOMException"),
                    _ => None,
                };
            }
        } else if name == "message" {
            message_expr = Some(&field.expr);
        }
    }
    return Some((kind_str?, message_expr?));
}
