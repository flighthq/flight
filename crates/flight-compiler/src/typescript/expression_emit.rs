use std::collections::HashSet;
use std::fmt::Write;

use quote::ToTokens;
use syn::visit::Visit;
use syn::{BinOp, Expr, Pat, Stmt, Type, UnOp};

use crate::{CompileError, compile_error};

use super::{
    BLOCK_ON_HELPER_MARKER, BindingFact, CHAR_EXPRESSION_MARKER, D15_FUTURE_CLOSURE_MARKER,
    D15_FUTURE_FIELD_MARKER, DIRECT_LOCK_GUARD_BINDING_MARKER, DIRECT_LOCK_GUARD_REPLACED_MARKER,
    EmptyVecInitializer, FLIGHT_ERROR_HELPER_MARKER, FLOAT_CONST_MARKER, ITER_MUT_ALIAS_MARKER,
    MUTABLE_SCALAR_CELL_PARAMETER_BINDING_MARKER, MUTABLE_SCALAR_REFERENCE_ARGUMENT_MARKER,
    NULLABLE_CALL_MARKER, NULLABLE_OPTION_FIELD_MARKER, NULLABLE_OPTIONS_MARKER,
    PANIC_MESSAGE_HELPER_MARKER, PROVENANCE_SEPARATOR, REFERENCE_PARAMETER_BINDING_MARKER,
    RENAME_MARKER, SLICE_ARGUMENT_MARKER, TRY_SUBSTITUTION_MARKER, UNSIGNED_INTEGER_LOCAL_MARKER,
    VEC_CLONE_EXPRESSION_MARKER, VITEST_MUTABLE_SCALAR_CELL_LOCAL_BINDING_MARKER,
    VITEST_STRUCT_VEC_CALLBACK_MARKER, associated_numeric_method, associated_owner_and_member,
    binary_is_assignment, binary_precedence, closure_parameter_identifier, concise_arrow_body,
    const_group_member_reference, context_type_identity, contract_array_field_value,
    current_source, d15_future_field_closure, data_union_expression_variant, data_union_unit,
    direct_lock_assignment_target, direct_lock_guard_receiver, direct_lock_guard_target,
    emit_binary_operand, emit_binary_operator, emit_block, emit_block_with_context,
    emit_block_with_tail_returns, emit_closure, emit_diverging_statement,
    emit_entity_runtime_state_stores, emit_if_expression, emit_inclusive_comparison, emit_literal,
    emit_loop_value_expression, emit_macro_expression, emit_match_expression, emit_member,
    emit_method_call, emit_numeric_function_reference, emit_ordering_variant_comparison,
    emit_path_segment, emit_record_map_payload, emit_type, emit_typed_array_vec_repeat,
    emit_unary_expression, empty_vec_initializer, entity_runtime_state_access,
    entity_runtime_state_is_designated, explicit_default_object, export_name,
    expression_contains_method, expression_is_associated_path, expression_is_diverging,
    expression_is_empty_vec, expression_is_known_boolean, expression_is_none,
    expression_is_nullable_option_field, expression_is_nullable_option_return, expression_is_path,
    expression_is_reusable, expression_is_sequence, expression_is_shared_identity,
    expression_is_type_script_nullable_option_field,
    expression_is_type_script_nullable_option_return, expression_kind, expression_path_ends_with,
    expression_struct_name, expression_typed_array, flight_error_throw, flight_error_value,
    float_bit_comparison, float_const_js_value, float_constant_type, frozen_object_name,
    hash_collection_construction, insert_record_map_local_context, integer_literal_fits_cast,
    integer_literal_fits_u32, is_integer_cast_elided, is_integer_division,
    is_nullable_literal_field, is_ordinary_option_literal_field, is_record_map_local,
    is_record_map_variant, is_string_union, is_tagged_data_union_variant,
    is_vitest_crate_root_test_support_function, is_vitest_struct, js_string_literal,
    lexical_binding, literal_shift_amount, lower_camel_from_upper_camel, marker_suffixes,
    nullable_option_value, numeric_dataview_info, ordering_variant_value, ordinary_option_value,
    path_is_float_constant, path_is_type_constant, path_owner_and_member, ref_alias_target,
    referenced_path_identifier, reject_function_exits_in_value_position,
    reject_unresolved_pattern_field, size_of_rust_type, snake_to_lower_camel,
    statement_macro_is_diverging, std_mem_function, strip_as_ptr, swap_operand_is_place,
    take_operand_place, turbofish_type, type_is_named, type_script_array_field,
    typed_array_alias_for_type, typed_array_for_literal, typed_array_for_type,
    vitest_current_path_prefix, vitest_function_path_binding_name, vitest_path_binding_name,
    vitest_struct_local, vitest_struct_name, vitest_struct_owner, write_indent,
};
// Emits `expression`. Source-directed nullable Options are normalized to the ordinary absent form
// (`?? undefined`, preserving `false`, `0` and `""`) outside their declaration boundary. Exact
// TypeScript contract metadata instead preserves `null` through reads, bindings and Option methods;
// ordinary Options continue to use `undefined`.
pub(crate) fn emit_expression(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if let Expr::Struct(literal) = expression
        && literal.qself.is_none()
        && literal
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "FlightError")
    {
        return flight_error_value(literal, entities);
    }
    if let Expr::Call(call) = expression
        && matches!(call.func.as_ref(), Expr::Path(path) if path.path.is_ident("Err"))
    {
        return Err(compile_error(
            "portable `Err(..)` is a value outside a proven D15 async return, which TypeScript cannot represent",
        ));
    }
    if let Expr::Call(call) = expression
        && let Expr::Path(path) = call.func.as_ref()
        && let Some(helper) = path.path.get_ident()
        && entities.contains(&format!("{BLOCK_ON_HELPER_MARKER}{helper}"))
        && let [future] = call.args.iter().collect::<Vec<_>>().as_slice()
    {
        return Ok(format!("(await {})", emit_expression(future, entities)?));
    }
    let value = emit_expression_value(expression, entities)?;
    let value = make_value_wrapper_async(expression, value);
    if current_source(entities).is_some()
        && !entities.contains(NULLABLE_OPTIONS_MARKER)
        && (expression_is_nullable_option_return(expression, entities)
            || expression_is_nullable_option_field(expression, entities))
        && !expression_is_type_script_nullable_option_return(expression, entities)
        && !expression_is_type_script_nullable_option_field(expression, entities)
    {
        return Ok(format!("(({value}) ?? undefined)"));
    }
    return Ok(value);
}

// A block, `if`, `loop` or `match` in value position lowers to an immediately invoked arrow,
// `(() => { ... })()`. When the Rust expression awaits directly (not inside its own nested `async`
// block or closure), that arrow would put `await` in a non-async function, which TypeScript rejects;
// so it becomes an awaited async arrow, `(await (async () => { ... })())`, evaluated in the same
// order. Rust only allows the `.await` inside an async context, so the outer `await` is valid too.
pub(super) fn make_value_wrapper_async(expression: &Expr, value: String) -> String {
    const PREFIX: &str = "(() => {";
    const SUFFIX: &str = "})()";
    if !matches!(
        expression,
        Expr::Block(_) | Expr::Unsafe(_) | Expr::If(_) | Expr::Loop(_) | Expr::Match(_)
    ) || !value.starts_with(PREFIX)
        || !value.ends_with(SUFFIX)
        || !expression_awaits_directly(expression)
    {
        return value;
    }
    let inner = &value[PREFIX.len()..value.len() - SUFFIX.len()];
    return format!("(await (async () => {{{inner}}})())");
}

