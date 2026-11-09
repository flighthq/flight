use std::collections::{HashMap, HashSet};
use std::fmt::Write;
use std::panic::AssertUnwindSafe;

use quote::ToTokens;
use syn::visit::Visit;
use syn::{Block, Expr, Ident, Pat, Path, ReturnType, Stmt, Type};

use crate::{CompileError, compile_error};

use super::{
    BINDING_SITE_MARKER, D15_FUTURE_CLOSURE_MARKER, D15_FUTURE_RETURN_MARKER,
    FINISH_ENTITY_RETURN_MARKER, FLIGHT_ERROR_RETURNS_MARKER, RENAME_MARKER, RETURN_TYPE_MARKER,
    RETURNS_CONTRACT_TYPED_ARRAY_MARKER, RETURNS_NULLABLE_MARKER, RETURNS_TYPED_ARRAY_MARKER,
    RETURNS_U32_MARKER, SCOPE_DECLARED_MARKER, STRING_EXPRESSION_MARKER, TRY_COUNTER_MARKER,
    VITEST_FUNCTION_CANDIDATE_MARKER, VITEST_PUBLIC_FUNCTION_MARKER, VITEST_STRUCT_LOCAL_MARKER,
    allocation_initialized_context, binding_site_key, block_contains_function_exits,
    clear_provenance_binding, closure_parameter_identifier, collect_unconditional_try_expressions,
    concise_arrow_body, d15_future_provider, emit_d15_future_provider, emit_expression,
    emit_local_with_shadow, emit_pattern, emit_return_match_with_exits, emit_statement,
    emit_try_pre_extractions, emit_type, expression_contains_identifier,
    expression_contains_unconditional_try, insert_provenance_binding,
    insert_vitest_rebound_struct_context, lexical_pattern_context, local_pattern_name,
    next_try_rename, peel_reference_and_paren, provenance_pattern_bindings, rust_type_is_string,
    snake_to_lower_camel, statement_contains_identifier, strip_value_position_parens,
    tuple_pattern_bindings, type_is_named, unique_marker_suffix,
    update_vitest_local_function_context, update_vitest_struct_local_context, vitest_named_type,
    vitest_struct_owner, write_indent,
};
pub(super) fn emit_block(
    out: &mut String,
    statements: &[Stmt],
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    emit_block_with_context(out, statements, entities, indent)?;
    return Ok(());
}

// A production `catch_unwind` has a direct TypeScript equivalent only while its `Result` remains
// an implementation detail. Recognize the transaction Rust spells as an immediately consumed
// `let result = catch_unwind(..); if let Err(error) = result { ..; resume_unwind(error); }` and
// preserve the caught closure as an IIFE so a `return` inside it cannot escape the outer function.
pub(super) fn caught_panic_transaction<'a>(
    statement: &'a Stmt,
    handler: &'a Stmt,
    remaining: &[Stmt],
) -> Option<(&'a syn::ExprClosure, &'a Pat, &'a syn::Block)> {
    let Stmt::Local(local) = statement else {
        return None;
    };
    let Pat::Ident(result_pattern) = &local.pat else {
        return None;
    };
    if result_pattern.by_ref.is_some()
        || result_pattern.mutability.is_some()
        || result_pattern.subpat.is_some()
    {
        return None;
    }
    let initializer = local.init.as_ref()?;
    if initializer.diverge.is_some() {
        return None;
    }
    let closure = production_caught_panic_closure(&initializer.expr)?;
    let Stmt::Expr(Expr::If(handler), _) = handler else {
        return None;
    };
    if handler.else_branch.is_some() {
        return None;
    }
    let Expr::Let(binding) = handler.cond.as_ref() else {
        return None;
    };
    let Pat::TupleStruct(error_variant) = binding.pat.as_ref() else {
        return None;
    };
    if !error_variant.path.is_ident("Err") || error_variant.elems.len() != 1 {
        return None;
    }
    let error_pattern = &error_variant.elems[0];
    let Pat::Ident(error) = error_pattern else {
        return None;
    };
    if error.by_ref.is_some() || error.mutability.is_some() || error.subpat.is_some() {
        return None;
    }
    let Expr::Path(result) = binding.expr.as_ref() else {
        return None;
    };
    if !result.path.is_ident(&result_pattern.ident) {
        return None;
    }
    if remaining.iter().any(|statement| {
        statement_contains_identifier(statement, &result_pattern.ident.to_string())
    }) {
        return None;
    }
    let Stmt::Expr(Expr::Call(resume), _) = handler.then_branch.stmts.last()? else {
        return None;
    };
    if !production_std_panic_path(&resume.func, "resume_unwind") || resume.args.len() != 1 {
        return None;
    }
    let Expr::Path(resumed) = &resume.args[0] else {
        return None;
    };
    if !resumed.path.is_ident(&error.ident) {
        return None;
    }
    return Some((closure, error_pattern, &handler.then_branch));
}

pub(super) struct CaughtPanicFinally<'a> {
    pub closure: &'a syn::ExprClosure,
    pub cleanup_range: std::ops::Range<usize>,
    pub returning: bool,
}

// Recognizes the generalized catch_unwind transaction with cleanup between the catch and the
// terminator: `let result = catch_unwind(..); ..cleanup..; return match result { Ok(v) => v,
// Err(p) => resume_unwind(p) }` or `..cleanup..; if let Err(p) = result { resume_unwind(p) }`.
// The cleanup statements must not reference `result`.
pub(super) fn caught_panic_finally_transaction<'a>(
    statement: &'a Stmt,
    remaining: &'a [Stmt],
) -> Option<CaughtPanicFinally<'a>> {
    let Stmt::Local(local) = statement else {
        return None;
    };
    let Pat::Ident(result_pattern) = &local.pat else {
        return None;
    };
    if result_pattern.by_ref.is_some()
        || result_pattern.mutability.is_some()
        || result_pattern.subpat.is_some()
    {
        return None;
    }
    let initializer = local.init.as_ref()?;
    if initializer.diverge.is_some() {
        return None;
    }
    let closure = production_caught_panic_closure(&initializer.expr)?;
    let result_name = result_pattern.ident.to_string();
    let terminator_index = remaining.iter().position(|stmt| {
        is_resume_unwind_if_let_err(stmt, &result_name)
            || is_resume_unwind_return_match(stmt, &result_name)
    })?;
    for stmt in &remaining[..terminator_index] {
        if statement_contains_identifier(stmt, &result_name) {
            return None;
        }
    }
    for stmt in remaining.get(terminator_index + 1..).unwrap_or_default() {
        if statement_contains_identifier(stmt, &result_name) {
            return None;
        }
    }
    let returning = is_resume_unwind_return_match(&remaining[terminator_index], &result_name);
    return Some(CaughtPanicFinally {
        closure,
        cleanup_range: 0..terminator_index,
        returning,
    });
}

pub(super) struct CaughtPanicResultReference<'a> {
    pub closure: &'a syn::ExprClosure,
    pub result: String,
    pub body: Vec<Stmt>,
    pub returning: bool,
    pub consumed: usize,
}

