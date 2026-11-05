use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fmt::Write;

use quote::ToTokens;
use syn::visit::Visit;
use syn::{Expr, FnArg, ItemFn, Pat, Stmt, Type};

use crate::model::Program;
use crate::{CompileError, compile_error};

use super::{
    CrossCrateSymbol, DEPENDENCY_EXPORT_NAME_BINDING_MARKER,
    DEPENDENCY_EXPORT_NAME_BINDINGS_MARKER, DEPENDENCY_EXPORT_NAME_MARKER,
    DEPENDENCY_EXPORT_NAME_TARGET_MARKER, EXPORT_NAME_MARKER, EXPORT_NAME_TARGET_MARKER,
    FLOAT_CONST_MARKER, PROVENANCE_SEPARATOR, STD_MEM_FUNCTION_MARKER,
    STD_MEM_FUNCTION_TARGET_MARKER, STD_MEM_GLOB_MARKER, STD_MEM_MODULE_MARKER,
    STD_MEM_SHADOWED_MARKER, TYPE_EXTERN_CRATE_MARKER, TYPE_LOCAL_MARKER, TYPE_NO_STD_MARKER,
    TYPE_USE_GLOB_MARKER, TYPE_USE_MARKER, TYPE_USE_TARGET_MARKER, TYPED_ARRAY_CONSTANT_MARKER,
    default_item_name, export_name, fixed_typed_array_type, program_item_tokens,
    reject_const_group_wildcard_imports, statement_may_exit_early, tokens_contain_identifier,
};
pub(super) fn insert_dependency_export_name_context(
    context: &mut HashSet<String>,
    dependencies: &[(BTreeMap<String, String>, &str)],
    symbols: &BTreeMap<String, CrossCrateSymbol>,
    wildcard_modules: &[String],
    functions: &[&ItemFn],
    constants: &[&syn::ItemConst],
    statics: &[&syn::ItemStatic],
) -> Result<(), CompileError> {
    let mut modules = BTreeMap::<&str, BTreeMap<&str, &str>>::new();
    for (names, module) in dependencies {
        for (item, target) in names {
            if modules
                .entry(module)
                .or_default()
                .insert(item, target)
                .is_some_and(|previous| previous != target)
            {
                return Err(compile_error(format!(
                    "`flight-compiler: export-name` item `{item}` of `{module}` is given more than one TypeScript name"
                )));
            }
            context.insert(format!("{DEPENDENCY_EXPORT_NAME_MARKER}{module}|{item}"));
            context.insert(format!(
                "{DEPENDENCY_EXPORT_NAME_TARGET_MARKER}{module}|{item}:{target}"
            ));
        }
    }
    let mut references = BTreeMap::<String, (String, String)>::new();
    for symbol in symbols.values() {
        if let Some(target) = modules
            .get(symbol.module.as_str())
            .and_then(|names| names.get(symbol.imported.as_str()))
        {
            // Ordinary renamed imports keep their local alias. A const-group member has no
            // standalone TypeScript export to alias, so both renamed and unrenamed Rust bindings
            // are instead rewritten to the owner's `Owner.Member` expression below.
            if symbol.local != symbol.imported && !target.contains('.') {
                continue;
            }
            references.insert(
                symbol.local.clone(),
                (target.to_string(), symbol.module.clone()),
            );
        }
    }
    reject_const_group_wildcard_imports(dependencies, wildcard_modules)?;
    for module in wildcard_modules {
        for (item, target) in modules.get(module.as_str()).into_iter().flatten() {
            let reference = (target.to_string(), module.clone());
            if references
                .insert(item.to_string(), reference.clone())
                .is_some_and(|previous| previous != reference)
            {
                return Err(compile_error(format!(
                    "`flight-compiler: export-name` item `{item}` is imported from more than one package"
                )));
            }
        }
    }
    if references.is_empty() {
        return Ok(());
    }

    #[derive(Default)]
    struct BindingNameCollector {
        names: HashSet<String>,
    }

    impl<'ast> Visit<'ast> for BindingNameCollector {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            self.names.insert(pattern.ident.to_string());
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut bindings = BindingNameCollector::default();
    for function in functions {
        bindings.visit_item_fn(function);
    }
    for constant in constants {
        bindings.visit_item_const(constant);
    }
    for item in statics {
        bindings.visit_item_static(item);
    }
    for (local, (target, module)) in &references {
        if let Some(existing) = export_name(context, local)
            && existing != target
        {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{local}` imported from `{module}` as `{target}` collides with the local mapping `{existing}`"
            )));
        }
        if bindings.names.contains(local) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{local}` imported from `{module}` is shadowed by a local binding of the same name"
            )));
        }
    }
    context.insert(DEPENDENCY_EXPORT_NAME_BINDINGS_MARKER.to_string());
    for (local, (target, module)) in references {
        context.insert(format!("{EXPORT_NAME_MARKER}{local}"));
        context.insert(format!("{EXPORT_NAME_TARGET_MARKER}{local}:{target}"));
        context.insert(format!(
            "{DEPENDENCY_EXPORT_NAME_BINDING_MARKER}{target}|{module}|{local}"
        ));
    }
    return Ok(());
}

