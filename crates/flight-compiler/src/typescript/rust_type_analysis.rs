use std::collections::{BTreeMap, HashSet};

use quote::ToTokens;
use syn::{BinOp, Expr, GenericArgument, ItemStruct, Lit, Pat, PathArguments, Stmt, Type, UnOp};

use crate::CompileError;
use crate::model::Program;

use super::{
    ENTITY_ALLOCATION_INITIALIZED_FIELD_MARKER, ENTITY_ALLOCATION_OMITTED_FIELD_MARKER,
    ENTITY_DEFAULT_FIELD_MARKER, ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER,
    ENUM_DEFAULT_VARIANT_MARKER, compile_error, emit_path_type_arguments, is_public,
    js_string_literal, named_type, resolve_type_path, snake_to_lower_camel, typed_array_for_type,
};
pub(super) fn rust_type_is_string(rust_type: &Type) -> bool {
    return matches!(named_type(rust_type).as_deref(), Some("String" | "str"));
}

pub(super) fn rust_type_is_json_value(rust_type: &Type, context: &HashSet<String>) -> bool {
    let inner = match rust_type {
        Type::Group(group) => return rust_type_is_json_value(&group.elem, context),
        Type::Paren(paren) => return rust_type_is_json_value(&paren.elem, context),
        Type::Reference(reference) => return rust_type_is_json_value(&reference.elem, context),
        Type::Path(path) if path.qself.is_none() => path,
        _ => return false,
    };
    let Some(resolved) = resolve_type_path(&inner.path, context) else {
        return false;
    };
    return matches!(
        resolved
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .as_slice(),
        ["serde_json", "Value"] | ["serde_json", "value", "Value"]
    );
}

pub(super) fn call_turbofish_is_json_value(expression: &Expr, context: &HashSet<String>) -> bool {
    let Expr::Call(call) = expression else {
        return false;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return false;
    };
    let Some(last_segment) = path.path.segments.last() else {
        return false;
    };
    let PathArguments::AngleBracketed(turbofish) = &last_segment.arguments else {
        return false;
    };
    return turbofish.args.iter().any(|arg| {
        matches!(arg, GenericArgument::Type(rust_type) if rust_type_is_json_value(rust_type, context))
    });
}

// `Ref<T>` and the spelling it aliases (`Arc<RwLock<T>>`) both lower to the payload rather than a
// target-language cell. A clone of one of those fields therefore needs a forwarding alias when Rust
// later writes through the cloned cell. Names alone are insufficient: a local `Ref`/`Arc`/`RwLock`
// declaration must not acquire standard-library semantics.
pub(super) fn rust_type_is_erased_shared_cell(rust_type: &Type, context: &HashSet<String>) -> bool {
    let path = match rust_type {
        Type::Group(group) => return rust_type_is_erased_shared_cell(&group.elem, context),
        Type::Paren(paren) => return rust_type_is_erased_shared_cell(&paren.elem, context),
        Type::Path(path) if path.qself.is_none() => path,
        _ => return false,
    };
    let Some(resolved) = resolve_type_path(&path.path, context) else {
        return false;
    };
    let resolved = resolved.iter().map(String::as_str).collect::<Vec<_>>();
    if matches!(
        resolved.as_slice(),
        ["flight_entity", "Ref"] | ["flight_entity", "ir", "Ref"]
    ) {
        return true;
    }
    if !matches!(resolved.as_slice(), ["std" | "alloc", "sync", "Arc"]) {
        return false;
    }
    let Some(segment) = path.path.segments.last() else {
        return false;
    };
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return false;
    };
    let mut types = arguments.args.iter().filter_map(|argument| match argument {
        GenericArgument::Type(rust_type) => Some(rust_type),
        _ => None,
    });
    let Some(Type::Path(inner)) = types.next() else {
        return false;
    };
    if types.next().is_some() || inner.qself.is_some() {
        return false;
    }
    return resolve_type_path(&inner.path, context).is_some_and(|inner| {
        matches!(
            inner
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                .as_slice(),
            ["std", "sync", "RwLock"]
        )
    });
}

