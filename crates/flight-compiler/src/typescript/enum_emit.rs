use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fmt::Write;

use syn::visit::Visit;
use syn::{Expr, GenericArgument, ItemFn, Lit, PathArguments, Type};

use crate::{CompileError, compile_error};

use super::{
    DATA_UNION_UNIT_MARKER, DATA_UNION_VARIANT_MARKER, RECORD_MAP_LOCAL_MARKER,
    RECORD_MAP_VARIANT_MARKER, RESERVED_KEY_DATA_UNION_VARIANT_MARKER,
    RESERVED_KEY_DATA_UNION_VARIANT_TYPE_MARKER, RuntimeCategory, StringUnionStyle,
    TAGGED_DATA_UNION_VARIANT_MARKER, emit_documentation, emit_expression, emit_type,
    expression_is_associated_path, is_public, js_string_literal, lower_camel_from_upper_camel,
    named_type, peel_reference_and_paren, referenced_path_identifier, snake_to_lower_camel,
    string_union_literal,
};
pub(super) fn emit_enum(
    out: &mut String,
    rust_enum: &syn::ItemEnum,
    string_union: Option<StringUnionStyle>,
    string_union_values: Option<&BTreeMap<String, String>>,
    numeric_union: Option<&Vec<(String, i64)>>,
    data_union: bool,
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    emit_documentation(out, &rust_enum.attrs, 0);
    let export = if is_public(&rust_enum.vis) {
        "export "
    } else {
        ""
    };
    if let Some(variants) = numeric_union {
        let values = variants
            .iter()
            .map(|(_, value)| value.to_string())
            .collect::<Vec<_>>();
        writeln!(
            out,
            "{export}type {} = {};",
            rust_enum.ident,
            values.join(" | ")
        )
        .expect("writing to a String cannot fail");
        return Ok(());
    }
    if data_union {
        let named = rust_enum
            .variants
            .iter()
            .any(|variant| matches!(variant.fields, syn::Fields::Named(_)));
        let mut seen = HashSet::new();
        let mut variants = Vec::new();
        for variant in &rust_enum.variants {
            let rendered = if named {
                let mut fields = vec![format!(
                    "readonly kind: {}",
                    js_string_literal(&lower_camel_from_upper_camel(&variant.ident.to_string()))
                )];
                if let syn::Fields::Named(named) = &variant.fields {
                    for field in &named.named {
                        let name = snake_to_lower_camel(
                            &field
                                .ident
                                .as_ref()
                                .expect("named data union field has an identifier")
                                .to_string(),
                        );
                        fields.push(format!(
                            "readonly {name}: {}",
                            emit_type(&field.ty, entities)?
                        ));
                    }
                }
                format!("{{ {} }}", fields.join("; "))
            } else {
                match &variant.fields {
                    syn::Fields::Unit => "null".to_string(),
                    syn::Fields::Unnamed(fields) => emit_type(&fields.unnamed[0].ty, entities)?,
                    syn::Fields::Named(_) => {
                        unreachable!("data union representation changed after directive validation")
                    }
                }
            };
            if seen.insert(rendered.clone()) {
                variants.push(rendered);
            }
        }
        let rendered = if variants.iter().any(|variant| variant == "unknown") {
            "unknown".to_string()
        } else {
            variants.join(" | ")
        };
        writeln!(out, "{export}type {} = {rendered};", rust_enum.ident)
            .expect("writing to a String cannot fail");
        return Ok(());
    }
    if let Some(style) = string_union {
        if style == StringUnionStyle::Exact {
            let values = string_union_values
                .expect("exact string-union values were validated before TypeScript emission");
            writeln!(out, "{export}const {} = {{", rust_enum.ident)
                .expect("writing to a String cannot fail");
            for variant in &rust_enum.variants {
                emit_documentation(out, &variant.attrs, 1);
                let value = &values[&variant.ident.to_string()];
                writeln!(out, "  {}: {},", variant.ident, js_string_literal(value))
                    .expect("writing to a String cannot fail");
            }
            writeln!(out, "}} as const;").expect("writing to a String cannot fail");
            writeln!(
                out,
                "{export}type {} = (typeof {})[keyof typeof {}];",
                rust_enum.ident, rust_enum.ident, rust_enum.ident
            )
            .expect("writing to a String cannot fail");
            return Ok(());
        }
        if rust_enum
            .variants
            .iter()
            .any(|variant| variant.discriminant.is_some())
        {
            return Err(compile_error(format!(
                "numeric enum `{}` cannot use `flight-compiler: string-union`",
                rust_enum.ident
            )));
        }
        let variants = rust_enum
            .variants
            .iter()
            .map(|variant| {
                js_string_literal(&string_union_literal(&variant.ident.to_string(), style))
            })
            .collect::<Vec<_>>();
        writeln!(
            out,
            "{export}type {} = {};",
            rust_enum.ident,
            variants.join(" | ")
        )
        .expect("writing to a String cannot fail");
        return Ok(());
    }
    let numeric = rust_enum
        .variants
        .iter()
        .any(|variant| variant.discriminant.is_some());
    writeln!(out, "{export}enum {} {{", rust_enum.ident).expect("writing to a String cannot fail");
    for variant in &rust_enum.variants {
        emit_documentation(out, &variant.attrs, 1);
        if numeric {
            if let Some((_, discriminant)) = &variant.discriminant {
                writeln!(
                    out,
                    "  {} = {},",
                    variant.ident,
                    emit_expression(discriminant, &HashSet::new())?
                )
                .expect("writing to a String cannot fail");
            } else {
                writeln!(out, "  {},", variant.ident).expect("writing to a String cannot fail");
            }
        } else {
            writeln!(
                out,
                "  {} = {},",
                variant.ident,
                js_string_literal(&lower_camel_from_upper_camel(&variant.ident.to_string()))
            )
            .expect("writing to a String cannot fail");
        }
    }
    out.push_str("}\n");
    return Ok(());
}

