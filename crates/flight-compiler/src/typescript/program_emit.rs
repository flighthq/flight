use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fmt::Write;

use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::visit::Visit;
use syn::{Expr, ItemStruct, ItemUse, Pat, ReturnType, Token};

use crate::model::{Program, TestProgram};
use crate::{CompileError, compile_error};

use super::{
    ASYNC_FLIGHT_ERROR_FUNCTION_MARKER, CURRENT_SOURCE_MARKER, CrossCrateSymbol,
    CrossCrateUsageCollector, EmitProgramInput, NULLABLE_OPTIONS_MARKER, ProvenanceImportRule,
    VITEST_LOCAL_MODULE_ALIAS_MARKER, data_union_pattern_test, dependency_export_name,
    emit_const_group, emit_constant, emit_entity_runtime_state_stores, emit_enum, emit_expression,
    emit_function, emit_internal_type_export_declarations, emit_path_segment, emit_static,
    emit_struct, emit_type, emit_type_alias, entity_factory_finish_binding,
    entity_runtime_state_store_imports, expression_contains_path, expression_is_reusable,
    external_identity_aliases, flight_error_result_aliases, flight_error_result_type,
    foreign_wildcard_modules, generation_context, generation_context_with_types,
    identity_alias_marker, initializes_readonly_entity, initializes_resolved_readonly_entity,
    insert_dependency_export_name_context, insert_external_nullable_import_context,
    insert_external_nullable_option_context, insert_inline_string_union_context,
    insert_internal_type_export_context, insert_nullable_options_context,
    insert_program_type_path_context, insert_std_float_consts_context,
    insert_std_mem_import_context, insert_string_union_context,
    insert_type_script_array_field_context, insert_type_script_array_parameter_context,
    insert_type_script_array_return_context,
    insert_type_script_default_null_option_parameter_context,
    insert_type_script_nullable_option_field_context,
    insert_type_script_nullable_option_parameter_context,
    insert_type_script_nullable_option_return_context, insert_type_script_type_alias_context,
    insert_visibility_collection_context, insert_vitest_import_alias_context, is_public,
    js_string_literal, nullable_guard_types, option_absent_value, preferred_aliases,
    program_value_bindings, provenance_import_rules, reject_const_group_wildcard_imports,
    reject_entity_runtime_state_store_collisions, reject_unsafe_lazy_lock_initializers,
    reject_unsupported_array_like_uses, snake_to_lower_camel, type_contains_nullable,
    type_script_type_aliases, used_identity_aliases, validate_dependency_export_name_bindings,
    vitest_current_path_prefix, write_indent,
};
pub(crate) fn collect_cross_crate_use_tree(
    tree: &syn::UseTree,
    prefix: &mut Vec<String>,
    symbols: &mut BTreeMap<String, CrossCrateSymbol>,
) {
    let mut record = |imported: String, local: String| {
        let Some(root) = prefix.first() else {
            return;
        };
        let Some(package) = root.strip_prefix("flight_") else {
            return;
        };
        symbols.insert(
            local.clone(),
            CrossCrateSymbol {
                imported,
                local,
                module: format!("@flighthq/{}/contract", package.replace('_', "-")),
            },
        );
    };
    match tree {
        syn::UseTree::Name(name) if name.ident == "self" => {
            if let Some(imported) = prefix.last() {
                record(imported.clone(), imported.clone());
            }
        }
        syn::UseTree::Name(name) => {
            let name = name.ident.to_string();
            record(name.clone(), name);
        }
        syn::UseTree::Rename(rename) => {
            record(rename.ident.to_string(), rename.rename.to_string());
        }
        syn::UseTree::Path(path) => {
            prefix.push(path.ident.to_string());
            collect_cross_crate_use_tree(&path.tree, prefix, symbols);
            prefix.pop();
        }
        syn::UseTree::Group(group) => {
            for item in &group.items {
                collect_cross_crate_use_tree(item, prefix, symbols);
            }
        }
        syn::UseTree::Glob(_) => {}
    }
}

