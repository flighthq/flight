use std::collections::HashSet;

use syn::{Expr, GenericArgument, Lit};

use crate::{CompileError, compile_error};

use super::{
    FUNCTION_OWNER_MARKER, METHOD_DELEGATION_MARKER, NULLABLE_OPTIONS_MARKER, PRIMARY_PRECEDENCE,
    PROVENANCE_SEPARATOR, RECORD_CLONE_LOCAL_MARKER, VEC_CLONE_EXPRESSION_MARKER,
    constructor_path_default_value, current_source, emit_binary_operand, emit_closure,
    emit_encode_utf16_cmp, emit_entity_clone, emit_expression, emit_hash_collection_method,
    emit_option_combinator, emit_ordered_comparison, emit_record_map_method, emit_type,
    emitted_closure_is_identity, entity_clone_expression_owner, expression_contains_method,
    expression_hash_collection, expression_is_json_value, expression_is_known_string,
    expression_is_reusable, expression_is_sequence, expression_numeric_type,
    expression_struct_identity, expression_typed_array, function_identity_fact,
    immediate_receiver_is_method, inline_emitted_closure, is_record_map_local, js_string_literal,
    lexical_binding, marker_suffixes, method_chain_includes, named_type, numeric_dataview_info,
    numeric_native_integer_typed_array, option_absent_value, option_binding_fact_default,
    option_expression_payload, option_map_closure_default, parenthesize_compound,
    peel_reference_and_paren, referenced_path_identifier, resolve_owner,
    sequence_element_typed_array, snake_to_lower_camel, typed_array_literal,
};