pub(super) fn path_owner_and_member(path: &syn::Path) -> Option<(String, String)> {
    let mut segments = path.segments.iter().rev();
    let member = segments.next()?.ident.to_string();
    let owner = segments.next()?.ident.to_string();
    return Some((owner, member));
}

pub(super) fn associated_owner_and_member(expression: &Expr) -> Option<(String, String)> {
    let Expr::Path(path) = expression else {
        return None;
    };
    return path_owner_and_member(&path.path);
}

pub(super) fn data_union_variant_categories(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> Option<BTreeSet<RuntimeCategory>> {
    let prefix = format!("{DATA_UNION_VARIANT_MARKER}{owner}:{variant}:");
    let categories = entities
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix))?;
    return categories
        .split(',')
        .map(RuntimeCategory::parse)
        .collect::<Option<BTreeSet<_>>>();
}

pub(super) fn reserved_key_data_union_variant_keys(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> Option<BTreeSet<String>> {
    let prefix = format!("{RESERVED_KEY_DATA_UNION_VARIANT_MARKER}{owner}:{variant}:");
    let keys = entities
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix))?;
    return Some(
        keys.split(',')
            .filter(|key| !key.is_empty())
            .map(str::to_string)
            .collect(),
    );
}

pub(super) fn reserved_key_data_union_variant_type(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> Option<String> {
    let prefix = format!("{RESERVED_KEY_DATA_UNION_VARIANT_TYPE_MARKER}{owner}:{variant}:");
    return entities
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix).map(str::to_string));
}

pub(super) fn reserved_key_data_union_variants(
    entities: &HashSet<String>,
    owner: &str,
) -> BTreeMap<String, BTreeSet<String>> {
    let prefix = format!("{RESERVED_KEY_DATA_UNION_VARIANT_MARKER}{owner}:");
    return entities
        .iter()
        .filter_map(|marker| {
            let remainder = marker.strip_prefix(&prefix)?;
            let (variant, keys) = remainder.split_once(':')?;
            Some((
                variant.to_string(),
                keys.split(',')
                    .filter(|key| !key.is_empty())
                    .map(str::to_string)
                    .collect(),
            ))
        })
        .collect();
}