// Lowers `if let (P0, P1, ..) = (e0, e1, ..)` over data union patterns into one conjunction of
// runtime predicates plus the bindings the patterns introduce; `None` when the condition is not a
// tuple `let`.
pub(super) fn emit_data_union_tuple_binding(
    condition: &Expr,
    entities: &HashSet<String>,
) -> Result<Option<(String, Vec<(String, String)>)>, CompileError> {
    let Expr::Let(binding) = condition else {
        return Ok(None);
    };
    let Pat::Tuple(patterns) = binding.pat.as_ref() else {
        return Ok(None);
    };
    let Expr::Tuple(values) = binding.expr.as_ref() else {
        return Err(compile_error(
            "portable tuple `if let` needs a tuple expression of the same length",
        ));
    };
    if patterns.elems.len() != values.elems.len() {
        return Err(compile_error(
            "portable tuple `if let` needs a tuple expression of the same length",
        ));
    }
    let mut predicates = Vec::new();
    let mut bindings = Vec::new();
    for (pattern, value) in patterns.elems.iter().zip(&values.elems) {
        if !expression_is_reusable(value) {
            return Err(compile_error(
                "portable tuple `if let` elements must be locals, fields, or literals",
            ));
        }
        let text = emit_expression(value, entities)?;
        if let Some(test) = data_union_pattern_test(pattern, &text, entities)? {
            predicates.extend(test.predicate);
            bindings.extend(test.bindings);
        } else if let Pat::TupleStruct(tuple_struct) = pattern
            && (tuple_struct.path.is_ident("Some") || tuple_struct.path.is_ident("Ok"))
            && tuple_struct.elems.len() == 1
        {
            let Pat::Ident(ident) = &tuple_struct.elems[0] else {
                return Err(compile_error(
                    "portable tuple `if let Some` binding needs an identifier",
                ));
            };
            let name = snake_to_lower_camel(&ident.ident.to_string());
            let absent = option_absent_value(value, entities);
            predicates.push(format!("{text} !== {absent}"));
            bindings.push((name, text));
        } else if matches!(pattern, Pat::Wild(_)) {
            continue;
        } else {
            return Err(compile_error(
                "portable tuple `if let` supports only data union variant patterns, option patterns, bindings, and `_`",
            ));
        }
    }
    if predicates.is_empty() {
        return Err(compile_error(
            "portable tuple `if let` needs at least one testable pattern",
        ));
    }
    return Ok(Some((predicates.join(" && "), bindings)));
}

// An import of a dependency item: its TypeScript name follows the owner's `export-name` mapping, and an
// unrenamed import binds that same name locally.
pub(super) fn import_specifier(symbol: &CrossCrateSymbol, context: &HashSet<String>) -> String {
    let imported = dependency_export_name(context, &symbol.module, &symbol.imported)
        .map_or_else(|| emit_path_segment(&symbol.imported), str::to_string);
    if let Some((owner, _)) = imported.split_once('.') {
        return owner.to_string();
    }
    let local = if symbol.local == symbol.imported {
        imported.clone()
    } else {
        emit_path_segment(&symbol.local)
    };
    if imported == local {
        return imported;
    }
    return format!("{imported} as {local}");
}

pub(crate) fn is_lowered_cross_crate_type(name: &str) -> bool {
    return matches!(
        name,
        "EntityRuntimeSlot"
            | "Float32Array"
            | "Float64Array"
            | "FlightError"
            | "FlightErrorKind"
            | "Int8Array"
            | "Int16Array"
            | "Int32Array"
            | "Record"
            | "Ref"
            | "Uint8Array"
            | "Uint16Array"
            | "Uint32Array"
            | "UnknownValue"
    );
}

pub(crate) fn is_lowered_cross_crate_value(name: &str) -> bool {
    return matches!(
        name,
        "allocate_entity"
            | "AtomicU32"
            | "create_reg_exp"
            | "delete_record_value"
            | "entries"
            | "FlightError"
            | "FlightErrorKind"
            | "get_record_keys"
            | "get_record_value"
            | "has_record_key"
            | "Ordering"
            | "Record"
            | "Ref"
            | "set_record_value"
            | "throw_error"
            | "throw_range_error"
            | "throw_type_error"
            | "throw_syntax_error"
    );
}

// `matches!(value, pattern [if guard] [,])`: the value, the pattern (`|` alternatives and `ref`
// bindings included) and the optional guard, as the emitter and import discovery both read them.
pub(super) fn parse_matches_arguments(
    rust_macro: &syn::Macro,
) -> syn::Result<(Expr, Pat, Option<Expr>)> {
    let parser = |input: syn::parse::ParseStream<'_>| {
        let value = input.parse::<Expr>()?;
        input.parse::<Token![,]>()?;
        let pattern = Pat::parse_multi_with_leading_vert(input)?;
        let guard = if input.peek(Token![if]) {
            input.parse::<Token![if]>()?;
            Some(input.parse::<Expr>()?)
        } else {
            None
        };
        if input.peek(Token![,]) {
            input.parse::<Token![,]>()?;
        }
        return Ok((value, pattern, guard));
    };
    return parser.parse2(rust_macro.tokens.clone());
}

// `vec![value; length]`: the repeated value and the length.
pub(super) fn parse_vec_repeat(rust_macro: &syn::Macro) -> syn::Result<(Expr, Expr)> {
    let parser = |input: syn::parse::ParseStream<'_>| {
        let value = input.parse::<Expr>()?;
        input.parse::<Token![;]>()?;
        let length = input.parse::<Expr>()?;
        if !input.is_empty() {
            return Err(input.error("unexpected tokens after `vec!` repeat length"));
        }
        return Ok((value, length));
    };
    return parser.parse2(rust_macro.tokens.clone());
}

