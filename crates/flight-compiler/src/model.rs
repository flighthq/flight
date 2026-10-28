use std::collections::{BTreeMap, HashSet};

use syn::{
    Attribute, Fields, GenericArgument, Item, ItemConst, ItemEnum, ItemFn, ItemStatic, ItemStruct,
    ItemType, PathArguments, Type, UseTree, Visibility,
};

use crate::{CompileError, SourceMode, compile_error};

pub(crate) struct Program {
    pub(crate) callable_parameters: BTreeMap<String, Vec<String>>,
    pub(crate) constants: Vec<ItemConst>,
    pub(crate) data_unions: HashSet<String>,
    pub(crate) entities: HashSet<String>,
    pub(crate) enums: Vec<ItemEnum>,
    pub(crate) frozen_objects: BTreeMap<String, String>,
    pub(crate) functions: Vec<ItemFn>,
    pub(crate) standard_constants: HashSet<String>,
    pub(crate) statics: Vec<ItemStatic>,
    pub(crate) structs: Vec<ItemStruct>,
    pub(crate) readonly_structs: HashSet<String>,
    pub(crate) string_unions: HashSet<String>,
    pub(crate) type_aliases: Vec<ItemType>,
}

pub(crate) struct TestProgram {
    pub(crate) constants: Vec<ItemConst>,
    pub(crate) helpers: Vec<ItemFn>,
    pub(crate) standard_constants: HashSet<String>,
    pub(crate) structs: Vec<ItemStruct>,
    pub(crate) suites: Vec<TestSuite>,
    pub(crate) type_aliases: Vec<ItemType>,
}

pub(crate) struct TestSuite {
    pub(crate) helpers: Vec<ItemFn>,
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
        let name = directive.split_whitespace().next().unwrap_or_default();
        match name {
            "rust-only" => rust_only = true,
            "target-native" => target_native = true,
            "callable-parameters"
            | "companion"
            | "contract"
            | "data-union"
            | "frozen-object"
            | "identity-alias"
            | "readonly-fields"
            | "root"
            | "string-union" => {}
            _ => {
                return Err(compile_error(format!(
                    "unknown `flight-compiler` source directive `{name}`"
                )));
            }
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

fn doc_directive(attribute: &Attribute) -> Option<String> {
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
    return value
        .trim()
        .strip_prefix("flight-compiler:")
        .map(str::trim)
        .map(str::to_string);
}

fn is_public(visibility: &Visibility) -> bool {
    return matches!(visibility, Visibility::Public(_));
}

pub(crate) fn parse_program(source: &str) -> Result<Program, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    let callable_parameters = parse_callable_parameters(&file.attrs)?;
    let data_unions = parse_data_unions(&file.attrs)?;
    let frozen_objects = parse_frozen_objects(&file.attrs)?;
    let identity_alias_directives = parse_identity_aliases(&file.attrs)?;
    let mut constants = Vec::new();
    let mut entities = HashSet::new();
    let mut enums = Vec::new();
    let mut functions = Vec::new();
    let mut standard_constants = HashSet::new();
    let mut statics = Vec::new();
    let mut structs = Vec::new();
    let mut type_aliases = Vec::new();
    let readonly_structs = directive_names(source, "readonly-fields");
    let string_unions = directive_names(source, "string-union");

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
                validate_enum(&item, data_unions.contains(&item.ident.to_string()))?;
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

    validate_callable_parameters(&callable_parameters, &type_aliases)?;
    validate_data_union_directives(&data_unions, &enums, &string_unions)?;
    validate_frozen_objects(&frozen_objects, &constants)?;
    validate_identity_aliases(&identity_alias_directives, &type_aliases)?;

    return Ok(Program {
        callable_parameters,
        constants,
        data_unions,
        entities,
        enums,
        frozen_objects,
        functions,
        standard_constants,
        statics,
        structs,
        readonly_structs,
        string_unions,
        type_aliases,
    });
}

fn parse_frozen_objects(
    attributes: &[Attribute],
) -> Result<BTreeMap<String, String>, CompileError> {
    let mut directives = BTreeMap::new();
    let mut target_names = HashSet::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("frozen-object") {
            continue;
        }
        let Some(constant) = fields.next() else {
            return Err(compile_error(
                "`flight-compiler: frozen-object` requires a constant name and TypeScript name",
            ));
        };
        let Some(target) = fields.next() else {
            return Err(compile_error(format!(
                "`flight-compiler: frozen-object {constant}` requires a TypeScript name"
            )));
        };
        if fields.next().is_some() {
            return Err(compile_error(format!(
                "`flight-compiler: frozen-object {constant}` accepts exactly one TypeScript name"
            )));
        }
        if syn::parse_str::<syn::Ident>(constant).is_err() || constant.starts_with("r#") {
            return Err(compile_error(format!(
                "`flight-compiler: frozen-object` constant name `{constant}` is not a valid identifier"
            )));
        }
        if syn::parse_str::<syn::Ident>(target).is_err() || target.starts_with("r#") {
            return Err(compile_error(format!(
                "`flight-compiler: frozen-object {constant}` TypeScript name `{target}` is not a valid identifier"
            )));
        }
        if directives.contains_key(constant) {
            return Err(compile_error(format!(
                "duplicate `flight-compiler: frozen-object` directive for constant `{constant}`"
            )));
        }
        if !target_names.insert(target.to_string()) {
            return Err(compile_error(format!(
                "`flight-compiler: frozen-object` TypeScript name `{target}` is assigned more than once"
            )));
        }
        directives.insert(constant.to_string(), target.to_string());
    }
    return Ok(directives);
}

