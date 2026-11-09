use std::collections::HashSet;
use std::fmt::Write;

use syn::{Expr, Lit, Pat, Stmt, Type};

use crate::{CompileError, compile_error};

use super::{
    BINDING_FACT_MARKER, BindingFact, DIRECT_LOCK_GUARD_REPLACED_MARKER,
    DIRECT_LOCK_GUARD_TARGET_MARKER, EMPTY_SEQUENCE_ELEMENT_TYPE_MARKER,
    ERASED_CELL_WRITTEN_MARKER, EmptyVecInitializer, MUTABLE_PARAMETER_MARKER,
    MUTEX_GUARD_BINDING_MARKER, PROVENANCE_SEPARATOR, RECORD_MAP_LOCAL_MARKER,
    REF_ALIAS_TARGET_MARKER, RENAME_MARKER, SCOPE_DECLARED_MARKER,
    VITEST_MUTABLE_SCALAR_CELL_LOCAL_BINDING_MARKER, VITEST_REBOUND_TYPE_MARKER,
    analyze_option_match, array_type, binding_fact_from_marker, block_contains_function_exits,
    closure_parameter_types, emit_block, emit_closure_with_parameter_types,
    emit_contextual_struct_literal_expression, emit_expression, emit_expression_for_type,
    emit_hoisted_if_value_local, emit_hoisted_match_value_local, emit_hoisted_value_block_local,
    emit_let_else_local, emit_pattern, emit_record_map_construction, emit_scoped_value_block_local,
    emit_try_pre_extractions, emit_type, empty_vec_initializer, entity_allocation,
    exact_portable_scalar_type, expression_contains_identifier, expression_is_path_call,
    expression_requires_string_union_const_assertion, expression_string_union_owner,
    frozen_object_expression_name, if_expression_contains_function_exits,
    indent_continuation_lines, inferred_fixed_buffer_type, inferred_vitest_option_initializer_type,
    inferred_vitest_struct_literal_type, local_pattern_binding_id, local_pattern_name,
    mutex_guard_receiver, next_try_rename, option_absent_value, option_return_absent_value,
    pattern_is_mutable, ref_alias_receiver_capture, ref_alias_target_for_id, snake_to_lower_camel,
    strip_value_position_parens, unique_marker_suffix, write_indent,
};
pub(crate) fn emit_local(
    out: &mut String,
    local: &syn::Local,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    emit_local_with_shadow(out, local, entities, indent, false, false)?;
    return Ok(());
}

pub(crate) fn emit_local_with_shadow(
    out: &mut String,
    local: &syn::Local,
    entities: &HashSet<String>,
    indent: usize,
    shadowed: bool,
    rebound: bool,
) -> Result<Vec<(String, String)>, CompileError> {
    return emit_local_with_shadow_and_else(
        out, entities, local, indent, shadowed, rebound, emit_block,
    );
}

