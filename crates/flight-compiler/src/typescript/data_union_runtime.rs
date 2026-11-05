use std::collections::{BTreeSet, HashSet};

use syn::{GenericArgument, ItemStruct, PathArguments, Type};

use crate::CompileError;
use crate::model::Program;

use super::{
    DATA_UNION_VARIANT_MARKER, RESERVED_KEY_DATA_UNION_VARIANT_MARKER,
    RESERVED_KEY_DATA_UNION_VARIANT_TYPE_MARKER, RuntimeCategory, compile_error,
    hash_collection_type, insert_program_type_path_context, resolve_type_path,
    rust_type_description, snake_to_lower_camel,
};
pub(super) fn transparent_data_union(rust_enum: &syn::ItemEnum) -> bool {
    return !rust_enum
        .variants
        .iter()
        .any(|variant| matches!(variant.fields, syn::Fields::Named(_)));
}

pub(super) fn entity_ref_data_union(rust_enum: &syn::ItemEnum, programs: &[&Program]) -> bool {
    let payload_variants = rust_enum
        .variants
        .iter()
        .filter(|variant| !matches!(variant.fields, syn::Fields::Unit));
    let mut count = 0;
    for variant in payload_variants {
        let syn::Fields::Unnamed(fields) = &variant.fields else {
            return false;
        };
        if fields.unnamed.len() != 1 {
            return false;
        }
        let Some(inner) = peel_wrapper_type(&fields.unnamed[0].ty) else {
            return false;
        };
        if !programs
            .iter()
            .any(|program| program.entities.contains(&inner))
        {
            return false;
        }
        count += 1;
    }
    return count >= 2;
}

pub(super) fn peel_wrapper_type(rust_type: &Type) -> Option<String> {
    match rust_type {
        Type::Reference(reference) => peel_wrapper_type(&reference.elem),
        Type::Group(group) => peel_wrapper_type(&group.elem),
        Type::Paren(paren) => peel_wrapper_type(&paren.elem),
        Type::Path(path) => {
            let segment = path.path.segments.last()?;
            let name = segment.ident.to_string();
            match name.as_str() {
                "Arc" | "Box" | "Ref" | "RwLock" => {
                    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                        return None;
                    };
                    let inner = arguments.args.iter().find_map(|argument| match argument {
                        GenericArgument::Type(rust_type) => Some(rust_type),
                        _ => None,
                    })?;
                    peel_wrapper_type(inner)
                }
                _ => Some(name),
            }
        }
        _ => None,
    }
}

pub(super) fn peel_wrapper_type_name(description: &str) -> &str {
    let mut s = description;
    loop {
        let found = ["Arc<", "Box<", "Rc<", "Ref<", "RwLock<"]
            .iter()
            .find_map(|prefix| s.strip_prefix(prefix));
        let Some(inner) = found else {
            return s;
        };
        let Some(inner) = inner.strip_suffix('>') else {
            return s;
        };
        s = inner;
    }
}

