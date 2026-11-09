use std::collections::{BTreeMap, BTreeSet, HashSet};

use quote::ToTokens;
use syn::{Expr, GenericArgument, Pat, PathArguments, Stmt, Type};

use crate::CompileError;

use super::{
    PROVENANCE_SEPARATOR, SOURCE_TYPE_PATH_CONTEXT_MARKER, STD_MEM_FUNCTION_MARKER,
    STD_MEM_FUNCTION_TARGET_MARKER, STD_MEM_FUNCTIONS, STD_MEM_GLOB_MARKER, STD_MEM_MODULE_MARKER,
    STD_MEM_SHADOWED_MARKER, TYPE_ALIAS_DEFINITION_MARKER, TYPE_ALIAS_OWNER_MARKER,
    TYPE_EXTERN_CRATE_MARKER, TYPE_LOCAL_MARKER, TYPE_NO_STD_MARKER, TYPE_USE_GLOB_MARKER,
    TYPE_USE_MARKER, TYPE_USE_TARGET_MARKER, compile_error, dependency_export_name_bindings,
    emit_expression, marker_suffixes, named_type, option_inner_type, resolve_path_owner,
    typed_array_for_type, unique_marker_suffix,
};
pub(super) fn source_type_context(entities: &HashSet<String>, from: &str) -> HashSet<String> {
    return marker_suffixes(
        entities,
        &format!("{SOURCE_TYPE_PATH_CONTEXT_MARKER}{from}{PROVENANCE_SEPARATOR}"),
    )
    .into_iter()
    .collect();
}

// Whether a statement contains `return`, `?`, `break` or `continue` anywhere, closures included, so
// a definite-assignment scan stops conservatively before it. Tokens print space-separated.
pub(super) fn statement_may_exit_early(statement: &Stmt) -> bool {
    return statement
        .to_token_stream()
        .to_string()
        .split(|character: char| character.is_whitespace())
        .any(|token| matches!(token, "return" | "break" | "continue" | "?"));
}

// An explicit `&mut` borrow of a place whose reassignment the caller observes (the `std::mem::swap` and
// `std::mem::replace` operands): a local binding, or a field or index chain over one. No `*` reborrow
// appears anywhere in the chain.
pub(super) fn swap_operand_is_place(operand: &Expr) -> bool {
    fn is_place(expression: &Expr) -> bool {
        return match expression {
            Expr::Paren(paren) => is_place(&paren.expr),
            Expr::Group(group) => is_place(&group.expr),
            Expr::Path(path) => path.qself.is_none() && path.path.segments.len() == 1,
            Expr::Field(field) => is_place(&field.base),
            Expr::Index(index) => is_place(&index.expr),
            Expr::MethodCall(call) if call.args.is_empty() => is_place(&call.receiver),
            _ => false,
        };
    }
    return match operand {
        Expr::Paren(paren) => swap_operand_is_place(&paren.expr),
        Expr::Group(group) => swap_operand_is_place(&group.expr),
        Expr::Reference(reference) => reference.mutability.is_some() && is_place(&reference.expr),
        _ => false,
    };
}

// The place `std::mem::take` empties: the operand of `&mut place`, or a bare binding that is itself a
// `&mut` reference. Wider than a swap operand: the base may be a call returning a reference or a
// dereferenced guard, because the caller only accepts it where the place is evaluated once.
pub(super) fn take_operand_place(operand: &Expr) -> Option<&Expr> {
    fn is_place(expression: &Expr) -> bool {
        return match expression {
            Expr::Paren(paren) => is_place(&paren.expr),
            Expr::Group(group) => is_place(&group.expr),
            Expr::Path(path) => path.qself.is_none() && path.path.segments.len() == 1,
            Expr::Field(field) => is_place(&field.base) || is_call(&field.base),
            Expr::Index(index) => is_place(&index.expr),
            Expr::MethodCall(call) if call.args.is_empty() => {
                is_place(&call.receiver) || is_call(&call.receiver)
            }
            Expr::Unary(unary) if matches!(unary.op, syn::UnOp::Deref(_)) => is_place(&unary.expr),
            _ => false,
        };
    }
    fn is_call(expression: &Expr) -> bool {
        return matches!(expression, Expr::Call(call) if matches!(call.func.as_ref(), Expr::Path(_)));
    }
    return match operand {
        Expr::Paren(paren) => take_operand_place(&paren.expr),
        Expr::Group(group) => take_operand_place(&group.expr),
        Expr::Reference(reference) if reference.mutability.is_some() => {
            is_place(&reference.expr).then_some(reference.expr.as_ref())
        }
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => Some(operand),
        _ => None,
    };
}