// Recognizes a catch_unwind whose following statements inspect the caught `Result` only through
// `result.is_err()` / `result.is_ok()`, resume it with `if let Err(p) = result { ..; resume_unwind(p) }`
// (at any depth), or return it last as `return match result { Ok(v) => v, Err(p) => resume_unwind(p) }`.
// The statements are rewritten over two locals the emitted try/catch assigns: `{result}_panicked` for
// the inspections and `{result}_payload` for the resumed panic. Any other use of `result` rejects.
pub(super) fn caught_panic_result_reference_transaction<'a>(
    statement: &'a Stmt,
    remaining: &'a [Stmt],
) -> Option<CaughtPanicResultReference<'a>> {
    let Stmt::Local(local) = statement else {
        return None;
    };
    let Pat::Ident(result_pattern) = &local.pat else {
        return None;
    };
    if result_pattern.by_ref.is_some()
        || result_pattern.mutability.is_some()
        || result_pattern.subpat.is_some()
    {
        return None;
    }
    let initializer = local.init.as_ref()?;
    if initializer.diverge.is_some() {
        return None;
    }
    let closure = production_caught_panic_closure(&initializer.expr)?;
    let result = result_pattern.ident.to_string();
    let panicked = format!("{result}_panicked");
    let payload = format!("{result}_payload");
    let value = format!("{result}_value");
    if remaining.iter().any(|statement| {
        [&panicked, &payload, &value]
            .iter()
            .any(|name| statement_contains_identifier(statement, name))
    }) || expression_contains_identifier(&Expr::Closure(closure.clone()), &panicked)
    {
        return None;
    }
    let returning = remaining
        .last()
        .is_some_and(|last| is_resume_unwind_return_match(last, &result));
    let body = if returning {
        &remaining[..remaining.len() - 1]
    } else {
        remaining
    };
    if !body
        .iter()
        .any(|statement| statement_contains_identifier(statement, &result))
    {
        return None;
    }
    let mut rewriter = CaughtResultRewriter {
        result: &result,
        panicked: quote::format_ident!("{panicked}"),
        payload: quote::format_ident!("{payload}"),
        rejected: false,
    };
    let mut rewritten = body.to_vec();
    for statement in &mut rewritten {
        syn::visit_mut::VisitMut::visit_stmt_mut(&mut rewriter, statement);
    }
    if rewriter.rejected
        || rewritten
            .iter()
            .any(|statement| statement_contains_identifier(statement, &result))
    {
        return None;
    }
    return Some(CaughtPanicResultReference {
        closure,
        result,
        body: rewritten,
        returning,
        consumed: remaining.len(),
    });
}

struct CaughtResultRewriter<'a> {
    result: &'a str,
    panicked: syn::Ident,
    payload: syn::Ident,
    rejected: bool,
}