// Records every `export-name` mapping of the combined sources. A mapped Rust name must be declared by
// exactly one source, must not collide with another item's TypeScript name, and must not be reused as a
// local binding, so every reference to it renders the same TypeScript name.
// flight-lint: allow(hashmap-iteration) directives are BTreeMaps and items retain Rust source order in Vecs
pub(super) fn insert_export_name_context(
    context: &mut HashSet<String>,
    programs: &[(&str, &Program)],
) -> Result<(), CompileError> {
    let mut mappings = BTreeMap::<&str, &str>::new();
    for (_, program) in programs {
        for (item, target) in &program.export_names {
            if mappings
                .insert(item, target)
                .is_some_and(|previous| previous != target)
            {
                return Err(compile_error(format!(
                    "`flight-compiler: export-name` item `{item}` is given more than one TypeScript name"
                )));
            }
        }
    }
    if mappings.is_empty() {
        return Ok(());
    }
    // Declaring sources per name, identified by their items: a source may also arrive as one of its own
    // alias sources, and that identical copy is the same declaration.
    let mut declarations = BTreeMap::<String, BTreeSet<String>>::new();
    for (_, program) in programs {
        let names = program
            .functions
            .iter()
            .map(|function| function.sig.ident.to_string())
            .chain(
                program
                    .constants
                    .iter()
                    .map(|constant| constant.ident.to_string()),
            )
            .chain(program.statics.iter().map(|item| item.ident.to_string()))
            .collect::<Vec<_>>();
        let source = if names
            .iter()
            .any(|name| mappings.contains_key(name.as_str()))
        {
            program_item_tokens(program)
        } else {
            String::new()
        };
        for name in names {
            declarations.entry(name).or_default().insert(source.clone());
        }
    }
    for (item, target) in &mappings {
        if declarations.get(*item).is_some_and(|items| items.len() > 1) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{item}` is declared by more than one source"
            )));
        }
        let collides = declarations.keys().any(|other| {
            other != item
                && mappings.get(other.as_str()).map_or_else(
                    || default_item_name(other) == *target,
                    |other_target| other_target == target,
                )
        });
        if collides {
            return Err(compile_error(format!(
                "`flight-compiler: export-name {item}` TypeScript name `{target}` collides with another item"
            )));
        }
    }
    // Names bound by patterns (`let`, parameters, closures, `match` arms) anywhere in the sources.
    #[derive(Default)]
    struct BindingNameCollector {
        names: HashSet<String>,
    }

    impl<'ast> Visit<'ast> for BindingNameCollector {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            self.names.insert(pattern.ident.to_string());
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut bindings = BindingNameCollector::default();
    for (_, program) in programs {
        for function in &program.functions {
            bindings.visit_item_fn(function);
        }
        for constant in &program.constants {
            bindings.visit_item_const(constant);
        }
        for item in &program.statics {
            bindings.visit_item_static(item);
        }
    }
    for (item, target) in mappings {
        if bindings.names.contains(item) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{item}` is shadowed by a local binding of the same name"
            )));
        }
        context.insert(format!("{EXPORT_NAME_MARKER}{item}"));
        context.insert(format!("{EXPORT_NAME_TARGET_MARKER}{item}:{target}"));
    }
    return Ok(());
}