pub(crate) fn emit_local_with_shadow_and_else(
    out: &mut String,
    entities: &HashSet<String>,
    local: &syn::Local,
    indent: usize,
    shadowed: bool,
    rebound: bool,
    emit_else_block: fn(&mut String, &[Stmt], &HashSet<String>, usize) -> Result<(), CompileError>,
) -> Result<Vec<(String, String)>, CompileError> {
    if !shadowed
        && !rebound
        && let Pat::Ident(identifier) = &local.pat
        && identifier.subpat.is_none()
        && entities.contains(&format!("{RECORD_MAP_LOCAL_MARKER}{}", identifier.ident))
        && let Some(initializer) = &local.init
        && initializer.diverge.is_none()
        && let Some(record) = emit_record_map_construction(&initializer.expr, entities)
    {
        write_indent(out, indent);
        writeln!(
            out,
            "const {}: Record<string, unknown> = {};",
            emit_pattern(&local.pat)?,
            record?
        )
        .expect("writing to a String cannot fail");
        return Ok(Vec::new());
    }
    if local
        .init
        .as_ref()
        .is_some_and(|init| init.diverge.is_some())
    {
        return Ok(emit_let_else_local(
            out,
            local,
            entities,
            indent,
            shadowed,
            rebound,
            emit_else_block,
        )?
        .into_iter()
        .collect());
    }
    if let Some(initializer) = &local.init
        && let Expr::Try(try_expr) = initializer.expr.as_ref()
    {
        return Ok(
            emit_try_local(out, local, try_expr, entities, indent, shadowed, rebound)?
                .into_iter()
                .collect(),
        );
    }
    if let Some(initializer) = &local.init
        && let Expr::Match(match_expr) = initializer.expr.as_ref()
    {
        if let Some(_result) = emit_option_match_with_return_local(
            out, local, match_expr, entities, indent, shadowed, rebound,
        )? {
            return Ok(vec![]);
        }
        emit_hoisted_match_value_local(
            out, local, match_expr, entities, indent, shadowed, rebound,
        )?;
        return Ok(vec![]);
    }
    if let Some(initializer) = &local.init
        && let Expr::Block(block) = initializer.expr.as_ref()
        && block_contains_function_exits(&block.block)
    {
        return Ok(emit_hoisted_value_block_local(
            out,
            local,
            &block.block,
            entities,
            indent,
            shadowed,
            rebound,
        )?);
    }
    if !shadowed
        && !rebound
        && let Some(initializer) = &local.init
        && let Expr::Block(block) = initializer.expr.as_ref()
        && emit_scoped_value_block_local(out, local, &block.block, entities, indent)?
    {
        return Ok(vec![]);
    }
    if let Some(initializer) = &local.init
        && let Expr::Unsafe(unsafe_block) = initializer.expr.as_ref()
        && block_contains_function_exits(&unsafe_block.block)
    {
        return Ok(emit_hoisted_value_block_local(
            out,
            local,
            &unsafe_block.block,
            entities,
            indent,
            shadowed,
            rebound,
        )?);
    }
    if let Some(initializer) = &local.init
        && let Expr::If(if_expr) = initializer.expr.as_ref()
        && if_expression_contains_function_exits(if_expr)
    {
        emit_hoisted_if_value_local(out, local, if_expr, entities, indent, shadowed, rebound)?;
        return Ok(vec![]);
    }
    let mutable = pattern_is_mutable(&local.pat)
        || local_pattern_binding_id(entities, &local.pat)
            .is_some_and(|id| entities.contains(&format!("{ERASED_CELL_WRITTEN_MARKER}{id}")));
    let (pattern, rust_type, discard) = match &local.pat {
        Pat::Ident(_) | Pat::Reference(_) | Pat::Tuple(_) | Pat::Slice(_) | Pat::Struct(_) => {
            (emit_pattern(&local.pat)?, None, false)
        }
        Pat::Type(typed) => {
            let pattern = emit_pattern(&typed.pat)?;
            (pattern, Some(typed.ty.as_ref()), false)
        }
        Pat::Wild(_) => ("_".to_string(), None, true),
        _ => {
            return Err(compile_error("unsupported destructuring in local binding"));
        }
    };
    let Some(initializer) = &local.init else {
        if let Pat::Tuple(tuple) = &local.pat {
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
            write!(out, "let {pattern}").expect("writing to a String cannot fail");
            if let Some(rust_type) = rust_type {
                write!(out, ": {}", emit_type(rust_type, entities)?)
                    .expect("writing to a String cannot fail");
            }
            out.push_str(";\n");
        }
        return Ok(vec![]);
    };
    let local_name = local_pattern_name(&local.pat);
    let local_binding_id = local_pattern_binding_id(entities, &local.pat);
    let mutable_scalar_cell = local_binding_id.as_deref().is_some_and(|id| {
        entities.contains(&format!(
            "{VITEST_MUTABLE_SCALAR_CELL_LOCAL_BINDING_MARKER}{id}"
        ))
    });
    let ref_alias_receiver_capture = local_binding_id
        .as_deref()
        .map(|id| ref_alias_receiver_capture(entities, id))
        .transpose()?
        .flatten();
    let ref_alias_target = local_binding_id
        .as_deref()
        .map(|id| ref_alias_target_for_id(entities, id))
        .transpose()?
        .flatten();
    if local_binding_id.as_deref().is_some_and(|id| {
        entities.contains(&format!("{DIRECT_LOCK_GUARD_REPLACED_MARKER}{id}"))
            && entities.iter().any(|marker| {
                marker.starts_with(&format!(
                    "{DIRECT_LOCK_GUARD_TARGET_MARKER}{id}{PROVENANCE_SEPARATOR}"
                ))
            })
    }) {
        // A replaced direct lock guard over a variable or field is read as that place wherever it is
        // used, so its snapshot binding would be unused, and reading a place has no effect to keep.
        return Ok(vec![]);
    }
    if local_name
        .as_deref()
        .is_some_and(|name| name.starts_with('_'))
        && ref_alias_receiver_capture.is_none()
        && local_binding_id.as_deref().is_some_and(|id| {
            entities.iter().any(|marker| {
                marker.starts_with(&format!(
                    "{REF_ALIAS_TARGET_MARKER}{id}{PROVENANCE_SEPARATOR}"
                ))
            })
        })
    {
        // A leading-underscore Ref alias is an implementation-only capture for writes through the
        // original field. Those writes resolve through its BindingId; emitting the snapshot local
        // would be both unused and semantically misleading in TypeScript.
        return Ok(vec![]);
    }
    let inferred_struct_type = if rust_type.is_none() {
        inferred_vitest_struct_literal_type(&initializer.expr, entities)
    } else {
        None
    };
    let inferred_option_type = if rust_type.is_none() {
        inferred_vitest_option_initializer_type(&initializer.expr, entities)
    } else {
        None
    };
    let empty_sequence_element_type = match empty_vec_initializer(&initializer.expr, entities) {
        None => None,
        Some(EmptyVecInitializer::UnprovenOwner) => {
            return Err(compile_error(format!(
                "portable empty collection local `{}` needs a standard Rust `Vec`; custom or unresolved collection owners are not supported",
                local_name.as_deref().unwrap_or("_")
            )));
        }
        Some(EmptyVecInitializer::Standard(_)) => {
            let element = local_pattern_binding_id(entities, &local.pat)
                .and_then(|id| {
                    unique_marker_suffix(
                        entities,
                        &format!(
                            "{EMPTY_SEQUENCE_ELEMENT_TYPE_MARKER}{id}{PROVENANCE_SEPARATOR}"
                        ),
                    )
                })
                .ok_or_else(|| {
                    compile_error(format!(
                        "portable empty `Vec` local `{}` needs one fully known, representable element type from its declared type, `.push()` receiver uses, or function result; unknown, generic, or conflicting element provenance is not supported",
                        local_name.as_deref().unwrap_or("_")
                    ))
                })?;
            Some(element)
        }
    };
    let rebound_struct_type = (rebound && !shadowed)
        .then(|| {
            unique_marker_suffix(
                entities,
                &format!(
                    "{VITEST_REBOUND_TYPE_MARKER}{}{PROVENANCE_SEPARATOR}",
                    local_name.as_deref()?
                ),
            )
        })
        .flatten();
    let typescript_type = rust_type
        .map(|rust_type| emit_type(rust_type, entities))
        .transpose()?
        .or_else(|| {
            local_name
                .as_deref()
                .and_then(|name| inferred_fixed_buffer_type(entities, name))
        })
        .or_else(|| inferred_struct_type.clone())
        .or_else(|| inferred_option_type.clone())
        .or_else(|| rebound_struct_type.clone())
        .or_else(|| empty_sequence_element_type.clone().map(array_type));
    // A mutable binding keeps its string-union type: TypeScript widens a `let` initialized from a
    // string literal to `string`, which a later write or a typed read would then reject.
    let string_union_type = match typescript_type {
        None if mutable => expression_string_union_owner(&initializer.expr, entities)
            .and_then(|owner| syn::parse_str::<Type>(&owner).ok())
            .map(|owner| emit_type(&owner, entities))
            .transpose()?,
        _ => None,
    };
    let mut typescript_type = typescript_type.or_else(|| string_union_type.clone());
    if mutable_scalar_cell
        && typescript_type.is_none()
        && let Some(id) = &local_binding_id
        && let Some(fact) = unique_marker_suffix(entities, &format!("{BINDING_FACT_MARKER}{id}="))
        && let BindingFact::Structure(scalar) = binding_fact_from_marker(&fact)
        && let Ok(rust_type) = syn::parse_str::<Type>(&scalar)
        && exact_portable_scalar_type(&rust_type).is_some()
    {
        typescript_type = Some(emit_type(&rust_type, entities)?);
    }
    if mutable_scalar_cell {
        let inner = typescript_type.clone().ok_or_else(|| {
            compile_error(format!(
                "portable mutable scalar cell local `{}` lost its exact scalar type",
                local_name.as_deref().unwrap_or("_")
            ))
        })?;
        typescript_type = Some(format!("{{ value: {inner} }}"));
    }
    let closure_parameter_types = local_name
        .as_deref()
        .map(|name| closure_parameter_types(entities, name))
        .unwrap_or_default();
    if let Some((stable, capture)) = &ref_alias_receiver_capture {
        write_indent(out, indent);
        writeln!(
            out,
            "const {} = {};",
            snake_to_lower_camel(stable),
            emit_expression(capture, entities)?
        )
        .expect("writing to a String cannot fail");
    }
    let mut value = if local_binding_id
        .as_deref()
        .is_some_and(|id| entities.contains(&format!("{MUTEX_GUARD_BINDING_MARKER}{id}")))
        && let Some(receiver) = mutex_guard_receiver(&initializer.expr)
    {
        emit_expression(receiver, entities)?
    } else if let Some(target) = &ref_alias_target {
        emit_expression(target, entities)?
    } else if expression_is_path_call(&initializer.expr, "allocate_entity") {
        let Some(typescript_type) = &typescript_type else {
            return Err(compile_error(
                "allocate_entity local needs an explicit Rust type",
            ));
        };
        entity_allocation(typescript_type, entities)?
    } else if let Some(rust_type) = rust_type {
        emit_expression_for_type(&initializer.expr, rust_type, entities)?
    } else if inferred_struct_type.is_some() {
        emit_contextual_struct_literal_expression(&initializer.expr, entities)?
    } else if let Expr::Repeat(repeat) = initializer.expr.as_ref()
        && let Some(array_type) = typescript_type
            .as_deref()
            .filter(|typescript_type| typescript_type.ends_with("Array"))
    {
        format!(
            "new {array_type}({}).fill({})",
            emit_expression(&repeat.len, entities)?,
            emit_expression(&repeat.expr, entities)?
        )
    } else if let Expr::Closure(closure) = initializer.expr.as_ref() {
        emit_closure_with_parameter_types(closure, entities, &closure_parameter_types)?
    } else {
        emit_expression(&initializer.expr, entities)?
    };
    if mutable_scalar_cell {
        value = format!("{{ value: {value} }}");
    }
    if !mutable
        && rust_type.is_none()
        && expression_requires_string_union_const_assertion(&initializer.expr, entities)
    {
        value = format!("{value} as const");
    }
    if !mutable
        && rust_type.is_none()
        && matches!(initializer.expr.as_ref(), Expr::Tuple(_))
        && !value.ends_with(" as const")
    {
        // TypeScript widens `[a, b]` to an array union, losing positional facts before a later tuple
        // pattern. An immutable Rust tuple is the exact `as const` case; mutable tuples retain their
        // existing writable-array emission until they carry an explicit Rust type.
        value = format!("{value} as const");
    }
    if mutable && let Some(name) = frozen_object_expression_name(&initializer.expr, entities) {
        value = format!("{{ ...{name} }}");
    }
    if typescript_type.as_deref() == Some("Float32Array") && !value.starts_with("new Float32Array(")
    {
        value = format!("new Float32Array({value})");
    }
    let rebind = shadowed
        || match &local.pat {
            Pat::Ident(identifier) => {
                expression_contains_identifier(&initializer.expr, &identifier.ident.to_string())
            }
            Pat::Type(typed) => match typed.pat.as_ref() {
                Pat::Ident(identifier) => {
                    expression_contains_identifier(&initializer.expr, &identifier.ident.to_string())
                }
                _ => false,
            },
            _ => false,
        };
    if rebind
        && !discard
        && (value == pattern
            || value == format!("{pattern}!")
            || value == format!("{pattern}.value"))
    {
        return Ok(vec![]);
    }
    if (value == "[] as never[]" || empty_sequence_element_type.is_some())
        && !rebind
        && typescript_type.is_some()
    {
        value = "[]".to_string();
    }
    let stripped = strip_value_position_parens(&value);
    if stripped.len() != value.len() {
        value = stripped.to_string();
    }
    if value.contains('\n') {
        value = indent_continuation_lines(&value, indent);
    }
    write_indent(out, indent);
    if discard {
        writeln!(out, "{value};").expect("writing to a String cannot fail");
        return Ok(vec![]);
    }
    let scope_declared = local_name
        .as_deref()
        .is_some_and(|name| entities.contains(&format!("{SCOPE_DECLARED_MARKER}{name}")));
    let is_mutable_param = entities.contains(&format!("{MUTABLE_PARAMETER_MARKER}{pattern}"));
    if scope_declared && rebind && !rebound && is_mutable_param {
        writeln!(out, "{pattern} = {value};").expect("writing to a String cannot fail");
        return Ok(vec![]);
    }
    if scope_declared || (rebind && !(rebound && shadowed)) {
        let fresh = next_try_rename(entities, &pattern);
        let keyword = if mutable_scalar_cell {
            "const"
        } else if mutable || rebound {
            "let"
        } else {
            "const"
        };
        writeln!(out, "{keyword} {fresh} = {value};").expect("writing to a String cannot fail");
        return Ok(vec![(pattern, fresh)]);
    }
    if rebind {
        write!(out, "{pattern}").expect("writing to a String cannot fail");
    } else {
        let declaration = if mutable_scalar_cell {
            "const"
        } else if mutable || rebound {
            "let"
        } else {
            "const"
        };
        write!(out, "{declaration} {pattern}").expect("writing to a String cannot fail");
    }
    if !rebind
        && (mutable_scalar_cell
            || rust_type.is_some()
            || inferred_struct_type.is_some()
            || inferred_option_type.is_some()
            || rebound_struct_type.is_some()
            || string_union_type.is_some()
            || empty_sequence_element_type.is_some())
        && let Some(typescript_type) = typescript_type
    {
        write!(out, ": {typescript_type}").expect("writing to a String cannot fail");
    }
    writeln!(out, " = {value};").expect("writing to a String cannot fail");
    return Ok(vec![]);
}

