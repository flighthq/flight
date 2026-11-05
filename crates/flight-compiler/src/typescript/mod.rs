mod binding_analysis;
mod block_emit;
mod context_insert;
mod d15_emit;
mod data_union_analysis;
mod data_union_runtime;
mod default_object_emit;
mod entity_factory_emit;
mod enum_emit;
mod expression_emit;
mod flight_error_emit;
mod function_emit;
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
mod parameter_emit;
mod pinned_boxed_emit;
mod program_emit;
mod resolve_emit;
mod safety;
mod sequence_analysis;
mod sequence_ops;
mod shared_identity_analysis;
mod statement_emit;
mod struct_emit;
mod type_classification;
mod type_emit;
mod value_emit;
mod vitest_helpers;

use binding_analysis::*;
pub(crate) use block_emit::emit_block_with_tail_returns;
use block_emit::*;
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
use expression_emit::*;
pub(crate) use expression_emit::{emit_expression, emit_expression_for_type};
use flight_error_emit::*;
pub(crate) use flight_error_emit::{flight_error_result_aliases, flight_error_result_type};
use function_emit::*;
pub(crate) use function_emit::{emit_local_function, lexical_binding_names};
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
pub(crate) use parameter_emit::emit_parameter;
use parameter_emit::*;
use pinned_boxed_emit::*;
use program_emit::*;
pub(crate) use program_emit::{
    collect_cross_crate_use_tree, emit_program, is_lowered_cross_crate_type,
    is_lowered_cross_crate_value, test_cross_crate_imports, test_mixed_foreign_wildcard_roots,
};
use resolve_emit::*;
use sequence_analysis::*;
pub(crate) use sequence_ops::emit_vec_extend_statement;
use sequence_ops::*;
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
use value_emit::*;
pub(crate) use value_emit::{js_string_literal, numeric_literal_spelling};

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

// One path introduced by a `use`: the prefix segments as written, and the imported item with the
// name it binds (`None` for a glob).
struct UsePath {
    item: Option<(String, String)>,
    prefix: Vec<String>,
}

