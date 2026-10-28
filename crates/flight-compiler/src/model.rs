use std::collections::HashSet;

use syn::{Fields, Item, ItemFn, ItemStruct, Type, Visibility};

use crate::{CompileError, compile_error};

pub(crate) struct Program {
    pub(crate) entities: HashSet<String>,
    pub(crate) functions: Vec<ItemFn>,
    pub(crate) structs: Vec<ItemStruct>,
}

fn has_entity_runtime(structure: &ItemStruct) -> bool {
    return structure.fields.iter().any(|field| {
        !is_public(&field.vis)
            && field.ident.as_ref().is_some_and(|ident| ident == "runtime")
            && type_name(&field.ty).as_deref() == Some("EntityRuntimeSlot")
    });
}

fn is_public(visibility: &Visibility) -> bool {
    return matches!(visibility, Visibility::Public(_));
}

pub(crate) fn parse_program(source: &str) -> Result<Program, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    let mut entities = HashSet::new();
    let mut functions = Vec::new();
    let mut structs = Vec::new();

    for item in &file.items {
        if let Item::Struct(structure) = item
            && has_entity_runtime(structure)
        {
            entities.insert(structure.ident.to_string());
        }
        if let Item::Macro(item_macro) = item
            && item_macro
                .mac
                .path
                .segments
                .last()
                .is_some_and(|segment| segment.ident == "impl_entity")
            && let Ok(entity_type) = syn::parse2::<Type>(item_macro.mac.tokens.clone())
            && let Some(name) = type_name(&entity_type)
        {
            entities.insert(name);
        }
    }

    for item in file.items {
        match item {
            Item::Fn(function) => functions.push(function),
            Item::Struct(structure) => {
                validate_fields(&structure)?;
                structs.push(structure);
            }
            Item::Const(item) if is_public(&item.vis) => {
                return Err(unsupported_public("constant", &item.ident.to_string()));
            }
            Item::Enum(item) if is_public(&item.vis) => {
                return Err(unsupported_public("enum", &item.ident.to_string()));
            }
            Item::Static(item) if is_public(&item.vis) => {
                return Err(unsupported_public("static", &item.ident.to_string()));
            }
            Item::Trait(item) if is_public(&item.vis) => {
                return Err(unsupported_public("trait", &item.ident.to_string()));
            }
            Item::Type(item) if is_public(&item.vis) => {
                return Err(unsupported_public("type alias", &item.ident.to_string()));
            }
            Item::Union(item) if is_public(&item.vis) => {
                return Err(unsupported_public("union", &item.ident.to_string()));
            }
            Item::ExternCrate(_)
            | Item::ForeignMod(_)
            | Item::Impl(_)
            | Item::Macro(_)
            | Item::Mod(_)
            | Item::Use(_) => {}
            _ => {}
        }
    }

    return Ok(Program {
        entities,
        functions,
        structs,
    });
}

fn type_name(rust_type: &Type) -> Option<String> {
    let Type::Path(path) = rust_type else {
        return None;
    };
    return path
        .path
        .segments
        .last()
        .map(|segment| segment.ident.to_string());
}

fn unsupported_public(kind: &str, name: &str) -> CompileError {
    return compile_error(format!(
        "unsupported public {kind} `{name}`; refusing to emit an incomplete TypeScript contract"
    ));
}

fn validate_fields(structure: &ItemStruct) -> Result<(), CompileError> {
    let Fields::Named(fields) = &structure.fields else {
        return Err(compile_error(format!(
            "unsupported struct `{}`: only named fields can be transpiled",
            structure.ident
        )));
    };
    for field in &fields.named {
        if !is_public(&field.vis)
            && !(field.ident.as_ref().is_some_and(|ident| ident == "runtime")
                && type_name(&field.ty).as_deref() == Some("EntityRuntimeSlot"))
        {
            return Err(compile_error(format!(
                "unsupported private field `{}` on `{}`; only the EntityRuntimeSlot is target-private",
                field
                    .ident
                    .as_ref()
                    .map(ToString::to_string)
                    .unwrap_or_else(|| "<unnamed>".to_string()),
                structure.ident
            )));
        }
    }
    return Ok(());
}
