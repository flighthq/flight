use std::collections::{BTreeMap, BTreeSet, HashSet};

use syn::visit::Visit;
use syn::{Expr, FnArg, ItemFn, ItemStruct, ItemUse, Pat, ReturnType, Stmt, Type};

use crate::model::TestProgram;
use crate::{CompileError, compile_error};

use super::{
    BindingFact, FUNCTION_OWNER_MARKER, NULLABLE_CALL_MARKER, NULLABLE_OPTIONS_MARKER,
    PROVENANCE_SEPARATOR, ProvenanceIdentity, ProvenanceImportRule, RETURN_BINDING_FACT_MARKER,
    SHARED_IDENTITY_FIELD_MARKER, SHARED_IDENTITY_RETURN_MARKER, STRUCT_OWNER_MARKER, SourceAccess,
    argument_is_option, bind_lexical_pattern, binding_fact_for_type, binding_fact_marker,
    callable_parameter_rust_types, clear_provenance_binding, collect_cross_crate_use_tree,
    direct_lock_guard_receiver, export_name, expression_is_associated_path, expression_is_path,
    foreign_wildcard_modules, insert_dependency_export_name_context, insert_provenance_binding,
    is_primitive_typescript_type, lexical_fact, local_pattern_name, marker_suffixes,
    provenance_binding_table, provenance_import_rules, provenance_marker_values,
    provenance_pattern_bindings, replace_provenance_binding_table, resolve_owner_inner,
    resolved_provenance_binding, rust_type_is_shared_identity, snake_to_lower_camel,
    source_module_name, unique_marker_suffix, vec_clone_optional, vitest_type_is_shared_identity,
};

pub(super) const VITEST_FUNCTION_CANDIDATE_MARKER: &str = "@vitest-function-candidate:";
pub(super) const VITEST_FUNCTION_RETURN_CANDIDATE_MARKER: &str =
    "@vitest-function-return-candidate:";
pub(super) const VITEST_FUNCTION_RETURN_UNRESOLVED_MARKER: &str =
    "@vitest-function-return-unresolved:";
pub(super) const VITEST_LOCAL_CRATE_ALIAS_MARKER: &str = "@vitest-local-crate-alias:";
pub(super) const VITEST_LOCAL_CRATE_MARKER: &str = "@vitest-local-crate:";
pub(super) const VITEST_LOCAL_MODULE_ALIAS_MARKER: &str = "@vitest-local-module-alias:";
pub(super) const VITEST_STRUCT_LOCAL_MARKER: &str = "@vitest-struct-local:";
pub(super) const VITEST_STRUCT_OWNER_MARKER: &str = "@vitest-struct-owner:";
pub(super) const VITEST_STRUCT_CANDIDATE_MARKER: &str = "@vitest-struct-candidate:";
pub(super) const VITEST_PUBLIC_FUNCTION_MARKER: &str = "@vitest-public-function:";
pub(super) const VITEST_REBOUND_TYPE_MARKER: &str = "@vitest-rebound-type:";
pub(super) const VITEST_STRUCT_RETURN_MARKER: &str = "@vitest-struct-return:";
pub(super) const VITEST_STRUCT_VEC_CALLBACK_MARKER: &str = "@vitest-struct-vec-callback:";

// `Some(value)` erases to `value`, so an unannotated mutable local would otherwise infer only the
// payload type and reject a later Rust-valid `None` assignment. Preserve the Option's TypeScript
// union when the payload has exact selected-contract provenance.
pub(super) fn inferred_vitest_option_initializer_type(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    return match expression {
        Expr::Call(call) if call.args.len() == 1 && expression_is_path(&call.func, "Some") => {
            let payload = &call.args[0];
            let typescript_type = inferred_vitest_struct_return_type(payload, entities)
                .map(|(_, typescript_type)| typescript_type)
                .or_else(|| inferred_vitest_struct_literal_type(payload, entities))?;
            let absent = if entities.contains(NULLABLE_OPTIONS_MARKER) {
                "null"
            } else {
                "undefined"
            };
            Some(format!("{typescript_type} | {absent}"))
        }
        Expr::Group(group) => inferred_vitest_option_initializer_type(&group.expr, entities),
        Expr::Paren(paren) => inferred_vitest_option_initializer_type(&paren.expr, entities),
        Expr::Reference(reference) => {
            inferred_vitest_option_initializer_type(&reference.expr, entities)
        }
        _ => None,
    };
}
pub(super) fn inferred_vitest_struct_literal_name(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    return match expression {
        Expr::MethodCall(_) => direct_lock_guard_receiver(expression)
            .and_then(|receiver| inferred_vitest_struct_literal_name(receiver, entities)),
        Expr::Call(call)
            if call.args.len() == 1
                && (expression_is_associated_path(&call.func, "Arc", "new")
                    || expression_is_associated_path(&call.func, "Mutex", "new")) =>
        {
            inferred_vitest_struct_literal_name(&call.args[0], entities)
        }
        Expr::Call(call) => {
            let Expr::Path(path) = call.func.as_ref() else {
                return None;
            };
            if path.qself.is_some() {
                return None;
            }
            let local_function = vitest_path_binding_name(&path.path, entities)?;
            let function_identity = unique_marker_suffix(
                entities,
                &format!("{VITEST_PUBLIC_FUNCTION_MARKER}{local_function}{PROVENANCE_SEPARATOR}"),
            )?;
            unique_marker_suffix(
                entities,
                &format!("{VITEST_STRUCT_RETURN_MARKER}{function_identity}{PROVENANCE_SEPARATOR}"),
            )
        }
        Expr::Group(group) => inferred_vitest_struct_literal_name(&group.expr, entities),
        Expr::Paren(paren) => inferred_vitest_struct_literal_name(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            let local = path.path.segments.first()?.ident.to_string();
            match lexical_fact(entities, &local) {
                Some(BindingFact::Structure(identity)) => Some(identity),
                _ => vitest_struct_local(entities, &local),
            }
        }
        Expr::Reference(reference) => {
            inferred_vitest_struct_literal_name(&reference.expr, entities)
        }
        Expr::Struct(structure) if structure.qself.is_none() => {
            let name = vitest_path_binding_name(&structure.path, entities)?;
            vitest_struct_owner(entities, &name)
        }
        _ => None,
    };
}

