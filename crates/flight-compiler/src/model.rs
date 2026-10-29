use std::collections::{BTreeMap, BTreeSet, HashSet};

use syn::ext::IdentExt;
use syn::parse::Parser;
use syn::{
    Attribute, Fields, GenericArgument, Item, ItemConst, ItemEnum, ItemFn, ItemStatic, ItemStruct,
    ItemType, ItemUse, PathArguments, Type, UseTree, Visibility,
};

use crate::{CompileError, SourceMode, compile_error};

pub(crate) struct Program {
    pub(crate) callable_field_parameters: BTreeMap<(String, String), Vec<String>>,
    pub(crate) callable_parameters: BTreeMap<String, Vec<String>>,
    pub(crate) constants: Vec<ItemConst>,
    // `const-group` directives: TypeScript const-object name to the Rust constant-name prefix whose
    // public constants become its members, in source order (`KEY_CODE_A` -> `KeyCode.A`).
    pub(crate) const_groups: BTreeMap<String, String>,
    pub(crate) data_unions: HashSet<String>,
    pub(crate) entities: HashSet<String>,
    // Entity struct name to its one designated crate-private state field, which TypeScript stores in
    // the entity's runtime slot instead of the public record.
    pub(crate) entity_runtime_states: BTreeMap<String, String>,
    pub(crate) enums: Vec<ItemEnum>,
    // `export-name` directives: Rust item name to its explicit TypeScript name.
    pub(crate) export_names: BTreeMap<String, String>,
    // `extern crate` items, whose (renamed) bindings can stand in for the `std` / `core` / `alloc` roots.
    pub(crate) extern_crates: Vec<syn::ItemExternCrate>,
    pub(crate) frozen_objects: BTreeMap<String, String>,
    pub(crate) functions: Vec<ItemFn>,
    // `#![no_std]`: the `std` root and the `std` prelude's `Box` are absent unless bound explicitly.
    pub(crate) no_std: bool,
    // `function.parameter` slice parameters TypeScript types as `ArrayLike<T>`, so typed arrays are
    // accepted; the function body may only read their length and elements or pass them on.
    pub(crate) array_like_parameters: BTreeSet<String>,
    pub(crate) nullable_options: bool,
    // Unit enums lowered to a type-only TS union of their declared integer discriminants, in
    // declaration order (`numeric-union`).
    pub(crate) numeric_unions: BTreeMap<String, Vec<(String, i64)>>,
    pub(crate) standard_constants: HashSet<String>,
    pub(crate) statics: Vec<ItemStatic>,
    pub(crate) structs: Vec<ItemStruct>,
    pub(crate) readonly_structs: HashSet<String>,
    pub(crate) string_unions: BTreeMap<String, StringUnionStyle>,
    pub(crate) string_union_values: BTreeMap<String, BTreeMap<String, String>>,
    pub(crate) type_aliases: Vec<ItemType>,
    // Every item the source declares in the type namespace (structs, enums, unions, traits, aliases,
    // modules), so `use`-path resolution can see local shadows of standard names.
    pub(crate) type_names: BTreeSet<String>,
    pub(crate) uses: Vec<ItemUse>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum StringUnionStyle {
    Exact,
    KebabCase,
    LowerCamel,
}

pub(crate) struct StringUnionMetadata {
    pub(crate) styles: BTreeMap<String, StringUnionStyle>,
    pub(crate) values: BTreeMap<String, BTreeMap<String, String>>,
}

pub(crate) struct TestProgram {
    pub(crate) constants: Vec<ItemConst>,
    pub(crate) helpers: Vec<ItemFn>,
    pub(crate) nullable_options: bool,
    pub(crate) standard_constants: HashSet<String>,
    pub(crate) structs: Vec<ItemStruct>,
    pub(crate) suites: Vec<TestSuite>,
    pub(crate) type_aliases: Vec<ItemType>,
    pub(crate) uses: Vec<ItemUse>,
}

pub(crate) struct TestSuite {
    pub(crate) helpers: Vec<ItemFn>,
    pub(crate) name: String,
    pub(crate) skipped_tests: Vec<String>,
    pub(crate) tests: Vec<TestCase>,
    pub(crate) uses: Vec<ItemUse>,
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

// The members of each `const-group`, in source order: every constant whose name starts with the
// group's prefix, as `(rust_name, owner, member)`. A group must match at least one constant, every
// member must be public, share one type, leave a TypeScript identifier after the prefix, and be
// initialized with an independent literal (a member computed from another would read the object it
// is initializing), and no constant may belong to two groups.
// flight-lint: allow(hashmap-iteration) constants are a Vec slice in Rust source order
pub(crate) fn const_group_members(
    groups: &BTreeMap<String, String>,
    constants: &[ItemConst],
) -> Result<Vec<(String, String, String)>, CompileError> {
    let mut members = Vec::new();
    for constant in constants {
        let rust_name = constant.ident.to_string();
        let owners = groups
            .iter()
            .filter(|(_, prefix)| rust_name.starts_with(prefix.as_str()))
            .collect::<Vec<_>>();
        let [(owner, prefix)] = owners.as_slice() else {
            if owners.len() > 1 {
                return Err(compile_error(format!(
                    "constant `{rust_name}` matches more than one `const-group` prefix"
                )));
            }
            continue;
        };
        let member = rust_name[prefix.len()..].to_string();
        if !is_typescript_identifier(&member) {
            return Err(compile_error(format!(
                "`const-group {owner}` member `{rust_name}` leaves `{member}`, which is not a TypeScript identifier"
            )));
        }
        if !is_public(&constant.vis) {
            return Err(compile_error(format!(
                "`const-group {owner}` member `{rust_name}` must be public"
            )));
        }
        if !is_independent_literal(&constant.expr) {
            return Err(compile_error(format!(
                "`const-group {owner}` member `{rust_name}` must be initialized with an independent literal"
            )));
        }
        members.push((rust_name, (*owner).clone(), member, constant));
    }
    for (owner, prefix) in groups {
        let typed = members
            .iter()
            .filter(|(_, member_owner, _, _)| member_owner == owner)
            .map(|(_, _, _, constant)| {
                quote::ToTokens::to_token_stream(constant.ty.as_ref()).to_string()
            })
            .collect::<BTreeSet<_>>();
        if typed.is_empty() {
            return Err(compile_error(format!(
                "`const-group {owner}` prefix `{prefix}` matches no constant"
            )));
        }
        if typed.len() > 1 {
            return Err(compile_error(format!(
                "`const-group {owner}` members must share one type"
            )));
        }
    }
    return Ok(members
        .into_iter()
        .map(|(rust_name, owner, member, _)| (rust_name, owner, member))
        .collect());
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

// A literal, optionally negated or parenthesized: a value that reads no other item.
fn is_independent_literal(expression: &syn::Expr) -> bool {
    return match expression {
        syn::Expr::Group(group) => is_independent_literal(&group.expr),
        syn::Expr::Lit(_) => true,
        syn::Expr::Paren(paren) => is_independent_literal(&paren.expr),
        syn::Expr::Unary(unary) if matches!(unary.op, syn::UnOp::Neg(_)) => {
            matches!(unary.expr.as_ref(), syn::Expr::Lit(_))
        }
        _ => false,
    };
}

fn is_typescript_identifier(name: &str) -> bool {
    let mut characters = name.chars();
    return characters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_' || first == '$')
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '$'
        });
}

fn parse_const_groups(attributes: &[Attribute]) -> Result<BTreeMap<String, String>, CompileError> {
    let mut groups = BTreeMap::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("const-group") {
            continue;
        }
        let (Some(owner), Some(prefix), None) = (fields.next(), fields.next(), fields.next())
        else {
            return Err(compile_error(
                "`flight-compiler: const-group` requires exactly a TypeScript name and a constant prefix",
            ));
        };
        if !is_typescript_identifier(owner) {
            return Err(compile_error(format!(
                "`flight-compiler: const-group` name `{owner}` is not a TypeScript identifier"
            )));
        }
        if prefix.is_empty()
            || !prefix
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
        {
            return Err(compile_error(format!(
                "`flight-compiler: const-group {owner}` prefix `{prefix}` is not a constant-name prefix"
            )));
        }
        if groups
            .insert(owner.to_string(), prefix.to_string())
            .is_some()
        {
            return Err(compile_error(format!(
                "`flight-compiler: const-group {owner}` is declared more than once"
            )));
        }
    }
    return Ok(groups);
}

