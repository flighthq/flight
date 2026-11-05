mod argument_parameter_analysis;
mod binary_emit;
mod binding_analysis;
mod binding_fact;
mod block_emit;
mod callable_type_analysis;
mod context_insert;
mod d15_emit;
mod data_union_analysis;
mod data_union_runtime;
mod default_object_emit;
mod entity_factory_emit;
mod enum_emit;
mod expression_analysis;
mod expression_emit;
mod expression_identity;
mod expression_predicate;
mod flight_error_emit;
mod formatting_helpers;
mod function_emit;
mod function_resolution;
mod generation_context;
mod hash_collection_emit;
mod hoisted_value_emit;
mod identity_emit;
mod iter_emit;
mod lexical_context;
mod lexical_helpers;
mod local_emit;
mod lock_cell;
mod macro_emit;
mod markers;
mod match_emit;
mod method_call;
mod naming;
mod numeric_analysis;
mod option_analysis;
mod option_emit_helpers;
mod parameter_emit;
mod pattern_helpers;
mod pinned_boxed_emit;
mod program_emit;
mod provenance_resolution;
mod resolve_emit;
mod rust_type_analysis;
mod safety;
mod scalar_type_helpers;
mod sequence_analysis;
mod sequence_ops;
mod sequence_type_analysis;
mod shared_identity_analysis;
mod statement_emit;
mod struct_emit;
mod type_classification;
mod type_emit;
mod type_resolution;
mod value_emit;
mod visibility_helpers;
mod vitest_helpers;

