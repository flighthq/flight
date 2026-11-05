use std::collections::HashSet;

use syn::{Expr, GenericArgument, PathArguments, Type};

use crate::{CompileError, compile_error};

use super::{
    DIRECT_LOCK_GUARD_BINDING_MARKER, DIRECT_LOCK_GUARD_TARGET_MARKER, PROVENANCE_SEPARATOR,
    REF_ALIAS_RECEIVER_CAPTURE_MARKER, REF_ALIAS_TARGET_MARKER, expression_is_associated_path,
    lexical_binding, referenced_path_identifier, resolve_type_path, unique_marker_suffix,
};

// The cell whose guard is produced by an exact `cell.lock().unwrap()` expression.
pub(super) fn mutex_guard_receiver(expression: &Expr) -> Option<&Expr> {
    let Expr::MethodCall(unwrap) = expression else {
        return None;
    };
    if unwrap.method != "unwrap" || !unwrap.args.is_empty() {
        return None;
    }
    let Expr::MethodCall(lock) = unwrap.receiver.as_ref() else {
        return None;
    };
    return (lock.method == "lock" && lock.args.is_empty()).then_some(lock.receiver.as_ref());
}

// The cell whose guard is produced by an exact `cell.read().unwrap()` or
// `cell.write().unwrap()` expression.
// A compound assignment operator (`+=`, `<<=`, ..).
pub(super) fn binary_operator_assigns(operator: &syn::BinOp) -> bool {
    use syn::BinOp;
    return matches!(
        operator,
        BinOp::AddAssign(_)
            | BinOp::SubAssign(_)
            | BinOp::MulAssign(_)
            | BinOp::DivAssign(_)
            | BinOp::RemAssign(_)
            | BinOp::BitXorAssign(_)
            | BinOp::BitAndAssign(_)
            | BinOp::BitOrAssign(_)
            | BinOp::ShlAssign(_)
            | BinOp::ShrAssign(_)
    );
}

// `Arc::new(RwLock::new(..))`: a new erased shared cell.
pub(super) fn expression_constructs_rw_lock_cell(expression: &Expr) -> bool {
    let Expr::Call(arc) = expression else {
        return false;
    };
    if !expression_is_associated_path(&arc.func, "Arc", "new") || arc.args.len() != 1 {
        return false;
    }
    return matches!(&arc.args[0], Expr::Call(lock)
        if expression_is_associated_path(&lock.func, "RwLock", "new") && lock.args.len() == 1);
}

pub(super) fn direct_lock_guard_receiver(expression: &Expr) -> Option<&Expr> {
    let Expr::MethodCall(unwrap) = expression else {
        return None;
    };
    if unwrap.method != "unwrap" || !unwrap.args.is_empty() {
        return None;
    }
    let Expr::MethodCall(lock) = unwrap.receiver.as_ref() else {
        return None;
    };
    return (matches!(lock.method.to_string().as_str(), "read" | "write") && lock.args.is_empty())
        .then_some(lock.receiver.as_ref());
}

pub(super) fn direct_lock_guard_target(
    entities: &HashSet<String>,
    id: &str,
) -> Result<Option<Expr>, CompileError> {
    let prefix = format!("{DIRECT_LOCK_GUARD_TARGET_MARKER}{id}{PROVENANCE_SEPARATOR}");
    let mut targets = entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(&prefix));
    let Some(target) = targets.next() else {
        return Ok(None);
    };
    if targets.next().is_some() {
        return Err(compile_error(format!(
            "direct lock guard binding `{id}` has ambiguous target cells"
        )));
    }
    let target = syn::parse_str::<Expr>(target)
        .map_err(|error| compile_error(format!("failed to recover lock target: {error}")))?;
    if let Some(alias) = ref_alias_target(entities, &target)? {
        return Ok(Some(alias));
    }
    return Ok(Some(target));
}