// Whether any identifier token in `tokens`, at any group depth, is `name`.
pub(super) fn tokens_contain_identifier(tokens: proc_macro2::TokenStream, name: &str) -> bool {
    return tokens.into_iter().any(|token| match token {
        proc_macro2::TokenTree::Ident(identifier) => identifier == name,
        proc_macro2::TokenTree::Group(group) => tokens_contain_identifier(group.stream(), name),
        _ => false,
    });
}

// An array literal or repeat in a typed-array position (`Float64Array`), constructed as that array.
pub(super) fn typed_array_literal(
    expression: &Expr,
    array_type: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return match expression {
        Expr::Array(array) => {
            let elements = array
                .elems
                .iter()
                .map(|element| emit_expression(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("new {array_type}([{}])", elements.join(", ")))
        }
        Expr::Repeat(repeat) => Ok(format!(
            "new {array_type}({}).fill({})",
            emit_expression(&repeat.len, entities)?,
            emit_expression(&repeat.expr, entities)?
        )),
        _ => emit_expression(expression, entities),
    };
}

pub(super) fn typed_binding_name(pattern: &Pat) -> Option<String> {
    return match pattern {
        Pat::Ident(identifier) => Some(identifier.ident.to_string()),
        Pat::Type(typed) => typed_binding_name(&typed.pat),
        _ => None,
    };
}

// A typed-array IR alias is target vocabulary only when the complete public Entity re-export chain
// resolves it to the rust-only `flight_entity::ir` owner and that owner's declaration is an exact
// primitive slice. An unrelated alias with the same spelling is not representation evidence.
pub(super) fn canonical_entity_ir_typed_array_alias(
    rust_type: &Type,
    entities: &HashSet<String>,
    from: &str,
) -> Option<&'static str> {
    let rust_type = match rust_type {
        Type::Group(group) => {
            return canonical_entity_ir_typed_array_alias(&group.elem, entities, from);
        }
        Type::Paren(paren) => {
            return canonical_entity_ir_typed_array_alias(&paren.elem, entities, from);
        }
        rust_type => rust_type,
    };
    let Type::Path(path) = rust_type else {
        return None;
    };
    let (owner, alias) = resolve_path_owner(entities, TYPE_ALIAS_OWNER_MARKER, from, &path.path)?;
    if owner != "flight_entity::ir" {
        return None;
    }
    let definition = unique_marker_suffix(
        entities,
        &format!(
            "{TYPE_ALIAS_DEFINITION_MARKER}{owner}{PROVENANCE_SEPARATOR}{alias}{PROVENANCE_SEPARATOR}"
        ),
    )?;
    let Type::Slice(slice) = syn::parse_str::<Type>(&definition).ok()? else {
        return None;
    };
    return typed_array_for_type(&slice.elem);
}

// `slice` or `mut-slice` for a reference to a slice of a typed-array primitive, otherwise `other`.
pub(super) fn typed_slice_parameter_kind(rust_type: &Type) -> &'static str {
    return match rust_type {
        Type::Group(group) => typed_slice_parameter_kind(&group.elem),
        Type::Paren(paren) => typed_slice_parameter_kind(&paren.elem),
        Type::Reference(reference) => match reference.elem.as_ref() {
            Type::Slice(slice) if typed_array_for_type(&slice.elem).is_some() => {
                if reference.mutability.is_some() {
                    "mut-slice"
                } else {
                    "slice"
                }
            }
            _ => "other",
        },
        _ => "other",
    };
}

