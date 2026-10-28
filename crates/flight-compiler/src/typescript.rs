use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fmt::Write;

use quote::ToTokens;
use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::visit::Visit;
use syn::{
    Attribute, BinOp, Expr, FnArg, GenericArgument, ItemFn, ItemStruct, Lit, Pat, PathArguments,
    ReturnType, Stmt, Token, Type, UnOp, Visibility,
};

use crate::model::Program;
use crate::{CompileError, compile_error};

type PreferredAliases = HashMap<String, String>;

const CALLBACK_ARGUMENT_MARKER: &str = "@callback-argument:";
const CLOSURE_PARAMETER_MARKER: &str = "@closure-parameter:";
const DATA_UNION_UNIT_MARKER: &str = "@data-union-unit:";
const DATA_UNION_VARIANT_MARKER: &str = "@data-union-variant:";
const TAGGED_DATA_UNION_VARIANT_MARKER: &str = "@tagged-data-union-variant:";
const ENTITY_DEFAULT_FIELD_MARKER: &str = "@entity-default-field:";
const ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER: &str = "@entity-unsupported-default-field:";
const FIXED_BUFFER_ARGUMENT_MARKER: &str = "@fixed-buffer-argument:";
const FIXED_BUFFER_LOCAL_MARKER: &str = "@fixed-buffer-local:";
const FROZEN_OBJECT_MARKER: &str = "@frozen-object:";
const IDENTITY_ALIAS_MARKER: &str = "@identity-alias:";
const NULLABLE_CALL_MARKER: &str = "@nullable-call:";
const RECORD_CLONE_ARGUMENT_MARKER: &str = "@record-clone-argument:";
const RECORD_CLONE_LOCAL_MARKER: &str = "@record-clone-local:";
const RECORD_CLONE_TYPE_MARKER: &str = "@record-clone-type:";
const RECORD_VEC_FIELD_MARKER: &str = "@record-vec-field:";
const RETURN_TYPE_MARKER: &str = "@return-type:";
const RETURNS_U32_MARKER: &str = "@returns-u32";
const STRING_EXPRESSION_MARKER: &str = "@string-expression:";
const STRING_RETURN_MARKER: &str = "@string-return:";
const VEC_CLONE_ARGUMENT_MARKER: &str = "@vec-clone-argument:";
const VEC_CLONE_EXPRESSION_MARKER: &str = "@vec-clone-expression:";
const UNSIGNED_INTEGER_LOCAL_MARKER: &str = "@unsigned-integer-local:";

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum RuntimeCategory {
    Null,
    Boolean,
    Number,
    String,
    Array,
    Record,
    Function,
    Object,
}

impl RuntimeCategory {
    fn name(self) -> &'static str {
        return match self {
            Self::Null => "null",
            Self::Boolean => "boolean",
            Self::Number => "number",
            Self::String => "string",
            Self::Array => "array",
            Self::Record => "record",
            Self::Function => "function",
            Self::Object => "object",
        };
    }

    fn parse(name: &str) -> Option<Self> {
        return match name {
            "null" => Some(Self::Null),
            "boolean" => Some(Self::Boolean),
            "number" => Some(Self::Number),
            "string" => Some(Self::String),
            "array" => Some(Self::Array),
            "record" => Some(Self::Record),
            "function" => Some(Self::Function),
            "object" => Some(Self::Object),
            _ => None,
        };
    }
}

fn argument_is_option(argument: &FnArg) -> bool {
    let FnArg::Typed(argument) = argument else {
        return false;
    };
    return option_inner_type(&argument.ty).is_some();
}

fn argument_is_nullable_guard(function: &ItemFn, argument: &FnArg) -> bool {
    let name = function.sig.ident.to_string();
    let FnArg::Typed(argument) = argument else {
        return false;
    };
    let Pat::Ident(pattern) = argument.pat.as_ref() else {
        return false;
    };
    return name.starts_with("set_")
        && name.ends_with("_guard")
        && pattern.ident == "guard"
        && option_inner_type(&argument.ty).is_some();
}

fn array_type(inner: String) -> String {
    if inner.starts_with("readonly [") {
        return format!("Array<{inner}>");
    }
    return format!("{inner}[]");
}

fn nullable_type(inner: String) -> String {
    if inner.contains("=>") {
        return format!("({inner}) | null");
    }
    return format!("{inner} | null");
}

fn callable_parameter_types(
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Result<Option<Vec<String>>, CompileError> {
    return match rust_type {
        Type::Paren(paren) => callable_parameter_types(&paren.elem, entities),
        Type::Reference(reference) => callable_parameter_types(&reference.elem, entities),
        Type::Path(path) => {
            let Some(segment) = path.path.segments.last() else {
                return Ok(None);
            };
            if !matches!(segment.ident.to_string().as_str(), "Arc" | "Box" | "Ref") {
                return Ok(None);
            }
            let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                return Ok(None);
            };
            let Some(inner) = arguments.args.iter().find_map(|argument| match argument {
                GenericArgument::Type(rust_type) => Some(rust_type),
                _ => None,
            }) else {
                return Ok(None);
            };
            callable_parameter_types(inner, entities)
        }
        Type::TraitObject(object) => {
            for bound in &object.bounds {
                let syn::TypeParamBound::Trait(bound) = bound else {
                    continue;
                };
                let Some(segment) = bound.path.segments.last() else {
                    continue;
                };
                if !matches!(
                    segment.ident.to_string().as_str(),
                    "Fn" | "FnMut" | "FnOnce"
                ) {
                    continue;
                }
                let PathArguments::Parenthesized(arguments) = &segment.arguments else {
                    return Ok(None);
                };
                return arguments
                    .inputs
                    .iter()
                    .map(|rust_type| emit_type(rust_type, entities))
                    .collect::<Result<Vec<_>, _>>()
                    .map(Some);
            }
            Ok(None)
        }
        _ => Ok(None),
    };
}

fn closure_parameter_types(entities: &HashSet<String>, local: &str) -> Vec<String> {
    let prefix = format!("{CLOSURE_PARAMETER_MARKER}{local}:");
    let mut parameters = entities
        .iter()
        .filter_map(|marker| {
            let suffix = marker.strip_prefix(&prefix)?;
            let (index, typescript_type) = suffix.split_once(':')?;
            Some((index.parse::<usize>().ok()?, typescript_type.to_string()))
        })
        .collect::<Vec<_>>();
    parameters.sort_by_key(|(index, _)| *index);
    return parameters
        .into_iter()
        .map(|(_, typescript_type)| typescript_type)
        .collect();
}

fn fixed_buffer_type(rust_type: &Type) -> Option<&'static str> {
    return match rust_type {
        Type::Paren(paren) => fixed_buffer_type(&paren.elem),
        Type::Reference(reference) if reference.mutability.is_some() => {
            fixed_buffer_value_type(&reference.elem)
        }
        _ => None,
    };
}

fn fixed_buffer_value_type(rust_type: &Type) -> Option<&'static str> {
    return match rust_type {
        Type::Array(array) => typed_array_for_type(&array.elem),
        Type::Paren(paren) => fixed_buffer_value_type(&paren.elem),
        Type::Path(path) => match path.path.segments.last()?.ident.to_string().as_str() {
            "Float32Array" => Some("Float32Array"),
            "Float64Array" => Some("Float64Array"),
            "Int8Array" => Some("Int8Array"),
            "Int16Array" => Some("Int16Array"),
            "Int32Array" => Some("Int32Array"),
            "Uint8Array" => Some("Uint8Array"),
            "Uint16Array" => Some("Uint16Array"),
            "Uint32Array" => Some("Uint32Array"),
            _ => None,
        },
        Type::Slice(slice) => typed_array_for_type(&slice.elem),
        _ => None,
    };
}

fn inferred_fixed_buffer_type(entities: &HashSet<String>, local: &str) -> Option<String> {
    let prefix = format!("{FIXED_BUFFER_LOCAL_MARKER}{local}:");
    return entities
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix).map(str::to_string));
}

fn expression_is_known_string(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::Call(call) => match call.func.as_ref() {
            Expr::Path(path) => {
                let mut segments = path.path.segments.iter().rev();
                let Some(function) = segments.next() else {
                    return false;
                };
                entities.contains(&format!("{STRING_RETURN_MARKER}{}", function.ident))
                    || (function.ident == "new"
                        && segments.next().is_some_and(|owner| owner.ident == "String"))
            }
            _ => false,
        },
        Expr::Group(group) => expression_is_known_string(&group.expr, entities),
        Expr::Lit(literal) => matches!(&literal.lit, Lit::Str(_)),
        Expr::Macro(expression) => expression
            .mac
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "format"),
        Expr::MethodCall(call) => {
            call.method == "to_string"
                || (call.method == "clone" && expression_is_known_string(&call.receiver, entities))
        }
        Expr::Paren(paren) => expression_is_known_string(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments.first().is_some_and(|segment| {
                entities.contains(&format!("{STRING_EXPRESSION_MARKER}{}", segment.ident))
            })
        }
        Expr::Reference(reference) => expression_is_known_string(&reference.expr, entities),
        _ => false,
    };
}

fn rust_type_is_string(rust_type: &Type) -> bool {
    return matches!(named_type(rust_type).as_deref(), Some("String" | "str"));
}

fn rust_default_expression(rust_type: &Type) -> Option<String> {
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
                "String" => Some(r#""""#.to_string()),
                "Option" => Some("undefined".to_string()),
                "Vec" => Some("[]".to_string()),
                "Arc" | "Ref" => {
                    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                        return None;
                    };
                    arguments.args.iter().find_map(|argument| match argument {
                        GenericArgument::Type(rust_type) => rust_default_expression(rust_type),
                        _ => None,
                    })
                }
                _ => None,
            }
        }
        Type::Reference(reference) => rust_default_expression(&reference.elem),
        Type::Tuple(tuple) => tuple
            .elems
            .iter()
            .map(rust_default_expression)
            .collect::<Option<Vec<_>>>()
            .map(|elements| format!("[{}]", elements.join(", "))),
        _ => None,
    };
}

fn rust_type_description(rust_type: &Type) -> String {
    return rust_type
        .to_token_stream()
        .to_string()
        .replace(" :: ", "::")
        .replace(" < ", "<")
        .replace(" >", ">")
        .replace(" ; ", "; ");
}

fn entity_allocation(
    typescript_type: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let unsupported_prefix = format!("{ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER}{typescript_type}:");
    let mut unsupported_fields = entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(&unsupported_prefix))
        .filter_map(|field| field.split_once(':'))
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
        .map(|(field, value)| format!("{field}: {value}"))
        .collect::<Vec<_>>();
    fields.sort();
    let allocation = format!("allocateEntity<{typescript_type}>()");
    if fields.is_empty() {
        return Ok(allocation);
    }
    return Ok(format!(
        "Object.assign({allocation}, {{ {} }})",
        fields.join(", ")
    ));
}

fn vec_clone_optional(rust_type: &Type) -> Option<bool> {
    if let Some(inner) = option_inner_type(rust_type) {
        return (named_type(inner).as_deref() == Some("Vec")).then_some(true);
    }
    return (named_type(rust_type).as_deref() == Some("Vec")).then_some(false);
}

fn transparent_data_union(rust_enum: &syn::ItemEnum) -> bool {
    return !rust_enum
        .variants
        .iter()
        .any(|variant| matches!(variant.fields, syn::Fields::Named(_)));
}