use argument_parameter_analysis::*;
pub(crate) use argument_parameter_analysis::{
    contract_typed_array_return_value, function_returns_uint8_array,
};
use binary_emit::*;
use binding_analysis::*;
use binding_fact::*;
pub(crate) use block_emit::emit_block_with_tail_returns;
use block_emit::*;
pub(crate) use callable_type_analysis::option_scrutinee_is_rereadable;
use callable_type_analysis::*;
use context_insert::*;
pub(crate) use context_insert::{
    insert_program_type_path_context, insert_std_float_consts_context,
    insert_std_mem_import_context, insert_type_path_context, insert_typed_array_constant_context,
};
use d15_emit::*;
use data_union_analysis::*;
use data_union_runtime::*;
use default_object_emit::*;
use entity_factory_emit::*;
use enum_emit::*;
pub(crate) use enum_emit::{is_data_union_variant, is_transparent_data_union_variant};
pub(crate) use expression_analysis::expression_is_path;
use expression_analysis::*;
use expression_emit::*;
pub(crate) use expression_emit::{emit_expression, emit_expression_for_type};
use expression_identity::*;
pub(crate) use expression_identity::{dependency_export_name_local_items, export_name};
pub(crate) use expression_predicate::option_absent_value;
use expression_predicate::*;
use flight_error_emit::*;
pub(crate) use flight_error_emit::{flight_error_result_aliases, flight_error_result_type};
pub(crate) use formatting_helpers::write_indent;
use formatting_helpers::*;
use function_emit::*;
pub(crate) use function_emit::{emit_local_function, lexical_binding_names};
pub(crate) use function_resolution::frozen_object_name;
use function_resolution::*;
use generation_context::*;
pub(crate) use generation_context::{
    function_expression_context, generation_context, insert_external_nullable_option_context,
    insert_nullable_options_context, insert_string_union_context,
    insert_visibility_type_alias_context, insert_vitest_visibility_function_context,
    insert_vitest_visibility_function_parameter_context, is_string_union, lexical_pattern_context,
};
use hash_collection_emit::*;
pub(crate) use hoisted_value_emit::emit_return_match_with_exits;
use hoisted_value_emit::*;
pub(crate) use identity_emit::external_shared_identity_facts;
use identity_emit::*;
use iter_emit::*;
pub(crate) use iter_emit::{emit_for_header, emit_iter_mut_loop_if_supported};
use lexical_context::*;
pub(crate) use lexical_helpers::local_pattern_binding_id;
use lexical_helpers::*;
use local_emit::*;
pub(crate) use local_emit::{emit_local, emit_local_with_shadow, emit_local_with_shadow_and_else};
use lock_cell::*;
use macro_emit::*;
pub(crate) use macro_emit::{emit_format_template, emit_panic_message};
use markers::*;
pub(crate) use markers::{
    ASYNC_FLIGHT_ERROR_FUNCTION_MARKER, ASYNC_FUNCTION_MARKER, ASYNC_RESULT_FUNCTION_MARKER,
    BLOCK_ON_HELPER_MARKER, D15_FUTURE_FIELD_MARKER, FLIGHT_ERROR_HELPER_MARKER,
    MUTABLE_SCALAR_REFERENCE_ARGUMENT_MARKER, PANIC_MESSAGE_HELPER_MARKER,
    RETURNS_CONTRACT_TYPED_ARRAY_MARKER, VITEST_MUTABLE_SCALAR_CELL_LOCAL_BINDING_MARKER,
    VITEST_MUTABLE_SCALAR_CELL_PARAMETER_MARKER,
};
pub(crate) use match_emit::emit_match_statement;
use match_emit::*;
use method_call::*;
use naming::*;
pub(crate) use naming::{
    default_item_name, emit_pattern, lower_camel_from_upper_camel, snake_to_lower_camel,
    string_union_literal,
};
use numeric_analysis::*;
pub(crate) use option_analysis::emit_option_binding;
use option_analysis::*;
use option_emit_helpers::*;
pub(crate) use option_emit_helpers::{
    begin_option_if, begin_option_if_with_rebind, begin_option_while,
};
pub(crate) use parameter_emit::emit_parameter;
use parameter_emit::*;
use pattern_helpers::*;
use pinned_boxed_emit::*;
use program_emit::*;
pub(crate) use program_emit::{
    collect_cross_crate_use_tree, emit_program, is_lowered_cross_crate_type,
    is_lowered_cross_crate_value, test_cross_crate_imports, test_mixed_foreign_wildcard_roots,
};
use provenance_resolution::*;
pub(crate) use provenance_resolution::{ProvenanceImportRule, provenance_import_rules};
use resolve_emit::*;
use rust_type_analysis::*;
use scalar_type_helpers::*;
pub(crate) use scalar_type_helpers::{exact_mutable_scalar_reference, exact_portable_scalar_type};
use sequence_analysis::*;
pub(crate) use sequence_ops::emit_vec_extend_statement;
use sequence_ops::*;
use sequence_type_analysis::*;
use shared_identity_analysis::*;
use statement_emit::*;
use struct_emit::*;
use type_classification::*;
use type_emit::*;
pub(crate) use type_emit::{
    emit_type, emit_type_parameters, insert_type_parameter_context,
    insert_type_script_array_field_context, insert_type_script_array_parameter_context,
    insert_type_script_default_null_option_parameter_context,
    insert_type_script_nullable_option_field_context,
    insert_type_script_nullable_option_parameter_context,
    insert_type_script_nullable_option_return_context, insert_type_script_type_alias_context,
    insert_type_script_vitest_array_return_context, type_script_type_aliases,
};
pub(crate) use type_resolution::validate_dependency_export_name_bindings;
use type_resolution::*;
use value_emit::*;
pub(crate) use value_emit::{js_string_literal, numeric_literal_spelling};
use visibility_helpers::*;

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fmt::Write;

use quote::ToTokens;
use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::visit::Visit;
use syn::{
    Attribute, BinOp, Expr, FnArg, GenericArgument, Item, ItemFn, ItemStruct, ItemUse, Lit, Member,
    Pat, PathArguments, ReturnType, Stmt, Token, Type, UnOp, UseTree, Visibility,
};

use crate::model::{ExternalNullableOptionProgram, Program, StringUnionStyle, TestProgram};
use crate::{CompileError, compile_error};