fn is_struct_literal(expression: &syn::Expr) -> bool {
    return match expression {
        syn::Expr::Group(group) => is_struct_literal(&group.expr),
        syn::Expr::Paren(paren) => is_struct_literal(&paren.expr),
        syn::Expr::Struct(_) => true,
        _ => false,
    };
}

// flight-lint: allow(hashmap-iteration) frozen directives are a BTreeMap and constants retain Rust source order in a Vec
fn validate_frozen_objects(
    directives: &BTreeMap<String, String>,
    constants: &[ItemConst],
) -> Result<(), CompileError> {
    for constant_name in directives.keys() {
        let Some(constant) = constants
            .iter()
            .find(|constant| constant.ident == constant_name.as_str())
        else {
            return Err(compile_error(format!(
                "`flight-compiler: frozen-object` constant `{constant_name}` does not exist"
            )));
        };
        if !is_public(&constant.vis) {
            return Err(compile_error(format!(
                "`flight-compiler: frozen-object` constant `{constant_name}` must be public"
            )));
        }
        if !is_struct_literal(&constant.expr) {
            return Err(compile_error(format!(
                "`flight-compiler: frozen-object` constant `{constant_name}` must be initialized with a struct literal"
            )));
        }
    }
    return Ok(());
}

fn parse_data_unions(attributes: &[Attribute]) -> Result<HashSet<String>, CompileError> {
    let mut data_unions = HashSet::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("data-union") {
            continue;
        }
        let names = fields.collect::<Vec<_>>();
        if names.is_empty() {
            return Err(compile_error(
                "`flight-compiler: data-union` requires at least one enum name",
            ));
        }
        for name in names {
            if syn::parse_str::<syn::Ident>(name).is_err() || name.starts_with("r#") {
                return Err(compile_error(format!(
                    "`flight-compiler: data-union` enum name `{name}` is not a valid identifier"
                )));
            }
            if !data_unions.insert(name.to_string()) {
                return Err(compile_error(format!(
                    "duplicate `flight-compiler: data-union` directive for enum `{name}`"
                )));
            }
        }
    }
    return Ok(data_unions);
}

fn parse_identity_aliases(
    attributes: &[Attribute],
) -> Result<BTreeMap<String, String>, CompileError> {
    let mut directives = BTreeMap::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("identity-alias") {
            continue;
        }
        let Some(alias) = fields.next() else {
            return Err(compile_error(
                "`flight-compiler: identity-alias` requires an alias name and reason tag",
            ));
        };
        let Some(tag) = fields.next() else {
            return Err(compile_error(format!(
                "`flight-compiler: identity-alias {alias}` requires a reason tag"
            )));
        };
        if fields.next().is_some() {
            return Err(compile_error(format!(
                "`flight-compiler: identity-alias {alias}` accepts exactly one reason tag"
            )));
        }
        if syn::parse_str::<syn::Ident>(alias).is_err() || alias.starts_with("r#") {
            return Err(compile_error(format!(
                "`flight-compiler: identity-alias` alias name `{alias}` is not a valid identifier"
            )));
        }
        if tag.is_empty()
            || !tag.chars().all(|character| {
                character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
            })
        {
            return Err(compile_error(format!(
                "`flight-compiler: identity-alias {alias}` reason tag `{tag}` must contain only lowercase ASCII letters, digits, or hyphens"
            )));
        }
        if directives
            .insert(alias.to_string(), tag.to_string())
            .is_some()
        {
            return Err(compile_error(format!(
                "duplicate `flight-compiler: identity-alias` directive for alias `{alias}`"
            )));
        }
    }
    return Ok(directives);
}