pub(super) fn inferred_vitest_struct_literal_type(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    return match expression {
        Expr::Call(call) if call.args.len() == 1 => {
            let inner = inferred_vitest_struct_literal_type(&call.args[0], entities)?;
            if expression_is_associated_path(&call.func, "Arc", "new") {
                Some(if is_primitive_typescript_type(&inner) {
                    inner
                } else {
                    format!("Readonly<{inner}>")
                })
            } else if expression_is_associated_path(&call.func, "Mutex", "new") {
                Some(format!("{{ value: {inner} }}"))
            } else {
                None
            }
        }
        Expr::Group(group) => inferred_vitest_struct_literal_type(&group.expr, entities),
        Expr::Paren(paren) => inferred_vitest_struct_literal_type(&paren.expr, entities),
        Expr::Reference(reference) => {
            inferred_vitest_struct_literal_type(&reference.expr, entities)
        }
        Expr::Struct(structure) if structure.qself.is_none() => {
            let name = vitest_path_binding_name(&structure.path, entities)?;
            is_vitest_struct(entities, &name).then_some(name)
        }
        _ => None,
    };
}

fn inferred_vitest_struct_return_type(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<(String, String)> {
    let Expr::Call(call) = expression else {
        return None;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return None;
    };
    if path.qself.is_some() {
        return None;
    }
    let function = vitest_path_binding_name(&path.path, entities)?;
    let identity = inferred_vitest_struct_literal_name(expression, entities)?;
    let typescript_function = export_name(entities, &function)
        .map_or_else(|| snake_to_lower_camel(&function), str::to_string);
    return Some((
        identity,
        format!("ReturnType<typeof {typescript_function}>"),
    ));
}

// Records the dependency `export-name` mappings a Rust test module imports, across its top-level and
// suite `use` items.
// flight-lint: allow(hashmap-iteration) test items retain Rust source order in Vecs
pub(crate) fn insert_vitest_dependency_export_name_context(
    context: &mut HashSet<String>,
    program: &TestProgram,
    dependencies: &[(BTreeMap<String, String>, &str)],
) -> Result<(), CompileError> {
    if dependencies.iter().all(|(names, _)| names.is_empty()) {
        return Ok(());
    }
    let uses = program
        .uses
        .iter()
        .chain(program.suites.iter().flat_map(|suite| &suite.uses))
        .collect::<Vec<_>>();
    let mut symbols = BTreeMap::new();
    for item_use in &uses {
        collect_cross_crate_use_tree(&item_use.tree, &mut Vec::new(), &mut symbols);
    }
    let functions = program
        .helpers
        .iter()
        .chain(program.suites.iter().flat_map(|suite| {
            suite
                .helpers
                .iter()
                .chain(suite.tests.iter().map(|test| &test.function))
        }))
        .collect::<Vec<_>>();
    return insert_dependency_export_name_context(
        context,
        dependencies,
        &symbols,
        &foreign_wildcard_modules(&uses),
        &functions,
        &program.constants.iter().collect::<Vec<_>>(),
        &[],
    );
}

pub(crate) fn insert_vitest_helper_return_context<'a>(
    context: &mut HashSet<String>,
    module: &str,
    helpers: impl Iterator<Item = &'a ItemFn>,
) {
    for helper in helpers {
        let function = helper.sig.ident.to_string();
        clear_provenance_binding(context, VITEST_PUBLIC_FUNCTION_MARKER, &function);
        clear_provenance_binding(context, VITEST_FUNCTION_CANDIDATE_MARKER, &function);
        let function_identity = ProvenanceIdentity {
            declaration: function.clone(),
            module: module.to_string(),
        }
        .encoded();
        insert_provenance_binding(
            context,
            VITEST_PUBLIC_FUNCTION_MARKER,
            &function,
            &function_identity,
        );
        let ReturnType::Type(_, rust_type) = &helper.sig.output else {
            continue;
        };
        if rust_type_is_shared_identity(context, rust_type) {
            context.insert(format!(
                "{SHARED_IDENTITY_RETURN_MARKER}{function_identity}{PROVENANCE_SEPARATOR}"
            ));
        }
        context.insert(format!(
            "{RETURN_BINDING_FACT_MARKER}{function_identity}{PROVENANCE_SEPARATOR}{}",
            binding_fact_marker(&binding_fact_for_type(context, None, rust_type))
        ));
        let Some(structure) = vitest_named_type(rust_type, context) else {
            continue;
        };
        let Some(identity) = vitest_struct_owner(context, &structure) else {
            continue;
        };
        context.insert(format!(
            "{VITEST_FUNCTION_RETURN_CANDIDATE_MARKER}{function_identity}{PROVENANCE_SEPARATOR}{identity}"
        ));
        context.insert(format!(
            "{VITEST_STRUCT_RETURN_MARKER}{function_identity}{PROVENANCE_SEPARATOR}{identity}"
        ));
    }
}

