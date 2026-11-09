use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fmt::Write;

use quote::ToTokens;
use syn::visit::Visit;
use syn::{
    Expr, FnArg, GenericArgument, Ident, Item, ItemFn, ItemStruct, Pat, Path, PathArguments,
    ReturnType, Stmt, Type, Visibility,
};

use crate::model::{ExternalNullableOptionProgram, Program};
use crate::{CompileError, compile_error};

use super::{
    ARRAY_LIKE_ARGUMENT_MARKER, ARRAY_LIKE_PARAMETER_MARKER, BINDING_FACT_MARKER, BINDING_MARKER,
    BOOLEAN_EXPRESSION_MARKER, BOOLEAN_FIELD_MARKER, BindingFact, CALLBACK_ARGUMENT_MARKER,
    CLOSURE_PARAMETER_MARKER, CONST_GROUP_MEMBER_MARKER, CRATE_USE_BINDING_MARKER,
    CRATE_USE_GLOB_MARKER, DEFAULT_OBJECT_MARKER, DIRECT_LOCK_GUARD_BINDING_MARKER,
    DIRECT_LOCK_GUARD_TARGET_MARKER, ENTITY_CLONE_FIELD_MARKER, ENTITY_DEFAULT_FIELD_MARKER,
    ENTITY_DEFINITELY_INITIALIZED_FIELD_MARKER, ENTITY_INITIALIZER_PREFIX_FIELD_MARKER,
    ENTITY_RUNTIME_STATE_FIELD_MARKER, ENTITY_RUNTIME_STATE_MARKER, ENTITY_TYPE_MARKER,
    ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER, ENUM_DEFAULT_VARIANT_MARKER,
    ERASED_SHARED_CELL_FIELD_MARKER, EXTERNAL_STRUCT_FIELD_MARKER, FIXED_BUFFER_ARGUMENT_MARKER,
    FIXED_BUFFER_LOCAL_MARKER, FROZEN_OBJECT_MARKER, FUNCTION_OWNER_MARKER,
    HASH_COLLECTION_FIELD_MARKER, INLINE_STRING_UNION_MARKER, INTEGER_EXPRESSION_MARKER,
    INTERIOR_MUTABLE_STRUCT_MARKER, INTERNAL_TYPE_EXPORT_MARKER, JSON_VALUE_MARKER,
    JSON_VALUE_OPTION_MARKER, METHOD_DELEGATION_MARKER, MUT_VEC_PARAMETERS_MARKER,
    MUTABLE_SCALAR_CELL_PARAMETER_BINDING_MARKER, MUTABLE_SCALAR_CELL_PARAMETER_NAME_MARKER,
    MUTABLE_SCALAR_REFERENCE_ARGUMENT_MARKER, NULLABLE_CALL_MARKER, NULLABLE_OPTION_FIELD_MARKER,
    NULLABLE_OPTION_LITERAL_FIELD_MARKER, NULLABLE_OPTION_RETURN_MARKER, NULLABLE_OPTIONS_MARKER,
    NULLABLE_OPTIONS_SOURCE_MARKER, NUMERIC_FIELD_TYPE_MARKER, OPTION_FIELD_MARKER,
    OPTION_RETURN_MARKER, ORDERED_PRIMITIVE_MARKER, PROVENANCE_SEPARATOR,
    PUBLIC_USE_BINDING_MARKER, PUBLIC_USE_GLOB_MARKER, ProvenanceDeclarations, ProvenanceIdentity,
    READONLY_ENTITY_MARKER, RECORD_CLONE_ARGUMENT_MARKER, RECORD_CLONE_LOCAL_MARKER,
    RECORD_CLONE_TYPE_MARKER, RECORD_VEC_FIELD_MARKER, REFERENCE_PARAMETER_BINDING_MARKER,
    RETURN_BINDING_FACT_MARKER, RuntimeCategory, SEQUENCE_FIELD_ELEMENT_MARKER,
    SEQUENCE_FIELD_MARKER, SEQUENCE_RETURN_MARKER, SHARED_IDENTITY_ELEMENT_FIELD_MARKER,
    SHARED_IDENTITY_ENTITY_MARKER, SHARED_IDENTITY_FIELD_MARKER, SHARED_IDENTITY_RETURN_MARKER,
    SLICE_ARGUMENT_MARKER, SOURCE_TYPE_PATH_CONTEXT_MARKER, STRING_EXPRESSION_MARKER,
    STRING_FIELD_MARKER, STRING_RETURN_MARKER, STRING_UNION_MARKER, STRUCT_FIELD_TYPE_MARKER,
    STRUCT_OWNER_MARKER, STRUCT_RETURN_MARKER, SourceAccess, TARGET_NATIVE_ENTITY_MARKER,
    TYPE_ALIAS_DEFINITION_MARKER, TYPE_ALIAS_GENERICS_MARKER, TYPE_ALIAS_OWNER_MARKER,
    TYPED_ARRAY_FIELD_MARKER, TYPED_ARRAY_SEQUENCE_FIELD_MARKER, UNSIGNED_INTEGER_LOCAL_MARKER,
    USE_BINDING_MARKER, USE_GLOB_MARKER, VEC_CLONE_ARGUMENT_MARKER, VEC_CLONE_EXPRESSION_MARKER,
    VITEST_FUNCTION_CANDIDATE_MARKER, VITEST_FUNCTION_RETURN_CANDIDATE_MARKER,
    VITEST_FUNCTION_RETURN_UNRESOLVED_MARKER, VITEST_PUBLIC_FUNCTION_MARKER,
    VITEST_STRUCT_CANDIDATE_MARKER, VITEST_STRUCT_LOCAL_MARKER, VITEST_STRUCT_OWNER_MARKER,
    VITEST_STRUCT_RETURN_MARKER, argument_is_nullable_guard, argument_is_option,
    bind_lexical_pattern, binding_fact_for_type, binding_fact_marker, call_turbofish_is_json_value,
    callable_parameter_types, collect_definitely_assigned_fields, contract_export_rules,
    cross_crate_symbols, custom_default_field_values, data_union_variant_categories,
    default_object_literal, direct_lock_guard_receiver, emit_path_type_arguments, emit_type,
    entity_allocation_of, entity_field_default, entity_runtime_state_store,
    exact_mutable_scalar_reference, expression_is_json_value, expression_is_known_boolean,
    expression_is_known_string, expression_is_option_of_json_value, expression_is_plain_place,
    external_struct_type_in, fixed_buffer_type, fixed_typed_array_type, hash_collection_type,
    initializer_prefix_fields, insert_data_union_context, insert_data_union_context_for,
    insert_export_name_context, insert_lexical_binding_context, insert_program_type_path_context,
    insert_record_map_local_context, insert_typed_array_constant_context, is_crate_wide, is_public,
    js_string_literal, leading_mutable_entity_parameter, lexical_binding, local_pattern_binding_id,
    local_pattern_name, module_identity_segments, named_type, option_inner_type, owner_marker,
    path_owner_and_member, peel_wrapper_type_name, primitive_type_identity, provenance_bindings,
    provenance_import_rules, public_module_bindings, resolve_import_rules,
    resolve_program_use_prefix, resolved_production_type_identities, resolved_type_identity,
    rust_default_expression, rust_type_description, rust_type_has_interior_mutability,
    rust_type_is_erased_shared_cell, rust_type_is_json_value, rust_type_is_ordered_primitive,
    rust_type_is_sequence, rust_type_is_string, sequence_inner_type, shared_identity_type_at_depth,
    snake_to_lower_camel, source_access_for_visibility, standard_vec_inner_type, type_is_integer,
    type_is_unsigned_integer, type_script_type_alias, typed_slice_parameter_kind_with_provenance,
    uint8_array_parameter, use_tree_paths, vec_clone_optional, vitest_named_type,
    vitest_path_binding_name, vitest_pattern_context, vitest_struct_owner, write_indent,
};
pub(crate) fn generation_context(
    programs: &[(&str, &Program)],
    external_record_structs: &[ItemStruct],
    external_shared_identity_facts: &BTreeSet<String>,
    contract_source: Option<&str>,
    provenance_visibility_programs: &[(&str, &Program)],
) -> Result<HashSet<String>, CompileError> {
    return generation_context_with_types(
        programs,
        external_record_structs,
        &external_shared_identity_facts.iter().cloned().collect(),
        contract_source,
        true,
        &[],
        provenance_visibility_programs,
    );
}