impl syn::visit_mut::VisitMut for CaughtResultRewriter<'_> {
    fn visit_expr_mut(&mut self, expression: &mut Expr) {
        if let Expr::MethodCall(call) = expression
            && call.args.is_empty()
            && matches!(call.receiver.as_ref(), Expr::Path(path) if path.path.is_ident(self.result))
        {
            let panicked = &self.panicked;
            match call.method.to_string().as_str() {
                "is_err" => *expression = syn::parse_quote!(#panicked),
                "is_ok" => *expression = syn::parse_quote!(!#panicked),
                _ => self.rejected = true,
            }
            return;
        }
        if let Expr::If(handler) = expression
            && is_resume_unwind_if_let_err(
                &Stmt::Expr(Expr::If(handler.clone()), None),
                self.result,
            )
        {
            let Expr::Let(binding) = handler.cond.as_ref() else {
                unreachable!("a resume terminator binds `Err(..)`");
            };
            let Pat::TupleStruct(error_variant) = binding.pat.as_ref() else {
                unreachable!("a resume terminator binds `Err(..)`");
            };
            let Pat::Ident(error) = &error_variant.elems[0] else {
                unreachable!("a resume terminator binds an identifier");
            };
            let error = error.ident.to_string();
            let leading = handler.then_branch.stmts.len() - 1;
            // The payload may only be resumed: any other read would need the panic value itself.
            if handler.then_branch.stmts[..leading]
                .iter()
                .any(|statement| statement_contains_identifier(statement, &error))
            {
                self.rejected = true;
                return;
            }
            let panicked = &self.panicked;
            let payload = &self.payload;
            handler.cond = Box::new(syn::parse_quote!(#panicked));
            handler.then_branch.stmts[leading] =
                syn::parse_quote!(std::panic::resume_unwind(#payload););
            for statement in &mut handler.then_branch.stmts[..leading] {
                self.visit_stmt_mut(statement);
            }
            return;
        }
        syn::visit_mut::visit_expr_mut(self, expression);
    }
}

fn is_resume_unwind_if_let_err(statement: &Stmt, result_name: &str) -> bool {
    let Stmt::Expr(Expr::If(handler), _) = statement else {
        return false;
    };
    if handler.else_branch.is_some() {
        return false;
    }
    let Expr::Let(binding) = handler.cond.as_ref() else {
        return false;
    };
    let Pat::TupleStruct(error_variant) = binding.pat.as_ref() else {
        return false;
    };
    if !error_variant.path.is_ident("Err") || error_variant.elems.len() != 1 {
        return false;
    }
    let Pat::Ident(error) = &error_variant.elems[0] else {
        return false;
    };
    if error.by_ref.is_some() || error.mutability.is_some() || error.subpat.is_some() {
        return false;
    }
    let Expr::Path(result) = binding.expr.as_ref() else {
        return false;
    };
    if !result.path.is_ident(result_name) {
        return false;
    }
    let Some(Stmt::Expr(Expr::Call(resume), _)) = handler.then_branch.stmts.last() else {
        return false;
    };
    if !production_std_panic_path(&resume.func, "resume_unwind") || resume.args.len() != 1 {
        return false;
    }
    let Expr::Path(resumed) = &resume.args[0] else {
        return false;
    };
    return resumed.path.is_ident(&error.ident);
}

fn is_resume_unwind_return_match(statement: &Stmt, result_name: &str) -> bool {
    let Stmt::Expr(Expr::Return(returned), _) = statement else {
        return false;
    };
    let Some(Expr::Match(matched)) = returned.expr.as_deref() else {
        return false;
    };
    let Expr::Path(scrutinee) = matched.expr.as_ref() else {
        return false;
    };
    if !scrutinee.path.is_ident(result_name) || matched.arms.len() != 2 {
        return false;
    }
    let ok_arm = &matched.arms[0];
    let err_arm = &matched.arms[1];
    let Pat::TupleStruct(ok_variant) = &ok_arm.pat else {
        return false;
    };
    if !ok_variant.path.is_ident("Ok") || ok_variant.elems.len() != 1 {
        return false;
    }
    let Pat::Ident(ok_binding) = &ok_variant.elems[0] else {
        return false;
    };
    let Expr::Path(ok_body) = ok_arm.body.as_ref() else {
        return false;
    };
    if !ok_body.path.is_ident(&ok_binding.ident) {
        return false;
    }
    let Pat::TupleStruct(err_variant) = &err_arm.pat else {
        return false;
    };
    if !err_variant.path.is_ident("Err") || err_variant.elems.len() != 1 {
        return false;
    }
    let Pat::Ident(err_binding) = &err_variant.elems[0] else {
        return false;
    };
    let Expr::Call(resume) = err_arm.body.as_ref() else {
        return false;
    };
    if !production_std_panic_path(&resume.func, "resume_unwind") || resume.args.len() != 1 {
        return false;
    }
    let Expr::Path(resumed) = &resume.args[0] else {
        return false;
    };
    return resumed.path.is_ident(&err_binding.ident);
}

pub(super) fn ignored_caught_panic(local: &syn::Local) -> Option<&syn::ExprClosure> {
    if !matches!(local.pat, Pat::Wild(_)) {
        return None;
    }
    let initializer = local.init.as_ref()?;
    if initializer.diverge.is_some() {
        return None;
    }
    return production_caught_panic_closure(&initializer.expr);
}

pub(super) fn production_caught_panic_closure(expression: &Expr) -> Option<&syn::ExprClosure> {
    let Expr::Call(caught) = expression else {
        return None;
    };
    if !production_std_panic_path(&caught.func, "catch_unwind") || caught.args.len() != 1 {
        return None;
    }
    let mut argument = &caught.args[0];
    if let Expr::Call(wrapper) = argument
        && production_std_panic_path(&wrapper.func, "AssertUnwindSafe")
        && wrapper.args.len() == 1
    {
        argument = &wrapper.args[0];
    }
    let Expr::Closure(closure) = argument else {
        return None;
    };
    return (closure.inputs.is_empty() && closure.asyncness.is_none()).then_some(closure);
}

pub(super) fn production_std_panic_path(expression: &Expr, name: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    let segments = path
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    return path.qself.is_none()
        && (segments == [name]
            || segments == ["std", "panic", name]
            || segments == ["panic", name]);
}

pub(super) struct CaughtPanicMatch<'a> {
    pub closure: &'a syn::ExprClosure,
    pub ok_binding: &'a Pat,
    pub ok_body: &'a Expr,
    pub err_binding: &'a Pat,
    pub err_body: &'a Expr,
    pub returning: bool,
}

pub(super) fn caught_panic_match_statement(statement: &Stmt) -> Option<CaughtPanicMatch<'_>> {
    let matched = match statement {
        Stmt::Expr(Expr::Match(matched), _) => (matched, false),
        Stmt::Expr(Expr::Return(returned), _) => {
            let Some(Expr::Match(matched)) = returned.expr.as_deref() else {
                return None;
            };
            (matched, true)
        }
        _ => return None,
    };
    let (matched, returning) = matched;
    let closure = production_caught_panic_closure(matched.expr.as_ref())?;
    if matched.arms.len() != 2 {
        return None;
    }
    let ok_arm = &matched.arms[0];
    let err_arm = &matched.arms[1];
    let Pat::TupleStruct(ok_variant) = &ok_arm.pat else {
        return None;
    };
    if !ok_variant.path.is_ident("Ok") || ok_variant.elems.len() != 1 {
        return None;
    }
    if ok_arm.guard.is_some() {
        return None;
    }
    let Pat::TupleStruct(err_variant) = &err_arm.pat else {
        return None;
    };
    if !err_variant.path.is_ident("Err") || err_variant.elems.len() != 1 {
        return None;
    }
    if err_arm.guard.is_some() {
        return None;
    }
    return Some(CaughtPanicMatch {
        closure,
        ok_binding: &ok_variant.elems[0],
        ok_body: ok_arm.body.as_ref(),
        err_binding: &err_variant.elems[0],
        err_body: err_arm.body.as_ref(),
        returning,
    });
}

pub(super) struct CaughtPanicUnwrapOr<'a> {
    pub closure: &'a syn::ExprClosure,
    pub fallback: &'a Expr,
}

fn unwrap_catch_unwind_method_chain(expression: &Expr) -> Option<CaughtPanicUnwrapOr<'_>> {
    let Expr::MethodCall(method) = expression else {
        return None;
    };
    if method.method != "unwrap_or" || method.args.len() != 1 {
        return None;
    }
    let closure = production_caught_panic_closure(&method.receiver)?;
    return Some(CaughtPanicUnwrapOr {
        closure,
        fallback: &method.args[0],
    });
}

pub(super) fn caught_panic_unwrap_or_return(statement: &Stmt) -> Option<CaughtPanicUnwrapOr<'_>> {
    let Stmt::Expr(Expr::Return(returned), _) = statement else {
        return None;
    };
    let Some(expression) = returned.expr.as_deref() else {
        return None;
    };
    return unwrap_catch_unwind_method_chain(expression);
}

pub(super) fn caught_panic_unwrap_or_if_condition<'a>(
    statement: &'a Stmt,
) -> Option<(&'a syn::ExprClosure, &'a Expr, &'a syn::ExprIf)> {
    let Stmt::Expr(Expr::If(if_expr), _) = statement else {
        return None;
    };
    let unwrapped = unwrap_catch_unwind_method_chain(if_expr.cond.as_ref())?;
    return Some((unwrapped.closure, unwrapped.fallback, if_expr));
}

pub(super) fn emit_caught_panic_call(
    out: &mut String,
    closure: &syn::ExprClosure,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    write_indent(out, indent);
    writeln!(out, "({})();", emit_closure(closure, entities)?)
        .expect("writing to a String cannot fail");
    return Ok(());
}

pub(super) fn emit_ignored_caught_panic(
    out: &mut String,
    closure: &syn::ExprClosure,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    write_indent(out, indent);
    out.push_str("try {\n");
    emit_caught_panic_call(out, closure, entities, indent + 1)?;
    write_indent(out, indent);
    out.push_str("} catch {}\n");
    return Ok(());
}

