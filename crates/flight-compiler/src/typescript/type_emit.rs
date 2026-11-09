use std::collections::{BTreeSet, HashSet};
use std::fmt::Write;

use syn::{Expr, FnArg, GenericArgument, ItemFn, Lit, Pat, PathArguments, ReturnType, Type};

use crate::model::{Program, TestProgram};
use crate::{CompileError, compile_error};

use super::{
    ARRAY_LIKE_ARGUMENT_MARKER, ARRAY_LIKE_PARAMETER_MARKER, BindingFact,
    DEFAULT_NULL_OPTION_PARAMETER_MARKER, FLOAT32_ARRAY_PARAMETER_MARKER, FUNCTION_OWNER_MARKER,
    INTERIOR_MUTABLE_STRUCT_MARKER, NULLABLE_CALL_MARKER,
    NULLABLE_OPTION_CALLABLE_MAP_FIELD_MARKER, NULLABLE_OPTION_CALLABLE_RETURN_MARKER,
    NULLABLE_OPTION_FIELD_MARKER, NULLABLE_OPTION_LITERAL_FIELD_MARKER,
    NULLABLE_OPTION_PARAMETER_MARKER, NULLABLE_OPTION_RETURN_MARKER, NULLABLE_OPTIONS_MARKER,
    PROVENANCE_SEPARATOR, PinnedBoxedTrait, RETURN_BINDING_FACT_MARKER, RETURNS_NULLABLE_MARKER,
    SLICE_ARGUMENT_MARKER, STRUCT_OWNER_MARKER, SourceAccess, TARGET_NATIVE_ENTITY_MARKER,
    TYPE_ALIAS_OWNER_MARKER, TYPE_PARAMETER_MARKER, TYPE_SCRIPT_ARRAY_FIELD_MARKER,
    TYPE_SCRIPT_NULLABLE_OPTION_FIELD_MARKER, TYPE_SCRIPT_NULLABLE_OPTION_RETURN_MARKER,
    TYPE_SCRIPT_TYPE_ALIAS_MARKER, TYPED_ARRAY_FIELD_MARKER, UINT8_ARRAY_PARAMETER_MARKER,
    UINT8_ARRAY_RETURN_MARKER, VITEST_LOCAL_CRATE_MARKER, array_type, binding_fact_marker,
    boxed_typed_array, canonical_entity_ir_typed_array_alias, current_source,
    emit_callable_parameters, emit_documentation, emit_function_trait_type,
    emit_function_trait_type_with_parameter_names, emit_hash_collection_type,
    emit_single_generic_type, export_name, flight_error_result_type, hash_collection_type,
    identity_alias_tag, inline_string_union, is_crate_wide, is_internal_type_export,
    is_primitive_typescript_type, is_public, is_standard_type_path, js_string_literal,
    marker_suffixes, named_type, nullable_type, option_inner_type, owner_marker,
    pinned_boxed_trait_output, resolve_path_owner, resolve_type_path,
    rust_type_has_interior_mutability, snake_to_lower_camel, standard_vec_inner_type,
    type_is_named, type_kind, type_path_is_standard_vec, vitest_current_path_prefix,
    vitest_struct_path_binding_name,
};