pub(crate) fn insert_vitest_import_alias_context<'a>(
    context: &mut HashSet<String>,
    uses: impl Iterator<Item = &'a ItemUse>,
) {
    let local_crates = marker_suffixes(context, VITEST_LOCAL_CRATE_MARKER);
    let all_rules = provenance_import_rules(uses, None);
    for exported in all_rules.iter().filter_map(|rule| match rule {
        ProvenanceImportRule::Explicit { exported, .. } => Some(exported),
        ProvenanceImportRule::Wildcard { .. } => None,
    }) {
        context.remove(&format!("{VITEST_LOCAL_MODULE_ALIAS_MARKER}{exported}"));
    }
    let mut crate_aliases = local_crates
        .iter()
        .map(|local| (local.clone(), local.clone()))
        .collect::<BTreeMap<_, _>>();
    for _ in 0..=all_rules.len() {
        let mut changed = false;
        for rule in &all_rules {
            let ProvenanceImportRule::Explicit {
                exported,
                imported,
                module,
            } = rule
            else {
                continue;
            };
            let canonical = match module.as_deref() {
                None => crate_aliases.get(imported).cloned(),
                Some(module) => {
                    let mut segments = module.split("::");
                    let first = segments.next().unwrap_or_default();
                    let prefix = if matches!(first, "crate" | "self" | "super") {
                        (local_crates.len() == 1)
                            .then(|| local_crates.first().cloned())
                            .flatten()
                    } else {
                        crate_aliases.get(first).cloned()
                    };
                    let Some(prefix) = prefix else {
                        continue;
                    };
                    let mut target = prefix;
                    for segment in segments {
                        target.push_str("::");
                        target.push_str(segment);
                    }
                    if imported != "self" {
                        target.push_str("::");
                        target.push_str(imported);
                    }
                    Some(target)
                }
            };
            let Some(canonical) = canonical else {
                continue;
            };
            changed |= crate_aliases
                .insert(exported.clone(), canonical.clone())
                .as_ref()
                != Some(&canonical);
        }
        if !changed {
            break;
        }
    }
    context.extend(
        crate_aliases
            .iter()
            .filter(|(alias, canonical)| alias != canonical)
            .map(|(alias, canonical)| {
                format!("{VITEST_LOCAL_CRATE_ALIAS_MARKER}{alias}{PROVENANCE_SEPARATOR}{canonical}")
            }),
    );
    let source_modules = [
        VITEST_FUNCTION_CANDIDATE_MARKER,
        VITEST_STRUCT_CANDIDATE_MARKER,
    ]
    .into_iter()
    .flat_map(|marker| provenance_binding_table(context, marker).into_values())
    .flatten()
    .filter_map(|identity| {
        identity
            .split_once(PROVENANCE_SEPARATOR)
            .map(|(module, _)| source_module_name(module))
    })
    .collect::<BTreeSet<_>>();
    context.extend(
        crate_aliases
            .iter()
            .filter(|(alias, canonical)| alias != canonical)
            .filter(|(_, canonical)| {
                local_crates.iter().any(|local| {
                    canonical == &local
                        || canonical
                            .strip_prefix(&format!("{local}::"))
                            .is_some_and(|module| source_modules.contains(module))
                })
            })
            .map(|(alias, _)| format!("{VITEST_LOCAL_MODULE_ALIAS_MARKER}{alias}")),
    );
    let module_is_local = |module: &str| {
        module == "crate"
            || crate_aliases
                .iter()
                .any(|(local, _)| module == local || module.starts_with(&format!("{local}::")))
    };
    let foreign_wildcard = all_rules.iter().any(|rule| {
        matches!(rule, ProvenanceImportRule::Wildcard { module } if !module_is_local(module))
    });
    let local_wildcard = all_rules.iter().any(
        |rule| matches!(rule, ProvenanceImportRule::Wildcard { module } if module_is_local(module)),
    );
    let rules = all_rules
        .iter()
        .filter_map(|rule| match rule {
            ProvenanceImportRule::Explicit {
                exported,
                imported,
                module,
            } if module.as_deref().is_none_or(module_is_local) => {
                Some((exported.clone(), imported.clone()))
            }
            ProvenanceImportRule::Explicit { .. } => None,
            ProvenanceImportRule::Wildcard { .. } => None,
        })
        .collect::<Vec<_>>();
    let targets = all_rules
        .iter()
        .filter_map(|rule| match rule {
            ProvenanceImportRule::Explicit { exported, .. } => Some(exported.clone()),
            ProvenanceImportRule::Wildcard { .. } => None,
        })
        .collect::<BTreeSet<_>>();
    for marker in [
        VITEST_PUBLIC_FUNCTION_MARKER,
        VITEST_FUNCTION_CANDIDATE_MARKER,
        VITEST_STRUCT_OWNER_MARKER,
        VITEST_STRUCT_CANDIDATE_MARKER,
    ] {
        let base = provenance_binding_table(context, marker);
        let clear_current_selections = foreign_wildcard
            && !local_wildcard
            && matches!(
                marker,
                VITEST_PUBLIC_FUNCTION_MARKER | VITEST_STRUCT_OWNER_MARKER
            );
        let seed = if clear_current_selections {
            BTreeMap::new()
        } else {
            base.clone()
        };
        let mut bindings = base.clone();
        for _ in 0..=rules.len() {
            let mut next = seed.clone();
            for target in &targets {
                next.remove(target);
            }
            for (exported, imported) in &rules {
                if let Some(identities) = bindings.get(imported) {
                    next.entry(exported.clone())
                        .or_default()
                        .extend(identities.iter().cloned());
                }
            }
            if next == bindings {
                break;
            }
            bindings = next;
        }
        replace_provenance_binding_table(context, marker, bindings);
    }
}