// A macro body (`assert!`, `assert_eq!`, `vec!`, …) is opaque tokens to the syntax visitor, but the
// emitter lowers its arguments as expressions; parsing them records the foreign items they use.
pub(super) fn visit_cross_crate_macro_arguments(
    collector: &mut CrossCrateUsageCollector<'_>,
    mac: &syn::Macro,
) {
    if mac.path.is_ident("matches")
        && let Ok((value, pattern, guard)) = parse_matches_arguments(mac)
    {
        Visit::visit_expr(collector, &value);
        Visit::visit_pat(collector, &pattern);
        if let Some(guard) = &guard {
            Visit::visit_expr(collector, guard);
        }
        return;
    }
    if mac.path.is_ident("vec")
        && let Ok((value, length)) = parse_vec_repeat(mac)
    {
        Visit::visit_expr(collector, &value);
        Visit::visit_expr(collector, &length);
        return;
    }
    if let Ok(arguments) = mac.parse_body_with(Punctuated::<Expr, syn::Token![,]>::parse_terminated)
    {
        for argument in &arguments {
            Visit::visit_expr(collector, argument);
        }
    }
}

pub(super) fn cross_crate_symbols(uses: &[syn::ItemUse]) -> BTreeMap<String, CrossCrateSymbol> {
    let mut symbols = BTreeMap::new();
    for item_use in uses {
        collect_cross_crate_use_tree(&item_use.tree, &mut Vec::new(), &mut symbols);
    }
    return symbols;
}

pub(super) fn test_cross_crate_symbols(
    uses: &[syn::ItemUse],
    context: &HashSet<String>,
) -> BTreeMap<String, CrossCrateSymbol> {
    let mut symbols = cross_crate_symbols(uses);
    symbols.retain(|local, _| {
        !context.contains(&format!("{VITEST_LOCAL_MODULE_ALIAS_MARKER}{local}"))
    });
    return symbols;
}

pub(super) fn validate_test_foreign_crate_aliases(
    uses: &[syn::ItemUse],
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    fn collect(
        tree: &syn::UseTree,
        prefix: &mut Vec<String>,
        aliases: &mut BTreeSet<(String, String)>,
    ) {
        match tree {
            syn::UseTree::Rename(rename) if prefix.is_empty() => {
                aliases.insert((rename.ident.to_string(), rename.rename.to_string()));
            }
            syn::UseTree::Rename(rename) if rename.ident == "self" && prefix.len() == 1 => {
                aliases.insert((prefix[0].clone(), rename.rename.to_string()));
            }
            syn::UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                collect(&path.tree, prefix, aliases);
                prefix.pop();
            }
            syn::UseTree::Group(group) => {
                for tree in &group.items {
                    collect(tree, prefix, aliases);
                }
            }
            syn::UseTree::Glob(_) | syn::UseTree::Name(_) | syn::UseTree::Rename(_) => {}
        }
    }

    let mut aliases = BTreeSet::new();
    for item_use in uses {
        collect(&item_use.tree, &mut Vec::new(), &mut aliases);
    }
    for (root, alias) in aliases {
        if root.starts_with("flight_") && vitest_current_path_prefix(context, &root).is_none() {
            return Err(compile_error(format!(
                "portable test foreign Flight crate `{root}` is imported as namespace alias `{alias}`, which cannot be lowered to a tree-shakeable contract import; import the used items explicitly"
            )));
        }
    }
    return Ok(());
}

pub(super) fn mixed_foreign_wildcard_roots(
    uses: &[syn::ItemUse],
    context: &HashSet<String>,
) -> BTreeSet<String> {
    let rules = provenance_import_rules(uses.iter(), None);
    let is_local = |module: &str| {
        module
            .split("::")
            .next()
            .is_some_and(|root| vitest_current_path_prefix(context, root).is_some())
    };
    if !rules
        .iter()
        .any(|rule| matches!(rule, ProvenanceImportRule::Wildcard { module } if is_local(module)))
    {
        return BTreeSet::new();
    }
    return rules
        .into_iter()
        .filter_map(|rule| match rule {
            ProvenanceImportRule::Wildcard { module } if !is_local(&module) => {
                module.split("::").next().map(str::to_string)
            }
            ProvenanceImportRule::Wildcard { .. } | ProvenanceImportRule::Explicit { .. } => None,
        })
        .collect();
}

pub(crate) fn test_mixed_foreign_wildcard_roots(
    program: &TestProgram,
    context: &HashSet<String>,
) -> BTreeSet<String> {
    let mut roots = mixed_foreign_wildcard_roots(&program.uses, context);
    for suite in &program.suites {
        let mut suite_context = context.clone();
        insert_vitest_import_alias_context(&mut suite_context, suite.uses.iter());
        roots.extend(mixed_foreign_wildcard_roots(&suite.uses, &suite_context));
    }
    return roots;
}