fn runtime_categories_for_type(
    rust_type: &Type,
    programs: &[&Program],
    resolving: &mut BTreeSet<String>,
) -> Result<BTreeSet<RuntimeCategory>, CompileError> {
    return match rust_type {
        Type::Group(group) => runtime_categories_for_type(&group.elem, programs, resolving),
        Type::Paren(paren) => runtime_categories_for_type(&paren.elem, programs, resolving),
        Type::Reference(reference) => {
            runtime_categories_for_type(&reference.elem, programs, resolving)
        }
        Type::BareFn(_) => Ok(BTreeSet::from([RuntimeCategory::Function])),
        Type::TraitObject(object)
            if object.bounds.iter().any(|bound| {
                let syn::TypeParamBound::Trait(bound) = bound else {
                    return false;
                };
                return bound.path.segments.last().is_some_and(|segment| {
                    matches!(
                        segment.ident.to_string().as_str(),
                        "Fn" | "FnMut" | "FnOnce"
                    )
                });
            }) =>
        {
            Ok(BTreeSet::from([RuntimeCategory::Function]))
        }
        Type::Path(path) => {
            let Some(segment) = path.path.segments.last() else {
                return Err(compile_error("empty Rust type path"));
            };
            let name = segment.ident.to_string();
            match name.as_str() {
                "bool" => Ok(BTreeSet::from([RuntimeCategory::Boolean])),
                "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32"
                | "u64" | "usize" => Ok(BTreeSet::from([RuntimeCategory::Number])),
                "String" | "str" => Ok(BTreeSet::from([RuntimeCategory::String])),
                "Vec" => Ok(BTreeSet::from([RuntimeCategory::Array])),
                "HashMap" => Ok(BTreeSet::from([RuntimeCategory::Record])),
                "UnknownValue" => Ok(BTreeSet::from([RuntimeCategory::Object])),
                "Arc" | "Box" | "Ref" => {
                    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                        return Err(compile_error(format!(
                            "`{name}` data union payload needs one type argument"
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
                    if types.len() != 1 {
                        return Err(compile_error(format!(
                            "`{name}` data union payload needs exactly one type argument"
                        )));
                    }
                    runtime_categories_for_type(types[0], programs, resolving)
                }
                _ => {
                    if !resolving.insert(name.clone()) {
                        return Err(compile_error(format!(
                            "data union runtime category contains a recursive alias through `{name}`"
                        )));
                    }
                    let result = if let Some(rust_enum) = programs.iter().find_map(|program| {
                        program
                            .data_unions
                            .contains(&name)
                            .then(|| {
                                program
                                    .enums
                                    .iter()
                                    .find(|rust_enum| rust_enum.ident == name)
                            })
                            .flatten()
                    }) {
                        if !transparent_data_union(rust_enum) {
                            Err(compile_error(format!(
                                "tagged data union `{name}` cannot be erased as a transparent payload"
                            )))
                        } else {
                            let mut categories = BTreeSet::new();
                            for variant in &rust_enum.variants {
                                match &variant.fields {
                                    syn::Fields::Unit => {
                                        categories.insert(RuntimeCategory::Null);
                                    }
                                    syn::Fields::Unnamed(fields) => {
                                        categories.extend(runtime_categories_for_type(
                                            &fields.unnamed[0].ty,
                                            programs,
                                            resolving,
                                        )?);
                                    }
                                    syn::Fields::Named(_) => unreachable!(
                                        "transparent data union changed after directive validation"
                                    ),
                                }
                            }
                            Ok(categories)
                        }
                    } else if let Some(type_alias) = programs.iter().find_map(|program| {
                        program
                            .type_aliases
                            .iter()
                            .find(|type_alias| type_alias.ident == name)
                    }) {
                        runtime_categories_for_type(&type_alias.ty, programs, resolving)
                    } else if programs.iter().any(|program| {
                        program
                            .structs
                            .iter()
                            .any(|structure| structure.ident == name)
                    }) {
                        Ok(BTreeSet::from([RuntimeCategory::Record]))
                    } else {
                        Err(compile_error(format!(
                            "cannot determine the TypeScript runtime category of data union payload type `{name}`"
                        )))
                    };
                    resolving.remove(&name);
                    result
                }
            }
        }
        _ => Err(compile_error(format!(
            "cannot determine the TypeScript runtime category of data union payload `{}`",
            rust_type_description(rust_type)
        ))),
    };
}

fn data_union_variant_marker(
    owner: &str,
    variant: &str,
    categories: &BTreeSet<RuntimeCategory>,
) -> String {
    return format!(
        "{DATA_UNION_VARIANT_MARKER}{owner}:{variant}:{}",
        categories
            .iter()
            .map(|category| category.name())
            .collect::<Vec<_>>()
            .join(",")
    );
}

fn insert_data_union_context(
    context: &mut HashSet<String>,
    programs: &[&Program],
) -> Result<(), CompileError> {
    for program in programs {
        for rust_enum in &program.enums {
            let owner = rust_enum.ident.to_string();
            if !program.data_unions.contains(&owner) {
                continue;
            }
            if !transparent_data_union(rust_enum) {
                for variant in &rust_enum.variants {
                    let variant_name = variant.ident.to_string();
                    context.insert(format!(
                        "{TAGGED_DATA_UNION_VARIANT_MARKER}{owner}:{variant_name}"
                    ));
                    if matches!(variant.fields, syn::Fields::Unit) {
                        context.insert(format!("{DATA_UNION_UNIT_MARKER}{owner}:{variant_name}"));
                    }
                }
                continue;
            }
            for variant in &rust_enum.variants {
                let categories = match &variant.fields {
                    syn::Fields::Unit => BTreeSet::from([RuntimeCategory::Null]),
                    syn::Fields::Unnamed(fields) => runtime_categories_for_type(
                        &fields.unnamed[0].ty,
                        programs,
                        &mut BTreeSet::new(),
                    )?,
                    syn::Fields::Named(_) => {
                        unreachable!("transparent data union changed after directive validation")
                    }
                };
                let variant_name = variant.ident.to_string();
                context.insert(data_union_variant_marker(
                    &owner,
                    &variant_name,
                    &categories,
                ));
                if matches!(variant.fields, syn::Fields::Unit) {
                    context.insert(format!("{DATA_UNION_UNIT_MARKER}{owner}:{variant_name}"));
                }
            }
        }
    }
    return Ok(());
}

// flight-lint: allow(hashmap-iteration) frozen-object validation guarantees one target name per Rust constant
pub(crate) fn frozen_object_name<'a>(
    context: &'a HashSet<String>,
    rust_name: &str,
) -> Option<&'a str> {
    let prefix = format!("{FROZEN_OBJECT_MARKER}{rust_name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

fn frozen_object_expression_name<'a>(
    expression: &Expr,
    context: &'a HashSet<String>,
) -> Option<&'a str> {
    return match expression {
        Expr::Group(group) => frozen_object_expression_name(&group.expr, context),
        Expr::Paren(paren) => frozen_object_expression_name(&paren.expr, context),
        Expr::Path(path)
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1 =>
        {
            frozen_object_name(context, &path.path.segments[0].ident.to_string())
        }
        _ => None,
    };
}

pub(crate) fn generation_context(programs: &[&Program]) -> Result<HashSet<String>, CompileError> {
    return generation_context_with_types(programs, &HashSet::new());
}

fn generation_context_with_types(
    programs: &[&Program],
    type_context: &HashSet<String>,
) -> Result<HashSet<String>, CompileError> {
    let mut context = type_context.clone();
    insert_data_union_context(&mut context, programs)?;
    let entity_types = programs
        .iter()
        .flat_map(|program| &program.entities)
        .cloned()
        .collect::<HashSet<_>>();
    let mut callable_type_context = type_context.clone();
    callable_type_context.extend(entity_types.iter().cloned());
    let record_types = programs
        .iter()
        .flat_map(|program| {
            program
                .structs
                .iter()
                .filter(|structure| !program.entities.contains(&structure.ident.to_string()))
                .map(|structure| structure.ident.to_string())
        })
        .collect::<HashSet<_>>();
    let record_vec_fields = programs
        .iter()
        .flat_map(|program| &program.structs)
        .filter(|structure| record_types.contains(&structure.ident.to_string()))
        .map(|structure| {
            let fields = structure
                .fields
                .iter()
                .filter(|field| is_public(&field.vis))
                .filter_map(|field| {
                    let optional = vec_clone_optional(&field.ty)?;
                    let name = snake_to_lower_camel(&field.ident.as_ref()?.to_string());
                    Some((name, optional))
                })
                .collect::<Vec<_>>();
            (structure.ident.to_string(), fields)
        })
        .collect::<HashMap<_, _>>();
    for program in programs {
        context.extend(program.entities.iter().cloned());
        context.extend(
            program
                .frozen_objects
                .iter()
                .map(|(rust_name, typescript_name)| {
                    format!("{FROZEN_OBJECT_MARKER}{rust_name}:{typescript_name}")
                }),
        );
        for structure in &program.structs {
            let entity = structure.ident.to_string();
            if !entity_types.contains(&entity) {
                continue;
            }
            let typescript_type = format!("{entity}Raw");
            for field in &structure.fields {
                if !is_public(&field.vis) {
                    continue;
                }
                let Some(field_name) = &field.ident else {
                    continue;
                };
                let field_name = snake_to_lower_camel(&field_name.to_string());
                let Some(value) = rust_default_expression(&field.ty) else {
                    context.insert(format!(
                        "{ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER}{typescript_type}:{field_name}:{}",
                        rust_type_description(&field.ty)
                    ));
                    continue;
                };
                context.insert(format!(
                    "{ENTITY_DEFAULT_FIELD_MARKER}{typescript_type}:{field_name}:{value}"
                ));
            }
        }
        for (record, fields) in &record_vec_fields {
            context.insert(format!("{RECORD_CLONE_TYPE_MARKER}{record}"));
            for (field, optional) in fields {
                context.insert(format!(
                    "{RECORD_VEC_FIELD_MARKER}{record}:{field}:{optional}"
                ));
            }
        }
        for function in &program.functions {
            let function_name = function.sig.ident.to_string();
            if matches!(&function.sig.output, ReturnType::Type(_, rust_type) if rust_type_is_string(rust_type))
            {
                context.insert(format!("{STRING_RETURN_MARKER}{function_name}"));
            }
            for (argument_index, argument) in function.sig.inputs.iter().enumerate() {
                if argument_is_nullable_guard(function, argument) {
                    context.insert(format!(
                        "{NULLABLE_CALL_MARKER}{function_name}:{argument_index}"
                    ));
                }
                let FnArg::Typed(argument) = argument else {
                    continue;
                };
                if let Pat::Ident(pattern) = argument.pat.as_ref() {
                    let local = snake_to_lower_camel(&pattern.ident.to_string());
                    if let Some(record) = named_type(&argument.ty)
                        && record_types.contains(&record)
                    {
                        context.insert(format!(
                            "{RECORD_CLONE_ARGUMENT_MARKER}{function_name}:{}",
                            pattern.ident
                        ));
                        if let Some(fields) = record_vec_fields.get(&record) {
                            for (field, optional) in fields {
                                context.insert(format!(
                                    "{VEC_CLONE_ARGUMENT_MARKER}{function_name}:{local}.{field}:{optional}"
                                ));
                            }
                        }
                    }
                    if let Some(optional) = vec_clone_optional(&argument.ty) {
                        context.insert(format!(
                            "{VEC_CLONE_ARGUMENT_MARKER}{function_name}:{local}:{optional}"
                        ));
                    }
                }
                if let Some(typescript_type) = fixed_buffer_type(&argument.ty) {
                    context.insert(format!(
                        "{FIXED_BUFFER_ARGUMENT_MARKER}{function_name}:{argument_index}:{typescript_type}"
                    ));
                }
                let Some(parameters) =
                    callable_parameter_types(&argument.ty, &callable_type_context)?
                else {
                    continue;
                };
                for (parameter_index, typescript_type) in parameters.iter().enumerate() {
                    context.insert(format!(
                        "{CALLBACK_ARGUMENT_MARKER}{function_name}:{argument_index}:{parameter_index}:{typescript_type}"
                    ));
                }
            }
        }
    }
    return Ok(context);
}

pub(crate) fn function_expression_context(
    function: &ItemFn,
    base: &HashSet<String>,
) -> HashSet<String> {
    struct CallbackUseCollector<'a> {
        context: &'a mut HashSet<String>,
    }

    impl<'ast> syn::visit::Visit<'ast> for CallbackUseCollector<'_> {
        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            if let Expr::Path(path) = call.func.as_ref()
                && let Some(function) = path.path.segments.last()
            {
                let function = function.ident.to_string();
                for (argument_index, argument) in call.args.iter().enumerate() {
                    let Some(local) = referenced_identifier(argument) else {
                        continue;
                    };
                    let prefix = format!("{CALLBACK_ARGUMENT_MARKER}{function}:{argument_index}:");
                    let markers = self
                        .context
                        .iter()
                        .filter_map(|marker| marker.strip_prefix(&prefix))
                        .map(|suffix| format!("{CLOSURE_PARAMETER_MARKER}{local}:{suffix}"))
                        .collect::<Vec<_>>();
                    self.context.extend(markers);
                    let prefix =
                        format!("{FIXED_BUFFER_ARGUMENT_MARKER}{function}:{argument_index}:");
                    let markers = self
                        .context
                        .iter()
                        .filter_map(|marker| marker.strip_prefix(&prefix))
                        .map(|typescript_type| {
                            format!("{FIXED_BUFFER_LOCAL_MARKER}{local}:{typescript_type}")
                        })
                        .collect::<Vec<_>>();
                    self.context.extend(markers);
                }
            }
            syn::visit::visit_expr_call(self, call);
        }

        fn visit_local(&mut self, local: &'ast syn::Local) {
            if let Pat::Type(typed) = &local.pat
                && let Pat::Ident(pattern) = typed.pat.as_ref()
            {
                let local = snake_to_lower_camel(&pattern.ident.to_string());
                if type_is_unsigned_integer(&typed.ty) {
                    self.context
                        .insert(format!("{UNSIGNED_INTEGER_LOCAL_MARKER}{}", pattern.ident));
                }
                if let Some(optional) = vec_clone_optional(&typed.ty) {
                    self.context
                        .insert(format!("{VEC_CLONE_EXPRESSION_MARKER}{local}:{optional}"));
                }
                if rust_type_is_string(&typed.ty) {
                    self.context
                        .insert(format!("{STRING_EXPRESSION_MARKER}{}", pattern.ident));
                }
                if let Some(record) = named_type(&typed.ty)
                    && self
                        .context
                        .contains(&format!("{RECORD_CLONE_TYPE_MARKER}{record}"))
                {
                    self.context
                        .insert(format!("{RECORD_CLONE_LOCAL_MARKER}{}", pattern.ident));
                    let prefix = format!("{RECORD_VEC_FIELD_MARKER}{record}:");
                    let fields = self
                        .context
                        .iter()
                        .filter_map(|marker| marker.strip_prefix(&prefix))
                        .map(|field| format!("{VEC_CLONE_EXPRESSION_MARKER}{local}.{field}"))
                        .collect::<Vec<_>>();
                    self.context.extend(fields);
                }
            }
            if let Some(initializer) = &local.init
                && expression_is_known_string(&initializer.expr, self.context)
                && let Some(name) = local_pattern_name(&local.pat)
            {
                self.context
                    .insert(format!("{STRING_EXPRESSION_MARKER}{name}"));
            }
            syn::visit::visit_local(self, local);
        }
    }

    fn referenced_identifier(expression: &Expr) -> Option<String> {
        return match expression {
            Expr::Group(group) => referenced_identifier(&group.expr),
            Expr::Paren(paren) => referenced_identifier(&paren.expr),
            Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => path
                .path
                .segments
                .first()
                .map(|segment| segment.ident.to_string()),
            Expr::Reference(reference) => referenced_identifier(&reference.expr),
            _ => None,
        };
    }

    let mut context = base.clone();
    let function_name = function.sig.ident.to_string();
    let vec_prefix = format!("{VEC_CLONE_ARGUMENT_MARKER}{function_name}:");
    let vec_markers = context
        .iter()
        .filter_map(|marker| marker.strip_prefix(&vec_prefix))
        .map(|suffix| format!("{VEC_CLONE_EXPRESSION_MARKER}{suffix}"))
        .collect::<Vec<_>>();
    context.extend(vec_markers);
    for argument in &function.sig.inputs {
        let FnArg::Typed(argument) = argument else {
            continue;
        };
        let Pat::Ident(pattern) = argument.pat.as_ref() else {
            continue;
        };
        if context.contains(&format!(
            "{RECORD_CLONE_ARGUMENT_MARKER}{function_name}:{}",
            pattern.ident
        )) {
            context.insert(format!("{RECORD_CLONE_LOCAL_MARKER}{}", pattern.ident));
        }
        if type_is_unsigned_integer(&argument.ty) {
            context.insert(format!("{UNSIGNED_INTEGER_LOCAL_MARKER}{}", pattern.ident));
        }
        if rust_type_is_string(&argument.ty) {
            context.insert(format!("{STRING_EXPRESSION_MARKER}{}", pattern.ident));
        }
    }
    syn::visit::Visit::visit_block(
        &mut CallbackUseCollector {
            context: &mut context,
        },
        &function.block,
    );
    return context;
}

fn documentation(attributes: &[Attribute]) -> Vec<String> {
    return attributes
        .iter()
        .filter(|attribute| attribute.path().is_ident("doc"))
        .filter_map(|attribute| {
            let syn::Meta::NameValue(meta) = &attribute.meta else {
                return None;
            };
            let Expr::Lit(value) = &meta.value else {
                return None;
            };
            let Lit::Str(value) = &value.lit else {
                return None;
            };
            Some(rewrite_documentation(value.value().trim_start()))
        })
        .collect();
}

fn emit_binary_operator(operator: &BinOp) -> Result<&'static str, CompileError> {
    return match operator {
        BinOp::Add(_) => Ok("+"),
        BinOp::AddAssign(_) => Ok("+="),
        BinOp::And(_) => Ok("&&"),
        BinOp::BitAnd(_) => Ok("&"),
        BinOp::BitAndAssign(_) => Ok("&="),
        BinOp::BitOr(_) => Ok("|"),
        BinOp::BitOrAssign(_) => Ok("|="),
        BinOp::BitXor(_) => Ok("^"),
        BinOp::BitXorAssign(_) => Ok("^="),
        BinOp::Div(_) => Ok("/"),
        BinOp::DivAssign(_) => Ok("/="),
        BinOp::Eq(_) => Ok("==="),
        BinOp::Ge(_) => Ok(">="),
        BinOp::Gt(_) => Ok(">"),
        BinOp::Le(_) => Ok("<="),
        BinOp::Lt(_) => Ok("<"),
        BinOp::Mul(_) => Ok("*"),
        BinOp::MulAssign(_) => Ok("*="),
        BinOp::Ne(_) => Ok("!=="),
        BinOp::Or(_) => Ok("||"),
        BinOp::Rem(_) => Ok("%"),
        BinOp::RemAssign(_) => Ok("%="),
        BinOp::Shl(_) => Ok("<<"),
        BinOp::ShlAssign(_) => Ok("<<="),
        BinOp::Shr(_) => Ok(">>"),
        BinOp::ShrAssign(_) => Ok(">>="),
        BinOp::Sub(_) => Ok("-"),
        BinOp::SubAssign(_) => Ok("-="),
        _ => Err(compile_error("unsupported Rust binary operator")),
    };
}

fn binary_precedence(operator: &BinOp) -> u8 {
    return match operator {
        BinOp::Add(_) | BinOp::Sub(_) => 11,
        BinOp::And(_) => 4,
        BinOp::BitAnd(_) => 7,
        BinOp::BitOr(_) => 5,
        BinOp::BitXor(_) => 6,
        BinOp::Div(_) | BinOp::Mul(_) | BinOp::Rem(_) => 12,
        BinOp::Eq(_) | BinOp::Ne(_) => 8,
        BinOp::Ge(_) | BinOp::Gt(_) | BinOp::Le(_) | BinOp::Lt(_) => 9,
        BinOp::Or(_) => 3,
        BinOp::Shl(_) | BinOp::Shr(_) => 10,
        BinOp::AddAssign(_)
        | BinOp::BitAndAssign(_)
        | BinOp::BitOrAssign(_)
        | BinOp::BitXorAssign(_)
        | BinOp::DivAssign(_)
        | BinOp::MulAssign(_)
        | BinOp::RemAssign(_)
        | BinOp::ShlAssign(_)
        | BinOp::ShrAssign(_)
        | BinOp::SubAssign(_) => 1,
        _ => 0,
    };
}

fn expression_precedence(expression: &Expr) -> u8 {
    return match expression {
        Expr::Assign(_) => 1,
        Expr::Binary(binary) => binary_precedence(&binary.op),
        Expr::Cast(cast) if type_is_named(&cast.ty, "i32") => 5,
        Expr::Cast(cast) if type_is_named(&cast.ty, "u32") => 10,
        Expr::Cast(cast) => expression_precedence(&cast.expr),
        Expr::Group(group) => expression_precedence(&group.expr),
        Expr::If(_) => 2,
        Expr::Reference(reference) => expression_precedence(&reference.expr),
        Expr::Unary(_) => 13,
        _ => 15,
    };
}

fn emit_binary_operand(
    expression: &Expr,
    entities: &HashSet<String>,
    parent_precedence: u8,
    right: bool,
) -> Result<String, CompileError> {
    let value = emit_expression(expression, entities)?;
    let precedence = expression_precedence(expression);
    if precedence < parent_precedence
        || (right && precedence == parent_precedence && matches!(expression, Expr::Binary(_)))
    {
        return Ok(format!("({value})"));
    }
    return Ok(value);
}

fn emit_block(
    out: &mut String,
    statements: &[Stmt],
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let mut declaration_counts = HashMap::new();
    for statement in statements {
        if let Stmt::Local(local) = statement
            && let Some(name) = local_pattern_name(&local.pat)
        {
            *declaration_counts.entry(name).or_insert(0_usize) += 1;
        }
    }
    let mut declared = HashSet::new();
    for statement in statements {
        if let Stmt::Local(local) = statement
            && let Some(name) = local_pattern_name(&local.pat)
        {
            let rebound = declaration_counts
                .get(&name)
                .is_some_and(|count| *count > 1);
            let shadowed = !declared.insert(name);
            emit_local_with_shadow(out, local, entities, indent, shadowed, rebound)?;
        } else {
            emit_statement(out, statement, entities, indent)?;
        }
    }
    return Ok(());
}

fn emit_closure(
    closure: &syn::ExprClosure,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return emit_closure_with_parameter_types(closure, entities, &[]);
}

fn emit_closure_with_parameter_types(
    closure: &syn::ExprClosure,
    entities: &HashSet<String>,
    parameter_types: &[String],
) -> Result<String, CompileError> {
    let mut closure_context = entities
        .iter()
        .filter(|marker| {
            !marker.starts_with(RETURN_TYPE_MARKER) && marker.as_str() != RETURNS_U32_MARKER
        })
        .cloned()
        .collect::<HashSet<_>>();
    if let ReturnType::Type(_, rust_type) = &closure.output {
        closure_context.insert(format!(
            "{RETURN_TYPE_MARKER}{}",
            emit_type(rust_type, entities)?
        ));
        if type_is_named(rust_type, "u32") {
            closure_context.insert(RETURNS_U32_MARKER.to_string());
        }
    }
    let mut parameter_names = HashSet::new();
    for pattern in &closure.inputs {
        collect_closure_parameter_names(pattern, &mut parameter_names);
    }
    let mut unused_index = 0_usize;
    let parameters = closure
        .inputs
        .iter()
        .enumerate()
        .map(|(index, pattern)| {
            let parameter =
                emit_closure_parameter(pattern, entities, &mut parameter_names, &mut unused_index)?;
            if matches!(pattern, Pat::Type(_)) {
                return Ok(parameter);
            }
            return Ok(match parameter_types.get(index) {
                Some(typescript_type) => format!("{parameter}: {typescript_type}"),
                None => parameter,
            });
        })
        .collect::<Result<Vec<_>, _>>()?;
    let return_type = match &closure.output {
        ReturnType::Default => String::new(),
        ReturnType::Type(_, rust_type) => format!(": {}", emit_type(rust_type, entities)?),
    };
    let body = match closure.body.as_ref() {
        Expr::Block(block) => {
            let mut body = String::new();
            body.push_str("{\n");
            emit_block(&mut body, &block.block.stmts, &closure_context, 1)?;
            body.push('}');
            body
        }
        Expr::Return(expression) => {
            let Some(value) = &expression.expr else {
                return Err(compile_error(
                    "portable expression closure cannot return without a value",
                ));
            };
            emit_expression(value, &closure_context)?
        }
        expression => emit_expression(expression, &closure_context)?,
    };
    return Ok(format!(
        "({}){return_type} => {body}",
        parameters.join(", ")
    ));
}

