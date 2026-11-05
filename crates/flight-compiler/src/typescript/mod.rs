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
mod local_emit;
mod lock_cell;
mod macro_emit;
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
use local_emit::*;
pub(crate) use local_emit::{emit_local, emit_local_with_shadow, emit_local_with_shadow_and_else};
use lock_cell::*;
use macro_emit::*;
pub(crate) use macro_emit::{emit_format_template, emit_panic_message};
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

const CALLBACK_ARGUMENT_MARKER: &str = "@callback-argument:";

// Lexical value bindings. Every binding site of an emitted function gets a canonical BindingId
// (`function#b<ordinal>`, ordinals in source order); `@binding-site:` maps a binding identifier node to
// it, `@binding-fact:` records what the binding is proven to hold, and `@binding:` names the binding
// currently in scope for an identifier. Emission installs `@binding:` in scope-local contexts, so a
// shadow is distinct and scope exit restores the outer binding.
const BINDING_MARKER: &str = "@binding:";

const BINDING_FACT_MARKER: &str = "@binding-fact:";

const BINDING_SITE_MARKER: &str = "@binding-site:";

const BINDING_FACT_SEPARATOR: char = '\u{1e}';

const CLOSURE_PARAMETER_MARKER: &str = "@closure-parameter:";

// `export-name` mappings: `@export-name:rust` marks a mapped item and `@export-name-target:rust:Name`
// carries its TypeScript name.
pub(super) const EXPORT_NAME_MARKER: &str = "@export-name:";

// A dependency package's `export-name` mapping: `@dependency-export-name:module|rust` marks a mapped
// item of that package's contract module and `@dependency-export-name-target:module|rust:Name`
// carries its TypeScript name.
pub(super) const DEPENDENCY_EXPORT_NAME_MARKER: &str = "@dependency-export-name:";

// `std::mem` provenance recorded from `use` items (see `insert_std_mem_import_context`).
const STD_MEM_FUNCTION_MARKER: &str = "@std-mem-function:";

const STD_MEM_FUNCTION_TARGET_MARKER: &str = "@std-mem-function-target:";

const STD_MEM_FUNCTIONS: &[&str] = &["replace", "swap", "take"];

const STD_MEM_GLOB_MARKER: &str = "@std-mem-glob";

const STD_MEM_MODULE_MARKER: &str = "@std-mem-module:";

const STD_MEM_SHADOWED_MARKER: &str = "@std-mem-shadowed:";

// Bare float constant names imported from `std::f32::consts` / `std::f64::consts` (see
// `insert_std_float_consts_context`).
const FLOAT_CONST_MARKER: &str = "@float-const:";

const JSON_VALUE_MARKER: &str = "@json-value:";
const JSON_VALUE_OPTION_MARKER: &str = "@json-value-option:";

// Type-namespace provenance recorded from `use` items and local declarations (see
// `insert_type_path_context`): a local name, the full path it imports, a glob's module path, and a
// locally declared type-namespace name.
pub(super) const TYPE_USE_MARKER: &str = "@type-use:";

pub(super) const TYPE_USE_TARGET_MARKER: &str = "@type-use-target:";

pub(super) const TYPE_EXTERN_CRATE_MARKER: &str = "@type-extern-crate:";

pub(super) const TYPE_NO_STD_MARKER: &str = "@type-no-std";

pub(super) const TYPE_USE_GLOB_MARKER: &str = "@type-use-glob:";

pub(super) const TYPE_LOCAL_MARKER: &str = "@type-local:";

// Type parameters of the declaration currently being emitted. A borrowed generic payload is `T`
// in TypeScript, not `Readonly<T>`: the latter turns primitive substitutions such as `number` into
// their boxed object surface.
const TYPE_PARAMETER_MARKER: &str = "@type-parameter:";

// Explicit Rust-name to established TypeScript representation metadata. The marker stores
// `rust␟module␟target`; an empty module is the intrinsic `unknown` representation.
const TYPE_SCRIPT_TYPE_ALIAS_MARKER: &str = "@typescript-type-alias:";

// An established target-native module owns this type for generated siblings, but not for public
// contract/root lanes. Its representation is supplied separately as an explicit alias or validated
// string union; this marker keeps references named and suppresses a foreign contract import.
const INTERNAL_TYPE_EXPORT_MARKER: &str = "@internal-type-export:";

