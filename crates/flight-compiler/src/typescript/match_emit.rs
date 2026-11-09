use std::collections::HashSet;
use std::fmt::Write;

use syn::{Expr, Lit, Pat, Stmt, UnOp};

use crate::{CompileError, compile_error};

use super::{
    HoistedMatchAction, TupleOptionElement, analyze_data_union_match,
    analyze_general_compound_match, analyze_inferred_tagged_data_union_match, analyze_option_match,
    analyze_option_wrapped_inferred_data_union_match, analyze_tagged_data_union_match,
    analyze_tuple_option_match, arm_body_unconditionally_exits, emit_block, emit_expression,
    emit_general_tuple_element_condition, emit_hoisted_match_arm_body, emit_literal,
    emit_match_scrutinee, emit_path_segment, emit_pattern, emit_statement, emit_switch_scrutinee,
    emit_try_pre_extractions, expression_contains_unconditional_try, expression_is_plain_place,
    js_string_literal, lexical_pattern_context, lower_camel_from_upper_camel,
    match_arms_contain_loop_break, match_expression_scrutinee, option_absent_value,
    reject_function_exits_in_value_position, reserved_key_data_union_predicate,
    runtime_categories_predicate, scrutinee_elements, snake_to_lower_camel,
    tagged_data_union_bindings, tagged_data_union_predicate, write_indent,
};