use safety::{
    block_contains_function_exits, if_expression_contains_function_exits,
    reject_await_outside_async, reject_entity_runtime_state_store_collisions,
    reject_function_exits_in_value_position, reject_unresolved_pattern_field,
    reject_unsafe_lazy_lock_initializers, reject_unsupported_array_like_uses,
};
#[allow(unused_imports)]
pub(crate) use vitest_helpers::*;

#[cfg(test)]
mod tests {
    use super::*;
    use syn::parse::Parser;

    #[test]
    fn pattern_scopes_clear_and_rebind_value_provenance_without_mutating_the_outer_scope() {
        let outer_identity = "production|Sample";
        let mut context = HashSet::from([
            format!("{VITEST_STRUCT_LOCAL_MARKER}sample{PROVENANCE_SEPARATOR}{outer_identity}"),
            format!("{VITEST_STRUCT_OWNER_MARKER}Sample{PROVENANCE_SEPARATOR}{outer_identity}"),
        ]);
        for (scope, source) in [
            ("if let", "Some(sample)"),
            ("while let", "Some(sample)"),
            ("match", "Some(sample)"),
            ("nested", "((sample,), _)"),
        ] {
            let pattern = Pat::parse_single.parse_str(source).unwrap();
            let scoped = vitest_pattern_context(&context, &pattern);
            assert_eq!(vitest_struct_local(&scoped, "sample"), None, "{scope}");
            assert_eq!(
                vitest_struct_local(&context, "sample"),
                Some(outer_identity.to_string()),
                "{scope} mutated its outer scope"
            );
        }

        let statement: Stmt = syn::parse_str("let sample: Sample = value;").unwrap();
        let Stmt::Local(local) = statement else {
            unreachable!("the fixture is a let statement");
        };
        context.insert(format!(
            "{VITEST_STRUCT_LOCAL_MARKER}sample{PROVENANCE_SEPARATOR}stale|Sample"
        ));
        let scoped = vitest_pattern_context(&context, &local.pat);
        assert_eq!(
            vitest_struct_local(&scoped, "sample"),
            Some(outer_identity.to_string())
        );
    }
}

pub(crate) struct EmitProgramInput<'a> {
    pub program: &'a Program,
    pub entity_module: Option<&'a str>,
    pub alias_programs: &'a [Program],
    pub external_alias_programs: &'a [(BTreeMap<String, String>, &'a str)],
    pub external_nullable_programs: &'a [(&'a str, &'a ExternalNullableOptionProgram)],
    pub external_record_structs: &'a [ItemStruct],
    pub dependency_export_names: &'a [(BTreeMap<String, String>, &'a str)],
    pub external_string_unions: &'a BTreeSet<String>,
    pub inline_string_unions: &'a BTreeMap<String, Vec<String>>,
    pub internal_type_exports: &'a [&'a str],
    pub type_script_type_aliases: &'a [crate::TypeScriptTypeAlias<'a>],
    pub type_script_array_parameters: &'a [crate::TypeScriptArrayParameter<'a>],
    pub type_script_array_fields: &'a [crate::TypeScriptArrayField<'a>],
    pub type_script_array_returns: &'a [crate::TypeScriptArrayReturn<'a>],
    pub type_script_nullable_option_fields: &'a [crate::TypeScriptNullableOptionField<'a>],
    pub type_script_default_null_option_parameters:
        &'a [crate::TypeScriptDefaultNullOptionParameter<'a>],
    pub type_script_nullable_option_parameters:
        &'a [crate::TypeScriptNullableOptionParameter<'a>],
    pub type_script_nullable_option_returns: &'a [crate::TypeScriptNullableOptionReturn<'a>],
    pub external_shared_identity_fields: &'a BTreeSet<String>,
    pub module_identities: Option<&'a [String]>,
    pub visibility_programs: &'a [Program],
    pub visibility_identities: &'a [Option<String>],
    pub source_paths: &'a [Option<String>],
    pub lenient: bool,
}

pub(super) type PreferredAliases = HashMap<String, String>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum RuntimeCategory {
    Null,
    Boolean,
    Number,
    String,
    Array,
    Record,
    Function,
    Object,
}