pub(super) fn rust_default_expression(rust_type: &Type) -> Option<String> {
    return match rust_type {
        Type::Group(group) => rust_default_expression(&group.elem),
        Type::Paren(paren) => rust_default_expression(&paren.elem),
        Type::Path(path) => {
            let segment = path.path.segments.last()?;
            let name = segment.ident.to_string();
            match name.as_str() {
                "bool" => Some("false".to_string()),
                "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32"
                | "u64" | "usize" => Some("0".to_string()),
                "String" => Some("''".to_string()),
                "Option" => Some("undefined".to_string()),
                "Vec" => Some("[]".to_string()),
                "HashMap" | "BTreeMap" => Some("new Map()".to_string()),
                "HashSet" | "BTreeSet" => Some("new Set()".to_string()),
                "Record" => Some("{}".to_string()),
                "Arc" | "Box" | "Rc" | "Ref" | "RwLock" => {
                    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                        return None;
                    };
                    arguments.args.iter().find_map(|argument| match argument {
                        GenericArgument::Type(rust_type) => rust_default_expression(rust_type),
                        _ => None,
                    })
                }
                "Mutex" => {
                    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                        return None;
                    };
                    let inner = arguments.args.iter().find_map(|argument| match argument {
                        GenericArgument::Type(rust_type) => rust_default_expression(rust_type),
                        _ => None,
                    })?;
                    Some(format!("{{ value: {inner} }}"))
                }
                _ => None,
            }
        }
        Type::Reference(reference) => rust_default_expression(&reference.elem),
        Type::Array(array) => {
            if let Some(typed_array) = typed_array_for_type(&array.elem) {
                let Expr::Lit(lit) = &array.len else {
                    return None;
                };
                let Lit::Int(len) = &lit.lit else {
                    return None;
                };
                Some(format!("new {typed_array}({})", len.base10_digits()))
            } else {
                let element_default = rust_default_expression(&array.elem)?;
                let Expr::Lit(lit) = &array.len else {
                    return None;
                };
                let Lit::Int(len) = &lit.lit else {
                    return None;
                };
                let count: usize = len.base10_digits().parse().ok()?;
                let elements = vec![element_default; count];
                Some(format!("[{}]", elements.join(", ")))
            }
        }
        Type::Tuple(tuple) => tuple
            .elems
            .iter()
            .map(rust_default_expression)
            .collect::<Option<Vec<_>>>()
            .map(|elements| format!("[{}]", elements.join(", "))),
        _ => None,
    };
}

pub(super) fn entity_field_default(
    rust_type: &Type,
    entity_types: &HashSet<String>,
    entities: &HashSet<String>,
) -> Option<String> {
    return match rust_type {
        Type::Path(path) if path.qself.is_none() => {
            let segment = path.path.segments.last()?;
            let name = segment.ident.to_string();
            if entity_types.contains(&name) {
                let ts_type = format!("{name}Raw");
                let arguments = emit_path_type_arguments(segment, entities).ok()?;
                return entity_allocation_of(&ts_type, &format!("{ts_type}{arguments}"), entities)
                    .ok();
            }
            let enum_prefix = format!("{ENUM_DEFAULT_VARIANT_MARKER}{name}:");
            if let Some(variant) = entities
                .iter()
                .find_map(|marker| marker.strip_prefix(&enum_prefix))
            {
                return Some(format!("{name}.{variant}"));
            }
            match name.as_str() {
                "Arc" | "Box" | "Rc" | "Ref" | "RwLock" => {
                    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                        return None;
                    };
                    arguments.args.iter().find_map(|argument| match argument {
                        GenericArgument::Type(inner) => {
                            entity_field_default(inner, entity_types, entities)
                        }
                        _ => None,
                    })
                }
                _ => None,
            }
        }
        Type::Reference(reference) => entity_field_default(&reference.elem, entity_types, entities),
        _ => None,
    };
}

pub(super) fn rust_literal_to_typescript(expression: &Expr) -> Option<String> {
    return match expression {
        Expr::Lit(literal) => match &literal.lit {
            Lit::Int(integer) => Some(integer.base10_digits().to_string()),
            Lit::Float(float) => {
                let value: f64 = float.base10_parse().ok()?;
                if value.fract() == 0.0 {
                    Some(format!("{}", value as i64))
                } else {
                    Some(value.to_string())
                }
            }
            Lit::Bool(flag) => Some(if flag.value { "true" } else { "false" }.to_string()),
            Lit::Str(string) => Some(js_string_literal(&string.value())),
            _ => None,
        },
        Expr::Unary(unary) if matches!(unary.op, syn::UnOp::Neg(_)) => {
            let inner = rust_literal_to_typescript(&unary.expr)?;
            Some(format!("-{inner}"))
        }
        _ => None,
    };
}