pub(super) fn emit_caught_panic_transaction(
    out: &mut String,
    closure: &syn::ExprClosure,
    error_pattern: &Pat,
    handler: &syn::Block,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let error = emit_pattern(error_pattern)?;
    write_indent(out, indent);
    out.push_str("try {\n");
    emit_caught_panic_call(out, closure, entities, indent + 1)?;
    write_indent(out, indent);
    writeln!(out, "}} catch ({error}) {{").expect("writing to a String cannot fail");
    let catch_context = lexical_pattern_context(entities, error_pattern);
    emit_block(
        out,
        &handler.stmts[..handler.stmts.len() - 1],
        &catch_context,
        indent + 1,
    )?;
    write_indent(out, indent + 1);
    writeln!(out, "throw {error};").expect("writing to a String cannot fail");
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

pub(super) fn emit_caught_panic_finally_transaction(
    out: &mut String,
    closure: &syn::ExprClosure,
    cleanup: &[Stmt],
    returning: bool,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    write_indent(out, indent);
    out.push_str("try {\n");
    if returning {
        write_indent(out, indent + 1);
        writeln!(out, "return ({})();", emit_closure(closure, entities)?)
            .expect("writing to a String cannot fail");
    } else {
        emit_caught_panic_call(out, closure, entities, indent + 1)?;
    }
    write_indent(out, indent);
    out.push_str("} finally {\n");
    emit_block(out, cleanup, entities, indent + 1)?;
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

// `let result = catch_unwind(..)` lowered over the locals its rewritten statements read: the try
// records whether the closure threw and what, and a returning transaction keeps the closure's value
// for the final `return` once the recorded panic has been rethrown.
pub(super) fn emit_caught_panic_result_reference(
    out: &mut String,
    transaction: &CaughtPanicResultReference<'_>,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let panicked = snake_to_lower_camel(&format!("{}_panicked", transaction.result));
    let payload = snake_to_lower_camel(&format!("{}_payload", transaction.result));
    let value = snake_to_lower_camel(&format!("{}_value", transaction.result));
    let closure = emit_closure(transaction.closure, entities)?;
    write_indent(out, indent);
    writeln!(out, "let {panicked} = false;").expect("writing to a String cannot fail");
    write_indent(out, indent);
    writeln!(out, "let {payload}: unknown = undefined;").expect("writing to a String cannot fail");
    if transaction.returning {
        let return_type = unique_marker_suffix(entities, RETURN_TYPE_MARKER)
            .filter(|return_type| return_type != "void")
            .ok_or_else(|| {
                compile_error(
                    "portable `catch_unwind` returned through `match` needs a known non-void return type",
                )
            })?;
        write_indent(out, indent);
        writeln!(out, "let {value}!: {return_type};").expect("writing to a String cannot fail");
    }
    write_indent(out, indent);
    out.push_str("try {\n");
    write_indent(out, indent + 1);
    if transaction.returning {
        writeln!(out, "{value} = ({closure})();").expect("writing to a String cannot fail");
    } else {
        writeln!(out, "({closure})();").expect("writing to a String cannot fail");
    }
    write_indent(out, indent);
    out.push_str("} catch (caught) {\n");
    write_indent(out, indent + 1);
    writeln!(out, "{panicked} = true;").expect("writing to a String cannot fail");
    write_indent(out, indent + 1);
    writeln!(out, "{payload} = caught;").expect("writing to a String cannot fail");
    write_indent(out, indent);
    out.push_str("}\n");
    emit_block(out, &transaction.body, entities, indent)?;
    if transaction.returning {
        write_indent(out, indent);
        writeln!(out, "if ({panicked}) {{").expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "throw {payload};").expect("writing to a String cannot fail");
        write_indent(out, indent);
        out.push_str("}\n");
        write_indent(out, indent);
        writeln!(out, "return {value};").expect("writing to a String cannot fail");
    }
    return Ok(());
}

pub(super) fn emit_caught_panic_match(
    out: &mut String,
    matched: &CaughtPanicMatch<'_>,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let ok_name = emit_pattern(matched.ok_binding)?;
    let err_name = emit_pattern(matched.err_binding)?;
    let ok_context = lexical_pattern_context(entities, matched.ok_binding);
    let err_context = lexical_pattern_context(entities, matched.err_binding);
    write_indent(out, indent);
    out.push_str("try {\n");
    write_indent(out, indent + 1);
    writeln!(
        out,
        "const {ok_name} = ({})();",
        emit_closure(matched.closure, entities)?
    )
    .expect("writing to a String cannot fail");
    emit_arm_body(
        out,
        matched.ok_body,
        matched.returning,
        &ok_context,
        indent + 1,
    )?;
    write_indent(out, indent);
    writeln!(out, "}} catch ({err_name}) {{").expect("writing to a String cannot fail");
    emit_arm_body(
        out,
        matched.err_body,
        matched.returning,
        &err_context,
        indent + 1,
    )?;
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

pub(super) fn emit_caught_panic_unwrap_or_return(
    out: &mut String,
    unwrapped: &CaughtPanicUnwrapOr<'_>,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let fallback = emit_expression(&unwrapped.fallback, entities)?;
    write_indent(out, indent);
    out.push_str("try {\n");
    write_indent(out, indent + 1);
    writeln!(
        out,
        "return ({})();",
        emit_closure(unwrapped.closure, entities)?
    )
    .expect("writing to a String cannot fail");
    write_indent(out, indent);
    out.push_str("} catch {\n");
    write_indent(out, indent + 1);
    writeln!(out, "return {fallback};").expect("writing to a String cannot fail");
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

pub(super) fn emit_caught_panic_unwrap_or_if(
    out: &mut String,
    closure: &syn::ExprClosure,
    fallback: &Expr,
    if_expr: &syn::ExprIf,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let fallback_str = emit_expression(fallback, entities)?;
    let temp = "__caught";
    write_indent(out, indent);
    writeln!(out, "let {temp} = {fallback_str};").expect("writing to a String cannot fail");
    write_indent(out, indent);
    out.push_str("try {\n");
    write_indent(out, indent + 1);
    writeln!(out, "{temp} = ({})();", emit_closure(closure, entities)?)
        .expect("writing to a String cannot fail");
    write_indent(out, indent);
    out.push_str("} catch {}\n");
    write_indent(out, indent);
    writeln!(out, "if ({temp}) {{").expect("writing to a String cannot fail");
    emit_block(out, &if_expr.then_branch.stmts, entities, indent + 1)?;
    if let Some((_, else_branch)) = &if_expr.else_branch {
        write_indent(out, indent);
        out.push_str("} else {\n");
        emit_statement(
            out,
            &Stmt::Expr(else_branch.as_ref().clone(), None),
            entities,
            indent + 1,
        )?;
    }
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

fn emit_arm_body(
    out: &mut String,
    body: &Expr,
    returning: bool,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    match body {
        Expr::Block(block) => {
            emit_block(out, &block.block.stmts, entities, indent)?;
        }
        _ => {
            if returning {
                write_indent(out, indent);
                writeln!(out, "return {};", emit_expression(body, entities)?)
                    .expect("writing to a String cannot fail");
            } else {
                emit_statement(out, &Stmt::Expr(body.clone(), None), entities, indent)?;
            }
        }
    }
    return Ok(());
}

pub(super) fn tail_expression_needs_return(expression: &Expr) -> bool {
    return !matches!(
        expression,
        Expr::Return(_)
            | Expr::If(_)
            | Expr::Match(_)
            | Expr::Loop(_)
            | Expr::While(_)
            | Expr::ForLoop(_)
            | Expr::Block(_)
            | Expr::Unsafe(_)
    );
}

// Emits a block whose tail value is returned, as a closure or function body. Only a tail that needs
// a `return` is rewritten (and so copied); see `emit_block_with_tail`. The copy's binding sites are
// given the ids the resolver found for the parsed ones (`copy_binding_sites`), so a `let` nested in
// the returned tail keeps everything proven for it.
pub(crate) fn emit_block_with_tail_returns(
    out: &mut String,
    statements: &[Stmt],
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let Some(last) = statements.last() else {
        return Ok(());
    };
    let Some(rewritten) = inject_tail_returns(std::slice::from_ref(last)).pop() else {
        return emit_block(out, statements, entities, indent);
    };
    if rewritten.to_token_stream().to_string() == last.to_token_stream().to_string() {
        return emit_block(out, statements, entities, indent);
    }
    let mut context = entities.clone();
    copy_binding_sites(&mut context, last, &rewritten);
    emit_block_with_tail(out, statements, Some(&rewritten), &context, indent)?;
    return Ok(());
}

pub(super) fn copy_binding_sites(context: &mut HashSet<String>, parsed: &Stmt, copy: &Stmt) {
    struct Identifiers<'ast>(Vec<&'ast syn::Ident>);
    impl<'ast> Visit<'ast> for Identifiers<'ast> {
        fn visit_ident(&mut self, identifier: &'ast syn::Ident) {
            self.0.push(identifier);
        }
    }

    let mut parsed_identifiers = Identifiers(Vec::new());
    parsed_identifiers.visit_stmt(parsed);
    let mut copied_identifiers = Identifiers(Vec::new());
    copied_identifiers.visit_stmt(copy);
    if parsed_identifiers.0 != copied_identifiers.0 {
        return;
    }
    for (parsed, copied) in parsed_identifiers.0.iter().zip(&copied_identifiers.0) {
        if let Some(id) = unique_marker_suffix(
            context,
            &format!("{BINDING_SITE_MARKER}{}=", binding_site_key(parsed)),
        ) {
            context.insert(format!(
                "{BINDING_SITE_MARKER}{}={id}",
                binding_site_key(copied)
            ));
        }
    }
}

// Records, for each identifier of `copy` (a rewrite of `parsed` that only wraps expressions in
// `return`, so both hold the same identifiers in the same order), the binding id resolved for the
// matching identifier of `parsed`. Binding ids are keyed by an identifier's address
// (`binding_site_key`), which a copy does not keep.
// `copy_binding_sites` for a statement `copy` rewritten from the expression `parsed`.
pub(super) fn copy_expression_binding_sites(
    context: &mut HashSet<String>,
    parsed: &Expr,
    copy: &Stmt,
) {
    struct Identifiers<'ast>(Vec<&'ast syn::Ident>);
    impl<'ast> Visit<'ast> for Identifiers<'ast> {
        fn visit_ident(&mut self, identifier: &'ast syn::Ident) {
            self.0.push(identifier);
        }
    }

    let mut parsed_identifiers = Identifiers(Vec::new());
    parsed_identifiers.visit_expr(parsed);
    let mut copied_identifiers = Identifiers(Vec::new());
    copied_identifiers.visit_stmt(copy);
    if parsed_identifiers.0 != copied_identifiers.0 {
        return;
    }
    for (parsed, copied) in parsed_identifiers.0.iter().zip(&copied_identifiers.0) {
        if let Some(id) = unique_marker_suffix(
            context,
            &format!("{BINDING_SITE_MARKER}{}=", binding_site_key(parsed)),
        ) {
            context.insert(format!(
                "{BINDING_SITE_MARKER}{}={id}",
                binding_site_key(copied)
            ));
        }
    }
}

