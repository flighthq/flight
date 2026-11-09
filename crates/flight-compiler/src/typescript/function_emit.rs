use std::collections::{BTreeSet, HashSet};
use std::fmt::Write;

use syn::{Expr, FnArg, ItemFn, Pat, PathArguments, ReturnType, Stmt, Type};

use crate::{CompileError, compile_error};

use super::{
    ASYNC_FLIGHT_ERROR_FUNCTION_MARKER, BINDING_MARKER, FINISH_ENTITY_RETURN_MARKER,
    FLIGHT_ERROR_RETURNS_MARKER, MUTABLE_PARAMETER_MARKER,
    MUTABLE_SCALAR_CELL_PARAMETER_NAME_MARKER, NULLABLE_BINDING_MARKER,
    NULLABLE_OPTION_RETURN_MARKER, NULLABLE_OPTIONS_MARKER, PROVENANCE_SEPARATOR, PreferredAliases,
    RETURN_TYPE_MARKER, RETURNS_CONTRACT_TYPED_ARRAY_MARKER, RETURNS_NULLABLE_MARKER,
    RETURNS_TYPED_ARRAY_MARKER, RETURNS_U32_MARKER, SCOPE_DECLARED_MARKER, SourceAccess,
    VITEST_MUTABLE_SCALAR_CELL_PARAMETER_MARKER, argument_is_array_like_parameter,
    argument_is_nullable_guard, argument_is_option,
    argument_is_type_script_default_null_option_parameter,
    argument_is_type_script_nullable_option_parameter, array_like_parameter,
    callable_parameter_rust_types, callable_parameter_types, current_source,
    emit_block_with_tail_returns, emit_callable_return_type, emit_documentation, emit_expression,
    emit_function_block, emit_parameter, emit_parameter_with_aliases, emit_preferred_type,
    emit_type, emit_type_parameters, export_name, expression_contains_identifier,
    expression_is_path, flight_error_result_aliases, flight_error_result_type,
    flight_error_return_positions_are_proven, float32_array_parameter, function_expression_context,
    function_returned_typed_array, function_returns_uint8_array, indent_continuation_lines,
    insert_program_type_path_context, insert_std_float_consts_context,
    insert_std_mem_import_context, insert_type_parameter_context, insert_type_path_context,
    insert_typed_array_constant_context, insert_typed_array_vec_locals, is_public,
    leading_mutable_entity_parameter, lexical_binding, local_pattern_binding_id,
    local_pattern_name, named_type, nullable_type, option_inner_type, owner_marker,
    parameter_is_reassignable, reject_await_outside_async, snake_to_lower_camel,
    trait_object_is_standard_any, type_is_named, typed_array_for_type, uint8_array_parameter,
    write_indent,
};
pub(super) fn emit_function(
    out: &mut String,
    function: &ItemFn,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_static_names: &HashSet<String>,
    entity_construction_parameter: bool,
    finish_entity_return: Option<&str>,
) -> Result<(), CompileError> {
    reject_await_outside_async(function)?;
    emit_documentation(out, &function.attrs, 0);
    let is_async = function.sig.asyncness.is_some();
    // A crate-visible function is exported only through the crate-internal `export { … }` list, which
    // keeps it off the public lanes, as for crate-visible structs, enums and constants.
    let export = if is_public(&function.vis) {
        "export "
    } else {
        ""
    };
    let async_keyword = if is_async { "async " } else { "" };
    let rust_name = function.sig.ident.to_string();
    let name = export_name(entities, &rust_name)
        .map_or_else(|| snake_to_lower_camel(&rust_name), str::to_string);
    let type_parameters = emit_type_parameters(&function.sig.generics);
    let mut signature_context = entities.clone();
    insert_type_parameter_context(&mut signature_context, &function.sig.generics);
    let nullable_options = signature_context.contains(NULLABLE_OPTIONS_MARKER);
    let trailing_optional_start = function
        .sig
        .inputs
        .iter()
        .rposition(|argument| {
            !argument_is_option(argument)
                || argument_is_nullable_guard(function, argument)
                || argument_is_type_script_nullable_option_parameter(
                    function,
                    argument,
                    &signature_context,
                )
                || nullable_options
        })
        .map_or(0, |index| index + 1);
    let parameters = function
        .sig
        .inputs
        .iter()
        .enumerate()
        .map(|(index, argument)| {
            if let Some(parameter) = uint8_array_parameter(function, argument, entities) {
                return Ok(parameter);
            }
            if let Some(parameter) = float32_array_parameter(function, argument, entities) {
                return Ok(parameter);
            }
            if let Some(parameter) = array_like_parameter(function, argument, entities)? {
                return Ok(parameter);
            }
            emit_parameter_with_aliases(
                argument,
                &signature_context,
                aliases,
                index >= trailing_optional_start
                    && !argument_is_nullable_guard(function, argument)
                    && !argument_is_type_script_default_null_option_parameter(
                        function,
                        argument,
                        &signature_context,
                    )
                    && !nullable_options,
                argument_is_nullable_guard(function, argument)
                    || argument_is_type_script_nullable_option_parameter(
                        function,
                        argument,
                        &signature_context,
                    )
                    || argument_is_type_script_default_null_option_parameter(
                        function,
                        argument,
                        &signature_context,
                    )
                    || (nullable_options && argument_is_option(argument)),
                argument_is_type_script_default_null_option_parameter(
                    function,
                    argument,
                    &signature_context,
                ),
                entity_construction_parameter && index == 0,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    let nullable_return = current_source(entities).is_some_and(|module| {
        entities.contains(&format!(
            "{NULLABLE_OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}",
            function.sig.ident
        ))
    }) && !entities.contains(NULLABLE_OPTIONS_MARKER);
    let inner_return_type = match &function.sig.output {
        ReturnType::Default => "void".to_string(),
        ReturnType::Type(_, rust_type) if nullable_return => nullable_type(emit_preferred_type(
            option_inner_type(rust_type).expect("nullable-option returns were validated"),
            &signature_context,
            aliases,
        )?),
        ReturnType::Type(_, _) if function_returns_uint8_array(function, entities) => {
            "Uint8Array".to_string()
        }
        ReturnType::Type(_, rust_type) => {
            emit_preferred_type(rust_type, &signature_context, aliases)?
        }
    };
    let return_type = if is_async {
        format!("Promise<{inner_return_type}>")
    } else {
        inner_return_type.clone()
    };
    writeln!(
        out,
        "{export}{async_keyword}function {name}{type_parameters}({}): {return_type} {{",
        parameters.join(", ")
    )
    .expect("writing to a String cannot fail");
    let mut function_context = signature_context;
    for argument in &function.sig.inputs {
        if let FnArg::Typed(typed) = argument {
            if let Some(param_name) = local_pattern_name(&typed.pat) {
                function_context.insert(format!("{SCOPE_DECLARED_MARKER}{param_name}"));
                let camel = snake_to_lower_camel(&param_name);
                let marker = format!("{MUTABLE_PARAMETER_MARKER}{camel}");
                if parameter_is_reassignable(&param_name, &typed.ty, &function.block) {
                    function_context.insert(marker);
                } else {
                    function_context.remove(&marker);
                }
                if camel != param_name {
                    function_context.insert(format!("{SCOPE_DECLARED_MARKER}{camel}"));
                }
            }
        }
    }
    for argument in &function.sig.inputs {
        if (argument_is_nullable_guard(function, argument)
            || argument_is_type_script_nullable_option_parameter(
                function,
                argument,
                &function_context,
            )
            || argument_is_type_script_default_null_option_parameter(
                function,
                argument,
                &function_context,
            )
            || (nullable_options && argument_is_option(argument)))
            && let FnArg::Typed(argument) = argument
            && let Pat::Ident(pattern) = argument.pat.as_ref()
        {
            function_context.insert(format!("{NULLABLE_BINDING_MARKER}{}", pattern.ident));
        }
    }
    struct NullableLocalCollector<'a> {
        names: HashSet<String>,
        nullable_static_names: &'a HashSet<String>,
    }

    impl<'ast> syn::visit::Visit<'ast> for NullableLocalCollector<'_> {
        fn visit_local(&mut self, local: &'ast syn::Local) {
            if let Some(initializer) = &local.init
                && (self
                    .nullable_static_names
                    .iter()
                    .any(|name| expression_contains_identifier(&initializer.expr, name)))
                && let Some(name) = local_pattern_name(&local.pat)
            {
                self.names.insert(name);
            }
            syn::visit::visit_local(self, local);
        }
    }

    let mut nullable_locals = NullableLocalCollector {
        names: HashSet::new(),
        nullable_static_names,
    };
    syn::visit::Visit::visit_block(&mut nullable_locals, &function.block);
    for name in nullable_locals.names {
        function_context.insert(format!("{NULLABLE_BINDING_MARKER}{name}"));
    }
    let mut function_context = function_expression_context(function, &function_context);
    function_context.insert(format!("{RETURN_TYPE_MARKER}{inner_return_type}"));
    if entities.contains(&format!("{ASYNC_FLIGHT_ERROR_FUNCTION_MARKER}{rust_name}")) {
        flight_error_return_positions_are_proven(function)?;
        function_context.insert(FLIGHT_ERROR_RETURNS_MARKER.to_string());
    }
    if let Some(binding) = finish_entity_return {
        let local = function
            .block
            .stmts
            .iter()
            .find_map(|stmt| match stmt {
                Stmt::Local(local)
                    if local_pattern_name(&local.pat).as_deref() == Some(binding) =>
                {
                    Some(local)
                }
                _ => None,
            })
            .expect("a proven entity factory contains its allocation local");
        let id = local_pattern_binding_id(&function_context, &local.pat)
            .expect("the lexical resolver recorded the proven allocation binding");
        function_context.insert(format!("{FINISH_ENTITY_RETURN_MARKER}{id}"));
    }
    if matches!(&function.sig.output, ReturnType::Type(_, rust_type) if type_is_named(rust_type, "u32"))
    {
        function_context.insert(RETURNS_U32_MARKER.to_string());
    }
    if nullable_return {
        function_context.insert(RETURNS_NULLABLE_MARKER.to_string());
    }
    if function_returns_uint8_array(function, entities) {
        function_context.insert(format!("{RETURNS_CONTRACT_TYPED_ARRAY_MARKER}Uint8Array"));
    }
    if let ReturnType::Type(_, rust_type) = &function.sig.output
        && let Type::Array(array) = rust_type.as_ref()
        && let Some(array_type) = typed_array_for_type(&array.elem)
    {
        function_context.insert(format!("{RETURNS_TYPED_ARRAY_MARKER}{array_type}"));
    }
    if let Some(array_type) = function_returned_typed_array(&function_context) {
        insert_typed_array_vec_locals(&function.block, &array_type, &mut function_context);
    }
    emit_function_block(out, &function.block.stmts, &function_context, 1)?;
    out.push_str("}\n");
    return Ok(());
}

pub(crate) fn emit_local_function(
    out: &mut String,
    function: &ItemFn,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let rust_name = function.sig.ident.to_string();
    let name = snake_to_lower_camel(&rust_name);
    let type_parameters = emit_type_parameters(&function.sig.generics);
    let mut signature_context = entities
        .iter()
        .filter(|marker| {
            !marker.starts_with(FINISH_ENTITY_RETURN_MARKER)
                && marker.as_str() != FLIGHT_ERROR_RETURNS_MARKER
        })
        .cloned()
        .collect::<HashSet<_>>();
    insert_type_parameter_context(&mut signature_context, &function.sig.generics);
    for argument in &function.sig.inputs {
        let FnArg::Typed(argument) = argument else {
            continue;
        };
        let Pat::Ident(pattern) = argument.pat.as_ref() else {
            continue;
        };
        if signature_context.contains(&format!(
            "{VITEST_MUTABLE_SCALAR_CELL_PARAMETER_MARKER}{rust_name}:{}",
            pattern.ident
        )) {
            signature_context.insert(format!(
                "{MUTABLE_SCALAR_CELL_PARAMETER_NAME_MARKER}{}",
                pattern.ident
            ));
        }
    }
    let parameters = function
        .sig
        .inputs
        .iter()
        .map(|argument| emit_parameter(argument, &signature_context))
        .collect::<Result<Vec<_>, _>>()?;
    let return_type = match &function.sig.output {
        ReturnType::Default => "void".to_string(),
        ReturnType::Type(_, _) if function_returns_uint8_array(function, entities) => {
            "Uint8Array".to_string()
        }
        ReturnType::Type(_, rust_type) => emit_type(rust_type, &signature_context)?,
    };
    write_indent(out, indent);
    writeln!(
        out,
        "function {name}{type_parameters}({}): {return_type} {{",
        parameters.join(", ")
    )
    .expect("writing to a String cannot fail");
    let mut function_context = function_expression_context(function, &signature_context);
    for argument in &function.sig.inputs {
        if let FnArg::Typed(typed) = argument {
            if let Some(param_name) = local_pattern_name(&typed.pat) {
                function_context.insert(format!("{SCOPE_DECLARED_MARKER}{param_name}"));
                let camel = snake_to_lower_camel(&param_name);
                let marker = format!("{MUTABLE_PARAMETER_MARKER}{camel}");
                if parameter_is_reassignable(&param_name, &typed.ty, &function.block) {
                    function_context.insert(marker);
                } else {
                    function_context.remove(&marker);
                }
                if camel != param_name {
                    function_context.insert(format!("{SCOPE_DECLARED_MARKER}{camel}"));
                }
            }
        }
    }
    function_context.insert(format!("{RETURN_TYPE_MARKER}{return_type}"));
    if matches!(&function.sig.output, ReturnType::Type(_, rust_type) if type_is_named(rust_type, "u32"))
    {
        function_context.insert(RETURNS_U32_MARKER.to_string());
    }
    if function_returns_uint8_array(function, entities) {
        function_context.insert(format!("{RETURNS_CONTRACT_TYPED_ARRAY_MARKER}Uint8Array"));
    }
    if let ReturnType::Type(_, rust_type) = &function.sig.output
        && let Type::Array(array) = rust_type.as_ref()
        && let Some(array_type) = typed_array_for_type(&array.elem)
    {
        function_context.insert(format!("{RETURNS_TYPED_ARRAY_MARKER}{array_type}"));
    }
    if let Some(array_type) = function_returned_typed_array(&function_context) {
        insert_typed_array_vec_locals(&function.block, &array_type, &mut function_context);
    }
    emit_function_block(out, &function.block.stmts, &function_context, indent + 1)?;
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

// Rust value bindings already resolved for the enclosing function. Portable nested function items
// use this to reject an apparent free identifier that would become a JavaScript closure capture.
// Rust function items cannot capture their environment, so accepting such source would mean the
// compiler had inferred semantics from Rust that does not type-check.
pub(crate) fn lexical_binding_names(context: &HashSet<String>) -> BTreeSet<String> {
    return context
        .iter()
        .filter_map(|marker| marker.strip_prefix(BINDING_MARKER))
        .filter_map(|binding| binding.split_once('=').map(|(name, _)| name.to_string()))
        .collect();
}

pub(super) fn emit_function_trait_type(
    bounds: &syn::punctuated::Punctuated<syn::TypeParamBound, syn::token::Plus>,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return emit_function_trait_type_with_parameter_names(bounds, entities, None);
}

pub(super) fn emit_callable_parameters(
    parameter_types: &[&Type],
    entities: &HashSet<String>,
    parameter_names: Option<&[String]>,
) -> Result<Vec<String>, CompileError> {
    if let Some(parameter_names) = parameter_names
        && parameter_names.len() != parameter_types.len()
    {
        return Err(compile_error(
            "callable parameter name count changed after directive validation",
        ));
    }
    let trailing_optional_start = if entities.contains(NULLABLE_OPTIONS_MARKER) {
        parameter_types.len()
    } else {
        parameter_types
            .iter()
            .rposition(|rust_type| option_inner_type(rust_type).is_none())
            .map_or(0, |index| index + 1)
    };
    return parameter_types
        .iter()
        .enumerate()
        .map(|(index, rust_type)| {
            let name = parameter_names
                .and_then(|parameter_names| parameter_names.get(index))
                .cloned()
                .unwrap_or_else(|| format!("arg{index}"));
            if index >= trailing_optional_start {
                let inner = option_inner_type(rust_type).ok_or_else(|| {
                    compile_error("only trailing Option callable parameters can be optional")
                })?;
                return Ok(format!("{name}?: {}", emit_type(inner, entities)?));
            }
            return Ok(format!("{name}: {}", emit_type(rust_type, entities)?));
        })
        .collect();
}

pub(super) fn emit_function_trait_type_with_parameter_names(
    bounds: &syn::punctuated::Punctuated<syn::TypeParamBound, syn::token::Plus>,
    entities: &HashSet<String>,
    parameter_names: Option<&[String]>,
) -> Result<String, CompileError> {
    if trait_object_is_standard_any(bounds, entities) {
        return Ok("object".to_string());
    }
    for bound in bounds {
        let syn::TypeParamBound::Trait(bound) = bound else {
            continue;
        };
        let Some(segment) = bound.path.segments.last() else {
            continue;
        };
        if !matches!(
            segment.ident.to_string().as_str(),
            "Fn" | "FnMut" | "FnOnce"
        ) {
            continue;
        }
        let PathArguments::Parenthesized(arguments) = &segment.arguments else {
            return Err(compile_error(
                "Rust function trait needs parenthesized arguments",
            ));
        };
        let parameter_types = arguments.inputs.iter().collect::<Vec<_>>();
        let parameters = emit_callable_parameters(&parameter_types, entities, parameter_names)?;
        let output = emit_callable_return_type(&arguments.output, entities)?;
        return Ok(format!("({}) => {output}", parameters.join(", ")));
    }
    return Ok("object".to_string());
}
