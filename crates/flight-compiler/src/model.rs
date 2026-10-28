use std::collections::HashSet;

use syn::{Attribute, Fields, Item, ItemFn, ItemStruct, Type, UseTree, Visibility};

use crate::{CompileError, compile_error};

pub(crate) struct Program {
    pub(crate) entities: HashSet<String>,
    pub(crate) functions: Vec<ItemFn>,
    pub(crate) structs: Vec<ItemStruct>,
}

pub(crate) struct TestProgram {
    pub(crate) contract_package: String,
    pub(crate) helpers: Vec<ItemFn>,
    pub(crate) standard_constants: HashSet<String>,
    pub(crate) suites: Vec<TestSuite>,
}

pub(crate) struct TestSuite {
    pub(crate) name: String,
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

pub(crate) fn parse_test_program(source: &str) -> Result<TestProgram, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust test source: {error}")))?;
    let mut contract_crates = Vec::new();
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
                if let Some(crate_name) = wildcard_crate(&item_use.tree)
                    && crate_name.starts_with("flight_")
                {
                    contract_crates.push(crate_name);
                }
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

    contract_crates.sort();
    contract_crates.dedup();
    let contract_crate = match contract_crates.as_slice() {
        [contract_crate] => contract_crate,
        [] => {
            return Err(compile_error(
                "portable Rust test source needs one `use flight_package::*;` contract import",
            ));
        }
        _ => {
            return Err(compile_error(
                "portable Rust test source has multiple wildcard Flight imports; symbol ownership is ambiguous",
            ));
        }
    };
    let contract_package = contract_crate
        .strip_prefix("flight_")
        .expect("validated Flight crate prefix")
        .replace('_', "-");
    return Ok(TestProgram {
        contract_package: format!("@flighthq/{contract_package}/contract"),
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
    let mut tests = Vec::new();
    for item in items {
        match item {
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
    if tests.is_empty() {
        return Err(compile_error(format!(
            "portable test module `{}` contains no `#[test]` functions",
            module.ident
        )));
    }
    return Ok(TestSuite {
        name: module.ident.to_string(),
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

fn wildcard_crate(tree: &UseTree) -> Option<String> {
    let UseTree::Path(root) = tree else {
        return None;
    };
    let UseTree::Glob(_) = root.tree.as_ref() else {
        return None;
    };
    return Some(root.ident.to_string());
}