// The validated `export-name` directives of a dependency source, which a consuming package needs to
// import and reference the source's mapped public items by their TypeScript names. Each `const-group`
// member maps to its `Owner.Member` reference.
pub(crate) fn parse_export_name_metadata(
    source: &str,
) -> Result<BTreeMap<String, String>, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    let directives = parse_export_names(&file.attrs)?;
    let const_groups = parse_const_groups(&file.attrs)?;
    if directives.is_empty() && const_groups.is_empty() {
        return Ok(directives);
    }
    let frozen_objects = parse_frozen_objects(&file.attrs)?;
    let mut constants = Vec::new();
    let mut functions = Vec::new();
    let mut statics = Vec::new();
    for item in file.items {
        match item {
            Item::Const(item) => constants.push(item),
            Item::Fn(function) => functions.push(function),
            Item::Static(item) => statics.push(item),
            _ => {}
        }
    }
    validate_export_names(
        &directives,
        &frozen_objects,
        &functions,
        &constants,
        &statics,
    )?;
    let mut metadata = directives;
    for (rust_name, owner, member) in const_group_members(&const_groups, &constants)? {
        if metadata.contains_key(&rust_name) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{rust_name}` is already named by `const-group {owner}`"
            )));
        }
        metadata.insert(rust_name, format!("{owner}.{member}"));
    }
    return Ok(metadata);
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
            "callable-field-parameters"
            | "callable-parameters"
            | "companion"
            | "const-group"
            | "contract"
            | "data-union"
            | "entity-runtime-state"
            | "export-name"
            | "frozen-object"
            | "identity-alias"
            | "array-like"
            | "nullable-options"
            | "numeric-union"
            | "readonly-fields"
            | "root"
            | "string-union"
            | "string-union-value" => {}
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

fn integer_discriminant_value(expression: &syn::Expr) -> Option<i64> {
    return match expression {
        syn::Expr::Lit(literal) => match &literal.lit {
            syn::Lit::Int(integer) => integer.base10_parse::<i64>().ok(),
            _ => None,
        },
        syn::Expr::Unary(unary) if matches!(unary.op, syn::UnOp::Neg(_)) => {
            integer_discriminant_value(&unary.expr).and_then(i64::checked_neg)
        }
        syn::Expr::Group(group) => integer_discriminant_value(&group.expr),
        syn::Expr::Paren(paren) => integer_discriminant_value(&paren.expr),
        _ => None,
    };
}

// The `T` and initializer of a `static NAME: LazyLock<T> = LazyLock::new(init)`, or `None` for an
// ordinary static. TypeScript evaluates `init` once, eagerly, when the declaring module loads.
pub(crate) fn lazy_lock_static(rust_static: &ItemStatic) -> Option<(&Type, &syn::Expr)> {
    let Type::Path(path) = rust_static.ty.as_ref() else {
        return None;
    };
    let segment = path.path.segments.last()?;
    if segment.ident != "LazyLock" {
        return None;
    }
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return None;
    };
    let [GenericArgument::Type(inner)] = arguments.args.iter().collect::<Vec<_>>().as_slice()
    else {
        return None;
    };
    let syn::Expr::Call(call) = rust_static.expr.as_ref() else {
        return None;
    };
    let syn::Expr::Path(function) = call.func.as_ref() else {
        return None;
    };
    let mut segments = function.path.segments.iter().rev();
    if !(segments
        .next()
        .is_some_and(|segment| segment.ident == "new")
        && segments
            .next()
            .is_some_and(|segment| segment.ident == "LazyLock")
        && call.args.len() == 1)
    {
        return None;
    }
    return Some((inner, &call.args[0]));
}

fn next_directive_field(value: &str) -> Option<(&str, &str)> {
    let value = value.trim_start();
    if value.is_empty() {
        return None;
    }
    let end = value.find(char::is_whitespace).unwrap_or(value.len());
    return Some((&value[..end], &value[end..]));
}

fn is_public(visibility: &Visibility) -> bool {
    return matches!(visibility, Visibility::Public(_));
}

pub(crate) fn parse_program(source: &str) -> Result<Program, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    let callable_field_parameters = parse_callable_field_parameters(&file.attrs)?;
    let callable_parameters = parse_callable_parameters(&file.attrs)?;
    let data_unions = parse_data_unions(&file.attrs)?;
    let entity_runtime_states = parse_entity_runtime_states(&file.attrs)?;
    let export_names = parse_export_names(&file.attrs)?;
    let frozen_objects = parse_frozen_objects(&file.attrs)?;
    let const_groups = parse_const_groups(&file.attrs)?;
    let identity_alias_directives = parse_identity_aliases(&file.attrs)?;
    let nullable_options = parse_flag_directive(&file.attrs, "nullable-options")?;
    let array_like_parameters = parse_array_like_parameters(&file.attrs)?;
    let numeric_union_names = parse_numeric_unions(&file.attrs)?;
    let mut constants = Vec::new();
    let mut entities = HashSet::new();
    let mut enums = Vec::new();
    let mut functions = Vec::new();
    let mut standard_constants = HashSet::new();
    let mut statics = Vec::new();
    let mut structs = Vec::new();
    let mut type_aliases = Vec::new();
    let mut uses = Vec::new();
    let readonly_structs = directive_names(source, "readonly-fields");
    let string_union_metadata = parse_string_union_metadata_from_attributes(&file.attrs)?;
    let string_unions = string_union_metadata.styles;
    let string_union_values = string_union_metadata.values;

    let no_std = file
        .attrs
        .iter()
        .any(|attribute| attribute.path().is_ident("no_std"));
    let mut extern_crates = Vec::new();
    let type_names = file
        .items
        .iter()
        .filter_map(|item| match item {
            Item::Enum(item) => Some(item.ident.to_string()),
            Item::Mod(item) => Some(item.ident.to_string()),
            Item::Struct(item) => Some(item.ident.to_string()),
            Item::Trait(item) => Some(item.ident.to_string()),
            Item::TraitAlias(item) => Some(item.ident.to_string()),
            Item::Type(item) => Some(item.ident.to_string()),
            Item::Union(item) => Some(item.ident.to_string()),
            _ => None,
        })
        .collect::<BTreeSet<_>>();
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
                validate_fields(
                    &structure,
                    entity_runtime_states
                        .get(&structure.ident.to_string())
                        .map(String::as_str),
                )?;
                structs.push(structure);
            }
            Item::Type(item) => type_aliases.push(item),
            Item::Use(item) => uses.push(item),
            Item::Trait(item) if is_public(&item.vis) => {
                return Err(unsupported_public("trait", &item.ident.to_string()));
            }
            Item::Union(item) if is_public(&item.vis) => {
                return Err(unsupported_public("union", &item.ident.to_string()));
            }
            Item::ExternCrate(item) => extern_crates.push(item),
            Item::ForeignMod(_) | Item::Impl(_) | Item::Macro(_) | Item::Mod(_) => {}
            _ => {}
        }
    }

    validate_callable_parameters(&callable_parameters, &type_aliases)?;
    validate_callable_field_parameters(&callable_field_parameters, &structs)?;
    validate_data_union_directives(&data_unions, &enums, &string_unions)?;
    validate_entity_runtime_states(&entity_runtime_states, &structs)?;
    validate_array_like_parameters(&array_like_parameters, &functions)?;
    validate_string_union_directives(&string_unions, &string_union_values, &enums)?;
    let numeric_unions = validate_numeric_union_directives(
        &numeric_union_names,
        &enums,
        &data_unions,
        &string_unions,
    )?;
    validate_frozen_objects(&frozen_objects, &constants)?;
    let group_members = const_group_members(&const_groups, &constants)?;
    for (rust_name, owner, _) in &group_members {
        if frozen_objects.contains_key(rust_name) || export_names.contains_key(rust_name) {
            return Err(compile_error(format!(
                "`const-group {owner}` member `{rust_name}` is also named by another directive"
            )));
        }
    }
    validate_const_group_owners(
        &const_groups,
        &group_members,
        &enums,
        &functions,
        &constants,
        &statics,
        &export_names,
        &frozen_objects,
    )?;
    validate_export_names(
        &export_names,
        &frozen_objects,
        &functions,
        &constants,
        &statics,
    )?;
    validate_lazy_lock_statics(&statics, &functions, &constants, &structs, &type_aliases)?;
    validate_identity_aliases(&identity_alias_directives, &type_aliases)?;

    return Ok(Program {
        callable_field_parameters,
        callable_parameters,
        constants,
        const_groups,
        data_unions,
        entities,
        entity_runtime_states,
        enums,
        export_names,
        extern_crates,
        frozen_objects,
        functions,
        no_std,
        nullable_options,
        array_like_parameters,
        numeric_unions,
        standard_constants,
        statics,
        structs,
        readonly_structs,
        string_unions,
        string_union_values,
        type_aliases,
        type_names,
        uses,
    });
}

fn parse_flag_directive(attributes: &[Attribute], expected: &str) -> Result<bool, CompileError> {
    let mut found = false;
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some(expected) {
            continue;
        }
        if fields.next().is_some() {
            return Err(compile_error(format!(
                "`flight-compiler: {expected}` does not accept arguments"
            )));
        }
        if found {
            return Err(compile_error(format!(
                "duplicate `flight-compiler: {expected}` directive"
            )));
        }
        found = true;
    }
    return Ok(found);
}

fn parse_numeric_unions(attributes: &[Attribute]) -> Result<BTreeSet<String>, CompileError> {
    let mut names = BTreeSet::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("numeric-union") {
            continue;
        }
        let enum_names = fields.collect::<Vec<_>>();
        if enum_names.is_empty() {
            return Err(compile_error(
                "`flight-compiler: numeric-union` requires at least one enum name",
            ));
        }
        for name in enum_names {
            if syn::parse_str::<syn::Ident>(name).is_err() || name.starts_with("r#") {
                return Err(compile_error(format!(
                    "`flight-compiler: numeric-union` enum name `{name}` is not a valid identifier"
                )));
            }
            if !names.insert(name.to_string()) {
                return Err(compile_error(format!(
                    "duplicate `flight-compiler: numeric-union` directive for enum `{name}`"
                )));
            }
        }
    }
    return Ok(names);
}

fn parse_string_union_metadata_from_attributes(
    attributes: &[Attribute],
) -> Result<StringUnionMetadata, CompileError> {
    let mut directives = BTreeMap::new();
    let mut values = BTreeMap::<String, BTreeMap<String, String>>::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let Some(specifications) = directive.strip_prefix("string-union") else {
            continue;
        };
        if !specifications.is_empty()
            && !specifications.starts_with(|character: char| character.is_whitespace())
        {
            continue;
        }
        let specifications = specifications
            .split(|character: char| character == ',' || character.is_whitespace())
            .filter(|specification| !specification.is_empty())
            .collect::<Vec<_>>();
        if specifications.is_empty() {
            return Err(compile_error(
                "`flight-compiler: string-union` requires at least one enum name",
            ));
        }
        for specification in specifications {
            let (name, style) = if let Some((name, style)) = specification.split_once('=') {
                let style = match style {
                    "exact" => StringUnionStyle::Exact,
                    "kebab-case" => StringUnionStyle::KebabCase,
                    "lower-camel" => StringUnionStyle::LowerCamel,
                    _ => {
                        return Err(compile_error(format!(
                            "`flight-compiler: string-union` enum `{name}` has unknown style `{style}`"
                        )));
                    }
                };
                (name, style)
            } else {
                (specification, StringUnionStyle::LowerCamel)
            };
            if syn::parse_str::<syn::Ident>(name).is_err() || name.starts_with("r#") {
                return Err(compile_error(format!(
                    "`flight-compiler: string-union` enum name `{name}` is not a valid identifier"
                )));
            }
            if directives.insert(name.to_string(), style).is_some() {
                return Err(compile_error(format!(
                    "duplicate `flight-compiler: string-union` directive for enum `{name}`"
                )));
            }
        }
    }
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let Some(specification) = directive.strip_prefix("string-union-value") else {
            continue;
        };
        if !specification.is_empty()
            && !specification.starts_with(|character: char| character.is_whitespace())
        {
            continue;
        }
        let Some((owner, remaining)) = next_directive_field(specification) else {
            return Err(compile_error(
                "`flight-compiler: string-union-value` requires an enum name, variant name, and Rust string literal",
            ));
        };
        let Some((variant, literal)) = next_directive_field(remaining) else {
            return Err(compile_error(format!(
                "`flight-compiler: string-union-value {owner}` requires a variant name and Rust string literal"
            )));
        };
        let literal = literal.trim_start();
        if literal.is_empty() {
            return Err(compile_error(format!(
                "`flight-compiler: string-union-value {owner} {variant}` requires a Rust string literal"
            )));
        }
        for (role, name) in [("enum", owner), ("variant", variant)] {
            if syn::parse_str::<syn::Ident>(name).is_err() || name.starts_with("r#") {
                return Err(compile_error(format!(
                    "`flight-compiler: string-union-value` {role} name `{name}` is not a valid identifier"
                )));
            }
        }
        let value = syn::parse_str::<syn::LitStr>(literal).map_err(|_| {
            compile_error(format!(
                "`flight-compiler: string-union-value {owner} {variant}` value must be one Rust string literal"
            ))
        })?;
        if values
            .entry(owner.to_string())
            .or_default()
            .insert(variant.to_string(), value.value())
            .is_some()
        {
            return Err(compile_error(format!(
                "duplicate `flight-compiler: string-union-value` directive for `{owner}::{variant}`"
            )));
        }
    }
    return Ok(StringUnionMetadata {
        styles: directives,
        values,
    });
}

pub(crate) fn parse_string_union_metadata(
    source: &str,
) -> Result<StringUnionMetadata, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    return parse_string_union_metadata_from_attributes(&file.attrs);
}

// `//! flight-compiler: export-name <rust_item> <TypeScriptName>` names one public function or constant
// explicitly in TypeScript, for acronyms that lower-camel conversion cannot spell (`decode_utf8` ->
// `decodeUTF8`). Cross-module uniqueness and shadowing are validated when sources are combined.
fn parse_entity_runtime_states(
    attributes: &[Attribute],
) -> Result<BTreeMap<String, String>, CompileError> {
    let mut states = BTreeMap::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("entity-runtime-state") {
            continue;
        }
        let designations = fields.collect::<Vec<_>>();
        if designations.is_empty() {
            return Err(compile_error(
                "`flight-compiler: entity-runtime-state` requires at least one `Owner.field` designation",
            ));
        }
        for designation in designations {
            let Some((owner, field)) = designation.split_once('.').filter(|(owner, field)| {
                [owner, field].iter().all(|name| {
                    syn::parse_str::<syn::Ident>(name).is_ok() && !name.starts_with("r#")
                })
            }) else {
                return Err(compile_error(format!(
                    "`flight-compiler: entity-runtime-state` designation `{designation}` is not `Owner.field`"
                )));
            };
            if let Some(existing) = states.insert(owner.to_string(), field.to_string()) {
                return Err(compile_error(format!(
                    "ambiguous `flight-compiler: entity-runtime-state` for `{owner}`: `{existing}` and `{field}` are both designated; an entity has one runtime state field"
                )));
            }
        }
    }
    return Ok(states);
}