pub(super) fn emit_method_call(
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if let Some(delegated) = delegated_method_call(call, entities)? {
        return emit_expression(&Expr::Call(delegated), entities);
    }
    if is_record_map_local(&call.receiver, entities) {
        return emit_record_map_method(call, entities);
    }
    if call.method == "wrapping_add"
        && call.args.len() == 1
        && let Expr::MethodCall(fetch) = call.receiver.as_ref()
        && fetch.method == "fetch_add"
        && fetch.args.len() == 2
    {
        let increment = emit_expression(&fetch.args[0], entities)?;
        let wrapped_increment = emit_expression(&call.args[0], entities)?;
        if increment == wrapped_increment {
            let state = emit_expression(&fetch.receiver, entities)?;
            return Ok(format!(
                "({state}.value = ({state}.value + {increment}) >>> 0)"
            ));
        }
    }
    if let Expr::MethodCall(entry) = call.receiver.as_ref() {
        if entry.method == "entry"
            && entry.args.len() == 1
            && expression_hash_collection(&entry.receiver, entities).is_some()
        {
            let map = emit_expression(&entry.receiver, entities)?;
            let key = emit_expression(&entry.args[0], entities)?;
            return match (call.method.to_string().as_str(), call.args.len()) {
                ("or_insert", 1) => {
                    let default = emit_expression(&call.args[0], entities)?;
                    Ok(format!(
                        "(<K, V>(entries: Map<K, V>, key: K, value: V): V => {{ if (!entries.has(key)) {{ entries.set(key, value); }} return entries.get(key)!; }})({map}, {key}, {default})"
                    ))
                }
                ("or_insert_with", 1) => {
                    if let Some(default) = constructor_path_default_value(&call.args[0]) {
                        Ok(format!(
                            "(<K, V>(entries: Map<K, V>, key: K, value: V): V => {{ if (!entries.has(key)) {{ entries.set(key, value); }} return entries.get(key)!; }})({map}, {key}, {default})"
                        ))
                    } else {
                        let init = emit_expression(&call.args[0], entities)?;
                        Ok(format!(
                            "(<K, V>(entries: Map<K, V>, key: K, init: () => V): V => {{ if (!entries.has(key)) {{ entries.set(key, init()); }} return entries.get(key)!; }})({map}, {key}, {init})"
                        ))
                    }
                }
                ("or_default", 0) => Err(compile_error(
                    "portable `HashMap::entry().or_default()` as an expression is not supported; use `.or_insert(value)` or `.or_insert_with(|| value)` instead, or use `*map.entry(key).or_default() += value` or `map.entry(key).or_default().push(value)` as statements",
                )),
                (method, args) => Err(compile_error(format!(
                    "portable `HashMap::entry().{method}` with {args} argument(s) has no portable lowering"
                ))),
            };
        }
    }
    if call.method == "contains"
        && call.args.len() == 1
        && let Expr::Range(range) = peel_reference_and_paren(&call.receiver)
        && let Some(lo) = &range.start
        && let Some(hi) = &range.end
    {
        let arg = emit_expression(peel_reference_and_paren(&call.args[0]), entities)?;
        let lo = emit_expression(lo, entities)?;
        let hi = emit_expression(hi, entities)?;
        let hi_op = if matches!(range.limits, syn::RangeLimits::Closed(_)) {
            "<="
        } else {
            "<"
        };
        return Ok(format!("({arg} >= {lo} && {arg} {hi_op} {hi})"));
    }
    let receiver = emit_expression(&call.receiver, entities)?;
    if let Some(kind) = expression_hash_collection(&call.receiver, entities) {
        return emit_hash_collection_method(call, &kind, &receiver, entities);
    }
    if call.method == "and_then" || call.method == "map" {
        if let Some(payload) = option_expression_payload(&call.receiver, entities) {
            return emit_option_combinator(call, &receiver, &payload, entities);
        }
        if call.method == "and_then" {
            if expression_is_sequence(&call.receiver, entities)
                || expression_is_known_string(&call.receiver, entities)
            {
                return Err(compile_error(
                    "portable `.and_then()` requires a receiver declared as Rust `Option`",
                ));
            }
            return emit_option_combinator(call, &receiver, "", entities);
        }
        // A Rust field has no `.map()` unless it is an Option (or another non-sequence type), so a
        // field whose owning struct does not resolve is rejected instead of lowered as an array map.
        if matches!(peel_reference_and_paren(&call.receiver), Expr::Field(_)) {
            return Err(compile_error(
                "portable `.map()` on a field requires the field to be declared as Rust `Option`",
            ));
        }
    }
    if call.method == "drain"
        && call.args.len() == 1
        && matches!(call.args.first(), Some(Expr::Range(range)) if range.start.is_none() && range.end.is_none())
    {
        return Ok(format!("{receiver}.splice(0, {receiver}.length)"));
    }
    let arguments = call
        .args
        .iter()
        .map(|argument| emit_expression(argument, entities))
        .collect::<Result<Vec<_>, _>>()?;
    let method = call.method.to_string();
    // Trait field accessors: *_fields() / *_fields_mut() / fields() / fields_mut() are identity
    // in TS because entity interfaces flatten the fields struct (Node extends NodeFields, Entity).
    if arguments.is_empty()
        && (method == "fields"
            || method == "fields_mut"
            || method.ends_with("_fields")
            || method.ends_with("_fields_mut"))
    {
        return Ok(receiver);
    }
    // Trait narrowing accessors: as_*_node() / as_*_node_mut() are identity in TS because
    // structural typing already carries the capability (the Option wrapper is Rust-only).
    if arguments.is_empty()
        && (method.starts_with("as_") && method.ends_with("_node")
            || method.starts_with("as_") && method.ends_with("_node_mut"))
    {
        return Ok(receiver);
    }
    // Bundled-reference accessors: transform2d() / transform3d() return a struct of field refs
    // that flatten to the entity in TS.
    if arguments.is_empty()
        && matches!(
            method.as_str(),
            "transform2d" | "transform2d_mut" | "transform3d" | "transform3d_mut"
        )
    {
        return Ok(receiver);
    }
    // Trait runtime accessors: *_runtime() / *_runtime_mut() lower to getXxxRuntime(receiver).
    if arguments.is_empty() && (method.ends_with("_runtime") || method.ends_with("_runtime_mut")) {
        let base = method.trim_end_matches("_mut");
        let mut camel = snake_to_lower_camel(base);
        camel[..1].make_ascii_uppercase();
        let ts_fn = format!("get{camel}");
        return Ok(format!("{ts_fn}({receiver})"));
    }
    if method == "fold" && arguments.len() == 2 {
        let reducer = match arguments[1].as_str() {
            "Math.max" => "(left, right) => Math.max(left, right)",
            "Math.min" => "(left, right) => Math.min(left, right)",
            reducer => reducer,
        };
        return Ok(format!("{receiver}.reduce({reducer}, {})", arguments[0]));
    }
    return match method.as_str() {
        "abs" if arguments.is_empty() => Ok(format!("Math.abs({receiver})")),
        "acos" if arguments.is_empty() => Ok(format!("Math.acos({receiver})")),
        "all" if arguments.len() == 1 => Ok(format!("{receiver}.every({})", arguments[0])),
        "any" if arguments.len() == 1 => Ok(format!("{receiver}.some({})", arguments[0])),
        "asin" if arguments.is_empty() => Ok(format!("Math.asin({receiver})")),
        "atan" if arguments.is_empty() => Ok(format!("Math.atan({receiver})")),
        "atan2" if arguments.len() == 1 => Ok(format!("Math.atan2({receiver}, {})", arguments[0])),
        "bytes" if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!("[...new TextEncoder().encode({receiver})]"))
        }
        "bytes" if arguments.is_empty() => Err(compile_error(
            "portable `.bytes()` requires a receiver known to be `String` or `str`",
        )),
        "ceil" if arguments.is_empty() => Ok(format!("Math.ceil({receiver})")),
        "cbrt" if arguments.is_empty() => Ok(format!("Math.cbrt({receiver})")),
        "clear" if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!("{receiver} = ''"))
        }
        "clear" if arguments.is_empty() && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!("{receiver}.length = 0"))
        }
        "clear" if arguments.is_empty() => Err(compile_error(format!(
            "portable `.clear()` receiver `{receiver}` must be known to be `String`, `Vec`, slice, `HashMap`, or `HashSet`"
        ))),
        "chars" if arguments.is_empty() => Ok(format!("[...{receiver}]")),
        "char_indices" if arguments.is_empty() => Ok(format!(
            "[...{receiver}].map((char, index) => [index, char] as const)"
        )),
        "chain" if arguments.len() == 1 => Ok(format!("[...{receiver}, ...{}]", arguments[0])),
        "checked_add" if arguments.len() == 1 => Ok(format!(
            "((a: number, b: number): number | undefined => {{ const sum = a + b; return sum > 0x7FFFFFFF || sum < -0x80000000 ? undefined : sum }})({receiver}, {})",
            arguments[0]
        )),
        "checked_mul" if arguments.len() == 1 => Ok(format!(
            "((a: number, b: number): number | undefined => {{ const product = a * b; return product > 0x7FFFFFFF || product < -0x80000000 ? undefined : product }})({receiver}, {})",
            arguments[0]
        )),
        "checked_sub" if arguments.len() == 1 => Ok(format!(
            "((a: number, b: number): number | undefined => {{ const diff = a - b; return diff > 0x7FFFFFFF || diff < -0x80000000 ? undefined : diff }})({receiver}, {})",
            arguments[0]
        )),
        "checked_neg" if arguments.is_empty() => Ok(format!(
            "((n: number): number | undefined => {{ const neg = -n; return neg > 0x7FFFFFFF || neg < -0x80000000 ? undefined : neg }})({receiver})"
        )),
        "chunks" if arguments.len() == 1 => Ok(format!(
            "(<T>(items: readonly T[], size: number): T[][] => {{ const result: T[][] = []; for (let i = 0; i < items.length; i += size) {{ result.push(items.slice(i, i + size)); }} return result; }})({receiver}, {})",
            arguments[0]
        )),
        "chunks_exact" | "chunks_exact_mut" if arguments.len() == 1 => Ok(format!(
            "(<T>(items: readonly T[], size: number): T[][] => {{ const result: T[][] = []; for (let i = 0; i + size <= items.length; i += size) {{ result.push(items.slice(i, i + size)); }} return result; }})({receiver}, {})",
            arguments[0]
        )),
        "clamp" if arguments.len() == 2 => Ok(format!(
            "Math.min({}, Math.max({}, {receiver}))",
            arguments[1], arguments[0]
        )),
        "copy_within" if arguments.len() == 2 => {
            let Some(Expr::Range(range)) = call.args.first() else {
                return Err(compile_error(
                    "portable `.copy_within()` requires a range as first argument",
                ));
            };
            let (Some(start), Some(end)) = (&range.start, &range.end) else {
                return Err(compile_error(
                    "portable `.copy_within()` requires a half-open range with start and end",
                ));
            };
            if !matches!(range.limits, syn::RangeLimits::HalfOpen(_)) {
                return Err(compile_error(
                    "portable `.copy_within()` requires a half-open range (not inclusive)",
                ));
            }
            Ok(format!(
                "{receiver}.copyWithin({}, {}, {})",
                arguments[1],
                emit_expression(start, entities)?,
                emit_expression(end, entities)?
            ))
        }
        "cos" if arguments.is_empty() => Ok(format!("Math.cos({receiver})")),
        "clone"
            if arguments.is_empty()
                && expression_contains_method(&call.receiver, "lock")
                && expression_contains_method(&call.receiver, "unwrap_or_else") =>
        {
            Ok(format!("{receiver}.value"))
        }
        "clone"
            if arguments.is_empty()
                && entities.contains(&format!("{VEC_CLONE_EXPRESSION_MARKER}{receiver}:true")) =>
        {
            Ok(format!("{receiver}?.slice()"))
        }
        "clone"
            if arguments.is_empty()
                && entities.contains(&format!("{VEC_CLONE_EXPRESSION_MARKER}{receiver}:false")) =>
        {
            Ok(format!("{receiver}.slice()"))
        }
        "clone" if arguments.is_empty() && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!("{receiver}.slice()"))
        }
        "clone"
            if arguments.is_empty()
                && referenced_path_identifier(&call.receiver).is_some_and(|identifier| {
                    entities.contains(&format!("{RECORD_CLONE_LOCAL_MARKER}{identifier}"))
                }) =>
        {
            let prefix = format!("{VEC_CLONE_EXPRESSION_MARKER}{receiver}.");
            let mut fields = entities
                .iter()
                .filter_map(|marker| marker.strip_prefix(&prefix))
                .filter_map(|suffix| suffix.rsplit_once(':'))
                .map(|(field, optional)| {
                    let clone = if optional == "true" {
                        format!("{receiver}.{field}?.slice()")
                    } else {
                        format!("{receiver}.{field}.slice()")
                    };
                    format!("{field}: {clone}")
                })
                .collect::<Vec<_>>();
            fields.sort();
            let fields = if fields.is_empty() {
                String::new()
            } else {
                format!(", {}", fields.join(", "))
            };
            Ok(format!("{{ ...{receiver}{fields} }}"))
        }
        "clone"
            if arguments.is_empty()
                && entity_clone_expression_owner(&call.receiver, entities).is_some() =>
        {
            let owner = entity_clone_expression_owner(&call.receiver, entities)
                .expect("entity clone owner was resolved");
            Ok(emit_entity_clone(&receiver, &owner, entities))
        }
        "clone" if arguments.is_empty() => Ok(receiver),
        "clone_from" if arguments.len() == 1 => {
            Ok(format!("Object.assign({receiver}, {})", arguments[0]))
        }
        "cloned" | "copied" if arguments.is_empty() => Ok(receiver),
        "collect"
            if arguments.is_empty()
                && call.turbofish.as_ref().is_some_and(|arguments| {
                    matches!(
                        arguments.args.iter().collect::<Vec<_>>().as_slice(),
                        [GenericArgument::Type(rust_type)]
                            if named_type(rust_type).as_deref() == Some("String")
                    )
                }) =>
        {
            Ok(format!("{receiver}.join('')"))
        }
        "collect"
            if arguments.is_empty()
                && method_chain_includes(&call.receiver, "chars")
                && !immediate_receiver_is_method(&call.receiver, "chars") =>
        {
            Ok(format!("{receiver}.join('')"))
        }
        "collect" if arguments.is_empty() => Ok(receiver),
        "count" if arguments.is_empty() => {
            if let Expr::MethodCall(inner) = call.receiver.as_ref() {
                if inner.method == "encode_utf16" && inner.args.is_empty() {
                    let string = emit_expression(&inner.receiver, entities)?;
                    return Ok(format!("{string}.length"));
                }
            }
            Ok(format!("{receiver}.length"))
        }
        "contains" if arguments.len() == 1 => Ok(format!("{receiver}.includes({})", arguments[0])),
        "contains_key" if arguments.len() == 1 => Ok(format!("{receiver}.has({})", arguments[0])),
        "dedup" if arguments.is_empty() => Ok(format!(
            "(<T>(items: T[]): void => {{ let write = 1; for (let read = 1; read < items.length; read++) {{ if (items[read] !== items[read - 1]) {{ items[write] = items[read]; write++; }} }} items.length = Math.min(write, items.length); }})({receiver})"
        )),
        "downcast_ref" | "downcast_mut" if arguments.is_empty() => {
            let target_type = call.turbofish.as_ref().and_then(|arguments| {
                arguments
                    .args
                    .iter()
                    .filter_map(|arg| match arg {
                        GenericArgument::Type(rust_type) => Some(emit_type(rust_type, entities)),
                        _ => None,
                    })
                    .next()
            });
            match target_type {
                Some(Ok(ts_type))
                    if matches!(ts_type.as_str(), "boolean" | "number" | "string") =>
                {
                    Ok(format!(
                        "(($downcast: unknown): {ts_type} | undefined => typeof $downcast === {} ? $downcast : undefined)({receiver})",
                        js_string_literal(&ts_type)
                    ))
                }
                Some(Ok(ts_type)) => Ok(format!("({receiver} as {ts_type})")),
                Some(Err(error)) => Err(error),
                None => Err(compile_error(
                    "portable `.downcast_ref()` requires a turbofish type annotation",
                )),
            }
        }
        "div_ceil" if arguments.len() == 1 => {
            Ok(format!("Math.ceil({receiver} / {})", arguments[0]))
        }
        "drain" if arguments.len() == 1 => {
            let Some(Expr::Range(range)) = call.args.first() else {
                return Err(compile_error(
                    "portable `.drain()` requires one half-open range with a start and end",
                ));
            };
            if range.start.is_none() && range.end.is_none() {
                return Ok(format!("{receiver}.splice(0, {receiver}.length)"));
            }
            let (Some(start), Some(end)) = (&range.start, &range.end) else {
                return Err(compile_error(
                    "portable `.drain()` requires one half-open range with a start and end, or `..` for all",
                ));
            };
            if !matches!(range.limits, syn::RangeLimits::HalfOpen(_)) {
                return Err(compile_error(
                    "portable `.drain()` requires one half-open range with a start and end",
                ));
            }
            let start_expr = emit_expression(start, entities)?;
            let end_expr = emit_expression(end, entities)?;
            if expression_is_reusable(start) {
                Ok(format!(
                    "{receiver}.splice({start_expr}, {end_expr} - {start_expr})"
                ))
            } else {
                Ok(format!(
                    "(<T>(items: T[], start: number, end: number): T[] => items.splice(start, end - start))({receiver}, {start_expr}, {end_expr})"
                ))
            }
        }
        "drain" if arguments.len() == 1 => Err(compile_error(
            "portable `.drain()` requires a receiver declared as Rust `Vec`",
        )),
        "encode_utf16" if arguments.is_empty() => Ok(format!(
            "Array.from({{ length: {receiver}.length }}, (_, index) => {receiver}.charCodeAt(index))"
        )),
        "eq_ignore_ascii_case"
            if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!(
                "({receiver}.toLowerCase() === {}.toLowerCase())",
                arguments[0]
            ))
        }
        "eq_ignore_ascii_case" if arguments.len() == 1 => Err(compile_error(
            "portable `.eq_ignore_ascii_case()` requires a receiver known to be `String` or `str`",
        )),
        "enumerate" if arguments.is_empty() => Ok(format!("{receiver}.entries()")),
        "exp" if arguments.is_empty() => Ok(format!("Math.exp({receiver})")),
        "expect"
            if arguments.len() == 1
                && expression_contains_method(&call.receiver, "partial_cmp") =>
        {
            Ok(receiver)
        }
        "expect" if arguments.len() == 1 => {
            let absent = if entities.contains(NULLABLE_OPTIONS_MARKER) {
                "null"
            } else {
                "undefined"
            };
            Ok(format!(
                "(() => {{ const value = {receiver}; if (value === {absent}) throw new Error({}); return value; }})()",
                arguments[0]
            ))
        }
        "find" if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!(
                "((i) => i === -1 ? undefined : i)({receiver}.indexOf({}))",
                arguments[0]
            ))
        }
        "find" if arguments.len() == 1 && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!("{receiver}.find({})", arguments[0]))
        }
        "find"
            if arguments.len() == 1
                && matches!(peel_reference_and_paren(&call.args[0]), Expr::Closure(_)) =>
        {
            Ok(format!("{receiver}.find({})", arguments[0]))
        }
        "find" if arguments.len() == 1 => {
            let absent = if entities.contains(NULLABLE_OPTIONS_MARKER) {
                "null"
            } else {
                "undefined"
            };
            Ok(format!(
                "((value: string, pattern: string): number | {absent} => {{ const index = value.indexOf(pattern); return index === -1 ? {absent} : index; }})({receiver}, {})",
                arguments[0]
            ))
        }
        "find_map" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "(<T, U>(items: readonly T[], fn: (item: T) => U | {absent}): U | {absent} => {{ for (const item of items) {{ const result = fn(item); if (result !== {absent}) return result; }} return {absent}; }})({receiver}, {})",
                arguments[0]
            ))
        }
        "floor" if arguments.is_empty() => Ok(format!("Math.floor({receiver})")),
        "fract" if arguments.is_empty() => Ok(format!("({receiver} % 1)")),
        "fill" if arguments.len() == 1 => Ok(format!("{receiver}.fill({})", arguments[0])),
        "filter" if arguments.len() == 1 => {
            if method_chain_includes(&call.receiver, "enumerate") {
                Ok(format!("[...{receiver}].filter({})", arguments[0]))
            } else {
                Ok(format!("{receiver}.filter({})", arguments[0]))
            }
        }
        "filter_map" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            if emitted_closure_is_identity(&arguments[0]) {
                Ok(format!("{receiver}.filter((value) => value !== {absent})"))
            } else {
                Ok(format!(
                    "{receiver}.map({}).filter((value) => value !== {absent})",
                    arguments[0]
                ))
            }
        }
        "flat_map" if arguments.len() == 1 => Ok(format!("{receiver}.flatMap({})", arguments[0])),
        "flatten" if arguments.is_empty() => Ok(format!("{receiver}.flat()")),
        "fetch_add" if arguments.len() == 2 => Ok(format!(
            "(() => {{ const previous = {receiver}.value; {receiver}.value = ({receiver}.value + {}) >>> 0; return previous; }})()",
            arguments[0]
        )),
        "first" if arguments.is_empty() => {
            if entities.contains(NULLABLE_OPTIONS_MARKER) {
                Ok(format!("({receiver}[0] ?? null)"))
            } else {
                Ok(format!("{receiver}[0]"))
            }
        }
        "get" | "get_mut"
            if arguments.len() == 1 && expression_is_sequence(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}[{}]", arguments[0]))
        }
        "get" if arguments.len() == 1 && expression_is_json_value(&call.receiver, entities) => {
            Ok(format!("{receiver}[{}]", arguments[0]))
        }
        "get" | "get_mut"
            if arguments.len() == 1
                && call.args.first().is_some_and(|arg| {
                    matches!(
                        arg,
                        Expr::Reference(_)
                            | Expr::Lit(syn::ExprLit {
                                lit: Lit::Str(_),
                                ..
                            })
                    ) || expression_is_known_string(arg, entities)
                }) =>
        {
            Ok(format!("{receiver}.get({})", arguments[0]))
        }
        "get" | "get_mut" if arguments.len() == 1 => Ok(format!("{receiver}[{}]", arguments[0])),
        "as_str" if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) => {
            Ok(format!(
                "((v: unknown): string | undefined => typeof v === 'string' ? v : undefined)({receiver})"
            ))
        }
        "as_f64" if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) => {
            Ok(format!(
                "((v: unknown): number | undefined => typeof v === 'number' ? v : undefined)({receiver})"
            ))
        }
        "as_i64" | "as_u64"
            if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) =>
        {
            Ok(format!(
                "((v: unknown): number | undefined => typeof v === 'number' && Number.isInteger(v) ? v : undefined)({receiver})"
            ))
        }
        "as_bool" if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) => {
            Ok(format!(
                "((v: unknown): boolean | undefined => typeof v === 'boolean' ? v : undefined)({receiver})"
            ))
        }
        "as_array"
            if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) =>
        {
            Ok(format!(
                "((v: unknown): unknown[] | undefined => Array.isArray(v) ? v : undefined)({receiver})"
            ))
        }
        "as_object"
            if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) =>
        {
            Ok(format!(
                "((v: unknown): Record<string, unknown> | undefined => typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined)({receiver})"
            ))
        }
        "is_string"
            if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) =>
        {
            Ok(format!("(typeof {receiver} === 'string')"))
        }
        "is_number" | "is_f64" | "is_i64" | "is_u64"
            if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) =>
        {
            Ok(format!("(typeof {receiver} === 'number')"))
        }
        "is_boolean"
            if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) =>
        {
            Ok(format!("(typeof {receiver} === 'boolean')"))
        }
        "is_array"
            if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) =>
        {
            Ok(format!("Array.isArray({receiver})"))
        }
        "is_object"
            if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) =>
        {
            Ok(format!(
                "(typeof {receiver} === 'object' && {receiver} !== null && !Array.isArray({receiver}))"
            ))
        }
        "is_null" if arguments.is_empty() && expression_is_json_value(&call.receiver, entities) => {
            Ok(format!("({receiver} === null)"))
        }
        "hypot" if arguments.len() == 1 => Ok(format!("Math.hypot({receiver}, {})", arguments[0])),
        "is_nan" if arguments.is_empty() => Ok(format!("Number.isNaN({receiver})")),
        "is_null" if arguments.is_empty() => Ok(format!(
            "{receiver} === {}",
            option_absent_value(&call.receiver, entities)
        )),
        "is_finite" if arguments.is_empty() => Ok(format!("Number.isFinite({receiver})")),
        "is_infinite" if arguments.is_empty() => Ok(format!(
            "(!Number.isFinite({receiver}) && !Number.isNaN({receiver}))"
        )),
        "is_sign_negative" if arguments.is_empty() => {
            Ok(format!("({receiver} < 0 || Object.is({receiver}, -0))"))
        }
        "is_sign_positive" if arguments.is_empty() => {
            Ok(format!("({receiver} > 0 || Object.is({receiver}, 0))"))
        }
        "is_multiple_of" if arguments.len() == 1 => {
            Ok(format!("{receiver} % {} === 0", arguments[0]))
        }
        "is_err" if arguments.is_empty() => Ok(format!(
            "{receiver} === {}",
            option_absent_value(&call.receiver, entities)
        )),
        "is_ok" if arguments.is_empty() => Ok(format!(
            "{receiver} !== {}",
            option_absent_value(&call.receiver, entities)
        )),
        "is_ok_and" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "({receiver} !== {absent} && ({})({receiver}))",
                arguments[0]
            ))
        }
        "is_none" if arguments.is_empty() => Ok(format!(
            "{receiver} === {}",
            option_absent_value(&call.receiver, entities)
        )),
        "is_some" if arguments.is_empty() => Ok(format!(
            "{receiver} !== {}",
            option_absent_value(&call.receiver, entities)
        )),
        "is_some_and" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            if let Some(inlined) = inline_emitted_closure(&arguments[0], &receiver) {
                Ok(format!("({receiver} !== {absent} && {inlined})"))
            } else {
                Ok(format!(
                    "({receiver} !== {absent} && ({})({receiver}))",
                    arguments[0]
                ))
            }
        }
        "is_none_or" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            if let Some(inlined) = inline_emitted_closure(&arguments[0], &receiver) {
                Ok(format!("({receiver} === {absent} || {inlined})"))
            } else {
                Ok(format!(
                    "({receiver} === {absent} || ({})({receiver}))",
                    arguments[0]
                ))
            }
        }
        "is_empty" if arguments.is_empty() => Ok(format!("{receiver}.length === 0")),
        "is_lt" if arguments.is_empty() => Ok(format!("({receiver} < 0)")),
        "is_gt" if arguments.is_empty() => Ok(format!("({receiver} > 0)")),
        "is_le" if arguments.is_empty() => Ok(format!("({receiver} <= 0)")),
        "is_ge" if arguments.is_empty() => Ok(format!("({receiver} >= 0)")),
        "is_eq" if arguments.is_empty() => Ok(format!("({receiver} === 0)")),
        "is_ne" if arguments.is_empty() => Ok(format!("({receiver} !== 0)")),
        "insert" if arguments.len() == 2 && expression_is_sequence(&call.receiver, entities) => Ok(
            format!("{receiver}.splice({}, 0, {})", arguments[0], arguments[1]),
        ),
        "into" if arguments.is_empty() => Ok(receiver),
        "into_boxed_slice" if arguments.is_empty() => Ok(receiver),
        "into_inner" if arguments.is_empty() => Ok(receiver),
        "into_iter" if arguments.is_empty() => Ok(receiver),
        "into_owned" if arguments.is_empty() => Ok(receiver),
        "into_vec" if arguments.is_empty() => Ok(format!("[...{receiver}]")),
        "is_ascii_digit" if arguments.is_empty() => Ok(format!(
            "((v: string | number): boolean => typeof v === 'number' ? v >= 48 && v <= 57 : v >= '0' && v <= '9')({receiver})"
        )),
        "is_ascii_lowercase" if arguments.is_empty() => Ok(format!(
            "((v: string | number): boolean => typeof v === 'number' ? v >= 97 && v <= 122 : v >= 'a' && v <= 'z')({receiver})"
        )),
        "is_ascii_uppercase" if arguments.is_empty() => Ok(format!(
            "((v: string | number): boolean => typeof v === 'number' ? v >= 65 && v <= 90 : v >= 'A' && v <= 'Z')({receiver})"
        )),
        "is_alphabetic" if arguments.is_empty() => Ok(format!(
            "((v: string | number): boolean => typeof v === 'number' ? (v >= 65 && v <= 90) || (v >= 97 && v <= 122) : (/^[a-zA-Z]$/).test(v))({receiver})"
        )),
        "is_ascii_alphabetic" if arguments.is_empty() => Ok(format!(
            "((v: string | number): boolean => typeof v === 'number' ? (v >= 65 && v <= 90) || (v >= 97 && v <= 122) : (/^[a-zA-Z]$/).test(v))({receiver})"
        )),
        "is_ascii_alphanumeric" if arguments.is_empty() => Ok(format!(
            "((v: string | number): boolean => typeof v === 'number' ? (v >= 48 && v <= 57) || (v >= 65 && v <= 90) || (v >= 97 && v <= 122) : (/^[a-zA-Z0-9]$/).test(v))({receiver})"
        )),
        "is_ascii_hexdigit" if arguments.is_empty() => Ok(format!(
            "((v: string | number): boolean => typeof v === 'number' ? (v >= 48 && v <= 57) || (v >= 65 && v <= 70) || (v >= 97 && v <= 102) : (/^[0-9a-fA-F]$/).test(v))({receiver})"
        )),
        "is_ascii_whitespace" if arguments.is_empty() => Ok(format!(
            "((v: string | number): boolean => typeof v === 'number' ? v === 32 || v === 9 || v === 10 || v === 13 || v === 12 : v === ' ' || v === '\\t' || v === '\\n' || v === '\\r' || v === '\\x0C')({receiver})"
        )),
        "is_whitespace" if arguments.is_empty() => Ok(format!("(/^\\s$/).test({receiver})")),
        "len_utf16" if arguments.is_empty() => Ok(format!("{receiver}.length")),
        "len_utf8" if arguments.is_empty() => {
            Ok(format!("new TextEncoder().encode({receiver}).length"))
        }
        "iter" | "iter_mut" if arguments.is_empty() => Ok(receiver),
        "join" if arguments.len() == 1 => Ok(format!("{receiver}.join({})", arguments[0])),
        "as_any" | "as_any_mut" if arguments.is_empty() => Ok(receiver),
        "as_ref" if arguments.is_empty() => Ok(receiver),
        "as_mut" if arguments.is_empty() => Ok(receiver),
        "as_bytes"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("new TextEncoder().encode({receiver})"))
        }
        "as_bytes" if arguments.is_empty() => Err(compile_error(
            "portable `.as_bytes()` requires a receiver known to be `String` or `str`",
        )),
        "as_deref" | "as_deref_mut" if arguments.is_empty() => Ok(receiver),
        "as_slice" if arguments.is_empty() => Ok(receiver),
        "as_str" | "to_str" if arguments.is_empty() => Ok(receiver),
        "borrow" | "borrow_mut" if arguments.is_empty() => Ok(receiver),
        "leading_zeros" if arguments.is_empty() => Ok(format!("Math.clz32({receiver})")),
        "len" if arguments.is_empty() => Ok(format!("{receiver}.length")),
        "load" if arguments.len() == 1 => Ok(receiver),
        "last" | "last_mut" if arguments.is_empty() => Ok(format!("{receiver}.at(-1)")),
        "get" if arguments.is_empty() => Ok(format!("{receiver}.value")),
        "get_or_insert" if arguments.len() == 1 => {
            Ok(format!("({receiver} = {receiver} ?? {})", arguments[0]))
        }
        "get_or_insert_with" if arguments.len() == 1 => {
            if let Some(default) = constructor_path_default_value(&call.args[0]) {
                Ok(format!("({receiver} = {receiver} ?? {default})"))
            } else {
                Ok(format!("({receiver} = {receiver} ?? ({})())", arguments[0]))
            }
        }
        "get_or_init" if arguments.len() == 1 => {
            if let Some(default) = constructor_path_default_value(&call.args[0]) {
                Ok(format!("({receiver} = {receiver} ?? {default})"))
            } else {
                Ok(format!("({receiver} = {receiver} ?? ({})())", arguments[0]))
            }
        }
        "lines" if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!("{receiver}.split('\\n')"))
        }
        "lines" if arguments.is_empty() => Err(compile_error(
            "portable `.lines()` requires a receiver known to be `String` or `str`",
        )),
        "ln" if arguments.is_empty() => Ok(format!("Math.log({receiver})")),
        "log" if arguments.len() == 1 => {
            Ok(format!("Math.log({receiver}) / Math.log({})", arguments[0]))
        }
        "log2" if arguments.is_empty() => Ok(format!("Math.log2({receiver})")),
        "log10" if arguments.is_empty() => Ok(format!("Math.log10({receiver})")),
        "map" if arguments.len() == 1 => {
            if emitted_closure_is_identity(&arguments[0]) {
                Ok(receiver)
            } else if method_chain_includes(&call.receiver, "enumerate") {
                Ok(format!("[...{receiver}].map({})", arguments[0]))
            } else {
                Ok(format!("{receiver}.map({})", arguments[0]))
            }
        }
        "map_or" if arguments.len() == 2 => {
            let absent = option_absent_value(&call.receiver, entities);
            if option_expression_payload(&call.receiver, entities).is_some() {
                Ok(format!(
                    "(<T, U>(value: T | {absent}, fallback: U, map: (value: T) => U): U => value === {absent} ? fallback : map(value))({receiver}, {}, {})",
                    arguments[0], arguments[1]
                ))
            } else {
                Ok(format!(
                    "({receiver} !== {absent} ? ({})({receiver}) : {})",
                    arguments[1], arguments[0]
                ))
            }
        }
        "map_or_else" if arguments.len() == 2 => {
            let absent = option_absent_value(&call.receiver, entities);
            let fallback_default = constructor_path_default_value(&call.args[0]);
            if option_expression_payload(&call.receiver, entities).is_some() {
                if let Some(default) = fallback_default {
                    Ok(format!(
                        "(<T, U>(value: T | {absent}, fallback: U, map: (value: T) => U): U => value === {absent} ? fallback : map(value))({receiver}, {default}, {})",
                        arguments[1]
                    ))
                } else {
                    Ok(format!(
                        "(<T, U>(value: T | {absent}, fallback: () => U, map: (value: T) => U): U => value === {absent} ? fallback() : map(value))({receiver}, {}, {})",
                        arguments[0], arguments[1]
                    ))
                }
            } else if let Some(default) = fallback_default {
                Ok(format!(
                    "({receiver} !== {absent} ? ({})({receiver}) : {default})",
                    arguments[1]
                ))
            } else {
                Ok(format!(
                    "({receiver} !== {absent} ? ({})({receiver}) : ({})())",
                    arguments[1], arguments[0]
                ))
            }
        }
        "max" if arguments.len() == 1 => Ok(format!("Math.max({receiver}, {})", arguments[0])),
        "min" if arguments.len() == 1 => Ok(format!("Math.min({receiver}, {})", arguments[0])),
        "map_err" if arguments.len() == 1 => Ok(receiver),
        "ok" if arguments.is_empty() => Ok(receiver),
        "ok_or" if arguments.len() == 1 => Ok(receiver),
        "ok_or_else" if arguments.len() == 1 => Ok(receiver),
        "or" if arguments.len() == 1 => Ok(format!("({receiver} ?? {})", arguments[0])),
        "or_else" if arguments.len() == 1 => {
            if let Some(default) = constructor_path_default_value(&call.args[0]) {
                Ok(format!("({receiver} ?? {default})"))
            } else {
                Ok(format!("({receiver} ?? ({})())", arguments[0]))
            }
        }
        "parse" if arguments.is_empty() => {
            let target_type = call.turbofish.as_ref().and_then(|arguments| {
                arguments
                    .args
                    .iter()
                    .filter_map(|arg| match arg {
                        GenericArgument::Type(rust_type) => named_type(rust_type),
                        _ => None,
                    })
                    .next()
            });
            match target_type.as_deref() {
                Some("f32" | "f64") => Ok(format!(
                    "((s) => {{ const v = Number(s); return s.trim() !== '' && !Number.isNaN(v) ? v : undefined; }})({receiver})"
                )),
                Some(
                    "i8" | "i16" | "i32" | "i64" | "i128" | "isize" | "u8" | "u16" | "u32" | "u64"
                    | "u128" | "usize",
                ) => Ok(format!(
                    "((s) => {{ const v = Number(s); return s.trim() !== '' && Number.isInteger(v) ? v : undefined; }})({receiver})"
                )),
                Some(other) => Err(compile_error(format!(
                    "portable `.parse::<{other}>()` has no portable lowering",
                ))),
                None => Err(compile_error(
                    "portable `.parse()` requires a turbofish type annotation (e.g., `.parse::<f32>()`)",
                )),
            }
        }
        "next"
            if arguments.is_empty()
                && matches!(call.receiver.as_ref(), Expr::MethodCall(chars)
                    if chars.method == "chars"
                        && chars.args.is_empty()
                        && expression_is_known_string(&chars.receiver, entities)) =>
        {
            Ok(format!("{receiver}[0]"))
        }
        "next"
            if arguments.is_empty()
                && matches!(call.receiver.as_ref(), Expr::MethodCall(split)
                    if (split.method == "split" || split.method == "splitn"
                        || split.method == "rsplit" || split.method == "rsplitn"
                        || split.method == "split_whitespace" || split.method == "split_ascii_whitespace"
                        || split.method == "lines" || split.method == "split_terminator")
                        && expression_is_known_string(&split.receiver, entities)) =>
        {
            Ok(format!("{receiver}[0]"))
        }
        "pow" if arguments.len() == 1 => Ok(format!("Math.pow({receiver}, {})", arguments[0])),
        "powf" if arguments.len() == 1 => Ok(format!("Math.pow({receiver}, {})", arguments[0])),
        "powi" if arguments.len() == 1 => Ok(format!("Math.pow({receiver}, {})", arguments[0])),
        "cmp" if arguments.len() == 1 => {
            if let Some(result) = emit_encode_utf16_cmp(&call.receiver, &call.args[0], entities)? {
                Ok(result)
            } else {
                emit_ordered_comparison(
                    &call.receiver,
                    &call.args[0],
                    &receiver,
                    &arguments[0],
                    entities,
                )
            }
        }
        "partial_cmp" if arguments.len() == 1 => Ok(format!(
            "{receiver} - {}",
            parenthesize_compound(&arguments[0])
        )),
        "pop" if arguments.is_empty() => Ok(format!("{receiver}.pop()")),
        "position" if arguments.len() == 1 => Ok(format!(
            "((i) => i === -1 ? undefined : i)({receiver}.findIndex({}))",
            arguments[0]
        )),
        "push" if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!("{receiver} += {}", arguments[0]))
        }
        "push"
            if arguments.len() == 1
                && matches!(
                    peel_reference_and_paren(&call.args[0]),
                    Expr::Array(_) | Expr::Repeat(_)
                )
                && sequence_element_typed_array(&call.receiver, entities).is_some() =>
        {
            let array_type = sequence_element_typed_array(&call.receiver, entities)
                .expect("the guard proved the element typed array");
            Ok(format!(
                "{receiver}.push({})",
                typed_array_literal(
                    peel_reference_and_paren(&call.args[0]),
                    &array_type,
                    entities
                )?
            ))
        }
        "push" if arguments.len() == 1 => Ok(format!("{receiver}.push({})", arguments[0])),
        "push_str" if arguments.len() == 1 => Ok(format!("{receiver} += {}", arguments[0])),
        "remove" if arguments.len() == 1 && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!("{receiver}.splice({}, 1)[0]", arguments[0]))
        }
        "remove"
            if arguments.len() == 1
                && call.args.first().is_some_and(|arg| {
                    matches!(
                        arg,
                        Expr::Reference(_)
                            | Expr::Lit(syn::ExprLit {
                                lit: Lit::Str(_),
                                ..
                            })
                    ) || expression_is_known_string(arg, entities)
                }) =>
        {
            Ok(format!(
                "(<K, V>(entries: Map<K, V>, key: K): V | undefined => {{ const previous = entries.get(key); entries.delete(key); return previous; }})({receiver}, {})",
                arguments[0]
            ))
        }
        "remove" if arguments.len() == 1 => {
            Ok(format!("{receiver}.splice({}, 1)[0]", arguments[0]))
        }
        "reverse" if arguments.is_empty() => Ok(format!("{receiver}.reverse()")),
        "replace" if arguments.len() == 2 => Ok(format!(
            "{receiver}.replaceAll({}, {})",
            arguments[0], arguments[1]
        )),
        "replacen" if arguments.len() == 3 => Ok(format!(
            "((value: string, pattern: string, replacement: string, count: number): string => {{ let result = value; for (let i = 0; i < count; i++) {{ const index = result.indexOf(pattern); if (index === -1) break; result = result.slice(0, index) + replacement + result.slice(index + pattern.length); }} return result; }})({receiver}, {}, {}, {})",
            arguments[0], arguments[1], arguments[2]
        )),
        "repeat"
            if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.repeat({})", arguments[0]))
        }
        "repeat"
            if arguments.len() == 1
                && (expression_is_sequence(&call.receiver, entities)
                    || expression_typed_array(&call.receiver, entities).is_some()) =>
        {
            Ok(format!(
                "Array.from({{ length: {} }}, () => [...{receiver}]).flat()",
                arguments[0]
            ))
        }
        "repeat" if arguments.len() == 1 => Err(compile_error(
            "portable `.repeat()` requires a receiver known to be `String`, `str`, `Vec`, slice, or a fixed-size array",
        )),
        "rem_euclid" if arguments.len() == 1 => {
            let m = &arguments[0];
            if expression_is_reusable(&call.args[0]) {
                Ok(format!("(({receiver} % {m}) + {m}) % {m}"))
            } else {
                Ok(format!(
                    "((n: number, m: number): number => ((n % m) + m) % m)({receiver}, {m})"
                ))
            }
        }
        "reserve" | "reserve_exact" if arguments.len() == 1 => Ok(String::new()),
        "resize" if arguments.len() == 2 => Ok(format!(
            "(<T>(items: T[], length: number, value: T): void => {{ while (items.length < length) {{ items.push(value); }} items.length = length; }})({receiver}, {}, {})",
            arguments[0], arguments[1]
        )),
        "resize_with" if arguments.len() == 2 => Ok(format!(
            "(<T>(items: T[], length: number, factory: () => T): void => {{ while (items.length < length) {{ items.push(factory()); }} items.length = length; }})({receiver}, {}, {})",
            arguments[0], arguments[1]
        )),
        "reduce" if arguments.len() == 1 => {
            if method_chain_includes(&call.receiver, "enumerate") {
                Ok(format!("[...{receiver}].reduce({})", arguments[0]))
            } else {
                Ok(format!("{receiver}.reduce({})", arguments[0]))
            }
        }
        "rfind" if arguments.len() == 1 => {
            let absent = if entities.contains(NULLABLE_OPTIONS_MARKER) {
                "null"
            } else {
                "undefined"
            };
            Ok(format!(
                "((i) => i === -1 ? {absent} : i)({receiver}.lastIndexOf({}))",
                arguments[0]
            ))
        }
        "rsplit"
            if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.split({}).reverse()", arguments[0]))
        }
        "rsplit" if arguments.len() == 1 => Err(compile_error(
            "portable `.rsplit()` requires a receiver known to be `String` or `str`",
        )),
        "rsplit_once" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "((value: string, delimiter: string): [string, string] | {absent} => {{ const index = value.lastIndexOf(delimiter); return index === -1 ? {absent} : [value.slice(0, index), value.slice(index + delimiter.length)]; }})({receiver}, {})",
                arguments[0]
            ))
        }
        "rev" if arguments.is_empty() => Ok(format!("[...{receiver}].reverse()")),
        "round" if arguments.is_empty() => {
            if expression_is_reusable(&call.receiver) {
                Ok(format!(
                    "Math.trunc({receiver} + 0.5 * Math.sign({receiver}))"
                ))
            } else {
                Ok(format!(
                    "((n: number): number => Math.trunc(n + 0.5 * Math.sign(n)))({receiver})"
                ))
            }
        }
        "round_ties_even" if arguments.is_empty() => Ok(format!(
            "((n: number): number => {{ const r = Math.round(n); const f = n - Math.trunc(n); return (f === 0.5 || f === -0.5) && r % 2 !== 0 ? r - Math.sign(n) : r; }})({receiver})"
        )),
        "saturating_add" if arguments.len() == 1 => Ok(format!(
            "Math.min(0x7FFFFFFF, {receiver} + {})",
            parenthesize_compound(&arguments[0])
        )),
        "saturating_mul" if arguments.len() == 1 => Ok(format!(
            "Math.min(0x7FFFFFFF, {receiver} * {})",
            arguments[0]
        )),
        "saturating_sub" if arguments.len() == 1 => {
            let arg = &arguments[0];
            Ok(format!(
                "Math.max(0, {receiver} - {})",
                parenthesize_compound(arg)
            ))
        }
        "set" if arguments.len() == 1 => Ok(format!("{receiver}.value = {}", arguments[0])),
        "signum" if arguments.is_empty() => Ok(format!("Math.sign({receiver})")),
        "sin" if arguments.is_empty() => Ok(format!("Math.sin({receiver})")),
        "skip" if arguments.len() == 1 => Ok(format!("{receiver}.slice({})", arguments[0])),
        "step_by" if arguments.len() == 1 => Ok(format!(
            "{receiver}.filter((_, index) => index % {} === 0)",
            arguments[0]
        )),
        "sort_by_key" | "sort_unstable_by_key" if arguments.len() == 1 => {
            if let (Some(key_a), Some(key_b)) = (
                inline_emitted_closure(&arguments[0], "a"),
                inline_emitted_closure(&arguments[0], "b"),
            ) {
                Ok(format!("{receiver}.sort((a, b) => {key_a} - {key_b})"))
            } else if expression_is_reusable(&call.args[0]) {
                let key = &arguments[0];
                Ok(format!("{receiver}.sort((a, b) => {key}(a) - {key}(b))"))
            } else {
                Ok(format!(
                    "(<T>(items: T[], key: (item: T) => number): void => {{ items.sort((a, b) => key(a) - key(b)); }})({receiver}, {})",
                    arguments[0]
                ))
            }
        }
        "sort_unstable_by" if arguments.len() == 1 => {
            Ok(format!("{receiver}.sort({})", arguments[0]))
        }
        "store" if arguments.len() == 2 => Ok(format!("{receiver} = {}", arguments[0])),
        "split" if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!("{receiver}.split({})", arguments[0]))
        }
        "split" if arguments.len() == 1 => Err(compile_error(
            "portable `.split()` requires a receiver known to be `String` or `str`",
        )),
        "split_at" | "split_at_mut" if arguments.len() == 1 => Ok(format!(
            "[{receiver}.slice(0, {0}), {receiver}.slice({0})]",
            arguments[0]
        )),
        "split_once" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "((value: string, delimiter: string): [string, string] | {absent} => {{ const index = value.indexOf(delimiter); return index === -1 ? {absent} : [value.slice(0, index), value.slice(index + delimiter.length)]; }})({receiver}, {})",
                arguments[0]
            ))
        }
        "splitn" if arguments.len() == 2 => Ok(format!(
            "((value: string, n: number, delimiter: string): string[] => {{ const parts: string[] = []; let rest = value; for (let i = 1; i < n && rest.length > 0; i++) {{ const index = rest.indexOf(delimiter); if (index === -1) break; parts.push(rest.slice(0, index)); rest = rest.slice(index + delimiter.length); }} parts.push(rest); return parts; }})({receiver}, {}, {})",
            arguments[0], arguments[1]
        )),
        "split_whitespace" | "split_ascii_whitespace" if arguments.is_empty() => Ok(format!(
            "{receiver}.split(/\\s+/).filter((s) => s.length > 0)"
        )),
        "sqrt" if arguments.is_empty() => Ok(format!("Math.sqrt({receiver})")),
        "starts_with"
            if arguments.len() == 1
                && (expression_is_known_string(&call.receiver, entities)
                    || call
                        .args
                        .first()
                        .is_some_and(|arg| expression_is_known_string(arg, entities))) =>
        {
            Ok(format!("{receiver}.startsWith({})", arguments[0]))
        }
        "starts_with" if arguments.len() == 1 => Err(compile_error(
            "portable `.starts_with()` requires a receiver known to be `String` or `str`",
        )),
        "strip_prefix" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "((value: string, prefix: string): string | {absent} => value.startsWith(prefix) ? value.slice(prefix.length) : {absent})({receiver}, {})",
                arguments[0]
            ))
        }
        "strip_suffix" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "((value: string, suffix: string): string | {absent} => value.endsWith(suffix) ? value.slice(0, value.length - suffix.length) : {absent})({receiver}, {})",
                arguments[0]
            ))
        }
        "ends_with"
            if arguments.len() == 1
                && (expression_is_known_string(&call.receiver, entities)
                    || call
                        .args
                        .first()
                        .is_some_and(|arg| expression_is_known_string(arg, entities))) =>
        {
            Ok(format!("{receiver}.endsWith({})", arguments[0]))
        }
        "ends_with" if arguments.len() == 1 => Err(compile_error(
            "portable `.ends_with()` requires a receiver known to be `String` or `str`",
        )),
        "trim" if arguments.is_empty() => Ok(format!("{receiver}.trim()")),
        "trim_end" if arguments.is_empty() => Ok(format!("{receiver}.trimEnd()")),
        "trim_start" if arguments.is_empty() => Ok(format!("{receiver}.trimStart()")),
        "trim_end_matches" if arguments.len() == 1 => Ok(format!(
            "((text: string, matches: (character: string) => boolean): string => {{ const chars = [...text]; let end = chars.length; while (end > 0 && matches(chars[end - 1])) {{ end -= 1; }} return chars.slice(0, end).join(''); }})({receiver}, {})",
            arguments[0]
        )),
        "trim_start_matches" if arguments.len() == 1 => Ok(format!(
            "((text: string, matches: (character: string) => boolean): string => {{ let offset = 0; for (const character of text) {{ if (!matches(character)) break; offset += character.length; }} return text.slice(offset); }})({receiver}, {})",
            arguments[0]
        )),
        "sum" if arguments.is_empty() => {
            Ok(format!("{receiver}.reduce((sum, value) => sum + value, 0)"))
        }
        // In place, like Rust: the predicate runs once per element in forward order, kept elements move
        // forward in the same array (keeping their identity and order), and the array is then truncated.
        // The generic parameter types the predicate from the receiver. When the predicate throws, the
        // `finally` keeps the unprocessed tail (from the throwing element on) after the kept elements, as
        // Rust's retain guard backshifts it during unwind.
        "retain"
            if arguments.len() == 1 && !expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!(
                "(<T>(items: T[], keep: (item: T) => boolean): void => {{ let kept = 0; let index = 0; try {{ for (; index < items.length; index++) {{ const item = items[index]; if (keep(item)) {{ items[kept] = item; kept++; }} }} }} finally {{ const length = items.length; for (let rest = index; rest < length; rest++) {{ items[kept + rest - index] = items[rest]; }} items.length = kept + length - index; }} }})({receiver}, {})",
                arguments[0]
            ))
        }
        "retain" => Err(compile_error(
            "portable `.retain()` requires a receiver declared as Rust `Vec` and one predicate",
        )),
        "sort_by" | "sort_unstable_by" if arguments.len() == 1 => {
            Ok(format!("{receiver}.sort({})", arguments[0]))
        }
        "sort" | "sort_unstable" if arguments.is_empty() => {
            Ok(format!("{receiver}.sort((a, b) => a - b)"))
        }
        "swap" if arguments.len() == 2 => Ok(format!(
            "([{receiver}[{}], {receiver}[{}]] = [{receiver}[{}], {receiver}[{}]])",
            arguments[0], arguments[1], arguments[1], arguments[0]
        )),
        "swap_remove" if arguments.len() == 1 => Ok(format!(
            "(<T>(items: T[], index: number): T => {{ const last = items.length - 1; if (index !== last) {{ [items[index], items[last]] = [items[last], items[index]]; }} return items.pop()!; }})({receiver}, {})",
            arguments[0]
        )),
        "take" if arguments.is_empty() => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "(() => {{ const __tmp = {receiver}; {receiver} = {absent}; return __tmp; }})()"
            ))
        }
        "take" if arguments.len() == 1 => Ok(format!("{receiver}.slice(0, {})", arguments[0])),
        "tan" if arguments.is_empty() => Ok(format!("Math.tan({receiver})")),
        "then" if arguments.len() == 1 && expression_contains_method(&call.receiver, "cmp") => {
            Ok(format!("({receiver} || {})", arguments[0]))
        }
        "then" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!("({receiver} ? ({})() : {absent})", arguments[0]))
        }
        "then_with"
            if arguments.len() == 1 && expression_contains_method(&call.receiver, "cmp") =>
        {
            Ok(format!("({receiver} || ({})())", arguments[0]))
        }
        "then_some" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!("({receiver} ? {} : {absent})", arguments[0]))
        }
        "to_string"
            if arguments.is_empty()
                && matches!(call.receiver.as_ref(), Expr::Lit(literal) if matches!(&literal.lit, Lit::Str(_))) =>
        {
            Ok(receiver)
        }
        "to_ascii_lowercase"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.toLowerCase()"))
        }
        "to_ascii_lowercase" if arguments.is_empty() => Err(compile_error(
            "portable `.to_ascii_lowercase()` requires a receiver known to be `String` or `str`",
        )),
        "to_ascii_uppercase"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.toUpperCase()"))
        }
        "to_ascii_uppercase" if arguments.is_empty() => Err(compile_error(
            "portable `.to_ascii_uppercase()` requires a receiver known to be `String` or `str`",
        )),
        "to_be_bytes" if arguments.is_empty() => {
            let Some(numeric_type) = expression_numeric_type(&call.receiver, entities) else {
                return Err(compile_error(
                    "portable `.to_be_bytes()` requires a receiver with known numeric type provenance (declare the variable with a Rust numeric type annotation)",
                ));
            };
            let Some((dv_type, byte_count)) = numeric_dataview_info(&numeric_type) else {
                return Err(compile_error(format!(
                    "portable `.to_be_bytes()` does not support `{numeric_type}`",
                )));
            };
            if byte_count == 1 {
                Ok(format!("new Uint8Array([{receiver}])"))
            } else {
                Ok(format!(
                    "(() => {{ const __b = new Uint8Array({byte_count}); new DataView(__b.buffer).set{dv_type}(0, {receiver}, false); return __b; }})()"
                ))
            }
        }
        "to_bits" if arguments.is_empty() => {
            let Some(numeric_type) = expression_numeric_type(&call.receiver, entities) else {
                return Err(compile_error(
                    "portable `.to_bits()` requires a receiver with known numeric type provenance (declare the variable with a Rust numeric type annotation)",
                ));
            };
            match numeric_type.as_str() {
                "f32" => Ok(format!(
                    "(() => {{ const __b = new DataView(new ArrayBuffer(4)); __b.setFloat32(0, {receiver}, true); return __b.getUint32(0, true); }})()"
                )),
                "f64" => Ok(format!(
                    "(() => {{ const __b = new DataView(new ArrayBuffer(8)); __b.setFloat64(0, {receiver}, true); return __b.getBigUint64(0, true); }})()"
                )),
                _ => Err(compile_error(format!(
                    "portable `.to_bits()` is only supported on `f32` and `f64`, not `{numeric_type}`",
                ))),
            }
        }
        "to_le_bytes" if arguments.is_empty() => {
            let Some(numeric_type) = expression_numeric_type(&call.receiver, entities) else {
                return Err(compile_error(
                    "portable `.to_le_bytes()` requires a receiver with known numeric type provenance (declare the variable with a Rust numeric type annotation)",
                ));
            };
            let Some((dv_type, byte_count)) = numeric_dataview_info(&numeric_type) else {
                return Err(compile_error(format!(
                    "portable `.to_le_bytes()` does not support `{numeric_type}`",
                )));
            };
            if byte_count == 1 {
                Ok(format!("new Uint8Array([{receiver}])"))
            } else {
                Ok(format!(
                    "(() => {{ const __b = new Uint8Array({byte_count}); new DataView(__b.buffer).set{dv_type}(0, {receiver}, true); return __b; }})()"
                ))
            }
        }
        "to_ne_bytes" if arguments.is_empty() => {
            let Some(numeric_type) = expression_numeric_type(&call.receiver, entities) else {
                return Err(compile_error(
                    "portable `.to_ne_bytes()` requires a receiver with known numeric type provenance (declare the variable with a Rust numeric type annotation)",
                ));
            };
            let Some(typed_array) = numeric_native_integer_typed_array(&numeric_type) else {
                return Err(compile_error(format!(
                    "portable `.to_ne_bytes()` supports only `i8`, `i16`, `i32`, `u8`, `u16`, and `u32`; `{numeric_type}` has no proven runtime-native lowering",
                )));
            };
            Ok(format!(
                "new Uint8Array(new {typed_array}([{receiver}]).buffer)"
            ))
        }
        "to_lowercase"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.toLowerCase()"))
        }
        "to_lowercase" if arguments.is_empty() => Err(compile_error(
            "portable `.to_lowercase()` requires a receiver known to be `String` or `str`",
        )),
        "to_uppercase"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.toUpperCase()"))
        }
        "to_uppercase" if arguments.is_empty() => Err(compile_error(
            "portable `.to_uppercase()` requires a receiver known to be `String` or `str`",
        )),
        "to_string"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(receiver)
        }
        "to_string" if arguments.is_empty() => Ok(format!("String({receiver})")),
        "to_owned" if arguments.is_empty() => Ok(receiver),
        "to_string_lossy" if arguments.is_empty() => Ok(receiver),
        "to_radians" if arguments.is_empty() => Ok(format!("({receiver} * Math.PI / 180)")),
        "to_degrees" if arguments.is_empty() => Ok(format!("({receiver} * 180 / Math.PI)")),
        "trim_matches" if arguments.len() == 1 => Ok(format!(
            "((value: string, ch: string): string => {{ while (value.startsWith(ch)) {{ value = value.slice(ch.length); }} while (value.endsWith(ch)) {{ value = value.slice(0, value.length - ch.length); }} return value; }})({receiver}, {})",
            arguments[0]
        )),
        "take_while" if arguments.len() == 1 => Ok(format!(
            "(<T>(items: readonly T[], predicate: (item: T) => boolean): T[] => {{ const result: T[] = []; for (const item of items) {{ if (!predicate(item)) break; result.push(item); }} return result; }})({receiver}, {})",
            arguments[0]
        )),
        "total_cmp" if arguments.len() == 1 => Ok(format!(
            "((a: number, b: number): number => a < b ? -1 : a > b ? 1 : 0)({receiver}, {})",
            arguments[0]
        )),
        "try_into" if arguments.is_empty() => Ok(receiver),
        "trunc" if arguments.is_empty() => Ok(format!("Math.trunc({receiver})")),
        "to_vec" if arguments.is_empty() => {
            if matches!(&*call.receiver, Expr::Index(index) if matches!(&*index.index, Expr::Range(_)))
            {
                Ok(receiver)
            } else {
                Ok(format!("[...{receiver}]"))
            }
        }
        "truncate" if arguments.len() == 1 => Ok(format!(
            "{receiver}.length = Math.min({receiver}.length, {})",
            arguments[0]
        )),
        "copy_from_slice" => Err(compile_error(
            "portable `.copy_from_slice()` is supported only as a statement",
        )),
        "extend" => Err(compile_error(
            "portable `.extend()` is supported only as a statement",
        )),
        "extend_from_slice" => Err(compile_error(
            "portable `.extend_from_slice()` is supported only as a statement",
        )),
        "wrapping_add" if arguments.len() == 1 => {
            let lhs = emit_binary_operand(&call.receiver, entities, 11, false)?;
            let rhs = emit_binary_operand(&call.args[0], entities, 11, true)?;
            Ok(format!("{lhs} + {rhs} >>> 0"))
        }
        "wrapping_mul" if arguments.len() == 1 => {
            Ok(format!("Math.imul({receiver}, {}) >>> 0", arguments[0]))
        }
        "wrapping_neg" if arguments.is_empty() => {
            let operand = emit_binary_operand(&call.receiver, entities, PRIMARY_PRECEDENCE, false)?;
            Ok(format!("-{operand} >>> 0"))
        }
        "wrapping_shl" if arguments.len() == 1 => {
            let lhs = emit_binary_operand(&call.receiver, entities, 10, false)?;
            Ok(format!("{lhs} << {} >>> 0", arguments[0]))
        }
        "wrapping_shr" if arguments.len() == 1 => {
            let lhs = emit_binary_operand(&call.receiver, entities, 10, false)?;
            Ok(format!("{lhs} >>> {}", arguments[0]))
        }
        "wrapping_sub" if arguments.len() == 1 => {
            let lhs = emit_binary_operand(&call.receiver, entities, 11, false)?;
            let rhs = emit_binary_operand(&call.args[0], entities, 11, true)?;
            Ok(format!("{lhs} - {rhs} >>> 0"))
        }
        "windows" if arguments.len() == 1 => Ok(format!(
            "Array.from({{ length: Math.max(0, {receiver}.length - {} + 1) }}, (_, index) => {receiver}.slice(index, index + {}))",
            arguments[0], arguments[0]
        )),
        "lock" if arguments.is_empty() => Ok(receiver),
        "read" | "write" if arguments.is_empty() => Ok(receiver),
        "unwrap_or_else"
            if arguments.len() == 1 && expression_contains_method(&call.receiver, "lock") =>
        {
            Ok(receiver)
        }
        "unwrap_or_else"
            if arguments.len() == 1
                && (expression_contains_method(&call.receiver, "read")
                    || expression_contains_method(&call.receiver, "write"))
                && matches!(peel_reference_and_paren(&call.args[0]), Expr::Path(_)) =>
        {
            Ok(receiver)
        }
        "unwrap_or_else" if arguments.len() == 1 => {
            if let Expr::Closure(closure) = peel_reference_and_paren(&call.args[0]) {
                if closure.inputs.is_empty() && !matches!(closure.body.as_ref(), Expr::Block(_)) {
                    let body = emit_expression(&closure.body, entities)?;
                    Ok(format!("({receiver} ?? {body})"))
                } else if closure.inputs.is_empty() {
                    let arrow = emit_closure(closure, entities)?;
                    Ok(format!("({receiver} ?? ({arrow})())"))
                } else {
                    Ok(format!("({receiver} ?? ({})())", arguments[0]))
                }
            } else if let Some(default) = constructor_path_default_value(&call.args[0]) {
                Ok(format!("({receiver} ?? {default})"))
            } else {
                Ok(format!("({receiver} ?? ({})())", arguments[0]))
            }
        }
        "unwrap_or"
            if arguments.len() == 1
                && expression_contains_method(&call.receiver, "partial_cmp") =>
        {
            Ok(receiver)
        }
        "unwrap_or" if arguments.len() == 1 => Ok(format!("({receiver} ?? {})", arguments[0])),
        "unwrap_or_default" if arguments.is_empty() => {
            let default_value = option_binding_fact_default(&call.receiver, entities)
                .map(ToString::to_string)
                .or_else(|| option_map_closure_default(&call.receiver, entities));
            match default_value {
                Some(value) => Ok(format!("({receiver} ?? {value})")),
                None => Err(compile_error(
                    "portable `.unwrap_or_default()` needs a proven Option payload to determine Default; use `.unwrap_or(value)` with an explicit default",
                )),
            }
        }
        "unwrap" if arguments.is_empty() && expression_contains_method(&call.receiver, "lock") => {
            Ok(format!("{receiver}.value"))
        }
        "unwrap"
            if arguments.is_empty()
                && (expression_contains_method(&call.receiver, "read")
                    || expression_contains_method(&call.receiver, "write")) =>
        {
            Ok(receiver)
        }
        "unsigned_abs" if arguments.is_empty() => Ok(format!("Math.abs({receiver}) >>> 0")),
        "upgrade" if arguments.is_empty() => Ok(receiver),
        "strong_count" if arguments.is_empty() => Err(compile_error(
            "portable `.strong_count()` has no TypeScript equivalent; reference counting is not modeled",
        )),
        "weak_count" if arguments.is_empty() => Err(compile_error(
            "portable `.weak_count()` has no TypeScript equivalent; reference counting is not modeled",
        )),
        "ptr_eq" if arguments.len() == 1 => Ok(format!("({receiver} === {})", arguments[0])),
        // A buffer's address is its identity, which in TypeScript is the array reference itself;
        // comparisons of it are identity comparisons (`ptr::eq`, and `toBe` in tests).
        "as_ptr" if arguments.is_empty() => Ok(receiver),
        "unwrap"
            if arguments.is_empty()
                && expression_contains_method(&call.receiver, "partial_cmp") =>
        {
            Ok(receiver)
        }
        "unwrap" if arguments.is_empty() => Ok(if receiver.ends_with('!') {
            receiver
        } else {
            format!("{receiver}!")
        }),
        "zip" if arguments.len() == 1 => Ok(format!(
            "{receiver}.map((item, index) => [item, {}[index]] as const)",
            arguments[0]
        )),
        // Fallback lowerings for serde_json::Value and serde_json::Number methods, reached when the
        // receiver's JSON provenance is unproven. The method names are distinctive to serde_json.
        "as_f64" | "as_number" if arguments.is_empty() => Ok(format!(
            "((v: unknown): number | undefined => typeof v === 'number' ? v : undefined)({receiver})"
        )),
        "as_i64" | "as_u64" if arguments.is_empty() => Ok(format!(
            "((v: unknown): number | undefined => typeof v === 'number' && Number.isInteger(v) ? v : undefined)({receiver})"
        )),
        "as_bool" if arguments.is_empty() => Ok(format!(
            "((v: unknown): boolean | undefined => typeof v === 'boolean' ? v : undefined)({receiver})"
        )),
        "as_str" if arguments.is_empty() => Ok(format!(
            "((v: unknown): string | undefined => typeof v === 'string' ? v : undefined)({receiver})"
        )),
        "as_array" if arguments.is_empty() => Ok(format!(
            "((v: unknown): unknown[] | undefined => Array.isArray(v) ? v : undefined)({receiver})"
        )),
        "as_object" if arguments.is_empty() => Ok(format!(
            "((v: unknown): Record<string, unknown> | undefined => typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined)({receiver})"
        )),
        "is_string" if arguments.is_empty() => Ok(format!("(typeof {receiver} === 'string')")),
        "is_number" | "is_f64" | "is_i64" | "is_u64" if arguments.is_empty() => {
            Ok(format!("(typeof {receiver} === 'number')"))
        }
        "is_boolean" if arguments.is_empty() => Ok(format!("(typeof {receiver} === 'boolean')")),
        "is_array" if arguments.is_empty() => Ok(format!("Array.isArray({receiver})")),
        "is_object" if arguments.is_empty() => Ok(format!(
            "(typeof {receiver} === 'object' && {receiver} !== null && !Array.isArray({receiver}))"
        )),
        "is_null" if arguments.is_empty() => Ok(format!("({receiver} === null)")),
        // Fallback lowerings for glow (OpenGL) uniform and texture methods whose WebGL2 names
        // diverge from simple snake_case → camelCase (numeric suffixes, `fv` variants).
        "uniform_1_f32" if arguments.len() == 2 => Ok(format!(
            "{receiver}.uniform1f({args})",
            args = arguments.join(", ")
        )),
        "uniform_2_f32" if arguments.len() == 3 => Ok(format!(
            "{receiver}.uniform2f({args})",
            args = arguments.join(", ")
        )),
        "uniform_3_f32" if arguments.len() == 4 => Ok(format!(
            "{receiver}.uniform3f({args})",
            args = arguments.join(", ")
        )),
        "uniform_4_f32" if arguments.len() == 5 => Ok(format!(
            "{receiver}.uniform4f({args})",
            args = arguments.join(", ")
        )),
        "uniform_1_i32" if arguments.len() == 2 => Ok(format!(
            "{receiver}.uniform1i({args})",
            args = arguments.join(", ")
        )),
        "uniform_matrix_3_f32_slice" if arguments.len() == 3 => Ok(format!(
            "{receiver}.uniformMatrix3fv({args})",
            args = arguments.join(", ")
        )),
        "uniform_matrix_4_f32_slice" if arguments.len() == 3 => Ok(format!(
            "{receiver}.uniformMatrix4fv({args})",
            args = arguments.join(", ")
        )),
        "vertex_attrib_4_f32" if arguments.len() == 5 => Ok(format!(
            "{receiver}.vertexAttrib4f({args})",
            args = arguments.join(", ")
        )),
        "uniform_4_f32_slice" if arguments.len() == 2 => Ok(format!(
            "{receiver}.uniform4fv({args})",
            args = arguments.join(", ")
        )),
        "tex_image_2d" => Ok(format!(
            "{receiver}.texImage2D({args})",
            args = arguments.join(", ")
        )),
        "tex_sub_image_2d" => Ok(format!(
            "{receiver}.texSubImage2D({args})",
            args = arguments.join(", ")
        )),
        "tex_storage_3d" => Ok(format!(
            "{receiver}.texStorage3D({args})",
            args = arguments.join(", ")
        )),
        "tex_parameter_i32" if arguments.len() == 3 => Ok(format!(
            "{receiver}.texParameteri({args})",
            args = arguments.join(", ")
        )),
        "get_parameter_i32" if arguments.len() == 1 => Ok(format!(
            "{receiver}.getParameter({args})",
            args = arguments[0]
        )),
        "get_parameter_i32_slice" if arguments.len() == 2 => Ok(format!(
            "{receiver}.getParameter({args})",
            args = arguments[0]
        )),
        "get_parameter_bool" if arguments.len() == 1 => Ok(format!(
            "{receiver}.getParameter({args})",
            args = arguments[0]
        )),
        "get_parameter_program" if arguments.len() == 2 => Ok(format!(
            "{receiver}.getProgramParameter({args})",
            args = arguments.join(", ")
        )),
        "get_parameter_framebuffer" if arguments.len() == 2 => Ok(format!(
            "{receiver}.getFramebufferParameter({args})",
            args = arguments.join(", ")
        )),
        "clear_buffer_f32_slice" if arguments.len() == 3 => Ok(format!(
            "{receiver}.clearBufferfv({args})",
            args = arguments.join(", ")
        )),
        // Fallback lowering for Regex::is_match → RegExp.test (distinctive to Regex).
        "is_match" if arguments.len() == 1 => Ok(format!("{receiver}.test({})", arguments[0])),
        // Fallback lowerings for methods whose TS equivalent is a simple snake_case → camelCase
        // rename. These names are distinctive to their API domains (WebGL2, WebGPU, BinaryReader)
        // and are safe as unguarded fallbacks.
        "get_uniform_location"
        | "get_attrib_location"
        | "active_texture"
        | "use_program"
        | "link_program"
        | "bind_buffer"
        | "bind_texture"
        | "bind_framebuffer"
        | "bind_vertex_array"
        | "create_vertex_array"
        | "create_framebuffer"
        | "create_shader"
        | "compile_shader"
        | "shader_source"
        | "attach_shader"
        | "delete_texture"
        | "delete_program"
        | "delete_shader"
        | "delete_framebuffer"
        | "delete_vertex_array"
        | "delete_buffer"
        | "enable_vertex_attrib_array"
        | "disable_vertex_attrib_array"
        | "vertex_attrib_pointer"
        | "generate_mipmap"
        | "blend_func"
        | "blend_func_separate"
        | "blend_equation"
        | "blend_equation_separate"
        | "depth_func"
        | "depth_mask"
        | "stencil_func"
        | "stencil_func_separate"
        | "stencil_mask"
        | "stencil_mask_separate"
        | "stencil_op"
        | "stencil_op_separate"
        | "clear_color"
        | "color_mask"
        | "buffer_data"
        | "buffer_sub_data"
        | "draw_arrays"
        | "draw_arrays_instanced"
        | "draw_elements"
        | "draw_elements_instanced"
        | "read_pixels"
        | "create_buffer"
        | "create_texture"
        | "create_view"
        | "create_shader_module"
        | "create_bind_group"
        | "create_bind_group_layout"
        | "create_render_pipeline"
        | "create_pipeline_layout"
        | "create_sampler"
        | "create_command_encoder"
        | "begin_render_pass"
        | "copy_texture_to_buffer"
        | "set_pipeline"
        | "set_bind_group"
        | "set_vertex_buffer"
        | "set_index_buffer"
        | "set_viewport"
        | "set_scissor_rect"
        | "set_stencil_reference"
        | "set_blend_constant"
        | "draw_indexed"
        | "write_buffer"
        | "write_texture"
        | "copy_external_image_to_texture"
        | "get_current_texture"
        | "get_preferred_canvas_format"
        | "request_adapter"
        | "request_device"
        | "get_mapped_range"
        | "map_async"
        | "read_uint8"
        | "read_uint16"
        | "read_uint32"
        | "read_int8"
        | "read_int16"
        | "read_int32"
        | "read_float32"
        | "read_float64"
        | "read_var_uint"
        | "read_var_int"
        | "read_unsigned_bits"
        | "read_signed_bits"
        | "read_string"
        | "read_encoded_uint32"
        | "set_device_lost_callback"
        | "align_to_byte"
        | "on_submitted_work_done" => {
            let camel = snake_to_lower_camel(&method);
            Ok(format!(
                "{receiver}.{camel}({args})",
                args = arguments.join(", ")
            ))
        }
        // GL methods whose WebGL2 name drops a Rust type suffix.
        "vertex_attrib_pointer_f32" => Ok(format!(
            "{receiver}.vertexAttribPointer({args})",
            args = arguments.join(", ")
        )),
        "buffer_data_u8_slice" => Ok(format!(
            "{receiver}.bufferData({args})",
            args = arguments.join(", ")
        )),
        "pixel_store_i32" if arguments.len() == 2 => Ok(format!(
            "{receiver}.pixelStorei({args})",
            args = arguments.join(", ")
        )),
        // Rust-only lifetime/ownership erasure — no-op in TS.
        "forget_lifetime" if arguments.is_empty() => Ok(receiver),
        // Single-word pass-through methods (GL/WGPU/Canvas2D), emitted unchanged.
        "enable" | "disable" | "draw" | "destroy" | "finish" | "configure" | "unconfigure"
        | "submit" | "unmap" | "flush" | "end" | "viewport" | "scissor" | "clear" => Ok(format!(
            "{receiver}.{method}({args})",
            args = arguments.join(", ")
        )),
        // Rust getter methods that become property accesses in TS (no parentheses).
        "width" | "height" | "format" | "dimension" | "size" | "limits" | "features"
        | "map_state" | "usage"
            if arguments.is_empty() =>
        {
            Ok(format!("{receiver}.{method}"))
        }
        // wgpu-rs helper: buffer.as_entire_binding() → { buffer: receiver } (a BindingResource).
        "as_entire_binding" if arguments.is_empty() => Ok(format!("{{ buffer: {receiver} }}")),
        // Additional GL methods with non-standard WebGL2 name mapping.
        "vertex_attrib_divisor" => Ok(format!(
            "{receiver}.vertexAttribDivisor({args})",
            args = arguments.join(", ")
        )),
        "get_parameter_framebuffer" | "get_parameter_renderbuffer" => Ok(format!(
            "{receiver}.getParameter({args})",
            args = arguments.join(", ")
        )),
        "get_parameter_program" => Ok(format!(
            "{receiver}.getProgramParameter({args})",
            args = arguments.join(", ")
        )),
        "get_parameter_f32" | "get_parameter_f32_slice" => Ok(format!(
            "{receiver}.getParameter({args})",
            args = arguments[0]
        )),
        "get_shader_compile_status" if arguments.len() == 1 => Ok(format!(
            "{receiver}.getShaderParameter({}, {receiver}.COMPILE_STATUS)",
            arguments[0]
        )),
        "get_program_link_status" if arguments.len() == 1 => Ok(format!(
            "{receiver}.getProgramParameter({}, {receiver}.LINK_STATUS)",
            arguments[0]
        )),
        "uniform_2_f32_slice" if arguments.len() == 2 => Ok(format!(
            "{receiver}.uniform2fv({args})",
            args = arguments.join(", ")
        )),
        "framebuffer_texture_2d" => Ok(format!(
            "{receiver}.framebufferTexture2D({args})",
            args = arguments.join(", ")
        )),
        "tex_image_3d" => Ok(format!(
            "{receiver}.texImage3D({args})",
            args = arguments.join(", ")
        )),
        "compressed_tex_sub_image_3d" => Ok(format!(
            "{receiver}.compressedTexSubImage3D({args})",
            args = arguments.join(", ")
        )),
        "check_framebuffer_status" if arguments.len() == 1 => Ok(format!(
            "{receiver}.checkFramebufferStatus({})",
            arguments[0]
        )),
        "buffer_data_size" => Ok(format!(
            "{receiver}.bufferData({args})",
            args = arguments.join(", ")
        )),
        "buffer_sub_data_u8_slice" => Ok(format!(
            "{receiver}.bufferSubData({args})",
            args = arguments.join(", ")
        )),
        "clear_buffer_depth_stencil" => Ok(format!(
            "{receiver}.clearBufferfi({args})",
            args = arguments.join(", ")
        )),
        "delete_renderbuffer" if arguments.len() == 1 => {
            Ok(format!("{receiver}.deleteRenderbuffer({})", arguments[0]))
        }
        "draw_buffers" => Ok(format!(
            "{receiver}.drawBuffers({args})",
            args = arguments.join(", ")
        )),
        "clear_buffer_i32_slice" => Ok(format!(
            "{receiver}.clearBufferiv({args})",
            args = arguments.join(", ")
        )),
        "uniform_3_f32_slice" if arguments.len() == 2 => Ok(format!(
            "{receiver}.uniform3fv({args})",
            args = arguments.join(", ")
        )),
        "tex_parameter_f32" => Ok(format!(
            "{receiver}.texParameterf({args})",
            args = arguments.join(", ")
        )),
        "compressed_tex_image_2d" => Ok(format!(
            "{receiver}.compressedTexImage2D({args})",
            args = arguments.join(", ")
        )),
        "get_shader_info_log" if arguments.len() == 1 => {
            Ok(format!("{receiver}.getShaderInfoLog({})", arguments[0]))
        }
        "get_parameter_texture" => Ok(format!(
            "{receiver}.getTexParameter({args})",
            args = arguments.join(", ")
        )),
        "cubic_curve_to" => Ok(format!(
            "{receiver}.bezierCurveTo({args})",
            args = arguments.join(", ")
        )),
        "blit_framebuffer" => Ok(format!(
            "{receiver}.blitFramebuffer({args})",
            args = arguments.join(", ")
        )),
        // Canvas 2D and GL methods (simple camelCase).
        "cull_face" | "front_face" | "clear_rect" | "move_to" | "line_to"
        | "quadratic_curve_to" | "flush_path" | "is_alphanumeric" | "close_path" => {
            let camel = snake_to_lower_camel(&method);
            Ok(format!(
                "{receiver}.{camel}({args})",
                args = arguments.join(", ")
            ))
        }
        // Additional camelCase pass-through methods (Flight render state, binary reader, misc).
        "render_registries"
        | "render_registries_mut"
        | "mesh_program"
        | "is_texture_ready"
        | "modifier_define_signature"
        | "render_state"
        | "is_enabled"
        | "as_mesh"
        | "clip_view"
        | "color_attachments"
        | "color_textures"
        | "as_texture"
        | "material_view"
        | "set_float"
        | "set_linear_color"
        | "set_transform"
        | "set_cursor"
        | "set_stroke_style"
        | "supported_extensions"
        | "get_effect_field"
        | "set_effect_field"
        | "clear_effect_field"
        | "get_argument"
        | "read_fixed8"
        | "read_bytes"
        | "read_buffer"
        | "read_rive_number"
        | "read_rive_text"
        | "read_rive_u32"
        | "read_rive_flag"
        | "as_numbers"
        | "as_image_copy"
        | "copy_to_texture"
        | "kind_fields_are_finite"
        | "pack_instance"
        | "intensity_unit"
        | "billboard_mode"
        | "enabled_value"
        | "command_index"
        | "spatial_influence"
        | "shape_commands"
        | "shape_commands_mut"
        | "source_2d"
        | "has_transmission_scene_color"
        | "bind_transmission_scene_color"
        | "casts_shadow_value"
        | "for_each_number_field"
        | "expand_point"
        | "ascii_serialization"
        | "as_matrix_mut"
        | "draw_circle"
        | "draw_rectangle"
        | "draw_ellipse"
        | "draw_rounded_rectangle"
        | "measure_metrics"
        | "is_ready"
        | "split_word_bounds"
        | "colored_intensity"
        | "as_numbers_mut"
        | "as_boolean" => {
            let camel = snake_to_lower_camel(&method);
            Ok(format!(
                "{receiver}.{camel}({args})",
                args = arguments.join(", ")
            ))
        }
        // Rust getter methods on Flight types → property access.
        "remaining"
        | "appearance"
        | "kind"
        | "origin"
        | "position"
        | "gl"
        | "intensity"
        | "intensity_mut"
        | "hemisphere_intensity"
        | "framebuffer"
            if arguments.is_empty() =>
        {
            Ok(format!("{receiver}.{method}"))
        }
        _ => Err(compile_error(
            match method_delegation_targets(call, entities).first() {
                Some(target) => format!(
                    "unsupported Rust method call `.{method}()`: it forwards to `{}` in `{}`, which this source does not import; import `{}` or call it directly",
                    target.function, target.module, target.function
                ),
                None => format!(
                    "unsupported Rust method call `.{method}()`; impl sugar is not a transpilation source"
                ),
            },
        )),
    };
}