// Whether `expression` contains an `.await` that belongs to it rather than to a nested `async`
// block or closure (whose own arrow is already async).
pub(super) fn expression_awaits_directly(expression: &Expr) -> bool {
    struct Finder {
        found: bool,
    }
    impl<'ast> Visit<'ast> for Finder {
        fn visit_expr_await(&mut self, _: &'ast syn::ExprAwait) {
            self.found = true;
        }
        fn visit_expr_async(&mut self, _: &'ast syn::ExprAsync) {}
        fn visit_expr_closure(&mut self, _: &'ast syn::ExprClosure) {}
        fn visit_item(&mut self, _: &'ast syn::Item) {}
    }
    let mut finder = Finder { found: false };
    finder.visit_expr(expression);
    return finder.found;
}

pub(super) fn emit_expression_value(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return match expression {
        Expr::Array(array) => {
            let elements = array
                .elems
                .iter()
                .map(|element| emit_expression(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Expr::Async(async_block) => emit_async_block_expression(&async_block.block, entities),
        Expr::Await(await_expr) => Ok(format!(
            "await {}",
            emit_expression(&await_expr.base, entities)?
        )),
        Expr::Assign(assign) => {
            if let Expr::Field(field) = assign.left.as_ref()
                && let Some(store) = entity_runtime_state_access(field, entities)?
            {
                return Ok(format!(
                    "{store}.set({}, {})",
                    emit_expression(&field.base, entities)?,
                    emit_expression(&assign.right, entities)?
                ));
            }
            if current_source(entities).is_some()
                && !entities.contains(NULLABLE_OPTIONS_MARKER)
                && expression_is_nullable_option_field(&assign.left, entities)
            {
                let right_context = contextual_assignment_field_context(assign, entities);
                return Ok(format!(
                    "{} = {}",
                    emit_expression_value(&assign.left, entities)?,
                    nullable_option_value(
                        &assign.right,
                        emit_expression(&assign.right, &right_context)?
                    )
                ));
            }
            let left = if let Expr::Unary(unary) = assign.left.as_ref()
                && matches!(unary.op, UnOp::Deref(_))
            {
                let operand = emit_expression(&unary.expr, entities)?;
                let direct_guard = referenced_path_identifier(&unary.expr)
                    .and_then(|name| lexical_binding(entities, &name))
                    .filter(|id| {
                        entities.contains(&format!("{DIRECT_LOCK_GUARD_BINDING_MARKER}{id}"))
                    });
                let direct_receiver = direct_lock_guard_receiver(&unary.expr);
                let reference_parameter = referenced_path_identifier(&unary.expr)
                    .and_then(|name| lexical_binding(entities, &name))
                    .is_some_and(|id| {
                        entities.contains(&format!("{REFERENCE_PARAMETER_BINDING_MARKER}{id}"))
                    });
                if let Some(id) = &direct_guard
                    && let Some(target) = direct_lock_guard_target(entities, id)?
                {
                    emit_expression(&target, entities)?
                } else if let Some(receiver) = direct_receiver
                    && let Some(target) = ref_alias_target(entities, receiver)?
                {
                    emit_expression(&target, entities)?
                } else if direct_guard.is_some()
                    || reference_parameter
                    || expression_contains_method(&unary.expr, "read")
                    || expression_contains_method(&unary.expr, "write")
                    || operand.ends_with(".value")
                {
                    operand
                } else {
                    format!("{operand}.value")
                }
            } else {
                emit_expression(&assign.left, entities)?
            };
            let left = left.strip_suffix('!').unwrap_or(&left);
            let right_context = contextual_assignment_field_context(assign, entities);
            Ok(format!(
                "{left} = {}",
                emit_expression(&assign.right, &right_context)?
            ))
        }
        Expr::Binary(binary) => {
            let precedence = binary_precedence(&binary.op);
            if binary_is_assignment(&binary.op)
                && let Expr::Unary(unary) = binary.left.as_ref()
                && matches!(unary.op, UnOp::Deref(_))
                && let Some(target) = direct_lock_assignment_target(entities, &unary.expr)?
            {
                return Ok(format!(
                    "{} {} {}",
                    emit_expression(&target, entities)?,
                    emit_binary_operator(&binary.op)?,
                    emit_binary_operand(&binary.right, entities, precedence, true)?
                ));
            }
            if let Some(comparison) = emit_inclusive_comparison(binary, entities)? {
                return Ok(comparison);
            }
            if matches!(binary.op, BinOp::Eq(_) | BinOp::Ne(_))
                && let Some((left, right)) = float_bit_comparison(binary, entities)?
            {
                let comparison = format!("Object.is({left}, {right})");
                return if matches!(binary.op, BinOp::Ne(_)) {
                    Ok(format!("!{comparison}"))
                } else {
                    Ok(comparison)
                };
            }
            if matches!(binary.op, BinOp::Eq(_) | BinOp::Ne(_))
                && let Some(comparison) = emit_ordering_variant_comparison(binary, entities)?
            {
                return Ok(comparison);
            }
            if matches!(binary.op, BinOp::Div(_)) && is_integer_division(binary, entities) {
                let precedence = binary_precedence(&binary.op);
                return Ok(format!(
                    "Math.trunc({} / {})",
                    emit_binary_operand(&binary.left, entities, precedence, false)?,
                    emit_binary_operand(&binary.right, entities, precedence, true)?
                ));
            }
            if matches!(binary.op, BinOp::DivAssign(_)) && is_integer_division(binary, entities) {
                let left = emit_expression(&binary.left, entities)?;
                let precedence = binary_precedence(&BinOp::Div(syn::token::Slash::default()));
                return Ok(format!(
                    "{left} = Math.trunc({left} / {})",
                    emit_binary_operand(&binary.right, entities, precedence, true)?
                ));
            }
            if matches!(binary.op, BinOp::BitXor(_)) {
                return Ok(format!(
                    "({} ^ {}) >>> 0",
                    emit_binary_operand(&binary.left, entities, precedence, false)?,
                    emit_binary_operand(&binary.right, entities, precedence, true)?
                ));
            }
            if matches!(binary.op, BinOp::BitXorAssign(_)) {
                let left = emit_expression(&binary.left, entities)?;
                return Ok(format!(
                    "{left} = ({left} ^ {}) >>> 0",
                    emit_expression(&binary.right, entities)?
                ));
            }
            if matches!(binary.op, BinOp::Shr(_) | BinOp::ShrAssign(_))
                && referenced_path_identifier(&binary.left).is_some_and(|identifier| {
                    entities.contains(&format!("{UNSIGNED_INTEGER_LOCAL_MARKER}{identifier}"))
                })
            {
                let operator = if matches!(binary.op, BinOp::ShrAssign(_)) {
                    ">>>="
                } else {
                    ">>>"
                };
                return Ok(format!(
                    "{} {operator} {}",
                    emit_binary_operand(&binary.left, entities, precedence, false)?,
                    emit_binary_operand(&binary.right, entities, precedence, true)?
                ));
            }
            if matches!(binary.op, BinOp::Shl(_)) {
                if let Some(shift_amount) = literal_shift_amount(&binary.right) {
                    if shift_amount >= 32 {
                        let left = emit_expression(&binary.left, entities)?;
                        return Ok(format!("{left} * 2 ** {shift_amount}"));
                    }
                }
            }
            if matches!(binary.op, BinOp::ShlAssign(_)) {
                if let Some(shift_amount) = literal_shift_amount(&binary.right) {
                    if shift_amount >= 32 {
                        let left = emit_expression(&binary.left, entities)?;
                        return Ok(format!("{left} = {left} * 2 ** {shift_amount}"));
                    }
                }
            }
            Ok(format!(
                "{} {} {}",
                emit_binary_operand(&binary.left, entities, precedence, false)?,
                emit_binary_operator(&binary.op)?,
                emit_binary_operand(&binary.right, entities, precedence, true)?
            ))
        }
        Expr::Block(block) => emit_block_expression(&block.block, entities),
        Expr::Unsafe(unsafe_block) => emit_block_expression(&unsafe_block.block, entities),
        Expr::Call(call) => {
            if expression_is_path(&call.func, "drop") && call.args.len() == 1 {
                return Ok(format!(
                    "void {}",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if let Some(literal) = explicit_default_object(call, entities) {
                return Ok(literal);
            }
            if let Some(kind) = hash_collection_construction(expression, entities) {
                return Ok(match kind {
                    BindingFact::HashMap => "new Map()".to_string(),
                    _ => "new Set()".to_string(),
                });
            }
            if let Some(name) = std_mem_function(&call.func, entities) {
                return match name.as_str() {
                    // Like `swap`, the reassignment is the Rust replace only for an explicit `&mut`
                    // place the caller observes.
                    "replace" if call.args.len() == 2 && swap_operand_is_place(&call.args[0]) => {
                        let target = emit_expression(&call.args[0], entities)?;
                        let replacement = emit_expression(&call.args[1], entities)?;
                        Ok(format!(
                            "(() => {{ const __tmp = {target}; {target} = {replacement}; return __tmp; }})()"
                        ))
                    }
                    "size_of" if call.args.is_empty() => {
                        if let Some(turbofish) = turbofish_type(&call.func)
                            && let Some(size) = size_of_rust_type(&turbofish)
                        {
                            Ok(size.to_string())
                        } else {
                            Err(compile_error(
                                "portable `std::mem::size_of` requires a turbofish with a known numeric type",
                            ))
                        }
                    }
                    // A taken `Vec` empties in place, which `splice(0)` does with one evaluation of
                    // the place and is visible through a `&mut` binding, as Rust's empty default is.
                    "take"
                        if call.args.len() == 1
                            && let Some(place) = take_operand_place(&call.args[0])
                            && expression_is_sequence(place, entities)
                            && expression_typed_array(place, entities).is_none() =>
                    {
                        let target = emit_expression(place, entities)?;
                        Ok(format!("{target}.splice(0)"))
                    }
                    "take" if call.args.len() == 1 && swap_operand_is_place(&call.args[0]) => {
                        let target = emit_expression(&call.args[0], entities)?;
                        Ok(format!(
                            "(() => {{ const __tmp = {target}; {target} = undefined as any; return __tmp; }})()"
                        ))
                    }
                    _ => Err(compile_error(format!(
                        "portable `std::mem::{name}` has no portable lowering"
                    ))),
                };
            }
            if let Some((owner, variant, _)) = data_union_expression_variant(&call.func, entities) {
                if data_union_unit(entities, &owner, &variant) || call.args.len() != 1 {
                    return Err(compile_error(format!(
                        "transparent data union constructor `{owner}::{variant}` expects exactly one payload"
                    )));
                }
                if is_record_map_variant(entities, &owner, &variant) {
                    return emit_record_map_payload(&call.args[0], entities);
                }
                return emit_expression(&call.args[0], entities);
            }
            if let Some((owner, variant)) = associated_owner_and_member(&call.func)
                && is_tagged_data_union_variant(entities, &owner, &variant)
                && !data_union_unit(entities, &owner, &variant)
                && call.args.len() == 1
            {
                return emit_expression(&call.args[0], entities);
            }
            if (expression_is_path(&call.func, "Some") || expression_is_path(&call.func, "Ok"))
                && call.args.len() == 1
            {
                return emit_expression(&call.args[0], entities);
            }
            // `Ref<T>` is `Arc<RwLock<T>>` and lowers to `T`, so its constructor lowers to its argument.
            if (expression_is_associated_path(&call.func, "Arc", "new")
                || expression_is_associated_path(&call.func, "Ref", "new"))
                && call.args.len() == 1
            {
                return emit_expression(&call.args[0], entities);
            }
            if (expression_is_associated_path(&call.func, "Box", "new")
                || expression_is_associated_path(&call.func, "Box", "pin"))
                && call.args.len() == 1
            {
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "Arc", "clone") && call.args.len() == 1 {
                return emit_expression(&call.args[0], entities);
            }
            if let Expr::Path(path) = call.func.as_ref()
                && path.qself.is_none()
                && path
                    .path
                    .segments
                    .last()
                    .is_some_and(|segment| segment.ident == "get_entity_id")
                && (path.path.segments.len() == 1
                    || (path.path.segments.len() == 2
                        && path.path.segments[0].ident == "flight_entity"))
            {
                // The numeric entity id is Rust-only identity machinery (D12; `entity_id.rs` is
                // rust-only). Tests that only compare ids lower to object identity in vitest.
                return Err(compile_error(
                    "portable `get_entity_id` is Rust-only; a test may bind it and compare it only with \
                     `assert_eq!`/`assert_ne!` against another entity id, which lowers to object identity",
                ));
            }
            if let Expr::Path(path) = call.func.as_ref()
                && let Some(name) = path.path.get_ident()
                && entities.iter().any(|marker| {
                    marker.starts_with(&format!("{FLIGHT_ERROR_HELPER_MARKER}{name}\u{1f}"))
                })
            {
                return Err(compile_error(format!(
                    "portable FlightError helper `{name}` is supported only called on its proven \
                     source (a closure literal or inline `catch_unwind` result) as a statement, or \
                     bound and then unread or compared with `assert_eq!` to a string literal"
                )));
            }
            if let Expr::Path(path) = call.func.as_ref()
                && let Some(name) = path.path.get_ident()
                && entities.contains(&format!("{PANIC_MESSAGE_HELPER_MARKER}{name}"))
            {
                return Err(compile_error(format!(
                    "portable panic-message helper `{name}` is supported only in an assertion on a \
                     caught panic: `assert!({name}(payload).contains(..))`, \
                     `assert!(str::contains(&{name}(payload), ..))` or `assert_eq!({name}(payload), ..)`"
                )));
            }
            if let Expr::Path(path) = call.func.as_ref()
                && path.qself.is_none()
                && path
                    .path
                    .segments
                    .last()
                    .is_some_and(|segment| segment.ident == "catch_unwind")
            {
                // Tests lower the panic idioms they can express to `expect(..).toThrow(..)`; any
                // other use has no TypeScript function to call.
                return Err(compile_error(
                    "portable `catch_unwind` is supported only as a panic assertion: \
                     `assert!(catch_unwind(..).is_err())` (or through an unread `let result`), or \
                     `.expect_err(..)`/`.unwrap_err()` whose payload is unread or checked with a \
                     `&str`/`String` message `contains`",
                ));
            }
            if (expression_is_associated_path(&call.func, "Arc", "ptr_eq")
                || expression_is_associated_path(&call.func, "Rc", "ptr_eq"))
                && call.args.len() == 2
                && !call
                    .args
                    .iter()
                    .any(|argument| expression_is_shared_identity(argument, entities))
            {
                // `ptr_eq(&Arc<T>, &Arc<T>)` takes one `T` for both operands, so proving either
                // payload proves both. `Arc<T>`/`Rc<T>` lowers to `T`. Only an identity-bearing `T` (an object, collection,
                // callable or cell) keeps one allocation per `Arc::new`; a primitive or unit payload
                // lowers to its value, where `===` compares values and would call two distinct
                // allocations of equal values the same.
                return Err(compile_error(
                    "portable `Arc::ptr_eq` needs an operand proven to hold an identity-bearing payload (a struct, collection, callable, `Mutex` cell or `dyn Any`); a primitive or unit payload lowers to its value, so `===` would compare values instead of allocations",
                ));
            }
            if (expression_is_associated_path(&call.func, "Arc", "ptr_eq")
                || expression_is_associated_path(&call.func, "Rc", "ptr_eq")
                || expression_is_associated_path(&call.func, "ptr", "eq"))
                && call.args.len() == 2
            {
                let lhs = strip_as_ptr(&call.args[0]);
                let rhs = strip_as_ptr(&call.args[1]);
                return Ok(format!(
                    "{} === {}",
                    emit_expression(lhs, entities)?,
                    emit_expression(rhs, entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "RwLock", "new") && call.args.len() == 1 {
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "String", "new") && call.args.is_empty() {
                return Ok("''".to_string());
            }
            if expression_is_associated_path(&call.func, "String", "with_capacity")
                && call.args.len() == 1
            {
                return Ok("''".to_string());
            }
            if expression_is_associated_path(&call.func, "String", "from") && call.args.len() == 1 {
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "String", "from_utf16_lossy")
                && call.args.len() == 1
            {
                let units = emit_expression(&call.args[0], entities)?;
                return Ok(format!(
                    "((units: Readonly<number[]>): string => {{ let value = ''; for (let index = 0; index < units.length; index += 0x8000) value += String.fromCharCode(...units.slice(index, index + 0x8000)); return value; }})({units})"
                ));
            }
            if expression_is_associated_path(&call.func, "String", "from_utf8")
                && call.args.len() == 1
            {
                let bytes = emit_expression(&call.args[0], entities)?;
                return Ok(format!("new TextDecoder().decode(new Uint8Array({bytes}))"));
            }
            if expression_is_associated_path(&call.func, "String", "from_utf8_lossy")
                && call.args.len() == 1
            {
                let bytes = emit_expression(&call.args[0], entities)?;
                return Ok(format!("new TextDecoder().decode(new Uint8Array({bytes}))"));
            }
            if matches!(
                empty_vec_initializer(expression, entities),
                Some(EmptyVecInitializer::Standard(_))
            ) {
                return Ok("[] as never[]".to_string());
            }
            if expression_is_associated_path(&call.func, "serde_json", "to_string")
                && call.args.len() == 1
            {
                return Ok(format!(
                    "JSON.stringify({})",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "serde_json", "to_string_pretty")
                && call.args.len() == 1
            {
                return Ok(format!(
                    "JSON.stringify({}, null, 2)",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "serde_json", "from_str")
                && call.args.len() == 1
            {
                let input = emit_expression(&call.args[0], entities)?;
                return Ok(format!(
                    "(() => {{ try {{ return JSON.parse({input}); }} catch {{ return undefined; }} }})()"
                ));
            }
            if expression_path_ends_with(&call.func, "create_reg_exp") && call.args.len() == 2 {
                return Ok(format!(
                    "new RegExp({}, {})",
                    emit_expression(&call.args[0], entities)?,
                    emit_expression(&call.args[1], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "Mutex", "new") && call.args.len() == 1 {
                return Ok(format!(
                    "{{ value: {} }}",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "Cell", "new") && call.args.len() == 1 {
                return Ok(format!(
                    "{{ value: {} }}",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "AtomicU32", "new") && call.args.len() == 1
            {
                let value = emit_expression(&call.args[0], entities)?;
                let suffix = if integer_literal_fits_u32(&call.args[0]) {
                    ""
                } else {
                    " >>> 0"
                };
                return Ok(format!("{{ value: {value}{suffix} }}"));
            }
            if expression_is_associated_path(&call.func, "char", "from_u32") && call.args.len() == 1
            {
                let codepoint = emit_expression(&call.args[0], entities)?;
                let absent = if entities.contains(NULLABLE_OPTIONS_MARKER) {
                    "null"
                } else {
                    "undefined"
                };
                return Ok(format!(
                    "((codepoint: number): string | {absent} => Number.isInteger(codepoint) && codepoint >= 0 && codepoint <= 0x10ffff && (codepoint < 0xd800 || codepoint > 0xdfff) ? String.fromCodePoint(codepoint) : {absent})({codepoint})"
                ));
            }
            if let Some((numeric_type, method)) = associated_numeric_method(&call.func) {
                match (method.as_str(), call.args.len()) {
                    ("from_ne_bytes", 1) => {
                        return Err(compile_error(format!(
                            "portable `{numeric_type}::from_ne_bytes()` has no runtime-native lowering",
                        )));
                    }
                    ("from_le_bytes" | "from_be_bytes", 1) => {
                        let Some((dv_type, byte_count)) = numeric_dataview_info(&numeric_type)
                        else {
                            return Err(compile_error(format!(
                                "portable `{numeric_type}::{method}()` has no portable lowering",
                            )));
                        };
                        let bytes = emit_expression(&call.args[0], entities)?;
                        let little_endian = method == "from_le_bytes";
                        if byte_count == 1 {
                            return Ok(format!("({bytes})[0]"));
                        }
                        return Ok(format!(
                            "new DataView(new Uint8Array({bytes}).buffer).get{dv_type}(0, {little_endian})"
                        ));
                    }
                    ("from_bits", 1) => {
                        let bits = emit_expression(&call.args[0], entities)?;
                        return match numeric_type.as_str() {
                            "f32" => Ok(format!(
                                "(() => {{ const __b = new DataView(new ArrayBuffer(4)); __b.setUint32(0, {bits}, true); return __b.getFloat32(0, true); }})()"
                            )),
                            "f64" => Ok(format!(
                                "(() => {{ const __b = new DataView(new ArrayBuffer(8)); __b.setBigUint64(0, {bits}, true); return __b.getFloat64(0, true); }})()"
                            )),
                            _ => Err(compile_error(format!(
                                "portable `{numeric_type}::from_bits()` is only supported for `f32` and `f64`",
                            ))),
                        };
                    }
                    ("from" | "try_from" | "try_into", 1) => {
                        if expression_is_known_boolean(&call.args[0], entities) {
                            return Ok(format!(
                                "Number({})",
                                emit_expression(&call.args[0], entities)?
                            ));
                        }
                        return emit_expression(&call.args[0], entities);
                    }
                    ("round", 1) if matches!(numeric_type.as_str(), "f32" | "f64") => {
                        let arg = emit_expression(&call.args[0], entities)?;
                        if expression_is_reusable(&call.args[0]) {
                            return Ok(format!("Math.trunc({arg} + 0.5 * Math.sign({arg}))"));
                        } else {
                            return Ok(format!(
                                "((n: number): number => Math.trunc(n + 0.5 * Math.sign(n)))({arg})"
                            ));
                        }
                    }
                    ("from_str_radix", 2) => {
                        let digits = emit_expression(&call.args[0], entities)?;
                        let radix = emit_expression(&call.args[1], entities)?;
                        let absent = if entities.contains(NULLABLE_OPTIONS_MARKER) {
                            "null"
                        } else {
                            "undefined"
                        };
                        let max = match numeric_type.as_str() {
                            "u8" => "0xff",
                            "u16" => "0xffff",
                            "u32" | "usize" => "0xffffffff",
                            "i8" => "0x7f",
                            "i16" => "0x7fff",
                            "i32" | "isize" => "0x7fffffff",
                            _ => {
                                return Err(compile_error(format!(
                                    "portable `{numeric_type}::from_str_radix()` is not supported for 64-bit types",
                                )));
                            }
                        };
                        return Ok(format!(
                            "((digits: string, radix: number): number | {absent} => {{ if (!Number.isInteger(radix) || radix < 2 || radix > 36 || digits.length === 0) return {absent}; let index = digits[0] === '+' ? 1 : 0; if (index === digits.length) return {absent}; let value = 0; for (; index < digits.length; index++) {{ const code = digits.charCodeAt(index); const digit = code >= 48 && code <= 57 ? code - 48 : code >= 65 && code <= 90 ? code - 55 : code >= 97 && code <= 122 ? code - 87 : radix; if (digit >= radix) return {absent}; value = value * radix + digit; if (value > {max}) return {absent}; }} return value; }})({digits}, {radix})"
                        ));
                    }
                    _ => {}
                }
            }
            if expression_path_ends_with(&call.func, "get_record_value") && call.args.len() == 2 {
                let record = emit_expression(&call.args[0], entities)?;
                let key = emit_expression(&call.args[1], entities)?;
                return Ok(format!("{record}[{key}]"));
            }
            if expression_path_ends_with(&call.func, "set_record_value") && call.args.len() == 3 {
                let record = emit_expression(&call.args[0], entities)?;
                let key = emit_expression(&call.args[1], entities)?;
                let value = emit_expression(&call.args[2], entities)?;
                return Ok(format!("({record}[{key}] = {value})"));
            }
            if expression_path_ends_with(&call.func, "has_record_key") && call.args.len() == 2 {
                let record = emit_expression(&call.args[0], entities)?;
                let key = emit_expression(&call.args[1], entities)?;
                return Ok(format!("({key} in {record})"));
            }
            if expression_path_ends_with(&call.func, "delete_record_value") && call.args.len() == 2
            {
                let record = emit_expression(&call.args[0], entities)?;
                let key = emit_expression(&call.args[1], entities)?;
                return Ok(format!("(delete {record}[{key}])"));
            }
            if expression_path_ends_with(&call.func, "get_record_keys") && call.args.len() == 2 {
                let record = emit_expression(&call.args[1], entities)?;
                return Ok(format!("Object.keys({record})"));
            }
            if expression_is_associated_path(&call.func, "Record", "default")
                && call.args.is_empty()
            {
                return Ok("{}".to_string());
            }
            if expression_path_ends_with(&call.func, "throw_range_error") && call.args.len() == 1 {
                return Ok(format!(
                    "(() => {{ throw new RangeError({}); }})()",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_path_ends_with(&call.func, "throw_error") && call.args.len() == 1 {
                return Ok(format!(
                    "(() => {{ throw new Error({}); }})()",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_path_ends_with(&call.func, "throw_type_error") && call.args.len() == 1 {
                return Ok(format!(
                    "(() => {{ throw new TypeError({}); }})()",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_path_ends_with(&call.func, "throw_syntax_error") && call.args.len() == 1 {
                return Ok(format!(
                    "(() => {{ throw new SyntaxError({}); }})()",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "panic", "panic_any")
                && call.args.len() == 1
            {
                if let Some((constructor, message)) = flight_error_throw(&call.args[0]) {
                    return Ok(format!(
                        "(() => {{ throw new {constructor}({}); }})()",
                        emit_expression(message, entities)?
                    ));
                }
                return Ok(format!(
                    "(() => {{ throw {}; }})()",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            let function = if let Expr::Path(path) = call.func.as_ref()
                && path.qself.is_none()
                && path.path.segments.len() > 1
                && path.path.segments.first().is_some_and(|segment| {
                    vitest_current_path_prefix(entities, &segment.ident.to_string()).is_some()
                }) {
                if is_vitest_crate_root_test_support_function(&path.path, entities) {
                    emit_expression(&call.func, entities)?
                } else {
                    let binding = vitest_function_path_binding_name(&path.path, entities)?
                        .ok_or_else(|| {
                            compile_error("current-package function path has no binding")
                        })?;
                    export_name(entities, &binding)
                        .map_or_else(|| emit_path_segment(&binding), str::to_string)
                }
            } else {
                emit_expression(&call.func, entities)?
            };
            let function_name = match call.func.as_ref() {
                Expr::Path(path) => path
                    .path
                    .segments
                    .last()
                    .map(|segment| segment.ident.to_string()),
                _ => None,
            };
            let arguments = call
                .args
                .iter()
                .enumerate()
                .map(|(index, argument)| {
                    let nullable = function_name.as_ref().is_some_and(|function_name| {
                        entities.contains(&format!(
                            "{NULLABLE_CALL_MARKER}{function_name}:{index}"
                        ))
                    });
                    if expression_is_none(argument) {
                        return Ok(if nullable {
                            "null".to_string()
                        } else {
                            "undefined".to_string()
                        });
                    }
                    if let Some(function_name) = &function_name
                        && entities.contains(&format!(
                            "{MUTABLE_SCALAR_REFERENCE_ARGUMENT_MARKER}{function_name}:{index}"
                        ))
                        && let Expr::Reference(reference) = argument
                    {
                        let Expr::Path(path) = reference.expr.as_ref() else {
                            return Err(compile_error(format!(
                                "mutable scalar reference argument {index} of `{function_name}` refuses borrowed fields or elements, reborrows, and non-local arguments"
                            )));
                        };
                        let Some(local) = path.path.get_ident() else {
                            return Err(compile_error(format!(
                                "mutable scalar reference argument {index} of `{function_name}` requires one unambiguous local binding"
                            )));
                        };
                        let local = local.to_string();
                        let approved = reference.mutability.is_some()
                            && lexical_binding(entities, &local).is_some_and(|id| {
                                entities.contains(&format!(
                                    "{VITEST_MUTABLE_SCALAR_CELL_LOCAL_BINDING_MARKER}{id}"
                                ))
                            });
                        if approved {
                            return Ok(emit_path_segment(&local));
                        }
                        return Err(compile_error(format!(
                            "mutable scalar reference argument {index} of `{function_name}` is supported only for a proven non-escaping local in a portable test"
                        )));
                    }
                    let value = emit_expression(argument, entities)?;
                    if nullable {
                        return Ok(nullable_option_value(argument, value));
                    }
                    let Some(function_name) = &function_name else {
                        return Ok(value);
                    };
                    let kinds = marker_suffixes(
                        entities,
                        &format!("{SLICE_ARGUMENT_MARKER}{function_name}:{index}:"),
                    );
                    let uint8_kinds = kinds
                        .iter()
                        .filter(|kind| kind.starts_with("uint8-"))
                        .collect::<Vec<_>>();
                    if uint8_kinds.len() == 1 {
                        if expression_typed_array(argument, entities).as_deref()
                            == Some("Uint8Array")
                        {
                            return Ok(value);
                        }
                        if uint8_kinds[0].as_str() == "uint8-mut-slice" {
                            return Err(compile_error(format!(
                                "a number array cannot be passed to the mutable Uint8Array argument {index} of `{function_name}` without losing shared mutation"
                            )));
                        }
                        return Ok(format!("new Uint8Array({value})"));
                    }
                    if expression_typed_array(argument, entities).is_none() {
                        return Ok(value);
                    }
                    if kinds.contains("fixed-buffer") {
                        return Ok(value);
                    }
                    if kinds.len() == 1 && kinds.contains("slice") {
                        return Ok(format!("Array.from({value})"));
                    }
                    if kinds.contains("mut-slice") {
                        return Err(compile_error(format!(
                            "a fixed typed array cannot be passed to the mutable slice argument {index} of `{function_name}`: TypeScript has no shared view of it as `number[]`; pass a `Vec`"
                        )));
                    }
                    Ok(value)
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("{function}({})", arguments.join(", ")))
        }
        Expr::Cast(cast) if is_integer_cast_elided(&cast.expr, &cast.ty, entities) => {
            emit_expression(&cast.expr, entities)
        }
        Expr::Cast(cast) if integer_literal_fits_cast(&cast.expr, &cast.ty) => {
            emit_expression(&cast.expr, entities)
        }
        Expr::Cast(cast)
            if matches!(&*cast.expr, Expr::Lit(lit) if matches!(&lit.lit, syn::Lit::Char(_)))
                && (type_is_named(&cast.ty, "u8")
                    || type_is_named(&cast.ty, "u16")
                    || type_is_named(&cast.ty, "u32")
                    || type_is_named(&cast.ty, "usize")
                    || type_is_named(&cast.ty, "i8")
                    || type_is_named(&cast.ty, "i16")
                    || type_is_named(&cast.ty, "i32")
                    || type_is_named(&cast.ty, "isize")) =>
        {
            if let Expr::Lit(lit) = &*cast.expr
                && let syn::Lit::Char(c) = &lit.lit
            {
                Ok(format!("{}", c.value() as u32))
            } else {
                unreachable!()
            }
        }
        Expr::Cast(cast) if type_is_named(&cast.ty, "u8") => {
            let operand = emit_binary_operand(&cast.expr, entities, 7, false)?;
            Ok(format!("{operand} & 0xff"))
        }
        Expr::Cast(cast) if type_is_named(&cast.ty, "u16") => {
            let operand = emit_binary_operand(&cast.expr, entities, 7, false)?;
            Ok(format!("{operand} & 0xffff"))
        }
        Expr::Cast(cast)
            if (type_is_named(&cast.ty, "u32")
                || type_is_named(&cast.ty, "usize")
                || type_is_named(&cast.ty, "i32")
                || type_is_named(&cast.ty, "isize"))
                && referenced_path_identifier(&cast.expr).is_some_and(|identifier| {
                    entities.contains(&format!("{CHAR_EXPRESSION_MARKER}{identifier}"))
                }) =>
        {
            let operand = emit_expression(&cast.expr, entities)?;
            Ok(format!("{operand}.codePointAt(0)!"))
        }
        Expr::Cast(cast) if type_is_named(&cast.ty, "u32") || type_is_named(&cast.ty, "usize") => {
            let operand = emit_binary_operand(&cast.expr, entities, 10, false)?;
            Ok(format!("{operand} >>> 0"))
        }
        Expr::Cast(cast) if type_is_named(&cast.ty, "i8") => {
            let operand = emit_binary_operand(&cast.expr, entities, 10, false)?;
            Ok(format!("{operand} << 24 >> 24"))
        }
        Expr::Cast(cast) if type_is_named(&cast.ty, "i16") => {
            let operand = emit_binary_operand(&cast.expr, entities, 10, false)?;
            Ok(format!("{operand} << 16 >> 16"))
        }
        Expr::Cast(cast) if type_is_named(&cast.ty, "i32") || type_is_named(&cast.ty, "isize") => {
            let operand = emit_binary_operand(&cast.expr, entities, 5, false)?;
            Ok(format!("{operand} | 0"))
        }
        Expr::Cast(cast) if type_is_named(&cast.ty, "char") => {
            let operand = emit_expression(&cast.expr, entities)?;
            Ok(format!("String.fromCharCode({operand})"))
        }
        Expr::Cast(cast) => emit_expression(&cast.expr, entities),
        Expr::Closure(closure) => emit_closure(closure, entities),
        Expr::Field(field) => {
            reject_unresolved_pattern_field(&field.base, entities)?;
            let base = emit_expression(&field.base, entities)?;
            if let Some(store) = entity_runtime_state_access(field, entities)? {
                return Ok(format!("{store}.get({base})!"));
            }
            match &field.member {
                syn::Member::Named(identifier) => Ok(format!(
                    "{base}.{}",
                    snake_to_lower_camel(&identifier.to_string())
                )),
                syn::Member::Unnamed(index) => Ok(format!("{base}[{}]", index.index)),
            }
        }
        Expr::Group(group) => emit_expression(&group.expr, entities),
        Expr::Index(index) if is_record_map_local(&index.expr, entities) => Ok(format!(
            "{}[{}]",
            emit_expression(&index.expr, entities)?,
            emit_expression(&index.index, entities)?
        )),
        Expr::Index(index) => {
            let receiver = emit_expression(&index.expr, entities)?;
            if let Expr::Range(range) = index.index.as_ref() {
                // Rust bounds-checks range indexing while `.slice` clamps, and these two forms have no
                // valid `.slice` emission yet, so they are rejected until range slices are lowered
                // with Rust bounds.
                if matches!(range.limits, syn::RangeLimits::Closed(_)) {
                    return Err(compile_error(
                        "portable inclusive range index `a..=b` is not supported",
                    ));
                }
                let start = range
                    .start
                    .as_deref()
                    .map(|start| emit_expression(start, entities))
                    .transpose()?
                    .unwrap_or_else(|| "0".to_string());
                let end = range
                    .end
                    .as_deref()
                    .map(|end| emit_expression(end, entities))
                    .transpose()?;
                return Ok(match end {
                    Some(end) => format!("{receiver}.slice({start}, {end})"),
                    None if start.is_empty() => format!("{receiver}.slice()"),
                    None => format!("{receiver}.slice({start})"),
                });
            }
            Ok(format!(
                "{receiver}[{}]",
                emit_expression(&index.index, entities)?
            ))
        }
        Expr::If(expression) => emit_if_expression(expression, entities),
        Expr::Loop(loop_expr) => emit_loop_value_expression(loop_expr, entities),
        Expr::Lit(literal) => emit_literal(&literal.lit),
        Expr::Macro(expression) => emit_macro_expression(&expression.mac, entities),
        Expr::Match(expression) => emit_match_expression(expression, entities),
        Expr::MethodCall(call) => emit_method_call(call, entities),
        Expr::Paren(paren) => emit_expression(&paren.expr, entities),
        Expr::Path(path) => {
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1
            {
                let js_name = emit_path_segment(&path.path.segments[0].ident.to_string());
                let rename_prefix = format!("{RENAME_MARKER}{js_name}=");
                if let Some(marker) = entities.iter().find(|m| m.starts_with(&rename_prefix)) {
                    return Ok(marker[rename_prefix.len()..].to_string());
                }
            }
            if path.qself.is_none() && path.path.segments.len() == 1 {
                let name = path.path.segments[0].ident.to_string();
                if let Some(bound) = lexical_binding(entities, &name) {
                    let prefix = format!("{ITER_MUT_ALIAS_MARKER}{bound}=");
                    if let Some(marker) = entities.iter().find(|m| m.starts_with(&prefix)) {
                        return Ok(marker[prefix.len()..].to_string());
                    }
                    if entities.contains(&format!(
                        "{VITEST_MUTABLE_SCALAR_CELL_LOCAL_BINDING_MARKER}{bound}"
                    )) || entities.contains(&format!(
                        "{MUTABLE_SCALAR_CELL_PARAMETER_BINDING_MARKER}{bound}"
                    )) {
                        return Ok(format!("{}.value", emit_path_segment(&name)));
                    }
                }
            }
            if path.qself.is_none()
                && path.path.segments.len() == 1
                && let Some(target) = ref_alias_target(entities, expression)?
            {
                return emit_expression(&target, entities);
            }
            if path.qself.is_none()
                && path.path.segments.len() == 1
                && let Some(id) =
                    lexical_binding(entities, &path.path.segments[0].ident.to_string())
                && entities.contains(&format!("{DIRECT_LOCK_GUARD_REPLACED_MARKER}{id}"))
                && let Some(target) = direct_lock_guard_target(entities, &id)?
            {
                return emit_expression(&target, entities);
            }
            if let Some((owner, variant)) = associated_owner_and_member(expression)
                && is_tagged_data_union_variant(entities, &owner, &variant)
            {
                if !data_union_unit(entities, &owner, &variant) {
                    return Err(compile_error(format!(
                        "tagged data union payload variant `{owner}::{variant}` needs named fields"
                    )));
                }
                return Ok(format!(
                    "{{ kind: {} as const }}",
                    js_string_literal(&lower_camel_from_upper_camel(&variant))
                ));
            }
            if let Some((owner, variant, _)) = data_union_expression_variant(expression, entities) {
                return if data_union_unit(entities, &owner, &variant) {
                    Ok("null".to_string())
                } else {
                    Ok("(value) => value".to_string())
                };
            }
            if let Some(value) = ordering_variant_value(&path.path) {
                return Ok(value.to_string());
            }
            // A qualified string-union variant (`flight_path::PathWinding::NonZero`) is its owner's
            // variant: emit the canonical `Owner.Variant` form that string-union lowering rewrites from
            // the owner's metadata, never a namespace property of the qualifying module.
            if path.qself.is_none()
                && path.path.segments.len() > 2
                && let Some((owner, variant)) = path_owner_and_member(&path.path)
                && is_string_union(entities, &owner)
            {
                return Ok(format!("{owner}.{variant}"));
            }
            if path.path.is_ident("None") {
                return Ok(if entities.contains(NULLABLE_OPTIONS_MARKER) {
                    "null".to_string()
                } else {
                    "undefined".to_string()
                });
            }
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1
                && let Some(name) =
                    frozen_object_name(entities, &path.path.segments[0].ident.to_string())
            {
                return Ok(name.to_string());
            }
            if (path.path.leading_colon.is_some() || path.path.segments.len() > 1)
                && let Some(last) = path.path.segments.last()
                && const_group_member_reference(entities, &last.ident.to_string()).is_some()
            {
                return Err(compile_error(format!(
                    "qualified `const-group` member path `{}` has no portable lowering; reference the member by its bare name",
                    quote::ToTokens::to_token_stream(&path.path)
                        .to_string()
                        .replace(' ', "")
                )));
            }
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1
                && let Some(reference) =
                    const_group_member_reference(entities, &path.path.segments[0].ident.to_string())
            {
                return Ok(reference.to_string());
            }
            if expression_is_associated_path(expression, "f32", "min")
                || expression_is_associated_path(expression, "f64", "min")
            {
                return Ok("Math.min".to_string());
            }
            if expression_is_associated_path(expression, "f32", "max")
                || expression_is_associated_path(expression, "f64", "max")
            {
                return Ok("Math.max".to_string());
            }
            if path_is_float_constant(&path.path, "NAN") {
                return Ok("Number.NaN".to_string());
            }
            if path_is_float_constant(&path.path, "INFINITY") {
                return Ok("Number.POSITIVE_INFINITY".to_string());
            }
            if path_is_float_constant(&path.path, "EPSILON") {
                let rust_type = float_constant_type(&path.path).unwrap_or("f64");
                return if rust_type == "f32" {
                    Ok("Math.pow(2, -23)".to_string())
                } else {
                    Ok("Number.EPSILON".to_string())
                };
            }
            if float_constant_type(&path.path).is_some()
                && let Some(name) = path.path.segments.last().map(|s| s.ident.to_string())
                && let Some(value) = float_const_js_value(&name)
            {
                return Ok(value.to_string());
            }
            if path_is_float_constant(&path.path, "MAX") {
                return Ok("Number.MAX_VALUE".to_string());
            }
            if path_is_type_constant(&path.path, "u8", "MAX") {
                return Ok("0xff".to_string());
            }
            if path_is_type_constant(&path.path, "u16", "MAX") {
                return Ok("0xffff".to_string());
            }
            if path_is_type_constant(&path.path, "u32", "MAX")
                || path_is_type_constant(&path.path, "usize", "MAX")
            {
                return Ok("0xffffffff".to_string());
            }
            if path_is_type_constant(&path.path, "i8", "MAX") {
                return Ok("0x7f".to_string());
            }
            if path_is_type_constant(&path.path, "i8", "MIN") {
                return Ok("(-0x80)".to_string());
            }
            if path_is_type_constant(&path.path, "i16", "MAX") {
                return Ok("0x7fff".to_string());
            }
            if path_is_type_constant(&path.path, "i16", "MIN") {
                return Ok("(-0x8000)".to_string());
            }
            if path_is_type_constant(&path.path, "i32", "MAX")
                || path_is_type_constant(&path.path, "isize", "MAX")
            {
                return Ok("0x7fffffff".to_string());
            }
            if path_is_type_constant(&path.path, "i32", "MIN")
                || path_is_type_constant(&path.path, "isize", "MIN")
            {
                return Ok("(-0x80000000)".to_string());
            }
            if path_is_type_constant(&path.path, "u8", "BITS")
                || path_is_type_constant(&path.path, "i8", "BITS")
            {
                return Ok("8".to_string());
            }
            if path_is_type_constant(&path.path, "u16", "BITS")
                || path_is_type_constant(&path.path, "i16", "BITS")
            {
                return Ok("16".to_string());
            }
            if path_is_type_constant(&path.path, "u32", "BITS")
                || path_is_type_constant(&path.path, "i32", "BITS")
                || path_is_type_constant(&path.path, "usize", "BITS")
                || path_is_type_constant(&path.path, "isize", "BITS")
            {
                return Ok("32".to_string());
            }
            if path_is_float_constant(&path.path, "MIN_POSITIVE") {
                return Ok("2.2250738585072014e-308".to_string());
            }
            if path_is_float_constant(&path.path, "NEG_INFINITY") {
                return Ok("Number.NEGATIVE_INFINITY".to_string());
            }
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1
            {
                let name = path.path.segments[0].ident.to_string();
                if entities.contains(&format!("{FLOAT_CONST_MARKER}{name}"))
                    && let Some(value) = float_const_js_value(&name)
                {
                    return Ok(value.to_string());
                }
            }
            if let Some((numeric_type, method)) = associated_numeric_method(expression) {
                return emit_numeric_function_reference(&numeric_type, &method);
            }
            let last = path.path.segments.len() - 1;
            let rendered = path
                .path
                .segments
                .iter()
                .enumerate()
                .map(|(index, segment)| {
                    let segment = segment.ident.to_string();
                    return (index == last)
                        .then(|| export_name(entities, &segment))
                        .flatten()
                        .map_or_else(|| emit_path_segment(&segment), str::to_string);
                })
                .collect::<Vec<_>>()
                .join(".");
            Ok(rendered)
        }
        Expr::Reference(reference) => emit_expression(&reference.expr, entities),
        Expr::Range(range) => {
            let Some(end) = &range.end else {
                return Err(compile_error("portable Rust range needs an end"));
            };
            let start = range
                .start
                .as_deref()
                .map(|start| emit_expression(start, entities))
                .transpose()?
                .unwrap_or_else(|| "0".to_string());
            let end = emit_expression(end, entities)?;
            let inclusive = if matches!(range.limits, syn::RangeLimits::Closed(_)) {
                " + 1"
            } else {
                ""
            };
            Ok(format!(
                "Array.from({{ length: {end} - {start}{inclusive} }}, (_, index) => {start} + index)"
            ))
        }
        Expr::Repeat(repeat) => {
            let value = emit_expression(&repeat.expr, entities)?;
            let length = emit_expression(&repeat.len, entities)?;
            if let Some(array_type) = typed_array_for_literal(&repeat.expr) {
                return Ok(format!("new {array_type}({length}).fill({value})"));
            }
            Ok(format!("new Array({length}).fill({value})"))
        }
        Expr::Struct(structure) => {
            if let Some(owner) = structure
                .path
                .segments
                .last()
                .map(|segment| segment.ident.to_string())
                && entity_runtime_state_is_designated(entities, &owner)
            {
                return Err(compile_error(format!(
                    "a `{owner}` struct literal would expose its designated entity runtime state as a public property; allocate it with `allocate_entity` and assign the state field"
                )));
            }
            if let Some((owner, variant)) = path_owner_and_member(&structure.path)
                && is_tagged_data_union_variant(entities, &owner, &variant)
            {
                if data_union_unit(entities, &owner, &variant) {
                    return Err(compile_error(format!(
                        "tagged data union unit variant `{owner}::{variant}` cannot declare fields"
                    )));
                }
                if structure.rest.is_some() {
                    return Err(compile_error(
                        "tagged data union construction cannot use a struct update",
                    ));
                }
                let mut fields = vec![format!(
                    "kind: {} as const",
                    js_string_literal(&lower_camel_from_upper_camel(&variant))
                )];
                fields.extend(
                    structure
                        .fields
                        .iter()
                        .map(|field| {
                            let member = emit_member(&field.member);
                            let value = emit_expression(&field.expr, entities)?;
                            if member == value {
                                Ok(member)
                            } else {
                                Ok(format!("{member}: {value}"))
                            }
                        })
                        .collect::<Result<Vec<_>, CompileError>>()?,
                );
                return Ok(format!("{{ {} }}", fields.join(", ")));
            }
            // The literal's struct by canonical identity, so a same-named struct of another source
            // never lends its nullable designations.
            let structure_identity = context_type_identity(
                entities,
                &Type::Path(syn::TypePath {
                    qself: None,
                    path: structure.path.clone(),
                }),
            );
            let mut fields = Vec::new();
            if let Some(rest) = &structure.rest {
                fields.push(format!("...{}", emit_expression(rest, entities)?));
            }
            fields.extend(
                structure
                    .fields
                    .iter()
                    .map(|field| {
                        let mut value = if expression_is_empty_vec(&field.expr, entities) {
                            "[]".to_string()
                        } else if let syn::Member::Named(field_name) = &field.member
                            && let Some(owner) = structure.path.segments.last()
                            && entities.contains(&format!(
                                "{D15_FUTURE_FIELD_MARKER}{}.{field_name}",
                                owner.ident
                            ))
                            && d15_future_field_closure(&field.expr)
                        {
                            let mut field_context = entities.clone();
                            field_context.insert(D15_FUTURE_CLOSURE_MARKER.to_string());
                            emit_expression(&field.expr, &field_context)?
                        } else {
                            emit_expression(&field.expr, entities)?
                        };
                        if let syn::Member::Named(field_name) = &field.member
                            && let Some(identity) = &structure_identity
                        {
                            if type_script_array_field(entities, identity, field_name).is_some() {
                                value = contract_array_field_value(
                                    &field.expr,
                                    value,
                                    entities,
                                    identity,
                                    field_name,
                                );
                            } else if is_nullable_literal_field(entities, identity, field_name) {
                                value = nullable_option_value(&field.expr, value);
                            } else if is_ordinary_option_literal_field(
                                entities, identity, field_name,
                            ) {
                                value = ordinary_option_value(&field.expr, value);
                            }
                        }
                        let member = emit_member(&field.member);
                        if member == value {
                            Ok(member)
                        } else {
                            Ok(format!("{member}: {value}"))
                        }
                    })
                    .collect::<Result<Vec<_>, CompileError>>()?,
            );
            Ok(format!("{{ {} }}", fields.join(", ")))
        }
        Expr::Tuple(tuple) if tuple.elems.is_empty() => Ok("undefined".to_string()),
        Expr::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| emit_expression(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Expr::Try(try_expr) => {
            let key = try_expr.to_token_stream().to_string();
            let prefix = format!("{TRY_SUBSTITUTION_MARKER}{key}=");
            if let Some(marker) = entities.iter().find(|m| m.starts_with(&prefix)) {
                let temp = marker[prefix.len()..].to_string();
                Ok(temp)
            } else {
                Err(compile_error(
                    "portable `?` in expression position has no lowering; bind the result first with `let x = expr?;`",
                ))
            }
        }
        Expr::Unary(unary) => emit_unary_expression(unary, entities),
        _ => Err(compile_error(format!(
            "unsupported Rust expression `{}`",
            expression_kind(expression)
        ))),
    };
}

pub(super) fn emit_block_expression(
    block: &syn::Block,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let Some((last, preceding)) = block.stmts.split_last() else {
        return Err(compile_error("portable value block cannot be empty"));
    };
    reject_function_exits_in_value_position(
        |visitor| visitor.visit_block(block),
        "portable value block",
    )?;
    match last {
        // A block that is only its tail value is that value; no scope needs a function around it.
        Stmt::Expr(value, None) if preceding.is_empty() => {
            return Ok(format!("({})", emit_expression(value, entities)?));
        }
        Stmt::Expr(value, None) => {
            let mut out = "(() => {\n".to_string();
            let block_context = emit_block_with_context(&mut out, preceding, entities, 1)?;
            write_indent(&mut out, 1);
            writeln!(out, "return {};", emit_expression(value, &block_context)?)
                .expect("writing to a String cannot fail");
            out.push_str("})()");
            return Ok(out);
        }
        Stmt::Expr(value, Some(_)) if expression_is_diverging(value) => {
            let mut out = "(() => {\n".to_string();
            let block_context = emit_block_with_context(&mut out, preceding, entities, 1)?;
            write_indent(&mut out, 1);
            writeln!(out, "{}", emit_diverging_statement(value, &block_context)?)
                .expect("writing to a String cannot fail");
            out.push_str("})()");
            return Ok(out);
        }
        Stmt::Macro(statement) if statement_macro_is_diverging(statement) => {
            let macro_expr = Expr::Macro(syn::ExprMacro {
                attrs: statement.attrs.clone(),
                mac: statement.mac.clone(),
            });
            let mut out = "(() => {\n".to_string();
            let block_context = emit_block_with_context(&mut out, preceding, entities, 1)?;
            write_indent(&mut out, 1);
            writeln!(
                out,
                "{}",
                emit_diverging_statement(&macro_expr, &block_context)?
            )
            .expect("writing to a String cannot fail");
            out.push_str("})()");
            return Ok(out);
        }
        Stmt::Expr(_, Some(_)) | Stmt::Local(_) | Stmt::Macro(_) => {
            let mut out = "(() => {\n".to_string();
            emit_block(&mut out, &block.stmts, entities, 1)?;
            out.push_str("})()");
            return Ok(out);
        }
        _ => {
            return Err(compile_error(
                "portable value block must end with an expression",
            ));
        }
    }
}

pub(super) fn emit_async_block_expression(
    block: &syn::Block,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let Some((last, preceding)) = block.stmts.split_last() else {
        return Ok("(async () => undefined)()".to_string());
    };
    match last {
        Stmt::Expr(value, None) if preceding.is_empty() => {
            let body = concise_arrow_body(emit_expression(value, entities)?);
            Ok(format!("(async () => {body})()"))
        }
        Stmt::Expr(value, None) => {
            let mut out = "(async () => {\n".to_string();
            let block_context = emit_block_with_context(&mut out, preceding, entities, 1)?;
            write_indent(&mut out, 1);
            writeln!(out, "return {};", emit_expression(value, &block_context)?)
                .expect("writing to a String cannot fail");
            out.push_str("})()");
            Ok(out)
        }
        Stmt::Expr(value, Some(_)) if expression_is_diverging(value) => {
            let mut out = "(async () => {\n".to_string();
            let block_context = emit_block_with_context(&mut out, preceding, entities, 1)?;
            write_indent(&mut out, 1);
            writeln!(out, "{}", emit_diverging_statement(value, &block_context)?)
                .expect("writing to a String cannot fail");
            out.push_str("})()");
            Ok(out)
        }
        _ => {
            let mut out = "(async () => {\n".to_string();
            let block_context = emit_block_with_context(&mut out, &block.stmts, entities, 1)?;
            let _ = &block_context;
            out.push_str("})()");
            Ok(out)
        }
    }
}

pub(crate) fn emit_expression_for_type(
    expression: &Expr,
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if let Expr::Reference(reference) = expression {
        return emit_expression_for_type(&reference.expr, rust_type, entities);
    }
    if matches!(expression, Expr::Struct(_)) && context_type_identity(entities, rust_type).is_some()
    {
        return emit_contextual_struct_literal_expression(expression, entities);
    }
    if let Some(expression) = expression_with_contextual_parse_type(expression, rust_type) {
        return emit_expression(&expression, entities);
    }
    if let Some(array_type) = typed_array_alias_for_type(rust_type)
        && let Some(value) = emit_typed_array_vec_repeat(expression, array_type, entities)?
    {
        return Ok(value);
    }
    return match rust_type {
        Type::Array(array_type) => match expression {
            Expr::Array(array) => {
                let elements = array
                    .elems
                    .iter()
                    .map(|element| emit_expression_for_type(element, &array_type.elem, entities))
                    .collect::<Result<Vec<_>, _>>()?;
                let value = format!("[{}]", elements.join(", "));
                if let Some(array_type) = typed_array_for_type(&array_type.elem) {
                    Ok(format!("new {array_type}({value})"))
                } else {
                    Ok(value)
                }
            }
            Expr::Repeat(repeat) => {
                let value = emit_expression_for_type(&repeat.expr, &array_type.elem, entities)?;
                let length = emit_expression(&repeat.len, entities)?;
                if let Some(array_type) = typed_array_for_type(&array_type.elem) {
                    Ok(format!("new {array_type}({length}).fill({value})"))
                } else {
                    Ok(format!("new Array({length}).fill({value})"))
                }
            }
            _ => emit_expression(expression, entities),
        },
        Type::Paren(paren) => emit_expression_for_type(expression, &paren.elem, entities),
        Type::Reference(reference) => {
            emit_expression_for_type(expression, &reference.elem, entities)
        }
        Type::Slice(slice) => match expression {
            Expr::Array(array) => {
                let elements = array
                    .elems
                    .iter()
                    .map(|element| emit_expression_for_type(element, &slice.elem, entities))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(format!("[{}]", elements.join(", ")))
            }
            _ => emit_expression(expression, entities),
        },
        Type::Tuple(tuple_type) => match expression {
            Expr::Tuple(tuple) if tuple.elems.is_empty() && tuple_type.elems.is_empty() => {
                Ok("undefined".to_string())
            }
            Expr::Tuple(tuple) if tuple.elems.len() == tuple_type.elems.len() => {
                let elements = tuple
                    .elems
                    .iter()
                    .zip(&tuple_type.elems)
                    .map(|(element, element_type)| {
                        emit_expression_for_type(element, element_type, entities)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(format!("[{}]", elements.join(", ")))
            }
            Expr::Tuple(_) => Err(compile_error(
                "tuple initializer length does not match its Rust type",
            )),
            _ => emit_expression(expression, entities),
        },
        _ => emit_expression(expression, entities),
    };
}

// Rust infers `str::parse`'s target from an explicitly typed local when the Result is consumed
// directly. Preserve that proven context without extending it through arbitrary calls, whose
// parameter type may differ from the surrounding local's type.
pub(super) fn expression_with_contextual_parse_type(
    expression: &Expr,
    rust_type: &Type,
) -> Option<Expr> {
    fn peel_group_and_paren_mut(expression: &mut Expr) -> &mut Expr {
        match expression {
            Expr::Group(group) => peel_group_and_paren_mut(&mut group.expr),
            Expr::Paren(paren) => peel_group_and_paren_mut(&mut paren.expr),
            _ => expression,
        }
    }

    let mut contextual = expression.clone();
    let Expr::MethodCall(consumer) = peel_group_and_paren_mut(&mut contextual) else {
        return None;
    };
    let direct_consumer = (consumer.method == "unwrap" && consumer.args.is_empty())
        || (consumer.method == "expect" && consumer.args.len() == 1);
    if !direct_consumer {
        return None;
    }
    let Expr::MethodCall(parse) = peel_group_and_paren_mut(&mut consumer.receiver) else {
        return None;
    };
    if parse.method != "parse"
        || !parse.args.is_empty()
        || parse.turbofish.is_some()
        || !matches!(rust_type, Type::Path(_))
    {
        return None;
    }
    parse.turbofish = Some(syn::parse_quote!(::<#rust_type>));
    return Some(contextual);
}

pub(super) fn emit_contextual_struct_literal_expression(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    match expression {
        Expr::Call(call) if call.args.len() == 1 => {
            if expression_is_associated_path(&call.func, "Arc", "new") {
                return emit_contextual_struct_literal_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "Mutex", "new") {
                return Ok(format!(
                    "{{ value: {} }}",
                    emit_contextual_struct_literal_expression(&call.args[0], entities)?
                ));
            }
        }
        Expr::Group(group) => {
            return emit_contextual_struct_literal_expression(&group.expr, entities);
        }
        Expr::Paren(paren) => {
            return Ok(format!(
                "({})",
                emit_contextual_struct_literal_expression(&paren.expr, entities)?
            ));
        }
        Expr::Reference(reference) => {
            return emit_contextual_struct_literal_expression(&reference.expr, entities);
        }
        Expr::Struct(structure) if structure.qself.is_none() => {
            let Some(structure_name) = vitest_path_binding_name(&structure.path, entities)
                .filter(|name| is_vitest_struct(entities, name))
            else {
                return emit_expression(expression, entities);
            };
            let structure_identity = vitest_struct_owner(entities, &structure_name);
            let mut fields = Vec::new();
            if let Some(rest) = &structure.rest {
                fields.push(format!("...{}", emit_expression(rest, entities)?));
            }
            fields.extend(
                structure
                    .fields
                    .iter()
                    .map(|field| {
                        let value = if expression_is_empty_vec(&field.expr, entities) {
                            "[]".to_string()
                        } else {
                            let field_context = contextual_struct_field_context(
                                entities,
                                &structure_name,
                                structure_identity.as_deref(),
                                &field.member,
                                &field.expr,
                            );
                            emit_expression(&field.expr, &field_context)?
                        };
                        // A `nullable-option` field of the literal's canonical struct stores `null`.
                        let literal_identity = context_type_identity(
                            entities,
                            &Type::Path(syn::TypePath {
                                qself: None,
                                path: structure.path.clone(),
                            }),
                        );
                        let value = match (&field.member, literal_identity) {
                            (syn::Member::Named(field_name), Some(identity))
                                if type_script_array_field(entities, &identity, field_name)
                                    .is_some() =>
                            {
                                contract_array_field_value(
                                    &field.expr,
                                    value,
                                    entities,
                                    &identity,
                                    field_name,
                                )
                            }
                            (syn::Member::Named(field_name), Some(identity))
                                if is_nullable_literal_field(entities, &identity, field_name) =>
                            {
                                nullable_option_value(&field.expr, value)
                            }
                            (syn::Member::Named(field_name), Some(identity))
                                if is_ordinary_option_literal_field(
                                    entities, &identity, field_name,
                                ) =>
                            {
                                ordinary_option_value(&field.expr, value)
                            }
                            _ => value,
                        };
                        let member = emit_member(&field.member);
                        if member == value {
                            Ok(member)
                        } else {
                            Ok(format!("{member}: {value}"))
                        }
                    })
                    .collect::<Result<Vec<_>, CompileError>>()?,
            );
            return Ok(format!("{{ {} }}", fields.join(", ")));
        }
        _ => {}
    }
    return emit_expression(expression, entities);
}

pub(super) fn contextual_struct_field_context(
    entities: &HashSet<String>,
    structure: &str,
    structure_identity: Option<&str>,
    member: &syn::Member,
    expression: &Expr,
) -> HashSet<String> {
    let mut context = entities.clone();
    if let Some(structure_identity) = structure_identity
        && let syn::Member::Named(field) = member
        && context.contains(&format!(
            "{NULLABLE_OPTION_FIELD_MARKER}{structure_identity}{PROVENANCE_SEPARATOR}{field}"
        ))
    {
        context.insert(NULLABLE_OPTIONS_MARKER.to_string());
    }
    let Some(closure) = contextual_field_closure(expression) else {
        return context;
    };
    let field = emit_member(member);
    for (index, pattern) in closure.inputs.iter().enumerate() {
        let Some(parameter) = closure_parameter_identifier(pattern) else {
            continue;
        };
        let prefix = format!("{VITEST_STRUCT_VEC_CALLBACK_MARKER}{structure}:{field}:{index}:");
        let markers = context
            .iter()
            .filter_map(|marker| marker.strip_prefix(&prefix))
            .map(|optional| {
                format!(
                    "{VEC_CLONE_EXPRESSION_MARKER}{}:{optional}",
                    snake_to_lower_camel(&parameter)
                )
            })
            .collect::<Vec<_>>();
        context.extend(markers);
    }
    return context;
}

pub(super) fn contextual_assignment_field_context(
    assignment: &syn::ExprAssign,
    entities: &HashSet<String>,
) -> HashSet<String> {
    let Expr::Field(field) = assignment.left.as_ref() else {
        return entities.clone();
    };
    let Some(identity) = expression_struct_name(&field.base, entities).or_else(|| {
        referenced_path_identifier(&field.base)
            .and_then(|local| vitest_struct_local(entities, &local))
    }) else {
        return entities.clone();
    };
    let Some(structure) = vitest_struct_name(&identity) else {
        return entities.clone();
    };
    return contextual_struct_field_context(
        entities,
        structure,
        Some(&identity),
        &field.member,
        &assignment.right,
    );
}

pub(super) fn contextual_field_closure(expression: &Expr) -> Option<&syn::ExprClosure> {
    return match expression {
        Expr::Call(call)
            if call.args.len() == 1
                && (expression_is_associated_path(&call.func, "Arc", "new")
                    || expression_is_associated_path(&call.func, "Box", "new")) =>
        {
            contextual_field_closure(&call.args[0])
        }
        Expr::Call(call)
            if call.args.len() == 1
                && (expression_is_path(&call.func, "Some")
                    || expression_is_path(&call.func, "Ok")) =>
        {
            contextual_field_closure(&call.args[0])
        }
        Expr::Closure(closure) => Some(closure),
        Expr::Group(group) => contextual_field_closure(&group.expr),
        Expr::Paren(paren) => contextual_field_closure(&paren.expr),
        Expr::Reference(reference) => contextual_field_closure(&reference.expr),
        _ => None,
    };
}