pub(super) fn typed_slice_parameter_kind_with_provenance(
    rust_type: &Type,
    entities: &HashSet<String>,
    from: &str,
) -> &'static str {
    let rust_type = match rust_type {
        Type::Group(group) => {
            return typed_slice_parameter_kind_with_provenance(&group.elem, entities, from);
        }
        Type::Paren(paren) => {
            return typed_slice_parameter_kind_with_provenance(&paren.elem, entities, from);
        }
        rust_type => rust_type,
    };
    if let Type::Reference(reference) = rust_type
        && canonical_entity_ir_typed_array_alias(&reference.elem, entities, from)
            == Some("Uint8Array")
    {
        return if reference.mutability.is_some() {
            "uint8-mut-slice"
        } else {
            "uint8-slice"
        };
    }
    return typed_slice_parameter_kind(rust_type);
}

// The owner of the one loaded source alias named `name`, or nothing when none or several are loaded.
// flight-lint: allow(hashmap-iteration) the scan only counts matches; uniqueness does not depend on order
pub(super) fn unique_alias_owner(
    entities: &HashSet<String>,
    name: &str,
) -> Option<(String, String)> {
    let mut owners = entities.iter().filter_map(|marker| {
        let rest = marker.strip_prefix(TYPE_ALIAS_DEFINITION_MARKER)?;
        let mut fields = rest.split(PROVENANCE_SEPARATOR);
        let (owner, alias) = (fields.next()?, fields.next()?);
        return (alias == name).then(|| owner.to_string());
    });
    let owner = owners.next()?;
    if owners.next().is_some() {
        return None;
    }
    return Some((owner, name.to_string()));
}