pub(super) fn custom_default_field_values(
    impl_item: &syn::ItemImpl,
    structure: &ItemStruct,
) -> Option<BTreeMap<String, String>> {
    let (_, trait_path, _) = impl_item.trait_.as_ref()?;
    let last_segment = trait_path.segments.last()?;
    if last_segment.ident != "Default" {
        return None;
    }
    let self_name = match impl_item.self_ty.as_ref() {
        Type::Path(path) => path.path.segments.last()?.ident.to_string(),
        _ => return None,
    };
    if self_name != structure.ident.to_string() {
        return None;
    }
    let default_fn = impl_item.items.iter().find_map(|item| match item {
        syn::ImplItem::Fn(function) if function.sig.ident == "default" => Some(function),
        _ => None,
    })?;
    let literal = match default_fn.block.stmts.as_slice() {
        [Stmt::Expr(Expr::Return(returned), _)] => {
            if let Some(Expr::Struct(literal)) = returned.expr.as_deref() {
                Some(literal)
            } else {
                None
            }
        }
        [Stmt::Expr(Expr::Struct(literal), None)] => Some(literal),
        _ => None,
    }?;
    let mut overrides = BTreeMap::new();
    for field_value in &literal.fields {
        let syn::Member::Named(member) = &field_value.member else {
            continue;
        };
        let field = structure
            .fields
            .iter()
            .find(|f| f.ident.as_ref() == Some(member))?;
        if !is_public(&field.vis) {
            continue;
        }
        let default = rust_default_expression(&field.ty);
        let actual = rust_literal_to_typescript(&field_value.expr);
        if let (Some(default), Some(actual)) = (&default, &actual) {
            if default != actual {
                let field_name = snake_to_lower_camel(&member.to_string());
                overrides.insert(field_name, actual.clone());
            }
        }
    }
    return Some(overrides);
}

pub(super) fn rust_type_description(rust_type: &Type) -> String {
    return rust_type
        .to_token_stream()
        .to_string()
        .replace(" :: ", "::")
        .replace(" < ", "<")
        .replace(" >", ">")
        .replace(" ; ", "; ");
}

pub(super) fn entity_allocation(
    typescript_type: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return entity_allocation_of(typescript_type, typescript_type, entities);
}

// The `allocate_entity` default for the entity `typescript_type`, allocated as `allocated_type`: the
// same `Raw` record carrying the declared generic arguments of the field it fills
// (`Signal<KeyData>` allocates `SignalRaw<KeyData>`), while default fields resolve by the bare name.
pub(super) fn entity_allocation_of(
    typescript_type: &str,
    allocated_type: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let unsupported_prefix = format!("{ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER}{typescript_type}:");
    let mut unsupported_fields = entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(&unsupported_prefix))
        .filter_map(|field| field.split_once(':'))
        .filter(|(field, _)| {
            !entities.contains(&format!(
                "{ENTITY_ALLOCATION_INITIALIZED_FIELD_MARKER}{typescript_type}:{field}"
            ))
        })
        .collect::<Vec<_>>();
    unsupported_fields.sort();
    if let Some((field, rust_type)) = unsupported_fields.first() {
        return Err(compile_error(format!(
            "cannot lower `allocate_entity` default for `{typescript_type}.{field}`: unsupported Rust field type `{rust_type}`"
        )));
    }

    let prefix = format!("{ENTITY_DEFAULT_FIELD_MARKER}{typescript_type}:");
    let mut fields = entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(&prefix))
        .filter_map(|field| field.split_once(':'))
        .filter(|(field, _)| {
            !entities.contains(&format!(
                "{ENTITY_ALLOCATION_OMITTED_FIELD_MARKER}{typescript_type}:{field}"
            ))
        })
        .map(|(field, value)| format!("{field}: {value}"))
        .collect::<Vec<_>>();
    fields.sort();
    let allocation = format!("allocateEntity<{allocated_type}>()");
    if fields.is_empty() {
        return Ok(allocation);
    }
    return Ok(format!(
        "Object.assign({allocation}, {{ {} }})",
        fields.join(", ")
    ));
}

