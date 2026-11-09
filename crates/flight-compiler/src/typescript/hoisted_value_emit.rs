use std::collections::{BTreeSet, HashSet};
use std::fmt::Write;

use syn::{Expr, Pat, Stmt, Type};

use crate::{CompileError, compile_error};

use super::{
    ERASED_CELL_WRITTEN_MARKER, RENAME_MARKER, RETURN_TYPE_MARKER, RETURNS_NULLABLE_MARKER,
    RuntimeCategory, SCOPE_DECLARED_MARKER, TupleOptionElement, analyze_data_union_match,
    analyze_general_compound_match, analyze_general_tuple_pattern,
    analyze_inferred_tagged_data_union_match, analyze_option_match,
    analyze_option_wrapped_inferred_data_union_match, analyze_tagged_data_union_match,
    analyze_tuple_option_match, block_contains_function_exits, close_binding_switch,
    data_union_pattern_test, emit_block, emit_block_with_context, emit_block_with_tail,
    emit_closure, emit_expression, emit_expression_for_type, emit_general_tuple_element_condition,
    emit_match_as_if_else_with_action, emit_match_patterns, emit_match_statement,
    emit_option_binding, emit_option_wrapped_data_union_match_body, emit_pattern, emit_statement,
    emit_try_pre_extractions, emit_type, expression_contains_identifier,
    expression_contains_unconditional_try, expression_is_path, expression_is_reusable,
    expression_string_union_owner, if_expression_contains_function_exits,
    indent_continuation_lines, is_js_identifier, join_closing_brace_with, js_string_literal,
    lexical_pattern_context, local_pattern_binding_id, local_pattern_name,
    lower_camel_from_upper_camel, next_try_rename, open_binding_switch, option_absent_value,
    option_scrutinee_is_rereadable, ordering_variant_value, pat_contains_range,
    pattern_identifiers, pattern_is_mutable, peel_reference_and_paren, provenance_pattern_bindings,
    referenced_path_identifier, reserved_key_data_union_predicate, resolve_rename,
    runtime_categories_predicate, scrutinee_elements, snake_to_lower_camel, split_let_chain,
    strip_value_position_parens, switch_arm_needs_block, switch_binding_name,
    tagged_data_union_bindings, tagged_data_union_predicate, write_indent,
};
pub(super) fn arm_body_unconditionally_exits(body: &Expr) -> bool {
    return match body {
        Expr::Return(_) | Expr::Break(_) | Expr::Continue(_) => true,
        Expr::Block(block) => block_last_unconditionally_exits(&block.block.stmts),
        Expr::Unsafe(unsafe_block) => block_last_unconditionally_exits(&unsafe_block.block.stmts),
        _ => false,
    };
}

pub(super) fn block_last_unconditionally_exits(stmts: &[Stmt]) -> bool {
    return match stmts.last() {
        Some(Stmt::Expr(expression, _)) => arm_body_unconditionally_exits(expression),
        _ => false,
    };
}

pub(super) fn match_arms_contain_loop_break(arms: &[syn::Arm]) -> bool {
    struct LoopBreakVisitor {
        found: bool,
        loop_depth: usize,
    }
    impl<'ast> syn::visit::Visit<'ast> for LoopBreakVisitor {
        fn visit_expr_break(&mut self, _node: &'ast syn::ExprBreak) {
            if self.loop_depth == 0 {
                self.found = true;
            }
        }
        fn visit_expr_continue(&mut self, _node: &'ast syn::ExprContinue) {
            if self.loop_depth == 0 {
                self.found = true;
            }
        }
        fn visit_expr_while(&mut self, node: &'ast syn::ExprWhile) {
            self.loop_depth += 1;
            syn::visit::visit_expr_while(self, node);
            self.loop_depth -= 1;
        }
        fn visit_expr_for_loop(&mut self, node: &'ast syn::ExprForLoop) {
            self.loop_depth += 1;
            syn::visit::visit_expr_for_loop(self, node);
            self.loop_depth -= 1;
        }
        fn visit_expr_loop(&mut self, node: &'ast syn::ExprLoop) {
            self.loop_depth += 1;
            syn::visit::visit_expr_loop(self, node);
            self.loop_depth -= 1;
        }
        fn visit_expr_closure(&mut self, _node: &'ast syn::ExprClosure) {}
    }
    let mut visitor = LoopBreakVisitor {
        found: false,
        loop_depth: 0,
    };
    for arm in arms {
        syn::visit::Visit::visit_expr(&mut visitor, &arm.body);
        if visitor.found {
            return true;
        }
    }
    return false;
}

pub(super) enum HoistedMatchAction<'a> {
    Assign(&'a str),
    Return,
}

pub(super) fn emit_hoisted_match_arm_value(
    out: &mut String,
    value_str: &str,
    action: &HoistedMatchAction<'_>,
    indent: usize,
) {
    write_indent(out, indent);
    let value_str = strip_value_position_parens(value_str);
    match action {
        HoistedMatchAction::Assign(target) => {
            writeln!(out, "{target} = {value_str};").expect("writing to a String cannot fail");
        }
        HoistedMatchAction::Return => {
            writeln!(out, "return {value_str};").expect("writing to a String cannot fail");
        }
    }
}

pub(super) fn emit_hoisted_match_arm_body(
    out: &mut String,
    body: &Expr,
    action: &HoistedMatchAction<'_>,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    if matches!(body, Expr::Return(_) | Expr::Continue(_) | Expr::Break(_)) {
        return emit_statement(out, &Stmt::Expr(body.clone(), None), entities, indent);
    }
    if let Expr::Block(block) = body {
        let Some((last, preceding)) = block.block.stmts.split_last() else {
            return Err(compile_error(
                "hoisted match-value arm block cannot be empty",
            ));
        };
        let arm_entities = if let HoistedMatchAction::Assign(target) = action {
            let mut ctx = entities.clone();
            for stmt in preceding {
                if let Stmt::Local(local) = stmt {
                    if let Some(name) = local_pattern_name(&local.pat) {
                        let js_name = snake_to_lower_camel(&name);
                        if js_name == *target {
                            ctx.insert(format!("{SCOPE_DECLARED_MARKER}{name}"));
                        }
                    }
                }
            }
            ctx
        } else {
            entities.clone()
        };
        let block_context = emit_block_with_context(out, preceding, &arm_entities, indent)?;
        if let Stmt::Expr(value, None) = last {
            if expression_contains_unconditional_try(value) {
                let try_context = emit_try_pre_extractions(out, value, &block_context, indent)?;
                let value_str = emit_expression(value, &try_context)?;
                emit_hoisted_match_arm_value(out, &value_str, action, indent);
            } else {
                let value_str = emit_expression(value, &block_context)?;
                emit_hoisted_match_arm_value(out, &value_str, action, indent);
            }
        } else {
            emit_statement(out, last, &block_context, indent)?;
        }
        return Ok(());
    }
    if expression_contains_unconditional_try(body) {
        let try_context = emit_try_pre_extractions(out, body, entities, indent)?;
        let value_str = emit_expression(body, &try_context)?;
        emit_hoisted_match_arm_value(out, &value_str, action, indent);
        return Ok(());
    }
    let value_str = emit_expression(body, entities)?;
    emit_hoisted_match_arm_value(out, &value_str, action, indent);
    return Ok(());
}