pub(super) fn finish_cross_crate_imports(
    collector: CrossCrateUsageCollector<'_>,
    context: &HashSet<String>,
) -> (
    BTreeMap<String, BTreeSet<String>>,
    BTreeMap<String, BTreeSet<String>>,
) {
    let CrossCrateUsageCollector {
        context: _,
        symbols,
        mut type_names,
        value_names,
        ..
    } = collector;
    type_names.retain(|name| !value_names.contains(name));
    let mut value_imports = BTreeMap::<String, BTreeSet<String>>::new();
    let mut type_imports = BTreeMap::<String, BTreeSet<String>>::new();
    for (names, imports) in [
        (value_names, &mut value_imports),
        (type_names, &mut type_imports),
    ] {
        for name in names {
            let symbol = symbols
                .get(&name)
                .expect("collected cross-crate use came from the import map");
            imports
                .entry(symbol.module.clone())
                .or_default()
                .insert(import_specifier(symbol, context));
        }
    }
    return (value_imports, type_imports);
}

pub(super) fn cross_crate_imports(
    program: &Program,
    context: &HashSet<String>,
) -> (
    BTreeMap<String, BTreeSet<String>>,
    BTreeMap<String, BTreeSet<String>>,
) {
    let symbols = cross_crate_symbols(&program.uses);
    let mut collector = CrossCrateUsageCollector {
        context,
        symbols: &symbols,
        struct_literals_are_types: false,
        type_names: BTreeSet::new(),
        value_names: BTreeSet::new(),
    };
    for constant in &program.constants {
        collector.visit_item_const(constant);
    }
    for rust_enum in &program.enums {
        collector.visit_item_enum(rust_enum);
    }
    for function in &program.functions {
        collector.visit_item_fn(function);
    }
    for rust_static in &program.statics {
        collector.visit_item_static(rust_static);
    }
    for structure in &program.structs {
        let module_private_plain_data =
            !is_public(&structure.vis) && !program.entities.contains(&structure.ident.to_string());
        for field in &structure.fields {
            if module_private_plain_data || is_public(&field.vis) {
                collector.visit_type(&field.ty);
            }
        }
    }
    for type_alias in &program.type_aliases {
        collector.visit_item_type(type_alias);
    }

    return finish_cross_crate_imports(collector, context);
}

pub(crate) fn test_cross_crate_imports(
    program: &TestProgram,
    context: &HashSet<String>,
) -> Result<
    (
        BTreeMap<String, BTreeSet<String>>,
        BTreeMap<String, BTreeSet<String>>,
    ),
    CompileError,
> {
    fn merge_imports(
        target: &mut BTreeMap<String, BTreeSet<String>>,
        source: BTreeMap<String, BTreeSet<String>>,
    ) {
        for (module, names) in source {
            target.entry(module).or_default().extend(names);
        }
    }

    fn record_bindings(
        imports: &BTreeMap<String, BTreeSet<String>>,
        bindings: &mut BTreeMap<String, (String, String)>,
    ) -> Result<(), CompileError> {
        for (module, specifiers) in imports {
            for specifier in specifiers {
                let local = specifier
                    .rsplit_once(" as ")
                    .map_or(specifier.as_str(), |(_, local)| local);
                let Some((previous_module, previous_specifier)) = bindings.get(local) else {
                    bindings.insert(local.to_string(), (module.clone(), specifier.clone()));
                    continue;
                };
                if previous_module != module || previous_specifier != specifier {
                    return Err(compile_error(format!(
                        "portable test modules import TypeScript binding `{local}` from both `{previous_specifier}` in `{previous_module}` and `{specifier}` in `{module}`; use distinct Rust import aliases"
                    )));
                }
            }
        }
        return Ok(());
    }

    validate_test_foreign_crate_aliases(&program.uses, context)?;
    let top_level_symbols = test_cross_crate_symbols(&program.uses, context);
    let mut collector = CrossCrateUsageCollector {
        context,
        symbols: &top_level_symbols,
        struct_literals_are_types: true,
        type_names: BTreeSet::new(),
        value_names: BTreeSet::new(),
    };
    for constant in &program.constants {
        collector.visit_item_const(constant);
    }
    for function in &program.helpers {
        collector.visit_item_fn(function);
    }
    for structure in &program.structs {
        collector.visit_item_struct(structure);
    }
    for type_alias in &program.type_aliases {
        collector.visit_item_type(type_alias);
    }
    let (mut value_imports, mut type_imports) = finish_cross_crate_imports(collector, context);
    let mut bindings = BTreeMap::new();
    record_bindings(&value_imports, &mut bindings)?;
    record_bindings(&type_imports, &mut bindings)?;
    for suite in &program.suites {
        let mut suite_context = context.clone();
        insert_vitest_import_alias_context(&mut suite_context, suite.uses.iter());
        validate_test_foreign_crate_aliases(&suite.uses, &suite_context)?;
        let mut symbols = top_level_symbols.clone();
        symbols.extend(test_cross_crate_symbols(&suite.uses, &suite_context));
        let mut collector = CrossCrateUsageCollector {
            context: &suite_context,
            symbols: &symbols,
            struct_literals_are_types: true,
            type_names: BTreeSet::new(),
            value_names: BTreeSet::new(),
        };
        for function in suite
            .helpers
            .iter()
            .chain(suite.tests.iter().map(|test| &test.function))
        {
            collector.visit_item_fn(function);
        }
        let (suite_value_imports, suite_type_imports) =
            finish_cross_crate_imports(collector, &suite_context);
        record_bindings(&suite_value_imports, &mut bindings)?;
        record_bindings(&suite_type_imports, &mut bindings)?;
        merge_imports(&mut value_imports, suite_value_imports);
        merge_imports(&mut type_imports, suite_type_imports);
    }
    for (module, values) in &value_imports {
        if let Some(types) = type_imports.get_mut(module) {
            types.retain(|name| !values.contains(name));
        }
    }
    type_imports.retain(|_, names| !names.is_empty());
    return Ok((value_imports, type_imports));
}