/// Rebuilds same-package Vitest function provenance from emitted aliases plus named visibility-only
/// sources. Visibility sources contribute declarations and public `use` edges only; their bodies
/// remain inert. Contract selection and ambiguity checks are therefore identical for generated and
/// target-native owners without promoting a target-native file into the alias/emission lane.
pub(crate) fn insert_vitest_visibility_function_context<'a>(
    context: &mut HashSet<String>,
    programs: impl Iterator<Item = (&'a str, &'a Program, bool)>,
    contract_source: Option<&str>,
) -> Result<(), CompileError> {
    let programs = programs.collect::<Vec<_>>();
    context.retain(|value| {
        !value.starts_with(VITEST_FUNCTION_CANDIDATE_MARKER)
            && !value.starts_with(VITEST_PUBLIC_FUNCTION_MARKER)
    });
    let mut owners = ProvenanceDeclarations::new();
    for (module, program, current_package) in &programs {
        if !current_package {
            continue;
        }
        for function in &program.functions {
            if !is_public(&function.vis) {
                continue;
            }
            let declaration = function.sig.ident.to_string();
            owners
                .entry(declaration.clone())
                .or_default()
                .insert(ProvenanceIdentity {
                    declaration,
                    module: (*module).to_string(),
                });
        }
    }
    for (declaration, identities) in &owners {
        for identity in identities {
            insert_provenance_binding(
                context,
                VITEST_FUNCTION_CANDIDATE_MARKER,
                declaration,
                &identity.encoded(),
            );
        }
    }
    let current_package_programs = programs
        .iter()
        .filter(|(_, _, current_package)| *current_package)
        .map(|(module, program, _)| (*module, *program))
        .collect::<Vec<_>>();
    let module_bindings = public_module_bindings(&owners, &current_package_programs);
    let contract_rules = contract_source.map(contract_export_rules).transpose()?;
    let bindings = provenance_bindings(
        &owners,
        &module_bindings,
        contract_rules.as_deref(),
        "function",
    )?;
    for (exported, identity) in bindings {
        insert_provenance_binding(
            context,
            VITEST_PUBLIC_FUNCTION_MARKER,
            &exported,
            &identity.encoded(),
        );
    }
    return Ok(());
}

// Function provenance retains caller-facing source paths for contract selection. Parameter
// representation proof instead needs canonical Rust module identities so `use` and re-export paths
// can resolve across visibility-only dependency sources.
pub(crate) fn insert_vitest_visibility_function_parameter_context<'a>(
    context: &mut HashSet<String>,
    programs: impl Iterator<Item = (&'a str, &'a Program, bool)>,
) {
    for (module, program, current_package) in programs {
        if !current_package {
            continue;
        }
        for function in &program.functions {
            if !is_public(&function.vis) {
                continue;
            }
            let declaration = function.sig.ident.to_string();
            for (argument_index, argument) in function.sig.inputs.iter().enumerate() {
                let FnArg::Typed(argument) = argument else {
                    continue;
                };
                context.insert(format!(
                    "{SLICE_ARGUMENT_MARKER}{declaration}:{argument_index}:{}",
                    typed_slice_parameter_kind_with_provenance(&argument.ty, context, module)
                ));
            }
        }
    }
}