// Adds every `parameter.field` that `statements` assign on all completing paths: a top-level
// assignment, or an `if` whose branches all assign it. Scanning stops at the first statement that
// can leave the body early (`return`, `?`, `break`, `continue`), so a field assigned only after a
// possible early exit is not definitely assigned. Returns false when scanning stopped early.
pub(super) fn collect_definitely_assigned_fields(
    statements: &[Stmt],
    parameter: &str,
    out: &mut BTreeSet<String>,
) -> bool {
    for statement in statements {
        if statement_may_exit_early(statement) {
            return false;
        }
        match statement {
            Stmt::Expr(Expr::Assign(assign), _) => {
                if let Expr::Field(field) = assign.left.as_ref()
                    && let Expr::Path(base) = field.base.as_ref()
                    && base.path.is_ident(parameter)
                    && let syn::Member::Named(member) = &field.member
                {
                    out.insert(member.to_string());
                }
            }
            Stmt::Expr(Expr::If(branch), _) => {
                let Some((_, otherwise)) = &branch.else_branch else {
                    continue;
                };
                let Expr::Block(otherwise) = otherwise.as_ref() else {
                    continue;
                };
                let mut then_fields = BTreeSet::new();
                let mut else_fields = BTreeSet::new();
                collect_definitely_assigned_fields(
                    &branch.then_branch.stmts,
                    parameter,
                    &mut then_fields,
                );
                collect_definitely_assigned_fields(
                    &otherwise.block.stmts,
                    parameter,
                    &mut else_fields,
                );
                out.extend(then_fields.intersection(&else_fields).cloned());
            }
            _ => {}
        }
    }
    return true;
}

// The fields an initializer writes before anything can read or capture `parameter`: its leading
// run of top-level `parameter.field = value;` statements. The run ends at the first other
// statement, a nested or compound target, a value that may leave the body early, or a value naming
// `parameter` anywhere in its tokens (macros, closures and shadowing included, conservatively), so
// a conditional, partial or late write never qualifies.
pub(super) fn initializer_prefix_fields(statements: &[Stmt], parameter: &str) -> BTreeSet<String> {
    let mut fields = BTreeSet::new();
    for statement in statements {
        if statement_may_exit_early(statement) {
            break;
        }
        let Stmt::Expr(Expr::Assign(assign), Some(_)) = statement else {
            break;
        };
        let Expr::Field(field) = assign.left.as_ref() else {
            break;
        };
        let Expr::Path(base) = field.base.as_ref() else {
            break;
        };
        let syn::Member::Named(member) = &field.member else {
            break;
        };
        if !base.path.is_ident(parameter)
            || tokens_contain_identifier(assign.right.to_token_stream(), parameter)
        {
            break;
        }
        fields.insert(member.to_string());
    }
    return fields;
}

// Records a program's type-namespace provenance: its `use` items and local declarations (see
// `insert_type_path_context`), each `extern crate` binding (`extern crate a as b;` binds `b` to crate
// `a`, `self` to this crate), and `#![no_std]`.
pub(crate) fn insert_program_type_path_context(context: &mut HashSet<String>, program: &Program) {
    insert_type_path_context(
        context,
        program.uses.iter(),
        program.type_names.iter().cloned(),
    );
    for extern_crate in &program.extern_crates {
        let name = extern_crate.ident.to_string();
        let local = extern_crate
            .rename
            .as_ref()
            .map_or_else(|| name.clone(), |(_, rename)| rename.to_string());
        let target = if name == "self" {
            "crate".to_string()
        } else {
            name
        };
        context.insert(format!(
            "{TYPE_EXTERN_CRATE_MARKER}{local}{PROVENANCE_SEPARATOR}{target}"
        ));
    }
    if program.no_std {
        context.insert(TYPE_NO_STD_MARKER.to_string());
    }
}

