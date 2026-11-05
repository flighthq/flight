use std::collections::HashSet;

use quote::ToTokens;
use syn::{GenericArgument, PathArguments, Type};

use super::{
    PROVENANCE_SEPARATOR, SHARED_IDENTITY_ENTITY_MARKER, SHARED_IDENTITY_EXTERNAL_TYPE_MARKER,
    STRUCT_OWNER_MARKER, TYPE_ALIAS_DEFINITION_MARKER, TYPE_ALIAS_GENERICS_MARKER,
    TYPE_ALIAS_OWNER_MARKER, TYPE_LOCAL_MARKER, context_type_identity, crate_alias_owner,
    resolve_path_owner, resolve_type_path, resolved_type_identity, source_type_context,
    trait_object_is_standard_any, unique_marker_suffix,
};
pub(super) fn shared_identity_type_at_depth(
    entities: &HashSet<String>,
    from: Option<&str>,
    rust_type: &Type,
    depth: usize,
) -> bool {
    if depth > 16 {
        return false;
    }
    let path = match rust_type {
        Type::Group(group) => {
            return shared_identity_type_at_depth(entities, from, &group.elem, depth);
        }
        Type::Paren(paren) => {
            return shared_identity_type_at_depth(entities, from, &paren.elem, depth);
        }
        Type::Reference(reference) => {
            return shared_identity_type_at_depth(entities, from, &reference.elem, depth);
        }
        Type::Array(_) | Type::Slice(_) => return true,
        Type::TraitObject(object) => {
            let any = match from {
                Some(from) => trait_object_is_standard_any(
                    &object.bounds,
                    &source_type_context(entities, from),
                ),
                None => trait_object_is_standard_any(&object.bounds, entities),
            };
            // A trait object of a Flight-defined trait (this crate's or a `flight_*` crate's) is a
            // Flight type behind the trait, which lowers to an object. A standard trait such as
            // `dyn Display` can hold a primitive, so it proves nothing.
            let flight_trait = object.bounds.iter().any(|bound| {
                let syn::TypeParamBound::Trait(bound) = bound else {
                    return false;
                };
                let resolved = match from {
                    Some(from) => {
                        resolve_type_path(&bound.path, &source_type_context(entities, from))
                    }
                    None => resolve_type_path(&bound.path, entities),
                };
                return resolved
                    .and_then(|resolved| resolved.first().cloned())
                    .is_some_and(|root| root == "crate" || root.starts_with("flight_"));
            });
            return any
                || flight_trait
                || object.bounds.iter().any(|bound| {
                    matches!(bound, syn::TypeParamBound::Trait(bound) if bound.path.segments.last().is_some_and(|segment| matches!(segment.ident.to_string().as_str(), "Fn" | "FnMut" | "FnOnce")))
                });
        }
        Type::Path(path) if path.qself.is_none() => &path.path,
        _ => return false,
    };
    let resolved = match from {
        Some(from) => resolve_type_path(path, &source_type_context(entities, from)),
        None => resolve_type_path(path, entities),
    };
    // A prelude name resolves through no `use`; unless the source declares that name itself, it is
    // the standard type.
    let resolved = resolved.or_else(|| {
        let [segment] = path.segments.iter().collect::<Vec<_>>()[..] else {
            return None;
        };
        if path.leading_colon.is_some()
            || entities.contains(&format!("{TYPE_LOCAL_MARKER}{}", segment.ident))
            || from.is_some_and(|from| {
                resolve_path_owner(entities, STRUCT_OWNER_MARKER, from, path).is_some()
                    || resolve_path_owner(entities, TYPE_ALIAS_OWNER_MARKER, from, path).is_some()
            })
        {
            return None;
        }
        return match segment.ident.to_string().as_str() {
            "Option" => Some(vec![
                "std".to_string(),
                "option".to_string(),
                "Option".to_string(),
            ]),
            "Vec" => Some(vec![
                "std".to_string(),
                "vec".to_string(),
                "Vec".to_string(),
            ]),
            _ => None,
        };
    });
    let inner = || -> Option<&Type> {
        let PathArguments::AngleBracketed(arguments) = &path.segments.last()?.arguments else {
            return None;
        };
        return arguments.args.iter().find_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(rust_type),
            _ => None,
        });
    };
    if let Some(resolved) = &resolved {
        let resolved = resolved.iter().map(String::as_str).collect::<Vec<_>>();
        match resolved.as_slice() {
            ["std" | "alloc", "sync", "Arc"]
            | ["std" | "alloc", "rc", "Rc"]
            | ["std", "sync", "RwLock"]
            | ["flight_entity", .., "Ref"] => {
                return inner().is_some_and(|inner| {
                    shared_identity_type_at_depth(entities, from, inner, depth + 1)
                        || context_type_identity(entities, inner).is_some()
                        || from.is_some_and(|from| {
                            resolved_type_identity(entities, from, inner).is_some()
                        })
                });
            }
            [first, .., name] if first.starts_with("flight_") => {
                return entities.contains(&format!(
                    "{SHARED_IDENTITY_EXTERNAL_TYPE_MARKER}{first}::{name}"
                ));
            }
            // Only while reading a dependency source on its own (`external_shared_identity_facts`)
            // are its own crate's identity-bearing types recorded under `crate`.
            ["crate", .., name]
                if entities.contains(&format!(
                    "{SHARED_IDENTITY_EXTERNAL_TYPE_MARKER}crate::{name}"
                )) =>
            {
                return true;
            }
            // An `Option` handle holds its payload's allocation once unwrapped.
            ["std" | "core", "option", "Option"] => {
                return inner().is_some_and(|inner| {
                    shared_identity_type_at_depth(entities, from, inner, depth + 1)
                        || context_type_identity(entities, inner).is_some()
                        || from.is_some_and(|from| {
                            resolved_type_identity(entities, from, inner).is_some()
                        })
                });
            }
            ["std", "sync", "Mutex"]
            | ["std" | "alloc", "vec", "Vec"]
            | [
                "std" | "alloc",
                "collections",
                ..,
                "VecDeque" | "HashMap" | "HashSet" | "BTreeMap" | "BTreeSet",
            ] => {
                return true;
            }
            _ => {}
        }
    }
    // An entity always lowers to an object; a target-native sibling's entity has no source struct to
    // resolve, so its recorded name stands for it unless the path resolves outside the crate family.
    if let Some(segment) = path.segments.last()
        && matches!(segment.arguments, PathArguments::None)
        && (entities.contains(&segment.ident.to_string())
            || entities.contains(&format!("{SHARED_IDENTITY_ENTITY_MARKER}{}", segment.ident)))
        && resolved.as_ref().is_none_or(|resolved| {
            resolved
                .first()
                .is_some_and(|root| root == "crate" || root.starts_with("flight_"))
        })
    {
        return true;
    }
    let Some(from) = from else {
        return false;
    };
    if resolve_path_owner(entities, STRUCT_OWNER_MARKER, from, path).is_some() {
        return true;
    }
    let Some((owner, alias)) = resolve_path_owner(entities, TYPE_ALIAS_OWNER_MARKER, from, path)
        .or_else(|| crate_alias_owner(entities, resolved.as_deref()?))
    else {
        return false;
    };
    let Some(mut definition_str) = unique_marker_suffix(
        entities,
        &format!(
            "{TYPE_ALIAS_DEFINITION_MARKER}{owner}{PROVENANCE_SEPARATOR}{alias}{PROVENANCE_SEPARATOR}"
        ),
    ) else {
        return false;
    };
    if let Some(generics_str) = unique_marker_suffix(
        entities,
        &format!(
            "{TYPE_ALIAS_GENERICS_MARKER}{owner}{PROVENANCE_SEPARATOR}{alias}{PROVENANCE_SEPARATOR}"
        ),
    ) {
        let params: Vec<&str> = generics_str.split(',').collect();
        let type_args: Vec<&Type> = path
            .segments
            .last()
            .and_then(|seg| match &seg.arguments {
                PathArguments::AngleBracketed(args) => Some(
                    args.args
                        .iter()
                        .filter_map(|a| match a {
                            GenericArgument::Type(t) => Some(t),
                            _ => None,
                        })
                        .collect::<Vec<_>>(),
                ),
                _ => None,
            })
            .unwrap_or_default();
        if params.len() == type_args.len() {
            for (param, arg) in params.iter().zip(type_args.iter()) {
                let arg_tokens = arg.to_token_stream().to_string();
                definition_str = substitute_type_param(&definition_str, param, &arg_tokens);
            }
        }
    }
    let Some(definition) = syn::parse_str::<Type>(&definition_str).ok() else {
        return false;
    };
    return shared_identity_type_at_depth(entities, Some(&owner), &definition, depth + 1);
}

pub(super) fn substitute_type_param(definition: &str, param: &str, replacement: &str) -> String {
    let mut result = String::with_capacity(definition.len() + replacement.len());
    let mut chars = definition.char_indices().peekable();
    while let Some((i, ch)) = chars.next() {
        if ch.is_ascii_alphabetic() || ch == '_' {
            let start = i;
            let mut end = i + ch.len_utf8();
            while let Some(&(_, next)) = chars.peek() {
                if next.is_ascii_alphanumeric() || next == '_' {
                    end += next.len_utf8();
                    chars.next();
                } else {
                    break;
                }
            }
            let word = &definition[start..end];
            if word == param {
                result.push_str(replacement);
            } else {
                result.push_str(word);
            }
        } else {
            result.push(ch);
        }
    }
    return result;
}