// flight-lint: allow(hashmap-iteration) Program constants are a Vec retained in Rust source order; the rule's name heuristic cannot see the field type across modules
pub(crate) fn emit_program(input: &EmitProgramInput) -> Result<String, CompileError> {
    let program = input.program;
    let entity_module = input.entity_module;
    let alias_programs = input.alias_programs;
    let external_alias_programs = input.external_alias_programs;
    let external_nullable_programs = input.external_nullable_programs;
    let external_record_structs = input.external_record_structs;
    let dependency_export_names = input.dependency_export_names;
    let external_string_unions = input.external_string_unions;
    let inline_string_unions = input.inline_string_unions;
    let internal_type_exports = input.internal_type_exports;
    let type_script_type_aliases = input.type_script_type_aliases;
    let type_script_array_parameters = input.type_script_array_parameters;
    let type_script_array_fields = input.type_script_array_fields;
    let type_script_array_returns = input.type_script_array_returns;
    let type_script_nullable_option_fields = input.type_script_nullable_option_fields;
    let type_script_default_null_option_parameters =
        input.type_script_default_null_option_parameters;
    let type_script_nullable_option_parameters = input.type_script_nullable_option_parameters;
    let type_script_nullable_option_returns = input.type_script_nullable_option_returns;
    let module_identities = input.module_identities;
    let visibility_programs = input.visibility_programs;
    let visibility_identities = input.visibility_identities;
    let source_paths = input.source_paths;
    let external_shared_identity_fields = input.external_shared_identity_fields;
    let programs = std::iter::once(program)
        .chain(alias_programs)
        .collect::<Vec<_>>();
    let uses_allocate_entity = program
        .functions
        .iter()
        .any(|function| expression_contains_path(&function.block, "allocate_entity"));
    let aliases = preferred_aliases(program, alias_programs)?;
    let external_identity_aliases = external_identity_aliases(external_alias_programs)?;
    let used_identity_aliases = used_identity_aliases(program, &external_identity_aliases);
    let mut identity_context = HashSet::new();
    for (name, alias) in &external_identity_aliases {
        identity_context.insert(identity_alias_marker(name, &alias.tag));
    }
    insert_external_nullable_option_context(&mut identity_context, external_nullable_programs);
    // Full module identities when the caller supplies them; otherwise synthetic keys, under which each
    // source resolves only its own declarations.
    let program_modules = match module_identities {
        Some(identities) if identities.len() == programs.len() => identities.to_vec(),
        _ => (0..programs.len())
            .map(|index| format!("typescript-source/{index}"))
            .collect::<Vec<_>>(),
    };
    let program_sources = program_modules
        .iter()
        .zip(&programs)
        .map(|(module, program)| (module.as_str(), *program))
        .collect::<Vec<_>>();
    insert_external_nullable_import_context(
        &mut identity_context,
        &program_modules[0],
        program,
        external_nullable_programs,
    );
    let mut type_context = identity_context.clone();
    type_context.extend(external_shared_identity_fields.iter().cloned());
    insert_type_script_type_alias_context(&mut type_context, type_script_type_aliases);
    insert_internal_type_export_context(&mut type_context, internal_type_exports);
    let visibility_modules = visibility_programs
        .iter()
        .enumerate()
        .map(|(index, program)| {
            (
                visibility_identities
                    .get(index)
                    .and_then(Option::as_deref)
                    .map_or_else(|| format!("typescript-visibility/{index}"), str::to_string),
                program,
            )
        })
        .collect::<Vec<_>>();
    let mut expression_context = generation_context_with_types(
        &program_sources,
        external_record_structs,
        &type_context,
        None,
        false,
        visibility_programs,
        &[],
    )?;
    insert_visibility_collection_context(
        &mut expression_context,
        &visibility_modules
            .iter()
            .map(|(module, program)| (module.as_str(), *program))
            .collect::<Vec<_>>(),
    );
    for (_, program) in program_sources.iter().copied().chain(
        visibility_modules
            .iter()
            .map(|(module, program)| (module.as_str(), *program)),
    ) {
        insert_program_type_path_context(&mut expression_context, program);
    }
    insert_type_script_array_parameter_context(
        &mut expression_context,
        program_sources.iter().copied().chain(
            visibility_modules
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_array_parameters,
    )?;
    insert_type_script_array_field_context(
        &mut expression_context,
        program_sources.iter().copied().chain(
            visibility_modules
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_array_fields,
    )?;
    insert_type_script_array_return_context(
        &mut expression_context,
        program_sources.iter().copied().chain(
            visibility_modules
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_array_returns,
    )?;
    insert_type_script_nullable_option_field_context(
        &mut expression_context,
        program_sources.iter().copied().chain(
            visibility_modules
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_nullable_option_fields,
    )?;
    insert_type_script_nullable_option_return_context(
        &mut expression_context,
        program_sources.iter().copied().chain(
            visibility_modules
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_nullable_option_returns,
    )?;
    insert_type_script_nullable_option_parameter_context(
        &mut expression_context,
        program_sources.iter().copied().chain(
            visibility_modules
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_nullable_option_parameters,
    )?;
    insert_type_script_default_null_option_parameter_context(
        &mut expression_context,
        program_sources.iter().copied().chain(
            visibility_modules
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_default_null_option_parameters,
    )?;
    insert_string_union_context(&mut expression_context, external_string_unions.iter());
    insert_inline_string_union_context(&mut expression_context, inline_string_unions);
    expression_context.insert(format!("{CURRENT_SOURCE_MARKER}{}", program_modules[0]));
    reject_const_group_wildcard_imports(
        dependency_export_names,
        &foreign_wildcard_modules(&program.uses.iter().collect::<Vec<_>>()),
    )?;
    insert_dependency_export_name_context(
        &mut expression_context,
        dependency_export_names,
        &cross_crate_symbols(&program.uses),
        &[],
        &program.functions.iter().collect::<Vec<_>>(),
        &program.constants.iter().collect::<Vec<_>>(),
        &program.statics.iter().collect::<Vec<_>>(),
    )?;
    insert_std_mem_import_context(
        &mut expression_context,
        program.uses.iter(),
        program
            .functions
            .iter()
            .map(|function| function.sig.ident.to_string()),
    );
    insert_std_float_consts_context(&mut expression_context, program.uses.iter());
    insert_program_type_path_context(&mut expression_context, program);
    let (mut value_imports, mut type_imports) = cross_crate_imports(program, &expression_context);
    for alias in type_script_type_aliases {
        if let Some(module) = alias.module {
            type_imports
                .entry(module.to_string())
                .or_default()
                .insert(alias.target.to_string());
        }
    }
    let entity_construction_parameters = program
        .functions
        .iter()
        .map(|function| {
            return program
                .entity_construction_functions
                .contains(&function.sig.ident.to_string())
                || initializes_readonly_entity(
                    function,
                    &program.entities,
                    &program.readonly_structs,
                )
                || initializes_resolved_readonly_entity(function, &expression_context);
        })
        .collect::<Vec<_>>();
    let finish_entity_returns = program
        .functions
        .iter()
        .map(|function| {
            entity_factory_finish_binding(function, &program.functions, &expression_context)
        })
        .collect::<Vec<_>>();
    let uses_entity_construction = entity_construction_parameters.contains(&true);
    let uses_finish_entity = finish_entity_returns.iter().any(Option::is_some);
    let mut source_context = expression_context.clone();
    if program.nullable_options {
        source_context.insert(NULLABLE_OPTIONS_MARKER.to_string());
    }
    let nullable_types = nullable_guard_types(&programs, &aliases, &expression_context)?;
    let nullable_static_names = program
        .statics
        .iter()
        .filter_map(|rust_static| {
            type_contains_nullable(&rust_static.ty, &source_context, &aliases, &nullable_types)
                .ok()
                .filter(|contains| *contains)
                .map(|_| rust_static.ident.to_string())
        })
        .collect::<HashSet<_>>();
    let mut out = String::new();

    let entity_module = if uses_allocate_entity
        || uses_entity_construction
        || uses_finish_entity
        || !program.entities.is_empty()
    {
        Some(entity_module.ok_or_else(|| {
            compile_error(
                "this Rust module uses entity runtime types; provide a TypeScript entity module",
            )
        })?)
    } else {
        None
    };
    if uses_allocate_entity {
        value_imports
            .entry(
                entity_module
                    .expect("entity module was required")
                    .to_string(),
            )
            .or_default()
            .insert("allocateEntity".to_string());
    }
    if uses_finish_entity {
        value_imports
            .entry(
                entity_module
                    .expect("entity module was required")
                    .to_string(),
            )
            .or_default()
            .insert("finishEntity".to_string());
    }
    validate_dependency_export_name_bindings(
        &expression_context,
        &program_value_bindings(program, &expression_context),
        &value_imports,
    )?;
    if !program.entities.is_empty() {
        type_imports
            .entry(
                entity_module
                    .expect("entity module was required")
                    .to_string(),
            )
            .or_default()
            .insert("EntityRaw".to_string());
    }
    if uses_entity_construction {
        type_imports
            .entry(
                entity_module
                    .expect("entity module was required")
                    .to_string(),
            )
            .or_default()
            .insert("EntityConstruction".to_string());
    }
    for name in used_identity_aliases {
        let alias = external_identity_aliases
            .get(&name)
            .expect("used identity alias came from the external alias map");
        type_imports
            .entry(alias.module.clone())
            .or_default()
            .insert(name);
    }
    let lenient = input.lenient;
    let mut lenient_diagnostics: Vec<String> = Vec::new();
    if !lenient {
        reject_entity_runtime_state_store_collisions(program, &programs)?;
    } else if let Err(error) = reject_entity_runtime_state_store_collisions(program, &programs) {
        lenient_diagnostics.push(error.to_string());
    }
    let source_identities = (0..programs.len())
        .map(|index| {
            module_identities
                .and_then(|identities| identities.get(index))
                .cloned()
        })
        .chain(visibility_identities.iter().cloned())
        .collect::<Vec<_>>();
    if !lenient {
        reject_unsafe_lazy_lock_initializers(
            program,
            &programs,
            visibility_programs,
            &source_identities,
            source_paths,
        )?;
    } else if let Err(error) = reject_unsafe_lazy_lock_initializers(
        program,
        &programs,
        visibility_programs,
        &source_identities,
        source_paths,
    ) {
        lenient_diagnostics.push(error.to_string());
    }
    if !lenient {
        reject_unsupported_array_like_uses(
            program,
            &programs
                .iter()
                .copied()
                .chain(visibility_programs)
                .collect::<Vec<_>>(),
            &expression_context,
        )?;
    } else if let Err(error) = reject_unsupported_array_like_uses(
        program,
        &programs
            .iter()
            .copied()
            .chain(visibility_programs)
            .collect::<Vec<_>>(),
        &expression_context,
    ) {
        lenient_diagnostics.push(error.to_string());
    }
    // The body is emitted before the imports so the package-internal state stores it actually reads
    // or writes can be imported from their declaring sibling modules.
    let mut body = String::new();
    emit_internal_type_export_declarations(&mut body, internal_type_exports, &source_context)?;
    for rust_enum in &program.enums {
        let enum_start = body.len();
        let result = emit_enum(
            &mut body,
            rust_enum,
            program
                .string_unions
                .get(&rust_enum.ident.to_string())
                .copied(),
            program
                .string_union_values
                .get(&rust_enum.ident.to_string()),
            program.numeric_unions.get(&rust_enum.ident.to_string()),
            program.data_unions.contains(&rust_enum.ident.to_string())
                && !source_context.contains(&format!("@data-union-skip:{}", rust_enum.ident)),
            &source_context,
        );
        match result {
            Ok(()) => body.push('\n'),
            Err(error) if lenient => {
                body.truncate(enum_start);
                let name = &rust_enum.ident;
                lenient_diagnostics.push(format!("enum {name}: {error}"));
                writeln!(body, "// [lenient] enum {name}: {error}\n")
                    .expect("writing to a String cannot fail");
            }
            Err(error) => return Err(error),
        }
    }
    for type_alias in &program.type_aliases {
        let alias_start = body.len();
        let result = emit_type_alias(
            &mut body,
            type_alias,
            &source_context,
            program
                .callable_parameters
                .get(&type_alias.ident.to_string())
                .map(Vec::as_slice),
        );
        match result {
            Ok(()) => body.push('\n'),
            Err(error) if lenient => {
                body.truncate(alias_start);
                let name = &type_alias.ident;
                lenient_diagnostics.push(format!("type {name}: {error}"));
                writeln!(body, "// [lenient] type {name}: {error}\n")
                    .expect("writing to a String cannot fail");
            }
            Err(error) => return Err(error),
        }
    }
    for structure in &program.structs {
        let struct_start = body.len();
        let result = emit_struct(
            &mut body,
            structure,
            &source_context,
            &aliases,
            &program.callable_field_parameters,
            program
                .readonly_structs
                .contains(&structure.ident.to_string()),
        );
        match result {
            Ok(()) => body.push('\n'),
            Err(error) if lenient => {
                body.truncate(struct_start);
                let name = &structure.ident;
                lenient_diagnostics.push(format!("struct {name}: {error}"));
                writeln!(body, "// [lenient] struct {name}: {error}\n")
                    .expect("writing to a String cannot fail");
            }
            Err(error) => return Err(error),
        }
    }
    let group_members =
        crate::model::const_group_members(&program.const_groups, &program.constants)?;
    let mut emitted_groups = BTreeSet::new();
    for constant in &program.constants {
        let rust_name = constant.ident.to_string();
        if let Some((_, owner, _)) = group_members.iter().find(|(name, _, _)| *name == rust_name) {
            if emitted_groups.insert(owner.clone()) {
                let group_start = body.len();
                let result = emit_const_group(
                    &mut body,
                    owner,
                    &group_members,
                    &program.constants,
                    &source_context,
                );
                match result {
                    Ok(()) => body.push('\n'),
                    Err(error) if lenient => {
                        body.truncate(group_start);
                        lenient_diagnostics.push(format!("const group {owner}: {error}"));
                        writeln!(body, "// [lenient] const group {owner}: {error}\n")
                            .expect("writing to a String cannot fail");
                    }
                    Err(error) => return Err(error),
                }
            }
            continue;
        }
        let const_start = body.len();
        let result = emit_constant(
            &mut body,
            constant,
            &source_context,
            program.frozen_objects.get(&rust_name).map(String::as_str),
        );
        match result {
            Ok(()) => body.push('\n'),
            Err(error) if lenient => {
                body.truncate(const_start);
                lenient_diagnostics.push(format!("const {rust_name}: {error}"));
                writeln!(body, "// [lenient] const {rust_name}: {error}\n")
                    .expect("writing to a String cannot fail");
            }
            Err(error) => return Err(error),
        }
    }
    for rust_static in &program.statics {
        let static_start = body.len();
        let result = emit_static(
            &mut body,
            rust_static,
            &source_context,
            &aliases,
            &nullable_types,
        );
        match result {
            Ok(()) => body.push('\n'),
            Err(error) if lenient => {
                body.truncate(static_start);
                let name = &rust_static.ident;
                lenient_diagnostics.push(format!("static {name}: {error}"));
                writeln!(body, "// [lenient] static {name}: {error}\n")
                    .expect("writing to a String cannot fail");
            }
            Err(error) => return Err(error),
        }
    }
    let flight_error_aliases = flight_error_result_aliases(
        std::iter::once(program)
            .chain(input.alias_programs)
            .chain(input.visibility_programs),
    );
    for function in &program.functions {
        if function.sig.asyncness.is_some()
            && let ReturnType::Type(_, rust_type) = &function.sig.output
            && flight_error_result_type(rust_type, &flight_error_aliases)
        {
            source_context.insert(format!(
                "{ASYNC_FLIGHT_ERROR_FUNCTION_MARKER}{}",
                function.sig.ident
            ));
        }
    }
    for (index, function) in program.functions.iter().enumerate() {
        let entity_construction_parameter = entity_construction_parameters[index];
        let finish_entity_return = finish_entity_returns[index].as_deref();
        let function_start = body.len();
        let result = emit_function(
            &mut body,
            function,
            &source_context,
            &aliases,
            &nullable_static_names,
            entity_construction_parameter,
            finish_entity_return,
        );
        match result {
            Ok(()) => {
                if index + 1 < program.functions.len() {
                    body.push('\n');
                }
            }
            Err(error) if lenient => {
                body.truncate(function_start);
                let name = &function.sig.ident;
                lenient_diagnostics.push(format!("fn {name}: {error}"));
                writeln!(body, "// [lenient] fn {name}: {error}\n")
                    .expect("writing to a String cannot fail");
            }
            Err(error) => return Err(error),
        }
    }
    if lenient {
        if let Err(error) = emit_entity_runtime_state_stores(&mut body, program, &source_context) {
            lenient_diagnostics.push(format!("entity runtime state stores: {error}"));
        }
    } else {
        emit_entity_runtime_state_stores(&mut body, program, &source_context)?;
    }
    if !internal_type_exports.is_empty() {
        if !body.ends_with("\n\n") {
            body.push('\n');
        }
        writeln!(
            body,
            "export type {{ {} }};",
            internal_type_exports.join(", ")
        )
        .expect("writing to a String cannot fail");
    }
    match entity_runtime_state_store_imports(&body, &programs, &program_modules) {
        Ok(imports) => {
            for (store, module) in imports {
                value_imports.entry(module).or_default().insert(store);
            }
        }
        Err(error) if lenient => {
            lenient_diagnostics.push(format!("entity runtime state store imports: {error}"));
        }
        Err(error) => return Err(error),
    }
    for (module, names) in &value_imports {
        writeln!(
            out,
            "import {{ {} }} from {};",
            names.iter().cloned().collect::<Vec<_>>().join(", "),
            js_string_literal(module)
        )
        .expect("writing to a String cannot fail");
    }
    for (module, names) in &type_imports {
        writeln!(
            out,
            "import type {{ {} }} from {};",
            names.iter().cloned().collect::<Vec<_>>().join(", "),
            js_string_literal(module)
        )
        .expect("writing to a String cannot fail");
    }
    if !value_imports.is_empty() || !type_imports.is_empty() {
        out.push('\n');
    }
    out.push_str(&body);
    if lenient && !lenient_diagnostics.is_empty() {
        eprintln!("lenient: {} items skipped", lenient_diagnostics.len());
        for diagnostic in &lenient_diagnostics {
            eprintln!("  {diagnostic}");
        }
    }
    return Ok(out);
}