// Records how `use` items bring `std::mem` (or `core::mem`) into scope: the module itself (`use
// std::mem;`, `use std::mem as m;`, `use std::{mem, ...};`), single functions (`use std::mem::take;`,
// `use std::mem::{replace as put, swap};`), or every function (`use std::mem::*;`). Local
// declarations named like a `std::mem` function shadow a wildcard import.
pub(crate) fn insert_std_mem_import_context<'a>(
    context: &mut HashSet<String>,
    uses: impl Iterator<Item = &'a syn::ItemUse>,
    local_names: impl Iterator<Item = String>,
) {
    fn collect(tree: &syn::UseTree, prefix: &mut Vec<String>, context: &mut HashSet<String>) {
        let in_mem =
            prefix.len() == 2 && (prefix[0] == "std" || prefix[0] == "core") && prefix[1] == "mem";
        let at_root = prefix.len() == 1 && (prefix[0] == "std" || prefix[0] == "core");
        match tree {
            syn::UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                collect(&path.tree, prefix, context);
                prefix.pop();
            }
            syn::UseTree::Group(group) => {
                for item in &group.items {
                    collect(item, prefix, context);
                }
            }
            syn::UseTree::Name(name) if in_mem => {
                let name = name.ident.to_string();
                if name == "self" {
                    context.insert(format!("{STD_MEM_MODULE_MARKER}mem"));
                } else {
                    context.insert(format!("{STD_MEM_FUNCTION_MARKER}{name}"));
                    context.insert(format!("{STD_MEM_FUNCTION_TARGET_MARKER}{name}:{name}"));
                }
            }
            syn::UseTree::Rename(rename) if in_mem => {
                let local = rename.rename.to_string();
                if rename.ident == "self" {
                    context.insert(format!("{STD_MEM_MODULE_MARKER}{local}"));
                } else {
                    context.insert(format!("{STD_MEM_FUNCTION_MARKER}{local}"));
                    context.insert(format!(
                        "{STD_MEM_FUNCTION_TARGET_MARKER}{local}:{}",
                        rename.ident
                    ));
                }
            }
            syn::UseTree::Glob(_) if in_mem => {
                context.insert(STD_MEM_GLOB_MARKER.to_string());
            }
            syn::UseTree::Name(name) if at_root && name.ident == "mem" => {
                context.insert(format!("{STD_MEM_MODULE_MARKER}mem"));
            }
            syn::UseTree::Rename(rename) if at_root && rename.ident == "mem" => {
                context.insert(format!("{STD_MEM_MODULE_MARKER}{}", rename.rename));
            }
            syn::UseTree::Glob(_) | syn::UseTree::Name(_) | syn::UseTree::Rename(_) => {}
        }
    }

    for item_use in uses {
        collect(&item_use.tree, &mut Vec::new(), context);
    }
    for name in local_names {
        context.insert(format!("{STD_MEM_SHADOWED_MARKER}{name}"));
    }
}

// Records bare names imported from `std::f32::consts` / `std::f64::consts` (or the `core` variants)
// so that `emit_expression` can map `FRAC_PI_2` → `(Math.PI / 2)` when the name was brought into
// scope by a `use` import rather than a fully qualified path.
pub(crate) fn insert_std_float_consts_context<'a>(
    context: &mut HashSet<String>,
    uses: impl Iterator<Item = &'a syn::ItemUse>,
) {
    fn is_float_consts(prefix: &[String]) -> bool {
        (prefix.len() == 3
            && (prefix[0] == "std" || prefix[0] == "core")
            && (prefix[1] == "f32" || prefix[1] == "f64")
            && prefix[2] == "consts")
            || (prefix.len() == 2
                && (prefix[0] == "f32" || prefix[0] == "f64")
                && prefix[1] == "consts")
    }

    fn collect(tree: &syn::UseTree, prefix: &mut Vec<String>, context: &mut HashSet<String>) {
        match tree {
            syn::UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                collect(&path.tree, prefix, context);
                prefix.pop();
            }
            syn::UseTree::Group(group) => {
                for item in &group.items {
                    collect(item, prefix, context);
                }
            }
            syn::UseTree::Name(name) if is_float_consts(prefix) => {
                let local = name.ident.to_string();
                context.insert(format!("{FLOAT_CONST_MARKER}{local}"));
            }
            syn::UseTree::Rename(rename) if is_float_consts(prefix) => {
                let local = rename.rename.to_string();
                context.insert(format!("{FLOAT_CONST_MARKER}{local}"));
            }
            syn::UseTree::Glob(_) if is_float_consts(prefix) => {
                for name in FLOAT_CONST_NAMES {
                    context.insert(format!("{FLOAT_CONST_MARKER}{name}"));
                }
            }
            _ => {}
        }
    }

    for item_use in uses {
        collect(&item_use.tree, &mut Vec::new(), context);
    }
}