// A fact proven about a lexical binding's value.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum BindingFact {
    // A binding typed or constructed as `HashMap` (`Map` in TypeScript).
    HashMap,
    // A binding typed or constructed as `HashSet` (`Set` in TypeScript).
    HashSet,
    Option(Box<BindingFact>),
    Sequence(Box<BindingFact>),
    Structure(String),
    Tuple(Vec<BindingFact>),
    // A fixed array of a typed-array primitive (`[f64; 4]`), named by its TypeScript typed array.
    TypedArray(String),
    Unknown,
    UnresolvedPattern,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct ProvenanceIdentity {
    declaration: String,
    module: String,
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

// The context for one `allocate_entity` local: when the next statement calls a construction
// initializer with `&mut <local>` first, the fields that initializer definitely assigns may be left
// out of the allocation's default object. Any other shape keeps the context unchanged (fail closed).
// flight-lint: allow(hashmap-iteration) markers are only copied into another set, so visit order is unobservable
fn allocation_initialized_context(
    entities: &HashSet<String>,
    local: &syn::Local,
    name: &str,
    next: Option<&Stmt>,
) -> HashSet<String> {
    let Some(initializer) = &local.init else {
        return entities.clone();
    };
    if !expression_is_path_call(&initializer.expr, "allocate_entity") {
        return entities.clone();
    }
    let Some(Stmt::Expr(Expr::Call(call), _)) = next else {
        return entities.clone();
    };
    let Expr::Path(function) = call.func.as_ref() else {
        return entities.clone();
    };
    let Some(function) = function.path.get_ident() else {
        return entities.clone();
    };
    let Some(Expr::Reference(reference)) = call.args.first() else {
        return entities.clone();
    };
    let Expr::Path(argument) = reference.expr.as_ref() else {
        return entities.clone();
    };
    if reference.mutability.is_none() || !argument.path.is_ident(name) {
        return entities.clone();
    }
    let prefix = format!("{ENTITY_DEFINITELY_INITIALIZED_FIELD_MARKER}{function}:");
    let mut context = entities.clone();
    for marker in entities {
        if let Some(field) = marker.strip_prefix(&prefix) {
            context.insert(format!(
                "{ENTITY_ALLOCATION_INITIALIZED_FIELD_MARKER}{field}"
            ));
        }
    }
    // Omitting a default outright needs the stronger proof: the exact `flight_entity` allocation
    // intrinsic, and no other argument of the initializer call that could read the allocation
    // before the initializer's leading writes run.
    let other_arguments_observe = call
        .args
        .iter()
        .skip(1)
        .any(|argument| tokens_contain_identifier(argument.to_token_stream(), name));
    if is_flight_entity_allocation(&initializer.expr, entities) && !other_arguments_observe {
        let prefix = format!("{ENTITY_INITIALIZER_PREFIX_FIELD_MARKER}{function}:");
        for marker in entities {
            if let Some(field) = marker.strip_prefix(&prefix) {
                context.insert(format!("{ENTITY_ALLOCATION_OMITTED_FIELD_MARKER}{field}"));
            }
        }
    }
    return context;
}

pub(super) fn argument_is_option(argument: &FnArg) -> bool {
    let FnArg::Typed(argument) = argument else {
        return false;
    };
    return option_inner_type(&argument.ty).is_some();
}

fn argument_is_nullable_guard(function: &ItemFn, argument: &FnArg) -> bool {
    let name = function.sig.ident.to_string();
    let FnArg::Typed(argument) = argument else {
        return false;
    };
    let Pat::Ident(pattern) = argument.pat.as_ref() else {
        return false;
    };
    return name.starts_with("set_")
        && name.ends_with("_guard")
        && pattern.ident == "guard"
        && option_inner_type(&argument.ty).is_some();
}

fn argument_is_type_script_nullable_option_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> bool {
    let Some(module) = current_source(entities) else {
        return false;
    };
    let FnArg::Typed(argument) = argument else {
        return false;
    };
    let Pat::Ident(pattern) = argument.pat.as_ref() else {
        return false;
    };
    return entities.contains(&format!(
        "{NULLABLE_OPTION_PARAMETER_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    ));
}

fn argument_is_type_script_default_null_option_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> bool {
    let Some(module) = current_source(entities) else {
        return false;
    };
    let FnArg::Typed(argument) = argument else {
        return false;
    };
    let Pat::Ident(pattern) = argument.pat.as_ref() else {
        return false;
    };
    return entities.contains(&format!(
        "{DEFAULT_NULL_OPTION_PARAMETER_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    ));
}

// The `name: ArrayLike<T>` parameter an `array-like` designation gives a `&[T]` argument, or `None`.
fn array_like_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    let FnArg::Typed(typed) = argument else {
        return Ok(None);
    };
    let Pat::Ident(pattern) = typed.pat.as_ref() else {
        return Ok(None);
    };
    let Some(current) = current_source(entities) else {
        return Ok(None);
    };
    if !entities.contains(&format!(
        "{ARRAY_LIKE_PARAMETER_MARKER}{current}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    )) {
        return Ok(None);
    }
    let Type::Reference(reference) = typed.ty.as_ref() else {
        return Ok(None);
    };
    let Type::Slice(slice) = reference.elem.as_ref() else {
        return Ok(None);
    };
    return Ok(Some(format!(
        "{}: ArrayLike<{}>",
        snake_to_lower_camel(&pattern.ident.to_string()),
        emit_type(&slice.elem, entities)?
    )));
}

fn float32_array_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> Option<String> {
    let FnArg::Typed(typed) = argument else {
        return None;
    };
    let Pat::Ident(pattern) = typed.pat.as_ref() else {
        return None;
    };
    let current = current_source(entities)?;
    if !entities.contains(&format!(
        "{FLOAT32_ARRAY_PARAMETER_MARKER}{current}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    )) {
        return None;
    }
    return Some(format!(
        "{}: Float32Array",
        snake_to_lower_camel(&pattern.ident.to_string())
    ));
}

fn uint8_array_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> Option<String> {
    let FnArg::Typed(typed) = argument else {
        return None;
    };
    let Pat::Ident(pattern) = typed.pat.as_ref() else {
        return None;
    };
    let current = current_source(entities)?;
    if !entities.contains(&format!(
        "{UINT8_ARRAY_PARAMETER_MARKER}{current}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    )) {
        return None;
    }
    return Some(format!(
        "{}: Uint8Array",
        snake_to_lower_camel(&pattern.ident.to_string())
    ));
}

pub(crate) fn function_returns_uint8_array(function: &ItemFn, entities: &HashSet<String>) -> bool {
    return current_source(entities).map_or_else(
        || {
            entities.contains(&format!(
                "{UINT8_ARRAY_RETURN_MARKER}{}",
                function.sig.ident
            ))
        },
        |current| {
            entities.contains(&format!(
                "{UINT8_ARRAY_RETURN_MARKER}{current}{PROVENANCE_SEPARATOR}{}",
                function.sig.ident
            ))
        },
    );
}

pub(crate) fn contract_typed_array_return_value(
    expression: &Expr,
    emitted: String,
    entities: &HashSet<String>,
) -> String {
    let Some(array_type) = unique_marker_suffix(entities, RETURNS_CONTRACT_TYPED_ARRAY_MARKER)
    else {
        return emitted;
    };
    if expression_typed_array(expression, entities).as_deref() == Some(array_type.as_str()) {
        return emitted;
    }
    return format!("new {array_type}({emitted})");
}

pub(super) fn argument_is_array_like_parameter(
    function: &ItemFn,
    argument: &FnArg,
    entities: &HashSet<String>,
) -> bool {
    let FnArg::Typed(typed) = argument else {
        return false;
    };
    let Pat::Ident(pattern) = typed.pat.as_ref() else {
        return false;
    };
    let Some(current) = current_source(entities) else {
        return false;
    };
    return entities.contains(&format!(
        "{ARRAY_LIKE_PARAMETER_MARKER}{current}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
        function.sig.ident, pattern.ident
    ));
}

fn array_type(inner: String) -> String {
    if inner.starts_with("readonly [") {
        return format!("Array<{inner}>");
    }
    if inner.contains(" | ") || inner.contains("=>") {
        return format!("({inner})[]");
    }
    return format!("{inner}[]");
}

// Opens `if let Some(name) = value` on the absent value. A scrutinee that only reads a binding or a
// field chain is re-read in the test and the binding (and a `name` that is that same binding needs no
// redeclaration: the test narrows it); any other scrutinee is evaluated exactly once into a block
// scoped `$name` temporary, a spelling no Rust identifier can take. Returns the indent of the `if` and
// whether a wrapping block must be closed after its `else`.
pub(crate) fn begin_option_if(
    out: &mut String,
    indent: usize,
    binding: &(String, String, &'static str),
    rereadable: bool,
) -> (usize, bool) {
    return begin_option_if_with_rebind(out, indent, binding, rereadable, false);
}

pub(crate) fn begin_option_if_with_rebind(
    out: &mut String,
    indent: usize,
    binding: &(String, String, &'static str),
    rereadable: bool,
    body_rebinds: bool,
) -> (usize, bool) {
    let (name, value, absent) = binding;
    let is_destructure = name.starts_with('[');
    let (if_indent, test) = if rereadable {
        (indent, value.clone())
    } else {
        write_indent(out, indent);
        out.push_str("{\n");
        write_indent(out, indent + 1);
        if is_destructure {
            writeln!(out, "const $opt = {value};").expect("writing to a String cannot fail");
            (indent + 1, "$opt".to_string())
        } else if value_references_name(name, value) {
            writeln!(out, "const ${name} = {value};").expect("writing to a String cannot fail");
            (indent + 1, format!("${name}"))
        } else {
            let keyword = if body_rebinds { "let" } else { "const" };
            writeln!(out, "{keyword} {name} = {value};").expect("writing to a String cannot fail");
            (indent + 1, name.clone())
        }
    };
    write_indent(out, if_indent);
    writeln!(out, "if ({test} !== {absent}) {{").expect("writing to a String cannot fail");
    if &test != name {
        let keyword = if body_rebinds { "let" } else { "const" };
        write_indent(out, if_indent + 1);
        writeln!(out, "{keyword} {name} = {test};").expect("writing to a String cannot fail");
    }
    return (if_indent, !rereadable);
}

// Opens `while let Some(name) = value`. A re-readable scrutinee keeps `while (value !== absent)`; any
// other is evaluated exactly once per iteration in a `for (;;)` that breaks on the absent value, so a
// side-effecting scrutinee such as a pop runs once per pass.
pub(crate) fn begin_option_while(
    out: &mut String,
    indent: usize,
    binding: &(String, String, &'static str),
    rereadable: bool,
) {
    let (name, value, absent) = binding;
    let is_destructure = name.starts_with('[');
    write_indent(out, indent);
    if rereadable {
        writeln!(out, "while ({value} !== {absent}) {{").expect("writing to a String cannot fail");
        if value != name {
            write_indent(out, indent + 1);
            writeln!(out, "const {name} = {value};").expect("writing to a String cannot fail");
        }
        return;
    }
    let temp = if is_destructure {
        "$opt"
    } else {
        &format!("${name}")
    };
    out.push_str("for (;;) {\n");
    write_indent(out, indent + 1);
    writeln!(out, "const {temp} = {value};").expect("writing to a String cannot fail");
    write_indent(out, indent + 1);
    writeln!(out, "if ({temp} === {absent}) {{").expect("writing to a String cannot fail");
    write_indent(out, indent + 2);
    out.push_str("break;\n");
    write_indent(out, indent + 1);
    out.push_str("}\n");
    write_indent(out, indent + 1);
    writeln!(out, "const {name} = {temp};").expect("writing to a String cannot fail");
}

// Whether the function a call names declares an identity-bearing return type (see
// `SHARED_IDENTITY_RETURN_MARKER`), as a source function or a Vitest helper.
fn call_returns_shared_identity(entities: &HashSet<String>, callee: &Expr) -> bool {
    let Expr::Path(path) = callee else {
        return false;
    };
    if path.qself.is_some() {
        return false;
    }
    if call_fact(entities, SHARED_IDENTITY_RETURN_MARKER, &path.path).is_some() {
        return true;
    }
    let Some(local) = vitest_path_binding_name(&path.path, entities) else {
        return false;
    };
    return unique_marker_suffix(
        entities,
        &format!("{VITEST_PUBLIC_FUNCTION_MARKER}{local}{PROVENANCE_SEPARATOR}"),
    )
    .is_some_and(|function| {
        entities.contains(&format!(
            "{SHARED_IDENTITY_RETURN_MARKER}{function}{PROVENANCE_SEPARATOR}"
        ))
    });
}

// The `Owner.Member` a `const-group` member constant is referenced as.
// flight-lint: allow(hashmap-iteration) const-group validation gives each constant at most one group
fn const_group_member_reference<'a>(
    context: &'a HashSet<String>,
    rust_name: &str,
) -> Option<&'a str> {
    let prefix = format!("{CONST_GROUP_MEMBER_MARKER}{rust_name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

// The one loaded source alias a `crate::...::Name` path can name when sources are identified by file
// rather than module path (test generation): exactly one alias called `Name`, or nothing.
fn crate_alias_owner(entities: &HashSet<String>, resolved: &[String]) -> Option<(String, String)> {
    let [first, .., name] = resolved else {
        return None;
    };
    if first != "crate" {
        return None;
    }
    return unique_alias_owner(entities, name);
}

// The TypeScript name a dependency package's `export-name` directive gives its item `rust_name`, as
// exported from `module`.
// flight-lint: allow(hashmap-iteration) dependency export-name validation guarantees one target per item
fn dependency_export_name<'a>(
    context: &'a HashSet<String>,
    module: &str,
    rust_name: &str,
) -> Option<&'a str> {
    if !context.contains(&format!(
        "{DEPENDENCY_EXPORT_NAME_MARKER}{module}|{rust_name}"
    )) {
        return None;
    }
    let prefix = format!("{DEPENDENCY_EXPORT_NAME_TARGET_MARKER}{module}|{rust_name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

// The dependency items the current source binds by mapped name, as `(TypeScript name, module, Rust
// name)`.
// flight-lint: allow(hashmap-iteration) the result is collected into a sorted set
fn dependency_export_name_bindings(
    context: &HashSet<String>,
) -> BTreeSet<(String, String, String)> {
    if !context.contains(DEPENDENCY_EXPORT_NAME_BINDINGS_MARKER) {
        return BTreeSet::new();
    }
    return context
        .iter()
        .filter_map(|marker| marker.strip_prefix(DEPENDENCY_EXPORT_NAME_BINDING_MARKER))
        .map(|binding| {
            let mut fields = binding.splitn(3, '|').map(str::to_string);
            return (
                fields.next().unwrap_or_default(),
                fields.next().unwrap_or_default(),
                fields.next().unwrap_or_default(),
            );
        })
        .collect();
}

// Rust names of the dependency items the current source binds by mapped name.
pub(crate) fn dependency_export_name_local_items(context: &HashSet<String>) -> BTreeSet<String> {
    return dependency_export_name_bindings(context)
        .into_iter()
        .map(|(_, _, rust)| rust)
        .collect();
}

// A dependency source's own type context plus the identity-bearing types proven so far, its own
// crate's also under `crate`.
fn dependency_source_context(
    mut context: HashSet<String>,
    known: &BTreeSet<String>,
    crate_name: &str,
) -> HashSet<String> {
    for name in known {
        context.insert(format!("{SHARED_IDENTITY_EXTERNAL_TYPE_MARKER}{name}"));
        if let Some(item) = name.strip_prefix(&format!("{crate_name}::")) {
            context.insert(format!(
                "{SHARED_IDENTITY_EXTERNAL_TYPE_MARKER}crate::{item}"
            ));
        }
    }
    return context;
}

// `export const Owner = { Member: value, ... };` from the `const-group` members, in source order, each
// keeping its documentation and its literal spelling.
// flight-lint: allow(hashmap-iteration) constants are a Vec slice in Rust source order
fn emit_const_group(
    out: &mut String,
    owner: &str,
    members: &[(String, String, String)],
    constants: &[syn::ItemConst],
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    writeln!(out, "export const {owner} = {{").expect("writing to a String cannot fail");
    for (rust_name, member_owner, member) in members {
        if member_owner != owner {
            continue;
        }
        let constant = constants
            .iter()
            .find(|constant| constant.ident == rust_name.as_str())
            .expect("const-group members come from these constants");
        emit_documentation(out, &constant.attrs, 1);
        let value = emit_expression_for_type(&constant.expr, &constant.ty, entities)?;
        writeln!(out, "  {member}: {value},").expect("writing to a String cannot fail");
    }
    out.push_str("};\n");
    return Ok(());
}

// Whether an enum emits a runtime value binding: a TypeScript `enum`, or the `const` object of an exact
// string union. Numeric, data and other string unions are type-only.
fn enum_has_runtime_binding(program: &Program, rust_enum: &syn::ItemEnum) -> bool {
    let name = rust_enum.ident.to_string();
    return !program.numeric_unions.contains_key(&name)
        && !program.data_unions.contains(&name)
        && program
            .string_unions
            .get(&name)
            .is_none_or(|style| *style == StringUnionStyle::Exact);
}

// The explicit TypeScript name an `export-name` directive gives the Rust item `rust_name`, if any.
// flight-lint: allow(hashmap-iteration) export-name validation guarantees one target name per Rust item
pub(crate) fn export_name<'a>(context: &'a HashSet<String>, rust_name: &str) -> Option<&'a str> {
    if !context.contains(&format!("{EXPORT_NAME_MARKER}{rust_name}")) {
        return None;
    }
    let prefix = format!("{EXPORT_NAME_TARGET_MARKER}{rust_name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

// The dependency-crate struct (`crate::Struct`) an expression holds: a parameter or local declared as
// one, or a source struct field declared as one, seen through references and clones.

// A shared-allocation payload whose TypeScript lowering is a fresh object: a struct literal, a
// closure, or a new collection or `Mutex` cell, possibly inside an erased `RwLock`.
fn expression_is_identity_payload(expression: &Expr) -> bool {
    return match expression {
        Expr::Group(group) => expression_is_identity_payload(&group.expr),
        Expr::Paren(paren) => expression_is_identity_payload(&paren.expr),
        Expr::Struct(_) | Expr::Closure(_) | Expr::Array(_) => true,
        Expr::Macro(expression) => expression.mac.path.is_ident("vec"),
        // `RwLock<T>` lowers to `T`, so its payload decides.
        Expr::Call(call)
            if expression_is_associated_path(&call.func, "RwLock", "new")
                && call.args.len() == 1 =>
        {
            expression_is_identity_payload(&call.args[0])
        }
        Expr::Call(call) => [
            "Vec", "VecDeque", "HashMap", "HashSet", "BTreeMap", "BTreeSet", "Mutex",
        ]
        .iter()
        .any(|owner| expression_is_associated_path(&call.func, owner, "new")),
        _ => false,
    };
}

fn expression_is_rereadable(expression: &Expr) -> bool {
    return match expression {
        Expr::Group(group) => expression_is_rereadable(&group.expr),
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "as_deref" | "as_mut" | "as_ref"
                ) =>
        {
            expression_is_rereadable(&call.receiver)
        }
        Expr::Paren(paren) => expression_is_rereadable(&paren.expr),
        Expr::Path(path) => path.qself.is_none() && path.path.segments.len() == 1,
        Expr::Reference(reference) => expression_is_rereadable(&reference.expr),
        expression => expression_is_field_reference(expression),
    };
}

// True when the emitted JS `value` string contains `name` as a standalone identifier (word-boundary
// check). Used to decide whether `const name = value` would cause a TDZ error because `value`
// references the same `name` that the `const` declares.
fn value_references_name(name: &str, value: &str) -> bool {
    fn is_js_ident_char(b: u8) -> bool {
        return b.is_ascii_alphanumeric() || b == b'_' || b == b'$';
    }
    for (start, _) in value.match_indices(name) {
        let before_ok = start == 0 || !is_js_ident_char(value.as_bytes()[start - 1]);
        let after_pos = start + name.len();
        let after_ok = after_pos >= value.len() || !is_js_ident_char(value.as_bytes()[after_pos]);
        if before_ok && after_ok {
            return true;
        }
    }
    return false;
}

// An `Arc::ptr_eq` operand proven to hold an identity-bearing TypeScript object, so `===` compares
// allocations as Rust does. A primitive or unit payload lowers to its value and never qualifies.
fn expression_is_shared_identity(expression: &Expr, entities: &HashSet<String>) -> bool {
    let expression = peel_shared_view(expression);
    return match expression {
        Expr::Call(call)
            if (expression_is_associated_path(&call.func, "Arc", "new")
                || expression_is_associated_path(&call.func, "Rc", "new"))
                && call.args.len() == 1 =>
        {
            shared_payload_is_identity(&call.args[0], entities)
        }
        Expr::Call(call) => {
            call_returns_shared_identity(entities, &call.func)
                || expression_struct_identity(expression, entities).is_some()
        }
        Expr::Field(field) => {
            if expression_struct_identity(expression, entities).is_some() {
                return true;
            }
            let syn::Member::Named(member) = &field.member else {
                return false;
            };
            let base = peel_shared_view(&field.base);
            if expression_struct_identity(base, entities).is_some_and(|owner| {
                entities.contains(&format!(
                    "{SHARED_IDENTITY_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{member}"
                ))
            }) {
                return true;
            }
            expression_external_struct(base, entities).is_some_and(|external| {
                entities.contains(&format!(
                    "{SHARED_IDENTITY_EXTERNAL_FIELD_MARKER}{external}{PROVENANCE_SEPARATOR}{member}"
                ))
            })
        }
        Expr::Index(index) => {
            let Expr::Field(field) = peel_shared_view(&index.expr) else {
                return false;
            };
            let syn::Member::Named(member) = &field.member else {
                return false;
            };
            expression_struct_identity(peel_shared_view(&field.base), entities).is_some_and(
                |owner| {
                    entities.contains(&format!(
                        "{SHARED_IDENTITY_ELEMENT_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{member}"
                    ))
                },
            )
        }
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            let name = path.path.segments[0].ident.to_string();
            if matches!(
                lexical_fact(entities, &name),
                Some(BindingFact::Structure(_) | BindingFact::HashMap | BindingFact::HashSet)
            ) {
                return true;
            }
            lexical_binding(entities, &name).is_some_and(|id| {
                entities.contains(&format!("{SHARED_IDENTITY_BINDING_MARKER}{id}"))
            })
        }
        _ => expression_struct_identity(expression, entities).is_some(),
    };
}

// The payload of `Arc::new` / `Rc::new` proven to lower to a fresh or existing object: a literal
// allocation, an erased `RwLock` around one, or a struct value.
fn shared_payload_is_identity(payload: &Expr, entities: &HashSet<String>) -> bool {
    return match payload {
        Expr::Group(group) => shared_payload_is_identity(&group.expr, entities),
        Expr::Paren(paren) => shared_payload_is_identity(&paren.expr, entities),
        Expr::Call(call)
            if expression_is_associated_path(&call.func, "RwLock", "new")
                && call.args.len() == 1 =>
        {
            shared_payload_is_identity(&call.args[0], entities)
        }
        payload => {
            expression_is_identity_payload(payload)
                || expression_struct_identity(payload, entities).is_some()
        }
    };
}

// The dependency-crate struct (`crate::Struct`) an expression holds: a parameter or local declared as
// one, or a source struct field declared as one, seen through references and clones.
fn expression_external_struct(expression: &Expr, entities: &HashSet<String>) -> Option<String> {
    return match expression {
        Expr::Group(group) => expression_external_struct(&group.expr, entities),
        Expr::Paren(paren) => expression_external_struct(&paren.expr, entities),
        Expr::Reference(reference) => expression_external_struct(&reference.expr, entities),
        Expr::MethodCall(call) if call.method == "clone" && call.args.is_empty() => {
            expression_external_struct(&call.receiver, entities)
        }
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            let id = lexical_binding(entities, &path.path.segments[0].ident.to_string())?;
            unique_marker_suffix(
                entities,
                &format!("{EXTERNAL_STRUCT_BINDING_MARKER}{id}{PROVENANCE_SEPARATOR}"),
            )
        }
        Expr::Field(field) => {
            let syn::Member::Named(member) = &field.member else {
                return None;
            };
            let owner = expression_struct_identity(&field.base, entities)?;
            unique_marker_suffix(
                entities,
                &format!(
                    "{EXTERNAL_STRUCT_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{member}{PROVENANCE_SEPARATOR}"
                ),
            )
        }
        _ => None,
    };
}

// The string union every value of `expression` is a variant of: a variant path, or a conditional,
// match or block whose every result is a variant of that one union.
fn expression_string_union_owner(expression: &Expr, context: &HashSet<String>) -> Option<String> {
    return match expression {
        Expr::Block(block) => match block.block.stmts.as_slice() {
            [Stmt::Expr(result, None)] => expression_string_union_owner(result, context),
            _ => None,
        },
        Expr::Group(group) => expression_string_union_owner(&group.expr, context),
        Expr::If(if_expression) => {
            let (_, else_branch) = if_expression.else_branch.as_ref()?;
            let [Stmt::Expr(then_result, None)] = if_expression.then_branch.stmts.as_slice() else {
                return None;
            };
            let then_owner = expression_string_union_owner(then_result, context)?;
            let else_owner = expression_string_union_owner(else_branch, context)?;
            (then_owner == else_owner).then_some(then_owner)
        }
        Expr::Match(match_expression) => {
            let mut owners = match_expression
                .arms
                .iter()
                .map(|arm| expression_string_union_owner(&arm.body, context))
                .collect::<Option<BTreeSet<_>>>()?;
            match (owners.pop_first(), owners.is_empty()) {
                (Some(owner), true) => Some(owner),
                _ => None,
            }
        }
        Expr::Paren(paren) => expression_string_union_owner(&paren.expr, context),
        Expr::Path(path) if path.qself.is_none() => path_owner_and_member(&path.path)
            .map(|(owner, _)| owner)
            .filter(|owner| is_string_union(context, owner)),
        _ => None,
    };
}

// The canonical identity of the struct `expression` evaluates to in emitted code, derived from
// declarations: a typed binding, a struct-returning call, a struct literal's resolved path, or a field
// whose declared type is a struct (recursively, so `a.b.c` resolves `b`'s owner through `a`).
fn expression_struct_identity(expression: &Expr, entities: &HashSet<String>) -> Option<String> {
    return match expression {
        Expr::Group(group) => expression_struct_identity(&group.expr, entities),
        Expr::Paren(paren) => expression_struct_identity(&paren.expr, entities),
        Expr::Reference(reference) => expression_struct_identity(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_struct_identity(&unary.expr, entities)
        }
        Expr::Call(call) => match call.func.as_ref() {
            Expr::Path(path) if path.qself.is_none() => {
                call_fact(entities, STRUCT_RETURN_MARKER, &path.path)
            }
            _ => None,
        },
        Expr::Struct(literal) if literal.qself.is_none() => context_type_identity(
            entities,
            &Type::Path(syn::TypePath {
                qself: None,
                path: literal.path.clone(),
            }),
        ),
        Expr::Field(field) => {
            let syn::Member::Named(member) = &field.member else {
                return None;
            };
            let owner = expression_struct_identity(&field.base, entities)?;
            unique_marker_suffix(
                entities,
                &format!(
                    "{STRUCT_FIELD_TYPE_MARKER}{owner}{PROVENANCE_SEPARATOR}{member}{PROVENANCE_SEPARATOR}"
                ),
            )
        }
        Expr::Index(index) => match expression_sequence_element_fact(&index.expr, entities)? {
            BindingFact::Structure(identity) if current_source(entities).is_some() => {
                Some(identity)
            }
            _ => None,
        },
        Expr::MethodCall(call) if current_source(entities).is_some() => {
            match expression_struct_identity(&call.receiver, entities).and_then(|owner| {
                owner_method_delegation_fact(
                    entities,
                    &owner,
                    &call.method.to_string(),
                    STRUCT_RETURN_MARKER,
                )
            }) {
                Some(identity) if !identity.is_empty() => Some(identity),
                _ => expression_struct_name(expression, entities),
            }
        }
        expression => expression_struct_name(expression, entities),
    };
}

// The element fact of a sequence-valued local or struct field (`holder.items` for `items: Vec<Item>`).
fn expression_sequence_element_fact(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<BindingFact> {
    if let Expr::Field(field) = peel_reference_and_paren(expression)
        && let syn::Member::Named(member) = &field.member
    {
        let owner = expression_struct_identity(&field.base, entities)?;
        return unique_marker_suffix(
            entities,
            &format!(
                "{SEQUENCE_FIELD_ELEMENT_MARKER}{owner}{PROVENANCE_SEPARATOR}{member}{PROVENANCE_SEPARATOR}"
            ),
        )
        .map(|fact| binding_fact_from_marker(&fact));
    }
    return sequence_element_binding_fact(expression, entities);
}

// The typed array an expression's value is: a local, parameter, constant or struct field typed as a
// fixed typed-primitive array (`[f64; 4]` is `Float64Array`), seen through references.
fn expression_typed_array(expression: &Expr, entities: &HashSet<String>) -> Option<String> {
    return match expression {
        Expr::Field(field) => {
            let syn::Member::Named(field_name) = &field.member else {
                return None;
            };
            let identity = expression_struct_name(&field.base, entities)?;
            unique_marker_suffix(
                entities,
                &format!(
                    "{TYPED_ARRAY_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                ),
            )
        }
        Expr::Group(group) => expression_typed_array(&group.expr, entities),
        Expr::Paren(paren) => expression_typed_array(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            let name = path.path.segments[0].ident.to_string();
            match lexical_fact(entities, &name) {
                Some(BindingFact::TypedArray(array_type)) => Some(array_type),
                Some(_) => None,
                None if lexical_binding(entities, &name).is_none() => {
                    unique_marker_suffix(entities, &format!("{TYPED_ARRAY_CONSTANT_MARKER}{name}:"))
                        .filter(|array_type| array_type != "other")
                }
                None => None,
            }
        }
        Expr::Reference(reference) => expression_typed_array(&reference.expr, entities),
        _ => None,
    };
}

fn type_script_array_field(
    entities: &HashSet<String>,
    identity: &str,
    field: &syn::Ident,
) -> Option<String> {
    return unique_marker_suffix(
        entities,
        &format!(
            "{TYPE_SCRIPT_ARRAY_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}{PROVENANCE_SEPARATOR}"
        ),
    );
}

fn contract_array_field_value(
    expression: &Expr,
    emitted: String,
    entities: &HashSet<String>,
    identity: &str,
    field: &syn::Ident,
) -> String {
    let Some(array_type) = type_script_array_field(entities, identity, field) else {
        return emitted;
    };
    if expression_typed_array(expression, entities).as_deref() == Some(array_type.as_str()) {
        return emitted;
    }
    return format!("new {array_type}({emitted})");
}

// `SHARED_IDENTITY_EXTERNAL_TYPE_MARKER` and `SHARED_IDENTITY_EXTERNAL_FIELD_MARKER` facts for the
// dependency sources, each `(source, module)` of the crate the package `module`
// (`@flighthq/<name>/contract`) is generated from. Every type is read in its own source's `use` items
// and type aliases; an alias naming another source of its crate resolves once that alias is proven,
// so the facts are a fixpoint over the crate's sources.

pub(super) fn foreign_wildcard_modules(uses: &[&syn::ItemUse]) -> Vec<String> {
    fn collect(tree: &syn::UseTree, root: Option<&str>, modules: &mut BTreeSet<String>) {
        match tree {
            syn::UseTree::Path(path) => {
                let ident = path.ident.to_string();
                collect(&path.tree, Some(root.unwrap_or(&ident)), modules);
            }
            syn::UseTree::Group(group) => {
                for item in &group.items {
                    collect(item, root, modules);
                }
            }
            syn::UseTree::Glob(_) => {
                if let Some(package) = root.and_then(|root| root.strip_prefix("flight_")) {
                    modules.insert(format!("@flighthq/{}/contract", package.replace('_', "-")));
                }
            }
            syn::UseTree::Name(_) | syn::UseTree::Rename(_) => {}
        }
    }

    let mut modules = BTreeSet::new();
    for item_use in uses {
        collect(&item_use.tree, None, &mut modules);
    }
    return modules.into_iter().collect();
}

// Records the `export-name` mappings of dependency packages (external alias sources) so imports of
// their mapped items use the owner's TypeScript names. Each unrenamed import of a mapped item, and each
// mapped item a wildcard import brings in, is referenced by that name too. It fails when a dependency
// gives one item two names, when an imported name disagrees with a local mapping of the same Rust name,
// collides with a local item or another import, or is shadowed by a local binding.
// flight-lint: allow(hashmap-iteration) mappings are BTreeMaps and items retain Rust source order in Vecs

// The name and entity type of a function's leading `name: &mut Entity` parameter.

// Whether a literal of the struct `identity`, built inside a `nullable-options` source (where `None` is
// `null`), stores `field` as `undefined`: an `Option` field its struct declares, outside any
// `nullable-options` source and with no nullable designation, which TypeScript types as optional
// (`field?: T`).
fn is_ordinary_option_literal_field(
    entities: &HashSet<String>,
    identity: &str,
    field: &syn::Ident,
) -> bool {
    if !entities.contains(NULLABLE_OPTIONS_MARKER)
        || identity
            .rsplit_once(PROVENANCE_SEPARATOR)
            .is_none_or(|(module, _)| {
                entities.contains(&format!("{NULLABLE_OPTIONS_SOURCE_MARKER}{module}"))
            })
    {
        return false;
    }
    let option_field = format!(
        "{OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}{PROVENANCE_SEPARATOR}"
    );
    return entities
        .iter()
        .any(|marker| marker.starts_with(&option_field))
        && !entities.contains(&format!(
            "{NULLABLE_OPTION_LITERAL_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}"
        ))
        && !entities.contains(&format!(
            "{NULLABLE_OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}"
        ));
}

// Whether a literal of the struct `identity` stores `field` as `null`: a `nullable-option` field, or,
// built outside a `nullable-options` source (whose values are already `null`-based), a public
// `Option` field such a source declares.
fn is_nullable_literal_field(
    entities: &HashSet<String>,
    identity: &str,
    field: &syn::Ident,
) -> bool {
    return entities.contains(&format!(
        "{NULLABLE_OPTION_LITERAL_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}"
    )) || !entities.contains(NULLABLE_OPTIONS_MARKER)
        && (entities.contains(&format!(
            "{NULLABLE_OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}"
        )) || is_type_script_nullable_option_field(entities, identity, field));
}

fn is_type_script_nullable_option_field(
    entities: &HashSet<String>,
    identity: &str,
    field: &syn::Ident,
) -> bool {
    let owner = identity
        .rsplit_once(PROVENANCE_SEPARATOR)
        .map_or(identity, |(_, owner)| owner);
    return entities.contains(&format!(
        "{TYPE_SCRIPT_NULLABLE_OPTION_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{field}"
    ));
}

fn nullable_type(inner: String) -> String {
    if inner.contains("=>") {
        return format!("({inner}) | null");
    }
    return format!("{inner} | null");
}

fn callable_parameter_types(
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Result<Option<Vec<String>>, CompileError> {
    let Some(parameter_types) = callable_parameter_rust_types(rust_type) else {
        return Ok(None);
    };
    return parameter_types
        .iter()
        .map(|rust_type| emit_type(rust_type, entities))
        .collect::<Result<Vec<_>, _>>()
        .map(Some);
}

pub(super) fn callable_parameter_rust_types(rust_type: &Type) -> Option<Vec<&Type>> {
    return match rust_type {
        Type::Paren(paren) => callable_parameter_rust_types(&paren.elem),
        Type::Reference(reference) => callable_parameter_rust_types(&reference.elem),
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
            let inner = arguments.args.iter().find_map(|argument| match argument {
                GenericArgument::Type(rust_type) => Some(rust_type),
                _ => None,
            })?;
            callable_parameter_rust_types(inner)
        }
        Type::TraitObject(object) => {
            for bound in &object.bounds {
                let syn::TypeParamBound::Trait(bound) = bound else {
                    continue;
                };
                let Some(segment) = bound.path.segments.last() else {
                    continue;
                };
                if !matches!(
                    segment.ident.to_string().as_str(),
                    "Fn" | "FnMut" | "FnOnce"
                ) {
                    continue;
                }
                let PathArguments::Parenthesized(arguments) = &segment.arguments else {
                    return None;
                };
                return Some(arguments.inputs.iter().collect());
            }
            None
        }
        _ => None,
    };
}

fn closure_parameter_types(entities: &HashSet<String>, local: &str) -> Vec<String> {
    let prefix = format!("{CLOSURE_PARAMETER_MARKER}{local}:");
    let mut parameters = entities
        .iter()
        .filter_map(|marker| {
            let suffix = marker.strip_prefix(&prefix)?;
            let (index, typescript_type) = suffix.split_once(':')?;
            Some((index.parse::<usize>().ok()?, typescript_type.to_string()))
        })
        .collect::<Vec<_>>();
    parameters.sort_by_key(|(index, _)| *index);
    return parameters
        .into_iter()
        .map(|(_, typescript_type)| typescript_type)
        .collect();
}

fn fixed_buffer_type(rust_type: &Type) -> Option<&'static str> {
    return match rust_type {
        Type::Paren(paren) => fixed_buffer_type(&paren.elem),
        Type::Reference(reference) if reference.mutability.is_some() => {
            fixed_buffer_value_type(&reference.elem)
        }
        _ => None,
    };
}

fn fixed_buffer_value_type(rust_type: &Type) -> Option<&'static str> {
    return match rust_type {
        Type::Array(array) => typed_array_for_type(&array.elem),
        Type::Paren(paren) => fixed_buffer_value_type(&paren.elem),
        Type::Path(path) => match path.path.segments.last()?.ident.to_string().as_str() {
            "Float32Array" => Some("Float32Array"),
            "Float64Array" => Some("Float64Array"),
            "Int8Array" => Some("Int8Array"),
            "Int16Array" => Some("Int16Array"),
            "Int32Array" => Some("Int32Array"),
            "Uint8Array" => Some("Uint8Array"),
            "Uint16Array" => Some("Uint16Array"),
            "Uint32Array" => Some("Uint32Array"),
            _ => None,
        },
        Type::Slice(slice) => typed_array_for_type(&slice.elem),
        _ => None,
    };
}

// The typed array a fixed array of a typed-array primitive lowers to (`[f64; 4]` is `Float64Array`),
// seen through references.
fn fixed_typed_array_type(rust_type: &Type) -> Option<&'static str> {
    return match rust_type {
        Type::Array(array) => typed_array_for_type(&array.elem),
        Type::Group(group) => fixed_typed_array_type(&group.elem),
        Type::Paren(paren) => fixed_typed_array_type(&paren.elem),
        Type::Reference(reference) => fixed_typed_array_type(&reference.elem),
        _ => None,
    };
}

fn inferred_fixed_buffer_type(entities: &HashSet<String>, local: &str) -> Option<String> {
    let prefix = format!("{FIXED_BUFFER_LOCAL_MARKER}{local}:");
    return entities
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix).map(str::to_string));
}

fn unwrap_option_payload_is_string(receiver: &Expr, entities: &HashSet<String>) -> bool {
    match receiver {
        Expr::Call(call) => {
            if let Expr::Path(path) = call.func.as_ref() {
                if path.qself.is_none() {
                    return call_fact(entities, OPTION_RETURN_MARKER, &path.path)
                        .is_some_and(|payload| payload == "String" || payload == "str");
                }
            }
            false
        }
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            matches!(
                lexical_fact(entities, &path.path.segments[0].ident.to_string()),
                Some(BindingFact::Option(inner)) if matches!(inner.as_ref(), BindingFact::Structure(s) if s == "String" || s == "str")
            )
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "as_ref" | "as_mut" | "clone" | "cloned" | "copied"
                ) =>
        {
            unwrap_option_payload_is_string(&call.receiver, entities)
        }
        Expr::MethodCall(call)
            if call.method == "next"
                && call.args.is_empty()
                && matches!(call.receiver.as_ref(), Expr::MethodCall(inner)
                    if matches!(inner.method.to_string().as_str(),
                        "chars" | "split" | "splitn" | "rsplit" | "rsplitn"
                        | "split_whitespace" | "split_ascii_whitespace"
                        | "lines" | "split_terminator")
                        && expression_is_known_string(&inner.receiver, entities)) =>
        {
            true
        }
        Expr::Reference(reference) => unwrap_option_payload_is_string(&reference.expr, entities),
        Expr::Paren(paren) => unwrap_option_payload_is_string(&paren.expr, entities),
        Expr::Group(group) => unwrap_option_payload_is_string(&group.expr, entities),
        _ => false,
    }
}

fn unwrap_result_payload_is_string(receiver: &Expr, entities: &HashSet<String>) -> bool {
    match receiver {
        Expr::Call(call) => {
            if let Expr::Path(path) = call.func.as_ref() {
                if expression_is_associated_path(call.func.as_ref(), "serde_json", "to_string")
                    || expression_is_associated_path(
                        call.func.as_ref(),
                        "serde_json",
                        "to_string_pretty",
                    )
                {
                    return true;
                }
                if path.qself.is_none() {
                    return call_fact(entities, RETURN_BINDING_FACT_MARKER, &path.path)
                        .as_ref()
                        .is_some_and(|fact| {
                            matches!(
                                binding_fact_from_marker(fact),
                                BindingFact::Structure(s) if s == "String" || s == "str"
                            )
                        });
                }
            }
            false
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "as_ref" | "as_mut" | "clone"
                ) =>
        {
            unwrap_result_payload_is_string(&call.receiver, entities)
        }
        Expr::Reference(reference) => unwrap_result_payload_is_string(&reference.expr, entities),
        Expr::Paren(paren) => unwrap_result_payload_is_string(&paren.expr, entities),
        Expr::Group(group) => unwrap_result_payload_is_string(&group.expr, entities),
        _ => false,
    }
}

fn for_loop_iterates_strings(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::MethodCall(call) => {
            matches!(
                call.method.to_string().as_str(),
                "lines"
                    | "split"
                    | "split_ascii_whitespace"
                    | "split_terminator"
                    | "split_whitespace"
                    | "splitn"
            ) && expression_is_known_string(&call.receiver, entities)
        }
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            matches!(
                lexical_fact(entities, &path.path.segments[0].ident.to_string()),
                Some(BindingFact::Sequence(element))
                    if matches!(element.as_ref(), BindingFact::Structure(s) if s == "String" || s == "str")
            )
        }
        Expr::Reference(reference) => for_loop_iterates_strings(&reference.expr, entities),
        _ => false,
    };
}

// Whether an `if let` / `while let` scrutinee can be read twice with one result: a binding or a
// field chain over one, through the identity adapters `.as_ref()`, `.as_mut()` and `.as_deref()`.
pub(crate) fn option_scrutinee_is_rereadable(condition: &Expr) -> bool {
    let Expr::Let(binding) = condition else {
        return true;
    };
    return expression_is_rereadable(&binding.expr);
}

// Views of one allocation that `Arc::ptr_eq` sees through: borrows, clones, guards of an erased
// `RwLock`/`Mutex`, and the `Some` payload of an `Option` handle.
fn peel_shared_view(expression: &Expr) -> &Expr {
    let mut expression = expression;
    loop {
        expression = match expression {
            Expr::Group(group) => &group.expr,
            Expr::Paren(paren) => &paren.expr,
            Expr::Reference(reference) => &reference.expr,
            Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => &unary.expr,
            Expr::MethodCall(call)
                if call.args.is_empty()
                    && matches!(
                        call.method.to_string().as_str(),
                        "as_deref"
                            | "as_mut"
                            | "as_ref"
                            | "clone"
                            | "lock"
                            | "read"
                            | "unwrap"
                            | "write"
                    ) =>
            {
                &call.receiver
            }
            Expr::Call(call)
                if (expression_is_associated_path(&call.func, "Arc", "clone")
                    || expression_is_associated_path(&call.func, "Rc", "clone"))
                    && call.args.len() == 1 =>
            {
                &call.args[0]
            }
            _ => return expression,
        };
    }
}

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

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum SourceAccess {
    Local,
    Crate,
    Public,
}

fn rust_type_is_ordered_primitive(rust_type: &Type) -> bool {
    return matches!(
        named_type(rust_type).as_deref(),
        Some(
            "i8" | "i16"
                | "i32"
                | "i64"
                | "isize"
                | "u8"
                | "u16"
                | "u32"
                | "u64"
                | "usize"
                | "String"
                | "str"
        )
    );
}

fn rust_type_is_sequence(rust_type: &Type) -> bool {
    return match rust_type {
        Type::Group(group) => rust_type_is_sequence(&group.elem),
        Type::Paren(paren) => rust_type_is_sequence(&paren.elem),
        Type::Reference(reference) => rust_type_is_sequence(&reference.elem),
        Type::Array(_) | Type::Slice(_) => true,
        Type::Path(path) => path
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "Vec"),
        _ => false,
    };
}