pub(super) const DEPENDENCY_EXPORT_NAME_TARGET_MARKER: &str = "@dependency-export-name-target:";

// A dependency item the current source binds by its mapped name: `@dependency-export-name-binding:
// Name|module|rust`. `@dependency-export-name-bindings` marks that at least one exists.
pub(super) const DEPENDENCY_EXPORT_NAME_BINDING_MARKER: &str = "@dependency-export-name-binding:";

pub(super) const DEPENDENCY_EXPORT_NAME_BINDINGS_MARKER: &str = "@dependency-export-name-bindings";

pub(super) const EXPORT_NAME_TARGET_MARKER: &str = "@export-name-target:";

// The module of the program being emitted; struct and function facts resolve against it.
const CURRENT_SOURCE_MARKER: &str = "@current-source:";

// `{module}␟{Owner}␟{field}␟{store}` for each designated crate-private entity state field, and
// `{field}␟{Owner}` so an access whose receiver type cannot be resolved fails closed.
const ENTITY_RUNTIME_STATE_MARKER: &str = "@entity-runtime-state:";

const ENTITY_RUNTIME_STATE_FIELD_MARKER: &str = "@entity-runtime-state-field:";

// `{module}␟{Entity}` for an exact source entity declaration. Unlike the bare entity-name
// context used while rendering `Raw` types, this remains unambiguous across sibling modules and is
// suitable as evidence for lifecycle lowering.
const ENTITY_TYPE_MARKER: &str = "@entity-type:";

// An entity declared by a target-native sibling keeps the type name that sibling owns. Generated
// entity declarations still reserve the unsuffixed name for their wrapper and emit `NameRaw`.
const TARGET_NATIVE_ENTITY_MARKER: &str = "@target-native-entity:";

const DATA_UNION_UNIT_MARKER: &str = "@data-union-unit:";

const DATA_UNION_VARIANT_MARKER: &str = "@data-union-variant:";

const RESERVED_KEY_DATA_UNION_VARIANT_MARKER: &str = "@reserved-key-data-union-variant:";

const RESERVED_KEY_DATA_UNION_VARIANT_TYPE_MARKER: &str = "@reserved-key-data-union-variant-type:";

const TAGGED_DATA_UNION_VARIANT_MARKER: &str = "@tagged-data-union-variant:";
// `{owner}:{variant}` for a `record-map` data-union variant, whose string-keyed `HashMap` payload is a
// plain object record in TypeScript.
const RECORD_MAP_VARIANT_MARKER: &str = "@record-map-variant:";
// A local passed directly as a record-map variant payload in the function being emitted, so its
// `HashMap` construction, `insert`, `get` and index reads lower to a plain object record.
const RECORD_MAP_LOCAL_MARKER: &str = "@record-map-local:";

// A field an `allocate_entity` local may leave out of its default object because the construction
// initializer called on it in the very next statement definitely assigns it (`type:field`).
const ENTITY_ALLOCATION_INITIALIZED_FIELD_MARKER: &str = "@entity-allocation-initialized-field:";

// A field an `allocate_entity` local leaves out of its default object entirely (`type:field`): the
// construction initializer called on it in the very next statement writes the field before anything
// can read or capture the allocation, so the default would only be an overwritten placeholder.
const ENTITY_ALLOCATION_OMITTED_FIELD_MARKER: &str = "@entity-allocation-omitted-field:";

// A field an initializer writes in its leading run of plain `parameter.field = value;` statements,
// whose values never mention the parameter (`function:type:field`): written before any read or escape.
const ENTITY_INITIALIZER_PREFIX_FIELD_MARKER: &str = "@entity-initializer-prefix-field:";

const ENTITY_DEFAULT_FIELD_MARKER: &str = "@entity-default-field:";

// A field an initializer definitely assigns through its leading `&mut Entity` parameter on every
// completing path (`function:type:field`).
const ENTITY_DEFINITELY_INITIALIZED_FIELD_MARKER: &str = "@entity-definitely-initialized-field:";

const ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER: &str = "@entity-unsupported-default-field:";

const ENTITY_CLONE_FIELD_MARKER: &str = "@entity-clone-field:";

const ENUM_DEFAULT_VARIANT_MARKER: &str = "@enum-default-variant:";