pub(crate) fn insert_type_script_type_alias_context(
    context: &mut HashSet<String>,
    aliases: &[crate::TypeScriptTypeAlias<'_>],
) {
    for alias in aliases {
        context.insert(format!(
            "{TYPE_SCRIPT_TYPE_ALIAS_MARKER}{}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
            alias.name,
            alias.module.unwrap_or_default(),
            alias.target
        ));
    }
}

pub(crate) fn insert_type_script_array_parameter_context<'a>(
    context: &mut HashSet<String>,
    programs: impl IntoIterator<Item = (&'a str, &'a Program)>,
    parameters: &[crate::TypeScriptArrayParameter<'_>],
) -> Result<(), CompileError> {
    let programs = programs.into_iter().collect::<Vec<_>>();
    for metadata in parameters {
        let mut matches =
            programs
                .iter()
                .flat_map(|(module, program)| {
                    program.functions.iter().flat_map(move |function| {
                        function.sig.inputs.iter().enumerate().filter_map(
                            move |(index, argument)| {
                                let FnArg::Typed(argument) = argument else {
                                    return None;
                                };
                                let Pat::Ident(pattern) = argument.pat.as_ref() else {
                                    return None;
                                };
                                (snake_to_lower_camel(&function.sig.ident.to_string())
                                    == metadata.owner
                                    && snake_to_lower_camel(&pattern.ident.to_string())
                                        == metadata.parameter)
                                    .then_some((*module, function, argument, pattern, index))
                            },
                        )
                    })
                })
                .collect::<Vec<_>>();
        if matches.len() != 1 {
            return Err(compile_error(format!(
                "TypeScript array parameter `{}.{}` must resolve to exactly one visible Rust function parameter, found {}",
                metadata.owner,
                metadata.parameter,
                matches.len()
            )));
        }
        let (module, function, argument, pattern, index) =
            matches.pop().expect("one match was required");
        if !is_public(&function.vis) {
            return Err(compile_error(format!(
                "TypeScript array parameter `{}.{}` must designate a public Rust function parameter",
                metadata.owner, metadata.parameter
            )));
        }
        match metadata.representation {
            crate::TypeScriptArrayParameterRepresentation::ArrayLikeNumber => {
                if !is_typescript_number_slice_reference(&argument.ty) {
                    return Err(compile_error(format!(
                        "TypeScript array parameter `{}.{}` with representation `ArrayLike<number>` must designate an immutable slice of a standard Rust numeric primitive",
                        metadata.owner, metadata.parameter
                    )));
                }
            }
            crate::TypeScriptArrayParameterRepresentation::Float32Array => {
                if !is_f32_slice_reference(&argument.ty, true) {
                    return Err(compile_error(format!(
                        "TypeScript array parameter `{}.{}` with representation `Float32Array` must designate an exact Rust `&mut [f32]` parameter",
                        metadata.owner, metadata.parameter
                    )));
                }
            }
            crate::TypeScriptArrayParameterRepresentation::Uint8Array => {
                if uint8_buffer_parameter_kind(&argument.ty, context, module).is_none() {
                    return Err(compile_error(format!(
                        "TypeScript array parameter `{}.{}` with representation `Uint8Array` must designate an exact standard Rust `Vec<u8>`, `&[u8]`, or `&mut [u8]` parameter",
                        metadata.owner, metadata.parameter
                    )));
                }
            }
        }
        let function_name = function.sig.ident.to_string();
        context.insert(owner_marker(
            FUNCTION_OWNER_MARKER,
            module,
            &function_name,
            SourceAccess::Public,
        ));
        match metadata.representation {
            crate::TypeScriptArrayParameterRepresentation::ArrayLikeNumber => {
                context.insert(format!(
                    "{ARRAY_LIKE_PARAMETER_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{}",
                    pattern.ident
                ));
                context.insert(format!(
                    "{ARRAY_LIKE_ARGUMENT_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{index}"
                ));
                context.insert(format!(
                    "{SLICE_ARGUMENT_MARKER}{function_name}:{index}:array-like"
                ));
            }
            crate::TypeScriptArrayParameterRepresentation::Float32Array => {
                context.insert(format!(
                    "{FLOAT32_ARRAY_PARAMETER_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{}",
                    pattern.ident
                ));
                context.insert(format!(
                    "{SLICE_ARGUMENT_MARKER}{function_name}:{index}:fixed-buffer"
                ));
            }
            crate::TypeScriptArrayParameterRepresentation::Uint8Array => {
                context.insert(format!(
                    "{UINT8_ARRAY_PARAMETER_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{}",
                    pattern.ident
                ));
                let kind = uint8_buffer_parameter_kind(&argument.ty, context, module)
                    .expect("the Uint8Array parameter shape was validated");
                context.insert(format!(
                    "{SLICE_ARGUMENT_MARKER}{function_name}:{index}:{kind}"
                ));
            }
        }
    }
    return Ok(());
}

pub(crate) fn insert_type_script_array_field_context<'a>(
    context: &mut HashSet<String>,
    programs: impl IntoIterator<Item = (&'a str, &'a Program)>,
    fields: &[crate::TypeScriptArrayField<'_>],
) -> Result<(), CompileError> {
    let programs = programs.into_iter().collect::<Vec<_>>();
    for metadata in fields {
        let mut matches = programs
            .iter()
            .flat_map(|(module, program)| {
                program.structs.iter().flat_map(move |structure| {
                    structure.fields.iter().filter_map(move |field| {
                        let field_name = field.ident.as_ref()?;
                        (structure.ident == metadata.owner
                            && snake_to_lower_camel(&field_name.to_string()) == metadata.field)
                            .then_some((*module, structure, field, field_name))
                    })
                })
            })
            .collect::<Vec<_>>();
        if matches.len() != 1 {
            return Err(compile_error(format!(
                "TypeScript array field `{}.{}` must resolve to exactly one visible Rust field, found {}",
                metadata.owner,
                metadata.field,
                matches.len()
            )));
        }
        let (module, structure, field, field_name) = matches.pop().expect("one match was required");
        if !is_public(&structure.vis)
            || !is_public(&field.vis)
            || !is_standard_u8_vec(&field.ty, context)
        {
            return Err(compile_error(format!(
                "TypeScript array field `{}.{}` with representation `Uint8Array` must designate a public exact standard Rust `Vec<u8>` field",
                metadata.owner, metadata.field
            )));
        }
        context.insert(owner_marker(
            STRUCT_OWNER_MARKER,
            module,
            &structure.ident.to_string(),
            SourceAccess::Public,
        ));
        for identity in [
            format!("{module}{PROVENANCE_SEPARATOR}{}", structure.ident),
            structure.ident.to_string(),
        ] {
            context.insert(format!(
                "{TYPED_ARRAY_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}Uint8Array"
            ));
            context.insert(format!(
                "{TYPE_SCRIPT_ARRAY_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}Uint8Array"
            ));
        }
    }
    return Ok(());
}

pub(crate) fn insert_type_script_array_return_context<'a>(
    context: &mut HashSet<String>,
    programs: impl IntoIterator<Item = (&'a str, &'a Program)>,
    returns: &[crate::TypeScriptArrayReturn<'_>],
) -> Result<(), CompileError> {
    let programs = programs.into_iter().collect::<Vec<_>>();
    for metadata in returns {
        let mut matches = programs
            .iter()
            .flat_map(|(module, program)| {
                program.functions.iter().filter_map(move |function| {
                    (snake_to_lower_camel(&function.sig.ident.to_string()) == metadata.owner)
                        .then_some((*module, function))
                })
            })
            .collect::<Vec<_>>();
        if matches.len() != 1 {
            return Err(compile_error(format!(
                "TypeScript array return `{}` must resolve to exactly one visible Rust function, found {}",
                metadata.owner,
                matches.len()
            )));
        }
        let (module, function) = matches.pop().expect("one match was required");
        let ReturnType::Type(_, rust_type) = &function.sig.output else {
            return Err(compile_error(format!(
                "TypeScript array return `{}` with representation `Uint8Array` must designate an exact standard Rust `Vec<u8>` return",
                metadata.owner
            )));
        };
        if !is_standard_u8_vec(rust_type, context) {
            return Err(compile_error(format!(
                "TypeScript array return `{}` with representation `Uint8Array` must designate an exact standard Rust `Vec<u8>` return",
                metadata.owner
            )));
        }
        let function_name = function.sig.ident.to_string();
        context.insert(format!(
            "{UINT8_ARRAY_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}"
        ));
        let prefix = format!(
            "{RETURN_BINDING_FACT_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
        );
        context.retain(|marker| !marker.starts_with(&prefix));
        context.insert(format!(
            "{prefix}{}",
            binding_fact_marker(&BindingFact::TypedArray("Uint8Array".to_string()))
        ));
    }
    return Ok(());
}

pub(crate) fn insert_type_script_vitest_array_return_context<'a>(
    context: &mut HashSet<String>,
    test_program: &'a TestProgram,
    production_programs: impl IntoIterator<Item = (&'a str, &'a Program)>,
    returns: &[crate::TypeScriptArrayReturn<'_>],
) -> Result<(), CompileError> {
    let production_programs = production_programs.into_iter().collect::<Vec<_>>();
    let test_functions = test_program
        .helpers
        .iter()
        .chain(
            test_program
                .suites
                .iter()
                .flat_map(|suite| suite.helpers.iter()),
        )
        .collect::<Vec<_>>();
    for metadata in returns {
        let mut matches = test_functions
            .iter()
            .filter_map(|function| {
                (snake_to_lower_camel(&function.sig.ident.to_string()) == metadata.owner)
                    .then_some((None, *function))
            })
            .chain(production_programs.iter().flat_map(|(module, program)| {
                program.functions.iter().filter_map(move |function| {
                    (snake_to_lower_camel(&function.sig.ident.to_string()) == metadata.owner)
                        .then_some((Some(*module), function))
                })
            }))
            .collect::<Vec<_>>();
        if matches.len() != 1 {
            return Err(compile_error(format!(
                "TypeScript array return `{}` must resolve to exactly one visible Rust function or test helper, found {}",
                metadata.owner,
                matches.len()
            )));
        }
        let (module, function) = matches.pop().expect("one match was required");
        let ReturnType::Type(_, rust_type) = &function.sig.output else {
            return Err(compile_error(format!(
                "TypeScript array return `{}` with representation `Uint8Array` must designate an exact standard Rust `Vec<u8>` return",
                metadata.owner
            )));
        };
        if !is_standard_u8_vec(rust_type, context) {
            return Err(compile_error(format!(
                "TypeScript array return `{}` with representation `Uint8Array` must designate an exact standard Rust `Vec<u8>` return",
                metadata.owner
            )));
        }
        let function_name = function.sig.ident.to_string();
        if let Some(module) = module {
            context.insert(format!(
                "{UINT8_ARRAY_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}"
            ));
            let prefix = format!(
                "{RETURN_BINDING_FACT_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
            );
            context.retain(|marker| !marker.starts_with(&prefix));
            context.insert(format!(
                "{prefix}{}",
                binding_fact_marker(&BindingFact::TypedArray("Uint8Array".to_string()))
            ));
        } else {
            context.insert(format!("{UINT8_ARRAY_RETURN_MARKER}{function_name}"));
        }
    }
    return Ok(());
}

pub(super) fn is_f32_slice_reference(rust_type: &Type, mutable: bool) -> bool {
    let Type::Reference(reference) = rust_type else {
        return false;
    };
    if reference.mutability.is_some() != mutable {
        return false;
    }
    let Type::Slice(slice) = reference.elem.as_ref() else {
        return false;
    };
    return type_is_named(&slice.elem, "f32");
}

pub(super) fn is_typescript_number_slice_reference(rust_type: &Type) -> bool {
    let Type::Reference(reference) = rust_type else {
        return false;
    };
    if reference.mutability.is_some() {
        return false;
    }
    let Type::Slice(slice) = reference.elem.as_ref() else {
        return false;
    };
    let Type::Path(element) = slice.elem.as_ref() else {
        return false;
    };
    if element.qself.is_some() || element.path.segments.len() != 1 {
        return false;
    }
    return matches!(
        element.path.segments[0].ident.to_string().as_str(),
        "f32"
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
    );
}

pub(super) fn uint8_buffer_parameter_kind(
    rust_type: &Type,
    entities: &HashSet<String>,
    from: &str,
) -> Option<&'static str> {
    let rust_type = match rust_type {
        Type::Group(group) => return uint8_buffer_parameter_kind(&group.elem, entities, from),
        Type::Paren(paren) => return uint8_buffer_parameter_kind(&paren.elem, entities, from),
        rust_type => rust_type,
    };
    if is_standard_u8_vec(rust_type, entities) {
        return Some("uint8-owned");
    }
    let Type::Reference(reference) = rust_type else {
        return None;
    };
    if canonical_entity_ir_typed_array_alias(&reference.elem, entities, from) == Some("Uint8Array")
    {
        return Some(if reference.mutability.is_some() {
            "uint8-mut-slice"
        } else {
            "uint8-slice"
        });
    }
    let Type::Slice(slice) = reference.elem.as_ref() else {
        return None;
    };
    if !type_is_named(&slice.elem, "u8") {
        return None;
    }
    return Some(if reference.mutability.is_some() {
        "uint8-mut-slice"
    } else {
        "uint8-slice"
    });
}