pub(super) fn direct_lock_assignment_target(
    entities: &HashSet<String>,
    expression: &Expr,
) -> Result<Option<Expr>, CompileError> {
    if let Some(receiver) = direct_lock_guard_receiver(expression) {
        if let Some(target) = ref_alias_target(entities, receiver)? {
            return Ok(Some(target));
        }
        return Ok(Some(receiver.clone()));
    }
    if let Some(id) = referenced_path_identifier(expression)
        .and_then(|name| lexical_binding(entities, &name))
        .filter(|id| entities.contains(&format!("{DIRECT_LOCK_GUARD_BINDING_MARKER}{id}")))
    {
        return direct_lock_guard_target(entities, &id);
    }
    return Ok(None);
}

pub(super) fn ref_alias_target(
    entities: &HashSet<String>,
    expression: &Expr,
) -> Result<Option<Expr>, CompileError> {
    let Expr::Path(path) = expression else {
        return Ok(None);
    };
    if path.qself.is_some() || path.path.segments.len() != 1 {
        return Ok(None);
    }
    let Some(alias) = path.path.segments.first() else {
        return Ok(None);
    };
    let Some(id) = lexical_binding(entities, &alias.ident.to_string()) else {
        return Ok(None);
    };
    return ref_alias_target_for_id(entities, &id);
}

pub(super) fn ref_alias_target_for_id(
    entities: &HashSet<String>,
    id: &str,
) -> Result<Option<Expr>, CompileError> {
    let Some(target) = unique_marker_suffix(
        entities,
        &format!("{REF_ALIAS_TARGET_MARKER}{}{PROVENANCE_SEPARATOR}", id),
    ) else {
        return Ok(None);
    };
    return syn::parse_str::<Expr>(&target)
        .map(Some)
        .map_err(|error| compile_error(format!("failed to recover Ref alias target: {error}")));
}

pub(super) fn ref_alias_receiver_capture(
    entities: &HashSet<String>,
    id: &str,
) -> Result<Option<(String, Expr)>, CompileError> {
    let Some(capture) = unique_marker_suffix(
        entities,
        &format!("{REF_ALIAS_RECEIVER_CAPTURE_MARKER}{id}{PROVENANCE_SEPARATOR}"),
    ) else {
        return Ok(None);
    };
    let Some((stable, expression)) = capture.split_once(PROVENANCE_SEPARATOR) else {
        return Err(compile_error(
            "malformed stable Ref alias receiver capture marker",
        ));
    };
    let expression = syn::parse_str::<Expr>(expression).map_err(|error| {
        compile_error(format!(
            "failed to recover stable Ref alias receiver capture: {error}"
        ))
    })?;
    return Ok(Some((stable.to_string(), expression)));
}

// Shared locks retain interior mutability through immutable Rust references. Wrapping those cells in
// TypeScript `Readonly` would reject the writes that the lock specifically authorizes.
// `entities` adds provenance: a standard `Mutex` or `RwLock` imported under another name is still a
// shared cell. Without type-path context only the canonical names are recognized.
pub(super) fn rust_type_has_interior_mutability(
    rust_type: &Type,
    entities: &HashSet<String>,
) -> bool {
    let path = match rust_type {
        Type::Group(group) => return rust_type_has_interior_mutability(&group.elem, entities),
        Type::Paren(paren) => return rust_type_has_interior_mutability(&paren.elem, entities),
        Type::Reference(reference) => {
            return rust_type_has_interior_mutability(&reference.elem, entities);
        }
        Type::Path(path) => path,
        _ => return false,
    };
    let Some(segment) = path.path.segments.last() else {
        return false;
    };
    if matches!(
        segment.ident.to_string().as_str(),
        "Mutex" | "RwLock" | "Ref"
    ) || resolve_type_path(&path.path, entities).is_some_and(|owner| {
        matches!(
            owner
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                .as_slice(),
            ["std", "sync", "Mutex" | "RwLock"]
        )
    }) {
        return true;
    }
    if segment.ident != "Arc" {
        return false;
    }
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return false;
    };
    return arguments.args.iter().any(|argument| {
        matches!(argument, GenericArgument::Type(inner) if rust_type_has_interior_mutability(inner, entities))
    });
}
