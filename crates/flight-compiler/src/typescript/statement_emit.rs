use std::collections::HashSet;
use std::fmt::Write;

use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::{BinOp, Expr, GenericArgument, Lit, Pat, PathArguments, Stmt, Token};

use crate::{CompileError, compile_error};

use super::{
    BindingFact, CHAR_EXPRESSION_MARKER, FLIGHT_ERROR_RETURNS_MARKER, RETURN_TYPE_MARKER,
    RETURNS_NULLABLE_MARKER, RETURNS_TYPED_ARRAY_MARKER, RETURNS_U32_MARKER, SCOPE_DECLARED_MARKER,
    STRING_EXPRESSION_MARKER, begin_option_if_with_rebind, begin_option_while,
    binary_is_assignment, contextual_assignment_field_context, contract_typed_array_return_value,
    data_union_pattern_test, emit_assert_comparison_statement, emit_assert_statement,
    emit_binary_operand, emit_block, emit_block_expression, emit_copy_from_slice_statement,
    emit_data_union_tuple_binding, emit_dedup_statement, emit_entry_or_default_assign,
    emit_entry_or_default_method, emit_expression, emit_for_header, emit_format_template,
    emit_hashmap_retain_statement, emit_hashset_retain_statement, emit_ignored_caught_panic,
    emit_iter_mut_loop_if_supported, emit_local, emit_local_function, emit_match_statement,
    emit_match_statement_with_target, emit_option_binding, emit_panic_message, emit_path_segment,
    emit_receiver_preserving_optional_call, emit_resize_statement, emit_resize_with_statement,
    emit_retain_statement, emit_return_match_with_exits, emit_swap_remove_statement,
    emit_try_pre_extractions, emit_type, emit_unreachable_message, emit_vec_extend_statement,
    entity_allocation, entity_runtime_state_access, expression_contains_identifier,
    expression_contains_unconditional_try, expression_hash_collection,
    expression_is_finished_entity_return, expression_is_nullable_option_field, expression_is_path,
    expression_is_path_call, expression_is_plain_place, expression_is_reusable,
    expression_is_sequence, expression_is_unsigned_result, expression_path_ends_with,
    for_loop_iterates_chars, for_loop_iterates_strings, hoist_nested_exit_match,
    ignored_caught_panic, indent_continuation_lines, is_primary_expression_text,
    is_record_map_local, lexical_pattern_context, local_pattern_name, nullable_option_value,
    option_absent_value, option_return_absent_value, option_scrutinee_is_rereadable,
    pattern_identifiers, peel_reference_and_paren, production_std_panic_path, snake_to_lower_camel,
    split_let_chain, statement_binds_name, std_mem_function, strip_value_position_parens,
    swap_operand_is_place, throw_call, typed_array_literal, unique_marker_suffix, write_indent,
};
pub(super) fn emit_value_block(
    block: &syn::Block,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if let [Stmt::Expr(expression, _)] = block.stmts.as_slice() {
        if expression_contains_unconditional_try(expression) {
            let mut out = "(() => {\n".to_string();
            let try_context = emit_try_pre_extractions(&mut out, expression, entities, 1)?;
            write_indent(&mut out, 1);
            writeln!(
                out,
                "return {};",
                emit_expression(expression, &try_context)?
            )
            .expect("writing to a String cannot fail");
            out.push_str("})()");
            return Ok(out);
        }
        return emit_expression(expression, entities);
    }
    return emit_block_expression(block, entities);
}

pub(super) fn emit_single_generic_type(
    segment: &syn::PathSegment,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return Err(compile_error(format!(
            "`{}` needs one type argument",
            segment.ident
        )));
    };
    let types = arguments
        .args
        .iter()
        .filter_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(rust_type),
            _ => None,
        })
        .collect::<Vec<_>>();
    if types.len() != 1 {
        return Err(compile_error(format!(
            "`{}` needs exactly one type argument",
            segment.ident
        )));
    }
    return emit_type(types[0], entities);
}