pub(crate) fn is_transparent_data_union_variant(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> bool {
    return data_union_variant_categories(entities, owner, variant).is_some();
}

pub(super) fn is_tagged_data_union_variant(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> bool {
    return entities.contains(&format!(
        "{TAGGED_DATA_UNION_VARIANT_MARKER}{owner}:{variant}"
    ));
}

pub(super) fn tagged_data_union_variants(
    entities: &HashSet<String>,
    owner: &str,
) -> BTreeSet<String> {
    let prefix = format!("{TAGGED_DATA_UNION_VARIANT_MARKER}{owner}:");
    return entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(&prefix).map(str::to_string))
        .collect();
}

pub(crate) fn is_data_union_variant(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> bool {
    return is_transparent_data_union_variant(entities, owner, variant)
        || is_tagged_data_union_variant(entities, owner, variant);
}

pub(super) fn data_union_expression_variant(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<(String, String, BTreeSet<RuntimeCategory>)> {
    let (owner, variant) = associated_owner_and_member(expression)?;
    let categories = data_union_variant_categories(entities, &owner, &variant)?;
    return Some((owner, variant, categories));
}

// `HashMap<String, V>` as the owner declares it (read syntactically: the owner's own `use` items are
// not in scope where a dependent lowers the union).
pub(super) fn is_string_keyed_hash_map(rust_type: &Type) -> bool {
    let Type::Path(path) = rust_type else {
        return false;
    };
    let Some(segment) = path.path.segments.last() else {
        return false;
    };
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return false;
    };
    return segment.ident == "HashMap"
        && arguments.args.len() == 2
        && matches!(arguments.args.first(), Some(GenericArgument::Type(key)) if named_type(key).as_deref() == Some("String"));
}

pub(super) fn is_record_map_variant(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> bool {
    return entities.contains(&format!("{RECORD_MAP_VARIANT_MARKER}{owner}:{variant}"));
}

pub(super) fn is_record_map_local(expression: &Expr, entities: &HashSet<String>) -> bool {
    return referenced_path_identifier(expression)
        .is_some_and(|name| entities.contains(&format!("{RECORD_MAP_LOCAL_MARKER}{name}")));
}

// Marks the locals of `function` passed directly as a record-map variant payload
// (`LogData::Record(fields)`), so their construction and map operations lower to a plain object.
pub(super) fn insert_record_map_local_context(function: &ItemFn, context: &mut HashSet<String>) {
    struct Collector<'a> {
        context: &'a HashSet<String>,
        locals: BTreeSet<String>,
    }
    impl<'ast> Visit<'ast> for Collector<'_> {
        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            if call.args.len() == 1
                && let Some((owner, variant)) = associated_owner_and_member(&call.func)
                && is_record_map_variant(self.context, &owner, &variant)
                && let Some(name) = referenced_path_identifier(&call.args[0])
            {
                self.locals.insert(name);
            }
            syn::visit::visit_expr_call(self, call);
        }
    }
    let mut collector = Collector {
        context,
        locals: BTreeSet::new(),
    };
    collector.visit_item_fn(function);
    for local in collector.locals {
        context.insert(format!("{RECORD_MAP_LOCAL_MARKER}{local}"));
    }
}

// A record-map payload: an inline `HashMap` construction becomes an object literal, and any other
// value (a record-map local, a parameter) is already a plain object record.
pub(super) fn emit_record_map_payload(
    payload: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if let Some(record) = emit_record_map_construction(payload, entities) {
        return record;
    }
    return emit_expression(payload, entities);
}