// A struct field whose declared type provably erases an identity-bearing shared cell in TypeScript:
// `flight_entity::Ref<T>` or the equivalent standard `Arc<RwLock<T>>`. Only clones of these fields
// may be rewritten as forwarding aliases to the original field.
const ERASED_SHARED_CELL_FIELD_MARKER: &str = "@erased-shared-cell-field:";

const FIXED_BUFFER_ARGUMENT_MARKER: &str = "@fixed-buffer-argument:";

const FIXED_BUFFER_LOCAL_MARKER: &str = "@fixed-buffer-local:";

// The BindingId of a local bound to a dereferenced `MutexGuard`. `Mutex<T>` is a `{ value: T }` cell
// in TypeScript, so that exact binding must retain the cell while dereferences read or replace its
// `value`; another binding with the same identifier remains independent.
const MUTEX_GUARD_BINDING_MARKER: &str = "@mutex-guard-binding:";

// A local initialized from `RwLock::read`/`write`. `Ref<T>` and `Arc<RwLock<T>>` lower to `T`, so
// dereferencing this guard is a target no-op rather than a `.value` wrapper access.
const DIRECT_LOCK_GUARD_BINDING_MARKER: &str = "@direct-lock-guard-binding:";

const DIRECT_LOCK_GUARD_TARGET_MARKER: &str = "@direct-lock-guard-target:";
// An `async fn` (`name`) whose output is a proven D15 `Result<T, FlightError>` (see
// `flight_error_result_type`): its promise resolves `Ok` and rejects with the canonical error of `Err`.
pub(crate) const ASYNC_FLIGHT_ERROR_FUNCTION_MARKER: &str = "@async-flight-error-function:";
// Inside such a function's own body (never a closure): each proven `return Err(e)` lowers to
// `throw e`, which rejects the promise exactly as Rust resolves `Err(e)`.
const FLIGHT_ERROR_RETURNS_MARKER: &str = "@flight-error-returns";
// `{Struct}.{field}` for a callable field whose declared output is a pinned boxed future of a proven
// D15 `Result<T, FlightError>` (`Arc<dyn Fn(..) -> Pin<Box<dyn Future<Output = Result<..>>>>>`, through
// unambiguous aliases): the closure a struct literal stores there returns that promise.
pub(crate) const D15_FUTURE_FIELD_MARKER: &str = "@d15-future-field:";
// Set on the value of such a field while it is emitted; only the field's own closure consumes it.
const D15_FUTURE_CLOSURE_MARKER: &str = "@d15-future-closure";
// Inside that closure's own body (never a nested closure): its D15 provider tail may lower.
const D15_FUTURE_RETURN_MARKER: &str = "@d15-future-return";
// A production `async fn` (`name`) a portable test may await through a proven `block_on` helper.
pub(crate) const ASYNC_FUNCTION_MARKER: &str = "@async-function:";
// A production `async fn` (`name`) whose output is a proven D15 `Result<T, FlightError>`: a test
// checks it only through `Ok`/`Err` assertions, since its `Err` rejects the TypeScript promise.
pub(crate) const ASYNC_RESULT_FUNCTION_MARKER: &str = "@async-result-function:";
// The proven canonical noop-waker `block_on` test helper (`name`): it has no TypeScript body and
// each proven call lowers to one `await` of its future inside an async test.
pub(crate) const BLOCK_ON_HELPER_MARKER: &str = "@block-on-helper:";
// A test helper proven to compute a panic payload's `String`/`&str` message (else empty); its calls
// lower into vitest `toThrow(..)` and it has no TypeScript body.
pub(crate) const PANIC_MESSAGE_HELPER_MARKER: &str = "@panic-message-helper:";
// A test helper proven to assert one canonical `FlightError` kind of its closure's panic (and to
// return its message); its calls lower into vitest `toThrow(..)` and it has no TypeScript body.
pub(crate) const FLIGHT_ERROR_HELPER_MARKER: &str = "@flight-error-helper:";
// A binding holding an erased shared cell (`Arc<RwLock<T>>`, lowered to `T`) whose whole value a lock
// guard replaces, so it must be declared assignable.
const ERASED_CELL_WRITTEN_MARKER: &str = "@erased-cell-written:";
// A direct lock guard whose whole value is replaced (`*guard = ..`, `*guard += ..`): its binding is a
// snapshot of the old value, so every use of it reads its target cell instead.
const DIRECT_LOCK_GUARD_REPLACED_MARKER: &str = "@direct-lock-guard-replaced:";