fn parse_export_names(attributes: &[Attribute]) -> Result<BTreeMap<String, String>, CompileError> {
    let mut directives = BTreeMap::new();
    let mut target_names = HashSet::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("export-name") {
            continue;
        }
        let Some(item) = fields.next() else {
            return Err(compile_error(
                "`flight-compiler: export-name` requires a Rust item name and TypeScript name",
            ));
        };
        let Some(target) = fields.next() else {
            return Err(compile_error(format!(
                "`flight-compiler: export-name {item}` requires a TypeScript name"
            )));
        };
        if fields.next().is_some() {
            return Err(compile_error(format!(
                "`flight-compiler: export-name {item}` accepts exactly one TypeScript name"
            )));
        }
        if syn::parse_str::<syn::Ident>(item).is_err() || item.starts_with("r#") {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` Rust item name `{item}` is not a valid identifier"
            )));
        }
        if !is_typescript_identifier(target) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name {item}` TypeScript name `{target}` is not a valid identifier"
            )));
        }
        if is_javascript_binding_reserved(target)
            || matches!(target, "Infinity" | "NaN" | "undefined")
        {
            return Err(compile_error(format!(
                "`flight-compiler: export-name {item}` TypeScript name `{target}` is reserved"
            )));
        }
        if directives.contains_key(item) {
            return Err(compile_error(format!(
                "duplicate `flight-compiler: export-name` directive for `{item}`"
            )));
        }
        if !target_names.insert(target.to_string()) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` TypeScript name `{target}` is assigned more than once"
            )));
        }
        directives.insert(item.to_string(), target.to_string());
    }
    return Ok(directives);
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

// `//! flight-compiler: const-group <TypeScriptName> <PREFIX>`: the public constants named `<PREFIX>*`
// become one exported TypeScript const object.
// A `const-group` owner becomes an exported TypeScript value, so it may share its name only with a
// type (an alias or interface), never with another emitted value: an enum, a function, a constant, a
// static, or an `export-name` / `frozen-object` target.
// flight-lint: allow(hashmap-iteration) items are Vecs in Rust source order and directives are BTreeMaps
fn validate_const_group_owners(
    groups: &BTreeMap<String, String>,
    members: &[(String, String, String)],
    enums: &[ItemEnum],
    functions: &[ItemFn],
    constants: &[ItemConst],
    statics: &[ItemStatic],
    export_names: &BTreeMap<String, String>,
    frozen_objects: &BTreeMap<String, String>,
) -> Result<(), CompileError> {
    let named = |rust_name: String, default: String| {
        return export_names
            .get(&rust_name)
            .or_else(|| frozen_objects.get(&rust_name))
            .cloned()
            .unwrap_or(default);
    };
    let mut values = enums
        .iter()
        .map(|item| (item.ident.to_string(), "enum"))
        .collect::<Vec<_>>();
    values.extend(functions.iter().map(|function| {
        let rust_name = function.sig.ident.to_string();
        let default = crate::typescript::snake_to_lower_camel(&rust_name);
        return (named(rust_name, default), "function");
    }));
    values.extend(
        constants
            .iter()
            .filter(|constant| {
                !members
                    .iter()
                    .any(|(rust_name, _, _)| constant.ident == rust_name.as_str())
            })
            .map(|constant| {
                let rust_name = constant.ident.to_string();
                return (named(rust_name.clone(), rust_name), "constant");
            }),
    );
    values.extend(statics.iter().map(|rust_static| {
        let rust_name = rust_static.ident.to_string();
        return (named(rust_name.clone(), rust_name), "static");
    }));
    for owner in groups.keys() {
        if let Some((_, kind)) = values.iter().find(|(name, _)| name == owner) {
            return Err(compile_error(format!(
                "`const-group {owner}` collides with an emitted {kind} named `{owner}`"
            )));
        }
    }
    return Ok(());
}