pub(crate) fn insert_vitest_local_crate_context<'a>(
    context: &mut HashSet<String>,
    contract_module: &str,
    source_modules: impl Iterator<Item = &'a str>,
) {
    if let Some(package) = contract_module
        .strip_prefix("@flighthq/")
        .and_then(|module| module.strip_suffix("/contract"))
    {
        context.insert(format!(
            "{VITEST_LOCAL_CRATE_MARKER}flight_{}",
            package.replace('-', "_")
        ));
    }
    for source in source_modules {
        let normalized = source.replace('\\', "/");
        let Some((_, after_crates)) = normalized.split_once("crates/") else {
            continue;
        };
        let Some((package, _)) = after_crates.split_once("/src/") else {
            continue;
        };
        context.insert(format!(
            "{VITEST_LOCAL_CRATE_MARKER}{}",
            package.replace('-', "_")
        ));
    }
}

// `SHARED_IDENTITY_FIELD_MARKER` facts for a test file's own structs (`vitest/local`): a field whose
// declared type lowers to an identity-bearing object, reading the file's own type aliases and, for a
// name it imports, the one loaded source alias of that name.
pub(crate) fn insert_vitest_local_shared_identity_context<'a>(
    context: &mut HashSet<String>,
    structures: impl Iterator<Item = &'a ItemStruct>,
    aliases: impl Iterator<Item = &'a syn::ItemType>,
) {
    let aliases = aliases
        .filter(|alias| alias.generics.params.is_empty())
        .map(|alias| (alias.ident.to_string(), alias.ty.as_ref().clone()))
        .collect::<BTreeMap<_, _>>();
    let mut facts = Vec::new();
    for structure in structures {
        for field in &structure.fields {
            let Some(field_name) = &field.ident else {
                continue;
            };
            if vitest_type_is_shared_identity(context, &aliases, &field.ty, 0) {
                facts.push(format!(
                    "{SHARED_IDENTITY_FIELD_MARKER}{}{PROVENANCE_SEPARATOR}{field_name}",
                    ProvenanceIdentity {
                        declaration: structure.ident.to_string(),
                        module: "vitest/local".to_string(),
                    }
                    .encoded()
                ));
            }
        }
    }
    context.extend(facts);
}

pub(crate) fn insert_vitest_local_struct_context<'a>(
    context: &mut HashSet<String>,
    structures: impl Iterator<Item = &'a ItemStruct>,
) {
    let structures = structures.collect::<Vec<_>>();
    for structure in &structures {
        let name = structure.ident.to_string();
        clear_provenance_binding(context, VITEST_STRUCT_OWNER_MARKER, &name);
        clear_provenance_binding(context, VITEST_STRUCT_CANDIDATE_MARKER, &name);
        insert_provenance_binding(
            context,
            VITEST_STRUCT_OWNER_MARKER,
            &name,
            &ProvenanceIdentity {
                declaration: name.clone(),
                module: "vitest/local".to_string(),
            }
            .encoded(),
        );
    }
    insert_vitest_struct_context(context, structures.into_iter());
}

pub(crate) fn insert_vitest_local_type_alias_context<'a>(
    context: &mut HashSet<String>,
    aliases: impl Iterator<Item = &'a syn::ItemType>,
) {
    for alias in aliases {
        let name = alias.ident.to_string();
        clear_provenance_binding(context, VITEST_STRUCT_OWNER_MARKER, &name);
        clear_provenance_binding(context, VITEST_STRUCT_CANDIDATE_MARKER, &name);
        insert_provenance_binding(
            context,
            VITEST_STRUCT_OWNER_MARKER,
            &name,
            &ProvenanceIdentity {
                declaration: name.clone(),
                module: "vitest/local".to_string(),
            }
            .encoded(),
        );
    }
}

pub(crate) fn insert_vitest_nullable_call_context<'a>(
    context: &mut HashSet<String>,
    functions: impl Iterator<Item = &'a ItemFn>,
) {
    for function in functions {
        let function_name = function.sig.ident.to_string();
        for (argument_index, argument) in function.sig.inputs.iter().enumerate() {
            if argument_is_option(argument) {
                context.insert(format!(
                    "{NULLABLE_CALL_MARKER}{function_name}:{argument_index}"
                ));
            }
        }
    }
}

