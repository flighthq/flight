use std::collections::HashSet;

use syn::punctuated::Punctuated;
use syn::{Expr, ItemStruct, PathArguments, Token, Type};

use crate::CompileError;
use crate::model::Program;

use super::{
    DEFAULT_OBJECT_MARKER, PROVENANCE_SEPARATOR, compile_error, current_source, resolve_type_path,
    resolved_type_identity, rust_default_expression, rust_type_description, snake_to_lower_camel,
    unique_marker_suffix,
};
fn default_object_field_value(rust_type: &Type) -> Option<String> {
    return match rust_type {
        Type::Group(group) => default_object_field_value(&group.elem),
        Type::Paren(paren) => default_object_field_value(&paren.elem),
        Type::Path(path)
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1
                && matches!(path.path.segments[0].arguments, PathArguments::None)
                && matches!(
                    path.path.segments[0].ident.to_string().as_str(),
                    "bool"
                        | "f32"
                        | "f64"
                        | "i8"
                        | "i16"
                        | "i32"
                        | "i64"
                        | "isize"
                        | "u8"
                        | "u16"
                        | "u32"
                        | "u64"
                        | "usize"
                ) =>
        {
            rust_default_expression(rust_type)
        }
        Type::Array(array) if default_object_field_value(&array.elem).is_some() => {
            rust_default_expression(rust_type)
        }
        Type::Tuple(tuple)
            if tuple
                .elems
                .iter()
                .all(|element| default_object_field_value(element).is_some()) =>
        {
            rust_default_expression(rust_type)
        }
        _ => None,
    };
}

fn standard_default_is_derived(
    structure: &ItemStruct,
    program: &Program,
    type_context: &HashSet<String>,
) -> bool {
    return structure
        .attrs
        .iter()
        .filter(|attribute| attribute.path().is_ident("derive"))
        .filter_map(|attribute| {
            return attribute
                .parse_args_with(Punctuated::<syn::Path, Token![,]>::parse_terminated)
                .ok();
        })
        .flatten()
        .any(|derive| {
            if derive.segments.len() == 1
                && derive.segments[0].ident == "Default"
                && program.facts.macro_definitions.contains("Default")
            {
                return false;
            }
            return matches!(
                resolve_type_path(&derive, type_context)
                    .as_deref()
                    .map(|segments| segments.iter().map(String::as_str).collect::<Vec<_>>()),
                Some(segments)
                    if matches!(segments.as_slice(), ["std" | "core", "default", "Default"])
            );
        });
}

pub(super) fn default_object_literal(
    module: &str,
    program: &Program,
    structure: &ItemStruct,
    type_context: &HashSet<String>,
    context: &HashSet<String>,
) -> Result<String, CompileError> {
    let name = structure.ident.to_string();
    let identity = format!("{module}{PROVENANCE_SEPARATOR}{name}");
    for impl_item in &program.facts.impls {
        if impl_item.trait_.is_some()
            || resolved_type_identity(context, module, &impl_item.self_ty).as_deref()
                != Some(identity.as_str())
        {
            continue;
        }
        if impl_item.items.iter().any(
            |item| matches!(item, syn::ImplItem::Fn(function) if function.sig.ident == "default"),
        ) {
            return Err(compile_error(format!(
                "`flight-compiler: default-object {name}` cannot replace the inherent runtime method `{name}::default`"
            )));
        }
    }
    if !standard_default_is_derived(structure, program, type_context) {
        return Err(compile_error(format!(
            "`flight-compiler: default-object {name}` requires the standard `#[derive(Default)]`; manual or runtime defaults are not structural"
        )));
    }
    let fields = structure
        .fields
        .iter()
        .map(|field| {
            let field_name = field
                .ident
                .as_ref()
                .expect("default-object validation requires named fields");
            let value = default_object_field_value(&field.ty).ok_or_else(|| {
                compile_error(format!(
                    "`flight-compiler: default-object {name}` field `{field_name}` of type `{}` has no proven structural TypeScript default",
                    rust_type_description(&field.ty)
                ))
            })?;
            return Ok(format!(
                "{}: {value}",
                snake_to_lower_camel(&field_name.to_string())
            ));
        })
        .collect::<Result<Vec<_>, CompileError>>()?;
    return Ok(format!("{{ {} }}", fields.join(", ")));
}

pub(super) fn explicit_default_object(
    call: &syn::ExprCall,
    entities: &HashSet<String>,
) -> Option<String> {
    if !call.args.is_empty() {
        return None;
    }
    let Expr::Path(function) = call.func.as_ref() else {
        return None;
    };
    if function.qself.is_some()
        || !function.path.segments.last().is_some_and(|segment| {
            segment.ident == "default" && matches!(segment.arguments, PathArguments::None)
        })
    {
        return None;
    }
    let mut owner = function.path.clone();
    owner.segments.pop()?;
    if owner.segments.is_empty() {
        return None;
    }
    let owner = Type::Path(syn::TypePath {
        qself: None,
        path: owner,
    });
    let module = current_source(entities)?;
    let identity = resolved_type_identity(entities, &module, &owner)?;
    return unique_marker_suffix(
        entities,
        &format!("{DEFAULT_OBJECT_MARKER}{identity}{PROVENANCE_SEPARATOR}"),
    );
}