// Visibility-only siblings are not emitted or walked, but their declared struct owners and
// collection-shaped fields are still type evidence for a generated source that imports them. Keep
// this deliberately narrower than adding the siblings as alias programs: method dispatch may use
// their exact declarations, while their bodies and unrelated generation directives stay inert.
pub(super) fn insert_visibility_collection_context(
    context: &mut HashSet<String>,
    programs: &[(&str, &Program)],
) {
    for (module, program) in programs {
        let mut type_path_context = HashSet::new();
        insert_program_type_path_context(&mut type_path_context, program);
        for structure in &program.structs {
            context.insert(owner_marker(
                STRUCT_OWNER_MARKER,
                module,
                &structure.ident.to_string(),
                source_access_for_visibility(&structure.vis),
            ));
            if program.entities.contains(&structure.ident.to_string()) {
                context.insert(format!(
                    "{ENTITY_TYPE_MARKER}{module}{PROVENANCE_SEPARATOR}{}",
                    structure.ident
                ));
            }
            let identity = format!("{module}{PROVENANCE_SEPARATOR}{}", structure.ident);
            for field in &structure.fields {
                let Some(field_name) = &field.ident else {
                    continue;
                };
                if let Some(kind) = hash_collection_type(&field.ty, &type_path_context) {
                    context.insert(format!(
                        "{HASH_COLLECTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                        binding_fact_marker(&kind)
                    ));
                }
                if rust_type_is_sequence(&field.ty) {
                    context.insert(format!(
                        "{SEQUENCE_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                    ));
                }
            }
        }
    }
    // Field types resolve once every visibility owner is known: a nested struct field, an `Option`
    // payload, a sequence element or a numeric primitive is evidence for a chained read
    // (`world.joint_events.broke`) the same way a program source's declarations are.
    let mut typed_facts = Vec::new();
    for (module, program) in programs {
        for structure in &program.structs {
            let identity = format!("{module}{PROVENANCE_SEPARATOR}{}", structure.ident);
            for field in &structure.fields {
                let Some(field_name) = &field.ident else {
                    continue;
                };
                if let Some(field_identity) = resolved_type_identity(context, module, &field.ty) {
                    typed_facts.push(format!(
                        "{STRUCT_FIELD_TYPE_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{field_identity}"
                    ));
                }
                if let Some(inner) = option_inner_type(&field.ty) {
                    let inner_fact = binding_fact_for_type(context, Some(module), inner);
                    typed_facts.push(format!(
                        "{OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                        binding_fact_marker(&inner_fact)
                    ));
                }
                if rust_type_is_sequence(&field.ty)
                    && let Some(inner) = sequence_inner_type(&field.ty)
                {
                    let element_fact = binding_fact_for_type(context, Some(module), inner);
                    if element_fact.has_source_structure()
                        || matches!(element_fact, BindingFact::TypedArray(_))
                    {
                        typed_facts.push(format!(
                            "{SEQUENCE_FIELD_ELEMENT_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                            binding_fact_marker(&element_fact)
                        ));
                    }
                }
                if let Some(numeric) = primitive_type_identity(&field.ty)
                    .filter(|name| !matches!(name.as_str(), "bool" | "str" | "String"))
                {
                    typed_facts.push(format!(
                        "{NUMERIC_FIELD_TYPE_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{numeric}"
                    ));
                }
            }
        }
    }
    context.extend(typed_facts);
}

// Visibility-only sources do not contribute bodies or emitted declarations, but their public type
// alias graph is still semantic evidence for signatures owned by target-native modules. Record only
// use edges, source type paths, and alias definitions so a caller can prove an alias through its
// complete re-export chain without activating unrelated generation directives.
pub(crate) fn insert_visibility_type_alias_context(
    context: &mut HashSet<String>,
    programs: &[(&str, &Program)],
) {
    for (module, program) in programs {
        if let Some(segments) = module_identity_segments(module) {
            for rust_use in &program.uses {
                for path in use_tree_paths(std::iter::once(rust_use)) {
                    let Some(target) = resolve_program_use_prefix(&segments, program, &path.prefix)
                    else {
                        continue;
                    };
                    let target = target.join("::");
                    match path.item {
                        Some((imported, exported)) => {
                            context.insert(format!(
                                "{USE_BINDING_MARKER}{module}{PROVENANCE_SEPARATOR}{exported}{PROVENANCE_SEPARATOR}{target}{PROVENANCE_SEPARATOR}{imported}"
                            ));
                            if is_crate_wide(&rust_use.vis) {
                                context.insert(format!(
                                    "{CRATE_USE_BINDING_MARKER}{module}{PROVENANCE_SEPARATOR}{exported}{PROVENANCE_SEPARATOR}{target}{PROVENANCE_SEPARATOR}{imported}"
                                ));
                            }
                            if is_public(&rust_use.vis) {
                                context.insert(format!(
                                    "{PUBLIC_USE_BINDING_MARKER}{module}{PROVENANCE_SEPARATOR}{exported}{PROVENANCE_SEPARATOR}{target}{PROVENANCE_SEPARATOR}{imported}"
                                ));
                            }
                        }
                        None => {
                            context.insert(format!(
                                "{USE_GLOB_MARKER}{module}{PROVENANCE_SEPARATOR}{target}"
                            ));
                            if is_crate_wide(&rust_use.vis) {
                                context.insert(format!(
                                    "{CRATE_USE_GLOB_MARKER}{module}{PROVENANCE_SEPARATOR}{target}"
                                ));
                            }
                            if is_public(&rust_use.vis) {
                                context.insert(format!(
                                    "{PUBLIC_USE_GLOB_MARKER}{module}{PROVENANCE_SEPARATOR}{target}"
                                ));
                            }
                        }
                    }
                }
            }
        }
        let mut type_path_context = HashSet::new();
        insert_program_type_path_context(&mut type_path_context, program);
        context.extend(type_path_context.into_iter().map(|fact| {
            format!("{SOURCE_TYPE_PATH_CONTEXT_MARKER}{module}{PROVENANCE_SEPARATOR}{fact}")
        }));
        for alias in &program.type_aliases {
            context.insert(owner_marker(
                TYPE_ALIAS_OWNER_MARKER,
                module,
                &alias.ident.to_string(),
                source_access_for_visibility(&alias.vis),
            ));
            context.insert(format!(
                "{TYPE_ALIAS_DEFINITION_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
                alias.ident,
                alias.ty.to_token_stream()
            ));
        }
    }
}

// External target-native contracts can designate the exact `Option` fields and returns whose
// TypeScript companions store `null`. Carry only those declaration facts into a consumer: the
// dependency remains target-native, while generated callers compare and assign its public surface
// with the owner's absence representation.
pub(crate) fn insert_external_nullable_option_context(
    context: &mut HashSet<String>,
    programs: &[(&str, &ExternalNullableOptionProgram)],
) {
    for (module, program) in programs {
        for structure in program
            .structs
            .iter()
            .filter(|structure| is_public(&structure.vis))
        {
            context.insert(owner_marker(
                STRUCT_OWNER_MARKER,
                module,
                &structure.ident.to_string(),
                SourceAccess::Public,
            ));
        }
        for function in program
            .functions
            .iter()
            .filter(|function| is_public(&function.vis))
        {
            context.insert(owner_marker(
                FUNCTION_OWNER_MARKER,
                module,
                &function.sig.ident.to_string(),
                SourceAccess::Public,
            ));
        }
    }
    for (module, program) in programs {
        for structure in program
            .structs
            .iter()
            .filter(|structure| is_public(&structure.vis))
        {
            let identity = format!("{module}{PROVENANCE_SEPARATOR}{}", structure.ident);
            for field in &structure.fields {
                if !is_public(&field.vis) {
                    continue;
                }
                let (Some(field_name), Some(inner)) = (&field.ident, option_inner_type(&field.ty))
                else {
                    continue;
                };
                let inner_fact = binding_fact_for_type(&context, None, inner);
                context.insert(format!(
                    "{OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                    binding_fact_marker(&inner_fact)
                ));
                if program.nullable_options
                    || program
                        .nullable_option_items
                        .contains(&format!("{}.{field_name}", structure.ident))
                {
                    context.insert(format!(
                        "{NULLABLE_OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                    ));
                }
            }
        }
        for function in program
            .functions
            .iter()
            .filter(|function| is_public(&function.vis))
        {
            let ReturnType::Type(_, rust_type) = &function.sig.output else {
                continue;
            };
            let Some(inner) = option_inner_type(rust_type) else {
                continue;
            };
            let function_name = function.sig.ident.to_string();
            context.insert(format!(
                "{OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{}",
                named_type(inner).unwrap_or_default()
            ));
            if program.nullable_options || program.nullable_option_items.contains(&function_name) {
                context.insert(format!(
                    "{NULLABLE_OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
                ));
            }
        }
    }
}

pub(super) fn insert_external_nullable_import_context(
    context: &mut HashSet<String>,
    current_module: &str,
    program: &Program,
    external_programs: &[(&str, &ExternalNullableOptionProgram)],
) {
    let owners = external_programs
        .iter()
        .map(|(module, _)| *module)
        .collect::<BTreeSet<_>>();
    for symbol in cross_crate_symbols(&program.uses).values() {
        let Some(package) = symbol
            .module
            .strip_prefix("@flighthq/")
            .and_then(|module| module.strip_suffix("/contract"))
        else {
            continue;
        };
        let owner = format!("flight_{}", package.replace('-', "_"));
        if owners.contains(owner.as_str()) {
            context.insert(format!(
                "{USE_BINDING_MARKER}{current_module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{owner}{PROVENANCE_SEPARATOR}{}",
                symbol.local, symbol.imported
            ));
        }
    }
}

pub(crate) fn insert_string_union_context<'a>(
    context: &mut HashSet<String>,
    names: impl Iterator<Item = &'a String>,
) {
    context.extend(names.map(|name| format!("{STRING_UNION_MARKER}{name}")));
}

pub(super) fn insert_inline_string_union_context(
    context: &mut HashSet<String>,
    unions: &BTreeMap<String, Vec<String>>,
) {
    context.extend(unions.iter().map(|(name, values)| {
        let union = values
            .iter()
            .map(|value| js_string_literal(value))
            .collect::<Vec<_>>()
            .join(" | ");
        return format!("{INLINE_STRING_UNION_MARKER}{name}{PROVENANCE_SEPARATOR}{union}");
    }));
}

pub(super) fn insert_internal_type_export_context(context: &mut HashSet<String>, names: &[&str]) {
    context.extend(
        names
            .iter()
            .map(|name| format!("{INTERNAL_TYPE_EXPORT_MARKER}{name}")),
    );
}

pub(super) fn is_internal_type_export(context: &HashSet<String>, name: &str) -> bool {
    return context.contains(&format!("{INTERNAL_TYPE_EXPORT_MARKER}{name}"));
}

pub(super) fn emit_internal_type_export_declarations(
    out: &mut String,
    names: &[&str],
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    for name in names {
        let representation = type_script_type_alias(context, name)
            .map(|(target, _)| target)
            .or_else(|| inline_string_union(context, name))
            .ok_or_else(|| {
                compile_error(format!(
                    "internal TypeScript type export `{name}` has no explicit representation"
                ))
            })?;
        writeln!(out, "type {name} = {representation};\n")
            .expect("writing to a String cannot fail");
    }
    return Ok(());
}

pub(super) fn inline_string_union(context: &HashSet<String>, name: &str) -> Option<String> {
    let prefix = format!("{INLINE_STRING_UNION_MARKER}{name}{PROVENANCE_SEPARATOR}");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix).map(str::to_string));
}

pub(crate) fn insert_nullable_options_context(context: &mut HashSet<String>) {
    context.insert(NULLABLE_OPTIONS_MARKER.to_string());
}

pub(super) fn provenance_marker_values(
    context: &HashSet<String>,
    marker: &str,
    local: &str,
) -> BTreeSet<String> {
    let prefix = format!("{marker}{local}{PROVENANCE_SEPARATOR}");
    return context
        .iter()
        .filter_map(|value| value.strip_prefix(&prefix))
        .map(str::to_string)
        .collect();
}

pub(super) fn clear_provenance_binding(context: &mut HashSet<String>, marker: &str, local: &str) {
    let prefix = format!("{marker}{local}{PROVENANCE_SEPARATOR}");
    context.retain(|value| !value.starts_with(&prefix));
}

pub(super) fn insert_provenance_binding(
    context: &mut HashSet<String>,
    marker: &str,
    local: &str,
    identity: &str,
) {
    context.insert(format!("{marker}{local}{PROVENANCE_SEPARATOR}{identity}"));
}

pub(super) fn provenance_binding_table(
    context: &HashSet<String>,
    marker: &str,
) -> BTreeMap<String, BTreeSet<String>> {
    return context
        .iter()
        .filter_map(|value| value.strip_prefix(marker))
        .filter_map(|value| value.split_once(PROVENANCE_SEPARATOR))
        .fold(BTreeMap::new(), |mut table, (local, identity)| {
            table
                .entry(local.to_string())
                .or_default()
                .insert(identity.to_string());
            table
        });
}

pub(super) fn replace_provenance_binding_table(
    context: &mut HashSet<String>,
    marker: &str,
    table: BTreeMap<String, BTreeSet<String>>,
) {
    context.retain(|value| !value.starts_with(marker));
    for (local, identities) in table {
        for identity in identities {
            insert_provenance_binding(context, marker, &local, &identity);
        }
    }
}

pub(super) fn resolved_provenance_binding(
    context: &HashSet<String>,
    binding_marker: &str,
    candidate_marker: &str,
    local: &str,
    kind: &str,
) -> Result<Option<String>, CompileError> {
    let bindings = provenance_marker_values(context, binding_marker, local);
    if bindings.len() == 1 {
        return Ok(bindings.into_iter().next());
    }
    if bindings.len() > 1 {
        let owners = bindings
            .iter()
            .map(|identity| ProvenanceIdentity::encoded_description(identity))
            .collect::<Vec<_>>()
            .join(", ");
        return Err(compile_error(format!(
            "portable test {kind} binding `{local}` is ambiguous between {owners}; import or shadow exactly one binding"
        )));
    }
    let candidates = provenance_marker_values(context, candidate_marker, local);
    if candidates.is_empty() {
        return Ok(None);
    }
    let owners = candidates
        .iter()
        .map(|identity| ProvenanceIdentity::encoded_description(identity))
        .collect::<Vec<_>>()
        .join(", ");
    return Err(compile_error(format!(
        "portable test {kind} `{local}` resolves to production declaration candidate(s) {owners}, but contract.rs does not select a unique public export; re-export exactly one source owner"
    )));
}

// The scope-local context of a pattern's bindings: Vitest provenance cleared for each bound name, and
// each name bound to the BindingId its site resolved to (or to no fact at all, when the site was not
// resolved), replacing any outer binding of that name within the scope.
pub(crate) fn lexical_pattern_context(context: &HashSet<String>, pattern: &Pat) -> HashSet<String> {
    let mut scoped = vitest_pattern_context(context, pattern);
    bind_lexical_pattern(&mut scoped, pattern);
    return scoped;
}

pub(super) fn provenance_pattern_bindings(pattern: &Pat) -> BTreeSet<String> {
    struct PatternBindingCollector {
        bindings: BTreeSet<String>,
    }

    impl<'ast> Visit<'ast> for PatternBindingCollector {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            self.bindings.insert(pattern.ident.to_string());
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut collector = PatternBindingCollector {
        bindings: BTreeSet::new(),
    };
    collector.visit_pat(pattern);
    return collector.bindings;
}

pub(crate) fn is_string_union(context: &HashSet<String>, name: &str) -> bool {
    return context.contains(&format!("{STRING_UNION_MARKER}{name}"));
}

pub(super) fn generation_context_with_types(
    programs: &[(&str, &Program)],
    external_record_structs: &[ItemStruct],
    type_context: &HashSet<String>,
    contract_source: Option<&str>,
    strict_vitest_provenance: bool,
    visibility_programs: &[Program],
    provenance_visibility_programs: &[(&str, &Program)],
) -> Result<HashSet<String>, CompileError> {
    let mut context = type_context.clone();
    insert_export_name_context(&mut context, programs)?;
    let program_refs = programs
        .iter()
        .map(|(_, program)| *program)
        .collect::<Vec<_>>();
    insert_data_union_context(&mut context, &program_refs, external_record_structs)?;
    let visibility_refs = visibility_programs.iter().collect::<Vec<_>>();
    let resolution_refs = program_refs
        .iter()
        .copied()
        .chain(visibility_refs.iter().copied())
        .collect::<Vec<_>>();
    insert_data_union_context_for(
        &mut context,
        &visibility_refs,
        &resolution_refs,
        external_record_structs,
        true,
    )?;
    let entity_types: HashSet<String> = programs
        .iter()
        .flat_map(|(_, program)| &program.entities)
        .chain(
            visibility_programs
                .iter()
                .flat_map(|program| &program.entities),
        )
        .cloned()
        .collect();
    context.extend(
        entity_types
            .iter()
            .map(|entity| format!("{SHARED_IDENTITY_ENTITY_MARKER}{entity}")),
    );
    for (module, program) in programs {
        insert_typed_array_constant_context(&mut context, &program.constants);
        for constant in &program.constants {
            if rust_type_is_string(&constant.ty) {
                context.insert(format!("{STRING_EXPRESSION_MARKER}{}", constant.ident));
            }
        }
        if program.nullable_options {
            context.insert(format!("{NULLABLE_OPTIONS_SOURCE_MARKER}{module}"));
        }
    }
    for (module, program) in programs {
        for structure in &program.structs {
            let name = structure.ident.to_string();
            if program.entities.contains(&name) && program.readonly_structs.contains(&name) {
                context.insert(format!(
                    "{READONLY_ENTITY_MARKER}{module}{PROVENANCE_SEPARATOR}{name}"
                ));
            }
        }
    }
    let mut callable_type_context = type_context.clone();
    callable_type_context.extend(entity_types.iter().cloned());
    let record_types = programs
        .iter()
        .flat_map(|(_, program)| {
            program
                .structs
                .iter()
                .filter(|structure| !program.entities.contains(&structure.ident.to_string()))
                .map(|structure| structure.ident.to_string())
        })
        .collect::<HashSet<_>>();
    let provenance_programs = programs
        .iter()
        .chain(provenance_visibility_programs)
        .copied()
        .collect::<Vec<_>>();
    insert_visibility_type_alias_context(&mut context, provenance_visibility_programs);
    let mut public_struct_owners = ProvenanceDeclarations::new();
    let mut public_function_owners = ProvenanceDeclarations::new();
    for (module, program) in &provenance_programs {
        for structure in &program.structs {
            if is_public(&structure.vis) {
                public_struct_owners
                    .entry(structure.ident.to_string())
                    .or_default()
                    .insert(ProvenanceIdentity {
                        declaration: structure.ident.to_string(),
                        module: (*module).to_string(),
                    });
            }
        }
        for function in &program.functions {
            if is_public(&function.vis) {
                public_function_owners
                    .entry(function.sig.ident.to_string())
                    .or_default()
                    .insert(ProvenanceIdentity {
                        declaration: function.sig.ident.to_string(),
                        module: (*module).to_string(),
                    });
            }
        }
    }
    let public_struct_module_bindings =
        public_module_bindings(&public_struct_owners, &provenance_programs);
    let public_function_module_bindings =
        public_module_bindings(&public_function_owners, &provenance_programs);
    if strict_vitest_provenance {
        for (declaration, identities) in &public_struct_owners {
            for identity in identities {
                insert_provenance_binding(
                    &mut context,
                    VITEST_STRUCT_CANDIDATE_MARKER,
                    declaration,
                    &identity.encoded(),
                );
            }
        }
        for (declaration, identities) in &public_function_owners {
            for identity in identities {
                insert_provenance_binding(
                    &mut context,
                    VITEST_FUNCTION_CANDIDATE_MARKER,
                    declaration,
                    &identity.encoded(),
                );
            }
        }
        let contract_rules = contract_source.map(contract_export_rules).transpose()?;
        let struct_bindings = provenance_bindings(
            &public_struct_owners,
            &public_struct_module_bindings,
            contract_rules.as_deref(),
            "struct/type",
        )?;
        let function_bindings = provenance_bindings(
            &public_function_owners,
            &public_function_module_bindings,
            contract_rules.as_deref(),
            "function",
        )?;
        for (exported, identity) in &struct_bindings {
            context.insert(format!(
                "{VITEST_STRUCT_OWNER_MARKER}{exported}{PROVENANCE_SEPARATOR}{}",
                identity.encoded()
            ));
        }
        for (exported, identity) in &function_bindings {
            context.insert(format!(
                "{VITEST_PUBLIC_FUNCTION_MARKER}{exported}{PROVENANCE_SEPARATOR}{}",
                identity.encoded()
            ));
        }
    } else {
        for (structure, owners) in &public_struct_owners {
            for owner in owners {
                context.insert(format!(
                    "{VITEST_STRUCT_OWNER_MARKER}{structure}{PROVENANCE_SEPARATOR}{}",
                    owner.encoded()
                ));
            }
        }
        for (function, owners) in &public_function_owners {
            for owner in owners {
                context.insert(format!(
                    "{VITEST_PUBLIC_FUNCTION_MARKER}{function}{PROVENANCE_SEPARATOR}{}",
                    owner.encoded()
                ));
            }
        }
    }
    let record_vec_fields = programs
        .iter()
        .flat_map(|(_, program)| &program.structs)
        .filter(|structure| record_types.contains(&structure.ident.to_string()))
        .map(|structure| {
            let fields = structure
                .fields
                .iter()
                .filter(|field| is_public(&field.vis))
                .filter_map(|field| {
                    let optional = vec_clone_optional(&field.ty)?;
                    let name = snake_to_lower_camel(&field.ident.as_ref()?.to_string());
                    Some((name, optional))
                })
                .collect::<Vec<_>>();
            (structure.ident.to_string(), fields)
        })
        .collect::<HashMap<_, _>>();
    for (module, program) in programs {
        if let Some(segments) = module_identity_segments(module) {
            for rust_use in &program.uses {
                for path in use_tree_paths(std::iter::once(rust_use)) {
                    let Some(target) = resolve_program_use_prefix(&segments, program, &path.prefix)
                    else {
                        continue;
                    };
                    let target = target.join("::");
                    let (binding, crate_binding, public_binding) = match path.item {
                        Some((imported, exported)) => (
                            format!(
                                "{USE_BINDING_MARKER}{module}{PROVENANCE_SEPARATOR}{exported}{PROVENANCE_SEPARATOR}{target}{PROVENANCE_SEPARATOR}{imported}"
                            ),
                            format!(
                                "{CRATE_USE_BINDING_MARKER}{module}{PROVENANCE_SEPARATOR}{exported}{PROVENANCE_SEPARATOR}{target}{PROVENANCE_SEPARATOR}{imported}"
                            ),
                            format!(
                                "{PUBLIC_USE_BINDING_MARKER}{module}{PROVENANCE_SEPARATOR}{exported}{PROVENANCE_SEPARATOR}{target}{PROVENANCE_SEPARATOR}{imported}"
                            ),
                        ),
                        None => (
                            format!("{USE_GLOB_MARKER}{module}{PROVENANCE_SEPARATOR}{target}"),
                            format!(
                                "{CRATE_USE_GLOB_MARKER}{module}{PROVENANCE_SEPARATOR}{target}"
                            ),
                            format!(
                                "{PUBLIC_USE_GLOB_MARKER}{module}{PROVENANCE_SEPARATOR}{target}"
                            ),
                        ),
                    };
                    context.insert(binding);
                    if is_crate_wide(&rust_use.vis) {
                        context.insert(crate_binding);
                    }
                    if is_public(&rust_use.vis) {
                        context.insert(public_binding);
                    }
                }
            }
        }
        for (owner, field_name) in &program.entity_runtime_states {
            context.insert(format!(
                "{ENTITY_RUNTIME_STATE_MARKER}{module}{PROVENANCE_SEPARATOR}{owner}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                entity_runtime_state_store(owner, field_name)
            ));
            context.insert(format!(
                "{ENTITY_RUNTIME_STATE_FIELD_MARKER}{field_name}{PROVENANCE_SEPARATOR}{owner}"
            ));
        }
        let mut type_path_context = HashSet::new();
        insert_program_type_path_context(&mut type_path_context, program);
        context.extend(type_path_context.iter().map(|fact| {
            format!("{SOURCE_TYPE_PATH_CONTEXT_MARKER}{module}{PROVENANCE_SEPARATOR}{fact}")
        }));
        for (owner, fields) in &program.entity_clone_shared_fields {
            for field in fields {
                let structure = program
                    .structs
                    .iter()
                    .find(|structure| structure.ident == owner.as_str())
                    .expect("entity clone field validation resolved the owner");
                let rust_field = structure
                    .fields
                    .iter()
                    .find(|rust_field| {
                        rust_field
                            .ident
                            .as_ref()
                            .is_some_and(|ident| ident == field)
                    })
                    .expect("entity clone field validation resolved the field");
                if !rust_type_is_erased_shared_cell(&rust_field.ty, &type_path_context) {
                    return Err(compile_error(format!(
                        "`flight-compiler: entity-clone-fields {owner}.{field}` must designate a proven `flight_entity::Ref<T>` or standard `Arc<RwLock<T>>` field"
                    )));
                }
                context.insert(format!(
                    "{ENTITY_CLONE_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{field}"
                ));
            }
        }
        for structure in &program.structs {
            context.insert(owner_marker(
                STRUCT_OWNER_MARKER,
                module,
                &structure.ident.to_string(),
                source_access_for_visibility(&structure.vis),
            ));
            if program.entities.contains(&structure.ident.to_string()) {
                context.insert(format!(
                    "{ENTITY_TYPE_MARKER}{module}{PROVENANCE_SEPARATOR}{}",
                    structure.ident
                ));
            }
            if structure
                .fields
                .iter()
                .any(|field| rust_type_has_interior_mutability(&field.ty, &HashSet::new()))
            {
                context.insert(format!(
                    "{INTERIOR_MUTABLE_STRUCT_MARKER}{}",
                    structure.ident
                ));
            }
        }
        for function in &program.functions {
            context.insert(owner_marker(
                FUNCTION_OWNER_MARKER,
                module,
                &function.sig.ident.to_string(),
                source_access_for_visibility(&function.vis),
            ));
            for stmt in &function.block.stmts {
                if let Stmt::Item(Item::Fn(inner)) = stmt {
                    context.insert(owner_marker(
                        FUNCTION_OWNER_MARKER,
                        module,
                        &inner.sig.ident.to_string(),
                        SourceAccess::Local,
                    ));
                }
            }
        }
        for alias in &program.type_aliases {
            context.insert(owner_marker(
                TYPE_ALIAS_OWNER_MARKER,
                module,
                &alias.ident.to_string(),
                source_access_for_visibility(&alias.vis),
            ));
            context.insert(format!(
                "{TYPE_ALIAS_DEFINITION_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
                alias.ident,
                alias.ty.to_token_stream()
            ));
            if !alias.generics.params.is_empty() {
                let params: Vec<String> = alias
                    .generics
                    .params
                    .iter()
                    .filter_map(|p| match p {
                        syn::GenericParam::Type(t) => Some(t.ident.to_string()),
                        _ => None,
                    })
                    .collect();
                context.insert(format!(
                    "{TYPE_ALIAS_GENERICS_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
                    alias.ident,
                    params.join(",")
                ));
            }
        }
    }
    for (module, program) in programs {
        let local_struct_bindings = program
            .structs
            .iter()
            .filter(|structure| is_public(&structure.vis))
            .map(|structure| {
                let identity = ProvenanceIdentity {
                    declaration: structure.ident.to_string(),
                    module: (*module).to_string(),
                };
                (structure.ident.to_string(), BTreeSet::from([identity]))
            })
            .collect::<BTreeMap<_, _>>();
        let contract_struct_bindings =
            provenance_binding_table(&context, VITEST_STRUCT_OWNER_MARKER)
                .into_iter()
                .map(|(name, identities)| {
                    let identities = identities
                        .into_iter()
                        .filter_map(|identity| {
                            let (module, declaration) =
                                identity.split_once(PROVENANCE_SEPARATOR)?;
                            Some(ProvenanceIdentity {
                                declaration: declaration.to_string(),
                                module: module.to_string(),
                            })
                        })
                        .collect();
                    (name, identities)
                })
                .collect::<BTreeMap<_, _>>();
        let production_struct_bindings = resolve_import_rules(
            &public_struct_owners,
            &provenance_import_rules(program.uses.iter(), Some(module)),
            local_struct_bindings,
            &contract_struct_bindings,
            &public_struct_module_bindings,
        );
        context.extend(program.entities.iter().cloned());
        if program.source_mode == crate::SourceMode::TargetNative {
            context.extend(
                program
                    .entities
                    .iter()
                    .map(|entity| format!("{TARGET_NATIVE_ENTITY_MARKER}{entity}")),
            );
        }
        context.extend(
            program
                .frozen_objects
                .iter()
                .map(|(rust_name, typescript_name)| {
                    format!("{FROZEN_OBJECT_MARKER}{rust_name}:{typescript_name}")
                }),
        );
        context.extend(
            crate::model::const_group_members(&program.const_groups, &program.constants)?
                .into_iter()
                .map(|(rust_name, owner, member)| {
                    format!("{CONST_GROUP_MEMBER_MARKER}{rust_name}:{owner}.{member}")
                }),
        );
        insert_string_union_context(&mut context, program.string_unions.keys());
        let mut owned_facts = Vec::new();
        let mut type_path_context = HashSet::new();
        insert_program_type_path_context(&mut type_path_context, program);
        for name in &program.default_objects {
            let structure = program
                .structs
                .iter()
                .find(|structure| structure.ident == name)
                .expect("default-object validation resolved the struct");
            let literal =
                default_object_literal(module, program, structure, &type_path_context, &context)?;
            context.insert(format!(
                "{DEFAULT_OBJECT_MARKER}{module}{PROVENANCE_SEPARATOR}{name}{PROVENANCE_SEPARATOR}{literal}"
            ));
        }
        for structure in &program.structs {
            let identity = format!("{module}{PROVENANCE_SEPARATOR}{}", structure.ident);
            for field in &structure.fields {
                let Some(field_name) = &field.ident else {
                    continue;
                };
                if let Some(inner) = option_inner_type(&field.ty) {
                    let inner_fact = binding_fact_for_type(&context, Some(module), inner);
                    owned_facts.push(format!(
                        "{OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                        binding_fact_marker(&inner_fact)
                    ));
                }
                if rust_type_is_sequence(&field.ty) {
                    owned_facts.push(format!(
                        "{SEQUENCE_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                    ));
                    if let Some(inner) = sequence_inner_type(&field.ty) {
                        let element_fact = binding_fact_for_type(&context, Some(module), inner);
                        if element_fact.has_source_structure()
                            || matches!(element_fact, BindingFact::TypedArray(_))
                        {
                            owned_facts.push(format!(
                                "{SEQUENCE_FIELD_ELEMENT_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                                binding_fact_marker(&element_fact)
                            ));
                        }
                    }
                }
                if let Some(array_type) = fixed_typed_array_type(&field.ty) {
                    owned_facts.push(format!(
                        "{TYPED_ARRAY_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{array_type}"
                    ));
                }
                if let Some(array_type) =
                    sequence_inner_type(&field.ty).and_then(fixed_typed_array_type)
                {
                    owned_facts.push(format!(
                        "{TYPED_ARRAY_SEQUENCE_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{array_type}"
                    ));
                }
                if rust_type_is_string(&field.ty) {
                    owned_facts.push(format!(
                        "{STRING_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                    ));
                }
                if let Some(kind) = hash_collection_type(&field.ty, &type_path_context) {
                    owned_facts.push(format!(
                        "{HASH_COLLECTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                        binding_fact_marker(&kind)
                    ));
                }
                if rust_type_is_erased_shared_cell(&field.ty, &type_path_context) {
                    owned_facts.push(format!(
                        "{ERASED_SHARED_CELL_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                    ));
                }
            }
        }
        for function in program
            .functions
            .iter()
            .filter(|function| function.sig.generics.params.is_empty())
        {
            let parameters = function
                .sig
                .inputs
                .iter()
                .enumerate()
                .filter_map(|(index, input)| {
                    let FnArg::Typed(argument) = input else {
                        return None;
                    };
                    let Type::Reference(reference) = argument.ty.as_ref() else {
                        return None;
                    };
                    reference.mutability?;
                    let element = standard_vec_inner_type(&reference.elem, &context)?;
                    let identity = primitive_type_identity(element)
                        .or_else(|| resolved_type_identity(&context, module, element))
                        .unwrap_or_default();
                    return Some(format!("{index}={identity}"));
                })
                .collect::<Vec<_>>();
            if !parameters.is_empty() {
                owned_facts.push(format!(
                    "{MUT_VEC_PARAMETERS_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
                    function.sig.ident,
                    parameters.join(",")
                ));
            }
        }
        for function in &program.functions {
            let ReturnType::Type(_, rust_type) = &function.sig.output else {
                continue;
            };
            let function_name = function.sig.ident.to_string();
            let return_fact = hash_collection_type(rust_type, &type_path_context)
                .unwrap_or_else(|| binding_fact_for_type(&context, Some(module), rust_type));
            owned_facts.push(format!(
                "{RETURN_BINDING_FACT_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{}",
                binding_fact_marker(&return_fact)
            ));
            if rust_type_is_sequence(rust_type) {
                owned_facts.push(format!(
                    "{SEQUENCE_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
                ));
            } else if let Some(inner) = option_inner_type(rust_type) {
                owned_facts.push(format!(
                    "{OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{}",
                    resolved_type_identity(&context, module, inner).unwrap_or_default()
                ));
                if program.nullable_options
                    || program
                        .nullable_option_items
                        .contains(&function_name.to_string())
                {
                    owned_facts.push(format!(
                        "{NULLABLE_OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
                    ));
                }
            } else if let Some(identity) = resolved_type_identity(&context, module, rust_type) {
                owned_facts.push(format!(
                    "{STRUCT_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{identity}"
                ));
            }
            if shared_identity_type_at_depth(&context, Some(module), rust_type, 0) {
                owned_facts.push(format!(
                    "{SHARED_IDENTITY_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
                ));
            }
        }
        for function in &program.functions {
            for stmt in &function.block.stmts {
                let Stmt::Item(Item::Fn(inner)) = stmt else {
                    continue;
                };
                let ReturnType::Type(_, rust_type) = &inner.sig.output else {
                    continue;
                };
                let inner_name = inner.sig.ident.to_string();
                let return_fact = hash_collection_type(rust_type, &type_path_context)
                    .unwrap_or_else(|| binding_fact_for_type(&context, Some(module), rust_type));
                owned_facts.push(format!(
                    "{RETURN_BINDING_FACT_MARKER}{module}{PROVENANCE_SEPARATOR}{inner_name}{PROVENANCE_SEPARATOR}{}",
                    binding_fact_marker(&return_fact)
                ));
                if rust_type_is_sequence(rust_type) {
                    owned_facts.push(format!(
                        "{SEQUENCE_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{inner_name}{PROVENANCE_SEPARATOR}"
                    ));
                } else if let Some(inner_type) = option_inner_type(rust_type) {
                    owned_facts.push(format!(
                        "{OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{inner_name}{PROVENANCE_SEPARATOR}{}",
                        resolved_type_identity(&context, module, inner_type).unwrap_or_default()
                    ));
                } else if let Some(identity) = resolved_type_identity(&context, module, rust_type) {
                    owned_facts.push(format!(
                        "{STRUCT_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{inner_name}{PROVENANCE_SEPARATOR}{identity}"
                    ));
                }
            }
        }
        context.extend(owned_facts);
        for designation in &program.array_like_parameters {
            let Some((function_name, parameter_name)) = designation.split_once('.') else {
                continue;
            };
            context.insert(format!(
                "{ARRAY_LIKE_PARAMETER_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{parameter_name}"
            ));
            let position = program
                .functions
                .iter()
                .find(|function| function.sig.ident == function_name)
                .and_then(|function| {
                    return function.sig.inputs.iter().position(|input| {
                        return matches!(input, FnArg::Typed(typed) if matches!(typed.pat.as_ref(), Pat::Ident(pattern) if pattern.ident == parameter_name));
                    });
                });
            if let Some(position) = position {
                context.insert(format!(
                    "{ARRAY_LIKE_ARGUMENT_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{position}"
                ));
            }
        }
        for delegation in &program.method_delegations {
            let Some(owner) = resolved_type_identity(&context, module, &delegation.owner) else {
                continue;
            };
            let arguments = delegation
                .arguments
                .iter()
                .map(|argument| match argument {
                    Some(index) => index.to_string(),
                    None => "self".to_string(),
                })
                .collect::<Vec<_>>()
                .join(",");
            context.insert(format!(
                "{METHOD_DELEGATION_MARKER}{owner}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{arguments}",
                delegation.method, delegation.function
            ));
        }
        for structure in &program.structs {
            for field in &structure.fields {
                let Some(field_name) = &field.ident else {
                    continue;
                };
                if let Some(field_identity) = resolved_type_identity(&context, module, &field.ty) {
                    context.insert(format!(
                        "{STRUCT_FIELD_TYPE_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{field_identity}",
                        structure.ident
                    ));
                } else if shared_identity_type_at_depth(&context, Some(module), &field.ty, 0) {
                    context.insert(format!(
                        "{SHARED_IDENTITY_FIELD_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}",
                        structure.ident
                    ));
                }
                if let Some(numeric) = named_type(&field.ty).filter(|n| {
                    matches!(
                        n.as_str(),
                        "f32"
                            | "f64"
                            | "i8"
                            | "i16"
                            | "i32"
                            | "i64"
                            | "i128"
                            | "isize"
                            | "u8"
                            | "u16"
                            | "u32"
                            | "u64"
                            | "u128"
                            | "usize"
                    )
                }) {
                    context.insert(format!(
                        "{NUMERIC_FIELD_TYPE_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{numeric}",
                        structure.ident
                    ));
                }
                if matches!(named_type(&field.ty).as_deref(), Some("bool")) {
                    context.insert(format!(
                        "{BOOLEAN_FIELD_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}",
                        structure.ident
                    ));
                }
                if let Some(element) = sequence_inner_type(&field.ty)
                    && (shared_identity_type_at_depth(&context, Some(module), element, 0)
                        || resolved_type_identity(&context, module, element).is_some())
                {
                    context.insert(format!(
                        "{SHARED_IDENTITY_ELEMENT_FIELD_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}",
                        structure.ident
                    ));
                }
                if let Some(external) = external_struct_type_in(&context, module, &field.ty) {
                    context.insert(format!(
                        "{EXTERNAL_STRUCT_FIELD_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{external}",
                        structure.ident
                    ));
                }
                let designated = program
                    .nullable_option_items
                    .contains(&format!("{}.{field_name}", structure.ident));
                if (designated || program.nullable_options && is_public(&structure.vis))
                    && is_public(&field.vis)
                    && option_inner_type(&field.ty).is_some()
                {
                    context.insert(format!(
                        "{NULLABLE_OPTION_FIELD_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}",
                        structure.ident,
                    ));
                }
                if designated {
                    context.insert(format!(
                        "{NULLABLE_OPTION_LITERAL_FIELD_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}",
                        structure.ident,
                    ));
                }
            }
        }
        for rust_enum in &program.enums {
            let enum_name = rust_enum.ident.to_string();
            for variant in &rust_enum.variants {
                if variant
                    .attrs
                    .iter()
                    .any(|attr| attr.path().is_ident("default"))
                    && variant.fields.is_empty()
                {
                    context.insert(format!(
                        "{ENUM_DEFAULT_VARIANT_MARKER}{enum_name}:{}",
                        variant.ident
                    ));
                }
            }
        }
        // A target-native companion owns its target storage defaults. Its declaration-level
        // directives can still govern generated siblings, but Rust-only storage fields must not
        // impose synthesized defaults on those siblings.
        for structure in program
            .structs
            .iter()
            .filter(|_| program.source_mode != crate::SourceMode::TargetNative)
        {
            let entity = structure.ident.to_string();
            if !entity_types.contains(&entity) {
                continue;
            }
            let typescript_type = format!("{entity}Raw");
            for field in &structure.fields {
                if !is_public(&field.vis) {
                    continue;
                }
                let Some(field_name) = &field.ident else {
                    continue;
                };
                let field_name = snake_to_lower_camel(&field_name.to_string());
                let Some(mut value) = rust_default_expression(&field.ty)
                    .or_else(|| entity_field_default(&field.ty, &entity_types, &context))
                else {
                    context.insert(format!(
                        "{ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER}{typescript_type}:{field_name}:{}",
                        rust_type_description(&field.ty)
                    ));
                    continue;
                };
                let designated = program.nullable_option_items.contains(&format!(
                    "{}.{}",
                    structure.ident,
                    field
                        .ident
                        .as_ref()
                        .map(ToString::to_string)
                        .unwrap_or_default()
                ));
                if (program.nullable_options || designated)
                    && option_inner_type(&field.ty).is_some()
                {
                    value = "null".to_string();
                }
                context.insert(format!(
                    "{ENTITY_DEFAULT_FIELD_MARKER}{typescript_type}:{field_name}:{value}"
                ));
            }
        }
        for structure in program
            .structs
            .iter()
            .filter(|_| program.source_mode != crate::SourceMode::TargetNative)
        {
            let entity = structure.ident.to_string();
            if !entity_types.contains(&entity) {
                continue;
            }
            let typescript_type = format!("{entity}Raw");
            for impl_item in &program.facts.impls {
                let Some(overrides) = custom_default_field_values(impl_item, structure) else {
                    continue;
                };
                for (field_name, value) in overrides {
                    let default_key =
                        format!("{ENTITY_DEFAULT_FIELD_MARKER}{typescript_type}:{field_name}:");
                    context.retain(|entry| !entry.starts_with(&default_key));
                    context.insert(format!(
                        "{ENTITY_DEFAULT_FIELD_MARKER}{typescript_type}:{field_name}:{value}"
                    ));
                }
            }
        }
        for function in &program.functions {
            let Some((parameter, entity)) =
                leading_mutable_entity_parameter(function, &entity_types)
            else {
                continue;
            };
            let mut assigned_fields = BTreeSet::new();
            collect_definitely_assigned_fields(
                &function.block.stmts,
                &parameter,
                &mut assigned_fields,
            );
            for field in assigned_fields {
                context.insert(format!(
                    "{ENTITY_DEFINITELY_INITIALIZED_FIELD_MARKER}{}:{entity}Raw:{}",
                    function.sig.ident,
                    snake_to_lower_camel(&field)
                ));
            }
            if function.sig.asyncness.is_none() {
                for field in initializer_prefix_fields(&function.block.stmts, &parameter) {
                    context.insert(format!(
                        "{ENTITY_INITIALIZER_PREFIX_FIELD_MARKER}{}:{entity}Raw:{}",
                        function.sig.ident,
                        snake_to_lower_camel(&field)
                    ));
                }
            }
        }
        for (record, fields) in &record_vec_fields {
            context.insert(format!("{RECORD_CLONE_TYPE_MARKER}{record}"));
            for (field, optional) in fields {
                context.insert(format!(
                    "{RECORD_VEC_FIELD_MARKER}{record}:{field}:{optional}"
                ));
            }
        }
        for function in &program.functions {
            let function_name = function.sig.ident.to_string();
            if is_public(&function.vis)
                && let ReturnType::Type(_, rust_type) = &function.sig.output
                && let Some(structure) = named_type(rust_type)
            {
                let return_candidates = resolved_production_type_identities(
                    rust_type,
                    &type_path_context,
                    &public_struct_owners,
                    &production_struct_bindings,
                    &contract_struct_bindings,
                    &public_struct_module_bindings,
                );
                let function_identity = ProvenanceIdentity {
                    declaration: function_name.clone(),
                    module: (*module).to_string(),
                }
                .encoded();
                let shadows_public_name = program
                    .structs
                    .iter()
                    .any(|candidate| candidate.ident == structure.as_str());
                if return_candidates.is_empty()
                    && public_struct_owners.contains_key(&structure)
                    && !shadows_public_name
                {
                    context.insert(format!(
                        "{VITEST_FUNCTION_RETURN_UNRESOLVED_MARKER}{function_identity}{PROVENANCE_SEPARATOR}{structure}"
                    ));
                }
                for structure_owner in &return_candidates {
                    context.insert(format!(
                        "{VITEST_FUNCTION_RETURN_CANDIDATE_MARKER}{function_identity}{PROVENANCE_SEPARATOR}{}",
                        structure_owner.encoded()
                    ));
                }
                if return_candidates.len() == 1
                    && let Some(structure_owner) = return_candidates.first()
                {
                    context.insert(format!(
                        "{VITEST_STRUCT_RETURN_MARKER}{function_identity}{PROVENANCE_SEPARATOR}{}",
                        structure_owner.encoded()
                    ));
                }
            }
            if matches!(&function.sig.output, ReturnType::Type(_, rust_type) if rust_type_is_string(rust_type))
            {
                context.insert(format!("{STRING_RETURN_MARKER}{function_name}"));
            }
            for (argument_index, argument) in function.sig.inputs.iter().enumerate() {
                if argument_is_nullable_guard(function, argument)
                    || (program.nullable_options && argument_is_option(argument))
                {
                    context.insert(format!(
                        "{NULLABLE_CALL_MARKER}{function_name}:{argument_index}"
                    ));
                }
                let FnArg::Typed(argument) = argument else {
                    continue;
                };
                if exact_mutable_scalar_reference(&argument.ty).is_some() {
                    context.insert(format!(
                        "{MUTABLE_SCALAR_REFERENCE_ARGUMENT_MARKER}{function_name}:{argument_index}"
                    ));
                }
                if let Pat::Ident(pattern) = argument.pat.as_ref() {
                    let local = snake_to_lower_camel(&pattern.ident.to_string());
                    if let Some(record) = named_type(&argument.ty)
                        && record_types.contains(&record)
                    {
                        context.insert(format!(
                            "{RECORD_CLONE_ARGUMENT_MARKER}{function_name}:{}",
                            pattern.ident
                        ));
                        if let Some(fields) = record_vec_fields.get(&record) {
                            for (field, optional) in fields {
                                context.insert(format!(
                                    "{VEC_CLONE_ARGUMENT_MARKER}{function_name}:{local}.{field}:{optional}"
                                ));
                            }
                        }
                    }
                    if let Some(optional) = vec_clone_optional(&argument.ty) {
                        context.insert(format!(
                            "{VEC_CLONE_ARGUMENT_MARKER}{function_name}:{local}:{optional}"
                        ));
                    }
                }
                if let Some(typescript_type) = fixed_buffer_type(&argument.ty) {
                    context.insert(format!(
                        "{FIXED_BUFFER_ARGUMENT_MARKER}{function_name}:{argument_index}:{typescript_type}"
                    ));
                }
                // An `array-like` parameter is `ArrayLike<number>`, which a typed array already is.
                let array_like = matches!(argument.pat.as_ref(), Pat::Ident(pattern)
                    if program.array_like_parameters.contains(&format!("{function_name}.{}", pattern.ident)));
                context.insert(format!(
                    "{SLICE_ARGUMENT_MARKER}{function_name}:{argument_index}:{}",
                    if array_like {
                        "array-like"
                    } else {
                        typed_slice_parameter_kind_with_provenance(&argument.ty, &context, module)
                    }
                ));
                let Some(parameters) =
                    callable_parameter_types(&argument.ty, &callable_type_context)?
                else {
                    continue;
                };
                for (parameter_index, typescript_type) in parameters.iter().enumerate() {
                    context.insert(format!(
                        "{CALLBACK_ARGUMENT_MARKER}{function_name}:{argument_index}:{parameter_index}:{typescript_type}"
                    ));
                }
            }
        }
    }
    // Resolve compound entity defaults: when a field's Rust type is itself an entity whose
    // allocation defaults are fully known, promote the unsupported marker to a default marker
    // carrying the nested allocation expression. Loops until convergence for transitive cases.
    loop {
        let unsupported: Vec<(String, String, String)> = context
            .iter()
            .filter_map(|marker| marker.strip_prefix(ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER))
            .filter_map(|rest| {
                let (owning_type, rest) = rest.split_once(':')?;
                let (field_name, rust_type) = rest.split_once(':')?;
                Some((
                    owning_type.to_string(),
                    field_name.to_string(),
                    rust_type.to_string(),
                ))
            })
            .collect();

        let mut to_remove = Vec::new();
        let mut to_add = Vec::new();
        for (owning_type, field_name, rust_type) in &unsupported {
            let entity_name = peel_wrapper_type_name(rust_type);
            if !entity_types.contains(entity_name) {
                continue;
            }
            let inner_ts_type = format!("{entity_name}Raw");
            let inner_unsupported_prefix =
                format!("{ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER}{inner_ts_type}:");
            if context
                .iter()
                .any(|m| m.starts_with(&inner_unsupported_prefix))
            {
                continue;
            }
            let arguments = syn::parse_str::<Type>(rust_type)
                .ok()
                .and_then(|parsed| {
                    let mut inner = &parsed;
                    while let Type::Path(path) = inner
                        && let Some(segment) = path.path.segments.last()
                        && segment.ident != entity_name
                        && let PathArguments::AngleBracketed(wrapped) = &segment.arguments
                        && let Some(GenericArgument::Type(next)) = wrapped.args.first()
                    {
                        inner = next;
                    }
                    let Type::Path(path) = inner else {
                        return None;
                    };
                    emit_path_type_arguments(path.path.segments.last()?, &context).ok()
                })
                .unwrap_or_default();
            let Ok(value) = entity_allocation_of(
                &inner_ts_type,
                &format!("{inner_ts_type}{arguments}"),
                &context,
            ) else {
                continue;
            };
            to_remove.push(format!(
                "{ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER}{owning_type}:{field_name}:{rust_type}"
            ));
            to_add.push(format!(
                "{ENTITY_DEFAULT_FIELD_MARKER}{owning_type}:{field_name}:{value}"
            ));
        }
        if to_remove.is_empty() {
            break;
        }
        for entry in to_remove {
            context.remove(&entry);
        }
        for entry in to_add {
            context.insert(entry);
        }
    }
    return Ok(context);
}

pub(crate) fn function_expression_context(
    function: &ItemFn,
    base: &HashSet<String>,
) -> HashSet<String> {
    struct CallbackUseCollector<'a> {
        context: &'a mut HashSet<String>,
    }

    impl<'ast> syn::visit::Visit<'ast> for CallbackUseCollector<'_> {
        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            if let Expr::Path(path) = call.func.as_ref()
                && path.qself.is_none()
                && let Some(function) = vitest_path_binding_name(&path.path, self.context)
            {
                for (argument_index, argument) in call.args.iter().enumerate() {
                    let Some(local) = referenced_identifier(argument) else {
                        continue;
                    };
                    let prefix = format!("{CALLBACK_ARGUMENT_MARKER}{function}:{argument_index}:");
                    let markers = self
                        .context
                        .iter()
                        .filter_map(|marker| marker.strip_prefix(&prefix))
                        .map(|suffix| format!("{CLOSURE_PARAMETER_MARKER}{local}:{suffix}"))
                        .collect::<Vec<_>>();
                    self.context.extend(markers);
                    let prefix =
                        format!("{FIXED_BUFFER_ARGUMENT_MARKER}{function}:{argument_index}:");
                    let markers = self
                        .context
                        .iter()
                        .filter_map(|marker| marker.strip_prefix(&prefix))
                        .map(|typescript_type| {
                            format!("{FIXED_BUFFER_LOCAL_MARKER}{local}:{typescript_type}")
                        })
                        .collect::<Vec<_>>();
                    self.context.extend(markers);
                }
            }
            syn::visit::visit_expr_call(self, call);
        }

        fn visit_local(&mut self, local: &'ast syn::Local) {
            if let Pat::Type(typed) = &local.pat
                && let Pat::Ident(pattern) = typed.pat.as_ref()
            {
                let local = snake_to_lower_camel(&pattern.ident.to_string());
                if type_is_integer(&typed.ty) {
                    self.context
                        .insert(format!("{INTEGER_EXPRESSION_MARKER}{}", pattern.ident));
                }
                if type_is_unsigned_integer(&typed.ty) {
                    self.context
                        .insert(format!("{UNSIGNED_INTEGER_LOCAL_MARKER}{}", pattern.ident));
                }
                if let Some(optional) = vec_clone_optional(&typed.ty) {
                    self.context
                        .insert(format!("{VEC_CLONE_EXPRESSION_MARKER}{local}:{optional}"));
                }
                if matches!(named_type(&typed.ty).as_deref(), Some("bool")) {
                    self.context
                        .insert(format!("{BOOLEAN_EXPRESSION_MARKER}{}", pattern.ident));
                }
                if rust_type_is_string(&typed.ty) {
                    self.context
                        .insert(format!("{STRING_EXPRESSION_MARKER}{}", pattern.ident));
                }
                if rust_type_is_json_value(&typed.ty, self.context) {
                    self.context
                        .insert(format!("{JSON_VALUE_MARKER}{}", pattern.ident));
                } else if let Some(inner) = option_inner_type(&typed.ty)
                    && rust_type_is_json_value(inner, self.context)
                {
                    self.context
                        .insert(format!("{JSON_VALUE_OPTION_MARKER}{}", pattern.ident));
                }
                if rust_type_is_ordered_primitive(&typed.ty) {
                    self.context
                        .insert(format!("{ORDERED_PRIMITIVE_MARKER}{}", pattern.ident));
                }
                if let Some(record) = named_type(&typed.ty)
                    && self
                        .context
                        .contains(&format!("{RECORD_CLONE_TYPE_MARKER}{record}"))
                {
                    self.context
                        .insert(format!("{RECORD_CLONE_LOCAL_MARKER}{}", pattern.ident));
                    let prefix = format!("{RECORD_VEC_FIELD_MARKER}{record}:");
                    let fields = self
                        .context
                        .iter()
                        .filter_map(|marker| marker.strip_prefix(&prefix))
                        .map(|field| format!("{VEC_CLONE_EXPRESSION_MARKER}{local}.{field}"))
                        .collect::<Vec<_>>();
                    self.context.extend(fields);
                }
            }
            if let Some(initializer) = &local.init
                && expression_is_known_boolean(&initializer.expr, self.context)
                && let Some(name) = local_pattern_name(&local.pat)
            {
                self.context
                    .insert(format!("{BOOLEAN_EXPRESSION_MARKER}{name}"));
            }
            if let Some(initializer) = &local.init
                && matches!(initializer.expr.as_ref(), Expr::Field(_))
                && let Some(name) = local_pattern_name(&local.pat)
            {
                self.context
                    .insert(format!("{ORDERED_PRIMITIVE_MARKER}{name}"));
            }
            if let Some(initializer) = &local.init
                && expression_is_known_string(&initializer.expr, self.context)
                && let Some(name) = local_pattern_name(&local.pat)
            {
                self.context
                    .insert(format!("{STRING_EXPRESSION_MARKER}{name}"));
            }
            if let Some(initializer) = &local.init
                && expression_is_json_value(&initializer.expr, self.context)
                && let Some(name) = local_pattern_name(&local.pat)
            {
                self.context.insert(format!("{JSON_VALUE_MARKER}{name}"));
            }
            if let Some(initializer) = &local.init
                && expression_is_option_of_json_value(&initializer.expr, self.context)
                && let Some(name) = local_pattern_name(&local.pat)
            {
                self.context
                    .insert(format!("{JSON_VALUE_OPTION_MARKER}{name}"));
            }
            if let Some(initializer) = &local.init
                && call_turbofish_is_json_value(&initializer.expr, self.context)
                && let Some(name) = local_pattern_name(&local.pat)
            {
                self.context.insert(format!("{JSON_VALUE_MARKER}{name}"));
            }
            if let Some(initializer) = &local.init
                && direct_lock_guard_receiver(&initializer.expr).is_some()
                && let Some(id) = local_pattern_binding_id(self.context, &local.pat)
            {
                self.context
                    .insert(format!("{DIRECT_LOCK_GUARD_BINDING_MARKER}{id}"));
            }
            // A guard over a variable or field reads and writes that place: it is the live cell, and
            // Rust's borrow keeps the place fixed while the guard lives. A guard over a computed cell
            // (a call) has no place to name again, so it reads and writes its binding, which holds the
            // cell evaluated once.
            if let Some(initializer) = &local.init
                && let Some(receiver) = direct_lock_guard_receiver(&initializer.expr)
                && expression_is_plain_place(receiver)
                && let Some(id) = local_pattern_binding_id(self.context, &local.pat)
            {
                self.context.insert(format!(
                    "{DIRECT_LOCK_GUARD_TARGET_MARKER}{id}{PROVENANCE_SEPARATOR}{}",
                    receiver.to_token_stream()
                ));
            }
            syn::visit::visit_local(self, local);
        }

        fn visit_pat_tuple_struct(&mut self, pattern: &'ast syn::PatTupleStruct) {
            if let Some((owner, variant)) = path_owner_and_member(&pattern.path)
                && let Some(categories) =
                    data_union_variant_categories(self.context, &owner, &variant)
                && (categories == BTreeSet::from([RuntimeCategory::Number])
                    || categories == BTreeSet::from([RuntimeCategory::String]))
                && pattern.elems.len() == 1
                && let Some(binding) = payload_pattern_identifier(&pattern.elems[0])
            {
                self.context
                    .insert(format!("{ORDERED_PRIMITIVE_MARKER}{binding}"));
            }
            syn::visit::visit_pat_tuple_struct(self, pattern);
        }
    }

    fn payload_pattern_identifier(pattern: &Pat) -> Option<String> {
        return match pattern {
            Pat::Ident(identifier) if identifier.subpat.is_none() => {
                Some(identifier.ident.to_string())
            }
            Pat::Reference(reference) => payload_pattern_identifier(&reference.pat),
            _ => None,
        };
    }

    fn referenced_identifier(expression: &Expr) -> Option<String> {
        return match expression {
            Expr::Group(group) => referenced_identifier(&group.expr),
            Expr::Paren(paren) => referenced_identifier(&paren.expr),
            Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => path
                .path
                .segments
                .first()
                .map(|segment| segment.ident.to_string()),
            Expr::Reference(reference) => referenced_identifier(&reference.expr),
            _ => None,
        };
    }

    let mut context = base.clone();
    insert_lexical_binding_context(function, &mut context);
    insert_record_map_local_context(function, &mut context);
    let function_name = function.sig.ident.to_string();
    let vec_prefix = format!("{VEC_CLONE_ARGUMENT_MARKER}{function_name}:");
    let vec_markers = context
        .iter()
        .filter_map(|marker| marker.strip_prefix(&vec_prefix))
        .map(|suffix| format!("{VEC_CLONE_EXPRESSION_MARKER}{suffix}"))
        .collect::<Vec<_>>();
    context.extend(vec_markers);
    for argument in &function.sig.inputs {
        let FnArg::Typed(argument) = argument else {
            continue;
        };
        for binding in provenance_pattern_bindings(&argument.pat) {
            clear_provenance_binding(&mut context, VITEST_PUBLIC_FUNCTION_MARKER, &binding);
            clear_provenance_binding(&mut context, VITEST_FUNCTION_CANDIDATE_MARKER, &binding);
        }
        let Pat::Ident(pattern) = argument.pat.as_ref() else {
            continue;
        };
        // A nested function parameter shadows an outer test local even when both have the same
        // spelling. The lexical resolver records the parameter's site independently; make that one
        // binding authoritative before attaching parameter facts.
        if let Some(id) = local_pattern_binding_id(&context, &argument.pat) {
            let prefix = format!("{BINDING_MARKER}{}=", pattern.ident);
            context.retain(|marker| !marker.starts_with(&prefix));
            context.insert(format!("{prefix}{id}"));
        }
        if matches!(argument.ty.as_ref(), Type::Reference(_))
            && let Some(id) = lexical_binding(&context, &pattern.ident.to_string())
        {
            context.insert(format!("{REFERENCE_PARAMETER_BINDING_MARKER}{id}"));
            if context.contains(&format!(
                "{MUTABLE_SCALAR_CELL_PARAMETER_NAME_MARKER}{}",
                pattern.ident
            )) {
                context.insert(format!(
                    "{MUTABLE_SCALAR_CELL_PARAMETER_BINDING_MARKER}{id}"
                ));
            }
        }
        if let Some(structure) = vitest_named_type(&argument.ty, &context)
            && let Some(identity) = vitest_struct_owner(&context, &structure)
        {
            context.insert(format!(
                "{VITEST_STRUCT_LOCAL_MARKER}{}{PROVENANCE_SEPARATOR}{identity}",
                pattern.ident
            ));
        }
        if context.contains(&format!(
            "{RECORD_CLONE_ARGUMENT_MARKER}{function_name}:{}",
            pattern.ident
        )) {
            context.insert(format!("{RECORD_CLONE_LOCAL_MARKER}{}", pattern.ident));
        }
        if type_is_integer(&argument.ty) {
            context.insert(format!("{INTEGER_EXPRESSION_MARKER}{}", pattern.ident));
        }
        if type_is_unsigned_integer(&argument.ty) {
            context.insert(format!("{UNSIGNED_INTEGER_LOCAL_MARKER}{}", pattern.ident));
        }
        if matches!(named_type(&argument.ty).as_deref(), Some("bool")) {
            context.insert(format!("{BOOLEAN_EXPRESSION_MARKER}{}", pattern.ident));
        }
        if rust_type_is_string(&argument.ty) {
            context.insert(format!("{STRING_EXPRESSION_MARKER}{}", pattern.ident));
        }
        if rust_type_is_json_value(&argument.ty, &context) {
            context.insert(format!("{JSON_VALUE_MARKER}{}", pattern.ident));
        } else if let Some(inner) = option_inner_type(&argument.ty)
            && rust_type_is_json_value(inner, &context)
        {
            context.insert(format!("{JSON_VALUE_OPTION_MARKER}{}", pattern.ident));
        }
        if rust_type_is_ordered_primitive(&argument.ty) {
            context.insert(format!("{ORDERED_PRIMITIVE_MARKER}{}", pattern.ident));
        }
    }
    syn::visit::Visit::visit_block(
        &mut CallbackUseCollector {
            context: &mut context,
        },
        &function.block,
    );
    for argument in &function.sig.inputs {
        if uint8_array_parameter(function, argument, &context).is_none() {
            continue;
        }
        let FnArg::Typed(argument) = argument else {
            continue;
        };
        let Some(id) = local_pattern_binding_id(&context, &argument.pat) else {
            continue;
        };
        let prefix = format!("{BINDING_FACT_MARKER}{id}=");
        context.retain(|marker| !marker.starts_with(&prefix));
        context.insert(format!(
            "{prefix}{}",
            binding_fact_marker(&BindingFact::TypedArray("Uint8Array".to_string()))
        ));
    }
    return context;
}