pub(crate) fn insert_vitest_rebound_struct_context(
    statements: &[Stmt],
    context: &mut HashSet<String>,
) {
    let mut bindings = BTreeMap::<String, BTreeMap<String, String>>::new();
    for statement in statements {
        let Stmt::Local(local) = statement else {
            continue;
        };
        let Some(local_name) = local_pattern_name(&local.pat) else {
            continue;
        };
        let Some(initializer) = &local.init else {
            continue;
        };
        let Some((identity, typescript_type)) =
            inferred_vitest_struct_return_type(&initializer.expr, context)
        else {
            continue;
        };
        bindings
            .entry(local_name)
            .or_default()
            .insert(identity, typescript_type);
    }
    for (local, types) in bindings {
        if types.len() < 2 {
            continue;
        }
        context.insert(format!(
            "{VITEST_REBOUND_TYPE_MARKER}{local}{PROVENANCE_SEPARATOR}{}",
            types.into_values().collect::<Vec<_>>().join(" | ")
        ));
    }
}

pub(crate) fn insert_vitest_struct_context<'a>(
    context: &mut HashSet<String>,
    structures: impl Iterator<Item = &'a ItemStruct>,
) {
    for structure in structures {
        let structure_name = structure.ident.to_string();
        for field in &structure.fields {
            let Some(field_name) = &field.ident else {
                continue;
            };
            let Some(parameter_types) = callable_parameter_rust_types(&field.ty) else {
                continue;
            };
            let field_name = snake_to_lower_camel(&field_name.to_string());
            for (index, rust_type) in parameter_types.iter().enumerate() {
                if let Some(optional) = vec_clone_optional(rust_type) {
                    context.insert(format!(
                        "{VITEST_STRUCT_VEC_CALLBACK_MARKER}{structure_name}:{field_name}:{index}:{optional}"
                    ));
                }
            }
        }
    }
}

// Integration-test crates can expose Rust-only helpers at their crate root while the package
// generator supplies the matching target-native `rustTestSupport` object. Preserve strict contract
// provenance for every production candidate; only a crate-root function with no production
// declaration at all belongs to that test-support lane.
pub(super) fn is_vitest_crate_root_test_support_function(
    path: &syn::Path,
    context: &HashSet<String>,
) -> bool {
    if path.segments.len() != 2
        || path
            .segments
            .first()
            .is_none_or(|segment| segment.ident != "crate")
    {
        return false;
    }
    let function = path
        .segments
        .last()
        .expect("two-segment paths have a function")
        .ident
        .to_string();
    return provenance_marker_values(context, VITEST_PUBLIC_FUNCTION_MARKER, &function).is_empty()
        && provenance_marker_values(context, VITEST_FUNCTION_CANDIDATE_MARKER, &function)
            .is_empty();
}

pub(crate) fn is_vitest_function(context: &HashSet<String>, name: &str) -> bool {
    return !provenance_marker_values(context, VITEST_PUBLIC_FUNCTION_MARKER, name).is_empty()
        || !provenance_marker_values(context, VITEST_FUNCTION_CANDIDATE_MARKER, name).is_empty();
}

pub(crate) fn is_vitest_struct(context: &HashSet<String>, name: &str) -> bool {
    return !provenance_marker_values(context, VITEST_STRUCT_OWNER_MARKER, name).is_empty()
        || !provenance_marker_values(context, VITEST_STRUCT_CANDIDATE_MARKER, name).is_empty();
}

fn resolved_qualified_vitest_identity(
    context: &HashSet<String>,
    segments: &[String],
    canonical_crate: &str,
    owner_marker_name: &str,
    candidate_marker: &str,
    kind: &str,
) -> Result<String, CompileError> {
    let declaration = segments.last().expect("a qualified path has a declaration");
    let relative_module = segments[1..segments.len() - 1].join("::");
    let mut identities = BTreeSet::new();
    for module in [
        format!("{canonical_crate}::{relative_module}"),
        relative_module.clone(),
    ] {
        if let Some((owner, declaration)) = resolve_owner_inner(
            context,
            owner_marker_name,
            &module,
            declaration,
            SourceAccess::Public,
            &mut BTreeSet::new(),
        ) {
            identities.insert(format!("{owner}{PROVENANCE_SEPARATOR}{declaration}"));
        }
    }
    identities.extend(
        provenance_marker_values(context, candidate_marker, declaration)
            .into_iter()
            .filter(|identity| {
                let Some((module, _)) = identity.split_once(PROVENANCE_SEPARATOR) else {
                    return false;
                };
                let module = source_module_name(module);
                module == relative_module
                    || module == format!("{canonical_crate}::{relative_module}")
            }),
    );
    if identities.len() == 1 {
        return Ok(identities.into_iter().next().expect("one identity exists"));
    }
    let rust_path = segments.join("::");
    if identities.is_empty() {
        return Err(compile_error(format!(
            "qualified current-package {kind} path `{rust_path}` does not resolve to one public declaration in its complete module"
        )));
    }
    return Err(compile_error(format!(
        "qualified current-package {kind} path `{rust_path}` is ambiguous between {}; preserve a unique module declaration",
        identities
            .iter()
            .map(|identity| ProvenanceIdentity::encoded_description(identity))
            .collect::<Vec<_>>()
            .join(", ")
    )));
}

fn resolved_vitest_function_binding(
    context: &HashSet<String>,
    local: &str,
) -> Result<Option<String>, CompileError> {
    return resolved_provenance_binding(
        context,
        VITEST_PUBLIC_FUNCTION_MARKER,
        VITEST_FUNCTION_CANDIDATE_MARKER,
        local,
        "function",
    );
}