fn identity_parameter(rust_type: &Type) -> Option<&syn::Ident> {
    return match rust_type {
        Type::Group(group) => identity_parameter(&group.elem),
        Type::Paren(paren) => identity_parameter(&paren.elem),
        Type::Path(path)
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1
                && matches!(path.path.segments[0].arguments, PathArguments::None) =>
        {
            Some(&path.path.segments[0].ident)
        }
        _ => None,
    };
}

fn validate_identity_aliases(
    directives: &BTreeMap<String, String>,
    type_aliases: &[ItemType],
) -> Result<(), CompileError> {
    for alias in directives.keys() {
        let Some(type_alias) = type_aliases
            .iter()
            .find(|type_alias| type_alias.ident == alias.as_str())
        else {
            return Err(compile_error(format!(
                "`flight-compiler: identity-alias` alias `{alias}` does not exist"
            )));
        };
        if !is_public(&type_alias.vis) {
            return Err(compile_error(format!(
                "`flight-compiler: identity-alias` alias `{alias}` must be public"
            )));
        }
        let mut parameters = type_alias.generics.params.iter();
        let Some(syn::GenericParam::Type(parameter)) = parameters.next() else {
            return Err(compile_error(format!(
                "`flight-compiler: identity-alias` alias `{alias}` must declare exactly one type parameter"
            )));
        };
        if parameters.next().is_some() {
            return Err(compile_error(format!(
                "`flight-compiler: identity-alias` alias `{alias}` must declare exactly one type parameter"
            )));
        }
        if identity_parameter(&type_alias.ty) != Some(&parameter.ident) {
            return Err(compile_error(format!(
                "`flight-compiler: identity-alias` alias `{alias}` must resolve directly to its type parameter `{}`",
                parameter.ident
            )));
        }
    }
    return Ok(());
}

pub(crate) fn parse_identity_alias_metadata(
    source: &str,
) -> Result<BTreeMap<String, String>, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    let directives = parse_identity_aliases(&file.attrs)?;
    let type_aliases = file
        .items
        .into_iter()
        .filter_map(|item| match item {
            Item::Type(type_alias) => Some(type_alias),
            _ => None,
        })
        .collect::<Vec<_>>();
    validate_identity_aliases(&directives, &type_aliases)?;
    return Ok(directives);
}

fn callable_arity(rust_type: &Type) -> Option<usize> {
    return match rust_type {
        Type::BareFn(function) => Some(function.inputs.len()),
        Type::Paren(paren) => callable_arity(&paren.elem),
        Type::Path(path) => {
            let segment = path.path.segments.last()?;
            if !matches!(segment.ident.to_string().as_str(), "Arc" | "Ref") {
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
            callable_arity(inner)
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
            Some(arguments.inputs.len())
        }),
        _ => None,
    };
}

fn parse_callable_parameters(
    attributes: &[Attribute],
) -> Result<BTreeMap<String, Vec<String>>, CompileError> {
    let mut directives = BTreeMap::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("callable-parameters") {
            continue;
        }
        let Some(alias) = fields.next() else {
            return Err(compile_error(
                "`flight-compiler: callable-parameters` requires an alias name",
            ));
        };
        if syn::parse_str::<syn::Ident>(alias).is_err() || alias.starts_with("r#") {
            return Err(compile_error(format!(
                "`flight-compiler: callable-parameters` alias name `{alias}` is not a valid identifier"
            )));
        }
        let mut names = Vec::new();
        let mut seen = HashSet::new();
        for name in fields {
            if syn::parse_str::<syn::Ident>(name).is_err() || name.starts_with("r#") {
                return Err(compile_error(format!(
                    "`flight-compiler: callable-parameters {alias}` parameter name `{name}` is not a valid identifier"
                )));
            }
            if !seen.insert(name) {
                return Err(compile_error(format!(
                    "`flight-compiler: callable-parameters {alias}` repeats parameter name `{name}`"
                )));
            }
            names.push(name.to_string());
        }
        if directives.insert(alias.to_string(), names).is_some() {
            return Err(compile_error(format!(
                "duplicate `flight-compiler: callable-parameters` directive for alias `{alias}`"
            )));
        }
    }
    return Ok(directives);
}