pub(super) fn emit_try_local(
    out: &mut String,
    local: &syn::Local,
    try_expr: &syn::ExprTry,
    entities: &HashSet<String>,
    indent: usize,
    shadowed: bool,
    rebound: bool,
) -> Result<Option<(String, String)>, CompileError> {
    let return_absent = option_return_absent_value(entities);
    let mutable = pattern_is_mutable(&local.pat);
    let pattern = emit_pattern(&local.pat)?;
    let try_context = emit_try_pre_extractions(out, &try_expr.expr, entities, indent)?;
    let inner_value = emit_expression(&try_expr.expr, &try_context)?;
    let self_referential = match &local.pat {
        Pat::Ident(identifier) => {
            expression_contains_identifier(&try_expr.expr, &identifier.ident.to_string())
        }
        Pat::Type(typed) => match typed.pat.as_ref() {
            Pat::Ident(identifier) => {
                expression_contains_identifier(&try_expr.expr, &identifier.ident.to_string())
            }
            _ => false,
        },
        _ => false,
    };
    let rebind = shadowed || self_referential;
    if pattern == inner_value && rebind {
        write_indent(out, indent);
        writeln!(out, "if ({pattern} === undefined) {{").expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "return {return_absent};").expect("writing to a String cannot fail");
        write_indent(out, indent);
        writeln!(out, "}}").expect("writing to a String cannot fail");
    } else if pattern == inner_value {
        let temp = format!("{pattern}_q");
        write_indent(out, indent);
        writeln!(out, "const {temp} = {inner_value};").expect("writing to a String cannot fail");
        write_indent(out, indent);
        writeln!(out, "if ({temp} === undefined) {{").expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "return {return_absent};").expect("writing to a String cannot fail");
        write_indent(out, indent);
        writeln!(out, "}}").expect("writing to a String cannot fail");
        let keyword = if mutable || rebound { "let" } else { "const" };
        write_indent(out, indent);
        writeln!(out, "{keyword} {pattern} = {temp};").expect("writing to a String cannot fail");
    } else if rebind {
        let fresh = next_try_rename(entities, &pattern);
        let keyword = if mutable { "let" } else { "const" };
        write_indent(out, indent);
        writeln!(out, "{keyword} {fresh} = {inner_value};")
            .expect("writing to a String cannot fail");
        write_indent(out, indent);
        writeln!(out, "if ({fresh} === undefined) {{").expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "return {return_absent};").expect("writing to a String cannot fail");
        write_indent(out, indent);
        writeln!(out, "}}").expect("writing to a String cannot fail");
        return Ok(Some((pattern, fresh)));
    } else {
        let keyword = if mutable || rebound { "let" } else { "const" };
        write_indent(out, indent);
        writeln!(out, "{keyword} {pattern} = {inner_value};")
            .expect("writing to a String cannot fail");
        write_indent(out, indent);
        writeln!(out, "if ({pattern} === undefined) {{").expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "return {return_absent};").expect("writing to a String cannot fail");
        write_indent(out, indent);
        writeln!(out, "}}").expect("writing to a String cannot fail");
    }
    return Ok(None);
}