pub(super) fn is_standard_u8_vec(rust_type: &Type, entities: &HashSet<String>) -> bool {
    let Type::Path(path) = rust_type else {
        return false;
    };
    return path.qself.is_none()
        && type_path_is_standard_vec(&path.path, entities)
        && standard_vec_inner_type(rust_type, entities)
            .is_some_and(|inner| type_is_named(inner, "u8"));
}

pub(crate) fn insert_type_script_nullable_option_field_context<'a>(
    context: &mut HashSet<String>,
    programs: impl IntoIterator<Item = (&'a str, &'a Program)>,
    fields: &[crate::TypeScriptNullableOptionField<'_>],
) -> Result<(), CompileError> {
    let programs = programs.into_iter().collect::<Vec<_>>();
    for metadata in fields {
        let mut matches = programs
            .iter()
            .flat_map(|(module, program)| {
                program.structs.iter().flat_map(move |structure| {
                    structure.fields.iter().filter_map(move |field| {
                        let field_name = field.ident.as_ref()?;
                        (structure.ident == metadata.owner
                            && snake_to_lower_camel(&field_name.to_string()) == metadata.field)
                            .then_some((*module, structure, field, field_name))
                    })
                })
            })
            .collect::<Vec<_>>();
        if matches.len() != 1 {
            return Err(compile_error(format!(
                "TypeScript nullable Option field `{}#{}.{}` must resolve to exactly one visible Rust field, found {}",
                metadata.module,
                metadata.owner,
                metadata.field,
                matches.len()
            )));
        }
        let (module, structure, field, field_name) = matches.pop().expect("one match was required");
        if !is_public(&structure.vis)
            || !is_public(&field.vis)
            || option_inner_type(&field.ty).is_none()
        {
            return Err(compile_error(format!(
                "TypeScript nullable Option field `{}#{}.{}` must designate a public Rust `Option` field",
                metadata.module, metadata.owner, metadata.field
            )));
        }
        context.insert(owner_marker(
            STRUCT_OWNER_MARKER,
            module,
            &structure.ident.to_string(),
            SourceAccess::Public,
        ));
        for identity in [
            format!("{module}{PROVENANCE_SEPARATOR}{}", structure.ident),
            structure.ident.to_string(),
        ] {
            context.insert(format!(
                "{NULLABLE_OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
            ));
            context.insert(format!(
                "{NULLABLE_OPTION_LITERAL_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
            ));
        }
        context.insert(format!(
            "{TYPE_SCRIPT_NULLABLE_OPTION_FIELD_MARKER}{}{PROVENANCE_SEPARATOR}{field_name}",
            structure.ident
        ));
    }
    return Ok(());
}

