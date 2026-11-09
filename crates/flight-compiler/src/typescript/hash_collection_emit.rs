use std::collections::HashSet;

use syn::{Expr, GenericArgument, PathArguments, Type, UnOp};

use crate::CompileError;

use super::{
    BindingFact, HASH_COLLECTION_FIELD_MARKER, NULLABLE_OPTIONS_MARKER, PROVENANCE_SEPARATOR,
    RETURN_BINDING_FACT_MARKER, TYPE_USE_MARKER, binding_fact_from_marker, binding_fact_marker,
    call_fact, compile_error, emit_expression, emit_type, expression_struct_identity,
    expression_struct_name, lexical_fact, option_inner_type, resolve_type_path,
};
pub(super) fn emit_hash_collection_method(
    call: &syn::ExprMethodCall,
    kind: &BindingFact,
    receiver: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let arguments = call
        .args
        .iter()
        .map(|argument| emit_expression(argument, entities))
        .collect::<Result<Vec<_>, _>>()?;
    let method = call.method.to_string();
    let option = |value: String| {
        return if entities.contains(NULLABLE_OPTIONS_MARKER) {
            format!("({value} ?? null)")
        } else {
            value
        };
    };
    let owner = if matches!(kind, BindingFact::HashMap) {
        "HashMap"
    } else {
        "HashSet"
    };
    return match (owner, method.as_str(), arguments.as_slice()) {
        (_, "clear", []) => Ok(format!("{receiver}.clear()")),
        (_, "is_empty", []) => Ok(format!("({receiver}.size === 0)")),
        (_, "len", []) => Ok(format!("{receiver}.size")),
        ("HashSet", "contains", [value]) => Ok(format!("{receiver}.has({value})")),
        ("HashSet", "insert", [value]) => Ok(format!(
            "(<T>(items: Set<T>, value: T): boolean => {{ if (items.has(value)) {{ return false; }} items.add(value); return true; }})({receiver}, {value})"
        )),
        ("HashSet", "iter", []) | ("HashSet", "into_iter", []) => Ok(format!("[...{receiver}]")),
        ("HashSet", "remove", [value]) => Ok(format!("{receiver}.delete({value})")),
        ("HashMap", "contains_key", [key]) => Ok(format!("{receiver}.has({key})")),
        ("HashMap", "get", [key]) => Ok(option(format!("{receiver}.get({key})"))),
        ("HashMap", "get_mut", [key]) => Ok(option(format!("{receiver}.get({key})"))),
        ("HashMap", "insert", [key, value]) => Ok(option(format!(
            "(<K, V>(entries: Map<K, V>, key: K, value: V): V | undefined => {{ const previous = entries.get(key); entries.set(key, value); return previous; }})({receiver}, {key}, {value})"
        ))),
        ("HashMap", "remove", [key]) => Ok(option(format!(
            "(<K, V>(entries: Map<K, V>, key: K): V | undefined => {{ const previous = entries.get(key); entries.delete(key); return previous; }})({receiver}, {key})"
        ))),
        ("HashMap", "iter", []) | ("HashMap", "into_iter", []) => {
            Ok(format!("[...{receiver}.entries()]"))
        }
        ("HashMap", "into_keys", []) | ("HashMap", "keys", []) => {
            Ok(format!("[...{receiver}.keys()]"))
        }
        ("HashMap", "into_values", []) | ("HashMap", "values", []) => {
            Ok(format!("[...{receiver}.values()]"))
        }
        ("HashSet", "clone", []) => Ok(format!("new Set({receiver})")),
        ("HashSet", "retain", [predicate]) => Ok(format!(
            "(<T>(items: Set<T>, keep: (item: T) => boolean): void => {{ for (const item of items) {{ if (!keep(item)) {{ items.delete(item); }} }} }})({receiver}, {predicate})"
        )),
        ("HashMap", "clone", []) => Ok(format!("new Map({receiver})")),
        ("HashMap", "retain", [predicate]) => Ok(format!(
            "(<K, V>(entries: Map<K, V>, keep: (key: K, value: V) => boolean): void => {{ for (const [key, value] of entries) {{ if (!keep(key, value)) {{ entries.delete(key); }} }} }})({receiver}, {predicate})"
        )),
        _ => Err(compile_error(format!(
            "portable `{owner}::{method}` with {} argument(s) has no portable lowering",
            arguments.len()
        ))),
    };
}

// `HashSet<T>` / `HashMap<K, V>` as `Set<T>` / `Map<K, V>`. JavaScript collections compare object keys
// by identity where Rust compares by value, so elements and keys must lower to primitives.
pub(super) fn emit_hash_collection_type(
    name: &str,
    segment: &syn::PathSegment,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return Err(compile_error(format!(
            "portable `{name}` needs type arguments"
        )));
    };
    let types = arguments
        .args
        .iter()
        .filter_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(rust_type),
            _ => None,
        })
        .collect::<Vec<_>>();
    let expected = if name == "HashMap" { 2 } else { 1 };
    if types.len() != expected {
        return Err(compile_error(format!(
            "portable `{name}` needs {expected} type argument(s)"
        )));
    }
    let key = emit_type(types[0], entities)?;
    if !matches!(key.as_str(), "number" | "string" | "boolean") {
        return Err(compile_error(format!(
            "portable `{name}` requires a number, string or boolean key; JavaScript compares `{key}` keys by identity"
        )));
    }
    if name == "HashMap" {
        if option_inner_type(types[1]).is_some() {
            return Err(compile_error(
                "portable `HashMap` cannot hold `Option` values; `Map.get` reports a missing key and a `None` value alike",
            ));
        }
        return Ok(format!("Map<{key}, {}>", emit_type(types[1], entities)?));
    }
    return Ok(format!("Set<{key}>"));
}