// A declared type whose TypeScript lowering is an identity-bearing object that `===` compares by
// allocation: a source struct, a collection, a callable, a `Mutex` cell or an opaque `dyn Any`, seen
// through `Arc` / `Rc` / `RwLock` / `Ref` layers and source type aliases. A primitive, string, unit,
// `Option` or type parameter is not: its lowering is a value.
fn rust_type_is_shared_identity(entities: &HashSet<String>, rust_type: &Type) -> bool {
    return context_type_identity(entities, rust_type).is_some()
        || shared_identity_type_at_depth(
            entities,
            current_source(entities).as_deref(),
            rust_type,
            0,
        );
}

// The typed array each element of a sequence expression is: a local or parameter typed as a sequence
// of fixed typed-primitive arrays (`Vec<[f64; 2]>`), or a struct field so declared.
fn sequence_element_typed_array(expression: &Expr, entities: &HashSet<String>) -> Option<String> {
    return match expression {
        Expr::Field(field) => {
            let syn::Member::Named(field_name) = &field.member else {
                return None;
            };
            let identity = expression_struct_name(&field.base, entities)?;
            unique_marker_suffix(
                entities,
                &format!(
                    "{TYPED_ARRAY_SEQUENCE_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                ),
            )
        }
        Expr::Group(group) => sequence_element_typed_array(&group.expr, entities),
        Expr::Paren(paren) => sequence_element_typed_array(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            match lexical_fact(entities, &path.path.segments[0].ident.to_string()) {
                Some(BindingFact::Sequence(element)) => match *element {
                    BindingFact::TypedArray(array_type) => Some(array_type),
                    _ => None,
                },
                _ => None,
            }
        }
        Expr::Reference(reference) => sequence_element_typed_array(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            sequence_element_typed_array(&unary.expr, entities)
        }
        _ => None,
    };
}

fn sequence_inner_type(rust_type: &Type) -> Option<&Type> {
    return match rust_type {
        Type::Array(array) => Some(&array.elem),
        Type::Group(group) => sequence_inner_type(&group.elem),
        Type::Paren(paren) => sequence_inner_type(&paren.elem),
        Type::Reference(reference) => sequence_inner_type(&reference.elem),
        Type::Slice(slice) => Some(&slice.elem),
        Type::Path(path) => {
            let segment = path.path.segments.last()?;
            if segment.ident != "Vec" {
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
            types.next().is_none().then_some(inner)
        }
        _ => None,
    };
}

fn standard_vec_inner_type<'a>(
    rust_type: &'a Type,
    entities: &HashSet<String>,
) -> Option<&'a Type> {
    return match rust_type {
        Type::Group(group) => standard_vec_inner_type(&group.elem, entities),
        Type::Paren(paren) => standard_vec_inner_type(&paren.elem, entities),
        Type::Reference(reference) => standard_vec_inner_type(&reference.elem, entities),
        Type::Path(path)
            if path.qself.is_none() && type_path_is_standard_vec(&path.path, entities) =>
        {
            sequence_inner_type(rust_type)
        }
        _ => None,
    };
}

fn type_path_is_standard_vec(path: &syn::Path, entities: &HashSet<String>) -> bool {
    if resolve_type_path(path, entities).is_some_and(|path| is_standard_type_path(&path, "Vec")) {
        return true;
    }
    // A bare `Vec` is supplied by the standard prelude unless this source explicitly declares or
    // imports a type-namespace binding with that name. Vitest suites often have `use super::*`, whose
    // wildcard prevents the general resolver from choosing a prelude fallback even when the selected
    // production sources contribute no `Vec` declaration.
    return path.leading_colon.is_none()
        && path.segments.len() == 1
        && path.segments[0].ident == "Vec"
        && !entities.contains(&format!("{TYPE_LOCAL_MARKER}Vec"))
        && !entities.contains(&format!("{TYPE_USE_MARKER}Vec"));
}

fn rust_type_contains_current_parameter(rust_type: &Type, entities: &HashSet<String>) -> bool {
    struct TypeParameterFinder<'a> {
        entities: &'a HashSet<String>,
        found: bool,
    }

    impl<'ast> Visit<'ast> for TypeParameterFinder<'_> {
        fn visit_type_path(&mut self, path: &'ast syn::TypePath) {
            if path.qself.is_none()
                && path.path.segments.iter().any(|segment| {
                    self.entities
                        .contains(&format!("{TYPE_PARAMETER_MARKER}{}", segment.ident))
                })
            {
                self.found = true;
                return;
            }
            syn::visit::visit_type_path(self, path);
        }
    }

    let mut finder = TypeParameterFinder {
        entities,
        found: false,
    };
    finder.visit_type(rust_type);
    return finder.found;
}

fn safe_collection_element_typescript_type(
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Option<String> {
    if rust_type_contains_current_parameter(rust_type, entities) {
        return None;
    }
    let typescript_type = emit_type(rust_type, entities).ok()?;
    if typescript_type
        .split(|character: char| !(character.is_ascii_alphanumeric() || character == '_'))
        .any(|part| matches!(part, "any" | "never" | "unknown"))
    {
        return None;
    }
    return Some(typescript_type);
}

fn binding_fact_typescript_type(fact: &BindingFact, entities: &HashSet<String>) -> Option<String> {
    return match fact {
        BindingFact::Option(payload) => {
            let payload = binding_fact_typescript_type(payload, entities)?;
            Some(if entities.contains(NULLABLE_OPTIONS_MARKER) {
                nullable_type(payload)
            } else if payload.contains("=>") {
                format!("({payload}) | undefined")
            } else {
                format!("{payload} | undefined")
            })
        }
        BindingFact::Sequence(element) => {
            binding_fact_typescript_type(element, entities).map(array_type)
        }
        BindingFact::Structure(identity)
            if matches!(
                identity.as_str(),
                "bool"
                    | "char"
                    | "f32"
                    | "f64"
                    | "i8"
                    | "i16"
                    | "i32"
                    | "i64"
                    | "isize"
                    | "str"
                    | "String"
                    | "u8"
                    | "u16"
                    | "u32"
                    | "u64"
                    | "usize"
            ) =>
        {
            syn::parse_str::<Type>(identity)
                .ok()
                .and_then(|rust_type| safe_collection_element_typescript_type(&rust_type, entities))
        }
        BindingFact::Tuple(elements) => elements
            .iter()
            .map(|element| binding_fact_typescript_type(element, entities))
            .collect::<Option<Vec<_>>>()
            .map(|elements| format!("readonly [{}]", elements.join(", "))),
        BindingFact::TypedArray(array_type) => Some(array_type.clone()),
        BindingFact::HashMap
        | BindingFact::HashSet
        | BindingFact::Structure(_)
        | BindingFact::Unknown
        | BindingFact::UnresolvedPattern => None,
    };
}

pub(super) enum EmptyVecInitializer<'a> {
    Standard(Option<&'a Type>),
    UnprovenOwner,
}

fn empty_vec_initializer<'a>(
    expression: &'a Expr,
    entities: &HashSet<String>,
) -> Option<EmptyVecInitializer<'a>> {
    return match expression {
        Expr::Call(call) => {
            let Expr::Path(function) = call.func.as_ref() else {
                return None;
            };
            if function.qself.is_some() {
                return None;
            }
            let mut owner = function.path.clone();
            let member = owner.segments.pop()?.into_value();
            if !matches!(member.ident.to_string().as_str(), "new" | "with_capacity")
                || (member.ident == "new" && !call.args.is_empty())
                || (member.ident == "with_capacity" && call.args.len() != 1)
            {
                return None;
            }
            let owner_segment = function.path.segments.iter().rev().nth(1)?;
            if owner_segment.ident != "Vec" {
                let resolved = resolve_type_path(&owner, entities)?;
                if !is_standard_type_path(&resolved, "Vec") {
                    return None;
                }
            }
            let element = match &owner_segment.arguments {
                PathArguments::None => None,
                PathArguments::AngleBracketed(arguments) => {
                    let mut types = arguments.args.iter().filter_map(|argument| match argument {
                        GenericArgument::Type(rust_type) => Some(rust_type),
                        _ => None,
                    });
                    let element = types.next();
                    if element.is_none() || types.next().is_some() {
                        return Some(EmptyVecInitializer::UnprovenOwner);
                    }
                    element
                }
                PathArguments::Parenthesized(_) => {
                    return Some(EmptyVecInitializer::UnprovenOwner);
                }
            };
            Some(if type_path_is_standard_vec(&owner, entities) {
                EmptyVecInitializer::Standard(element)
            } else {
                EmptyVecInitializer::UnprovenOwner
            })
        }
        Expr::Group(group) => empty_vec_initializer(&group.expr, entities),
        Expr::Macro(invocation)
            if invocation.mac.path.is_ident("vec") && invocation.mac.tokens.is_empty() =>
        {
            Some(EmptyVecInitializer::Standard(None))
        }
        Expr::Paren(paren) => empty_vec_initializer(&paren.expr, entities),
        _ => None,
    };
}

fn rust_type_is_string(rust_type: &Type) -> bool {
    return matches!(named_type(rust_type).as_deref(), Some("String" | "str"));
}

fn rust_type_is_json_value(rust_type: &Type, context: &HashSet<String>) -> bool {
    let inner = match rust_type {
        Type::Group(group) => return rust_type_is_json_value(&group.elem, context),
        Type::Paren(paren) => return rust_type_is_json_value(&paren.elem, context),
        Type::Reference(reference) => return rust_type_is_json_value(&reference.elem, context),
        Type::Path(path) if path.qself.is_none() => path,
        _ => return false,
    };
    let Some(resolved) = resolve_type_path(&inner.path, context) else {
        return false;
    };
    return matches!(
        resolved
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .as_slice(),
        ["serde_json", "Value"] | ["serde_json", "value", "Value"]
    );
}

fn call_turbofish_is_json_value(expression: &Expr, context: &HashSet<String>) -> bool {
    let Expr::Call(call) = expression else {
        return false;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return false;
    };
    let Some(last_segment) = path.path.segments.last() else {
        return false;
    };
    let PathArguments::AngleBracketed(turbofish) = &last_segment.arguments else {
        return false;
    };
    return turbofish.args.iter().any(|arg| {
        matches!(arg, GenericArgument::Type(rust_type) if rust_type_is_json_value(rust_type, context))
    });
}

// `Ref<T>` and the spelling it aliases (`Arc<RwLock<T>>`) both lower to the payload rather than a
// target-language cell. A clone of one of those fields therefore needs a forwarding alias when Rust
// later writes through the cloned cell. Names alone are insufficient: a local `Ref`/`Arc`/`RwLock`
// declaration must not acquire standard-library semantics.
fn rust_type_is_erased_shared_cell(rust_type: &Type, context: &HashSet<String>) -> bool {
    let path = match rust_type {
        Type::Group(group) => return rust_type_is_erased_shared_cell(&group.elem, context),
        Type::Paren(paren) => return rust_type_is_erased_shared_cell(&paren.elem, context),
        Type::Path(path) if path.qself.is_none() => path,
        _ => return false,
    };
    let Some(resolved) = resolve_type_path(&path.path, context) else {
        return false;
    };
    let resolved = resolved.iter().map(String::as_str).collect::<Vec<_>>();
    if matches!(
        resolved.as_slice(),
        ["flight_entity", "Ref"] | ["flight_entity", "ir", "Ref"]
    ) {
        return true;
    }
    if !matches!(resolved.as_slice(), ["std" | "alloc", "sync", "Arc"]) {
        return false;
    }
    let Some(segment) = path.path.segments.last() else {
        return false;
    };
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return false;
    };
    let mut types = arguments.args.iter().filter_map(|argument| match argument {
        GenericArgument::Type(rust_type) => Some(rust_type),
        _ => None,
    });
    let Some(Type::Path(inner)) = types.next() else {
        return false;
    };
    if types.next().is_some() || inner.qself.is_some() {
        return false;
    }
    return resolve_type_path(&inner.path, context).is_some_and(|inner| {
        matches!(
            inner
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                .as_slice(),
            ["std", "sync", "RwLock"]
        )
    });
}

pub(super) fn rust_default_expression(rust_type: &Type) -> Option<String> {
    return match rust_type {
        Type::Group(group) => rust_default_expression(&group.elem),
        Type::Paren(paren) => rust_default_expression(&paren.elem),
        Type::Path(path) => {
            let segment = path.path.segments.last()?;
            let name = segment.ident.to_string();
            match name.as_str() {
                "bool" => Some("false".to_string()),
                "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32"
                | "u64" | "usize" => Some("0".to_string()),
                "String" => Some("''".to_string()),
                "Option" => Some("undefined".to_string()),
                "Vec" => Some("[]".to_string()),
                "HashMap" | "BTreeMap" => Some("new Map()".to_string()),
                "HashSet" | "BTreeSet" => Some("new Set()".to_string()),
                "Record" => Some("{}".to_string()),
                "Arc" | "Box" | "Rc" | "Ref" | "RwLock" => {
                    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                        return None;
                    };
                    arguments.args.iter().find_map(|argument| match argument {
                        GenericArgument::Type(rust_type) => rust_default_expression(rust_type),
                        _ => None,
                    })
                }
                "Mutex" => {
                    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                        return None;
                    };
                    let inner = arguments.args.iter().find_map(|argument| match argument {
                        GenericArgument::Type(rust_type) => rust_default_expression(rust_type),
                        _ => None,
                    })?;
                    Some(format!("{{ value: {inner} }}"))
                }
                _ => None,
            }
        }
        Type::Reference(reference) => rust_default_expression(&reference.elem),
        Type::Array(array) => {
            if let Some(typed_array) = typed_array_for_type(&array.elem) {
                let Expr::Lit(lit) = &array.len else {
                    return None;
                };
                let Lit::Int(len) = &lit.lit else {
                    return None;
                };
                Some(format!("new {typed_array}({})", len.base10_digits()))
            } else {
                let element_default = rust_default_expression(&array.elem)?;
                let Expr::Lit(lit) = &array.len else {
                    return None;
                };
                let Lit::Int(len) = &lit.lit else {
                    return None;
                };
                let count: usize = len.base10_digits().parse().ok()?;
                let elements = vec![element_default; count];
                Some(format!("[{}]", elements.join(", ")))
            }
        }
        Type::Tuple(tuple) => tuple
            .elems
            .iter()
            .map(rust_default_expression)
            .collect::<Option<Vec<_>>>()
            .map(|elements| format!("[{}]", elements.join(", "))),
        _ => None,
    };
}

fn entity_field_default(
    rust_type: &Type,
    entity_types: &HashSet<String>,
    entities: &HashSet<String>,
) -> Option<String> {
    return match rust_type {
        Type::Path(path) if path.qself.is_none() => {
            let segment = path.path.segments.last()?;
            let name = segment.ident.to_string();
            if entity_types.contains(&name) {
                let ts_type = format!("{name}Raw");
                let arguments = emit_path_type_arguments(segment, entities).ok()?;
                return entity_allocation_of(&ts_type, &format!("{ts_type}{arguments}"), entities)
                    .ok();
            }
            let enum_prefix = format!("{ENUM_DEFAULT_VARIANT_MARKER}{name}:");
            if let Some(variant) = entities
                .iter()
                .find_map(|marker| marker.strip_prefix(&enum_prefix))
            {
                return Some(format!("{name}.{variant}"));
            }
            match name.as_str() {
                "Arc" | "Box" | "Rc" | "Ref" | "RwLock" => {
                    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                        return None;
                    };
                    arguments.args.iter().find_map(|argument| match argument {
                        GenericArgument::Type(inner) => {
                            entity_field_default(inner, entity_types, entities)
                        }
                        _ => None,
                    })
                }
                _ => None,
            }
        }
        Type::Reference(reference) => entity_field_default(&reference.elem, entity_types, entities),
        _ => None,
    };
}

pub(super) fn rust_literal_to_typescript(expression: &Expr) -> Option<String> {
    return match expression {
        Expr::Lit(literal) => match &literal.lit {
            Lit::Int(integer) => Some(integer.base10_digits().to_string()),
            Lit::Float(float) => {
                let value: f64 = float.base10_parse().ok()?;
                if value.fract() == 0.0 {
                    Some(format!("{}", value as i64))
                } else {
                    Some(value.to_string())
                }
            }
            Lit::Bool(flag) => Some(if flag.value { "true" } else { "false" }.to_string()),
            Lit::Str(string) => Some(js_string_literal(&string.value())),
            _ => None,
        },
        Expr::Unary(unary) if matches!(unary.op, syn::UnOp::Neg(_)) => {
            let inner = rust_literal_to_typescript(&unary.expr)?;
            Some(format!("-{inner}"))
        }
        _ => None,
    };
}

fn custom_default_field_values(
    impl_item: &syn::ItemImpl,
    structure: &ItemStruct,
) -> Option<BTreeMap<String, String>> {
    let (_, trait_path, _) = impl_item.trait_.as_ref()?;
    let last_segment = trait_path.segments.last()?;
    if last_segment.ident != "Default" {
        return None;
    }
    let self_name = match impl_item.self_ty.as_ref() {
        Type::Path(path) => path.path.segments.last()?.ident.to_string(),
        _ => return None,
    };
    if self_name != structure.ident.to_string() {
        return None;
    }
    let default_fn = impl_item.items.iter().find_map(|item| match item {
        syn::ImplItem::Fn(function) if function.sig.ident == "default" => Some(function),
        _ => None,
    })?;
    let literal = match default_fn.block.stmts.as_slice() {
        [Stmt::Expr(Expr::Return(returned), _)] => {
            if let Some(Expr::Struct(literal)) = returned.expr.as_deref() {
                Some(literal)
            } else {
                None
            }
        }
        [Stmt::Expr(Expr::Struct(literal), None)] => Some(literal),
        _ => None,
    }?;
    let mut overrides = BTreeMap::new();
    for field_value in &literal.fields {
        let syn::Member::Named(member) = &field_value.member else {
            continue;
        };
        let field = structure
            .fields
            .iter()
            .find(|f| f.ident.as_ref() == Some(member))?;
        if !is_public(&field.vis) {
            continue;
        }
        let default = rust_default_expression(&field.ty);
        let actual = rust_literal_to_typescript(&field_value.expr);
        if let (Some(default), Some(actual)) = (&default, &actual) {
            if default != actual {
                let field_name = snake_to_lower_camel(&member.to_string());
                overrides.insert(field_name, actual.clone());
            }
        }
    }
    return Some(overrides);
}

pub(super) fn rust_type_description(rust_type: &Type) -> String {
    return rust_type
        .to_token_stream()
        .to_string()
        .replace(" :: ", "::")
        .replace(" < ", "<")
        .replace(" >", ">")
        .replace(" ; ", "; ");
}

fn entity_allocation(
    typescript_type: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return entity_allocation_of(typescript_type, typescript_type, entities);
}