pub(super) fn runtime_categories_for_type(
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
                // `Map` / `Set` instances have a non-plain prototype.
                "HashMap" | "HashSet"
                    if !programs
                        .iter()
                        .any(|program| program.type_names.contains(&name)) =>
                {
                    let resolutions = programs
                        .iter()
                        .filter_map(|program| {
                            let mut context = HashSet::new();
                            insert_program_type_path_context(&mut context, program);
                            resolve_type_path(&path.path, &context)
                                .map(|_| hash_collection_type(rust_type, &context).is_some())
                        })
                        .collect::<Vec<_>>();
                    if resolutions.is_empty() || resolutions.contains(&false) {
                        Err(compile_error(format!(
                            "cannot resolve data union payload `{name}` to `std::collections::{name}`"
                        )))
                    } else {
                        Ok(BTreeSet::from([RuntimeCategory::Object]))
                    }
                }
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

pub(super) fn data_union_variant_marker(
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

pub(super) fn reserved_key_data_union_variant_marker(
    owner: &str,
    variant: &str,
    keys: &BTreeSet<String>,
) -> String {
    return format!(
        "{RESERVED_KEY_DATA_UNION_VARIANT_MARKER}{owner}:{variant}:{}",
        keys.iter().cloned().collect::<Vec<_>>().join(",")
    );
}

pub(super) fn reserved_key_data_union_variant_type_marker(
    owner: &str,
    variant: &str,
    payload_type: &str,
) -> String {
    return format!(
        "{RESERVED_KEY_DATA_UNION_VARIANT_TYPE_MARKER}{owner}:{variant}:{payload_type}"
    );
}

pub(super) fn reserved_key_record_fields(
    rust_type: &Type,
    programs: &[&Program],
    external_record_structs: &[ItemStruct],
    resolving: &mut BTreeSet<String>,
) -> Result<BTreeSet<String>, CompileError> {
    return match rust_type {
        Type::Group(group) => {
            reserved_key_record_fields(&group.elem, programs, external_record_structs, resolving)
        }
        Type::Paren(paren) => {
            reserved_key_record_fields(&paren.elem, programs, external_record_structs, resolving)
        }
        Type::Reference(reference) => reserved_key_record_fields(
            &reference.elem,
            programs,
            external_record_structs,
            resolving,
        ),
        Type::Path(path) => {
            let Some(segment) = path.path.segments.last() else {
                return Err(compile_error("empty Rust type path"));
            };
            let name = segment.ident.to_string();
            if matches!(name.as_str(), "Arc" | "Box" | "Ref") {
                let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                    return Err(compile_error(format!(
                        "`{name}` reserved-key data union payload needs one type argument"
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
                        "`{name}` reserved-key data union payload needs exactly one type argument"
                    )));
                }
                return reserved_key_record_fields(
                    types[0],
                    programs,
                    external_record_structs,
                    resolving,
                );
            }
            if !resolving.insert(name.clone()) {
                return Err(compile_error(format!(
                    "reserved-key data union payload contains a recursive alias through `{name}`"
                )));
            }
            let structures = programs
                .iter()
                .flat_map(|program| &program.structs)
                .chain(external_record_structs)
                .filter(|structure| structure.ident == name)
                .collect::<Vec<_>>();
            let aliases = programs
                .iter()
                .flat_map(|program| &program.type_aliases)
                .filter(|alias| alias.ident == name)
                .collect::<Vec<_>>();
            let result = match (structures.as_slice(), aliases.as_slice()) {
                ([structure], []) => {
                    let syn::Fields::Named(fields) = &structure.fields else {
                        return Err(compile_error(format!(
                            "reserved-key data union payload type `{name}` must be a named-field struct"
                        )));
                    };
                    let mut keys = BTreeSet::new();
                    for field in &fields.named {
                        let Some(identifier) = &field.ident else {
                            unreachable!("named fields always have identifiers");
                        };
                        let key = snake_to_lower_camel(&identifier.to_string());
                        if !keys.insert(key.clone()) {
                            return Err(compile_error(format!(
                                "reserved-key data union payload type `{name}` maps more than one field to `{key}`"
                            )));
                        }
                    }
                    Ok(keys)
                }
                ([], [alias]) => reserved_key_record_fields(
                    &alias.ty,
                    programs,
                    external_record_structs,
                    resolving,
                ),
                ([], []) => Err(compile_error(format!(
                    "cannot resolve reserved-key data union payload type `{name}` to a record declaration"
                ))),
                _ => Err(compile_error(format!(
                    "reserved-key data union payload type `{name}` has ambiguous record declarations"
                ))),
            };
            resolving.remove(&name);
            result
        }
        _ => Err(compile_error(format!(
            "cannot resolve reserved-key data union payload `{}` to a record declaration",
            rust_type_description(rust_type)
        ))),
    };
}

// A name not used by `used` derived from `base` (`base`, `base1`, ...), recorded as used.
pub(super) fn fresh_identifier(base: &str, used: &mut HashSet<String>) -> String {
    let name = (0..)
        .map(|index| {
            if index == 0 {
                base.to_string()
            } else {
                format!("{base}{index}")
            }
        })
        .find(|name| !used.contains(name))
        .expect("an unbounded candidate sequence always yields an unused name");
    used.insert(name.clone());
    return name;
}
