use std::collections::HashSet;

use syn::{GenericArgument, PathArguments, Type};

use crate::CompileError;

use super::{TYPE_USE_MARKER, compile_error, is_standard_type_path, resolve_type_path};
pub(super) enum PinnedBoxedTrait<'a> {
    Future(&'a Type),
    Stream(&'a Type),
}

// `Pin<Box<dyn Future<Output = T> [+ Send | + Sync | + 'a]>>` or
// `Pin<Box<dyn Stream<Item = T> [+ Send | + Sync | + 'a]>>`, accepted only when `Pin`, `Box`, and
// every auto-trait bound resolve to the standard library, and the primary trait resolves to
// `std::future::Future` or to a `futures`-crate `Stream`. A path named `Pin` that resolves
// elsewhere is an ordinary type unless it spells the shape, which fails closed.
pub(super) fn pinned_boxed_trait_output<'a>(
    path: &'a syn::TypePath,
    context: &HashSet<String>,
) -> Result<Option<PinnedBoxedTrait<'a>>, CompileError> {
    let Some(last) = path.path.segments.last() else {
        return Ok(None);
    };
    let aliased = path
        .path
        .segments
        .first()
        .is_some_and(|first| context.contains(&format!("{TYPE_USE_MARKER}{}", first.ident)));
    if path.qself.is_some() || (last.ident != "Pin" && !aliased) {
        return Ok(None);
    }
    let resolved = resolve_type_path(&path.path, context);
    let standard_pin = resolved
        .as_deref()
        .is_some_and(|resolved| is_standard_type_path(resolved, "Pin"));
    let shape = pinned_boxed_future_shape(last);
    if !standard_pin {
        if last.ident != "Pin" || shape.is_none() {
            return Ok(None);
        }
        return Err(compile_error(match resolved {
            Some(resolved) => format!(
                "portable `Pin` here resolves to `{}`, not `std::pin::Pin`; only the standard pinned boxed future lowers to `Promise`",
                resolved.join("::")
            ),
            None => "cannot resolve the provenance of `Pin`; import it from `std::pin` to lower a pinned boxed future to `Promise`".to_string(),
        }));
    }
    let Some((boxed, primary_trait, auto_traits, output)) = shape else {
        return Err(compile_error(
            "portable `Pin` is supported only as `Pin<Box<dyn Future<Output = T> + Send>>` or `Pin<Box<dyn Stream<Item = T> + Send>>` in a type position",
        ));
    };
    let standard = |path: &syn::Path, name: &str| {
        return resolve_type_path(path, context)
            .is_some_and(|resolved| is_standard_type_path(&resolved, name));
    };
    let other_standard_bound = auto_traits.iter().any(|bound| {
        return resolve_type_path(bound, context).is_some_and(|resolved| {
            matches!(
                resolved.first().map(String::as_str),
                Some("std" | "core" | "alloc")
            ) && !is_standard_type_path(&resolved, "Send")
                && !is_standard_type_path(&resolved, "Sync")
        });
    });
    if other_standard_bound {
        return Err(compile_error(
            "portable `Pin` is supported only as `Pin<Box<dyn Future<Output = T> + Send>>` or `Pin<Box<dyn Stream<Item = T> + Send>>` in a type position",
        ));
    }
    if !standard(boxed, "Box")
        || !auto_traits
            .iter()
            .all(|bound| standard(bound, "Send") || standard(bound, "Sync"))
    {
        return Err(compile_error(
            "portable `Pin<Box<dyn Future<Output = T>>>` needs `Box`, `Future` and its auto-trait bounds to resolve to the standard library",
        ));
    }
    let is_standard_future = standard(primary_trait, "Future");
    let is_stream = is_futures_stream_path(primary_trait, context);
    if is_standard_future {
        return Ok(Some(PinnedBoxedTrait::Future(output)));
    }
    if is_stream {
        return Ok(Some(PinnedBoxedTrait::Stream(output)));
    }
    return Err(compile_error(
        "portable `Pin<Box<dyn Future<Output = T>>>` needs `Box`, `Future` and its auto-trait bounds to resolve to the standard library",
    ));
}

fn is_futures_stream_path(path: &syn::Path, context: &HashSet<String>) -> bool {
    let segments: Vec<_> = path.segments.iter().map(|s| s.ident.to_string()).collect();
    if segments.last().map(String::as_str) != Some("Stream") {
        return false;
    }
    if let Some(resolved) = resolve_type_path(path, context) {
        return matches!(
            resolved.iter().map(String::as_str).collect::<Vec<_>>()[..],
            ["futures", .., "Stream"]
                | ["futures_core", .., "Stream"]
                | ["core", "stream", "Stream"]
                | ["std", "stream", "Stream"]
        );
    }
    matches!(segments[..], [ref a, ..] if a == "futures" || a == "futures_core")
}

// The `Box` path, `Future` path, other trait-bound paths and `Output` type of
// `Pin<Box<dyn Future<Output = T> + ...>>`, matched by structure alone; callers check provenance.
fn pinned_boxed_future_shape(
    segment: &syn::PathSegment,
) -> Option<(&syn::Path, &syn::Path, Vec<&syn::Path>, &Type)> {
    let PathArguments::AngleBracketed(pin) = &segment.arguments else {
        return None;
    };
    let [GenericArgument::Type(Type::Path(boxed))] = pin.args.iter().collect::<Vec<_>>()[..] else {
        return None;
    };
    if boxed.qself.is_some() {
        return None;
    }
    let PathArguments::AngleBracketed(boxed_arguments) = &boxed.path.segments.last()?.arguments
    else {
        return None;
    };
    let [GenericArgument::Type(Type::TraitObject(object))] =
        boxed_arguments.args.iter().collect::<Vec<_>>()[..]
    else {
        return None;
    };
    let mut future = None;
    let mut auto_traits = Vec::new();
    for bound in &object.bounds {
        match bound {
            syn::TypeParamBound::Trait(trait_bound) => {
                if trait_bound.lifetimes.is_some()
                    || !matches!(trait_bound.modifier, syn::TraitBoundModifier::None)
                {
                    return None;
                }
                match &trait_bound.path.segments.last()?.arguments {
                    PathArguments::None => auto_traits.push(&trait_bound.path),
                    PathArguments::AngleBracketed(arguments) => {
                        let [GenericArgument::AssocType(associated)] =
                            arguments.args.iter().collect::<Vec<_>>()[..]
                        else {
                            return None;
                        };
                        if !matches!(associated.ident.to_string().as_str(), "Output" | "Item")
                            || associated.generics.is_some()
                            || future.is_some()
                        {
                            return None;
                        }
                        future = Some((&trait_bound.path, &associated.ty));
                    }
                    PathArguments::Parenthesized(_) => return None,
                }
            }
            syn::TypeParamBound::Lifetime(_) => {}
            _ => return None,
        }
    }
    let (future, output) = future?;
    return Some((&boxed.path, future, auto_traits, output));
}