// The `allocate_entity` default for the entity `typescript_type`, allocated as `allocated_type`: the
// same `Raw` record carrying the declared generic arguments of the field it fills
// (`Signal<KeyData>` allocates `SignalRaw<KeyData>`), while default fields resolve by the bare name.
fn entity_allocation_of(
    typescript_type: &str,
    allocated_type: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let unsupported_prefix = format!("{ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER}{typescript_type}:");
    let mut unsupported_fields = entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(&unsupported_prefix))
        .filter_map(|field| field.split_once(':'))
        .filter(|(field, _)| {
            !entities.contains(&format!(
                "{ENTITY_ALLOCATION_INITIALIZED_FIELD_MARKER}{typescript_type}:{field}"
            ))
        })
        .collect::<Vec<_>>();
    unsupported_fields.sort();
    if let Some((field, rust_type)) = unsupported_fields.first() {
        return Err(compile_error(format!(
            "cannot lower `allocate_entity` default for `{typescript_type}.{field}`: unsupported Rust field type `{rust_type}`"
        )));
    }

    let prefix = format!("{ENTITY_DEFAULT_FIELD_MARKER}{typescript_type}:");
    let mut fields = entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(&prefix))
        .filter_map(|field| field.split_once(':'))
        .filter(|(field, _)| {
            !entities.contains(&format!(
                "{ENTITY_ALLOCATION_OMITTED_FIELD_MARKER}{typescript_type}:{field}"
            ))
        })
        .map(|(field, value)| format!("{field}: {value}"))
        .collect::<Vec<_>>();
    fields.sort();
    let allocation = format!("allocateEntity<{allocated_type}>()");
    if fields.is_empty() {
        return Ok(allocation);
    }
    return Ok(format!(
        "Object.assign({allocation}, {{ {} }})",
        fields.join(", ")
    ));
}

// Whether a shadow initializer of parameter `name` provably evaluates to the parameter's own
// TypeScript type, so assigning it back to the parameter typechecks: a clone of the parameter,
// numeric arithmetic, casts and numeric methods of a numeric parameter, string-producing methods
// of a string parameter, and an `unwrap_or*` default of an `Option` parameter.
fn shadow_preserves_parameter_type(name: &str, parameter_type: &Type, initializer: &Expr) -> bool {
    const NUMERIC_TYPES: &[&str] = &[
        "f32", "f64", "i8", "i16", "i32", "i64", "isize", "u8", "u16", "u32", "u64", "usize",
    ];
    const NUMERIC_METHODS: &[&str] = &[
        "abs",
        "ceil",
        "clamp",
        "floor",
        "max",
        "min",
        "rem_euclid",
        "round",
        "saturating_add",
        "saturating_sub",
        "signum",
        "sqrt",
        "trunc",
        "wrapping_add",
        "wrapping_mul",
        "wrapping_sub",
    ];
    const STRING_METHODS: &[&str] = &[
        "to_ascii_lowercase",
        "to_ascii_uppercase",
        "to_lowercase",
        "to_owned",
        "to_string",
        "to_uppercase",
        "trim",
        "trim_end",
        "trim_start",
    ];
    fn strip(expression: &Expr) -> &Expr {
        return match expression {
            Expr::Group(group) => strip(&group.expr),
            Expr::Paren(paren) => strip(&paren.expr),
            Expr::Reference(reference) => strip(&reference.expr),
            expression => expression,
        };
    }
    fn type_name(rust_type: &Type) -> Option<String> {
        return match rust_type {
            Type::Reference(reference) => type_name(&reference.elem),
            Type::Paren(paren) => type_name(&paren.elem),
            Type::Path(path) if path.qself.is_none() => path
                .path
                .segments
                .last()
                .map(|segment| segment.ident.to_string()),
            _ => None,
        };
    }
    let is_parameter = |expression: &Expr| {
        return matches!(strip(expression), Expr::Path(path) if path.qself.is_none() && path.path.is_ident(name));
    };
    let initializer = strip(initializer);
    if let Expr::MethodCall(call) = initializer
        && matches!(call.method.to_string().as_str(), "clone" | "to_owned")
        && call.args.is_empty()
        && is_parameter(&call.receiver)
    {
        return true;
    }
    if let Expr::Call(call) = initializer
        && let Expr::Path(function) = call.func.as_ref()
        && function.path.segments.len() == 2
        && matches!(
            function.path.segments[0].ident.to_string().as_str(),
            "Arc" | "Rc"
        )
        && function.path.segments[1].ident == "clone"
        && call.args.len() == 1
        && is_parameter(&call.args[0])
    {
        return true;
    }
    let Some(parameter_type_name) = type_name(parameter_type) else {
        return false;
    };
    if NUMERIC_TYPES.contains(&parameter_type_name.as_str()) {
        return match initializer {
            Expr::Binary(binary) => matches!(
                binary.op,
                BinOp::Add(_)
                    | BinOp::Sub(_)
                    | BinOp::Mul(_)
                    | BinOp::Div(_)
                    | BinOp::Rem(_)
                    | BinOp::BitAnd(_)
                    | BinOp::BitOr(_)
                    | BinOp::BitXor(_)
                    | BinOp::Shl(_)
                    | BinOp::Shr(_)
            ),
            Expr::Unary(unary) => matches!(unary.op, UnOp::Neg(_)),
            Expr::Cast(cast) => {
                type_name(&cast.ty).is_some_and(|target| NUMERIC_TYPES.contains(&target.as_str()))
            }
            Expr::MethodCall(call) => NUMERIC_METHODS.contains(&call.method.to_string().as_str()),
            _ => false,
        };
    }
    if matches!(parameter_type_name.as_str(), "str" | "String") {
        return matches!(initializer, Expr::MethodCall(call)
            if STRING_METHODS.contains(&call.method.to_string().as_str()));
    }
    if parameter_type_name == "Option" {
        return matches!(initializer, Expr::MethodCall(call)
            if matches!(call.method.to_string().as_str(), "unwrap_or" | "unwrap_or_default" | "unwrap_or_else")
                && is_parameter(&call.receiver));
    }
    return false;
}

// `rust_type_is_shared_identity` read in source `from` (or the bare context), expanding at most 16
// wrapper or alias layers so an alias cycle fails closed.
// The payload of `Arc::new` / `Rc::new` proven to lower to a fresh or existing object: a literal
// allocation, an erased `RwLock` around one, or a struct value.

// The type-namespace provenance (`use` items and local declarations) recorded for source `from`.
fn source_type_context(entities: &HashSet<String>, from: &str) -> HashSet<String> {
    return marker_suffixes(
        entities,
        &format!("{SOURCE_TYPE_PATH_CONTEXT_MARKER}{from}{PROVENANCE_SEPARATOR}"),
    )
    .into_iter()
    .collect();
}

// Whether a statement contains `return`, `?`, `break` or `continue` anywhere, closures included, so
// a definite-assignment scan stops conservatively before it. Tokens print space-separated.
fn statement_may_exit_early(statement: &Stmt) -> bool {
    return statement
        .to_token_stream()
        .to_string()
        .split(|character: char| character.is_whitespace())
        .any(|token| matches!(token, "return" | "break" | "continue" | "?"));
}

// An explicit `&mut` borrow of a place whose reassignment the caller observes (the `std::mem::swap` and
// `std::mem::replace` operands): a local binding, or a field or index chain over one. No `*` reborrow
// appears anywhere in the chain.
fn swap_operand_is_place(operand: &Expr) -> bool {
    fn is_place(expression: &Expr) -> bool {
        return match expression {
            Expr::Paren(paren) => is_place(&paren.expr),
            Expr::Group(group) => is_place(&group.expr),
            Expr::Path(path) => path.qself.is_none() && path.path.segments.len() == 1,
            Expr::Field(field) => is_place(&field.base),
            Expr::Index(index) => is_place(&index.expr),
            Expr::MethodCall(call) if call.args.is_empty() => is_place(&call.receiver),
            _ => false,
        };
    }
    return match operand {
        Expr::Paren(paren) => swap_operand_is_place(&paren.expr),
        Expr::Group(group) => swap_operand_is_place(&group.expr),
        Expr::Reference(reference) => reference.mutability.is_some() && is_place(&reference.expr),
        _ => false,
    };
}

// Whether any identifier token in `tokens`, at any group depth, is `name`.
fn tokens_contain_identifier(tokens: proc_macro2::TokenStream, name: &str) -> bool {
    return tokens.into_iter().any(|token| match token {
        proc_macro2::TokenTree::Ident(identifier) => identifier == name,
        proc_macro2::TokenTree::Group(group) => tokens_contain_identifier(group.stream(), name),
        _ => false,
    });
}

// An array literal or repeat in a typed-array position (`Float64Array`), constructed as that array.
fn typed_array_literal(
    expression: &Expr,
    array_type: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return match expression {
        Expr::Array(array) => {
            let elements = array
                .elems
                .iter()
                .map(|element| emit_expression(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("new {array_type}([{}])", elements.join(", ")))
        }
        Expr::Repeat(repeat) => Ok(format!(
            "new {array_type}({}).fill({})",
            emit_expression(&repeat.len, entities)?,
            emit_expression(&repeat.expr, entities)?
        )),
        _ => emit_expression(expression, entities),
    };
}

fn typed_binding_name(pattern: &Pat) -> Option<String> {
    return match pattern {
        Pat::Ident(identifier) => Some(identifier.ident.to_string()),
        Pat::Type(typed) => typed_binding_name(&typed.pat),
        _ => None,
    };
}

// A typed-array IR alias is target vocabulary only when the complete public Entity re-export chain
// resolves it to the rust-only `flight_entity::ir` owner and that owner's declaration is an exact
// primitive slice. An unrelated alias with the same spelling is not representation evidence.
fn canonical_entity_ir_typed_array_alias(
    rust_type: &Type,
    entities: &HashSet<String>,
    from: &str,
) -> Option<&'static str> {
    let rust_type = match rust_type {
        Type::Group(group) => {
            return canonical_entity_ir_typed_array_alias(&group.elem, entities, from);
        }
        Type::Paren(paren) => {
            return canonical_entity_ir_typed_array_alias(&paren.elem, entities, from);
        }
        rust_type => rust_type,
    };
    let Type::Path(path) = rust_type else {
        return None;
    };
    let (owner, alias) = resolve_path_owner(entities, TYPE_ALIAS_OWNER_MARKER, from, &path.path)?;
    if owner != "flight_entity::ir" {
        return None;
    }
    let definition = unique_marker_suffix(
        entities,
        &format!(
            "{TYPE_ALIAS_DEFINITION_MARKER}{owner}{PROVENANCE_SEPARATOR}{alias}{PROVENANCE_SEPARATOR}"
        ),
    )?;
    let Type::Slice(slice) = syn::parse_str::<Type>(&definition).ok()? else {
        return None;
    };
    return typed_array_for_type(&slice.elem);
}

// `slice` or `mut-slice` for a reference to a slice of a typed-array primitive, otherwise `other`.
pub(super) fn typed_slice_parameter_kind(rust_type: &Type) -> &'static str {
    return match rust_type {
        Type::Group(group) => typed_slice_parameter_kind(&group.elem),
        Type::Paren(paren) => typed_slice_parameter_kind(&paren.elem),
        Type::Reference(reference) => match reference.elem.as_ref() {
            Type::Slice(slice) if typed_array_for_type(&slice.elem).is_some() => {
                if reference.mutability.is_some() {
                    "mut-slice"
                } else {
                    "slice"
                }
            }
            _ => "other",
        },
        _ => "other",
    };
}

fn typed_slice_parameter_kind_with_provenance(
    rust_type: &Type,
    entities: &HashSet<String>,
    from: &str,
) -> &'static str {
    let rust_type = match rust_type {
        Type::Group(group) => {
            return typed_slice_parameter_kind_with_provenance(&group.elem, entities, from);
        }
        Type::Paren(paren) => {
            return typed_slice_parameter_kind_with_provenance(&paren.elem, entities, from);
        }
        rust_type => rust_type,
    };
    if let Type::Reference(reference) = rust_type
        && canonical_entity_ir_typed_array_alias(&reference.elem, entities, from)
            == Some("Uint8Array")
    {
        return if reference.mutability.is_some() {
            "uint8-mut-slice"
        } else {
            "uint8-slice"
        };
    }
    return typed_slice_parameter_kind(rust_type);
}

// The owner of the one loaded source alias named `name`, or nothing when none or several are loaded.
// flight-lint: allow(hashmap-iteration) the scan only counts matches; uniqueness does not depend on order
fn unique_alias_owner(entities: &HashSet<String>, name: &str) -> Option<(String, String)> {
    let mut owners = entities.iter().filter_map(|marker| {
        let rest = marker.strip_prefix(TYPE_ALIAS_DEFINITION_MARKER)?;
        let mut fields = rest.split(PROVENANCE_SEPARATOR);
        let (owner, alias) = (fields.next()?, fields.next()?);
        return (alias == name).then(|| owner.to_string());
    });
    let owner = owners.next()?;
    if owners.next().is_some() {
        return None;
    }
    return Some((owner, name.to_string()));
}

// Checks each dependency item bound by its mapped name against the complete emitted value namespace:
// local declarations and every import, including compiler-provided ones. Only the dependency's own
// unrenamed import may bind its name.
pub(crate) fn validate_dependency_export_name_bindings(
    context: &HashSet<String>,
    local_values: &BTreeSet<String>,
    imports: &BTreeMap<String, BTreeSet<String>>,
) -> Result<(), CompileError> {
    for (target, module, _) in dependency_export_name_bindings(context) {
        let imported = target
            .split_once('.')
            .map_or(target.as_str(), |(owner, _)| owner);
        if local_values.contains(imported) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` TypeScript name `{imported}` imported from `{module}` collides with a local item"
            )));
        }
        for (import_module, specifiers) in imports {
            for specifier in specifiers {
                let local = specifier
                    .rsplit_once(" as ")
                    .map_or(specifier.as_str(), |(_, local)| local);
                if local == imported && (*import_module != module || *specifier != imported) {
                    return Err(compile_error(format!(
                        "`flight-compiler: export-name` TypeScript name `{imported}` imported from `{module}` collides with another import from `{import_module}`"
                    )));
                }
            }
        }
    }
    return Ok(());
}

pub(super) fn vec_clone_optional(rust_type: &Type) -> Option<bool> {
    if let Some(inner) = option_inner_type(rust_type) {
        return (named_type(inner).as_deref() == Some("Vec")).then_some(true);
    }
    return (named_type(rust_type).as_deref() == Some("Vec")).then_some(false);
}

// `path` with its root crate made canonical: a root this source declares itself (a local `mod std`) is
// this crate's item unless the path is absolute (a leading empty segment for `::root`, which starts in
// the extern prelude); an `extern crate` binding is replaced by the crate it names; `std` without one is
// absent under `#![no_std]`, and `alloc` is never in scope without one.
// flight-lint: allow(hashmap-iteration) each local name has at most one recorded extern crate
pub(super) fn canonical_type_path_root(
    mut path: Vec<String>,
    context: &HashSet<String>,
) -> Option<Vec<String>> {
    let absolute = path.first().is_some_and(String::is_empty);
    if absolute {
        path.remove(0);
    }
    let first = path.first()?.clone();
    if !absolute && context.contains(&format!("{TYPE_LOCAL_MARKER}{first}")) {
        return Some(std::iter::once("crate".to_string()).chain(path).collect());
    }
    let prefix = format!("{TYPE_EXTERN_CRATE_MARKER}{first}{PROVENANCE_SEPARATOR}");
    if let Some(target) = context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix))
    {
        path[0] = target.to_string();
        return Some(path);
    }
    if (first == "std" && context.contains(TYPE_NO_STD_MARKER)) || first == "alloc" {
        return None;
    }
    return Some(path);
}

// Set / Map operations for a proven receiver, keeping Rust's return values: `HashSet::insert` returns
// whether the value was new, `HashSet::remove` whether it was present, and `HashMap::get` /
// `HashMap::insert` / `HashMap::remove` the current or previous value as an `Option`.

// Whether a resolved path names the standard-library item `name`: `Pin` in `std`/`core::pin`, `Box`
// in `std`/`alloc::boxed`, `Future` in `std`/`core::future`, and `Send` / `Sync` in
// `std`/`core::marker`.
fn is_standard_type_path(path: &[String], name: &str) -> bool {
    let (module, roots): (&str, &[&str]) = match name {
        "Box" => ("boxed", &["std", "alloc"]),
        "Future" => ("future", &["std", "core"]),
        "Pin" => ("pin", &["std", "core"]),
        "Send" | "Sync" => ("marker", &["std", "core"]),
        "Vec" => ("vec", &["std", "alloc"]),
        _ => return false,
    };
    return matches!(path, [root, path_module, path_name] if roots.contains(&root.as_str()) && path_module == module && path_name == name);
}

// The full path a type path names, following Rust's precedence: an explicit `use` (named, renamed or
// `self`), a local type-namespace declaration, a glob import, then the prelude (`Box`, `Future` and the
// marker traits) or an extern `std` / `core` / `alloc` root. `None` when that cannot be decided from this
// source: an unknown root, a prelude name it does not model, or a glob outside the standard library that
// could supply the name.
// flight-lint: allow(hashmap-iteration) each local name has at most one recorded import target
fn resolve_type_path(path: &syn::Path, context: &HashSet<String>) -> Option<Vec<String>> {
    let segments = path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    let (first, rest) = segments.split_first()?;
    if path.leading_colon.is_some() {
        return canonical_type_path_root(
            std::iter::once(String::new()).chain(segments).collect(),
            context,
        );
    }
    if context.contains(&format!("{TYPE_USE_MARKER}{first}")) {
        let prefix = format!("{TYPE_USE_TARGET_MARKER}{first}{PROVENANCE_SEPARATOR}");
        let imported = context
            .iter()
            .find_map(|marker| marker.strip_prefix(&prefix))?;
        let mut resolved = imported.split("::").map(str::to_string).collect::<Vec<_>>();
        resolved.extend(rest.iter().cloned());
        return canonical_type_path_root(resolved, context);
    }
    if context.contains(&format!("{TYPE_LOCAL_MARKER}{first}"))
        || matches!(first.as_str(), "crate" | "self" | "super" | "Self")
    {
        return Some(
            std::iter::once("crate".to_string())
                .chain(segments.iter().cloned())
                .collect(),
        );
    }
    let globs = context
        .iter()
        .filter_map(|marker| marker.strip_prefix(TYPE_USE_GLOB_MARKER))
        .map(|glob| {
            return canonical_type_path_root(
                glob.split("::").map(str::to_string).collect(),
                context,
            );
        })
        .collect::<Option<Vec<_>>>()?;
    if globs.iter().any(|glob| {
        !matches!(
            glob.first().map(String::as_str),
            Some("std" | "core" | "alloc" | "crate")
        )
    }) {
        return None;
    }
    if rest.is_empty() {
        for glob in globs {
            let candidate = glob
                .into_iter()
                .chain(std::iter::once(first.clone()))
                .collect::<Vec<_>>();
            if is_standard_type_path(&candidate, first) {
                return Some(candidate);
            }
        }
        let prelude = match first.as_str() {
            "Box" if context.contains(TYPE_NO_STD_MARKER) => return None,
            "Box" => "std::boxed::Box",
            "Default" => "core::default::Default",
            "Future" => "core::future::Future",
            "Send" => "core::marker::Send",
            "Sized" => "core::marker::Sized",
            "Sync" => "core::marker::Sync",
            "Unpin" => "core::marker::Unpin",
            "Vec" if context.contains(TYPE_NO_STD_MARKER) => return None,
            "Vec" => "std::vec::Vec",
            _ => return None,
        };
        return Some(prelude.split("::").map(str::to_string).collect());
    }
    if matches!(first.as_str(), "std" | "core" | "alloc")
        || marker_suffixes(context, TYPE_EXTERN_CRATE_MARKER)
            .iter()
            .any(|binding| binding.split(PROVENANCE_SEPARATOR).next() == Some(first.as_str()))
    {
        return canonical_type_path_root(segments, context);
    }
    return None;
}

// The `std::mem` function a call path names: `std::mem::f` / `core::mem::f`; `mem::take` /
// `mem::replace` / `mem::swap`; `m::f` through a `use std::mem [as m]` module import; or `f` through a
// direct, aliased, grouped, or wildcard `use std::mem::...` import recorded by
// `insert_std_mem_import_context`. These move values in place, which has no TypeScript lowering.
fn std_mem_function(expression: &Expr, context: &HashSet<String>) -> Option<String> {
    let Expr::Path(path) = expression else {
        return None;
    };
    if path.qself.is_some() {
        return None;
    }
    let segments = path
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    return match segments.as_slice() {
        [root, module, name] if (root == "std" || root == "core") && module == "mem" => {
            Some(name.clone())
        }
        [module, name]
            if (module == "mem" && matches!(name.as_str(), "replace" | "swap" | "take"))
                || context.contains(&format!("{STD_MEM_MODULE_MARKER}{module}")) =>
        {
            Some(name.clone())
        }
        [local] => std_mem_imported_function(context, local),
        _ => None,
    };
}

// The `std::mem` function a single-segment call name was imported as, if any.
// flight-lint: allow(hashmap-iteration) each local name has at most one recorded std::mem function
fn std_mem_imported_function(context: &HashSet<String>, local: &str) -> Option<String> {
    if context.contains(&format!("{STD_MEM_FUNCTION_MARKER}{local}")) {
        let prefix = format!("{STD_MEM_FUNCTION_TARGET_MARKER}{local}:");
        return context
            .iter()
            .find_map(|marker| marker.strip_prefix(&prefix))
            .map(str::to_string);
    }
    if context.contains(STD_MEM_GLOB_MARKER)
        && !context.contains(&format!("{STD_MEM_SHADOWED_MARKER}{local}"))
        && STD_MEM_FUNCTIONS.contains(&local)
    {
        return Some(local.to_string());
    }
    return None;
}

fn turbofish_type(expression: &Expr) -> Option<String> {
    let Expr::Path(path) = expression else {
        return None;
    };
    let last = path.path.segments.last()?;
    let syn::PathArguments::AngleBracketed(args) = &last.arguments else {
        return None;
    };
    if args.args.len() != 1 {
        return None;
    }
    let syn::GenericArgument::Type(rust_type) = args.args.first()? else {
        return None;
    };
    let Type::Path(type_path) = rust_type else {
        return None;
    };
    return Some(
        type_path
            .path
            .segments
            .iter()
            .map(|segment| segment.ident.to_string())
            .collect::<Vec<_>>()
            .join("::"),
    );
}

fn size_of_rust_type(name: &str) -> Option<usize> {
    return match name {
        "u8" | "i8" | "bool" => Some(1),
        "u16" | "i16" => Some(2),
        "u32" | "i32" | "f32" => Some(4),
        "u64" | "i64" | "f64" => Some(8),
        "u128" | "i128" => Some(16),
        "usize" | "isize" => Some(4),
        _ => None,
    };
}