// Checks each dependency item bound by its mapped name against the complete emitted value namespace:
// local declarations and every import, including compiler-provided ones. Only the dependency's own
// unrenamed import may bind its name.
pub(crate) fn validate_dependency_export_name_bindings(
    context: &HashSet<String>,
    local_values: &BTreeSet<String>,
    imports: &BTreeMap<String, BTreeSet<String>>,
) -> Result<(), CompileError> {
    for (target, module, _) in dependency_export_name_bindings(context) {
        let imported = target
            .split_once('.')
            .map_or(target.as_str(), |(owner, _)| owner);
        if local_values.contains(imported) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` TypeScript name `{imported}` imported from `{module}` collides with a local item"
            )));
        }
        for (import_module, specifiers) in imports {
            for specifier in specifiers {
                let local = specifier
                    .rsplit_once(" as ")
                    .map_or(specifier.as_str(), |(_, local)| local);
                if local == imported && (*import_module != module || *specifier != imported) {
                    return Err(compile_error(format!(
                        "`flight-compiler: export-name` TypeScript name `{imported}` imported from `{module}` collides with another import from `{import_module}`"
                    )));
                }
            }
        }
    }
    return Ok(());
}

pub(super) fn vec_clone_optional(rust_type: &Type) -> Option<bool> {
    if let Some(inner) = option_inner_type(rust_type) {
        return (named_type(inner).as_deref() == Some("Vec")).then_some(true);
    }
    return (named_type(rust_type).as_deref() == Some("Vec")).then_some(false);
}

// `path` with its root crate made canonical: a root this source declares itself (a local `mod std`) is
// this crate's item unless the path is absolute (a leading empty segment for `::root`, which starts in
// the extern prelude); an `extern crate` binding is replaced by the crate it names; `std` without one is
// absent under `#![no_std]`, and `alloc` is never in scope without one.
// flight-lint: allow(hashmap-iteration) deterministic: min() selects the lexicographically smallest match
pub(super) fn canonical_type_path_root(
    mut path: Vec<String>,
    context: &HashSet<String>,
) -> Option<Vec<String>> {
    let absolute = path.first().is_some_and(String::is_empty);
    if absolute {
        path.remove(0);
    }
    let first = path.first()?.clone();
    if !absolute && context.contains(&format!("{TYPE_LOCAL_MARKER}{first}")) {
        return Some(std::iter::once("crate".to_string()).chain(path).collect());
    }
    let prefix = format!("{TYPE_EXTERN_CRATE_MARKER}{first}{PROVENANCE_SEPARATOR}");
    if let Some(target) = context
        .iter()
        .filter_map(|marker| marker.strip_prefix(&prefix))
        .min()
    {
        path[0] = target.to_string();
        return Some(path);
    }
    if (first == "std" && context.contains(TYPE_NO_STD_MARKER)) || first == "alloc" {
        return None;
    }
    return Some(path);
}

// Set / Map operations for a proven receiver, keeping Rust's return values: `HashSet::insert` returns
// whether the value was new, `HashSet::remove` whether it was present, and `HashMap::get` /
// `HashMap::insert` / `HashMap::remove` the current or previous value as an `Option`.

// Whether a resolved path names the standard-library item `name`: `Pin` in `std`/`core::pin`, `Box`
// in `std`/`alloc::boxed`, `Future` in `std`/`core::future`, and `Send` / `Sync` in
// `std`/`core::marker`.
pub(super) fn is_standard_type_path(path: &[String], name: &str) -> bool {
    let (module, roots): (&str, &[&str]) = match name {
        "Box" => ("boxed", &["std", "alloc"]),
        "Future" => ("future", &["std", "core"]),
        "Pin" => ("pin", &["std", "core"]),
        "Send" | "Sync" => ("marker", &["std", "core"]),
        "Vec" => ("vec", &["std", "alloc"]),
        _ => return false,
    };
    return matches!(path, [root, path_module, path_name] if roots.contains(&root.as_str()) && path_module == module && path_name == name);
}

// The full path a type path names, following Rust's precedence: an explicit `use` (named, renamed or
// `self`), a local type-namespace declaration, a glob import, then the prelude (`Box`, `Future` and the
// marker traits) or an extern `std` / `core` / `alloc` root. `None` when that cannot be decided from this
// source: an unknown root, a prelude name it does not model, or a glob outside the standard library that
// could supply the name.
// flight-lint: allow(hashmap-iteration) deterministic: min() and BTreeSet ensure stable iteration
pub(super) fn resolve_type_path(
    path: &syn::Path,
    context: &HashSet<String>,
) -> Option<Vec<String>> {
    let segments = path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    let (first, rest) = segments.split_first()?;
    if path.leading_colon.is_some() {
        return canonical_type_path_root(
            std::iter::once(String::new()).chain(segments).collect(),
            context,
        );
    }
    if context.contains(&format!("{TYPE_USE_MARKER}{first}")) {
        let prefix = format!("{TYPE_USE_TARGET_MARKER}{first}{PROVENANCE_SEPARATOR}");
        let imported = context
            .iter()
            .filter_map(|marker| marker.strip_prefix(&prefix))
            .min()?;
        let mut resolved = imported.split("::").map(str::to_string).collect::<Vec<_>>();
        resolved.extend(rest.iter().cloned());
        return canonical_type_path_root(resolved, context);
    }
    if context.contains(&format!("{TYPE_LOCAL_MARKER}{first}"))
        || matches!(first.as_str(), "crate" | "self" | "super" | "Self")
    {
        return Some(
            std::iter::once("crate".to_string())
                .chain(segments.iter().cloned())
                .collect(),
        );
    }
    let glob_sources = context
        .iter()
        .filter_map(|marker| marker.strip_prefix(TYPE_USE_GLOB_MARKER))
        .collect::<BTreeSet<_>>();
    let globs = glob_sources
        .into_iter()
        .map(|glob| {
            return canonical_type_path_root(
                glob.split("::").map(str::to_string).collect(),
                context,
            );
        })
        .collect::<Option<Vec<_>>>()?;
    if globs.iter().any(|glob| {
        !matches!(
            glob.first().map(String::as_str),
            Some("std" | "core" | "alloc" | "crate")
        )
    }) {
        return None;
    }
    if rest.is_empty() {
        for glob in globs {
            let candidate = glob
                .into_iter()
                .chain(std::iter::once(first.clone()))
                .collect::<Vec<_>>();
            if is_standard_type_path(&candidate, first) {
                return Some(candidate);
            }
        }
        let prelude = match first.as_str() {
            "Box" if context.contains(TYPE_NO_STD_MARKER) => return None,
            "Box" => "std::boxed::Box",
            "Default" => "core::default::Default",
            "Future" => "core::future::Future",
            "Send" => "core::marker::Send",
            "Sized" => "core::marker::Sized",
            "Sync" => "core::marker::Sync",
            "Unpin" => "core::marker::Unpin",
            "Vec" if context.contains(TYPE_NO_STD_MARKER) => return None,
            "Vec" => "std::vec::Vec",
            _ => return None,
        };
        return Some(prelude.split("::").map(str::to_string).collect());
    }
    if matches!(first.as_str(), "std" | "core" | "alloc")
        || marker_suffixes(context, TYPE_EXTERN_CRATE_MARKER)
            .iter()
            .any(|binding| binding.split(PROVENANCE_SEPARATOR).next() == Some(first.as_str()))
    {
        return canonical_type_path_root(segments, context);
    }
    return None;
}

// The `std::mem` function a call path names: `std::mem::f` / `core::mem::f`; `mem::take` /
// `mem::replace` / `mem::swap`; `m::f` through a `use std::mem [as m]` module import; or `f` through a
// direct, aliased, grouped, or wildcard `use std::mem::...` import recorded by
// `insert_std_mem_import_context`. These move values in place, which has no TypeScript lowering.
pub(super) fn std_mem_function(expression: &Expr, context: &HashSet<String>) -> Option<String> {
    let Expr::Path(path) = expression else {
        return None;
    };
    if path.qself.is_some() {
        return None;
    }
    let segments = path
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    return match segments.as_slice() {
        [root, module, name] if (root == "std" || root == "core") && module == "mem" => {
            Some(name.clone())
        }
        [module, name]
            if (module == "mem" && matches!(name.as_str(), "replace" | "swap" | "take"))
                || context.contains(&format!("{STD_MEM_MODULE_MARKER}{module}")) =>
        {
            Some(name.clone())
        }
        [local] => std_mem_imported_function(context, local),
        _ => None,
    };
}

// The `std::mem` function a single-segment call name was imported as, if any.
// flight-lint: allow(hashmap-iteration) deterministic: min() selects the lexicographically smallest match
pub(super) fn std_mem_imported_function(context: &HashSet<String>, local: &str) -> Option<String> {
    if context.contains(&format!("{STD_MEM_FUNCTION_MARKER}{local}")) {
        let prefix = format!("{STD_MEM_FUNCTION_TARGET_MARKER}{local}:");
        return context
            .iter()
            .filter_map(|marker| marker.strip_prefix(&prefix))
            .min()
            .map(str::to_string);
    }
    if context.contains(STD_MEM_GLOB_MARKER)
        && !context.contains(&format!("{STD_MEM_SHADOWED_MARKER}{local}"))
        && STD_MEM_FUNCTIONS.contains(&local)
    {
        return Some(local.to_string());
    }
    return None;
}

pub(super) fn turbofish_type(expression: &Expr) -> Option<String> {
    let Expr::Path(path) = expression else {
        return None;
    };
    let last = path.path.segments.last()?;
    let syn::PathArguments::AngleBracketed(args) = &last.arguments else {
        return None;
    };
    if args.args.len() != 1 {
        return None;
    }
    let syn::GenericArgument::Type(rust_type) = args.args.first()? else {
        return None;
    };
    let Type::Path(type_path) = rust_type else {
        return None;
    };
    return Some(
        type_path
            .path
            .segments
            .iter()
            .map(|segment| segment.ident.to_string())
            .collect::<Vec<_>>()
            .join("::"),
    );
}

pub(super) fn size_of_rust_type(name: &str) -> Option<usize> {
    return match name {
        "u8" | "i8" | "bool" => Some(1),
        "u16" | "i16" => Some(2),
        "u32" | "i32" | "f32" => Some(4),
        "u64" | "i64" | "f64" => Some(8),
        "u128" | "i128" => Some(16),
        "usize" | "isize" => Some(4),
        _ => None,
    };
}