pub(super) struct MethodDelegationTarget {
    arguments: Vec<Option<usize>>,
    function: String,
    module: String,
}

// The free functions a method call forwards to, found through the receiver's resolved struct and
// the delegating impl methods declared for that struct.
pub(super) fn method_delegation_targets(
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
) -> Vec<MethodDelegationTarget> {
    if current_source(entities).is_none() {
        return Vec::new();
    }
    let Some(owner) = expression_struct_identity(&call.receiver, entities) else {
        return Vec::new();
    };
    return owner_method_delegation_targets(entities, &owner, &call.method.to_string());
}

pub(super) fn owner_method_delegation_targets(
    entities: &HashSet<String>,
    owner: &str,
    method: &str,
) -> Vec<MethodDelegationTarget> {
    let prefix = format!(
        "{METHOD_DELEGATION_MARKER}{owner}{PROVENANCE_SEPARATOR}{method}{PROVENANCE_SEPARATOR}"
    );
    return marker_suffixes(entities, &prefix)
        .into_iter()
        .filter_map(|suffix| {
            let mut fields = suffix.split(PROVENANCE_SEPARATOR);
            let module = fields.next()?.to_string();
            let function = fields.next()?.to_string();
            let arguments = fields
                .next()?
                .split(',')
                .map(|argument| match argument {
                    "self" => Some(None),
                    index => index.parse::<usize>().ok().map(Some),
                })
                .collect::<Option<Vec<_>>>()?;
            Some(MethodDelegationTarget {
                arguments,
                function,
                module,
            })
        })
        .collect();
}