// flight-lint: allow(hashmap-iteration) frozen-object validation guarantees one target name per Rust constant
pub(crate) fn frozen_object_name<'a>(
    context: &'a HashSet<String>,
    rust_name: &str,
) -> Option<&'a str> {
    let prefix = format!("{FROZEN_OBJECT_MARKER}{rust_name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

// The fact `marker` records for the free function `function_name` called from the current source,
// resolved to its declaring module; `None` when the function or its fact is unknown or ambiguous.
fn function_fact(entities: &HashSet<String>, marker: &str, function_name: &str) -> Option<String> {
    if lexical_binding(entities, function_name).is_some() {
        return None;
    }
    let identity = match current_source(entities) {
        Some(current) => {
            let (owner, declaration) =
                resolve_owner(entities, FUNCTION_OWNER_MARKER, &current, function_name)?;
            format!("{owner}{PROVENANCE_SEPARATOR}{declaration}")
        }
        None => unique_marker_suffix(
            entities,
            &format!("{VITEST_PUBLIC_FUNCTION_MARKER}{function_name}{PROVENANCE_SEPARATOR}"),
        )?,
    };
    return function_identity_fact(entities, marker, &identity);
}

// The fact for a qualified or unqualified function path. The path resolver is deliberately neutral
// about the fact being requested; sequence, Option and struct-return consumers all receive the same
// canonical function identity.
fn function_path_fact(
    entities: &HashSet<String>,
    marker: &str,
    path: &syn::Path,
) -> Option<String> {
    let identity = match current_source(entities) {
        Some(current) => {
            let (owner, declaration) =
                resolve_path_owner(entities, FUNCTION_OWNER_MARKER, &current, path)?;
            format!("{owner}{PROVENANCE_SEPARATOR}{declaration}")
        }
        None => {
            let function = vitest_function_path_binding_name(path, entities)
                .ok()
                .flatten()?;
            unique_marker_suffix(
                entities,
                &format!("{VITEST_PUBLIC_FUNCTION_MARKER}{function}{PROVENANCE_SEPARATOR}"),
            )?
        }
    };
    return function_identity_fact(entities, marker, &identity);
}

fn function_identity_fact(
    entities: &HashSet<String>,
    marker: &str,
    identity: &str,
) -> Option<String> {
    let mut facts = marker_suffixes(
        entities,
        &format!("{marker}{identity}{PROVENANCE_SEPARATOR}"),
    );
    return match (facts.pop_first(), facts.is_empty()) {
        (Some(fact), true) => Some(fact),
        _ => None,
    };
}

fn frozen_object_expression_name<'a>(
    expression: &Expr,
    context: &'a HashSet<String>,
) -> Option<&'a str> {
    return match expression {
        Expr::Group(group) => frozen_object_expression_name(&group.expr, context),
        Expr::Paren(paren) => frozen_object_expression_name(&paren.expr, context),
        Expr::Path(path)
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1 =>
        {
            frozen_object_name(context, &path.path.segments[0].ident.to_string())
        }
        _ => None,
    };
}

pub(super) fn source_module_name(source: &str) -> String {
    let normalized = source.replace('\\', "/");
    let relative = normalized
        .rsplit_once("/src/")
        .map(|(_, relative)| relative)
        .or_else(|| normalized.strip_prefix("src/"))
        .unwrap_or(&normalized);
    let without_extension = relative.strip_suffix(".rs").unwrap_or(relative);
    let without_mod = without_extension
        .strip_suffix("/mod")
        .unwrap_or(without_extension);
    return without_mod.replace('/', "::");
}

// Every path a `use` declaration introduces, in source order: the full prefix and either the imported
// item and the name it is bound to, or `None` for a glob.
fn use_tree_paths<'a>(uses: impl Iterator<Item = &'a ItemUse>) -> Vec<UsePath> {
    fn collect(paths: &mut Vec<UsePath>, tree: &UseTree, prefix: &mut Vec<String>) {
        match tree {
            UseTree::Glob(_) => paths.push(UsePath {
                item: None,
                prefix: prefix.clone(),
            }),
            UseTree::Group(group) => {
                for tree in &group.items {
                    collect(paths, tree, prefix);
                }
            }
            UseTree::Name(name) if name.ident != "self" => {
                let name = name.ident.to_string();
                paths.push(UsePath {
                    item: Some((name.clone(), name)),
                    prefix: prefix.clone(),
                });
            }
            UseTree::Rename(rename) => paths.push(UsePath {
                item: Some((rename.ident.to_string(), rename.rename.to_string())),
                prefix: prefix.clone(),
            }),
            UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                collect(paths, &path.tree, prefix);
                prefix.pop();
            }
            UseTree::Name(_) => {}
        }
    }

    let mut paths = Vec::new();
    for rust_use in uses {
        collect(&mut paths, &rust_use.tree, &mut Vec::new());
    }
    return paths;
}

pub(super) fn provenance_import_rules<'a>(
    uses: impl Iterator<Item = &'a ItemUse>,
    source_module: Option<&str>,
) -> Vec<ProvenanceImportRule> {
    fn module_name(prefix: &[String], source_module: Option<&str>) -> Option<String> {
        let first = prefix.first()?;
        if first == "crate" {
            if prefix.len() == 1 {
                return Some("crate".to_string());
            }
            let mut module = Vec::new();
            if let Some(source_module) = source_module
                && !source_module.contains(['/', '\\'])
                && let Some(crate_name) = source_module_name(source_module).split("::").next()
                && source_module.contains("::")
            {
                module.push(crate_name.to_string());
            }
            module.extend(prefix[1..].iter().cloned());
            return Some(module.join("::"));
        }
        if first == "self" {
            if prefix.len() == 1 {
                return None;
            }
            let mut module = source_module
                .map(source_module_name)
                .filter(|module| !module.is_empty())
                .map(|module| module.split("::").map(str::to_string).collect::<Vec<_>>())
                .unwrap_or_default();
            module.extend(prefix[1..].iter().cloned());
            return (!module.is_empty()).then(|| module.join("::"));
        }
        if first == "super" {
            let mut module = source_module
                .map(source_module_name)
                .filter(|module| !module.is_empty())
                .map(|module| module.split("::").map(str::to_string).collect::<Vec<_>>())
                .unwrap_or_default();
            let mut index = 0;
            while prefix.get(index).is_some_and(|segment| segment == "super") {
                module.pop();
                index += 1;
            }
            module.extend(prefix[index..].iter().cloned());
            return (!module.is_empty()).then(|| module.join("::"));
        }
        return Some(prefix.join("::"));
    }

    return use_tree_paths(uses)
        .into_iter()
        .filter_map(|path| match path.item {
            None => module_name(&path.prefix, source_module)
                .map(|module| ProvenanceImportRule::Wildcard { module }),
            Some((imported, exported)) => Some(ProvenanceImportRule::Explicit {
                exported,
                imported,
                module: module_name(&path.prefix, source_module),
            }),
        })
        .collect();
}

fn contract_export_rules(source: &str) -> Result<Vec<ProvenanceImportRule>, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust contract source: {error}")))?;
    return Ok(provenance_import_rules(
        file.items.iter().filter_map(|item| {
            let Item::Use(rust_use) = item else {
                return None;
            };
            is_public(&rust_use.vis).then_some(rust_use)
        }),
        None,
    ));
}

fn identities_in_module(
    declarations: &ProvenanceDeclarations,
    module: &str,
    declaration: Option<&str>,
) -> BTreeSet<ProvenanceIdentity> {
    return declarations
        .iter()
        .filter(|(name, _)| declaration.is_none_or(|declaration| declaration == name.as_str()))
        .flat_map(|(_, identities)| identities)
        .filter(|identity| source_module_name(&identity.module) == module)
        .cloned()
        .collect();
}

fn resolved_production_type_identities(
    rust_type: &Type,
    type_path_context: &HashSet<String>,
    declarations: &ProvenanceDeclarations,
    local_bindings: &BTreeMap<String, BTreeSet<ProvenanceIdentity>>,
    crate_root: &BTreeMap<String, BTreeSet<ProvenanceIdentity>>,
    module_bindings: &ProvenanceModuleBindings,
) -> BTreeSet<ProvenanceIdentity> {
    let rust_type = match rust_type {
        Type::Group(group) => {
            return resolved_production_type_identities(
                &group.elem,
                type_path_context,
                declarations,
                local_bindings,
                crate_root,
                module_bindings,
            );
        }
        Type::Paren(paren) => {
            return resolved_production_type_identities(
                &paren.elem,
                type_path_context,
                declarations,
                local_bindings,
                crate_root,
                module_bindings,
            );
        }
        Type::Reference(reference) => {
            return resolved_production_type_identities(
                &reference.elem,
                type_path_context,
                declarations,
                local_bindings,
                crate_root,
                module_bindings,
            );
        }
        Type::Path(path) if path.qself.is_none() => path,
        _ => return BTreeSet::new(),
    };
    let entity_ref =
        resolve_type_path(&rust_type.path, type_path_context).is_some_and(|resolved| {
            matches!(
                resolved
                    .iter()
                    .map(String::as_str)
                    .collect::<Vec<_>>()
                    .as_slice(),
                ["flight_entity", "Ref"] | ["flight_entity", "ir", "Ref"]
            )
        });
    if entity_ref {
        let Some(segment) = rust_type.path.segments.last() else {
            return BTreeSet::new();
        };
        let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
            return BTreeSet::new();
        };
        let [GenericArgument::Type(inner)] = arguments.args.iter().collect::<Vec<_>>()[..] else {
            return BTreeSet::new();
        };
        return resolved_production_type_identities(
            inner,
            type_path_context,
            declarations,
            local_bindings,
            crate_root,
            module_bindings,
        );
    }
    let segments = rust_type
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    let Some((declaration, prefix)) = segments.split_last() else {
        return BTreeSet::new();
    };
    if prefix.is_empty() || prefix == ["self"] {
        return local_bindings.get(declaration).cloned().unwrap_or_default();
    }
    if prefix == ["crate"] {
        return crate_root.get(declaration).cloned().unwrap_or_default();
    }
    if let Some(first) = prefix.first()
        && first.starts_with("flight_")
    {
        return BTreeSet::new();
    }
    let module = prefix
        .iter()
        .filter(|segment| !matches!(segment.as_str(), "crate" | "self" | "super"))
        .cloned()
        .collect::<Vec<_>>()
        .join("::");
    if module.is_empty() {
        return BTreeSet::new();
    }
    if let Some(bindings) = module_bindings.get(&module) {
        return bindings.get(declaration).cloned().unwrap_or_default();
    }
    return identities_in_module(declarations, &module, Some(declaration));
}

fn resolve_import_rules(
    declarations: &ProvenanceDeclarations,
    rules: &[ProvenanceImportRule],
    seed: BTreeMap<String, BTreeSet<ProvenanceIdentity>>,
    crate_root: &BTreeMap<String, BTreeSet<ProvenanceIdentity>>,
    module_bindings: &ProvenanceModuleBindings,
) -> BTreeMap<String, BTreeSet<ProvenanceIdentity>> {
    let mut bindings = seed;
    for rule in rules {
        match rule {
            ProvenanceImportRule::Wildcard { module } => {
                let exports = if module == "crate" {
                    crate_root.clone()
                } else if let Some(bindings) = module_bindings.get(module) {
                    bindings.clone()
                } else {
                    identities_in_module(declarations, module, None)
                        .into_iter()
                        .fold(ProvenanceBindings::new(), |mut bindings, identity| {
                            bindings
                                .entry(identity.declaration.clone())
                                .or_default()
                                .insert(identity);
                            bindings
                        })
                };
                for (exported, identities) in exports {
                    bindings.entry(exported).or_default().extend(identities);
                }
            }
            ProvenanceImportRule::Explicit {
                exported,
                imported,
                module: Some(module),
            } => {
                let identities = if module == "crate" {
                    crate_root.get(imported).cloned().unwrap_or_default()
                } else if let Some(bindings) = module_bindings.get(module) {
                    bindings.get(imported).cloned().unwrap_or_default()
                } else {
                    identities_in_module(declarations, module, Some(imported))
                };
                bindings
                    .entry(exported.clone())
                    .or_default()
                    .extend(identities);
            }
            ProvenanceImportRule::Explicit { module: None, .. } => {}
        }
    }
    loop {
        let mut changed = false;
        for rule in rules {
            let ProvenanceImportRule::Explicit {
                exported,
                imported,
                module: None,
            } = rule
            else {
                continue;
            };
            let resolved = bindings.get(imported).cloned().unwrap_or_default();
            let target = bindings.entry(exported.clone()).or_default();
            let previous = target.len();
            target.extend(resolved);
            changed |= target.len() != previous;
        }
        if !changed {
            break;
        }
    }
    return bindings;
}

fn public_module_bindings(
    declarations: &ProvenanceDeclarations,
    programs: &[(&str, &Program)],
) -> ProvenanceModuleBindings {
    let mut direct = ProvenanceModuleBindings::new();
    for identity in declarations.values().flatten() {
        direct
            .entry(source_module_name(&identity.module))
            .or_default()
            .entry(identity.declaration.clone())
            .or_default()
            .insert(identity.clone());
    }
    let rules = programs
        .iter()
        .map(|(module, program)| {
            (
                source_module_name(module),
                provenance_import_rules(
                    program
                        .uses
                        .iter()
                        .filter(|rust_use| is_public(&rust_use.vis)),
                    Some(module),
                ),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut bindings = direct.clone();
    loop {
        let mut next = direct.clone();
        for (module, rules) in &rules {
            let seed = next.remove(module).unwrap_or_default();
            let resolved =
                resolve_import_rules(declarations, rules, seed, &BTreeMap::new(), &bindings);
            next.insert(module.clone(), resolved);
        }
        if next == bindings {
            return bindings;
        }
        bindings = next;
    }
}

fn provenance_bindings(
    declarations: &ProvenanceDeclarations,
    module_bindings: &ProvenanceModuleBindings,
    contract_rules: Option<&[ProvenanceImportRule]>,
    kind: &str,
) -> Result<BTreeMap<String, ProvenanceIdentity>, CompileError> {
    let candidates = contract_rules.map_or_else(
        || declarations.clone(),
        |rules| {
            let mut bindings = BTreeMap::new();
            loop {
                let next = resolve_import_rules(
                    declarations,
                    rules,
                    bindings.clone(),
                    &bindings,
                    module_bindings,
                );
                if next == bindings {
                    break;
                }
                bindings = next;
            }
            bindings
        },
    );
    let mut bindings = BTreeMap::new();
    for (exported, matches) in candidates {
        if matches.is_empty() {
            continue;
        }
        if matches.len() != 1 {
            let owners = matches
                .iter()
                .map(ProvenanceIdentity::description)
                .collect::<Vec<_>>()
                .join(", ");
            let guidance = if contract_rules.is_some() {
                "make the contract re-export select exactly one source owner"
            } else {
                "provide contract.rs with --contract-source so its public re-export selects the source owner"
            };
            return Err(compile_error(format!(
                "ambiguous public {kind} export `{exported}` resolves to {owners}; {guidance}"
            )));
        }
        if let Some(binding) = matches.into_iter().next() {
            bindings.insert(exported, binding);
        }
    }
    return Ok(bindings);
}

// Binds each identifier a pattern introduces to the BindingId its site resolved to (or to no fact at
// all, when the site was not resolved), replacing any binding of that name in `context`.
pub(super) fn bind_lexical_pattern(context: &mut HashSet<String>, pattern: &Pat) {
    for identifier in pattern_identifiers(pattern) {
        let prefix = format!("{BINDING_MARKER}{identifier}=");
        context.retain(|marker| !marker.starts_with(&prefix));
        let id = unique_marker_suffix(
            context,
            &format!("{BINDING_SITE_MARKER}{}=", binding_site_key(identifier)),
        )
        .unwrap_or_default();
        context.insert(format!("{prefix}{id}"));
    }
}

fn binding_fact_from_marker(encoded: &str) -> BindingFact {
    if encoded == "hash-map" {
        return BindingFact::HashMap;
    }
    if encoded == "hash-set" {
        return BindingFact::HashSet;
    }
    if encoded == "sequence" {
        return BindingFact::Sequence(Box::new(BindingFact::Unknown));
    }
    if let Some(fact) = encoded
        .strip_prefix("sequence")
        .and_then(|rest| rest.strip_prefix(PROVENANCE_SEPARATOR))
    {
        return BindingFact::Sequence(Box::new(binding_fact_from_marker(fact)));
    }
    if let Some(fact) = encoded
        .strip_prefix("option")
        .and_then(|rest| rest.strip_prefix(PROVENANCE_SEPARATOR))
    {
        return BindingFact::Option(Box::new(binding_fact_from_marker(fact)));
    }
    if let Some(identity) = encoded
        .strip_prefix("struct")
        .and_then(|rest| rest.strip_prefix(PROVENANCE_SEPARATOR))
    {
        return BindingFact::Structure(identity.to_string());
    }
    if let Some(facts) = encoded
        .strip_prefix("tuple")
        .and_then(|rest| rest.strip_prefix(PROVENANCE_SEPARATOR))
    {
        return BindingFact::Tuple(
            facts
                .split(BINDING_FACT_SEPARATOR)
                .map(binding_fact_from_marker)
                .collect(),
        );
    }
    if let Some(array_type) = encoded
        .strip_prefix("typed-array")
        .and_then(|rest| rest.strip_prefix(PROVENANCE_SEPARATOR))
    {
        return BindingFact::TypedArray(array_type.to_string());
    }
    if encoded == "unresolved-pattern" {
        return BindingFact::UnresolvedPattern;
    }
    return BindingFact::Unknown;
}

pub(super) fn binding_fact_marker(fact: &BindingFact) -> String {
    return match fact {
        BindingFact::Option(payload) => format!(
            "option{PROVENANCE_SEPARATOR}{}",
            binding_fact_marker(payload)
        ),
        BindingFact::Sequence(element) => format!(
            "sequence{PROVENANCE_SEPARATOR}{}",
            binding_fact_marker(element)
        ),
        BindingFact::Structure(identity) => format!("struct{PROVENANCE_SEPARATOR}{identity}"),
        BindingFact::Tuple(facts) => format!(
            "tuple{PROVENANCE_SEPARATOR}{}",
            facts
                .iter()
                .map(binding_fact_marker)
                .collect::<Vec<_>>()
                .join(&BINDING_FACT_SEPARATOR.to_string())
        ),
        BindingFact::HashMap => "hash-map".to_string(),
        BindingFact::TypedArray(array_type) => {
            format!("typed-array{PROVENANCE_SEPARATOR}{array_type}")
        }
        BindingFact::HashSet => "hash-set".to_string(),
        BindingFact::Unknown => "unknown".to_string(),
        BindingFact::UnresolvedPattern => "unresolved-pattern".to_string(),
    };
}

// The key of a binding identifier node: its address, stable while the parsed program is borrowed for
// emission. It is a lookup key only and never reaches emitted output.
fn binding_site_key(identifier: &syn::Ident) -> String {
    return format!("{identifier:p}");
}

// The typed array a `Box<Float32Array>`-style type's single argument names, or `None`; the caller
// proves the outer type is the standard `Box`.
fn boxed_typed_array(segment: &syn::PathSegment) -> Option<&'static str> {
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return None;
    };
    let [GenericArgument::Type(Type::Path(inner))] = arguments.args.iter().collect::<Vec<_>>()[..]
    else {
        return None;
    };
    let inner_segment = inner.path.segments.last()?;
    if inner.qself.is_some() || !matches!(inner_segment.arguments, PathArguments::None) {
        return None;
    }
    return match inner_segment.ident.to_string().as_str() {
        "Float32Array" => Some("Float32Array"),
        "Float64Array" => Some("Float64Array"),
        "Int8Array" => Some("Int8Array"),
        "Int16Array" => Some("Int16Array"),
        "Int32Array" => Some("Int32Array"),
        "Uint8Array" => Some("Uint8Array"),
        "Uint16Array" => Some("Uint16Array"),
        "Uint32Array" => Some("Uint32Array"),
        _ => None,
    };
}

// The fact `marker` records for the function a call path names. A single-segment callee is subject to
// lexical shadowing (`function_fact`); a qualified path names a module item directly and resolves
// through the shared ModuleSource resolver (`function_path_fact`).
fn call_fact(entities: &HashSet<String>, marker: &str, path: &syn::Path) -> Option<String> {
    if path.segments.len() == 1 {
        return function_fact(entities, marker, &path.segments[0].ident.to_string());
    }
    return function_path_fact(entities, marker, path);
}

// A concise arrow body that begins with `{` is parsed as a block, so an object literal (a lowered
// struct or record) is parenthesized to stay an expression.
fn concise_arrow_body(body: String) -> String {
    if body.starts_with('{') {
        return format!("({body})");
    }
    return body;
}

// The canonical identity of the struct `rust_type` names in the code being emitted: resolved from the
// current source when emitting a program, or through the contract-selected struct binding when
// emitting a Vitest suite (whose test module is not itself a program source).
fn context_type_identity(entities: &HashSet<String>, rust_type: &Type) -> Option<String> {
    if let Some(current) = current_source(entities) {
        return resolved_type_identity(entities, &current, rust_type);
    }
    let structure = match rust_type {
        Type::Group(group) => return context_type_identity(entities, &group.elem),
        Type::Paren(paren) => return context_type_identity(entities, &paren.elem),
        Type::Reference(reference) => return context_type_identity(entities, &reference.elem),
        Type::Path(path) if path.qself.is_none() => {
            vitest_struct_path_binding_name(&path.path, entities)
                .ok()
                .flatten()?
        }
        _ => named_type(rust_type)?,
    };
    return vitest_struct_owner(entities, &structure);
}

pub(super) fn binding_fact_for_type(
    entities: &HashSet<String>,
    from: Option<&str>,
    rust_type: &Type,
) -> BindingFact {
    if let Some(inner) = option_inner_type(rust_type) {
        return BindingFact::Option(Box::new(binding_fact_for_type(entities, from, inner)));
    }
    if let Some(array_type) = fixed_typed_array_type(rust_type) {
        return BindingFact::TypedArray(array_type.to_string());
    }
    if let Some(inner) = sequence_inner_type(rust_type) {
        let element = binding_fact_for_type(entities, from, inner);
        return BindingFact::Sequence(Box::new(
            if element.has_source_structure() || matches!(element, BindingFact::TypedArray(_)) {
                element
            } else {
                BindingFact::Unknown
            },
        ));
    }
    if let Type::Tuple(tuple) = rust_type {
        return BindingFact::Tuple(
            tuple
                .elems
                .iter()
                .map(|element| binding_fact_for_type(entities, from, element))
                .collect(),
        );
    }
    if let Some(name) = primitive_type_identity(rust_type) {
        return BindingFact::Structure(name);
    }
    if let Type::Path(path) = rust_type
        && path.qself.is_none()
    {
        let source = from.map(String::from).or_else(|| current_source(entities));
        if let Some(source) = &source {
            if let Some((owner, alias)) =
                resolve_path_owner(entities, TYPE_ALIAS_OWNER_MARKER, source, &path.path)
            {
                let definition = unique_marker_suffix(
                    entities,
                    &format!(
                        "{TYPE_ALIAS_DEFINITION_MARKER}{owner}{PROVENANCE_SEPARATOR}{alias}{PROVENANCE_SEPARATOR}"
                    ),
                );
                if let Some(Ok(resolved)) = definition.map(|d| syn::parse_str::<Type>(&d)) {
                    if !matches!(&resolved, Type::Path(_)) {
                        return binding_fact_for_type(entities, from, &resolved);
                    }
                }
            }
        }
    }
    let identity = match from {
        Some(from) => resolved_type_identity(entities, from, rust_type),
        None => context_type_identity(entities, rust_type),
    };
    return identity.map_or(BindingFact::Unknown, BindingFact::Structure);
}

// The module of the program being emitted, when exactly one is recorded.
pub(super) fn current_source(entities: &HashSet<String>) -> Option<String> {
    let mut modules = marker_suffixes(entities, CURRENT_SOURCE_MARKER);
    return match (modules.pop_first(), modules.is_empty()) {
        (Some(module), true) => Some(module),
        _ => None,
    };
}

fn documentation(attributes: &[Attribute]) -> Vec<String> {
    return attributes
        .iter()
        .filter(|attribute| attribute.path().is_ident("doc"))
        .filter_map(|attribute| {
            let syn::Meta::NameValue(meta) = &attribute.meta else {
                return None;
            };
            let Expr::Lit(value) = &meta.value else {
                return None;
            };
            let Lit::Str(value) = &value.lit else {
                return None;
            };
            Some(rewrite_documentation(value.value().trim_start()))
        })
        .collect();
}

fn emit_binary_operator(operator: &BinOp) -> Result<&'static str, CompileError> {
    return match operator {
        BinOp::Add(_) => Ok("+"),
        BinOp::AddAssign(_) => Ok("+="),
        BinOp::And(_) => Ok("&&"),
        BinOp::BitAnd(_) => Ok("&"),
        BinOp::BitAndAssign(_) => Ok("&="),
        BinOp::BitOr(_) => Ok("|"),
        BinOp::BitOrAssign(_) => Ok("|="),
        BinOp::BitXor(_) => Ok("^"),
        BinOp::BitXorAssign(_) => Ok("^="),
        BinOp::Div(_) => Ok("/"),
        BinOp::DivAssign(_) => Ok("/="),
        BinOp::Eq(_) => Ok("==="),
        BinOp::Ge(_) => Ok(">="),
        BinOp::Gt(_) => Ok(">"),
        BinOp::Le(_) => Ok("<="),
        BinOp::Lt(_) => Ok("<"),
        BinOp::Mul(_) => Ok("*"),
        BinOp::MulAssign(_) => Ok("*="),
        BinOp::Ne(_) => Ok("!=="),
        BinOp::Or(_) => Ok("||"),
        BinOp::Rem(_) => Ok("%"),
        BinOp::RemAssign(_) => Ok("%="),
        BinOp::Shl(_) => Ok("<<"),
        BinOp::ShlAssign(_) => Ok("<<="),
        BinOp::Shr(_) => Ok(">>"),
        BinOp::ShrAssign(_) => Ok(">>="),
        BinOp::Sub(_) => Ok("-"),
        BinOp::SubAssign(_) => Ok("-="),
        _ => Err(compile_error("unsupported Rust binary operator")),
    };
}