// flight-lint: allow(hashmap-iteration) directives are BTreeMaps and items retain Rust source order in Vecs
fn validate_export_names(
    directives: &BTreeMap<String, String>,
    frozen_objects: &BTreeMap<String, String>,
    functions: &[ItemFn],
    constants: &[ItemConst],
    statics: &[ItemStatic],
) -> Result<(), CompileError> {
    for (item, target) in directives {
        let visibility = functions
            .iter()
            .find(|function| function.sig.ident == item.as_str())
            .map(|function| &function.vis)
            .or_else(|| {
                constants
                    .iter()
                    .find(|constant| constant.ident == item.as_str())
                    .map(|constant| &constant.vis)
            })
            .or_else(|| {
                statics
                    .iter()
                    .find(|rust_static| rust_static.ident == item.as_str())
                    .map(|rust_static| &rust_static.vis)
            });
        let Some(visibility) = visibility else {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{item}` is not a function, constant or static of this source"
            )));
        };
        if !is_public(visibility) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{item}` must be public"
            )));
        }
        if frozen_objects.contains_key(item) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{item}` is already named by `frozen-object`"
            )));
        }
        if *target == crate::typescript::snake_to_lower_camel(item) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name {item}` repeats the default TypeScript name `{target}`"
            )));
        }
        let collides = functions
            .iter()
            .map(|function| function.sig.ident.to_string())
            .chain(constants.iter().map(|constant| constant.ident.to_string()))
            .chain(statics.iter().map(|item| item.ident.to_string()))
            .filter(|other| other != item)
            .any(|other| {
                directives.get(&other).map_or_else(
                    || crate::typescript::default_item_name(&other) == *target,
                    |other_target| other_target == target,
                )
            });
        if collides {
            return Err(compile_error(format!(
                "`flight-compiler: export-name {item}` TypeScript name `{target}` collides with another item"
            )));
        }
    }
    return Ok(());
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