pub(crate) fn insert_type_script_nullable_option_return_context<'a>(
    context: &mut HashSet<String>,
    programs: impl IntoIterator<Item = (&'a str, &'a Program)>,
    returns: &[crate::TypeScriptNullableOptionReturn<'_>],
) -> Result<(), CompileError> {
    enum ReturnOwner<'a> {
        Function(&'a str, &'a ItemFn),
        Callable(&'a str, &'a syn::ItemType),
    }

    let programs = programs.into_iter().collect::<Vec<_>>();
    for metadata in returns {
        let mut matches = programs
            .iter()
            .flat_map(|(module, program)| {
                program
                    .functions
                    .iter()
                    .filter_map(move |function| {
                        (snake_to_lower_camel(&function.sig.ident.to_string()) == metadata.name)
                            .then_some(ReturnOwner::Function(*module, function))
                    })
                    .chain(program.type_aliases.iter().filter_map(move |alias| {
                        (alias.ident == metadata.name)
                            .then_some(ReturnOwner::Callable(*module, alias))
                    }))
            })
            .collect::<Vec<_>>();
        if matches.len() != 1 {
            return Err(compile_error(format!(
                "TypeScript nullable Option return `{}` must resolve to exactly one visible Rust function or callable alias, found {}",
                metadata.name,
                matches.len()
            )));
        }
        match matches.pop().expect("one match was required") {
            ReturnOwner::Function(module, function) => {
                let ReturnType::Type(_, rust_type) = &function.sig.output else {
                    return Err(compile_error(format!(
                        "TypeScript nullable Option return `{}` must designate a public Rust function or callable alias returning `Option`",
                        metadata.name
                    )));
                };
                if !is_crate_wide(&function.vis) || option_inner_type(rust_type).is_none() {
                    return Err(compile_error(format!(
                        "TypeScript nullable Option return `{}` must designate a public or crate-visible Rust function or callable alias returning `Option`",
                        metadata.name
                    )));
                }
                let function_name = function.sig.ident.to_string();
                let access = if is_public(&function.vis) {
                    SourceAccess::Public
                } else {
                    SourceAccess::Crate
                };
                context.insert(owner_marker(
                    FUNCTION_OWNER_MARKER,
                    module,
                    &function_name,
                    access,
                ));
                context.insert(format!(
                    "{NULLABLE_OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
                ));
                context.insert(format!(
                    "{TYPE_SCRIPT_NULLABLE_OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
                ));
            }
            ReturnOwner::Callable(module, alias) => {
                if !is_crate_wide(&alias.vis) || callable_option_return_type(&alias.ty).is_none() {
                    return Err(compile_error(format!(
                        "TypeScript nullable Option return `{}` must designate a public or crate-visible Rust function or callable alias returning `Option`",
                        metadata.name
                    )));
                }
                let access = if is_public(&alias.vis) {
                    SourceAccess::Public
                } else {
                    SourceAccess::Crate
                };
                context.insert(owner_marker(
                    TYPE_ALIAS_OWNER_MARKER,
                    module,
                    &alias.ident.to_string(),
                    access,
                ));
                context.insert(format!(
                    "{NULLABLE_OPTION_CALLABLE_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{}",
                    alias.ident
                ));
                let alias_name = alias.ident.to_string();
                for (field_module, program) in &programs {
                    for structure in &program.structs {
                        for field in &structure.fields {
                            let Some(field_name) = &field.ident else {
                                continue;
                            };
                            if map_value_type_path(&field.ty).is_some_and(|value| {
                                resolve_path_owner(
                                    context,
                                    TYPE_ALIAS_OWNER_MARKER,
                                    field_module,
                                    &value.path,
                                )
                                .is_some_and(
                                    |(owner, declaration)| {
                                        owner == *module && declaration == alias_name
                                    },
                                )
                            }) {
                                for identity in [
                                    format!(
                                        "{field_module}{PROVENANCE_SEPARATOR}{}",
                                        structure.ident
                                    ),
                                    structure.ident.to_string(),
                                ] {
                                    context.insert(format!(
                                        "{NULLABLE_OPTION_CALLABLE_MAP_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                                    ));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return Ok(());
}

pub(super) fn callable_option_return_type(rust_type: &Type) -> Option<&Type> {
    return match rust_type {
        Type::BareFn(function) => match &function.output {
            ReturnType::Type(_, output) => option_inner_type(output),
            ReturnType::Default => None,
        },
        Type::Paren(paren) => callable_option_return_type(&paren.elem),
        Type::Path(path) => {
            let segment = path.path.segments.last()?;
            if !matches!(
                segment.ident.to_string().as_str(),
                "Arc" | "Box" | "Option" | "Ref"
            ) {
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
            if types.next().is_some() {
                return None;
            }
            callable_option_return_type(inner)
        }
        Type::TraitObject(object) => object.bounds.iter().find_map(|bound| {
            let syn::TypeParamBound::Trait(bound) = bound else {
                return None;
            };
            let segment = bound.path.segments.last()?;
            if !matches!(
                segment.ident.to_string().as_str(),
                "Fn" | "FnMut" | "FnOnce"
            ) {
                return None;
            }
            let PathArguments::Parenthesized(arguments) = &segment.arguments else {
                return None;
            };
            let ReturnType::Type(_, output) = &arguments.output else {
                return None;
            };
            option_inner_type(output)
        }),
        _ => None,
    };
}

pub(super) fn map_value_type_path(rust_type: &Type) -> Option<&syn::TypePath> {
    let Type::Path(path) = rust_type else {
        return None;
    };
    let segment = path.path.segments.last()?;
    if !matches!(segment.ident.to_string().as_str(), "HashMap" | "BTreeMap") {
        return None;
    }
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return None;
    };
    let value = arguments
        .args
        .iter()
        .filter_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(rust_type),
            _ => None,
        })
        .nth(1)?;
    let Type::Path(path) = value else {
        return None;
    };
    return Some(path);
}

pub(crate) fn insert_type_script_nullable_option_parameter_context<'a>(
    context: &mut HashSet<String>,
    programs: impl IntoIterator<Item = (&'a str, &'a Program)>,
    parameters: &[crate::TypeScriptNullableOptionParameter<'_>],
) -> Result<(), CompileError> {
    let programs = programs.into_iter().collect::<Vec<_>>();
    for metadata in parameters {
        let mut matches =
            programs
                .iter()
                .flat_map(|(module, program)| {
                    program.functions.iter().flat_map(move |function| {
                        function.sig.inputs.iter().enumerate().filter_map(
                            move |(index, argument)| {
                                let FnArg::Typed(argument) = argument else {
                                    return None;
                                };
                                let Pat::Ident(pattern) = argument.pat.as_ref() else {
                                    return None;
                                };
                                (snake_to_lower_camel(&function.sig.ident.to_string())
                                    == metadata.owner
                                    && snake_to_lower_camel(&pattern.ident.to_string())
                                        == metadata.parameter)
                                    .then_some((*module, function, argument, pattern, index))
                            },
                        )
                    })
                })
                .collect::<Vec<_>>();
        if matches.len() != 1 {
            return Err(compile_error(format!(
                "TypeScript nullable Option parameter `{}.{}` must resolve to exactly one visible Rust function parameter, found {}",
                metadata.owner,
                metadata.parameter,
                matches.len()
            )));
        }
        let (module, function, argument, pattern, index) =
            matches.pop().expect("one match was required");
        if !is_crate_wide(&function.vis) || option_inner_type(&argument.ty).is_none() {
            return Err(compile_error(format!(
                "TypeScript nullable Option parameter `{}.{}` must designate a public or crate-visible Rust function `Option` parameter",
                metadata.owner, metadata.parameter
            )));
        }
        let function_name = function.sig.ident.to_string();
        let access = if is_public(&function.vis) {
            SourceAccess::Public
        } else {
            SourceAccess::Crate
        };
        context.insert(owner_marker(
            FUNCTION_OWNER_MARKER,
            module,
            &function_name,
            access,
        ));
        context.insert(format!(
            "{NULLABLE_OPTION_PARAMETER_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{}",
            pattern.ident
        ));
        context.insert(format!("{NULLABLE_CALL_MARKER}{function_name}:{index}"));
    }
    return Ok(());
}

pub(crate) fn insert_type_script_default_null_option_parameter_context<'a>(
    context: &mut HashSet<String>,
    programs: impl IntoIterator<Item = (&'a str, &'a Program)>,
    parameters: &[crate::TypeScriptDefaultNullOptionParameter<'_>],
) -> Result<(), CompileError> {
    let programs = programs.into_iter().collect::<Vec<_>>();
    for metadata in parameters {
        let mut matches =
            programs
                .iter()
                .flat_map(|(module, program)| {
                    program.functions.iter().flat_map(move |function| {
                        function.sig.inputs.iter().enumerate().filter_map(
                            move |(index, argument)| {
                                let FnArg::Typed(argument) = argument else {
                                    return None;
                                };
                                let Pat::Ident(pattern) = argument.pat.as_ref() else {
                                    return None;
                                };
                                (snake_to_lower_camel(&function.sig.ident.to_string())
                                    == metadata.owner
                                    && snake_to_lower_camel(&pattern.ident.to_string())
                                        == metadata.parameter)
                                    .then_some((*module, function, argument, pattern, index))
                            },
                        )
                    })
                })
                .collect::<Vec<_>>();
        if matches.len() != 1 {
            return Err(compile_error(format!(
                "TypeScript default-null Option parameter `{}.{}` must resolve to exactly one visible Rust function parameter, found {}",
                metadata.owner,
                metadata.parameter,
                matches.len()
            )));
        }
        let (module, function, argument, pattern, index) =
            matches.pop().expect("one match was required");
        if !is_crate_wide(&function.vis) || option_inner_type(&argument.ty).is_none() {
            return Err(compile_error(format!(
                "TypeScript default-null Option parameter `{}.{}` must designate a public or crate-visible Rust function `Option` parameter",
                metadata.owner, metadata.parameter
            )));
        }
        let function_name = function.sig.ident.to_string();
        let access = if is_public(&function.vis) {
            SourceAccess::Public
        } else {
            SourceAccess::Crate
        };
        context.insert(owner_marker(
            FUNCTION_OWNER_MARKER,
            module,
            &function_name,
            access,
        ));
        context.insert(format!(
            "{DEFAULT_NULL_OPTION_PARAMETER_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{}",
            pattern.ident
        ));
        context.insert(format!("{NULLABLE_CALL_MARKER}{function_name}:{index}"));
    }
    return Ok(());
}

pub(super) fn type_script_type_alias(
    context: &HashSet<String>,
    name: &str,
) -> Option<(String, Option<String>)> {
    let prefix = format!("{TYPE_SCRIPT_TYPE_ALIAS_MARKER}{name}{PROVENANCE_SEPARATOR}");
    return context.iter().find_map(|marker| {
        let representation = marker.strip_prefix(&prefix)?;
        let (module, target) = representation.split_once(PROVENANCE_SEPARATOR)?;
        Some((
            target.to_string(),
            (!module.is_empty()).then(|| module.to_string()),
        ))
    });
}

pub(crate) fn type_script_type_aliases(
    context: &HashSet<String>,
) -> Vec<(String, String, Option<String>)> {
    let mut aliases = context
        .iter()
        .filter_map(|marker| {
            let representation = marker.strip_prefix(TYPE_SCRIPT_TYPE_ALIAS_MARKER)?;
            let (name, representation) = representation.split_once(PROVENANCE_SEPARATOR)?;
            let (module, target) = representation.split_once(PROVENANCE_SEPARATOR)?;
            Some((
                name.to_string(),
                target.to_string(),
                (!module.is_empty()).then(|| module.to_string()),
            ))
        })
        .collect::<Vec<_>>();
    aliases.sort();
    return aliases;
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
            if let Some(pinned) = pinned_boxed_trait_output(path, entities)? {
                return match pinned {
                    PinnedBoxedTrait::Future(output) => {
                        Ok(format!("Promise<{}>", emit_type(output, entities)?))
                    }
                    PinnedBoxedTrait::Stream(item) => {
                        Ok(format!("AsyncIterable<{}>", emit_type(item, entities)?))
                    }
                };
            }
            // D15: `Err` is the canonical error object a promise rejects with (or a function throws),
            // and `Ok` is the plain value, so `Result<T, FlightError>` is `T` and `FlightError` is the
            // `Error` it constructs.
            if flight_error_result_type(rust_type, &BTreeSet::new())
                && let Some(segment) = path.path.segments.last()
                && let syn::PathArguments::AngleBracketed(arguments) = &segment.arguments
                && let Some(syn::GenericArgument::Type(output)) = arguments.args.first()
            {
                return emit_type(output, entities);
            }
            if path.qself.is_none()
                && path.path.segments.last().is_some_and(|segment| {
                    segment.ident == "FlightError" && segment.arguments.is_empty()
                })
                && (path.path.segments.len() == 1
                    || path
                        .path
                        .segments
                        .first()
                        .is_some_and(|first| first.ident == "flight_entity"))
            {
                return Ok("Error".to_string());
            }
            if let Some(kind) = hash_collection_type(rust_type, entities) {
                let segment = path
                    .path
                    .segments
                    .last()
                    .expect("resolved paths have a segment");
                let name = if matches!(kind, BindingFact::HashMap) {
                    "HashMap"
                } else {
                    "HashSet"
                };
                return emit_hash_collection_type(name, segment, entities);
            }
            let Some(segment) = path.path.segments.last() else {
                return Err(compile_error("empty Rust type path"));
            };
            let mut name = segment.ident.to_string();
            if path.path.segments.len() > 1
                && path.path.segments.first().is_some_and(|segment| {
                    vitest_current_path_prefix(entities, &segment.ident.to_string()).is_some()
                })
            {
                name = vitest_struct_path_binding_name(&path.path, entities)?.ok_or_else(|| {
                    compile_error("current-package struct/type path has no binding")
                })?;
            }
            if matches!(segment.arguments, PathArguments::None)
                && let Some((target, _)) = type_script_type_alias(entities, &name)
            {
                if is_internal_type_export(entities, &name) {
                    return Ok(name);
                }
                return Ok(target);
            }
            if path.path.segments.len() > 1
                && let Some(first) = path.path.segments.first()
                && first.ident.to_string().starts_with("flight_")
                && !marker_suffixes(entities, VITEST_LOCAL_CRATE_MARKER)
                    .contains(&first.ident.to_string())
            {
                if matches!(name.as_str(), "Ref" | "Arc" | "Box") {
                    // Transparent wrappers fall through to the name match below.
                } else {
                    let module = snake_to_lower_camel(&first.ident.to_string());
                    return match &segment.arguments {
                        PathArguments::None => Ok(format!("{module}.{name}")),
                        PathArguments::AngleBracketed(arguments) => {
                            let type_args = arguments
                                .args
                                .iter()
                                .filter_map(|argument| match argument {
                                    GenericArgument::Type(rust_type) => {
                                        Some(emit_type(rust_type, entities))
                                    }
                                    GenericArgument::Lifetime(_) => None,
                                    _ => Some(Err(compile_error(format!(
                                        "foreign Rust type `{name}` has an unsupported generic argument"
                                    )))),
                                })
                                .collect::<Result<Vec<_>, _>>()?;
                            if type_args.is_empty() {
                                Ok(format!("{module}.{name}"))
                            } else {
                                Ok(format!("{module}.{name}<{}>", type_args.join(", ")))
                            }
                        }
                        PathArguments::Parenthesized(_) => Err(compile_error(format!(
                            "foreign Rust type `{name}` cannot use parenthesized arguments"
                        ))),
                    };
                }
            }
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
                    "{name}<{}, {}>",
                    emit_type(types[0], entities)?,
                    js_string_literal(&tag)
                ));
            }
            if matches!(segment.arguments, PathArguments::None)
                && let Some(union) = inline_string_union(entities, &name)
            {
                if is_internal_type_export(entities, &name) {
                    return Ok(name);
                }
                return Ok(union);
            }
            // A standard `Box` only transfers ownership, so a boxed typed-array alias is that typed
            // array; the owner is proven through the path's provenance (an aliased standard `Box`
            // qualifies, a crate, imported, globbed or unresolved `Box` never does).
            if let Some(typed_array) = boxed_typed_array(segment)
                && resolve_type_path(&path.path, entities)
                    .is_some_and(|owner| is_standard_type_path(&owner, "Box"))
            {
                return Ok(typed_array.to_string());
            }
            // A standard `RwLock<T>`, under any imported name, is the shared cell `Ref<T>` erases to
            // `T`; only its proven provenance qualifies.
            if resolve_type_path(&path.path, entities).is_some_and(|owner| {
                matches!(
                    owner
                        .iter()
                        .map(String::as_str)
                        .collect::<Vec<_>>()
                        .as_slice(),
                    ["std", "sync", "RwLock"]
                )
            }) {
                return emit_single_generic_type(segment, entities);
            }
            match name.as_str() {
                "bool" => Ok("boolean".to_string()),
                "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32"
                | "u64" | "usize" => Ok("number".to_string()),
                "String" | "str" | "char" => Ok("string".to_string()),
                "UnknownValue" => Ok("unknown".to_string()),
                // `std::cmp::Ordering` is a comparator result: its sign is the ordering.
                "Ordering" => Ok("number".to_string()),
                "Option" => {
                    let inner = emit_single_generic_type(segment, entities)?;
                    if entities.contains(NULLABLE_OPTIONS_MARKER) {
                        Ok(nullable_type(inner))
                    } else if inner.contains("=>") {
                        Ok(format!("({inner}) | undefined"))
                    } else {
                        Ok(format!("{inner} | undefined"))
                    }
                }
                "Vec" => Ok(array_type(emit_single_generic_type(segment, entities)?)),
                "Record" if matches!(segment.arguments, PathArguments::AngleBracketed(_)) => {
                    Ok(format!(
                        "Record<string, {}>",
                        emit_single_generic_type(segment, entities)?
                    ))
                }
                "HashSet" | "HashMap" if resolve_type_path(&path.path, entities).is_none() => {
                    Err(compile_error(format!(
                        "cannot resolve the provenance of `{name}`; import it from `std::collections` to lower it to a JavaScript collection"
                    )))
                }
                "Mutex" => Ok(format!(
                    "{{ value: {} }}",
                    emit_single_generic_type(segment, entities)?
                )),
                "AtomicU32" => Ok("{ value: number }".to_string()),
                "Arc" => {
                    let interior_mutable = match &segment.arguments {
                        PathArguments::AngleBracketed(arguments) => arguments.args.iter().any(
                            |argument| {
                                matches!(argument, GenericArgument::Type(inner) if rust_type_has_interior_mutability(inner, entities))
                            },
                        ),
                        _ => false,
                    };
                    let inner = emit_single_generic_type(segment, entities)?;
                    if is_primitive_typescript_type(&inner) || interior_mutable {
                        Ok(inner)
                    } else {
                        Ok(format!("Readonly<{inner}>"))
                    }
                }
                "Box"
                    if resolve_type_path(&path.path, entities)
                        .is_some_and(|owner| is_standard_type_path(&owner, "Box")) =>
                {
                    emit_single_generic_type(segment, entities)
                }
                "Ref" => emit_single_generic_type(segment, entities),
                // An unresolved `RwLock` could be the standard cell or another type, so it fails
                // closed; a locally declared one keeps its own name below.
                "RwLock" if resolve_type_path(&path.path, entities).is_none() => {
                    Err(compile_error(
                        "cannot resolve the provenance of `RwLock`; import it from `std::sync` to lower it to its shared payload",
                    ))
                }
                _ if entities.contains(&name) => {
                    let arguments = emit_path_type_arguments(segment, entities)?;
                    if entities.contains(&format!("{TARGET_NATIVE_ENTITY_MARKER}{name}")) {
                        Ok(format!("{name}{arguments}"))
                    } else {
                        Ok(format!("{name}Raw{arguments}"))
                    }
                }
                _ => {
                    let typescript_name = export_name(entities, &name).unwrap_or(&name);
                    if matches!(segment.arguments, PathArguments::None) {
                        Ok(typescript_name.to_string())
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
                            Ok(typescript_name.to_string())
                        } else {
                            Ok(format!("{typescript_name}<{}>", rendered.join(", ")))
                        }
                    }
                }
            }
        }
        Type::Reference(reference) => {
            let inner = emit_type(&reference.elem, entities)?;
            if reference.mutability.is_some()
                || is_primitive_typescript_type(&inner)
                || rust_type_has_interior_mutability(&reference.elem, entities)
                || named_type(&reference.elem).is_some_and(|name| {
                    entities.contains(&format!("{INTERIOR_MUTABLE_STRUCT_MARKER}{name}"))
                        || type_script_type_alias(entities, &name)
                            .is_some_and(|(target, _)| is_primitive_typescript_type(&target))
                })
                || type_is_current_parameter(&reference.elem, entities)
            {
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
        Type::ImplTrait(impl_trait) => emit_function_trait_type(&impl_trait.bounds, entities),
        Type::Infer(_) => Ok("unknown".to_string()),
        Type::Never(_) => Ok("never".to_string()),
        Type::TraitObject(object) => emit_function_trait_type(&object.bounds, entities),
        _ => Err(compile_error(format!(
            "unsupported Rust type `{}`",
            type_kind(rust_type)
        ))),
    };
}

pub(super) fn emit_path_type_arguments(
    segment: &syn::PathSegment,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return Ok(String::new());
    };
    let rendered = arguments
        .args
        .iter()
        .filter_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(emit_type(rust_type, entities)),
            _ => None,
        })
        .collect::<Result<Vec<_>, _>>()?;
    if rendered.is_empty() {
        return Ok(String::new());
    }
    return Ok(format!("<{}>", rendered.join(", ")));
}

