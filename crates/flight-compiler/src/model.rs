use std::collections::HashSet;

use syn::{
    Attribute, Fields, Item, ItemConst, ItemEnum, ItemFn, ItemStatic, ItemStruct, ItemType, Type,
    UseTree, Visibility,
};

use crate::{CompileError, SourceMode, compile_error};

pub(crate) struct Program {
    pub(crate) constants: Vec<ItemConst>,
    pub(crate) entities: HashSet<String>,
    pub(crate) enums: Vec<ItemEnum>,
    pub(crate) functions: Vec<ItemFn>,
    pub(crate) standard_constants: HashSet<String>,
    pub(crate) statics: Vec<ItemStatic>,
    pub(crate) structs: Vec<ItemStruct>,
    pub(crate) type_aliases: Vec<ItemType>,
}

pub(crate) struct TestProgram {
    pub(crate) helpers: Vec<ItemFn>,
    pub(crate) standard_constants: HashSet<String>,
    pub(crate) suites: Vec<TestSuite>,
}

pub(crate) struct TestSuite {
    pub(crate) name: String,
    pub(crate) skipped_tests: Vec<String>,
    pub(crate) tests: Vec<TestCase>,
}

pub(crate) struct TestCase {
    pub(crate) function: ItemFn,
    pub(crate) should_panic: bool,
}

fn collect_standard_constant(
    tree: &UseTree,
    prefix: &mut Vec<String>,
    constants: &mut HashSet<String>,
) {
    match tree {
        UseTree::Name(name) => {
            if prefix == &["std", "f32", "consts"] && name.ident == "PI" {
                constants.insert("PI".to_string());
            }
        }
        UseTree::Path(path) => {
            prefix.push(path.ident.to_string());
            collect_standard_constant(&path.tree, prefix, constants);
            prefix.pop();
        }
        UseTree::Group(group) => {
            for item in &group.items {
                collect_standard_constant(item, prefix, constants);
            }
        }
        UseTree::Glob(_) | UseTree::Rename(_) => {}
    }
}

fn has_attribute(attributes: &[Attribute], expected: &str) -> bool {
    return attributes
        .iter()
        .any(|attribute| attribute.path().is_ident(expected));
}

fn has_entity_runtime(structure: &ItemStruct) -> bool {
    return structure.fields.iter().any(|field| {
        !is_public(&field.vis)
            && field.ident.as_ref().is_some_and(|ident| ident == "runtime")
            && type_name(&field.ty).as_deref() == Some("EntityRuntimeSlot")
    });
}

fn has_rust_only_directive(attributes: &[Attribute]) -> bool {
    return attributes.iter().any(|attribute| {
        if !attribute.path().is_ident("doc") {
            return false;
        }
        let syn::Meta::NameValue(meta) = &attribute.meta else {
            return false;
        };
        let syn::Expr::Lit(value) = &meta.value else {
            return false;
        };
        let syn::Lit::Str(value) = &value.lit else {
            return false;
        };
        return value.value().contains("flight-compiler: rust-only");
    });
}

pub(crate) fn source_mode(source: &str) -> Result<SourceMode, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    let mut rust_only = false;
    let mut target_native = false;
    for attribute in &file.attrs {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        match directive {
            "rust-only" => rust_only = true,
            "target-native" => target_native = true,
            _ => {}
        }
    }
    if rust_only && target_native {
        return Err(compile_error(
            "source cannot be both `flight-compiler: rust-only` and `flight-compiler: target-native`",
        ));
    }
    return Ok(if rust_only {
        SourceMode::RustOnly
    } else if target_native {
        SourceMode::TargetNative
    } else {
        SourceMode::Generate
    });
}

fn doc_directive(attribute: &Attribute) -> Option<&str> {
    if !attribute.path().is_ident("doc") {
        return None;
    }
    let syn::Meta::NameValue(meta) = &attribute.meta else {
        return None;
    };
    let syn::Expr::Lit(value) = &meta.value else {
        return None;
    };
    let syn::Lit::Str(value) = &value.lit else {
        return None;
    };
    let value = value.value();
    let directive = value.trim().strip_prefix("flight-compiler:")?.trim();
    // The returned value must outlive this function, so match the finite vocabulary here.
    return match directive {
        "rust-only" => Some("rust-only"),
        "target-native" => Some("target-native"),
        _ => None,
    };
}

fn is_public(visibility: &Visibility) -> bool {
    return matches!(visibility, Visibility::Public(_));
}