pub(super) fn emit_match_expression(
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    reject_function_exits_in_value_position(
        |visitor| {
            for arm in &expression.arms {
                visitor.visit_arm(arm);
            }
        },
        "portable `match` used as a value",
    )?;
    if let Some(arms) = analyze_option_match(&expression.arms) {
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        let (scrutinee, declaration) = match_expression_scrutinee(expression, entities)?;
        let mut out = String::new();
        out.push_str("(() => {\n");
        if let Some(decl) = declaration {
            out.push_str(&decl);
        }
        let absent = option_absent_value(&expression.expr, entities);
        let last = expression.arms.len() - 1;
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            let operator = if info.present { "!==" } else { "===" };
            if !has_guards && index > 0 && index == last {
                out.push_str("  else {\n");
            } else if has_guards {
                writeln!(out, "  if ({scrutinee} {operator} {absent}) {{")
                    .expect("writing to a String cannot fail");
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(out, "  {prefix} ({scrutinee} {operator} {absent}) {{")
                    .expect("writing to a String cannot fail");
            }
            if let Some(binding) = info.binding {
                writeln!(out, "    const {binding} = {scrutinee};")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            if let Some((_, guard)) = &arm.guard {
                let guard_expr = emit_expression(guard, &arm_context)?;
                writeln!(out, "    if ({guard_expr}) {{").expect("writing to a String cannot fail");
                writeln!(
                    out,
                    "      return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
                out.push_str("    }\n");
            } else {
                writeln!(
                    out,
                    "    return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
            }
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    if let Some(arms) = analyze_tagged_data_union_match(&expression.arms, entities)? {
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        let (scrutinee, declaration) = match_expression_scrutinee(expression, entities)?;
        let mut out = String::new();
        out.push_str("(() => {\n");
        if let Some(decl) = declaration {
            out.push_str(&decl);
        }
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if info.otherwise {
                if has_guards {
                    out.push_str("  {\n");
                } else if index == 0 {
                    out.push_str("  {\n");
                } else {
                    out.push_str("  else {\n");
                }
            } else {
                let predicate = tagged_data_union_predicate(&info.variants, &scrutinee);
                if has_guards {
                    writeln!(out, "  if ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                } else {
                    let prefix = if index == 0 { "if" } else { "else if" };
                    writeln!(out, "  {prefix} ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                }
            }
            if let Some(binding) = info.catch_all_binding {
                writeln!(out, "    const {binding} = {scrutinee};")
                    .expect("writing to a String cannot fail");
            }
            for (binding, value) in tagged_data_union_bindings(&info.variants, &scrutinee) {
                writeln!(out, "    const {binding} = {value};")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            if let Some((_, guard)) = &arm.guard {
                let guard_expr = emit_expression(guard, &arm_context)?;
                writeln!(out, "    if ({guard_expr}) {{").expect("writing to a String cannot fail");
                writeln!(
                    out,
                    "      return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
                out.push_str("    }\n");
            } else {
                writeln!(
                    out,
                    "    return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
            }
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    if let Some(arms) = analyze_data_union_match(&expression.arms, entities)? {
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        let (scrutinee, declaration) = match_expression_scrutinee(expression, entities)?;
        let mut out = String::new();
        out.push_str("(() => {\n");
        if let Some(decl) = declaration {
            out.push_str(&decl);
        }
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if info.catch_all {
                if has_guards {
                    out.push_str("  {\n");
                } else if index == 0 {
                    out.push_str("  {\n");
                } else {
                    out.push_str("  else {\n");
                }
            } else {
                let predicate = if info.reserved_key_variants.is_empty() {
                    runtime_categories_predicate(&info.categories, &scrutinee)
                } else {
                    reserved_key_data_union_predicate(&info.reserved_key_variants, &scrutinee)
                };
                if has_guards {
                    writeln!(out, "  if ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                } else {
                    let prefix = if index == 0 { "if" } else { "else if" };
                    writeln!(out, "  {prefix} ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                }
            }
            if let Some(binding) = info.binding {
                let value = info.binding_type.map_or_else(
                    || scrutinee.clone(),
                    |rust_type| format!("{scrutinee} as {rust_type}"),
                );
                writeln!(out, "    const {binding} = {value};")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            if let Some((_, guard)) = &arm.guard {
                let guard_expr = emit_expression(guard, &arm_context)?;
                writeln!(out, "    if ({guard_expr}) {{").expect("writing to a String cannot fail");
                writeln!(
                    out,
                    "      return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
                out.push_str("    }\n");
            } else {
                writeln!(
                    out,
                    "    return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
            }
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    if let Expr::Tuple(scrutinee) = expression.expr.as_ref() {
        if let Some(infos) = analyze_tuple_option_match(scrutinee, &expression.arms) {
            let mut out = String::new();
            out.push_str("(() => {\n");
            let mut temps = Vec::new();
            for (i, elem) in scrutinee.elems.iter().enumerate() {
                let value = emit_expression(elem, entities)?;
                let temp = format!("$m{i}");
                writeln!(out, "  const {temp} = {value};")
                    .expect("writing to a String cannot fail");
                temps.push(temp);
            }
            let last = expression.arms.len() - 1;
            for (index, (arm, info)) in expression.arms.iter().zip(&infos).enumerate() {
                if info.catch_all {
                    if index == 0 {
                        out.push_str("  {\n");
                    } else {
                        out.push_str("  else {\n");
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
                    if index == 0 {
                        writeln!(out, "  if ({predicate}) {{")
                            .expect("writing to a String cannot fail");
                    } else if !info.catch_all
                        && index == last
                        && infos[..index].iter().all(|i| !i.catch_all)
                    {
                        out.push_str("  else {\n");
                    } else {
                        writeln!(out, "  else if ({predicate}) {{")
                            .expect("writing to a String cannot fail");
                    }
                }
                for (i, element) in info.elements.iter().enumerate() {
                    if let TupleOptionElement::SomeBinding(name) = element {
                        let binding = snake_to_lower_camel(name);
                        writeln!(out, "    const {binding} = {};", temps[i])
                            .expect("writing to a String cannot fail");
                    }
                }
                let arm_context = lexical_pattern_context(entities, &arm.pat);
                if let Some((_, guard)) = &arm.guard {
                    let guard_expr = emit_expression(guard, &arm_context)?;
                    writeln!(out, "    if ({guard_expr}) {{")
                        .expect("writing to a String cannot fail");
                    writeln!(
                        out,
                        "      return {};",
                        emit_expression(&arm.body, &arm_context)?
                    )
                    .expect("writing to a String cannot fail");
                    out.push_str("    }\n");
                } else {
                    writeln!(
                        out,
                        "    return {};",
                        emit_expression(&arm.body, &arm_context)?
                    )
                    .expect("writing to a String cannot fail");
                }
                out.push_str("  }\n");
            }
            out.push_str("})()");
            return Ok(out);
        }
    }
    if let Some(elems) = scrutinee_elements(&expression.expr)
        && let Some(arms_info) =
            analyze_general_compound_match(&expression.expr, &expression.arms, entities)
    {
        let mut out = String::new();
        out.push_str("(() => {\n");
        let mut temps = Vec::new();
        for (i, elem) in elems.iter().enumerate() {
            let value = emit_expression(elem, entities)?;
            let temp = format!("$m{i}");
            writeln!(out, "  const {temp} = {value};").expect("writing to a String cannot fail");
            temps.push(temp);
        }
        for (index, (arm, info)) in expression.arms.iter().zip(&arms_info).enumerate() {
            if info.catch_all {
                if index == 0 {
                    out.push_str("  {\n");
                } else {
                    out.push_str("  else {\n");
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
                writeln!(out, "  {prefix} ({predicate}) {{")
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
                    if positions.len() == 1 {
                        writeln!(out, "    const {binding} = {};", temps[positions[0]])
                            .expect("writing to a String cannot fail");
                    } else {
                        let chain = positions
                            .iter()
                            .map(|p| temps[*p].as_str())
                            .collect::<Vec<_>>()
                            .join(" ?? ");
                        writeln!(out, "    const {binding} = {chain};")
                            .expect("writing to a String cannot fail");
                    }
                }
                if let Some(alt) = info.alternatives.first() {
                    for (i, element) in alt.elements.iter().enumerate() {
                        for (binding_name, source_field) in &element.field_bindings {
                            writeln!(
                                out,
                                "    const {binding_name} = {}.{source_field};",
                                temps[i]
                            )
                            .expect("writing to a String cannot fail");
                        }
                    }
                }
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            writeln!(
                out,
                "    return {};",
                emit_expression(&arm.body, &arm_context)?
            )
            .expect("writing to a String cannot fail");
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    if let Some(inferred_arms) =
        analyze_inferred_tagged_data_union_match(&expression.arms, entities)
    {
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        let (scrutinee, declaration) = match_expression_scrutinee(expression, entities)?;
        let mut out = String::new();
        out.push_str("(() => {\n");
        if let Some(decl) = declaration {
            out.push_str(&decl);
        }
        for (index, (arm, info)) in expression.arms.iter().zip(inferred_arms).enumerate() {
            if info.catch_all {
                if has_guards {
                    out.push_str("  {\n");
                } else if index == 0 {
                    out.push_str("  {\n");
                } else {
                    out.push_str("  else {\n");
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
                    writeln!(out, "  if ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                } else {
                    let prefix = if index == 0 { "if" } else { "else if" };
                    writeln!(out, "  {prefix} ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                }
            }
            if let Some(binding) = info.binding {
                writeln!(out, "    const {binding} = {scrutinee};")
                    .expect("writing to a String cannot fail");
            }
            for (binding_name, source_field) in &info.field_bindings {
                writeln!(
                    out,
                    "    const {binding_name} = {scrutinee}.{source_field};"
                )
                .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            if let Some((_, guard)) = &arm.guard {
                let guard_expr = emit_expression(guard, &arm_context)?;
                writeln!(out, "    if ({guard_expr}) {{").expect("writing to a String cannot fail");
                writeln!(
                    out,
                    "      return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
                out.push_str("    }\n");
            } else {
                writeln!(
                    out,
                    "    return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
            }
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    if let Some(option_du_arms) =
        analyze_option_wrapped_inferred_data_union_match(&expression.arms, entities)
    {
        let absent = option_absent_value(&expression.expr, entities);
        let (scrutinee, declaration) = match_expression_scrutinee(expression, entities)?;
        let mut out = String::new();
        out.push_str("(() => {\n");
        if let Some(decl) = declaration {
            out.push_str(&decl);
        }
        let last = expression.arms.len() - 1;
        for (index, (arm, info)) in expression.arms.iter().zip(&option_du_arms).enumerate() {
            if info.none_arm && info.variants.is_empty() {
                if index > 0 && index == last {
                    out.push_str("  else {\n");
                } else {
                    let prefix = if index == 0 { "if" } else { "else if" };
                    writeln!(out, "  {prefix} ({scrutinee} === {absent}) {{")
                        .expect("writing to a String cannot fail");
                }
            } else if info.none_arm && !info.variants.is_empty() {
                let kind_predicate = info
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
                let predicate = if info.variants.len() == 1 {
                    format!(
                        "{scrutinee} === {absent} || {scrutinee} !== {absent} && {kind_predicate}"
                    )
                } else {
                    format!(
                        "{scrutinee} === {absent} || {scrutinee} !== {absent} && ({kind_predicate})"
                    )
                };
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(out, "  {prefix} ({predicate}) {{")
                    .expect("writing to a String cannot fail");
            } else if !info.variants.is_empty() {
                let kind_predicate = info
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
                let predicate = if info.variants.len() == 1 {
                    format!("{scrutinee} !== {absent} && {kind_predicate}")
                } else {
                    format!("{scrutinee} !== {absent} && ({kind_predicate})")
                };
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(out, "  {prefix} ({predicate}) {{")
                    .expect("writing to a String cannot fail");
            } else {
                if index == 0 {
                    out.push_str("  {\n");
                } else {
                    out.push_str("  else {\n");
                }
            }
            if let Some(binding) = &info.binding {
                writeln!(out, "    const {binding} = {scrutinee};")
                    .expect("writing to a String cannot fail");
            }
            for (binding_name, source_field) in &info.field_bindings {
                writeln!(
                    out,
                    "    const {binding_name} = {scrutinee}.{source_field};"
                )
                .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            if let Some((_, guard)) = &arm.guard {
                let guard_expr = emit_expression(guard, &arm_context)?;
                writeln!(out, "    if ({guard_expr}) {{").expect("writing to a String cannot fail");
                writeln!(
                    out,
                    "      return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
                out.push_str("    }\n");
            } else {
                writeln!(
                    out,
                    "    return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
            }
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
    if has_guards {
        let (scrutinee, declaration) = match_expression_scrutinee(expression, entities)?;
        let mut out = String::new();
        out.push_str("(() => {\n");
        if let Some(decl) = declaration {
            out.push_str(&decl);
        }
        out.push_str("  let $matched = false;\n");
        for arm in &expression.arms {
            let patterns = emit_match_patterns(&arm.pat, entities)?;
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            let is_default = (patterns.len() == 1 && patterns[0] == "default")
                || is_match_binding_pattern(&arm.pat);
            if is_default {
                out.push_str("  if (!$matched) {\n");
            } else {
                let conditions: Vec<String> = patterns
                    .iter()
                    .map(|p| format!("{scrutinee} === {p}"))
                    .collect();
                writeln!(out, "  if (!$matched && ({})) {{", conditions.join(" || "))
                    .expect("writing to a String cannot fail");
            }
            if is_match_binding_pattern(&arm.pat) {
                if let Some(binding) = match_binding_name(&arm.pat) {
                    writeln!(out, "    const {binding} = {scrutinee};")
                        .expect("writing to a String cannot fail");
                }
            }
            if let Some((_, guard)) = &arm.guard {
                let guard_expr = emit_expression(guard, &arm_context)?;
                writeln!(out, "    if ({guard_expr}) {{").expect("writing to a String cannot fail");
                out.push_str("      $matched = true;\n");
                writeln!(
                    out,
                    "      return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
                out.push_str("    }\n");
            } else {
                out.push_str("    $matched = true;\n");
                writeln!(
                    out,
                    "    return {};",
                    emit_expression(&arm.body, &arm_context)?
                )
                .expect("writing to a String cannot fail");
            }
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    let (scrutinee, declaration) = match_expression_scrutinee(expression, entities)?;
    if declaration.is_none()
        && let Some(chain) = emit_match_as_conditional_chain(expression, &scrutinee, entities)?
    {
        return Ok(chain);
    }
    let mut out = String::new();
    out.push_str("(() => {\n");
    if let Some(decl) = declaration {
        out.push_str(&decl);
    }
    writeln!(out, "  switch ({scrutinee}) {{").expect("writing to a String cannot fail");
    for arm in &expression.arms {
        let patterns = emit_match_patterns(&arm.pat, entities)?;
        for pattern in patterns {
            if pattern == "default" {
                out.push_str("    default:\n");
            } else {
                writeln!(out, "    case {pattern}:").expect("writing to a String cannot fail");
            }
        }
        let arm_context = lexical_pattern_context(entities, &arm.pat);
        let value = emit_expression(&arm.body, &arm_context)?;
        if switch_binding_name(&arm.pat).is_some() {
            writeln!(
                out,
                "      {{\n        const {} = {scrutinee};\n        return {value};\n      }}",
                emit_pattern(&arm.pat)?
            )
            .expect("writing to a String cannot fail");
        } else {
            writeln!(out, "      return {value};").expect("writing to a String cannot fail");
        }
    }
    out.push_str("  }\n})()");
    return Ok(out);
}

// A scalar `switch` match in value position whose arms bind nothing and are plain values lowers to
// a conditional chain over the (already single-evaluation) scrutinee: each arm but the last tests its
// case labels with `===`, as the `switch` would, and Rust's exhaustiveness makes the last arm the
// remaining case. Returns `None` for an arm that needs a scope (a binding or a statement block).
fn emit_match_as_conditional_chain(
    expression: &syn::ExprMatch,
    scrutinee: &str,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    let last = expression.arms.len().checked_sub(1);
    let mut conditions = Vec::new();
    let mut values = Vec::new();
    for (index, arm) in expression.arms.iter().enumerate() {
        if arm.guard.is_some() || switch_binding_name(&arm.pat).is_some() {
            return Ok(None);
        }
        if let Expr::Block(block) = arm.body.as_ref()
            && !matches!(block.block.stmts.as_slice(), [Stmt::Expr(_, None)])
        {
            return Ok(None);
        }
        let patterns = emit_match_patterns(&arm.pat, entities)?;
        let is_default = patterns.iter().any(|pattern| pattern == "default");
        if Some(index) == last {
            conditions.push(None);
        } else if is_default {
            return Ok(None);
        } else {
            conditions.push(Some(
                patterns
                    .iter()
                    .map(|pattern| format!("{scrutinee} === {pattern}"))
                    .collect::<Vec<_>>()
                    .join(" || "),
            ));
        }
        let arm_context = lexical_pattern_context(entities, &arm.pat);
        values.push(emit_expression(&arm.body, &arm_context)?);
    }
    if values.len() < 2 {
        return Ok(None);
    }
    let mut chain = String::new();
    for (condition, value) in conditions.iter().zip(&values) {
        // A single token (a name, member read, literal or call without spaces) binds tighter than
        // `?:`; anything else keeps its own parentheses inside the chain.
        let value = if value.contains(char::is_whitespace)
            || value.starts_with('{')
            || value.contains("=>")
        {
            format!("({value})")
        } else {
            value.clone()
        };
        match condition {
            Some(condition) => write!(chain, "{condition} ? {value} : "),
            None => write!(chain, "{value}"),
        }
        .expect("writing to a String cannot fail");
    }
    return Ok(Some(format!("({chain})")));
}

pub(crate) fn emit_match_statement(
    out: &mut String,
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    if let Some(arms) = analyze_option_match(&expression.arms) {
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        write_indent(out, indent);
        out.push_str("{\n");
        let scrutinee = emit_match_scrutinee(out, expression, entities, indent + 1)?;
        if has_guards {
            write_indent(out, indent + 1);
            out.push_str("let $matched = false;\n");
        }
        let absent = option_absent_value(&expression.expr, entities);
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            write_indent(out, indent + 1);
            let operator = if info.present { "!==" } else { "===" };
            if has_guards {
                writeln!(out, "if (!$matched && {scrutinee} {operator} {absent}) {{")
                    .expect("writing to a String cannot fail");
            } else if index > 0 && index == expression.arms.len() - 1 {
                out.push_str("else {\n");
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(out, "{prefix} ({scrutinee} {operator} {absent}) {{")
                    .expect("writing to a String cannot fail");
            }
            if let Some(binding) = info.binding {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = {scrutinee};")
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
            match arm.body.as_ref() {
                Expr::Block(block) => {
                    emit_block(out, &block.block.stmts, &arm_context, body_indent)?
                }
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    &arm_context,
                    body_indent,
                )?,
            }
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
    if let Some(arms) = analyze_tagged_data_union_match(&expression.arms, entities)? {
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        write_indent(out, indent);
        out.push_str("{\n");
        let scrutinee = emit_match_scrutinee(out, expression, entities, indent + 1)?;
        if has_guards {
            write_indent(out, indent + 1);
            out.push_str("let $matched = false;\n");
        }
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            write_indent(out, indent + 1);
            if info.otherwise {
                if has_guards {
                    out.push_str("if (!$matched) {\n");
                } else if index == 0 {
                    out.push_str("{\n");
                } else {
                    out.push_str("else {\n");
                }
            } else {
                let predicate = tagged_data_union_predicate(&info.variants, &scrutinee);
                if has_guards {
                    writeln!(out, "if (!$matched && {predicate}) {{")
                        .expect("writing to a String cannot fail");
                } else {
                    let prefix = if index == 0 { "if" } else { "else if" };
                    writeln!(out, "{prefix} ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                }
            }
            if let Some(binding) = info.catch_all_binding {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = {scrutinee};")
                    .expect("writing to a String cannot fail");
            }
            for (binding, value) in tagged_data_union_bindings(&info.variants, &scrutinee) {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = {value};")
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
            match arm.body.as_ref() {
                Expr::Block(block) => {
                    emit_block(out, &block.block.stmts, &arm_context, body_indent)?
                }
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    &arm_context,
                    body_indent,
                )?,
            }
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
    if let Some(arms) = analyze_data_union_match(&expression.arms, entities)? {
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        write_indent(out, indent);
        out.push_str("{\n");
        let scrutinee = emit_match_scrutinee(out, expression, entities, indent + 1)?;
        if has_guards {
            write_indent(out, indent + 1);
            out.push_str("let $matched = false;\n");
        }
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
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
                let predicate = if info.reserved_key_variants.is_empty() {
                    runtime_categories_predicate(&info.categories, &scrutinee)
                } else {
                    reserved_key_data_union_predicate(&info.reserved_key_variants, &scrutinee)
                };
                if has_guards {
                    writeln!(out, "if (!$matched && {predicate}) {{")
                        .expect("writing to a String cannot fail");
                } else {
                    let prefix = if index == 0 { "if" } else { "else if" };
                    writeln!(out, "{prefix} ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                }
            }
            if let Some(binding) = info.binding {
                write_indent(out, indent + 2);
                let value = info.binding_type.map_or_else(
                    || scrutinee.clone(),
                    |rust_type| format!("{scrutinee} as {rust_type}"),
                );
                writeln!(out, "const {binding} = {value};")
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
            match arm.body.as_ref() {
                Expr::Block(block) => {
                    emit_block(out, &block.block.stmts, &arm_context, body_indent)?
                }
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    &arm_context,
                    body_indent,
                )?,
            }
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
            match arm.body.as_ref() {
                Expr::Block(block) => {
                    emit_block(out, &block.block.stmts, &arm_context, body_indent)?
                }
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    &arm_context,
                    body_indent,
                )?,
            }
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
                match arm.body.as_ref() {
                    Expr::Block(block) => {
                        emit_block(out, &block.block.stmts, &arm_context, body_indent)?
                    }
                    expression => emit_statement(
                        out,
                        &Stmt::Expr(expression.clone(), None),
                        &arm_context,
                        body_indent,
                    )?,
                }
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
            match arm.body.as_ref() {
                Expr::Block(block) => {
                    emit_block(out, &block.block.stmts, &arm_context, body_indent)?
                }
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    &arm_context,
                    body_indent,
                )?,
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
        let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
        let absent = option_absent_value(&expression.expr, entities);
        write_indent(out, indent);
        out.push_str("{\n");
        write_indent(out, indent + 1);
        writeln!(
            out,
            "const matchValue = {};",
            emit_expression(&expression.expr, entities)?
        )
        .expect("writing to a String cannot fail");
        if has_guards {
            write_indent(out, indent + 1);
            out.push_str("let $matched = false;\n");
        }
        for (index, (arm, info)) in expression.arms.iter().zip(&option_du_arms).enumerate() {
            write_indent(out, indent + 1);
            if info.none_arm && info.variants.is_empty() {
                let predicate = format!("matchValue === {absent}");
                if has_guards {
                    writeln!(out, "if (!$matched && {predicate}) {{")
                        .expect("writing to a String cannot fail");
                } else {
                    let prefix = if index == 0 { "if" } else { "else if" };
                    writeln!(out, "{prefix} ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                }
            } else if info.none_arm && !info.variants.is_empty() {
                let kind_predicate = info
                    .variants
                    .iter()
                    .map(|variant| {
                        format!(
                            "matchValue.kind === {}",
                            js_string_literal(&lower_camel_from_upper_camel(variant))
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(" || ");
                let predicate = if info.variants.len() == 1 {
                    format!(
                        "matchValue === {absent} || matchValue !== {absent} && {kind_predicate}"
                    )
                } else {
                    format!(
                        "matchValue === {absent} || matchValue !== {absent} && ({kind_predicate})"
                    )
                };
                if has_guards {
                    writeln!(out, "if (!$matched && ({predicate})) {{")
                        .expect("writing to a String cannot fail");
                } else {
                    let prefix = if index == 0 { "if" } else { "else if" };
                    writeln!(out, "{prefix} ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                }
            } else if !info.variants.is_empty() {
                let kind_predicate = info
                    .variants
                    .iter()
                    .map(|variant| {
                        format!(
                            "matchValue.kind === {}",
                            js_string_literal(&lower_camel_from_upper_camel(variant))
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(" || ");
                let predicate = if info.variants.len() == 1 {
                    format!("matchValue !== {absent} && {kind_predicate}")
                } else {
                    format!("matchValue !== {absent} && ({kind_predicate})")
                };
                if has_guards {
                    writeln!(out, "if (!$matched && {predicate}) {{")
                        .expect("writing to a String cannot fail");
                } else {
                    let prefix = if index == 0 { "if" } else { "else if" };
                    writeln!(out, "{prefix} ({predicate}) {{")
                        .expect("writing to a String cannot fail");
                }
            } else {
                if has_guards {
                    out.push_str("if (!$matched) {\n");
                } else if index == 0 {
                    out.push_str("{\n");
                } else {
                    out.push_str("else {\n");
                }
            }
            if let Some(binding) = &info.binding {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = matchValue;")
                    .expect("writing to a String cannot fail");
            }
            for (binding_name, source_field) in &info.field_bindings {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding_name} = matchValue.{source_field};")
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
            match arm.body.as_ref() {
                Expr::Block(block) => {
                    emit_block(out, &block.block.stmts, &arm_context, body_indent)?
                }
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    &arm_context,
                    body_indent,
                )?,
            }
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
    if match_arms_contain_loop_break(&expression.arms)
        || expression.arms.iter().any(|arm| arm.guard.is_some())
    {
        return emit_match_as_if_else(out, expression, entities, indent);
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
        if let Some((_, guard)) = &arm.guard {
            let guard_expr = emit_expression(guard, &arm_context)?;
            write_indent(out, body_indent);
            writeln!(out, "if ({guard_expr}) {{").expect("writing to a String cannot fail");
            match arm.body.as_ref() {
                Expr::Block(block) => {
                    emit_block(out, &block.block.stmts, &arm_context, body_indent + 1)?
                }
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    &arm_context,
                    body_indent + 1,
                )?,
            }
            if !arm_body_unconditionally_exits(&arm.body) {
                write_indent(out, body_indent + 1);
                out.push_str("break;\n");
            }
            write_indent(out, body_indent);
            out.push_str("}\n");
        } else {
            match arm.body.as_ref() {
                Expr::Block(block) => {
                    emit_block(out, &block.block.stmts, &arm_context, body_indent)?
                }
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    &arm_context,
                    body_indent,
                )?,
            }
            if !arm_body_unconditionally_exits(&arm.body) {
                write_indent(out, body_indent);
                out.push_str("break;\n");
            }
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

// A match arm whose whole pattern is a binding (`other => ..`): it matches any value and binds it,
// so it lowers to `default:` with `const other = <scrutinee>;`. Rust reads a bare identifier pattern
// as a constant, unit struct or variant when one of that name is in scope; by Rust's naming lints
// those are SCREAMING_CASE or UpperCamelCase, so an identifier that starts lowercase (or with `_`) is
// a binding. `_` alone is the wildcard, and `name @ subpattern` binds only within its subpattern.
pub(super) fn switch_arm_needs_block(arm: &syn::Arm) -> bool {
    if switch_binding_name(&arm.pat).is_some() {
        return true;
    }
    if let Expr::Block(block) = &*arm.body {
        for stmt in &block.block.stmts {
            if matches!(stmt, Stmt::Local(_)) {
                return true;
            }
        }
    }
    return expression_contains_unconditional_try(&arm.body);
}

pub(super) fn switch_binding_name(pattern: &Pat) -> Option<String> {
    let Pat::Ident(identifier) = pattern else {
        return None;
    };
    let name = identifier.ident.to_string();
    let first = name.chars().next()?;
    return (identifier.subpat.is_none()
        && identifier.by_ref.is_none()
        && name != "_"
        && (first.is_lowercase() || first == '_'))
        .then_some(name);
}

// Opens a scalar `switch` whose arms may bind the matched value. The bound value must be the value
// that was switched on, evaluated once: a variable or field is read again in place, but anything
// else (a call, an `.await`) is first stored in `$matchValue`, inside its own block so two matches
// in one scope cannot collide. Returns the switched expression, the indent to emit the switch at,
// and whether a block was opened for `close_binding_switch`.
pub(super) fn open_binding_switch(
    out: &mut String,
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(String, usize, bool), CompileError> {
    let scrutinee = emit_switch_scrutinee(expression, entities)?;
    let binds = expression
        .arms
        .iter()
        .any(|arm| switch_binding_name(&arm.pat).is_some());
    if !binds || expression_is_plain_place(&expression.expr) {
        return Ok((scrutinee, indent, false));
    }
    write_indent(out, indent);
    out.push_str("{\n");
    write_indent(out, indent + 1);
    writeln!(out, "const $matchValue = {scrutinee};").expect("writing to a String cannot fail");
    return Ok(("$matchValue".to_string(), indent + 1, true));
}

pub(super) fn close_binding_switch(out: &mut String, indent: usize, scoped: bool) {
    if scoped {
        write_indent(out, indent - 1);
        out.push_str("}\n");
    }
}

pub(super) fn emit_match_patterns(
    pattern: &Pat,
    entities: &HashSet<String>,
) -> Result<Vec<String>, CompileError> {
    return match pattern {
        Pat::Lit(literal) => Ok(vec![emit_literal(&literal.lit)?]),
        Pat::Or(or_pattern) => {
            let mut patterns = Vec::new();
            for pattern in &or_pattern.cases {
                patterns.extend(emit_match_patterns(pattern, entities)?);
            }
            Ok(patterns)
        }
        Pat::Path(path) => Ok(vec![emit_expression(
            &Expr::Path(syn::ExprPath {
                attrs: Vec::new(),
                qself: path.qself.clone(),
                path: path.path.clone(),
            }),
            entities,
        )?]),
        Pat::Range(range) => {
            let start = range.start.as_ref().and_then(|expr| match expr.as_ref() {
                Expr::Lit(syn::ExprLit {
                    lit: Lit::Int(int), ..
                }) => int.base10_parse::<i64>().ok(),
                Expr::Lit(syn::ExprLit {
                    lit: Lit::Byte(byte),
                    ..
                }) => Some(byte.value() as i64),
                Expr::Unary(unary)
                    if matches!(unary.op, UnOp::Neg(_))
                        && matches!(
                            unary.expr.as_ref(),
                            Expr::Lit(syn::ExprLit {
                                lit: Lit::Int(_),
                                ..
                            })
                        ) =>
                {
                    if let Expr::Lit(syn::ExprLit {
                        lit: Lit::Int(int), ..
                    }) = unary.expr.as_ref()
                    {
                        int.base10_parse::<i64>().ok().map(|v| -v)
                    } else {
                        None
                    }
                }
                _ => None,
            });
            let end = range.end.as_ref().and_then(|expr| match expr.as_ref() {
                Expr::Lit(syn::ExprLit {
                    lit: Lit::Int(int), ..
                }) => int.base10_parse::<i64>().ok(),
                Expr::Lit(syn::ExprLit {
                    lit: Lit::Byte(byte),
                    ..
                }) => Some(byte.value() as i64),
                Expr::Unary(unary)
                    if matches!(unary.op, UnOp::Neg(_))
                        && matches!(
                            unary.expr.as_ref(),
                            Expr::Lit(syn::ExprLit {
                                lit: Lit::Int(_),
                                ..
                            })
                        ) =>
                {
                    if let Expr::Lit(syn::ExprLit {
                        lit: Lit::Int(int), ..
                    }) = unary.expr.as_ref()
                    {
                        int.base10_parse::<i64>().ok().map(|v| -v)
                    } else {
                        None
                    }
                }
                _ => None,
            });
            let (Some(start), Some(end)) = (start, end) else {
                return Err(compile_error("unsupported portable Rust match pattern"));
            };
            let inclusive_end = if matches!(range.limits, syn::RangeLimits::Closed(_)) {
                end
            } else {
                end - 1
            };
            let count = inclusive_end - start + 1;
            if count < 1 || count > 256 {
                return Err(compile_error("unsupported portable Rust match pattern"));
            }
            Ok((start..=inclusive_end).map(|v| v.to_string()).collect())
        }
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            let name = identifier.ident.to_string();
            if name == "_" || switch_binding_name(pattern).is_some() {
                Ok(vec!["default".to_string()])
            } else {
                Ok(vec![emit_path_segment(&name)])
            }
        }
        Pat::TupleStruct(ts)
            if (ts.path.is_ident("Some") || ts.path.is_ident("Ok")) && ts.elems.len() == 1 =>
        {
            emit_match_patterns(&ts.elems[0], entities)
        }
        Pat::TupleStruct(ts) if ts.path.is_ident("Err") && ts.elems.len() == 1 => {
            Ok(vec!["default".to_string()])
        }
        Pat::Paren(paren) => emit_match_patterns(&paren.pat, entities),
        Pat::Reference(reference) => emit_match_patterns(&reference.pat, entities),
        Pat::Wild(_) => Ok(vec!["default".to_string()]),
        _ => Err(compile_error("unsupported portable Rust match pattern")),
    };
}

pub(super) fn is_match_binding_pattern(pattern: &Pat) -> bool {
    match pattern {
        Pat::Ident(identifier) => identifier.ident != "_" && identifier.subpat.is_none(),
        Pat::Reference(reference) => is_match_binding_pattern(&reference.pat),
        _ => false,
    }
}

pub(super) fn emit_match_as_if_else(
    out: &mut String,
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
    write_indent(out, indent);
    out.push_str("{\n");
    let scrutinee = emit_match_scrutinee(out, expression, entities, indent + 1)?;
    if has_guards {
        write_indent(out, indent + 1);
        out.push_str("let $matched = false;\n");
    }
    let mut first = true;
    for arm in &expression.arms {
        let patterns = emit_match_patterns(&arm.pat, entities)?;
        let arm_context = lexical_pattern_context(entities, &arm.pat);
        let is_default =
            (patterns.len() == 1 && patterns[0] == "default") || is_match_binding_pattern(&arm.pat);
        write_indent(out, indent + 1);
        if has_guards {
            if is_default {
                out.push_str("if (!$matched) {\n");
            } else {
                let conditions: Vec<String> = patterns
                    .iter()
                    .map(|p| format!("{scrutinee} === {p}"))
                    .collect();
                writeln!(out, "if (!$matched && ({})) {{", conditions.join(" || "))
                    .expect("writing to a String cannot fail");
            }
        } else if is_default {
            if first {
                out.push_str("{\n");
            } else {
                out.push_str("else {\n");
            }
        } else {
            let conditions: Vec<String> = patterns
                .iter()
                .map(|p| format!("{scrutinee} === {p}"))
                .collect();
            let prefix = if first { "if" } else { "else if" };
            writeln!(out, "{prefix} ({}) {{", conditions.join(" || "))
                .expect("writing to a String cannot fail");
        }
        first = false;
        if is_match_binding_pattern(&arm.pat) {
            if let Some(binding) = match_binding_name(&arm.pat) {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = {scrutinee};")
                    .expect("writing to a String cannot fail");
            }
        }
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
        match arm.body.as_ref() {
            Expr::Block(block) => emit_block(out, &block.block.stmts, &arm_context, body_indent)?,
            expression => emit_statement(
                out,
                &Stmt::Expr(expression.clone(), None),
                &arm_context,
                body_indent,
            )?,
        }
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

pub(super) fn match_binding_name(pattern: &Pat) -> Option<String> {
    return match pattern {
        Pat::Ident(identifier) if identifier.ident != "_" && identifier.subpat.is_none() => {
            Some(snake_to_lower_camel(&identifier.ident.to_string()))
        }
        Pat::Reference(reference) => match_binding_name(&reference.pat),
        _ => None,
    };
}

pub(super) fn emit_match_as_if_else_with_action(
    out: &mut String,
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
    action: &HoistedMatchAction<'_>,
) -> Result<(), CompileError> {
    let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
    write_indent(out, indent);
    out.push_str("{\n");
    let scrutinee = emit_match_scrutinee(out, expression, entities, indent + 1)?;
    if has_guards {
        write_indent(out, indent + 1);
        out.push_str("let $matched = false;\n");
    }
    let mut first = true;
    for arm in &expression.arms {
        let patterns = emit_match_patterns(&arm.pat, entities)?;
        let arm_context = lexical_pattern_context(entities, &arm.pat);
        let is_default =
            (patterns.len() == 1 && patterns[0] == "default") || is_match_binding_pattern(&arm.pat);
        write_indent(out, indent + 1);
        if has_guards {
            if is_default {
                out.push_str("if (!$matched) {\n");
            } else {
                let conditions: Vec<String> = patterns
                    .iter()
                    .map(|p| format!("{scrutinee} === {p}"))
                    .collect();
                writeln!(out, "if (!$matched && ({})) {{", conditions.join(" || "))
                    .expect("writing to a String cannot fail");
            }
        } else if is_default {
            if first {
                out.push_str("{\n");
            } else {
                out.push_str("else {\n");
            }
        } else {
            let conditions: Vec<String> = patterns
                .iter()
                .map(|p| format!("{scrutinee} === {p}"))
                .collect();
            let prefix = if first { "if" } else { "else if" };
            writeln!(out, "{prefix} ({}) {{", conditions.join(" || "))
                .expect("writing to a String cannot fail");
        }
        first = false;
        if is_match_binding_pattern(&arm.pat) {
            if let Some(binding) = match_binding_name(&arm.pat) {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = {scrutinee};")
                    .expect("writing to a String cannot fail");
            }
        }
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