// `HashMap::new()` / `HashMap::with_capacity(n)` as `{}` and `HashMap::from([(key, value), ...])` as an
// object literal, keyed by a plain property name when the key is an identifier-shaped string literal.
pub(super) fn emit_record_map_construction(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<Result<String, CompileError>> {
    let Expr::Call(call) = peel_reference_and_paren(expression) else {
        return None;
    };
    if (expression_is_associated_path(&call.func, "HashMap", "new") && call.args.is_empty())
        || (expression_is_associated_path(&call.func, "HashMap", "with_capacity")
            && call.args.len() == 1)
    {
        return Some(Ok("{}".to_string()));
    }
    if !expression_is_associated_path(&call.func, "HashMap", "from") || call.args.len() != 1 {
        return None;
    }
    let Expr::Array(entries) = peel_reference_and_paren(&call.args[0]) else {
        return Some(Err(compile_error(
            "portable record-map `HashMap::from` requires an array literal of `(key, value)` pairs",
        )));
    };
    let mut properties = Vec::new();
    for entry in &entries.elems {
        let Expr::Tuple(pair) = entry else {
            return Some(Err(compile_error(
                "portable record-map `HashMap::from` requires `(key, value)` tuple entries",
            )));
        };
        if pair.elems.len() != 2 {
            return Some(Err(compile_error(
                "portable record-map `HashMap::from` requires `(key, value)` tuple entries",
            )));
        }
        let value = match emit_expression(&pair.elems[1], entities) {
            Ok(value) => value,
            Err(error) => return Some(Err(error)),
        };
        let key = match record_map_literal_key(&pair.elems[0]) {
            Some(key) => key,
            None => match emit_expression(&pair.elems[0], entities) {
                Ok(key) => format!("[{key}]"),
                Err(error) => return Some(Err(error)),
            },
        };
        properties.push(if key == value {
            key
        } else {
            format!("{key}: {value}")
        });
    }
    if properties.is_empty() {
        return Some(Ok("{}".to_string()));
    }
    return Some(Ok(format!("{{ {} }}", properties.join(", "))));
}

// An identifier-shaped string-literal key (`"message"`, `"message".to_string()`,
// `String::from("message")`) as a plain property name.
pub(super) fn record_map_literal_key(key: &Expr) -> Option<String> {
    let literal = match peel_reference_and_paren(key) {
        Expr::Lit(syn::ExprLit {
            lit: Lit::Str(literal),
            ..
        }) => literal.value(),
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "to_string" | "to_owned" | "into"
                ) =>
        {
            return record_map_literal_key(&call.receiver);
        }
        Expr::Call(call)
            if call.args.len() == 1
                && (expression_is_associated_path(&call.func, "String", "from")) =>
        {
            return record_map_literal_key(&call.args[0]);
        }
        _ => return None,
    };
    let mut characters = literal.chars();
    let first = characters.next()?;
    if !(first.is_ascii_alphabetic() || first == '_' || first == '$')
        || !characters.all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '$'
        })
    {
        return Some(js_string_literal(&literal));
    }
    return Some(literal);
}

// `insert`, `get`, `contains_key` and `remove` on a record-map local as plain object operations.
pub(super) fn emit_record_map_method(
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let receiver = emit_expression(&call.receiver, entities)?;
    let arguments = call
        .args
        .iter()
        .map(|argument| emit_expression(argument, entities))
        .collect::<Result<Vec<_>, _>>()?;
    return match (call.method.to_string().as_str(), arguments.as_slice()) {
        ("insert", [key, value]) => Ok(format!("{receiver}[{key}] = {value}")),
        ("get", [key]) => Ok(format!("{receiver}[{key}]")),
        ("contains_key", [key]) => Ok(format!("Object.hasOwn({receiver}, {key})")),
        (method, _) => Err(compile_error(format!(
            "portable record-map `.{method}()` has no plain-object lowering; use `insert`, `get`, `contains_key` or index reads"
        ))),
    };
}

pub(super) fn data_union_unit(entities: &HashSet<String>, owner: &str, variant: &str) -> bool {
    return entities.contains(&format!("{DATA_UNION_UNIT_MARKER}{owner}:{variant}"));
}