pub(super) struct DataUnionPatternTest {
    pub(super) bindings: Vec<(String, String)>,
    pub(super) predicate: Option<String>,
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

struct ReservedKeyDataUnionPattern {
    binding: Option<String>,
    fallback: bool,
    keys: BTreeSet<String>,
    owner: String,
    payload_type: String,
    variant: String,
}

enum ReservedKeyDataUnionPatternAnalysis {
    CatchAll(Option<String>),
    Ordinary,
    Variants(Vec<ReservedKeyDataUnionPattern>),
}

struct DataUnionMatchArm {
    binding: Option<String>,
    binding_type: Option<String>,
    categories: BTreeSet<RuntimeCategory>,
    catch_all: bool,
    reserved_key_variants: Vec<(BTreeSet<String>, bool)>,
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

struct InferredTaggedDataUnionMatchArm {
    binding: Option<String>,
    catch_all: bool,
    field_bindings: Vec<(String, String)>,
    variants: Vec<String>,
}

pub(super) struct OptionMatchArm {
    pub(super) binding: Option<String>,
    pub(super) present: bool,
}

struct OptionWrappedInferredDataUnionMatchArm {
    binding: Option<String>,
    field_bindings: Vec<(String, String)>,
    none_arm: bool,
    variants: Vec<String>,
}

pub(super) enum TupleOptionElement {
    SomeBinding(String),
    SomeWild,
    None,
    Wild,
}

pub(super) struct TupleOptionMatchArm {
    pub(super) elements: Vec<TupleOptionElement>,
    pub(super) catch_all: bool,
}

pub(super) enum GeneralTupleElementCondition {
    Literal(String),
    EnumVariant(String),
    DataUnionKind(String),
    OptionSome(String),
    OptionNone(String),
    Wild,
}

pub(super) struct GeneralTupleElement {
    pub(super) condition: GeneralTupleElementCondition,
    pub(super) binding: Option<String>,
    pub(super) field_bindings: Vec<(String, String)>,
}

pub(super) struct GeneralTupleAlternative {
    pub(super) elements: Vec<GeneralTupleElement>,
}

pub(super) struct GeneralTupleMatchArm {
    pub(super) catch_all: bool,
    pub(super) alternatives: Vec<GeneralTupleAlternative>,
}

pub(super) struct ExternalIdentityAlias {
    pub(super) module: String,
    pub(super) tag: String,
}

#[derive(Clone)]
pub(super) struct CrossCrateSymbol {
    imported: String,
    local: String,
    module: String,
}

pub(super) struct CrossCrateUsageCollector<'a> {
    context: &'a HashSet<String>,
    symbols: &'a BTreeMap<String, CrossCrateSymbol>,
    struct_literals_are_types: bool,
    type_names: BTreeSet<String>,
    value_names: BTreeSet<String>,
}

// Whether the function a call names declares an identity-bearing return type (see
// `SHARED_IDENTITY_RETURN_MARKER`), as a source function or a Vitest helper.

// `SHARED_IDENTITY_EXTERNAL_TYPE_MARKER` and `SHARED_IDENTITY_EXTERNAL_FIELD_MARKER` facts for the
// dependency sources, each `(source, module)` of the crate the package `module`
// (`@flighthq/<name>/contract`) is generated from. Every type is read in its own source's `use` items
// and type aliases; an alias naming another source of its crate resolves once that alias is proven,
// so the facts are a fixpoint over the crate's sources.

// Records the `export-name` mappings of dependency packages (external alias sources) so imports of
// their mapped items use the owner's TypeScript names. Each unrenamed import of a mapped item, and each
// mapped item a wildcard import brings in, is referenced by that name too. It fails when a dependency
// gives one item two names, when an imported name disagrees with a local mapping of the same Rust name,
// collides with a local item or another import, or is shadowed by a local binding.
// flight-lint: allow(hashmap-iteration) mappings are BTreeMaps and items retain Rust source order in Vecs

// The name and entity type of a function's leading `name: &mut Entity` parameter.

// Every function, constant, static, and export-name directive of `program` as text, which identifies
// the source.
// flight-lint: allow(hashmap-iteration) items retain Rust source order in Vecs and directives are a BTreeMap
fn program_item_tokens(program: &Program) -> String {
    return program
        .functions
        .iter()
        .map(|function| function.to_token_stream().to_string())
        .chain(
            program
                .constants
                .iter()
                .map(|constant| constant.to_token_stream().to_string()),
        )
        .chain(
            program
                .statics
                .iter()
                .map(|item| item.to_token_stream().to_string()),
        )
        .chain(
            program
                .export_names
                .iter()
                .map(|(item, target)| format!("export-name {item} {target}")),
        )
        .collect::<Vec<_>>()
        .join("\n");
}

// Every local value binding a generated source declares: functions, constants and statics by their
// emitted names, runtime enums, and the injected `PI`.
// flight-lint: allow(hashmap-iteration) program items retain Rust source order in Vecs; the result is sorted
fn program_value_bindings(program: &Program, context: &HashSet<String>) -> BTreeSet<String> {
    let mut bindings = BTreeSet::new();
    for function in &program.functions {
        let name = function.sig.ident.to_string();
        bindings.insert(
            export_name(context, &name).map_or_else(|| snake_to_lower_camel(&name), str::to_string),
        );
    }
    for constant in &program.constants {
        let name = constant.ident.to_string();
        bindings.insert(
            frozen_object_name(context, &name)
                .or_else(|| export_name(context, &name))
                .unwrap_or(&name)
                .to_string(),
        );
    }
    for item in &program.statics {
        bindings.insert(item.ident.to_string());
    }
    for rust_enum in &program.enums {
        if enum_has_runtime_binding(program, rust_enum) {
            bindings.insert(rust_enum.ident.to_string());
        }
    }
    return bindings;
}

// `flight_*` crates imported with a wildcard anywhere in a use tree (`use flight_codec::*;`,
// `use {flight_codec::*, ...};`, `use flight_codec::{*, Name};`), as contract modules.
// A wildcard import of a dependency module that declares a `const-group` would bring its members in
// under their Rust names, which have no portable TypeScript lowering; it fails closed.
// flight-lint: allow(hashmap-iteration) each dependency's names are a BTreeMap
fn reject_const_group_wildcard_imports(
    dependencies: &[(BTreeMap<String, String>, &str)],
    wildcard_modules: &[String],
) -> Result<(), CompileError> {
    for (names, module) in dependencies {
        if !wildcard_modules.iter().any(|wildcard| wildcard == module) {
            continue;
        }
        if let Some((item, target)) = names.iter().find(|(_, target)| target.contains('.')) {
            return Err(compile_error(format!(
                "a wildcard import of `{module}` would bring in `const-group` member `{item}` (`{target}` in TypeScript), which has no portable lowering"
            )));
        }
    }
    return Ok(());
}

// `rust_type_is_shared_identity` read in source `from` (or the bare context), expanding at most 16
// wrapper or alias layers so an alias cycle fails closed.
// The payload of `Arc::new` / `Rc::new` proven to lower to a fresh or existing object: a literal
// allocation, an erased `RwLock` around one, or a struct value.

// The type-namespace provenance (`use` items and local declarations) recorded for source `from`.

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
            let mut context = alias_program.entities.clone();
            insert_program_type_path_context(&mut context, alias_program);
            let rendered = emit_type(&type_alias.ty, &context)?;
            if rendered.contains("=>") {
                aliases
                    .entry(rendered)
                    .or_insert_with(|| type_alias.ident.to_string());
            }
        }
    }
    return Ok(aliases);
}

