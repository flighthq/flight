mod argument_parameter_analysis;
mod binary_emit;
mod binding_analysis;
mod binding_fact;
mod block_emit;
mod callable_type_analysis;
mod checked_arithmetic_emit;
mod context_insert;
mod cross_crate;
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
mod match_types;
mod method_call;
mod naming;
mod numeric_analysis;
mod option_analysis;
mod option_emit_helpers;
mod parameter_emit;
mod pattern_helpers;
mod pinned_boxed_emit;
mod program_emit;
mod program_helpers;
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
use checked_arithmetic_emit::*;
use context_insert::*;
pub(crate) use context_insert::{
    insert_program_type_path_context, insert_std_float_consts_context,
    insert_std_mem_import_context, insert_type_path_context, insert_typed_array_constant_context,
};
pub(crate) use cross_crate::CrossCrateSymbol;
use cross_crate::*;
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
use match_types::*;
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
    EmitProgramInput, collect_cross_crate_use_tree, emit_program, is_lowered_cross_crate_type,
    is_lowered_cross_crate_value, test_cross_crate_imports, test_mixed_foreign_wildcard_roots,
};
use program_helpers::*;
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