fn validate_callable_parameters(
    directives: &BTreeMap<String, Vec<String>>,
    type_aliases: &[ItemType],
) -> Result<(), CompileError> {
    for (alias, names) in directives {
        let Some(type_alias) = type_aliases
            .iter()
            .find(|type_alias| type_alias.ident == alias.as_str())
        else {
            return Err(compile_error(format!(
                "`flight-compiler: callable-parameters` alias `{alias}` does not exist"
            )));
        };
        let Some(arity) = callable_arity(&type_alias.ty) else {
            return Err(compile_error(format!(
                "`flight-compiler: callable-parameters` alias `{alias}` is not callable"
            )));
        };
        if names.len() != arity {
            return Err(compile_error(format!(
                "`flight-compiler: callable-parameters` alias `{alias}` expects {arity} parameter names, got {}",
                names.len()
            )));
        }
    }
    return Ok(());
}

pub(crate) fn directive_names(source: &str, directive: &str) -> HashSet<String> {
    let prefix = format!("//! flight-compiler: {directive} ");
    return source
        .lines()
        .filter_map(|line| line.trim().strip_prefix(&prefix))
        .flat_map(|names| {
            names.split(|character: char| character == ',' || character.is_whitespace())
        })
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect();
}

pub(crate) fn parse_test_program(source: &str) -> Result<TestProgram, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust test source: {error}")))?;
    let mut constants = Vec::new();
    let mut helpers = Vec::new();
    let mut standard_constants = HashSet::new();
    let mut structs = Vec::new();
    let mut suites = Vec::new();
    let mut type_aliases = Vec::new();
    let mut top_level_skipped_tests = Vec::new();
    let mut top_level_tests = Vec::new();

    for item in file.items {
        match item {
            Item::Fn(function)
                if has_attribute(&function.attrs, "test")
                    && has_rust_only_directive(&function.attrs) =>
            {
                top_level_skipped_tests.push(function.sig.ident.to_string());
            }
            Item::Fn(function) if has_attribute(&function.attrs, "test") => {
                let should_panic = has_attribute(&function.attrs, "should_panic");
                top_level_tests.push(TestCase {
                    function,
                    should_panic,
                });
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
            Item::Const(constant) => constants.push(constant),
            Item::Struct(structure) => structs.push(structure),
            Item::Type(type_alias) => type_aliases.push(type_alias),
            Item::Enum(_)
            | Item::ExternCrate(_)
            | Item::ForeignMod(_)
            | Item::Macro(_)
            | Item::Static(_)
            | Item::Trait(_)
            | Item::TraitAlias(_)
            | Item::Union(_)
            | Item::Verbatim(_) => {
                return Err(compile_error(
                    "unsupported top-level item in portable Rust test source",
                ));
            }
            _ => {}
        }
    }

    if !top_level_tests.is_empty() || !top_level_skipped_tests.is_empty() {
        suites.insert(
            0,
            TestSuite {
                helpers: Vec::new(),
                name: "portable_tests".to_string(),
                skipped_tests: top_level_skipped_tests,
                tests: top_level_tests,
            },
        );
    }

    return Ok(TestProgram {
        constants,
        helpers,
        standard_constants,
        structs,
        suites,
        type_aliases,
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
    let mut helpers = Vec::new();
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
            Item::Fn(function) => helpers.push(function),
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
        helpers,
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

fn validate_data_union_directives(
    data_unions: &HashSet<String>,
    enums: &[ItemEnum],
    string_unions: &HashSet<String>,
) -> Result<(), CompileError> {
    let mut names = data_unions.iter().collect::<Vec<_>>();
    names.sort();
    for name in names {
        if string_unions.contains(name) {
            return Err(compile_error(format!(
                "enum `{name}` cannot use both `flight-compiler: data-union` and `flight-compiler: string-union`"
            )));
        }
        if !enums.iter().any(|rust_enum| rust_enum.ident == name) {
            return Err(compile_error(format!(
                "`flight-compiler: data-union` enum `{name}` does not exist"
            )));
        }
    }
    return Ok(());
}

fn validate_enum(rust_enum: &ItemEnum, data_union: bool) -> Result<(), CompileError> {
    if data_union {
        return validate_data_union(rust_enum);
    }
    for variant in &rust_enum.variants {
        if !matches!(variant.fields, Fields::Unit) {
            return Err(compile_error(format!(
                "unsupported enum variant `{}::{}`; only unit variants are portable",
                rust_enum.ident, variant.ident
            )));
        }
        if let Some((_, discriminant)) = &variant.discriminant
            && !is_integer_discriminant(discriminant)
        {
            return Err(compile_error(format!(
                "unsupported enum discriminant `{}::{}`; explicit discriminants must be integer literals",
                rust_enum.ident, variant.ident
            )));
        }
    }
    return Ok(());
}

fn validate_data_union(rust_enum: &ItemEnum) -> Result<(), CompileError> {
    let has_named = rust_enum
        .variants
        .iter()
        .any(|variant| matches!(variant.fields, Fields::Named(_)));
    let mut has_unnamed = false;
    let mut tags = HashSet::new();
    let mut unit_count = 0;
    for variant in &rust_enum.variants {
        if variant.discriminant.is_some() {
            return Err(compile_error(format!(
                "data union `{}::{}` cannot declare an explicit discriminant",
                rust_enum.ident, variant.ident
            )));
        }
        if has_named {
            let name = variant.ident.to_string();
            let tag = name
                .chars()
                .next()
                .into_iter()
                .flat_map(char::to_lowercase)
                .chain(name.chars().skip(1))
                .collect::<String>();
            if !tags.insert(tag.clone()) {
                return Err(compile_error(format!(
                    "data union `{}` has more than one variant with discriminator `{tag}`",
                    rust_enum.ident
                )));
            }
        }
        match &variant.fields {
            Fields::Named(fields) => {
                if fields
                    .named
                    .iter()
                    .any(|field| field.ident.as_ref().is_some_and(|ident| ident == "kind"))
                {
                    return Err(compile_error(format!(
                        "data union variant `{}::{}` cannot declare the reserved discriminator field `kind`",
                        rust_enum.ident, variant.ident
                    )));
                }
            }
            Fields::Unnamed(fields) => {
                has_unnamed = true;
                if fields.unnamed.len() != 1 {
                    return Err(compile_error(format!(
                        "untagged data union variant `{}::{}` must contain exactly one field",
                        rust_enum.ident, variant.ident
                    )));
                }
            }
            Fields::Unit => unit_count += 1,
        }
    }
    if has_named && has_unnamed {
        return Err(compile_error(format!(
            "data union `{}` cannot mix named and unnamed variant fields",
            rust_enum.ident
        )));
    }
    if !has_named && unit_count > 1 {
        return Err(compile_error(format!(
            "untagged data union `{}` can contain at most one unit variant because every unit variant lowers to `null`",
            rust_enum.ident
        )));
    }
    if !has_named && !has_unnamed {
        return Err(compile_error(format!(
            "data union `{}` has no payload variants; use `flight-compiler: string-union` instead",
            rust_enum.ident
        )));
    }
    return Ok(());
}

fn is_integer_discriminant(expression: &syn::Expr) -> bool {
    return match expression {
        syn::Expr::Group(group) => is_integer_discriminant(&group.expr),
        syn::Expr::Lit(literal) => matches!(literal.lit, syn::Lit::Int(_)),
        syn::Expr::Paren(paren) => is_integer_discriminant(&paren.expr),
        syn::Expr::Unary(unary) if matches!(unary.op, syn::UnOp::Neg(_)) => {
            matches!(unary.expr.as_ref(), syn::Expr::Lit(literal) if matches!(literal.lit, syn::Lit::Int(_)))
        }
        _ => false,
    };
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