// flight-lint: allow(hashmap-iteration) directive designations are a Vec in source order
fn parse_array_like_parameters(attributes: &[Attribute]) -> Result<BTreeSet<String>, CompileError> {
    let mut parameters = BTreeSet::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("array-like") {
            continue;
        }
        let designations = fields.collect::<Vec<_>>();
        if designations.is_empty() {
            return Err(compile_error(
                "`flight-compiler: array-like` requires at least one `function.parameter`",
            ));
        }
        for designation in designations {
            let valid = designation
                .split_once('.')
                .is_some_and(|(function, parameter)| {
                    [function, parameter].iter().all(|name| {
                        syn::parse_str::<syn::Ident>(name).is_ok() && !name.starts_with("r#")
                    })
                });
            if !valid {
                return Err(compile_error(format!(
                    "`flight-compiler: array-like` designation `{designation}` is not `function.parameter`"
                )));
            }
            if !parameters.insert(designation.to_string()) {
                return Err(compile_error(format!(
                    "duplicate `flight-compiler: array-like` designation `{designation}`"
                )));
            }
        }
    }
    return Ok(parameters);
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

fn is_valid_callable_parameter_name(name: &str) -> bool {
    return is_valid_callable_parameter_identifier(name) && !is_javascript_binding_reserved(name);
}