fn emit_closure_parameter(
    pattern: &Pat,
    entities: &HashSet<String>,
    parameter_names: &mut HashSet<String>,
    unused_index: &mut usize,
) -> Result<String, CompileError> {
    return match pattern {
        Pat::Ident(identifier) => Ok(snake_to_lower_camel(&identifier.ident.to_string())),
        Pat::Reference(reference) => {
            emit_closure_parameter(&reference.pat, entities, parameter_names, unused_index)
        }
        Pat::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| {
                    emit_closure_parameter(element, entities, parameter_names, unused_index)
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Pat::Type(pattern) => Ok(format!(
            "{}: {}",
            emit_closure_parameter(&pattern.pat, entities, parameter_names, unused_index,)?,
            emit_type(&pattern.ty, entities)?
        )),
        Pat::Wild(_) => loop {
            let name = format!("_unused{unused_index}");
            *unused_index += 1;
            if parameter_names.insert(name.clone()) {
                break Ok(name);
            }
        },
        _ => Err(compile_error(
            "unsupported destructuring in closure parameter",
        )),
    };
}

fn collect_closure_parameter_names(pattern: &Pat, names: &mut HashSet<String>) {
    match pattern {
        Pat::Ident(identifier) => {
            names.insert(snake_to_lower_camel(&identifier.ident.to_string()));
        }
        Pat::Reference(reference) => collect_closure_parameter_names(&reference.pat, names),
        Pat::Tuple(tuple) => {
            for element in &tuple.elems {
                collect_closure_parameter_names(element, names);
            }
        }
        Pat::Type(pattern) => collect_closure_parameter_names(&pattern.pat, names),
        _ => {}
    }
}

fn emit_constant(
    out: &mut String,
    constant: &syn::ItemConst,
    entities: &HashSet<String>,
    frozen_name: Option<&str>,
) -> Result<(), CompileError> {
    emit_documentation(out, &constant.attrs, 0);
    let export = if is_public(&constant.vis) {
        "export "
    } else {
        ""
    };
    let value = emit_expression_for_type(&constant.expr, &constant.ty, entities)?;
    if let Some(name) = frozen_name {
        writeln!(
            out,
            "{export}const {name}: Readonly<{}> = Object.freeze({value});",
            emit_type(&constant.ty, entities)?,
        )
        .expect("writing to a String cannot fail");
        return Ok(());
    }
    if matches!(constant.expr.as_ref(), Expr::Lit(value) if matches!(&value.lit, Lit::Str(_)))
        && matches!(constant.ty.as_ref(), Type::Reference(reference) if type_is_named(&reference.elem, "str"))
    {
        writeln!(out, "{export}const {} = {value} as const;", constant.ident)
            .expect("writing to a String cannot fail");
        return Ok(());
    }
    writeln!(
        out,
        "{export}const {}: {} = {};",
        constant.ident,
        emit_type(&constant.ty, entities)?,
        value
    )
    .expect("writing to a String cannot fail");
    return Ok(());
}

fn emit_documentation(out: &mut String, attributes: &[Attribute], indent: usize) {
    let lines = documentation(attributes);
    if lines.is_empty() {
        return;
    }
    write_indent(out, indent);
    out.push_str("/**\n");
    for line in lines {
        write_indent(out, indent);
        if line.is_empty() {
            out.push_str(" *\n");
        } else {
            writeln!(out, " * {}", line.replace("*/", "*\\/"))
                .expect("writing to a String cannot fail");
        }
    }
    write_indent(out, indent);
    out.push_str(" */\n");
}

fn emit_enum(
    out: &mut String,
    rust_enum: &syn::ItemEnum,
    string_union: bool,
    data_union: bool,
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    emit_documentation(out, &rust_enum.attrs, 0);
    let export = if is_public(&rust_enum.vis) {
        "export "
    } else {
        ""
    };
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
                    "readonly kind: {:?}",
                    lower_camel_from_upper_camel(&variant.ident.to_string())
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
    if string_union {
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
                format!(
                    "{:?}",
                    lower_camel_from_upper_camel(&variant.ident.to_string())
                )
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
                "  {} = {:?},",
                variant.ident,
                lower_camel_from_upper_camel(&variant.ident.to_string())
            )
            .expect("writing to a String cannot fail");
        }
    }
    out.push_str("}\n");
    return Ok(());
}

fn path_owner_and_member(path: &syn::Path) -> Option<(String, String)> {
    let mut segments = path.segments.iter().rev();
    let member = segments.next()?.ident.to_string();
    let owner = segments.next()?.ident.to_string();
    return Some((owner, member));
}

fn associated_owner_and_member(expression: &Expr) -> Option<(String, String)> {
    let Expr::Path(path) = expression else {
        return None;
    };
    return path_owner_and_member(&path.path);
}