const FLOAT_CONST_NAMES: &[&str] = &[
    "E",
    "FRAC_1_PI",
    "FRAC_1_SQRT_2",
    "FRAC_2_PI",
    "FRAC_2_SQRT_PI",
    "FRAC_PI_2",
    "FRAC_PI_3",
    "FRAC_PI_4",
    "FRAC_PI_6",
    "FRAC_PI_8",
    "LN_2",
    "LN_10",
    "LOG2_E",
    "LOG2_10",
    "LOG10_E",
    "LOG10_2",
    "PI",
    "SQRT_2",
    "TAU",
];

// Records what each `use` item brings into the type namespace (a named or renamed path, `self` of a
// module, or a glob's module) and the names the source declares there itself.
pub(crate) fn insert_type_path_context<'a>(
    context: &mut HashSet<String>,
    uses: impl Iterator<Item = &'a syn::ItemUse>,
    local_names: impl Iterator<Item = String>,
) {
    fn record(context: &mut HashSet<String>, local: &str, path: &[String]) {
        context.insert(format!("{TYPE_USE_MARKER}{local}"));
        context.insert(format!(
            "{TYPE_USE_TARGET_MARKER}{local}{PROVENANCE_SEPARATOR}{}",
            path.join("::")
        ));
    }
    fn collect(tree: &syn::UseTree, prefix: &mut Vec<String>, context: &mut HashSet<String>) {
        match tree {
            syn::UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                collect(&path.tree, prefix, context);
                prefix.pop();
            }
            syn::UseTree::Group(group) => {
                for item in &group.items {
                    collect(item, prefix, context);
                }
            }
            syn::UseTree::Name(name) if name.ident == "self" => {
                if let Some(local) = prefix.last().cloned() {
                    record(context, &local, prefix);
                }
            }
            syn::UseTree::Name(name) => {
                let local = name.ident.to_string();
                prefix.push(local.clone());
                record(context, &local, prefix);
                prefix.pop();
            }
            syn::UseTree::Rename(rename) => {
                let local = rename.rename.to_string();
                if rename.ident == "self" {
                    record(context, &local, prefix);
                } else {
                    prefix.push(rename.ident.to_string());
                    record(context, &local, prefix);
                    prefix.pop();
                }
            }
            syn::UseTree::Glob(_) => {
                context.insert(format!("{TYPE_USE_GLOB_MARKER}{}", prefix.join("::")));
            }
        }
    }

    for item_use in uses {
        // An absolute `use ::root::...` keeps a leading empty segment: it names the extern-prelude root
        // even where a local item shares that name.
        let mut prefix = if item_use.leading_colon.is_some() {
            vec![String::new()]
        } else {
            Vec::new()
        };
        collect(&item_use.tree, &mut prefix, context);
    }
    for name in local_names {
        context.insert(format!("{TYPE_LOCAL_MARKER}{name}"));
    }
}

// Records each constant's typed array (`[f64; 4]` is `Float64Array`), or `other`, by name. A name whose
// constants disagree resolves to no typed array.
// flight-lint: allow(hashmap-iteration) `constants` is a source-order slice inserted into an unordered set
pub(crate) fn insert_typed_array_constant_context(
    context: &mut HashSet<String>,
    constants: &[syn::ItemConst],
) {
    for constant in constants {
        context.insert(format!(
            "{TYPED_ARRAY_CONSTANT_MARKER}{}:{}",
            constant.ident,
            fixed_typed_array_type(&constant.ty).unwrap_or("other")
        ));
    }
}

// Whether a resolved type path names the standard `Arc` (`std` or `alloc` `sync::Arc`).
pub(super) fn is_standard_arc_path(path: &[String]) -> bool {
    return matches!(
        path.iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .as_slice(),
        ["std" | "alloc", "sync", "Arc"]
    );
}