fn resolved_vitest_path_binding(
    path: &syn::Path,
    context: &HashSet<String>,
    binding_marker: &str,
    candidate_marker: &str,
    owner_marker_name: &str,
    kind: &str,
) -> Result<Option<String>, CompileError> {
    let Some(last) = path
        .segments
        .last()
        .map(|segment| segment.ident.to_string())
    else {
        return Ok(None);
    };
    if path.segments.len() == 1 {
        return Ok(Some(last));
    }
    let first = path
        .segments
        .first()
        .expect("a qualified path has a first segment")
        .ident
        .to_string();
    let Some(prefix) = vitest_current_path_prefix(context, &first) else {
        return Ok(None);
    };
    let mut resolved_segments = prefix.split("::").map(str::to_string).collect::<Vec<_>>();
    resolved_segments.extend(
        path.segments
            .iter()
            .skip(1)
            .map(|segment| segment.ident.to_string()),
    );
    let canonical_crate = resolved_segments
        .first()
        .expect("a current-package path has a crate root")
        .clone();
    if resolved_segments.len() == 2 {
        let Some(identity) =
            resolved_provenance_binding(context, binding_marker, candidate_marker, &last, kind)?
        else {
            return Err(compile_error(format!(
                "qualified current-package {kind} path `{first}::{last}` is not selected by contract.rs"
            )));
        };
        return selected_vitest_binding_for_identity(
            context,
            binding_marker,
            &identity,
            &last,
            kind,
        )
        .map(Some);
    }
    let identity = resolved_qualified_vitest_identity(
        context,
        &resolved_segments,
        &canonical_crate,
        owner_marker_name,
        candidate_marker,
        kind,
    )?;
    return selected_vitest_binding_for_identity(context, binding_marker, &identity, &last, kind)
        .map(Some);
}

fn resolved_vitest_struct_binding(
    context: &HashSet<String>,
    local: &str,
) -> Result<Option<String>, CompileError> {
    return resolved_provenance_binding(
        context,
        VITEST_STRUCT_OWNER_MARKER,
        VITEST_STRUCT_CANDIDATE_MARKER,
        local,
        "struct/type",
    );
}

fn selected_vitest_binding_for_identity(
    context: &HashSet<String>,
    binding_marker: &str,
    identity: &str,
    declaration: &str,
    kind: &str,
) -> Result<String, CompileError> {
    let bindings = provenance_binding_table(context, binding_marker)
        .into_iter()
        .filter_map(|(local, identities)| identities.contains(identity).then_some(local))
        .collect::<BTreeSet<_>>();
    if bindings.contains(declaration) {
        return Ok(declaration.to_string());
    }
    if bindings.len() == 1 {
        return Ok(bindings.into_iter().next().expect("one binding exists"));
    }
    let description = ProvenanceIdentity::encoded_description(identity);
    if bindings.is_empty() {
        return Err(compile_error(format!(
            "qualified current-package {kind} path resolves to {description}, but contract.rs does not select that exact declaration"
        )));
    }
    return Err(compile_error(format!(
        "qualified current-package {kind} path resolves to {description}, which contract.rs exports under multiple aliases {}; use one selected contract binding explicitly",
        bindings.into_iter().collect::<Vec<_>>().join(", ")
    )));
}

pub(crate) fn update_vitest_local_function_context(
    local: &syn::Local,
    context: &mut HashSet<String>,
) {
    for binding in provenance_pattern_bindings(&local.pat) {
        clear_provenance_binding(context, VITEST_PUBLIC_FUNCTION_MARKER, &binding);
        clear_provenance_binding(context, VITEST_FUNCTION_CANDIDATE_MARKER, &binding);
    }
    bind_lexical_pattern(context, &local.pat);
}

pub(crate) fn update_vitest_struct_local_context(
    local: &syn::Local,
    context: &mut HashSet<String>,
) {
    let Some(local_name) = local_pattern_name(&local.pat) else {
        return;
    };
    let prefix = format!("{VITEST_STRUCT_LOCAL_MARKER}{local_name}{PROVENANCE_SEPARATOR}");
    context.retain(|marker| !marker.starts_with(&prefix));
    let identity = local
        .init
        .as_ref()
        .and_then(|initializer| inferred_vitest_struct_literal_name(&initializer.expr, context))
        .or_else(|| {
            let Pat::Type(typed) = &local.pat else {
                return None;
            };
            let structure = vitest_named_type(&typed.ty, context)?;
            vitest_struct_owner(context, &structure)
        });
    if let Some(identity) = identity {
        context.insert(format!(
            "{VITEST_STRUCT_LOCAL_MARKER}{local_name}{PROVENANCE_SEPARATOR}{identity}"
        ));
    }
}

