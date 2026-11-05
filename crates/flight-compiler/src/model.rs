use std::collections::{BTreeMap, BTreeSet, HashSet};

use syn::ext::IdentExt;
use syn::parse::Parser;
use syn::visit_mut::{self, VisitMut};
use syn::{
    Attribute, Expr, Fields, GenericArgument, Item, ItemConst, ItemEnum, ItemFn, ItemStatic,
    ItemStruct, ItemType, ItemUse, PathArguments, Type, UseTree, Visibility,
};

use crate::{CompileError, SourceMode, compile_error};

// How a TypeScript const object takes its members: every public constant whose name starts with a
// `const-group` prefix, keyed by the rest of the name, or the constants `const-member` directives name
// one by one, keyed by their explicit member names.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ConstGroup {
    Members(BTreeMap<String, String>),
    Prefix(String),
}

pub(crate) struct Program {
    pub(crate) callable_field_parameters: BTreeMap<(String, String), Vec<String>>,
    pub(crate) callable_parameters: BTreeMap<String, Vec<String>>,
    pub(crate) constants: Vec<ItemConst>,
    // `const-group` and `const-member` directives: TypeScript const-object name to the Rust
    // constants that become its members, in source order (`KEY_CODE_A` -> `KeyCode.A`).
    pub(crate) const_groups: BTreeMap<String, ConstGroup>,
    pub(crate) auto_data_unions: HashSet<String>,
    pub(crate) data_unions: HashSet<String>,
    // Public record structs whose standard derived `Default` construction TypeScript lowers to a
    // plain object literal. Generation validates the derive and each field default before use.
    pub(crate) default_objects: BTreeSet<String>,
    pub(crate) entities: HashSet<String>,
    // Functions whose leading mutable entity parameter uses the target's writable construction
    // view even when that entity's canonical declaration is owned outside this Rust source graph.
    pub(crate) entity_construction_functions: HashSet<String>,
    // Entity fields whose `Ref` cells remain shared when Rust clones the entity. TypeScript lowers
    // those fields as forwarding accessors on a fresh spread object.
    pub(crate) entity_clone_shared_fields: BTreeMap<String, BTreeSet<String>>,
    // Entity struct name to its one designated crate-private state field, which TypeScript stores in
    // the entity's runtime slot instead of the public record.
    pub(crate) entity_runtime_states: BTreeMap<String, String>,
    pub(crate) enums: Vec<ItemEnum>,
    // `export-name` directives: Rust item name to its explicit TypeScript name.
    pub(crate) export_names: BTreeMap<String, String>,
    // `extern crate` items, whose (renamed) bindings can stand in for the `std` / `core` / `alloc` roots.
    pub(crate) extern_crates: Vec<syn::ItemExternCrate>,
    pub(crate) facts: SourceFacts,
    pub(crate) frozen_objects: BTreeMap<String, String>,
    pub(crate) functions: Vec<ItemFn>,
    // Receiver methods in `impl` blocks that only forward to one free function. Impl blocks never emit
    // TypeScript; these let method-call syntax on a resolved receiver lower to that function.
    pub(crate) method_delegations: Vec<MethodDelegation>,
    // `#![no_std]`: the `std` root and the `std` prelude's `Box` are absent unless bound explicitly.
    pub(crate) no_std: bool,
    // `function.parameter` slice parameters TypeScript types as `ArrayLike<T>`, so typed arrays are
    // accepted; the function body may only read their length and elements or pass them on.
    pub(crate) array_like_parameters: BTreeSet<String>,
    // Functions whose `Option` return, and `Struct.field`s whose `Option` field, TypeScript represents
    // as `T | null` instead of an absent `undefined`; trailing `Option` parameters stay optional.
    pub(crate) nullable_option_items: BTreeSet<String>,
    pub(crate) nullable_options: bool,
    // Unit enums lowered to a type-only TS union of their declared integer discriminants, in
    // declaration order (`numeric-union`).
    pub(crate) numeric_unions: BTreeMap<String, Vec<(String, i64)>>,
    pub(crate) statics: Vec<ItemStatic>,
    pub(crate) structs: Vec<ItemStruct>,
    pub(crate) readonly_structs: HashSet<String>,
    // `record-map Owner::Variant` directives: data-union variants whose string-keyed `HashMap` payload
    // TypeScript represents as a plain object record rather than a `Map`.
    pub(crate) record_map_variants: BTreeSet<(String, String)>,
    pub(crate) source_mode: SourceMode,
    // Transparent data unions that distinguish their first record payload from the final fallback
    // payload by declaration-derived property names (`data-union Name=reserved-key`).
    pub(crate) reserved_key_data_unions: HashSet<String>,
    pub(crate) string_unions: BTreeMap<String, StringUnionStyle>,
    pub(crate) string_union_values: BTreeMap<String, BTreeMap<String, String>>,
    pub(crate) type_aliases: Vec<ItemType>,
    // Every item the source declares in the type namespace (structs, enums, unions, traits, aliases,
    // modules), so `use`-path resolution can see local shadows of standard names.
    pub(crate) type_names: BTreeSet<String>,
    pub(crate) uses: Vec<ItemUse>,
}

// One delegating method: `impl Owner { fn method(&self, a, b) { return function(self, a, b); } }`.
// `arguments` lists the free function's arguments in order: `None` is the receiver, `Some(index)` the
// method parameter at that index.
pub(crate) struct MethodDelegation {
    pub(crate) arguments: Vec<Option<usize>>,
    pub(crate) function: String,
    pub(crate) method: String,
    pub(crate) owner: Type,
}

pub(crate) struct ExternalNullableOptionProgram {
    pub(crate) functions: Vec<ItemFn>,
    pub(crate) nullable_option_items: BTreeSet<String>,
    pub(crate) nullable_options: bool,
    pub(crate) structs: Vec<ItemStruct>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum StringUnionStyle {
    Exact,
    KebabCase,
    LowerCamel,
    RustVariant,
}

impl StringUnionStyle {
    pub(crate) fn directive_name(self) -> &'static str {
        return match self {
            Self::Exact => "exact",
            Self::KebabCase => "kebab-case",
            Self::LowerCamel => "lower-camel",
            Self::RustVariant => "rust-variant",
        };
    }
}

pub(crate) struct StringUnionMetadata {
    pub(crate) styles: BTreeMap<String, StringUnionStyle>,
    pub(crate) values: BTreeMap<String, BTreeMap<String, String>>,
}

struct DataUnionMetadata {
    names: HashSet<String>,
    reserved_key: HashSet<String>,
}