pub(super) fn emit_statement(
    out: &mut String,
    statement: &Stmt,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    match statement {
        Stmt::Local(local) if ignored_caught_panic(local).is_some() => {
            emit_ignored_caught_panic(
                out,
                ignored_caught_panic(local).expect("guarded by the match condition"),
                entities,
                indent,
            )?;
        }
        Stmt::Local(local)
            if local.init.as_ref().is_some_and(|init| {
                !matches!(init.expr.as_ref(), Expr::Try(_))
                    && expression_contains_unconditional_try(&init.expr)
            }) =>
        {
            let init = local.init.as_ref().unwrap();
            let try_context = emit_try_pre_extractions(out, &init.expr, entities, indent)?;
            emit_local(out, local, &try_context, indent)?;
        }
        Stmt::Local(local) => emit_local(out, local, entities, indent)?,
        Stmt::Expr(Expr::Call(call), _)
            if expression_path_ends_with(&call.func, "set_record_value")
                && call.args.len() == 3 =>
        {
            let ctx = if expression_contains_unconditional_try(&call.args[2]) {
                emit_try_pre_extractions(out, &call.args[2], entities, indent)?
            } else {
                entities.clone()
            };
            let record = emit_expression(&call.args[0], &ctx)?;
            let key = emit_expression(&call.args[1], &ctx)?;
            let value = emit_expression(&call.args[2], &ctx)?;
            write_indent(out, indent);
            writeln!(out, "{record}[{key}] = {value};").expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::Call(call), _)
            if expression_path_ends_with(&call.func, "get_record_keys") && call.args.len() == 2 =>
        {
            let target = emit_expression(&call.args[0], entities)?;
            let record = emit_expression(&call.args[1], entities)?;
            write_indent(out, indent);
            writeln!(out, "{target}.length = 0;").expect("writing to a String cannot fail");
            write_indent(out, indent);
            writeln!(out, "{target}.push(...Object.keys({record}));")
                .expect("writing to a String cannot fail");
        }
        // `resume_unwind(payload)` rethrows a panic caught by a lowered `catch_unwind` unchanged.
        Stmt::Expr(Expr::Call(call), _)
            if production_std_panic_path(&call.func, "resume_unwind") && call.args.len() == 1 =>
        {
            write_indent(out, indent);
            writeln!(out, "throw {};", emit_expression(&call.args[0], entities)?)
                .expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::Call(call), _) if throw_call(call).is_some() => {
            let (constructor, message) = throw_call(call).expect("guarded by the match condition");
            write_indent(out, indent);
            writeln!(
                out,
                "throw new {constructor}({});",
                emit_expression(message, entities)?
            )
            .expect("writing to a String cannot fail");
        }
        // A tuple `if let` over calls binds each call to a local first, in source order, so the
        // patterns test plain locals; the remaining elements are reusable and read in place.
        Stmt::Expr(Expr::If(if_expression), semicolon)
            if let Some(bound) = bind_tuple_if_let_operands(if_expression) =>
        {
            emit_statement(
                out,
                &Stmt::Expr(Expr::Block(bound), *semicolon),
                entities,
                indent,
            )?;
        }
        Stmt::Expr(Expr::If(if_expression), _) => {
            let let_chain = split_let_chain(&if_expression.cond);
            let mut then_context = if let Some((binding, _, post_guards)) = &let_chain {
                let mut context = lexical_pattern_context(entities, &binding.pat);
                for guard in post_guards {
                    if let Expr::Let(let_guard) = guard {
                        context = lexical_pattern_context(&context, &let_guard.pat);
                    }
                }
                context
            } else if let Expr::Let(binding) = if_expression.cond.as_ref() {
                lexical_pattern_context(entities, &binding.pat)
            } else {
                entities.clone()
            };
            let tuple_binding = emit_data_union_tuple_binding(&if_expression.cond, entities)?;
            let let_chain_pre_guards = if let Some((_, ref pre, _)) = let_chain {
                if !pre.is_empty() {
                    Some(pre.clone())
                } else {
                    None
                }
            } else {
                None
            };
            let let_chain_post_guards = if let Some((_, _, ref post)) = let_chain {
                if !post.is_empty() {
                    Some(post.clone())
                } else {
                    None
                }
            } else {
                None
            };
            let option_binding = if tuple_binding.is_some() {
                None
            } else if let Some((let_expr, _, _)) = &let_chain {
                let synthetic = Expr::Let((*let_expr).clone());
                emit_option_binding(&synthetic, entities)?
            } else {
                emit_option_binding(&if_expression.cond, entities)?
            };
            if let Some(binding) = &option_binding
                && emit_receiver_preserving_optional_call(
                    out,
                    if_expression,
                    binding,
                    entities,
                    indent,
                )?
            {
                return Ok(());
            }
            let pre_guard_indent = indent;
            let indent = if let Some(pre_guards) = &let_chain_pre_guards {
                let guard_parts: Vec<String> = pre_guards
                    .iter()
                    .map(|guard| emit_expression(guard, entities))
                    .collect::<Result<Vec<_>, _>>()?;
                write_indent(out, indent);
                writeln!(out, "if ({}) {{", guard_parts.join(" && "))
                    .expect("writing to a String cannot fail");
                indent + 1
            } else {
                indent
            };
            let (data_union_if_let, err_if_let) =
                if option_binding.is_none() && tuple_binding.is_none() {
                    let cond = if let Some((let_expr, _, _)) = &let_chain {
                        Some(&let_expr.pat)
                    } else if let Expr::Let(binding) = &*if_expression.cond {
                        Some(&binding.pat)
                    } else {
                        None
                    };
                    if let Some(pattern) = cond {
                        let let_expr = if let Some((let_expr, _, _)) = &let_chain {
                            let_expr
                        } else if let Expr::Let(binding) = &*if_expression.cond {
                            binding
                        } else {
                            unreachable!()
                        };
                        if let Pat::TupleStruct(ts) = &**pattern
                            && ts.path.is_ident("Err")
                            && ts.elems.len() == 1
                        {
                            let absent = option_absent_value(&let_expr.expr, entities);
                            let scrutinee = emit_expression(&let_expr.expr, entities)?;
                            let binding_name = if let Pat::Ident(id) = &ts.elems[0]
                                && id.subpat.is_none()
                                && id.ident != "_"
                            {
                                Some(snake_to_lower_camel(&id.ident.to_string()))
                            } else {
                                None
                            };
                            (None, Some((scrutinee, absent, binding_name)))
                        } else {
                            let (effective_pattern, option_wrapped): (&Pat, bool) =
                                if let Pat::TupleStruct(ts) = &**pattern
                                    && (ts.path.is_ident("Some") || ts.path.is_ident("Ok"))
                                    && ts.elems.len() == 1
                                {
                                    (&ts.elems[0], true)
                                } else {
                                    (pattern, false)
                                };
                            if let Some(mut test) =
                                data_union_pattern_test(effective_pattern, "$ifLet", entities)?
                            {
                                if option_wrapped {
                                    let absent = option_absent_value(&let_expr.expr, entities);
                                    test.predicate = Some(match test.predicate {
                                        Some(predicate) => {
                                            format!("$ifLet !== {absent} && {predicate}")
                                        }
                                        None => format!("$ifLet !== {absent}"),
                                    });
                                }
                                (
                                    Some((emit_expression(&let_expr.expr, entities)?, test)),
                                    None,
                                )
                            } else {
                                (None, None)
                            }
                        }
                    } else {
                        (None, None)
                    }
                } else {
                    (None, None)
                };
            let outer_indent = indent;
            let (indent, wrapped) = if let Some(binding) = &option_binding {
                let opt_pat = if let Some((let_expr, _, _)) = &let_chain {
                    Some(&let_expr.pat)
                } else if let Expr::Let(b) = if_expression.cond.as_ref() {
                    Some(&b.pat)
                } else {
                    None
                };
                let opt_rust_name = opt_pat.and_then(|p| local_pattern_name(p));
                let body_rebinds = opt_rust_name.as_ref().is_some_and(|name| {
                    if_expression.then_branch.stmts.iter().any(|stmt| {
                        if let Stmt::Local(local) = stmt {
                            statement_binds_name(&local.pat, name)
                        } else {
                            false
                        }
                    })
                });
                begin_option_if_with_rebind(
                    out,
                    indent,
                    binding,
                    option_scrutinee_is_rereadable(&if_expression.cond),
                    body_rebinds,
                )
            } else if let Some((ref value_expr, ref test)) = data_union_if_let {
                write_indent(out, indent);
                out.push_str("{\n");
                write_indent(out, indent + 1);
                writeln!(out, "const $ifLet = {value_expr};")
                    .expect("writing to a String cannot fail");
                let predicate = test.predicate.as_deref().unwrap_or("true");
                write_indent(out, indent + 1);
                writeln!(out, "if ({predicate}) {{").expect("writing to a String cannot fail");
                for (binding, expression) in &test.bindings {
                    let name = snake_to_lower_camel(binding);
                    write_indent(out, indent + 2);
                    writeln!(out, "const {name} = {expression};")
                        .expect("writing to a String cannot fail");
                }
                (indent + 1, true)
            } else if let Some((ref scrutinee, ref absent, ref binding_name)) = err_if_let {
                write_indent(out, indent);
                writeln!(out, "if ({scrutinee} === {absent}) {{")
                    .expect("writing to a String cannot fail");
                if let Some(name) = binding_name {
                    then_context.insert(name.clone());
                    write_indent(out, indent + 1);
                    writeln!(out, "const {name} = {absent};")
                        .expect("writing to a String cannot fail");
                }
                (indent, false)
            } else {
                let try_context = if tuple_binding.is_none()
                    && !matches!(&*if_expression.cond, Expr::Let(_))
                    && let_chain.is_none()
                    && expression_contains_unconditional_try(&if_expression.cond)
                {
                    Some(emit_try_pre_extractions(
                        out,
                        &if_expression.cond,
                        entities,
                        indent,
                    )?)
                } else {
                    None
                };
                write_indent(out, indent);
                if let Some((condition, _)) = &tuple_binding {
                    writeln!(out, "if ({condition}) {{").expect("writing to a String cannot fail");
                } else if matches!(&*if_expression.cond, Expr::Let(_)) || let_chain.is_some() {
                    return Err(compile_error(
                        "portable `if let` requires a recognized Option or data union pattern",
                    ));
                } else {
                    let ctx = try_context.as_ref().unwrap_or(entities);
                    let condition = emit_expression(&if_expression.cond, ctx)?;
                    writeln!(out, "if ({}) {{", strip_value_position_parens(&condition))
                        .expect("writing to a String cannot fail");
                }
                (indent, false)
            };
            for (name, value) in tuple_binding
                .map(|(_, bindings)| bindings)
                .unwrap_or_default()
            {
                if name == value {
                    continue;
                }
                write_indent(out, indent + 1);
                writeln!(out, "const {name} = {value};").expect("writing to a String cannot fail");
            }
            if option_binding.is_some() {
                let pat = if let Some((let_expr, _, _)) = &let_chain {
                    Some(&let_expr.pat)
                } else if let Expr::Let(binding) = if_expression.cond.as_ref() {
                    Some(&binding.pat)
                } else {
                    None
                };
                if let Some(pat) = pat {
                    if let Some(name) = local_pattern_name(pat) {
                        let camel = snake_to_lower_camel(&name);
                        then_context.insert(format!("{SCOPE_DECLARED_MARKER}{name}"));
                        if camel != name {
                            then_context.insert(format!("{SCOPE_DECLARED_MARKER}{camel}"));
                        }
                    }
                }
            }
            if let Some((_, ref test)) = data_union_if_let {
                for (binding, _) in &test.bindings {
                    then_context.insert(format!("{SCOPE_DECLARED_MARKER}{binding}"));
                }
            }
            if let Some(post_guards) = &let_chain_post_guards {
                let mut body_indent = indent + 1;
                let mut extra_closes: usize = 0;
                let (expr_guards, let_guards): (Vec<&&Expr>, Vec<&&Expr>) = post_guards
                    .iter()
                    .partition(|guard| !matches!(guard, Expr::Let(_)));
                if !expr_guards.is_empty() {
                    let guard_parts: Vec<String> = expr_guards
                        .iter()
                        .map(|guard| emit_expression(guard, &then_context))
                        .collect::<Result<Vec<_>, _>>()?;
                    write_indent(out, body_indent);
                    writeln!(out, "if ({}) {{", guard_parts.join(" && "))
                        .expect("writing to a String cannot fail");
                    body_indent += 1;
                    extra_closes += 1;
                }
                for let_guard in &let_guards {
                    if let Some(binding) = emit_option_binding(let_guard, &then_context)? {
                        let (name, scrutinee, absent) = binding;
                        write_indent(out, body_indent);
                        writeln!(out, "if ({scrutinee} !== {absent}) {{")
                            .expect("writing to a String cannot fail");
                        body_indent += 1;
                        if name != scrutinee {
                            write_indent(out, body_indent);
                            writeln!(out, "const {name} = {scrutinee};")
                                .expect("writing to a String cannot fail");
                        }
                        if let Expr::Let(let_binding) = let_guard {
                            if let Some(rust_name) = local_pattern_name(&let_binding.pat) {
                                let camel = snake_to_lower_camel(&rust_name);
                                then_context.insert(format!("{SCOPE_DECLARED_MARKER}{rust_name}"));
                                if camel != rust_name {
                                    then_context.insert(format!("{SCOPE_DECLARED_MARKER}{camel}"));
                                }
                            }
                        }
                        extra_closes += 1;
                    }
                }
                emit_block(
                    out,
                    &if_expression.then_branch.stmts,
                    &then_context,
                    body_indent,
                )?;
                for _ in 0..extra_closes {
                    body_indent -= 1;
                    write_indent(out, body_indent);
                    out.push_str("}\n");
                }
            } else {
                emit_block(
                    out,
                    &if_expression.then_branch.stmts,
                    &then_context,
                    indent + 1,
                )?;
            }
            write_indent(out, indent);
            if let Some((_, otherwise)) = &if_expression.else_branch {
                match otherwise.as_ref() {
                    Expr::If(nested)
                        if split_let_chain(&nested.cond).is_none()
                            && !expression_contains_unconditional_try(&nested.cond) =>
                    {
                        out.push_str("} else ");
                        let pos = out.len();
                        emit_statement(
                            out,
                            &Stmt::Expr(Expr::If(nested.clone()), None),
                            entities,
                            indent,
                        )?;
                        let indent_len = indent * 2;
                        if out.len() >= pos + indent_len {
                            out.drain(pos..pos + indent_len);
                        }
                    }
                    _ => {
                        out.push_str("} else {\n");
                        match otherwise.as_ref() {
                            Expr::Block(block) => {
                                emit_block(out, &block.block.stmts, entities, indent + 1)?;
                            }
                            Expr::If(nested) => {
                                emit_statement(
                                    out,
                                    &Stmt::Expr(Expr::If(nested.clone()), None),
                                    entities,
                                    indent + 1,
                                )?;
                            }
                            _ => {
                                return Err(compile_error("unsupported non-block else expression"));
                            }
                        }
                        write_indent(out, indent);
                        out.push_str("}\n");
                    }
                }
            } else {
                out.push_str("}\n");
            }
            if wrapped {
                write_indent(out, outer_indent);
                out.push_str("}\n");
            }
            if let_chain_pre_guards.is_some() {
                write_indent(out, pre_guard_indent);
                out.push_str("}\n");
            }
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "extend" || call.method == "extend_from_slice" =>
        {
            emit_vec_extend_statement(out, call, entities, indent)?;
        }
        Stmt::Expr(Expr::MethodCall(call), _) if call.method == "copy_from_slice" => {
            emit_copy_from_slice_statement(out, call, entities, indent)?;
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "retain"
                && call.args.len() == 1
                && expression_is_sequence(&call.receiver, entities) =>
        {
            emit_retain_statement(out, call, entities, indent)?;
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "dedup"
                && call.args.is_empty()
                && expression_is_sequence(&call.receiver, entities) =>
        {
            emit_dedup_statement(out, call, entities, indent)?;
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "retain"
                && call.args.len() == 1
                && matches!(
                    expression_hash_collection(&call.receiver, entities),
                    Some(BindingFact::HashSet)
                ) =>
        {
            emit_hashset_retain_statement(out, call, entities, indent)?;
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "retain"
                && call.args.len() == 1
                && matches!(
                    expression_hash_collection(&call.receiver, entities),
                    Some(BindingFact::HashMap)
                ) =>
        {
            emit_hashmap_retain_statement(out, call, entities, indent)?;
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "insert"
                && call.args.len() == 1
                && matches!(
                    expression_hash_collection(&call.receiver, entities),
                    Some(BindingFact::HashSet)
                ) =>
        {
            let receiver = emit_expression(&call.receiver, entities)?;
            let value = emit_expression(&call.args[0], entities)?;
            write_indent(out, indent);
            writeln!(out, "{receiver}.add({value});").expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "insert"
                && call.args.len() == 2
                && !is_record_map_local(&call.receiver, entities)
                && matches!(
                    expression_hash_collection(&call.receiver, entities),
                    Some(BindingFact::HashMap)
                ) =>
        {
            let receiver = emit_expression(&call.receiver, entities)?;
            let key = emit_expression(&call.args[0], entities)?;
            let value = emit_expression(&call.args[1], entities)?;
            write_indent(out, indent);
            writeln!(out, "{receiver}.set({key}, {value});")
                .expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "remove"
                && call.args.len() == 1
                && !is_record_map_local(&call.receiver, entities)
                && matches!(
                    expression_hash_collection(&call.receiver, entities),
                    Some(BindingFact::HashMap)
                ) =>
        {
            let receiver = emit_expression(&call.receiver, entities)?;
            let key = emit_expression(peel_reference_and_paren(&call.args[0]), entities)?;
            write_indent(out, indent);
            writeln!(out, "{receiver}.delete({key});").expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "resize"
                && call.args.len() == 2
                && expression_is_sequence(&call.receiver, entities) =>
        {
            emit_resize_statement(out, call, entities, indent)?;
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "resize_with"
                && call.args.len() == 2
                && expression_is_sequence(&call.receiver, entities) =>
        {
            emit_resize_with_statement(out, call, entities, indent)?;
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "swap_remove"
                && call.args.len() == 1
                && expression_is_sequence(&call.receiver, entities) =>
        {
            emit_swap_remove_statement(out, call, entities, indent)?;
        }
        Stmt::Expr(Expr::ForLoop(loop_expression), _) => {
            if !emit_iter_mut_loop_if_supported(out, loop_expression, entities, indent, emit_block)?
            {
                let mut loop_context = lexical_pattern_context(entities, &loop_expression.pat);
                if let Some(loop_var) = local_pattern_name(&loop_expression.pat) {
                    loop_context.insert(format!("{SCOPE_DECLARED_MARKER}{loop_var}"));
                    let camel = snake_to_lower_camel(&loop_var);
                    if camel != loop_var {
                        loop_context.insert(format!("{SCOPE_DECLARED_MARKER}{camel}"));
                    }
                }
                if for_loop_iterates_strings(&loop_expression.expr, entities) {
                    if let Some(name) = local_pattern_name(&loop_expression.pat) {
                        loop_context.insert(format!("{STRING_EXPRESSION_MARKER}{name}"));
                    }
                }
                if for_loop_iterates_chars(&loop_expression.expr) {
                    if let Some(name) = local_pattern_name(&loop_expression.pat) {
                        loop_context.insert(format!("{CHAR_EXPRESSION_MARKER}{name}"));
                    }
                }
                write_indent(out, indent);
                writeln!(
                    out,
                    "for ({}) {{",
                    emit_for_header(&loop_expression.pat, &loop_expression.expr, entities)?
                )
                .expect("writing to a String cannot fail");
                emit_block(out, &loop_expression.body.stmts, &loop_context, indent + 1)?;
                write_indent(out, indent);
                out.push_str("}\n");
            }
        }
        Stmt::Expr(Expr::While(loop_expression), _) => {
            let mut loop_context = if let Expr::Let(binding) = loop_expression.cond.as_ref() {
                lexical_pattern_context(entities, &binding.pat)
            } else {
                entities.clone()
            };
            if let Expr::Let(binding) = loop_expression.cond.as_ref() {
                if let Some(loop_var) = local_pattern_name(&binding.pat) {
                    loop_context.insert(format!("{SCOPE_DECLARED_MARKER}{loop_var}"));
                    let camel = snake_to_lower_camel(&loop_var);
                    if camel != loop_var {
                        loop_context.insert(format!("{SCOPE_DECLARED_MARKER}{camel}"));
                    }
                }
            }
            let option_binding = emit_option_binding(&loop_expression.cond, entities)?;
            if let Some(binding) = &option_binding {
                begin_option_while(
                    out,
                    indent,
                    binding,
                    option_scrutinee_is_rereadable(&loop_expression.cond),
                );
            } else {
                write_indent(out, indent);
                writeln!(
                    out,
                    "while ({}) {{",
                    emit_expression(&loop_expression.cond, entities)?
                )
                .expect("writing to a String cannot fail");
            }
            emit_block(out, &loop_expression.body.stmts, &loop_context, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Loop(loop_expression), _) => {
            write_indent(out, indent);
            out.push_str("for (;;) {\n");
            emit_block(out, &loop_expression.body.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Match(match_expression), _) => {
            emit_match_statement(out, match_expression, entities, indent)?;
        }
        Stmt::Expr(Expr::Block(block), _) => {
            write_indent(out, indent);
            out.push_str("{\n");
            emit_block(out, &block.block.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Unsafe(unsafe_block), _) => {
            write_indent(out, indent);
            out.push_str("{\n");
            emit_block(out, &unsafe_block.block.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Break(break_expr), _) => {
            write_indent(out, indent);
            if let Some(value) = &break_expr.expr {
                writeln!(out, "return {};", emit_expression(value, entities)?)
                    .expect("writing to a String cannot fail");
            } else {
                out.push_str("break;\n");
            }
        }
        Stmt::Expr(Expr::Continue(_), _) => {
            write_indent(out, indent);
            out.push_str("continue;\n");
        }
        Stmt::Expr(Expr::Return(return_expression), _)
            if return_expression
                .expr
                .as_deref()
                .is_some_and(|v| matches!(v, Expr::Match(_))) =>
        {
            let Expr::Match(match_expr) = return_expression.expr.as_deref().unwrap() else {
                unreachable!()
            };
            emit_return_match_with_exits(out, match_expr, entities, indent)?;
        }
        // A returned value wrapping a `match` that exits from an arm (`return Some(match ...)`) binds
        // the match first in its own scope, then returns the value reading that binding.
        Stmt::Expr(Expr::Return(return_expression), semicolon)
            if let Some(value) = return_expression.expr.as_deref()
                && let Some((match_expr, rewritten)) = hoist_nested_exit_match(value) =>
        {
            write_indent(out, indent);
            out.push_str("{\n");
            write_indent(out, indent + 1);
            out.push_str("let hoistedMatchValue;\n");
            emit_match_statement_with_target(
                out,
                &match_expr,
                entities,
                indent + 1,
                "hoistedMatchValue",
            )?;
            let mut rewritten_return = return_expression.clone();
            rewritten_return.expr = Some(Box::new(rewritten));
            emit_statement(
                out,
                &Stmt::Expr(Expr::Return(rewritten_return), *semicolon),
                entities,
                indent + 1,
            )?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Return(return_expression), _)
            if return_expression
                .expr
                .as_ref()
                .is_some_and(|v| expression_contains_unconditional_try(v)) =>
        {
            let value = return_expression.expr.as_ref().unwrap();
            let try_context = emit_try_pre_extractions(out, value, entities, indent)?;
            write_indent(out, indent);
            let mut emitted = if entities.contains(RETURNS_U32_MARKER)
                && !expression_is_unsigned_result(value, entities)
            {
                let operand = emit_binary_operand(value, &try_context, 10, false)?;
                format!("{operand} >>> 0")
            } else {
                emit_expression(value, &try_context)?
            };
            if entities.contains(RETURNS_NULLABLE_MARKER) {
                emitted = nullable_option_value(value, emitted);
            }
            emitted = contract_typed_array_return_value(value, emitted, entities);
            let emitted = strip_value_position_parens(&emitted);
            let emitted = indent_continuation_lines(&emitted, indent);
            writeln!(out, "return {emitted};").expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::Return(return_expression), _)
            if entities.contains(FLIGHT_ERROR_RETURNS_MARKER)
                && let Some(Expr::Call(call)) = return_expression.expr.as_deref()
                && matches!(call.func.as_ref(), Expr::Path(path) if path.path.is_ident("Err"))
                && let [error] = call.args.iter().collect::<Vec<_>>()[..] =>
        {
            // `flight_error_return_positions_are_proven` admitted this `Err` as the async function's
            // own result: rejecting its promise is how TypeScript resolves it.
            write_indent(out, indent);
            writeln!(out, "throw {};", emit_expression(error, entities)?)
                .expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::Return(return_expression), _) => {
            write_indent(out, indent);
            if let Some(value) = &return_expression.expr {
                let returned = value.as_ref();
                let mut value = if expression_is_finished_entity_return(value, entities) {
                    format!("finishEntity({})", emit_expression(value, entities)?)
                } else if expression_is_path_call(value, "allocate_entity") {
                    let return_type = entities
                        .iter()
                        .find_map(|marker| marker.strip_prefix(RETURN_TYPE_MARKER))
                        .ok_or_else(|| {
                            compile_error("allocate_entity return needs an explicit Rust type")
                        })?;
                    entity_allocation(return_type, entities)?
                } else if let Some(array_type) =
                    unique_marker_suffix(entities, RETURNS_TYPED_ARRAY_MARKER)
                    && matches!(
                        peel_reference_and_paren(returned),
                        Expr::Array(_) | Expr::Repeat(_)
                    )
                {
                    typed_array_literal(peel_reference_and_paren(returned), &array_type, entities)?
                } else {
                    emit_expression(value, entities)?
                };
                if entities.contains(RETURNS_U32_MARKER)
                    && !expression_is_unsigned_result(returned, entities)
                {
                    value = if is_primary_expression_text(&value) {
                        format!("{value} >>> 0")
                    } else {
                        format!("({value}) >>> 0")
                    };
                }
                if entities.contains(RETURNS_NULLABLE_MARKER) {
                    value = nullable_option_value(returned, value);
                }
                value = contract_typed_array_return_value(returned, value, entities);
                let value = strip_value_position_parens(&value);
                let value = indent_continuation_lines(&value, indent);
                writeln!(out, "return {value};").expect("writing to a String cannot fail");
            } else {
                out.push_str("return;\n");
            }
        }
        Stmt::Expr(Expr::Call(call), _)
            if std_mem_function(&call.func, entities).as_deref() == Some("swap") =>
        {
            if call.args.len() != 2 {
                return Err(compile_error(
                    "std::mem::swap requires exactly two arguments",
                ));
            }
            // `[a, b] = [b, a]` reassigns what the two places name. That is the Rust swap only for
            // explicit `&mut` places whose writes the caller observes: a local binding, or a field or
            // index chain. A reference parameter, a reborrow through `*` or any other operand lowers
            // to a value the swap would only exchange locally, so it fails closed.
            if !call.args.iter().all(swap_operand_is_place) {
                return Err(compile_error(
                    "portable `std::mem::swap` has no portable lowering",
                ));
            }
            let a = emit_expression(&call.args[0], entities)?;
            let b = emit_expression(&call.args[1], entities)?;
            write_indent(out, indent);
            writeln!(out, "[{a}, {b}] = [{b}, {a}];").expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::Try(try_expr), _) => {
            let try_context = emit_try_pre_extractions(out, &try_expr.expr, entities, indent)?;
            let inner = emit_expression(&try_expr.expr, &try_context)?;
            write_indent(out, indent);
            writeln!(out, "if ({inner} === undefined) {{")
                .expect("writing to a String cannot fail");
            write_indent(out, indent + 1);
            writeln!(out, "return {};", option_return_absent_value(entities))
                .expect("writing to a String cannot fail");
            write_indent(out, indent);
            writeln!(out, "}}").expect("writing to a String cannot fail");
        }
        // `place = match ..` assigns the place in each arm instead of through a value IIFE. Only a
        // plain place whose generic assignment is `place = value` qualifies, so each arm emits exactly
        // what the IIFE returned, under the same right-hand context.
        Stmt::Expr(Expr::Assign(assign), _)
            if let Expr::Match(matched) = assign.right.as_ref()
                && match_assignment_distributes(assign, matched, entities)? =>
        {
            let right_context = contextual_assignment_field_context(assign, entities);
            let target = emit_expression(&assign.left, entities)?;
            let target = target.strip_suffix('!').unwrap_or(&target);
            emit_match_statement_with_target(out, matched, &right_context, indent, target)?;
        }
        Stmt::Expr(Expr::Assign(assign), _) if matches!(assign.right.as_ref(), Expr::Try(_)) => {
            let Expr::Try(try_expr) = assign.right.as_ref() else {
                unreachable!()
            };
            let try_context = emit_try_pre_extractions(out, &try_expr.expr, entities, indent)?;
            let inner = emit_expression(&try_expr.expr, &try_context)?;
            let target = emit_expression(&assign.left, &try_context)?;
            write_indent(out, indent);
            writeln!(out, "{target} = {inner};").expect("writing to a String cannot fail");
            write_indent(out, indent);
            writeln!(out, "if ({target} === undefined) {{")
                .expect("writing to a String cannot fail");
            write_indent(out, indent + 1);
            writeln!(out, "return {};", option_return_absent_value(entities))
                .expect("writing to a String cannot fail");
            write_indent(out, indent);
            writeln!(out, "}}").expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::Binary(binary), _)
            if binary_is_assignment(&binary.op)
                && emit_entry_or_default_assign(out, binary, entities, indent)? => {}
        Stmt::Expr(Expr::Binary(binary), _)
            if matches!(binary.op, BinOp::AddAssign(_))
                && matches!(binary.right.as_ref(), Expr::Lit(lit) if matches!(&lit.lit, syn::Lit::Int(i) if i.base10_digits() == "1")) =>
        {
            let target = emit_expression(&binary.left, entities)?;
            write_indent(out, indent);
            writeln!(out, "{target}++;").expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::Binary(binary), _)
            if matches!(binary.op, BinOp::SubAssign(_))
                && matches!(binary.right.as_ref(), Expr::Lit(lit) if matches!(&lit.lit, syn::Lit::Int(i) if i.base10_digits() == "1")) =>
        {
            let target = emit_expression(&binary.left, entities)?;
            write_indent(out, indent);
            writeln!(out, "{target}--;").expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if emit_entry_or_default_method(out, call, entities, indent)? => {}
        Stmt::Expr(Expr::Call(call), _)
            if expression_is_path(&call.func, "drop") && call.args.len() == 1 =>
        {
            if !expression_is_reusable(&call.args[0]) {
                let value = emit_expression(&call.args[0], entities)?;
                write_indent(out, indent);
                writeln!(out, "{value};").expect("writing to a String cannot fail");
            }
        }
        Stmt::Expr(expression, _) if expression_contains_unconditional_try(expression) => {
            let try_context = emit_try_pre_extractions(out, expression, entities, indent)?;
            let value =
                indent_continuation_lines(&emit_expression(expression, &try_context)?, indent);
            write_indent(out, indent);
            writeln!(out, "{value};").expect("writing to a String cannot fail");
        }
        Stmt::Expr(expression, _) => {
            let value = indent_continuation_lines(&emit_expression(expression, entities)?, indent);
            write_indent(out, indent);
            writeln!(out, "{value};").expect("writing to a String cannot fail");
        }
        Stmt::Item(syn::Item::Use(_)) => {}
        Stmt::Item(syn::Item::Const(item_const)) => {
            let name = emit_path_segment(&item_const.ident.to_string());
            let value = emit_expression(&item_const.expr, entities)?;
            write_indent(out, indent);
            writeln!(out, "const {name} = {value};").expect("writing to a String cannot fail");
        }
        Stmt::Item(syn::Item::Fn(item_fn)) => {
            emit_local_function(out, item_fn, entities, indent)?;
        }
        Stmt::Item(syn::Item::Static(item_static))
            if crate::model::once_lock_static_inner_type(item_static).is_some() =>
        {
            let inner = crate::model::once_lock_static_inner_type(item_static).unwrap();
            let name = emit_path_segment(&item_static.ident.to_string());
            let typescript_type = emit_type(inner, entities)?;
            write_indent(out, indent);
            writeln!(out, "let {name}: {typescript_type} | undefined;")
                .expect("writing to a String cannot fail");
        }
        Stmt::Item(_) => {
            return Err(compile_error(
                "unsupported item declaration inside function body",
            ));
        }
        Stmt::Macro(statement)
            if statement
                .mac
                .path
                .segments
                .last()
                .is_some_and(|name| name.ident == "unreachable") =>
        {
            write_indent(out, indent);
            writeln!(
                out,
                "throw new Error({});",
                emit_unreachable_message(&statement.mac, entities)?
            )
            .expect("writing to a String cannot fail");
        }
        Stmt::Macro(statement)
            if statement
                .mac
                .path
                .segments
                .last()
                .is_some_and(|name| name.ident == "panic") =>
        {
            write_indent(out, indent);
            writeln!(
                out,
                "throw new Error({});",
                emit_panic_message(&statement.mac, entities)?
            )
            .expect("writing to a String cannot fail");
        }
        Stmt::Macro(statement)
            if statement
                .mac
                .path
                .segments
                .last()
                .is_some_and(|name| name.ident == "assert" || name.ident == "debug_assert") =>
        {
            emit_assert_statement(out, &statement.mac, entities, indent)?;
        }
        Stmt::Macro(statement)
            if statement.mac.path.segments.last().is_some_and(|name| {
                name.ident == "assert_eq"
                    || name.ident == "assert_ne"
                    || name.ident == "debug_assert_eq"
                    || name.ident == "debug_assert_ne"
            }) =>
        {
            emit_assert_comparison_statement(out, &statement.mac, entities, indent)?;
        }
        Stmt::Macro(statement)
            if statement
                .mac
                .path
                .segments
                .last()
                .is_some_and(|name| name.ident == "todo") =>
        {
            write_indent(out, indent);
            writeln!(out, "throw new Error('not implemented');")
                .expect("writing to a String cannot fail");
        }
        Stmt::Macro(statement)
            if statement.mac.path.segments.last().is_some_and(|name| {
                name.ident == "println"
                    || name.ident == "eprintln"
                    || name.ident == "print"
                    || name.ident == "eprint"
            }) =>
        {
            let name = &statement.mac.path.segments.last().unwrap().ident;
            let console_method = if name == "eprintln" || name == "eprint" {
                "error"
            } else {
                "log"
            };
            let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
                .parse2(statement.mac.tokens.clone())
                .map_err(|error| {
                    compile_error(format!("failed to parse `{name}!` arguments: {error}"))
                })?;
            if arguments.is_empty() {
                write_indent(out, indent);
                writeln!(out, "console.{console_method}();")
                    .expect("writing to a String cannot fail");
            } else if let Some(Expr::Lit(template)) = arguments.first()
                && let Lit::Str(template) = &template.lit
            {
                let values = arguments.iter().skip(1).collect::<Vec<_>>();
                let formatted = emit_format_template(
                    &template.value(),
                    &values,
                    entities,
                    &format!("portable `{name}!`"),
                )?;
                write_indent(out, indent);
                writeln!(out, "console.{console_method}({formatted});")
                    .expect("writing to a String cannot fail");
            } else {
                let values = arguments
                    .iter()
                    .map(|value| emit_expression(value, entities))
                    .collect::<Result<Vec<_>, _>>()?;
                write_indent(out, indent);
                writeln!(out, "console.{console_method}({});", values.join(", "))
                    .expect("writing to a String cannot fail");
            }
        }
        Stmt::Macro(statement)
            if statement
                .mac
                .path
                .segments
                .last()
                .is_some_and(|name| name.ident == "dbg") =>
        {
            let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
                .parse2(statement.mac.tokens.clone())
                .map_err(|error| {
                    compile_error(format!("failed to parse `dbg!` arguments: {error}"))
                })?;
            let values = arguments
                .iter()
                .map(|value| emit_expression(value, entities))
                .collect::<Result<Vec<_>, _>>()?;
            write_indent(out, indent);
            writeln!(out, "console.log({});", values.join(", "))
                .expect("writing to a String cannot fail");
        }
        Stmt::Macro(_) => {
            return Err(compile_error(
                "unsupported macro statement inside function body",
            ));
        }
    }
    return Ok(());
}

// Whether `place = match ..` may assign `place` from each arm: the place is a plain variable or field
// chain whose generic assignment is a bare `=`, and no arm rebinds the place's root identifier, which
// would make the arm's `place` name a different value.
fn match_assignment_distributes(
    assign: &syn::ExprAssign,
    matched: &syn::ExprMatch,
    entities: &HashSet<String>,
) -> Result<bool, CompileError> {
    if !expression_is_plain_place(&assign.left)
        || matches!(assign.left.as_ref(), Expr::Reference(_))
        || expression_is_nullable_option_field(&assign.left, entities)
    {
        return Ok(false);
    }
    if let Expr::Field(field) = assign.left.as_ref()
        && entity_runtime_state_access(field, entities)?.is_some()
    {
        return Ok(false);
    }
    let Some(root) = place_root_identifier(&assign.left) else {
        return Ok(false);
    };
    struct Rebinds<'a> {
        root: &'a syn::Ident,
        found: bool,
    }
    impl<'ast> syn::visit::Visit<'ast> for Rebinds<'_> {
        fn visit_pat(&mut self, pattern: &'ast Pat) {
            if pattern_identifiers(pattern).contains(&self.root) {
                self.found = true;
            }
        }
    }
    let mut rebinds = Rebinds { root, found: false };
    for arm in &matched.arms {
        syn::visit::Visit::visit_arm(&mut rebinds, arm);
    }
    return Ok(!rebinds.found);
}

fn place_root_identifier(expression: &Expr) -> Option<&syn::Ident> {
    return match expression {
        Expr::Path(path) => path.path.get_ident(),
        Expr::Field(field) => place_root_identifier(&field.base),
        Expr::Paren(paren) => place_root_identifier(&paren.expr),
        Expr::Group(group) => place_root_identifier(&group.expr),
        _ => None,
    };
}

fn bind_tuple_if_let_operands(if_expression: &syn::ExprIf) -> Option<syn::ExprBlock> {
    let Expr::Let(binding) = if_expression.cond.as_ref() else {
        return None;
    };
    let (Pat::Tuple(_), Expr::Tuple(values)) = (binding.pat.as_ref(), binding.expr.as_ref()) else {
        return None;
    };
    if values.elems.iter().all(expression_is_reusable) {
        return None;
    }
    let whole = Expr::If(if_expression.clone());
    let mut locals: Vec<Stmt> = Vec::new();
    let mut rewritten = if_expression.clone();
    let Expr::Let(rewritten_binding) = rewritten.cond.as_mut() else {
        return None;
    };
    let Expr::Tuple(rewritten_values) = rewritten_binding.expr.as_mut() else {
        return None;
    };
    for (index, value) in rewritten_values.elems.iter_mut().enumerate() {
        if expression_is_reusable(value) {
            continue;
        }
        let name = format!("tuple_if_let_value_{index}");
        if expression_contains_identifier(&whole, &name) {
            return None;
        }
        let local: syn::Ident = syn::parse_str(&name).ok()?;
        let original = value.clone();
        locals.push(syn::parse_quote!(let #local = #original;));
        *value = syn::parse_quote!(#local);
    }
    locals.push(Stmt::Expr(Expr::If(rewritten), None));
    return Some(syn::parse_quote!({ #(#locals)* }));
}