fn binary_precedence(operator: &BinOp) -> u8 {
    return match operator {
        BinOp::Add(_) | BinOp::Sub(_) => 11,
        BinOp::And(_) => 4,
        BinOp::BitAnd(_) => 7,
        BinOp::BitOr(_) => 5,
        BinOp::BitXor(_) => 6,
        BinOp::Div(_) | BinOp::Mul(_) | BinOp::Rem(_) => 12,
        BinOp::Eq(_) | BinOp::Ne(_) => 8,
        BinOp::Ge(_) | BinOp::Gt(_) | BinOp::Le(_) | BinOp::Lt(_) => 9,
        BinOp::Or(_) => 3,
        BinOp::Shl(_) | BinOp::Shr(_) => 10,
        BinOp::AddAssign(_)
        | BinOp::BitAndAssign(_)
        | BinOp::BitOrAssign(_)
        | BinOp::BitXorAssign(_)
        | BinOp::DivAssign(_)
        | BinOp::MulAssign(_)
        | BinOp::RemAssign(_)
        | BinOp::ShlAssign(_)
        | BinOp::ShrAssign(_)
        | BinOp::SubAssign(_) => 1,
        _ => 0,
    };
}

fn binary_is_assignment(operator: &BinOp) -> bool {
    return matches!(
        operator,
        BinOp::AddAssign(_)
            | BinOp::BitAndAssign(_)
            | BinOp::BitOrAssign(_)
            | BinOp::BitXorAssign(_)
            | BinOp::DivAssign(_)
            | BinOp::MulAssign(_)
            | BinOp::RemAssign(_)
            | BinOp::ShlAssign(_)
            | BinOp::ShrAssign(_)
            | BinOp::SubAssign(_)
    );
}

fn literal_shift_amount(expression: &Expr) -> Option<u64> {
    return match expression {
        Expr::Lit(lit) => {
            if let Lit::Int(int) = &lit.lit {
                int.base10_parse::<u64>().ok()
            } else {
                None
            }
        }
        Expr::Paren(paren) => literal_shift_amount(&paren.expr),
        Expr::Group(group) => literal_shift_amount(&group.expr),
        _ => None,
    };
}

fn expression_precedence(expression: &Expr) -> u8 {
    return match expression {
        Expr::Assign(_) => 1,
        Expr::Binary(binary) => binary_precedence(&binary.op),
        Expr::Cast(cast) if type_is_named(&cast.ty, "i32") || type_is_named(&cast.ty, "isize") => 5,
        Expr::Cast(cast) if type_is_named(&cast.ty, "u8") || type_is_named(&cast.ty, "u16") => 7,
        Expr::Cast(cast)
            if type_is_named(&cast.ty, "u32")
                || type_is_named(&cast.ty, "usize")
                || type_is_named(&cast.ty, "i8")
                || type_is_named(&cast.ty, "i16") =>
        {
            10
        }
        Expr::Cast(cast) => expression_precedence(&cast.expr),
        Expr::Group(group) => expression_precedence(&group.expr),
        Expr::Paren(paren) => expression_precedence(&paren.expr),
        Expr::If(_) => 2,
        Expr::Reference(reference) => expression_precedence(&reference.expr),
        Expr::Unary(_) => 13,
        _ => PRIMARY_PRECEDENCE,
    };
}

fn emit_binary_operand(
    expression: &Expr,
    entities: &HashSet<String>,
    parent_precedence: u8,
    right: bool,
) -> Result<String, CompileError> {
    let value = emit_expression(expression, entities)?;
    let precedence = if let Expr::Cast(cast) = expression {
        if is_integer_cast_elided(&cast.expr, &cast.ty, entities)
            || integer_literal_fits_cast(&cast.expr, &cast.ty)
        {
            expression_precedence(&cast.expr)
        } else {
            expression_precedence(expression)
        }
    } else {
        expression_precedence(expression)
    };
    if precedence < parent_precedence
        || (right && precedence == parent_precedence)
        || !is_lowered_primary(expression, &value)
    {
        return Ok(format!("({value})"));
    }
    return Ok(value);
}

fn emit_constant(
    out: &mut String,
    constant: &syn::ItemConst,
    entities: &HashSet<String>,
    frozen_name: Option<&str>,
) -> Result<(), CompileError> {
    emit_documentation(out, &constant.attrs, 0);
    let export = if is_public(&constant.vis) {
        "export "
    } else {
        ""
    };
    let value = emit_expression_for_type(&constant.expr, &constant.ty, entities)?;
    let rust_name = constant.ident.to_string();
    if let Some(name) = frozen_name {
        writeln!(
            out,
            "{export}const {name}: Readonly<{}> = Object.freeze({value});",
            emit_type(&constant.ty, entities)?,
        )
        .expect("writing to a String cannot fail");
        return Ok(());
    }
    let name = export_name(entities, &rust_name).unwrap_or(&rust_name);
    if matches!(constant.expr.as_ref(), Expr::Lit(value) if matches!(&value.lit, Lit::Str(_)))
        && matches!(constant.ty.as_ref(), Type::Reference(reference) if type_is_named(&reference.elem, "str"))
    {
        writeln!(out, "{export}const {name} = {value} as const;")
            .expect("writing to a String cannot fail");
        return Ok(());
    }
    writeln!(
        out,
        "{export}const {name}: {} = {};",
        emit_type(&constant.ty, entities)?,
        value
    )
    .expect("writing to a String cannot fail");
    return Ok(());
}

fn emit_documentation(out: &mut String, attributes: &[Attribute], indent: usize) {
    let lines = documentation(attributes);
    if lines.is_empty() {
        return;
    }
    write_indent(out, indent);
    out.push_str("/**\n");
    for line in lines {
        write_indent(out, indent);
        if line.is_empty() {
            out.push_str(" *\n");
        } else {
            writeln!(out, " * {}", line.replace("*/", "*\\/"))
                .expect("writing to a String cannot fail");
        }
    }
    write_indent(out, indent);
    out.push_str(" */\n");
}

// Declares the package-internal store of each entity runtime state field `program` designates, at the
// end of the declaring module. The store is exported only as a list export, never as a declaration
// export, so a wildcard contract over the module never makes it public; sibling modules import it.
fn emit_entity_runtime_state_stores(
    out: &mut String,
    program: &Program,
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    for (owner, field_name) in &program.entity_runtime_states {
        let field = program
            .structs
            .iter()
            .find(|structure| structure.ident == owner.as_str())
            .and_then(|structure| {
                structure.fields.iter().find(|field| {
                    field
                        .ident
                        .as_ref()
                        .is_some_and(|ident| ident == field_name)
                })
            })
            .ok_or_else(|| {
                compile_error(format!(
                    "entity runtime state `{owner}.{field_name}` was not validated"
                ))
            })?;
        let store = entity_runtime_state_store(owner, field_name);
        let structure = program
            .structs
            .iter()
            .find(|structure| structure.ident == owner.as_str())
            .expect("entity runtime state owner was validated");
        let key = if structure.generics.params.is_empty() {
            format!("Readonly<{owner}Raw>")
        } else {
            // One store serves every monomorphization. Entity identity is the only key fact the
            // runtime needs, and spelling a particular generic substitution would be unsound.
            "object".to_string()
        };
        writeln!(
            out,
            "\n// Crate-private `{owner}.{field_name}`, keyed by entity identity and reachable only from this package's modules.\nconst {store} = /* @__PURE__ */ new WeakMap<{key}, {}>();\n\nexport {{ {store} }};",
            emit_type(&field.ty, entities)?
        )
        .expect("writing to a String cannot fail");
    }
    return Ok(());
}

fn closure_parameter_identifier(pattern: &Pat) -> Option<String> {
    return match pattern {
        Pat::Ident(identifier) => Some(identifier.ident.to_string()),
        Pat::Reference(reference) => closure_parameter_identifier(&reference.pat),
        Pat::Type(typed) => closure_parameter_identifier(&typed.pat),
        _ => None,
    };
}

fn expression_is_empty_vec(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::Group(group) => expression_is_empty_vec(&group.expr, entities),
        Expr::Paren(paren) => expression_is_empty_vec(&paren.expr, entities),
        _ => matches!(
            empty_vec_initializer(expression, entities),
            Some(EmptyVecInitializer::Standard(_))
        ),
    };
}

pub(super) fn unique_marker_suffix(entities: &HashSet<String>, prefix: &str) -> Option<String> {
    let matches = entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(prefix))
        .collect::<BTreeSet<_>>();
    if matches.len() != 1 {
        return None;
    }
    return matches.first().map(|suffix| (*suffix).to_string());
}

fn has_entity_clone_fields(entities: &HashSet<String>, owner: &str) -> bool {
    let prefix = format!("{ENTITY_CLONE_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}");
    return entities.iter().any(|marker| marker.starts_with(&prefix));
}

fn entity_clone_expression_owner(expression: &Expr, entities: &HashSet<String>) -> Option<String> {
    let identity = expression_struct_name(expression, entities)?;
    let owner = identity
        .rsplit_once(PROVENANCE_SEPARATOR)
        .map_or(identity.as_str(), |(_, owner)| owner);
    return has_entity_clone_fields(entities, owner).then(|| owner.to_string());
}

fn emit_entity_clone(receiver: &str, owner: &str, entities: &HashSet<String>) -> String {
    let prefix = format!("{ENTITY_CLONE_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}");
    let fields = entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(&prefix))
        .map(snake_to_lower_camel)
        .collect::<BTreeSet<_>>();
    let descriptors = fields
        .iter()
        .map(|field| {
            format!(
                "{field}: {{ get: () => {receiver}.{field}, set: (value) => {{ {receiver}.{field} = value; }}, enumerable: true, configurable: true }}"
            )
        })
        .collect::<Vec<_>>()
        .join(", ");
    return format!("Object.defineProperties({{ ...{receiver} }}, {{ {descriptors} }})");
}

// Whether `expression` reads only named fields, directly or through a chain, of `parameter`.
fn expression_is_field_projection(expression: &Expr, parameter: &syn::Ident) -> bool {
    return match expression {
        Expr::Field(field) => {
            matches!(field.member, syn::Member::Named(_))
                && (expression_is_field_projection(&field.base, parameter)
                    || matches!(field.base.as_ref(), Expr::Path(path) if path.path.is_ident(parameter)))
        }
        Expr::Group(group) => expression_is_field_projection(&group.expr, parameter),
        _ => false,
    };
}

fn expression_is_ordered_primitive(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::Binary(binary)
            if matches!(
                binary.op,
                BinOp::Add(_) | BinOp::Sub(_) | BinOp::Mul(_) | BinOp::Div(_) | BinOp::Rem(_)
            ) =>
        {
            expression_is_ordered_primitive(&binary.left, entities)
                && expression_is_ordered_primitive(&binary.right, entities)
        }
        Expr::Call(_) | Expr::Cast(_) | Expr::Field(_) | Expr::Index(_) | Expr::MethodCall(_) => {
            true
        }
        Expr::Group(group) => expression_is_ordered_primitive(&group.expr, entities),
        Expr::Lit(literal) => matches!(&literal.lit, Lit::Int(_) | Lit::Str(_)),
        Expr::Paren(paren) => expression_is_ordered_primitive(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments.first().is_some_and(|segment| {
                entities.contains(&format!("{ORDERED_PRIMITIVE_MARKER}{}", segment.ident))
            }) || expression_is_known_string(expression, entities)
        }
        Expr::Reference(reference) => expression_is_ordered_primitive(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_is_ordered_primitive(&unary.expr, entities)
        }
        _ => expression_is_known_string(expression, entities),
    };
}

fn method_chain_includes(expression: &Expr, method_name: &str) -> bool {
    return match expression {
        Expr::MethodCall(call) => {
            call.method == method_name || method_chain_includes(&call.receiver, method_name)
        }
        _ => false,
    };
}

fn immediate_receiver_is_method(expression: &Expr, method_name: &str) -> bool {
    return matches!(expression, Expr::MethodCall(call) if call.method == method_name);
}

// Whether evaluating the expression more than once is side-effect free, so a lowering may repeat
// its text instead of binding it first.
fn expression_is_reusable(expression: &Expr) -> bool {
    return match expression {
        Expr::Field(field) => expression_is_reusable(&field.base),
        Expr::Group(group) => expression_is_reusable(&group.expr),
        Expr::Lit(_) => true,
        Expr::Paren(paren) => expression_is_reusable(&paren.expr),
        Expr::Path(path) => path.qself.is_none(),
        Expr::Reference(reference) => expression_is_reusable(&reference.expr),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_is_reusable(&unary.expr)
        }
        _ => false,
    };
}

// The named type of a local, parameter or closure parameter declared as a non-Option Rust type.
fn expression_struct_name(expression: &Expr, entities: &HashSet<String>) -> Option<String> {
    return match expression {
        Expr::Group(group) => expression_struct_name(&group.expr, entities),
        Expr::MethodCall(_) => direct_lock_guard_receiver(expression)
            .and_then(|receiver| expression_struct_name(receiver, entities)),
        Expr::Paren(paren) => expression_struct_name(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            match lexical_fact(entities, &path.path.segments[0].ident.to_string()) {
                Some(BindingFact::Structure(identity)) => Some(identity),
                _ => None,
            }
        }
        Expr::Reference(reference) => expression_struct_name(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_struct_name(&unary.expr, entities)
        }
        _ => None,
    };
}

pub(crate) fn option_absent_value(expression: &Expr, entities: &HashSet<String>) -> &'static str {
    let normalized = current_source(entities).is_some();
    if entities.contains(NULLABLE_OPTIONS_MARKER)
        || expression_is_type_script_nullable_option_field(expression, entities)
        || expression_is_type_script_nullable_option_return(expression, entities)
        || !normalized && expression_is_nullable_option_field(expression, entities)
        || !normalized && expression_is_nullable_option_return(expression, entities)
        || referenced_path_identifier(expression)
            .and_then(|name| lexical_binding(entities, &name))
            .is_some_and(|id| entities.contains(&format!("{NULLABLE_OPTION_BINDING_MARKER}{id}")))
        || referenced_path_identifier(expression)
            .is_some_and(|name| entities.contains(&format!("{NULLABLE_BINDING_MARKER}{name}")))
        || expression_is_nullable_callable_return(expression, entities)
    {
        return "null";
    }
    return "undefined";
}

fn expression_is_nullable_callable_return(expression: &Expr, entities: &HashSet<String>) -> bool {
    let Expr::Call(call) = peel_reference_and_paren(expression) else {
        return false;
    };
    let Some(name) = referenced_path_identifier(&call.func) else {
        return false;
    };
    return lexical_binding(entities, &name).is_some_and(|id| {
        !id.is_empty()
            && entities.contains(&format!("{NULLABLE_OPTION_CALLABLE_BINDING_MARKER}{id}"))
    });
}

fn expression_is_nullable_option_return(expression: &Expr, entities: &HashSet<String>) -> bool {
    let Expr::Call(call) = expression else {
        return false;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return false;
    };
    return call_fact(entities, NULLABLE_OPTION_RETURN_MARKER, &path.path).is_some();
}

fn expression_is_type_script_nullable_option_return(
    expression: &Expr,
    entities: &HashSet<String>,
) -> bool {
    let Expr::Call(call) = expression else {
        return false;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return false;
    };
    return call_fact(
        entities,
        TYPE_SCRIPT_NULLABLE_OPTION_RETURN_MARKER,
        &path.path,
    )
    .is_some();
}

// Whether `expression` reads a nullable `Option` field: one designated `nullable-option` or declared
// in a `nullable-options` source, identified by the canonical struct of its base (a typed binding or
// a struct-returning call in emitted code, the inferred struct in a Vitest suite).
fn expression_is_nullable_option_field(expression: &Expr, entities: &HashSet<String>) -> bool {
    let Expr::Field(field) = expression else {
        return false;
    };
    let syn::Member::Named(field_name) = &field.member else {
        return false;
    };
    let structure = if current_source(entities).is_some() {
        expression_struct_identity(&field.base, entities)
    } else {
        inferred_vitest_struct_literal_name(&field.base, entities)
    };
    let Some(structure) = structure else {
        return false;
    };
    return entities.contains(&format!(
        "{NULLABLE_OPTION_FIELD_MARKER}{structure}{PROVENANCE_SEPARATOR}{field_name}"
    )) || is_type_script_nullable_option_field(entities, &structure, field_name);
}

fn expression_is_type_script_nullable_option_field(
    expression: &Expr,
    entities: &HashSet<String>,
) -> bool {
    let Expr::Field(field) = expression else {
        return false;
    };
    let syn::Member::Named(field_name) = &field.member else {
        return false;
    };
    let Some(structure) = expression_struct_identity(&field.base, entities) else {
        return false;
    };
    return is_type_script_nullable_option_field(entities, &structure, field_name);
}

struct TuplePatternBinding {
    mutable: bool,
    name: String,
    path: Vec<usize>,
}

// The identifiers a tuple pattern binds, depth first, each with the element index path that reads it
// (`((a, b), c)` binds `a` at `[0][0]`, `b` at `[0][1]` and `c` at `[1]`).
fn tuple_pattern_bindings(tuple: &syn::PatTuple) -> Vec<TuplePatternBinding> {
    fn collect(pattern: &Pat, path: &mut Vec<usize>, out: &mut Vec<TuplePatternBinding>) {
        match pattern {
            Pat::Ident(ident) if ident.ident != "_" && ident.ident != "None" => {
                out.push(TuplePatternBinding {
                    mutable: ident.mutability.is_some(),
                    name: ident.ident.to_string(),
                    path: path.clone(),
                });
            }
            Pat::Paren(paren) => collect(&paren.pat, path, out),
            Pat::Tuple(tuple) => {
                for (index, element) in tuple.elems.iter().enumerate() {
                    path.push(index);
                    collect(element, path, out);
                    path.pop();
                }
            }
            _ => {}
        }
    }
    let mut out = Vec::new();
    for (index, element) in tuple.elems.iter().enumerate() {
        collect(element, &mut vec![index], &mut out);
    }
    return out;
}