fn data_union_variant_categories(
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

pub(crate) fn is_transparent_data_union_variant(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> bool {
    return data_union_variant_categories(entities, owner, variant).is_some();
}

fn is_tagged_data_union_variant(entities: &HashSet<String>, owner: &str, variant: &str) -> bool {
    return entities.contains(&format!(
        "{TAGGED_DATA_UNION_VARIANT_MARKER}{owner}:{variant}"
    ));
}

fn tagged_data_union_variants(entities: &HashSet<String>, owner: &str) -> BTreeSet<String> {
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

fn data_union_expression_variant(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<(String, String, BTreeSet<RuntimeCategory>)> {
    let (owner, variant) = associated_owner_and_member(expression)?;
    let categories = data_union_variant_categories(entities, &owner, &variant)?;
    return Some((owner, variant, categories));
}

fn data_union_unit(entities: &HashSet<String>, owner: &str, variant: &str) -> bool {
    return entities.contains(&format!("{DATA_UNION_UNIT_MARKER}{owner}:{variant}"));
}

pub(crate) fn emit_expression(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return match expression {
        Expr::Array(array) => {
            let elements = array
                .elems
                .iter()
                .map(|element| emit_expression(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Expr::Assign(assign) => {
            let left = if let Expr::Unary(unary) = assign.left.as_ref()
                && matches!(unary.op, UnOp::Deref(_))
            {
                format!("{}.value", emit_expression(&unary.expr, entities)?)
            } else {
                emit_expression(&assign.left, entities)?
            };
            Ok(format!(
                "{left} = {}",
                emit_expression(&assign.right, entities)?
            ))
        }
        Expr::Binary(binary) => {
            let precedence = binary_precedence(&binary.op);
            if let Some(comparison) = emit_inclusive_comparison(binary, entities)? {
                return Ok(comparison);
            }
            if matches!(binary.op, BinOp::Eq(_) | BinOp::Ne(_))
                && let Some((left, right)) = float_bit_comparison(binary, entities)?
            {
                let comparison = format!("Object.is({left}, {right})");
                return if matches!(binary.op, BinOp::Ne(_)) {
                    Ok(format!("!{comparison}"))
                } else {
                    Ok(comparison)
                };
            }
            if matches!(binary.op, BinOp::Div(_)) && expression_is_method(&binary.left, "len") {
                return Ok(format!(
                    "Math.trunc({} / {})",
                    emit_expression(&binary.left, entities)?,
                    emit_expression(&binary.right, entities)?
                ));
            }
            if matches!(binary.op, BinOp::BitXor(_)) {
                return Ok(format!(
                    "({} ^ {}) >>> 0",
                    emit_binary_operand(&binary.left, entities, precedence, false)?,
                    emit_binary_operand(&binary.right, entities, precedence, true)?
                ));
            }
            if matches!(binary.op, BinOp::BitXorAssign(_)) {
                let left = emit_expression(&binary.left, entities)?;
                return Ok(format!(
                    "{left} = ({left} ^ {}) >>> 0",
                    emit_expression(&binary.right, entities)?
                ));
            }
            if matches!(binary.op, BinOp::Shr(_) | BinOp::ShrAssign(_))
                && referenced_path_identifier(&binary.left).is_some_and(|identifier| {
                    entities.contains(&format!("{UNSIGNED_INTEGER_LOCAL_MARKER}{identifier}"))
                })
            {
                let operator = if matches!(binary.op, BinOp::ShrAssign(_)) {
                    ">>>="
                } else {
                    ">>>"
                };
                return Ok(format!(
                    "{} {operator} {}",
                    emit_binary_operand(&binary.left, entities, precedence, false)?,
                    emit_binary_operand(&binary.right, entities, precedence, true)?
                ));
            }
            Ok(format!(
                "{} {} {}",
                emit_binary_operand(&binary.left, entities, precedence, false)?,
                emit_binary_operator(&binary.op)?,
                emit_binary_operand(&binary.right, entities, precedence, true)?
            ))
        }
        Expr::Block(block) => emit_block_expression(&block.block, entities),
        Expr::Call(call) => {
            if let Some((owner, variant, _)) = data_union_expression_variant(&call.func, entities) {
                if data_union_unit(entities, &owner, &variant) || call.args.len() != 1 {
                    return Err(compile_error(format!(
                        "transparent data union constructor `{owner}::{variant}` expects exactly one payload"
                    )));
                }
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_path(&call.func, "Some") && call.args.len() == 1 {
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "Arc", "new") && call.args.len() == 1 {
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "Arc", "ptr_eq") && call.args.len() == 2 {
                return Ok(format!(
                    "{} === {}",
                    emit_expression(&call.args[0], entities)?,
                    emit_expression(&call.args[1], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "RwLock", "new") && call.args.len() == 1 {
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "String", "new") && call.args.is_empty() {
                return Ok("''".to_string());
            }
            if expression_is_associated_path(&call.func, "Vec", "new") && call.args.is_empty() {
                return Ok("[] as never[]".to_string());
            }
            if expression_is_associated_path(&call.func, "Mutex", "new") && call.args.len() == 1 {
                return Ok(format!(
                    "{{ value: {} }}",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "Cell", "new") && call.args.len() == 1 {
                return Ok(format!(
                    "{{ value: {} }}",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "AtomicU32", "new") && call.args.len() == 1
            {
                return Ok(format!(
                    "{{ value: {} >>> 0 }}",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if (expression_is_associated_path(&call.func, "f32", "from")
                || expression_is_associated_path(&call.func, "f64", "from"))
                && call.args.len() == 1
            {
                return emit_expression(&call.args[0], entities);
            }
            if expression_path_ends_with(&call.func, "throw_range_error") && call.args.len() == 1 {
                return Ok(format!(
                    "(() => {{ throw new RangeError({}); }})()",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_path_ends_with(&call.func, "throw_error") && call.args.len() == 1 {
                return Ok(format!(
                    "(() => {{ throw new Error({}); }})()",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            let function = emit_expression(&call.func, entities)?;
            let function_name = match call.func.as_ref() {
                Expr::Path(path) => path
                    .path
                    .segments
                    .last()
                    .map(|segment| segment.ident.to_string()),
                _ => None,
            };
            let arguments = call
                .args
                .iter()
                .enumerate()
                .map(|(index, argument)| {
                    if function_name.as_ref().is_some_and(|function_name| {
                        entities.contains(&format!("{NULLABLE_CALL_MARKER}{function_name}:{index}"))
                    }) && expression_is_none(argument)
                    {
                        return Ok("null".to_string());
                    }
                    emit_expression(argument, entities)
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("{function}({})", arguments.join(", ")))
        }
        Expr::Cast(cast) if type_is_named(&cast.ty, "u32") => Ok(format!(
            "({}) >>> 0",
            emit_expression(&cast.expr, entities)?
        )),
        Expr::Cast(cast) if type_is_named(&cast.ty, "i32") => {
            Ok(format!("({}) | 0", emit_expression(&cast.expr, entities)?))
        }
        Expr::Cast(cast) => emit_expression(&cast.expr, entities),
        Expr::Closure(closure) => emit_closure(closure, entities),
        Expr::Field(field) => {
            let base = emit_expression(&field.base, entities)?;
            match &field.member {
                syn::Member::Named(identifier) => Ok(format!(
                    "{base}.{}",
                    snake_to_lower_camel(&identifier.to_string())
                )),
                syn::Member::Unnamed(index) => Ok(format!("{base}[{}]", index.index)),
            }
        }
        Expr::Group(group) => emit_expression(&group.expr, entities),
        Expr::Index(index) => {
            let receiver = emit_expression(&index.expr, entities)?;
            if let Expr::Range(range) = index.index.as_ref() {
                let start = range
                    .start
                    .as_deref()
                    .map(|start| emit_expression(start, entities))
                    .transpose()?
                    .unwrap_or_default();
                let mut end = range
                    .end
                    .as_deref()
                    .map(|end| emit_expression(end, entities))
                    .transpose()?;
                if matches!(range.limits, syn::RangeLimits::Closed(_)) {
                    end = end.map(|end| format!("{end} + 1"));
                }
                return Ok(match end {
                    Some(end) => format!("{receiver}.slice({start}, {end})"),
                    None if start.is_empty() => format!("{receiver}.slice()"),
                    None => format!("{receiver}.slice({start})"),
                });
            }
            Ok(format!(
                "{receiver}[{}]",
                emit_expression(&index.index, entities)?
            ))
        }
        Expr::If(expression) => emit_if_expression(expression, entities),
        Expr::Lit(literal) => emit_literal(&literal.lit),
        Expr::Macro(expression) => emit_macro_expression(&expression.mac, entities),
        Expr::Match(expression) => emit_match_expression(expression, entities),
        Expr::MethodCall(call) => emit_method_call(call, entities),
        Expr::Paren(paren) => Ok(format!("({})", emit_expression(&paren.expr, entities)?)),
        Expr::Path(path) => {
            if let Some((owner, variant)) = associated_owner_and_member(expression)
                && is_tagged_data_union_variant(entities, &owner, &variant)
            {
                if !data_union_unit(entities, &owner, &variant) {
                    return Err(compile_error(format!(
                        "tagged data union payload variant `{owner}::{variant}` needs named fields"
                    )));
                }
                return Ok(format!(
                    "{{ kind: {:?} as const }}",
                    lower_camel_from_upper_camel(&variant)
                ));
            }
            if let Some((owner, variant, _)) = data_union_expression_variant(expression, entities) {
                return if data_union_unit(entities, &owner, &variant) {
                    Ok("null".to_string())
                } else {
                    Ok("(value) => value".to_string())
                };
            }
            if path.path.is_ident("None") {
                return Ok("undefined".to_string());
            }
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1
                && let Some(name) =
                    frozen_object_name(entities, &path.path.segments[0].ident.to_string())
            {
                return Ok(name.to_string());
            }
            if expression_is_associated_path(expression, "f32", "min")
                || expression_is_associated_path(expression, "f64", "min")
            {
                return Ok("Math.min".to_string());
            }
            if expression_is_associated_path(expression, "f32", "max")
                || expression_is_associated_path(expression, "f64", "max")
            {
                return Ok("Math.max".to_string());
            }
            if path_is_float_constant(&path.path, "NAN") {
                return Ok("Number.NaN".to_string());
            }
            if path_is_float_constant(&path.path, "INFINITY") {
                return Ok("Number.POSITIVE_INFINITY".to_string());
            }
            if path_is_float_constant(&path.path, "EPSILON") {
                let rust_type = float_constant_type(&path.path).unwrap_or("f64");
                return if rust_type == "f32" {
                    Ok("Math.pow(2, -23)".to_string())
                } else {
                    Ok("Number.EPSILON".to_string())
                };
            }
            if path_is_float_constant(&path.path, "TAU") {
                return Ok("Math.PI * 2".to_string());
            }
            if path_is_float_constant(&path.path, "PI") {
                return Ok("Math.PI".to_string());
            }
            if path_is_float_constant(&path.path, "MAX") {
                return Ok("Number.MAX_VALUE".to_string());
            }
            if path_is_type_constant(&path.path, "u32", "MAX") {
                return Ok("0xffffffff".to_string());
            }
            if path_is_float_constant(&path.path, "MIN_POSITIVE") {
                return Ok("2.2250738585072014e-308".to_string());
            }
            if path_is_float_constant(&path.path, "NEG_INFINITY") {
                return Ok("Number.NEGATIVE_INFINITY".to_string());
            }
            if path_is_float_constant(&path.path, "FRAC_1_SQRT_2") {
                return Ok("Math.SQRT1_2".to_string());
            }
            let rendered = path
                .path
                .segments
                .iter()
                .map(|segment| emit_path_segment(&segment.ident.to_string()))
                .collect::<Vec<_>>()
                .join(".");
            Ok(rendered)
        }
        Expr::Reference(reference) => emit_expression(&reference.expr, entities),
        Expr::Range(range) => {
            let Some(start) = &range.start else {
                return Err(compile_error("portable Rust range needs a start"));
            };
            let Some(end) = &range.end else {
                return Err(compile_error("portable Rust range needs an end"));
            };
            let start = emit_expression(start, entities)?;
            let end = emit_expression(end, entities)?;
            let inclusive = if matches!(range.limits, syn::RangeLimits::Closed(_)) {
                " + 1"
            } else {
                ""
            };
            Ok(format!(
                "Array.from({{ length: {end} - {start}{inclusive} }}, (_, index) => {start} + index)"
            ))
        }
        Expr::Repeat(repeat) => {
            let value = emit_expression(&repeat.expr, entities)?;
            let length = emit_expression(&repeat.len, entities)?;
            if let Some(array_type) = typed_array_for_literal(&repeat.expr) {
                return Ok(format!("new {array_type}({length}).fill({value})"));
            }
            Ok(format!("new Array({length}).fill({value})"))
        }
        Expr::Struct(structure) => {
            if let Some((owner, variant)) = path_owner_and_member(&structure.path)
                && is_tagged_data_union_variant(entities, &owner, &variant)
            {
                if data_union_unit(entities, &owner, &variant) {
                    return Err(compile_error(format!(
                        "tagged data union unit variant `{owner}::{variant}` cannot declare fields"
                    )));
                }
                if structure.rest.is_some() {
                    return Err(compile_error(
                        "tagged data union construction cannot use a struct update",
                    ));
                }
                let mut fields = vec![format!(
                    "kind: {:?} as const",
                    lower_camel_from_upper_camel(&variant)
                )];
                fields.extend(
                    structure
                        .fields
                        .iter()
                        .map(|field| {
                            Ok(format!(
                                "{}: {}",
                                emit_member(&field.member),
                                emit_expression(&field.expr, entities)?
                            ))
                        })
                        .collect::<Result<Vec<_>, CompileError>>()?,
                );
                return Ok(format!("{{ {} }}", fields.join(", ")));
            }
            let fields = structure
                .fields
                .iter()
                .map(|field| {
                    Ok(format!(
                        "{}: {}",
                        emit_member(&field.member),
                        emit_expression(&field.expr, entities)?
                    ))
                })
                .collect::<Result<Vec<_>, CompileError>>()?;
            if structure.rest.is_some() {
                return Err(compile_error(
                    "unsupported struct update expression; refusing a lossy object literal",
                ));
            }
            Ok(format!("{{ {} }}", fields.join(", ")))
        }
        Expr::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| emit_expression(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Expr::Unary(unary) => Ok(format!(
            "{}{}",
            emit_unary_operator(&unary.op)?,
            emit_expression(&unary.expr, entities)?
        )),
        _ => Err(compile_error(format!(
            "unsupported Rust expression `{}`",
            expression_kind(expression)
        ))),
    };
}

fn emit_block_expression(
    block: &syn::Block,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let Some((last, preceding)) = block.stmts.split_last() else {
        return Err(compile_error("portable value block cannot be empty"));
    };
    let Stmt::Expr(value, None) = last else {
        return Err(compile_error(
            "portable value block must end with an expression",
        ));
    };
    let mut out = "(() => {\n".to_string();
    for statement in preceding {
        emit_statement(&mut out, statement, entities, 1)?;
    }
    write_indent(&mut out, 1);
    writeln!(out, "return {};", emit_expression(value, entities)?)
        .expect("writing to a String cannot fail");
    out.push_str("})()");
    return Ok(out);
}

fn emit_expression_for_type(
    expression: &Expr,
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if let Expr::Reference(reference) = expression {
        return emit_expression_for_type(&reference.expr, rust_type, entities);
    }
    return match rust_type {
        Type::Array(array_type) => match expression {
            Expr::Array(array) => {
                let elements = array
                    .elems
                    .iter()
                    .map(|element| emit_expression_for_type(element, &array_type.elem, entities))
                    .collect::<Result<Vec<_>, _>>()?;
                let value = format!("[{}]", elements.join(", "));
                if let Some(array_type) = typed_array_for_type(&array_type.elem) {
                    Ok(format!("new {array_type}({value})"))
                } else {
                    Ok(value)
                }
            }
            Expr::Repeat(repeat) => {
                let value = emit_expression_for_type(&repeat.expr, &array_type.elem, entities)?;
                let length = emit_expression(&repeat.len, entities)?;
                if let Some(array_type) = typed_array_for_type(&array_type.elem) {
                    Ok(format!("new {array_type}({length}).fill({value})"))
                } else {
                    Ok(format!("new Array({length}).fill({value})"))
                }
            }
            _ => emit_expression(expression, entities),
        },
        Type::Paren(paren) => emit_expression_for_type(expression, &paren.elem, entities),
        Type::Reference(reference) => {
            emit_expression_for_type(expression, &reference.elem, entities)
        }
        Type::Slice(slice) => match expression {
            Expr::Array(array) => {
                let elements = array
                    .elems
                    .iter()
                    .map(|element| emit_expression_for_type(element, &slice.elem, entities))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(format!("[{}]", elements.join(", ")))
            }
            _ => emit_expression(expression, entities),
        },
        Type::Tuple(tuple_type) => match expression {
            Expr::Tuple(tuple) if tuple.elems.len() == tuple_type.elems.len() => {
                let elements = tuple
                    .elems
                    .iter()
                    .zip(&tuple_type.elems)
                    .map(|(element, element_type)| {
                        emit_expression_for_type(element, element_type, entities)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(format!("[{}]", elements.join(", ")))
            }
            Expr::Tuple(_) => Err(compile_error(
                "tuple initializer length does not match its Rust type",
            )),
            _ => emit_expression(expression, entities),
        },
        _ => emit_expression(expression, entities),
    };
}

pub(crate) fn emit_for_header(
    pattern: &Pat,
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let pattern = emit_pattern(pattern)?;
    if let Expr::Range(range) = expression {
        let Some(start) = &range.start else {
            return Err(compile_error("portable Rust range needs a start"));
        };
        let Some(end) = &range.end else {
            return Err(compile_error("portable Rust range needs an end"));
        };
        let start = emit_expression(start, entities)?;
        let end = emit_expression(end, entities)?;
        let comparison = match range.limits {
            syn::RangeLimits::HalfOpen(_) => "<",
            syn::RangeLimits::Closed(_) => "<=",
        };
        return Ok(format!(
            "let {pattern} = {start}; {pattern} {comparison} {end}; {pattern} += 1"
        ));
    }
    return Ok(format!(
        "const {pattern} of {}",
        emit_expression(expression, entities)?
    ));
}

fn emit_function(
    out: &mut String,
    function: &ItemFn,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_static_names: &HashSet<String>,
) -> Result<(), CompileError> {
    emit_documentation(out, &function.attrs, 0);
    let export = if is_public(&function.vis) {
        "export "
    } else {
        ""
    };
    let name = snake_to_lower_camel(&function.sig.ident.to_string());
    let type_parameters = emit_type_parameters(&function.sig.generics);
    let trailing_optional_start = function
        .sig
        .inputs
        .iter()
        .rposition(|argument| {
            !argument_is_option(argument) || argument_is_nullable_guard(function, argument)
        })
        .map_or(0, |index| index + 1);
    let parameters = function
        .sig
        .inputs
        .iter()
        .enumerate()
        .map(|(index, argument)| {
            emit_parameter_with_aliases(
                argument,
                entities,
                aliases,
                index >= trailing_optional_start && !argument_is_nullable_guard(function, argument),
                argument_is_nullable_guard(function, argument),
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    let return_type = match &function.sig.output {
        ReturnType::Default => "void".to_string(),
        ReturnType::Type(_, rust_type) => emit_preferred_type(rust_type, entities, aliases)?,
    };
    writeln!(
        out,
        "{export}function {name}{type_parameters}({}): {return_type} {{",
        parameters.join(", ")
    )
    .expect("writing to a String cannot fail");
    let mut function_context = entities.clone();
    for argument in &function.sig.inputs {
        if argument_is_nullable_guard(function, argument)
            && let FnArg::Typed(argument) = argument
            && let Pat::Ident(pattern) = argument.pat.as_ref()
        {
            function_context.insert(format!("@nullable:{}", pattern.ident));
        }
    }
    struct NullableLocalCollector<'a> {
        names: HashSet<String>,
        nullable_static_names: &'a HashSet<String>,
    }

    impl<'ast> syn::visit::Visit<'ast> for NullableLocalCollector<'_> {
        fn visit_local(&mut self, local: &'ast syn::Local) {
            if let Some(initializer) = &local.init
                && self
                    .nullable_static_names
                    .iter()
                    .any(|name| expression_contains_identifier(&initializer.expr, name))
                && let Some(name) = local_pattern_name(&local.pat)
            {
                self.names.insert(name);
            }
            syn::visit::visit_local(self, local);
        }
    }

    let mut nullable_locals = NullableLocalCollector {
        names: HashSet::new(),
        nullable_static_names,
    };
    syn::visit::Visit::visit_block(&mut nullable_locals, &function.block);
    for name in nullable_locals.names {
        function_context.insert(format!("@nullable:{name}"));
    }
    let mut function_context = function_expression_context(function, &function_context);
    function_context.insert(format!("{RETURN_TYPE_MARKER}{return_type}"));
    if matches!(&function.sig.output, ReturnType::Type(_, rust_type) if type_is_named(rust_type, "u32"))
    {
        function_context.insert(RETURNS_U32_MARKER.to_string());
    }
    emit_block(out, &function.block.stmts, &function_context, 1)?;
    out.push_str("}\n");
    return Ok(());
}

fn emit_function_trait_type(
    bounds: &syn::punctuated::Punctuated<syn::TypeParamBound, syn::token::Plus>,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return emit_function_trait_type_with_parameter_names(bounds, entities, None);
}

fn emit_function_trait_type_with_parameter_names(
    bounds: &syn::punctuated::Punctuated<syn::TypeParamBound, syn::token::Plus>,
    entities: &HashSet<String>,
    parameter_names: Option<&[String]>,
) -> Result<String, CompileError> {
    for bound in bounds {
        let syn::TypeParamBound::Trait(bound) = bound else {
            continue;
        };
        let Some(segment) = bound.path.segments.last() else {
            continue;
        };
        if !matches!(
            segment.ident.to_string().as_str(),
            "Fn" | "FnMut" | "FnOnce"
        ) {
            continue;
        }
        let PathArguments::Parenthesized(arguments) = &segment.arguments else {
            return Err(compile_error(
                "Rust function trait needs parenthesized arguments",
            ));
        };
        if let Some(parameter_names) = parameter_names
            && parameter_names.len() != arguments.inputs.len()
        {
            return Err(compile_error(
                "callable parameter name count changed after directive validation",
            ));
        }
        let parameters = arguments
            .inputs
            .iter()
            .enumerate()
            .map(|(index, rust_type)| {
                let name = parameter_names
                    .and_then(|parameter_names| parameter_names.get(index))
                    .cloned()
                    .unwrap_or_else(|| format!("arg{index}"));
                Ok(format!("{name}: {}", emit_type(rust_type, entities)?))
            })
            .collect::<Result<Vec<_>, CompileError>>()?;
        let output = match &arguments.output {
            ReturnType::Default => "void".to_string(),
            ReturnType::Type(_, rust_type) => emit_type(rust_type, entities)?,
        };
        return Ok(format!("({}) => {output}", parameters.join(", ")));
    }
    return Err(compile_error(
        "unsupported Rust trait object; only callable traits are portable",
    ));
}

fn emit_if_expression(
    expression: &syn::ExprIf,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let condition = emit_expression(&expression.cond, entities)?;
    let then_value = emit_single_expression_block(&expression.then_branch, entities)?;
    let Some((_, otherwise)) = &expression.else_branch else {
        return Err(compile_error(
            "Rust if expression used as a value needs an else branch",
        ));
    };
    let otherwise = match otherwise.as_ref() {
        Expr::Block(block) => emit_single_expression_block(&block.block, entities)?,
        Expr::If(nested) => emit_if_expression(nested, entities)?,
        _ => {
            return Err(compile_error(
                "unsupported non-block else branch in Rust if expression",
            ));
        }
    };
    return Ok(format!("{condition} ? {then_value} : {otherwise}"));
}

fn emit_inclusive_comparison(
    binary: &syn::ExprBinary,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    if !matches!(binary.op, BinOp::Or(_)) {
        return Ok(None);
    }
    let (Expr::Binary(left), Expr::Binary(right)) = (binary.left.as_ref(), binary.right.as_ref())
    else {
        return Ok(None);
    };
    let (strict, equal) = if matches!(left.op, BinOp::Gt(_) | BinOp::Lt(_))
        && matches!(right.op, BinOp::Eq(_))
    {
        (left, right)
    } else if matches!(right.op, BinOp::Gt(_) | BinOp::Lt(_)) && matches!(left.op, BinOp::Eq(_)) {
        (right, left)
    } else {
        return Ok(None);
    };
    let strict_left = emit_expression(&strict.left, entities)?;
    let strict_right = emit_expression(&strict.right, entities)?;
    let equal_left = emit_expression(&equal.left, entities)?;
    let equal_right = emit_expression(&equal.right, entities)?;
    if !((strict_left == equal_left && strict_right == equal_right)
        || (strict_left == equal_right && strict_right == equal_left))
    {
        return Ok(None);
    }
    let operator = if matches!(strict.op, BinOp::Gt(_)) {
        ">="
    } else {
        "<="
    };
    return Ok(Some(format!("{strict_left} {operator} {strict_right}")));
}

fn emit_literal(literal: &Lit) -> Result<String, CompileError> {
    return match literal {
        Lit::Bool(value) => Ok(value.value.to_string()),
        Lit::Byte(value) => Ok(value.value().to_string()),
        Lit::ByteStr(value) => Ok(format!("new Uint8Array({:?})", value.value())),
        Lit::Char(value) => Ok(format!("{:?}", value.value().to_string())),
        Lit::Float(value) => Ok(numeric_literal_spelling(&value.to_string(), value.suffix())),
        Lit::Int(value) => Ok(numeric_literal_spelling(&value.to_string(), value.suffix())),
        Lit::Str(value) => Ok(format!("{:?}", value.value())),
        _ => Err(compile_error("unsupported Rust literal")),
    };
}

pub(crate) fn numeric_literal_spelling(spelling: &str, suffix: &str) -> String {
    if suffix.is_empty() {
        return spelling.to_string();
    }
    return spelling
        .strip_suffix(suffix)
        .unwrap_or(spelling)
        .trim_end_matches('_')
        .to_string();
}

pub(crate) fn emit_local(
    out: &mut String,
    local: &syn::Local,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    return emit_local_with_shadow(out, local, entities, indent, false, false);
}

pub(crate) fn emit_local_with_shadow(
    out: &mut String,
    local: &syn::Local,
    entities: &HashSet<String>,
    indent: usize,
    shadowed: bool,
    rebound: bool,
) -> Result<(), CompileError> {
    let mutable = pattern_is_mutable(&local.pat);
    let (pattern, rust_type, discard) = match &local.pat {
        Pat::Ident(_) | Pat::Reference(_) | Pat::Tuple(_) => {
            (emit_pattern(&local.pat)?, None, false)
        }
        Pat::Type(typed) => {
            let pattern = emit_pattern(&typed.pat)?;
            (pattern, Some(typed.ty.as_ref()), false)
        }
        Pat::Wild(_) => ("_".to_string(), None, true),
        _ => {
            return Err(compile_error("unsupported destructuring in local binding"));
        }
    };
    let Some(initializer) = &local.init else {
        write_indent(out, indent);
        write!(out, "let {pattern}").expect("writing to a String cannot fail");
        if let Some(rust_type) = rust_type {
            write!(out, ": {}", emit_type(rust_type, entities)?)
                .expect("writing to a String cannot fail");
        }
        out.push_str(";\n");
        return Ok(());
    };
    if initializer.diverge.is_some() {
        return Err(compile_error("unsupported let-else local binding"));
    }
    let local_name = local_pattern_name(&local.pat);
    let typescript_type = rust_type
        .map(|rust_type| emit_type(rust_type, entities))
        .transpose()?
        .or_else(|| {
            local_name
                .as_deref()
                .and_then(|name| inferred_fixed_buffer_type(entities, name))
        });
    let closure_parameter_types = local_name
        .as_deref()
        .map(|name| closure_parameter_types(entities, name))
        .unwrap_or_default();
    let mut value = if expression_is_path_call(&initializer.expr, "allocate_entity") {
        let Some(typescript_type) = &typescript_type else {
            return Err(compile_error(
                "allocate_entity local needs an explicit Rust type",
            ));
        };
        entity_allocation(typescript_type, entities)?
    } else if let Some(rust_type) = rust_type {
        emit_expression_for_type(&initializer.expr, rust_type, entities)?
    } else if let Expr::Repeat(repeat) = initializer.expr.as_ref()
        && let Some(array_type) = typescript_type
            .as_deref()
            .filter(|typescript_type| typescript_type.ends_with("Array"))
    {
        format!(
            "new {array_type}({}).fill({})",
            emit_expression(&repeat.len, entities)?,
            emit_expression(&repeat.expr, entities)?
        )
    } else if let Expr::Closure(closure) = initializer.expr.as_ref() {
        emit_closure_with_parameter_types(closure, entities, &closure_parameter_types)?
    } else {
        emit_expression(&initializer.expr, entities)?
    };
    if mutable && let Some(name) = frozen_object_expression_name(&initializer.expr, entities) {
        value = format!("{{ ...{name} }}");
    }
    if typescript_type.as_deref() == Some("Float32Array") && !value.starts_with("new Float32Array(")
    {
        value = format!("new Float32Array({value})");
    }
    let rebind = shadowed
        || match &local.pat {
            Pat::Ident(identifier) => {
                expression_contains_identifier(&initializer.expr, &identifier.ident.to_string())
            }
            Pat::Type(typed) => match typed.pat.as_ref() {
                Pat::Ident(identifier) => {
                    expression_contains_identifier(&initializer.expr, &identifier.ident.to_string())
                }
                _ => false,
            },
            _ => false,
        };
    write_indent(out, indent);
    if discard {
        writeln!(out, "{value};").expect("writing to a String cannot fail");
        return Ok(());
    }
    if rebind {
        write!(out, "{pattern}").expect("writing to a String cannot fail");
    } else {
        let declaration = if mutable || rebound { "let" } else { "const" };
        write!(out, "{declaration} {pattern}").expect("writing to a String cannot fail");
    }
    if !rebind
        && rust_type.is_some()
        && let Some(typescript_type) = typescript_type
    {
        write!(out, ": {typescript_type}").expect("writing to a String cannot fail");
    }
    writeln!(out, " = {value};").expect("writing to a String cannot fail");
    return Ok(());
}

pub(crate) fn emit_format_template(
    template: &str,
    values: &[&Expr],
    entities: &HashSet<String>,
    error_prefix: &str,
) -> Result<String, CompileError> {
    let mut template = template
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${");
    let mut value_index = 0;
    let mut rendered = String::new();
    while let Some(start) = template.find('{') {
        let Some(relative_end) = template[start + 1..].find('}') else {
            break;
        };
        let end = start + 1 + relative_end;
        rendered.push_str(&template[..start]);
        let placeholder = &template[start + 1..end];
        let (name, specifier) = placeholder.split_once(':').unwrap_or((placeholder, ""));
        let value = if name.is_empty() {
            let Some(value) = values.get(value_index) else {
                return Err(compile_error(format!(
                    "{error_prefix} has too few formatting values"
                )));
            };
            value_index += 1;
            emit_expression(value, entities)?
        } else {
            snake_to_lower_camel(name)
        };
        let value = if specifier.is_empty() {
            value
        } else if specifier == "x" {
            format!("({value}).toString(16)")
        } else if let Some(width) = specifier
            .strip_prefix('0')
            .and_then(|value| value.strip_suffix('x'))
            .and_then(|value| value.parse::<usize>().ok())
        {
            format!("({value}).toString(16).padStart({width}, \"0\")")
        } else {
            return Err(compile_error(format!(
                "{error_prefix} uses unsupported format specifier `:{specifier}`"
            )));
        };
        rendered.push_str("${");
        rendered.push_str(&value);
        rendered.push('}');
        template = template[end + 1..].to_string();
    }
    rendered.push_str(&template);
    if value_index != values.len() {
        return Err(compile_error(format!(
            "{error_prefix} has unused formatting values"
        )));
    }
    return Ok(format!("`{rendered}`"));
}

fn emit_macro_expression(
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let Some(name) = rust_macro.path.segments.last() else {
        return Err(compile_error("Rust macro expression has an empty path"));
    };
    if name.ident == "vec" {
        let repeat_parser = |input: syn::parse::ParseStream<'_>| {
            let value = input.parse::<Expr>()?;
            input.parse::<Token![;]>()?;
            let length = input.parse::<Expr>()?;
            if !input.is_empty() {
                return Err(input.error("unexpected tokens after `vec!` repeat length"));
            }
            return Ok((value, length));
        };
        if let Ok((value, length)) = repeat_parser.parse2(rust_macro.tokens.clone()) {
            return Ok(format!(
                "new Array({}).fill({})",
                emit_expression(&length, entities)?,
                emit_expression(&value, entities)?
            ));
        }
        let values = Punctuated::<Expr, Token![,]>::parse_terminated
            .parse2(rust_macro.tokens.clone())
            .map_err(|error| compile_error(format!("failed to parse `vec!` values: {error}")))?;
        let values = values
            .iter()
            .map(|value| emit_expression(value, entities))
            .collect::<Result<Vec<_>, _>>()?;
        return Ok(format!("[{}]", values.join(", ")));
    }
    if name.ident == "unreachable" {
        return Ok(format!(
            "(() => {{ throw new Error({}); }})()",
            emit_unreachable_message(rust_macro, entities)?
        ));
    }
    if name.ident != "format" {
        return Err(compile_error(format!(
            "unsupported Rust macro expression `{}!`",
            name.ident
        )));
    }
    let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
        .parse2(rust_macro.tokens.clone())
        .map_err(|error| compile_error(format!("failed to parse `format!` arguments: {error}")))?;
    let Some(Expr::Lit(template)) = arguments.first() else {
        return Err(compile_error(
            "portable `format!` expression needs a string literal template",
        ));
    };
    let Lit::Str(template) = &template.lit else {
        return Err(compile_error(
            "portable `format!` expression needs a string literal template",
        ));
    };
    let values = arguments.iter().skip(1).collect::<Vec<_>>();
    return emit_format_template(&template.value(), &values, entities, "portable `format!`");
}

fn emit_unreachable_message(
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    const DEFAULT_MESSAGE: &str = "internal error: entered unreachable code";

    let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
        .parse2(rust_macro.tokens.clone())
        .map_err(|error| {
            compile_error(format!("failed to parse `unreachable!` arguments: {error}"))
        })?;
    let Some(Expr::Lit(template)) = arguments.first() else {
        if arguments.is_empty() {
            return Ok(format!("{DEFAULT_MESSAGE:?}"));
        }
        return Err(compile_error(
            "portable `unreachable!` needs a string literal template",
        ));
    };
    let Lit::Str(template) = &template.lit else {
        return Err(compile_error(
            "portable `unreachable!` needs a string literal template",
        ));
    };
    let template = format!("{DEFAULT_MESSAGE}: {}", template.value());
    let values = arguments.iter().skip(1).collect::<Vec<_>>();
    return emit_format_template(
        &template,
        &values,
        entities,
        "portable `unreachable!` message",
    );
}

struct TaggedDataUnionPattern {
    bindings: BTreeMap<String, String>,
    owner: String,
    variant: String,
}

enum TaggedDataUnionPatternAnalysis {
    CatchAll(Option<String>),
    Ordinary,
    Variants(Vec<TaggedDataUnionPattern>),
}

struct TaggedDataUnionMatchArm {
    catch_all_binding: Option<String>,
    otherwise: bool,
    variants: Vec<TaggedDataUnionPattern>,
}

fn tagged_data_union_field_binding(pattern: &Pat) -> Result<Option<String>, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            Ok(Some(snake_to_lower_camel(&identifier.ident.to_string())))
        }
        Pat::Reference(reference) => tagged_data_union_field_binding(&reference.pat),
        Pat::Wild(_) => Ok(None),
        _ => Err(compile_error(
            "tagged data union field pattern must be an identifier or `_`",
        )),
    };
}

fn analyze_tagged_data_union_pattern(
    pattern: &Pat,
    entities: &HashSet<String>,
) -> Result<TaggedDataUnionPatternAnalysis, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            Ok(TaggedDataUnionPatternAnalysis::CatchAll(Some(
                snake_to_lower_camel(&identifier.ident.to_string()),
            )))
        }
        Pat::Or(or_pattern) => {
            let mut variants = Vec::new();
            for pattern in &or_pattern.cases {
                match analyze_tagged_data_union_pattern(pattern, entities)? {
                    TaggedDataUnionPatternAnalysis::Variants(patterns) => variants.extend(patterns),
                    TaggedDataUnionPatternAnalysis::CatchAll(_) => {
                        return Err(compile_error(
                            "tagged data union `|` pattern cannot contain a catch-all",
                        ));
                    }
                    TaggedDataUnionPatternAnalysis::Ordinary => {
                        return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
                    }
                }
            }
            Ok(TaggedDataUnionPatternAnalysis::Variants(variants))
        }
        Pat::Paren(paren) => analyze_tagged_data_union_pattern(&paren.pat, entities),
        Pat::Path(path) => {
            let Some((owner, variant)) = path_owner_and_member(&path.path) else {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            };
            if !is_tagged_data_union_variant(entities, &owner, &variant) {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            }
            if !data_union_unit(entities, &owner, &variant) {
                return Err(compile_error(format!(
                    "tagged data union payload variant `{owner}::{variant}` needs a field pattern"
                )));
            }
            Ok(TaggedDataUnionPatternAnalysis::Variants(vec![
                TaggedDataUnionPattern {
                    bindings: BTreeMap::new(),
                    owner,
                    variant,
                },
            ]))
        }
        Pat::Reference(reference) => analyze_tagged_data_union_pattern(&reference.pat, entities),
        Pat::Struct(pattern) => {
            let Some((owner, variant)) = path_owner_and_member(&pattern.path) else {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            };
            if !is_tagged_data_union_variant(entities, &owner, &variant) {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            }
            if data_union_unit(entities, &owner, &variant) {
                return Err(compile_error(format!(
                    "tagged data union unit variant `{owner}::{variant}` cannot declare field patterns"
                )));
            }
            let mut bindings = BTreeMap::new();
            for field in &pattern.fields {
                let Some(binding) = tagged_data_union_field_binding(&field.pat)? else {
                    continue;
                };
                let source = emit_member(&field.member);
                if bindings.insert(binding.clone(), source).is_some() {
                    return Err(compile_error(format!(
                        "tagged data union pattern binds `{binding}` more than once"
                    )));
                }
            }
            Ok(TaggedDataUnionPatternAnalysis::Variants(vec![
                TaggedDataUnionPattern {
                    bindings,
                    owner,
                    variant,
                },
            ]))
        }
        Pat::Wild(_) => Ok(TaggedDataUnionPatternAnalysis::CatchAll(None)),
        _ => Ok(TaggedDataUnionPatternAnalysis::Ordinary),
    };
}

fn analyze_tagged_data_union_match(
    arms: &[syn::Arm],
    entities: &HashSet<String>,
) -> Result<Option<Vec<TaggedDataUnionMatchArm>>, CompileError> {
    let analyses = arms
        .iter()
        .map(|arm| analyze_tagged_data_union_pattern(&arm.pat, entities))
        .collect::<Result<Vec<_>, _>>()?;
    if !analyses
        .iter()
        .any(|analysis| matches!(analysis, TaggedDataUnionPatternAnalysis::Variants(_)))
    {
        return Ok(None);
    }
    let mut owner = None;
    let mut handled = BTreeMap::<String, String>::new();
    let mut output = Vec::new();
    let mut has_catch_all = false;
    for (arm_index, analysis) in analyses.into_iter().enumerate() {
        match analysis {
            TaggedDataUnionPatternAnalysis::CatchAll(binding) => {
                if arm_index + 1 != arms.len() {
                    return Err(compile_error(
                        "tagged data union catch-all match arm must be last",
                    ));
                }
                output.push(TaggedDataUnionMatchArm {
                    catch_all_binding: binding,
                    otherwise: true,
                    variants: Vec::new(),
                });
                has_catch_all = true;
            }
            TaggedDataUnionPatternAnalysis::Ordinary => {
                return Err(compile_error(
                    "tagged data union match cannot mix data union and ordinary patterns",
                ));
            }
            TaggedDataUnionPatternAnalysis::Variants(patterns) => {
                let expected_bindings = patterns
                    .first()
                    .map(|pattern| pattern.bindings.keys().cloned().collect::<BTreeSet<_>>())
                    .unwrap_or_default();
                for pattern in &patterns {
                    if let Some(expected) = &owner {
                        if expected != &pattern.owner {
                            return Err(compile_error(format!(
                                "tagged data union match cannot mix `{expected}` and `{}` variants",
                                pattern.owner
                            )));
                        }
                    } else {
                        owner = Some(pattern.owner.clone());
                    }
                    let bindings = pattern.bindings.keys().cloned().collect::<BTreeSet<_>>();
                    if bindings != expected_bindings {
                        return Err(compile_error(
                            "tagged data union alternatives must bind the same field names",
                        ));
                    }
                    let label = format!("{}::{}", pattern.owner, pattern.variant);
                    if let Some(previous) = handled.insert(pattern.variant.clone(), label.clone()) {
                        return Err(compile_error(format!(
                            "tagged data union match arm `{label}` is unreachable after `{previous}`"
                        )));
                    }
                }
                output.push(TaggedDataUnionMatchArm {
                    catch_all_binding: None,
                    otherwise: false,
                    variants: patterns,
                });
            }
        }
    }
    if !has_catch_all {
        let owner = owner.expect("tagged data union match has a tagged variant");
        let missing = tagged_data_union_variants(entities, &owner)
            .into_iter()
            .filter(|variant| !handled.contains_key(variant))
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            return Err(compile_error(format!(
                "tagged data union match is not exhaustive; missing {}",
                missing
                    .iter()
                    .map(|variant| format!("`{owner}::{variant}`"))
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }
        output
            .last_mut()
            .expect("tagged data union match has an arm")
            .otherwise = true;
    }
    return Ok(Some(output));
}

fn tagged_data_union_predicate(patterns: &[TaggedDataUnionPattern], value: &str) -> String {
    return patterns
        .iter()
        .map(|pattern| {
            format!(
                "{value}.kind === {:?}",
                lower_camel_from_upper_camel(&pattern.variant)
            )
        })
        .collect::<Vec<_>>()
        .join(" || ");
}

fn tagged_data_union_bindings(
    patterns: &[TaggedDataUnionPattern],
    value: &str,
) -> Vec<(String, String)> {
    let Some(first) = patterns.first() else {
        return Vec::new();
    };
    return first
        .bindings
        .keys()
        .map(|binding| {
            let fields = patterns
                .iter()
                .map(|pattern| {
                    (
                        lower_camel_from_upper_camel(&pattern.variant),
                        pattern
                            .bindings
                            .get(binding)
                            .expect("tagged alternatives have identical binding names"),
                    )
                })
                .collect::<Vec<_>>();
            let expression = if fields.iter().all(|(_, field)| *field == fields[0].1) {
                format!("{value}.{}", fields[0].1)
            } else {
                let mut expression = format!(
                    "{value}.{}",
                    fields.last().expect("tagged match arm has a variant").1
                );
                for (variant, field) in fields.iter().rev().skip(1) {
                    expression =
                        format!("{value}.kind === {variant:?} ? {value}.{field} : {expression}");
                }
                expression
            };
            (binding.clone(), expression)
        })
        .collect();
}

struct DataUnionPattern {
    binding: Option<String>,
    categories: BTreeSet<RuntimeCategory>,
    owner: String,
    variant: String,
}

enum DataUnionPatternAnalysis {
    CatchAll(Option<String>),
    Ordinary,
    Variants(Vec<DataUnionPattern>),
}

struct DataUnionMatchArm {
    binding: Option<String>,
    categories: BTreeSet<RuntimeCategory>,
    catch_all: bool,
}

fn data_union_payload_binding(pattern: &Pat) -> Result<Option<String>, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            Ok(Some(snake_to_lower_camel(&identifier.ident.to_string())))
        }
        Pat::Reference(reference) => data_union_payload_binding(&reference.pat),
        Pat::Rest(_) | Pat::Wild(_) => Ok(None),
        _ => Err(compile_error(
            "transparent data union payload pattern must be an identifier or `_`",
        )),
    };
}

fn analyze_data_union_pattern(
    pattern: &Pat,
    entities: &HashSet<String>,
) -> Result<DataUnionPatternAnalysis, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            Ok(DataUnionPatternAnalysis::CatchAll(Some(
                snake_to_lower_camel(&identifier.ident.to_string()),
            )))
        }
        Pat::Or(or_pattern) => {
            let mut variants = Vec::new();
            for pattern in &or_pattern.cases {
                match analyze_data_union_pattern(pattern, entities)? {
                    DataUnionPatternAnalysis::Variants(patterns) => variants.extend(patterns),
                    DataUnionPatternAnalysis::CatchAll(_) => {
                        return Err(compile_error(
                            "transparent data union `|` pattern cannot contain a catch-all",
                        ));
                    }
                    DataUnionPatternAnalysis::Ordinary => {
                        return Ok(DataUnionPatternAnalysis::Ordinary);
                    }
                }
            }
            Ok(DataUnionPatternAnalysis::Variants(variants))
        }
        Pat::Paren(paren) => analyze_data_union_pattern(&paren.pat, entities),
        Pat::Path(path) => {
            let Some((owner, variant)) = path_owner_and_member(&path.path) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            let Some(categories) = data_union_variant_categories(entities, &owner, &variant) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            if !data_union_unit(entities, &owner, &variant) {
                return Err(compile_error(format!(
                    "transparent data union payload variant `{owner}::{variant}` needs a payload pattern"
                )));
            }
            Ok(DataUnionPatternAnalysis::Variants(vec![DataUnionPattern {
                binding: None,
                categories,
                owner,
                variant,
            }]))
        }
        Pat::Reference(reference) => analyze_data_union_pattern(&reference.pat, entities),
        Pat::TupleStruct(pattern) => {
            let Some((owner, variant)) = path_owner_and_member(&pattern.path) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            let Some(categories) = data_union_variant_categories(entities, &owner, &variant) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            if data_union_unit(entities, &owner, &variant) || pattern.elems.len() != 1 {
                return Err(compile_error(format!(
                    "transparent data union pattern `{owner}::{variant}` expects exactly one payload"
                )));
            }
            Ok(DataUnionPatternAnalysis::Variants(vec![DataUnionPattern {
                binding: data_union_payload_binding(&pattern.elems[0])?,
                categories,
                owner,
                variant,
            }]))
        }
        Pat::Wild(_) => Ok(DataUnionPatternAnalysis::CatchAll(None)),
        _ => Ok(DataUnionPatternAnalysis::Ordinary),
    };
}

fn analyze_data_union_match(
    arms: &[syn::Arm],
    entities: &HashSet<String>,
) -> Result<Option<Vec<DataUnionMatchArm>>, CompileError> {
    let analyses = arms
        .iter()
        .map(|arm| analyze_data_union_pattern(&arm.pat, entities))
        .collect::<Result<Vec<_>, _>>()?;
    if !analyses
        .iter()
        .any(|analysis| matches!(analysis, DataUnionPatternAnalysis::Variants(_)))
    {
        return Ok(None);
    }
    let mut owner = None;
    let mut handled = BTreeMap::<RuntimeCategory, String>::new();
    let mut output = Vec::new();
    for (arm_index, analysis) in analyses.into_iter().enumerate() {
        match analysis {
            DataUnionPatternAnalysis::CatchAll(binding) => {
                if arm_index + 1 != arms.len() {
                    return Err(compile_error(
                        "transparent data union catch-all match arm must be last",
                    ));
                }
                output.push(DataUnionMatchArm {
                    binding,
                    categories: BTreeSet::new(),
                    catch_all: true,
                });
            }
            DataUnionPatternAnalysis::Ordinary => {
                return Err(compile_error(
                    "transparent data union match cannot mix data union and ordinary patterns",
                ));
            }
            DataUnionPatternAnalysis::Variants(patterns) => {
                let mut categories = BTreeSet::new();
                let mut binding = None::<Option<String>>;
                let mut labels = BTreeMap::<RuntimeCategory, String>::new();
                for pattern in patterns {
                    if let Some(expected) = &owner {
                        if expected != &pattern.owner {
                            return Err(compile_error(format!(
                                "transparent data union match cannot mix `{expected}` and `{}` variants",
                                pattern.owner
                            )));
                        }
                    } else {
                        owner = Some(pattern.owner.clone());
                    }
                    if binding
                        .as_ref()
                        .is_some_and(|binding| binding != &pattern.binding)
                    {
                        return Err(compile_error(
                            "transparent data union alternatives must bind the same payload name",
                        ));
                    }
                    binding.get_or_insert(pattern.binding);
                    let label = format!("{}::{}", pattern.owner, pattern.variant);
                    for category in pattern.categories {
                        categories.insert(category);
                        labels.entry(category).or_insert_with(|| label.clone());
                    }
                }
                for category in &categories {
                    let label = labels
                        .get(category)
                        .expect("every data union runtime category has a source variant");
                    if let Some(previous) = handled.get(category) {
                        return Err(compile_error(format!(
                            "transparent data union match arm `{label}` is unreachable after `{previous}` because both lower to the TypeScript `{}` runtime category",
                            category.name()
                        )));
                    }
                    handled.insert(*category, label.clone());
                }
                output.push(DataUnionMatchArm {
                    binding: binding.flatten(),
                    categories,
                    catch_all: false,
                });
            }
        }
    }
    return Ok(Some(output));
}

fn runtime_category_predicate(category: RuntimeCategory, value: &str) -> String {
    return match category {
        RuntimeCategory::Null => format!("{value} === null"),
        RuntimeCategory::Boolean => format!("typeof {value} === \"boolean\""),
        RuntimeCategory::Number => format!("typeof {value} === \"number\""),
        RuntimeCategory::String => format!("typeof {value} === \"string\""),
        RuntimeCategory::Array => format!("Array.isArray({value})"),
        RuntimeCategory::Record => format!(
            "typeof {value} === \"object\" && {value} !== null && !Array.isArray({value}) && (Object.getPrototypeOf({value}) === Object.prototype || Object.getPrototypeOf({value}) === null)"
        ),
        RuntimeCategory::Function => format!("typeof {value} === \"function\""),
        RuntimeCategory::Object => format!(
            "typeof {value} === \"object\" && {value} !== null && !Array.isArray({value}) && Object.getPrototypeOf({value}) !== Object.prototype && Object.getPrototypeOf({value}) !== null"
        ),
    };
}

fn runtime_categories_predicate(categories: &BTreeSet<RuntimeCategory>, value: &str) -> String {
    return categories
        .iter()
        .map(|category| runtime_category_predicate(*category, value))
        .map(|predicate| format!("({predicate})"))
        .collect::<Vec<_>>()
        .join(" || ");
}

fn emit_match_expression(
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if let Some(arms) = analyze_tagged_data_union_match(&expression.arms, entities)? {
        let mut out = String::new();
        out.push_str("(() => {\n  const matchValue = ");
        out.push_str(&emit_expression(&expression.expr, entities)?);
        out.push_str(";\n");
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if arm.guard.is_some() {
                return Err(compile_error("portable Rust match arms cannot use guards"));
            }
            if info.otherwise {
                if index == 0 {
                    out.push_str("  {\n");
                } else {
                    out.push_str("  else {\n");
                }
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(
                    out,
                    "  {prefix} ({}) {{",
                    tagged_data_union_predicate(&info.variants, "matchValue")
                )
                .expect("writing to a String cannot fail");
            }
            if let Some(binding) = info.catch_all_binding {
                writeln!(out, "    const {binding} = matchValue;")
                    .expect("writing to a String cannot fail");
            }
            for (binding, value) in tagged_data_union_bindings(&info.variants, "matchValue") {
                writeln!(out, "    const {binding} = {value};")
                    .expect("writing to a String cannot fail");
            }
            writeln!(out, "    return {};", emit_expression(&arm.body, entities)?)
                .expect("writing to a String cannot fail");
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    if let Some(arms) = analyze_data_union_match(&expression.arms, entities)? {
        let mut out = String::new();
        out.push_str("(() => {\n  const matchValue = ");
        out.push_str(&emit_expression(&expression.expr, entities)?);
        out.push_str(";\n");
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if arm.guard.is_some() {
                return Err(compile_error("portable Rust match arms cannot use guards"));
            }
            if info.catch_all {
                if index == 0 {
                    out.push_str("  {\n");
                } else {
                    out.push_str("  else {\n");
                }
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(
                    out,
                    "  {prefix} ({}) {{",
                    runtime_categories_predicate(&info.categories, "matchValue")
                )
                .expect("writing to a String cannot fail");
            }
            if let Some(binding) = info.binding {
                writeln!(out, "    const {binding} = matchValue;")
                    .expect("writing to a String cannot fail");
            }
            writeln!(out, "    return {};", emit_expression(&arm.body, entities)?)
                .expect("writing to a String cannot fail");
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    let mut out = String::new();
    out.push_str("(() => {\n  const matchValue = ");
    out.push_str(&emit_expression(&expression.expr, entities)?);
    out.push_str(";\n  switch (matchValue) {\n");
    for arm in &expression.arms {
        if arm.guard.is_some() {
            return Err(compile_error("portable Rust match arms cannot use guards"));
        }
        let patterns = emit_match_patterns(&arm.pat, entities)?;
        for pattern in patterns {
            if pattern == "default" {
                out.push_str("    default:\n");
            } else {
                writeln!(out, "    case {pattern}:").expect("writing to a String cannot fail");
            }
        }
        writeln!(
            out,
            "      return {};",
            emit_expression(&arm.body, entities)?
        )
        .expect("writing to a String cannot fail");
    }
    out.push_str("  }\n})()");
    return Ok(out);
}

fn emit_match_statement(
    out: &mut String,
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    if let Some(arms) = analyze_tagged_data_union_match(&expression.arms, entities)? {
        write_indent(out, indent);
        out.push_str("{\n");
        write_indent(out, indent + 1);
        writeln!(
            out,
            "const matchValue = {};",
            emit_expression(&expression.expr, entities)?
        )
        .expect("writing to a String cannot fail");
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if arm.guard.is_some() {
                return Err(compile_error("portable Rust match arms cannot use guards"));
            }
            write_indent(out, indent + 1);
            if info.otherwise {
                if index == 0 {
                    out.push_str("{\n");
                } else {
                    out.push_str("else {\n");
                }
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(
                    out,
                    "{prefix} ({}) {{",
                    tagged_data_union_predicate(&info.variants, "matchValue")
                )
                .expect("writing to a String cannot fail");
            }
            if let Some(binding) = info.catch_all_binding {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = matchValue;")
                    .expect("writing to a String cannot fail");
            }
            for (binding, value) in tagged_data_union_bindings(&info.variants, "matchValue") {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = {value};")
                    .expect("writing to a String cannot fail");
            }
            match arm.body.as_ref() {
                Expr::Block(block) => emit_block(out, &block.block.stmts, entities, indent + 2)?,
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    entities,
                    indent + 2,
                )?,
            }
            write_indent(out, indent + 1);
            out.push_str("}\n");
        }
        write_indent(out, indent);
        out.push_str("}\n");
        return Ok(());
    }
    if let Some(arms) = analyze_data_union_match(&expression.arms, entities)? {
        write_indent(out, indent);
        out.push_str("{\n");
        write_indent(out, indent + 1);
        writeln!(
            out,
            "const matchValue = {};",
            emit_expression(&expression.expr, entities)?
        )
        .expect("writing to a String cannot fail");
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if arm.guard.is_some() {
                return Err(compile_error("portable Rust match arms cannot use guards"));
            }
            write_indent(out, indent + 1);
            if info.catch_all {
                if index == 0 {
                    out.push_str("{\n");
                } else {
                    out.push_str("else {\n");
                }
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(
                    out,
                    "{prefix} ({}) {{",
                    runtime_categories_predicate(&info.categories, "matchValue")
                )
                .expect("writing to a String cannot fail");
            }
            if let Some(binding) = info.binding {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = matchValue;")
                    .expect("writing to a String cannot fail");
            }
            match arm.body.as_ref() {
                Expr::Block(block) => emit_block(out, &block.block.stmts, entities, indent + 2)?,
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    entities,
                    indent + 2,
                )?,
            }
            write_indent(out, indent + 1);
            out.push_str("}\n");
        }
        write_indent(out, indent);
        out.push_str("}\n");
        return Ok(());
    }
    write_indent(out, indent);
    writeln!(
        out,
        "switch ({}) {{",
        emit_expression(&expression.expr, entities)?
    )
    .expect("writing to a String cannot fail");
    for arm in &expression.arms {
        if arm.guard.is_some() {
            return Err(compile_error("portable Rust match arms cannot use guards"));
        }
        for pattern in emit_match_patterns(&arm.pat, entities)? {
            write_indent(out, indent + 1);
            if pattern == "default" {
                out.push_str("default:\n");
            } else {
                writeln!(out, "case {pattern}:").expect("writing to a String cannot fail");
            }
        }
        match arm.body.as_ref() {
            Expr::Block(block) => emit_block(out, &block.block.stmts, entities, indent + 2)?,
            expression => emit_statement(
                out,
                &Stmt::Expr(expression.clone(), None),
                entities,
                indent + 2,
            )?,
        }
        write_indent(out, indent + 2);
        out.push_str("break;\n");
    }
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

fn emit_match_patterns(
    pattern: &Pat,
    entities: &HashSet<String>,
) -> Result<Vec<String>, CompileError> {
    return match pattern {
        Pat::Lit(literal) => Ok(vec![emit_literal(&literal.lit)?]),
        Pat::Or(or_pattern) => {
            let mut patterns = Vec::new();
            for pattern in &or_pattern.cases {
                patterns.extend(emit_match_patterns(pattern, entities)?);
            }
            Ok(patterns)
        }
        Pat::Path(path) => Ok(vec![emit_expression(
            &Expr::Path(syn::ExprPath {
                attrs: Vec::new(),
                qself: path.qself.clone(),
                path: path.path.clone(),
            }),
            entities,
        )?]),
        Pat::Wild(_) => Ok(vec!["default".to_string()]),
        _ => Err(compile_error("unsupported portable Rust match pattern")),
    };
}

fn emit_member(member: &syn::Member) -> String {
    return match member {
        syn::Member::Named(identifier) => snake_to_lower_camel(&identifier.to_string()),
        syn::Member::Unnamed(index) => index.index.to_string(),
    };
}

fn emit_method_call(
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if call.method == "wrapping_add"
        && call.args.len() == 1
        && let Expr::MethodCall(fetch) = call.receiver.as_ref()
        && fetch.method == "fetch_add"
        && fetch.args.len() == 2
    {
        let increment = emit_expression(&fetch.args[0], entities)?;
        let wrapped_increment = emit_expression(&call.args[0], entities)?;
        if increment == wrapped_increment {
            let state = emit_expression(&fetch.receiver, entities)?;
            return Ok(format!(
                "({state}.value = ({state}.value + {increment}) >>> 0)"
            ));
        }
    }
    let receiver = emit_expression(&call.receiver, entities)?;
    let arguments = call
        .args
        .iter()
        .map(|argument| emit_expression(argument, entities))
        .collect::<Result<Vec<_>, _>>()?;
    let method = call.method.to_string();
    if method == "fold" && arguments.len() == 2 {
        let reducer = match arguments[1].as_str() {
            "Math.max" => "(left, right) => Math.max(left, right)",
            "Math.min" => "(left, right) => Math.min(left, right)",
            reducer => reducer,
        };
        return Ok(format!("{receiver}.reduce({reducer}, {})", arguments[0]));
    }
    return match method.as_str() {
        "abs" if arguments.is_empty() => Ok(format!("Math.abs({receiver})")),
        "acos" if arguments.is_empty() => Ok(format!("Math.acos({receiver})")),
        "all" if arguments.len() == 1 => Ok(format!("{receiver}.every({})", arguments[0])),
        "any" if arguments.len() == 1 => Ok(format!("{receiver}.some({})", arguments[0])),
        "asin" if arguments.is_empty() => Ok(format!("Math.asin({receiver})")),
        "atan" if arguments.is_empty() => Ok(format!("Math.atan({receiver})")),
        "atan2" if arguments.len() == 1 => Ok(format!("Math.atan2({receiver}, {})", arguments[0])),
        "ceil" if arguments.is_empty() => Ok(format!("Math.ceil({receiver})")),
        "cbrt" if arguments.is_empty() => Ok(format!("Math.cbrt({receiver})")),
        "clear" if arguments.is_empty() => Ok(format!("{receiver}.length = 0")),
        "clamp" if arguments.len() == 2 => Ok(format!(
            "Math.min({}, Math.max({}, {receiver}))",
            arguments[1], arguments[0]
        )),
        "cos" if arguments.is_empty() => Ok(format!("Math.cos({receiver})")),
        "clone" if arguments.is_empty() && expression_contains_method(&call.receiver, "lock") => {
            Ok(format!("{receiver}.value"))
        }
        "clone"
            if arguments.is_empty()
                && entities.contains(&format!("{VEC_CLONE_EXPRESSION_MARKER}{receiver}:true")) =>
        {
            Ok(format!("{receiver}?.slice()"))
        }
        "clone"
            if arguments.is_empty()
                && entities.contains(&format!("{VEC_CLONE_EXPRESSION_MARKER}{receiver}:false")) =>
        {
            Ok(format!("{receiver}.slice()"))
        }
        "clone"
            if arguments.is_empty()
                && referenced_path_identifier(&call.receiver).is_some_and(|identifier| {
                    entities.contains(&format!("{RECORD_CLONE_LOCAL_MARKER}{identifier}"))
                }) =>
        {
            let prefix = format!("{VEC_CLONE_EXPRESSION_MARKER}{receiver}.");
            let mut fields = entities
                .iter()
                .filter_map(|marker| marker.strip_prefix(&prefix))
                .filter_map(|suffix| suffix.rsplit_once(':'))
                .map(|(field, optional)| {
                    let clone = if optional == "true" {
                        format!("{receiver}.{field}?.slice()")
                    } else {
                        format!("{receiver}.{field}.slice()")
                    };
                    format!("{field}: {clone}")
                })
                .collect::<Vec<_>>();
            fields.sort();
            let fields = if fields.is_empty() {
                String::new()
            } else {
                format!(", {}", fields.join(", "))
            };
            Ok(format!("{{ ...{receiver}{fields} }}"))
        }
        "clone" if arguments.is_empty() => Ok(receiver),
        "collect" if arguments.is_empty() => Ok(receiver),
        "contains" if arguments.len() == 1 => Ok(format!("{receiver}.includes({})", arguments[0])),
        "encode_utf16" if arguments.is_empty() => Ok(format!(
            "Array.from({{ length: {receiver}.length }}, (_, index) => {receiver}.charCodeAt(index))"
        )),
        "exp" if arguments.is_empty() => Ok(format!("Math.exp({receiver})")),
        "expect" if arguments.len() == 1 => Ok(format!(
            "(() => {{ const value = {receiver}; if (value === undefined) throw new Error({}); return value; }})()",
            arguments[0]
        )),
        "find" if arguments.len() == 1 => Ok(format!("{receiver}.find({})", arguments[0])),
        "floor" if arguments.is_empty() => Ok(format!("Math.floor({receiver})")),
        "filter" if arguments.len() == 1 => Ok(format!("{receiver}.filter({})", arguments[0])),
        "fetch_add" if arguments.len() == 2 => Ok(format!(
            "(() => {{ const previous = {receiver}.value; {receiver}.value = ({receiver}.value + {}) >>> 0; return previous; }})()",
            arguments[0]
        )),
        "is_nan" if arguments.is_empty() => Ok(format!("Number.isNaN({receiver})")),
        "is_finite" if arguments.is_empty() => Ok(format!("Number.isFinite({receiver})")),
        "is_none" if arguments.is_empty() => Ok(format!("{receiver} === undefined")),
        "is_some" if arguments.is_empty() => Ok(format!("{receiver} !== undefined")),
        "is_empty" if arguments.is_empty() => Ok(format!("{receiver}.length === 0")),
        "into" if arguments.is_empty() => Ok(receiver),
        "into_iter" if arguments.is_empty() => Ok(receiver),
        "iter" if arguments.is_empty() => Ok(receiver),
        "as_ref" if arguments.is_empty() => Ok(receiver),
        "as_mut" if arguments.is_empty() => Ok(receiver),
        "as_deref" if arguments.is_empty() => Ok(receiver),
        "len" if arguments.is_empty() => Ok(format!("{receiver}.length")),
        "get" if arguments.is_empty() => Ok(format!("{receiver}.value")),
        "ln" if arguments.is_empty() => Ok(format!("Math.log({receiver})")),
        "map" if arguments.len() == 1 => Ok(format!("{receiver}.map({})", arguments[0])),
        "max" if arguments.len() == 1 => Ok(format!("Math.max({receiver}, {})", arguments[0])),
        "min" if arguments.len() == 1 => Ok(format!("Math.min({receiver}, {})", arguments[0])),
        "powf" if arguments.len() == 1 => Ok(format!("Math.pow({receiver}, {})", arguments[0])),
        "powi" if arguments.len() == 1 => Ok(format!("Math.pow({receiver}, {})", arguments[0])),
        "partial_cmp" if arguments.len() == 1 => Ok(format!("{receiver} - {}", arguments[0])),
        "push" if arguments.len() == 1 => Ok(format!("{receiver}.push({})", arguments[0])),
        "round" if arguments.is_empty() => Ok(format!("Math.round({receiver})")),
        "set" if arguments.len() == 1 => Ok(format!("{receiver}.value = {}", arguments[0])),
        "signum" if arguments.is_empty() => Ok(format!("Math.sign({receiver})")),
        "sin" if arguments.is_empty() => Ok(format!("Math.sin({receiver})")),
        "skip" if arguments.len() == 1 => Ok(format!("{receiver}.slice({})", arguments[0])),
        "sqrt" if arguments.is_empty() => Ok(format!("Math.sqrt({receiver})")),
        "starts_with"
            if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.startsWith({})", arguments[0]))
        }
        "starts_with" if arguments.len() == 1 => Err(compile_error(
            "portable `.starts_with()` requires a receiver known to be `String` or `str`",
        )),
        "sum" if arguments.is_empty() => {
            Ok(format!("{receiver}.reduce((sum, value) => sum + value, 0)"))
        }
        "sort_by" if arguments.len() == 1 => Ok(format!("{receiver}.sort({})", arguments[0])),
        "sort" if arguments.is_empty() => Ok(format!("{receiver}.sort((a, b) => a - b)")),
        "swap" if arguments.len() == 2 => Ok(format!(
            "([{receiver}[{}], {receiver}[{}]] = [{receiver}[{}], {receiver}[{}]])",
            arguments[0], arguments[1], arguments[1], arguments[0]
        )),
        "tan" if arguments.is_empty() => Ok(format!("Math.tan({receiver})")),
        "to_string"
            if arguments.is_empty()
                && matches!(call.receiver.as_ref(), Expr::Lit(literal) if matches!(&literal.lit, Lit::Str(_))) =>
        {
            Ok(receiver)
        }
        "to_string" if arguments.is_empty() => Ok(format!("String({receiver})")),
        "trunc" if arguments.is_empty() => Ok(format!("Math.trunc({receiver})")),
        "to_vec" if arguments.is_empty() => Ok(format!("[...{receiver}]")),
        "extend_from_slice" if arguments.len() == 1 => {
            Ok(format!("{receiver}.push(...{})", arguments[0]))
        }
        "wrapping_add" if arguments.len() == 1 => {
            Ok(format!("(({receiver}) + {}) >>> 0", arguments[0]))
        }
        "wrapping_mul" if arguments.len() == 1 => {
            Ok(format!("Math.imul(({receiver}), {}) >>> 0", arguments[0]))
        }
        "wrapping_shr" if arguments.len() == 1 => Ok(format!("({receiver}) >>> {}", arguments[0])),
        "windows" if arguments.len() == 1 => Ok(format!(
            "Array.from({{ length: Math.max(0, {receiver}.length - {} + 1) }}, (_, index) => {receiver}.slice(index, index + {}))",
            arguments[0], arguments[0]
        )),
        "lock" if arguments.is_empty() => Ok(receiver),
        "read" | "write" if arguments.is_empty() => Ok(receiver),
        "unwrap_or_else"
            if arguments.len() == 1 && expression_contains_method(&call.receiver, "lock") =>
        {
            Ok(receiver)
        }
        "unwrap_or"
            if arguments.len() == 1
                && expression_contains_method(&call.receiver, "partial_cmp") =>
        {
            Ok(receiver)
        }
        "unwrap_or" if arguments.len() == 1 => Ok(format!("({receiver} ?? {})", arguments[0])),
        "unwrap" if arguments.is_empty() => Ok(format!("{receiver}!")),
        _ => Err(compile_error(format!(
            "unsupported Rust method call `.{method}()`; impl sugar is not a transpilation source"
        ))),
    };
}

fn emit_option_binding(
    condition: &Expr,
    entities: &HashSet<String>,
) -> Result<Option<(String, String, &'static str)>, CompileError> {
    let Expr::Let(binding) = condition else {
        return Ok(None);
    };
    let Pat::TupleStruct(pattern) = &*binding.pat else {
        return Err(compile_error(
            "portable `if let` supports only a `Some(name)` pattern",
        ));
    };
    if !pattern.path.is_ident("Some") || pattern.elems.len() != 1 {
        return Err(compile_error(
            "portable `if let` supports only a `Some(name)` pattern",
        ));
    }
    let Pat::Ident(identifier) = &pattern.elems[0] else {
        return Err(compile_error(
            "portable `if let Some` binding needs an identifier",
        ));
    };
    let absent = if let Expr::Path(path) = binding.expr.as_ref()
        && path.qself.is_none()
        && path.path.segments.len() == 1
        && let Some(segment) = path.path.segments.first()
        && entities.contains(&format!("@nullable:{}", segment.ident))
    {
        "null"
    } else {
        "undefined"
    };
    return Ok(Some((
        snake_to_lower_camel(&identifier.ident.to_string()),
        emit_expression(&binding.expr, entities)?,
        absent,
    )));
}

pub(crate) fn emit_parameter(
    argument: &FnArg,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return emit_parameter_with_aliases(argument, entities, &PreferredAliases::new(), false, false);
}

fn emit_parameter_with_aliases(
    argument: &FnArg,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    optional: bool,
    nullable: bool,
) -> Result<String, CompileError> {
    let FnArg::Typed(argument) = argument else {
        return Err(compile_error(
            "free-function contract cannot contain a self receiver",
        ));
    };
    let Pat::Ident(pattern) = argument.pat.as_ref() else {
        return Err(compile_error(
            "unsupported destructuring in function parameter",
        ));
    };
    let name = snake_to_lower_camel(&pattern.ident.to_string());
    if optional {
        let Some(inner) = option_inner_type(&argument.ty) else {
            return Err(compile_error(
                "only trailing Option parameters can be emitted as optional",
            ));
        };
        return Ok(format!(
            "{name}?: {}",
            emit_preferred_type(inner, entities, aliases)?
        ));
    }
    if nullable {
        let Some(inner) = option_inner_type(&argument.ty) else {
            return Err(compile_error("nullable guard parameter must use Option"));
        };
        return Ok(format!(
            "{name}: {}",
            nullable_type(emit_preferred_type(inner, entities, aliases)?)
        ));
    }
    return Ok(format!(
        "{name}: {}",
        emit_preferred_type(&argument.ty, entities, aliases)?
    ));
}

fn emit_path_segment(segment: &str) -> String {
    if segment.chars().all(|character| {
        character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
    }) {
        return segment.to_string();
    }
    return snake_to_lower_camel(segment);
}

pub(crate) fn emit_pattern(pattern: &Pat) -> Result<String, CompileError> {
    return match pattern {
        Pat::Ident(identifier) => Ok(snake_to_lower_camel(&identifier.ident.to_string())),
        Pat::Reference(reference) => emit_pattern(&reference.pat),
        Pat::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(emit_pattern)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Pat::Wild(_) => Ok("_".to_string()),
        _ => Err(compile_error("unsupported portable loop pattern")),
    };
}

fn emit_preferred_type(
    rust_type: &Type,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
) -> Result<String, CompileError> {
    let rendered = emit_type(rust_type, entities)?;
    return Ok(aliases.get(&rendered).cloned().unwrap_or(rendered));
}

fn emit_type_with_aliases(
    rust_type: &Type,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_types: &HashSet<String>,
) -> Result<String, CompileError> {
    let Type::Path(path) = rust_type else {
        return emit_preferred_type(rust_type, entities, aliases);
    };
    let Some(segment) = path.path.segments.last() else {
        return Err(compile_error("empty Rust type path"));
    };
    let name = segment.ident.to_string();
    if matches!(name.as_str(), "Option" | "Vec" | "Mutex" | "Arc" | "Ref") {
        let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
            return emit_preferred_type(rust_type, entities, aliases);
        };
        let Some(inner) = arguments.args.iter().find_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(rust_type),
            _ => None,
        }) else {
            return emit_preferred_type(rust_type, entities, aliases);
        };
        let inner = emit_type_with_aliases(inner, entities, aliases, nullable_types)?;
        return Ok(match name.as_str() {
            "Option" if nullable_types.contains(&inner) => nullable_type(inner),
            "Option" => format!("{inner} | undefined"),
            "Vec" => array_type(inner),
            "Mutex" => format!("{{ value: {inner} }}"),
            "Arc" if is_primitive_typescript_type(&inner) => inner,
            "Arc" => format!("Readonly<{inner}>"),
            "Ref" => inner,
            _ => unreachable!(),
        });
    }
    return emit_preferred_type(rust_type, entities, aliases);
}

fn nullable_guard_types(
    programs: &[&Program],
    aliases: &PreferredAliases,
    type_context: &HashSet<String>,
) -> Result<HashSet<String>, CompileError> {
    let mut types = HashSet::new();
    for program in programs {
        for function in &program.functions {
            for argument in &function.sig.inputs {
                if argument_is_nullable_guard(function, argument)
                    && let FnArg::Typed(argument) = argument
                    && let Some(inner) = option_inner_type(&argument.ty)
                {
                    types.insert(emit_preferred_type(inner, type_context, aliases)?);
                }
            }
        }
    }
    return Ok(types);
}

fn type_contains_nullable(
    rust_type: &Type,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_types: &HashSet<String>,
) -> Result<bool, CompileError> {
    return Ok(
        emit_type_with_aliases(rust_type, entities, aliases, nullable_types)?.contains(" | null"),
    );
}

struct ExternalIdentityAlias {
    module: String,
    tag: String,
}

fn external_identity_aliases(
    external_alias_programs: &[(BTreeMap<String, String>, &str)],
) -> Result<BTreeMap<String, ExternalIdentityAlias>, CompileError> {
    let mut aliases = BTreeMap::new();
    for (identity_aliases, module) in external_alias_programs {
        for (name, tag) in identity_aliases {
            if aliases
                .insert(
                    name.clone(),
                    ExternalIdentityAlias {
                        module: (*module).to_string(),
                        tag: tag.clone(),
                    },
                )
                .is_some()
            {
                return Err(compile_error(format!(
                    "external identity alias `{name}` is declared by more than one source"
                )));
            }
        }
    }
    return Ok(aliases);
}

fn identity_alias_marker(name: &str, tag: &str) -> String {
    return format!("{IDENTITY_ALIAS_MARKER}{name}:{tag}");
}

fn identity_alias_tag<'a>(context: &'a HashSet<String>, name: &str) -> Option<&'a str> {
    let prefix = format!("{IDENTITY_ALIAS_MARKER}{name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

fn used_identity_aliases(
    program: &Program,
    aliases: &BTreeMap<String, ExternalIdentityAlias>,
) -> BTreeSet<String> {
    struct Collector<'a> {
        aliases: &'a BTreeMap<String, ExternalIdentityAlias>,
        names: BTreeSet<String>,
    }

    impl<'ast> Visit<'ast> for Collector<'_> {
        fn visit_type_path(&mut self, rust_type: &'ast syn::TypePath) {
            if let Some(segment) = rust_type.path.segments.last() {
                let name = segment.ident.to_string();
                if self.aliases.contains_key(&name) {
                    self.names.insert(name);
                }
            }
            syn::visit::visit_type_path(self, rust_type);
        }
    }

    let mut collector = Collector {
        aliases,
        names: BTreeSet::new(),
    };
    for constant in &program.constants {
        collector.visit_item_const(constant);
    }
    for rust_enum in &program.enums {
        collector.visit_item_enum(rust_enum);
    }
    for function in &program.functions {
        collector.visit_item_fn(function);
    }
    for rust_static in &program.statics {
        collector.visit_item_static(rust_static);
    }
    for structure in &program.structs {
        collector.visit_item_struct(structure);
    }
    for type_alias in &program.type_aliases {
        collector.visit_item_type(type_alias);
    }
    return collector.names;
}

// flight-lint: allow(hashmap-iteration) Program constants are a Vec retained in Rust source order; the rule's name heuristic cannot see the field type across modules
pub(crate) fn emit_program(
    program: &Program,
    entity_module: Option<&str>,
    alias_programs: &[Program],
    external_alias_programs: &[(BTreeMap<String, String>, &str)],
) -> Result<String, CompileError> {
    let programs = std::iter::once(program)
        .chain(alias_programs)
        .collect::<Vec<_>>();
    let uses_allocate_entity = program
        .functions
        .iter()
        .any(|function| expression_contains_path(&function.block, "allocate_entity"));
    let aliases = preferred_aliases(program, alias_programs)?;
    let external_identity_aliases = external_identity_aliases(external_alias_programs)?;
    let used_identity_aliases = used_identity_aliases(program, &external_identity_aliases);
    let mut identity_context = HashSet::new();
    for (name, alias) in &external_identity_aliases {
        identity_context.insert(identity_alias_marker(name, &alias.tag));
    }
    let expression_context = generation_context_with_types(&programs, &identity_context)?;
    let nullable_types = nullable_guard_types(&programs, &aliases, &expression_context)?;
    let nullable_static_names = program
        .statics
        .iter()
        .filter_map(|rust_static| {
            type_contains_nullable(
                &rust_static.ty,
                &expression_context,
                &aliases,
                &nullable_types,
            )
            .ok()
            .filter(|contains| *contains)
            .map(|_| rust_static.ident.to_string())
        })
        .collect::<HashSet<_>>();
    let mut out = String::new();

    let entity_module = if uses_allocate_entity || !program.entities.is_empty() {
        Some(entity_module.ok_or_else(|| {
            compile_error(
                "this Rust module uses entity runtime types; provide a TypeScript entity module",
            )
        })?)
    } else {
        None
    };
    if uses_allocate_entity {
        writeln!(
            out,
            "import {{ allocateEntity }} from {:?};",
            entity_module.expect("entity module was required")
        )
        .expect("writing to a String cannot fail");
    }
    let mut type_imports = BTreeMap::<String, BTreeSet<String>>::new();
    if !program.entities.is_empty() {
        type_imports
            .entry(
                entity_module
                    .expect("entity module was required")
                    .to_string(),
            )
            .or_default()
            .insert("EntityRaw".to_string());
    }
    for name in used_identity_aliases {
        let alias = external_identity_aliases
            .get(&name)
            .expect("used identity alias came from the external alias map");
        type_imports
            .entry(alias.module.clone())
            .or_default()
            .insert(name);
    }
    for (module, names) in &type_imports {
        writeln!(
            out,
            "import type {{ {} }} from {:?};",
            names.iter().cloned().collect::<Vec<_>>().join(", "),
            module
        )
        .expect("writing to a String cannot fail");
    }
    if uses_allocate_entity || !type_imports.is_empty() {
        out.push('\n');
    }
    if program.standard_constants.contains("PI") {
        out.push_str("const PI = Math.PI;\n\n");
    }

    for rust_enum in &program.enums {
        emit_enum(
            &mut out,
            rust_enum,
            program.string_unions.contains(&rust_enum.ident.to_string()),
            program.data_unions.contains(&rust_enum.ident.to_string()),
            &expression_context,
        )?;
        out.push('\n');
    }
    for type_alias in &program.type_aliases {
        emit_type_alias(
            &mut out,
            type_alias,
            &expression_context,
            program
                .callable_parameters
                .get(&type_alias.ident.to_string())
                .map(Vec::as_slice),
        )?;
        out.push('\n');
    }
    for structure in &program.structs {
        emit_struct(
            &mut out,
            structure,
            &expression_context,
            &aliases,
            program
                .readonly_structs
                .contains(&structure.ident.to_string()),
        )?;
        out.push('\n');
    }
    for constant in &program.constants {
        emit_constant(
            &mut out,
            constant,
            &expression_context,
            program
                .frozen_objects
                .get(&constant.ident.to_string())
                .map(String::as_str),
        )?;
        out.push('\n');
    }
    for rust_static in &program.statics {
        emit_static(
            &mut out,
            rust_static,
            &expression_context,
            &aliases,
            &nullable_types,
        )?;
        out.push('\n');
    }
    for (index, function) in program.functions.iter().enumerate() {
        emit_function(
            &mut out,
            function,
            &expression_context,
            &aliases,
            &nullable_static_names,
        )?;
        if index + 1 < program.functions.len() {
            out.push('\n');
        }
    }
    return Ok(out);
}

fn emit_single_expression_block(
    block: &syn::Block,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let [Stmt::Expr(expression, _)] = block.stmts.as_slice() else {
        return Err(compile_error(
            "Rust value block must contain exactly one expression",
        ));
    };
    return emit_expression(expression, entities);
}

fn emit_single_generic_type(
    segment: &syn::PathSegment,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return Err(compile_error(format!(
            "`{}` needs one type argument",
            segment.ident
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
    if types.len() != 1 {
        return Err(compile_error(format!(
            "`{}` needs exactly one type argument",
            segment.ident
        )));
    }
    return emit_type(types[0], entities);
}

fn emit_statement(
    out: &mut String,
    statement: &Stmt,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    match statement {
        Stmt::Local(local) => emit_local(out, local, entities, indent)?,
        Stmt::Expr(Expr::Call(call), _) if throw_call(call).is_some() => {
            let (constructor, message) = throw_call(call).expect("guarded by the match condition");
            write_indent(out, indent);
            writeln!(
                out,
                "throw new {constructor}({});",
                emit_expression(message, entities)?
            )
            .expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::If(if_expression), _) => {
            let option_binding = emit_option_binding(&if_expression.cond, entities)?;
            write_indent(out, indent);
            if let Some((_, value, absent)) = &option_binding {
                writeln!(out, "if ({value} !== {absent}) {{")
                    .expect("writing to a String cannot fail");
            } else {
                writeln!(
                    out,
                    "if ({}) {{",
                    emit_expression(&if_expression.cond, entities)?
                )
                .expect("writing to a String cannot fail");
            }
            if let Some((name, value, _)) = option_binding {
                write_indent(out, indent + 1);
                writeln!(out, "const {name} = {value};").expect("writing to a String cannot fail");
            }
            emit_block(out, &if_expression.then_branch.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            if let Some((_, otherwise)) = &if_expression.else_branch {
                out.push_str("} else {");
                out.push('\n');
                match otherwise.as_ref() {
                    Expr::Block(block) => {
                        emit_block(out, &block.block.stmts, entities, indent + 1)?;
                    }
                    Expr::If(nested) => {
                        emit_statement(
                            out,
                            &Stmt::Expr(Expr::If(nested.clone()), None),
                            entities,
                            indent + 1,
                        )?;
                    }
                    _ => {
                        return Err(compile_error("unsupported non-block else expression"));
                    }
                }
                write_indent(out, indent);
                out.push_str("}\n");
            } else {
                out.push_str("}\n");
            }
        }
        Stmt::Expr(Expr::ForLoop(loop_expression), _) => {
            write_indent(out, indent);
            writeln!(
                out,
                "for ({}) {{",
                emit_for_header(&loop_expression.pat, &loop_expression.expr, entities)?
            )
            .expect("writing to a String cannot fail");
            emit_block(out, &loop_expression.body.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::While(loop_expression), _) => {
            write_indent(out, indent);
            writeln!(
                out,
                "while ({}) {{",
                emit_expression(&loop_expression.cond, entities)?
            )
            .expect("writing to a String cannot fail");
            emit_block(out, &loop_expression.body.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Loop(loop_expression), _) => {
            write_indent(out, indent);
            out.push_str("for (;;) {\n");
            emit_block(out, &loop_expression.body.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Match(match_expression), _) => {
            emit_match_statement(out, match_expression, entities, indent)?;
        }
        Stmt::Expr(Expr::Break(_), _) => {
            write_indent(out, indent);
            out.push_str("break;\n");
        }
        Stmt::Expr(Expr::Continue(_), _) => {
            write_indent(out, indent);
            out.push_str("continue;\n");
        }
        Stmt::Expr(Expr::Return(return_expression), _) => {
            write_indent(out, indent);
            if let Some(value) = &return_expression.expr {
                let mut value = if expression_is_path_call(value, "allocate_entity") {
                    let return_type = entities
                        .iter()
                        .find_map(|marker| marker.strip_prefix(RETURN_TYPE_MARKER))
                        .ok_or_else(|| {
                            compile_error("allocate_entity return needs an explicit Rust type")
                        })?;
                    entity_allocation(return_type, entities)?
                } else {
                    emit_expression(value, entities)?
                };
                if entities.contains(RETURNS_U32_MARKER) {
                    value = format!("({value}) >>> 0");
                }
                writeln!(out, "return {value};").expect("writing to a String cannot fail");
            } else {
                out.push_str("return;\n");
            }
        }
        Stmt::Expr(expression, _) => {
            write_indent(out, indent);
            writeln!(out, "{};", emit_expression(expression, entities)?)
                .expect("writing to a String cannot fail");
        }
        Stmt::Item(_) => {
            return Err(compile_error(
                "unsupported item declaration inside function body",
            ));
        }
        Stmt::Macro(statement)
            if statement
                .mac
                .path
                .segments
                .last()
                .is_some_and(|name| name.ident == "unreachable") =>
        {
            write_indent(out, indent);
            writeln!(
                out,
                "throw new Error({});",
                emit_unreachable_message(&statement.mac, entities)?
            )
            .expect("writing to a String cannot fail");
        }
        Stmt::Macro(_) => {
            return Err(compile_error(
                "unsupported macro statement inside function body",
            ));
        }
    }
    return Ok(());
}

fn emit_static(
    out: &mut String,
    rust_static: &syn::ItemStatic,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_types: &HashSet<String>,
) -> Result<(), CompileError> {
    emit_documentation(out, &rust_static.attrs, 0);
    let export = if is_public(&rust_static.vis) {
        "export "
    } else {
        ""
    };
    let typescript_type =
        emit_type_with_aliases(&rust_static.ty, entities, aliases, nullable_types)?;
    let mut value = emit_expression(&rust_static.expr, entities)?;
    if typescript_type.contains(" | null") {
        value = value.replace("undefined", "null");
    }
    writeln!(
        out,
        "{export}const {}: {} = {};",
        rust_static.ident, typescript_type, value
    )
    .expect("writing to a String cannot fail");
    return Ok(());
}

fn emit_struct(
    out: &mut String,
    structure: &ItemStruct,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    readonly: bool,
) -> Result<(), CompileError> {
    emit_documentation(out, &structure.attrs, 0);
    let rust_name = structure.ident.to_string();
    let entity = entities.contains(&rust_name);
    let name = if entity {
        format!("{rust_name}Raw")
    } else {
        rust_name
    };
    let export = if is_public(&structure.vis) {
        "export "
    } else {
        ""
    };
    let module_private_plain_data = !is_public(&structure.vis) && !entity;
    let extension = if entity { " extends EntityRaw" } else { "" };
    writeln!(out, "{export}interface {name}{extension} {{")
        .expect("writing to a String cannot fail");
    for field in &structure.fields {
        if !module_private_plain_data && !is_public(&field.vis) {
            continue;
        }
        emit_documentation(out, &field.attrs, 1);
        let Some(field_name) = &field.ident else {
            return Err(compile_error(format!(
                "unnamed field on `{}` cannot be transpiled",
                structure.ident
            )));
        };
        let name = snake_to_lower_camel(&field_name.to_string());
        let prefix = if readonly { "readonly " } else { "" };
        let (optional, rust_type) = if let Some(inner) = option_inner_type(&field.ty) {
            ("?", inner)
        } else {
            ("", &field.ty)
        };
        writeln!(
            out,
            "  {prefix}{name}{optional}: {};",
            emit_preferred_type(rust_type, entities, aliases)?
        )
        .expect("writing to a String cannot fail");
    }
    out.push_str("}\n");
    return Ok(());
}

pub(crate) fn emit_type(
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return match rust_type {
        Type::Array(array) => {
            if let Some(array_type) = typed_array_for_type(&array.elem) {
                Ok(array_type.to_string())
            } else {
                Ok(array_type(emit_type(&array.elem, entities)?))
            }
        }
        Type::Paren(paren) => emit_type(&paren.elem, entities),
        Type::Path(path) => {
            let Some(segment) = path.path.segments.last() else {
                return Err(compile_error("empty Rust type path"));
            };
            let name = segment.ident.to_string();
            if let Some(tag) = identity_alias_tag(entities, &name) {
                let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                    return Err(compile_error(format!(
                        "identity alias `{name}` needs exactly one type argument"
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
                if types.len() != 1 {
                    return Err(compile_error(format!(
                        "identity alias `{name}` needs exactly one type argument"
                    )));
                }
                return Ok(format!(
                    "{name}<{}, {tag:?}>",
                    emit_type(types[0], entities)?
                ));
            }
            match name.as_str() {
                "bool" => Ok("boolean".to_string()),
                "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32"
                | "u64" | "usize" => Ok("number".to_string()),
                "String" | "str" => Ok("string".to_string()),
                "UnknownValue" => Ok("unknown".to_string()),
                "Option" => {
                    let inner = emit_single_generic_type(segment, entities)?;
                    if inner.contains("=>") {
                        Ok(format!("({inner}) | undefined"))
                    } else {
                        Ok(format!("{inner} | undefined"))
                    }
                }
                "Vec" => Ok(array_type(emit_single_generic_type(segment, entities)?)),
                "Mutex" => Ok(format!(
                    "{{ value: {} }}",
                    emit_single_generic_type(segment, entities)?
                )),
                "AtomicU32" => Ok("{ value: number }".to_string()),
                "Arc" => {
                    let inner = emit_single_generic_type(segment, entities)?;
                    if is_primitive_typescript_type(&inner) {
                        Ok(inner)
                    } else {
                        Ok(format!("Readonly<{inner}>"))
                    }
                }
                "Ref" => emit_single_generic_type(segment, entities),
                _ if entities.contains(&name) => Ok(format!("{name}Raw")),
                _ => {
                    if matches!(segment.arguments, PathArguments::None) {
                        Ok(name)
                    } else {
                        let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                            return Err(compile_error(format!(
                                "unsupported parenthesized type arguments on `{name}`"
                            )));
                        };
                        let rendered = arguments
                            .args
                            .iter()
                            .filter_map(|argument| match argument {
                                GenericArgument::Type(rust_type) => {
                                    Some(emit_type(rust_type, entities))
                                }
                                _ => None,
                            })
                            .collect::<Result<Vec<_>, _>>()?;
                        if rendered.is_empty() {
                            Ok(name)
                        } else {
                            Ok(format!("{name}<{}>", rendered.join(", ")))
                        }
                    }
                }
            }
        }
        Type::Reference(reference) => {
            let inner = emit_type(&reference.elem, entities)?;
            if reference.mutability.is_some() || is_primitive_typescript_type(&inner) {
                Ok(inner)
            } else {
                Ok(format!("Readonly<{inner}>"))
            }
        }
        Type::Slice(slice) => Ok(array_type(emit_type(&slice.elem, entities)?)),
        Type::Tuple(tuple) if tuple.elems.is_empty() => Ok("void".to_string()),
        Type::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| emit_type(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("readonly [{}]", elements.join(", ")))
        }
        Type::BareFn(function) => emit_bare_function_type(function, entities, None),
        Type::TraitObject(object) => emit_function_trait_type(&object.bounds, entities),
        _ => Err(compile_error(format!(
            "unsupported Rust type `{}`",
            type_kind(rust_type)
        ))),
    };
}

fn typed_array_for_literal(expression: &Expr) -> Option<&'static str> {
    let Expr::Lit(literal) = expression else {
        return None;
    };
    let suffix = match &literal.lit {
        Lit::Float(value) => value.suffix(),
        Lit::Int(value) => value.suffix(),
        _ => return None,
    };
    return typed_array_for_primitive(suffix);
}

fn typed_array_for_type(rust_type: &Type) -> Option<&'static str> {
    return match rust_type {
        Type::Paren(paren) => typed_array_for_type(&paren.elem),
        Type::Path(path) => path
            .path
            .segments
            .last()
            .and_then(|segment| typed_array_for_primitive(&segment.ident.to_string())),
        _ => None,
    };
}

fn typed_array_for_primitive(name: &str) -> Option<&'static str> {
    return match name {
        "f32" => Some("Float32Array"),
        "f64" => Some("Float64Array"),
        "i8" => Some("Int8Array"),
        "i16" => Some("Int16Array"),
        "i32" => Some("Int32Array"),
        "u8" => Some("Uint8Array"),
        "u16" => Some("Uint16Array"),
        "u32" => Some("Uint32Array"),
        _ => None,
    };
}

fn emit_type_alias(
    out: &mut String,
    type_alias: &syn::ItemType,
    entities: &HashSet<String>,
    parameter_names: Option<&[String]>,
) -> Result<(), CompileError> {
    emit_documentation(out, &type_alias.attrs, 0);
    let export = if is_public(&type_alias.vis) {
        "export "
    } else {
        ""
    };
    let rendered = if let Some(parameter_names) = parameter_names {
        emit_named_callable_type(&type_alias.ty, entities, parameter_names)?
    } else {
        emit_type(&type_alias.ty, entities)?
    };
    writeln!(
        out,
        "{export}type {}{} = {};",
        type_alias.ident,
        emit_type_parameters(&type_alias.generics),
        rendered
    )
    .expect("writing to a String cannot fail");
    return Ok(());
}

fn emit_bare_function_type(
    function: &syn::TypeBareFn,
    entities: &HashSet<String>,
    parameter_names: Option<&[String]>,
) -> Result<String, CompileError> {
    if let Some(parameter_names) = parameter_names
        && parameter_names.len() != function.inputs.len()
    {
        return Err(compile_error(
            "callable parameter name count changed after directive validation",
        ));
    }
    let parameters = function
        .inputs
        .iter()
        .enumerate()
        .map(|(index, argument)| {
            let name = parameter_names
                .and_then(|parameter_names| parameter_names.get(index))
                .cloned()
                .unwrap_or_else(|| format!("arg{index}"));
            Ok(format!("{name}: {}", emit_type(&argument.ty, entities)?))
        })
        .collect::<Result<Vec<_>, CompileError>>()?;
    let output = match &function.output {
        ReturnType::Default => "void".to_string(),
        ReturnType::Type(_, rust_type) => emit_type(rust_type, entities)?,
    };
    return Ok(format!("({}) => {output}", parameters.join(", ")));
}

fn emit_named_callable_type(
    rust_type: &Type,
    entities: &HashSet<String>,
    parameter_names: &[String],
) -> Result<String, CompileError> {
    return match rust_type {
        Type::BareFn(function) => {
            emit_bare_function_type(function, entities, Some(parameter_names))
        }
        Type::Paren(paren) => emit_named_callable_type(&paren.elem, entities, parameter_names),
        Type::Path(path) => {
            let Some(segment) = path.path.segments.last() else {
                return Err(compile_error("empty Rust type path"));
            };
            if !matches!(segment.ident.to_string().as_str(), "Arc" | "Ref") {
                return Err(compile_error(
                    "callable alias shape changed after directive validation",
                ));
            }
            let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                return Err(compile_error(format!(
                    "`{}` needs one type argument",
                    segment.ident
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
            if types.len() != 1 {
                return Err(compile_error(format!(
                    "`{}` needs exactly one type argument",
                    segment.ident
                )));
            }
            emit_named_callable_type(types[0], entities, parameter_names)
        }
        Type::TraitObject(object) => emit_function_trait_type_with_parameter_names(
            &object.bounds,
            entities,
            Some(parameter_names),
        ),
        _ => Err(compile_error(
            "callable alias shape changed after directive validation",
        )),
    };
}

fn emit_type_parameters(generics: &syn::Generics) -> String {
    let parameters = generics
        .params
        .iter()
        .filter_map(|parameter| match parameter {
            syn::GenericParam::Type(parameter) => Some(parameter.ident.to_string()),
            syn::GenericParam::Const(_) | syn::GenericParam::Lifetime(_) => None,
        })
        .collect::<Vec<_>>();
    if parameters.is_empty() {
        return String::new();
    }
    return format!("<{}>", parameters.join(", "));
}

fn emit_unary_operator(operator: &UnOp) -> Result<&'static str, CompileError> {
    return match operator {
        UnOp::Deref(_) => Ok(""),
        UnOp::Neg(_) => Ok("-"),
        UnOp::Not(_) => Ok("!"),
        _ => Err(compile_error("unsupported Rust unary operator")),
    };
}

fn expression_contains_identifier(expression: &Expr, expected: &str) -> bool {
    struct IdentifierFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for IdentifierFinder<'_> {
        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            if closure
                .inputs
                .iter()
                .any(|pattern| pattern_binds_identifier(pattern, self.expected))
            {
                return;
            }
            syn::visit::visit_expr_closure(self, closure);
        }

        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path
                .path
                .segments
                .last()
                .is_some_and(|segment| segment.ident == self.expected)
            {
                self.found = true;
            }
            syn::visit::visit_expr_path(self, path);
        }
    }

    let mut finder = IdentifierFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_expr(&mut finder, expression);
    return finder.found;
}

fn pattern_binds_identifier(pattern: &Pat, expected: &str) -> bool {
    struct PatternFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for PatternFinder<'_> {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            if pattern.ident == self.expected {
                self.found = true;
            }
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut finder = PatternFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_pat(&mut finder, pattern);
    return finder.found;
}

fn expression_contains_method(expression: &Expr, expected: &str) -> bool {
    struct MethodFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for MethodFinder<'_> {
        fn visit_expr_method_call(&mut self, call: &'ast syn::ExprMethodCall) {
            if call.method == self.expected {
                self.found = true;
            }
            syn::visit::visit_expr_method_call(self, call);
        }
    }

    let mut finder = MethodFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_expr(&mut finder, expression);
    return finder.found;
}

fn expression_contains_path(block: &syn::Block, expected: &str) -> bool {
    struct PathFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for PathFinder<'_> {
        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path
                .path
                .segments
                .last()
                .is_some_and(|segment| segment.ident == self.expected)
            {
                self.found = true;
            }
            syn::visit::visit_expr_path(self, path);
        }
    }

    let mut finder = PathFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_block(&mut finder, block);
    return finder.found;
}

fn expression_is_associated_path(expression: &Expr, owner: &str, member: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    if path.path.segments.len() < 2 {
        return false;
    }
    let mut segments = path.path.segments.iter().rev();
    return segments
        .next()
        .is_some_and(|segment| segment.ident == member)
        && segments
            .next()
            .is_some_and(|segment| segment.ident == owner);
}

fn expression_is_method(expression: &Expr, expected: &str) -> bool {
    let Expr::MethodCall(call) = expression else {
        return false;
    };
    return call.method == expected && call.args.is_empty();
}

fn expression_is_none(expression: &Expr) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path
        .path
        .segments
        .last()
        .is_some_and(|segment| segment.ident == "None");
}

fn expression_is_path(expression: &Expr, expected: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path.path.is_ident(expected);
}

fn expression_is_path_call(expression: &Expr, expected: &str) -> bool {
    let Expr::Call(call) = expression else {
        return false;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return false;
    };
    return call.args.is_empty()
        && path
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == expected);
}

fn expression_kind(expression: &Expr) -> &'static str {
    return match expression {
        Expr::Async(_) => "async block",
        Expr::Await(_) => "await expression",
        Expr::Block(_) => "block expression",
        Expr::Break(_) => "break expression",
        Expr::Closure(_) => "closure",
        Expr::Const(_) => "const block",
        Expr::Continue(_) => "continue expression",
        Expr::ForLoop(_) => "for loop",
        Expr::If(_) => "if expression",
        Expr::Let(_) => "let expression",
        Expr::Loop(_) => "loop",
        Expr::Macro(_) => "macro expression",
        Expr::Match(_) => "match expression",
        Expr::Range(_) => "range expression",
        Expr::RawAddr(_) => "raw address",
        Expr::Repeat(_) => "array repeat expression",
        Expr::Return(_) => "return expression",
        Expr::Try(_) => "try expression",
        Expr::TryBlock(_) => "try block",
        Expr::Unsafe(_) => "unsafe block",
        Expr::Verbatim(_) => "verbatim tokens",
        Expr::While(_) => "while loop",
        Expr::Yield(_) => "yield expression",
        _ => "unknown expression",
    };
}

fn expression_path_ends_with(expression: &Expr, expected: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path
        .path
        .segments
        .last()
        .is_some_and(|segment| segment.ident == expected);
}

fn float_bit_comparison(
    binary: &syn::ExprBinary,
    entities: &HashSet<String>,
) -> Result<Option<(String, String)>, CompileError> {
    let Expr::MethodCall(left) = binary.left.as_ref() else {
        return Ok(None);
    };
    let Expr::MethodCall(right) = binary.right.as_ref() else {
        return Ok(None);
    };
    if left.method != "to_bits"
        || right.method != "to_bits"
        || !left.args.is_empty()
        || !right.args.is_empty()
    {
        return Ok(None);
    }
    return Ok(Some((
        emit_expression(&left.receiver, entities)?,
        emit_expression(&right.receiver, entities)?,
    )));
}

fn float_constant_type(path: &syn::Path) -> Option<&'static str> {
    let segments = path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    if segments.len() >= 2 {
        let rust_type = segments[segments.len() - 2].as_str();
        if rust_type == "f32" {
            return Some("f32");
        }
        if rust_type == "f64" {
            return Some("f64");
        }
    }
    if segments.len() >= 3 && segments[segments.len() - 2] == "consts" {
        let rust_type = segments[segments.len() - 3].as_str();
        if rust_type == "f32" {
            return Some("f32");
        }
        if rust_type == "f64" {
            return Some("f64");
        }
    }
    return None;
}

fn is_primitive_typescript_type(typescript_type: &str) -> bool {
    return matches!(typescript_type, "boolean" | "number" | "string" | "void")
        || typescript_type.contains("=>");
}

fn is_public(visibility: &Visibility) -> bool {
    return matches!(visibility, Visibility::Public(_));
}

fn local_pattern_name(pattern: &Pat) -> Option<String> {
    return match pattern {
        Pat::Ident(identifier) => Some(identifier.ident.to_string()),
        Pat::Type(typed) => local_pattern_name(&typed.pat),
        _ => None,
    };
}

pub(crate) fn lower_camel_from_upper_camel(name: &str) -> String {
    let mut characters = name.chars();
    let Some(first) = characters.next() else {
        return String::new();
    };
    return first.to_lowercase().chain(characters).collect();
}

fn option_inner_type(rust_type: &Type) -> Option<&Type> {
    let Type::Path(path) = rust_type else {
        return None;
    };
    let segment = path.path.segments.last()?;
    if segment.ident != "Option" {
        return None;
    }
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return None;
    };
    let mut types = arguments.args.iter().filter_map(|argument| match argument {
        GenericArgument::Type(rust_type) => Some(rust_type),
        _ => None,
    });
    let inner = types.next()?;
    return types.next().is_none().then_some(inner);
}

fn named_type(rust_type: &Type) -> Option<String> {
    return match rust_type {
        Type::Group(group) => named_type(&group.elem),
        Type::Paren(paren) => named_type(&paren.elem),
        Type::Reference(reference) => named_type(&reference.elem),
        Type::Path(path) => path
            .path
            .segments
            .last()
            .map(|segment| segment.ident.to_string()),
        _ => None,
    };
}

fn path_is_type_constant(path: &syn::Path, rust_type: &str, constant: &str) -> bool {
    let mut segments = path.segments.iter().rev();
    return segments
        .next()
        .is_some_and(|segment| segment.ident == constant)
        && segments
            .next()
            .is_some_and(|segment| segment.ident == rust_type);
}

fn type_is_unsigned_integer(rust_type: &Type) -> bool {
    return ["u8", "u16", "u32", "u64", "usize"]
        .iter()
        .any(|name| type_is_named(rust_type, name));
}

fn referenced_path_identifier(expression: &Expr) -> Option<String> {
    return match expression {
        Expr::Group(group) => referenced_path_identifier(&group.expr),
        Expr::Paren(paren) => referenced_path_identifier(&paren.expr),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => path
            .path
            .segments
            .first()
            .map(|segment| segment.ident.to_string()),
        Expr::Reference(reference) => referenced_path_identifier(&reference.expr),
        _ => None,
    };
}

fn path_is_float_constant(path: &syn::Path, constant: &str) -> bool {
    return float_constant_type(path).is_some()
        && path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == constant);
}

fn pattern_is_mutable(pattern: &Pat) -> bool {
    return match pattern {
        Pat::Ident(identifier) => identifier.mutability.is_some(),
        Pat::Reference(reference) => {
            reference.mutability.is_some() || pattern_is_mutable(&reference.pat)
        }
        Pat::Tuple(tuple) => tuple.elems.iter().any(pattern_is_mutable),
        Pat::Type(typed) => pattern_is_mutable(&typed.pat),
        _ => false,
    };
}

fn preferred_aliases(
    program: &Program,
    alias_programs: &[Program],
) -> Result<PreferredAliases, CompileError> {
    let mut aliases = PreferredAliases::new();
    for alias_program in std::iter::once(program).chain(alias_programs) {
        for type_alias in &alias_program.type_aliases {
            if !is_public(&type_alias.vis) || !type_alias.generics.params.is_empty() {
                continue;
            }
            let rendered = emit_type(&type_alias.ty, &alias_program.entities)?;
            if rendered.contains("=>") {
                aliases
                    .entry(rendered)
                    .or_insert_with(|| type_alias.ident.to_string());
            }
        }
    }
    return Ok(aliases);
}

fn rewrite_code_span(value: &str) -> String {
    let mut out = String::new();
    let mut token = String::new();
    let flush = |out: &mut String, token: &mut String| {
        if token.is_empty() {
            return;
        }
        if token == "None" {
            out.push_str("undefined");
        } else if token.contains('_')
            && token
                .chars()
                .any(|character| character.is_ascii_lowercase())
            && token
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
        {
            out.push_str(&snake_to_lower_camel(token));
        } else {
            out.push_str(token);
        }
        token.clear();
    };
    for character in value.chars() {
        if character.is_ascii_alphanumeric() || character == '_' {
            token.push(character);
        } else {
            flush(&mut out, &mut token);
            out.push(character);
        }
    }
    flush(&mut out, &mut token);
    return out;
}

fn rewrite_documentation(value: &str) -> String {
    let value = value
        .replace("Panics", "Throws")
        .replace("panics", "throws");
    let mut out = String::new();
    for (index, segment) in value.split('`').enumerate() {
        if index > 0 {
            out.push('`');
        }
        if index % 2 == 0 {
            out.push_str(segment);
        } else {
            out.push_str(&rewrite_code_span(segment));
        }
    }
    return out;
}

pub(crate) fn snake_to_lower_camel(name: &str) -> String {
    let name = name.strip_prefix("r#").unwrap_or(name);
    let mut words = name.split('_');
    let mut out = words.next().unwrap_or_default().to_string();
    for word in words {
        let mut capitalized = false;
        for character in word.chars() {
            if !capitalized && character.is_alphabetic() {
                out.extend(character.to_uppercase());
                capitalized = true;
            } else {
                out.push(character);
            }
        }
    }
    return out;
}

fn throw_call(call: &syn::ExprCall) -> Option<(&'static str, &Expr)> {
    if call.args.len() != 1 {
        return None;
    }
    let constructor = if expression_path_ends_with(&call.func, "throw_range_error") {
        "RangeError"
    } else if expression_path_ends_with(&call.func, "throw_error") {
        "Error"
    } else {
        return None;
    };
    return Some((constructor, &call.args[0]));
}

fn type_is_named(rust_type: &Type, expected: &str) -> bool {
    let Type::Path(path) = rust_type else {
        return false;
    };
    return path.path.is_ident(expected);
}

fn type_kind(rust_type: &Type) -> &'static str {
    return match rust_type {
        Type::BareFn(_) => "bare function",
        Type::ImplTrait(_) => "impl trait",
        Type::Infer(_) => "inferred type",
        Type::Macro(_) => "type macro",
        Type::Never(_) => "never type",
        Type::Ptr(_) => "raw pointer",
        Type::TraitObject(_) => "trait object",
        Type::Verbatim(_) => "verbatim type tokens",
        _ => "unknown type",
    };
}

pub(crate) fn write_indent(out: &mut String, indent: usize) {
    for _ in 0..indent {
        out.push_str("  ");
    }
}