/// Detects `let x = match scrutinee { Some(v) => v, None => return val }` and emits it as an
/// early-return guard followed by the binding. Returns `Ok(Some(()))` if handled, `Ok(None)` if
/// the pattern doesn't match, or `Err` on a real error.
pub(super) fn emit_option_match_with_return_local(
    out: &mut String,
    local: &syn::Local,
    match_expr: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
    shadowed: bool,
    rebound: bool,
) -> Result<Option<()>, CompileError> {
    let arms = match analyze_option_match(&match_expr.arms) {
        Some(arms) => arms,
        None => return Ok(None),
    };
    if match_expr.arms.len() != 2 {
        return Ok(None);
    }
    if match_expr.arms.iter().any(|arm| arm.guard.is_some()) {
        return Ok(None);
    }
    let (some_index, none_index) = if arms[0].present && !arms[1].present {
        (0, 1)
    } else if !arms[0].present && arms[1].present {
        (1, 0)
    } else {
        return Ok(None);
    };
    let Expr::Return(return_expr) = match_expr.arms[none_index].body.as_ref() else {
        return Ok(None);
    };
    let mutable = pattern_is_mutable(&local.pat);
    let local_name = local_pattern_name(&local.pat);
    let absent = option_absent_value(&match_expr.expr, entities);
    let scrutinee = emit_expression(&match_expr.expr, entities)?;
    let some_binding = arms[some_index].binding.as_deref();
    let some_body = &match_expr.arms[some_index].body;
    write_indent(out, indent);
    writeln!(out, "if ({scrutinee} === {absent}) {{").expect("writing to a String cannot fail");
    write_indent(out, indent + 1);
    if let Some(value) = &return_expr.expr {
        writeln!(out, "return {};", emit_expression(value, entities)?)
            .expect("writing to a String cannot fail");
    } else {
        writeln!(out, "return;").expect("writing to a String cannot fail");
    }
    write_indent(out, indent);
    out.push_str("}\n");
    if let Some(name) = local_name {
        let ts_name = snake_to_lower_camel(&name);
        let body_is_identity = some_binding.is_some_and(|b| {
            if let Expr::Path(path) = some_body.as_ref() {
                path.qself.is_none()
                    && path.path.segments.len() == 1
                    && snake_to_lower_camel(&path.path.segments[0].ident.to_string()) == b
            } else {
                false
            }
        });
        let binding_shadows_local = some_binding.is_some_and(|b| b == ts_name) && !body_is_identity;
        let effective_binding = if binding_shadows_local {
            some_binding.map(|b| format!("${b}"))
        } else {
            some_binding.map(str::to_string)
        };
        if let Some(ref binding) = effective_binding {
            let declaration = if mutable || rebound { "let" } else { "const" };
            write_indent(out, indent);
            writeln!(out, "{declaration} {binding} = {scrutinee};")
                .expect("writing to a String cannot fail");
        }
        if body_is_identity {
            if effective_binding.as_deref() != Some(&ts_name) {
                let declaration = if mutable || rebound { "let" } else { "const" };
                write_indent(out, indent);
                writeln!(
                    out,
                    "{declaration} {ts_name} = {};",
                    effective_binding.as_deref().unwrap_or(&scrutinee)
                )
                .expect("writing to a String cannot fail");
            }
        } else {
            let arm_context = if let Some(ref binding) = effective_binding {
                let mut context = entities.clone();
                context.insert(binding.clone());
                if binding_shadows_local {
                    context.insert(format!(
                        "{RENAME_MARKER}{}={binding}",
                        some_binding.unwrap()
                    ));
                }
                context
            } else {
                entities.clone()
            };
            let body_value = emit_expression(some_body, &arm_context)?;
            let declaration = if shadowed || mutable || rebound {
                "let"
            } else {
                "const"
            };
            write_indent(out, indent);
            writeln!(out, "{declaration} {ts_name} = {body_value};")
                .expect("writing to a String cannot fail");
        }
    } else {
        if let Some(binding) = some_binding {
            let declaration = if mutable || rebound { "let" } else { "const" };
            write_indent(out, indent);
            writeln!(out, "{declaration} {binding} = {scrutinee};")
                .expect("writing to a String cannot fail");
        }
    }
    return Ok(Some(()));
}