// What a source contributes to implicit trait dispatch, which the eager-initialization proof must see
// across the whole crate: every attribute, trait or inherent `impl` and macro invocation outside
// `#[cfg(test)]` and `#[test]` code, the `macro_rules!` macros it defines, and the value names it
// declares. Macro arguments are opaque token trees, so a nested `name!` invocation in them is recorded
// as a macro and an `impl` or `#[...]` in them as a hidden item. Names a nested module or block binds
// with `use` (`*` for a glob) are recorded too: facts are resolved from the file's top-level scope, so
// such a name has an owner the proof cannot decide.
#[derive(Default)]
pub(crate) struct SourceFacts {
    pub(crate) attributes: Vec<Attribute>,
    pub(crate) hidden_items: bool,
    pub(crate) nested_use_names: BTreeSet<String>,
    // Every `mod name;` declaration whose body lives in another file, outside `#[cfg(test)]` code.
    pub(crate) external_modules: Vec<ExternalModule>,
    pub(crate) impls: Vec<syn::ItemImpl>,
    pub(crate) macro_definitions: BTreeSet<String>,
    pub(crate) macro_use_extern_crate: bool,
    pub(crate) macros: Vec<syn::Path>,
    pub(crate) value_names: BTreeSet<String>,
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

// An inline module enclosing an external `mod name;` declaration, with every filesystem location
// its contents may use. Its identifier is unraw because Rust never includes the `r#` escape in a
// default module filename.
#[derive(Clone, Debug)]
pub(crate) struct InlineModule {
    pub(crate) component: String,
    // Its `#[path = "…"]` (empty when the value is not a string literal).
    pub(crate) path: Option<String>,
    // The paths a `#[cfg_attr(…, path = "…")]` may apply instead (empty for a non-string value).
    pub(crate) conditional_paths: Vec<String>,
}

// A `mod name;` declaration, with what decides the file Rust loads for it.
#[derive(Clone, Debug)]
pub(crate) struct ExternalModule {
    // The source spelling, retained for diagnostics.
    pub(crate) name: String,
    // Its default filesystem component, without a raw-identifier escape.
    pub(crate) component: String,
    // The inline modules enclosing it, outermost first.
    pub(crate) inline_parents: Vec<InlineModule>,
    // Its `#[path = "…"]` (empty when the value is not a string literal).
    pub(crate) path: Option<String>,
    // The paths a `#[cfg_attr(…, path = "…")]` may apply instead (empty for a non-string value).
    pub(crate) conditional_paths: Vec<String>,
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

pub(crate) fn collect_source_facts(file: &syn::File) -> SourceFacts {
    struct Collector {
        depth: usize,
        facts: SourceFacts,
        inline_parents: Vec<InlineModule>,
    }
    // The `path = "…"` values a `cfg_attr` may apply, through nested `cfg_attr`s.
    fn conditional_paths(meta: &syn::Meta, out: &mut Vec<String>) {
        let syn::Meta::List(list) = meta else {
            return;
        };
        let Ok(metas) = list.parse_args_with(
            syn::punctuated::Punctuated::<syn::Meta, syn::Token![,]>::parse_terminated,
        ) else {
            out.push(String::new());
            return;
        };
        for applied in metas.iter().skip(1) {
            if applied.path().is_ident("path") {
                out.push(path_value(applied));
            } else if applied.path().is_ident("cfg_attr") {
                conditional_paths(applied, out);
            }
        }
    }
    fn path_value(meta: &syn::Meta) -> String {
        if let syn::Meta::NameValue(value) = meta
            && let syn::Expr::Lit(literal) = &value.value
            && let syn::Lit::Str(path) = &literal.lit
        {
            return path.value();
        }
        return String::new();
    }
    impl Collector {
        fn scan_tokens(&mut self, tokens: proc_macro2::TokenStream) {
            let tokens = tokens.into_iter().collect::<Vec<_>>();
            for (index, token) in tokens.iter().enumerate() {
                match token {
                    proc_macro2::TokenTree::Group(group) => self.scan_tokens(group.stream()),
                    proc_macro2::TokenTree::Ident(ident) if ident == "impl" => {
                        self.facts.hidden_items = true;
                    }
                    proc_macro2::TokenTree::Ident(ident) => {
                        if let (
                            Some(proc_macro2::TokenTree::Punct(bang)),
                            Some(proc_macro2::TokenTree::Group(_)),
                        ) = (tokens.get(index + 1), tokens.get(index + 2))
                            && bang.as_char() == '!'
                        {
                            // The invocation's complete path: `a::b::name!`, or `::a::name!`.
                            let colons = |at: usize| {
                                return matches!(
                                    (tokens.get(at), tokens.get(at + 1)),
                                    (
                                        Some(proc_macro2::TokenTree::Punct(first)),
                                        Some(proc_macro2::TokenTree::Punct(second)),
                                    ) if first.as_char() == ':' && second.as_char() == ':'
                                );
                            };
                            let mut segments = vec![ident.clone()];
                            let mut start = index;
                            while start >= 3
                                && colons(start - 2)
                                && let proc_macro2::TokenTree::Ident(previous) = &tokens[start - 3]
                            {
                                segments.insert(0, previous.clone());
                                start -= 3;
                            }
                            let mut path = syn::Path {
                                leading_colon: None,
                                segments: segments
                                    .into_iter()
                                    .map(syn::PathSegment::from)
                                    .collect(),
                            };
                            if start >= 2 && colons(start - 2) {
                                path.leading_colon = Some(Default::default());
                            }
                            self.facts.macros.push(path);
                        }
                    }
                    proc_macro2::TokenTree::Punct(punct) if punct.as_char() == '#' => {
                        if matches!(
                            tokens.get(index + 1),
                            Some(proc_macro2::TokenTree::Group(group))
                                if group.delimiter() == proc_macro2::Delimiter::Bracket
                        ) {
                            self.facts.hidden_items = true;
                        }
                    }
                    proc_macro2::TokenTree::Punct(_) | proc_macro2::TokenTree::Literal(_) => {}
                }
            }
        }
    }
    impl Collector {
        fn module_paths(attributes: &[Attribute]) -> (Option<String>, Vec<String>) {
            let mut path = None;
            let mut conditional = Vec::new();
            for attribute in attributes {
                if attribute.path().is_ident("path") {
                    path = Some(path_value(&attribute.meta));
                } else if attribute.path().is_ident("cfg_attr") {
                    conditional_paths(&attribute.meta, &mut conditional);
                }
            }
            return (path, conditional);
        }
    }
    impl<'ast> syn::visit::Visit<'ast> for Collector {
        fn visit_attribute(&mut self, attribute: &'ast Attribute) {
            self.facts.attributes.push(attribute.clone());
        }

        fn visit_block(&mut self, block: &'ast syn::Block) {
            self.depth += 1;
            syn::visit::visit_block(self, block);
            self.depth -= 1;
        }

        fn visit_item_extern_crate(&mut self, item: &'ast syn::ItemExternCrate) {
            if has_attribute(&item.attrs, "macro_use") {
                self.facts.macro_use_extern_crate = true;
            }
            syn::visit::visit_item_extern_crate(self, item);
        }

        fn visit_item_fn(&mut self, function: &'ast ItemFn) {
            if !has_attribute(&function.attrs, "test") {
                syn::visit::visit_item_fn(self, function);
            }
        }

        fn visit_item_impl(&mut self, item: &'ast syn::ItemImpl) {
            self.facts.impls.push(item.clone());
            syn::visit::visit_item_impl(self, item);
        }

        fn visit_item_macro(&mut self, item: &'ast syn::ItemMacro) {
            if item.mac.path.is_ident("macro_rules") {
                if let Some(ident) = &item.ident {
                    self.facts.macro_definitions.insert(ident.to_string());
                }
                for attribute in &item.attrs {
                    self.visit_attribute(attribute);
                }
                return;
            }
            syn::visit::visit_item_macro(self, item);
        }

        fn visit_item_mod(&mut self, module: &'ast syn::ItemMod) {
            if is_cfg_test(&module.attrs) {
                return;
            }
            let (path, conditional_paths) = Self::module_paths(&module.attrs);
            if module.content.is_none() {
                self.facts.external_modules.push(ExternalModule {
                    name: module.ident.to_string(),
                    component: module.ident.unraw().to_string(),
                    inline_parents: self.inline_parents.clone(),
                    path,
                    conditional_paths,
                });
                for attribute in &module.attrs {
                    self.visit_attribute(attribute);
                }
                return;
            }
            self.inline_parents.push(InlineModule {
                component: module.ident.unraw().to_string(),
                path,
                conditional_paths,
            });
            self.depth += 1;
            syn::visit::visit_item_mod(self, module);
            self.depth -= 1;
            self.inline_parents.pop();
        }

        fn visit_macro(&mut self, mac: &'ast syn::Macro) {
            self.facts.macros.push(mac.path.clone());
            self.scan_tokens(mac.tokens.clone());
        }

        fn visit_use_glob(&mut self, _glob: &'ast syn::UseGlob) {
            if self.depth > 0 {
                self.facts.nested_use_names.insert("*".to_string());
            }
        }

        fn visit_use_name(&mut self, name: &'ast syn::UseName) {
            if self.depth > 0 {
                self.facts.nested_use_names.insert(name.ident.to_string());
            }
        }

        fn visit_use_rename(&mut self, rename: &'ast syn::UseRename) {
            if self.depth > 0 {
                self.facts
                    .nested_use_names
                    .insert(rename.rename.to_string());
            }
        }
    }
    let mut collector = Collector {
        depth: 0,
        facts: SourceFacts::default(),
        inline_parents: Vec::new(),
    };
    syn::visit::Visit::visit_file(&mut collector, file);
    for item in &file.items {
        match item {
            Item::Const(item) => {
                collector.facts.value_names.insert(item.ident.to_string());
            }
            Item::Fn(item) => {
                collector
                    .facts
                    .value_names
                    .insert(item.sig.ident.to_string());
            }
            Item::Static(item) => {
                collector.facts.value_names.insert(item.ident.to_string());
            }
            _ => {}
        }
    }
    return collector.facts;
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

// The members of each const object, in source order, as `(rust_name, owner, member)`: every constant
// whose name starts with a `const-group` prefix, keyed by the rest of its name, and every constant a
// `const-member` directive names, keyed by its explicit member name. An object must have at least one
// member and every named constant must exist; every member must be public, share one type with the
// object's other members, have a TypeScript identifier key unique within the object, and be
// initialized with an independent literal (a member computed from another would read the object it
// is initializing); and no constant may belong to two objects.
// flight-lint: allow(hashmap-iteration) constants are a Vec slice in Rust source order and groups are a BTreeMap
pub(crate) fn const_group_members(
    groups: &BTreeMap<String, ConstGroup>,
    constants: &[ItemConst],
) -> Result<Vec<(String, String, String)>, CompileError> {
    for (owner, group) in groups {
        let ConstGroup::Members(named) = group else {
            continue;
        };
        if let Some(rust_name) = named.keys().find(|rust_name| {
            !constants
                .iter()
                .any(|constant| constant.ident == rust_name.as_str())
        }) {
            return Err(compile_error(format!(
                "`const-member {rust_name}` of `{owner}` names no constant"
            )));
        }
    }
    let mut members = Vec::new();
    for constant in constants {
        let rust_name = constant.ident.to_string();
        let owners = groups
            .iter()
            .filter_map(|(owner, group)| match group {
                ConstGroup::Prefix(prefix) => rust_name
                    .starts_with(prefix.as_str())
                    .then(|| (owner, rust_name[prefix.len()..].to_string())),
                ConstGroup::Members(named) => {
                    named.get(&rust_name).map(|member| (owner, member.clone()))
                }
            })
            .collect::<Vec<_>>();
        let [(owner, member)] = owners.as_slice() else {
            if owners.len() > 1
                && owners
                    .iter()
                    .all(|(owner, _)| matches!(groups.get(*owner), Some(ConstGroup::Prefix(_))))
            {
                return Err(compile_error(format!(
                    "constant `{rust_name}` matches more than one `const-group` prefix"
                )));
            }
            if owners.len() > 1 {
                return Err(compile_error(format!(
                    "constant `{rust_name}` belongs to more than one const object: {}",
                    owners
                        .iter()
                        .map(|(owner, _)| format!("`{owner}`"))
                        .collect::<Vec<_>>()
                        .join(", ")
                )));
            }
            continue;
        };
        if !is_typescript_identifier(member) {
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
        if let Some((previous, _, _, _)) = members.iter().find(
            |(_, previous_owner, previous_member, _): &&(String, String, String, &ItemConst)| {
                previous_owner == *owner && previous_member == member
            },
        ) {
            return Err(compile_error(format!(
                "`{owner}.{member}` is named by both `{previous}` and `{rust_name}`"
            )));
        }
        members.push((rust_name, (*owner).clone(), member.clone(), constant));
    }
    for (owner, group) in groups {
        let typed = members
            .iter()
            .filter(|(_, member_owner, _, _)| member_owner == owner)
            .map(|(_, _, _, constant)| {
                quote::ToTokens::to_token_stream(constant.ty.as_ref()).to_string()
            })
            .collect::<BTreeSet<_>>();
        if typed.is_empty() {
            let ConstGroup::Prefix(prefix) = group else {
                unreachable!("every `const-member` names an existing constant");
            };
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

fn has_attribute(attributes: &[Attribute], expected: &str) -> bool {
    return attributes
        .iter()
        .any(|attribute| attribute.path().is_ident(expected));
}

pub(crate) fn has_companion_metadata(source: &str) -> Result<bool, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    return Ok(file.attrs.iter().any(|attribute| {
        doc_directive(attribute)
            .is_some_and(|directive| directive.split_whitespace().next() == Some("companion"))
    }));
}

fn has_entity_runtime(structure: &ItemStruct) -> bool {
    return structure.fields.iter().any(|field| {
        !is_public(&field.vis) && type_name(&field.ty).as_deref() == Some("EntityRuntimeSlot")
    });
}

fn impl_method_delegations(item: &syn::ItemImpl) -> Vec<MethodDelegation> {
    if has_rust_only_directive(&item.attrs) || !item.generics.params.is_empty() {
        return Vec::new();
    }
    let owner = delegation_owner_type(&item.self_ty);
    return item
        .items
        .iter()
        .filter_map(|impl_item| match impl_item {
            syn::ImplItem::Fn(method) => method_delegation(owner, method),
            _ => None,
        })
        .collect();
}

// The struct a facade impl targets, seen through references and the single-payload ownership
// wrappers TypeScript erases (`impl Methods for Ref<AudioResource>` targets `AudioResource`).
fn delegation_owner_type(rust_type: &Type) -> &Type {
    return match rust_type {
        Type::Group(group) => delegation_owner_type(&group.elem),
        Type::Paren(paren) => delegation_owner_type(&paren.elem),
        Type::Reference(reference) => delegation_owner_type(&reference.elem),
        Type::Path(path)
            if path.qself.is_none()
                && let Some(segment) = path.path.segments.last()
                && matches!(
                    segment.ident.to_string().as_str(),
                    "Arc" | "Box" | "Rc" | "Ref"
                )
                && let PathArguments::AngleBracketed(arguments) = &segment.arguments
                && arguments.args.len() == 1
                && let Some(GenericArgument::Type(inner)) = arguments.args.first() =>
        {
            delegation_owner_type(inner)
        }
        rust_type => rust_type,
    };
}

fn method_delegation(owner: &Type, method: &syn::ImplItemFn) -> Option<MethodDelegation> {
    if has_rust_only_directive(&method.attrs) || !method.sig.generics.params.is_empty() {
        return None;
    }
    let mut inputs = method.sig.inputs.iter();
    let Some(syn::FnArg::Receiver(_)) = inputs.next() else {
        return None;
    };
    let parameters = inputs
        .map(|input| match input {
            syn::FnArg::Typed(typed) => match typed.pat.as_ref() {
                syn::Pat::Ident(pattern) if pattern.subpat.is_none() => {
                    Some(pattern.ident.to_string())
                }
                _ => None,
            },
            syn::FnArg::Receiver(_) => None,
        })
        .collect::<Option<Vec<_>>>()?;
    let call = delegated_call(&method.block, method.sig.asyncness.is_some())?;
    let syn::Expr::Path(function) = call.func.as_ref() else {
        return None;
    };
    if function.qself.is_some() || function.path.segments.len() != 1 {
        return None;
    }
    let function_segment = &function.path.segments[0];
    if !matches!(function_segment.arguments, PathArguments::None) {
        return None;
    }
    let mut arguments = Vec::new();
    for argument in &call.args {
        let syn::Expr::Path(path) = delegated_argument(argument) else {
            return None;
        };
        if path.qself.is_some() || path.path.segments.len() != 1 {
            return None;
        }
        let name = path.path.segments[0].ident.to_string();
        if name == "self" {
            arguments.push(None);
        } else {
            arguments.push(Some(
                parameters.iter().position(|parameter| *parameter == name)?,
            ));
        }
    }
    // The receiver must be forwarded exactly once and every parameter at most once, so the lowered
    // call evaluates each method-call operand once, as Rust does.
    let receiver_count = arguments
        .iter()
        .filter(|argument| argument.is_none())
        .count();
    let mut forwarded = arguments.iter().flatten().collect::<Vec<_>>();
    forwarded.sort();
    forwarded.dedup();
    if receiver_count != 1 || forwarded.len() != arguments.len() - 1 {
        return None;
    }
    return Some(MethodDelegation {
        arguments,
        function: function_segment.ident.to_string(),
        method: method.sig.ident.to_string(),
        owner: owner.clone(),
    });
}

// The one call a delegating method body consists of: `return f(..);`, `f(..);`, or the tail `f(..)`,
// awaited when the method is `async`.
fn delegated_call(block: &syn::Block, asynchronous: bool) -> Option<&syn::ExprCall> {
    let [statement] = block.stmts.as_slice() else {
        return None;
    };
    let expression = match statement {
        syn::Stmt::Expr(syn::Expr::Return(returned), _) => returned.expr.as_deref()?,
        syn::Stmt::Expr(expression, _) => expression,
        _ => return None,
    };
    let expression = match expression {
        syn::Expr::Await(awaited) if asynchronous => awaited.base.as_ref(),
        _ if asynchronous => return None,
        expression => expression,
    };
    return match expression {
        syn::Expr::Call(call) => Some(call),
        _ => None,
    };
}

fn delegated_argument(argument: &syn::Expr) -> &syn::Expr {
    return match argument {
        syn::Expr::Group(group) => delegated_argument(&group.expr),
        syn::Expr::Paren(paren) => delegated_argument(&paren.expr),
        syn::Expr::Reference(reference) => delegated_argument(&reference.expr),
        syn::Expr::Unary(unary) if matches!(unary.op, syn::UnOp::Deref(_)) => {
            delegated_argument(&unary.expr)
        }
        argument => argument,
    };
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

// A literal, optionally negated or parenthesized: a value that reads no other item.
// Whether `#[cfg(test)]` is among the attributes: the item exists only in test builds.
fn is_cfg_test(attributes: &[Attribute]) -> bool {
    return attributes.iter().any(|attribute| {
        return attribute.path().is_ident("cfg")
            && attribute
                .parse_args::<syn::Ident>()
                .is_ok_and(|predicate| predicate == "test");
    });
}

// A literal, or a flag literal `bit << shift` over integer literals whose value stays below 2^31, where
// JavaScript's signed 32-bit shift agrees with Rust. Neither reads another constant.
fn is_independent_literal(expression: &syn::Expr) -> bool {
    return match expression {
        syn::Expr::Binary(binary) if matches!(binary.op, syn::BinOp::Shl(_)) => {
            let integer = |operand: &syn::Expr| match operand {
                syn::Expr::Lit(syn::ExprLit {
                    lit: syn::Lit::Int(literal),
                    ..
                }) => literal.base10_parse::<u64>().ok(),
                _ => None,
            };
            return matches!(
                (integer(&binary.left), integer(&binary.right)),
                (Some(bit), Some(shift)) if shift < 31 && bit < (1 << 31) >> shift
            );
        }
        syn::Expr::Group(group) => is_independent_literal(&group.expr),
        syn::Expr::Lit(_) => true,
        syn::Expr::Paren(paren) => is_independent_literal(&paren.expr),
        syn::Expr::Unary(unary) if matches!(unary.op, syn::UnOp::Neg(_)) => {
            matches!(unary.expr.as_ref(), syn::Expr::Lit(_))
        }
        _ => false,
    };
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

fn is_public(visibility: &Visibility) -> bool {
    return matches!(visibility, Visibility::Public(_));
}

fn is_struct_literal(expression: &syn::Expr) -> bool {
    return match expression {
        syn::Expr::Group(group) => is_struct_literal(&group.expr),
        syn::Expr::Paren(paren) => is_struct_literal(&paren.expr),
        syn::Expr::Struct(_) => true,
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

fn is_valid_callable_field_parameter_name(name: &str) -> bool {
    return is_valid_callable_parameter_identifier(name)
        && (name == "await" || !is_javascript_binding_reserved(name));
}

fn is_valid_callable_parameter_identifier(name: &str) -> bool {
    return !name.starts_with("r#") && syn::Ident::parse_any.parse_str(name).is_ok();
}

fn is_valid_callable_parameter_name(name: &str) -> bool {
    return is_valid_callable_parameter_identifier(name) && !is_javascript_binding_reserved(name);
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

pub(crate) fn once_lock_static_inner_type(rust_static: &ItemStatic) -> Option<&Type> {
    let Type::Path(path) = rust_static.ty.as_ref() else {
        return None;
    };
    let segment = path.path.segments.last()?;
    if segment.ident != "OnceLock" {
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
    let last = function.path.segments.last()?;
    if last.ident != "new" || !call.args.is_empty() {
        return None;
    }
    return Some(inner);
}

fn next_directive_field(value: &str) -> Option<(&str, &str)> {
    let value = value.trim_start();
    if value.is_empty() {
        return None;
    }
    let end = value.find(char::is_whitespace).unwrap_or(value.len());
    return Some((&value[..end], &value[end..]));
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

fn parse_const_groups(
    attributes: &[Attribute],
) -> Result<BTreeMap<String, ConstGroup>, CompileError> {
    let mut groups = BTreeMap::new();
    let mut named_constants = HashSet::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        match fields.next() {
            Some("const-group") => {
                let (Some(owner), Some(prefix), None) =
                    (fields.next(), fields.next(), fields.next())
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
                match groups.insert(owner.to_string(), ConstGroup::Prefix(prefix.to_string())) {
                    None => {}
                    Some(ConstGroup::Prefix(_)) => {
                        return Err(compile_error(format!(
                            "`flight-compiler: const-group {owner}` is declared more than once"
                        )));
                    }
                    Some(ConstGroup::Members(_)) => {
                        return Err(compile_error(format!(
                            "`flight-compiler: const-group {owner}` cannot also take `const-member` members"
                        )));
                    }
                }
            }
            Some("const-member") => {
                let (Some(rust_name), Some(target), None) =
                    (fields.next(), fields.next(), fields.next())
                else {
                    return Err(compile_error(
                        "`flight-compiler: const-member` requires exactly a Rust constant name and a TypeScript `Owner.Member`",
                    ));
                };
                if syn::parse_str::<syn::Ident>(rust_name).is_err() || rust_name.starts_with("r#") {
                    return Err(compile_error(format!(
                        "`flight-compiler: const-member` Rust constant name `{rust_name}` is not a valid identifier"
                    )));
                }
                let Some((owner, member)) = target.split_once('.').filter(|(owner, member)| {
                    is_typescript_identifier(owner) && is_typescript_identifier(member)
                }) else {
                    return Err(compile_error(format!(
                        "`flight-compiler: const-member {rust_name}` target `{target}` is not a TypeScript `Owner.Member`"
                    )));
                };
                if !named_constants.insert(rust_name.to_string()) {
                    return Err(compile_error(format!(
                        "duplicate `flight-compiler: const-member` directive for `{rust_name}`"
                    )));
                }
                let group = groups
                    .entry(owner.to_string())
                    .or_insert_with(|| ConstGroup::Members(BTreeMap::new()));
                let ConstGroup::Members(named) = group else {
                    return Err(compile_error(format!(
                        "`flight-compiler: const-group {owner}` cannot also take `const-member` members"
                    )));
                };
                named.insert(rust_name.to_string(), member.to_string());
            }
            _ => {}
        }
    }
    return Ok(groups);
}

fn parse_data_unions(attributes: &[Attribute]) -> Result<DataUnionMetadata, CompileError> {
    let mut data_unions = HashSet::new();
    let mut reserved_key = HashSet::new();
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
        for specification in names {
            let mut parts = specification.split('=');
            let name = parts.next().unwrap_or_default();
            let style = parts.next();
            if parts.next().is_some() {
                return Err(compile_error(format!(
                    "`flight-compiler: data-union` enum specification `{specification}` is malformed"
                )));
            }
            if syn::parse_str::<syn::Ident>(name).is_err() || name.starts_with("r#") {
                return Err(compile_error(format!(
                    "`flight-compiler: data-union` enum name `{name}` is not a valid identifier"
                )));
            }
            match style {
                None => {}
                Some("reserved-key") => {
                    reserved_key.insert(name.to_string());
                }
                Some(style) => {
                    return Err(compile_error(format!(
                        "`flight-compiler: data-union` enum `{name}` has unknown style `{style}`"
                    )));
                }
            }
            if !data_unions.insert(name.to_string()) {
                return Err(compile_error(format!(
                    "duplicate `flight-compiler: data-union` directive for enum `{name}`"
                )));
            }
        }
    }
    return Ok(DataUnionMetadata {
        names: data_unions,
        reserved_key,
    });
}

// `record-map Owner::Variant ...`: each named variant belongs to a `data-union` of the same source and
// carries a string-keyed `HashMap` payload that TypeScript represents as a plain object record.
fn parse_record_map_variants(
    attributes: &[Attribute],
    data_unions: &HashSet<String>,
) -> Result<BTreeSet<(String, String)>, CompileError> {
    let mut variants = BTreeSet::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("record-map") {
            continue;
        }
        let names = fields.collect::<Vec<_>>();
        if names.is_empty() {
            return Err(compile_error(
                "`flight-compiler: record-map` requires at least one `Owner::Variant`",
            ));
        }
        for specification in names {
            let Some((owner, variant)) = specification.split_once("::") else {
                return Err(compile_error(format!(
                    "`flight-compiler: record-map` entry `{specification}` must name `Owner::Variant`"
                )));
            };
            if !data_unions.contains(owner) {
                return Err(compile_error(format!(
                    "`flight-compiler: record-map {specification}` names no `data-union` enum of this source"
                )));
            }
            if !variants.insert((owner.to_string(), variant.to_string())) {
                return Err(compile_error(format!(
                    "duplicate `flight-compiler: record-map` entry `{specification}`"
                )));
            }
        }
    }
    return Ok(variants);
}

fn parse_entity_clone_shared_fields(
    attributes: &[Attribute],
) -> Result<BTreeMap<String, BTreeSet<String>>, CompileError> {
    let mut owners = BTreeMap::<String, BTreeSet<String>>::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("entity-clone-fields") {
            continue;
        }
        let designations = fields.collect::<Vec<_>>();
        if designations.is_empty() {
            return Err(compile_error(
                "`flight-compiler: entity-clone-fields` requires at least one `Owner.field` designation",
            ));
        }
        for designation in designations {
            let Some((owner, field)) = designation.split_once('.').filter(|(owner, field)| {
                [owner, field].iter().all(|name| {
                    syn::parse_str::<syn::Ident>(name).is_ok() && !name.starts_with("r#")
                })
            }) else {
                return Err(compile_error(format!(
                    "`flight-compiler: entity-clone-fields` designation `{designation}` is not `Owner.field`"
                )));
            };
            if !owners
                .entry(owner.to_string())
                .or_default()
                .insert(field.to_string())
            {
                return Err(compile_error(format!(
                    "duplicate `flight-compiler: entity-clone-fields` designation `{designation}`"
                )));
            }
        }
    }
    return Ok(owners);
}

pub(crate) fn parse_entity_names(source: &str) -> Result<HashSet<String>, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    let mut entities = HashSet::new();
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
    return Ok(entities);
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

pub(crate) fn parse_external_nullable_options(
    source: &str,
) -> Result<ExternalNullableOptionProgram, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    let nullable_options = parse_flag_directive(&file.attrs, "nullable-options")?;
    let nullable_option_items = parse_nullable_option_items(&file.attrs)?;
    let functions = file
        .items
        .iter()
        .filter_map(|item| match item {
            Item::Fn(function) => Some(function.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();
    let structs = file
        .items
        .iter()
        .filter_map(|item| match item {
            Item::Struct(structure) => Some(structure.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();
    validate_nullable_option_items(&nullable_option_items, &functions, &structs)?;
    return Ok(ExternalNullableOptionProgram {
        functions,
        nullable_option_items,
        nullable_options,
        structs,
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

// flight-lint: allow(hashmap-iteration) directive names are a Vec in source order
fn parse_nullable_option_items(attributes: &[Attribute]) -> Result<BTreeSet<String>, CompileError> {
    let mut items = BTreeSet::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("nullable-option") {
            continue;
        }
        let names = fields.collect::<Vec<_>>();
        if names.is_empty() {
            return Err(compile_error(
                "`flight-compiler: nullable-option` requires at least one `function` or `Struct.field`",
            ));
        }
        for name in names {
            let valid = name.split('.').count() <= 2
                && name.split('.').all(|part| {
                    syn::parse_str::<syn::Ident>(part).is_ok() && !part.starts_with("r#")
                });
            if !valid {
                return Err(compile_error(format!(
                    "`flight-compiler: nullable-option` item `{name}` is not `function` or `Struct.field`"
                )));
            }
            if !items.insert(name.to_string()) {
                return Err(compile_error(format!(
                    "duplicate `flight-compiler: nullable-option` item `{name}`"
                )));
            }
        }
    }
    return Ok(items);
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

fn parse_default_objects(attributes: &[Attribute]) -> Result<BTreeSet<String>, CompileError> {
    let mut names = BTreeSet::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let mut fields = directive.split_whitespace();
        if fields.next() != Some("default-object") {
            continue;
        }
        let Some(name) = fields.next() else {
            return Err(compile_error(
                "`flight-compiler: default-object` requires one struct name",
            ));
        };
        if fields.next().is_some() {
            return Err(compile_error(format!(
                "`flight-compiler: default-object {name}` accepts exactly one struct name"
            )));
        }
        if syn::parse_str::<syn::Ident>(name).is_err() || name.starts_with("r#") {
            return Err(compile_error(format!(
                "`flight-compiler: default-object` struct name `{name}` is not a valid identifier"
            )));
        }
        if !names.insert(name.to_string()) {
            return Err(compile_error(format!(
                "duplicate `flight-compiler: default-object` directive for struct `{name}`"
            )));
        }
    }
    return Ok(names);
}

fn validate_default_objects(
    default_objects: &BTreeSet<String>,
    structs: &[ItemStruct],
) -> Result<(), CompileError> {
    for name in default_objects {
        let Some(structure) = structs.iter().find(|structure| structure.ident == name) else {
            return Err(compile_error(format!(
                "`flight-compiler: default-object` struct `{name}` does not exist"
            )));
        };
        if !is_public(&structure.vis) {
            return Err(compile_error(format!(
                "`flight-compiler: default-object` struct `{name}` must be public"
            )));
        }
        if !structure.generics.params.is_empty() {
            return Err(compile_error(format!(
                "`flight-compiler: default-object` struct `{name}` cannot be generic"
            )));
        }
        let Fields::Named(fields) = &structure.fields else {
            return Err(compile_error(format!(
                "`flight-compiler: default-object` struct `{name}` must have named fields"
            )));
        };
        if fields.named.iter().any(|field| !is_public(&field.vis)) {
            return Err(compile_error(format!(
                "`flight-compiler: default-object` struct `{name}` must expose every field"
            )));
        }
    }
    return Ok(());
}

pub(crate) fn parse_program(source: &str) -> Result<Program, CompileError> {
    return parse_program_with_options(source, false);
}

pub(crate) fn parse_program_lenient(source: &str) -> Result<Program, CompileError> {
    return parse_program_with_options(source, true);
}

fn parse_program_with_options(source: &str, lenient: bool) -> Result<Program, CompileError> {
    let source_mode = source_mode(source)?;
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    let facts = collect_source_facts(&file);
    let callable_field_parameters = parse_callable_field_parameters(&file.attrs)?;
    let callable_parameters = parse_callable_parameters(&file.attrs)?;
    let data_union_metadata = parse_data_unions(&file.attrs)?;
    let mut data_unions = data_union_metadata.names;
    let default_objects = parse_default_objects(&file.attrs)?;
    let reserved_key_data_unions = data_union_metadata.reserved_key;
    let record_map_variants = parse_record_map_variants(&file.attrs, &data_unions)?;
    let entity_clone_shared_fields = parse_entity_clone_shared_fields(&file.attrs)?;
    let entity_construction_functions = directive_names(source, "entity-construction");
    let entity_runtime_states = parse_entity_runtime_states(&file.attrs)?;
    let export_names = parse_export_names(&file.attrs)?;
    let frozen_objects = parse_frozen_objects(&file.attrs)?;
    let const_groups = parse_const_groups(&file.attrs)?;
    let identity_alias_directives = parse_identity_aliases(&file.attrs)?;
    let nullable_options = parse_flag_directive(&file.attrs, "nullable-options")?;
    let array_like_parameters = parse_array_like_parameters(&file.attrs)?;
    let nullable_option_items = parse_nullable_option_items(&file.attrs)?;
    let numeric_union_names = parse_numeric_unions(&file.attrs)?;
    let mut constants = Vec::new();
    let mut entities = HashSet::new();
    let mut enums = Vec::new();
    let mut functions = Vec::new();
    let mut method_delegations = Vec::new();
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

    let mut auto_data_unions = HashSet::new();
    let mut rust_only_functions = BTreeSet::new();
    for item in file.items {
        validate_rust_only_item(&item)?;
        match item {
            Item::Fn(function) if has_rust_only_directive(&function.attrs) => {
                rust_only_functions.insert(function.sig.ident.to_string());
            }
            Item::Const(item) => constants.push(item),
            Item::Enum(item) => {
                let name = item.ident.to_string();
                let has_named_variants = item
                    .variants
                    .iter()
                    .any(|v| matches!(v.fields, Fields::Named(_)));
                let all_named_or_unit = item
                    .variants
                    .iter()
                    .all(|v| matches!(v.fields, Fields::Named(_) | Fields::Unit));
                let has_non_unit = item
                    .variants
                    .iter()
                    .any(|v| !matches!(v.fields, Fields::Unit));
                let unit_count = item
                    .variants
                    .iter()
                    .filter(|v| matches!(v.fields, Fields::Unit))
                    .count();
                let auto_promotable = has_non_unit
                    && !data_unions.contains(&name)
                    && !string_unions.contains_key(&name)
                    && !numeric_union_names.contains(&name)
                    && (has_named_variants || unit_count <= 1);
                if auto_promotable {
                    auto_data_unions.insert(name.clone());
                    data_unions.insert(name.clone());
                }
                let is_data_union =
                    data_unions.contains(&name) || (has_named_variants && all_named_or_unit);
                if !lenient {
                    validate_enum(&item, is_data_union)?;
                }
                enums.push(item);
            }
            Item::Fn(function) => functions.push(function),
            Item::Static(item) => statics.push(item),
            Item::Struct(structure) => {
                if !lenient {
                    validate_fields(
                        &structure,
                        entity_runtime_states
                            .get(&structure.ident.to_string())
                            .map(String::as_str),
                    )?;
                }
                structs.push(structure);
            }
            Item::Type(item) => type_aliases.push(item),
            Item::Use(item) => uses.push(item),
            Item::Union(item) if !lenient && is_public(&item.vis) => {
                return Err(unsupported_public("union", &item.ident.to_string()));
            }
            Item::ExternCrate(item) => extern_crates.push(item),
            Item::Impl(item) => method_delegations.extend(impl_method_delegations(&item)),
            Item::ForeignMod(_) | Item::Macro(_) | Item::Mod(_) | Item::Trait(_) => {}
            _ => {}
        }
    }
    // auto_data_unions already populated during enum collection above.
    validate_rust_only_references(&rust_only_functions, &functions)?;

    validate_callable_parameters(&callable_parameters, &type_aliases)?;
    validate_callable_field_parameters(&callable_field_parameters, &structs)?;
    validate_data_union_directives(
        &data_unions,
        &reserved_key_data_unions,
        &enums,
        &string_unions,
    )?;
    validate_default_objects(&default_objects, &structs)?;
    validate_entity_runtime_states(&entity_runtime_states, &structs)?;
    validate_entity_clone_shared_fields(&entity_clone_shared_fields, &entities, &structs)?;
    validate_array_like_parameters(&array_like_parameters, &functions)?;
    validate_nullable_option_items(&nullable_option_items, &functions, &structs)?;
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
    if !lenient {
        let use_refs = uses.iter().collect::<Vec<_>>();
        validate_lazy_lock_statics(
            &statics,
            &functions,
            &constants,
            &structs,
            &type_aliases,
            &use_refs,
        )?;
    }
    validate_identity_aliases(&identity_alias_directives, &type_aliases)?;
    for name in &entity_construction_functions {
        let Some(function) = functions
            .iter()
            .find(|function| function.sig.ident == name.as_str())
        else {
            return Err(compile_error(format!(
                "`flight-compiler: entity-construction` function `{name}` does not exist"
            )));
        };
        if !name.starts_with("initialize_")
            || !matches!(
                function.sig.inputs.first(),
                Some(syn::FnArg::Typed(parameter))
                    if matches!(parameter.ty.as_ref(), Type::Reference(reference) if reference.mutability.is_some())
            )
        {
            return Err(compile_error(format!(
                "`flight-compiler: entity-construction` function `{name}` must be an `initialize_*` function with a leading mutable-reference parameter"
            )));
        }
    }

    return Ok(Program {
        callable_field_parameters,
        callable_parameters,
        constants,
        const_groups,
        auto_data_unions,
        data_unions,
        default_objects,
        entities,
        entity_construction_functions,
        entity_clone_shared_fields,
        entity_runtime_states,
        enums,
        export_names,
        extern_crates,
        facts,
        frozen_objects,
        functions,
        method_delegations,
        no_std,
        nullable_option_items,
        nullable_options,
        array_like_parameters,
        numeric_unions,
        statics,
        structs,
        readonly_structs,
        record_map_variants,
        source_mode,
        reserved_key_data_unions,
        string_unions,
        string_union_values,
        type_aliases,
        type_names,
        uses,
    });
}

pub(crate) fn parse_public_record_structs(source: &str) -> Result<Vec<ItemStruct>, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    return Ok(file
        .items
        .into_iter()
        .filter_map(|item| match item {
            Item::Struct(structure) if is_public(&structure.vis) => Some(structure),
            _ => None,
        })
        .collect());
}

// `root-only` is consumed by package generation rather than TypeScript emission, but every source
// passes through `source-mode` before the generator derives its package surface. Validate it here so
// a typo cannot silently bypass the exact-root branch and fall back to inferred Rust exports.
fn parse_root_only_directives(attributes: &[Attribute]) -> Result<Vec<String>, CompileError> {
    let mut names = Vec::new();
    let mut seen = HashSet::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let Some(targets) = directive.strip_prefix("root-only") else {
            continue;
        };
        if targets
            .chars()
            .next()
            .is_some_and(|character| !character.is_whitespace())
        {
            continue;
        }
        let targets = targets.trim();
        if targets.is_empty() {
            return Err(compile_error(
                "`flight-compiler: root-only` requires at least one TypeScript export name",
            ));
        }
        for group in targets.split(',') {
            let group = group.trim();
            if group.is_empty() {
                return Err(compile_error(
                    "`flight-compiler: root-only` contains an empty export target",
                ));
            }
            for target in group.split_whitespace() {
                if !is_typescript_identifier(target) {
                    return Err(compile_error(format!(
                        "`flight-compiler: root-only` target `{target}` is not a TypeScript identifier"
                    )));
                }
                if seen.insert(target.to_string()) {
                    names.push(target.to_string());
                }
            }
        }
    }
    return Ok(names);
}

pub(crate) fn parse_root_only_metadata(source: &str) -> Result<Vec<String>, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    return parse_root_only_directives(&file.attrs);
}

pub(crate) fn parse_string_union_metadata(
    source: &str,
) -> Result<StringUnionMetadata, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    return parse_string_union_metadata_from_attributes(&file.attrs);
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
                    "rust-variant" => StringUnionStyle::RustVariant,
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

pub(crate) fn parse_test_program(source: &str) -> Result<TestProgram, CompileError> {
    let mut file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust test source: {error}")))?;
    let test_cfg = parse_test_cfg_directives(&file.attrs)?;
    let mut test_cfg_rewriter = TestCfgRewriter {
        error: None,
        replacements: &test_cfg,
    };
    test_cfg_rewriter.visit_file_mut(&mut file);
    if let Some(error) = test_cfg_rewriter.error {
        return Err(error);
    }
    lower_test_local_collectors(&mut file)?;
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

// Portable tests may use one deliberately narrow `thread_local!` shape as a synchronous collector:
// an empty `RefCell<Vec<T>>`, accessed only by statement-position `.with(|binding| ...)` calls. A
// Vitest module runs those calls synchronously in source order, so the collector is the same module-
// local array and each `.with` is an immediate closure call. No other thread-local behavior is
// modeled here.
fn lower_test_local_collectors(file: &mut syn::File) -> Result<(), CompileError> {
    let mut collectors = BTreeMap::new();
    for item in &mut file.items {
        let Item::Macro(item_macro) = item else {
            continue;
        };
        if !item_macro.mac.path.is_ident("thread_local") {
            continue;
        }
        let item_static = syn::parse2::<ItemStatic>(item_macro.mac.tokens.clone()).map_err(|_| {
            compile_error(
                "portable test `thread_local!` supports exactly one empty `RefCell<Vec<T>>` collector",
            )
        })?;
        let Some(vector_type) = empty_thread_local_vector_type(&item_static) else {
            return Err(compile_error(
                "portable test `thread_local!` supports exactly one empty `RefCell<Vec<T>>` collector",
            ));
        };
        let name = item_static.ident.to_string();
        if collectors
            .insert(name.clone(), vector_type.clone())
            .is_some()
        {
            return Err(compile_error(format!(
                "duplicate portable test thread-local collector `{name}`"
            )));
        }
        let identifier = &item_static.ident;
        let constant: ItemConst = syn::parse_quote! {
            const #identifier: #vector_type = Vec::new();
        };
        *item = Item::Const(constant);
    }
    if collectors.is_empty() {
        return Ok(());
    }
    let mut rewriter = TestLocalCollectorRewriter {
        collectors: &collectors,
        error: None,
    };
    rewriter.visit_file_mut(file);
    if let Some(error) = rewriter.error {
        return Err(error);
    }
    return Ok(());
}

fn empty_thread_local_vector_type(item: &ItemStatic) -> Option<Type> {
    if !item.attrs.is_empty()
        || !matches!(item.vis, Visibility::Inherited)
        || !matches!(item.mutability, syn::StaticMutability::None)
    {
        return None;
    }
    let Type::Path(ref_cell) = item.ty.as_ref() else {
        return None;
    };
    let [ref_cell] = ref_cell.path.segments.iter().collect::<Vec<_>>()[..] else {
        return None;
    };
    if ref_cell.ident != "RefCell" {
        return None;
    }
    let PathArguments::AngleBracketed(arguments) = &ref_cell.arguments else {
        return None;
    };
    let [GenericArgument::Type(vector_type)] = arguments.args.iter().collect::<Vec<_>>()[..] else {
        return None;
    };
    let Type::Path(vector) = vector_type else {
        return None;
    };
    let [vector] = vector.path.segments.iter().collect::<Vec<_>>()[..] else {
        return None;
    };
    if vector.ident != "Vec" || !matches!(vector.arguments, PathArguments::AngleBracketed(_)) {
        return None;
    }
    let Expr::Call(initializer) = item.expr.as_ref() else {
        return None;
    };
    if !expression_is_associated_call(&initializer.func, "RefCell", "new")
        || initializer.args.len() != 1
    {
        return None;
    }
    let Expr::Call(vector_initializer) = &initializer.args[0] else {
        return None;
    };
    if !expression_is_associated_call(&vector_initializer.func, "Vec", "new")
        || !vector_initializer.args.is_empty()
    {
        return None;
    }
    return Some(vector_type.clone());
}

fn expression_is_associated_call(expression: &Expr, owner: &str, member: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    let [actual_owner, actual_member] = path.path.segments.iter().collect::<Vec<_>>()[..] else {
        return false;
    };
    return path.qself.is_none()
        && actual_owner.ident == owner
        && actual_member.ident == member
        && matches!(actual_owner.arguments, PathArguments::None)
        && matches!(actual_member.arguments, PathArguments::None);
}

struct TestLocalCollectorRewriter<'a> {
    collectors: &'a BTreeMap<String, Type>,
    error: Option<CompileError>,
}

impl VisitMut for TestLocalCollectorRewriter<'_> {
    fn visit_stmt_mut(&mut self, statement: &mut syn::Stmt) {
        if self.error.is_some() {
            return;
        }
        if let syn::Stmt::Expr(expression, Some(_)) = statement
            && let Expr::MethodCall(call) = expression
            && let Some((name, vector_type)) = test_local_collector(&call.receiver, self.collectors)
        {
            if call.method != "with" || call.args.len() != 1 {
                self.error = Some(test_local_collector_use_error(&name));
                return;
            }
            let Some(Expr::Closure(closure)) = call.args.first_mut() else {
                self.error = Some(test_local_collector_use_error(&name));
                return;
            };
            let [syn::Pat::Ident(binding)] = closure.inputs.iter().collect::<Vec<_>>()[..] else {
                self.error = Some(test_local_collector_use_error(&name));
                return;
            };
            if closure.asyncness.is_some() || binding.by_ref.is_some() || binding.subpat.is_some() {
                self.error = Some(test_local_collector_use_error(&name));
                return;
            }
            let identifier = binding.ident.clone();
            self.visit_expr_mut(&mut closure.body);
            if self.error.is_some() {
                return;
            }
            let mut borrow_rewriter = TestLocalCollectorBorrowRewriter {
                binding: &identifier.to_string(),
                error: false,
            };
            borrow_rewriter.visit_expr_mut(&mut closure.body);
            if borrow_rewriter.error {
                self.error = Some(compile_error(format!(
                    "portable test thread-local collector binding `{identifier}` may only be used through zero-argument `.borrow()` or `.borrow_mut()`"
                )));
                return;
            }
            let body = closure.body.as_ref().clone();
            let receiver = call.receiver.as_ref().clone();
            *expression = syn::parse_quote! {{
                let #identifier: #vector_type = #receiver;
                #body;
            }};
            return;
        }
        visit_mut::visit_stmt_mut(self, statement);
    }

    fn visit_expr_path_mut(&mut self, path: &mut syn::ExprPath) {
        if self.error.is_some() {
            return;
        }
        if let Some((name, _)) = test_local_collector(&Expr::Path(path.clone()), self.collectors) {
            self.error = Some(test_local_collector_use_error(&name));
            return;
        }
        visit_mut::visit_expr_path_mut(self, path);
    }
}

struct TestLocalCollectorBorrowRewriter<'a> {
    binding: &'a str,
    error: bool,
}

impl VisitMut for TestLocalCollectorBorrowRewriter<'_> {
    fn visit_expr_mut(&mut self, expression: &mut Expr) {
        if self.error {
            return;
        }
        if let Expr::MethodCall(call) = expression
            && matches!(call.method.to_string().as_str(), "borrow" | "borrow_mut")
            && call.args.is_empty()
            && expression_is_name(&call.receiver, self.binding)
        {
            *expression = call.receiver.as_ref().clone();
            return;
        }
        visit_mut::visit_expr_mut(self, expression);
    }

    fn visit_expr_path_mut(&mut self, path: &mut syn::ExprPath) {
        if path.qself.is_none()
            && path.path.segments.len() == 1
            && path.path.segments[0].ident == self.binding
        {
            self.error = true;
            return;
        }
        visit_mut::visit_expr_path_mut(self, path);
    }
}

fn expression_is_name(expression: &Expr, expected: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path.qself.is_none()
        && path.path.segments.len() == 1
        && path.path.segments[0].ident == expected;
}

fn test_local_collector<'a>(
    expression: &Expr,
    collectors: &'a BTreeMap<String, Type>,
) -> Option<(String, &'a Type)> {
    let Expr::Path(path) = expression else {
        return None;
    };
    if path.qself.is_some() || path.path.segments.len() != 1 {
        return None;
    }
    let name = path.path.segments.first()?.ident.to_string();
    return collectors.get(&name).map(|rust_type| (name, rust_type));
}

fn test_local_collector_use_error(name: &str) -> CompileError {
    return compile_error(format!(
        "portable test thread-local collector `{name}` may only be used by a statement-position `.with(|binding| ...)` call"
    ));
}

// A portable test may compare a target-selected Rust value with the JavaScript environment only
// when the source explicitly maps the exact `cfg!` predicate to the established test-support lane:
// `//! flight-compiler: test-cfg cfg(target_endian = "little") => crate::is_little_endian()`.
// The replacement is deliberately restricted to a zero-argument `crate::` call. Vitest generation
// maps that root to `rustTestSupport`; no compiler-host target facts enter the output.
fn parse_test_cfg_directives(
    attributes: &[Attribute],
) -> Result<BTreeMap<String, Expr>, CompileError> {
    let mut replacements = BTreeMap::new();
    for attribute in attributes {
        let Some(directive) = doc_directive(attribute) else {
            continue;
        };
        let Some(mapping) = directive.strip_prefix("test-cfg") else {
            continue;
        };
        if !mapping.is_empty() && !mapping.starts_with(char::is_whitespace) {
            continue;
        }
        let Some((predicate, replacement)) = mapping.trim().split_once("=>") else {
            return Err(compile_error(
                "`flight-compiler: test-cfg` requires `cfg(predicate) => crate::support_function()`",
            ));
        };
        let predicate = parse_test_cfg_predicate(predicate.trim())?;
        let replacement = syn::parse_str::<Expr>(replacement.trim()).map_err(|error| {
            return compile_error(format!(
                "`flight-compiler: test-cfg` has an invalid support expression: {error}"
            ));
        })?;
        validate_test_cfg_replacement(&replacement)?;
        if replacements
            .insert(predicate.clone(), replacement)
            .is_some()
        {
            return Err(compile_error(format!(
                "duplicate `flight-compiler: test-cfg` directive for `cfg!({predicate})`"
            )));
        }
    }
    return Ok(replacements);
}

fn parse_test_cfg_predicate(source: &str) -> Result<String, CompileError> {
    let Some(arguments) = source.strip_prefix("cfg") else {
        return Err(compile_error(format!(
            "`flight-compiler: test-cfg` predicate `{source}` must use `cfg(predicate)`"
        )));
    };
    let expression =
        syn::parse_str::<Expr>(&format!("cfg!{}", arguments.trim_start())).map_err(|error| {
            compile_error(format!("invalid `test-cfg` predicate `{source}`: {error}"))
        })?;
    let Expr::Macro(expression) = expression else {
        return Err(compile_error(format!(
            "`flight-compiler: test-cfg` predicate `{source}` must use `cfg(predicate)`"
        )));
    };
    if !expression.mac.path.is_ident("cfg") {
        return Err(compile_error(format!(
            "`flight-compiler: test-cfg` predicate `{source}` must use `cfg(predicate)`"
        )));
    }
    return canonical_test_cfg_predicate(&expression.mac);
}

fn canonical_test_cfg_predicate(rust_macro: &syn::Macro) -> Result<String, CompileError> {
    return canonical_test_cfg_tokens(rust_macro.tokens.clone());
}

fn canonical_test_cfg_tokens(tokens: proc_macro2::TokenStream) -> Result<String, CompileError> {
    syn::parse2::<syn::Meta>(tokens.clone()).map_err(|error| {
        return compile_error(format!("invalid portable `cfg!` predicate: {error}"));
    })?;
    return Ok(tokens.to_string());
}

fn validate_test_cfg_replacement(replacement: &Expr) -> Result<(), CompileError> {
    let Expr::Call(call) = replacement else {
        return Err(compile_error(
            "`flight-compiler: test-cfg` support expression must be a zero-argument `crate::support_function()` call",
        ));
    };
    let Expr::Path(function) = call.func.as_ref() else {
        return Err(compile_error(
            "`flight-compiler: test-cfg` support expression must be a zero-argument `crate::support_function()` call",
        ));
    };
    let is_crate_support_call = call.args.is_empty()
        && function.qself.is_none()
        && function.path.leading_colon.is_none()
        && function.path.segments.len() >= 2
        && function
            .path
            .segments
            .first()
            .is_some_and(|segment| segment.ident == "crate")
        && function
            .path
            .segments
            .iter()
            .all(|segment| matches!(segment.arguments, PathArguments::None));
    if !is_crate_support_call {
        return Err(compile_error(
            "`flight-compiler: test-cfg` support expression must be a zero-argument `crate::support_function()` call",
        ));
    }
    return Ok(());
}

fn rewrite_nested_test_cfg_tokens(
    tokens: proc_macro2::TokenStream,
    replacements: &BTreeMap<String, Expr>,
) -> Result<proc_macro2::TokenStream, CompileError> {
    use proc_macro2::{Delimiter, Group, TokenTree};
    use quote::ToTokens;

    let tokens = tokens.into_iter().collect::<Vec<_>>();
    let mut rewritten = proc_macro2::TokenStream::new();
    let mut index = 0;
    while index < tokens.len() {
        let predicate_group = match tokens.get(index..index + 3) {
            Some(
                [
                    TokenTree::Ident(name),
                    TokenTree::Punct(bang),
                    TokenTree::Group(group),
                ],
            ) if name == "cfg"
                && bang.as_char() == '!'
                && group.delimiter() == Delimiter::Parenthesis =>
            {
                Some(group)
            }
            _ => None,
        };
        if let Some(group) = predicate_group {
            let predicate = canonical_test_cfg_tokens(group.stream())?;
            let Some(replacement) = replacements.get(&predicate) else {
                return Err(missing_test_cfg_mapping(&predicate));
            };
            replacement.to_tokens(&mut rewritten);
            index += 3;
            continue;
        }
        let token = tokens[index].clone();
        if let TokenTree::Group(group) = token {
            let mut nested = Group::new(
                group.delimiter(),
                rewrite_nested_test_cfg_tokens(group.stream(), replacements)?,
            );
            nested.set_span(group.span());
            rewritten.extend([TokenTree::Group(nested)]);
        } else {
            rewritten.extend([token]);
        }
        index += 1;
    }
    return Ok(rewritten);
}

fn missing_test_cfg_mapping(predicate: &str) -> CompileError {
    return compile_error(format!(
        "portable `cfg!({predicate})` has no explicit `flight-compiler: test-cfg cfg({predicate}) => crate::support_function()` mapping"
    ));
}

struct TestCfgRewriter<'a> {
    error: Option<CompileError>,
    replacements: &'a BTreeMap<String, Expr>,
}

impl VisitMut for TestCfgRewriter<'_> {
    fn visit_expr_mut(&mut self, expression: &mut Expr) {
        if self.error.is_some() {
            return;
        }
        let Expr::Macro(macro_expression) = expression else {
            visit_mut::visit_expr_mut(self, expression);
            return;
        };
        if !macro_expression.mac.path.is_ident("cfg") {
            match rewrite_nested_test_cfg_tokens(
                macro_expression.mac.tokens.clone(),
                self.replacements,
            ) {
                Ok(tokens) => macro_expression.mac.tokens = tokens,
                Err(error) => self.error = Some(error),
            }
            return;
        }
        let predicate = match canonical_test_cfg_predicate(&macro_expression.mac) {
            Ok(predicate) => predicate,
            Err(error) => {
                self.error = Some(error);
                return;
            }
        };
        let Some(replacement) = self.replacements.get(&predicate) else {
            self.error = Some(missing_test_cfg_mapping(&predicate));
            return;
        };
        *expression = replacement.clone();
    }

    fn visit_macro_mut(&mut self, rust_macro: &mut syn::Macro) {
        if self.error.is_some() || rust_macro.path.is_ident("cfg") {
            return;
        }
        match rewrite_nested_test_cfg_tokens(rust_macro.tokens.clone(), self.replacements) {
            Ok(tokens) => rust_macro.tokens = tokens,
            Err(error) => self.error = Some(error),
        }
    }
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

// A source the crate compiles but this compiler does not emit (a target-native module, the crate
// root): parsed only for what the eager-initialization proof must see across the whole crate, its
// implicit-dispatch facts and the declarations that resolve names in it. It is never validated as
// portable Rust, and none of its items are walked or emitted.
pub(crate) fn parse_visibility_program(source: &str) -> Result<Program, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    let mut program = parse_program("")?;
    program.facts = collect_source_facts(&file);
    // Dependency data unions are lowered at their use sites in this crate, so their designations
    // (and record-map payload representations) travel with the visibility source.
    let data_union_metadata = parse_data_unions(&file.attrs)?;
    program.record_map_variants =
        parse_record_map_variants(&file.attrs, &data_union_metadata.names)?;
    program.data_unions = data_union_metadata.names;
    program.reserved_key_data_unions = data_union_metadata.reserved_key;
    let string_union_metadata = parse_string_union_metadata_from_attributes(&file.attrs)?;
    program.string_unions = string_union_metadata.styles;
    program.string_union_values = string_union_metadata.values;
    program.numeric_unions = parse_numeric_unions(&file.attrs)?
        .into_iter()
        .map(|name| (name, Vec::new()))
        .collect();
    program.no_std = file
        .attrs
        .iter()
        .any(|attribute| attribute.path().is_ident("no_std"));
    for item in &file.items {
        match item {
            Item::Enum(item) => {
                program.type_names.insert(item.ident.to_string());
                program.enums.push(item.clone());
            }
            Item::ExternCrate(item) => program.extern_crates.push(item.clone()),
            Item::Macro(item_macro) => {
                if item_macro
                    .mac
                    .path
                    .segments
                    .last()
                    .is_some_and(|segment| segment.ident == "impl_entity")
                    && let Ok(entity_type) = syn::parse2::<Type>(item_macro.mac.tokens.clone())
                    && let Some(name) = type_name(&entity_type)
                {
                    program.entities.insert(name);
                }
            }
            Item::Mod(item) => {
                program.type_names.insert(item.ident.to_string());
            }
            Item::Struct(item) => {
                program.type_names.insert(item.ident.to_string());
                if has_entity_runtime(item) {
                    program.entities.insert(item.ident.to_string());
                }
                program.structs.push(item.clone());
            }
            Item::Trait(item) => {
                program.type_names.insert(item.ident.to_string());
            }
            Item::TraitAlias(item) => {
                program.type_names.insert(item.ident.to_string());
            }
            Item::Type(item) => {
                program.type_names.insert(item.ident.to_string());
                program.type_aliases.push(item.clone());
            }
            Item::Union(item) => {
                program.type_names.insert(item.ident.to_string());
            }
            Item::Use(item) => program.uses.push(item.clone()),
            _ => {}
        }
    }
    validate_string_union_directives(
        &program.string_unions,
        &program.string_union_values,
        &program.enums,
    )?;
    return Ok(program);
}

pub(crate) fn source_mode(source: &str) -> Result<SourceMode, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
    parse_root_only_directives(&file.attrs)?;
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
            | "const-member"
            | "contract"
            | "data-union"
            | "default-object"
            | "entity-construction"
            | "entity-clone-fields"
            | "entity-runtime-state"
            | "export-name"
            | "frozen-object"
            | "identity-alias"
            | "array-like"
            | "nullable-option"
            | "nullable-options"
            | "numeric-union"
            | "readonly-fields"
            | "record-map"
            | "root"
            | "root-only"
            | "string-union"
            | "string-union-value"
            | "test-cfg" => {}
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

// An item-level `flight-compiler: rust-only` omits a private production free function from the
// TypeScript output: Rust-only plumbing, such as the field access behind a generic `impl Entity`, that
// has no TypeScript counterpart. Anything else carrying the directive is rejected rather than silently
// dropped, because a public or crate-visible item, or a type, constant, or impl, is part of the
// TypeScript surface.
fn validate_rust_only_item(item: &Item) -> Result<(), CompileError> {
    let rejected = |kind: &str, name: String| {
        return Err(compile_error(format!(
            "item-level `flight-compiler: rust-only` is supported only on private free functions and tests, not on {kind} `{name}`"
        )));
    };
    match item {
        Item::Fn(function) if has_rust_only_directive(&function.attrs) => {
            if !matches!(function.vis, syn::Visibility::Inherited) {
                return Err(compile_error(format!(
                    "item-level `flight-compiler: rust-only` requires a private function, but `{}` is visible outside its module; a visible function is part of the TypeScript surface",
                    function.sig.ident
                )));
            }
        }
        Item::Const(item) if has_rust_only_directive(&item.attrs) => {
            return rejected("const", item.ident.to_string());
        }
        Item::Enum(item) if has_rust_only_directive(&item.attrs) => {
            return rejected("enum", item.ident.to_string());
        }
        Item::Static(item) if has_rust_only_directive(&item.attrs) => {
            return rejected("static", item.ident.to_string());
        }
        Item::Struct(item) if has_rust_only_directive(&item.attrs) => {
            return rejected("struct", item.ident.to_string());
        }
        Item::Type(item) if has_rust_only_directive(&item.attrs) => {
            return rejected("type alias", item.ident.to_string());
        }
        Item::Impl(item) => {
            let name = quote::ToTokens::to_token_stream(&item.self_ty).to_string();
            if has_rust_only_directive(&item.attrs) {
                return rejected("impl", name);
            }
            for impl_item in &item.items {
                if let syn::ImplItem::Fn(method) = impl_item
                    && has_rust_only_directive(&method.attrs)
                {
                    return rejected("impl method", format!("{name}::{}", method.sig.ident));
                }
            }
        }
        _ => {}
    }
    return Ok(());
}

// An omitted function must not be reachable from emitted code, or the TypeScript output would call a
// function it never declares.
fn validate_rust_only_references(
    rust_only_functions: &BTreeSet<String>,
    functions: &[ItemFn],
) -> Result<(), CompileError> {
    struct References<'a> {
        found: Option<String>,
        names: &'a BTreeSet<String>,
    }
    impl<'ast> syn::visit::Visit<'ast> for References<'_> {
        fn visit_path(&mut self, path: &'ast syn::Path) {
            if self.found.is_none()
                && let Some(segment) = path.segments.last()
                && self.names.contains(&segment.ident.to_string())
            {
                self.found = Some(segment.ident.to_string());
            }
            syn::visit::visit_path(self, path);
        }
    }
    if rust_only_functions.is_empty() {
        return Ok(());
    }
    for function in functions {
        let mut references = References {
            found: None,
            names: rust_only_functions,
        };
        syn::visit::Visit::visit_item_fn(&mut references, function);
        if let Some(name) = references.found {
            return Err(compile_error(format!(
                "`{}` calls `{name}`, which is `flight-compiler: rust-only` and has no TypeScript output",
                function.sig.ident
            )));
        }
    }
    return Ok(());
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

// `//! flight-compiler: const-group <TypeScriptName> <PREFIX>`: the public constants named `<PREFIX>*`
// become one exported TypeScript const object.
// A `const-group` owner becomes an exported TypeScript value, so it may share its name only with a
// type (an alias or interface), never with another emitted value: an enum, a function, a constant, a
// static, or an `export-name` / `frozen-object` target.
// flight-lint: allow(hashmap-iteration) items are Vecs in Rust source order and directives are BTreeMaps
fn validate_const_group_owners(
    groups: &BTreeMap<String, ConstGroup>,
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

fn validate_data_union_directives(
    data_unions: &HashSet<String>,
    reserved_key_data_unions: &HashSet<String>,
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
        let Some(rust_enum) = enums.iter().find(|rust_enum| rust_enum.ident == name) else {
            return Err(compile_error(format!(
                "`flight-compiler: data-union` enum `{name}` does not exist"
            )));
        };
        if reserved_key_data_unions.contains(name) {
            if rust_enum.variants.len() != 2 {
                return Err(compile_error(format!(
                    "reserved-key data union `{name}` requires exactly two payload variants"
                )));
            }
            if rust_enum.variants.iter().any(|variant| {
                !matches!(&variant.fields, Fields::Unnamed(fields) if fields.unnamed.len() == 1)
            }) {
                return Err(compile_error(format!(
                    "reserved-key data union `{name}` requires exactly one unnamed payload field per variant"
                )));
            }
        }
    }
    return Ok(());
}

fn validate_entity_clone_shared_fields(
    designations: &BTreeMap<String, BTreeSet<String>>,
    entities: &HashSet<String>,
    structs: &[ItemStruct],
) -> Result<(), CompileError> {
    for (owner, field_names) in designations {
        if !entities.contains(owner) {
            return Err(compile_error(format!(
                "`flight-compiler: entity-clone-fields {owner}` requires `{owner}` to be an entity"
            )));
        }
        let Some(structure) = structs
            .iter()
            .find(|structure| structure.ident == owner.as_str())
        else {
            return Err(compile_error(format!(
                "`flight-compiler: entity-clone-fields {owner}` names no struct declared in this source"
            )));
        };
        for field_name in field_names {
            let Some(field) = structure.fields.iter().find(|field| {
                field
                    .ident
                    .as_ref()
                    .is_some_and(|ident| ident == field_name)
            }) else {
                return Err(compile_error(format!(
                    "`flight-compiler: entity-clone-fields {owner}.{field_name}` names no field of `{owner}`"
                )));
            };
            if !is_public(&field.vis) {
                return Err(compile_error(format!(
                    "`flight-compiler: entity-clone-fields {owner}.{field_name}` must designate a public field"
                )));
            }
        }
    }
    return Ok(());
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
        if type_name(&field.ty).as_deref() == Some("EntityRuntimeSlot") || is_public(&field.vis) {
            return Err(compile_error(format!(
                "`flight-compiler: entity-runtime-state {owner}.{field_name}` must designate a crate-private state field, not a public field or the runtime slot"
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

fn validate_fields(
    structure: &ItemStruct,
    _designated_state: Option<&str>,
) -> Result<(), CompileError> {
    let Fields::Named(_) = &structure.fields else {
        return Err(compile_error(format!(
            "unsupported struct `{}`: only named fields can be transpiled",
            structure.ident
        )));
    };
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
    uses: &[&ItemUse],
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
        let is_known_type = |ident: &str| {
            structs.iter().any(|structure| structure.ident == ident)
                || type_aliases
                    .iter()
                    .any(|type_alias| type_alias.ident == ident)
                || lazy_lock_use_imports(uses).iter().any(|name| name == ident)
        };
        let declared = lazy_lock_leaf_type_name(inner).is_some_and(|leaf| is_known_type(&leaf));
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

fn lazy_lock_leaf_type_name(ty: &Type) -> Option<String> {
    let Type::Path(path) = ty else {
        return None;
    };
    if path.qself.is_some() {
        return None;
    }
    let segment = path.path.segments.last()?;
    let ident = segment.ident.to_string();
    match &segment.arguments {
        PathArguments::None => Some(ident),
        PathArguments::AngleBracketed(args) => {
            let wrapper = matches!(
                ident.as_str(),
                "Arc" | "Box" | "Ref" | "RwLock" | "Mutex" | "Record" | "Vec"
            );
            if wrapper && args.args.len() == 1 {
                if let GenericArgument::Type(inner) = &args.args[0] {
                    return lazy_lock_leaf_type_name(inner);
                }
            }
            Some(ident)
        }
        PathArguments::Parenthesized(_) => None,
    }
}

fn lazy_lock_use_imports(uses: &[&ItemUse]) -> Vec<String> {
    let mut names = Vec::new();
    for item_use in uses {
        if let UseTree::Path(root) = &item_use.tree {
            if root.ident == "crate" {
                collect_crate_use_names(&root.tree, &mut names);
            }
        }
    }
    return names;
}

fn collect_crate_use_names(tree: &UseTree, out: &mut Vec<String>) {
    match tree {
        UseTree::Path(path) => collect_crate_use_names(&path.tree, out),
        UseTree::Name(name) => {
            let ident = name.ident.to_string();
            if ident.chars().next().is_some_and(|c| c.is_uppercase()) {
                out.push(ident);
            }
        }
        UseTree::Rename(rename) => {
            let ident = rename.rename.to_string();
            if ident.chars().next().is_some_and(|c| c.is_uppercase()) {
                out.push(ident);
            }
        }
        UseTree::Glob(_) => {}
        UseTree::Group(group) => {
            for tree in &group.items {
                collect_crate_use_names(tree, out);
            }
        }
    }
}

fn validate_nullable_option_items(
    items: &BTreeSet<String>,
    functions: &[ItemFn],
    structs: &[ItemStruct],
) -> Result<(), CompileError> {
    for item in items {
        let option_type = |rust_type: &Type| type_name(rust_type).as_deref() == Some("Option");
        let valid = match item.split_once('.') {
            Some((owner, field_name)) => structs
                .iter()
                .find(|structure| structure.ident == owner)
                .and_then(|structure| {
                    structure
                        .fields
                        .iter()
                        .find(|field| field.ident.as_ref().is_some_and(|ident| ident == field_name))
                })
                .is_some_and(|field| option_type(&field.ty)),
            None => functions
                .iter()
                .find(|function| function.sig.ident == item.as_str())
                .is_some_and(|function| {
                    matches!(&function.sig.output, syn::ReturnType::Type(_, rust_type) if option_type(rust_type))
                }),
        };
        if !valid {
            return Err(compile_error(format!(
                "`flight-compiler: nullable-option` item `{item}` must name a function returning `Option` or an `Option` field of a struct in this source"
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