// A fact (`marker`) of the free function a method on `owner` forwards to, when every delegating impl
// method of that name forwards to the same function.
pub(super) fn owner_method_delegation_fact(
    entities: &HashSet<String>,
    owner: &str,
    method: &str,
    marker: &str,
) -> Option<String> {
    let targets = owner_method_delegation_targets(entities, owner, method);
    let target = targets.first()?;
    if targets
        .iter()
        .any(|other| other.module != target.module || other.function != target.function)
    {
        return None;
    }
    return function_identity_fact(
        entities,
        marker,
        &format!("{}{PROVENANCE_SEPARATOR}{}", target.module, target.function),
    );
}

// Method-call syntax on a receiver whose struct declares a delegating impl method, rewritten as the
// free-function call that method forwards to. The function must resolve to the same declaration
// from the source being emitted, so the call needs no import beyond the source's own `use` items.
pub(super) fn delegated_method_call(
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
) -> Result<Option<syn::ExprCall>, CompileError> {
    let targets = method_delegation_targets(call, entities);
    let Some(target) = targets.first() else {
        return Ok(None);
    };
    if targets.iter().any(|other| {
        other.module != target.module
            || other.function != target.function
            || other.arguments != target.arguments
    }) {
        return Err(compile_error(format!(
            "ambiguous Rust method call `.{}()`: the receiver's impl methods forward to different free functions",
            call.method
        )));
    }
    let Some(current) = current_source(entities) else {
        return Ok(None);
    };
    if lexical_binding(entities, &target.function).is_some()
        || resolve_owner(entities, FUNCTION_OWNER_MARKER, &current, &target.function)
            != Some((target.module.clone(), target.function.clone()))
    {
        return Ok(None);
    }
    if target.arguments.iter().flatten().count() != call.args.len() {
        return Err(compile_error(format!(
            "Rust method call `.{}()` passes {} argument(s), but its delegating impl method forwards {}",
            call.method,
            call.args.len(),
            target.arguments.iter().flatten().count()
        )));
    }
    let arguments = target
        .arguments
        .iter()
        .map(|argument| match argument {
            Some(index) => call.args[*index].clone(),
            None => call.receiver.as_ref().clone(),
        })
        .collect();
    return Ok(Some(syn::ExprCall {
        attrs: Vec::new(),
        func: Box::new(Expr::Path(syn::ExprPath {
            attrs: Vec::new(),
            qself: None,
            path: syn::Ident::new(&target.function, call.method.span()).into(),
        })),
        paren_token: syn::token::Paren::default(),
        args: arguments,
    }));
}