pub(crate) fn validate_vitest_function_provenance(
    function: &ItemFn,
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    struct ProvenanceUseCollector<'a> {
        calls: BTreeSet<String>,
        context: &'a HashSet<String>,
        error: Option<CompileError>,
        scopes: Vec<BTreeSet<String>>,
        structures: BTreeSet<String>,
    }

    impl ProvenanceUseCollector<'_> {
        fn insert_pattern_bindings(&mut self, pattern: &Pat) {
            if let Some(scope) = self.scopes.last_mut() {
                scope.extend(provenance_pattern_bindings(pattern));
            }
        }

        fn is_shadowed(&self, name: &str) -> bool {
            return self.scopes.iter().rev().any(|scope| scope.contains(name));
        }

        fn record_struct_binding(&mut self, name: String) {
            if !provenance_marker_values(self.context, VITEST_STRUCT_OWNER_MARKER, &name).is_empty()
                || !provenance_marker_values(self.context, VITEST_STRUCT_CANDIDATE_MARKER, &name)
                    .is_empty()
            {
                self.structures.insert(name);
            }
        }

        fn record_function_path(&mut self, path: &syn::Path) {
            if is_vitest_crate_root_test_support_function(path, self.context) {
                return;
            }
            match vitest_function_path_binding_name(path, self.context) {
                Ok(Some(function)) if !self.is_shadowed(&function) => {
                    self.calls.insert(function);
                }
                Ok(_) => {}
                Err(error) if self.error.is_none() => self.error = Some(error),
                Err(_) => {}
            }
        }

        fn record_struct_path(&mut self, path: &syn::Path) {
            match vitest_struct_path_binding_name(path, self.context) {
                Ok(Some(structure)) => self.record_struct_binding(structure),
                Ok(None) => {}
                Err(error) if self.error.is_none() => self.error = Some(error),
                Err(_) => {}
            }
        }
    }

    impl<'ast> Visit<'ast> for ProvenanceUseCollector<'_> {
        fn visit_block(&mut self, block: &'ast syn::Block) {
            self.scopes.push(BTreeSet::new());
            for statement in &block.stmts {
                if let Stmt::Local(local) = statement {
                    if let Some(initializer) = &local.init {
                        self.visit_expr(&initializer.expr);
                        if let Some((_, diverge)) = &initializer.diverge {
                            self.visit_expr(diverge);
                        }
                    }
                    self.visit_pat(&local.pat);
                    self.insert_pattern_bindings(&local.pat);
                } else {
                    self.visit_stmt(statement);
                }
            }
            self.scopes.pop();
        }

        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            if let Expr::Path(path) = call.func.as_ref()
                && path.qself.is_none()
            {
                self.record_function_path(&path.path);
            }
            syn::visit::visit_expr_call(self, call);
        }

        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            self.scopes.push(BTreeSet::new());
            for input in &closure.inputs {
                self.insert_pattern_bindings(input);
            }
            self.visit_expr(&closure.body);
            self.scopes.pop();
        }

        fn visit_expr_for_loop(&mut self, expression: &'ast syn::ExprForLoop) {
            self.visit_expr(&expression.expr);
            self.visit_pat(&expression.pat);
            self.scopes
                .push(provenance_pattern_bindings(&expression.pat));
            self.visit_block(&expression.body);
            self.scopes.pop();
        }

        fn visit_expr_if(&mut self, expression: &'ast syn::ExprIf) {
            if let Expr::Let(binding) = expression.cond.as_ref() {
                self.visit_expr(&binding.expr);
                self.visit_pat(&binding.pat);
                self.scopes.push(provenance_pattern_bindings(&binding.pat));
                self.visit_block(&expression.then_branch);
                self.scopes.pop();
            } else {
                self.visit_expr(&expression.cond);
                self.visit_block(&expression.then_branch);
            }
            if let Some((_, otherwise)) = &expression.else_branch {
                self.visit_expr(otherwise);
            }
        }

        fn visit_expr_match(&mut self, expression: &'ast syn::ExprMatch) {
            self.visit_expr(&expression.expr);
            for arm in &expression.arms {
                self.visit_pat(&arm.pat);
                self.scopes.push(provenance_pattern_bindings(&arm.pat));
                if let Some((_, guard)) = &arm.guard {
                    self.visit_expr(guard);
                }
                self.visit_expr(&arm.body);
                self.scopes.pop();
            }
        }

        fn visit_expr_while(&mut self, expression: &'ast syn::ExprWhile) {
            if let Expr::Let(binding) = expression.cond.as_ref() {
                self.visit_expr(&binding.expr);
                self.visit_pat(&binding.pat);
                self.scopes.push(provenance_pattern_bindings(&binding.pat));
                self.visit_block(&expression.body);
                self.scopes.pop();
            } else {
                self.visit_expr(&expression.cond);
                self.visit_block(&expression.body);
            }
        }

        fn visit_expr_struct(&mut self, structure: &'ast syn::ExprStruct) {
            if structure.qself.is_none() {
                self.record_struct_path(&structure.path);
            }
            syn::visit::visit_expr_struct(self, structure);
        }

        fn visit_type_path(&mut self, rust_type: &'ast syn::TypePath) {
            if rust_type.qself.is_none() {
                self.record_struct_path(&rust_type.path);
            }
            syn::visit::visit_type_path(self, rust_type);
        }
    }
    let parameter_bindings = function
        .sig
        .inputs
        .iter()
        .filter_map(|argument| match argument {
            FnArg::Typed(argument) => Some(argument.pat.as_ref()),
            FnArg::Receiver(_) => None,
        })
        .flat_map(provenance_pattern_bindings)
        .collect();
    let mut collector = ProvenanceUseCollector {
        calls: BTreeSet::new(),
        context,
        error: None,
        scopes: vec![parameter_bindings],
        structures: BTreeSet::new(),
    };
    collector.visit_signature(&function.sig);
    collector.visit_block(&function.block);
    if let Some(error) = collector.error {
        return Err(error);
    }
    for local_function in collector.calls {
        let Some(function_identity) = resolved_vitest_function_binding(context, &local_function)?
        else {
            continue;
        };
        let return_candidates = provenance_marker_values(
            context,
            VITEST_FUNCTION_RETURN_CANDIDATE_MARKER,
            &function_identity,
        );
        let return_bindings =
            provenance_marker_values(context, VITEST_STRUCT_RETURN_MARKER, &function_identity);
        let unresolved_returns = provenance_marker_values(
            context,
            VITEST_FUNCTION_RETURN_UNRESOLVED_MARKER,
            &function_identity,
        );
        if !unresolved_returns.is_empty() {
            return Err(compile_error(format!(
                "portable test function `{local_function}` has unresolved struct return type(s) {}; import or qualify exactly one public source owner in its production module",
                unresolved_returns
                    .into_iter()
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }
        if !return_candidates.is_empty() && return_bindings.len() != 1 {
            let owners = return_candidates
                .iter()
                .map(|identity| ProvenanceIdentity::encoded_description(identity))
                .collect::<Vec<_>>()
                .join(", ");
            return Err(compile_error(format!(
                "portable test function `{local_function}` has ambiguous or unresolved struct return provenance among {owners}; make its return type resolve to exactly one public source owner"
            )));
        }
    }
    for structure in collector.structures {
        resolved_vitest_struct_binding(context, &structure)?;
    }
    return Ok(());
}

pub(super) fn vitest_current_path_prefix(context: &HashSet<String>, local: &str) -> Option<String> {
    if marker_suffixes(context, VITEST_LOCAL_CRATE_MARKER).contains(local) {
        return Some(local.to_string());
    }
    if matches!(local, "crate" | "self" | "super") {
        let crates = marker_suffixes(context, VITEST_LOCAL_CRATE_MARKER);
        return (crates.len() == 1)
            .then(|| crates.first().cloned())
            .flatten();
    }
    unique_marker_suffix(
        context,
        &format!("{VITEST_LOCAL_CRATE_ALIAS_MARKER}{local}{PROVENANCE_SEPARATOR}"),
    )
}

pub(crate) fn vitest_function_path_binding_name(
    path: &syn::Path,
    context: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    return resolved_vitest_path_binding(
        path,
        context,
        VITEST_PUBLIC_FUNCTION_MARKER,
        VITEST_FUNCTION_CANDIDATE_MARKER,
        FUNCTION_OWNER_MARKER,
        "function",
    );
}

pub(super) fn vitest_named_type(rust_type: &Type, context: &HashSet<String>) -> Option<String> {
    return match rust_type {
        Type::Group(group) => vitest_named_type(&group.elem, context),
        Type::Paren(paren) => vitest_named_type(&paren.elem, context),
        Type::Reference(reference) => vitest_named_type(&reference.elem, context),
        Type::Path(path) if path.qself.is_none() => vitest_path_binding_name(&path.path, context),
        _ => None,
    };
}

pub(crate) fn vitest_path_binding_name(
    path: &syn::Path,
    context: &HashSet<String>,
) -> Option<String> {
    return vitest_struct_path_binding_name(path, context)
        .ok()
        .flatten()
        .or_else(|| {
            vitest_function_path_binding_name(path, context)
                .ok()
                .flatten()
        });
}

pub(crate) fn vitest_pattern_context(context: &HashSet<String>, pattern: &Pat) -> HashSet<String> {
    let mut scoped = context.clone();
    for binding in provenance_pattern_bindings(pattern) {
        clear_provenance_binding(&mut scoped, VITEST_PUBLIC_FUNCTION_MARKER, &binding);
        clear_provenance_binding(&mut scoped, VITEST_FUNCTION_CANDIDATE_MARKER, &binding);
        clear_provenance_binding(&mut scoped, VITEST_STRUCT_LOCAL_MARKER, &binding);
    }
    if let Pat::Type(typed) = pattern
        && let Some(binding) = local_pattern_name(&typed.pat)
        && let Some(structure) = vitest_named_type(&typed.ty, &scoped)
        && let Some(identity) = vitest_struct_owner(&scoped, &structure)
    {
        insert_provenance_binding(&mut scoped, VITEST_STRUCT_LOCAL_MARKER, &binding, &identity);
    }
    return scoped;
}

pub(super) fn vitest_struct_local(entities: &HashSet<String>, local: &str) -> Option<String> {
    return unique_marker_suffix(
        entities,
        &format!("{VITEST_STRUCT_LOCAL_MARKER}{local}{PROVENANCE_SEPARATOR}"),
    );
}

pub(super) fn vitest_struct_name(identity: &str) -> Option<&str> {
    return identity
        .rsplit_once(PROVENANCE_SEPARATOR)
        .map(|(_, name)| name);
}

pub(super) fn vitest_struct_owner(entities: &HashSet<String>, structure: &str) -> Option<String> {
    return unique_marker_suffix(
        entities,
        &format!("{VITEST_STRUCT_OWNER_MARKER}{structure}{PROVENANCE_SEPARATOR}"),
    );
}

pub(crate) fn vitest_struct_path_binding_name(
    path: &syn::Path,
    context: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    return resolved_vitest_path_binding(
        path,
        context,
        VITEST_STRUCT_OWNER_MARKER,
        VITEST_STRUCT_CANDIDATE_MARKER,
        STRUCT_OWNER_MARKER,
        "struct/type",
    );
}