pub(crate) fn insert_type_parameter_context(
    context: &mut HashSet<String>,
    generics: &syn::Generics,
) {
    for parameter in &generics.params {
        if let syn::GenericParam::Type(parameter) = parameter {
            context.insert(format!("{TYPE_PARAMETER_MARKER}{}", parameter.ident));
        }
    }
}

pub(super) fn type_is_current_parameter(rust_type: &Type, entities: &HashSet<String>) -> bool {
    return match rust_type {
        Type::Group(group) => type_is_current_parameter(&group.elem, entities),
        Type::Paren(paren) => type_is_current_parameter(&paren.elem, entities),
        Type::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments.first().is_some_and(|segment| {
                entities.contains(&format!("{TYPE_PARAMETER_MARKER}{}", segment.ident))
            })
        }
        _ => false,
    };
}

pub(super) fn typed_array_for_literal(expression: &Expr) -> Option<&'static str> {
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

pub(super) fn typed_array_for_type(rust_type: &Type) -> Option<&'static str> {
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

pub(super) fn typed_array_for_primitive(name: &str) -> Option<&'static str> {
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

pub(super) fn typed_array_element_primitive(array_name: &str) -> Option<&'static str> {
    return match array_name {
        "Float32Array" => Some("f32"),
        "Float64Array" => Some("f64"),
        "Int8Array" => Some("i8"),
        "Int16Array" => Some("i16"),
        "Int32Array" => Some("i32"),
        "Uint8Array" => Some("u8"),
        "Uint16Array" => Some("u16"),
        "Uint32Array" => Some("u32"),
        _ => None,
    };
}