// `rust_type_is_shared_identity` for a test file's declared type: its own aliases stand for their
// definitions, and a bare imported name may be the one loaded source alias so called.
fn vitest_type_is_shared_identity(
    context: &HashSet<String>,
    aliases: &BTreeMap<String, Type>,
    rust_type: &Type,
    depth: usize,
) -> bool {
    if depth > 16 {
        return false;
    }
    if let Type::Path(path) = rust_type
        && path.qself.is_none()
        && path.path.leading_colon.is_none()
        && path.path.segments.len() == 1
        && matches!(path.path.segments[0].arguments, PathArguments::None)
    {
        let name = path.path.segments[0].ident.to_string();
        if let Some(definition) = aliases.get(&name) {
            return vitest_type_is_shared_identity(context, aliases, definition, depth + 1);
        }
        if let Some((owner, alias)) = unique_alias_owner(context, &name)
            && let Some(definition) = unique_marker_suffix(
                context,
                &format!(
                    "{TYPE_ALIAS_DEFINITION_MARKER}{owner}{PROVENANCE_SEPARATOR}{alias}{PROVENANCE_SEPARATOR}"
                ),
            )
            .and_then(|definition| syn::parse_str::<Type>(&definition).ok())
        {
            return shared_identity_type_at_depth(context, Some(&owner), &definition, depth + 1);
        }
    }
    return rust_type_is_shared_identity(context, rust_type);
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

impl CrossCrateUsageCollector<'_> {
    fn record_type_path(&mut self, path: &syn::Path) {
        let Some(segment) = path.segments.first() else {
            return;
        };
        let name = segment.ident.to_string();
        if self.symbols.contains_key(&name)
            && !is_lowered_cross_crate_type(&name)
            && !is_internal_type_export(self.context, &name)
        {
            self.type_names.insert(name);
        }
    }

    fn record_value_path(&mut self, path: &syn::Path) {
        let Some(segment) = path.segments.first() else {
            return;
        };
        let name = segment.ident.to_string();
        if self.symbols.contains_key(&name) && !is_lowered_cross_crate_value(&name) {
            self.value_names.insert(name);
        }
    }
}