const INTERIOR_MUTABLE_STRUCT_MARKER: &str = "@interior-mutable-struct:";

// `{module}␟{Struct}` for each entity a source declares `readonly-fields`, so an `initialize_*`
// function in another source that resolves its leading `&mut` parameter to it gets the writable
// construction view.
const READONLY_ENTITY_MARKER: &str = "@readonly-entity:";

const REF_ALIAS_TARGET_MARKER: &str = "@ref-alias-target:";

const REF_ALIAS_RECEIVER_CAPTURE_MARKER: &str = "@ref-alias-receiver-capture:";

const REFERENCE_PARAMETER_BINDING_MARKER: &str = "@reference-parameter-binding:";
// A nested portable-test helper parameter approved by `vitest` as the sole non-escaping mutable
// reference to an exact scalar (`function:parameter`). The name marker is translated to the
// parameter's lexical BindingId inside `function_expression_context`.
pub(super) const VITEST_MUTABLE_SCALAR_CELL_PARAMETER_MARKER: &str =
    "@vitest-mutable-scalar-cell-parameter:";
const MUTABLE_SCALAR_CELL_PARAMETER_NAME_MARKER: &str = "@mutable-scalar-cell-parameter-name:";
const MUTABLE_SCALAR_CELL_PARAMETER_BINDING_MARKER: &str =
    "@mutable-scalar-cell-parameter-binding:";
// The outer portable-test local whose identity is the cell passed to an approved helper.
pub(super) const VITEST_MUTABLE_SCALAR_CELL_LOCAL_BINDING_MARKER: &str =
    "@vitest-mutable-scalar-cell-local-binding:";
// An exact mutable-scalar parameter position. Production calls at this boundary fail closed; only
// the Vitest proof above may opt a local into the shared-cell representation.
pub(super) const MUTABLE_SCALAR_REFERENCE_ARGUMENT_MARKER: &str =
    "@mutable-scalar-reference-argument:";

const ITER_MUT_ALIAS_MARKER: &str = "@iter-mut-alias:";

const SCOPE_DECLARED_MARKER: &str = "@scope-declared:";
const MUTABLE_PARAMETER_MARKER: &str = "@mutable-parameter:";
const RENAME_MARKER: &str = "@rename:";
const TRY_SUBSTITUTION_MARKER: &str = "@try-sub:";
const TRY_COUNTER_MARKER: &str = "@try-counter:";

// A `const-group` member reference: `@const-group-member:<RUST_NAME>:<Owner>.<Member>`.
const CONST_GROUP_MEMBER_MARKER: &str = "@const-group-member:";

const FROZEN_OBJECT_MARKER: &str = "@frozen-object:";

// Free functions, structs and type aliases by declaring module
// (`module SEP name SEP public|crate|private`). A name used in a source resolves through Rust's
// module visibility: private in its owner, crate-visible inside that crate, and public everywhere.
pub(super) const FUNCTION_OWNER_MARKER: &str = "@function-owner:";

// A source's `use` bindings resolved to full module identities: explicit or renamed items
// (`module SEP bound name SEP target module SEP item`) and globs (`module SEP target module`). Only
// sources with a full module identity (`crate::path`) record them; others resolve their own
// declarations alone.
const USE_BINDING_MARKER: &str = "@use-binding:";

const USE_GLOB_MARKER: &str = "@use-glob:";

// The `pub` plus `pub(crate)` subset of those bindings, followed while resolving inside one crate.
const CRATE_USE_BINDING_MARKER: &str = "@crate-use-binding:";

const CRATE_USE_GLOB_MARKER: &str = "@crate-use-glob:";

// The public subset of the same bindings. Resolution starts with all bindings in the source being
// compiled, then follows only these markers through intermediate modules so a private import never
// becomes an accidental re-export.
const PUBLIC_USE_BINDING_MARKER: &str = "@public-use-binding:";

const PUBLIC_USE_GLOB_MARKER: &str = "@public-use-glob:";

const IDENTITY_ALIAS_MARKER: &str = "@identity-alias:";

const NULLABLE_BINDING_MARKER: &str = "@nullable:";

pub(super) const NULLABLE_CALL_MARKER: &str = "@nullable-call:";

// The BindingId of a Vitest local whose initializer is proven to retain a nullable Option return's
// `null` representation. Binding identity, rather than the Rust identifier, keeps shadows separate.
pub(super) const NULLABLE_OPTION_BINDING_MARKER: &str = "@nullable-option-binding:";