pub(super) fn emit_type_alias(
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
    let mut type_context = entities.clone();
    insert_type_parameter_context(&mut type_context, &type_alias.generics);
    if current_source(entities).is_some_and(|module| {
        entities.contains(&format!(
            "{NULLABLE_OPTION_CALLABLE_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{}",
            type_alias.ident
        ))
    }) {
        type_context.insert(RETURNS_NULLABLE_MARKER.to_string());
    }
    let rendered = if let Some(parameter_names) = parameter_names {
        emit_named_callable_type(&type_alias.ty, &type_context, parameter_names)?
    } else {
        emit_type(&type_alias.ty, &type_context)?
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

pub(super) fn emit_bare_function_type(
    function: &syn::TypeBareFn,
    entities: &HashSet<String>,
    parameter_names: Option<&[String]>,
) -> Result<String, CompileError> {
    let parameter_types = function
        .inputs
        .iter()
        .map(|argument| &argument.ty)
        .collect::<Vec<_>>();
    let parameters = emit_callable_parameters(&parameter_types, entities, parameter_names)?;
    let output = emit_callable_return_type(&function.output, entities)?;
    return Ok(format!("({}) => {output}", parameters.join(", ")));
}

pub(super) fn emit_callable_return_type(
    output: &ReturnType,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return match output {
        ReturnType::Default => Ok("void".to_string()),
        ReturnType::Type(_, rust_type) if entities.contains(RETURNS_NULLABLE_MARKER) => {
            let Some(inner) = option_inner_type(rust_type) else {
                return Err(compile_error(
                    "nullable callable return metadata no longer designates an `Option` return",
                ));
            };
            Ok(nullable_type(emit_type(inner, entities)?))
        }
        ReturnType::Type(_, rust_type) => emit_type(rust_type, entities),
    };
}

pub(super) fn emit_named_callable_type(
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
            if !matches!(
                segment.ident.to_string().as_str(),
                "Arc" | "Box" | "Option" | "Ref"
            ) {
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
            let inner = emit_named_callable_type(types[0], entities, parameter_names)?;
            if segment.ident == "Option" {
                return Ok(if entities.contains(NULLABLE_OPTIONS_MARKER) {
                    nullable_type(inner)
                } else {
                    format!("({inner}) | undefined")
                });
            }
            Ok(inner)
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

pub(crate) fn emit_type_parameters(generics: &syn::Generics) -> String {
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

// A Rust primary can lower to an operator expression (`v.is_empty()` emits `v.length === 0`,
// `Arc::ptr_eq(a, b)` emits `a === b`). The precedence model above is Rust-shaped, so wherever such a
// lowering becomes an operand it is parenthesized here rather than trusted: an unparenthesized
// `!v.length === 0` parses as `(!v.length) === 0`.