// A proven `HashSet` / `HashMap` receiver: a lexical binding, a struct field, or a call to a function
// declared to return that type.
pub(super) fn expression_hash_collection(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<BindingFact> {
    return match expression {
        Expr::Field(field) => {
            let syn::Member::Named(field_name) = &field.member else {
                return None;
            };
            // A nested owner (`state.runtime.keys`) resolves through declared struct field types.
            let identity = expression_struct_name(&field.base, entities)
                .or_else(|| expression_struct_identity(&field.base, entities))?;
            [BindingFact::HashMap, BindingFact::HashSet]
                .into_iter()
                .find(|kind| {
                    entities.contains(&format!(
                        "{HASH_COLLECTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                        binding_fact_marker(kind)
                    ))
                })
        }
        Expr::Call(call) => {
            let Expr::Path(function) = call.func.as_ref() else {
                return None;
            };
            if function.qself.is_some() {
                return None;
            }
            Some(binding_fact_from_marker(&call_fact(
                entities,
                RETURN_BINDING_FACT_MARKER,
                &function.path,
            )?))
            .filter(|fact| matches!(fact, BindingFact::HashMap | BindingFact::HashSet))
        }
        Expr::Group(group) => expression_hash_collection(&group.expr, entities),
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "clone" | "unwrap" | "expect" | "unwrap_or_default"
                ) =>
        {
            expression_hash_collection(&call.receiver, entities)
        }
        Expr::MethodCall(call)
            if call.args.len() == 1
                && matches!(
                    call.method.to_string().as_str(),
                    "unwrap_or" | "unwrap_or_else"
                ) =>
        {
            expression_hash_collection(&call.receiver, entities)
        }
        Expr::Paren(paren) => expression_hash_collection(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            lexical_fact(entities, &path.path.segments[0].ident.to_string())
                .filter(|fact| matches!(fact, BindingFact::HashMap | BindingFact::HashSet))
        }
        Expr::Reference(reference) => expression_hash_collection(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_hash_collection(&unary.expr, entities)
        }
        _ => None,
    };
}

// `HashSet::new()` / `HashMap::new()`, their `default()`, or `with_capacity(..)` (a hint JavaScript
// collections do not take), with the owner resolving to `std::collections`.
pub(super) fn hash_collection_construction(
    expression: &Expr,
    context: &HashSet<String>,
) -> Option<BindingFact> {
    let Expr::Call(call) = expression else {
        return None;
    };
    let Expr::Path(function) = call.func.as_ref() else {
        return None;
    };
    if function.qself.is_some() || function.path.segments.len() < 2 {
        return None;
    }
    let constructor = function.path.segments.last()?.ident.to_string();
    let arity = match constructor.as_str() {
        "default" | "new" => 0,
        "with_capacity" => 1,
        _ => return None,
    };
    if call.args.len() != arity {
        return None;
    }
    let mut owner = function.path.clone();
    owner.segments.pop();
    owner.segments.pop_punct();
    return hash_collection_path(&owner, context);
}

// The collection a path names when it resolves (see `resolve_type_path`) to `std::collections`'
// `HashMap` / `HashSet`, directly or through `hash_map` / `hash_set`.
pub(super) fn hash_collection_path(
    path: &syn::Path,
    context: &HashSet<String>,
) -> Option<BindingFact> {
    let last = path.segments.last()?;
    let aliased = path
        .segments
        .first()
        .is_some_and(|first| context.contains(&format!("{TYPE_USE_MARKER}{}", first.ident)));
    if last.ident != "HashMap" && last.ident != "HashSet" && !aliased {
        return None;
    }
    let resolved = resolve_type_path(path, context)?;
    return match resolved
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["std", "collections", "HashMap"] | ["std", "collections", "hash_map", "HashMap"] => {
            Some(BindingFact::HashMap)
        }
        ["std", "collections", "HashSet"] | ["std", "collections", "hash_set", "HashSet"] => {
            Some(BindingFact::HashSet)
        }
        _ => None,
    };
}

pub(super) fn hash_collection_type(
    rust_type: &Type,
    context: &HashSet<String>,
) -> Option<BindingFact> {
    return match rust_type {
        Type::Group(group) => hash_collection_type(&group.elem, context),
        Type::Paren(paren) => hash_collection_type(&paren.elem, context),
        Type::Reference(reference) => hash_collection_type(&reference.elem, context),
        Type::Path(path) if path.qself.is_none() => hash_collection_path(&path.path, context),
        _ => None,
    };
}