pub(super) fn inject_tail_returns(statements: &[Stmt]) -> Vec<Stmt> {
    let mut owned = statements.to_vec();
    let Some(last) = owned.last_mut() else {
        return owned;
    };
    match last {
        Stmt::Expr(Expr::Return(_), _) => {}
        Stmt::Expr(Expr::If(if_expr), semi) if semi.is_none() => {
            inject_returns_into_if(if_expr);
        }
        Stmt::Expr(Expr::Block(block), semi) if semi.is_none() => {
            let transformed = inject_tail_returns(&block.block.stmts);
            block.block.stmts = transformed;
        }
        Stmt::Expr(Expr::Unsafe(unsafe_block), semi) if semi.is_none() => {
            let transformed = inject_tail_returns(&unsafe_block.block.stmts);
            unsafe_block.block.stmts = transformed;
        }
        Stmt::Expr(Expr::Match(match_expr), semi) if semi.is_none() => {
            inject_returns_into_match_arms(match_expr);
        }
        Stmt::Expr(expr, semi) if semi.is_none() && tail_expression_needs_return(expr) => {
            let taken = std::mem::replace(expr, Expr::Verbatim(proc_macro2::TokenStream::new()));
            *last = Stmt::Expr(
                Expr::Return(syn::ExprReturn {
                    attrs: Vec::new(),
                    return_token: syn::token::Return::default(),
                    expr: Some(Box::new(taken)),
                }),
                None,
            );
        }
        _ => {}
    }
    return owned;
}

pub(super) fn inject_returns_into_if(if_expr: &mut syn::ExprIf) {
    let transformed = inject_tail_returns(&if_expr.then_branch.stmts);
    if_expr.then_branch.stmts = transformed;
    if let Some((_, else_branch)) = &mut if_expr.else_branch {
        match else_branch.as_mut() {
            Expr::If(nested_if) => inject_returns_into_if(nested_if),
            Expr::Block(block) => {
                let transformed = inject_tail_returns(&block.block.stmts);
                block.block.stmts = transformed;
            }
            other => {
                let taken =
                    std::mem::replace(other, Expr::Verbatim(proc_macro2::TokenStream::new()));
                *else_branch = Box::new(Expr::Return(syn::ExprReturn {
                    attrs: Vec::new(),
                    return_token: syn::token::Return::default(),
                    expr: Some(Box::new(taken)),
                }));
            }
        }
    }
}

pub(super) fn inject_returns_into_match_arms(match_expr: &mut syn::ExprMatch) {
    for arm in &mut match_expr.arms {
        inject_return_into_arm_body(&mut arm.body);
    }
}

pub(super) fn inject_return_into_arm_body(body: &mut Expr) {
    match body {
        Expr::Return(_) => {}
        Expr::Block(block) => {
            let transformed = inject_tail_returns(&block.block.stmts);
            block.block.stmts = transformed;
        }
        Expr::If(if_expr) => {
            inject_returns_into_if(if_expr);
        }
        Expr::Match(match_expr) => {
            inject_returns_into_match_arms(match_expr);
        }
        _ => {
            let taken = std::mem::replace(body, Expr::Verbatim(proc_macro2::TokenStream::new()));
            *body = Expr::Return(syn::ExprReturn {
                attrs: Vec::new(),
                return_token: syn::token::Return::default(),
                expr: Some(Box::new(taken)),
            });
        }
    }
}

pub(super) fn emit_function_block(
    out: &mut String,
    statements: &[Stmt],
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let has_return_type = entities
        .iter()
        .any(|marker| marker.starts_with(RETURN_TYPE_MARKER) && !marker.ends_with("void"));
    if has_return_type && let Some(last @ Stmt::Expr(Expr::Match(_), None)) = statements.last() {
        if let Some(matched) = caught_panic_match_statement(last) {
            emit_block(out, &statements[..statements.len() - 1], entities, indent)?;
            return emit_caught_panic_match(out, &matched, entities, indent);
        }
        let Stmt::Expr(Expr::Match(match_expr), _) = last else {
            unreachable!();
        };
        emit_block(out, &statements[..statements.len() - 1], entities, indent)?;
        emit_return_match_with_exits(out, match_expr, entities, indent)
    } else if has_return_type
        && let Some(Stmt::Expr(expr, None)) = statements.last()
        && matches!(expr, Expr::If(_) | Expr::Block(_) | Expr::Unsafe(_))
    {
        emit_block_with_tail_returns(out, statements, entities, indent)
    } else if has_return_type
        && let Some(Stmt::Expr(expr, None)) = statements.last()
        && tail_expression_needs_return(expr)
    {
        emit_block_with_tail_returns(out, statements, entities, indent)
    } else {
        emit_block(out, statements, entities, indent)
    }
}