pub(super) const NULLABLE_OPTION_FIELD_MARKER: &str = "@nullable-option-field:";

const NULLABLE_OPTION_PARAMETER_MARKER: &str = "@nullable-option-parameter:";

const DEFAULT_NULL_OPTION_PARAMETER_MARKER: &str = "@default-null-option-parameter:";

pub(super) const NULLABLE_OPTION_RETURN_MARKER: &str = "@nullable-option-return:";

// A function whose exact TypeScript contract, rather than a source-wide Rust directive, proves
// that its Option return retains `null` through internal expression paths.
const TYPE_SCRIPT_NULLABLE_OPTION_RETURN_MARKER: &str = "@typescript-nullable-option-return:";

// A public callable type alias whose exact Rust return is `Option` and whose established
// TypeScript contract uses `null` absence: `{source} SEP {alias}`.
const NULLABLE_OPTION_CALLABLE_RETURN_MARKER: &str = "@nullable-option-callable-return:";

// A struct `HashMap`/`BTreeMap` field whose values use such a callable alias:
// `{struct source} SEP {Struct} SEP {field}`.
const NULLABLE_OPTION_CALLABLE_MAP_FIELD_MARKER: &str = "@nullable-option-callable-map-field:";

// The BindingId of a local proven to hold a callable whose Option result uses `null`.
const NULLABLE_OPTION_CALLABLE_BINDING_MARKER: &str = "@nullable-option-callable-binding:";

pub(super) const NULLABLE_OPTIONS_MARKER: &str = "@nullable-options";

// `{source}␟{function}␟{position}` for each `array-like` slice parameter, by its argument position, so
// an onward call can check the parameter of the callee it resolves to.
pub(super) const ARRAY_LIKE_ARGUMENT_MARKER: &str = "@array-like-argument:";

// `{source}␟{function}␟{parameter}` for each `array-like` slice parameter, typed `ArrayLike<T>`; the
// source identity keeps a sibling's designation from applying to a same-named local function.
const ARRAY_LIKE_PARAMETER_MARKER: &str = "@array-like-parameter:";

// `{source}␟{function}␟{parameter}` for a contract-proven `&mut [f32]` parameter whose exact
// TypeScript representation is `Float32Array`.
const FLOAT32_ARRAY_PARAMETER_MARKER: &str = "@float32-array-parameter:";
const UINT8_ARRAY_PARAMETER_MARKER: &str = "@uint8-array-parameter:";
const UINT8_ARRAY_RETURN_MARKER: &str = "@uint8-array-return:";
const TYPE_SCRIPT_ARRAY_FIELD_MARKER: &str = "@typescript-array-field:";

// `{source}␟{Struct}␟{field}` for a `nullable-option` struct field, read where that struct is declared or
// built by literal.
pub(super) const NULLABLE_OPTION_LITERAL_FIELD_MARKER: &str = "@nullable-option-literal-field:";
const TYPE_SCRIPT_NULLABLE_OPTION_FIELD_MARKER: &str = "@typescript-nullable-option-field:";
// `{module}` for each source declaring module-wide `nullable-options`: every `Option` its structs
// declare is `T | null`.
const NULLABLE_OPTIONS_SOURCE_MARKER: &str = "@nullable-options-source:";

// A function whose `Option` return is designated `nullable-option`: its returns use `null`.
pub(super) const RETURNS_NULLABLE_MARKER: &str = "@returns-nullable";

// A function returning a fixed array of a typed-array primitive (`[f64; 4]` is `Float64Array`): its
// returned array literals construct that typed array.
const RETURNS_TYPED_ARRAY_MARKER: &str = "@returns-typed-array:";
pub(crate) const RETURNS_CONTRACT_TYPED_ARRAY_MARKER: &str = "@returns-contract-typed-array:";

pub(super) const PROVENANCE_SEPARATOR: char = '\u{1f}';

// Struct fields (`struct identity SEP field SEP payload`), locals and parameters (`name:payload`), and
// function returns (`module SEP function SEP payload`) declared as Rust `Option<T>`. The payload is the
// resolved struct identity of `T`, or empty. They make Option `.and_then()` / `.map()` type-directed.
pub(super) const OPTION_FIELD_MARKER: &str = "@option-field:";

pub(super) const OPTION_RETURN_MARKER: &str = "@option-return:";