// Whether a shadow initializer of parameter `name` provably evaluates to the parameter's own
// TypeScript type, so assigning it back to the parameter typechecks: a clone of the parameter,
// numeric arithmetic, casts and numeric methods of a numeric parameter, string-producing methods
// of a string parameter, and an `unwrap_or*` default of an `Option` parameter.
pub(super) fn shadow_preserves_parameter_type(
    name: &str,
    parameter_type: &Type,
    initializer: &Expr,
) -> bool {
    const NUMERIC_TYPES: &[&str] = &[
        "f32", "f64", "i8", "i16", "i32", "i64", "isize", "u8", "u16", "u32", "u64", "usize",
    ];
    const NUMERIC_METHODS: &[&str] = &[
        "abs",
        "ceil",
        "clamp",
        "floor",
        "max",
        "min",
        "rem_euclid",
        "round",
        "saturating_add",
        "saturating_sub",
        "signum",
        "sqrt",
        "trunc",
        "wrapping_add",
        "wrapping_mul",
        "wrapping_sub",
    ];
    const STRING_METHODS: &[&str] = &[
        "to_ascii_lowercase",
        "to_ascii_uppercase",
        "to_lowercase",
        "to_owned",
        "to_string",
        "to_uppercase",
        "trim",
        "trim_end",
        "trim_start",
    ];
    fn strip(expression: &Expr) -> &Expr {
        return match expression {
            Expr::Group(group) => strip(&group.expr),
            Expr::Paren(paren) => strip(&paren.expr),
            Expr::Reference(reference) => strip(&reference.expr),
            expression => expression,
        };
    }
    fn type_name(rust_type: &Type) -> Option<String> {
        return match rust_type {
            Type::Reference(reference) => type_name(&reference.elem),
            Type::Paren(paren) => type_name(&paren.elem),
            Type::Path(path) if path.qself.is_none() => path
                .path
                .segments
                .last()
                .map(|segment| segment.ident.to_string()),
            _ => None,
        };
    }
    let is_parameter = |expression: &Expr| {
        return matches!(strip(expression), Expr::Path(path) if path.qself.is_none() && path.path.is_ident(name));
    };
    let initializer = strip(initializer);
    if let Expr::MethodCall(call) = initializer
        && matches!(call.method.to_string().as_str(), "clone" | "to_owned")
        && call.args.is_empty()
        && is_parameter(&call.receiver)
    {
        return true;
    }
    if let Expr::Call(call) = initializer
        && let Expr::Path(function) = call.func.as_ref()
        && function.path.segments.len() == 2
        && matches!(
            function.path.segments[0].ident.to_string().as_str(),
            "Arc" | "Rc"
        )
        && function.path.segments[1].ident == "clone"
        && call.args.len() == 1
        && is_parameter(&call.args[0])
    {
        return true;
    }
    let Some(parameter_type_name) = type_name(parameter_type) else {
        return false;
    };
    if NUMERIC_TYPES.contains(&parameter_type_name.as_str()) {
        return match initializer {
            Expr::Binary(binary) => matches!(
                binary.op,
                BinOp::Add(_)
                    | BinOp::Sub(_)
                    | BinOp::Mul(_)
                    | BinOp::Div(_)
                    | BinOp::Rem(_)
                    | BinOp::BitAnd(_)
                    | BinOp::BitOr(_)
                    | BinOp::BitXor(_)
                    | BinOp::Shl(_)
                    | BinOp::Shr(_)
            ),
            Expr::Unary(unary) => matches!(unary.op, UnOp::Neg(_)),
            Expr::Cast(cast) => {
                type_name(&cast.ty).is_some_and(|target| NUMERIC_TYPES.contains(&target.as_str()))
            }
            Expr::MethodCall(call) => NUMERIC_METHODS.contains(&call.method.to_string().as_str()),
            _ => false,
        };
    }
    if matches!(parameter_type_name.as_str(), "str" | "String") {
        return matches!(initializer, Expr::MethodCall(call)
            if STRING_METHODS.contains(&call.method.to_string().as_str()));
    }
    if parameter_type_name == "Option" {
        return matches!(initializer, Expr::MethodCall(call)
            if matches!(call.method.to_string().as_str(), "unwrap_or" | "unwrap_or_default" | "unwrap_or_else")
                && is_parameter(&call.receiver));
    }
    return false;
}