impl<'ast> Visit<'ast> for CrossCrateUsageCollector<'_> {
    fn visit_expr_path(&mut self, expression: &'ast syn::ExprPath) {
        if expression.qself.is_none() {
            if let Some((owner, member)) = path_owner_and_member(&expression.path)
                && (is_string_union(self.context, &owner)
                    || is_transparent_data_union_variant(self.context, &owner, &member))
            {
                // A transparent data-union variant erases to its payload, so its owner is never
                // referenced as a value.
                return;
            }
            self.record_value_path(&expression.path);
        }
        syn::visit::visit_expr_path(self, expression);
    }

    fn visit_expr_struct(&mut self, expression: &'ast syn::ExprStruct) {
        if self.struct_literals_are_types && expression.qself.is_none() {
            self.record_type_path(&expression.path);
        }
        syn::visit::visit_expr_struct(self, expression);
    }

    fn visit_macro(&mut self, mac: &'ast syn::Macro) {
        visit_cross_crate_macro_arguments(self, mac);
        syn::visit::visit_macro(self, mac);
    }

    fn visit_pat_struct(&mut self, pattern: &'ast syn::PatStruct) {
        if pattern.qself.is_none() {
            if let Some((owner, _)) = path_owner_and_member(&pattern.path)
                && is_string_union(self.context, &owner)
            {
                self.record_type_path(&pattern.path);
            } else {
                self.record_value_path(&pattern.path);
            }
        }
        syn::visit::visit_pat_struct(self, pattern);
    }

    fn visit_pat_tuple_struct(&mut self, pattern: &'ast syn::PatTupleStruct) {
        if pattern.qself.is_none() {
            if let Some((owner, member)) = path_owner_and_member(&pattern.path)
                && (is_string_union(self.context, &owner)
                    || is_transparent_data_union_variant(self.context, &owner, &member))
            {
                self.record_type_path(&pattern.path);
            } else {
                self.record_value_path(&pattern.path);
            }
        }
        syn::visit::visit_pat_tuple_struct(self, pattern);
    }

    fn visit_type_path(&mut self, rust_type: &'ast syn::TypePath) {
        if rust_type.qself.is_none() {
            self.record_type_path(&rust_type.path);
        }
        syn::visit::visit_type_path(self, rust_type);
    }
}