fn is_valid_callable_field_parameter_name(name: &str) -> bool {
    return is_valid_callable_parameter_identifier(name)
        && (name == "await" || !is_javascript_binding_reserved(name));
}

fn is_valid_callable_parameter_identifier(name: &str) -> bool {
    return !name.starts_with("r#") && syn::Ident::parse_any.parse_str(name).is_ok();
}

fn is_javascript_binding_reserved(name: &str) -> bool {
    return matches!(
        name,
        "arguments"
            | "await"
            | "break"
            | "case"
            | "catch"
            | "class"
            | "const"
            | "continue"
            | "debugger"
            | "default"
            | "delete"
            | "do"
            | "else"
            | "enum"
            | "eval"
            | "export"
            | "extends"
            | "false"
            | "finally"
            | "for"
            | "function"
            | "if"
            | "implements"
            | "import"
            | "in"
            | "instanceof"
            | "interface"
            | "let"
            | "new"
            | "null"
            | "package"
            | "private"
            | "protected"
            | "public"
            | "return"
            | "static"
            | "super"
            | "switch"
            | "this"
            | "throw"
            | "true"
            | "try"
            | "typeof"
            | "var"
            | "void"
            | "while"
            | "with"
            | "yield"
    );
}

fn parse_callable_field_parameters(
    attributes: &[Attribute],
) -> Result<BTreeMap<(String, String), Vec<String>>, CompileError> {
    let mut directives = BTreeMap::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("callable-field-parameters") {
            continue;
        }
        let Some(owner) = fields.next() else {
            return Err(compile_error(
                "`flight-compiler: callable-field-parameters` requires an owner struct name",
            ));
        };
        if syn::parse_str::<syn::Ident>(owner).is_err() || owner.starts_with("r#") {
            return Err(compile_error(format!(
                "`flight-compiler: callable-field-parameters` owner name `{owner}` is not a valid identifier"
            )));
        }
        let Some(field) = fields.next() else {
            return Err(compile_error(format!(
                "`flight-compiler: callable-field-parameters {owner}` requires a field name"
            )));
        };
        if syn::parse_str::<syn::Ident>(field).is_err() || field.starts_with("r#") {
            return Err(compile_error(format!(
                "`flight-compiler: callable-field-parameters {owner}` field name `{field}` is not a valid identifier"
            )));
        }
        let mut names = Vec::new();
        let mut seen = HashSet::new();
        for name in fields {
            if !is_valid_callable_field_parameter_name(name) {
                return Err(compile_error(format!(
                    "`flight-compiler: callable-field-parameters {owner} {field}` parameter name `{name}` is not a valid identifier"
                )));
            }
            if !seen.insert(name) {
                return Err(compile_error(format!(
                    "`flight-compiler: callable-field-parameters {owner} {field}` repeats parameter name `{name}`"
                )));
            }
            names.push(name.to_string());
        }
        if directives
            .insert((owner.to_string(), field.to_string()), names)
            .is_some()
        {
            return Err(compile_error(format!(
                "duplicate `flight-compiler: callable-field-parameters` directive for field `{owner}.{field}`"
            )));
        }
    }
    return Ok(directives);
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
            if !is_valid_callable_parameter_name(name) {
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

fn validate_callable_field_parameters(
    directives: &BTreeMap<(String, String), Vec<String>>,
    structs: &[ItemStruct],
) -> Result<(), CompileError> {
    for ((owner, field), names) in directives {
        let Some(structure) = structs
            .iter()
            .find(|structure| structure.ident == owner.as_str())
        else {
            return Err(compile_error(format!(
                "`flight-compiler: callable-field-parameters` owner `{owner}` does not exist"
            )));
        };
        let Some(rust_field) = structure.fields.iter().find(|rust_field| {
            rust_field
                .ident
                .as_ref()
                .is_some_and(|ident| ident == field)
        }) else {
            return Err(compile_error(format!(
                "`flight-compiler: callable-field-parameters` field `{owner}.{field}` does not exist"
            )));
        };
        let Some(arity) = callable_arity(&rust_field.ty) else {
            return Err(compile_error(format!(
                "`flight-compiler: callable-field-parameters` field `{owner}.{field}` is not callable"
            )));
        };
        if names.len() != arity {
            return Err(compile_error(format!(
                "`flight-compiler: callable-field-parameters` field `{owner}.{field}` expects {arity} parameter names, got {}",
                names.len()
            )));
        }
    }
    return Ok(());
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
    let nullable_options = parse_flag_directive(&file.attrs, "nullable-options")?;
    let mut constants = Vec::new();
    let mut helpers = Vec::new();
    let mut standard_constants = HashSet::new();
    let mut structs = Vec::new();
    let mut suites = Vec::new();
    let mut type_aliases = Vec::new();
    let mut top_level_skipped_tests = Vec::new();
    let mut top_level_tests = Vec::new();
    let mut uses = Vec::new();

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
            Item::Mod(module) => {
                let suite = parse_test_suite(module)?;
                if !suite.tests.is_empty() {
                    suites.push(suite);
                }
            }
            Item::Use(item_use) => {
                collect_standard_constant(&item_use.tree, &mut Vec::new(), &mut standard_constants);
                uses.push(item_use);
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

    if !top_level_tests.is_empty() {
        suites.insert(
            0,
            TestSuite {
                helpers: Vec::new(),
                name: "portable_tests".to_string(),
                skipped_tests: top_level_skipped_tests,
                tests: top_level_tests,
                uses: Vec::new(),
            },
        );
    }

    return Ok(TestProgram {
        constants,
        helpers,
        nullable_options,
        standard_constants,
        structs,
        suites,
        type_aliases,
        uses,
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
    let mut uses = Vec::new();
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
            Item::Use(item_use) => uses.push(item_use),
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
        uses,
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

fn validate_array_like_parameters(
    parameters: &BTreeSet<String>,
    functions: &[ItemFn],
) -> Result<(), CompileError> {
    for designation in parameters {
        let (function_name, parameter_name) = designation
            .split_once('.')
            .expect("array-like designations were parsed as `function.parameter`");
        let slice = functions
            .iter()
            .find(|function| function.sig.ident == function_name)
            .and_then(|function| {
                function.sig.inputs.iter().find_map(|input| match input {
                    syn::FnArg::Typed(typed)
                        if matches!(typed.pat.as_ref(), syn::Pat::Ident(pattern) if pattern.ident == parameter_name) =>
                    {
                        Some(typed.ty.as_ref())
                    }
                    _ => None,
                })
            })
            .is_some_and(|rust_type| {
                matches!(rust_type, Type::Reference(reference) if reference.mutability.is_none() && matches!(reference.elem.as_ref(), Type::Slice(_)))
            });
        if !slice {
            return Err(compile_error(format!(
                "`flight-compiler: array-like {designation}` must name a `&[T]` parameter of a function in this source"
            )));
        }
    }
    return Ok(());
}

fn validate_data_union_directives(
    data_unions: &HashSet<String>,
    enums: &[ItemEnum],
    string_unions: &BTreeMap<String, StringUnionStyle>,
) -> Result<(), CompileError> {
    let mut names = data_unions.iter().collect::<Vec<_>>();
    names.sort();
    for name in names {
        if string_unions.contains_key(name) {
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

// A `LazyLock` is portable only as `static NAME: LazyLock<T> = LazyLock::new(init)`, where `T` names a
// struct or type alias declared in this source and `init` is a zero-argument function path or closure.
// Every other mention of `LazyLock` fails closed rather than lowering to a missing runtime type.
// flight-lint: allow(hashmap-iteration) every collection visited here is a source-ordered Vec
fn validate_lazy_lock_statics(
    statics: &[ItemStatic],
    functions: &[ItemFn],
    constants: &[ItemConst],
    structs: &[ItemStruct],
    type_aliases: &[ItemType],
) -> Result<(), CompileError> {
    struct LazyLockVisitor {
        found: bool,
    }
    impl<'ast> syn::visit::Visit<'ast> for LazyLockVisitor {
        fn visit_path_segment(&mut self, segment: &'ast syn::PathSegment) {
            if segment.ident == "LazyLock" {
                self.found = true;
            }
            syn::visit::visit_path_segment(self, segment);
        }
    }
    let mut visitor = LazyLockVisitor { found: false };
    for function in functions {
        syn::visit::Visit::visit_item_fn(&mut visitor, function);
    }
    for constant in constants {
        syn::visit::Visit::visit_item_const(&mut visitor, constant);
    }
    for structure in structs {
        syn::visit::Visit::visit_item_struct(&mut visitor, structure);
    }
    for type_alias in type_aliases {
        syn::visit::Visit::visit_item_type(&mut visitor, type_alias);
    }
    if visitor.found {
        return Err(compile_error(
            "`LazyLock` is portable only as the type of `static NAME: LazyLock<T> = LazyLock::new(init)`",
        ));
    }
    for rust_static in statics {
        let name = rust_static.ident.to_string();
        let mentions_lazy_lock = {
            let mut visitor = LazyLockVisitor { found: false };
            syn::visit::Visit::visit_item_static(&mut visitor, rust_static);
            visitor.found
        };
        if !mentions_lazy_lock {
            continue;
        }
        let Some((inner, initializer)) = lazy_lock_static(rust_static) else {
            return Err(compile_error(format!(
                "unsupported `LazyLock` static `{name}`; declare it as `static {name}: LazyLock<T> = LazyLock::new(init)`"
            )));
        };
        if !matches!(rust_static.mutability, syn::StaticMutability::None) {
            return Err(compile_error(format!(
                "`LazyLock` static `{name}` cannot be `mut`"
            )));
        }
        let declared = match inner {
            Type::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
                let segment = &path.path.segments[0];
                matches!(segment.arguments, PathArguments::None)
                    && (structs
                        .iter()
                        .any(|structure| structure.ident == segment.ident)
                        || type_aliases
                            .iter()
                            .any(|type_alias| type_alias.ident == segment.ident))
            }
            _ => false,
        };
        if !declared {
            return Err(compile_error(format!(
                "`LazyLock` static `{name}` must hold a struct or type alias declared in this source; dependency-owned or unresolved value types are not portable"
            )));
        }
        let supported = match initializer {
            syn::Expr::Path(path) => path.qself.is_none(),
            syn::Expr::Closure(closure) => closure.inputs.is_empty(),
            _ => false,
        };
        if !supported {
            return Err(compile_error(format!(
                "unsupported `LazyLock` initializer for `{name}`; pass a zero-argument function path or a `|| value` closure"
            )));
        }
        let mut initializer_visitor = LazyLockVisitor { found: false };
        syn::visit::Visit::visit_expr(&mut initializer_visitor, initializer);
        if initializer_visitor.found {
            return Err(compile_error(format!(
                "`LazyLock` initializer for `{name}` cannot construct another `LazyLock`"
            )));
        }
    }
    return Ok(());
}

fn validate_numeric_union_directives(
    numeric_union_names: &BTreeSet<String>,
    enums: &[ItemEnum],
    data_unions: &HashSet<String>,
    string_unions: &BTreeMap<String, StringUnionStyle>,
) -> Result<BTreeMap<String, Vec<(String, i64)>>, CompileError> {
    let mut unions = BTreeMap::new();
    for name in numeric_union_names {
        if data_unions.contains(name) || string_unions.contains_key(name) {
            return Err(compile_error(format!(
                "enum `{name}` cannot combine `flight-compiler: numeric-union` with another union directive"
            )));
        }
        let Some(rust_enum) = enums.iter().find(|rust_enum| rust_enum.ident == name) else {
            return Err(compile_error(format!(
                "`flight-compiler: numeric-union` enum `{name}` does not exist"
            )));
        };
        let mut variants = Vec::new();
        let mut seen_discriminants = BTreeSet::new();
        for variant in &rust_enum.variants {
            if !matches!(variant.fields, Fields::Unit) {
                return Err(compile_error(format!(
                    "numeric union variant `{name}::{}` must be a unit variant",
                    variant.ident
                )));
            }
            let Some((_, discriminant)) = &variant.discriminant else {
                return Err(compile_error(format!(
                    "numeric union variant `{name}::{}` requires an explicit integer discriminant",
                    variant.ident
                )));
            };
            let Some(value) = integer_discriminant_value(discriminant) else {
                return Err(compile_error(format!(
                    "numeric union variant `{name}::{}` discriminant must be an integer literal",
                    variant.ident
                )));
            };
            if !seen_discriminants.insert(value) {
                return Err(compile_error(format!(
                    "numeric union `{name}` repeats discriminant `{value}`"
                )));
            }
            variants.push((variant.ident.to_string(), value));
        }
        if variants.is_empty() {
            return Err(compile_error(format!(
                "numeric union `{name}` requires at least one variant"
            )));
        }
        unions.insert(name.clone(), variants);
    }
    return Ok(unions);
}

fn validate_string_union_directives(
    string_unions: &BTreeMap<String, StringUnionStyle>,
    string_union_values: &BTreeMap<String, BTreeMap<String, String>>,
    enums: &[ItemEnum],
) -> Result<(), CompileError> {
    for name in string_union_values.keys() {
        if !string_unions.contains_key(name) {
            return Err(compile_error(format!(
                "`flight-compiler: string-union-value` enum `{name}` is not declared by `flight-compiler: string-union`"
            )));
        }
    }
    for (name, style) in string_unions {
        let Some(rust_enum) = enums.iter().find(|rust_enum| rust_enum.ident == name) else {
            return Err(compile_error(format!(
                "`flight-compiler: string-union` enum `{name}` does not exist"
            )));
        };
        let values = string_union_values.get(name);
        if *style != StringUnionStyle::Exact {
            if values.is_some() {
                return Err(compile_error(format!(
                    "`flight-compiler: string-union-value` enum `{name}` must use `string-union {name}=exact`"
                )));
            }
            continue;
        }
        let Some(values) = values else {
            return Err(compile_error(format!(
                "exact string union `{name}` requires one `flight-compiler: string-union-value` directive per variant"
            )));
        };
        for variant in values.keys() {
            if !rust_enum
                .variants
                .iter()
                .any(|candidate| candidate.ident == variant)
            {
                return Err(compile_error(format!(
                    "`flight-compiler: string-union-value` variant `{name}::{variant}` does not exist"
                )));
            }
        }
        for variant in &rust_enum.variants {
            if !values.contains_key(&variant.ident.to_string()) {
                return Err(compile_error(format!(
                    "exact string union `{name}` has no value for variant `{}`",
                    variant.ident
                )));
            }
        }
        let mut unique = HashSet::new();
        for value in values.values() {
            if !unique.insert(value) {
                return Err(compile_error(format!(
                    "exact string union `{name}` repeats value `{value}`"
                )));
            }
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

fn validate_entity_runtime_states(
    states: &BTreeMap<String, String>,
    structs: &[ItemStruct],
) -> Result<(), CompileError> {
    for (owner, field_name) in states {
        let Some(structure) = structs
            .iter()
            .find(|structure| structure.ident == owner.as_str())
        else {
            return Err(compile_error(format!(
                "`flight-compiler: entity-runtime-state {owner}.{field_name}` names no struct declared in this source"
            )));
        };
        if !has_entity_runtime(structure) {
            return Err(compile_error(format!(
                "`flight-compiler: entity-runtime-state {owner}.{field_name}` requires `{owner}` to be an entity with a private `runtime: EntityRuntimeSlot`"
            )));
        }
        let Some(field) = structure.fields.iter().find(|field| {
            field
                .ident
                .as_ref()
                .is_some_and(|ident| ident == field_name)
        }) else {
            return Err(compile_error(format!(
                "`flight-compiler: entity-runtime-state {owner}.{field_name}` names no field of `{owner}`"
            )));
        };
        if field_name == "runtime" || is_public(&field.vis) {
            return Err(compile_error(format!(
                "`flight-compiler: entity-runtime-state {owner}.{field_name}` must designate a crate-private state field, not a public field or the runtime slot"
            )));
        }
    }
    return Ok(());
}

fn validate_fields(
    structure: &ItemStruct,
    designated_state: Option<&str>,
) -> Result<(), CompileError> {
    let Fields::Named(fields) = &structure.fields else {
        return Err(compile_error(format!(
            "unsupported struct `{}`: only named fields can be transpiled",
            structure.ident
        )));
    };
    let module_private_plain_data = !is_public(&structure.vis) && !has_entity_runtime(structure);
    for field in &fields.named {
        if !(module_private_plain_data
            || is_public(&field.vis)
            || field.ident.as_ref().is_some_and(|ident| ident == "runtime")
                && type_name(&field.ty).as_deref() == Some("EntityRuntimeSlot")
            || designated_state.is_some_and(|designated| {
                field
                    .ident
                    .as_ref()
                    .is_some_and(|ident| ident == designated)
            }))
        {
            let field_name = field
                .ident
                .as_ref()
                .map(ToString::to_string)
                .unwrap_or_else(|| "<unnamed>".to_string());
            let designation = if has_entity_runtime(structure) {
                format!(
                    " unless the field is designated with `flight-compiler: entity-runtime-state {}.{field_name}`",
                    structure.ident
                )
            } else {
                String::new()
            };
            return Err(compile_error(format!(
                "unsupported private field `{field_name}` on `{}`; only the EntityRuntimeSlot is target-private{designation}",
                structure.ident
            )));
        }
    }
    return Ok(());
}