pub(super) fn emit_hoisted_match_value_local(
    out: &mut String,
    local: &syn::Local,
    match_expr: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
    _shadowed: bool,
    _rebound: bool,
) -> Result<(), CompileError> {
    let (pattern, rust_type) = match &local.pat {
        Pat::Ident(_) | Pat::Reference(_) | Pat::Tuple(_) => (emit_pattern(&local.pat)?, None),
        Pat::Type(typed) => {
            let pattern = emit_pattern(&typed.pat)?;
            (pattern, Some(typed.ty.as_ref()))
        }
        Pat::Wild(_) => ("_".to_string(), None),
        _ => {
            return Err(compile_error(
                "unsupported destructuring in hoisted match-value binding",
            ));
        }
    };
    let mutable = pattern_is_mutable(&local.pat)
        || local_pattern_binding_id(entities, &local.pat)
            .is_some_and(|id| entities.contains(&format!("{ERASED_CELL_WRITTEN_MARKER}{id}")));
    let type_annotation = rust_type.map(|ty| emit_type(ty, entities)).transpose()?;
    let string_union_type = match &type_annotation {
        None if mutable => {
            expression_string_union_owner(&Expr::Match(match_expr.clone()), entities)
                .and_then(|owner| syn::parse_str::<Type>(&owner).ok())
                .map(|owner| emit_type(&owner, entities))
                .transpose()?
        }
        _ => None,
    };
    let suffix = match type_annotation.as_ref().or(string_union_type.as_ref()) {
        Some(ts_type) => format!(": {ts_type}"),
        None => String::new(),
    };
    if let Pat::Tuple(tuple) = &local.pat {
        for element in &tuple.elems {
            if matches!(element, Pat::Wild(_)) {
                continue;
            }
            let name = emit_pattern(element)?;
            write_indent(out, indent);
            writeln!(out, "let {name};").expect("writing to a String cannot fail");
        }
    } else if let Pat::Type(typed) = &local.pat
        && let Pat::Tuple(tuple) = typed.pat.as_ref()
    {
        for element in &tuple.elems {
            if matches!(element, Pat::Wild(_)) {
                continue;
            }
            let name = emit_pattern(element)?;
            write_indent(out, indent);
            writeln!(out, "let {name};").expect("writing to a String cannot fail");
        }
    } else {
        write_indent(out, indent);
        writeln!(out, "let {pattern}{suffix};").expect("writing to a String cannot fail");
    }
    emit_match_statement_with_target(out, match_expr, entities, indent, &pattern)?;
    return Ok(());
}

pub(crate) fn emit_return_match_with_exits(
    out: &mut String,
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    return emit_match_statement_with_action(
        out,
        expression,
        entities,
        indent,
        &HoistedMatchAction::Return,
    );
}

pub(super) fn match_expression_scrutinee(
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
) -> Result<(String, Option<String>), CompileError> {
    let (context, try_preamble) = if expression_contains_unconditional_try(&expression.expr) {
        let mut preamble = String::new();
        let ctx = emit_try_pre_extractions(&mut preamble, &expression.expr, entities, 1)?;
        (
            ctx,
            if preamble.is_empty() {
                None
            } else {
                Some(preamble)
            },
        )
    } else {
        (entities.clone(), None)
    };
    let emitted = emit_expression(&expression.expr, &context)?;
    if try_preamble.is_none() && is_js_identifier(&emitted) {
        let collides = expression.arms.iter().any(|arm| {
            provenance_pattern_bindings(&arm.pat)
                .iter()
                .any(|rust_name| snake_to_lower_camel(rust_name) == emitted)
        });
        if !collides {
            return Ok((emitted, None));
        }
    }
    let mut declaration = try_preamble.unwrap_or_default();
    declaration.push_str(&format!("  const matchValue = {emitted};\n"));
    return Ok(("matchValue".to_string(), Some(declaration)));
}

pub(super) fn match_needs_scrutinee_temp(
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
) -> Result<bool, CompileError> {
    if expression_contains_unconditional_try(&expression.expr) {
        return Ok(true);
    }
    let emitted = emit_expression(&expression.expr, entities)?;
    if is_js_identifier(&emitted) {
        let collides = expression.arms.iter().any(|arm| {
            provenance_pattern_bindings(&arm.pat)
                .iter()
                .any(|rust_name| snake_to_lower_camel(rust_name) == emitted)
        });
        if !collides {
            return Ok(false);
        }
    }
    return Ok(true);
}