// Locals and parameters known to hold a Rust integer or string, the operand types `.cmp()` lowers
// to a JavaScript relational comparison.
const ORDERED_PRIMITIVE_MARKER: &str = "@ordered-primitive:";

// The precedence `expression_precedence` assigns to Rust primary expressions.
const PRIMARY_PRECEDENCE: u8 = 15;

const RECORD_CLONE_ARGUMENT_MARKER: &str = "@record-clone-argument:";

const RECORD_CLONE_LOCAL_MARKER: &str = "@record-clone-local:";

const RECORD_CLONE_TYPE_MARKER: &str = "@record-clone-type:";

const RECORD_VEC_FIELD_MARKER: &str = "@record-vec-field:";

const RETURN_TYPE_MARKER: &str = "@return-type:";

// The BindingId of the one local a proven Rust allocate/initialize/return entity factory finishes
// at its TypeScript return boundary. This marker is function-local and never inherited by closures.
const FINISH_ENTITY_RETURN_MARKER: &str = "@finish-entity-return:";

pub(super) const RETURN_BINDING_FACT_MARKER: &str = "@return-binding-fact:";

const RETURNS_U32_MARKER: &str = "@returns-u32";

// Struct fields (`struct identity SEP field`) and locals or parameters whose every binding is declared
// as a Rust `Vec`, slice or fixed array, the operand types `.extend()` and `.extend_from_slice()` lower
// over.
// A struct field typed `HashSet` / `HashMap`: `identity SEP field SEP hash-set|hash-map`.
const HASH_COLLECTION_FIELD_MARKER: &str = "@hash-collection-field:";

const SEQUENCE_FIELD_MARKER: &str = "@sequence-field:";
const SEQUENCE_FIELD_ELEMENT_MARKER: &str = "@sequence-field-element:";
// `{BindingId} SEP {TypeScript element type}` for a local initialized by an empty standard `Vec`
// construction. The element type is recorded only when declared, receiver and function-result
// provenance agree on one fully representable non-generic type.
const EMPTY_SEQUENCE_ELEMENT_TYPE_MARKER: &str = "@empty-sequence-element-type:";
// `{function}:{index}:{kind}` for each typed parameter: `slice` (`&[f64]`) or `mut-slice` (`&mut [f64]`)
// over a typed-array primitive, otherwise `other`. A fixed typed array (`Float64Array`) coerces to such a
// slice in Rust but not to its `number[]` in TypeScript, so a call converts or rejects it.
pub(super) const SLICE_ARGUMENT_MARKER: &str = "@slice-argument:";
// `{name}:{typed array}` for a constant typed as a fixed typed-primitive array.
const TYPED_ARRAY_CONSTANT_MARKER: &str = "@typed-array-constant:";
// `{struct identity}␟{field}␟{typed array}` for a field typed as a fixed typed-primitive array.
const TYPED_ARRAY_FIELD_MARKER: &str = "@typed-array-field:";
// `{struct identity}␟{field}␟{typed array}` for a `Vec`/slice field of fixed typed-primitive arrays
// (`Vec<[f64; 2]>`), whose elements are typed arrays in TypeScript.
const TYPED_ARRAY_SEQUENCE_FIELD_MARKER: &str = "@typed-array-sequence-field:";

// Functions returning a Rust `Vec`, slice or fixed array (`module SEP function SEP`).
pub(super) const SEQUENCE_RETURN_MARKER: &str = "@sequence-return:";

const BOOLEAN_EXPRESSION_MARKER: &str = "@boolean-expression:";

const BOOLEAN_FIELD_MARKER: &str = "@boolean-field:";

const STRING_EXPRESSION_MARKER: &str = "@string-expression:";

const STRING_FIELD_MARKER: &str = "@string-field:";

pub(super) const STRING_RETURN_MARKER: &str = "@string-return:";

pub(super) const STRING_UNION_MARKER: &str = "@string-union:";

const INLINE_STRING_UNION_MARKER: &str = "@inline-string-union:";

pub(super) const STRUCT_OWNER_MARKER: &str = "@struct-owner:";

// `{struct identity} SEP { TypeScript object literal }` for an explicitly designated public record
// whose standard derived `Default` is proven to be structural.
const DEFAULT_OBJECT_MARKER: &str = "@default-object:";

