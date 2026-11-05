use std::collections::HashSet;

use syn::{Expr, FnArg, ItemFn, Pat, ReturnType, Stmt, Type};

use super::{
    ENTITY_TYPE_MARKER, READONLY_ENTITY_MARKER, current_source, named_type, resolve_type_path,
    resolved_type_identity,
};
pub(super) fn leading_mutable_entity_parameter(
    function: &ItemFn,
    entity_type_names: &HashSet<String>,
) -> Option<(String, String)> {
    let Some(FnArg::Typed(parameter)) = function.sig.inputs.first() else {
        return None;
    };
    let Pat::Ident(name) = parameter.pat.as_ref() else {
        return None;
    };
    let Type::Reference(reference) = parameter.ty.as_ref() else {
        return None;
    };
    reference.mutability?;
    let entity = named_type(&reference.elem)?;
    if !entity_type_names.contains(&entity) {
        return None;
    }
    return Some((name.ident.to_string(), entity));
}

// Whether the function is an entity initializer whose leading mutable parameter needs a writable
// construction view. The source-local entity and readonly facts are both required so an ordinary
// mutable parameter retains its existing public type when any part of the proof is absent.
pub(super) fn initializes_readonly_entity(
    function: &ItemFn,
    entity_type_names: &HashSet<String>,
    readonly_structs: &HashSet<String>,
) -> bool {
    if !function.sig.ident.to_string().starts_with("initialize_") {
        return false;
    }
    let Some((_, entity)) = leading_mutable_entity_parameter(function, entity_type_names) else {
        return false;
    };
    return readonly_structs.contains(&entity);
}

// Whether an `initialize_*` function's leading `&mut` parameter resolves, through the current
// source's imports, to an entity some source declares `readonly-fields`. This extends the
// source-local proof across sources; an unresolved or ambiguous owner keeps the public type.
pub(super) fn initializes_resolved_readonly_entity(
    function: &ItemFn,
    context: &HashSet<String>,
) -> bool {
    if !function.sig.ident.to_string().starts_with("initialize_") {
        return false;
    }
    let Some(module) = current_source(context) else {
        return false;
    };
    let Some(FnArg::Typed(parameter)) = function.sig.inputs.first() else {
        return false;
    };
    if !matches!(parameter.pat.as_ref(), Pat::Ident(_)) {
        return false;
    }
    let Type::Reference(reference) = parameter.ty.as_ref() else {
        return false;
    };
    if reference.mutability.is_none() {
        return false;
    }
    let Some(identity) = resolved_type_identity(context, &module, &reference.elem) else {
        return false;
    };
    return context.contains(&format!("{READONLY_ENTITY_MARKER}{identity}"));
}

// Whether this expression is the actual `flight_entity::allocate_entity` intrinsic. The ordinary
// emitter also recognizes that intrinsic by its terminal spelling, but lifecycle completion needs a
// stronger proof: a same-named local helper must not turn an ordinary constructor into an Entity
// factory.
pub(super) fn is_flight_entity_allocation(expression: &Expr, context: &HashSet<String>) -> bool {
    let Expr::Call(call) = expression else {
        return false;
    };
    if !call.args.is_empty() {
        return false;
    }
    let Expr::Path(function) = call.func.as_ref() else {
        return false;
    };
    if function.qself.is_some() {
        return false;
    }
    return resolve_type_path(&function.path, context).is_some_and(|resolved| {
        matches!(
            resolved
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                .as_slice(),
            ["flight_entity", "allocate_entity"] | ["flight_entity", "entity", "allocate_entity"]
        )
    });
}

// The returned local of the canonical Rust Entity construction transaction:
//
// 1. allocate one exactly resolved Entity into an explicitly typed mutable local;
// 2. immediately call a local `initialize_*` whose leading `&mut` parameter resolves to that Entity;
// 3. return that same local.
//
// Every part is structural and source-qualified. Missing or ambiguous ownership, a non-Entity
// result, a same-named allocation helper, a different initializer target, or any extra statement
// declines the lowering and preserves the ordinary emitted return.
pub(super) fn entity_factory_finish_binding(
    function: &ItemFn,
    functions: &[ItemFn],
    context: &HashSet<String>,
) -> Option<String> {
    let module = current_source(context)?;
    let ReturnType::Type(_, return_type) = &function.sig.output else {
        return None;
    };
    let entity = resolved_type_identity(context, &module, return_type)?;
    if !context.contains(&format!("{ENTITY_TYPE_MARKER}{entity}")) {
        return None;
    }
    let [
        Stmt::Local(local),
        Stmt::Expr(Expr::Call(initialize), _),
        Stmt::Expr(Expr::Return(returned), _),
    ] = function.block.stmts.as_slice()
    else {
        return None;
    };
    let Pat::Type(typed) = &local.pat else {
        return None;
    };
    let Pat::Ident(binding) = typed.pat.as_ref() else {
        return None;
    };
    if binding.by_ref.is_some() || binding.mutability.is_none() || binding.subpat.is_some() {
        return None;
    }
    if resolved_type_identity(context, &module, &typed.ty).as_deref() != Some(entity.as_str()) {
        return None;
    }
    let initializer = local.init.as_ref()?;
    if initializer.diverge.is_some() || !is_flight_entity_allocation(&initializer.expr, context) {
        return None;
    }

    let Expr::Path(initializer_path) = initialize.func.as_ref() else {
        return None;
    };
    let initializer_name = initializer_path.path.get_ident()?.to_string();
    if !initializer_name.starts_with("initialize_") {
        return None;
    }
    let mut matching_initializers = functions
        .iter()
        .filter(|candidate| candidate.sig.ident == initializer_name.as_str());
    let initializer_function = matching_initializers.next()?;
    if matching_initializers.next().is_some() {
        return None;
    }
    let FnArg::Typed(initializer_parameter) = initializer_function.sig.inputs.first()? else {
        return None;
    };
    let Type::Reference(initializer_reference) = initializer_parameter.ty.as_ref() else {
        return None;
    };
    if initializer_reference.mutability.is_none()
        || resolved_type_identity(context, &module, &initializer_reference.elem).as_deref()
            != Some(entity.as_str())
    {
        return None;
    }
    let Expr::Reference(argument) = initialize.args.first()? else {
        return None;
    };
    let Expr::Path(argument_path) = argument.expr.as_ref() else {
        return None;
    };
    if argument.mutability.is_none() || !argument_path.path.is_ident(&binding.ident) {
        return None;
    }
    let Expr::Path(returned_path) = returned.expr.as_deref()? else {
        return None;
    };
    if !returned_path.path.is_ident(&binding.ident) {
        return None;
    }
    return Some(binding.ident.to_string());
}