// Emits a lexical block and returns the context after its statements. Most callers discard the
// result because Rust block bindings do not escape, but a value block still needs the advanced
// context while emitting its final expression.
pub(super) fn emit_block_with_context(
    out: &mut String,
    statements: &[Stmt],
    entities: &HashSet<String>,
    indent: usize,
) -> Result<HashSet<String>, CompileError> {
    return emit_block_with_tail(out, statements, None, entities, indent);
}

// `emit_block_with_context`, emitting `tail` in place of the last statement. The other statements
// are emitted as parsed, not copied: binding ids are keyed by the address of a binding's identifier
// (`binding_site_key`), so a copied `let` would lose everything the resolver proved for it.
pub(super) fn emit_block_with_tail(
    out: &mut String,
    statements: &[Stmt],
    tail: Option<&Stmt>,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<HashSet<String>, CompileError> {
    let mut block_context = entities.clone();
    insert_vitest_rebound_struct_context(statements, &mut block_context);
    let mut declaration_counts = HashMap::new();
    for statement in statements {
        if let Stmt::Local(local) = statement {
            if let Some(name) = local_pattern_name(&local.pat) {
                *declaration_counts.entry(name).or_insert(0_usize) += 1;
            }
            if let Pat::Tuple(tuple) = &local.pat {
                for elem in &tuple.elems {
                    let name = match elem {
                        Pat::TupleStruct(ts)
                            if (ts.path.is_ident("Some") || ts.path.is_ident("Ok"))
                                && ts.elems.len() == 1 =>
                        {
                            if let Pat::Ident(ident) = &ts.elems[0] {
                                Some(ident.ident.to_string())
                            } else {
                                None
                            }
                        }
                        Pat::Ident(ident) if ident.ident != "None" => Some(ident.ident.to_string()),
                        _ => None,
                    };
                    if let Some(name) = name {
                        *declaration_counts.entry(name).or_insert(0_usize) += 1;
                    }
                }
            }
        }
    }
    let mut declared: HashSet<String> = HashSet::new();
    let mut skip_remaining: usize = 0;
    for (index, parsed) in statements.iter().enumerate() {
        if skip_remaining > 0 {
            skip_remaining -= 1;
            continue;
        }
        if (tail.is_none() || index + 2 < statements.len())
            && let Some(next) = statements.get(index + 1)
            && let Some((closure, error_pattern, handler)) = caught_panic_transaction(
                parsed,
                next,
                statements.get(index + 2..).unwrap_or_default(),
            )
        {
            emit_caught_panic_transaction(
                out,
                closure,
                error_pattern,
                handler,
                &block_context,
                indent,
            )?;
            skip_remaining = 1;
            continue;
        }
        if let Some(finally) = caught_panic_finally_transaction(
            parsed,
            statements.get(index + 1..).unwrap_or_default(),
        ) {
            emit_caught_panic_finally_transaction(
                out,
                finally.closure,
                &statements[index + 1 + finally.cleanup_range.start
                    ..index + 1 + finally.cleanup_range.end],
                finally.returning,
                &block_context,
                indent,
            )?;
            skip_remaining = finally.cleanup_range.end + 1;
            continue;
        }
        if tail.is_none()
            && let Some(transaction) = caught_panic_result_reference_transaction(
                parsed,
                statements.get(index + 1..).unwrap_or_default(),
            )
        {
            emit_caught_panic_result_reference(out, &transaction, &block_context, indent)?;
            skip_remaining = transaction.consumed;
            continue;
        }
        if let Some(matched) = caught_panic_match_statement(parsed) {
            emit_caught_panic_match(out, &matched, &block_context, indent)?;
            continue;
        }
        if let Some(unwrapped) = caught_panic_unwrap_or_return(parsed) {
            emit_caught_panic_unwrap_or_return(out, &unwrapped, &block_context, indent)?;
            continue;
        }
        if let Some((closure, fallback, if_expr)) = caught_panic_unwrap_or_if_condition(parsed) {
            emit_caught_panic_unwrap_or_if(
                out,
                closure,
                fallback,
                if_expr,
                &block_context,
                indent,
            )?;
            continue;
        }
        let statement = match tail {
            Some(tail) if index + 1 == statements.len() => tail,
            _ => parsed,
        };
        if let Stmt::Local(local) = statement
            && let Some(name) = local_pattern_name(&local.pat)
        {
            let rebound = declaration_counts
                .get(&name)
                .is_some_and(|count| *count > 1);
            let local_context = allocation_initialized_context(
                &block_context,
                local,
                &name,
                statements.get(index + 1),
            );
            let shadowed = !declared.insert(name);
            let effective_context = if local.init.as_ref().is_some_and(|init| {
                !matches!(init.expr.as_ref(), Expr::Try(_))
                    && expression_contains_unconditional_try(&init.expr)
            }) {
                let init = local.init.as_ref().unwrap();
                emit_try_pre_extractions(out, &init.expr, &local_context, indent)?
            } else {
                local_context
            };
            for (old_name, new_name) in
                emit_local_with_shadow(out, local, &effective_context, indent, shadowed, rebound)?
            {
                let rename_prefix = format!("{RENAME_MARKER}{old_name}=");
                block_context.retain(|m| !m.starts_with(&rename_prefix));
                block_context.insert(format!("{RENAME_MARKER}{old_name}={new_name}"));
            }
            if let Some(counter) = effective_context
                .iter()
                .find(|m| m.starts_with(TRY_COUNTER_MARKER))
            {
                block_context.retain(|m| !m.starts_with(TRY_COUNTER_MARKER));
                block_context.insert(counter.clone());
            }
            if let Some(init) = &local.init {
                if matches!(init.expr.as_ref(), Expr::Try(_))
                    && expression_contains_unconditional_try(&init.expr)
                {
                    let try_count_before = block_context
                        .iter()
                        .find_map(|m| m.strip_prefix(TRY_COUNTER_MARKER))
                        .and_then(|s| s.parse::<usize>().ok())
                        .unwrap_or(0);
                    let emitted = collect_unconditional_try_expressions(&init.expr).len();
                    if emitted > 0 {
                        let new_count = try_count_before + emitted;
                        block_context.retain(|m| !m.starts_with(TRY_COUNTER_MARKER));
                        block_context.insert(format!("{TRY_COUNTER_MARKER}{new_count}"));
                    }
                }
            }
            update_vitest_struct_local_context(local, &mut block_context);
            update_vitest_local_function_context(local, &mut block_context);
        } else if let Stmt::Local(local) = statement {
            let try_count_before = block_context
                .iter()
                .find_map(|m| m.strip_prefix(TRY_COUNTER_MARKER))
                .and_then(|s| s.parse::<usize>().ok())
                .unwrap_or(0);
            let tuple_pat = match &local.pat {
                Pat::Tuple(t) => Some(t),
                Pat::Type(typed) => {
                    if let Pat::Tuple(t) = typed.pat.as_ref() {
                        Some(t)
                    } else {
                        None
                    }
                }
                _ => None,
            };
            if let Some(tuple) = tuple_pat
                && local.init.is_some()
            {
                // Every identifier the (possibly nested) tuple pattern binds, with its index path, so a
                // shadowing or self-referencing binding at any depth is decomposed through the temp.
                let tuple_bindings = tuple_pattern_bindings(tuple);
                let elem_rust_names: Vec<Option<String>> = tuple_bindings
                    .iter()
                    .map(|binding| Some(binding.name.clone()))
                    .collect();
                let any_rebound = elem_rust_names.iter().any(|n| {
                    n.as_ref()
                        .is_some_and(|name| declaration_counts.get(name).is_some_and(|c| *c > 1))
                });
                let init = local.init.as_ref().unwrap();
                let init_is_hoisted_block = matches!(init.expr.as_ref(),
                    Expr::Block(b) if block_contains_function_exits(&b.block))
                    || matches!(init.expr.as_ref(),
                    Expr::Unsafe(u) if block_contains_function_exits(&u.block));
                let any_shadowed = elem_rust_names
                    .iter()
                    .any(|n| n.as_ref().is_some_and(|name| declared.contains(name)));
                let (any_scope_declared, any_self_ref) = if init_is_hoisted_block {
                    (false, false)
                } else {
                    let scope = elem_rust_names.iter().any(|n| {
                        n.as_ref().is_some_and(|name| {
                            block_context.contains(&format!("{SCOPE_DECLARED_MARKER}{name}"))
                        })
                    });
                    let self_ref = elem_rust_names.iter().any(|n| {
                        n.as_ref()
                            .is_some_and(|name| expression_contains_identifier(&init.expr, name))
                    });
                    (scope, self_ref)
                };
                let hoisted_scope_declared = init_is_hoisted_block
                    && elem_rust_names.iter().any(|n| {
                        n.as_ref().is_some_and(|name| {
                            block_context.contains(&format!("{SCOPE_DECLARED_MARKER}{name}"))
                        })
                    });
                let needs_decompose = any_shadowed || any_scope_declared || any_self_ref;
                if needs_decompose {
                    let mut value = emit_expression(&init.expr, &block_context)?;
                    // A nested tuple literal widens to `(T | T[])[]` without a const assertion, which
                    // the nested element reads (`__dt0[0][1]`) cannot index.
                    if matches!(peel_reference_and_paren(&init.expr), Expr::Tuple(_))
                        && tuple_bindings.iter().any(|binding| binding.path.len() > 1)
                    {
                        value = format!("{value} as const");
                    }
                    let temp = format!("__dt{index}");
                    write_indent(out, indent);
                    writeln!(out, "const {temp} = {value};")
                        .expect("writing to a String cannot fail");
                    for binding in &tuple_bindings {
                        let rust_name = &binding.name;
                        let element = binding
                            .path
                            .iter()
                            .map(|index| format!("[{index}]"))
                            .collect::<String>();
                        let js_name = snake_to_lower_camel(rust_name);
                        let is_shadowed = declared.contains(rust_name);
                        let is_scope_declared =
                            block_context.contains(&format!("{SCOPE_DECLARED_MARKER}{rust_name}"));
                        let is_self_ref = expression_contains_identifier(&init.expr, rust_name);
                        let is_mutable = binding.mutable;
                        let is_rebound = declaration_counts.get(rust_name).is_some_and(|c| *c > 1);
                        if is_shadowed {
                            write_indent(out, indent);
                            writeln!(out, "{js_name} = {temp}{element};")
                                .expect("writing to a String cannot fail");
                        } else if is_scope_declared || is_self_ref {
                            let fresh = next_try_rename(&block_context, &js_name);
                            let keyword = if is_mutable || is_rebound {
                                "let"
                            } else {
                                "const"
                            };
                            write_indent(out, indent);
                            writeln!(out, "{keyword} {fresh} = {temp}{element};")
                                .expect("writing to a String cannot fail");
                            let rename_prefix = format!("{RENAME_MARKER}{js_name}=");
                            block_context.retain(|m| !m.starts_with(&rename_prefix));
                            block_context.insert(format!("{RENAME_MARKER}{js_name}={fresh}"));
                        } else {
                            let keyword = if is_mutable || is_rebound {
                                "let"
                            } else {
                                "const"
                            };
                            write_indent(out, indent);
                            writeln!(out, "{keyword} {js_name} = {temp}{element};")
                                .expect("writing to a String cannot fail");
                        }
                    }
                } else if any_rebound || hoisted_scope_declared {
                    for (old_name, new_name) in
                        emit_local_with_shadow(out, local, &block_context, indent, false, true)?
                    {
                        let rename_prefix = format!("{RENAME_MARKER}{old_name}=");
                        block_context.retain(|m| !m.starts_with(&rename_prefix));
                        block_context.insert(format!("{RENAME_MARKER}{old_name}={new_name}"));
                    }
                } else {
                    emit_statement(out, statement, &block_context, indent)?;
                }
                for name in &elem_rust_names {
                    if let Some(n) = name {
                        declared.insert(n.clone());
                    }
                }
            } else {
                emit_statement(out, statement, &block_context, indent)?;
            }
            if let Some(init) = &local.init {
                let emitted = collect_unconditional_try_expressions(&init.expr).len();
                if emitted > 0 {
                    let new_count = try_count_before + emitted;
                    block_context.retain(|m| !m.starts_with(TRY_COUNTER_MARKER));
                    block_context.insert(format!("{TRY_COUNTER_MARKER}{new_count}"));
                }
            }
            update_vitest_local_function_context(local, &mut block_context);
        } else {
            let try_count_before = block_context
                .iter()
                .find_map(|m| m.strip_prefix(TRY_COUNTER_MARKER))
                .and_then(|s| s.parse::<usize>().ok())
                .unwrap_or(0);
            emit_statement(out, statement, &block_context, indent)?;
            if let Stmt::Expr(expression, _) = statement {
                let emitted = collect_unconditional_try_expressions(expression).len();
                if emitted > 0 {
                    let new_count = try_count_before + emitted;
                    block_context.retain(|m| !m.starts_with(TRY_COUNTER_MARKER));
                    block_context.insert(format!("{TRY_COUNTER_MARKER}{new_count}"));
                }
            }
        }
    }
    return Ok(block_context);
}

pub(super) fn emit_closure(
    closure: &syn::ExprClosure,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return emit_closure_with_parameter_types(closure, entities, &[]);
}

pub(super) fn emit_closure_with_parameter_types(
    closure: &syn::ExprClosure,
    entities: &HashSet<String>,
    parameter_types: &[String],
) -> Result<String, CompileError> {
    let mut closure_context = entities
        .iter()
        .filter(|marker| {
            !marker.starts_with(RETURN_TYPE_MARKER)
                && !marker.starts_with(RETURNS_TYPED_ARRAY_MARKER)
                && !marker.starts_with(RETURNS_CONTRACT_TYPED_ARRAY_MARKER)
                && !marker.starts_with(FINISH_ENTITY_RETURN_MARKER)
                && marker.as_str() != FLIGHT_ERROR_RETURNS_MARKER
                && marker.as_str() != D15_FUTURE_CLOSURE_MARKER
                && marker.as_str() != D15_FUTURE_RETURN_MARKER
                && marker.as_str() != RETURNS_U32_MARKER
                && marker.as_str() != RETURNS_NULLABLE_MARKER
        })
        .cloned()
        .collect::<HashSet<_>>();
    if entities.contains(D15_FUTURE_CLOSURE_MARKER) {
        closure_context.insert(D15_FUTURE_RETURN_MARKER.to_string());
    }
    if let ReturnType::Type(_, rust_type) = &closure.output {
        closure_context.insert(format!(
            "{RETURN_TYPE_MARKER}{}",
            emit_type(rust_type, entities)?
        ));
        if type_is_named(rust_type, "u32") {
            closure_context.insert(RETURNS_U32_MARKER.to_string());
        }
    }
    for pattern in &closure.inputs {
        closure_context = lexical_pattern_context(&closure_context, pattern);
    }
    for (index, pattern) in closure.inputs.iter().enumerate() {
        let Some(parameter) = closure_parameter_identifier(pattern) else {
            continue;
        };
        closure_context.remove(&format!("{STRING_EXPRESSION_MARKER}{parameter}"));
        let annotated_string = matches!(
            pattern,
            Pat::Type(typed) if rust_type_is_string(&typed.ty)
        );
        let inferred_string = parameter_types
            .get(index)
            .is_some_and(|typescript_type| typescript_type == "string");
        if annotated_string || inferred_string {
            closure_context.insert(format!("{STRING_EXPRESSION_MARKER}{parameter}"));
        }
    }
    let mut parameter_names = HashSet::new();
    for pattern in &closure.inputs {
        collect_closure_parameter_names(pattern, &mut parameter_names);
        for binding in provenance_pattern_bindings(pattern) {
            clear_provenance_binding(
                &mut closure_context,
                VITEST_PUBLIC_FUNCTION_MARKER,
                &binding,
            );
            clear_provenance_binding(
                &mut closure_context,
                VITEST_FUNCTION_CANDIDATE_MARKER,
                &binding,
            );
        }
        if let Pat::Type(typed) = pattern
            && let Pat::Ident(identifier) = typed.pat.as_ref()
            && let Some(structure) = vitest_named_type(&typed.ty, &closure_context)
            && let Some(identity) = vitest_struct_owner(&closure_context, &structure)
        {
            insert_provenance_binding(
                &mut closure_context,
                VITEST_STRUCT_LOCAL_MARKER,
                &identifier.ident.to_string(),
                &identity,
            );
        }
    }
    for pattern in &closure.inputs {
        if let Some(param_name) = local_pattern_name(pattern) {
            closure_context.insert(format!("{SCOPE_DECLARED_MARKER}{param_name}"));
            let camel = snake_to_lower_camel(&param_name);
            if camel != param_name {
                closure_context.insert(format!("{SCOPE_DECLARED_MARKER}{camel}"));
            }
        }
    }
    let mut unused_index = 0_usize;
    let parameters = closure
        .inputs
        .iter()
        .enumerate()
        .map(|(index, pattern)| {
            let parameter =
                emit_closure_parameter(pattern, entities, &mut parameter_names, &mut unused_index)?;
            if matches!(pattern, Pat::Type(_)) {
                return Ok(parameter);
            }
            return Ok(match parameter_types.get(index) {
                Some(typescript_type) => format!("{parameter}: {typescript_type}"),
                None => parameter,
            });
        })
        .collect::<Result<Vec<_>, _>>()?;
    let return_type = match &closure.output {
        ReturnType::Default => String::new(),
        ReturnType::Type(_, rust_type) => format!(": {}", emit_type(rust_type, entities)?),
    };
    let body = match closure.body.as_ref() {
        Expr::Block(block)
            if closure_context.contains(D15_FUTURE_RETURN_MARKER)
                && let Some((preceding, value)) = d15_future_provider(&block.block.stmts) =>
        {
            let mut body = String::new();
            body.push_str("{\n");
            emit_d15_future_provider(&mut body, preceding, value, &closure_context)?;
            body.push('}');
            body
        }
        Expr::Block(block) => {
            let mut body = String::new();
            body.push_str("{\n");
            emit_block_with_tail_returns(&mut body, &block.block.stmts, &closure_context, 1)?;
            body.push('}');
            body
        }
        Expr::Return(expression) => {
            let Some(value) = &expression.expr else {
                return Err(compile_error(
                    "portable expression closure cannot return without a value",
                ));
            };
            let body = emit_expression(value, &closure_context)?;
            concise_arrow_body(strip_value_position_parens(&body).to_string())
        }
        expression => {
            let body = emit_expression(expression, &closure_context)?;
            concise_arrow_body(strip_value_position_parens(&body).to_string())
        }
    };
    return Ok(format!(
        "({}){return_type} => {body}",
        parameters.join(", ")
    ));
}

pub(super) fn emit_closure_parameter(
    pattern: &Pat,
    entities: &HashSet<String>,
    parameter_names: &mut HashSet<String>,
    unused_index: &mut usize,
) -> Result<String, CompileError> {
    return match pattern {
        Pat::Ident(identifier) => Ok(snake_to_lower_camel(&identifier.ident.to_string())),
        Pat::Reference(reference) => {
            emit_closure_parameter(&reference.pat, entities, parameter_names, unused_index)
        }
        Pat::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| {
                    emit_closure_parameter(element, entities, parameter_names, unused_index)
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Pat::Type(pattern) => Ok(format!(
            "{}: {}",
            emit_closure_parameter(&pattern.pat, entities, parameter_names, unused_index,)?,
            emit_type(&pattern.ty, entities)?
        )),
        Pat::Wild(_) => loop {
            let name = format!("_unused{unused_index}");
            *unused_index += 1;
            if parameter_names.insert(name.clone()) {
                break Ok(name);
            }
        },
        _ => Err(compile_error(
            "unsupported destructuring in closure parameter",
        )),
    };
}

pub(super) fn collect_closure_parameter_names(pattern: &Pat, names: &mut HashSet<String>) {
    match pattern {
        Pat::Ident(identifier) => {
            names.insert(snake_to_lower_camel(&identifier.ident.to_string()));
        }
        Pat::Reference(reference) => collect_closure_parameter_names(&reference.pat, names),
        Pat::Tuple(tuple) => {
            for element in &tuple.elems {
                collect_closure_parameter_names(element, names);
            }
        }
        Pat::Type(pattern) => collect_closure_parameter_names(&pattern.pat, names),
        _ => {}
    }
}