// `{module}␟{type-path fact}` retains the source-local canonical type-path context in the aggregate
// provenance context. This lets later alias expansion resolve every spelling of a proven standard
// `Arc`, including absolute paths and renamed root or module imports.
const SOURCE_TYPE_PATH_CONTEXT_MARKER: &str = "@source-type-path-context:";

// Owner facts for each source type alias, and `{module}␟{alias}␟{type tokens}` for its
// definition, so a struct identity is seen through alias chains across sources.
const TYPE_ALIAS_DEFINITION_MARKER: &str = "@type-alias-definition:";

// Generic parameter names for a type alias: `{module}␟{alias}␟{param1,param2,...}`.
const TYPE_ALIAS_GENERICS_MARKER: &str = "@type-alias-generics:";

const TYPE_ALIAS_OWNER_MARKER: &str = "@type-alias-owner:";

// Functions returning a resolved struct (`module SEP function SEP struct identity`).
pub(super) const STRUCT_RETURN_MARKER: &str = "@struct-return:";

// `{struct identity}␟{field}␟{field struct identity}` for each field whose declared type is a struct of
// a source, so a nested field read resolves its owner through the declarations.
pub(super) const STRUCT_FIELD_TYPE_MARKER: &str = "@struct-field-type:";
// `{owner struct identity}␟{method}␟{module}␟{function}␟{arguments}` for each impl method that only
// forwards to a free function. `arguments` lists the forwarded operands in call order, `self` for the
// receiver and a method parameter index otherwise (`self,0,1`).
const METHOD_DELEGATION_MARKER: &str = "@method-delegation:";
// `{struct identity}␟{field}␟{numeric_type}` for each field declared as a Rust numeric primitive.
const NUMERIC_FIELD_TYPE_MARKER: &str = "@numeric-field-type:";
// `{struct identity}␟{field}` for each field whose declared type lowers to an identity-bearing
// TypeScript object that is not a source struct (see `rust_type_is_shared_identity`).
pub(super) const SHARED_IDENTITY_FIELD_MARKER: &str = "@shared-identity-field:";
// The BindingId of a binding proven to hold an identity-bearing TypeScript object that is not a source
// struct: declared with such a type, or initialized from one.
pub(super) const SHARED_IDENTITY_BINDING_MARKER: &str = "@shared-identity-binding:";
// `{struct identity}␟{field}` for a field declared as a sequence (`Vec`, slice, array) whose elements
// lower to identity-bearing objects, so an indexed element compares by allocation.
pub(super) const SHARED_IDENTITY_ELEMENT_FIELD_MARKER: &str = "@shared-identity-element-field:";
// `{module}␟{function}␟` (or a Vitest helper's identity) for a function whose declared return type
// lowers to an identity-bearing object.
pub(super) const SHARED_IDENTITY_RETURN_MARKER: &str = "@shared-identity-return:";
// An entity name of any loaded source, recorded before any source's facts are derived so a fact about
// a type declared in a later (for example target-native) source sees it.
pub(super) const SHARED_IDENTITY_ENTITY_MARKER: &str = "@shared-identity-entity:";
// `{crate}::{Struct}␟{field}` for each public field of a dependency crate's public struct whose declared
// type lowers to an identity-bearing object, read in that crate's own source (see
// `external_shared_identity_fields`).
pub(super) const SHARED_IDENTITY_EXTERNAL_FIELD_MARKER: &str = "@shared-identity-external-field:";
// `{BindingId}␟{crate}::{Struct}` for a parameter or local declared as a dependency crate's struct.
pub(super) const EXTERNAL_STRUCT_BINDING_MARKER: &str = "@external-struct-binding:";
// `{crate}::{function}␟{crate}::{Struct}` for a public dependency function returning one of that
// dependency's structs. Tests use this to retain the owner of an inferred factory result.
const EXTERNAL_STRUCT_RETURN_MARKER: &str = "@external-struct-return:";
// `{struct identity}␟{field}␟{crate}::{Struct}` for a source struct field declared as a dependency
// crate's struct.
pub(super) const EXTERNAL_STRUCT_FIELD_MARKER: &str = "@external-struct-field:";
// `{crate}::{Name}` for a dependency crate's public struct, or public type alias whose definition
// lowers to an identity-bearing object, read in that crate's own source.
pub(super) const SHARED_IDENTITY_EXTERNAL_TYPE_MARKER: &str = "@shared-identity-external-type:";

const VEC_CLONE_ARGUMENT_MARKER: &str = "@vec-clone-argument:";