fn resolve_rename(entities: &HashSet<String>, js_name: &str) -> String {
    let prefix = format!("{RENAME_MARKER}{js_name}=");
    if let Some(marker) = entities.iter().find(|m| m.starts_with(&prefix)) {
        return marker[prefix.len()..].to_string();
    }
    return js_name.to_string();
}

fn next_try_rename(entities: &HashSet<String>, js_name: &str) -> String {
    let prefix = format!("{RENAME_MARKER}{js_name}=");
    if let Some(marker) = entities.iter().find(|m| m.starts_with(&prefix)) {
        let current = &marker[prefix.len()..];
        if let Some(num_str) = current.rsplit('_').next() {
            if let Ok(n) = num_str.parse::<usize>() {
                return format!("{js_name}_{}", n + 1);
            }
        }
    }
    return format!("{js_name}_1");
}

fn expression_contains_identifier(expression: &Expr, expected: &str) -> bool {
    struct IdentifierFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for IdentifierFinder<'_> {
        fn visit_arm(&mut self, arm: &'ast syn::Arm) {
            if pattern_binds_identifier(&arm.pat, self.expected) {
                return;
            }
            syn::visit::visit_arm(self, arm);
        }

        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            if closure
                .inputs
                .iter()
                .any(|pattern| pattern_binds_identifier(pattern, self.expected))
            {
                return;
            }
            syn::visit::visit_expr_closure(self, closure);
        }

        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path
                .path
                .segments
                .last()
                .is_some_and(|segment| segment.ident == self.expected)
            {
                self.found = true;
            }
            syn::visit::visit_expr_path(self, path);
        }
    }

    let mut finder = IdentifierFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_expr(&mut finder, expression);
    return finder.found;
}

fn statement_contains_identifier(statement: &Stmt, expected: &str) -> bool {
    struct IdentifierFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> Visit<'ast> for IdentifierFinder<'_> {
        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path.path.is_ident(self.expected) {
                self.found = true;
            }
            syn::visit::visit_expr_path(self, path);
        }
    }

    let mut finder = IdentifierFinder {
        expected,
        found: false,
    };
    finder.visit_stmt(statement);
    return finder.found;
}

// Whether the emitted text of `expression` can stand as an operand without parentheses. Expressions the
// Rust-shaped `expression_precedence` already ranks below a primary are parenthesized by that model. Every
// expression it ranks as a primary (calls, method calls, macros, paths, fields, indexes, ...) is checked
// against its emitted text instead, because a lowering can turn a Rust primary into a JS operator
// expression (`Arc::ptr_eq(a, b)` emits `a === b`, `v.is_empty()` emits `v.length === 0`).
fn is_lowered_primary(expression: &Expr, text: &str) -> bool {
    if expression_precedence(expression) < PRIMARY_PRECEDENCE {
        return true;
    }
    return is_primary_expression_text(text);
}

// True when `text` has no top-level whitespace, which every binary, ternary, arrow or `new`/`typeof`
// expression the emitter produces does. Whitespace inside brackets, braces, parentheses and string or
// template literals does not count. A false negative only adds parentheses, which is always safe.
fn is_primary_expression_text(text: &str) -> bool {
    let mut depth: i32 = 0;
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for character in text.chars() {
        if let Some(open) = quote {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == open {
                quote = None;
            }
            continue;
        }
        match character {
            '"' | '\'' | '`' => quote = Some(character),
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth -= 1,
            _ if character.is_whitespace() && depth == 0 => return false,
            _ => {}
        }
    }
    return true;
}

fn strip_value_position_parens(text: &str) -> &str {
    let bytes = text.as_bytes();
    if bytes.len() < 3 || bytes[0] != b'(' || bytes[bytes.len() - 1] != b')' {
        return text;
    }
    let inner = &text[1..text.len() - 1];
    let mut depth: i32 = 0;
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for c in inner.chars() {
        if let Some(open) = quote {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == open {
                quote = None;
            }
            continue;
        }
        match c {
            '"' | '\'' | '`' => quote = Some(c),
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => {
                depth -= 1;
                if depth < 0 {
                    return text;
                }
            }
            _ => {}
        }
    }
    if depth != 0 {
        return text;
    }
    return inner;
}

fn pattern_binds_identifier(pattern: &Pat, expected: &str) -> bool {
    struct PatternFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for PatternFinder<'_> {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            if pattern.ident == self.expected {
                self.found = true;
            }
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut finder = PatternFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_pat(&mut finder, pattern);
    return finder.found;
}

// Every identifier a pattern binds, in source order.
fn pattern_identifiers(pattern: &Pat) -> Vec<&syn::Ident> {
    struct Collector<'ast> {
        identifiers: Vec<&'ast syn::Ident>,
    }

    impl<'ast> Visit<'ast> for Collector<'ast> {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            self.identifiers.push(&pattern.ident);
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut collector = Collector {
        identifiers: Vec::new(),
    };
    collector.visit_pat(pattern);
    return collector.identifiers;
}

fn constructor_path_default_value(expression: &Expr) -> Option<&'static str> {
    let expression = peel_reference_and_paren(expression);
    let Expr::Path(path) = expression else {
        return None;
    };
    if path.qself.is_some() {
        return None;
    }
    let segments: Vec<_> = path
        .path
        .segments
        .iter()
        .map(|s| s.ident.to_string())
        .collect();
    match segments
        .iter()
        .map(|s| s.as_str())
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["String", "new"] => Some("''"),
        ["Vec", "new"] => Some("[]"),
        ["HashMap", "new"] | ["BTreeMap", "new"] => Some("new Map()"),
        ["HashSet", "new"] | ["BTreeSet", "new"] => Some("new Set()"),
        _ => None,
    }
}

fn expression_is_unsigned_result(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::Cast(cast) => matches!(
            named_type(&cast.ty).as_deref(),
            Some("u8" | "u16" | "u32" | "usize")
        ),
        Expr::Lit(lit) => {
            matches!(&lit.lit, Lit::Int(int_lit) if int_lit.base10_parse::<u64>().ok().is_some_and(|v| v <= 4294967295))
        }
        Expr::Paren(paren) => expression_is_unsigned_result(&paren.expr, entities),
        Expr::Group(group) => expression_is_unsigned_result(&group.expr, entities),
        Expr::Call(_) | Expr::MethodCall(_) => matches!(
            expression_numeric_type(expression, entities).as_deref(),
            Some("u8" | "u16" | "u32" | "usize")
        ),
        Expr::Binary(binary)
            if matches!(binary.op, BinOp::Div(_)) && is_integer_division(binary, entities) =>
        {
            true
        }
        _ => false,
    };
}

fn is_integer_cast_elided(inner: &Expr, target: &Type, entities: &HashSet<String>) -> bool {
    let Some(target_name) = named_type(target) else {
        return false;
    };
    let Some(source_name) = expression_numeric_type(inner, entities) else {
        return false;
    };
    return is_widening_integer_cast(&source_name, &target_name);
}

fn integer_literal_fits_cast(expr: &Expr, ty: &Type) -> bool {
    let Some(target) = named_type(ty) else {
        return false;
    };
    let inner = peel_reference_and_paren(expr);
    let value: Option<i128> = match inner {
        Expr::Lit(lit) => match &lit.lit {
            Lit::Int(int_lit) => int_lit.base10_parse::<u64>().ok().map(|v| v as i128),
            _ => None,
        },
        Expr::Unary(unary) if matches!(unary.op, syn::UnOp::Neg(_)) => {
            if let Expr::Lit(lit) = peel_reference_and_paren(&unary.expr) {
                if let Lit::Int(int_lit) = &lit.lit {
                    int_lit.base10_parse::<u64>().ok().map(|v| -(v as i128))
                } else {
                    None
                }
            } else {
                None
            }
        }
        _ => None,
    };
    let Some(value) = value else {
        return false;
    };
    return match target.as_str() {
        "u8" => (0..=255).contains(&value),
        "u16" => (0..=65535).contains(&value),
        "u32" | "usize" => (0..=4294967295i128).contains(&value),
        "i8" => (-128..=127).contains(&value),
        "i16" => (-32768..=32767).contains(&value),
        "i32" | "isize" => (-2147483648..=2147483647i128).contains(&value),
        _ => false,
    };
}

fn integer_literal_fits_u32(expr: &Expr) -> bool {
    let inner = peel_reference_and_paren(expr);
    if let Expr::Lit(lit) = inner {
        if let Lit::Int(int_lit) = &lit.lit {
            return int_lit
                .base10_parse::<u64>()
                .ok()
                .is_some_and(|v| v <= 4294967295);
        }
    }
    return false;
}

fn inline_emitted_closure(emitted: &str, receiver: &str) -> Option<String> {
    let s = emitted.trim();
    let rest = s.strip_prefix('(')?;
    let (param, body) = rest.split_once(") => ")?;
    let param = param.trim();
    if param.is_empty() || param.contains(',') || param.contains(':') {
        return None;
    }
    let body = body.trim();
    if body.contains('{') {
        return None;
    }
    let mut result = String::new();
    let mut remaining = body;
    while let Some(pos) = remaining.find(param) {
        let before = pos > 0 && remaining.as_bytes()[pos - 1].is_ascii_alphanumeric();
        let after_end = pos + param.len();
        let after =
            after_end < remaining.len() && remaining.as_bytes()[after_end].is_ascii_alphanumeric();
        if before || after {
            result.push_str(&remaining[..after_end]);
            remaining = &remaining[after_end..];
        } else {
            result.push_str(&remaining[..pos]);
            result.push_str(receiver);
            remaining = &remaining[after_end..];
        }
    }
    result.push_str(remaining);
    Some(result)
}

fn emitted_closure_is_identity(emitted: &str) -> bool {
    let s = emitted.trim();
    if let Some(rest) = s.strip_prefix('(') {
        if let Some((param, body)) = rest.split_once(") => ") {
            let param = param.trim();
            let body = body.trim();
            return !param.is_empty()
                && !param.contains(',')
                && !param.contains(':')
                && param == body;
        }
    }
    false
}

fn bitand_mask_type(expression: &Expr) -> Option<String> {
    let value = match expression {
        Expr::Lit(lit) => match &lit.lit {
            Lit::Int(int_lit) => int_lit.base10_parse::<u64>().ok()?,
            _ => return None,
        },
        _ => return None,
    };
    return match value {
        0xff => Some("u8".to_string()),
        0xffff => Some("u16".to_string()),
        _ => None,
    };
}

// Whether an emitted TypeScript expression is an entity name (`a` or `a.b.c`), the only operand
// form a type-position `typeof` accepts.
fn is_typeof_entity_name(expression: &str) -> bool {
    return expression.split('.').all(|segment| {
        let mut chars = segment.chars();
        return chars
            .next()
            .is_some_and(|first| first.is_alphabetic() || first == '_' || first == '$')
            && chars.all(|c| c.is_alphanumeric() || c == '_' || c == '$');
    });
}

fn is_widening_integer_cast(source: &str, target: &str) -> bool {
    if source == target {
        return true;
    }
    return match (source, target) {
        ("u32", "usize") | ("usize", "u32" | "i32" | "isize") => true,
        ("i32", "isize") | ("isize", "i32") => true,
        ("u8", "u16" | "u32" | "usize" | "i16" | "i32" | "isize") => true,
        ("u16", "u32" | "usize" | "i32" | "isize") => true,
        ("i8", "i16" | "i32" | "isize") => true,
        ("i16", "i32" | "isize") => true,
        ("f32", "f64") => true,
        _ => false,
    };
}

fn strip_as_ptr(expression: &Expr) -> &Expr {
    let expr = peel_reference_and_paren(expression);
    if let Expr::MethodCall(call) = expr {
        if call.method == "as_ptr" && call.args.is_empty() {
            return &call.receiver;
        }
    }
    return expression;
}

pub(super) fn peel_reference_and_paren(expression: &Expr) -> &Expr {
    return match expression {
        Expr::Group(group) => peel_reference_and_paren(&group.expr),
        Expr::Paren(paren) => peel_reference_and_paren(&paren.expr),
        Expr::Reference(reference) => peel_reference_and_paren(&reference.expr),
        _ => expression,
    };
}

fn expression_contains_method(expression: &Expr, expected: &str) -> bool {
    struct MethodFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for MethodFinder<'_> {
        fn visit_expr_method_call(&mut self, call: &'ast syn::ExprMethodCall) {
            if call.method == self.expected {
                self.found = true;
            }
            syn::visit::visit_expr_method_call(self, call);
        }
    }

    let mut finder = MethodFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_expr(&mut finder, expression);
    return finder.found;
}

fn expression_contains_unconditional_try(expression: &Expr) -> bool {
    struct TryFinder {
        found: bool,
        conditional_depth: usize,
    }

    impl<'ast> syn::visit::Visit<'ast> for TryFinder {
        fn visit_expr_try(&mut self, node: &'ast syn::ExprTry) {
            if self.conditional_depth == 0 {
                self.found = true;
            }
            syn::visit::visit_expr_try(self, node);
        }
        fn visit_expr_closure(&mut self, _: &'ast syn::ExprClosure) {}
        fn visit_expr_async(&mut self, _: &'ast syn::ExprAsync) {}
        fn visit_expr_match(&mut self, node: &'ast syn::ExprMatch) {
            syn::visit::Visit::visit_expr(&mut *self, &node.expr);
            self.conditional_depth += 1;
            for arm in &node.arms {
                syn::visit::Visit::visit_arm(&mut *self, arm);
            }
            self.conditional_depth -= 1;
        }
        fn visit_expr_if(&mut self, node: &'ast syn::ExprIf) {
            syn::visit::Visit::visit_expr(&mut *self, &node.cond);
            self.conditional_depth += 1;
            syn::visit::Visit::visit_block(&mut *self, &node.then_branch);
            if let Some((_, else_branch)) = &node.else_branch {
                syn::visit::Visit::visit_expr(&mut *self, else_branch);
            }
            self.conditional_depth -= 1;
        }
        fn visit_expr_binary(&mut self, node: &'ast syn::ExprBinary) {
            syn::visit::Visit::visit_expr(&mut *self, &node.left);
            if matches!(node.op, BinOp::And(_) | BinOp::Or(_)) {
                self.conditional_depth += 1;
                syn::visit::Visit::visit_expr(&mut *self, &node.right);
                self.conditional_depth -= 1;
            } else {
                syn::visit::Visit::visit_expr(&mut *self, &node.right);
            }
        }
    }

    let mut finder = TryFinder {
        found: false,
        conditional_depth: 0,
    };
    syn::visit::Visit::visit_expr(&mut finder, expression);
    return finder.found;
}

fn collect_unconditional_try_expressions<'a>(expression: &'a Expr) -> Vec<&'a syn::ExprTry> {
    struct TryCollector<'b> {
        nodes: Vec<&'b syn::ExprTry>,
        conditional_depth: usize,
    }

    impl<'ast> syn::visit::Visit<'ast> for TryCollector<'ast> {
        fn visit_expr_try(&mut self, node: &'ast syn::ExprTry) {
            if self.conditional_depth == 0 {
                self.nodes.push(node);
            }
            syn::visit::visit_expr_try(self, node);
        }
        fn visit_expr_closure(&mut self, _: &'ast syn::ExprClosure) {}
        fn visit_expr_async(&mut self, _: &'ast syn::ExprAsync) {}
        fn visit_expr_match(&mut self, node: &'ast syn::ExprMatch) {
            syn::visit::Visit::visit_expr(&mut *self, &node.expr);
            self.conditional_depth += 1;
            for arm in &node.arms {
                syn::visit::Visit::visit_arm(&mut *self, arm);
            }
            self.conditional_depth -= 1;
        }
        fn visit_expr_if(&mut self, node: &'ast syn::ExprIf) {
            syn::visit::Visit::visit_expr(&mut *self, &node.cond);
            self.conditional_depth += 1;
            syn::visit::Visit::visit_block(&mut *self, &node.then_branch);
            if let Some((_, else_branch)) = &node.else_branch {
                syn::visit::Visit::visit_expr(&mut *self, else_branch);
            }
            self.conditional_depth -= 1;
        }
        fn visit_expr_binary(&mut self, node: &'ast syn::ExprBinary) {
            syn::visit::Visit::visit_expr(&mut *self, &node.left);
            if matches!(node.op, BinOp::And(_) | BinOp::Or(_)) {
                self.conditional_depth += 1;
                syn::visit::Visit::visit_expr(&mut *self, &node.right);
                self.conditional_depth -= 1;
            } else {
                syn::visit::Visit::visit_expr(&mut *self, &node.right);
            }
        }
    }

    let mut collector = TryCollector {
        nodes: vec![],
        conditional_depth: 0,
    };
    syn::visit::Visit::visit_expr(&mut collector, expression);
    collector.nodes.reverse();
    return collector.nodes;
}

fn emit_try_pre_extractions(
    out: &mut String,
    expression: &Expr,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<HashSet<String>, CompileError> {
    let try_nodes = collect_unconditional_try_expressions(expression);
    if try_nodes.is_empty() {
        return Ok(entities.clone());
    }
    let base_index = entities
        .iter()
        .find_map(|m| m.strip_prefix(TRY_COUNTER_MARKER))
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);
    let mut context = entities.clone();
    for (offset, try_node) in try_nodes.iter().enumerate() {
        let inner = emit_expression(&try_node.expr, &context)?;
        let key = try_node.to_token_stream().to_string();
        let temp = format!("__try{}", base_index + offset);
        write_indent(out, indent);
        writeln!(out, "const {temp} = {inner};").expect("writing to a String cannot fail");
        write_indent(out, indent);
        writeln!(out, "if ({temp} === undefined) {{").expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "return {};", option_return_absent_value(entities))
            .expect("writing to a String cannot fail");
        write_indent(out, indent);
        writeln!(out, "}}").expect("writing to a String cannot fail");
        context.insert(format!("{TRY_SUBSTITUTION_MARKER}{key}={temp}"));
    }
    context.retain(|m| !m.starts_with(TRY_COUNTER_MARKER));
    context.insert(format!(
        "{TRY_COUNTER_MARKER}{}",
        base_index + try_nodes.len()
    ));
    return Ok(context);
}

fn expression_contains_string_union_variant(expression: &Expr, context: &HashSet<String>) -> bool {
    struct StringUnionVariantFinder<'a> {
        context: &'a HashSet<String>,
        found: bool,
    }

    impl<'ast> Visit<'ast> for StringUnionVariantFinder<'_> {
        fn visit_expr_macro(&mut self, expression: &'ast syn::ExprMacro) {
            if expression
                .mac
                .path
                .segments
                .last()
                .is_some_and(|segment| segment.ident == "vec")
                && let Ok(values) = Punctuated::<Expr, Token![,]>::parse_terminated
                    .parse2(expression.mac.tokens.clone())
            {
                for value in &values {
                    self.visit_expr(value);
                }
            }
        }

        fn visit_expr_path(&mut self, expression: &'ast syn::ExprPath) {
            if expression.qself.is_none()
                && let Some((owner, _)) = path_owner_and_member(&expression.path)
                && is_string_union(self.context, &owner)
            {
                self.found = true;
            }
            syn::visit::visit_expr_path(self, expression);
        }
    }

    let mut finder = StringUnionVariantFinder {
        context,
        found: false,
    };
    finder.visit_expr(expression);
    return finder.found;
}

// A const assertion is useful for aggregate literals containing string-union variants because
// TypeScript otherwise widens their elements or fields. It is invalid on a call expression, even
// when one of the call's arguments lowers from a Rust enum variant to a string literal.
fn expression_requires_string_union_const_assertion(
    expression: &Expr,
    context: &HashSet<String>,
) -> bool {
    let aggregate = match expression {
        Expr::Array(_) | Expr::Repeat(_) | Expr::Struct(_) | Expr::Tuple(_) => expression,
        Expr::Macro(macro_expression)
            if macro_expression
                .mac
                .path
                .segments
                .last()
                .is_some_and(|segment| segment.ident == "vec") =>
        {
            expression
        }
        Expr::Call(call)
            if call.args.len() == 1
                && (expression_is_path(&call.func, "Some")
                    || expression_is_path(&call.func, "Ok")) =>
        {
            return expression_requires_string_union_const_assertion(&call.args[0], context);
        }
        Expr::Group(group) => {
            return expression_requires_string_union_const_assertion(&group.expr, context);
        }
        Expr::Paren(paren) => {
            return expression_requires_string_union_const_assertion(&paren.expr, context);
        }
        Expr::Reference(reference) => {
            return expression_requires_string_union_const_assertion(&reference.expr, context);
        }
        _ => return false,
    };
    return expression_contains_string_union_variant(aggregate, context);
}

fn expression_contains_path(block: &syn::Block, expected: &str) -> bool {
    struct PathFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for PathFinder<'_> {
        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path
                .path
                .segments
                .last()
                .is_some_and(|segment| segment.ident == self.expected)
            {
                self.found = true;
            }
            syn::visit::visit_expr_path(self, path);
        }
    }

    let mut finder = PathFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_block(&mut finder, block);
    return finder.found;
}

fn numeric_associated_call_type(func: &Expr) -> Option<String> {
    let Expr::Path(path) = func else {
        return None;
    };
    if let Some(qself) = path.qself.as_ref() {
        let Type::Path(type_path) = qself.ty.as_ref() else {
            return None;
        };
        if type_path.qself.is_some() || type_path.path.segments.len() != 1 {
            return None;
        }
        let type_name = type_path.path.segments[0].ident.to_string();
        return match type_name.as_str() {
            "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128" | "isize" | "u8" | "u16"
            | "u32" | "u64" | "u128" | "usize" => Some(type_name),
            _ => None,
        };
    }
    if path.path.segments.len() == 2 {
        let type_name = path.path.segments[0].ident.to_string();
        return match type_name.as_str() {
            "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128" | "isize" | "u8" | "u16"
            | "u32" | "u64" | "u128" | "usize" => Some(type_name),
            _ => None,
        };
    }
    return None;
}

pub(super) fn expression_is_associated_path(expression: &Expr, owner: &str, member: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    if path.path.segments.len() < 2 {
        return false;
    }
    let mut segments = path.path.segments.iter().rev();
    return segments
        .next()
        .is_some_and(|segment| segment.ident == member)
        && segments
            .next()
            .is_some_and(|segment| segment.ident == owner);
}