pub(super) fn emit_match_scrutinee(
    out: &mut String,
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<String, CompileError> {
    let context = if expression_contains_unconditional_try(&expression.expr) {
        emit_try_pre_extractions(out, &expression.expr, entities, indent)?
    } else {
        entities.clone()
    };
    let emitted = emit_expression(&expression.expr, &context)?;
    if is_js_identifier(&emitted) {
        let collides = expression.arms.iter().any(|arm| {
            provenance_pattern_bindings(&arm.pat)
                .iter()
                .any(|rust_name| snake_to_lower_camel(rust_name) == emitted)
        });
        if !collides {
            return Ok(emitted);
        }
    }
    write_indent(out, indent);
    writeln!(out, "const matchValue = {emitted};").expect("writing to a String cannot fail");
    return Ok("matchValue".to_string());
}

pub(super) fn emit_match_statement_with_target(
    out: &mut String,
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
    target: &str,
) -> Result<(), CompileError> {
    return emit_match_statement_with_action(
        out,
        expression,
        entities,
        indent,
        &HoistedMatchAction::Assign(target),
    );
}

pub(super) fn emit_match_statement_with_action(
    out: &mut String,
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
    action: &HoistedMatchAction<'_>,
) -> Result<(), CompileError> {
    if let Some(arms) = analyze_option_match(&expression.arms) {
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        let needs_block = has_guards || match_needs_scrutinee_temp(expression, entities)?;
        let inner = if needs_block { indent + 1 } else { indent };
        if needs_block {
            write_indent(out, indent);
            out.push_str("{\n");
        }
        let scrutinee = emit_match_scrutinee(out, expression, entities, inner)?;
        if has_guards {
            write_indent(out, inner);
            out.push_str("let $matched = false;\n");
        }
        let absent = option_absent_value(&expression.expr, entities);
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            let operator = if info.present { "!==" } else { "===" };
            if has_guards {
                write_indent(out, inner);
                writeln!(out, "if (!$matched && {scrutinee} {operator} {absent}) {{")
                    .expect("writing to a String cannot fail");
            } else if index == 0 {
                write_indent(out, inner);
                writeln!(out, "if ({scrutinee} {operator} {absent}) {{")
                    .expect("writing to a String cannot fail");
            } else if index == expression.arms.len() - 1 {
                join_closing_brace_with(out, "else {\n");
            } else {
                join_closing_brace_with(
                    out,
                    &format!("else if ({scrutinee} {operator} {absent}) {{\n"),
                );
            }
            let assign_target = match action {
                HoistedMatchAction::Assign(t) => Some(*t),
                HoistedMatchAction::Return => None,
            };
            let binding_renamed = if let Some(ref binding) = info.binding
                && assign_target == Some(binding.as_str())
            {
                let fresh = format!("${binding}");
                write_indent(out, inner + 1);
                writeln!(out, "const {fresh} = {scrutinee};")
                    .expect("writing to a String cannot fail");
                Some((binding.clone(), fresh))
            } else {
                if let Some(binding) = &info.binding {
                    write_indent(out, inner + 1);
                    writeln!(out, "const {binding} = {scrutinee};")
                        .expect("writing to a String cannot fail");
                }
                None
            };
            let mut arm_context = lexical_pattern_context(entities, &arm.pat);
            if let Some((ref original, ref fresh)) = binding_renamed {
                arm_context.insert(format!("{RENAME_MARKER}{original}={fresh}"));
            }
            let body_indent = if let Some((_, guard)) = &arm.guard {
                let guard_expr = emit_expression(guard, &arm_context)?;
                write_indent(out, inner + 1);
                writeln!(out, "if ({guard_expr}) {{").expect("writing to a String cannot fail");
                write_indent(out, inner + 2);
                out.push_str("$matched = true;\n");
                inner + 2
            } else {
                if has_guards {
                    write_indent(out, inner + 1);
                    out.push_str("$matched = true;\n");
                }
                inner + 1
            };
            emit_hoisted_match_arm_body(out, &arm.body, action, &arm_context, body_indent)?;
            if arm.guard.is_some() {
                write_indent(out, inner + 1);
                out.push_str("}\n");
            }
            write_indent(out, inner);
            out.push_str("}\n");
        }
        if needs_block {
            write_indent(out, indent);
            out.push_str("}\n");
        }
        return Ok(());
    }
    if let Some(arms) = analyze_tagged_data_union_match(&expression.arms, entities)? {
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        let needs_block = has_guards || match_needs_scrutinee_temp(expression, entities)?;
        let inner = if needs_block { indent + 1 } else { indent };
        if needs_block {
            write_indent(out, indent);
            out.push_str("{\n");
        }
        let scrutinee = emit_match_scrutinee(out, expression, entities, inner)?;
        if has_guards {
            write_indent(out, inner);
            out.push_str("let $matched = false;\n");
        }
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if info.otherwise {
                if has_guards {
                    write_indent(out, inner);
                    out.push_str("if (!$matched) {\n");
                } else if index == 0 {
                    write_indent(out, inner);
                    out.push_str("{\n");
                } else {
                    join_closing_brace_with(out, "else {\n");
                }
            } else {
                let predicate = tagged_data_union_predicate(&info.variants, &scrutinee);
                if has_guards {
                    write_indent(out, inner);
                    writeln!(out, "if (!$matched && {predicate}) {{")
                        .expect("writing to a String cannot fail");
                } else if index == 0 {
                    write_indent(out, inner);
                    writeln!(out, "if ({predicate}) {{").expect("writing to a String cannot fail");
                } else {
                    join_closing_brace_with(out, &format!("else if ({predicate}) {{\n"));
                }
            }
            if let Some(binding) = info.catch_all_binding {
                write_indent(out, inner + 1);
                writeln!(out, "const {binding} = {scrutinee};")
                    .expect("writing to a String cannot fail");
            }
            for (binding, value) in tagged_data_union_bindings(&info.variants, &scrutinee) {
                write_indent(out, inner + 1);
                writeln!(out, "const {binding} = {value};")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            let body_indent = if let Some((_, guard)) = &arm.guard {
                let guard_expr = emit_expression(guard, &arm_context)?;
                write_indent(out, inner + 1);
                writeln!(out, "if ({guard_expr}) {{").expect("writing to a String cannot fail");
                write_indent(out, inner + 2);
                out.push_str("$matched = true;\n");
                inner + 2
            } else {
                if has_guards {
                    write_indent(out, inner + 1);
                    out.push_str("$matched = true;\n");
                }
                inner + 1
            };
            emit_hoisted_match_arm_body(out, &arm.body, action, &arm_context, body_indent)?;
            if arm.guard.is_some() {
                write_indent(out, inner + 1);
                out.push_str("}\n");
            }
            write_indent(out, inner);
            out.push_str("}\n");
        }
        if needs_block {
            write_indent(out, indent);
            out.push_str("}\n");
        }
        return Ok(());
    }
    if let Some(arms) = analyze_data_union_match(&expression.arms, entities)? {
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        let needs_block = has_guards || match_needs_scrutinee_temp(expression, entities)?;
        let inner = if needs_block { indent + 1 } else { indent };
        if needs_block {
            write_indent(out, indent);
            out.push_str("{\n");
        }
        let scrutinee = emit_match_scrutinee(out, expression, entities, inner)?;
        if has_guards {
            write_indent(out, inner);
            out.push_str("let $matched = false;\n");
        }
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if info.catch_all {
                if has_guards {
                    write_indent(out, inner);
                    out.push_str("if (!$matched) {\n");
                } else if index == 0 {
                    write_indent(out, inner);
                    out.push_str("{\n");
                } else {
                    join_closing_brace_with(out, "else {\n");
                }
            } else {
                let predicate = if info.reserved_key_variants.is_empty() {
                    runtime_categories_predicate(&info.categories, &scrutinee)
                } else {
                    reserved_key_data_union_predicate(&info.reserved_key_variants, &scrutinee)
                };
                if has_guards {
                    write_indent(out, inner);
                    writeln!(out, "if (!$matched && {predicate}) {{")
                        .expect("writing to a String cannot fail");
                } else if index == 0 {
                    write_indent(out, inner);
                    writeln!(out, "if ({predicate}) {{").expect("writing to a String cannot fail");
                } else {
                    join_closing_brace_with(out, &format!("else if ({predicate}) {{\n"));
                }
            }
            if let Some(binding) = info.binding {
                write_indent(out, inner + 1);
                let value = info.binding_type.map_or_else(
                    || scrutinee.to_string(),
                    |rust_type| format!("{scrutinee} as {rust_type}"),
                );
                writeln!(out, "const {binding} = {value};")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            let body_indent = if let Some((_, guard)) = &arm.guard {
                let guard_expr = emit_expression(guard, &arm_context)?;
                write_indent(out, inner + 1);
                writeln!(out, "if ({guard_expr}) {{").expect("writing to a String cannot fail");
                write_indent(out, inner + 2);
                out.push_str("$matched = true;\n");
                inner + 2
            } else {
                if has_guards {
                    write_indent(out, inner + 1);
                    out.push_str("$matched = true;\n");
                }
                inner + 1
            };
            emit_hoisted_match_arm_body(out, &arm.body, action, &arm_context, body_indent)?;
            if arm.guard.is_some() {
                write_indent(out, inner + 1);
                out.push_str("}\n");
            }
            write_indent(out, inner);
            out.push_str("}\n");
        }
        if needs_block {
            write_indent(out, indent);
            out.push_str("}\n");
        }
        return Ok(());
    }
    if let Expr::Tuple(scrutinee) = expression.expr.as_ref() {
        if let Some(infos) = analyze_tuple_option_match(scrutinee, &expression.arms) {
            write_indent(out, indent);
            out.push_str("{\n");
            let mut temps = Vec::new();
            for (i, elem) in scrutinee.elems.iter().enumerate() {
                let value = emit_expression(elem, entities)?;
                let temp = format!("$m{i}");
                write_indent(out, indent + 1);
                writeln!(out, "const {temp} = {value};").expect("writing to a String cannot fail");
                temps.push(temp);
            }
            for (index, (arm, info)) in expression.arms.iter().zip(&infos).enumerate() {
                write_indent(out, indent + 1);
                if info.catch_all {
                    if index == 0 {
                        out.push_str("{\n");
                    } else {
                        out.push_str("else {\n");
                    }
                } else {
                    let mut conditions = Vec::new();
                    for (i, element) in info.elements.iter().enumerate() {
                        let absent = option_absent_value(&scrutinee.elems[i], entities);
                        match element {
                            TupleOptionElement::SomeBinding(_) | TupleOptionElement::SomeWild => {
                                conditions.push(format!("{} !== {absent}", temps[i]));
                            }
                            TupleOptionElement::None => {
                                conditions.push(format!("{} === {absent}", temps[i]));
                            }
                            TupleOptionElement::Wild => {}
                        }
                    }
                    let predicate = if conditions.is_empty() {
                        "true".to_string()
                    } else {
                        conditions.join(" && ")
                    };
                    let prefix = if index == 0 { "if" } else { "else if" };
                    writeln!(out, "{prefix} ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                }
                for (i, element) in info.elements.iter().enumerate() {
                    if let TupleOptionElement::SomeBinding(name) = element {
                        let binding = snake_to_lower_camel(name);
                        write_indent(out, indent + 2);
                        writeln!(out, "const {binding} = {};", temps[i])
                            .expect("writing to a String cannot fail");
                    }
                }
                let arm_context = lexical_pattern_context(entities, &arm.pat);
                let body_indent = indent + 2;
                emit_hoisted_match_arm_body(out, &arm.body, action, &arm_context, body_indent)?;
                write_indent(out, indent + 1);
                out.push_str("}\n");
            }
            write_indent(out, indent);
            out.push_str("}\n");
            return Ok(());
        }
    }
    if let Some(elems) = scrutinee_elements(&expression.expr)
        && let Some(arms_info) =
            analyze_general_compound_match(&expression.expr, &expression.arms, entities)
    {
        write_indent(out, indent);
        out.push_str("{\n");
        let mut temps = Vec::new();
        for (i, elem) in elems.iter().enumerate() {
            let value = emit_expression(elem, entities)?;
            let temp = format!("$m{i}");
            write_indent(out, indent + 1);
            writeln!(out, "const {temp} = {value};").expect("writing to a String cannot fail");
            temps.push(temp);
        }
        for (index, (arm, info)) in expression.arms.iter().zip(&arms_info).enumerate() {
            write_indent(out, indent + 1);
            if info.catch_all {
                if index == 0 {
                    out.push_str("{\n");
                } else {
                    out.push_str("else {\n");
                }
            } else {
                let mut alt_predicates = Vec::new();
                for alt in &info.alternatives {
                    let mut conditions = Vec::new();
                    for (i, element) in alt.elements.iter().enumerate() {
                        if let Some(cond) = emit_general_tuple_element_condition(element, &temps[i])
                        {
                            conditions.push(cond);
                        }
                    }
                    let alt_pred = if conditions.is_empty() {
                        "true".to_string()
                    } else {
                        conditions.join(" && ")
                    };
                    alt_predicates.push(alt_pred);
                }
                let predicate = if alt_predicates.len() == 1 {
                    alt_predicates.into_iter().next().unwrap()
                } else {
                    alt_predicates
                        .into_iter()
                        .map(|p| format!("({p})"))
                        .collect::<Vec<_>>()
                        .join(" || ")
                };
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(out, "{prefix} ({predicate}) {{")
                    .expect("writing to a String cannot fail");
            }
            {
                let mut binding_positions: Vec<(String, Vec<usize>)> = Vec::new();
                for alt in &info.alternatives {
                    for (i, element) in alt.elements.iter().enumerate() {
                        if let Some(binding) = &element.binding {
                            if let Some(entry) =
                                binding_positions.iter_mut().find(|(n, _)| n == binding)
                            {
                                if !entry.1.contains(&i) {
                                    entry.1.push(i);
                                }
                            } else {
                                binding_positions.push((binding.clone(), vec![i]));
                            }
                        }
                    }
                }
                for (binding, positions) in &binding_positions {
                    write_indent(out, indent + 2);
                    if positions.len() == 1 {
                        writeln!(out, "const {binding} = {};", temps[positions[0]])
                            .expect("writing to a String cannot fail");
                    } else {
                        let chain = positions
                            .iter()
                            .map(|p| temps[*p].as_str())
                            .collect::<Vec<_>>()
                            .join(" ?? ");
                        writeln!(out, "const {binding} = {chain};")
                            .expect("writing to a String cannot fail");
                    }
                }
                if let Some(alt) = info.alternatives.first() {
                    for (i, element) in alt.elements.iter().enumerate() {
                        for (binding_name, source_field) in &element.field_bindings {
                            write_indent(out, indent + 2);
                            writeln!(out, "const {binding_name} = {}.{source_field};", temps[i])
                                .expect("writing to a String cannot fail");
                        }
                    }
                }
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            let body_indent = indent + 2;
            emit_hoisted_match_arm_body(out, &arm.body, action, &arm_context, body_indent)?;
            write_indent(out, indent + 1);
            out.push_str("}\n");
        }
        write_indent(out, indent);
        out.push_str("}\n");
        return Ok(());
    }
    if let Some(inferred_arms) =
        analyze_inferred_tagged_data_union_match(&expression.arms, entities)
    {
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        write_indent(out, indent);
        out.push_str("{\n");
        let scrutinee = emit_match_scrutinee(out, expression, entities, indent + 1)?;
        if has_guards {
            write_indent(out, indent + 1);
            out.push_str("let $matched = false;\n");
        }
        for (index, (arm, info)) in expression.arms.iter().zip(inferred_arms).enumerate() {
            write_indent(out, indent + 1);
            if info.catch_all {
                if has_guards {
                    out.push_str("if (!$matched) {\n");
                } else if index == 0 {
                    out.push_str("{\n");
                } else {
                    out.push_str("else {\n");
                }
            } else {
                let predicate = info
                    .variants
                    .iter()
                    .map(|variant| {
                        format!(
                            "{scrutinee}.kind === {}",
                            js_string_literal(&lower_camel_from_upper_camel(variant))
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(" || ");
                if has_guards {
                    writeln!(out, "if (!$matched && ({predicate})) {{")
                        .expect("writing to a String cannot fail");
                } else {
                    let prefix = if index == 0 { "if" } else { "else if" };
                    writeln!(out, "{prefix} ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                }
            }
            if let Some(binding) = info.binding {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = {scrutinee};")
                    .expect("writing to a String cannot fail");
            }
            for (binding_name, source_field) in &info.field_bindings {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding_name} = {scrutinee}.{source_field};")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            let body_indent = if let Some((_, guard)) = &arm.guard {
                let guard_expr = emit_expression(guard, &arm_context)?;
                write_indent(out, indent + 2);
                writeln!(out, "if ({guard_expr}) {{").expect("writing to a String cannot fail");
                write_indent(out, indent + 3);
                out.push_str("$matched = true;\n");
                indent + 3
            } else {
                if has_guards {
                    write_indent(out, indent + 2);
                    out.push_str("$matched = true;\n");
                }
                indent + 2
            };
            emit_hoisted_match_arm_body(out, &arm.body, action, &arm_context, body_indent)?;
            if arm.guard.is_some() {
                write_indent(out, indent + 2);
                out.push_str("}\n");
            }
            write_indent(out, indent + 1);
            out.push_str("}\n");
        }
        write_indent(out, indent);
        out.push_str("}\n");
        return Ok(());
    }
    if let Some(option_du_arms) =
        analyze_option_wrapped_inferred_data_union_match(&expression.arms, entities)
    {
        emit_option_wrapped_data_union_match_body(
            out,
            expression,
            &option_du_arms,
            action,
            entities,
            indent,
        )?;
        return Ok(());
    }
    if match_arms_contain_loop_break(&expression.arms)
        || expression.arms.iter().any(|arm| arm.guard.is_some())
        || expression
            .arms
            .iter()
            .any(|arm| pat_contains_range(&arm.pat))
    {
        return emit_match_as_if_else_with_action(out, expression, entities, indent, action);
    }
    let switch_context = if expression_contains_unconditional_try(&expression.expr) {
        emit_try_pre_extractions(out, &expression.expr, entities, indent)?
    } else {
        entities.clone()
    };
    let (scrutinee, indent, scoped) =
        open_binding_switch(out, expression, &switch_context, indent)?;
    write_indent(out, indent);
    writeln!(out, "switch ({scrutinee}) {{").expect("writing to a String cannot fail");
    for arm in &expression.arms {
        for pattern in emit_match_patterns(&arm.pat, entities)? {
            write_indent(out, indent + 1);
            if pattern == "default" {
                out.push_str("default:\n");
            } else {
                writeln!(out, "case {pattern}:").expect("writing to a String cannot fail");
            }
        }
        let arm_context = lexical_pattern_context(entities, &arm.pat);
        let needs_block = switch_arm_needs_block(arm);
        let body_indent = if needs_block { indent + 3 } else { indent + 2 };
        if needs_block {
            write_indent(out, indent + 2);
            out.push_str("{\n");
        }
        if switch_binding_name(&arm.pat).is_some() {
            write_indent(out, body_indent);
            writeln!(out, "const {} = {scrutinee};", emit_pattern(&arm.pat)?)
                .expect("writing to a String cannot fail");
        }
        emit_hoisted_match_arm_body(out, &arm.body, action, &arm_context, body_indent)?;
        if matches!(action, HoistedMatchAction::Assign(_))
            && !arm_body_unconditionally_exits(&arm.body)
        {
            write_indent(out, body_indent);
            out.push_str("break;\n");
        }
        if needs_block {
            write_indent(out, indent + 2);
            out.push_str("}\n");
        }
    }
    write_indent(out, indent);
    out.push_str("}\n");
    close_binding_switch(out, indent, scoped);
    return Ok(());
}

pub(super) fn emit_hoisted_value_block_local(
    out: &mut String,
    local: &syn::Local,
    block: &syn::Block,
    entities: &HashSet<String>,
    indent: usize,
    shadowed: bool,
    rebound: bool,
) -> Result<Vec<(String, String)>, CompileError> {
    let Some((last, preceding)) = block.stmts.split_last() else {
        return Err(compile_error("hoisted value block cannot be empty"));
    };
    let Stmt::Expr(value, None) = last else {
        return Err(compile_error(
            "hoisted value block must end with an expression",
        ));
    };
    let target_js = local_pattern_name(&local.pat).map(|n| snake_to_lower_camel(&n));
    let mut block_entities = entities.clone();
    let tuple_target_js: Vec<String> = match &local.pat {
        Pat::Tuple(t) => t
            .elems
            .iter()
            .filter_map(|elem| match elem {
                Pat::Ident(ident) if ident.ident != "_" && ident.ident != "None" => {
                    Some(snake_to_lower_camel(&ident.ident.to_string()))
                }
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    };
    for stmt in preceding {
        if let Stmt::Local(inner) = stmt {
            if let Some(name) = local_pattern_name(&inner.pat) {
                let js_name = snake_to_lower_camel(&name);
                if target_js.as_deref() == Some(&js_name) || tuple_target_js.contains(&js_name) {
                    block_entities.insert(format!("{SCOPE_DECLARED_MARKER}{name}"));
                }
            }
        }
    }
    let block_context = emit_block_with_context(out, preceding, &block_entities, indent)?;
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
    if let Some(tuple) = tuple_pat {
        let mut hoisted_names: HashSet<String> = HashSet::new();
        for stmt in preceding {
            if let Stmt::Local(inner) = stmt {
                if let Some(name) = local_pattern_name(&inner.pat) {
                    let js_name = snake_to_lower_camel(&name);
                    hoisted_names.insert(resolve_rename(&block_context, &js_name));
                }
            }
        }
        let elem_js_names: Vec<Option<String>> = tuple
            .elems
            .iter()
            .map(|elem| match elem {
                Pat::Ident(ident) if ident.ident != "_" && ident.ident != "None" => {
                    Some(snake_to_lower_camel(&ident.ident.to_string()))
                }
                _ => None,
            })
            .collect();
        let any_collision = elem_js_names
            .iter()
            .any(|n| n.as_ref().is_some_and(|name| hoisted_names.contains(name)));
        let any_scope_declared = tuple.elems.iter().any(|elem| {
            if let Pat::Ident(ident) = elem {
                entities.contains(&format!("{SCOPE_DECLARED_MARKER}{}", ident.ident))
            } else {
                false
            }
        });
        if any_collision || any_scope_declared {
            let tail_elems: Vec<String> = if let Expr::Tuple(tail_tuple) = value {
                tail_tuple
                    .elems
                    .iter()
                    .map(|e| emit_expression(e, &block_context))
                    .collect::<Result<_, _>>()?
            } else {
                let value_str = emit_expression(value, &block_context)?;
                let temp = "__hvb";
                write_indent(out, indent);
                writeln!(out, "const {temp} = {value_str};")
                    .expect("writing to a String cannot fail");
                (0..tuple.elems.len())
                    .map(|i| format!("{temp}[{i}]"))
                    .collect()
            };
            let mut renames = Vec::new();
            for (i, _elem) in tuple.elems.iter().enumerate() {
                let Some(js_name) = &elem_js_names[i] else {
                    continue;
                };
                let elem_value = &tail_elems[i];
                let is_scope_declared = matches!(&tuple.elems[i], Pat::Ident(ident) if entities.contains(&format!("{SCOPE_DECLARED_MARKER}{}", ident.ident)));
                let collides_hoisted = hoisted_names.contains(js_name);
                if is_scope_declared && !collides_hoisted {
                    let fresh = next_try_rename(&block_context, js_name);
                    write_indent(out, indent);
                    writeln!(out, "const {fresh} = {elem_value};")
                        .expect("writing to a String cannot fail");
                    renames.push((js_name.clone(), fresh));
                } else if collides_hoisted {
                    if elem_value != js_name {
                        write_indent(out, indent);
                        writeln!(out, "{js_name} = {elem_value};")
                            .expect("writing to a String cannot fail");
                    }
                } else {
                    write_indent(out, indent);
                    writeln!(out, "const {js_name} = {elem_value};")
                        .expect("writing to a String cannot fail");
                }
            }
            return Ok(renames);
        }
    }
    let mutable = pattern_is_mutable(&local.pat);
    let (pattern, rust_type) = match &local.pat {
        Pat::Ident(_) | Pat::Reference(_) | Pat::Tuple(_) => (emit_pattern(&local.pat)?, None),
        Pat::Type(typed) => {
            let pattern = emit_pattern(&typed.pat)?;
            (pattern, Some(typed.ty.as_ref()))
        }
        Pat::Wild(_) => ("_".to_string(), None),
        _ => {
            return Err(compile_error(
                "unsupported destructuring in hoisted value block binding",
            ));
        }
    };
    let declaration = if shadowed || mutable || rebound {
        "let"
    } else {
        "const"
    };
    let value_str = if let Some(rust_type) = rust_type {
        emit_expression_for_type(value, rust_type, &block_context)?
    } else {
        emit_expression(value, &block_context)?
    };
    write_indent(out, indent);
    writeln!(out, "{declaration} {pattern} = {value_str};")
        .expect("writing to a String cannot fail");
    return Ok(vec![]);
}

// `let x = { ..; tail }` without function exits: declares `x` and assigns the tail inside a block
// that keeps the statements' own scope, instead of a value IIFE. Returns false, having written
// nothing, for a shape the IIFE must keep: a destructuring other than plain names, a name the block
// rebinds or the scope already declares, or a tail that needs `?` extraction.
pub(super) fn emit_scoped_value_block_local(
    out: &mut String,
    local: &syn::Local,
    block: &syn::Block,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<bool, CompileError> {
    let Some((Stmt::Expr(value, None), preceding)) = block.stmts.split_last() else {
        return Ok(false);
    };
    if preceding.is_empty() || expression_contains_unconditional_try(value) {
        return Ok(false);
    }
    let plain_name = |pattern: &Pat| -> Option<String> {
        let Pat::Ident(identifier) = pattern else {
            return None;
        };
        return (identifier.subpat.is_none() && identifier.by_ref.is_none())
            .then(|| identifier.ident.to_string());
    };
    let (names, rust_type) = match &local.pat {
        Pat::Tuple(tuple) => {
            let mut names = Vec::new();
            for element in &tuple.elems {
                if matches!(element, Pat::Wild(_)) {
                    continue;
                }
                let Some(name) = plain_name(element) else {
                    return Ok(false);
                };
                names.push(name);
            }
            (names, None)
        }
        Pat::Type(typed) => {
            let Some(name) = plain_name(&typed.pat) else {
                return Ok(false);
            };
            (vec![name], Some(typed.ty.as_ref()))
        }
        pattern => {
            let Some(name) = plain_name(pattern) else {
                return Ok(false);
            };
            (vec![name], None)
        }
    };
    if names.is_empty()
        || names
            .iter()
            .any(|name| entities.contains(&format!("{SCOPE_DECLARED_MARKER}{name}")))
        || preceding.iter().any(|statement| {
            matches!(statement, Stmt::Local(inner)
                if pattern_identifiers(&inner.pat)
                    .iter()
                    .any(|identifier| names.contains(&identifier.to_string())))
        })
    {
        return Ok(false);
    }
    let type_annotation = rust_type.map(|ty| emit_type(ty, entities)).transpose()?;
    let mut statements = String::new();
    let block_context = emit_block_with_context(&mut statements, preceding, entities, indent + 1)?;
    let value_str = match rust_type {
        Some(rust_type) => emit_expression_for_type(value, rust_type, &block_context)?,
        None => emit_expression(value, &block_context)?,
    };
    let value_str = strip_value_position_parens(&value_str);
    // Statements that lower to nothing (a lock read, an elided clone) leave only the value.
    if statements.is_empty() {
        let target = match &local.pat {
            Pat::Tuple(_) => emit_pattern(&local.pat)?,
            _ => snake_to_lower_camel(&names[0]),
        };
        write_indent(out, indent);
        match &type_annotation {
            Some(ts_type) => writeln!(out, "const {target}: {ts_type} = {value_str};"),
            None => writeln!(out, "const {target} = {value_str};"),
        }
        .expect("writing to a String cannot fail");
        return Ok(true);
    }
    let target = if let Pat::Tuple(_) = &local.pat {
        for name in &names {
            write_indent(out, indent);
            writeln!(out, "let {};", snake_to_lower_camel(name))
                .expect("writing to a String cannot fail");
        }
        emit_pattern(&local.pat)?
    } else {
        let target = snake_to_lower_camel(&names[0]);
        write_indent(out, indent);
        match &type_annotation {
            Some(ts_type) => writeln!(out, "let {target}: {ts_type};"),
            None => writeln!(out, "let {target};"),
        }
        .expect("writing to a String cannot fail");
        target
    };
    write_indent(out, indent);
    out.push_str("{\n");
    out.push_str(&statements);
    write_indent(out, indent + 1);
    writeln!(out, "{target} = {value_str};").expect("writing to a String cannot fail");
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(true);
}

pub(super) fn emit_hoisted_if_value_local(
    out: &mut String,
    local: &syn::Local,
    if_expr: &syn::ExprIf,
    entities: &HashSet<String>,
    indent: usize,
    _shadowed: bool,
    _rebound: bool,
) -> Result<(), CompileError> {
    let (pattern, _rust_type) = match &local.pat {
        Pat::Ident(_) | Pat::Reference(_) | Pat::Tuple(_) => (emit_pattern(&local.pat)?, None),
        Pat::Type(typed) => {
            let pattern = emit_pattern(&typed.pat)?;
            (pattern, Some(typed.ty.as_ref()))
        }
        Pat::Wild(_) => ("_".to_string(), None),
        _ => {
            return Err(compile_error(
                "unsupported destructuring in hoisted if-value binding",
            ));
        }
    };
    if let Pat::Tuple(tuple) = &local.pat {
        for element in &tuple.elems {
            if matches!(element, Pat::Wild(_)) {
                continue;
            }
            let name = emit_pattern(element)?;
            write_indent(out, indent);
            writeln!(out, "let {name};").expect("writing to a String cannot fail");
        }
    } else if let Pat::Type(typed) = &local.pat
        && let Pat::Tuple(tuple) = typed.pat.as_ref()
    {
        for element in &tuple.elems {
            if matches!(element, Pat::Wild(_)) {
                continue;
            }
            let name = emit_pattern(element)?;
            write_indent(out, indent);
            writeln!(out, "let {name};").expect("writing to a String cannot fail");
        }
    } else {
        write_indent(out, indent);
        writeln!(out, "let {pattern};").expect("writing to a String cannot fail");
    }
    emit_hoisted_if_value_branches(out, if_expr, &pattern, entities, indent)?;
    return Ok(());
}

pub(super) fn emit_hoisted_if_value_branch_block(
    out: &mut String,
    block: &syn::Block,
    target: &str,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let Some((last, preceding)) = block.stmts.split_last() else {
        return Err(compile_error("hoisted if-value branch cannot be empty"));
    };
    let mut branch_context = entities.clone();
    for stmt in preceding {
        if let Stmt::Local(local) = stmt {
            if let Some(name) = local_pattern_name(&local.pat) {
                let js_name = snake_to_lower_camel(&name);
                if js_name == target {
                    branch_context.insert(format!("{SCOPE_DECLARED_MARKER}{name}"));
                }
            }
        }
    }
    let block_context = emit_block_with_context(out, preceding, &branch_context, indent)?;
    if let Stmt::Expr(value, None) = last {
        if expression_contains_unconditional_try(value) {
            let try_context = emit_try_pre_extractions(out, value, &block_context, indent)?;
            let value_str = emit_expression(value, &try_context)?;
            write_indent(out, indent);
            writeln!(out, "{target} = {value_str};").expect("writing to a String cannot fail");
        } else {
            let value_str = emit_expression(value, &block_context)?;
            write_indent(out, indent);
            writeln!(out, "{target} = {value_str};").expect("writing to a String cannot fail");
        }
    } else {
        emit_statement(out, last, &block_context, indent)?;
    }
    return Ok(());
}

pub(super) fn emit_hoisted_if_value_branches(
    out: &mut String,
    if_expr: &syn::ExprIf,
    target: &str,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let condition = emit_expression(&if_expr.cond, entities)?;
    write_indent(out, indent);
    writeln!(out, "if ({condition}) {{").expect("writing to a String cannot fail");
    emit_hoisted_if_value_branch_block(out, &if_expr.then_branch, target, entities, indent + 1)?;
    write_indent(out, indent);
    if let Some((_, otherwise)) = &if_expr.else_branch {
        match otherwise.as_ref() {
            Expr::If(nested) => {
                out.push_str("} else ");
                emit_hoisted_if_value_branches(out, nested, target, entities, indent)?;
            }
            Expr::Block(block) => {
                out.push_str("} else {\n");
                emit_hoisted_if_value_branch_block(
                    out,
                    &block.block,
                    target,
                    entities,
                    indent + 1,
                )?;
                write_indent(out, indent);
                out.push_str("}\n");
            }
            _ => {
                out.push_str("} else {\n");
                write_indent(out, indent + 1);
                let value = emit_expression(otherwise, entities)?;
                writeln!(out, "{target} = {value};").expect("writing to a String cannot fail");
                write_indent(out, indent);
                out.push_str("}\n");
            }
        }
    } else {
        out.push_str("}\n");
    }
    return Ok(());
}

pub(super) fn emit_let_else_local(
    out: &mut String,
    local: &syn::Local,
    entities: &HashSet<String>,
    indent: usize,
    shadowed: bool,
    rebound: bool,
    emit_else_block: fn(&mut String, &[Stmt], &HashSet<String>, usize) -> Result<(), CompileError>,
) -> Result<Option<(String, String)>, CompileError> {
    let initializer = local
        .init
        .as_ref()
        .expect("let-else bindings always have an initializer");
    let (_, otherwise) = initializer
        .diverge
        .as_ref()
        .expect("let-else bindings always have a diverging branch");
    let Expr::Block(otherwise) = otherwise.as_ref() else {
        return Err(compile_error(
            "portable `let-else` divergence must use a block",
        ));
    };
    if let Pat::TupleStruct(pattern) = &local.pat
        && (pattern.path.is_ident("Some") || pattern.path.is_ident("Ok"))
        && pattern.elems.len() == 1
    {
        // TypeScript erases each `Option`/`Result` success wrapper to its payload, so nested
        // `Some`/`Ok` patterns test and bind the same single evaluated value. Keep the final
        // payload on the established tuple/data-union/identifier paths so their scope and
        // shadowing behavior stays identical to a single wrapper.
        let mut payload_pattern = &pattern.elems[0];
        let mut nested_wrapper = false;
        while let Pat::TupleStruct(wrapper) = payload_pattern
            && (wrapper.path.is_ident("Some") || wrapper.path.is_ident("Ok"))
            && wrapper.elems.len() == 1
        {
            nested_wrapper = true;
            payload_pattern = &wrapper.elems[0];
        }
        let absent_condition = |value: &str| {
            let absent = option_absent_value(&initializer.expr, entities);
            if nested_wrapper {
                let nested_absent = if absent == "undefined" {
                    "null"
                } else {
                    "undefined"
                };
                return format!("{value} === {absent} || {value} === {nested_absent}");
            }
            return format!("{value} === {absent}");
        };
        if let Pat::Tuple(tuple) = payload_pattern {
            let mut names = Vec::new();
            for elem in &tuple.elems {
                match elem {
                    Pat::Ident(ident) => {
                        names.push(snake_to_lower_camel(&ident.ident.to_string()));
                    }
                    Pat::Reference(reference) => {
                        if let Pat::Ident(ident) = reference.pat.as_ref() {
                            names.push(snake_to_lower_camel(&ident.ident.to_string()));
                        } else {
                            return Err(compile_error(
                                "portable `let Some((..))` tuple elements must be identifiers",
                            ));
                        }
                    }
                    Pat::Wild(_) => {
                        names.push("_".to_string());
                    }
                    _ => {
                        return Err(compile_error(
                            "portable `let Some((..))` tuple elements must be identifiers",
                        ));
                    }
                }
            }
            let value = emit_expression(&initializer.expr, entities)?;
            write_indent(out, indent);
            writeln!(out, "const $opt = {value};").expect("writing to a String cannot fail");
            write_indent(out, indent);
            writeln!(out, "if ({}) {{", absent_condition("$opt"))
                .expect("writing to a String cannot fail");
            emit_else_block(out, &otherwise.block.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
            write_indent(out, indent);
            writeln!(out, "const [{}] = $opt;", names.join(", "))
                .expect("writing to a String cannot fail");
            return Ok(None);
        }
        if let Pat::TupleStruct(_) | Pat::Struct(_) = payload_pattern {
            let value = emit_expression(&initializer.expr, entities)?;
            let temp = "$opt";
            write_indent(out, indent);
            writeln!(out, "const {temp} = {value};").expect("writing to a String cannot fail");
            write_indent(out, indent);
            writeln!(out, "if ({}) {{", absent_condition(temp))
                .expect("writing to a String cannot fail");
            emit_else_block(out, &otherwise.block.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
            if let Some(test) = data_union_pattern_test(payload_pattern, temp, entities)? {
                if let Some(predicate) = &test.predicate {
                    write_indent(out, indent);
                    writeln!(out, "if (!({predicate})) {{")
                        .expect("writing to a String cannot fail");
                    emit_else_block(out, &otherwise.block.stmts, entities, indent + 1)?;
                    write_indent(out, indent);
                    out.push_str("}\n");
                }
                for (binding, expression) in &test.bindings {
                    let name = snake_to_lower_camel(binding);
                    write_indent(out, indent);
                    writeln!(out, "const {name} = {expression};")
                        .expect("writing to a String cannot fail");
                }
                return Ok(None);
            }
            return Err(compile_error(
                "portable `let Some` binding needs an identifier, tuple, or data union variant",
            ));
        }
        let Pat::Ident(identifier) = payload_pattern else {
            return Err(compile_error(
                "portable `let Some` binding needs an identifier or tuple",
            ));
        };
        let rust_name = identifier.ident.to_string();
        let name = snake_to_lower_camel(&rust_name);
        let same_binding =
            referenced_path_identifier(&initializer.expr).as_deref() == Some(&rust_name);
        let scope_declared = entities.contains(&format!("{SCOPE_DECLARED_MARKER}{rust_name}"));
        if !same_binding {
            let value = emit_expression(&initializer.expr, entities)?;
            if scope_declared && !shadowed {
                let fresh = next_try_rename(entities, &name);
                let keyword = if identifier.mutability.is_some() || rebound {
                    "let"
                } else {
                    "const"
                };
                write_indent(out, indent);
                writeln!(out, "{keyword} {fresh} = {value};")
                    .expect("writing to a String cannot fail");
                write_indent(out, indent);
                writeln!(out, "if ({}) {{", absent_condition(&fresh))
                    .expect("writing to a String cannot fail");
                emit_else_block(out, &otherwise.block.stmts, entities, indent + 1)?;
                write_indent(out, indent);
                out.push_str("}\n");
                return Ok(Some((name, fresh)));
            }
            let rebind = shadowed || expression_contains_identifier(&initializer.expr, &rust_name);
            write_indent(out, indent);
            if rebind {
                write!(out, "{name}").expect("writing to a String cannot fail");
            } else {
                let declaration = if identifier.mutability.is_some() || rebound {
                    "let"
                } else {
                    "const"
                };
                write!(out, "{declaration} {name}").expect("writing to a String cannot fail");
            }
            writeln!(out, " = {value};").expect("writing to a String cannot fail");
        }
        write_indent(out, indent);
        writeln!(out, "if ({}) {{", absent_condition(&name))
            .expect("writing to a String cannot fail");
        emit_else_block(out, &otherwise.block.stmts, entities, indent + 1)?;
        write_indent(out, indent);
        out.push_str("}\n");
        return Ok(None);
    }
    if let Pat::TupleStruct(_) | Pat::Struct(_) = &local.pat {
        let value_expr = emit_expression(&initializer.expr, entities)?;
        let temp = format!("$letElse");
        if let Some(test) = data_union_pattern_test(&local.pat, &temp, entities)? {
            write_indent(out, indent);
            writeln!(out, "const {temp} = {value_expr};").expect("writing to a String cannot fail");
            let negated = match &test.predicate {
                Some(predicate) => format!("!({predicate})"),
                None => {
                    return Err(compile_error(
                        "portable `let-else` data union pattern cannot be a catch-all",
                    ));
                }
            };
            write_indent(out, indent);
            writeln!(out, "if ({negated}) {{").expect("writing to a String cannot fail");
            emit_else_block(out, &otherwise.block.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
            let mut rename_pair = None;
            for (binding, expression) in &test.bindings {
                let name = snake_to_lower_camel(binding);
                let scope_declared =
                    entities.contains(&format!("{SCOPE_DECLARED_MARKER}{binding}"));
                let binding_shadowed =
                    shadowed || expression_contains_identifier(&initializer.expr, binding);
                write_indent(out, indent);
                if scope_declared && !binding_shadowed {
                    let fresh = next_try_rename(entities, &name);
                    writeln!(out, "const {fresh} = {expression};")
                        .expect("writing to a String cannot fail");
                    if rename_pair.is_none() {
                        rename_pair = Some((name, fresh));
                    }
                } else if binding_shadowed {
                    writeln!(out, "{name} = {expression};")
                        .expect("writing to a String cannot fail");
                } else {
                    writeln!(out, "const {name} = {expression};")
                        .expect("writing to a String cannot fail");
                }
            }
            return Ok(rename_pair);
        }
    }
    if let Pat::Tuple(tuple) = &local.pat {
        let init_tuple = if let Expr::Tuple(t) = initializer.expr.as_ref() {
            if tuple.elems.len() != t.elems.len() {
                return Err(compile_error(
                    "portable `let-else` tuple pattern length must match initializer",
                ));
            }
            Some(t)
        } else {
            None
        };
        let opaque_base = if init_tuple.is_none() {
            let emitted = emit_expression(initializer.expr.as_ref(), entities)?;
            let temp = "__tup".to_string();
            write_indent(out, indent);
            writeln!(out, "const {temp} = {emitted};").expect("writing to a String cannot fail");
            Some(temp)
        } else {
            None
        };
        let mut temps = Vec::new();
        let mut names = Vec::new();
        let mut rebinds = Vec::new();
        let mut conditions = Vec::new();
        for (i, elem) in tuple.elems.iter().enumerate() {
            let value = if let Some(t) = &init_tuple {
                emit_expression(&t.elems[i], entities)?
            } else {
                format!("{}[{i}]", opaque_base.as_ref().unwrap())
            };
            let elem_expr: Option<&Expr> = init_tuple.map(|t| &t.elems[i]);
            let absent_for_elem = |entities: &HashSet<String>| -> &'static str {
                if let Some(expr) = elem_expr {
                    option_absent_value(expr, entities)
                } else {
                    "undefined"
                }
            };
            let elem_contains_ident = |name: &str| -> bool {
                if let Some(expr) = elem_expr {
                    expression_contains_identifier(expr, name)
                } else {
                    expression_contains_identifier(initializer.expr.as_ref(), name)
                }
            };
            match elem {
                Pat::TupleStruct(ts)
                    if (ts.path.is_ident("Some") || ts.path.is_ident("Ok"))
                        && ts.elems.len() == 1 =>
                {
                    let absent = absent_for_elem(entities);
                    match &ts.elems[0] {
                        Pat::Ident(ident) => {
                            let rust_name = ident.ident.to_string();
                            let base_name = snake_to_lower_camel(&rust_name);
                            let name = resolve_rename(entities, &base_name);
                            let is_rebind = shadowed
                                || elem_contains_ident(&rust_name)
                                || entities
                                    .contains(&format!("{SCOPE_DECLARED_MARKER}{rust_name}"));
                            let temp = format!("$t{i}");
                            write_indent(out, indent);
                            writeln!(out, "const {temp} = {value};")
                                .expect("writing to a String cannot fail");
                            conditions.push(format!("{temp} === {absent}"));
                            temps.push(Some(temp));
                            names.push(name);
                            rebinds.push(is_rebind);
                        }
                        Pat::Wild(_) => {
                            let temp = format!("$t{i}");
                            write_indent(out, indent);
                            writeln!(out, "const {temp} = {value};")
                                .expect("writing to a String cannot fail");
                            conditions.push(format!("{temp} === {absent}"));
                            temps.push(None);
                            names.push("_".to_string());
                            rebinds.push(false);
                        }
                        Pat::Reference(reference) => {
                            if let Pat::Ident(ident) = reference.pat.as_ref() {
                                let rust_name = ident.ident.to_string();
                                let base_name = snake_to_lower_camel(&rust_name);
                                let name = resolve_rename(entities, &base_name);
                                let is_rebind = shadowed
                                    || elem_contains_ident(&rust_name)
                                    || entities
                                        .contains(&format!("{SCOPE_DECLARED_MARKER}{rust_name}"));
                                let temp = format!("$t{i}");
                                write_indent(out, indent);
                                writeln!(out, "const {temp} = {value};")
                                    .expect("writing to a String cannot fail");
                                conditions.push(format!("{temp} === {absent}"));
                                temps.push(Some(temp));
                                names.push(name);
                                rebinds.push(is_rebind);
                            } else {
                                return Err(compile_error(
                                    "portable `let-else` tuple option element must bind an identifier or `_`",
                                ));
                            }
                        }
                        _ => {
                            return Err(compile_error(
                                "portable `let-else` tuple option element must bind an identifier or `_`",
                            ));
                        }
                    }
                }
                Pat::Wild(_) => {
                    temps.push(None);
                    names.push("_".to_string());
                    rebinds.push(false);
                }
                Pat::Path(path) if path.path.is_ident("None") => {
                    let absent = absent_for_elem(entities);
                    let temp = format!("$t{i}");
                    write_indent(out, indent);
                    writeln!(out, "const {temp} = {value};")
                        .expect("writing to a String cannot fail");
                    conditions.push(format!("{temp} !== {absent}"));
                    temps.push(None);
                    names.push("_".to_string());
                    rebinds.push(false);
                }
                Pat::Ident(ident) if ident.ident == "None" => {
                    let absent = absent_for_elem(entities);
                    let temp = format!("$t{i}");
                    write_indent(out, indent);
                    writeln!(out, "const {temp} = {value};")
                        .expect("writing to a String cannot fail");
                    conditions.push(format!("{temp} !== {absent}"));
                    temps.push(None);
                    names.push("_".to_string());
                    rebinds.push(false);
                }
                Pat::Ident(ident) => {
                    let rust_name = ident.ident.to_string();
                    let base_name = snake_to_lower_camel(&rust_name);
                    let name = resolve_rename(entities, &base_name);
                    let is_rebind = shadowed
                        || elem_contains_ident(&rust_name)
                        || entities.contains(&format!("{SCOPE_DECLARED_MARKER}{rust_name}"));
                    if is_rebind {
                        write_indent(out, indent);
                        writeln!(out, "{name} = {value};")
                            .expect("writing to a String cannot fail");
                    } else {
                        write_indent(out, indent);
                        writeln!(out, "const {name} = {value};")
                            .expect("writing to a String cannot fail");
                    }
                    temps.push(None);
                    names.push(name);
                    rebinds.push(is_rebind);
                }
                _ => {
                    return Err(compile_error(
                        "portable `let-else` tuple element must be `Some(name)`, an identifier, or `_`",
                    ));
                }
            }
        }
        if conditions.is_empty() {
            return Err(compile_error(
                "portable `let-else` tuple needs at least one testable pattern",
            ));
        }
        write_indent(out, indent);
        writeln!(out, "if ({}) {{", conditions.join(" || "))
            .expect("writing to a String cannot fail");
        emit_else_block(out, &otherwise.block.stmts, entities, indent + 1)?;
        write_indent(out, indent);
        out.push_str("}\n");
        for (i, name) in names.iter().enumerate() {
            if name == "_" {
                continue;
            }
            if let Some(temp) = &temps[i] {
                write_indent(out, indent);
                if rebinds[i] {
                    writeln!(out, "{name} = {temp};").expect("writing to a String cannot fail");
                } else {
                    writeln!(out, "const {name} = {temp};")
                        .expect("writing to a String cannot fail");
                }
            }
        }
        return Ok(None);
    }
    return Err(compile_error(
        "portable `let-else` supports only a `Some(name)` or tuple pattern",
    ));
}

// `Ordering` lowers to a signed number, which a `switch` cannot match exhaustively; callers compare
// against a variant with `==`, which lowers to a sign comparison.
pub(super) fn emit_switch_scrutinee(
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    fn is_ordering_pattern(pattern: &Pat) -> bool {
        return match pattern {
            Pat::Or(or_pattern) => or_pattern.cases.iter().any(is_ordering_pattern),
            Pat::Paren(paren) => is_ordering_pattern(&paren.pat),
            Pat::Path(path) => ordering_variant_value(&path.path).is_some(),
            _ => false,
        };
    }

    if expression
        .arms
        .iter()
        .any(|arm| is_ordering_pattern(&arm.pat))
    {
        return Err(compile_error(
            "portable `match` cannot match `Ordering` variants; compare with `==` instead",
        ));
    }
    return emit_expression(&expression.expr, entities);
}