pub(crate) fn parse_program(source: &str) -> Result<Program, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    let mut constants = Vec::new();
    let mut entities = HashSet::new();
    let mut enums = Vec::new();
    let mut functions = Vec::new();
    let mut standard_constants = HashSet::new();
    let mut statics = Vec::new();
    let mut structs = Vec::new();
    let mut type_aliases = Vec::new();

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
        if let Item::Use(item_use) = &item {
            collect_standard_constant(&item_use.tree, &mut Vec::new(), &mut standard_constants);
        }
        match item {
            Item::Const(item) => constants.push(item),
            Item::Enum(item) => {
                validate_enum(&item)?;
                enums.push(item);
            }
            Item::Fn(function) => functions.push(function),
            Item::Static(item) => statics.push(item),
            Item::Struct(structure) => {
                validate_fields(&structure)?;
                structs.push(structure);
            }
            Item::Type(item) => type_aliases.push(item),
            Item::Trait(item) if is_public(&item.vis) => {
                return Err(unsupported_public("trait", &item.ident.to_string()));
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
        constants,
        entities,
        enums,
        functions,
        standard_constants,
        statics,
        structs,
        type_aliases,
    });
}

pub(crate) fn parse_test_program(source: &str) -> Result<TestProgram, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust test source: {error}")))?;
    let mut helpers = Vec::new();
    let mut standard_constants = HashSet::new();
    let mut suites = Vec::new();

    for item in file.items {
        match item {
            Item::Fn(function) if has_attribute(&function.attrs, "test") => {
                return Err(compile_error(format!(
                    "top-level Rust test `{}` has no function module; portable tests need the module-per-function shape",
                    function.sig.ident
                )));
            }
            Item::Fn(function) => helpers.push(function),
            Item::Impl(_) => {
                return Err(compile_error(
                    "Rust impl blocks are sugar and cannot be a portable test source",
                ));
            }
            Item::Mod(module) => suites.push(parse_test_suite(module)?),
            Item::Use(item_use) => {
                collect_standard_constant(&item_use.tree, &mut Vec::new(), &mut standard_constants);
            }
            Item::Const(_)
            | Item::Enum(_)
            | Item::ExternCrate(_)
            | Item::ForeignMod(_)
            | Item::Macro(_)
            | Item::Static(_)
            | Item::Struct(_)
            | Item::Trait(_)
            | Item::TraitAlias(_)
            | Item::Type(_)
            | Item::Union(_)
            | Item::Verbatim(_) => {
                return Err(compile_error(
                    "unsupported top-level item in portable Rust test source",
                ));
            }
            _ => {}
        }
    }

    return Ok(TestProgram {
        helpers,
        standard_constants,
        suites,
    });
}

fn parse_test_suite(module: syn::ItemMod) -> Result<TestSuite, CompileError> {
    let Some((_, items)) = module.content else {
        return Err(compile_error(format!(
            "portable test module `{}` must be inline",
            module.ident
        )));
    };
    let mut skipped_tests = Vec::new();
    let mut tests = Vec::new();
    for item in items {
        match item {
            Item::Fn(function)
                if has_attribute(&function.attrs, "test")
                    && has_rust_only_directive(&function.attrs) =>
            {
                skipped_tests.push(function.sig.ident.to_string());
            }
            Item::Fn(function) if has_attribute(&function.attrs, "test") => {
                let should_panic = has_attribute(&function.attrs, "should_panic");
                tests.push(TestCase {
                    function,
                    should_panic,
                });
            }
            Item::Use(_) => {}
            Item::Fn(function) => {
                return Err(compile_error(format!(
                    "helper `{}` is nested in test module `{}`; portable helpers must be top-level",
                    function.sig.ident, module.ident
                )));
            }
            _ => {
                return Err(compile_error(format!(
                    "unsupported item in portable test module `{}`",
                    module.ident
                )));
            }
        }
    }
    if tests.is_empty() && skipped_tests.is_empty() {
        return Err(compile_error(format!(
            "portable test module `{}` contains no `#[test]` functions",
            module.ident
        )));
    }
    return Ok(TestSuite {
        name: module.ident.to_string(),
        skipped_tests,
        tests,
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

fn validate_enum(rust_enum: &ItemEnum) -> Result<(), CompileError> {
    for variant in &rust_enum.variants {
        if !matches!(variant.fields, Fields::Unit) || variant.discriminant.is_some() {
            return Err(compile_error(format!(
                "unsupported enum variant `{}::{}`; only unit variants without explicit discriminants are portable",
                rust_enum.ident, variant.ident
            )));
        }
    }
    return Ok(());
}

fn validate_fields(structure: &ItemStruct) -> Result<(), CompileError> {
    let Fields::Named(fields) = &structure.fields else {
        return Err(compile_error(format!(
            "unsupported struct `{}`: only named fields can be transpiled",
            structure.ident
        )));
    };
    for field in &fields.named {
        if !(is_public(&field.vis)
            || field.ident.as_ref().is_some_and(|ident| ident == "runtime")
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