fn expression_is_none(expression: &Expr) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path.path.is_ident("None");
}

pub(crate) fn expression_is_path(expression: &Expr, expected: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path.path.is_ident(expected);
}

fn expression_is_finished_entity_return(expression: &Expr, context: &HashSet<String>) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    if path.qself.is_some() || path.path.segments.len() != 1 {
        return false;
    }
    let name = path.path.segments[0].ident.to_string();
    return lexical_binding(context, &name)
        .is_some_and(|id| context.contains(&format!("{FINISH_ENTITY_RETURN_MARKER}{id}")));
}

fn expression_is_path_call(expression: &Expr, expected: &str) -> bool {
    let Expr::Call(call) = expression else {
        return false;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return false;
    };
    return call.args.is_empty()
        && path
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == expected);
}

fn expression_kind(expression: &Expr) -> &'static str {
    return match expression {
        Expr::Async(_) => "async block",
        Expr::Await(_) => "await expression",
        Expr::Block(_) => "block expression",
        Expr::Break(_) => "break expression",
        Expr::Closure(_) => "closure",
        Expr::Const(_) => "const block",
        Expr::Continue(_) => "continue expression",
        Expr::ForLoop(_) => "for loop",
        Expr::If(_) => "if expression",
        Expr::Let(_) => "let expression",
        Expr::Loop(_) => "loop",
        Expr::Macro(_) => "macro expression",
        Expr::Match(_) => "match expression",
        Expr::Range(_) => "range expression",
        Expr::RawAddr(_) => "raw address",
        Expr::Repeat(_) => "array repeat expression",
        Expr::Return(_) => "return expression",
        Expr::Try(_) => "try expression",
        Expr::TryBlock(_) => "try block",
        Expr::Unsafe(_) => "unsafe block",
        Expr::Verbatim(_) => "verbatim tokens",
        Expr::While(_) => "while loop",
        Expr::Yield(_) => "yield expression",
        _ => "unknown expression",
    };
}

fn expression_path_ends_with(expression: &Expr, expected: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path
        .path
        .segments
        .last()
        .is_some_and(|segment| segment.ident == expected);
}

fn float_bit_comparison(
    binary: &syn::ExprBinary,
    entities: &HashSet<String>,
) -> Result<Option<(String, String)>, CompileError> {
    let Expr::MethodCall(left) = binary.left.as_ref() else {
        return Ok(None);
    };
    let Expr::MethodCall(right) = binary.right.as_ref() else {
        return Ok(None);
    };
    if left.method != "to_bits"
        || right.method != "to_bits"
        || !left.args.is_empty()
        || !right.args.is_empty()
    {
        return Ok(None);
    }
    return Ok(Some((
        emit_expression(&left.receiver, entities)?,
        emit_expression(&right.receiver, entities)?,
    )));
}

fn float_constant_type(path: &syn::Path) -> Option<&'static str> {
    let segments = path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    if segments.len() >= 2 {
        let rust_type = segments[segments.len() - 2].as_str();
        if rust_type == "f32" {
            return Some("f32");
        }
        if rust_type == "f64" {
            return Some("f64");
        }
    }
    if segments.len() >= 3 && segments[segments.len() - 2] == "consts" {
        let rust_type = segments[segments.len() - 3].as_str();
        if rust_type == "f32" {
            return Some("f32");
        }
        if rust_type == "f64" {
            return Some("f64");
        }
    }
    return None;
}

pub(super) fn is_primitive_typescript_type(typescript_type: &str) -> bool {
    return matches!(
        typescript_type,
        "boolean" | "number" | "object" | "string" | "unknown" | "void"
    ) || typescript_type.contains("=>");
}

pub(super) fn is_public(visibility: &Visibility) -> bool {
    return matches!(visibility, Visibility::Public(_));
}

fn is_crate_wide(visibility: &Visibility) -> bool {
    return is_public(visibility)
        || matches!(visibility, Visibility::Restricted(restricted) if restricted.path.is_ident("crate"));
}

fn source_access_for_visibility(visibility: &Visibility) -> SourceAccess {
    return if is_public(visibility) {
        SourceAccess::Public
    } else if is_crate_wide(visibility) {
        SourceAccess::Crate
    } else {
        SourceAccess::Local
    };
}

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

fn emit_numeric_function_reference(
    numeric_type: &str,
    method: &str,
) -> Result<String, CompileError> {
    return match method {
        "from" | "try_from" | "try_into" => Ok("(v) => v".to_string()),
        "is_ascii_digit" => Ok("((v: string | number): boolean => typeof v === 'number' ? v >= 48 && v <= 57 : v >= '0' && v <= '9')".to_string()),
        "is_ascii_lowercase" => Ok("((v: string | number): boolean => typeof v === 'number' ? v >= 97 && v <= 122 : v >= 'a' && v <= 'z')".to_string()),
        "is_ascii_uppercase" => Ok("((v: string | number): boolean => typeof v === 'number' ? v >= 65 && v <= 90 : v >= 'A' && v <= 'Z')".to_string()),
        "is_ascii_alphabetic" => Ok("((v: string | number): boolean => typeof v === 'number' ? (v >= 65 && v <= 90) || (v >= 97 && v <= 122) : (/^[a-zA-Z]$/).test(v))".to_string()),
        "is_ascii_alphanumeric" => Ok("((v: string | number): boolean => typeof v === 'number' ? (v >= 48 && v <= 57) || (v >= 65 && v <= 90) || (v >= 97 && v <= 122) : (/^[a-zA-Z0-9]$/).test(v))".to_string()),
        "is_ascii_hexdigit" => Ok("((v: string | number): boolean => typeof v === 'number' ? (v >= 48 && v <= 57) || (v >= 65 && v <= 70) || (v >= 97 && v <= 102) : (/^[0-9a-fA-F]$/).test(v))".to_string()),
        "is_ascii_whitespace" => Ok("((v: string | number): boolean => typeof v === 'number' ? v === 32 || v === 9 || v === 10 || v === 13 || v === 12 : v === ' ' || v === '\\t' || v === '\\n' || v === '\\r' || v === '\\x0C')".to_string()),
        "is_finite" => Ok("((v: number): boolean => Number.isFinite(v))".to_string()),
        "is_nan" => Ok("((v: number): boolean => Number.isNaN(v))".to_string()),
        "is_infinite" => Ok("((v: number): boolean => !Number.isFinite(v) && !Number.isNaN(v))".to_string()),
        "min" => Ok("Math.min".to_string()),
        "max" => Ok("Math.max".to_string()),
        "round" if matches!(numeric_type, "f32" | "f64") => {
            Ok("((n: number): number => Math.trunc(n + 0.5 * Math.sign(n)))".to_string())
        }
        "floor" if matches!(numeric_type, "f32" | "f64") => Ok("Math.floor".to_string()),
        "ceil" if matches!(numeric_type, "f32" | "f64") => Ok("Math.ceil".to_string()),
        "abs" if matches!(numeric_type, "f32" | "f64") => Ok("Math.abs".to_string()),
        "sqrt" if matches!(numeric_type, "f32" | "f64") => Ok("Math.sqrt".to_string()),
        _ => Err(compile_error(format!(
            "portable `{numeric_type}::{method}` as a function reference is not supported"
        ))),
    };
}

fn associated_numeric_method(expression: &Expr) -> Option<(String, String)> {
    let Expr::Path(path) = expression else {
        return None;
    };
    if path.path.segments.len() < 2 {
        return None;
    }
    let mut segments = path.path.segments.iter().rev();
    let method = segments.next()?.ident.to_string();
    let owner = segments.next()?.ident.to_string();
    match owner.as_str() {
        "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32" | "u64"
        | "usize" => Some((owner, method)),
        _ => None,
    }
}

fn numeric_dataview_info(rust_type: &str) -> Option<(&'static str, u8)> {
    return match rust_type {
        "f32" => Some(("Float32", 4)),
        "f64" => Some(("Float64", 8)),
        "i8" => Some(("Int8", 1)),
        "i16" => Some(("Int16", 2)),
        "i32" | "isize" => Some(("Int32", 4)),
        "i64" => Some(("BigInt64", 8)),
        "u8" => Some(("Uint8", 1)),
        "u16" => Some(("Uint16", 2)),
        "u32" | "usize" => Some(("Uint32", 4)),
        "u64" => Some(("BigUint64", 8)),
        _ => None,
    };
}

fn numeric_native_integer_typed_array(rust_type: &str) -> Option<&'static str> {
    return match rust_type {
        "i8" => Some("Int8Array"),
        "i16" => Some("Int16Array"),
        "i32" => Some("Int32Array"),
        "u8" => Some("Uint8Array"),
        "u16" => Some("Uint16Array"),
        "u32" => Some("Uint32Array"),
        _ => None,
    };
}

fn primitive_type_identity(rust_type: &Type) -> Option<String> {
    let name = match rust_type {
        Type::Group(group) => return primitive_type_identity(&group.elem),
        Type::Paren(paren) => return primitive_type_identity(&paren.elem),
        Type::Reference(reference) => return primitive_type_identity(&reference.elem),
        Type::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments[0].ident.to_string()
        }
        _ => return None,
    };
    return match name.as_str() {
        "bool" | "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128" | "isize" | "str"
        | "String" | "u8" | "u16" | "u32" | "u64" | "u128" | "usize" => Some(name),
        _ => None,
    };
}

pub(super) fn option_inner_type(rust_type: &Type) -> Option<&Type> {
    let Type::Path(path) = rust_type else {
        return None;
    };
    let segment = path.path.segments.last()?;
    if segment.ident != "Option" {
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
    return types.next().is_none().then_some(inner);
}

fn result_ok_type(rust_type: &Type) -> Option<&Type> {
    let Type::Path(path) = rust_type else {
        return None;
    };
    let segment = path.path.segments.last()?;
    if segment.ident != "Result" {
        return None;
    }
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return None;
    };
    let mut types = arguments.args.iter().filter_map(|argument| match argument {
        GenericArgument::Type(rust_type) => Some(rust_type),
        _ => None,
    });
    let ok_type = types.next()?;
    if types.next().is_none() {
        return None;
    }
    return Some(ok_type);
}

pub(super) fn named_type(rust_type: &Type) -> Option<String> {
    return match rust_type {
        Type::Group(group) => named_type(&group.elem),
        Type::Paren(paren) => named_type(&paren.elem),
        Type::Reference(reference) => named_type(&reference.elem),
        Type::Path(path) => path
            .path
            .segments
            .last()
            .map(|segment| segment.ident.to_string()),
        _ => None,
    };
}

fn ordering_variant_value(path: &syn::Path) -> Option<&'static str> {
    let mut segments = path.segments.iter().rev();
    let variant = segments.next()?;
    if segments.next()?.ident != "Ordering" {
        return None;
    }
    return match variant.ident.to_string().as_str() {
        "Less" => Some("-1"),
        "Equal" => Some("0"),
        "Greater" => Some("1"),
        _ => None,
    };
}

fn owner_marker(marker: &str, module: &str, name: &str, access: SourceAccess) -> String {
    let visibility = match access {
        SourceAccess::Local => "private",
        SourceAccess::Crate => "crate",
        SourceAccess::Public => "public",
    };
    return format!(
        "{marker}{module}{PROVENANCE_SEPARATOR}{name}{PROVENANCE_SEPARATOR}{visibility}"
    );
}

fn path_is_type_constant(path: &syn::Path, rust_type: &str, constant: &str) -> bool {
    let mut segments = path.segments.iter().rev();
    return segments
        .next()
        .is_some_and(|segment| segment.ident == constant)
        && segments
            .next()
            .is_some_and(|segment| segment.ident == rust_type);
}

fn type_is_unsigned_integer(rust_type: &Type) -> bool {
    return ["u8", "u16", "u32", "u64", "usize"]
        .iter()
        .any(|name| type_is_named(rust_type, name));
}

// Exact scalar types whose complete runtime representation is one TypeScript primitive. Aliases,
// qualified paths, generics and 64/128-bit integers stay unproven: the mutable-reference cell
// lowering must never infer their ownership or precision contract from a spelling alone.
pub(super) fn exact_portable_scalar_type(rust_type: &Type) -> Option<&'static str> {
    let Type::Path(path) = rust_type else {
        return None;
    };
    if path.qself.is_some() || path.path.leading_colon.is_some() || path.path.segments.len() != 1 {
        return None;
    }
    let segment = path.path.segments.first()?;
    if !matches!(segment.arguments, PathArguments::None) {
        return None;
    }
    return match segment.ident.to_string().as_str() {
        "bool" => Some("bool"),
        "f32" => Some("f32"),
        "f64" => Some("f64"),
        "i8" => Some("i8"),
        "i16" => Some("i16"),
        "i32" => Some("i32"),
        "isize" => Some("isize"),
        "u8" => Some("u8"),
        "u16" => Some("u16"),
        "u32" => Some("u32"),
        "usize" => Some("usize"),
        _ => None,
    };
}

pub(super) fn exact_mutable_scalar_reference(rust_type: &Type) -> Option<&'static str> {
    let Type::Reference(reference) = rust_type else {
        return None;
    };
    reference.mutability?;
    return exact_portable_scalar_type(&reference.elem);
}

fn referenced_path_identifier(expression: &Expr) -> Option<String> {
    return match expression {
        Expr::Group(group) => referenced_path_identifier(&group.expr),
        Expr::Paren(paren) => referenced_path_identifier(&paren.expr),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => path
            .path
            .segments
            .first()
            .map(|segment| segment.ident.to_string()),
        Expr::Reference(reference) => referenced_path_identifier(&reference.expr),
        _ => None,
    };
}

fn path_is_float_constant(path: &syn::Path, constant: &str) -> bool {
    return float_constant_type(path).is_some()
        && path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == constant);
}

fn float_const_js_value(name: &str) -> Option<&'static str> {
    return match name {
        "E" => Some("Math.E"),
        "FRAC_1_PI" => Some("(1 / Math.PI)"),
        "FRAC_1_SQRT_2" => Some("Math.SQRT1_2"),
        "FRAC_2_PI" => Some("(2 / Math.PI)"),
        "FRAC_2_SQRT_PI" => Some("(2 / Math.sqrt(Math.PI))"),
        "FRAC_PI_2" => Some("(Math.PI / 2)"),
        "FRAC_PI_3" => Some("(Math.PI / 3)"),
        "FRAC_PI_4" => Some("(Math.PI / 4)"),
        "FRAC_PI_6" => Some("(Math.PI / 6)"),
        "FRAC_PI_8" => Some("(Math.PI / 8)"),
        "LN_2" => Some("Math.LN2"),
        "LN_10" => Some("Math.LN10"),
        "LOG2_E" => Some("Math.LOG2E"),
        "LOG2_10" => Some("(Math.LN10 / Math.LN2)"),
        "LOG10_E" => Some("Math.LOG10E"),
        "LOG10_2" => Some("(Math.LN2 / Math.LN10)"),
        "PI" => Some("Math.PI"),
        "SQRT_2" => Some("Math.SQRT2"),
        "TAU" => Some("(Math.PI * 2)"),
        _ => None,
    };
}

fn pattern_is_mutable(pattern: &Pat) -> bool {
    return match pattern {
        Pat::Ident(identifier) => identifier.mutability.is_some(),
        Pat::Reference(reference) => {
            reference.mutability.is_some() || pattern_is_mutable(&reference.pat)
        }
        Pat::Tuple(tuple) => tuple.elems.iter().any(pattern_is_mutable),
        Pat::TupleStruct(tuple) => tuple.elems.iter().any(pattern_is_mutable),
        Pat::Type(typed) => pattern_is_mutable(&typed.pat),
        _ => false,
    };
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

// Whether every shadow of parameter `name` may lower to a plain reassignment of the TypeScript
// parameter instead of a fresh `name_N` binding. Reassignment overwrites the one JS binding, so it is
// only sound when each shadowing `let` is a top-level statement of the body (a shadow inside a block,
// branch, loop or closure would leak past its Rust scope), no closure or async block reads the
// parameter (it would observe the later value), and each initializer provably keeps the parameter's
// TypeScript type.
fn parameter_is_reassignable(name: &str, parameter_type: &Type, body: &syn::Block) -> bool {
    struct NestedUseFinder<'a> {
        name: &'a str,
        found: bool,
    }
    impl<'ast> Visit<'ast> for NestedUseFinder<'_> {
        fn visit_local(&mut self, local: &'ast syn::Local) {
            if pattern_binds_name(&local.pat, self.name) {
                self.found = true;
            }
            syn::visit::visit_local(self, local);
        }
        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            self.found |= expression_reads_name(&closure.body, self.name);
            syn::visit::visit_expr_closure(self, closure);
        }
        fn visit_expr_async(&mut self, block: &'ast syn::ExprAsync) {
            self.found |= block_reads_name(&block.block, self.name);
            syn::visit::visit_expr_async(self, block);
        }
    }
    fn pattern_binds_name(pattern: &Pat, name: &str) -> bool {
        struct Binder<'a> {
            name: &'a str,
            found: bool,
        }
        impl<'ast> Visit<'ast> for Binder<'_> {
            fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
                self.found |= pattern.ident == self.name;
                syn::visit::visit_pat_ident(self, pattern);
            }
        }
        let mut binder = Binder { name, found: false };
        binder.visit_pat(pattern);
        return binder.found;
    }
    struct Reader<'a> {
        name: &'a str,
        found: bool,
    }
    impl<'ast> Visit<'ast> for Reader<'_> {
        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            self.found |= path.qself.is_none() && path.path.is_ident(self.name);
            syn::visit::visit_expr_path(self, path);
        }
    }
    fn expression_reads_name(expression: &Expr, name: &str) -> bool {
        let mut reader = Reader { name, found: false };
        reader.visit_expr(expression);
        return reader.found;
    }
    fn block_reads_name(block: &syn::Block, name: &str) -> bool {
        let mut reader = Reader { name, found: false };
        reader.visit_block(block);
        return reader.found;
    }
    let mut finder = NestedUseFinder { name, found: false };
    for statement in &body.stmts {
        match statement {
            Stmt::Local(local) if pattern_binds_name(&local.pat, name) => {
                let pattern = match &local.pat {
                    Pat::Type(typed) => typed.pat.as_ref(),
                    pattern => pattern,
                };
                let Pat::Ident(identifier) = pattern else {
                    return false;
                };
                let Some(initializer) = &local.init else {
                    return false;
                };
                if identifier.subpat.is_some()
                    || identifier.by_ref.is_some()
                    || initializer.diverge.is_some()
                    || !shadow_preserves_parameter_type(name, parameter_type, &initializer.expr)
                {
                    return false;
                }
                finder.visit_expr(&initializer.expr);
            }
            statement => finder.visit_stmt(statement),
        }
        if finder.found {
            return false;
        }
    }
    return true;
}

fn parenthesize_compound(expr: &str) -> std::borrow::Cow<'_, str> {
    let trimmed = expr.trim();
    if trimmed.starts_with('(') && trimmed.ends_with(')') {
        return std::borrow::Cow::Borrowed(expr);
    }
    let bytes = trimmed.as_bytes();
    let len = bytes.len();
    let mut depth = 0i32;
    let mut i = 0;
    while i < len {
        match bytes[i] {
            b'(' | b'[' => depth += 1,
            b')' | b']' => depth -= 1,
            b'>' if depth == 0 && i + 1 < len && bytes[i + 1] == b'>' => {
                return std::borrow::Cow::Owned(format!("({expr})"));
            }
            b'<' if depth == 0 && i + 1 < len && bytes[i + 1] == b'<' => {
                return std::borrow::Cow::Owned(format!("({expr})"));
            }
            b'?' if depth == 0 => {
                return std::borrow::Cow::Owned(format!("({expr})"));
            }
            _ => {}
        }
        i += 1;
    }
    return std::borrow::Cow::Borrowed(expr);
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

fn indent_continuation_lines(text: &str, indent: usize) -> String {
    if indent == 0 || !text.contains('\n') {
        return text.to_string();
    }
    let prefix = "  ".repeat(indent);
    let mut result = String::with_capacity(text.len() + indent * 2 * text.matches('\n').count());
    let mut first = true;
    for line in text.split('\n') {
        if !first {
            result.push('\n');
            if !line.is_empty() {
                result.push_str(&prefix);
            }
        }
        result.push_str(line);
        first = false;
    }
    return result;
}

pub(crate) fn write_indent(out: &mut String, indent: usize) {
    for _ in 0..indent {
        out.push_str("  ");
    }
}

fn join_closing_brace_with(out: &mut String, continuation: &str) {
    if out.ends_with("}\n") {
        out.pop();
        out.push(' ');
    }
    out.push_str(continuation);
}

impl BindingFact {
    fn has_source_structure(&self) -> bool {
        return match self {
            Self::Option(payload) | Self::Sequence(payload) => payload.has_source_structure(),
            Self::Structure(_) => true,
            Self::Tuple(facts) => facts.iter().any(Self::has_source_structure),
            Self::HashMap
            | Self::HashSet
            | Self::TypedArray(_)
            | Self::Unknown
            | Self::UnresolvedPattern => false,
        };
    }
}

impl ProvenanceIdentity {
    fn description(&self) -> String {
        return format!("`{}` in `{}`", self.declaration, self.module);
    }

    fn encoded(&self) -> String {
        return format!("{}{PROVENANCE_SEPARATOR}{}", self.module, self.declaration);
    }

    fn encoded_description(encoded: &str) -> String {
        let Some((module, declaration)) = encoded.split_once(PROVENANCE_SEPARATOR) else {
            return format!("`{encoded}`");
        };
        return format!("`{declaration}` in `{module}`");
    }
}

pub(super) type ProvenanceDeclarations = BTreeMap<String, BTreeSet<ProvenanceIdentity>>;

pub(super) type ProvenanceBindings = BTreeMap<String, BTreeSet<ProvenanceIdentity>>;

pub(super) type ProvenanceModuleBindings = BTreeMap<String, ProvenanceBindings>;

#[derive(Clone, Debug)]
pub(super) enum ProvenanceImportRule {
    Explicit {
        exported: String,
        imported: String,
        module: Option<String>,
    },
    Wildcard {
        module: String,
    },
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