const VEC_CLONE_EXPRESSION_MARKER: &str = "@vec-clone-expression:";

const UNSIGNED_INTEGER_LOCAL_MARKER: &str = "@unsigned-integer-local:";

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

// Rust `pub(crate)`/`pub(super)` items can cross source modules. Generated TypeScript preserves
// that package-internal reachability with a named module export; contract/index generation still
// decides the actual package surface from Rust's public re-exports.
// The BindingId of the lexical value binding of `name` in scope, `Some("")` for an in-scope binding
// whose site was not resolved, or `None` when no value binding of `name` is in scope.
fn lexical_binding(entities: &HashSet<String>, name: &str) -> Option<String> {
    return unique_marker_suffix(entities, &format!("{BINDING_MARKER}{name}="));
}

// The fact proven for the lexical binding of `name` in scope.
pub(super) fn lexical_fact(entities: &HashSet<String>, name: &str) -> Option<BindingFact> {
    let id = lexical_binding(entities, name).filter(|id| !id.is_empty())?;
    return unique_marker_suffix(entities, &format!("{BINDING_FACT_MARKER}{id}="))
        .map(|fact| binding_fact_from_marker(&fact));
}

pub(super) fn local_pattern_name(pattern: &Pat) -> Option<String> {
    return match pattern {
        Pat::Ident(identifier) => Some(identifier.ident.to_string()),
        Pat::TupleStruct(tuple)
            if (tuple.path.is_ident("Some") || tuple.path.is_ident("Ok"))
                && tuple.elems.len() == 1 =>
        {
            let Pat::Ident(identifier) = &tuple.elems[0] else {
                return None;
            };
            Some(identifier.ident.to_string())
        }
        Pat::Type(typed) => local_pattern_name(&typed.pat),
        _ => None,
    };
}

fn statement_binds_name(pattern: &Pat, name: &str) -> bool {
    match pattern {
        Pat::Ident(ident) => ident.ident == name,
        Pat::Type(typed) => statement_binds_name(&typed.pat, name),
        Pat::TupleStruct(ts) => ts.elems.iter().any(|elem| statement_binds_name(elem, name)),
        Pat::Struct(s) => s.fields.iter().any(|f| statement_binds_name(&f.pat, name)),
        Pat::Tuple(t) => t.elems.iter().any(|elem| statement_binds_name(elem, name)),
        _ => false,
    }
}

pub(super) fn local_pattern_binding_id(
    entities: &HashSet<String>,
    pattern: &Pat,
) -> Option<String> {
    let identifier = match pattern {
        Pat::Ident(identifier) => &identifier.ident,
        Pat::Type(typed) => return local_pattern_binding_id(entities, &typed.pat),
        _ => return None,
    };
    return unique_marker_suffix(
        entities,
        &format!("{BINDING_SITE_MARKER}{}=", binding_site_key(identifier)),
    );
}

// The suffixes of every marker starting with `prefix`, in sorted order.
// flight-lint: allow(hashmap-iteration) the matches are collected into a BTreeSet, so order is never observed
pub(super) fn marker_suffixes(entities: &HashSet<String>, prefix: &str) -> BTreeSet<String> {
    return entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(prefix).map(str::to_string))
        .collect();
}

// The segments of a full module identity (`crate::path::to::module`), or `None` for any other source
// key (a synthetic or path-shaped key carries no module identity).
fn module_identity_segments(module: &str) -> Option<Vec<String>> {
    let segments = module.split("::").map(str::to_string).collect::<Vec<_>>();
    let valid = segments.iter().all(|segment| {
        !segment.is_empty()
            && segment
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
    });
    return valid.then_some(segments);
}

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

fn type_is_named(rust_type: &Type, expected: &str) -> bool {
    let Type::Path(path) = rust_type else {
        return false;
    };
    return path.path.is_ident(expected);
}

fn type_kind(rust_type: &Type) -> &'static str {
    return match rust_type {
        Type::BareFn(_) => "bare function",
        Type::ImplTrait(_) => "impl trait",
        Type::Infer(_) => "inferred type",
        Type::Macro(_) => "type macro",
        Type::Never(_) => "never type",
        Type::Ptr(_) => "raw pointer",
        Type::TraitObject(_) => "trait object",
        Type::Verbatim(_) => "verbatim type tokens",
        _ => "unknown type",
    };
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
