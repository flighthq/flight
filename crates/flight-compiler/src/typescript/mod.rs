mod safety;
mod vitest_helpers;

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fmt::Write;

use quote::ToTokens;
use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::visit::Visit;
use syn::{
    Attribute, BinOp, Expr, FnArg, GenericArgument, Item, ItemFn, ItemStruct, ItemUse, Lit, Pat,
    PathArguments, ReturnType, Stmt, Token, Type, UnOp, UseTree, Visibility,
};

use crate::model::{ExternalNullableOptionProgram, Program, StringUnionStyle, TestProgram};
use crate::{CompileError, compile_error};

use safety::{
    reject_entity_runtime_state_store_collisions, reject_function_exits_in_value_position,
    reject_unresolved_pattern_field, reject_unsafe_lazy_lock_initializers,
    reject_unsupported_array_like_uses,
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
    pub external_shared_identity_fields: &'a BTreeSet<String>,
    pub module_identities: Option<&'a [String]>,
    pub visibility_programs: &'a [Program],
    pub visibility_identities: &'a [Option<String>],
    pub source_paths: &'a [Option<String>],
}

type PreferredAliases = HashMap<String, String>;

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

// An entity declared by a target-native sibling keeps the type name that sibling owns. Generated
// entity declarations still reserve the unsuffixed name for their wrapper and emit `NameRaw`.
const TARGET_NATIVE_ENTITY_MARKER: &str = "@target-native-entity:";

const DATA_UNION_UNIT_MARKER: &str = "@data-union-unit:";

const DATA_UNION_VARIANT_MARKER: &str = "@data-union-variant:";

const RESERVED_KEY_DATA_UNION_VARIANT_MARKER: &str = "@reserved-key-data-union-variant:";

const RESERVED_KEY_DATA_UNION_VARIANT_TYPE_MARKER: &str = "@reserved-key-data-union-variant-type:";

const TAGGED_DATA_UNION_VARIANT_MARKER: &str = "@tagged-data-union-variant:";

// A field an `allocate_entity` local may leave out of its default object because the construction
// initializer called on it in the very next statement definitely assigns it (`type:field`).
const ENTITY_ALLOCATION_INITIALIZED_FIELD_MARKER: &str = "@entity-allocation-initialized-field:";

const ENTITY_DEFAULT_FIELD_MARKER: &str = "@entity-default-field:";

// A field an initializer definitely assigns through its leading `&mut Entity` parameter on every
// completing path (`function:type:field`).
const ENTITY_DEFINITELY_INITIALIZED_FIELD_MARKER: &str = "@entity-definitely-initialized-field:";

const ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER: &str = "@entity-unsupported-default-field:";

const ENTITY_CLONE_FIELD_MARKER: &str = "@entity-clone-field:";

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

const INTERIOR_MUTABLE_STRUCT_MARKER: &str = "@interior-mutable-struct:";

// `{module}␟{Struct}` for each entity a source declares `readonly-fields`, so an `initialize_*`
// function in another source that resolves its leading `&mut` parameter to it gets the writable
// construction view.
const READONLY_ENTITY_MARKER: &str = "@readonly-entity:";

const REF_ALIAS_TARGET_MARKER: &str = "@ref-alias-target:";

const REF_ALIAS_RECEIVER_CAPTURE_MARKER: &str = "@ref-alias-receiver-capture:";

const REFERENCE_PARAMETER_BINDING_MARKER: &str = "@reference-parameter-binding:";

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

pub(super) const NULLABLE_OPTION_RETURN_MARKER: &str = "@nullable-option-return:";

pub(super) const NULLABLE_OPTIONS_MARKER: &str = "@nullable-options";

// `{source}␟{function}␟{position}` for each `array-like` slice parameter, by its argument position, so
// an onward call can check the parameter of the callee it resolves to.
pub(super) const ARRAY_LIKE_ARGUMENT_MARKER: &str = "@array-like-argument:";

// `{source}␟{function}␟{parameter}` for each `array-like` slice parameter, typed `ArrayLike<T>`; the
// source identity keeps a sibling's designation from applying to a same-named local function.
const ARRAY_LIKE_PARAMETER_MARKER: &str = "@array-like-parameter:";

// `{source}␟{Struct}␟{field}` for a `nullable-option` struct field, read where that struct is declared or
// built by literal.
pub(super) const NULLABLE_OPTION_LITERAL_FIELD_MARKER: &str = "@nullable-option-literal-field:";

// A function whose `Option` return is designated `nullable-option`: its returns use `null`.
pub(super) const RETURNS_NULLABLE_MARKER: &str = "@returns-nullable";

// A function returning a fixed array of a typed-array primitive (`[f64; 4]` is `Float64Array`): its
// returned array literals construct that typed array.
const RETURNS_TYPED_ARRAY_MARKER: &str = "@returns-typed-array:";

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

pub(super) const RETURN_BINDING_FACT_MARKER: &str = "@return-binding-fact:";

const RETURNS_U32_MARKER: &str = "@returns-u32";

// Struct fields (`struct identity SEP field`) and locals or parameters whose every binding is declared
// as a Rust `Vec`, slice or fixed array, the operand types `.extend()` and `.extend_from_slice()` lower
// over.
// A struct field typed `HashSet` / `HashMap`: `identity SEP field SEP hash-set|hash-map`.
const HASH_COLLECTION_FIELD_MARKER: &str = "@hash-collection-field:";

const SEQUENCE_FIELD_MARKER: &str = "@sequence-field:";

// Functions returning a Rust `Vec`, slice or fixed array (`module SEP function SEP`).
pub(super) const SEQUENCE_RETURN_MARKER: &str = "@sequence-return:";

const STRING_EXPRESSION_MARKER: &str = "@string-expression:";

const STRING_FIELD_MARKER: &str = "@string-field:";

pub(super) const STRING_RETURN_MARKER: &str = "@string-return:";

pub(super) const STRING_UNION_MARKER: &str = "@string-union:";

pub(super) const STRUCT_OWNER_MARKER: &str = "@struct-owner:";

// `{module}␟{type-path fact}` retains the source-local canonical type-path context in the aggregate
// provenance context. This lets later alias expansion resolve every spelling of a proven standard
// `Arc`, including absolute paths and renamed root or module imports.
const SOURCE_TYPE_PATH_CONTEXT_MARKER: &str = "@source-type-path-context:";

// Owner facts for each non-generic source type alias, and `{module}␟{alias}␟{type tokens}` for its
// definition, so a struct identity is seen through alias chains across sources.
const TYPE_ALIAS_DEFINITION_MARKER: &str = "@type-alias-definition:";

const TYPE_ALIAS_OWNER_MARKER: &str = "@type-alias-owner:";

// Functions returning a resolved struct (`module SEP function SEP struct identity`).
pub(super) const STRUCT_RETURN_MARKER: &str = "@struct-return:";

// `{struct identity}␟{field}␟{field struct identity}` for each field whose declared type is a struct of
// a source, so a nested field read resolves its owner through the declarations.
pub(super) const STRUCT_FIELD_TYPE_MARKER: &str = "@struct-field-type:";
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
enum RuntimeCategory {
    Null,
    Boolean,
    Number,
    String,
    Array,
    Record,
    Function,
    Object,
}

struct DataUnionPatternTest {
    bindings: Vec<(String, String)>,
    predicate: Option<String>,
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

struct OptionMatchArm {
    binding: Option<String>,
    present: bool,
}

struct ExternalIdentityAlias {
    module: String,
    tag: String,
}

#[derive(Clone)]
pub(super) struct CrossCrateSymbol {
    imported: String,
    local: String,
    module: String,
}

struct CrossCrateUsageCollector<'a> {
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
    let (name, value, absent) = binding;
    let (if_indent, test) = if rereadable {
        (indent, value.clone())
    } else {
        write_indent(out, indent);
        out.push_str("{\n");
        write_indent(out, indent + 1);
        writeln!(out, "const ${name} = {value};").expect("writing to a String cannot fail");
        (indent + 1, format!("${name}"))
    };
    write_indent(out, if_indent);
    writeln!(out, "if ({test} !== {absent}) {{").expect("writing to a String cannot fail");
    if &test != name {
        write_indent(out, if_indent + 1);
        writeln!(out, "const {name} = {test};").expect("writing to a String cannot fail");
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
    write_indent(out, indent);
    if rereadable {
        writeln!(out, "while ({value} !== {absent}) {{").expect("writing to a String cannot fail");
        if value != name {
            write_indent(out, indent + 1);
            writeln!(out, "const {name} = {value};").expect("writing to a String cannot fail");
        }
        return;
    }
    out.push_str("for (;;) {\n");
    write_indent(out, indent + 1);
    writeln!(out, "const ${name} = {value};").expect("writing to a String cannot fail");
    write_indent(out, indent + 1);
    writeln!(out, "if (${name} === {absent}) {{").expect("writing to a String cannot fail");
    write_indent(out, indent + 2);
    out.push_str("break;\n");
    write_indent(out, indent + 1);
    out.push_str("}\n");
    write_indent(out, indent + 1);
    writeln!(out, "const {name} = ${name};").expect("writing to a String cannot fail");
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

// The TypeScript name of a Rust item or path segment: SCREAMING_CASE constants keep their name, and
// everything else is lower camel case.
pub(crate) fn default_item_name(segment: &str) -> String {
    return emit_path_segment(segment);
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
        expression => expression_struct_name(expression, entities),
    };
}

// `SHARED_IDENTITY_EXTERNAL_TYPE_MARKER` and `SHARED_IDENTITY_EXTERNAL_FIELD_MARKER` facts for the
// dependency sources, each `(source, module)` of the crate the package `module`
// (`@flighthq/<name>/contract`) is generated from. Every type is read in its own source's `use` items
// and type aliases; an alias naming another source of its crate resolves once that alias is proven,
// so the facts are a fixpoint over the crate's sources.
pub(crate) fn external_shared_identity_facts(
    sources: &[(&str, &str)],
) -> Result<BTreeSet<String>, CompileError> {
    struct DependencySource {
        crate_name: String,
        context: HashSet<String>,
        aliases: BTreeMap<String, Type>,
        structures: BTreeSet<String>,
        file: syn::File,
    }
    let mut parsed = Vec::new();
    for (source, module) in sources {
        let Some(package) = module
            .strip_prefix("@flighthq/")
            .and_then(|rest| rest.strip_suffix("/contract"))
        else {
            continue;
        };
        let file = syn::parse_file(source)
            .map_err(|error| compile_error(format!("failed to parse Rust source: {error}")))?;
        let mut aliases = BTreeMap::new();
        let mut structures = BTreeSet::new();
        let mut local_names = Vec::new();
        for item in &file.items {
            match item {
                syn::Item::Struct(structure) => {
                    structures.insert(structure.ident.to_string());
                    local_names.push(structure.ident.to_string());
                }
                syn::Item::Type(alias) => {
                    local_names.push(alias.ident.to_string());
                    if alias.generics.params.is_empty() {
                        aliases.insert(alias.ident.to_string(), alias.ty.as_ref().clone());
                    }
                }
                syn::Item::Enum(item) => local_names.push(item.ident.to_string()),
                syn::Item::Trait(item) => local_names.push(item.ident.to_string()),
                _ => {}
            }
        }
        let mut context = HashSet::new();
        insert_type_path_context(
            &mut context,
            file.items.iter().filter_map(|item| match item {
                syn::Item::Use(item_use) => Some(item_use),
                _ => None,
            }),
            local_names.into_iter(),
        );
        parsed.push(DependencySource {
            crate_name: format!("flight_{}", package.replace('-', "_")),
            context,
            aliases,
            structures,
            file,
        });
    }
    let mut known = parsed
        .iter()
        .flat_map(|source| {
            source
                .structures
                .iter()
                .map(|name| format!("{}::{name}", source.crate_name))
        })
        .collect::<BTreeSet<_>>();
    loop {
        let mut changed = false;
        for source in &parsed {
            let context =
                dependency_source_context(source.context.clone(), &known, &source.crate_name);
            for item in &source.file.items {
                let syn::Item::Type(alias) = item else {
                    continue;
                };
                let name = format!("{}::{}", source.crate_name, alias.ident);
                if alias.generics.params.is_empty()
                    && !known.contains(&name)
                    && external_type_is_shared_identity(
                        &context,
                        &source.aliases,
                        &source.structures,
                        &alias.ty,
                        0,
                    )
                {
                    known.insert(name);
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    let mut facts = known
        .iter()
        .map(|name| format!("{SHARED_IDENTITY_EXTERNAL_TYPE_MARKER}{name}"))
        .collect::<BTreeSet<_>>();
    for source in &parsed {
        let context = dependency_source_context(source.context.clone(), &known, &source.crate_name);
        for item in &source.file.items {
            let syn::Item::Struct(structure) = item else {
                continue;
            };
            if !is_public(&structure.vis) {
                continue;
            }
            for field in &structure.fields {
                let Some(field_name) = &field.ident else {
                    continue;
                };
                if is_public(&field.vis)
                    && external_type_is_shared_identity(
                        &context,
                        &source.aliases,
                        &source.structures,
                        &field.ty,
                        0,
                    )
                {
                    facts.insert(format!(
                        "{SHARED_IDENTITY_EXTERNAL_FIELD_MARKER}{}::{}{PROVENANCE_SEPARATOR}{field_name}",
                        source.crate_name, structure.ident
                    ));
                }
            }
        }
    }
    return Ok(facts);
}

// The dependency-crate struct a declared type names (`crate::Struct`), through references: a path
// resolving into another `flight_*` crate. Only its crate and item name are kept, so a re-export from
// the crate root and the defining module name the same struct.
fn external_struct_type(entities: &HashSet<String>, rust_type: &Type) -> Option<String> {
    return match current_source(entities) {
        Some(from) => external_struct_type_in(entities, &from, rust_type),
        None => external_struct_type_with(entities, rust_type),
    };
}

fn external_struct_type_in(
    entities: &HashSet<String>,
    from: &str,
    rust_type: &Type,
) -> Option<String> {
    return external_struct_type_with(&source_type_context(entities, from), rust_type);
}

// `external_struct_type` resolved through the type-namespace provenance `context`.
fn external_struct_type_with(context: &HashSet<String>, rust_type: &Type) -> Option<String> {
    let path = match rust_type {
        Type::Group(group) => return external_struct_type_with(context, &group.elem),
        Type::Paren(paren) => return external_struct_type_with(context, &paren.elem),
        Type::Reference(reference) => return external_struct_type_with(context, &reference.elem),
        Type::Path(path) if path.qself.is_none() => &path.path,
        _ => return None,
    };
    if !matches!(path.segments.last()?.arguments, PathArguments::None) {
        return None;
    }
    let resolved = resolve_type_path(path, context)?;
    let (first, last) = (resolved.first()?, resolved.last()?);
    if resolved.len() < 2 || !first.starts_with("flight_") {
        return None;
    }
    return Some(format!("{first}::{last}"));
}

// `rust_type_is_shared_identity` for a dependency source read on its own: its source structs are
// objects and its type aliases stand for their definitions; anything else must resolve through its
// `use` items to a standard identity-bearing type.
fn external_type_is_shared_identity(
    context: &HashSet<String>,
    aliases: &BTreeMap<String, Type>,
    structures: &BTreeSet<String>,
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
    {
        let name = path.path.segments[0].ident.to_string();
        if structures.contains(&name) {
            return true;
        }
        if let Some(definition) = aliases.get(&name) {
            return external_type_is_shared_identity(
                context,
                aliases,
                structures,
                definition,
                depth + 1,
            );
        }
    }
    return shared_identity_type_at_depth(context, None, rust_type, depth);
}

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
pub(super) fn insert_dependency_export_name_context(
    context: &mut HashSet<String>,
    dependencies: &[(BTreeMap<String, String>, &str)],
    symbols: &BTreeMap<String, CrossCrateSymbol>,
    wildcard_modules: &[String],
    functions: &[&ItemFn],
    constants: &[&syn::ItemConst],
    statics: &[&syn::ItemStatic],
) -> Result<(), CompileError> {
    let mut modules = BTreeMap::<&str, BTreeMap<&str, &str>>::new();
    for (names, module) in dependencies {
        for (item, target) in names {
            if modules
                .entry(module)
                .or_default()
                .insert(item, target)
                .is_some_and(|previous| previous != target)
            {
                return Err(compile_error(format!(
                    "`flight-compiler: export-name` item `{item}` of `{module}` is given more than one TypeScript name"
                )));
            }
            context.insert(format!("{DEPENDENCY_EXPORT_NAME_MARKER}{module}|{item}"));
            context.insert(format!(
                "{DEPENDENCY_EXPORT_NAME_TARGET_MARKER}{module}|{item}:{target}"
            ));
        }
    }
    let mut references = BTreeMap::<String, (String, String)>::new();
    for symbol in symbols.values() {
        if let Some(target) = modules
            .get(symbol.module.as_str())
            .and_then(|names| names.get(symbol.imported.as_str()))
        {
            // Ordinary renamed imports keep their local alias. A const-group member has no
            // standalone TypeScript export to alias, so both renamed and unrenamed Rust bindings
            // are instead rewritten to the owner's `Owner.Member` expression below.
            if symbol.local != symbol.imported && !target.contains('.') {
                continue;
            }
            references.insert(
                symbol.local.clone(),
                (target.to_string(), symbol.module.clone()),
            );
        }
    }
    reject_const_group_wildcard_imports(dependencies, wildcard_modules)?;
    for module in wildcard_modules {
        for (item, target) in modules.get(module.as_str()).into_iter().flatten() {
            let reference = (target.to_string(), module.clone());
            if references
                .insert(item.to_string(), reference.clone())
                .is_some_and(|previous| previous != reference)
            {
                return Err(compile_error(format!(
                    "`flight-compiler: export-name` item `{item}` is imported from more than one package"
                )));
            }
        }
    }
    if references.is_empty() {
        return Ok(());
    }

    #[derive(Default)]
    struct BindingNameCollector {
        names: HashSet<String>,
    }

    impl<'ast> Visit<'ast> for BindingNameCollector {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            self.names.insert(pattern.ident.to_string());
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut bindings = BindingNameCollector::default();
    for function in functions {
        bindings.visit_item_fn(function);
    }
    for constant in constants {
        bindings.visit_item_const(constant);
    }
    for item in statics {
        bindings.visit_item_static(item);
    }
    for (local, (target, module)) in &references {
        if let Some(existing) = export_name(context, local)
            && existing != target
        {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{local}` imported from `{module}` as `{target}` collides with the local mapping `{existing}`"
            )));
        }
        if bindings.names.contains(local) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{local}` imported from `{module}` is shadowed by a local binding of the same name"
            )));
        }
    }
    context.insert(DEPENDENCY_EXPORT_NAME_BINDINGS_MARKER.to_string());
    for (local, (target, module)) in references {
        context.insert(format!("{EXPORT_NAME_MARKER}{local}"));
        context.insert(format!("{EXPORT_NAME_TARGET_MARKER}{local}:{target}"));
        context.insert(format!(
            "{DEPENDENCY_EXPORT_NAME_BINDING_MARKER}{target}|{module}|{local}"
        ));
    }
    return Ok(());
}

// Records every `export-name` mapping of the combined sources. A mapped Rust name must be declared by
// exactly one source, must not collide with another item's TypeScript name, and must not be reused as a
// local binding, so every reference to it renders the same TypeScript name.
// flight-lint: allow(hashmap-iteration) directives are BTreeMaps and items retain Rust source order in Vecs
fn insert_export_name_context(
    context: &mut HashSet<String>,
    programs: &[(&str, &Program)],
) -> Result<(), CompileError> {
    let mut mappings = BTreeMap::<&str, &str>::new();
    for (_, program) in programs {
        for (item, target) in &program.export_names {
            if mappings
                .insert(item, target)
                .is_some_and(|previous| previous != target)
            {
                return Err(compile_error(format!(
                    "`flight-compiler: export-name` item `{item}` is given more than one TypeScript name"
                )));
            }
        }
    }
    if mappings.is_empty() {
        return Ok(());
    }
    // Declaring sources per name, identified by their items: a source may also arrive as one of its own
    // alias sources, and that identical copy is the same declaration.
    let mut declarations = BTreeMap::<String, BTreeSet<String>>::new();
    for (_, program) in programs {
        let names = program
            .functions
            .iter()
            .map(|function| function.sig.ident.to_string())
            .chain(
                program
                    .constants
                    .iter()
                    .map(|constant| constant.ident.to_string()),
            )
            .chain(program.statics.iter().map(|item| item.ident.to_string()))
            .collect::<Vec<_>>();
        let source = if names
            .iter()
            .any(|name| mappings.contains_key(name.as_str()))
        {
            program_item_tokens(program)
        } else {
            String::new()
        };
        for name in names {
            declarations.entry(name).or_default().insert(source.clone());
        }
    }
    for (item, target) in &mappings {
        if declarations.get(*item).is_some_and(|items| items.len() > 1) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{item}` is declared by more than one source"
            )));
        }
        let collides = declarations.keys().any(|other| {
            other != item
                && mappings.get(other.as_str()).map_or_else(
                    || default_item_name(other) == *target,
                    |other_target| other_target == target,
                )
        });
        if collides {
            return Err(compile_error(format!(
                "`flight-compiler: export-name {item}` TypeScript name `{target}` collides with another item"
            )));
        }
    }
    // Names bound by patterns (`let`, parameters, closures, `match` arms) anywhere in the sources.
    #[derive(Default)]
    struct BindingNameCollector {
        names: HashSet<String>,
    }

    impl<'ast> Visit<'ast> for BindingNameCollector {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            self.names.insert(pattern.ident.to_string());
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut bindings = BindingNameCollector::default();
    for (_, program) in programs {
        for function in &program.functions {
            bindings.visit_item_fn(function);
        }
        for constant in &program.constants {
            bindings.visit_item_const(constant);
        }
        for item in &program.statics {
            bindings.visit_item_static(item);
        }
    }
    for (item, target) in mappings {
        if bindings.names.contains(item) {
            return Err(compile_error(format!(
                "`flight-compiler: export-name` item `{item}` is shadowed by a local binding of the same name"
            )));
        }
        context.insert(format!("{EXPORT_NAME_MARKER}{item}"));
        context.insert(format!("{EXPORT_NAME_TARGET_MARKER}{item}:{target}"));
    }
    return Ok(());
}

// Adds every `parameter.field` that `statements` assign on all completing paths: a top-level
// assignment, or an `if` whose branches all assign it. Scanning stops at the first statement that
// can leave the body early (`return`, `?`, `break`, `continue`), so a field assigned only after a
// possible early exit is not definitely assigned. Returns false when scanning stopped early.
fn collect_definitely_assigned_fields(
    statements: &[Stmt],
    parameter: &str,
    out: &mut BTreeSet<String>,
) -> bool {
    for statement in statements {
        if statement_may_exit_early(statement) {
            return false;
        }
        match statement {
            Stmt::Expr(Expr::Assign(assign), _) => {
                if let Expr::Field(field) = assign.left.as_ref()
                    && let Expr::Path(base) = field.base.as_ref()
                    && base.path.is_ident(parameter)
                    && let syn::Member::Named(member) = &field.member
                {
                    out.insert(member.to_string());
                }
            }
            Stmt::Expr(Expr::If(branch), _) => {
                let Some((_, otherwise)) = &branch.else_branch else {
                    continue;
                };
                let Expr::Block(otherwise) = otherwise.as_ref() else {
                    continue;
                };
                let mut then_fields = BTreeSet::new();
                let mut else_fields = BTreeSet::new();
                collect_definitely_assigned_fields(
                    &branch.then_branch.stmts,
                    parameter,
                    &mut then_fields,
                );
                collect_definitely_assigned_fields(
                    &otherwise.block.stmts,
                    parameter,
                    &mut else_fields,
                );
                out.extend(then_fields.intersection(&else_fields).cloned());
            }
            _ => {}
        }
    }
    return true;
}

// Records a program's type-namespace provenance: its `use` items and local declarations (see
// `insert_type_path_context`), each `extern crate` binding (`extern crate a as b;` binds `b` to crate
// `a`, `self` to this crate), and `#![no_std]`.
pub(crate) fn insert_program_type_path_context(context: &mut HashSet<String>, program: &Program) {
    insert_type_path_context(
        context,
        program.uses.iter(),
        program.type_names.iter().cloned(),
    );
    for extern_crate in &program.extern_crates {
        let name = extern_crate.ident.to_string();
        let local = extern_crate
            .rename
            .as_ref()
            .map_or_else(|| name.clone(), |(_, rename)| rename.to_string());
        let target = if name == "self" {
            "crate".to_string()
        } else {
            name
        };
        context.insert(format!(
            "{TYPE_EXTERN_CRATE_MARKER}{local}{PROVENANCE_SEPARATOR}{target}"
        ));
    }
    if program.no_std {
        context.insert(TYPE_NO_STD_MARKER.to_string());
    }
}

// Records how `use` items bring `std::mem` (or `core::mem`) into scope: the module itself (`use
// std::mem;`, `use std::mem as m;`, `use std::{mem, ...};`), single functions (`use std::mem::take;`,
// `use std::mem::{replace as put, swap};`), or every function (`use std::mem::*;`). Local
// declarations named like a `std::mem` function shadow a wildcard import.
pub(crate) fn insert_std_mem_import_context<'a>(
    context: &mut HashSet<String>,
    uses: impl Iterator<Item = &'a syn::ItemUse>,
    local_names: impl Iterator<Item = String>,
) {
    fn collect(tree: &syn::UseTree, prefix: &mut Vec<String>, context: &mut HashSet<String>) {
        let in_mem =
            prefix.len() == 2 && (prefix[0] == "std" || prefix[0] == "core") && prefix[1] == "mem";
        let at_root = prefix.len() == 1 && (prefix[0] == "std" || prefix[0] == "core");
        match tree {
            syn::UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                collect(&path.tree, prefix, context);
                prefix.pop();
            }
            syn::UseTree::Group(group) => {
                for item in &group.items {
                    collect(item, prefix, context);
                }
            }
            syn::UseTree::Name(name) if in_mem => {
                let name = name.ident.to_string();
                if name == "self" {
                    context.insert(format!("{STD_MEM_MODULE_MARKER}mem"));
                } else {
                    context.insert(format!("{STD_MEM_FUNCTION_MARKER}{name}"));
                    context.insert(format!("{STD_MEM_FUNCTION_TARGET_MARKER}{name}:{name}"));
                }
            }
            syn::UseTree::Rename(rename) if in_mem => {
                let local = rename.rename.to_string();
                if rename.ident == "self" {
                    context.insert(format!("{STD_MEM_MODULE_MARKER}{local}"));
                } else {
                    context.insert(format!("{STD_MEM_FUNCTION_MARKER}{local}"));
                    context.insert(format!(
                        "{STD_MEM_FUNCTION_TARGET_MARKER}{local}:{}",
                        rename.ident
                    ));
                }
            }
            syn::UseTree::Glob(_) if in_mem => {
                context.insert(STD_MEM_GLOB_MARKER.to_string());
            }
            syn::UseTree::Name(name) if at_root && name.ident == "mem" => {
                context.insert(format!("{STD_MEM_MODULE_MARKER}mem"));
            }
            syn::UseTree::Rename(rename) if at_root && rename.ident == "mem" => {
                context.insert(format!("{STD_MEM_MODULE_MARKER}{}", rename.rename));
            }
            syn::UseTree::Glob(_) | syn::UseTree::Name(_) | syn::UseTree::Rename(_) => {}
        }
    }

    for item_use in uses {
        collect(&item_use.tree, &mut Vec::new(), context);
    }
    for name in local_names {
        context.insert(format!("{STD_MEM_SHADOWED_MARKER}{name}"));
    }
}

// Records what each `use` item brings into the type namespace (a named or renamed path, `self` of a
// module, or a glob's module) and the names the source declares there itself.
pub(crate) fn insert_type_path_context<'a>(
    context: &mut HashSet<String>,
    uses: impl Iterator<Item = &'a syn::ItemUse>,
    local_names: impl Iterator<Item = String>,
) {
    fn record(context: &mut HashSet<String>, local: &str, path: &[String]) {
        context.insert(format!("{TYPE_USE_MARKER}{local}"));
        context.insert(format!(
            "{TYPE_USE_TARGET_MARKER}{local}{PROVENANCE_SEPARATOR}{}",
            path.join("::")
        ));
    }
    fn collect(tree: &syn::UseTree, prefix: &mut Vec<String>, context: &mut HashSet<String>) {
        match tree {
            syn::UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                collect(&path.tree, prefix, context);
                prefix.pop();
            }
            syn::UseTree::Group(group) => {
                for item in &group.items {
                    collect(item, prefix, context);
                }
            }
            syn::UseTree::Name(name) if name.ident == "self" => {
                if let Some(local) = prefix.last().cloned() {
                    record(context, &local, prefix);
                }
            }
            syn::UseTree::Name(name) => {
                let local = name.ident.to_string();
                prefix.push(local.clone());
                record(context, &local, prefix);
                prefix.pop();
            }
            syn::UseTree::Rename(rename) => {
                let local = rename.rename.to_string();
                if rename.ident == "self" {
                    record(context, &local, prefix);
                } else {
                    prefix.push(rename.ident.to_string());
                    record(context, &local, prefix);
                    prefix.pop();
                }
            }
            syn::UseTree::Glob(_) => {
                context.insert(format!("{TYPE_USE_GLOB_MARKER}{}", prefix.join("::")));
            }
        }
    }

    for item_use in uses {
        // An absolute `use ::root::...` keeps a leading empty segment: it names the extern-prelude root
        // even where a local item shares that name.
        let mut prefix = if item_use.leading_colon.is_some() {
            vec![String::new()]
        } else {
            Vec::new()
        };
        collect(&item_use.tree, &mut prefix, context);
    }
    for name in local_names {
        context.insert(format!("{TYPE_LOCAL_MARKER}{name}"));
    }
}

// Whether a resolved type path names the standard `Arc` (`std` or `alloc` `sync::Arc`).
fn is_standard_arc_path(path: &[String]) -> bool {
    return matches!(
        path.iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .as_slice(),
        ["std" | "alloc", "sync", "Arc"]
    );
}

// The name and entity type of a function's leading `name: &mut Entity` parameter.
fn leading_mutable_entity_parameter(
    function: &ItemFn,
    entity_type_names: &HashSet<String>,
) -> Option<(String, String)> {
    let Some(FnArg::Typed(parameter)) = function.sig.inputs.first() else {
        return None;
    };
    let Pat::Ident(name) = parameter.pat.as_ref() else {
        return None;
    };
    let Type::Reference(reference) = parameter.ty.as_ref() else {
        return None;
    };
    reference.mutability?;
    let entity = named_type(&reference.elem)?;
    if !entity_type_names.contains(&entity) {
        return None;
    }
    return Some((name.ident.to_string(), entity));
}

// Whether the function is an entity initializer whose leading mutable parameter needs a writable
// construction view. The source-local entity and readonly facts are both required so an ordinary
// mutable parameter retains its existing public type when any part of the proof is absent.
fn initializes_readonly_entity(
    function: &ItemFn,
    entity_type_names: &HashSet<String>,
    readonly_structs: &HashSet<String>,
) -> bool {
    if !function.sig.ident.to_string().starts_with("initialize_") {
        return false;
    }
    let Some((_, entity)) = leading_mutable_entity_parameter(function, entity_type_names) else {
        return false;
    };
    return readonly_structs.contains(&entity);
}

// Whether an `initialize_*` function's leading `&mut` parameter resolves, through the current
// source's imports, to an entity some source declares `readonly-fields`. This extends the
// source-local proof across sources; an unresolved or ambiguous owner keeps the public type.
fn initializes_resolved_readonly_entity(function: &ItemFn, context: &HashSet<String>) -> bool {
    if !function.sig.ident.to_string().starts_with("initialize_") {
        return false;
    }
    let Some(module) = current_source(context) else {
        return false;
    };
    let Some(FnArg::Typed(parameter)) = function.sig.inputs.first() else {
        return false;
    };
    if !matches!(parameter.pat.as_ref(), Pat::Ident(_)) {
        return false;
    }
    let Type::Reference(reference) = parameter.ty.as_ref() else {
        return false;
    };
    if reference.mutability.is_none() {
        return false;
    }
    let Some(identity) = resolved_type_identity(context, &module, &reference.elem) else {
        return false;
    };
    return context.contains(&format!("{READONLY_ENTITY_MARKER}{identity}"));
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
        && entities.contains(&format!(
            "{NULLABLE_OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field}"
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

fn inferred_fixed_buffer_type(entities: &HashSet<String>, local: &str) -> Option<String> {
    let prefix = format!("{FIXED_BUFFER_LOCAL_MARKER}{local}:");
    return entities
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix).map(str::to_string));
}

fn expression_is_known_string(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::Call(call) => match call.func.as_ref() {
            Expr::Path(path) => {
                let mut segments = path.path.segments.iter().rev();
                let Some(function) = segments.next() else {
                    return false;
                };
                entities.contains(&format!("{STRING_RETURN_MARKER}{}", function.ident))
                    || (function.ident == "new"
                        && segments.next().is_some_and(|owner| owner.ident == "String"))
            }
            _ => false,
        },
        Expr::Group(group) => expression_is_known_string(&group.expr, entities),
        Expr::Index(index) => expression_is_known_string(&index.expr, entities),
        Expr::Lit(literal) => matches!(&literal.lit, Lit::Str(_)),
        Expr::Macro(expression) => expression
            .mac
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "format"),
        Expr::MethodCall(call) => {
            call.method == "to_string"
                || (call.method == "clone" && expression_is_known_string(&call.receiver, entities))
        }
        Expr::Field(field) => {
            let syn::Member::Named(field_name) = &field.member else {
                return false;
            };
            expression_struct_name(&field.base, entities).is_some_and(|identity| {
                entities.contains(&format!(
                    "{STRING_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                ))
            })
        }
        Expr::Paren(paren) => expression_is_known_string(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments.first().is_some_and(|segment| {
                entities.contains(&format!("{STRING_EXPRESSION_MARKER}{}", segment.ident))
            })
        }
        Expr::Reference(reference) => expression_is_known_string(&reference.expr, entities),
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

// `Pin<Box<dyn Future<Output = T> [+ Send | + Sync | + 'a]>>`, accepted only when `Pin`, `Box`, `Future`
// and every auto-trait bound resolve (see `resolve_type_path`) to the standard library. A path named
// `Pin` that resolves elsewhere is an ordinary type unless it spells the future shape, which fails
// closed; so does a standard `Pin` of any other shape and a `Pin` whose provenance is uncertain.
fn pinned_boxed_future_output<'a>(
    path: &'a syn::TypePath,
    context: &HashSet<String>,
) -> Result<Option<&'a Type>, CompileError> {
    let Some(last) = path.path.segments.last() else {
        return Ok(None);
    };
    let aliased = path
        .path
        .segments
        .first()
        .is_some_and(|first| context.contains(&format!("{TYPE_USE_MARKER}{}", first.ident)));
    if path.qself.is_some() || (last.ident != "Pin" && !aliased) {
        return Ok(None);
    }
    let resolved = resolve_type_path(&path.path, context);
    let standard_pin = resolved
        .as_deref()
        .is_some_and(|resolved| is_standard_type_path(resolved, "Pin"));
    let shape = pinned_boxed_future_shape(last);
    if !standard_pin {
        if last.ident != "Pin" || shape.is_none() {
            return Ok(None);
        }
        return Err(compile_error(match resolved {
            Some(resolved) => format!(
                "portable `Pin` here resolves to `{}`, not `std::pin::Pin`; only the standard pinned boxed future lowers to `Promise`",
                resolved.join("::")
            ),
            None => "cannot resolve the provenance of `Pin`; import it from `std::pin` to lower a pinned boxed future to `Promise`".to_string(),
        }));
    }
    let Some((boxed, future, auto_traits, output)) = shape else {
        return Err(compile_error(
            "portable `Pin` is supported only as `Pin<Box<dyn Future<Output = T> + Send>>` in a type position",
        ));
    };
    let standard = |path: &syn::Path, name: &str| {
        return resolve_type_path(path, context)
            .is_some_and(|resolved| is_standard_type_path(&resolved, name));
    };
    let other_standard_bound = auto_traits.iter().any(|bound| {
        return resolve_type_path(bound, context).is_some_and(|resolved| {
            matches!(
                resolved.first().map(String::as_str),
                Some("std" | "core" | "alloc")
            ) && !is_standard_type_path(&resolved, "Send")
                && !is_standard_type_path(&resolved, "Sync")
        });
    });
    if other_standard_bound {
        return Err(compile_error(
            "portable `Pin` is supported only as `Pin<Box<dyn Future<Output = T> + Send>>` in a type position",
        ));
    }
    if !standard(boxed, "Box")
        || !standard(future, "Future")
        || !auto_traits
            .iter()
            .all(|bound| standard(bound, "Send") || standard(bound, "Sync"))
    {
        return Err(compile_error(
            "portable `Pin<Box<dyn Future<Output = T>>>` needs `Box`, `Future` and its auto-trait bounds to resolve to the standard library",
        ));
    }
    return Ok(Some(output));
}

// The `Box` path, `Future` path, other trait-bound paths and `Output` type of
// `Pin<Box<dyn Future<Output = T> + ...>>`, matched by structure alone; callers check provenance.
fn pinned_boxed_future_shape(
    segment: &syn::PathSegment,
) -> Option<(&syn::Path, &syn::Path, Vec<&syn::Path>, &Type)> {
    let PathArguments::AngleBracketed(pin) = &segment.arguments else {
        return None;
    };
    let [GenericArgument::Type(Type::Path(boxed))] = pin.args.iter().collect::<Vec<_>>()[..] else {
        return None;
    };
    if boxed.qself.is_some() {
        return None;
    }
    let PathArguments::AngleBracketed(boxed_arguments) = &boxed.path.segments.last()?.arguments
    else {
        return None;
    };
    let [GenericArgument::Type(Type::TraitObject(object))] =
        boxed_arguments.args.iter().collect::<Vec<_>>()[..]
    else {
        return None;
    };
    let mut future = None;
    let mut auto_traits = Vec::new();
    for bound in &object.bounds {
        match bound {
            syn::TypeParamBound::Trait(trait_bound) => {
                if trait_bound.lifetimes.is_some()
                    || !matches!(trait_bound.modifier, syn::TraitBoundModifier::None)
                {
                    return None;
                }
                match &trait_bound.path.segments.last()?.arguments {
                    PathArguments::None => auto_traits.push(&trait_bound.path),
                    PathArguments::AngleBracketed(arguments) => {
                        let [GenericArgument::AssocType(associated)] =
                            arguments.args.iter().collect::<Vec<_>>()[..]
                        else {
                            return None;
                        };
                        if associated.ident != "Output"
                            || associated.generics.is_some()
                            || future.is_some()
                        {
                            return None;
                        }
                        future = Some((&trait_bound.path, &associated.ty));
                    }
                    PathArguments::Parenthesized(_) => return None,
                }
            }
            syn::TypeParamBound::Lifetime(_) => {}
            _ => return None,
        }
    }
    let (future, output) = future?;
    return Some((&boxed.path, future, auto_traits, output));
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
    if program.standard_constants.contains("PI") {
        bindings.insert("PI".to_string());
    }
    return bindings;
}

// `async fn` bodies have no portable lowering; a synchronous emission would silently drop the
// asynchrony, so they fail closed.
fn reject_async_function(function: &ItemFn) -> Result<(), CompileError> {
    if function.sig.asyncness.is_some() {
        return Err(compile_error(format!(
            "portable `async fn {}` has no portable lowering",
            function.sig.ident
        )));
    }
    return Ok(());
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

// The declaration `name` refers to in the source `from`, as `(module, declared name)`: the source's
// own declaration; else its explicit or renamed `use` bindings of `name`; else its glob imports.
// Each hop preserves whether Rust needs local, crate or public visibility. Anything missing, private
// or ambiguous resolves to nothing, so callers fail closed rather than guess an owner, and a
// same-named declaration in an unrelated source is never consulted.
fn resolve_owner(
    entities: &HashSet<String>,
    marker: &str,
    from: &str,
    name: &str,
) -> Option<(String, String)> {
    return resolve_owner_inner(
        entities,
        marker,
        from,
        name,
        SourceAccess::Local,
        &mut BTreeSet::new(),
    );
}

pub(super) fn resolve_owner_inner(
    entities: &HashSet<String>,
    marker: &str,
    from: &str,
    name: &str,
    access: SourceAccess,
    visited: &mut BTreeSet<(String, String, SourceAccess)>,
) -> Option<(String, String)> {
    fn unique(mut candidates: BTreeSet<(String, String)>) -> Option<(String, String)> {
        return match (candidates.pop_first(), candidates.is_empty()) {
            (Some(candidate), true) => Some(candidate),
            _ => None,
        };
    }

    if !visited.insert((from.to_string(), name.to_string(), access)) {
        return None;
    }
    if entities.contains(&owner_marker(marker, from, name, SourceAccess::Public))
        || access != SourceAccess::Public
            && entities.contains(&owner_marker(marker, from, name, SourceAccess::Crate))
        || access == SourceAccess::Local
            && entities.contains(&owner_marker(marker, from, name, SourceAccess::Local))
    {
        return Some((from.to_string(), name.to_string()));
    }
    let binding_marker = match access {
        SourceAccess::Local => USE_BINDING_MARKER,
        SourceAccess::Crate => CRATE_USE_BINDING_MARKER,
        SourceAccess::Public => PUBLIC_USE_BINDING_MARKER,
    };
    let bindings = marker_suffixes(
        entities,
        &format!("{binding_marker}{from}{PROVENANCE_SEPARATOR}{name}{PROVENANCE_SEPARATOR}"),
    );
    if !bindings.is_empty() {
        return unique(
            bindings
                .into_iter()
                .filter_map(|binding| {
                    let (target, item) = binding.split_once(PROVENANCE_SEPARATOR)?;
                    let mut branch = visited.clone();
                    resolve_owner_inner(
                        entities,
                        marker,
                        target,
                        item,
                        next_source_access(access, from, target),
                        &mut branch,
                    )
                })
                .collect(),
        );
    }
    let glob_marker = match access {
        SourceAccess::Local => USE_GLOB_MARKER,
        SourceAccess::Crate => CRATE_USE_GLOB_MARKER,
        SourceAccess::Public => PUBLIC_USE_GLOB_MARKER,
    };
    return unique(
        marker_suffixes(
            entities,
            &format!("{glob_marker}{from}{PROVENANCE_SEPARATOR}"),
        )
        .into_iter()
        .filter_map(|target| {
            let mut branch = visited.clone();
            resolve_owner_inner(
                entities,
                marker,
                &target,
                name,
                next_source_access(access, from, &target),
                &mut branch,
            )
        })
        .collect(),
    );
}

fn next_source_access(access: SourceAccess, from: &str, target: &str) -> SourceAccess {
    if access == SourceAccess::Public || from == target {
        return access;
    }
    let same_crate = module_identity_segments(from)
        .and_then(|from| {
            module_identity_segments(target).map(|target| from.first() == target.first())
        })
        .unwrap_or(false);
    return if same_crate {
        SourceAccess::Crate
    } else {
        SourceAccess::Public
    };
}

// Resolve a Rust path from `from`. An unqualified name sees private bindings in its own source; a
// qualified path enters its target module through that module's public surface.
pub(super) fn resolve_path_owner(
    entities: &HashSet<String>,
    marker: &str,
    from: &str,
    path: &syn::Path,
) -> Option<(String, String)> {
    let mut segments = path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    let name = segments.pop()?;
    if segments.is_empty() {
        return resolve_owner(entities, marker, from, &name);
    }
    let target = resolve_source_use_prefix(entities, from, &segments)?.join("::");
    return resolve_owner_inner(
        entities,
        marker,
        &target,
        &name,
        next_source_access(SourceAccess::Local, from, &target),
        &mut BTreeSet::new(),
    );
}

// The module a qualified source path names. A leading source-local `use` binding can rename a
// module (`use crate::owner as renamed;`); otherwise ordinary crate/self/super and external roots
// resolve structurally.
fn resolve_source_use_prefix(
    entities: &HashSet<String>,
    from: &str,
    prefix: &[String],
) -> Option<Vec<String>> {
    let (first, rest) = prefix.split_first()?;
    let binding_prefix =
        format!("{USE_BINDING_MARKER}{from}{PROVENANCE_SEPARATOR}{first}{PROVENANCE_SEPARATOR}");
    let bindings = marker_suffixes(entities, &binding_prefix);
    if !bindings.is_empty() {
        let mut targets = bindings
            .into_iter()
            .filter_map(|binding| {
                let (target, item) = binding.split_once(PROVENANCE_SEPARATOR)?;
                Some(
                    target
                        .split("::")
                        .map(str::to_string)
                        .chain(std::iter::once(item.to_string()))
                        .chain(rest.iter().cloned())
                        .collect::<Vec<_>>(),
                )
            })
            .collect::<BTreeSet<_>>();
        return match (targets.pop_first(), targets.is_empty()) {
            (Some(target), true) => Some(target),
            _ => None,
        };
    }
    return resolve_use_prefix(&module_identity_segments(from)?, prefix);
}

// The full module a `use` prefix names, written in the module `from`: `crate::` from the crate root,
// `self::` and `super::` relative to `from`, and anything else as an external crate path.
fn resolve_use_prefix(from: &[String], prefix: &[String]) -> Option<Vec<String>> {
    let (first, rest) = prefix.split_first()?;
    let mut module = match first.as_str() {
        "crate" => vec![from.first()?.clone()],
        "self" => from.to_vec(),
        "super" => from[..from.len().checked_sub(1).filter(|length| *length > 0)?].to_vec(),
        _ => vec![first.replace('-', "_")],
    };
    for segment in rest {
        if segment == "super" {
            module.pop();
            if module.is_empty() {
                return None;
            }
        } else if segment != "self" {
            module.push(segment.clone());
        }
    }
    return Some(module);
}

// The canonical identity (`module SEP Struct`) of the struct `rust_type` names, resolved from the
// source `from`.
fn resolved_type_identity(
    entities: &HashSet<String>,
    from: &str,
    rust_type: &Type,
) -> Option<String> {
    return resolved_type_identity_at_depth(entities, from, rust_type, 0);
}

// `resolved_type_identity`, expanding at most 16 alias or `Arc` layers so an alias cycle fails closed.
fn resolved_type_identity_at_depth(
    entities: &HashSet<String>,
    from: &str,
    rust_type: &Type,
    depth: usize,
) -> Option<String> {
    if depth > 16 {
        return None;
    }
    let path = match rust_type {
        Type::Group(group) => {
            return resolved_type_identity_at_depth(entities, from, &group.elem, depth);
        }
        Type::Paren(paren) => {
            return resolved_type_identity_at_depth(entities, from, &paren.elem, depth);
        }
        Type::Reference(reference) => {
            return resolved_type_identity_at_depth(entities, from, &reference.elem, depth);
        }
        Type::Path(path) if path.qself.is_none() => &path.path,
        _ => return None,
    };
    // A proven standard `Arc<T>` is `T` in TypeScript, so it has `T`'s identity. Resolve the full
    // source-local type path instead of recognizing selected spellings: renamed `std`/`alloc` roots,
    // renamed `sync` modules and absolute paths must all reach the same canonical owner.
    let type_context = marker_suffixes(
        entities,
        &format!("{SOURCE_TYPE_PATH_CONTEXT_MARKER}{from}{PROVENANCE_SEPARATOR}"),
    )
    .into_iter()
    .collect::<HashSet<_>>();
    let standard_arc = resolve_type_path(path, &type_context)
        .is_some_and(|resolved| is_standard_arc_path(&resolved));
    let entity_ref = resolve_type_path(path, &type_context).is_some_and(|resolved| {
        matches!(
            resolved
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                .as_slice(),
            ["flight_entity", "Ref"] | ["flight_entity", "ir", "Ref"]
        )
    });
    let identity_alias = path
        .segments
        .last()
        .is_some_and(|segment| identity_alias_tag(entities, &segment.ident.to_string()).is_some());
    if standard_arc || entity_ref || identity_alias {
        let PathArguments::AngleBracketed(arguments) = &path.segments.last()?.arguments else {
            return None;
        };
        let [GenericArgument::Type(inner)] = arguments.args.iter().collect::<Vec<_>>()[..] else {
            return None;
        };
        return resolved_type_identity_at_depth(entities, from, inner, depth + 1);
    }
    if let Some((owner, declaration)) =
        resolve_path_owner(entities, STRUCT_OWNER_MARKER, from, path)
    {
        return Some(format!("{owner}{PROVENANCE_SEPARATOR}{declaration}"));
    }
    // A source type alias stands for its definition, read in the alias's own source.
    let (owner, alias) = resolve_path_owner(entities, TYPE_ALIAS_OWNER_MARKER, from, path)?;
    let definition = unique_marker_suffix(
        entities,
        &format!(
            "{TYPE_ALIAS_DEFINITION_MARKER}{owner}{PROVENANCE_SEPARATOR}{alias}{PROVENANCE_SEPARATOR}"
        ),
    )?;
    let definition = syn::parse_str::<Type>(&definition).ok()?;
    return resolved_type_identity_at_depth(entities, &owner, &definition, depth + 1);
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

fn rust_type_is_string(rust_type: &Type) -> bool {
    return matches!(named_type(rust_type).as_deref(), Some("String" | "str"));
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
                "String" => Some(r#""""#.to_string()),
                "Option" => Some("undefined".to_string()),
                "Vec" => Some("[]".to_string()),
                "Arc" | "Ref" => {
                    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                        return None;
                    };
                    arguments.args.iter().find_map(|argument| match argument {
                        GenericArgument::Type(rust_type) => rust_default_expression(rust_type),
                        _ => None,
                    })
                }
                _ => None,
            }
        }
        Type::Reference(reference) => rust_default_expression(&reference.elem),
        Type::Tuple(tuple) => tuple
            .elems
            .iter()
            .map(rust_default_expression)
            .collect::<Option<Vec<_>>>()
            .map(|elements| format!("[{}]", elements.join(", "))),
        _ => None,
    };
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
        .map(|(field, value)| format!("{field}: {value}"))
        .collect::<Vec<_>>();
    fields.sort();
    let allocation = format!("allocateEntity<{typescript_type}>()");
    if fields.is_empty() {
        return Ok(allocation);
    }
    return Ok(format!(
        "Object.assign({allocation}, {{ {} }})",
        fields.join(", ")
    ));
}

// `rust_type_is_shared_identity` read in source `from` (or the bare context), expanding at most 16
// wrapper or alias layers so an alias cycle fails closed.
fn shared_identity_type_at_depth(
    entities: &HashSet<String>,
    from: Option<&str>,
    rust_type: &Type,
    depth: usize,
) -> bool {
    if depth > 16 {
        return false;
    }
    let path = match rust_type {
        Type::Group(group) => {
            return shared_identity_type_at_depth(entities, from, &group.elem, depth);
        }
        Type::Paren(paren) => {
            return shared_identity_type_at_depth(entities, from, &paren.elem, depth);
        }
        Type::Reference(reference) => {
            return shared_identity_type_at_depth(entities, from, &reference.elem, depth);
        }
        Type::Array(_) | Type::Slice(_) => return true,
        Type::TraitObject(object) => {
            let any = match from {
                Some(from) => trait_object_is_standard_any(
                    &object.bounds,
                    &source_type_context(entities, from),
                ),
                None => trait_object_is_standard_any(&object.bounds, entities),
            };
            return any
                || object.bounds.iter().any(|bound| {
                    matches!(bound, syn::TypeParamBound::Trait(bound) if bound.path.segments.last().is_some_and(|segment| matches!(segment.ident.to_string().as_str(), "Fn" | "FnMut" | "FnOnce")))
                });
        }
        Type::Path(path) if path.qself.is_none() => &path.path,
        _ => return false,
    };
    let resolved = match from {
        Some(from) => resolve_type_path(path, &source_type_context(entities, from)),
        None => resolve_type_path(path, entities),
    };
    // A prelude name resolves through no `use`; unless the source declares that name itself, it is
    // the standard type.
    let resolved = resolved.or_else(|| {
        let [segment] = path.segments.iter().collect::<Vec<_>>()[..] else {
            return None;
        };
        if path.leading_colon.is_some()
            || entities.contains(&format!("{TYPE_LOCAL_MARKER}{}", segment.ident))
            || from.is_some_and(|from| {
                resolve_path_owner(entities, STRUCT_OWNER_MARKER, from, path).is_some()
                    || resolve_path_owner(entities, TYPE_ALIAS_OWNER_MARKER, from, path).is_some()
            })
        {
            return None;
        }
        return match segment.ident.to_string().as_str() {
            "Option" => Some(vec![
                "std".to_string(),
                "option".to_string(),
                "Option".to_string(),
            ]),
            "Vec" => Some(vec![
                "std".to_string(),
                "vec".to_string(),
                "Vec".to_string(),
            ]),
            _ => None,
        };
    });
    let inner = || -> Option<&Type> {
        let PathArguments::AngleBracketed(arguments) = &path.segments.last()?.arguments else {
            return None;
        };
        return arguments.args.iter().find_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(rust_type),
            _ => None,
        });
    };
    if let Some(resolved) = &resolved {
        let resolved = resolved.iter().map(String::as_str).collect::<Vec<_>>();
        match resolved.as_slice() {
            ["std" | "alloc", "sync", "Arc"]
            | ["std" | "alloc", "rc", "Rc"]
            | ["std", "sync", "RwLock"]
            | ["flight_entity", .., "Ref"] => {
                return inner().is_some_and(|inner| {
                    shared_identity_type_at_depth(entities, from, inner, depth + 1)
                        || context_type_identity(entities, inner).is_some()
                        || from.is_some_and(|from| {
                            resolved_type_identity(entities, from, inner).is_some()
                        })
                });
            }
            [first, .., name] if first.starts_with("flight_") => {
                return entities.contains(&format!(
                    "{SHARED_IDENTITY_EXTERNAL_TYPE_MARKER}{first}::{name}"
                ));
            }
            // Only while reading a dependency source on its own (`external_shared_identity_facts`)
            // are its own crate's identity-bearing types recorded under `crate`.
            ["crate", .., name]
                if entities.contains(&format!(
                    "{SHARED_IDENTITY_EXTERNAL_TYPE_MARKER}crate::{name}"
                )) =>
            {
                return true;
            }
            // An `Option` handle holds its payload's allocation once unwrapped.
            ["std" | "core", "option", "Option"] => {
                return inner().is_some_and(|inner| {
                    shared_identity_type_at_depth(entities, from, inner, depth + 1)
                        || context_type_identity(entities, inner).is_some()
                        || from.is_some_and(|from| {
                            resolved_type_identity(entities, from, inner).is_some()
                        })
                });
            }
            ["std", "sync", "Mutex"]
            | ["std" | "alloc", "vec", "Vec"]
            | [
                "std" | "alloc",
                "collections",
                ..,
                "VecDeque" | "HashMap" | "HashSet" | "BTreeMap" | "BTreeSet",
            ] => {
                return true;
            }
            _ => {}
        }
    }
    // An entity always lowers to an object; a target-native sibling's entity has no source struct to
    // resolve, so its recorded name stands for it unless the path resolves outside the crate family.
    if let Some(segment) = path.segments.last()
        && matches!(segment.arguments, PathArguments::None)
        && (entities.contains(&segment.ident.to_string())
            || entities.contains(&format!("{SHARED_IDENTITY_ENTITY_MARKER}{}", segment.ident)))
        && resolved.as_ref().is_none_or(|resolved| {
            resolved
                .first()
                .is_some_and(|root| root == "crate" || root.starts_with("flight_"))
        })
    {
        return true;
    }
    let Some(from) = from else {
        return false;
    };
    if resolve_path_owner(entities, STRUCT_OWNER_MARKER, from, path).is_some() {
        return true;
    }
    let Some((owner, alias)) = resolve_path_owner(entities, TYPE_ALIAS_OWNER_MARKER, from, path)
        .or_else(|| crate_alias_owner(entities, resolved.as_deref()?))
    else {
        return false;
    };
    let Some(definition) = unique_marker_suffix(
        entities,
        &format!(
            "{TYPE_ALIAS_DEFINITION_MARKER}{owner}{PROVENANCE_SEPARATOR}{alias}{PROVENANCE_SEPARATOR}"
        ),
    )
    .and_then(|definition| syn::parse_str::<Type>(&definition).ok()) else {
        return false;
    };
    return shared_identity_type_at_depth(entities, Some(&owner), &definition, depth + 1);
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

// Both operands of `.extend()` / `.extend_from_slice()` must be declared as a Rust `Vec` (receiver) and
// a `Vec` or slice (argument); iterator, Option and string operands are rejected.
fn validate_sequence_operands(
    method: &str,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    if call.args.len() != 1 {
        return Err(compile_error(format!(
            "portable `.{method}()` takes exactly one argument"
        )));
    }
    if !expression_is_sequence(&call.receiver, entities) {
        return Err(compile_error(format!(
            "portable `.{method}()` requires a receiver declared as Rust `Vec`"
        )));
    }
    if !expression_is_sequence(&call.args[0], entities) {
        return Err(compile_error(format!(
            "portable `.{method}()` requires an argument declared as Rust `Vec` or slice; iterator and Option arguments are not supported"
        )));
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
fn emit_hash_collection_method(
    call: &syn::ExprMethodCall,
    kind: &BindingFact,
    receiver: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let arguments = call
        .args
        .iter()
        .map(|argument| emit_expression(argument, entities))
        .collect::<Result<Vec<_>, _>>()?;
    let method = call.method.to_string();
    let option = |value: String| {
        return if entities.contains(NULLABLE_OPTIONS_MARKER) {
            format!("({value} ?? null)")
        } else {
            value
        };
    };
    let owner = if matches!(kind, BindingFact::HashMap) {
        "HashMap"
    } else {
        "HashSet"
    };
    return match (owner, method.as_str(), arguments.as_slice()) {
        (_, "clear", []) => Ok(format!("{receiver}.clear()")),
        (_, "is_empty", []) => Ok(format!("({receiver}.size === 0)")),
        (_, "len", []) => Ok(format!("{receiver}.size")),
        ("HashSet", "contains", [value]) => Ok(format!("{receiver}.has({value})")),
        ("HashSet", "insert", [value]) => Ok(format!(
            "(<T>(items: Set<T>, value: T): boolean => {{ if (items.has(value)) {{ return false; }} items.add(value); return true; }})({receiver}, {value})"
        )),
        ("HashSet", "remove", [value]) => Ok(format!("{receiver}.delete({value})")),
        ("HashMap", "contains_key", [key]) => Ok(format!("{receiver}.has({key})")),
        ("HashMap", "get", [key]) => Ok(option(format!("{receiver}.get({key})"))),
        ("HashMap", "insert", [key, value]) => Ok(option(format!(
            "(<K, V>(entries: Map<K, V>, key: K, value: V): V | undefined => {{ const previous = entries.get(key); entries.set(key, value); return previous; }})({receiver}, {key}, {value})"
        ))),
        ("HashMap", "remove", [key]) => Ok(option(format!(
            "(<K, V>(entries: Map<K, V>, key: K): V | undefined => {{ const previous = entries.get(key); entries.delete(key); return previous; }})({receiver}, {key})"
        ))),
        ("HashMap", "into_keys", []) | ("HashMap", "keys", []) => {
            Ok(format!("[...{receiver}.keys()]"))
        }
        ("HashMap", "into_values", []) | ("HashMap", "values", []) => {
            Ok(format!("[...{receiver}.values()]"))
        }
        _ => Err(compile_error(format!(
            "portable `{owner}::{method}` with {} argument(s) has no portable lowering",
            arguments.len()
        ))),
    };
}

// `HashSet<T>` / `HashMap<K, V>` as `Set<T>` / `Map<K, V>`. JavaScript collections compare object keys
// by identity where Rust compares by value, so elements and keys must lower to primitives.
fn emit_hash_collection_type(
    name: &str,
    segment: &syn::PathSegment,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return Err(compile_error(format!(
            "portable `{name}` needs type arguments"
        )));
    };
    let types = arguments
        .args
        .iter()
        .filter_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(rust_type),
            _ => None,
        })
        .collect::<Vec<_>>();
    let expected = if name == "HashMap" { 2 } else { 1 };
    if types.len() != expected {
        return Err(compile_error(format!(
            "portable `{name}` needs {expected} type argument(s)"
        )));
    }
    let key = emit_type(types[0], entities)?;
    if !matches!(key.as_str(), "number" | "string" | "boolean") {
        return Err(compile_error(format!(
            "portable `{name}` requires a number, string or boolean key; JavaScript compares `{key}` keys by identity"
        )));
    }
    if name == "HashMap" {
        if option_inner_type(types[1]).is_some() {
            return Err(compile_error(
                "portable `HashMap` cannot hold `Option` values; `Map.get` reports a missing key and a `None` value alike",
            ));
        }
        return Ok(format!("Map<{key}, {}>", emit_type(types[1], entities)?));
    }
    return Ok(format!("Set<{key}>"));
}

// A proven `HashSet` / `HashMap` receiver: a lexical binding, a struct field, or a call to a function
// declared to return that type.
fn expression_hash_collection(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<BindingFact> {
    return match expression {
        Expr::Field(field) => {
            let syn::Member::Named(field_name) = &field.member else {
                return None;
            };
            let identity = expression_struct_name(&field.base, entities)?;
            [BindingFact::HashMap, BindingFact::HashSet]
                .into_iter()
                .find(|kind| {
                    entities.contains(&format!(
                        "{HASH_COLLECTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                        binding_fact_marker(kind)
                    ))
                })
        }
        Expr::Call(call) => {
            let Expr::Path(function) = call.func.as_ref() else {
                return None;
            };
            if function.qself.is_some() {
                return None;
            }
            Some(binding_fact_from_marker(&call_fact(
                entities,
                RETURN_BINDING_FACT_MARKER,
                &function.path,
            )?))
            .filter(|fact| matches!(fact, BindingFact::HashMap | BindingFact::HashSet))
        }
        Expr::Group(group) => expression_hash_collection(&group.expr, entities),
        Expr::Paren(paren) => expression_hash_collection(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            lexical_fact(entities, &path.path.segments[0].ident.to_string())
                .filter(|fact| matches!(fact, BindingFact::HashMap | BindingFact::HashSet))
        }
        Expr::Reference(reference) => expression_hash_collection(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_hash_collection(&unary.expr, entities)
        }
        _ => None,
    };
}

// `HashSet::new()` / `HashMap::new()`, their `default()`, or `with_capacity(..)` (a hint JavaScript
// collections do not take), with the owner resolving to `std::collections`.
fn hash_collection_construction(
    expression: &Expr,
    context: &HashSet<String>,
) -> Option<BindingFact> {
    let Expr::Call(call) = expression else {
        return None;
    };
    let Expr::Path(function) = call.func.as_ref() else {
        return None;
    };
    if function.qself.is_some() || function.path.segments.len() < 2 {
        return None;
    }
    let constructor = function.path.segments.last()?.ident.to_string();
    let arity = match constructor.as_str() {
        "default" | "new" => 0,
        "with_capacity" => 1,
        _ => return None,
    };
    if call.args.len() != arity {
        return None;
    }
    let mut owner = function.path.clone();
    owner.segments.pop();
    owner.segments.pop_punct();
    return hash_collection_path(&owner, context);
}

// The collection a path names when it resolves (see `resolve_type_path`) to `std::collections`'
// `HashMap` / `HashSet`, directly or through `hash_map` / `hash_set`.
fn hash_collection_path(path: &syn::Path, context: &HashSet<String>) -> Option<BindingFact> {
    let last = path.segments.last()?;
    let aliased = path
        .segments
        .first()
        .is_some_and(|first| context.contains(&format!("{TYPE_USE_MARKER}{}", first.ident)));
    if last.ident != "HashMap" && last.ident != "HashSet" && !aliased {
        return None;
    }
    let resolved = resolve_type_path(path, context)?;
    return match resolved
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["std", "collections", "HashMap"] | ["std", "collections", "hash_map", "HashMap"] => {
            Some(BindingFact::HashMap)
        }
        ["std", "collections", "HashSet"] | ["std", "collections", "hash_set", "HashSet"] => {
            Some(BindingFact::HashSet)
        }
        _ => None,
    };
}

fn hash_collection_type(rust_type: &Type, context: &HashSet<String>) -> Option<BindingFact> {
    return match rust_type {
        Type::Group(group) => hash_collection_type(&group.elem, context),
        Type::Paren(paren) => hash_collection_type(&paren.elem, context),
        Type::Reference(reference) => hash_collection_type(&reference.elem, context),
        Type::Path(path) if path.qself.is_none() => hash_collection_path(&path.path, context),
        _ => None,
    };
}

// Whether a resolved path names the standard-library item `name`: `Pin` in `std`/`core::pin`, `Box`
// in `std`/`alloc::boxed`, `Future` in `std`/`core::future`, and `Send` / `Sync` in
// `std`/`core::marker`.
fn is_standard_type_path(path: &[String], name: &str) -> bool {
    let (module, roots): (&str, &[&str]) = match name {
        "Box" => ("boxed", &["std", "alloc"]),
        "Future" => ("future", &["std", "core"]),
        "Pin" => ("pin", &["std", "core"]),
        "Send" | "Sync" => ("marker", &["std", "core"]),
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
            Some("std" | "core" | "alloc")
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
            "Future" => "core::future::Future",
            "Send" => "core::marker::Send",
            "Sized" => "core::marker::Sized",
            "Sync" => "core::marker::Sync",
            "Unpin" => "core::marker::Unpin",
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

fn transparent_data_union(rust_enum: &syn::ItemEnum) -> bool {
    return !rust_enum
        .variants
        .iter()
        .any(|variant| matches!(variant.fields, syn::Fields::Named(_)));
}

fn runtime_categories_for_type(
    rust_type: &Type,
    programs: &[&Program],
    resolving: &mut BTreeSet<String>,
) -> Result<BTreeSet<RuntimeCategory>, CompileError> {
    return match rust_type {
        Type::Group(group) => runtime_categories_for_type(&group.elem, programs, resolving),
        Type::Paren(paren) => runtime_categories_for_type(&paren.elem, programs, resolving),
        Type::Reference(reference) => {
            runtime_categories_for_type(&reference.elem, programs, resolving)
        }
        Type::BareFn(_) => Ok(BTreeSet::from([RuntimeCategory::Function])),
        Type::TraitObject(object)
            if object.bounds.iter().any(|bound| {
                let syn::TypeParamBound::Trait(bound) = bound else {
                    return false;
                };
                return bound.path.segments.last().is_some_and(|segment| {
                    matches!(
                        segment.ident.to_string().as_str(),
                        "Fn" | "FnMut" | "FnOnce"
                    )
                });
            }) =>
        {
            Ok(BTreeSet::from([RuntimeCategory::Function]))
        }
        Type::Path(path) => {
            let Some(segment) = path.path.segments.last() else {
                return Err(compile_error("empty Rust type path"));
            };
            let name = segment.ident.to_string();
            match name.as_str() {
                "bool" => Ok(BTreeSet::from([RuntimeCategory::Boolean])),
                "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32"
                | "u64" | "usize" => Ok(BTreeSet::from([RuntimeCategory::Number])),
                "String" | "str" => Ok(BTreeSet::from([RuntimeCategory::String])),
                "Vec" => Ok(BTreeSet::from([RuntimeCategory::Array])),
                // `Map` / `Set` instances have a non-plain prototype.
                "HashMap" | "HashSet"
                    if !programs
                        .iter()
                        .any(|program| program.type_names.contains(&name)) =>
                {
                    let resolutions = programs
                        .iter()
                        .filter_map(|program| {
                            let mut context = HashSet::new();
                            insert_program_type_path_context(&mut context, program);
                            resolve_type_path(&path.path, &context)
                                .map(|_| hash_collection_type(rust_type, &context).is_some())
                        })
                        .collect::<Vec<_>>();
                    if resolutions.is_empty() || resolutions.contains(&false) {
                        Err(compile_error(format!(
                            "cannot resolve data union payload `{name}` to `std::collections::{name}`"
                        )))
                    } else {
                        Ok(BTreeSet::from([RuntimeCategory::Object]))
                    }
                }
                "UnknownValue" => Ok(BTreeSet::from([RuntimeCategory::Object])),
                "Arc" | "Box" | "Ref" => {
                    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                        return Err(compile_error(format!(
                            "`{name}` data union payload needs one type argument"
                        )));
                    };
                    let types = arguments
                        .args
                        .iter()
                        .filter_map(|argument| match argument {
                            GenericArgument::Type(rust_type) => Some(rust_type),
                            _ => None,
                        })
                        .collect::<Vec<_>>();
                    if types.len() != 1 {
                        return Err(compile_error(format!(
                            "`{name}` data union payload needs exactly one type argument"
                        )));
                    }
                    runtime_categories_for_type(types[0], programs, resolving)
                }
                _ => {
                    if !resolving.insert(name.clone()) {
                        return Err(compile_error(format!(
                            "data union runtime category contains a recursive alias through `{name}`"
                        )));
                    }
                    let result = if let Some(rust_enum) = programs.iter().find_map(|program| {
                        program
                            .data_unions
                            .contains(&name)
                            .then(|| {
                                program
                                    .enums
                                    .iter()
                                    .find(|rust_enum| rust_enum.ident == name)
                            })
                            .flatten()
                    }) {
                        if !transparent_data_union(rust_enum) {
                            Err(compile_error(format!(
                                "tagged data union `{name}` cannot be erased as a transparent payload"
                            )))
                        } else {
                            let mut categories = BTreeSet::new();
                            for variant in &rust_enum.variants {
                                match &variant.fields {
                                    syn::Fields::Unit => {
                                        categories.insert(RuntimeCategory::Null);
                                    }
                                    syn::Fields::Unnamed(fields) => {
                                        categories.extend(runtime_categories_for_type(
                                            &fields.unnamed[0].ty,
                                            programs,
                                            resolving,
                                        )?);
                                    }
                                    syn::Fields::Named(_) => unreachable!(
                                        "transparent data union changed after directive validation"
                                    ),
                                }
                            }
                            Ok(categories)
                        }
                    } else if let Some(type_alias) = programs.iter().find_map(|program| {
                        program
                            .type_aliases
                            .iter()
                            .find(|type_alias| type_alias.ident == name)
                    }) {
                        runtime_categories_for_type(&type_alias.ty, programs, resolving)
                    } else if programs.iter().any(|program| {
                        program
                            .structs
                            .iter()
                            .any(|structure| structure.ident == name)
                    }) {
                        Ok(BTreeSet::from([RuntimeCategory::Record]))
                    } else {
                        Err(compile_error(format!(
                            "cannot determine the TypeScript runtime category of data union payload type `{name}`"
                        )))
                    };
                    resolving.remove(&name);
                    result
                }
            }
        }
        _ => Err(compile_error(format!(
            "cannot determine the TypeScript runtime category of data union payload `{}`",
            rust_type_description(rust_type)
        ))),
    };
}

fn data_union_variant_marker(
    owner: &str,
    variant: &str,
    categories: &BTreeSet<RuntimeCategory>,
) -> String {
    return format!(
        "{DATA_UNION_VARIANT_MARKER}{owner}:{variant}:{}",
        categories
            .iter()
            .map(|category| category.name())
            .collect::<Vec<_>>()
            .join(",")
    );
}

fn reserved_key_data_union_variant_marker(
    owner: &str,
    variant: &str,
    keys: &BTreeSet<String>,
) -> String {
    return format!(
        "{RESERVED_KEY_DATA_UNION_VARIANT_MARKER}{owner}:{variant}:{}",
        keys.iter().cloned().collect::<Vec<_>>().join(",")
    );
}

fn reserved_key_data_union_variant_type_marker(
    owner: &str,
    variant: &str,
    payload_type: &str,
) -> String {
    return format!(
        "{RESERVED_KEY_DATA_UNION_VARIANT_TYPE_MARKER}{owner}:{variant}:{payload_type}"
    );
}

fn reserved_key_record_fields(
    rust_type: &Type,
    programs: &[&Program],
    external_record_structs: &[ItemStruct],
    resolving: &mut BTreeSet<String>,
) -> Result<BTreeSet<String>, CompileError> {
    return match rust_type {
        Type::Group(group) => {
            reserved_key_record_fields(&group.elem, programs, external_record_structs, resolving)
        }
        Type::Paren(paren) => {
            reserved_key_record_fields(&paren.elem, programs, external_record_structs, resolving)
        }
        Type::Reference(reference) => reserved_key_record_fields(
            &reference.elem,
            programs,
            external_record_structs,
            resolving,
        ),
        Type::Path(path) => {
            let Some(segment) = path.path.segments.last() else {
                return Err(compile_error("empty Rust type path"));
            };
            let name = segment.ident.to_string();
            if matches!(name.as_str(), "Arc" | "Box" | "Ref") {
                let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                    return Err(compile_error(format!(
                        "`{name}` reserved-key data union payload needs one type argument"
                    )));
                };
                let types = arguments
                    .args
                    .iter()
                    .filter_map(|argument| match argument {
                        GenericArgument::Type(rust_type) => Some(rust_type),
                        _ => None,
                    })
                    .collect::<Vec<_>>();
                if types.len() != 1 {
                    return Err(compile_error(format!(
                        "`{name}` reserved-key data union payload needs exactly one type argument"
                    )));
                }
                return reserved_key_record_fields(
                    types[0],
                    programs,
                    external_record_structs,
                    resolving,
                );
            }
            if !resolving.insert(name.clone()) {
                return Err(compile_error(format!(
                    "reserved-key data union payload contains a recursive alias through `{name}`"
                )));
            }
            let structures = programs
                .iter()
                .flat_map(|program| &program.structs)
                .chain(external_record_structs)
                .filter(|structure| structure.ident == name)
                .collect::<Vec<_>>();
            let aliases = programs
                .iter()
                .flat_map(|program| &program.type_aliases)
                .filter(|alias| alias.ident == name)
                .collect::<Vec<_>>();
            let result = match (structures.as_slice(), aliases.as_slice()) {
                ([structure], []) => {
                    let syn::Fields::Named(fields) = &structure.fields else {
                        return Err(compile_error(format!(
                            "reserved-key data union payload type `{name}` must be a named-field struct"
                        )));
                    };
                    let mut keys = BTreeSet::new();
                    for field in &fields.named {
                        let Some(identifier) = &field.ident else {
                            unreachable!("named fields always have identifiers");
                        };
                        let key = snake_to_lower_camel(&identifier.to_string());
                        if !keys.insert(key.clone()) {
                            return Err(compile_error(format!(
                                "reserved-key data union payload type `{name}` maps more than one field to `{key}`"
                            )));
                        }
                    }
                    Ok(keys)
                }
                ([], [alias]) => reserved_key_record_fields(
                    &alias.ty,
                    programs,
                    external_record_structs,
                    resolving,
                ),
                ([], []) => Err(compile_error(format!(
                    "cannot resolve reserved-key data union payload type `{name}` to a record declaration"
                ))),
                _ => Err(compile_error(format!(
                    "reserved-key data union payload type `{name}` has ambiguous record declarations"
                ))),
            };
            resolving.remove(&name);
            result
        }
        _ => Err(compile_error(format!(
            "cannot resolve reserved-key data union payload `{}` to a record declaration",
            rust_type_description(rust_type)
        ))),
    };
}

fn insert_data_union_context(
    context: &mut HashSet<String>,
    programs: &[&Program],
    external_record_structs: &[ItemStruct],
) -> Result<(), CompileError> {
    for program in programs {
        for rust_enum in &program.enums {
            let owner = rust_enum.ident.to_string();
            if !program.data_unions.contains(&owner) {
                continue;
            }
            if !transparent_data_union(rust_enum) {
                for variant in &rust_enum.variants {
                    let variant_name = variant.ident.to_string();
                    context.insert(format!(
                        "{TAGGED_DATA_UNION_VARIANT_MARKER}{owner}:{variant_name}"
                    ));
                    if matches!(variant.fields, syn::Fields::Unit) {
                        context.insert(format!("{DATA_UNION_UNIT_MARKER}{owner}:{variant_name}"));
                    }
                }
                continue;
            }
            if program.reserved_key_data_unions.contains(&owner) {
                let variants = rust_enum.variants.iter().collect::<Vec<_>>();
                let payload_types = variants
                    .iter()
                    .map(|variant| {
                        let syn::Fields::Unnamed(fields) = &variant.fields else {
                            unreachable!(
                                "reserved-key data union validation requires payload variants"
                            )
                        };
                        &fields.unnamed[0].ty
                    })
                    .collect::<Vec<_>>();
                let reserved_fields = reserved_key_record_fields(
                    payload_types[0],
                    programs,
                    external_record_structs,
                    &mut BTreeSet::new(),
                )?;
                let fallback_fields = reserved_key_record_fields(
                    payload_types[1],
                    programs,
                    external_record_structs,
                    &mut BTreeSet::new(),
                )?;
                let keys = reserved_fields
                    .difference(&fallback_fields)
                    .cloned()
                    .collect::<BTreeSet<_>>();
                if keys.is_empty() {
                    return Err(compile_error(format!(
                        "reserved-key data union `{owner}` has no first-variant property absent from its fallback payload"
                    )));
                }
                for (index, variant) in variants.into_iter().enumerate() {
                    let variant_name = variant.ident.to_string();
                    context.insert(data_union_variant_marker(
                        &owner,
                        &variant_name,
                        &BTreeSet::from([RuntimeCategory::Record]),
                    ));
                    let empty = BTreeSet::new();
                    context.insert(reserved_key_data_union_variant_marker(
                        &owner,
                        &variant_name,
                        if index == 0 { &keys } else { &empty },
                    ));
                    let payload_type = emit_type(payload_types[index], context)?;
                    context.insert(reserved_key_data_union_variant_type_marker(
                        &owner,
                        &variant_name,
                        &payload_type,
                    ));
                }
                continue;
            }
            for variant in &rust_enum.variants {
                let categories = match &variant.fields {
                    syn::Fields::Unit => BTreeSet::from([RuntimeCategory::Null]),
                    syn::Fields::Unnamed(fields) => runtime_categories_for_type(
                        &fields.unnamed[0].ty,
                        programs,
                        &mut BTreeSet::new(),
                    )?,
                    syn::Fields::Named(_) => {
                        unreachable!("transparent data union changed after directive validation")
                    }
                };
                let variant_name = variant.ident.to_string();
                context.insert(data_union_variant_marker(
                    &owner,
                    &variant_name,
                    &categories,
                ));
                if matches!(variant.fields, syn::Fields::Unit) {
                    context.insert(format!("{DATA_UNION_UNIT_MARKER}{owner}:{variant_name}"));
                }
            }
        }
    }
    return Ok(());
}

// Resolves every value binding of `function` lexically, in source order: parameters, `let` (bound
// after its initializer, so the initializer sees the outer binding; a let-else's else block too),
// closure parameters, `for`, `if let` / `while let` (bound for the condition's remainder and the
// body), and `match` arms (bound for the guard and body), each through nested and tuple patterns.
// Each site gets a canonical BindingId and the fact its declared type or initializer proves: a typed
// `Vec`/slice/array, `Option`, or resolved struct; a bare move inherits the moved binding's fact; a
// call yields a function's return fact only when no lexical binding of the callee's name is in scope,
// because a local value always shadows an imported or sibling function. Parameters are left bound in
// the returned context; every other site is bound during emission by `lexical_pattern_context`.
fn insert_lexical_binding_context(function: &ItemFn, context: &mut HashSet<String>) {
    struct ReservedIdentifierCollector {
        names: HashSet<String>,
    }

    impl<'ast> Visit<'ast> for ReservedIdentifierCollector {
        fn visit_ident(&mut self, identifier: &'ast syn::Ident) {
            self.names
                .insert(snake_to_lower_camel(&identifier.to_string()));
        }
    }

    struct Resolver<'a> {
        context: &'a HashSet<String>,
        dereferenced: HashSet<String>,
        facts: Vec<(String, BindingFact)>,
        function: String,
        mutex_guards: HashSet<String>,
        nullable_option_bindings: HashSet<String>,
        ordinal: usize,
        ref_aliases: Vec<(String, String)>,
        ref_alias_receiver_captures: Vec<(String, String, String)>,
        reserved_identifiers: HashSet<String>,
        scopes: Vec<BTreeMap<String, String>>,
        external_structs: BTreeMap<String, String>,
        shared_identities: BTreeSet<String>,
        sites: Vec<(String, String)>,
    }

    impl Resolver<'_> {
        fn bind(&mut self, identifier: &syn::Ident, fact: BindingFact) -> String {
            let id = format!("{}#b{}", self.function, self.ordinal);
            self.ordinal += 1;
            if let Some(scope) = self.scopes.last_mut() {
                scope.insert(identifier.to_string(), id.clone());
            }
            self.facts.push((id.clone(), fact));
            self.sites.push((binding_site_key(identifier), id.clone()));
            return id;
        }

        fn bind_pattern(&mut self, pattern: &Pat, fact: BindingFact) {
            match pattern {
                Pat::Ident(identifier) => {
                    self.bind(&identifier.ident, fact.clone());
                    if let Some((_, subpattern)) = &identifier.subpat {
                        self.bind_pattern(subpattern, fact);
                    }
                }
                Pat::Paren(paren) => self.bind_pattern(&paren.pat, fact),
                Pat::Reference(reference) => self.bind_pattern(&reference.pat, fact),
                Pat::Slice(slice) => {
                    let BindingFact::Sequence(element) = fact else {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    };
                    if slice
                        .elems
                        .iter()
                        .any(|element| matches!(element, Pat::Rest(_)))
                    {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    }
                    for pattern in &slice.elems {
                        self.bind_pattern(pattern, (*element).clone());
                    }
                }
                Pat::Struct(structure) => {
                    let BindingFact::Structure(identity) = fact else {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    };
                    for field in &structure.fields {
                        let syn::Member::Named(name) = &field.member else {
                            self.bind_unresolved_pattern(&field.pat);
                            continue;
                        };
                        let option_prefix = format!(
                            "{OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{name}{PROVENANCE_SEPARATOR}"
                        );
                        let field_fact = unique_marker_suffix(self.context, &option_prefix)
                            .map(|payload| {
                                BindingFact::Option(Box::new(if payload.is_empty() {
                                    BindingFact::Unknown
                                } else {
                                    BindingFact::Structure(payload)
                                }))
                            })
                            .or_else(|| {
                                self.context
                                    .contains(&format!(
                                        "{SEQUENCE_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{name}"
                                    ))
                                    .then(|| BindingFact::Sequence(Box::new(BindingFact::Unknown)))
                            })
                            .unwrap_or(BindingFact::UnresolvedPattern);
                        self.bind_pattern(&field.pat, field_fact);
                    }
                }
                Pat::Tuple(tuple) => {
                    let BindingFact::Tuple(facts) = fact else {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    };
                    if tuple.elems.len() != facts.len()
                        || tuple
                            .elems
                            .iter()
                            .any(|element| matches!(element, Pat::Rest(_)))
                    {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    }
                    for (pattern, fact) in tuple.elems.iter().zip(facts) {
                        self.bind_pattern(pattern, fact);
                    }
                }
                Pat::TupleStruct(tuple)
                    if tuple
                        .path
                        .segments
                        .last()
                        .is_some_and(|segment| segment.ident == "Some")
                        && tuple.elems.len() == 1 =>
                {
                    let BindingFact::Option(payload) = fact else {
                        self.bind_unresolved_pattern(pattern);
                        return;
                    };
                    self.bind_pattern(&tuple.elems[0], *payload);
                }
                Pat::Type(typed) => {
                    self.bind_pattern(&typed.pat, self.typed_fact(&typed.ty));
                }
                Pat::Wild(_) | Pat::Rest(_) => {}
                _ => self.bind_unresolved_pattern(pattern),
            }
        }

        fn bind_unresolved_pattern(&mut self, pattern: &Pat) {
            for identifier in pattern_identifiers(pattern) {
                self.bind(identifier, BindingFact::UnresolvedPattern);
            }
        }

        fn binding_id(&self, name: &str) -> Option<String> {
            return self
                .scopes
                .iter()
                .rev()
                .find_map(|scope| scope.get(name).cloned());
        }

        // An initializer proven to produce an identity-bearing object that is not a source struct: a
        // shared allocation of one, or a clone of a binding already proven to hold one.
        fn initializer_is_shared_identity(&self, expression: &Expr) -> bool {
            let expression = peel_shared_view(expression);
            return match expression {
                Expr::Call(call)
                    if (expression_is_associated_path(&call.func, "Arc", "new")
                        || expression_is_associated_path(&call.func, "Rc", "new"))
                        && call.args.len() == 1 =>
                {
                    self.payload_is_identity(&call.args[0])
                }
                Expr::Call(call) => {
                    call_returns_shared_identity(self.context, &call.func)
                        || self.expression_structure_identity(expression).is_some()
                }
                Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
                    let name = path.path.segments[0].ident.to_string();
                    self.binding_id(&name)
                        .is_some_and(|id| self.shared_identities.contains(&id))
                        || matches!(
                            self.fact_of(&name),
                            Some(
                                BindingFact::Structure(_)
                                    | BindingFact::HashMap
                                    | BindingFact::HashSet
                            )
                        )
                }
                _ => false,
            };
        }

        // `shared_payload_is_identity` over the bindings this resolver has proven so far.
        fn payload_is_identity(&self, payload: &Expr) -> bool {
            return match payload {
                Expr::Group(group) => self.payload_is_identity(&group.expr),
                Expr::Paren(paren) => self.payload_is_identity(&paren.expr),
                Expr::Call(call)
                    if expression_is_associated_path(&call.func, "RwLock", "new")
                        && call.args.len() == 1 =>
                {
                    self.payload_is_identity(&call.args[0])
                }
                payload => {
                    expression_is_identity_payload(payload)
                        || self.expression_structure_identity(payload).is_some()
                }
            };
        }

        fn mark_external_struct(&mut self, pattern: &Pat, rust_type: &Type) {
            let Some(name) = typed_binding_name(pattern) else {
                return;
            };
            if let Some(external) = external_struct_type(self.context, rust_type)
                && let Some(id) = self.binding_id(&name)
            {
                self.external_structs.insert(id, external);
            }
        }

        fn mark_shared_identity(&mut self, pattern: &Pat, proven: bool) {
            let name = match pattern {
                Pat::Ident(identifier) => identifier.ident.to_string(),
                Pat::Type(typed) => match typed.pat.as_ref() {
                    Pat::Ident(identifier) => identifier.ident.to_string(),
                    _ => return,
                },
                _ => return,
            };
            if proven && let Some(id) = self.binding_id(&name) {
                self.shared_identities.insert(id);
            }
        }

        fn fact_of(&self, name: &str) -> Option<BindingFact> {
            let id = self.binding_id(name)?;
            return self
                .facts
                .iter()
                .rev()
                .find(|(fact_id, _)| *fact_id == id)
                .map(|(_, fact)| fact.clone());
        }

        fn fresh_ref_alias_receiver(&mut self, alias: &str) -> String {
            for index in 0.. {
                let candidate = if index == 0 {
                    format!("{alias}_receiver")
                } else {
                    format!("{alias}_receiver_{index}")
                };
                if self
                    .reserved_identifiers
                    .insert(snake_to_lower_camel(&candidate))
                {
                    return candidate;
                }
            }
            unreachable!("an unbounded candidate sequence always yields an unused identifier")
        }

        fn replace_struct_call_receiver(
            &self,
            expression: &Expr,
            replacement: &Expr,
        ) -> Option<(Expr, Expr)> {
            return match expression {
                Expr::Field(field) => {
                    let (capture, base) =
                        self.replace_struct_call_receiver(&field.base, replacement)?;
                    let mut stabilized = field.clone();
                    stabilized.base = Box::new(base);
                    Some((capture, Expr::Field(stabilized)))
                }
                Expr::Group(group) => {
                    let (capture, inner) =
                        self.replace_struct_call_receiver(&group.expr, replacement)?;
                    let mut stabilized = group.clone();
                    stabilized.expr = Box::new(inner);
                    Some((capture, Expr::Group(stabilized)))
                }
                Expr::Paren(paren) => {
                    let (capture, inner) =
                        self.replace_struct_call_receiver(&paren.expr, replacement)?;
                    let mut stabilized = paren.clone();
                    stabilized.expr = Box::new(inner);
                    Some((capture, Expr::Paren(stabilized)))
                }
                Expr::Reference(reference) => {
                    let (capture, inner) =
                        self.replace_struct_call_receiver(&reference.expr, replacement)?;
                    let mut stabilized = reference.clone();
                    stabilized.expr = Box::new(inner);
                    Some((capture, Expr::Reference(stabilized)))
                }
                Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
                    let (capture, inner) =
                        self.replace_struct_call_receiver(&unary.expr, replacement)?;
                    let mut stabilized = unary.clone();
                    stabilized.expr = Box::new(inner);
                    Some((capture, Expr::Unary(stabilized)))
                }
                Expr::Call(_) if self.expression_structure_identity(expression).is_some() => {
                    Some((expression.clone(), replacement.clone()))
                }
                _ => None,
            };
        }

        fn stabilize_ref_alias_target(
            &mut self,
            expression: &Expr,
            alias: &str,
        ) -> Option<(String, Expr, Expr)> {
            let placeholder: Expr = syn::parse_str("__flight_ref_alias_receiver").ok()?;
            self.replace_struct_call_receiver(expression, &placeholder)?;
            let stable = self.fresh_ref_alias_receiver(alias);
            let replacement = syn::parse_str::<Expr>(&stable).ok()?;
            let (capture, target) = self.replace_struct_call_receiver(expression, &replacement)?;
            return Some((stable, capture, target));
        }

        fn expression_structure_identity(&self, expression: &Expr) -> Option<String> {
            return match peel_reference_and_paren(expression) {
                Expr::Call(call) => {
                    let Expr::Path(path) = call.func.as_ref() else {
                        return None;
                    };
                    if path.qself.is_some()
                        || single_path_identifier(&call.func)
                            .is_some_and(|name| self.fact_of(&name).is_some())
                    {
                        return None;
                    }
                    call_fact(self.context, STRUCT_RETURN_MARKER, &path.path)
                        .filter(|identity| !identity.is_empty())
                }
                Expr::Field(field) => {
                    let syn::Member::Named(field_name) = &field.member else {
                        return None;
                    };
                    let owner = self.expression_structure_identity(&field.base)?;
                    unique_marker_suffix(
                        self.context,
                        &format!(
                            "{STRUCT_FIELD_TYPE_MARKER}{owner}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                        ),
                    )
                }
                Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
                    let name = path.path.segments.first()?.ident.to_string();
                    let BindingFact::Structure(identity) = self.fact_of(&name)? else {
                        return None;
                    };
                    Some(identity)
                }
                Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
                    self.expression_structure_identity(&unary.expr)
                }
                _ => None,
            };
        }

        fn erased_shared_cell_field(&self, expression: &Expr) -> bool {
            let Expr::Field(field) = peel_reference_and_paren(expression) else {
                return false;
            };
            let syn::Member::Named(field_name) = &field.member else {
                return false;
            };
            let Some(identity) = self.expression_structure_identity(&field.base) else {
                return false;
            };
            return self.context.contains(&format!(
                "{ERASED_SHARED_CELL_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
            ));
        }

        fn initializer_fact(&self, expression: &Expr) -> BindingFact {
            if let Some(kind) = hash_collection_construction(expression, self.context) {
                return kind;
            }
            if let Some(kind) = self.hash_collection_field_fact(expression) {
                return kind;
            }
            if let Some(receiver) = direct_lock_guard_receiver(expression) {
                return self.initializer_fact(receiver);
            }
            return match expression {
                Expr::Array(array) => BindingFact::Sequence(Box::new(
                    self.merged_facts(
                        array
                            .elems
                            .iter()
                            .map(|element| self.initializer_fact(element)),
                    ),
                )),
                Expr::Call(call) => {
                    if expression_is_path(&call.func, "Some") && call.args.len() == 1 {
                        let payload = self.initializer_fact(&call.args[0]);
                        return if payload.has_source_structure() {
                            BindingFact::Option(Box::new(payload))
                        } else {
                            BindingFact::Unknown
                        };
                    }
                    let Expr::Path(path) = call.func.as_ref() else {
                        return BindingFact::Unknown;
                    };
                    if path.qself.is_some()
                        || single_path_identifier(&call.func)
                            .is_some_and(|name| self.fact_of(&name).is_some())
                    {
                        return BindingFact::Unknown;
                    }
                    if let Some(fact) =
                        call_fact(self.context, RETURN_BINDING_FACT_MARKER, &path.path)
                    {
                        return binding_fact_from_marker(&fact);
                    }
                    if call_fact(self.context, SEQUENCE_RETURN_MARKER, &path.path).is_some() {
                        return BindingFact::Sequence(Box::new(BindingFact::Unknown));
                    }
                    if let Some(identity) =
                        call_fact(self.context, STRUCT_RETURN_MARKER, &path.path)
                            .filter(|identity| !identity.is_empty())
                    {
                        return BindingFact::Structure(identity);
                    }
                    call_fact(self.context, OPTION_RETURN_MARKER, &path.path).map_or(
                        BindingFact::Unknown,
                        |payload| {
                            BindingFact::Option(Box::new(if payload.is_empty() {
                                BindingFact::Unknown
                            } else {
                                BindingFact::Structure(payload)
                            }))
                        },
                    )
                }
                Expr::Group(group) => self.initializer_fact(&group.expr),
                Expr::Field(_) => self
                    .expression_structure_identity(expression)
                    .map(BindingFact::Structure)
                    .or_else(|| self.option_fact(expression))
                    .unwrap_or(BindingFact::Unknown),
                Expr::Macro(invocation) if invocation.mac.path.is_ident("vec") => {
                    if invocation.mac.tokens.is_empty() {
                        return BindingFact::Unknown;
                    }
                    let element = if let Ok((value, _)) = parse_vec_repeat(&invocation.mac) {
                        self.initializer_fact(&value)
                    } else if let Ok(values) = Punctuated::<Expr, Token![,]>::parse_terminated
                        .parse2(invocation.mac.tokens.clone())
                    {
                        self.merged_facts(values.iter().map(|value| self.initializer_fact(value)))
                    } else {
                        BindingFact::Unknown
                    };
                    BindingFact::Sequence(Box::new(element))
                }
                Expr::Paren(paren) => self.initializer_fact(&paren.expr),
                Expr::Reference(reference) => self.initializer_fact(&reference.expr),
                Expr::MethodCall(call)
                    if (call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "collect" | "iter" | "into_iter"
                        ))
                        || (call.args.len() == 1
                            && matches!(
                                call.method.to_string().as_str(),
                                "filter" | "map" | "skip"
                            )) =>
                {
                    match self.initializer_fact(&call.receiver) {
                        BindingFact::Sequence(element) if call.method != "map" => {
                            BindingFact::Sequence(element)
                        }
                        BindingFact::Sequence(_) => {
                            BindingFact::Sequence(Box::new(BindingFact::Unknown))
                        }
                        _ => BindingFact::Unknown,
                    }
                }
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "as_mut" | "as_ref" | "clone" | "cloned" | "copied"
                        ) =>
                {
                    if let Some(fact) = self.option_fact(expression) {
                        return fact;
                    }
                    self.initializer_fact(&call.receiver)
                }
                Expr::Struct(structure) if structure.qself.is_none() => {
                    let identity = match current_source(self.context) {
                        Some(current) => resolve_path_owner(
                            self.context,
                            STRUCT_OWNER_MARKER,
                            &current,
                            &structure.path,
                        )
                        .map(|(module, declaration)| {
                            format!("{module}{PROVENANCE_SEPARATOR}{declaration}")
                        }),
                        None => vitest_path_binding_name(&structure.path, self.context)
                            .and_then(|name| vitest_struct_owner(self.context, &name)),
                    };
                    identity.map_or(BindingFact::Unknown, BindingFact::Structure)
                }
                Expr::Tuple(tuple) => BindingFact::Tuple(
                    tuple
                        .elems
                        .iter()
                        .map(|element| self.initializer_fact(element))
                        .collect(),
                ),
                expression => single_path_identifier(expression)
                    .and_then(|name| self.fact_of(&name))
                    .unwrap_or(BindingFact::Unknown),
            };
        }

        fn initializer_retains_nullable_option(&self, expression: &Expr) -> bool {
            if current_source(self.context).is_some() {
                return false;
            }
            return match expression {
                Expr::Call(call) => {
                    let Expr::Path(path) = call.func.as_ref() else {
                        return false;
                    };
                    path.qself.is_none()
                        && single_path_identifier(&call.func)
                            .is_none_or(|name| self.fact_of(&name).is_none())
                        && call_fact(self.context, NULLABLE_OPTION_RETURN_MARKER, &path.path)
                            .is_some()
                }
                Expr::Group(group) => self.initializer_retains_nullable_option(&group.expr),
                Expr::MethodCall(call) if call.args.is_empty() && call.method == "clone" => {
                    self.initializer_retains_nullable_option(&call.receiver)
                }
                Expr::Paren(paren) => self.initializer_retains_nullable_option(&paren.expr),
                Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => self
                    .binding_id(&path.path.segments[0].ident.to_string())
                    .is_some_and(|id| self.nullable_option_bindings.contains(&id)),
                Expr::Reference(reference) => {
                    self.initializer_retains_nullable_option(&reference.expr)
                }
                _ => false,
            };
        }

        // A field of a lexically known structure declared as `HashSet` / `HashMap`.
        fn hash_collection_field_fact(&self, expression: &Expr) -> Option<BindingFact> {
            return match expression {
                Expr::Field(field) => {
                    let syn::Member::Named(field_name) = &field.member else {
                        return None;
                    };
                    let base = single_path_identifier(&field.base)?;
                    let BindingFact::Structure(identity) = self.fact_of(&base)? else {
                        return None;
                    };
                    [BindingFact::HashMap, BindingFact::HashSet]
                        .into_iter()
                        .find(|kind| {
                            self.context.contains(&format!(
                                "{HASH_COLLECTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                                binding_fact_marker(kind)
                            ))
                        })
                }
                Expr::Group(group) => self.hash_collection_field_fact(&group.expr),
                Expr::Paren(paren) => self.hash_collection_field_fact(&paren.expr),
                _ => None,
            };
        }

        fn option_fact(&self, expression: &Expr) -> Option<BindingFact> {
            return match expression {
                Expr::Call(call) => {
                    let Expr::Path(path) = call.func.as_ref() else {
                        return None;
                    };
                    let payload = call_fact(self.context, OPTION_RETURN_MARKER, &path.path)?;
                    Some(BindingFact::Option(Box::new(if payload.is_empty() {
                        BindingFact::Unknown
                    } else {
                        BindingFact::Structure(payload)
                    })))
                }
                Expr::Field(field) => {
                    let syn::Member::Named(field_name) = &field.member else {
                        return None;
                    };
                    let base = single_path_identifier(&field.base)?;
                    let BindingFact::Structure(identity) = self.fact_of(&base)? else {
                        return None;
                    };
                    let payload = unique_marker_suffix(
                        self.context,
                        &format!(
                            "{OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
                        ),
                    )?;
                    Some(BindingFact::Option(Box::new(if payload.is_empty() {
                        BindingFact::Unknown
                    } else {
                        BindingFact::Structure(payload)
                    })))
                }
                Expr::Group(group) => self.option_fact(&group.expr),
                Expr::MethodCall(call)
                    if call.args.is_empty()
                        && matches!(
                            call.method.to_string().as_str(),
                            "as_mut" | "as_ref" | "clone" | "cloned" | "copied"
                        ) =>
                {
                    self.option_fact(&call.receiver)
                }
                Expr::Paren(paren) => self.option_fact(&paren.expr),
                Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
                    match self.fact_of(&path.path.segments[0].ident.to_string())? {
                        fact @ BindingFact::Option(_) => Some(fact),
                        _ => None,
                    }
                }
                Expr::Reference(reference) => self.option_fact(&reference.expr),
                _ => None,
            };
        }

        fn merged_facts(&self, facts: impl Iterator<Item = BindingFact>) -> BindingFact {
            let mut facts = facts;
            let Some(first) = facts.next() else {
                return BindingFact::Unknown;
            };
            return if facts.all(|fact| fact == first) {
                first
            } else {
                BindingFact::Unknown
            };
        }

        fn typed_fact(&self, rust_type: &Type) -> BindingFact {
            if let Some(kind) = hash_collection_type(rust_type, self.context) {
                return kind;
            }
            if let Some(inner) = option_inner_type(rust_type) {
                return BindingFact::Option(Box::new(self.typed_fact(inner)));
            }
            if let Some(inner) = sequence_inner_type(rust_type) {
                let element = self.typed_fact(inner);
                return BindingFact::Sequence(Box::new(if element.has_source_structure() {
                    element
                } else {
                    BindingFact::Unknown
                }));
            }
            if let Type::Tuple(tuple) = rust_type {
                return BindingFact::Tuple(
                    tuple
                        .elems
                        .iter()
                        .map(|element| self.typed_fact(element))
                        .collect(),
                );
            }
            return context_type_identity(self.context, rust_type)
                .map_or(BindingFact::Unknown, BindingFact::Structure);
        }
    }

    impl<'ast> syn::visit::Visit<'ast> for Resolver<'_> {
        fn visit_block(&mut self, block: &'ast syn::Block) {
            self.scopes.push(BTreeMap::new());
            syn::visit::visit_block(self, block);
            self.scopes.pop();
        }

        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            self.scopes.push(BTreeMap::new());
            for input in &closure.inputs {
                self.bind_pattern(input, BindingFact::Unknown);
            }
            self.visit_expr(&closure.body);
            self.scopes.pop();
        }

        fn visit_expr_for_loop(&mut self, expression: &'ast syn::ExprForLoop) {
            self.visit_expr(&expression.expr);
            let fact = match self.initializer_fact(&expression.expr) {
                BindingFact::Sequence(element) => *element,
                _ => BindingFact::UnresolvedPattern,
            };
            self.scopes.push(BTreeMap::new());
            self.bind_pattern(&expression.pat, fact);
            self.visit_block(&expression.body);
            self.scopes.pop();
        }

        fn visit_expr_if(&mut self, expression: &'ast syn::ExprIf) {
            self.scopes.push(BTreeMap::new());
            self.visit_expr(&expression.cond);
            self.visit_block(&expression.then_branch);
            self.scopes.pop();
            if let Some((_, otherwise)) = &expression.else_branch {
                self.visit_expr(otherwise);
            }
        }

        fn visit_expr_let(&mut self, expression: &'ast syn::ExprLet) {
            self.visit_expr(&expression.expr);
            let fact = match self.initializer_fact(&expression.expr) {
                BindingFact::Unknown => BindingFact::UnresolvedPattern,
                fact => fact,
            };
            self.bind_pattern(&expression.pat, fact);
        }

        fn visit_expr_match(&mut self, expression: &'ast syn::ExprMatch) {
            self.visit_expr(&expression.expr);
            let fact = match self.initializer_fact(&expression.expr) {
                BindingFact::Unknown => BindingFact::UnresolvedPattern,
                fact => fact,
            };
            for arm in &expression.arms {
                self.scopes.push(BTreeMap::new());
                self.bind_pattern(&arm.pat, fact.clone());
                if let Some((_, guard)) = &arm.guard {
                    self.visit_expr(guard);
                }
                self.visit_expr(&arm.body);
                self.scopes.pop();
            }
        }

        fn visit_expr_while(&mut self, expression: &'ast syn::ExprWhile) {
            self.scopes.push(BTreeMap::new());
            self.visit_expr(&expression.cond);
            self.visit_block(&expression.body);
            self.scopes.pop();
        }

        fn visit_expr_unary(&mut self, unary: &'ast syn::ExprUnary) {
            if matches!(unary.op, UnOp::Deref(_))
                && let Some(name) = referenced_path_identifier(&unary.expr)
                && let Some(id) = self.binding_id(&name)
            {
                self.dereferenced.insert(id);
            }
            syn::visit::visit_expr_unary(self, unary);
        }

        fn visit_item_fn(&mut self, _function: &'ast ItemFn) {}

        fn visit_local(&mut self, local: &'ast syn::Local) {
            let mutex_guard = local
                .init
                .as_ref()
                .is_some_and(|initializer| mutex_guard_receiver(&initializer.expr).is_some());
            let mut ref_alias_target = None;
            let mut ref_alias_receiver_capture = None;
            if let Some(initializer) = &local.init
                && let Expr::MethodCall(clone) = initializer.expr.as_ref()
                && clone.method == "clone"
                && clone.args.is_empty()
                && self.erased_shared_cell_field(&clone.receiver)
            {
                let target = clone.receiver.as_ref().clone();
                if let Some(alias) = local_pattern_name(&local.pat)
                    && let Some((stable, capture, stabilized)) =
                        self.stabilize_ref_alias_target(&target, &alias)
                {
                    ref_alias_target = Some(stabilized.to_token_stream().to_string());
                    ref_alias_receiver_capture =
                        Some((stable, capture.to_token_stream().to_string()));
                } else {
                    ref_alias_target = Some(target.to_token_stream().to_string());
                }
            }
            let mut fact = BindingFact::Unknown;
            let mut retains_nullable_option = false;
            if let Some(initializer) = &local.init {
                self.visit_expr(&initializer.expr);
                if let Some((_, diverge)) = &initializer.diverge {
                    self.visit_expr(diverge);
                }
                if initializer.diverge.is_none() {
                    fact = self.initializer_fact(&initializer.expr);
                    retains_nullable_option = matches!(&fact, BindingFact::Option(_))
                        && self.initializer_retains_nullable_option(&initializer.expr);
                }
            }
            let shared_identity = match &local.pat {
                Pat::Type(typed) => rust_type_is_shared_identity(self.context, &typed.ty),
                _ => local.init.as_ref().is_some_and(|initializer| {
                    initializer.diverge.is_none()
                        && self.initializer_is_shared_identity(&initializer.expr)
                }),
            };
            self.bind_pattern(&local.pat, fact);
            self.mark_shared_identity(&local.pat, shared_identity);
            if let Pat::Type(typed) = &local.pat {
                self.mark_external_struct(&typed.pat, &typed.ty);
            }
            if retains_nullable_option
                && let Some(name) = local_pattern_name(&local.pat)
                && let Some(id) = self.binding_id(&name)
            {
                self.nullable_option_bindings.insert(id);
            }
            if let Some(target) = ref_alias_target
                && let Some(name) = local_pattern_name(&local.pat)
                && let Some(id) = self.binding_id(&name)
            {
                if let Some((stable, capture)) = ref_alias_receiver_capture {
                    self.ref_alias_receiver_captures
                        .push((id.clone(), stable, capture));
                }
                self.ref_aliases.push((id, target));
            }
            if mutex_guard
                && let Some(name) = local_pattern_name(&local.pat)
                && let Some(id) = self.binding_id(&name)
            {
                self.mutex_guards.insert(id);
            }
        }
    }

    fn single_path_identifier(expression: &Expr) -> Option<String> {
        let Expr::Path(path) = expression else {
            return None;
        };
        if path.qself.is_some() || path.path.segments.len() != 1 {
            return None;
        }
        return Some(path.path.segments[0].ident.to_string());
    }

    let mut reserved_identifiers = ReservedIdentifierCollector {
        names: HashSet::new(),
    };
    reserved_identifiers.visit_item_fn(function);
    let function_name = function.sig.ident.to_string();
    let mut resolver = Resolver {
        context,
        dereferenced: HashSet::new(),
        facts: Vec::new(),
        function: match current_source(context) {
            Some(module) => format!("{module}::{function_name}"),
            None => function_name,
        },
        mutex_guards: HashSet::new(),
        nullable_option_bindings: HashSet::new(),
        ordinal: 0,
        ref_aliases: Vec::new(),
        ref_alias_receiver_captures: Vec::new(),
        reserved_identifiers: reserved_identifiers.names,
        scopes: vec![BTreeMap::new()],
        external_structs: BTreeMap::new(),
        shared_identities: BTreeSet::new(),
        sites: Vec::new(),
    };
    for argument in &function.sig.inputs {
        let FnArg::Typed(argument) = argument else {
            continue;
        };
        let fact = resolver.typed_fact(&argument.ty);
        resolver.bind_pattern(&argument.pat, fact);
        let shared_identity = rust_type_is_shared_identity(context, &argument.ty);
        resolver.mark_shared_identity(&argument.pat, shared_identity);
        resolver.mark_external_struct(&argument.pat, &argument.ty);
    }
    let parameters = resolver.scopes[0].clone();
    syn::visit::Visit::visit_block(&mut resolver, &function.block);
    let mut markers = Vec::new();
    for (site, id) in resolver.sites {
        markers.push(format!("{BINDING_SITE_MARKER}{site}={id}"));
    }
    for (id, fact) in resolver.facts {
        markers.push(format!(
            "{BINDING_FACT_MARKER}{id}={}",
            binding_fact_marker(&fact)
        ));
    }
    for id in &resolver.shared_identities {
        markers.push(format!("{SHARED_IDENTITY_BINDING_MARKER}{id}"));
    }
    for (id, external) in &resolver.external_structs {
        markers.push(format!(
            "{EXTERNAL_STRUCT_BINDING_MARKER}{id}{PROVENANCE_SEPARATOR}{external}"
        ));
    }
    for (id, target) in resolver.ref_aliases {
        markers.push(format!(
            "{REF_ALIAS_TARGET_MARKER}{id}{PROVENANCE_SEPARATOR}{target}"
        ));
    }
    for (id, stable, capture) in resolver.ref_alias_receiver_captures {
        markers.push(format!(
            "{REF_ALIAS_RECEIVER_CAPTURE_MARKER}{id}{PROVENANCE_SEPARATOR}{stable}{PROVENANCE_SEPARATOR}{capture}"
        ));
    }
    for (name, id) in parameters {
        markers.push(format!("{BINDING_MARKER}{name}={id}"));
    }
    for id in resolver.mutex_guards.intersection(&resolver.dereferenced) {
        markers.push(format!("{MUTEX_GUARD_BINDING_MARKER}{id}"));
    }
    for id in resolver.nullable_option_bindings {
        markers.push(format!("{NULLABLE_OPTION_BINDING_MARKER}{id}"));
    }
    context.extend(markers);
}

// A name not used by `used` derived from `base` (`base`, `base1`, ...), recorded as used.
fn fresh_identifier(base: &str, used: &mut HashSet<String>) -> String {
    let name = (0..)
        .map(|index| {
            if index == 0 {
                base.to_string()
            } else {
                format!("{base}{index}")
            }
        })
        .find(|name| !used.contains(name))
        .expect("an unbounded candidate sequence always yields an unused name");
    used.insert(name.clone());
    return name;
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

pub(crate) fn generation_context(
    programs: &[(&str, &Program)],
    external_record_structs: &[ItemStruct],
    external_shared_identity_facts: &BTreeSet<String>,
    contract_source: Option<&str>,
) -> Result<HashSet<String>, CompileError> {
    return generation_context_with_types(
        programs,
        external_record_structs,
        &external_shared_identity_facts.iter().cloned().collect(),
        contract_source,
        true,
    );
}

// External target-native contracts can designate the exact `Option` fields and returns whose
// TypeScript companions store `null`. Carry only those declaration facts into a consumer: the
// dependency remains target-native, while generated callers compare and assign its public surface
// with the owner's absence representation.
pub(crate) fn insert_external_nullable_option_context(
    context: &mut HashSet<String>,
    programs: &[(&str, &ExternalNullableOptionProgram)],
) {
    for (module, program) in programs {
        for structure in program
            .structs
            .iter()
            .filter(|structure| is_public(&structure.vis))
        {
            context.insert(owner_marker(
                STRUCT_OWNER_MARKER,
                module,
                &structure.ident.to_string(),
                SourceAccess::Public,
            ));
        }
        for function in program
            .functions
            .iter()
            .filter(|function| is_public(&function.vis))
        {
            context.insert(owner_marker(
                FUNCTION_OWNER_MARKER,
                module,
                &function.sig.ident.to_string(),
                SourceAccess::Public,
            ));
        }
    }
    for (module, program) in programs {
        for structure in program
            .structs
            .iter()
            .filter(|structure| is_public(&structure.vis))
        {
            let identity = format!("{module}{PROVENANCE_SEPARATOR}{}", structure.ident);
            for field in &structure.fields {
                if !is_public(&field.vis) {
                    continue;
                }
                let (Some(field_name), Some(inner)) = (&field.ident, option_inner_type(&field.ty))
                else {
                    continue;
                };
                context.insert(format!(
                    "{OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                    named_type(inner).unwrap_or_default()
                ));
                if program.nullable_options
                    || program
                        .nullable_option_items
                        .contains(&format!("{}.{field_name}", structure.ident))
                {
                    context.insert(format!(
                        "{NULLABLE_OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                    ));
                }
            }
        }
        for function in program
            .functions
            .iter()
            .filter(|function| is_public(&function.vis))
        {
            let ReturnType::Type(_, rust_type) = &function.sig.output else {
                continue;
            };
            let Some(inner) = option_inner_type(rust_type) else {
                continue;
            };
            let function_name = function.sig.ident.to_string();
            context.insert(format!(
                "{OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{}",
                named_type(inner).unwrap_or_default()
            ));
            if program.nullable_options || program.nullable_option_items.contains(&function_name) {
                context.insert(format!(
                    "{NULLABLE_OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
                ));
            }
        }
    }
}

fn insert_external_nullable_import_context(
    context: &mut HashSet<String>,
    current_module: &str,
    program: &Program,
    external_programs: &[(&str, &ExternalNullableOptionProgram)],
) {
    let owners = external_programs
        .iter()
        .map(|(module, _)| *module)
        .collect::<BTreeSet<_>>();
    for symbol in cross_crate_symbols(&program.uses).values() {
        let Some(package) = symbol
            .module
            .strip_prefix("@flighthq/")
            .and_then(|module| module.strip_suffix("/contract"))
        else {
            continue;
        };
        let owner = format!("flight_{}", package.replace('-', "_"));
        if owners.contains(owner.as_str()) {
            context.insert(format!(
                "{USE_BINDING_MARKER}{current_module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{owner}{PROVENANCE_SEPARATOR}{}",
                symbol.local, symbol.imported
            ));
        }
    }
}

pub(crate) fn insert_string_union_context<'a>(
    context: &mut HashSet<String>,
    names: impl Iterator<Item = &'a String>,
) {
    context.extend(names.map(|name| format!("{STRING_UNION_MARKER}{name}")));
}

pub(crate) fn insert_nullable_options_context(context: &mut HashSet<String>) {
    context.insert(NULLABLE_OPTIONS_MARKER.to_string());
}

pub(super) fn provenance_marker_values(
    context: &HashSet<String>,
    marker: &str,
    local: &str,
) -> BTreeSet<String> {
    let prefix = format!("{marker}{local}{PROVENANCE_SEPARATOR}");
    return context
        .iter()
        .filter_map(|value| value.strip_prefix(&prefix))
        .map(str::to_string)
        .collect();
}

pub(super) fn clear_provenance_binding(context: &mut HashSet<String>, marker: &str, local: &str) {
    let prefix = format!("{marker}{local}{PROVENANCE_SEPARATOR}");
    context.retain(|value| !value.starts_with(&prefix));
}

pub(super) fn insert_provenance_binding(
    context: &mut HashSet<String>,
    marker: &str,
    local: &str,
    identity: &str,
) {
    context.insert(format!("{marker}{local}{PROVENANCE_SEPARATOR}{identity}"));
}

pub(super) fn provenance_binding_table(
    context: &HashSet<String>,
    marker: &str,
) -> BTreeMap<String, BTreeSet<String>> {
    return context
        .iter()
        .filter_map(|value| value.strip_prefix(marker))
        .filter_map(|value| value.split_once(PROVENANCE_SEPARATOR))
        .fold(BTreeMap::new(), |mut table, (local, identity)| {
            table
                .entry(local.to_string())
                .or_default()
                .insert(identity.to_string());
            table
        });
}

pub(super) fn replace_provenance_binding_table(
    context: &mut HashSet<String>,
    marker: &str,
    table: BTreeMap<String, BTreeSet<String>>,
) {
    context.retain(|value| !value.starts_with(marker));
    for (local, identities) in table {
        for identity in identities {
            insert_provenance_binding(context, marker, &local, &identity);
        }
    }
}

pub(super) fn resolved_provenance_binding(
    context: &HashSet<String>,
    binding_marker: &str,
    candidate_marker: &str,
    local: &str,
    kind: &str,
) -> Result<Option<String>, CompileError> {
    let bindings = provenance_marker_values(context, binding_marker, local);
    if bindings.len() == 1 {
        return Ok(bindings.into_iter().next());
    }
    if bindings.len() > 1 {
        let owners = bindings
            .iter()
            .map(|identity| ProvenanceIdentity::encoded_description(identity))
            .collect::<Vec<_>>()
            .join(", ");
        return Err(compile_error(format!(
            "portable test {kind} binding `{local}` is ambiguous between {owners}; import or shadow exactly one binding"
        )));
    }
    let candidates = provenance_marker_values(context, candidate_marker, local);
    if candidates.is_empty() {
        return Ok(None);
    }
    let owners = candidates
        .iter()
        .map(|identity| ProvenanceIdentity::encoded_description(identity))
        .collect::<Vec<_>>()
        .join(", ");
    return Err(compile_error(format!(
        "portable test {kind} `{local}` resolves to production declaration candidate(s) {owners}, but contract.rs does not select a unique public export; re-export exactly one source owner"
    )));
}

// The scope-local context of a pattern's bindings: Vitest provenance cleared for each bound name, and
// each name bound to the BindingId its site resolved to (or to no fact at all, when the site was not
// resolved), replacing any outer binding of that name within the scope.
pub(crate) fn lexical_pattern_context(context: &HashSet<String>, pattern: &Pat) -> HashSet<String> {
    let mut scoped = vitest_pattern_context(context, pattern);
    bind_lexical_pattern(&mut scoped, pattern);
    return scoped;
}

pub(super) fn provenance_pattern_bindings(pattern: &Pat) -> BTreeSet<String> {
    struct PatternBindingCollector {
        bindings: BTreeSet<String>,
    }

    impl<'ast> Visit<'ast> for PatternBindingCollector {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            self.bindings.insert(pattern.ident.to_string());
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut collector = PatternBindingCollector {
        bindings: BTreeSet::new(),
    };
    collector.visit_pat(pattern);
    return collector.bindings;
}

pub(crate) fn is_string_union(context: &HashSet<String>, name: &str) -> bool {
    return context.contains(&format!("{STRING_UNION_MARKER}{name}"));
}

fn generation_context_with_types(
    programs: &[(&str, &Program)],
    external_record_structs: &[ItemStruct],
    type_context: &HashSet<String>,
    contract_source: Option<&str>,
    strict_vitest_provenance: bool,
) -> Result<HashSet<String>, CompileError> {
    let mut context = type_context.clone();
    insert_export_name_context(&mut context, programs)?;
    let program_refs = programs
        .iter()
        .map(|(_, program)| *program)
        .collect::<Vec<_>>();
    insert_data_union_context(&mut context, &program_refs, external_record_structs)?;
    let entity_types = programs
        .iter()
        .flat_map(|(_, program)| &program.entities)
        .cloned()
        .collect::<HashSet<_>>();
    context.extend(
        entity_types
            .iter()
            .map(|entity| format!("{SHARED_IDENTITY_ENTITY_MARKER}{entity}")),
    );
    for (module, program) in programs {
        for structure in &program.structs {
            let name = structure.ident.to_string();
            if program.entities.contains(&name) && program.readonly_structs.contains(&name) {
                context.insert(format!(
                    "{READONLY_ENTITY_MARKER}{module}{PROVENANCE_SEPARATOR}{name}"
                ));
            }
        }
    }
    let mut callable_type_context = type_context.clone();
    callable_type_context.extend(entity_types.iter().cloned());
    let record_types = programs
        .iter()
        .flat_map(|(_, program)| {
            program
                .structs
                .iter()
                .filter(|structure| !program.entities.contains(&structure.ident.to_string()))
                .map(|structure| structure.ident.to_string())
        })
        .collect::<HashSet<_>>();
    let mut public_struct_owners = ProvenanceDeclarations::new();
    let mut public_function_owners = ProvenanceDeclarations::new();
    for (module, program) in programs {
        for structure in &program.structs {
            if is_public(&structure.vis) {
                public_struct_owners
                    .entry(structure.ident.to_string())
                    .or_default()
                    .insert(ProvenanceIdentity {
                        declaration: structure.ident.to_string(),
                        module: (*module).to_string(),
                    });
            }
        }
        for function in &program.functions {
            if is_public(&function.vis) {
                public_function_owners
                    .entry(function.sig.ident.to_string())
                    .or_default()
                    .insert(ProvenanceIdentity {
                        declaration: function.sig.ident.to_string(),
                        module: (*module).to_string(),
                    });
            }
        }
    }
    let public_struct_module_bindings = public_module_bindings(&public_struct_owners, programs);
    let public_function_module_bindings = public_module_bindings(&public_function_owners, programs);
    if strict_vitest_provenance {
        for (declaration, identities) in &public_struct_owners {
            for identity in identities {
                insert_provenance_binding(
                    &mut context,
                    VITEST_STRUCT_CANDIDATE_MARKER,
                    declaration,
                    &identity.encoded(),
                );
            }
        }
        for (declaration, identities) in &public_function_owners {
            for identity in identities {
                insert_provenance_binding(
                    &mut context,
                    VITEST_FUNCTION_CANDIDATE_MARKER,
                    declaration,
                    &identity.encoded(),
                );
            }
        }
        let contract_rules = contract_source.map(contract_export_rules).transpose()?;
        let struct_bindings = provenance_bindings(
            &public_struct_owners,
            &public_struct_module_bindings,
            contract_rules.as_deref(),
            "struct/type",
        )?;
        let function_bindings = provenance_bindings(
            &public_function_owners,
            &public_function_module_bindings,
            contract_rules.as_deref(),
            "function",
        )?;
        for (exported, identity) in &struct_bindings {
            context.insert(format!(
                "{VITEST_STRUCT_OWNER_MARKER}{exported}{PROVENANCE_SEPARATOR}{}",
                identity.encoded()
            ));
        }
        for (exported, identity) in &function_bindings {
            context.insert(format!(
                "{VITEST_PUBLIC_FUNCTION_MARKER}{exported}{PROVENANCE_SEPARATOR}{}",
                identity.encoded()
            ));
        }
    } else {
        for (structure, owners) in &public_struct_owners {
            for owner in owners {
                context.insert(format!(
                    "{VITEST_STRUCT_OWNER_MARKER}{structure}{PROVENANCE_SEPARATOR}{}",
                    owner.encoded()
                ));
            }
        }
        for (function, owners) in &public_function_owners {
            for owner in owners {
                context.insert(format!(
                    "{VITEST_PUBLIC_FUNCTION_MARKER}{function}{PROVENANCE_SEPARATOR}{}",
                    owner.encoded()
                ));
            }
        }
    }
    let record_vec_fields = programs
        .iter()
        .flat_map(|(_, program)| &program.structs)
        .filter(|structure| record_types.contains(&structure.ident.to_string()))
        .map(|structure| {
            let fields = structure
                .fields
                .iter()
                .filter(|field| is_public(&field.vis))
                .filter_map(|field| {
                    let optional = vec_clone_optional(&field.ty)?;
                    let name = snake_to_lower_camel(&field.ident.as_ref()?.to_string());
                    Some((name, optional))
                })
                .collect::<Vec<_>>();
            (structure.ident.to_string(), fields)
        })
        .collect::<HashMap<_, _>>();
    for (module, program) in programs {
        if let Some(segments) = module_identity_segments(module) {
            for rust_use in &program.uses {
                for path in use_tree_paths(std::iter::once(rust_use)) {
                    let Some(target) = resolve_use_prefix(&segments, &path.prefix) else {
                        continue;
                    };
                    let target = target.join("::");
                    let (binding, crate_binding, public_binding) = match path.item {
                        Some((imported, exported)) => (
                            format!(
                                "{USE_BINDING_MARKER}{module}{PROVENANCE_SEPARATOR}{exported}{PROVENANCE_SEPARATOR}{target}{PROVENANCE_SEPARATOR}{imported}"
                            ),
                            format!(
                                "{CRATE_USE_BINDING_MARKER}{module}{PROVENANCE_SEPARATOR}{exported}{PROVENANCE_SEPARATOR}{target}{PROVENANCE_SEPARATOR}{imported}"
                            ),
                            format!(
                                "{PUBLIC_USE_BINDING_MARKER}{module}{PROVENANCE_SEPARATOR}{exported}{PROVENANCE_SEPARATOR}{target}{PROVENANCE_SEPARATOR}{imported}"
                            ),
                        ),
                        None => (
                            format!("{USE_GLOB_MARKER}{module}{PROVENANCE_SEPARATOR}{target}"),
                            format!(
                                "{CRATE_USE_GLOB_MARKER}{module}{PROVENANCE_SEPARATOR}{target}"
                            ),
                            format!(
                                "{PUBLIC_USE_GLOB_MARKER}{module}{PROVENANCE_SEPARATOR}{target}"
                            ),
                        ),
                    };
                    context.insert(binding);
                    if is_crate_wide(&rust_use.vis) {
                        context.insert(crate_binding);
                    }
                    if is_public(&rust_use.vis) {
                        context.insert(public_binding);
                    }
                }
            }
        }
        for (owner, field_name) in &program.entity_runtime_states {
            context.insert(format!(
                "{ENTITY_RUNTIME_STATE_MARKER}{module}{PROVENANCE_SEPARATOR}{owner}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                entity_runtime_state_store(owner, field_name)
            ));
            context.insert(format!(
                "{ENTITY_RUNTIME_STATE_FIELD_MARKER}{field_name}{PROVENANCE_SEPARATOR}{owner}"
            ));
        }
        let mut type_path_context = HashSet::new();
        insert_program_type_path_context(&mut type_path_context, program);
        context.extend(type_path_context.iter().map(|fact| {
            format!("{SOURCE_TYPE_PATH_CONTEXT_MARKER}{module}{PROVENANCE_SEPARATOR}{fact}")
        }));
        for (owner, fields) in &program.entity_clone_shared_fields {
            for field in fields {
                let structure = program
                    .structs
                    .iter()
                    .find(|structure| structure.ident == owner.as_str())
                    .expect("entity clone field validation resolved the owner");
                let rust_field = structure
                    .fields
                    .iter()
                    .find(|rust_field| {
                        rust_field
                            .ident
                            .as_ref()
                            .is_some_and(|ident| ident == field)
                    })
                    .expect("entity clone field validation resolved the field");
                if !rust_type_is_erased_shared_cell(&rust_field.ty, &type_path_context) {
                    return Err(compile_error(format!(
                        "`flight-compiler: entity-clone-fields {owner}.{field}` must designate a proven `flight_entity::Ref<T>` or standard `Arc<RwLock<T>>` field"
                    )));
                }
                context.insert(format!(
                    "{ENTITY_CLONE_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}{field}"
                ));
            }
        }
        for structure in &program.structs {
            context.insert(owner_marker(
                STRUCT_OWNER_MARKER,
                module,
                &structure.ident.to_string(),
                source_access_for_visibility(&structure.vis),
            ));
            if structure
                .fields
                .iter()
                .any(|field| rust_type_has_interior_mutability(&field.ty))
            {
                context.insert(format!(
                    "{INTERIOR_MUTABLE_STRUCT_MARKER}{}",
                    structure.ident
                ));
            }
        }
        for function in &program.functions {
            context.insert(owner_marker(
                FUNCTION_OWNER_MARKER,
                module,
                &function.sig.ident.to_string(),
                source_access_for_visibility(&function.vis),
            ));
        }
        for alias in program
            .type_aliases
            .iter()
            .filter(|alias| alias.generics.params.is_empty())
        {
            context.insert(owner_marker(
                TYPE_ALIAS_OWNER_MARKER,
                module,
                &alias.ident.to_string(),
                source_access_for_visibility(&alias.vis),
            ));
            context.insert(format!(
                "{TYPE_ALIAS_DEFINITION_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{}",
                alias.ident,
                alias.ty.to_token_stream()
            ));
        }
    }
    for (module, program) in programs {
        let local_struct_bindings = program
            .structs
            .iter()
            .filter(|structure| is_public(&structure.vis))
            .map(|structure| {
                let identity = ProvenanceIdentity {
                    declaration: structure.ident.to_string(),
                    module: (*module).to_string(),
                };
                (structure.ident.to_string(), BTreeSet::from([identity]))
            })
            .collect::<BTreeMap<_, _>>();
        let contract_struct_bindings =
            provenance_binding_table(&context, VITEST_STRUCT_OWNER_MARKER)
                .into_iter()
                .map(|(name, identities)| {
                    let identities = identities
                        .into_iter()
                        .filter_map(|identity| {
                            let (module, declaration) =
                                identity.split_once(PROVENANCE_SEPARATOR)?;
                            Some(ProvenanceIdentity {
                                declaration: declaration.to_string(),
                                module: module.to_string(),
                            })
                        })
                        .collect();
                    (name, identities)
                })
                .collect::<BTreeMap<_, _>>();
        let production_struct_bindings = resolve_import_rules(
            &public_struct_owners,
            &provenance_import_rules(program.uses.iter(), Some(module)),
            local_struct_bindings,
            &contract_struct_bindings,
            &public_struct_module_bindings,
        );
        context.extend(program.entities.iter().cloned());
        if program.source_mode == crate::SourceMode::TargetNative {
            context.extend(
                program
                    .entities
                    .iter()
                    .map(|entity| format!("{TARGET_NATIVE_ENTITY_MARKER}{entity}")),
            );
        }
        context.extend(
            program
                .frozen_objects
                .iter()
                .map(|(rust_name, typescript_name)| {
                    format!("{FROZEN_OBJECT_MARKER}{rust_name}:{typescript_name}")
                }),
        );
        context.extend(
            crate::model::const_group_members(&program.const_groups, &program.constants)?
                .into_iter()
                .map(|(rust_name, owner, member)| {
                    format!("{CONST_GROUP_MEMBER_MARKER}{rust_name}:{owner}.{member}")
                }),
        );
        insert_string_union_context(&mut context, program.string_unions.keys());
        let mut owned_facts = Vec::new();
        let mut type_path_context = HashSet::new();
        insert_program_type_path_context(&mut type_path_context, program);
        for structure in &program.structs {
            let identity = format!("{module}{PROVENANCE_SEPARATOR}{}", structure.ident);
            for field in &structure.fields {
                let Some(field_name) = &field.ident else {
                    continue;
                };
                if let Some(inner) = option_inner_type(&field.ty) {
                    owned_facts.push(format!(
                        "{OPTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                        resolved_type_identity(&context, module, inner).unwrap_or_default()
                    ));
                }
                if rust_type_is_sequence(&field.ty) {
                    owned_facts.push(format!(
                        "{SEQUENCE_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                    ));
                }
                if rust_type_is_string(&field.ty) {
                    owned_facts.push(format!(
                        "{STRING_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                    ));
                }
                if let Some(kind) = hash_collection_type(&field.ty, &type_path_context) {
                    owned_facts.push(format!(
                        "{HASH_COLLECTION_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{}",
                        binding_fact_marker(&kind)
                    ));
                }
                if rust_type_is_erased_shared_cell(&field.ty, &type_path_context) {
                    owned_facts.push(format!(
                        "{ERASED_SHARED_CELL_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                    ));
                }
            }
        }
        for function in &program.functions {
            let ReturnType::Type(_, rust_type) = &function.sig.output else {
                continue;
            };
            let function_name = function.sig.ident.to_string();
            let return_fact = hash_collection_type(rust_type, &type_path_context)
                .unwrap_or_else(|| binding_fact_for_type(&context, Some(module), rust_type));
            owned_facts.push(format!(
                "{RETURN_BINDING_FACT_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{}",
                binding_fact_marker(&return_fact)
            ));
            if rust_type_is_sequence(rust_type) {
                owned_facts.push(format!(
                    "{SEQUENCE_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
                ));
            } else if let Some(inner) = option_inner_type(rust_type) {
                owned_facts.push(format!(
                    "{OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{}",
                    resolved_type_identity(&context, module, inner).unwrap_or_default()
                ));
                if program.nullable_options
                    || program
                        .nullable_option_items
                        .contains(&function_name.to_string())
                {
                    owned_facts.push(format!(
                        "{NULLABLE_OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
                    ));
                }
            } else if let Some(identity) = resolved_type_identity(&context, module, rust_type) {
                owned_facts.push(format!(
                    "{STRUCT_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{identity}"
                ));
            }
            if shared_identity_type_at_depth(&context, Some(module), rust_type, 0) {
                owned_facts.push(format!(
                    "{SHARED_IDENTITY_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}"
                ));
            }
        }
        context.extend(owned_facts);
        for designation in &program.array_like_parameters {
            let Some((function_name, parameter_name)) = designation.split_once('.') else {
                continue;
            };
            context.insert(format!(
                "{ARRAY_LIKE_PARAMETER_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{parameter_name}"
            ));
            let position = program
                .functions
                .iter()
                .find(|function| function.sig.ident == function_name)
                .and_then(|function| {
                    return function.sig.inputs.iter().position(|input| {
                        return matches!(input, FnArg::Typed(typed) if matches!(typed.pat.as_ref(), Pat::Ident(pattern) if pattern.ident == parameter_name));
                    });
                });
            if let Some(position) = position {
                context.insert(format!(
                    "{ARRAY_LIKE_ARGUMENT_MARKER}{module}{PROVENANCE_SEPARATOR}{function_name}{PROVENANCE_SEPARATOR}{position}"
                ));
            }
        }
        for structure in &program.structs {
            for field in &structure.fields {
                let Some(field_name) = &field.ident else {
                    continue;
                };
                if let Some(field_identity) = resolved_type_identity(&context, module, &field.ty) {
                    context.insert(format!(
                        "{STRUCT_FIELD_TYPE_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{field_identity}",
                        structure.ident
                    ));
                } else if shared_identity_type_at_depth(&context, Some(module), &field.ty, 0) {
                    context.insert(format!(
                        "{SHARED_IDENTITY_FIELD_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}",
                        structure.ident
                    ));
                }
                if let Some(element) = sequence_inner_type(&field.ty)
                    && (shared_identity_type_at_depth(&context, Some(module), element, 0)
                        || resolved_type_identity(&context, module, element).is_some())
                {
                    context.insert(format!(
                        "{SHARED_IDENTITY_ELEMENT_FIELD_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}",
                        structure.ident
                    ));
                }
                if let Some(external) = external_struct_type_in(&context, module, &field.ty) {
                    context.insert(format!(
                        "{EXTERNAL_STRUCT_FIELD_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}{external}",
                        structure.ident
                    ));
                }
                let designated = program
                    .nullable_option_items
                    .contains(&format!("{}.{field_name}", structure.ident));
                if (designated || program.nullable_options && is_public(&structure.vis))
                    && is_public(&field.vis)
                    && option_inner_type(&field.ty).is_some()
                {
                    context.insert(format!(
                        "{NULLABLE_OPTION_FIELD_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}",
                        structure.ident,
                    ));
                }
                if designated {
                    context.insert(format!(
                        "{NULLABLE_OPTION_LITERAL_FIELD_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}",
                        structure.ident,
                    ));
                }
            }
        }
        // A target-native companion owns its target storage defaults. Its declaration-level
        // directives can still govern generated siblings, but Rust-only storage fields must not
        // impose synthesized defaults on those siblings.
        for structure in program
            .structs
            .iter()
            .filter(|_| program.source_mode != crate::SourceMode::TargetNative)
        {
            let entity = structure.ident.to_string();
            if !entity_types.contains(&entity) {
                continue;
            }
            let typescript_type = format!("{entity}Raw");
            for field in &structure.fields {
                if !is_public(&field.vis) {
                    continue;
                }
                let Some(field_name) = &field.ident else {
                    continue;
                };
                let field_name = snake_to_lower_camel(&field_name.to_string());
                let Some(mut value) = rust_default_expression(&field.ty) else {
                    context.insert(format!(
                        "{ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER}{typescript_type}:{field_name}:{}",
                        rust_type_description(&field.ty)
                    ));
                    continue;
                };
                let designated = program.nullable_option_items.contains(&format!(
                    "{}.{}",
                    structure.ident,
                    field
                        .ident
                        .as_ref()
                        .map(ToString::to_string)
                        .unwrap_or_default()
                ));
                if (program.nullable_options || designated)
                    && option_inner_type(&field.ty).is_some()
                {
                    value = "null".to_string();
                }
                context.insert(format!(
                    "{ENTITY_DEFAULT_FIELD_MARKER}{typescript_type}:{field_name}:{value}"
                ));
            }
        }
        for function in &program.functions {
            let Some((parameter, entity)) =
                leading_mutable_entity_parameter(function, &entity_types)
            else {
                continue;
            };
            let mut assigned_fields = BTreeSet::new();
            collect_definitely_assigned_fields(
                &function.block.stmts,
                &parameter,
                &mut assigned_fields,
            );
            for field in assigned_fields {
                context.insert(format!(
                    "{ENTITY_DEFINITELY_INITIALIZED_FIELD_MARKER}{}:{entity}Raw:{}",
                    function.sig.ident,
                    snake_to_lower_camel(&field)
                ));
            }
        }
        for (record, fields) in &record_vec_fields {
            context.insert(format!("{RECORD_CLONE_TYPE_MARKER}{record}"));
            for (field, optional) in fields {
                context.insert(format!(
                    "{RECORD_VEC_FIELD_MARKER}{record}:{field}:{optional}"
                ));
            }
        }
        for function in &program.functions {
            let function_name = function.sig.ident.to_string();
            if is_public(&function.vis)
                && let ReturnType::Type(_, rust_type) = &function.sig.output
                && let Some(structure) = named_type(rust_type)
            {
                let return_candidates = resolved_production_type_identities(
                    rust_type,
                    &type_path_context,
                    &public_struct_owners,
                    &production_struct_bindings,
                    &contract_struct_bindings,
                    &public_struct_module_bindings,
                );
                let function_identity = ProvenanceIdentity {
                    declaration: function_name.clone(),
                    module: (*module).to_string(),
                }
                .encoded();
                let shadows_public_name = program
                    .structs
                    .iter()
                    .any(|candidate| candidate.ident == structure.as_str());
                if return_candidates.is_empty()
                    && public_struct_owners.contains_key(&structure)
                    && !shadows_public_name
                {
                    context.insert(format!(
                        "{VITEST_FUNCTION_RETURN_UNRESOLVED_MARKER}{function_identity}{PROVENANCE_SEPARATOR}{structure}"
                    ));
                }
                for structure_owner in &return_candidates {
                    context.insert(format!(
                        "{VITEST_FUNCTION_RETURN_CANDIDATE_MARKER}{function_identity}{PROVENANCE_SEPARATOR}{}",
                        structure_owner.encoded()
                    ));
                }
                if return_candidates.len() == 1
                    && let Some(structure_owner) = return_candidates.first()
                {
                    context.insert(format!(
                        "{VITEST_STRUCT_RETURN_MARKER}{function_identity}{PROVENANCE_SEPARATOR}{}",
                        structure_owner.encoded()
                    ));
                }
            }
            if matches!(&function.sig.output, ReturnType::Type(_, rust_type) if rust_type_is_string(rust_type))
            {
                context.insert(format!("{STRING_RETURN_MARKER}{function_name}"));
            }
            for (argument_index, argument) in function.sig.inputs.iter().enumerate() {
                if argument_is_nullable_guard(function, argument)
                    || (program.nullable_options && argument_is_option(argument))
                {
                    context.insert(format!(
                        "{NULLABLE_CALL_MARKER}{function_name}:{argument_index}"
                    ));
                }
                let FnArg::Typed(argument) = argument else {
                    continue;
                };
                if let Pat::Ident(pattern) = argument.pat.as_ref() {
                    let local = snake_to_lower_camel(&pattern.ident.to_string());
                    if let Some(record) = named_type(&argument.ty)
                        && record_types.contains(&record)
                    {
                        context.insert(format!(
                            "{RECORD_CLONE_ARGUMENT_MARKER}{function_name}:{}",
                            pattern.ident
                        ));
                        if let Some(fields) = record_vec_fields.get(&record) {
                            for (field, optional) in fields {
                                context.insert(format!(
                                    "{VEC_CLONE_ARGUMENT_MARKER}{function_name}:{local}.{field}:{optional}"
                                ));
                            }
                        }
                    }
                    if let Some(optional) = vec_clone_optional(&argument.ty) {
                        context.insert(format!(
                            "{VEC_CLONE_ARGUMENT_MARKER}{function_name}:{local}:{optional}"
                        ));
                    }
                }
                if let Some(typescript_type) = fixed_buffer_type(&argument.ty) {
                    context.insert(format!(
                        "{FIXED_BUFFER_ARGUMENT_MARKER}{function_name}:{argument_index}:{typescript_type}"
                    ));
                }
                let Some(parameters) =
                    callable_parameter_types(&argument.ty, &callable_type_context)?
                else {
                    continue;
                };
                for (parameter_index, typescript_type) in parameters.iter().enumerate() {
                    context.insert(format!(
                        "{CALLBACK_ARGUMENT_MARKER}{function_name}:{argument_index}:{parameter_index}:{typescript_type}"
                    ));
                }
            }
        }
    }
    return Ok(context);
}

pub(crate) fn function_expression_context(
    function: &ItemFn,
    base: &HashSet<String>,
) -> HashSet<String> {
    struct CallbackUseCollector<'a> {
        context: &'a mut HashSet<String>,
    }

    impl<'ast> syn::visit::Visit<'ast> for CallbackUseCollector<'_> {
        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            if let Expr::Path(path) = call.func.as_ref()
                && path.qself.is_none()
                && let Some(function) = vitest_path_binding_name(&path.path, self.context)
            {
                for (argument_index, argument) in call.args.iter().enumerate() {
                    let Some(local) = referenced_identifier(argument) else {
                        continue;
                    };
                    let prefix = format!("{CALLBACK_ARGUMENT_MARKER}{function}:{argument_index}:");
                    let markers = self
                        .context
                        .iter()
                        .filter_map(|marker| marker.strip_prefix(&prefix))
                        .map(|suffix| format!("{CLOSURE_PARAMETER_MARKER}{local}:{suffix}"))
                        .collect::<Vec<_>>();
                    self.context.extend(markers);
                    let prefix =
                        format!("{FIXED_BUFFER_ARGUMENT_MARKER}{function}:{argument_index}:");
                    let markers = self
                        .context
                        .iter()
                        .filter_map(|marker| marker.strip_prefix(&prefix))
                        .map(|typescript_type| {
                            format!("{FIXED_BUFFER_LOCAL_MARKER}{local}:{typescript_type}")
                        })
                        .collect::<Vec<_>>();
                    self.context.extend(markers);
                }
            }
            syn::visit::visit_expr_call(self, call);
        }

        fn visit_local(&mut self, local: &'ast syn::Local) {
            if let Pat::Type(typed) = &local.pat
                && let Pat::Ident(pattern) = typed.pat.as_ref()
            {
                let local = snake_to_lower_camel(&pattern.ident.to_string());
                if type_is_unsigned_integer(&typed.ty) {
                    self.context
                        .insert(format!("{UNSIGNED_INTEGER_LOCAL_MARKER}{}", pattern.ident));
                }
                if let Some(optional) = vec_clone_optional(&typed.ty) {
                    self.context
                        .insert(format!("{VEC_CLONE_EXPRESSION_MARKER}{local}:{optional}"));
                }
                if rust_type_is_string(&typed.ty) {
                    self.context
                        .insert(format!("{STRING_EXPRESSION_MARKER}{}", pattern.ident));
                }
                if rust_type_is_ordered_primitive(&typed.ty) {
                    self.context
                        .insert(format!("{ORDERED_PRIMITIVE_MARKER}{}", pattern.ident));
                }
                if let Some(record) = named_type(&typed.ty)
                    && self
                        .context
                        .contains(&format!("{RECORD_CLONE_TYPE_MARKER}{record}"))
                {
                    self.context
                        .insert(format!("{RECORD_CLONE_LOCAL_MARKER}{}", pattern.ident));
                    let prefix = format!("{RECORD_VEC_FIELD_MARKER}{record}:");
                    let fields = self
                        .context
                        .iter()
                        .filter_map(|marker| marker.strip_prefix(&prefix))
                        .map(|field| format!("{VEC_CLONE_EXPRESSION_MARKER}{local}.{field}"))
                        .collect::<Vec<_>>();
                    self.context.extend(fields);
                }
            }
            if let Some(initializer) = &local.init
                && expression_is_known_string(&initializer.expr, self.context)
                && let Some(name) = local_pattern_name(&local.pat)
            {
                self.context
                    .insert(format!("{STRING_EXPRESSION_MARKER}{name}"));
            }
            if let Some(initializer) = &local.init
                && let Some(receiver) = direct_lock_guard_receiver(&initializer.expr)
                && let Some(id) = local_pattern_binding_id(self.context, &local.pat)
            {
                self.context
                    .insert(format!("{DIRECT_LOCK_GUARD_BINDING_MARKER}{id}"));
                self.context.insert(format!(
                    "{DIRECT_LOCK_GUARD_TARGET_MARKER}{id}{PROVENANCE_SEPARATOR}{}",
                    receiver.to_token_stream()
                ));
            }
            syn::visit::visit_local(self, local);
        }

        fn visit_pat_tuple_struct(&mut self, pattern: &'ast syn::PatTupleStruct) {
            if let Some((owner, variant)) = path_owner_and_member(&pattern.path)
                && let Some(categories) =
                    data_union_variant_categories(self.context, &owner, &variant)
                && (categories == BTreeSet::from([RuntimeCategory::Number])
                    || categories == BTreeSet::from([RuntimeCategory::String]))
                && pattern.elems.len() == 1
                && let Some(binding) = payload_pattern_identifier(&pattern.elems[0])
            {
                self.context
                    .insert(format!("{ORDERED_PRIMITIVE_MARKER}{binding}"));
            }
            syn::visit::visit_pat_tuple_struct(self, pattern);
        }
    }

    fn payload_pattern_identifier(pattern: &Pat) -> Option<String> {
        return match pattern {
            Pat::Ident(identifier) if identifier.subpat.is_none() => {
                Some(identifier.ident.to_string())
            }
            Pat::Reference(reference) => payload_pattern_identifier(&reference.pat),
            _ => None,
        };
    }

    fn referenced_identifier(expression: &Expr) -> Option<String> {
        return match expression {
            Expr::Group(group) => referenced_identifier(&group.expr),
            Expr::Paren(paren) => referenced_identifier(&paren.expr),
            Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => path
                .path
                .segments
                .first()
                .map(|segment| segment.ident.to_string()),
            Expr::Reference(reference) => referenced_identifier(&reference.expr),
            _ => None,
        };
    }

    let mut context = base.clone();
    insert_lexical_binding_context(function, &mut context);
    let function_name = function.sig.ident.to_string();
    let vec_prefix = format!("{VEC_CLONE_ARGUMENT_MARKER}{function_name}:");
    let vec_markers = context
        .iter()
        .filter_map(|marker| marker.strip_prefix(&vec_prefix))
        .map(|suffix| format!("{VEC_CLONE_EXPRESSION_MARKER}{suffix}"))
        .collect::<Vec<_>>();
    context.extend(vec_markers);
    for argument in &function.sig.inputs {
        let FnArg::Typed(argument) = argument else {
            continue;
        };
        for binding in provenance_pattern_bindings(&argument.pat) {
            clear_provenance_binding(&mut context, VITEST_PUBLIC_FUNCTION_MARKER, &binding);
            clear_provenance_binding(&mut context, VITEST_FUNCTION_CANDIDATE_MARKER, &binding);
        }
        let Pat::Ident(pattern) = argument.pat.as_ref() else {
            continue;
        };
        if matches!(argument.ty.as_ref(), Type::Reference(_))
            && let Some(id) = lexical_binding(&context, &pattern.ident.to_string())
        {
            context.insert(format!("{REFERENCE_PARAMETER_BINDING_MARKER}{id}"));
        }
        if let Some(structure) = vitest_named_type(&argument.ty, &context)
            && let Some(identity) = vitest_struct_owner(&context, &structure)
        {
            context.insert(format!(
                "{VITEST_STRUCT_LOCAL_MARKER}{}{PROVENANCE_SEPARATOR}{identity}",
                pattern.ident
            ));
        }
        if context.contains(&format!(
            "{RECORD_CLONE_ARGUMENT_MARKER}{function_name}:{}",
            pattern.ident
        )) {
            context.insert(format!("{RECORD_CLONE_LOCAL_MARKER}{}", pattern.ident));
        }
        if type_is_unsigned_integer(&argument.ty) {
            context.insert(format!("{UNSIGNED_INTEGER_LOCAL_MARKER}{}", pattern.ident));
        }
        if rust_type_is_string(&argument.ty) {
            context.insert(format!("{STRING_EXPRESSION_MARKER}{}", pattern.ident));
        }
        if rust_type_is_ordered_primitive(&argument.ty) {
            context.insert(format!("{ORDERED_PRIMITIVE_MARKER}{}", pattern.ident));
        }
    }
    syn::visit::Visit::visit_block(
        &mut CallbackUseCollector {
            context: &mut context,
        },
        &function.block,
    );
    return context;
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
    if let Some(inner) = sequence_inner_type(rust_type) {
        let element = binding_fact_for_type(entities, from, inner);
        return BindingFact::Sequence(Box::new(if element.has_source_structure() {
            element
        } else {
            BindingFact::Unknown
        }));
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

fn expression_precedence(expression: &Expr) -> u8 {
    return match expression {
        Expr::Assign(_) => 1,
        Expr::Binary(binary) => binary_precedence(&binary.op),
        Expr::Cast(cast) if type_is_named(&cast.ty, "i32") => 5,
        Expr::Cast(cast) if type_is_named(&cast.ty, "u32") => 10,
        Expr::Cast(cast) => expression_precedence(&cast.expr),
        Expr::Group(group) => expression_precedence(&group.expr),
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
    let precedence = expression_precedence(expression);
    if precedence < parent_precedence
        || (right && precedence == parent_precedence && matches!(expression, Expr::Binary(_)))
        || !is_lowered_primary(expression, &value)
    {
        return Ok(format!("({value})"));
    }
    return Ok(value);
}

fn emit_block(
    out: &mut String,
    statements: &[Stmt],
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    emit_block_with_context(out, statements, entities, indent)?;
    return Ok(());
}

// Emits a lexical block and returns the context after its statements. Most callers discard the
// result because Rust block bindings do not escape, but a value block still needs the advanced
// context while emitting its final expression.
fn emit_block_with_context(
    out: &mut String,
    statements: &[Stmt],
    entities: &HashSet<String>,
    indent: usize,
) -> Result<HashSet<String>, CompileError> {
    let mut block_context = entities.clone();
    insert_vitest_rebound_struct_context(statements, &mut block_context);
    let mut declaration_counts = HashMap::new();
    for statement in statements {
        if let Stmt::Local(local) = statement
            && let Some(name) = local_pattern_name(&local.pat)
        {
            *declaration_counts.entry(name).or_insert(0_usize) += 1;
        }
    }
    let mut declared = HashSet::new();
    for (index, statement) in statements.iter().enumerate() {
        if let Stmt::Local(local) = statement
            && let Some(name) = local_pattern_name(&local.pat)
        {
            let rebound = declaration_counts
                .get(&name)
                .is_some_and(|count| *count > 1);
            let local_context = allocation_initialized_context(
                &block_context,
                local,
                &name,
                statements.get(index + 1),
            );
            let shadowed = !declared.insert(name);
            emit_local_with_shadow(out, local, &local_context, indent, shadowed, rebound)?;
            update_vitest_struct_local_context(local, &mut block_context);
            update_vitest_local_function_context(local, &mut block_context);
        } else if let Stmt::Local(local) = statement {
            emit_statement(out, statement, &block_context, indent)?;
            update_vitest_local_function_context(local, &mut block_context);
        } else {
            emit_statement(out, statement, &block_context, indent)?;
        }
    }
    return Ok(block_context);
}

fn emit_closure(
    closure: &syn::ExprClosure,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return emit_closure_with_parameter_types(closure, entities, &[]);
}

fn emit_closure_with_parameter_types(
    closure: &syn::ExprClosure,
    entities: &HashSet<String>,
    parameter_types: &[String],
) -> Result<String, CompileError> {
    let mut closure_context = entities
        .iter()
        .filter(|marker| {
            !marker.starts_with(RETURN_TYPE_MARKER)
                && !marker.starts_with(RETURNS_TYPED_ARRAY_MARKER)
                && marker.as_str() != RETURNS_U32_MARKER
                && marker.as_str() != RETURNS_NULLABLE_MARKER
        })
        .cloned()
        .collect::<HashSet<_>>();
    if let ReturnType::Type(_, rust_type) = &closure.output {
        closure_context.insert(format!(
            "{RETURN_TYPE_MARKER}{}",
            emit_type(rust_type, entities)?
        ));
        if type_is_named(rust_type, "u32") {
            closure_context.insert(RETURNS_U32_MARKER.to_string());
        }
    }
    for pattern in &closure.inputs {
        closure_context = lexical_pattern_context(&closure_context, pattern);
    }
    for (index, pattern) in closure.inputs.iter().enumerate() {
        let Some(parameter) = closure_parameter_identifier(pattern) else {
            continue;
        };
        closure_context.remove(&format!("{STRING_EXPRESSION_MARKER}{parameter}"));
        let annotated_string = matches!(
            pattern,
            Pat::Type(typed) if rust_type_is_string(&typed.ty)
        );
        let inferred_string = parameter_types
            .get(index)
            .is_some_and(|typescript_type| typescript_type == "string");
        if annotated_string || inferred_string {
            closure_context.insert(format!("{STRING_EXPRESSION_MARKER}{parameter}"));
        }
    }
    let mut parameter_names = HashSet::new();
    for pattern in &closure.inputs {
        collect_closure_parameter_names(pattern, &mut parameter_names);
        for binding in provenance_pattern_bindings(pattern) {
            clear_provenance_binding(
                &mut closure_context,
                VITEST_PUBLIC_FUNCTION_MARKER,
                &binding,
            );
            clear_provenance_binding(
                &mut closure_context,
                VITEST_FUNCTION_CANDIDATE_MARKER,
                &binding,
            );
        }
        if let Pat::Type(typed) = pattern
            && let Pat::Ident(identifier) = typed.pat.as_ref()
            && let Some(structure) = vitest_named_type(&typed.ty, &closure_context)
            && let Some(identity) = vitest_struct_owner(&closure_context, &structure)
        {
            insert_provenance_binding(
                &mut closure_context,
                VITEST_STRUCT_LOCAL_MARKER,
                &identifier.ident.to_string(),
                &identity,
            );
        }
    }
    let mut unused_index = 0_usize;
    let parameters = closure
        .inputs
        .iter()
        .enumerate()
        .map(|(index, pattern)| {
            let parameter =
                emit_closure_parameter(pattern, entities, &mut parameter_names, &mut unused_index)?;
            if matches!(pattern, Pat::Type(_)) {
                return Ok(parameter);
            }
            return Ok(match parameter_types.get(index) {
                Some(typescript_type) => format!("{parameter}: {typescript_type}"),
                None => parameter,
            });
        })
        .collect::<Result<Vec<_>, _>>()?;
    let return_type = match &closure.output {
        ReturnType::Default => String::new(),
        ReturnType::Type(_, rust_type) => format!(": {}", emit_type(rust_type, entities)?),
    };
    let body = match closure.body.as_ref() {
        Expr::Block(block) => {
            let mut body = String::new();
            body.push_str("{\n");
            emit_block(&mut body, &block.block.stmts, &closure_context, 1)?;
            body.push('}');
            body
        }
        Expr::Return(expression) => {
            let Some(value) = &expression.expr else {
                return Err(compile_error(
                    "portable expression closure cannot return without a value",
                ));
            };
            concise_arrow_body(emit_expression(value, &closure_context)?)
        }
        expression => concise_arrow_body(emit_expression(expression, &closure_context)?),
    };
    return Ok(format!(
        "({}){return_type} => {body}",
        parameters.join(", ")
    ));
}

fn emit_closure_parameter(
    pattern: &Pat,
    entities: &HashSet<String>,
    parameter_names: &mut HashSet<String>,
    unused_index: &mut usize,
) -> Result<String, CompileError> {
    return match pattern {
        Pat::Ident(identifier) => Ok(snake_to_lower_camel(&identifier.ident.to_string())),
        Pat::Reference(reference) => {
            emit_closure_parameter(&reference.pat, entities, parameter_names, unused_index)
        }
        Pat::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| {
                    emit_closure_parameter(element, entities, parameter_names, unused_index)
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Pat::Type(pattern) => Ok(format!(
            "{}: {}",
            emit_closure_parameter(&pattern.pat, entities, parameter_names, unused_index,)?,
            emit_type(&pattern.ty, entities)?
        )),
        Pat::Wild(_) => loop {
            let name = format!("_unused{unused_index}");
            *unused_index += 1;
            if parameter_names.insert(name.clone()) {
                break Ok(name);
            }
        },
        _ => Err(compile_error(
            "unsupported destructuring in closure parameter",
        )),
    };
}

fn collect_closure_parameter_names(pattern: &Pat, names: &mut HashSet<String>) {
    match pattern {
        Pat::Ident(identifier) => {
            names.insert(snake_to_lower_camel(&identifier.ident.to_string()));
        }
        Pat::Reference(reference) => collect_closure_parameter_names(&reference.pat, names),
        Pat::Tuple(tuple) => {
            for element in &tuple.elems {
                collect_closure_parameter_names(element, names);
            }
        }
        Pat::Type(pattern) => collect_closure_parameter_names(&pattern.pat, names),
        _ => {}
    }
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

fn emit_enum(
    out: &mut String,
    rust_enum: &syn::ItemEnum,
    string_union: Option<StringUnionStyle>,
    string_union_values: Option<&BTreeMap<String, String>>,
    numeric_union: Option<&Vec<(String, i64)>>,
    data_union: bool,
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    emit_documentation(out, &rust_enum.attrs, 0);
    let export = if is_public(&rust_enum.vis) {
        "export "
    } else {
        ""
    };
    if let Some(variants) = numeric_union {
        let values = variants
            .iter()
            .map(|(_, value)| value.to_string())
            .collect::<Vec<_>>();
        writeln!(
            out,
            "{export}type {} = {};",
            rust_enum.ident,
            values.join(" | ")
        )
        .expect("writing to a String cannot fail");
        return Ok(());
    }
    if data_union {
        let named = rust_enum
            .variants
            .iter()
            .any(|variant| matches!(variant.fields, syn::Fields::Named(_)));
        let mut seen = HashSet::new();
        let mut variants = Vec::new();
        for variant in &rust_enum.variants {
            let rendered = if named {
                let mut fields = vec![format!(
                    "readonly kind: {:?}",
                    lower_camel_from_upper_camel(&variant.ident.to_string())
                )];
                if let syn::Fields::Named(named) = &variant.fields {
                    for field in &named.named {
                        let name = snake_to_lower_camel(
                            &field
                                .ident
                                .as_ref()
                                .expect("named data union field has an identifier")
                                .to_string(),
                        );
                        fields.push(format!(
                            "readonly {name}: {}",
                            emit_type(&field.ty, entities)?
                        ));
                    }
                }
                format!("{{ {} }}", fields.join("; "))
            } else {
                match &variant.fields {
                    syn::Fields::Unit => "null".to_string(),
                    syn::Fields::Unnamed(fields) => emit_type(&fields.unnamed[0].ty, entities)?,
                    syn::Fields::Named(_) => {
                        unreachable!("data union representation changed after directive validation")
                    }
                }
            };
            if seen.insert(rendered.clone()) {
                variants.push(rendered);
            }
        }
        let rendered = if variants.iter().any(|variant| variant == "unknown") {
            "unknown".to_string()
        } else {
            variants.join(" | ")
        };
        writeln!(out, "{export}type {} = {rendered};", rust_enum.ident)
            .expect("writing to a String cannot fail");
        return Ok(());
    }
    if let Some(style) = string_union {
        if style == StringUnionStyle::Exact {
            let values = string_union_values
                .expect("exact string-union values were validated before TypeScript emission");
            writeln!(out, "{export}const {} = {{", rust_enum.ident)
                .expect("writing to a String cannot fail");
            for variant in &rust_enum.variants {
                emit_documentation(out, &variant.attrs, 1);
                let value = &values[&variant.ident.to_string()];
                writeln!(out, "  {}: {value:?},", variant.ident)
                    .expect("writing to a String cannot fail");
            }
            writeln!(out, "}} as const;").expect("writing to a String cannot fail");
            writeln!(
                out,
                "{export}type {} = (typeof {})[keyof typeof {}];",
                rust_enum.ident, rust_enum.ident, rust_enum.ident
            )
            .expect("writing to a String cannot fail");
            return Ok(());
        }
        if rust_enum
            .variants
            .iter()
            .any(|variant| variant.discriminant.is_some())
        {
            return Err(compile_error(format!(
                "numeric enum `{}` cannot use `flight-compiler: string-union`",
                rust_enum.ident
            )));
        }
        let variants = rust_enum
            .variants
            .iter()
            .map(|variant| {
                format!(
                    "{:?}",
                    string_union_literal(&variant.ident.to_string(), style)
                )
            })
            .collect::<Vec<_>>();
        writeln!(
            out,
            "{export}type {} = {};",
            rust_enum.ident,
            variants.join(" | ")
        )
        .expect("writing to a String cannot fail");
        return Ok(());
    }
    let numeric = rust_enum
        .variants
        .iter()
        .any(|variant| variant.discriminant.is_some());
    writeln!(out, "{export}enum {} {{", rust_enum.ident).expect("writing to a String cannot fail");
    for variant in &rust_enum.variants {
        emit_documentation(out, &variant.attrs, 1);
        if numeric {
            if let Some((_, discriminant)) = &variant.discriminant {
                writeln!(
                    out,
                    "  {} = {},",
                    variant.ident,
                    emit_expression(discriminant, &HashSet::new())?
                )
                .expect("writing to a String cannot fail");
            } else {
                writeln!(out, "  {},", variant.ident).expect("writing to a String cannot fail");
            }
        } else {
            writeln!(
                out,
                "  {} = {:?},",
                variant.ident,
                lower_camel_from_upper_camel(&variant.ident.to_string())
            )
            .expect("writing to a String cannot fail");
        }
    }
    out.push_str("}\n");
    return Ok(());
}

fn path_owner_and_member(path: &syn::Path) -> Option<(String, String)> {
    let mut segments = path.segments.iter().rev();
    let member = segments.next()?.ident.to_string();
    let owner = segments.next()?.ident.to_string();
    return Some((owner, member));
}

fn associated_owner_and_member(expression: &Expr) -> Option<(String, String)> {
    let Expr::Path(path) = expression else {
        return None;
    };
    return path_owner_and_member(&path.path);
}

fn data_union_variant_categories(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> Option<BTreeSet<RuntimeCategory>> {
    let prefix = format!("{DATA_UNION_VARIANT_MARKER}{owner}:{variant}:");
    let categories = entities
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix))?;
    return categories
        .split(',')
        .map(RuntimeCategory::parse)
        .collect::<Option<BTreeSet<_>>>();
}

fn reserved_key_data_union_variant_keys(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> Option<BTreeSet<String>> {
    let prefix = format!("{RESERVED_KEY_DATA_UNION_VARIANT_MARKER}{owner}:{variant}:");
    let keys = entities
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix))?;
    return Some(
        keys.split(',')
            .filter(|key| !key.is_empty())
            .map(str::to_string)
            .collect(),
    );
}

fn reserved_key_data_union_variant_type(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> Option<String> {
    let prefix = format!("{RESERVED_KEY_DATA_UNION_VARIANT_TYPE_MARKER}{owner}:{variant}:");
    return entities
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix).map(str::to_string));
}

fn reserved_key_data_union_variants(
    entities: &HashSet<String>,
    owner: &str,
) -> BTreeMap<String, BTreeSet<String>> {
    let prefix = format!("{RESERVED_KEY_DATA_UNION_VARIANT_MARKER}{owner}:");
    return entities
        .iter()
        .filter_map(|marker| {
            let remainder = marker.strip_prefix(&prefix)?;
            let (variant, keys) = remainder.split_once(':')?;
            Some((
                variant.to_string(),
                keys.split(',')
                    .filter(|key| !key.is_empty())
                    .map(str::to_string)
                    .collect(),
            ))
        })
        .collect();
}

pub(crate) fn is_transparent_data_union_variant(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> bool {
    return data_union_variant_categories(entities, owner, variant).is_some();
}

fn is_tagged_data_union_variant(entities: &HashSet<String>, owner: &str, variant: &str) -> bool {
    return entities.contains(&format!(
        "{TAGGED_DATA_UNION_VARIANT_MARKER}{owner}:{variant}"
    ));
}

fn tagged_data_union_variants(entities: &HashSet<String>, owner: &str) -> BTreeSet<String> {
    let prefix = format!("{TAGGED_DATA_UNION_VARIANT_MARKER}{owner}:");
    return entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(&prefix).map(str::to_string))
        .collect();
}

pub(crate) fn is_data_union_variant(
    entities: &HashSet<String>,
    owner: &str,
    variant: &str,
) -> bool {
    return is_transparent_data_union_variant(entities, owner, variant)
        || is_tagged_data_union_variant(entities, owner, variant);
}

fn data_union_expression_variant(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<(String, String, BTreeSet<RuntimeCategory>)> {
    let (owner, variant) = associated_owner_and_member(expression)?;
    let categories = data_union_variant_categories(entities, &owner, &variant)?;
    return Some((owner, variant, categories));
}

fn data_union_unit(entities: &HashSet<String>, owner: &str, variant: &str) -> bool {
    return entities.contains(&format!("{DATA_UNION_UNIT_MARKER}{owner}:{variant}"));
}

// Emits `expression`. In emitted production code a per-item nullable `Option` (`T | null`) exists
// only at its declaration boundary: a call to a `nullable-option` function or a read of a nullable
// field is normalized to the ordinary absent form here (`?? undefined`, which keeps `false`, `0` and
// `""`), so every other flow (bindings, arguments, ordinary returns and fields, `Option` methods)
// sees one representation; nullable returns, fields and defaults convert back with `?? null`.
pub(crate) fn emit_expression(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let value = emit_expression_value(expression, entities)?;
    if current_source(entities).is_some()
        && !entities.contains(NULLABLE_OPTIONS_MARKER)
        && (expression_is_nullable_option_return(expression, entities)
            || expression_is_nullable_option_field(expression, entities))
    {
        return Ok(format!("(({value}) ?? undefined)"));
    }
    return Ok(value);
}

fn emit_expression_value(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return match expression {
        Expr::Array(array) => {
            let elements = array
                .elems
                .iter()
                .map(|element| emit_expression(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Expr::Assign(assign) => {
            if let Expr::Field(field) = assign.left.as_ref()
                && let Some(store) = entity_runtime_state_access(field, entities)?
            {
                return Ok(format!(
                    "{store}.set({}, {})",
                    emit_expression(&field.base, entities)?,
                    emit_expression(&assign.right, entities)?
                ));
            }
            if current_source(entities).is_some()
                && !entities.contains(NULLABLE_OPTIONS_MARKER)
                && expression_is_nullable_option_field(&assign.left, entities)
            {
                let right_context = contextual_assignment_field_context(assign, entities);
                return Ok(format!(
                    "{} = {}",
                    emit_expression_value(&assign.left, entities)?,
                    nullable_option_value(
                        &assign.right,
                        emit_expression(&assign.right, &right_context)?
                    )
                ));
            }
            let left = if let Expr::Unary(unary) = assign.left.as_ref()
                && matches!(unary.op, UnOp::Deref(_))
            {
                let operand = emit_expression(&unary.expr, entities)?;
                let direct_guard = referenced_path_identifier(&unary.expr)
                    .and_then(|name| lexical_binding(entities, &name))
                    .filter(|id| {
                        entities.contains(&format!("{DIRECT_LOCK_GUARD_BINDING_MARKER}{id}"))
                    });
                let direct_receiver = direct_lock_guard_receiver(&unary.expr);
                let reference_parameter = referenced_path_identifier(&unary.expr)
                    .and_then(|name| lexical_binding(entities, &name))
                    .is_some_and(|id| {
                        entities.contains(&format!("{REFERENCE_PARAMETER_BINDING_MARKER}{id}"))
                    });
                if let Some(id) = &direct_guard
                    && let Some(target) = direct_lock_guard_target(entities, id)?
                {
                    emit_expression(&target, entities)?
                } else if let Some(receiver) = direct_receiver
                    && let Some(target) = ref_alias_target(entities, receiver)?
                {
                    emit_expression(&target, entities)?
                } else if direct_guard.is_some()
                    || reference_parameter
                    || expression_contains_method(&unary.expr, "read")
                    || expression_contains_method(&unary.expr, "write")
                    || operand.ends_with(".value")
                {
                    operand
                } else {
                    format!("{operand}.value")
                }
            } else {
                emit_expression(&assign.left, entities)?
            };
            let left = left.strip_suffix('!').unwrap_or(&left);
            let right_context = contextual_assignment_field_context(assign, entities);
            Ok(format!(
                "{left} = {}",
                emit_expression(&assign.right, &right_context)?
            ))
        }
        Expr::Binary(binary) => {
            let precedence = binary_precedence(&binary.op);
            if binary_is_assignment(&binary.op)
                && let Expr::Unary(unary) = binary.left.as_ref()
                && matches!(unary.op, UnOp::Deref(_))
                && let Some(target) = direct_lock_assignment_target(entities, &unary.expr)?
            {
                return Ok(format!(
                    "{} {} {}",
                    emit_expression(&target, entities)?,
                    emit_binary_operator(&binary.op)?,
                    emit_binary_operand(&binary.right, entities, precedence, true)?
                ));
            }
            if let Some(comparison) = emit_inclusive_comparison(binary, entities)? {
                return Ok(comparison);
            }
            if matches!(binary.op, BinOp::Eq(_) | BinOp::Ne(_))
                && let Some((left, right)) = float_bit_comparison(binary, entities)?
            {
                let comparison = format!("Object.is({left}, {right})");
                return if matches!(binary.op, BinOp::Ne(_)) {
                    Ok(format!("!{comparison}"))
                } else {
                    Ok(comparison)
                };
            }
            if matches!(binary.op, BinOp::Eq(_) | BinOp::Ne(_))
                && let Some(comparison) = emit_ordering_variant_comparison(binary, entities)?
            {
                return Ok(comparison);
            }
            if matches!(binary.op, BinOp::Div(_)) && expression_is_method(&binary.left, "len") {
                return Ok(format!(
                    "Math.trunc({} / {})",
                    emit_expression(&binary.left, entities)?,
                    emit_expression(&binary.right, entities)?
                ));
            }
            if matches!(binary.op, BinOp::BitXor(_)) {
                return Ok(format!(
                    "({} ^ {}) >>> 0",
                    emit_binary_operand(&binary.left, entities, precedence, false)?,
                    emit_binary_operand(&binary.right, entities, precedence, true)?
                ));
            }
            if matches!(binary.op, BinOp::BitXorAssign(_)) {
                let left = emit_expression(&binary.left, entities)?;
                return Ok(format!(
                    "{left} = ({left} ^ {}) >>> 0",
                    emit_expression(&binary.right, entities)?
                ));
            }
            if matches!(binary.op, BinOp::Shr(_) | BinOp::ShrAssign(_))
                && referenced_path_identifier(&binary.left).is_some_and(|identifier| {
                    entities.contains(&format!("{UNSIGNED_INTEGER_LOCAL_MARKER}{identifier}"))
                })
            {
                let operator = if matches!(binary.op, BinOp::ShrAssign(_)) {
                    ">>>="
                } else {
                    ">>>"
                };
                return Ok(format!(
                    "{} {operator} {}",
                    emit_binary_operand(&binary.left, entities, precedence, false)?,
                    emit_binary_operand(&binary.right, entities, precedence, true)?
                ));
            }
            Ok(format!(
                "{} {} {}",
                emit_binary_operand(&binary.left, entities, precedence, false)?,
                emit_binary_operator(&binary.op)?,
                emit_binary_operand(&binary.right, entities, precedence, true)?
            ))
        }
        Expr::Block(block) => emit_block_expression(&block.block, entities),
        Expr::Call(call) => {
            if expression_is_path(&call.func, "drop") && call.args.len() == 1 {
                return Ok(format!(
                    "void {}",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if let Some(kind) = hash_collection_construction(expression, entities) {
                return Ok(match kind {
                    BindingFact::HashMap => "new Map()".to_string(),
                    _ => "new Set()".to_string(),
                });
            }
            if let Some(name) = std_mem_function(&call.func, entities) {
                return match name.as_str() {
                    "replace" if call.args.len() == 2 => {
                        let target = emit_expression(&call.args[0], entities)?;
                        let replacement = emit_expression(&call.args[1], entities)?;
                        Ok(format!(
                            "(() => {{ const __tmp = {target}; {target} = {replacement}; return __tmp; }})()"
                        ))
                    }
                    _ => Err(compile_error(format!(
                        "portable `std::mem::{name}` has no portable lowering"
                    ))),
                };
            }
            if let Some((owner, variant, _)) = data_union_expression_variant(&call.func, entities) {
                if data_union_unit(entities, &owner, &variant) || call.args.len() != 1 {
                    return Err(compile_error(format!(
                        "transparent data union constructor `{owner}::{variant}` expects exactly one payload"
                    )));
                }
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_path(&call.func, "Some") && call.args.len() == 1 {
                return emit_expression(&call.args[0], entities);
            }
            // `Ref<T>` is `Arc<RwLock<T>>` and lowers to `T`, so its constructor lowers to its argument.
            if (expression_is_associated_path(&call.func, "Arc", "new")
                || expression_is_associated_path(&call.func, "Ref", "new"))
                && call.args.len() == 1
            {
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "Arc", "clone") && call.args.len() == 1 {
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "Arc", "ptr_eq") && call.args.len() == 2 {
                // Both operands are `&Arc<T>` for one `T`, so proving either payload identity-bearing
                // proves the comparison.
                if !call
                    .args
                    .iter()
                    .any(|argument| expression_is_shared_identity(argument, entities))
                {
                    return Err(compile_error(
                        "portable `Arc::ptr_eq` needs an operand proven to hold an identity-bearing payload (a struct, collection, callable, `Mutex` cell or `dyn Any`); a primitive or unit payload lowers to its value, so `===` would compare values instead of allocations",
                    ));
                }
                return Ok(format!(
                    "{} === {}",
                    emit_expression(&call.args[0], entities)?,
                    emit_expression(&call.args[1], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "RwLock", "new") && call.args.len() == 1 {
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "String", "new") && call.args.is_empty() {
                return Ok("''".to_string());
            }
            if expression_is_associated_path(&call.func, "String", "from_utf16_lossy")
                && call.args.len() == 1
            {
                let units = emit_expression(&call.args[0], entities)?;
                return Ok(format!(
                    "((units: Readonly<number[]>): string => {{ let value = ''; for (let index = 0; index < units.length; index += 0x8000) value += String.fromCharCode(...units.slice(index, index + 0x8000)); return value; }})({units})"
                ));
            }
            if expression_is_associated_path(&call.func, "Vec", "new") && call.args.is_empty() {
                return Ok("[] as never[]".to_string());
            }
            // There is no runtime `Vec`; until the element type of a capacity construction can be
            // proven, it is rejected rather than emitted as a call to a missing global.
            if expression_is_associated_path(&call.func, "Vec", "with_capacity") {
                return Err(compile_error(
                    "portable `Vec::with_capacity` is not supported; declare the `Vec` with `Vec::new()`",
                ));
            }
            if expression_is_associated_path(&call.func, "Mutex", "new") && call.args.len() == 1 {
                return Ok(format!(
                    "{{ value: {} }}",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "Cell", "new") && call.args.len() == 1 {
                return Ok(format!(
                    "{{ value: {} }}",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_is_associated_path(&call.func, "AtomicU32", "new") && call.args.len() == 1
            {
                return Ok(format!(
                    "{{ value: {} >>> 0 }}",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if (expression_is_associated_path(&call.func, "f32", "from")
                || expression_is_associated_path(&call.func, "f64", "from"))
                && call.args.len() == 1
            {
                return emit_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "u32", "from_str_radix")
                && call.args.len() == 2
            {
                let digits = emit_expression(&call.args[0], entities)?;
                let radix = emit_expression(&call.args[1], entities)?;
                let absent = if entities.contains(NULLABLE_OPTIONS_MARKER) {
                    "null"
                } else {
                    "undefined"
                };
                return Ok(format!(
                    "((digits: string, radix: number): number | {absent} => {{ if (!Number.isInteger(radix) || radix < 2 || radix > 36 || digits.length === 0) return {absent}; let index = digits[0] === '+' ? 1 : 0; if (index === digits.length) return {absent}; let value = 0; for (; index < digits.length; index += 1) {{ const code = digits.charCodeAt(index); const digit = code >= 48 && code <= 57 ? code - 48 : code >= 65 && code <= 90 ? code - 55 : code >= 97 && code <= 122 ? code - 87 : radix; if (digit >= radix) return {absent}; value = value * radix + digit; if (value > 0xffffffff) return {absent}; }} return value; }})({digits}, {radix})"
                ));
            }
            if expression_is_associated_path(&call.func, "char", "from_u32") && call.args.len() == 1
            {
                let codepoint = emit_expression(&call.args[0], entities)?;
                let absent = if entities.contains(NULLABLE_OPTIONS_MARKER) {
                    "null"
                } else {
                    "undefined"
                };
                return Ok(format!(
                    "((codepoint: number): string | {absent} => Number.isInteger(codepoint) && codepoint >= 0 && codepoint <= 0x10ffff && (codepoint < 0xd800 || codepoint > 0xdfff) ? String.fromCodePoint(codepoint) : {absent})({codepoint})"
                ));
            }
            if expression_path_ends_with(&call.func, "throw_range_error") && call.args.len() == 1 {
                return Ok(format!(
                    "(() => {{ throw new RangeError({}); }})()",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            if expression_path_ends_with(&call.func, "throw_error") && call.args.len() == 1 {
                return Ok(format!(
                    "(() => {{ throw new Error({}); }})()",
                    emit_expression(&call.args[0], entities)?
                ));
            }
            let function = if let Expr::Path(path) = call.func.as_ref()
                && path.qself.is_none()
                && path.path.segments.len() > 1
                && path.path.segments.first().is_some_and(|segment| {
                    vitest_current_path_prefix(entities, &segment.ident.to_string()).is_some()
                }) {
                if is_vitest_crate_root_test_support_function(&path.path, entities) {
                    emit_expression(&call.func, entities)?
                } else {
                    let binding = vitest_function_path_binding_name(&path.path, entities)?
                        .ok_or_else(|| {
                            compile_error("current-package function path has no binding")
                        })?;
                    export_name(entities, &binding)
                        .map_or_else(|| emit_path_segment(&binding), str::to_string)
                }
            } else {
                emit_expression(&call.func, entities)?
            };
            let function_name = match call.func.as_ref() {
                Expr::Path(path) => path
                    .path
                    .segments
                    .last()
                    .map(|segment| segment.ident.to_string()),
                _ => None,
            };
            let arguments = call
                .args
                .iter()
                .enumerate()
                .map(|(index, argument)| {
                    if expression_is_none(argument) {
                        return Ok(
                            if function_name.as_ref().is_some_and(|function_name| {
                                entities.contains(&format!(
                                    "{NULLABLE_CALL_MARKER}{function_name}:{index}"
                                ))
                            }) {
                                "null".to_string()
                            } else {
                                "undefined".to_string()
                            },
                        );
                    }
                    emit_expression(argument, entities)
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("{function}({})", arguments.join(", ")))
        }
        Expr::Cast(cast) if type_is_named(&cast.ty, "u32") => Ok(format!(
            "({}) >>> 0",
            emit_expression(&cast.expr, entities)?
        )),
        Expr::Cast(cast) if type_is_named(&cast.ty, "i32") => {
            Ok(format!("({}) | 0", emit_expression(&cast.expr, entities)?))
        }
        Expr::Cast(cast) => emit_expression(&cast.expr, entities),
        Expr::Closure(closure) => emit_closure(closure, entities),
        Expr::Field(field) => {
            reject_unresolved_pattern_field(&field.base, entities)?;
            let base = emit_expression(&field.base, entities)?;
            if let Some(store) = entity_runtime_state_access(field, entities)? {
                return Ok(format!("{store}.get({base})!"));
            }
            match &field.member {
                syn::Member::Named(identifier) => Ok(format!(
                    "{base}.{}",
                    snake_to_lower_camel(&identifier.to_string())
                )),
                syn::Member::Unnamed(index) => Ok(format!("{base}[{}]", index.index)),
            }
        }
        Expr::Group(group) => emit_expression(&group.expr, entities),
        Expr::Index(index) => {
            let receiver = emit_expression(&index.expr, entities)?;
            if let Expr::Range(range) = index.index.as_ref() {
                // Rust bounds-checks range indexing while `.slice` clamps, and these two forms have no
                // valid `.slice` emission yet, so they are rejected until range slices are lowered
                // with Rust bounds.
                if matches!(range.limits, syn::RangeLimits::Closed(_)) {
                    return Err(compile_error(
                        "portable inclusive range index `a..=b` is not supported",
                    ));
                }
                if range.start.is_none() && range.end.is_some() {
                    return Err(compile_error(
                        "portable range index needs a start; write `0..end` instead of `..end`",
                    ));
                }
                let start = range
                    .start
                    .as_deref()
                    .map(|start| emit_expression(start, entities))
                    .transpose()?
                    .unwrap_or_default();
                let end = range
                    .end
                    .as_deref()
                    .map(|end| emit_expression(end, entities))
                    .transpose()?;
                return Ok(match end {
                    Some(end) => format!("{receiver}.slice({start}, {end})"),
                    None if start.is_empty() => format!("{receiver}.slice()"),
                    None => format!("{receiver}.slice({start})"),
                });
            }
            Ok(format!(
                "{receiver}[{}]",
                emit_expression(&index.index, entities)?
            ))
        }
        Expr::If(expression) => emit_if_expression(expression, entities),
        Expr::Lit(literal) => emit_literal(&literal.lit),
        Expr::Macro(expression) => emit_macro_expression(&expression.mac, entities),
        Expr::Match(expression) => emit_match_expression(expression, entities),
        Expr::MethodCall(call) => emit_method_call(call, entities),
        Expr::Paren(paren) => Ok(format!("({})", emit_expression(&paren.expr, entities)?)),
        Expr::Path(path) => {
            if path.qself.is_none()
                && path.path.segments.len() == 1
                && let Some(target) = ref_alias_target(entities, expression)?
            {
                return emit_expression(&target, entities);
            }
            if let Some((owner, variant)) = associated_owner_and_member(expression)
                && is_tagged_data_union_variant(entities, &owner, &variant)
            {
                if !data_union_unit(entities, &owner, &variant) {
                    return Err(compile_error(format!(
                        "tagged data union payload variant `{owner}::{variant}` needs named fields"
                    )));
                }
                return Ok(format!(
                    "{{ kind: {:?} as const }}",
                    lower_camel_from_upper_camel(&variant)
                ));
            }
            if let Some((owner, variant, _)) = data_union_expression_variant(expression, entities) {
                return if data_union_unit(entities, &owner, &variant) {
                    Ok("null".to_string())
                } else {
                    Ok("(value) => value".to_string())
                };
            }
            if let Some(value) = ordering_variant_value(&path.path) {
                return Ok(value.to_string());
            }
            if path.path.is_ident("None") {
                return Ok(if entities.contains(NULLABLE_OPTIONS_MARKER) {
                    "null".to_string()
                } else {
                    "undefined".to_string()
                });
            }
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1
                && let Some(name) =
                    frozen_object_name(entities, &path.path.segments[0].ident.to_string())
            {
                return Ok(name.to_string());
            }
            if (path.path.leading_colon.is_some() || path.path.segments.len() > 1)
                && let Some(last) = path.path.segments.last()
                && const_group_member_reference(entities, &last.ident.to_string()).is_some()
            {
                return Err(compile_error(format!(
                    "qualified `const-group` member path `{}` has no portable lowering; reference the member by its bare name",
                    quote::ToTokens::to_token_stream(&path.path)
                        .to_string()
                        .replace(' ', "")
                )));
            }
            if path.qself.is_none()
                && path.path.leading_colon.is_none()
                && path.path.segments.len() == 1
                && let Some(reference) =
                    const_group_member_reference(entities, &path.path.segments[0].ident.to_string())
            {
                return Ok(reference.to_string());
            }
            if expression_is_associated_path(expression, "f32", "min")
                || expression_is_associated_path(expression, "f64", "min")
            {
                return Ok("Math.min".to_string());
            }
            if expression_is_associated_path(expression, "f32", "max")
                || expression_is_associated_path(expression, "f64", "max")
            {
                return Ok("Math.max".to_string());
            }
            if path_is_float_constant(&path.path, "NAN") {
                return Ok("Number.NaN".to_string());
            }
            if path_is_float_constant(&path.path, "INFINITY") {
                return Ok("Number.POSITIVE_INFINITY".to_string());
            }
            if path_is_float_constant(&path.path, "EPSILON") {
                let rust_type = float_constant_type(&path.path).unwrap_or("f64");
                return if rust_type == "f32" {
                    Ok("Math.pow(2, -23)".to_string())
                } else {
                    Ok("Number.EPSILON".to_string())
                };
            }
            if path_is_float_constant(&path.path, "TAU") {
                return Ok("Math.PI * 2".to_string());
            }
            if path_is_float_constant(&path.path, "PI") {
                return Ok("Math.PI".to_string());
            }
            if path_is_float_constant(&path.path, "MAX") {
                return Ok("Number.MAX_VALUE".to_string());
            }
            if path_is_type_constant(&path.path, "u32", "MAX") {
                return Ok("0xffffffff".to_string());
            }
            if path_is_float_constant(&path.path, "MIN_POSITIVE") {
                return Ok("2.2250738585072014e-308".to_string());
            }
            if path_is_float_constant(&path.path, "NEG_INFINITY") {
                return Ok("Number.NEGATIVE_INFINITY".to_string());
            }
            if path_is_float_constant(&path.path, "FRAC_1_SQRT_2") {
                return Ok("Math.SQRT1_2".to_string());
            }
            let last = path.path.segments.len() - 1;
            let rendered = path
                .path
                .segments
                .iter()
                .enumerate()
                .map(|(index, segment)| {
                    let segment = segment.ident.to_string();
                    return (index == last)
                        .then(|| export_name(entities, &segment))
                        .flatten()
                        .map_or_else(|| emit_path_segment(&segment), str::to_string);
                })
                .collect::<Vec<_>>()
                .join(".");
            Ok(rendered)
        }
        Expr::Reference(reference) => emit_expression(&reference.expr, entities),
        Expr::Range(range) => {
            let Some(start) = &range.start else {
                return Err(compile_error("portable Rust range needs a start"));
            };
            let Some(end) = &range.end else {
                return Err(compile_error("portable Rust range needs an end"));
            };
            let start = emit_expression(start, entities)?;
            let end = emit_expression(end, entities)?;
            let inclusive = if matches!(range.limits, syn::RangeLimits::Closed(_)) {
                " + 1"
            } else {
                ""
            };
            Ok(format!(
                "Array.from({{ length: {end} - {start}{inclusive} }}, (_, index) => {start} + index)"
            ))
        }
        Expr::Repeat(repeat) => {
            let value = emit_expression(&repeat.expr, entities)?;
            let length = emit_expression(&repeat.len, entities)?;
            if let Some(array_type) = typed_array_for_literal(&repeat.expr) {
                return Ok(format!("new {array_type}({length}).fill({value})"));
            }
            Ok(format!("new Array({length}).fill({value})"))
        }
        Expr::Struct(structure) => {
            if let Some(owner) = structure
                .path
                .segments
                .last()
                .map(|segment| segment.ident.to_string())
                && entity_runtime_state_is_designated(entities, &owner)
            {
                return Err(compile_error(format!(
                    "a `{owner}` struct literal would expose its designated entity runtime state as a public property; allocate it with `allocate_entity` and assign the state field"
                )));
            }
            if let Some((owner, variant)) = path_owner_and_member(&structure.path)
                && is_tagged_data_union_variant(entities, &owner, &variant)
            {
                if data_union_unit(entities, &owner, &variant) {
                    return Err(compile_error(format!(
                        "tagged data union unit variant `{owner}::{variant}` cannot declare fields"
                    )));
                }
                if structure.rest.is_some() {
                    return Err(compile_error(
                        "tagged data union construction cannot use a struct update",
                    ));
                }
                let mut fields = vec![format!(
                    "kind: {:?} as const",
                    lower_camel_from_upper_camel(&variant)
                )];
                fields.extend(
                    structure
                        .fields
                        .iter()
                        .map(|field| {
                            Ok(format!(
                                "{}: {}",
                                emit_member(&field.member),
                                emit_expression(&field.expr, entities)?
                            ))
                        })
                        .collect::<Result<Vec<_>, CompileError>>()?,
                );
                return Ok(format!("{{ {} }}", fields.join(", ")));
            }
            // The literal's struct by canonical identity, so a same-named struct of another source
            // never lends its nullable designations.
            let structure_identity = context_type_identity(
                entities,
                &Type::Path(syn::TypePath {
                    qself: None,
                    path: structure.path.clone(),
                }),
            );
            let mut fields = Vec::new();
            if let Some(rest) = &structure.rest {
                fields.push(format!("...{}", emit_expression(rest, entities)?));
            }
            fields.extend(
                structure
                    .fields
                    .iter()
                    .map(|field| {
                        let mut value = if expression_is_empty_vec(&field.expr) {
                            "[]".to_string()
                        } else {
                            emit_expression(&field.expr, entities)?
                        };
                        if let syn::Member::Named(field_name) = &field.member
                            && let Some(identity) = &structure_identity
                            && is_nullable_literal_field(entities, identity, field_name)
                        {
                            value = nullable_option_value(&field.expr, value);
                        }
                        Ok(format!("{}: {value}", emit_member(&field.member)))
                    })
                    .collect::<Result<Vec<_>, CompileError>>()?,
            );
            Ok(format!("{{ {} }}", fields.join(", ")))
        }
        Expr::Tuple(tuple) if tuple.elems.is_empty() => Ok("undefined".to_string()),
        Expr::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| emit_expression(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Expr::Unary(unary) => emit_unary_expression(unary, entities),
        _ => Err(compile_error(format!(
            "unsupported Rust expression `{}`",
            expression_kind(expression)
        ))),
    };
}

fn emit_block_expression(
    block: &syn::Block,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let Some((last, preceding)) = block.stmts.split_last() else {
        return Err(compile_error("portable value block cannot be empty"));
    };
    reject_function_exits_in_value_position(
        |visitor| visitor.visit_block(block),
        "portable value block",
    )?;
    let Stmt::Expr(value, None) = last else {
        return Err(compile_error(
            "portable value block must end with an expression",
        ));
    };
    let mut out = "(() => {\n".to_string();
    let block_context = emit_block_with_context(&mut out, preceding, entities, 1)?;
    write_indent(&mut out, 1);
    writeln!(out, "return {};", emit_expression(value, &block_context)?)
        .expect("writing to a String cannot fail");
    out.push_str("})()");
    return Ok(out);
}

fn emit_expression_for_type(
    expression: &Expr,
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if let Expr::Reference(reference) = expression {
        return emit_expression_for_type(&reference.expr, rust_type, entities);
    }
    if matches!(expression, Expr::Struct(_)) && context_type_identity(entities, rust_type).is_some()
    {
        return emit_contextual_struct_literal_expression(expression, entities);
    }
    return match rust_type {
        Type::Array(array_type) => match expression {
            Expr::Array(array) => {
                let elements = array
                    .elems
                    .iter()
                    .map(|element| emit_expression_for_type(element, &array_type.elem, entities))
                    .collect::<Result<Vec<_>, _>>()?;
                let value = format!("[{}]", elements.join(", "));
                if let Some(array_type) = typed_array_for_type(&array_type.elem) {
                    Ok(format!("new {array_type}({value})"))
                } else {
                    Ok(value)
                }
            }
            Expr::Repeat(repeat) => {
                let value = emit_expression_for_type(&repeat.expr, &array_type.elem, entities)?;
                let length = emit_expression(&repeat.len, entities)?;
                if let Some(array_type) = typed_array_for_type(&array_type.elem) {
                    Ok(format!("new {array_type}({length}).fill({value})"))
                } else {
                    Ok(format!("new Array({length}).fill({value})"))
                }
            }
            _ => emit_expression(expression, entities),
        },
        Type::Paren(paren) => emit_expression_for_type(expression, &paren.elem, entities),
        Type::Reference(reference) => {
            emit_expression_for_type(expression, &reference.elem, entities)
        }
        Type::Slice(slice) => match expression {
            Expr::Array(array) => {
                let elements = array
                    .elems
                    .iter()
                    .map(|element| emit_expression_for_type(element, &slice.elem, entities))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(format!("[{}]", elements.join(", ")))
            }
            _ => emit_expression(expression, entities),
        },
        Type::Tuple(tuple_type) => match expression {
            Expr::Tuple(tuple) if tuple.elems.is_empty() && tuple_type.elems.is_empty() => {
                Ok("undefined".to_string())
            }
            Expr::Tuple(tuple) if tuple.elems.len() == tuple_type.elems.len() => {
                let elements = tuple
                    .elems
                    .iter()
                    .zip(&tuple_type.elems)
                    .map(|(element, element_type)| {
                        emit_expression_for_type(element, element_type, entities)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(format!("[{}]", elements.join(", ")))
            }
            Expr::Tuple(_) => Err(compile_error(
                "tuple initializer length does not match its Rust type",
            )),
            _ => emit_expression(expression, entities),
        },
        _ => emit_expression(expression, entities),
    };
}

fn emit_contextual_struct_literal_expression(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    match expression {
        Expr::Call(call) if call.args.len() == 1 => {
            if expression_is_associated_path(&call.func, "Arc", "new") {
                return emit_contextual_struct_literal_expression(&call.args[0], entities);
            }
            if expression_is_associated_path(&call.func, "Mutex", "new") {
                return Ok(format!(
                    "{{ value: {} }}",
                    emit_contextual_struct_literal_expression(&call.args[0], entities)?
                ));
            }
        }
        Expr::Group(group) => {
            return emit_contextual_struct_literal_expression(&group.expr, entities);
        }
        Expr::Paren(paren) => {
            return Ok(format!(
                "({})",
                emit_contextual_struct_literal_expression(&paren.expr, entities)?
            ));
        }
        Expr::Reference(reference) => {
            return emit_contextual_struct_literal_expression(&reference.expr, entities);
        }
        Expr::Struct(structure) if structure.qself.is_none() => {
            let Some(structure_name) = vitest_path_binding_name(&structure.path, entities)
                .filter(|name| is_vitest_struct(entities, name))
            else {
                return emit_expression(expression, entities);
            };
            let structure_identity = vitest_struct_owner(entities, &structure_name);
            let mut fields = Vec::new();
            if let Some(rest) = &structure.rest {
                fields.push(format!("...{}", emit_expression(rest, entities)?));
            }
            fields.extend(
                structure
                    .fields
                    .iter()
                    .map(|field| {
                        let value = if expression_is_empty_vec(&field.expr) {
                            "[]".to_string()
                        } else {
                            let field_context = contextual_struct_field_context(
                                entities,
                                &structure_name,
                                structure_identity.as_deref(),
                                &field.member,
                                &field.expr,
                            );
                            emit_expression(&field.expr, &field_context)?
                        };
                        // A `nullable-option` field of the literal's canonical struct stores `null`.
                        let literal_identity = context_type_identity(
                            entities,
                            &Type::Path(syn::TypePath {
                                qself: None,
                                path: structure.path.clone(),
                            }),
                        );
                        let value = if let syn::Member::Named(field_name) = &field.member
                            && let Some(identity) = literal_identity
                            && is_nullable_literal_field(entities, &identity, field_name)
                        {
                            nullable_option_value(&field.expr, value)
                        } else {
                            value
                        };
                        Ok(format!("{}: {value}", emit_member(&field.member)))
                    })
                    .collect::<Result<Vec<_>, CompileError>>()?,
            );
            return Ok(format!("{{ {} }}", fields.join(", ")));
        }
        _ => {}
    }
    return emit_expression(expression, entities);
}

fn contextual_struct_field_context(
    entities: &HashSet<String>,
    structure: &str,
    structure_identity: Option<&str>,
    member: &syn::Member,
    expression: &Expr,
) -> HashSet<String> {
    let mut context = entities.clone();
    if let Some(structure_identity) = structure_identity
        && let syn::Member::Named(field) = member
        && context.contains(&format!(
            "{NULLABLE_OPTION_FIELD_MARKER}{structure_identity}{PROVENANCE_SEPARATOR}{field}"
        ))
    {
        context.insert(NULLABLE_OPTIONS_MARKER.to_string());
    }
    let Some(closure) = contextual_field_closure(expression) else {
        return context;
    };
    let field = emit_member(member);
    for (index, pattern) in closure.inputs.iter().enumerate() {
        let Some(parameter) = closure_parameter_identifier(pattern) else {
            continue;
        };
        let prefix = format!("{VITEST_STRUCT_VEC_CALLBACK_MARKER}{structure}:{field}:{index}:");
        let markers = context
            .iter()
            .filter_map(|marker| marker.strip_prefix(&prefix))
            .map(|optional| {
                format!(
                    "{VEC_CLONE_EXPRESSION_MARKER}{}:{optional}",
                    snake_to_lower_camel(&parameter)
                )
            })
            .collect::<Vec<_>>();
        context.extend(markers);
    }
    return context;
}

fn contextual_assignment_field_context(
    assignment: &syn::ExprAssign,
    entities: &HashSet<String>,
) -> HashSet<String> {
    let Expr::Field(field) = assignment.left.as_ref() else {
        return entities.clone();
    };
    let Some(identity) = expression_struct_name(&field.base, entities).or_else(|| {
        referenced_path_identifier(&field.base)
            .and_then(|local| vitest_struct_local(entities, &local))
    }) else {
        return entities.clone();
    };
    let Some(structure) = vitest_struct_name(&identity) else {
        return entities.clone();
    };
    return contextual_struct_field_context(
        entities,
        structure,
        Some(&identity),
        &field.member,
        &assignment.right,
    );
}

fn contextual_field_closure(expression: &Expr) -> Option<&syn::ExprClosure> {
    return match expression {
        Expr::Call(call)
            if call.args.len() == 1
                && (expression_is_associated_path(&call.func, "Arc", "new")
                    || expression_is_associated_path(&call.func, "Box", "new")) =>
        {
            contextual_field_closure(&call.args[0])
        }
        Expr::Call(call) if call.args.len() == 1 && expression_is_path(&call.func, "Some") => {
            contextual_field_closure(&call.args[0])
        }
        Expr::Closure(closure) => Some(closure),
        Expr::Group(group) => contextual_field_closure(&group.expr),
        Expr::Paren(paren) => contextual_field_closure(&paren.expr),
        Expr::Reference(reference) => contextual_field_closure(&reference.expr),
        _ => None,
    };
}

fn closure_parameter_identifier(pattern: &Pat) -> Option<String> {
    return match pattern {
        Pat::Ident(identifier) => Some(identifier.ident.to_string()),
        Pat::Reference(reference) => closure_parameter_identifier(&reference.pat),
        Pat::Type(typed) => closure_parameter_identifier(&typed.pat),
        _ => None,
    };
}

fn expression_is_empty_vec(expression: &Expr) -> bool {
    return match expression {
        Expr::Call(call) => {
            call.args.is_empty() && expression_is_associated_path(&call.func, "Vec", "new")
        }
        Expr::Group(group) => expression_is_empty_vec(&group.expr),
        Expr::Paren(paren) => expression_is_empty_vec(&paren.expr),
        _ => false,
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

pub(crate) fn emit_for_header(
    pattern: &Pat,
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let pattern = emit_pattern(pattern)?;
    if let Expr::Range(range) = expression {
        let Some(start) = &range.start else {
            return Err(compile_error("portable Rust range needs a start"));
        };
        let Some(end) = &range.end else {
            return Err(compile_error("portable Rust range needs an end"));
        };
        let start = emit_expression(start, entities)?;
        let end = emit_expression(end, entities)?;
        let comparison = match range.limits {
            syn::RangeLimits::HalfOpen(_) => "<",
            syn::RangeLimits::Closed(_) => "<=",
        };
        return Ok(format!(
            "let {pattern} = {start}; {pattern} {comparison} {end}; {pattern} += 1"
        ));
    }
    let mut iterable = emit_expression(expression, entities)?;
    if let Expr::Array(array) = expression
        && !array.elems.is_empty()
        && array
            .elems
            .iter()
            .all(|element| matches!(element, Expr::Tuple(_)))
    {
        // TypeScript otherwise widens heterogeneous tuple literals into arrays of unions before
        // destructuring them. A Rust array of tuples has fixed positional types, so retain those
        // facts for the loop binding with a const assertion.
        iterable = format!("{iterable} as const");
    }
    return Ok(format!("const {pattern} of {iterable}"));
}

fn emit_function(
    out: &mut String,
    function: &ItemFn,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_static_names: &HashSet<String>,
    entity_construction_parameter: bool,
) -> Result<(), CompileError> {
    reject_async_function(function)?;
    emit_documentation(out, &function.attrs, 0);
    let export = if is_visible_outside_module(&function.vis) {
        "export "
    } else {
        ""
    };
    let rust_name = function.sig.ident.to_string();
    let name = export_name(entities, &rust_name)
        .map_or_else(|| snake_to_lower_camel(&rust_name), str::to_string);
    let type_parameters = emit_type_parameters(&function.sig.generics);
    let mut signature_context = entities.clone();
    insert_type_parameter_context(&mut signature_context, &function.sig.generics);
    let nullable_options = signature_context.contains(NULLABLE_OPTIONS_MARKER);
    let trailing_optional_start = function
        .sig
        .inputs
        .iter()
        .rposition(|argument| {
            !argument_is_option(argument)
                || argument_is_nullable_guard(function, argument)
                || nullable_options
        })
        .map_or(0, |index| index + 1);
    let parameters = function
        .sig
        .inputs
        .iter()
        .enumerate()
        .map(|(index, argument)| {
            if let Some(parameter) = array_like_parameter(function, argument, entities)? {
                return Ok(parameter);
            }
            emit_parameter_with_aliases(
                argument,
                &signature_context,
                aliases,
                index >= trailing_optional_start
                    && !argument_is_nullable_guard(function, argument)
                    && !nullable_options,
                argument_is_nullable_guard(function, argument)
                    || (nullable_options && argument_is_option(argument)),
                entity_construction_parameter && index == 0,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    let nullable_return = current_source(entities).is_some_and(|module| {
        entities.contains(&format!(
            "{NULLABLE_OPTION_RETURN_MARKER}{module}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}",
            function.sig.ident
        ))
    }) && !entities.contains(NULLABLE_OPTIONS_MARKER);
    let return_type = match &function.sig.output {
        ReturnType::Default => "void".to_string(),
        ReturnType::Type(_, rust_type) if nullable_return => nullable_type(emit_preferred_type(
            option_inner_type(rust_type).expect("nullable-option returns were validated"),
            &signature_context,
            aliases,
        )?),
        ReturnType::Type(_, rust_type) => {
            emit_preferred_type(rust_type, &signature_context, aliases)?
        }
    };
    writeln!(
        out,
        "{export}function {name}{type_parameters}({}): {return_type} {{",
        parameters.join(", ")
    )
    .expect("writing to a String cannot fail");
    let mut function_context = signature_context;
    for argument in &function.sig.inputs {
        if (argument_is_nullable_guard(function, argument)
            || (nullable_options && argument_is_option(argument)))
            && let FnArg::Typed(argument) = argument
            && let Pat::Ident(pattern) = argument.pat.as_ref()
        {
            function_context.insert(format!("{NULLABLE_BINDING_MARKER}{}", pattern.ident));
        }
    }
    struct NullableLocalCollector<'a> {
        names: HashSet<String>,
        nullable_static_names: &'a HashSet<String>,
    }

    impl<'ast> syn::visit::Visit<'ast> for NullableLocalCollector<'_> {
        fn visit_local(&mut self, local: &'ast syn::Local) {
            if let Some(initializer) = &local.init
                && (self
                    .nullable_static_names
                    .iter()
                    .any(|name| expression_contains_identifier(&initializer.expr, name)))
                && let Some(name) = local_pattern_name(&local.pat)
            {
                self.names.insert(name);
            }
            syn::visit::visit_local(self, local);
        }
    }

    let mut nullable_locals = NullableLocalCollector {
        names: HashSet::new(),
        nullable_static_names,
    };
    syn::visit::Visit::visit_block(&mut nullable_locals, &function.block);
    for name in nullable_locals.names {
        function_context.insert(format!("{NULLABLE_BINDING_MARKER}{name}"));
    }
    let mut function_context = function_expression_context(function, &function_context);
    function_context.insert(format!("{RETURN_TYPE_MARKER}{return_type}"));
    if matches!(&function.sig.output, ReturnType::Type(_, rust_type) if type_is_named(rust_type, "u32"))
    {
        function_context.insert(RETURNS_U32_MARKER.to_string());
    }
    if nullable_return {
        function_context.insert(RETURNS_NULLABLE_MARKER.to_string());
    }
    if let ReturnType::Type(_, rust_type) = &function.sig.output
        && let Type::Array(array) = rust_type.as_ref()
        && let Some(array_type) = typed_array_for_type(&array.elem)
    {
        function_context.insert(format!("{RETURNS_TYPED_ARRAY_MARKER}{array_type}"));
    }
    emit_block(out, &function.block.stmts, &function_context, 1)?;
    out.push_str("}\n");
    return Ok(());
}

fn emit_function_trait_type(
    bounds: &syn::punctuated::Punctuated<syn::TypeParamBound, syn::token::Plus>,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return emit_function_trait_type_with_parameter_names(bounds, entities, None);
}

fn emit_callable_parameters(
    parameter_types: &[&Type],
    entities: &HashSet<String>,
    parameter_names: Option<&[String]>,
) -> Result<Vec<String>, CompileError> {
    if let Some(parameter_names) = parameter_names
        && parameter_names.len() != parameter_types.len()
    {
        return Err(compile_error(
            "callable parameter name count changed after directive validation",
        ));
    }
    let trailing_optional_start = if entities.contains(NULLABLE_OPTIONS_MARKER) {
        parameter_types.len()
    } else {
        parameter_types
            .iter()
            .rposition(|rust_type| option_inner_type(rust_type).is_none())
            .map_or(0, |index| index + 1)
    };
    return parameter_types
        .iter()
        .enumerate()
        .map(|(index, rust_type)| {
            let name = parameter_names
                .and_then(|parameter_names| parameter_names.get(index))
                .cloned()
                .unwrap_or_else(|| format!("arg{index}"));
            if index >= trailing_optional_start {
                let inner = option_inner_type(rust_type).ok_or_else(|| {
                    compile_error("only trailing Option callable parameters can be optional")
                })?;
                return Ok(format!("{name}?: {}", emit_type(inner, entities)?));
            }
            return Ok(format!("{name}: {}", emit_type(rust_type, entities)?));
        })
        .collect();
}

fn emit_function_trait_type_with_parameter_names(
    bounds: &syn::punctuated::Punctuated<syn::TypeParamBound, syn::token::Plus>,
    entities: &HashSet<String>,
    parameter_names: Option<&[String]>,
) -> Result<String, CompileError> {
    if trait_object_is_standard_any(bounds, entities) {
        return Ok("object".to_string());
    }
    for bound in bounds {
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
            return Err(compile_error(
                "Rust function trait needs parenthesized arguments",
            ));
        };
        let parameter_types = arguments.inputs.iter().collect::<Vec<_>>();
        let parameters = emit_callable_parameters(&parameter_types, entities, parameter_names)?;
        let output = match &arguments.output {
            ReturnType::Default => "void".to_string(),
            ReturnType::Type(_, rust_type) => emit_type(rust_type, entities)?,
        };
        return Ok(format!("({}) => {output}", parameters.join(", ")));
    }
    return Err(compile_error(
        "unsupported Rust trait object; only callable traits are portable",
    ));
}

fn emit_if_expression(
    expression: &syn::ExprIf,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let condition = emit_expression(&expression.cond, entities)?;
    let then_value = emit_single_expression_block(&expression.then_branch, entities)?;
    let Some((_, otherwise)) = &expression.else_branch else {
        return Err(compile_error(
            "Rust if expression used as a value needs an else branch",
        ));
    };
    let otherwise = match otherwise.as_ref() {
        Expr::Block(block) => emit_single_expression_block(&block.block, entities)?,
        Expr::If(nested) => emit_if_expression(nested, entities)?,
        _ => {
            return Err(compile_error(
                "unsupported non-block else branch in Rust if expression",
            ));
        }
    };
    return Ok(format!("{condition} ? {then_value} : {otherwise}"));
}

fn emit_inclusive_comparison(
    binary: &syn::ExprBinary,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    if !matches!(binary.op, BinOp::Or(_)) {
        return Ok(None);
    }
    let (Expr::Binary(left), Expr::Binary(right)) = (binary.left.as_ref(), binary.right.as_ref())
    else {
        return Ok(None);
    };
    let (strict, equal) = if matches!(left.op, BinOp::Gt(_) | BinOp::Lt(_))
        && matches!(right.op, BinOp::Eq(_))
    {
        (left, right)
    } else if matches!(right.op, BinOp::Gt(_) | BinOp::Lt(_)) && matches!(left.op, BinOp::Eq(_)) {
        (right, left)
    } else {
        return Ok(None);
    };
    let strict_left = emit_expression(&strict.left, entities)?;
    let strict_right = emit_expression(&strict.right, entities)?;
    let equal_left = emit_expression(&equal.left, entities)?;
    let equal_right = emit_expression(&equal.right, entities)?;
    if !((strict_left == equal_left && strict_right == equal_right)
        || (strict_left == equal_right && strict_right == equal_left))
    {
        return Ok(None);
    }
    let operator = if matches!(strict.op, BinOp::Gt(_)) {
        ">="
    } else {
        "<="
    };
    return Ok(Some(format!("{strict_left} {operator} {strict_right}")));
}

fn emit_literal(literal: &Lit) -> Result<String, CompileError> {
    return match literal {
        Lit::Bool(value) => Ok(value.value.to_string()),
        Lit::Byte(value) => Ok(value.value().to_string()),
        Lit::ByteStr(value) => Ok(format!("new Uint8Array({:?})", value.value())),
        Lit::Char(value) => Ok(format!("{:?}", value.value().to_string())),
        Lit::Float(value) => Ok(numeric_literal_spelling(&value.to_string(), value.suffix())),
        Lit::Int(value) => Ok(numeric_literal_spelling(&value.to_string(), value.suffix())),
        Lit::Str(value) => Ok(format!("{:?}", value.value())),
        _ => Err(compile_error("unsupported Rust literal")),
    };
}

// An `Ordering` is lowered to a number whose sign is the ordering (`.partial_cmp()` yields a
// difference), so equality against a variant compares signs rather than exact values.
fn emit_ordering_variant_comparison(
    binary: &syn::ExprBinary,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    let (ordering, variant) = match (binary.left.as_ref(), binary.right.as_ref()) {
        (ordering, Expr::Path(path)) if ordering_variant_value(&path.path).is_some() => {
            (ordering, ordering_variant_value(&path.path))
        }
        (Expr::Path(path), ordering) if ordering_variant_value(&path.path).is_some() => {
            (ordering, ordering_variant_value(&path.path))
        }
        _ => return Ok(None),
    };
    let variant = variant.expect("guarded by the match arm");
    let operator = if matches!(binary.op, BinOp::Ne(_)) {
        "!=="
    } else {
        "==="
    };
    return Ok(Some(format!(
        "Math.sign({}) {operator} {variant}",
        emit_expression(ordering, entities)?
    )));
}

pub(crate) fn numeric_literal_spelling(spelling: &str, suffix: &str) -> String {
    if suffix.is_empty() {
        return spelling.to_string();
    }
    return spelling
        .strip_suffix(suffix)
        .unwrap_or(spelling)
        .trim_end_matches('_')
        .to_string();
}

pub(crate) fn emit_local(
    out: &mut String,
    local: &syn::Local,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    return emit_local_with_shadow(out, local, entities, indent, false, false);
}

pub(crate) fn emit_local_with_shadow(
    out: &mut String,
    local: &syn::Local,
    entities: &HashSet<String>,
    indent: usize,
    shadowed: bool,
    rebound: bool,
) -> Result<(), CompileError> {
    return emit_local_with_shadow_and_else(
        out, entities, local, indent, shadowed, rebound, emit_block,
    );
}

pub(crate) fn emit_local_with_shadow_and_else(
    out: &mut String,
    entities: &HashSet<String>,
    local: &syn::Local,
    indent: usize,
    shadowed: bool,
    rebound: bool,
    emit_else_block: fn(&mut String, &[Stmt], &HashSet<String>, usize) -> Result<(), CompileError>,
) -> Result<(), CompileError> {
    if local
        .init
        .as_ref()
        .is_some_and(|init| init.diverge.is_some())
    {
        return emit_let_else_local(
            out,
            local,
            entities,
            indent,
            shadowed,
            rebound,
            emit_else_block,
        );
    }
    let mutable = pattern_is_mutable(&local.pat);
    let (pattern, rust_type, discard) = match &local.pat {
        Pat::Ident(_) | Pat::Reference(_) | Pat::Tuple(_) => {
            (emit_pattern(&local.pat)?, None, false)
        }
        Pat::Type(typed) => {
            let pattern = emit_pattern(&typed.pat)?;
            (pattern, Some(typed.ty.as_ref()), false)
        }
        Pat::Wild(_) => ("_".to_string(), None, true),
        _ => {
            return Err(compile_error("unsupported destructuring in local binding"));
        }
    };
    let Some(initializer) = &local.init else {
        write_indent(out, indent);
        write!(out, "let {pattern}").expect("writing to a String cannot fail");
        if let Some(rust_type) = rust_type {
            write!(out, ": {}", emit_type(rust_type, entities)?)
                .expect("writing to a String cannot fail");
        }
        out.push_str(";\n");
        return Ok(());
    };
    let local_name = local_pattern_name(&local.pat);
    let local_binding_id = local_pattern_binding_id(entities, &local.pat);
    let ref_alias_receiver_capture = local_binding_id
        .as_deref()
        .map(|id| ref_alias_receiver_capture(entities, id))
        .transpose()?
        .flatten();
    let ref_alias_target = local_binding_id
        .as_deref()
        .map(|id| ref_alias_target_for_id(entities, id))
        .transpose()?
        .flatten();
    if local_name
        .as_deref()
        .is_some_and(|name| name.starts_with('_'))
        && ref_alias_receiver_capture.is_none()
        && local_binding_id.as_deref().is_some_and(|id| {
            entities.iter().any(|marker| {
                marker.starts_with(&format!(
                    "{REF_ALIAS_TARGET_MARKER}{id}{PROVENANCE_SEPARATOR}"
                ))
            })
        })
    {
        // A leading-underscore Ref alias is an implementation-only capture for writes through the
        // original field. Those writes resolve through its BindingId; emitting the snapshot local
        // would be both unused and semantically misleading in TypeScript.
        return Ok(());
    }
    let inferred_struct_type = if rust_type.is_none() {
        inferred_vitest_struct_literal_type(&initializer.expr, entities)
    } else {
        None
    };
    let inferred_option_type = if rust_type.is_none() {
        inferred_vitest_option_initializer_type(&initializer.expr, entities)
    } else {
        None
    };
    let rebound_struct_type = (rebound && !shadowed)
        .then(|| {
            unique_marker_suffix(
                entities,
                &format!(
                    "{VITEST_REBOUND_TYPE_MARKER}{}{PROVENANCE_SEPARATOR}",
                    local_name.as_deref()?
                ),
            )
        })
        .flatten();
    let typescript_type = rust_type
        .map(|rust_type| emit_type(rust_type, entities))
        .transpose()?
        .or_else(|| {
            local_name
                .as_deref()
                .and_then(|name| inferred_fixed_buffer_type(entities, name))
        })
        .or_else(|| inferred_struct_type.clone())
        .or_else(|| inferred_option_type.clone())
        .or_else(|| rebound_struct_type.clone());
    // A mutable binding keeps its string-union type: TypeScript widens a `let` initialized from a
    // string literal to `string`, which a later write or a typed read would then reject.
    let string_union_type = match typescript_type {
        None if mutable => expression_string_union_owner(&initializer.expr, entities)
            .and_then(|owner| syn::parse_str::<Type>(&owner).ok())
            .map(|owner| emit_type(&owner, entities))
            .transpose()?,
        _ => None,
    };
    let typescript_type = typescript_type.or_else(|| string_union_type.clone());
    let closure_parameter_types = local_name
        .as_deref()
        .map(|name| closure_parameter_types(entities, name))
        .unwrap_or_default();
    if let Some((stable, capture)) = &ref_alias_receiver_capture {
        write_indent(out, indent);
        writeln!(
            out,
            "const {} = {};",
            snake_to_lower_camel(stable),
            emit_expression(capture, entities)?
        )
        .expect("writing to a String cannot fail");
    }
    let mut value = if local_binding_id
        .as_deref()
        .is_some_and(|id| entities.contains(&format!("{MUTEX_GUARD_BINDING_MARKER}{id}")))
        && let Some(receiver) = mutex_guard_receiver(&initializer.expr)
    {
        emit_expression(receiver, entities)?
    } else if let Some(target) = &ref_alias_target {
        emit_expression(target, entities)?
    } else if expression_is_path_call(&initializer.expr, "allocate_entity") {
        let Some(typescript_type) = &typescript_type else {
            return Err(compile_error(
                "allocate_entity local needs an explicit Rust type",
            ));
        };
        entity_allocation(typescript_type, entities)?
    } else if let Some(rust_type) = rust_type {
        emit_expression_for_type(&initializer.expr, rust_type, entities)?
    } else if inferred_struct_type.is_some() {
        emit_contextual_struct_literal_expression(&initializer.expr, entities)?
    } else if let Expr::Repeat(repeat) = initializer.expr.as_ref()
        && let Some(array_type) = typescript_type
            .as_deref()
            .filter(|typescript_type| typescript_type.ends_with("Array"))
    {
        format!(
            "new {array_type}({}).fill({})",
            emit_expression(&repeat.len, entities)?,
            emit_expression(&repeat.expr, entities)?
        )
    } else if let Expr::Closure(closure) = initializer.expr.as_ref() {
        emit_closure_with_parameter_types(closure, entities, &closure_parameter_types)?
    } else {
        emit_expression(&initializer.expr, entities)?
    };
    if !mutable
        && rust_type.is_none()
        && expression_requires_string_union_const_assertion(&initializer.expr, entities)
    {
        value = format!("{value} as const");
    }
    if !mutable
        && rust_type.is_none()
        && matches!(initializer.expr.as_ref(), Expr::Tuple(_))
        && !value.ends_with(" as const")
    {
        // TypeScript widens `[a, b]` to an array union, losing positional facts before a later tuple
        // pattern. An immutable Rust tuple is the exact `as const` case; mutable tuples retain their
        // existing writable-array emission until they carry an explicit Rust type.
        value = format!("{value} as const");
    }
    if mutable && let Some(name) = frozen_object_expression_name(&initializer.expr, entities) {
        value = format!("{{ ...{name} }}");
    }
    if typescript_type.as_deref() == Some("Float32Array") && !value.starts_with("new Float32Array(")
    {
        value = format!("new Float32Array({value})");
    }
    let rebind = shadowed
        || match &local.pat {
            Pat::Ident(identifier) => {
                expression_contains_identifier(&initializer.expr, &identifier.ident.to_string())
            }
            Pat::Type(typed) => match typed.pat.as_ref() {
                Pat::Ident(identifier) => {
                    expression_contains_identifier(&initializer.expr, &identifier.ident.to_string())
                }
                _ => false,
            },
            _ => false,
        };
    write_indent(out, indent);
    if discard {
        writeln!(out, "{value};").expect("writing to a String cannot fail");
        return Ok(());
    }
    if rebind {
        write!(out, "{pattern}").expect("writing to a String cannot fail");
    } else {
        let declaration = if mutable || rebound { "let" } else { "const" };
        write!(out, "{declaration} {pattern}").expect("writing to a String cannot fail");
    }
    if !rebind
        && (rust_type.is_some()
            || inferred_struct_type.is_some()
            || inferred_option_type.is_some()
            || rebound_struct_type.is_some()
            || string_union_type.is_some())
        && let Some(typescript_type) = typescript_type
    {
        write!(out, ": {typescript_type}").expect("writing to a String cannot fail");
    }
    writeln!(out, " = {value};").expect("writing to a String cannot fail");
    return Ok(());
}

fn emit_let_else_local(
    out: &mut String,
    local: &syn::Local,
    entities: &HashSet<String>,
    indent: usize,
    shadowed: bool,
    rebound: bool,
    emit_else_block: fn(&mut String, &[Stmt], &HashSet<String>, usize) -> Result<(), CompileError>,
) -> Result<(), CompileError> {
    let Pat::TupleStruct(pattern) = &local.pat else {
        return Err(compile_error(
            "portable `let-else` supports only a `Some(name)` pattern",
        ));
    };
    if !pattern.path.is_ident("Some") || pattern.elems.len() != 1 {
        return Err(compile_error(
            "portable `let-else` supports only a `Some(name)` pattern",
        ));
    }
    let Pat::Ident(identifier) = &pattern.elems[0] else {
        return Err(compile_error(
            "portable `let Some` binding needs an identifier",
        ));
    };
    let initializer = local
        .init
        .as_ref()
        .expect("let-else bindings always have an initializer");
    let (_, otherwise) = initializer
        .diverge
        .as_ref()
        .expect("let-else bindings always have a diverging branch");
    let Expr::Block(otherwise) = otherwise.as_ref() else {
        return Err(compile_error(
            "portable `let-else` divergence must use a block",
        ));
    };
    let rust_name = identifier.ident.to_string();
    let name = snake_to_lower_camel(&rust_name);
    let same_binding = referenced_path_identifier(&initializer.expr).as_deref() == Some(&rust_name);
    if !same_binding {
        let value = emit_expression(&initializer.expr, entities)?;
        let rebind = shadowed || expression_contains_identifier(&initializer.expr, &rust_name);
        write_indent(out, indent);
        if rebind {
            write!(out, "{name}").expect("writing to a String cannot fail");
        } else {
            let declaration = if identifier.mutability.is_some() || rebound {
                "let"
            } else {
                "const"
            };
            write!(out, "{declaration} {name}").expect("writing to a String cannot fail");
        }
        writeln!(out, " = {value};").expect("writing to a String cannot fail");
    }
    write_indent(out, indent);
    writeln!(
        out,
        "if ({name} === {}) {{",
        option_absent_value(&initializer.expr, entities)
    )
    .expect("writing to a String cannot fail");
    emit_else_block(out, &otherwise.block.stmts, entities, indent + 1)?;
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

pub(crate) fn emit_format_template(
    template: &str,
    values: &[&Expr],
    entities: &HashSet<String>,
    error_prefix: &str,
) -> Result<String, CompileError> {
    let mut template = template
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${");
    let mut value_index = 0;
    let mut rendered = String::new();
    while let Some(start) = template.find('{') {
        let Some(relative_end) = template[start + 1..].find('}') else {
            break;
        };
        let end = start + 1 + relative_end;
        rendered.push_str(&template[..start]);
        let placeholder = &template[start + 1..end];
        let (name, specifier) = placeholder.split_once(':').unwrap_or((placeholder, ""));
        let value = if name.is_empty() {
            let Some(value) = values.get(value_index) else {
                return Err(compile_error(format!(
                    "{error_prefix} has too few formatting values"
                )));
            };
            value_index += 1;
            emit_expression(value, entities)?
        } else {
            snake_to_lower_camel(name)
        };
        let value = if specifier.is_empty() {
            value
        } else if specifier == "x" {
            format!("({value}).toString(16)")
        } else if let Some(width) = specifier
            .strip_prefix('0')
            .and_then(|value| value.strip_suffix('x'))
            .and_then(|value| value.parse::<usize>().ok())
        {
            format!("({value}).toString(16).padStart({width}, \"0\")")
        } else {
            return Err(compile_error(format!(
                "{error_prefix} uses unsupported format specifier `:{specifier}`"
            )));
        };
        rendered.push_str("${");
        rendered.push_str(&value);
        rendered.push('}');
        template = template[end + 1..].to_string();
    }
    rendered.push_str(&template);
    if value_index != values.len() {
        return Err(compile_error(format!(
            "{error_prefix} has unused formatting values"
        )));
    }
    return Ok(format!("`{rendered}`"));
}

fn emit_macro_expression(
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let Some(name) = rust_macro.path.segments.last() else {
        return Err(compile_error("Rust macro expression has an empty path"));
    };
    if name.ident == "vec" {
        if let Ok((value, length)) = parse_vec_repeat(rust_macro) {
            return Ok(format!(
                "new Array({}).fill({})",
                emit_expression(&length, entities)?,
                emit_expression(&value, entities)?
            ));
        }
        let values = Punctuated::<Expr, Token![,]>::parse_terminated
            .parse2(rust_macro.tokens.clone())
            .map_err(|error| compile_error(format!("failed to parse `vec!` values: {error}")))?;
        let values = values
            .iter()
            .map(|value| emit_expression(value, entities))
            .collect::<Result<Vec<_>, _>>()?;
        return Ok(format!("[{}]", values.join(", ")));
    }
    if name.ident == "matches" {
        return emit_matches_macro(rust_macro, entities);
    }
    if name.ident == "unreachable" {
        return Ok(format!(
            "(() => {{ throw new Error({}); }})()",
            emit_unreachable_message(rust_macro, entities)?
        ));
    }
    if name.ident != "format" {
        return Err(compile_error(format!(
            "unsupported Rust macro expression `{}!`",
            name.ident
        )));
    }
    let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
        .parse2(rust_macro.tokens.clone())
        .map_err(|error| compile_error(format!("failed to parse `format!` arguments: {error}")))?;
    let Some(Expr::Lit(template)) = arguments.first() else {
        return Err(compile_error(
            "portable `format!` expression needs a string literal template",
        ));
    };
    let Lit::Str(template) = &template.lit else {
        return Err(compile_error(
            "portable `format!` expression needs a string literal template",
        ));
    };
    let values = arguments.iter().skip(1).collect::<Vec<_>>();
    return emit_format_template(&template.value(), &values, entities, "portable `format!`");
}

fn emit_matches_macro(
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let (value, pattern, guard) = parse_matches_arguments(rust_macro)
        .map_err(|error| compile_error(format!("failed to parse `matches!` arguments: {error}")))?;
    if guard.is_some() {
        return Err(compile_error("portable `matches!` cannot use a guard"));
    }
    let text = emit_expression(&value, entities)?;
    let reusable = expression_is_reusable(&value);
    let subject = if reusable { text.as_str() } else { "value" };
    let Some(test) = data_union_pattern_test(&pattern, subject, entities)? else {
        return Err(compile_error(
            "portable `matches!` supports only data union variant patterns",
        ));
    };
    let predicate = test.predicate.unwrap_or_else(|| "true".to_string());
    if reusable {
        return Ok(predicate);
    }
    return Ok(format!("((value) => {predicate})({text})"));
}

fn emit_unreachable_message(
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    const DEFAULT_MESSAGE: &str = "internal error: entered unreachable code";

    let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
        .parse2(rust_macro.tokens.clone())
        .map_err(|error| {
            compile_error(format!("failed to parse `unreachable!` arguments: {error}"))
        })?;
    let Some(Expr::Lit(template)) = arguments.first() else {
        if arguments.is_empty() {
            return Ok(format!("{DEFAULT_MESSAGE:?}"));
        }
        return Err(compile_error(
            "portable `unreachable!` needs a string literal template",
        ));
    };
    let Lit::Str(template) = &template.lit else {
        return Err(compile_error(
            "portable `unreachable!` needs a string literal template",
        ));
    };
    let template = format!("{DEFAULT_MESSAGE}: {}", template.value());
    let values = arguments.iter().skip(1).collect::<Vec<_>>();
    return emit_format_template(
        &template,
        &values,
        entities,
        "portable `unreachable!` message",
    );
}

fn tagged_data_union_field_binding(pattern: &Pat) -> Result<Option<String>, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            Ok(Some(snake_to_lower_camel(&identifier.ident.to_string())))
        }
        Pat::Reference(reference) => tagged_data_union_field_binding(&reference.pat),
        Pat::Wild(_) => Ok(None),
        _ => Err(compile_error(
            "tagged data union field pattern must be an identifier or `_`",
        )),
    };
}

fn analyze_tagged_data_union_pattern(
    pattern: &Pat,
    entities: &HashSet<String>,
) -> Result<TaggedDataUnionPatternAnalysis, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            Ok(TaggedDataUnionPatternAnalysis::CatchAll(Some(
                snake_to_lower_camel(&identifier.ident.to_string()),
            )))
        }
        Pat::Or(or_pattern) => {
            let mut variants = Vec::new();
            for pattern in &or_pattern.cases {
                match analyze_tagged_data_union_pattern(pattern, entities)? {
                    TaggedDataUnionPatternAnalysis::Variants(patterns) => variants.extend(patterns),
                    TaggedDataUnionPatternAnalysis::CatchAll(_) => {
                        return Err(compile_error(
                            "tagged data union `|` pattern cannot contain a catch-all",
                        ));
                    }
                    TaggedDataUnionPatternAnalysis::Ordinary => {
                        return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
                    }
                }
            }
            Ok(TaggedDataUnionPatternAnalysis::Variants(variants))
        }
        Pat::Paren(paren) => analyze_tagged_data_union_pattern(&paren.pat, entities),
        Pat::Path(path) => {
            let Some((owner, variant)) = path_owner_and_member(&path.path) else {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            };
            if !is_tagged_data_union_variant(entities, &owner, &variant) {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            }
            if !data_union_unit(entities, &owner, &variant) {
                return Err(compile_error(format!(
                    "tagged data union payload variant `{owner}::{variant}` needs a field pattern"
                )));
            }
            Ok(TaggedDataUnionPatternAnalysis::Variants(vec![
                TaggedDataUnionPattern {
                    bindings: BTreeMap::new(),
                    owner,
                    variant,
                },
            ]))
        }
        Pat::Reference(reference) => analyze_tagged_data_union_pattern(&reference.pat, entities),
        Pat::Struct(pattern) => {
            let Some((owner, variant)) = path_owner_and_member(&pattern.path) else {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            };
            if !is_tagged_data_union_variant(entities, &owner, &variant) {
                return Ok(TaggedDataUnionPatternAnalysis::Ordinary);
            }
            if data_union_unit(entities, &owner, &variant) {
                return Err(compile_error(format!(
                    "tagged data union unit variant `{owner}::{variant}` cannot declare field patterns"
                )));
            }
            let mut bindings = BTreeMap::new();
            for field in &pattern.fields {
                let Some(binding) = tagged_data_union_field_binding(&field.pat)? else {
                    continue;
                };
                let source = emit_member(&field.member);
                if bindings.insert(binding.clone(), source).is_some() {
                    return Err(compile_error(format!(
                        "tagged data union pattern binds `{binding}` more than once"
                    )));
                }
            }
            Ok(TaggedDataUnionPatternAnalysis::Variants(vec![
                TaggedDataUnionPattern {
                    bindings,
                    owner,
                    variant,
                },
            ]))
        }
        Pat::Wild(_) => Ok(TaggedDataUnionPatternAnalysis::CatchAll(None)),
        _ => Ok(TaggedDataUnionPatternAnalysis::Ordinary),
    };
}

fn analyze_tagged_data_union_match(
    arms: &[syn::Arm],
    entities: &HashSet<String>,
) -> Result<Option<Vec<TaggedDataUnionMatchArm>>, CompileError> {
    let analyses = arms
        .iter()
        .map(|arm| analyze_tagged_data_union_pattern(&arm.pat, entities))
        .collect::<Result<Vec<_>, _>>()?;
    if !analyses
        .iter()
        .any(|analysis| matches!(analysis, TaggedDataUnionPatternAnalysis::Variants(_)))
    {
        return Ok(None);
    }
    let mut owner = None;
    let mut handled = BTreeMap::<String, String>::new();
    let mut output = Vec::new();
    let mut has_catch_all = false;
    for (arm_index, analysis) in analyses.into_iter().enumerate() {
        match analysis {
            TaggedDataUnionPatternAnalysis::CatchAll(binding) => {
                if arm_index + 1 != arms.len() {
                    return Err(compile_error(
                        "tagged data union catch-all match arm must be last",
                    ));
                }
                output.push(TaggedDataUnionMatchArm {
                    catch_all_binding: binding,
                    otherwise: true,
                    variants: Vec::new(),
                });
                has_catch_all = true;
            }
            TaggedDataUnionPatternAnalysis::Ordinary => {
                return Err(compile_error(
                    "tagged data union match cannot mix data union and ordinary patterns",
                ));
            }
            TaggedDataUnionPatternAnalysis::Variants(patterns) => {
                let expected_bindings = patterns
                    .first()
                    .map(|pattern| pattern.bindings.keys().cloned().collect::<BTreeSet<_>>())
                    .unwrap_or_default();
                for pattern in &patterns {
                    if let Some(expected) = &owner {
                        if expected != &pattern.owner {
                            return Err(compile_error(format!(
                                "tagged data union match cannot mix `{expected}` and `{}` variants",
                                pattern.owner
                            )));
                        }
                    } else {
                        owner = Some(pattern.owner.clone());
                    }
                    let bindings = pattern.bindings.keys().cloned().collect::<BTreeSet<_>>();
                    if bindings != expected_bindings {
                        return Err(compile_error(
                            "tagged data union alternatives must bind the same field names",
                        ));
                    }
                    let label = format!("{}::{}", pattern.owner, pattern.variant);
                    if let Some(previous) = handled.insert(pattern.variant.clone(), label.clone()) {
                        return Err(compile_error(format!(
                            "tagged data union match arm `{label}` is unreachable after `{previous}`"
                        )));
                    }
                }
                output.push(TaggedDataUnionMatchArm {
                    catch_all_binding: None,
                    otherwise: false,
                    variants: patterns,
                });
            }
        }
    }
    if !has_catch_all {
        let owner = owner.expect("tagged data union match has a tagged variant");
        let missing = tagged_data_union_variants(entities, &owner)
            .into_iter()
            .filter(|variant| !handled.contains_key(variant))
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            return Err(compile_error(format!(
                "tagged data union match is not exhaustive; missing {}",
                missing
                    .iter()
                    .map(|variant| format!("`{owner}::{variant}`"))
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }
        output
            .last_mut()
            .expect("tagged data union match has an arm")
            .otherwise = true;
    }
    return Ok(Some(output));
}

fn analyze_reserved_key_data_union_pattern(
    pattern: &Pat,
    entities: &HashSet<String>,
) -> Result<ReservedKeyDataUnionPatternAnalysis, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            Ok(ReservedKeyDataUnionPatternAnalysis::CatchAll(Some(
                snake_to_lower_camel(&identifier.ident.to_string()),
            )))
        }
        Pat::Or(or_pattern) => {
            let mut variants = Vec::new();
            for pattern in &or_pattern.cases {
                match analyze_reserved_key_data_union_pattern(pattern, entities)? {
                    ReservedKeyDataUnionPatternAnalysis::Variants(patterns) => {
                        variants.extend(patterns);
                    }
                    ReservedKeyDataUnionPatternAnalysis::CatchAll(_) => {
                        return Err(compile_error(
                            "reserved-key data union `|` pattern cannot contain a catch-all",
                        ));
                    }
                    ReservedKeyDataUnionPatternAnalysis::Ordinary => {
                        return Ok(ReservedKeyDataUnionPatternAnalysis::Ordinary);
                    }
                }
            }
            Ok(ReservedKeyDataUnionPatternAnalysis::Variants(variants))
        }
        Pat::Paren(paren) => analyze_reserved_key_data_union_pattern(&paren.pat, entities),
        Pat::Reference(reference) => {
            analyze_reserved_key_data_union_pattern(&reference.pat, entities)
        }
        Pat::TupleStruct(pattern) => {
            let Some((owner, variant)) = path_owner_and_member(&pattern.path) else {
                return Ok(ReservedKeyDataUnionPatternAnalysis::Ordinary);
            };
            let Some(keys) = reserved_key_data_union_variant_keys(entities, &owner, &variant)
            else {
                return Ok(ReservedKeyDataUnionPatternAnalysis::Ordinary);
            };
            let payload_type = reserved_key_data_union_variant_type(entities, &owner, &variant)
                .expect("reserved-key data union variants carry their payload type");
            if pattern.elems.len() != 1 {
                return Err(compile_error(format!(
                    "reserved-key data union pattern `{owner}::{variant}` expects exactly one payload"
                )));
            }
            Ok(ReservedKeyDataUnionPatternAnalysis::Variants(vec![
                ReservedKeyDataUnionPattern {
                    binding: data_union_payload_binding(&pattern.elems[0])?,
                    fallback: keys.is_empty(),
                    keys,
                    owner,
                    payload_type,
                    variant,
                },
            ]))
        }
        Pat::Wild(_) => Ok(ReservedKeyDataUnionPatternAnalysis::CatchAll(None)),
        _ => Ok(ReservedKeyDataUnionPatternAnalysis::Ordinary),
    };
}

fn reserved_key_data_union_keys_predicate(keys: &BTreeSet<String>, value: &str) -> String {
    return keys
        .iter()
        .map(|key| format!("Object.hasOwn({value}, {key:?})"))
        .collect::<Vec<_>>()
        .join(" || ");
}

fn reserved_key_data_union_predicate(variants: &[(BTreeSet<String>, bool)], value: &str) -> String {
    let predicates = variants
        .iter()
        .map(|(keys, fallback)| {
            let predicate = reserved_key_data_union_keys_predicate(keys, value);
            if *fallback {
                format!("!({predicate})")
            } else {
                predicate
            }
        })
        .collect::<Vec<_>>();
    return if predicates.len() == 1 {
        predicates.into_iter().next().unwrap_or_default()
    } else {
        format!("({})", predicates.join(" || "))
    };
}

fn analyze_reserved_key_data_union_match(
    arms: &[syn::Arm],
    entities: &HashSet<String>,
) -> Result<Option<Vec<DataUnionMatchArm>>, CompileError> {
    let analyses = arms
        .iter()
        .map(|arm| analyze_reserved_key_data_union_pattern(&arm.pat, entities))
        .collect::<Result<Vec<_>, _>>()?;
    if !analyses
        .iter()
        .any(|analysis| matches!(analysis, ReservedKeyDataUnionPatternAnalysis::Variants(_)))
    {
        return Ok(None);
    }
    let mut owner = None;
    let mut handled = BTreeMap::<String, String>::new();
    let mut output = Vec::new();
    let mut has_catch_all = false;
    for (arm_index, analysis) in analyses.into_iter().enumerate() {
        match analysis {
            ReservedKeyDataUnionPatternAnalysis::CatchAll(binding) => {
                if arm_index + 1 != arms.len() {
                    return Err(compile_error(
                        "reserved-key data union catch-all match arm must be last",
                    ));
                }
                output.push(DataUnionMatchArm {
                    binding,
                    binding_type: None,
                    categories: BTreeSet::new(),
                    catch_all: true,
                    reserved_key_variants: Vec::new(),
                });
                has_catch_all = true;
            }
            ReservedKeyDataUnionPatternAnalysis::Ordinary => {
                return Err(compile_error(
                    "reserved-key data union match cannot mix data union and ordinary patterns",
                ));
            }
            ReservedKeyDataUnionPatternAnalysis::Variants(patterns) => {
                let mut binding = None::<Option<String>>;
                let mut binding_types = BTreeSet::new();
                let mut variants = Vec::new();
                for pattern in patterns {
                    if let Some(expected) = &owner {
                        if expected != &pattern.owner {
                            return Err(compile_error(format!(
                                "reserved-key data union match cannot mix `{expected}` and `{}` variants",
                                pattern.owner
                            )));
                        }
                    } else {
                        owner = Some(pattern.owner.clone());
                    }
                    if binding
                        .as_ref()
                        .is_some_and(|binding| binding != &pattern.binding)
                    {
                        return Err(compile_error(
                            "reserved-key data union alternatives must bind the same payload name",
                        ));
                    }
                    binding.get_or_insert(pattern.binding);
                    binding_types.insert(pattern.payload_type);
                    let label = format!("{}::{}", pattern.owner, pattern.variant);
                    if let Some(previous) = handled.insert(pattern.variant, label.clone()) {
                        return Err(compile_error(format!(
                            "reserved-key data union match arm `{label}` is unreachable after `{previous}`"
                        )));
                    }
                    let discriminator_keys = if pattern.fallback {
                        reserved_key_data_union_variants(entities, &pattern.owner)
                            .into_values()
                            .find(|keys| !keys.is_empty())
                            .expect("validated reserved-key data union has discriminator keys")
                    } else {
                        pattern.keys
                    };
                    variants.push((discriminator_keys, pattern.fallback));
                }
                let binding = binding.flatten();
                output.push(DataUnionMatchArm {
                    binding_type: binding
                        .as_ref()
                        .map(|_| binding_types.into_iter().collect::<Vec<_>>().join(" | ")),
                    binding,
                    categories: BTreeSet::new(),
                    catch_all: false,
                    reserved_key_variants: variants,
                });
            }
        }
    }
    if !has_catch_all {
        let owner = owner.expect("reserved-key data union match has a variant");
        let missing = reserved_key_data_union_variants(entities, &owner)
            .into_keys()
            .filter(|variant| !handled.contains_key(variant))
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            return Err(compile_error(format!(
                "reserved-key data union match is not exhaustive; missing {}",
                missing
                    .iter()
                    .map(|variant| format!("`{owner}::{variant}`"))
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }
        output
            .last_mut()
            .expect("reserved-key data union match has an arm")
            .catch_all = true;
    }
    return Ok(Some(output));
}

// Lowers one data union pattern applied to `value` into a runtime predicate (`None` for a
// catch-all) and the `(binding, expression)` pairs it introduces; `None` for an ordinary pattern.
fn data_union_pattern_test(
    pattern: &Pat,
    value: &str,
    entities: &HashSet<String>,
) -> Result<Option<DataUnionPatternTest>, CompileError> {
    if let ReservedKeyDataUnionPatternAnalysis::Variants(patterns) =
        analyze_reserved_key_data_union_pattern(pattern, entities)?
    {
        let binding = patterns[0].binding.clone();
        if patterns.iter().any(|pattern| pattern.binding != binding) {
            return Err(compile_error(
                "reserved-key data union alternatives must bind the same payload name",
            ));
        }
        let owner = &patterns[0].owner;
        if patterns.iter().any(|pattern| &pattern.owner != owner) {
            return Err(compile_error(
                "reserved-key data union alternatives cannot mix enum owners",
            ));
        }
        let payload_type = patterns
            .iter()
            .map(|pattern| pattern.payload_type.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>()
            .join(" | ");
        let variants = patterns
            .into_iter()
            .map(|pattern| {
                let keys = if pattern.fallback {
                    reserved_key_data_union_variants(entities, &pattern.owner)
                        .into_values()
                        .find(|keys| !keys.is_empty())
                        .expect("validated reserved-key data union has discriminator keys")
                } else {
                    pattern.keys
                };
                (keys, pattern.fallback)
            })
            .collect::<Vec<_>>();
        return Ok(Some(DataUnionPatternTest {
            bindings: binding
                .map(|binding| (binding, format!("({value} as {payload_type})")))
                .into_iter()
                .collect(),
            predicate: Some(reserved_key_data_union_predicate(&variants, value)),
        }));
    }
    if let TaggedDataUnionPatternAnalysis::Variants(variants) =
        analyze_tagged_data_union_pattern(pattern, entities)?
    {
        let expected = variants[0].bindings.keys().collect::<BTreeSet<_>>();
        if variants
            .iter()
            .any(|variant| variant.bindings.keys().collect::<BTreeSet<_>>() != expected)
        {
            return Err(compile_error(
                "tagged data union alternatives must bind the same field names",
            ));
        }
        let predicate = tagged_data_union_predicate(&variants, value);
        return Ok(Some(DataUnionPatternTest {
            bindings: tagged_data_union_bindings(&variants, value),
            predicate: Some(if variants.len() > 1 {
                format!("({predicate})")
            } else {
                predicate
            }),
        }));
    }
    return match analyze_data_union_pattern(pattern, entities)? {
        DataUnionPatternAnalysis::CatchAll(binding) => Ok(Some(DataUnionPatternTest {
            bindings: binding
                .map(|binding| (binding, value.to_string()))
                .into_iter()
                .collect(),
            predicate: None,
        })),
        DataUnionPatternAnalysis::Ordinary => Ok(None),
        DataUnionPatternAnalysis::Variants(patterns) => {
            let binding = patterns[0].binding.clone();
            if patterns.iter().any(|pattern| pattern.binding != binding) {
                return Err(compile_error(
                    "transparent data union alternatives must bind the same payload name",
                ));
            }
            let categories = patterns
                .into_iter()
                .flat_map(|pattern| pattern.categories)
                .collect::<BTreeSet<_>>();
            let predicate = match categories.iter().collect::<Vec<_>>().as_slice() {
                [category] => runtime_category_predicate(**category, value),
                _ => format!("({})", runtime_categories_predicate(&categories, value)),
            };
            Ok(Some(DataUnionPatternTest {
                bindings: binding
                    .map(|binding| (binding, value.to_string()))
                    .into_iter()
                    .collect(),
                predicate: Some(predicate),
            }))
        }
    };
}

fn tagged_data_union_predicate(patterns: &[TaggedDataUnionPattern], value: &str) -> String {
    return patterns
        .iter()
        .map(|pattern| {
            format!(
                "{value}.kind === {:?}",
                lower_camel_from_upper_camel(&pattern.variant)
            )
        })
        .collect::<Vec<_>>()
        .join(" || ");
}

fn tagged_data_union_bindings(
    patterns: &[TaggedDataUnionPattern],
    value: &str,
) -> Vec<(String, String)> {
    let Some(first) = patterns.first() else {
        return Vec::new();
    };
    return first
        .bindings
        .keys()
        .map(|binding| {
            let fields = patterns
                .iter()
                .map(|pattern| {
                    (
                        lower_camel_from_upper_camel(&pattern.variant),
                        pattern
                            .bindings
                            .get(binding)
                            .expect("tagged alternatives have identical binding names"),
                    )
                })
                .collect::<Vec<_>>();
            let expression = if fields.iter().all(|(_, field)| *field == fields[0].1) {
                format!("{value}.{}", fields[0].1)
            } else {
                let mut expression = format!(
                    "{value}.{}",
                    fields.last().expect("tagged match arm has a variant").1
                );
                for (variant, field) in fields.iter().rev().skip(1) {
                    expression =
                        format!("{value}.kind === {variant:?} ? {value}.{field} : {expression}");
                }
                expression
            };
            (binding.clone(), expression)
        })
        .collect();
}

fn data_union_payload_binding(pattern: &Pat) -> Result<Option<String>, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            Ok(Some(snake_to_lower_camel(&identifier.ident.to_string())))
        }
        Pat::Reference(reference) => data_union_payload_binding(&reference.pat),
        Pat::Rest(_) | Pat::Wild(_) => Ok(None),
        _ => Err(compile_error(
            "transparent data union payload pattern must be an identifier or `_`",
        )),
    };
}

fn analyze_data_union_pattern(
    pattern: &Pat,
    entities: &HashSet<String>,
) -> Result<DataUnionPatternAnalysis, CompileError> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            Ok(DataUnionPatternAnalysis::CatchAll(Some(
                snake_to_lower_camel(&identifier.ident.to_string()),
            )))
        }
        Pat::Or(or_pattern) => {
            let mut variants = Vec::new();
            for pattern in &or_pattern.cases {
                match analyze_data_union_pattern(pattern, entities)? {
                    DataUnionPatternAnalysis::Variants(patterns) => variants.extend(patterns),
                    DataUnionPatternAnalysis::CatchAll(_) => {
                        return Err(compile_error(
                            "transparent data union `|` pattern cannot contain a catch-all",
                        ));
                    }
                    DataUnionPatternAnalysis::Ordinary => {
                        return Ok(DataUnionPatternAnalysis::Ordinary);
                    }
                }
            }
            Ok(DataUnionPatternAnalysis::Variants(variants))
        }
        Pat::Paren(paren) => analyze_data_union_pattern(&paren.pat, entities),
        Pat::Path(path) => {
            let Some((owner, variant)) = path_owner_and_member(&path.path) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            let Some(categories) = data_union_variant_categories(entities, &owner, &variant) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            if reserved_key_data_union_variant_keys(entities, &owner, &variant).is_some() {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            }
            if !data_union_unit(entities, &owner, &variant) {
                return Err(compile_error(format!(
                    "transparent data union payload variant `{owner}::{variant}` needs a payload pattern"
                )));
            }
            Ok(DataUnionPatternAnalysis::Variants(vec![DataUnionPattern {
                binding: None,
                categories,
                owner,
                variant,
            }]))
        }
        Pat::Reference(reference) => analyze_data_union_pattern(&reference.pat, entities),
        Pat::TupleStruct(pattern) => {
            let Some((owner, variant)) = path_owner_and_member(&pattern.path) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            let Some(categories) = data_union_variant_categories(entities, &owner, &variant) else {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            };
            if reserved_key_data_union_variant_keys(entities, &owner, &variant).is_some() {
                return Ok(DataUnionPatternAnalysis::Ordinary);
            }
            if data_union_unit(entities, &owner, &variant) || pattern.elems.len() != 1 {
                return Err(compile_error(format!(
                    "transparent data union pattern `{owner}::{variant}` expects exactly one payload"
                )));
            }
            Ok(DataUnionPatternAnalysis::Variants(vec![DataUnionPattern {
                binding: data_union_payload_binding(&pattern.elems[0])?,
                categories,
                owner,
                variant,
            }]))
        }
        Pat::Wild(_) => Ok(DataUnionPatternAnalysis::CatchAll(None)),
        _ => Ok(DataUnionPatternAnalysis::Ordinary),
    };
}

fn analyze_data_union_match(
    arms: &[syn::Arm],
    entities: &HashSet<String>,
) -> Result<Option<Vec<DataUnionMatchArm>>, CompileError> {
    if let Some(arms) = analyze_reserved_key_data_union_match(arms, entities)? {
        return Ok(Some(arms));
    }
    let analyses = arms
        .iter()
        .map(|arm| analyze_data_union_pattern(&arm.pat, entities))
        .collect::<Result<Vec<_>, _>>()?;
    if !analyses
        .iter()
        .any(|analysis| matches!(analysis, DataUnionPatternAnalysis::Variants(_)))
    {
        return Ok(None);
    }
    let mut owner = None;
    let mut handled = BTreeMap::<RuntimeCategory, String>::new();
    let mut output = Vec::new();
    for (arm_index, analysis) in analyses.into_iter().enumerate() {
        match analysis {
            DataUnionPatternAnalysis::CatchAll(binding) => {
                if arm_index + 1 != arms.len() {
                    return Err(compile_error(
                        "transparent data union catch-all match arm must be last",
                    ));
                }
                output.push(DataUnionMatchArm {
                    binding,
                    binding_type: None,
                    categories: BTreeSet::new(),
                    catch_all: true,
                    reserved_key_variants: Vec::new(),
                });
            }
            DataUnionPatternAnalysis::Ordinary => {
                return Err(compile_error(
                    "transparent data union match cannot mix data union and ordinary patterns",
                ));
            }
            DataUnionPatternAnalysis::Variants(patterns) => {
                let mut categories = BTreeSet::new();
                let mut binding = None::<Option<String>>;
                let mut labels = BTreeMap::<RuntimeCategory, String>::new();
                for pattern in patterns {
                    if let Some(expected) = &owner {
                        if expected != &pattern.owner {
                            return Err(compile_error(format!(
                                "transparent data union match cannot mix `{expected}` and `{}` variants",
                                pattern.owner
                            )));
                        }
                    } else {
                        owner = Some(pattern.owner.clone());
                    }
                    if binding
                        .as_ref()
                        .is_some_and(|binding| binding != &pattern.binding)
                    {
                        return Err(compile_error(
                            "transparent data union alternatives must bind the same payload name",
                        ));
                    }
                    binding.get_or_insert(pattern.binding);
                    let label = format!("{}::{}", pattern.owner, pattern.variant);
                    for category in pattern.categories {
                        categories.insert(category);
                        labels.entry(category).or_insert_with(|| label.clone());
                    }
                }
                for category in &categories {
                    let label = labels
                        .get(category)
                        .expect("every data union runtime category has a source variant");
                    if let Some(previous) = handled.get(category) {
                        return Err(compile_error(format!(
                            "transparent data union match arm `{label}` is unreachable after `{previous}` because both lower to the TypeScript `{}` runtime category",
                            category.name()
                        )));
                    }
                    handled.insert(*category, label.clone());
                }
                output.push(DataUnionMatchArm {
                    binding: binding.flatten(),
                    binding_type: None,
                    categories,
                    catch_all: false,
                    reserved_key_variants: Vec::new(),
                });
            }
        }
    }
    return Ok(Some(output));
}

// `Ordering` lowers to a signed number, which a `switch` cannot match exhaustively; callers compare
// against a variant with `==`, which lowers to a sign comparison.
fn emit_switch_scrutinee(
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    fn is_ordering_pattern(pattern: &Pat) -> bool {
        return match pattern {
            Pat::Or(or_pattern) => or_pattern.cases.iter().any(is_ordering_pattern),
            Pat::Paren(paren) => is_ordering_pattern(&paren.pat),
            Pat::Path(path) => ordering_variant_value(&path.path).is_some(),
            _ => false,
        };
    }

    if expression
        .arms
        .iter()
        .any(|arm| is_ordering_pattern(&arm.pat))
    {
        return Err(compile_error(
            "portable `match` cannot match `Ordering` variants; compare with `==` instead",
        ));
    }
    return emit_expression(&expression.expr, entities);
}

fn runtime_category_predicate(category: RuntimeCategory, value: &str) -> String {
    return match category {
        RuntimeCategory::Null => format!("{value} === null"),
        RuntimeCategory::Boolean => format!("typeof {value} === \"boolean\""),
        RuntimeCategory::Number => format!("typeof {value} === \"number\""),
        RuntimeCategory::String => format!("typeof {value} === \"string\""),
        RuntimeCategory::Array => format!("Array.isArray({value})"),
        RuntimeCategory::Record => format!(
            "typeof {value} === \"object\" && {value} !== null && !Array.isArray({value}) && (Object.getPrototypeOf({value}) === Object.prototype || Object.getPrototypeOf({value}) === null)"
        ),
        RuntimeCategory::Function => format!("typeof {value} === \"function\""),
        RuntimeCategory::Object => format!(
            "typeof {value} === \"object\" && {value} !== null && !Array.isArray({value}) && Object.getPrototypeOf({value}) !== Object.prototype && Object.getPrototypeOf({value}) !== null"
        ),
    };
}

fn runtime_categories_predicate(categories: &BTreeSet<RuntimeCategory>, value: &str) -> String {
    return categories
        .iter()
        .map(|category| runtime_category_predicate(*category, value))
        .map(|predicate| format!("({predicate})"))
        .collect::<Vec<_>>()
        .join(" || ");
}

fn analyze_option_match(arms: &[syn::Arm]) -> Option<Vec<OptionMatchArm>> {
    let mut has_some = false;
    let mut analyzed = Vec::new();
    for arm in arms {
        let info = match &arm.pat {
            Pat::TupleStruct(pattern)
                if pattern.path.is_ident("Some") && pattern.elems.len() == 1 =>
            {
                let binding = match &pattern.elems[0] {
                    Pat::Ident(identifier) if identifier.subpat.is_none() => {
                        Some(snake_to_lower_camel(&identifier.ident.to_string()))
                    }
                    Pat::Wild(_) => None,
                    _ => return None,
                };
                has_some = true;
                OptionMatchArm {
                    binding,
                    present: true,
                }
            }
            Pat::Path(path) if path.path.is_ident("None") => OptionMatchArm {
                binding: None,
                present: false,
            },
            Pat::Ident(identifier) if identifier.ident == "None" && identifier.subpat.is_none() => {
                OptionMatchArm {
                    binding: None,
                    present: false,
                }
            }
            Pat::Wild(_) => OptionMatchArm {
                binding: None,
                present: false,
            },
            _ => return None,
        };
        analyzed.push(info);
    }
    return has_some.then_some(analyzed);
}

fn emit_match_expression(
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    reject_function_exits_in_value_position(
        |visitor| {
            for arm in &expression.arms {
                visitor.visit_arm(arm);
            }
        },
        "portable `match` used as a value",
    )?;
    if let Some(arms) = analyze_option_match(&expression.arms) {
        let mut out = String::new();
        out.push_str("(() => {\n  const matchValue = ");
        out.push_str(&emit_expression(&expression.expr, entities)?);
        out.push_str(";\n");
        let absent = option_absent_value(&expression.expr, entities);
        let last = expression.arms.len() - 1;
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if arm.guard.is_some() {
                return Err(compile_error("portable Rust match arms cannot use guards"));
            }
            // Rust proves the match exhaustive, so the final arm is the remaining case. Emitting it
            // as a plain `else` keeps the IIFE's inferred type to its arms' values, without the
            // `undefined` an unreachable fall-through would add.
            if index > 0 && index == last {
                out.push_str("  else {\n");
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                let operator = if info.present { "!==" } else { "===" };
                writeln!(out, "  {prefix} (matchValue {operator} {absent}) {{")
                    .expect("writing to a String cannot fail");
            }
            if let Some(binding) = info.binding {
                writeln!(out, "    const {binding} = matchValue;")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            writeln!(
                out,
                "    return {};",
                emit_expression(&arm.body, &arm_context)?
            )
            .expect("writing to a String cannot fail");
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    if let Some(arms) = analyze_tagged_data_union_match(&expression.arms, entities)? {
        let mut out = String::new();
        out.push_str("(() => {\n  const matchValue = ");
        out.push_str(&emit_expression(&expression.expr, entities)?);
        out.push_str(";\n");
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if arm.guard.is_some() {
                return Err(compile_error("portable Rust match arms cannot use guards"));
            }
            if info.otherwise {
                if index == 0 {
                    out.push_str("  {\n");
                } else {
                    out.push_str("  else {\n");
                }
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(
                    out,
                    "  {prefix} ({}) {{",
                    tagged_data_union_predicate(&info.variants, "matchValue")
                )
                .expect("writing to a String cannot fail");
            }
            if let Some(binding) = info.catch_all_binding {
                writeln!(out, "    const {binding} = matchValue;")
                    .expect("writing to a String cannot fail");
            }
            for (binding, value) in tagged_data_union_bindings(&info.variants, "matchValue") {
                writeln!(out, "    const {binding} = {value};")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            writeln!(
                out,
                "    return {};",
                emit_expression(&arm.body, &arm_context)?
            )
            .expect("writing to a String cannot fail");
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    if let Some(arms) = analyze_data_union_match(&expression.arms, entities)? {
        let mut out = String::new();
        out.push_str("(() => {\n  const matchValue = ");
        out.push_str(&emit_expression(&expression.expr, entities)?);
        out.push_str(";\n");
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if arm.guard.is_some() {
                return Err(compile_error("portable Rust match arms cannot use guards"));
            }
            if info.catch_all {
                if index == 0 {
                    out.push_str("  {\n");
                } else {
                    out.push_str("  else {\n");
                }
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(
                    out,
                    "  {prefix} ({}) {{",
                    if info.reserved_key_variants.is_empty() {
                        runtime_categories_predicate(&info.categories, "matchValue")
                    } else {
                        reserved_key_data_union_predicate(&info.reserved_key_variants, "matchValue")
                    }
                )
                .expect("writing to a String cannot fail");
            }
            if let Some(binding) = info.binding {
                let value = info.binding_type.map_or_else(
                    || "matchValue".to_string(),
                    |rust_type| format!("matchValue as {rust_type}"),
                );
                writeln!(out, "    const {binding} = {value};")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            writeln!(
                out,
                "    return {};",
                emit_expression(&arm.body, &arm_context)?
            )
            .expect("writing to a String cannot fail");
            out.push_str("  }\n");
        }
        out.push_str("})()");
        return Ok(out);
    }
    let mut out = String::new();
    out.push_str("(() => {\n  const matchValue = ");
    out.push_str(&emit_switch_scrutinee(expression, entities)?);
    out.push_str(";\n  switch (matchValue) {\n");
    for arm in &expression.arms {
        if arm.guard.is_some() {
            return Err(compile_error("portable Rust match arms cannot use guards"));
        }
        let patterns = emit_match_patterns(&arm.pat, entities)?;
        for pattern in patterns {
            if pattern == "default" {
                out.push_str("    default:\n");
            } else {
                writeln!(out, "    case {pattern}:").expect("writing to a String cannot fail");
            }
        }
        let arm_context = lexical_pattern_context(entities, &arm.pat);
        writeln!(
            out,
            "      return {};",
            emit_expression(&arm.body, &arm_context)?
        )
        .expect("writing to a String cannot fail");
    }
    out.push_str("  }\n})()");
    return Ok(out);
}

pub(crate) fn emit_match_statement(
    out: &mut String,
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    if let Some(arms) = analyze_option_match(&expression.arms) {
        write_indent(out, indent);
        out.push_str("{\n");
        write_indent(out, indent + 1);
        writeln!(
            out,
            "const matchValue = {};",
            emit_expression(&expression.expr, entities)?
        )
        .expect("writing to a String cannot fail");
        let absent = option_absent_value(&expression.expr, entities);
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if arm.guard.is_some() {
                return Err(compile_error("portable Rust match arms cannot use guards"));
            }
            write_indent(out, indent + 1);
            let prefix = if index == 0 { "if" } else { "else if" };
            let operator = if info.present { "!==" } else { "===" };
            writeln!(out, "{prefix} (matchValue {operator} {absent}) {{")
                .expect("writing to a String cannot fail");
            if let Some(binding) = info.binding {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = matchValue;")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            match arm.body.as_ref() {
                Expr::Block(block) => {
                    emit_block(out, &block.block.stmts, &arm_context, indent + 2)?
                }
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    &arm_context,
                    indent + 2,
                )?,
            }
            write_indent(out, indent + 1);
            out.push_str("}\n");
        }
        write_indent(out, indent);
        out.push_str("}\n");
        return Ok(());
    }
    if let Some(arms) = analyze_tagged_data_union_match(&expression.arms, entities)? {
        write_indent(out, indent);
        out.push_str("{\n");
        write_indent(out, indent + 1);
        writeln!(
            out,
            "const matchValue = {};",
            emit_expression(&expression.expr, entities)?
        )
        .expect("writing to a String cannot fail");
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if arm.guard.is_some() {
                return Err(compile_error("portable Rust match arms cannot use guards"));
            }
            write_indent(out, indent + 1);
            if info.otherwise {
                if index == 0 {
                    out.push_str("{\n");
                } else {
                    out.push_str("else {\n");
                }
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(
                    out,
                    "{prefix} ({}) {{",
                    tagged_data_union_predicate(&info.variants, "matchValue")
                )
                .expect("writing to a String cannot fail");
            }
            if let Some(binding) = info.catch_all_binding {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = matchValue;")
                    .expect("writing to a String cannot fail");
            }
            for (binding, value) in tagged_data_union_bindings(&info.variants, "matchValue") {
                write_indent(out, indent + 2);
                writeln!(out, "const {binding} = {value};")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            match arm.body.as_ref() {
                Expr::Block(block) => {
                    emit_block(out, &block.block.stmts, &arm_context, indent + 2)?
                }
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    &arm_context,
                    indent + 2,
                )?,
            }
            write_indent(out, indent + 1);
            out.push_str("}\n");
        }
        write_indent(out, indent);
        out.push_str("}\n");
        return Ok(());
    }
    if let Some(arms) = analyze_data_union_match(&expression.arms, entities)? {
        write_indent(out, indent);
        out.push_str("{\n");
        write_indent(out, indent + 1);
        writeln!(
            out,
            "const matchValue = {};",
            emit_expression(&expression.expr, entities)?
        )
        .expect("writing to a String cannot fail");
        for (index, (arm, info)) in expression.arms.iter().zip(arms).enumerate() {
            if arm.guard.is_some() {
                return Err(compile_error("portable Rust match arms cannot use guards"));
            }
            write_indent(out, indent + 1);
            if info.catch_all {
                if index == 0 {
                    out.push_str("{\n");
                } else {
                    out.push_str("else {\n");
                }
            } else {
                let prefix = if index == 0 { "if" } else { "else if" };
                writeln!(
                    out,
                    "{prefix} ({}) {{",
                    if info.reserved_key_variants.is_empty() {
                        runtime_categories_predicate(&info.categories, "matchValue")
                    } else {
                        reserved_key_data_union_predicate(&info.reserved_key_variants, "matchValue")
                    }
                )
                .expect("writing to a String cannot fail");
            }
            if let Some(binding) = info.binding {
                write_indent(out, indent + 2);
                let value = info.binding_type.map_or_else(
                    || "matchValue".to_string(),
                    |rust_type| format!("matchValue as {rust_type}"),
                );
                writeln!(out, "const {binding} = {value};")
                    .expect("writing to a String cannot fail");
            }
            let arm_context = lexical_pattern_context(entities, &arm.pat);
            match arm.body.as_ref() {
                Expr::Block(block) => {
                    emit_block(out, &block.block.stmts, &arm_context, indent + 2)?
                }
                expression => emit_statement(
                    out,
                    &Stmt::Expr(expression.clone(), None),
                    &arm_context,
                    indent + 2,
                )?,
            }
            write_indent(out, indent + 1);
            out.push_str("}\n");
        }
        write_indent(out, indent);
        out.push_str("}\n");
        return Ok(());
    }
    write_indent(out, indent);
    writeln!(
        out,
        "switch ({}) {{",
        emit_switch_scrutinee(expression, entities)?
    )
    .expect("writing to a String cannot fail");
    for arm in &expression.arms {
        if arm.guard.is_some() {
            return Err(compile_error("portable Rust match arms cannot use guards"));
        }
        for pattern in emit_match_patterns(&arm.pat, entities)? {
            write_indent(out, indent + 1);
            if pattern == "default" {
                out.push_str("default:\n");
            } else {
                writeln!(out, "case {pattern}:").expect("writing to a String cannot fail");
            }
        }
        let arm_context = lexical_pattern_context(entities, &arm.pat);
        match arm.body.as_ref() {
            Expr::Block(block) => emit_block(out, &block.block.stmts, &arm_context, indent + 2)?,
            expression => emit_statement(
                out,
                &Stmt::Expr(expression.clone(), None),
                &arm_context,
                indent + 2,
            )?,
        }
        write_indent(out, indent + 2);
        out.push_str("break;\n");
    }
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

fn emit_match_patterns(
    pattern: &Pat,
    entities: &HashSet<String>,
) -> Result<Vec<String>, CompileError> {
    return match pattern {
        Pat::Lit(literal) => Ok(vec![emit_literal(&literal.lit)?]),
        Pat::Or(or_pattern) => {
            let mut patterns = Vec::new();
            for pattern in &or_pattern.cases {
                patterns.extend(emit_match_patterns(pattern, entities)?);
            }
            Ok(patterns)
        }
        Pat::Path(path) => Ok(vec![emit_expression(
            &Expr::Path(syn::ExprPath {
                attrs: Vec::new(),
                qself: path.qself.clone(),
                path: path.path.clone(),
            }),
            entities,
        )?]),
        Pat::Wild(_) => Ok(vec!["default".to_string()]),
        _ => Err(compile_error("unsupported portable Rust match pattern")),
    };
}

fn emit_member(member: &syn::Member) -> String {
    return match member {
        syn::Member::Named(identifier) => snake_to_lower_camel(&identifier.to_string()),
        syn::Member::Unnamed(index) => index.index.to_string(),
    };
}

fn emit_method_call(
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if call.method == "wrapping_add"
        && call.args.len() == 1
        && let Expr::MethodCall(fetch) = call.receiver.as_ref()
        && fetch.method == "fetch_add"
        && fetch.args.len() == 2
    {
        let increment = emit_expression(&fetch.args[0], entities)?;
        let wrapped_increment = emit_expression(&call.args[0], entities)?;
        if increment == wrapped_increment {
            let state = emit_expression(&fetch.receiver, entities)?;
            return Ok(format!(
                "({state}.value = ({state}.value + {increment}) >>> 0)"
            ));
        }
    }
    let receiver = emit_expression(&call.receiver, entities)?;
    if let Some(kind) = expression_hash_collection(&call.receiver, entities) {
        return emit_hash_collection_method(call, &kind, &receiver, entities);
    }
    if call.method == "and_then" || call.method == "map" {
        if let Some(payload) = option_expression_payload(&call.receiver, entities) {
            return emit_option_combinator(call, &receiver, &payload, entities);
        }
        if call.method == "and_then" {
            return Err(compile_error(
                "portable `.and_then()` requires a receiver declared as Rust `Option`",
            ));
        }
        // A Rust field has no `.map()` unless it is an Option (or another non-sequence type), so a
        // field whose owning struct does not resolve is rejected instead of lowered as an array map.
        if matches!(peel_reference_and_paren(&call.receiver), Expr::Field(_)) {
            return Err(compile_error(
                "portable `.map()` on a field requires the field to be declared as Rust `Option`",
            ));
        }
    }
    let arguments = call
        .args
        .iter()
        .map(|argument| emit_expression(argument, entities))
        .collect::<Result<Vec<_>, _>>()?;
    let method = call.method.to_string();
    if method == "fold" && arguments.len() == 2 {
        let reducer = match arguments[1].as_str() {
            "Math.max" => "(left, right) => Math.max(left, right)",
            "Math.min" => "(left, right) => Math.min(left, right)",
            reducer => reducer,
        };
        return Ok(format!("{receiver}.reduce({reducer}, {})", arguments[0]));
    }
    return match method.as_str() {
        "abs" if arguments.is_empty() => Ok(format!("Math.abs({receiver})")),
        "acos" if arguments.is_empty() => Ok(format!("Math.acos({receiver})")),
        "all" if arguments.len() == 1 => Ok(format!("{receiver}.every({})", arguments[0])),
        "any" if arguments.len() == 1 => Ok(format!("{receiver}.some({})", arguments[0])),
        "asin" if arguments.is_empty() => Ok(format!("Math.asin({receiver})")),
        "atan" if arguments.is_empty() => Ok(format!("Math.atan({receiver})")),
        "atan2" if arguments.len() == 1 => Ok(format!("Math.atan2({receiver}, {})", arguments[0])),
        "ceil" if arguments.is_empty() => Ok(format!("Math.ceil({receiver})")),
        "cbrt" if arguments.is_empty() => Ok(format!("Math.cbrt({receiver})")),
        "clear" if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!("{receiver} = ''"))
        }
        "clear" if arguments.is_empty() && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!("{receiver}.length = 0"))
        }
        "clear" if arguments.is_empty() => Err(compile_error(format!(
            "portable `.clear()` receiver `{receiver}` must be known to be `String`, `Vec`, slice, `HashMap`, or `HashSet`"
        ))),
        "chars" if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!("[...{receiver}]"))
        }
        "chars" if arguments.is_empty() => Err(compile_error(
            "portable `.chars()` requires a receiver known to be `String` or `str`",
        )),
        "chain" if arguments.len() == 1 => Ok(format!("[...{receiver}, ...{}]", arguments[0])),
        "checked_add" if arguments.len() == 1 => Ok(format!(
            "((a: number, b: number): number | undefined => {{ const sum = a + b; return sum > 0x7FFFFFFF || sum < -0x80000000 ? undefined : sum }})({receiver}, {})",
            arguments[0]
        )),
        "checked_sub" if arguments.len() == 1 => Ok(format!(
            "((a: number, b: number): number | undefined => {{ const diff = a - b; return diff > 0x7FFFFFFF || diff < -0x80000000 ? undefined : diff }})({receiver}, {})",
            arguments[0]
        )),
        "clamp" if arguments.len() == 2 => Ok(format!(
            "Math.min({}, Math.max({}, {receiver}))",
            arguments[1], arguments[0]
        )),
        "cos" if arguments.is_empty() => Ok(format!("Math.cos({receiver})")),
        "clone"
            if arguments.is_empty()
                && expression_contains_method(&call.receiver, "lock")
                && expression_contains_method(&call.receiver, "unwrap_or_else") =>
        {
            Ok(format!("{receiver}.value"))
        }
        "clone"
            if arguments.is_empty()
                && entities.contains(&format!("{VEC_CLONE_EXPRESSION_MARKER}{receiver}:true")) =>
        {
            Ok(format!("{receiver}?.slice()"))
        }
        "clone"
            if arguments.is_empty()
                && entities.contains(&format!("{VEC_CLONE_EXPRESSION_MARKER}{receiver}:false")) =>
        {
            Ok(format!("{receiver}.slice()"))
        }
        "clone" if arguments.is_empty() && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!("{receiver}.slice()"))
        }
        "clone"
            if arguments.is_empty()
                && referenced_path_identifier(&call.receiver).is_some_and(|identifier| {
                    entities.contains(&format!("{RECORD_CLONE_LOCAL_MARKER}{identifier}"))
                }) =>
        {
            let prefix = format!("{VEC_CLONE_EXPRESSION_MARKER}{receiver}.");
            let mut fields = entities
                .iter()
                .filter_map(|marker| marker.strip_prefix(&prefix))
                .filter_map(|suffix| suffix.rsplit_once(':'))
                .map(|(field, optional)| {
                    let clone = if optional == "true" {
                        format!("{receiver}.{field}?.slice()")
                    } else {
                        format!("{receiver}.{field}.slice()")
                    };
                    format!("{field}: {clone}")
                })
                .collect::<Vec<_>>();
            fields.sort();
            let fields = if fields.is_empty() {
                String::new()
            } else {
                format!(", {}", fields.join(", "))
            };
            Ok(format!("{{ ...{receiver}{fields} }}"))
        }
        "clone"
            if arguments.is_empty()
                && entity_clone_expression_owner(&call.receiver, entities).is_some() =>
        {
            let owner = entity_clone_expression_owner(&call.receiver, entities)
                .expect("entity clone owner was resolved");
            Ok(emit_entity_clone(&receiver, &owner, entities))
        }
        "clone" if arguments.is_empty() => Ok(receiver),
        "cloned" | "copied"
            if arguments.is_empty()
                && option_expression_payload(&call.receiver, entities).is_some() =>
        {
            Ok(receiver)
        }
        "collect"
            if arguments.is_empty()
                && call.turbofish.as_ref().is_some_and(|arguments| {
                    matches!(
                        arguments.args.iter().collect::<Vec<_>>().as_slice(),
                        [GenericArgument::Type(rust_type)]
                            if named_type(rust_type).as_deref() == Some("String")
                    )
                }) =>
        {
            Ok(format!("{receiver}.join('')"))
        }
        "collect" if arguments.is_empty() => Ok(receiver),
        "count" if arguments.is_empty() && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!("{receiver}.length"))
        }
        "count" if arguments.is_empty() => Err(compile_error(
            "portable `.count()` requires an iterator with proven sequence provenance",
        )),
        "contains" if arguments.len() == 1 => Ok(format!("{receiver}.includes({})", arguments[0])),
        "contains_key" if arguments.len() == 1 => Ok(format!("{receiver}.has({})", arguments[0])),
        "dedup" if arguments.is_empty() && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!(
                "(<T>(items: T[]): void => {{ let write = 1; for (let read = 1; read < items.length; read += 1) {{ if (items[read] !== items[read - 1]) {{ items[write] = items[read]; write += 1; }} }} items.length = Math.min(write, items.length); }})({receiver})"
            ))
        }
        "drain" if arguments.len() == 1 && expression_is_sequence(&call.receiver, entities) => {
            let Some(Expr::Range(range)) = call.args.first() else {
                return Err(compile_error(
                    "portable `.drain()` requires one half-open range with a start and end",
                ));
            };
            let (Some(start), Some(end)) = (&range.start, &range.end) else {
                return Err(compile_error(
                    "portable `.drain()` requires one half-open range with a start and end",
                ));
            };
            if !matches!(range.limits, syn::RangeLimits::HalfOpen(_)) {
                return Err(compile_error(
                    "portable `.drain()` requires one half-open range with a start and end",
                ));
            }
            Ok(format!(
                "(<T>(items: T[], start: number, end: number): T[] => items.splice(start, end - start))({receiver}, {}, {})",
                emit_expression(start, entities)?,
                emit_expression(end, entities)?
            ))
        }
        "drain" if arguments.len() == 1 => Err(compile_error(
            "portable `.drain()` requires a receiver declared as Rust `Vec`",
        )),
        "encode_utf16" if arguments.is_empty() => Ok(format!(
            "Array.from({{ length: {receiver}.length }}, (_, index) => {receiver}.charCodeAt(index))"
        )),
        "enumerate" if arguments.is_empty() => Ok(format!("{receiver}.entries()")),
        "exp" if arguments.is_empty() => Ok(format!("Math.exp({receiver})")),
        "expect" if arguments.len() == 1 => {
            let absent = if entities.contains(NULLABLE_OPTIONS_MARKER) {
                "null"
            } else {
                "undefined"
            };
            Ok(format!(
                "(() => {{ const value = {receiver}; if (value === {absent}) throw new Error({}); return value; }})()",
                arguments[0]
            ))
        }
        "find" if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!(
                "((value: string, pattern: string): number | undefined => {{ const index = value.indexOf(pattern); return index === -1 ? undefined : index; }})({receiver}, {})",
                arguments[0]
            ))
        }
        "find" if arguments.len() == 1 && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!("{receiver}.find({})", arguments[0]))
        }
        "find" if arguments.len() == 1 => Err(compile_error(
            "portable `.find()` requires a receiver known to be `String`, `str`, or a sequence",
        )),
        "floor" if arguments.is_empty() => Ok(format!("Math.floor({receiver})")),
        "fract" if arguments.is_empty() => Ok(format!("({receiver} % 1)")),
        "filter" if arguments.len() == 1 => Ok(format!("{receiver}.filter({})", arguments[0])),
        "filter_map" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "{receiver}.map({}).filter((value) => value !== {absent})",
                arguments[0]
            ))
        }
        "flat_map" if arguments.len() == 1 => Ok(format!("{receiver}.flatMap({})", arguments[0])),
        "flatten" if arguments.is_empty() => Ok(format!("{receiver}.flat()")),
        "fetch_add" if arguments.len() == 2 => Ok(format!(
            "(() => {{ const previous = {receiver}.value; {receiver}.value = ({receiver}.value + {}) >>> 0; return previous; }})()",
            arguments[0]
        )),
        "first" if arguments.is_empty() => {
            if entities.contains(NULLABLE_OPTIONS_MARKER) {
                Ok(format!("({receiver}[0] ?? null)"))
            } else {
                Ok(format!("{receiver}[0]"))
            }
        }
        "get" if arguments.len() == 1 && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!("{receiver}[{}]", arguments[0]))
        }
        "hypot" if arguments.len() == 1 => {
            Ok(format!("Math.hypot({receiver}, {})", arguments[0]))
        }
        "is_nan" if arguments.is_empty() => Ok(format!("Number.isNaN({receiver})")),
        "is_finite" if arguments.is_empty() => Ok(format!("Number.isFinite({receiver})")),
        "is_none" if arguments.is_empty() => Ok(format!(
            "{receiver} === {}",
            option_absent_value(&call.receiver, entities)
        )),
        "is_some" if arguments.is_empty() => Ok(format!(
            "{receiver} !== {}",
            option_absent_value(&call.receiver, entities)
        )),
        "is_some_and" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "({receiver} !== {absent} && ({})({receiver}))",
                arguments[0]
            ))
        }
        "is_none_or" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "({receiver} === {absent} || ({})({receiver}))",
                arguments[0]
            ))
        }
        "is_empty" if arguments.is_empty() => Ok(format!("{receiver}.length === 0")),
        "insert" if arguments.len() == 2 && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!(
                "(<T>(items: T[], index: number, value: T): void => {{ if (index > items.length) {{ throw new RangeError(\"Vec insertion index out of bounds\"); }} items.splice(index, 0, value); }})({receiver}, {}, {})",
                arguments[0], arguments[1]
            ))
        }
        "into" if arguments.is_empty() => Ok(receiver),
        "into_boxed_slice" if arguments.is_empty() => Ok(receiver),
        "into_iter" if arguments.is_empty() => Ok(receiver),
        "iter" | "iter_mut" if arguments.is_empty() => Ok(receiver),
        "join" if arguments.len() == 1 => Ok(format!("{receiver}.join({})", arguments[0])),
        "as_ref" if arguments.is_empty() => Ok(receiver),
        "as_mut" if arguments.is_empty() => Ok(receiver),
        "as_bytes" if arguments.is_empty()
            && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("new TextEncoder().encode({receiver})"))
        }
        "as_bytes" if arguments.is_empty() => Err(compile_error(
            "portable `.as_bytes()` requires a receiver known to be `String` or `str`",
        )),
        "as_deref" if arguments.is_empty() => Ok(receiver),
        "as_str" if arguments.is_empty() => Ok(receiver),
        "len" if arguments.is_empty() => Ok(format!("{receiver}.length")),
        "last" if arguments.is_empty() && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!("{receiver}.at(-1)"))
        }
        "get" if arguments.is_empty() => Ok(format!("{receiver}.value")),
        "ln" if arguments.is_empty() => Ok(format!("Math.log({receiver})")),
        "map" if arguments.len() == 1 => Ok(format!("{receiver}.map({})", arguments[0])),
        "map_or"
            if arguments.len() == 2
                && option_expression_payload(&call.receiver, entities).is_some() =>
        {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "(<T, U>(value: T | {absent}, fallback: U, map: (value: T) => U): U => value === {absent} ? fallback : map(value))({receiver}, {}, {})",
                arguments[0], arguments[1]
            ))
        }
        "map_or_else"
            if arguments.len() == 2
                && option_expression_payload(&call.receiver, entities).is_some() =>
        {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "(<T, U>(value: T | {absent}, fallback: () => U, map: (value: T) => U): U => value === {absent} ? fallback() : map(value))({receiver}, {}, {})",
                arguments[0], arguments[1]
            ))
        }
        "max" if arguments.len() == 1 => Ok(format!("Math.max({receiver}, {})", arguments[0])),
        "min" if arguments.len() == 1 => Ok(format!("Math.min({receiver}, {})", arguments[0])),
        "or_else" if arguments.len() == 1 => {
            Ok(format!("({receiver} ?? ({})())", arguments[0]))
        }
        "next"
            if arguments.is_empty()
                && matches!(call.receiver.as_ref(), Expr::MethodCall(chars)
                    if chars.method == "chars"
                        && chars.args.is_empty()
                        && expression_is_known_string(&chars.receiver, entities)) =>
        {
            Ok(format!("{receiver}[0]"))
        }
        "powf" if arguments.len() == 1 => Ok(format!("Math.pow({receiver}, {})", arguments[0])),
        "powi" if arguments.len() == 1 => Ok(format!("Math.pow({receiver}, {})", arguments[0])),
        "cmp" if arguments.len() == 1 => emit_ordered_comparison(
            &call.receiver,
            &call.args[0],
            &receiver,
            &arguments[0],
            entities,
        ),
        "partial_cmp" if arguments.len() == 1 => Ok(format!("{receiver} - {}", arguments[0])),
        "pop" if arguments.is_empty() && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!("{receiver}.pop()"))
        }
        "position" if arguments.len() == 1 => Ok(format!(
            "(<T>(items: readonly T[], predicate: (item: T) => boolean): number | undefined => {{ const index = items.findIndex(predicate); return index === -1 ? undefined : index; }})({receiver}, {})",
            arguments[0]
        )),
        "push" if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!("{receiver} += {}", arguments[0]))
        }
        "push" if arguments.len() == 1 => Ok(format!("{receiver}.push({})", arguments[0])),
        "push_str" if arguments.len() == 1 => Ok(format!("{receiver} += {}", arguments[0])),
        "remove" if arguments.len() == 1 && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!(
                "(<T>(items: T[], index: number): T => {{ if (index >= items.length) {{ throw new RangeError(\"Vec removal index out of bounds\"); }} return items.splice(index, 1)[0]; }})({receiver}, {})",
                arguments[0]
            ))
        }
        "replace" if arguments.len() == 2 => Ok(format!(
            "{receiver}.replaceAll({}, {})",
            arguments[0], arguments[1]
        )),
        "repeat"
            if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.repeat({})", arguments[0]))
        }
        "repeat" if arguments.len() == 1 => Err(compile_error(
            "portable `.repeat()` requires a receiver known to be `String` or `str`",
        )),
        "resize" if arguments.len() == 2 && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!(
                "(<T>(items: T[], length: number, value: T): void => {{ while (items.length < length) {{ items.push(value); }} items.length = length; }})({receiver}, {}, {})",
                arguments[0], arguments[1]
            ))
        }
        "rev" if arguments.is_empty() => Ok(format!("[...{receiver}].reverse()")),
        "round" if arguments.is_empty() => Ok(format!("Math.round({receiver})")),
        "saturating_sub" if arguments.len() == 1 => {
            Ok(format!("Math.max(0, {receiver} - {})", arguments[0]))
        }
        "set" if arguments.len() == 1 => Ok(format!("{receiver}.value = {}", arguments[0])),
        "signum" if arguments.is_empty() => Ok(format!("Math.sign({receiver})")),
        "sin" if arguments.is_empty() => Ok(format!("Math.sin({receiver})")),
        "skip" if arguments.len() == 1 => Ok(format!("{receiver}.slice({})", arguments[0])),
        "sort_unstable_by" if arguments.len() == 1 => {
            Ok(format!("{receiver}.sort({})", arguments[0]))
        }
        "split" if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!("{receiver}.split({})", arguments[0]))
        }
        "split" if arguments.len() == 1 => Err(compile_error(
            "portable `.split()` requires a receiver known to be `String` or `str`",
        )),
        "sqrt" if arguments.is_empty() => Ok(format!("Math.sqrt({receiver})")),
        "starts_with"
            if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.startsWith({})", arguments[0]))
        }
        "starts_with" if arguments.len() == 1 => Err(compile_error(
            "portable `.starts_with()` requires a receiver known to be `String` or `str`",
        )),
        "ends_with"
            if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.endsWith({})", arguments[0]))
        }
        "ends_with" if arguments.len() == 1 => Err(compile_error(
            "portable `.ends_with()` requires a receiver known to be `String` or `str`",
        )),
        "trim" if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) => {
            Ok(format!("{receiver}.trim()"))
        }
        "trim" if arguments.is_empty() => Err(compile_error(
            "portable `.trim()` requires a receiver known to be `String` or `str`",
        )),
        "trim_end"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.trimEnd()"))
        }
        "trim_end" if arguments.is_empty() => Err(compile_error(
            "portable `.trim_end()` requires a receiver known to be `String` or `str`",
        )),
        "trim_start"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.trimStart()"))
        }
        "trim_start" if arguments.is_empty() => Err(compile_error(
            "portable `.trim_start()` requires a receiver known to be `String` or `str`",
        )),
        "trim_start_matches"
            if arguments.len() == 1 && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!(
                "((text: string, matches: (character: string) => boolean): string => {{ let offset = 0; for (const character of text) {{ if (!matches(character)) break; offset += character.length; }} return text.slice(offset); }})({receiver}, {})",
                arguments[0]
            ))
        }
        "trim_start_matches" if arguments.len() == 1 => Err(compile_error(
            "portable `.trim_start_matches()` requires a receiver known to be `String` or `str`",
        )),
        "sum" if arguments.is_empty() => {
            Ok(format!("{receiver}.reduce((sum, value) => sum + value, 0)"))
        }
        // In place, like Rust: the predicate runs once per element in forward order, kept elements move
        // forward in the same array (keeping their identity and order), and the array is then truncated.
        // The generic parameter types the predicate from the receiver. When the predicate throws, the
        // `finally` keeps the unprocessed tail (from the throwing element on) after the kept elements, as
        // Rust's retain guard backshifts it during unwind.
        "retain" if arguments.len() == 1 && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!(
                "(<T>(items: T[], keep: (item: T) => boolean): void => {{ let kept = 0; let index = 0; try {{ for (; index < items.length; index += 1) {{ const item = items[index]; if (keep(item)) {{ items[kept] = item; kept += 1; }} }} }} finally {{ const length = items.length; for (let rest = index; rest < length; rest += 1) {{ items[kept + rest - index] = items[rest]; }} items.length = kept + length - index; }} }})({receiver}, {})",
                arguments[0]
            ))
        }
        "retain" => Err(compile_error(
            "portable `.retain()` requires a receiver declared as Rust `Vec` and one predicate",
        )),
        "sort_by" if arguments.len() == 1 => Ok(format!("{receiver}.sort({})", arguments[0])),
        "sort" if arguments.is_empty() => Ok(format!("{receiver}.sort((a, b) => a - b)")),
        "swap" if arguments.len() == 2 => Ok(format!(
            "([{receiver}[{}], {receiver}[{}]] = [{receiver}[{}], {receiver}[{}]])",
            arguments[0], arguments[1], arguments[1], arguments[0]
        )),
        "take" if arguments.is_empty() => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!(
                "(() => {{ const __tmp = {receiver}; {receiver} = {absent}; return __tmp; }})()"
            ))
        }
        "tan" if arguments.is_empty() => Ok(format!("Math.tan({receiver})")),
        "then_some" if arguments.len() == 1 => {
            let absent = option_absent_value(&call.receiver, entities);
            Ok(format!("({receiver} ? {} : {absent})", arguments[0]))
        }
        "to_string"
            if arguments.is_empty()
                && matches!(call.receiver.as_ref(), Expr::Lit(literal) if matches!(&literal.lit, Lit::Str(_))) =>
        {
            Ok(receiver)
        }
        "to_ascii_lowercase"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.toLowerCase()"))
        }
        "to_ascii_lowercase" if arguments.is_empty() => Err(compile_error(
            "portable `.to_ascii_lowercase()` requires a receiver known to be `String` or `str`",
        )),
        "to_ascii_uppercase"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.toUpperCase()"))
        }
        "to_ascii_uppercase" if arguments.is_empty() => Err(compile_error(
            "portable `.to_ascii_uppercase()` requires a receiver known to be `String` or `str`",
        )),
        "to_lowercase"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.toLowerCase()"))
        }
        "to_lowercase" if arguments.is_empty() => Err(compile_error(
            "portable `.to_lowercase()` requires a receiver known to be `String` or `str`",
        )),
        "to_uppercase"
            if arguments.is_empty() && expression_is_known_string(&call.receiver, entities) =>
        {
            Ok(format!("{receiver}.toUpperCase()"))
        }
        "to_uppercase" if arguments.is_empty() => Err(compile_error(
            "portable `.to_uppercase()` requires a receiver known to be `String` or `str`",
        )),
        "to_string" if arguments.is_empty() => Ok(format!("String({receiver})")),
        "trunc" if arguments.is_empty() => Ok(format!("Math.trunc({receiver})")),
        "to_vec" if arguments.is_empty() => Ok(format!("[...{receiver}]")),
        "truncate" if arguments.len() == 1 && expression_is_sequence(&call.receiver, entities) => {
            Ok(format!(
                "(<T>(items: T[], length: number): void => {{ items.length = Math.min(items.length, length); }})({receiver}, {})",
                arguments[0]
            ))
        }
        "extend" => Err(compile_error(
            "portable `.extend()` is supported only as a statement",
        )),
        "extend_from_slice" => Err(compile_error(
            "portable `.extend_from_slice()` is supported only as a statement",
        )),
        "wrapping_add" if arguments.len() == 1 => {
            Ok(format!("(({receiver}) + {}) >>> 0", arguments[0]))
        }
        "wrapping_mul" if arguments.len() == 1 => {
            Ok(format!("Math.imul(({receiver}), {}) >>> 0", arguments[0]))
        }
        "wrapping_shr" if arguments.len() == 1 => Ok(format!("({receiver}) >>> {}", arguments[0])),
        "windows" if arguments.len() == 1 => Ok(format!(
            "Array.from({{ length: Math.max(0, {receiver}.length - {} + 1) }}, (_, index) => {receiver}.slice(index, index + {}))",
            arguments[0], arguments[0]
        )),
        "lock" if arguments.is_empty() => Ok(receiver),
        "read" | "write" if arguments.is_empty() => Ok(receiver),
        "unwrap_or_else"
            if arguments.len() == 1 && expression_contains_method(&call.receiver, "lock") =>
        {
            Ok(receiver)
        }
        "unwrap_or"
            if arguments.len() == 1
                && expression_contains_method(&call.receiver, "partial_cmp") =>
        {
            Ok(receiver)
        }
        "unwrap_or" if arguments.len() == 1 => Ok(format!("({receiver} ?? {})", arguments[0])),
        "unwrap" if arguments.is_empty() && expression_contains_method(&call.receiver, "lock") => {
            Ok(format!("{receiver}.value"))
        }
        "unsigned_abs" if arguments.is_empty() => Ok(format!("Math.abs({receiver}) >>> 0")),
        "unwrap" if arguments.is_empty() => Ok(if receiver.ends_with('!') {
            receiver
        } else {
            format!("{receiver}!")
        }),
        "zip" if arguments.len() == 1 => Ok(format!(
            "{receiver}.map((item, index) => [item, {}[index]] as const)",
            arguments[0]
        )),
        _ => Err(compile_error(format!(
            "unsupported Rust method call `.{method}()`; impl sugar is not a transpilation source"
        ))),
    };
}

pub(crate) fn emit_option_binding(
    condition: &Expr,
    entities: &HashSet<String>,
) -> Result<Option<(String, String, &'static str)>, CompileError> {
    let Expr::Let(binding) = condition else {
        return Ok(None);
    };
    let Pat::TupleStruct(pattern) = &*binding.pat else {
        return Err(compile_error(
            "portable `if let` supports only a `Some(name)` pattern",
        ));
    };
    if !pattern.path.is_ident("Some") || pattern.elems.len() != 1 {
        return Err(compile_error(
            "portable `if let` supports only a `Some(name)` pattern",
        ));
    }
    let Pat::Ident(identifier) = &pattern.elems[0] else {
        return Err(compile_error(
            "portable `if let Some` binding needs an identifier",
        ));
    };
    return Ok(Some((
        snake_to_lower_camel(&identifier.ident.to_string()),
        emit_expression(&binding.expr, entities)?,
        option_absent_value(&binding.expr, entities),
    )));
}

// Option `.and_then(f)` / `.map(f)` over a receiver declared as Rust `Option`. The receiver is evaluated
// once. A body that only reads fields of the closure parameter lowers to optional chaining when the
// absent value is `undefined`; every other body binds the receiver in an arrow and tests it against the
// absent value. `.and_then` bodies already yield an Option, and `.map` bodies a payload, so both share
// one shape.
// flight-lint: allow(hashmap-iteration) the closure context filters one set into another; order is never observed
fn emit_option_combinator(
    call: &syn::ExprMethodCall,
    receiver: &str,
    payload: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let method = call.method.to_string();
    let closure = match call.args.first() {
        Some(Expr::Closure(closure)) if call.args.len() == 1 && closure.inputs.len() == 1 => {
            closure
        }
        _ => {
            return Err(compile_error(format!(
                "portable Option `.{method}()` needs a single-parameter closure"
            )));
        }
    };
    let Some(parameter) = option_closure_parameter(&closure.inputs[0]) else {
        return Err(compile_error(format!(
            "portable Option `.{method}()` closure parameter must be an identifier"
        )));
    };
    let parameter_name = parameter.to_string();
    let mut closure_context = entities
        .iter()
        .filter(|marker| {
            **marker != format!("{ORDERED_PRIMITIVE_MARKER}{parameter_name}")
                && **marker != format!("{STRING_EXPRESSION_MARKER}{parameter_name}")
                && **marker != format!("{NULLABLE_BINDING_MARKER}{parameter_name}")
        })
        .cloned()
        .collect::<HashSet<_>>();
    // The parameter binds the receiver's payload; its site's fact is replaced so the closure body
    // resolves the parameter's fields through it.
    if let Some(id) = unique_marker_suffix(
        &closure_context,
        &format!("{BINDING_SITE_MARKER}{}=", binding_site_key(parameter)),
    ) {
        let prefix = format!("{BINDING_FACT_MARKER}{id}=");
        closure_context.retain(|marker| !marker.starts_with(&prefix));
        let fact = if payload.is_empty() {
            BindingFact::Unknown
        } else {
            BindingFact::Structure(payload.to_string())
        };
        closure_context.insert(format!("{prefix}{}", binding_fact_marker(&fact)));
    }
    let absent = option_absent_value(&call.receiver, entities);
    let binding = snake_to_lower_camel(&parameter_name);
    let body = emit_closure(closure, &closure_context)?;
    let Some(body) = body.strip_prefix(&format!("({binding}) => ")) else {
        return Err(compile_error(format!(
            "portable Option `.{method}()` closure cannot declare parameter or return types"
        )));
    };
    if absent == "undefined"
        && expression_is_field_projection(&closure.body, parameter)
        && let Some(fields) = body.strip_prefix(&format!("{binding}."))
    {
        let receiver = if is_lowered_primary(&call.receiver, receiver) {
            receiver.to_string()
        } else {
            format!("({receiver})")
        };
        return Ok(format!("{receiver}?.{fields}"));
    }
    let body = if matches!(closure.body.as_ref(), Expr::Block(_)) {
        format!("(({binding}) => {body})({binding})")
    } else {
        body.to_string()
    };
    return Ok(format!(
        "(({binding}) => {binding} === {absent} ? {absent} : {body})({receiver})"
    ));
}

fn emit_ordered_comparison(
    left: &Expr,
    right: &Expr,
    left_text: &str,
    right_text: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if !expression_is_ordered_primitive(left, entities)
        || !expression_is_ordered_primitive(right, entities)
    {
        return Err(compile_error(
            "portable `.cmp()` requires operands declared as Rust integers or strings",
        ));
    }
    if expression_is_reusable(left) && expression_is_reusable(right) {
        return Ok(format!(
            "{left_text} < {right_text} ? -1 : {left_text} > {right_text} ? 1 : 0"
        ));
    }
    return Ok(format!(
        "((left, right) => (left < right ? -1 : left > right ? 1 : 0))({left_text}, {right_text})"
    ));
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

// Whether `expression` is declared as a Rust `Vec`, slice or fixed array: a sequence local or parameter,
// a sequence field of a resolved struct, a call to a resolved function returning one, a `Vec`
// construction or array literal, or a range slice, `.clone()` or `.to_vec()` of one.
fn expression_is_sequence(expression: &Expr, entities: &HashSet<String>) -> bool {
    if expression_is_vec_construction(expression) {
        return true;
    }
    return match expression {
        Expr::Array(_) => true,
        Expr::Call(call) => match call.func.as_ref() {
            Expr::Path(path) if path.qself.is_none() => {
                call_fact(entities, SEQUENCE_RETURN_MARKER, &path.path).is_some()
            }
            _ => false,
        },
        // Only the range forms whose `.slice` emission is valid: a prefix `..end` and inclusive ranges
        // are left unknown until range slices are lowered with Rust bounds.
        Expr::Index(index)
            if matches!(
                index.index.as_ref(),
                Expr::Range(range) if matches!(range.limits, syn::RangeLimits::HalfOpen(_))
                    && (range.start.is_some() || range.end.is_none())
            ) =>
        {
            expression_is_sequence(&index.expr, entities)
        }
        Expr::Field(field) => {
            let syn::Member::Named(field_name) = &field.member else {
                return false;
            };
            expression_struct_name(&field.base, entities).is_some_and(|identity| {
                entities.contains(&format!(
                    "{SEQUENCE_FIELD_MARKER}{identity}{PROVENANCE_SEPARATOR}{field_name}"
                ))
            })
        }
        Expr::Group(group) => expression_is_sequence(&group.expr, entities),
        Expr::MethodCall(call)
            if call.args.is_empty() && (call.method == "clone" || call.method == "to_vec") =>
        {
            expression_is_sequence(&call.receiver, entities)
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && call.method == "encode_utf16"
                && expression_is_known_string(&call.receiver, entities) =>
        {
            true
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && call.method == "chars"
                && expression_is_known_string(&call.receiver, entities) =>
        {
            true
        }
        Expr::MethodCall(call)
            if (call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "collect" | "iter" | "into_iter"
                ))
                || (call.args.len() == 1
                    && matches!(call.method.to_string().as_str(), "filter" | "map" | "skip")) =>
        {
            expression_is_sequence(&call.receiver, entities)
        }
        Expr::Paren(paren) => expression_is_sequence(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            matches!(
                lexical_fact(entities, &path.path.segments[0].ident.to_string()),
                Some(BindingFact::Sequence(_))
            )
        }
        Expr::Reference(reference) => expression_is_sequence(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_is_sequence(&unary.expr, entities)
        }
        _ => false,
    };
}

fn expression_is_vec_construction(expression: &Expr) -> bool {
    return matches!(
        expression,
        Expr::Macro(invocation) if invocation.mac.path.is_ident("vec") && !invocation.mac.tokens.is_empty()
    );
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
        || !normalized && expression_is_nullable_option_field(expression, entities)
        || !normalized && expression_is_nullable_option_return(expression, entities)
        || referenced_path_identifier(expression)
            .and_then(|name| lexical_binding(entities, &name))
            .is_some_and(|id| entities.contains(&format!("{NULLABLE_OPTION_BINDING_MARKER}{id}")))
        || referenced_path_identifier(expression)
            .is_some_and(|name| entities.contains(&format!("{NULLABLE_BINDING_MARKER}{name}")))
    {
        return "null";
    }
    return "undefined";
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
    ));
}

fn emit_receiver_preserving_optional_call(
    out: &mut String,
    expression: &syn::ExprIf,
    binding: &(String, String, &'static str),
    entities: &HashSet<String>,
    indent: usize,
) -> Result<bool, CompileError> {
    if expression.else_branch.is_some() {
        return Ok(false);
    }
    let Expr::Let(condition) = expression.cond.as_ref() else {
        return Ok(false);
    };
    if !expression_is_field_reference(&condition.expr) {
        return Ok(false);
    }
    let (call, returns) = match expression.then_branch.stmts.as_slice() {
        [Stmt::Expr(Expr::Call(call), _)] => (call, false),
        [Stmt::Expr(Expr::Return(return_expression), _)] => {
            let Some(Expr::Call(call)) = return_expression.expr.as_deref() else {
                return Ok(false);
            };
            (call, true)
        }
        _ => return Ok(false),
    };
    let Expr::Path(function) = call.func.as_ref() else {
        return Ok(false);
    };
    if function.qself.is_some() || function.path.segments.len() != 1 {
        return Ok(false);
    }
    let Some(function) = function.path.segments.first() else {
        return Ok(false);
    };
    let function = function.ident.to_string();
    let function = export_name(entities, &function)
        .map_or_else(|| snake_to_lower_camel(&function), str::to_string);
    if function != binding.0 {
        return Ok(false);
    }
    let arguments = call
        .args
        .iter()
        .map(|argument| emit_expression(argument, entities))
        .collect::<Result<Vec<_>, _>>()?
        .join(", ");
    write_indent(out, indent);
    if returns {
        writeln!(out, "if ({} !== {}) {{", binding.1, binding.2)
            .expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "return {}({arguments});", binding.1)
            .expect("writing to a String cannot fail");
        write_indent(out, indent);
        out.push_str("}\n");
    } else {
        writeln!(out, "{}?.({arguments});", binding.1).expect("writing to a String cannot fail");
    }
    return Ok(true);
}

fn expression_is_field_reference(expression: &Expr) -> bool {
    return match expression {
        Expr::Field(_) => true,
        Expr::Group(group) => expression_is_field_reference(&group.expr),
        Expr::Paren(paren) => expression_is_field_reference(&paren.expr),
        Expr::Reference(reference) => expression_is_field_reference(&reference.expr),
        _ => false,
    };
}

pub(crate) fn emit_parameter(
    argument: &FnArg,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return emit_parameter_with_aliases(
        argument,
        entities,
        &PreferredAliases::new(),
        false,
        false,
        false,
    );
}

fn emit_parameter_with_aliases(
    argument: &FnArg,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    optional: bool,
    nullable: bool,
    entity_construction: bool,
) -> Result<String, CompileError> {
    let FnArg::Typed(argument) = argument else {
        return Err(compile_error(
            "free-function contract cannot contain a self receiver",
        ));
    };
    let Pat::Ident(pattern) = argument.pat.as_ref() else {
        return Err(compile_error(
            "unsupported destructuring in function parameter",
        ));
    };
    let name = snake_to_lower_camel(&pattern.ident.to_string());
    if entity_construction {
        return Ok(format!(
            "{name}: EntityConstruction<{}>",
            emit_preferred_type(&argument.ty, entities, aliases)?
        ));
    }
    if optional {
        let Some(inner) = option_inner_type(&argument.ty) else {
            return Err(compile_error(
                "only trailing Option parameters can be emitted as optional",
            ));
        };
        return Ok(format!(
            "{name}?: {}",
            emit_preferred_type(inner, entities, aliases)?
        ));
    }
    if nullable {
        let Some(inner) = option_inner_type(&argument.ty) else {
            return Err(compile_error("nullable guard parameter must use Option"));
        };
        return Ok(format!(
            "{name}: {}",
            nullable_type(emit_preferred_type(inner, entities, aliases)?)
        ));
    }
    return Ok(format!(
        "{name}: {}",
        emit_preferred_type(&argument.ty, entities, aliases)?
    ));
}

fn emit_path_segment(segment: &str) -> String {
    if segment.chars().all(|character| {
        character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
    }) {
        return segment.to_string();
    }
    return snake_to_lower_camel(segment);
}

pub(crate) fn emit_pattern(pattern: &Pat) -> Result<String, CompileError> {
    return match pattern {
        Pat::Ident(identifier) => Ok(snake_to_lower_camel(&identifier.ident.to_string())),
        Pat::Reference(reference) => emit_pattern(&reference.pat),
        Pat::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| {
                    if matches!(element, Pat::Wild(_)) {
                        Ok(String::new())
                    } else {
                        emit_pattern(element)
                    }
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Pat::Wild(_) => Ok("_".to_string()),
        _ => Err(compile_error("unsupported portable loop pattern")),
    };
}

fn emit_preferred_type(
    rust_type: &Type,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
) -> Result<String, CompileError> {
    let rendered = emit_type(rust_type, entities)?;
    return Ok(aliases.get(&rendered).cloned().unwrap_or(rendered));
}

fn emit_type_with_aliases(
    rust_type: &Type,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_types: &HashSet<String>,
) -> Result<String, CompileError> {
    let Type::Path(path) = rust_type else {
        return emit_preferred_type(rust_type, entities, aliases);
    };
    let Some(segment) = path.path.segments.last() else {
        return Err(compile_error("empty Rust type path"));
    };
    let name = segment.ident.to_string();
    if matches!(name.as_str(), "Option" | "Vec" | "Mutex" | "Arc" | "Ref") {
        let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
            return emit_preferred_type(rust_type, entities, aliases);
        };
        let Some(inner) = arguments.args.iter().find_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(rust_type),
            _ => None,
        }) else {
            return emit_preferred_type(rust_type, entities, aliases);
        };
        let inner = emit_type_with_aliases(inner, entities, aliases, nullable_types)?;
        return Ok(match name.as_str() {
            "Option"
                if entities.contains(NULLABLE_OPTIONS_MARKER)
                    || nullable_types.contains(&inner) =>
            {
                nullable_type(inner)
            }
            "Option" => format!("{inner} | undefined"),
            "Vec" => array_type(inner),
            "Mutex" => format!("{{ value: {inner} }}"),
            "Arc" if is_primitive_typescript_type(&inner) => inner,
            "Arc" => format!("Readonly<{inner}>"),
            "Ref" => inner,
            _ => unreachable!(),
        });
    }
    return emit_preferred_type(rust_type, entities, aliases);
}

fn nullable_guard_types(
    programs: &[&Program],
    aliases: &PreferredAliases,
    type_context: &HashSet<String>,
) -> Result<HashSet<String>, CompileError> {
    let mut types = HashSet::new();
    for program in programs {
        for function in &program.functions {
            for argument in &function.sig.inputs {
                if argument_is_nullable_guard(function, argument)
                    && let FnArg::Typed(argument) = argument
                    && let Some(inner) = option_inner_type(&argument.ty)
                {
                    types.insert(emit_preferred_type(inner, type_context, aliases)?);
                }
            }
        }
    }
    return Ok(types);
}

// The `T | null` value of an `Option` expression whose emitted form is `emitted`: `None` is `null`,
// `Some(x)` is `x`, and any other `Option` value (absent as `undefined`) coalesces to `null`.
fn nullable_option_value(expression: &Expr, emitted: String) -> String {
    let expression = match expression {
        Expr::Group(group) => group.expr.as_ref(),
        Expr::Paren(paren) => paren.expr.as_ref(),
        expression => expression,
    };
    if expression_is_path(expression, "None") {
        return "null".to_string();
    }
    if let Expr::Call(call) = expression
        && expression_is_path(&call.func, "Some")
    {
        return emitted;
    }
    return format!("({emitted}) ?? null");
}

// `dyn Any [+ Send | + Sync | + 'a]` whose `Any` resolves (see `resolve_type_path`) to `std::any::Any`
// or `core::any::Any`: an opaque value portable code never inspects, `object` in TypeScript. `object`
// rather than `unknown` keeps `Arc::ptr_eq` (lowered to `===`) an identity comparison, and makes a
// payload with no identity (`Arc::new(())` lowers to `undefined`) a type error rather than a value that
// compares equal to every other. Any other bound, or an `Any` of uncertain provenance, is not this shape.
fn trait_object_is_standard_any(
    bounds: &syn::punctuated::Punctuated<syn::TypeParamBound, syn::token::Plus>,
    entities: &HashSet<String>,
) -> bool {
    let mut any = false;
    for bound in bounds {
        match bound {
            syn::TypeParamBound::Trait(trait_bound) => {
                if trait_bound.lifetimes.is_some()
                    || !matches!(trait_bound.modifier, syn::TraitBoundModifier::None)
                    || !matches!(
                        trait_bound
                            .path
                            .segments
                            .last()
                            .map(|segment| &segment.arguments),
                        Some(PathArguments::None)
                    )
                {
                    return false;
                }
                let Some(resolved) = resolve_type_path(&trait_bound.path, entities) else {
                    return false;
                };
                if matches!(
                    resolved
                        .iter()
                        .map(String::as_str)
                        .collect::<Vec<_>>()
                        .as_slice(),
                    ["std" | "core", "any", "Any"]
                ) {
                    if any {
                        return false;
                    }
                    any = true;
                } else if !is_standard_type_path(&resolved, "Send")
                    && !is_standard_type_path(&resolved, "Sync")
                {
                    return false;
                }
            }
            syn::TypeParamBound::Lifetime(_) => {}
            _ => return false,
        }
    }
    return any;
}

fn type_contains_nullable(
    rust_type: &Type,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_types: &HashSet<String>,
) -> Result<bool, CompileError> {
    return Ok(
        emit_type_with_aliases(rust_type, entities, aliases, nullable_types)?.contains(" | null"),
    );
}

fn external_identity_aliases(
    external_alias_programs: &[(BTreeMap<String, String>, &str)],
) -> Result<BTreeMap<String, ExternalIdentityAlias>, CompileError> {
    let mut aliases = BTreeMap::new();
    for (identity_aliases, module) in external_alias_programs {
        for (name, tag) in identity_aliases {
            if aliases
                .insert(
                    name.clone(),
                    ExternalIdentityAlias {
                        module: (*module).to_string(),
                        tag: tag.clone(),
                    },
                )
                .is_some()
            {
                return Err(compile_error(format!(
                    "external identity alias `{name}` is declared by more than one source"
                )));
            }
        }
    }
    return Ok(aliases);
}

fn identity_alias_marker(name: &str, tag: &str) -> String {
    return format!("{IDENTITY_ALIAS_MARKER}{name}:{tag}");
}

fn identity_alias_tag<'a>(context: &'a HashSet<String>, name: &str) -> Option<&'a str> {
    let prefix = format!("{IDENTITY_ALIAS_MARKER}{name}:");
    return context
        .iter()
        .find_map(|marker| marker.strip_prefix(&prefix));
}

fn used_identity_aliases(
    program: &Program,
    aliases: &BTreeMap<String, ExternalIdentityAlias>,
) -> BTreeSet<String> {
    struct Collector<'a> {
        aliases: &'a BTreeMap<String, ExternalIdentityAlias>,
        names: BTreeSet<String>,
    }

    impl<'ast> Visit<'ast> for Collector<'_> {
        fn visit_type_path(&mut self, rust_type: &'ast syn::TypePath) {
            if let Some(segment) = rust_type.path.segments.last() {
                let name = segment.ident.to_string();
                if self.aliases.contains_key(&name) {
                    self.names.insert(name);
                }
            }
            syn::visit::visit_type_path(self, rust_type);
        }
    }

    let mut collector = Collector {
        aliases,
        names: BTreeSet::new(),
    };
    for constant in &program.constants {
        collector.visit_item_const(constant);
    }
    for rust_enum in &program.enums {
        collector.visit_item_enum(rust_enum);
    }
    for function in &program.functions {
        collector.visit_item_fn(function);
    }
    for rust_static in &program.statics {
        collector.visit_item_static(rust_static);
    }
    for structure in &program.structs {
        collector.visit_item_struct(structure);
    }
    for type_alias in &program.type_aliases {
        collector.visit_item_type(type_alias);
    }
    return collector.names;
}

pub(super) fn collect_cross_crate_use_tree(
    tree: &syn::UseTree,
    prefix: &mut Vec<String>,
    symbols: &mut BTreeMap<String, CrossCrateSymbol>,
) {
    let mut record = |imported: String, local: String| {
        let Some(root) = prefix.first() else {
            return;
        };
        let Some(package) = root.strip_prefix("flight_") else {
            return;
        };
        symbols.insert(
            local.clone(),
            CrossCrateSymbol {
                imported,
                local,
                module: format!("@flighthq/{}/contract", package.replace('_', "-")),
            },
        );
    };
    match tree {
        syn::UseTree::Name(name) if name.ident == "self" => {
            if let Some(imported) = prefix.last() {
                record(imported.clone(), imported.clone());
            }
        }
        syn::UseTree::Name(name) => {
            let name = name.ident.to_string();
            record(name.clone(), name);
        }
        syn::UseTree::Rename(rename) => {
            record(rename.ident.to_string(), rename.rename.to_string());
        }
        syn::UseTree::Path(path) => {
            prefix.push(path.ident.to_string());
            collect_cross_crate_use_tree(&path.tree, prefix, symbols);
            prefix.pop();
        }
        syn::UseTree::Group(group) => {
            for item in &group.items {
                collect_cross_crate_use_tree(item, prefix, symbols);
            }
        }
        syn::UseTree::Glob(_) => {}
    }
}

// Lowers `if let (P0, P1, ..) = (e0, e1, ..)` over data union patterns into one conjunction of
// runtime predicates plus the bindings the patterns introduce; `None` when the condition is not a
// tuple `let`.
fn emit_data_union_tuple_binding(
    condition: &Expr,
    entities: &HashSet<String>,
) -> Result<Option<(String, Vec<(String, String)>)>, CompileError> {
    let Expr::Let(binding) = condition else {
        return Ok(None);
    };
    let Pat::Tuple(patterns) = binding.pat.as_ref() else {
        return Ok(None);
    };
    let Expr::Tuple(values) = binding.expr.as_ref() else {
        return Err(compile_error(
            "portable tuple `if let` needs a tuple expression of the same length",
        ));
    };
    if patterns.elems.len() != values.elems.len() {
        return Err(compile_error(
            "portable tuple `if let` needs a tuple expression of the same length",
        ));
    }
    let mut predicates = Vec::new();
    let mut bindings = Vec::new();
    for (pattern, value) in patterns.elems.iter().zip(&values.elems) {
        if !expression_is_reusable(value) {
            return Err(compile_error(
                "portable tuple `if let` elements must be locals, fields, or literals",
            ));
        }
        let text = emit_expression(value, entities)?;
        let Some(test) = data_union_pattern_test(pattern, &text, entities)? else {
            return Err(compile_error(
                "portable tuple `if let` supports only data union variant patterns, bindings, and `_`",
            ));
        };
        predicates.extend(test.predicate);
        bindings.extend(test.bindings);
    }
    if predicates.is_empty() {
        return Err(compile_error(
            "portable tuple `if let` needs at least one data union variant pattern",
        ));
    }
    return Ok(Some((predicates.join(" && "), bindings)));
}

// An import of a dependency item: its TypeScript name follows the owner's `export-name` mapping, and an
// unrenamed import binds that same name locally.
fn import_specifier(symbol: &CrossCrateSymbol, context: &HashSet<String>) -> String {
    let imported = dependency_export_name(context, &symbol.module, &symbol.imported)
        .map_or_else(|| emit_path_segment(&symbol.imported), str::to_string);
    if let Some((owner, _)) = imported.split_once('.') {
        return owner.to_string();
    }
    let local = if symbol.local == symbol.imported {
        imported.clone()
    } else {
        emit_path_segment(&symbol.local)
    };
    if imported == local {
        return imported;
    }
    return format!("{imported} as {local}");
}

pub(crate) fn is_lowered_cross_crate_type(name: &str) -> bool {
    return matches!(
        name,
        "EntityRuntimeSlot"
            | "Float32Array"
            | "Float64Array"
            | "Int8Array"
            | "Int16Array"
            | "Int32Array"
            | "Ref"
            | "Uint8Array"
            | "Uint16Array"
            | "Uint32Array"
            | "UnknownValue"
    );
}

pub(crate) fn is_lowered_cross_crate_value(name: &str) -> bool {
    return matches!(
        name,
        "allocate_entity" | "AtomicU32" | "Ordering" | "Ref" | "throw_error" | "throw_range_error"
    );
}

// `matches!(value, pattern [if guard] [,])`: the value, the pattern (`|` alternatives and `ref`
// bindings included) and the optional guard, as the emitter and import discovery both read them.
fn parse_matches_arguments(rust_macro: &syn::Macro) -> syn::Result<(Expr, Pat, Option<Expr>)> {
    let parser = |input: syn::parse::ParseStream<'_>| {
        let value = input.parse::<Expr>()?;
        input.parse::<Token![,]>()?;
        let pattern = Pat::parse_multi_with_leading_vert(input)?;
        let guard = if input.peek(Token![if]) {
            input.parse::<Token![if]>()?;
            Some(input.parse::<Expr>()?)
        } else {
            None
        };
        if input.peek(Token![,]) {
            input.parse::<Token![,]>()?;
        }
        return Ok((value, pattern, guard));
    };
    return parser.parse2(rust_macro.tokens.clone());
}

// `vec![value; length]`: the repeated value and the length.
fn parse_vec_repeat(rust_macro: &syn::Macro) -> syn::Result<(Expr, Expr)> {
    let parser = |input: syn::parse::ParseStream<'_>| {
        let value = input.parse::<Expr>()?;
        input.parse::<Token![;]>()?;
        let length = input.parse::<Expr>()?;
        if !input.is_empty() {
            return Err(input.error("unexpected tokens after `vec!` repeat length"));
        }
        return Ok((value, length));
    };
    return parser.parse2(rust_macro.tokens.clone());
}

// A macro body (`assert!`, `assert_eq!`, `vec!`, …) is opaque tokens to the syntax visitor, but the
// emitter lowers its arguments as expressions; parsing them records the foreign items they use.
fn visit_cross_crate_macro_arguments(
    collector: &mut CrossCrateUsageCollector<'_>,
    mac: &syn::Macro,
) {
    if mac.path.is_ident("matches")
        && let Ok((value, pattern, guard)) = parse_matches_arguments(mac)
    {
        Visit::visit_expr(collector, &value);
        Visit::visit_pat(collector, &pattern);
        if let Some(guard) = &guard {
            Visit::visit_expr(collector, guard);
        }
        return;
    }
    if mac.path.is_ident("vec")
        && let Ok((value, length)) = parse_vec_repeat(mac)
    {
        Visit::visit_expr(collector, &value);
        Visit::visit_expr(collector, &length);
        return;
    }
    if let Ok(arguments) = mac.parse_body_with(Punctuated::<Expr, syn::Token![,]>::parse_terminated)
    {
        for argument in &arguments {
            Visit::visit_expr(collector, argument);
        }
    }
}

fn cross_crate_symbols(uses: &[syn::ItemUse]) -> BTreeMap<String, CrossCrateSymbol> {
    let mut symbols = BTreeMap::new();
    for item_use in uses {
        collect_cross_crate_use_tree(&item_use.tree, &mut Vec::new(), &mut symbols);
    }
    return symbols;
}

fn test_cross_crate_symbols(
    uses: &[syn::ItemUse],
    context: &HashSet<String>,
) -> BTreeMap<String, CrossCrateSymbol> {
    let mut symbols = cross_crate_symbols(uses);
    symbols.retain(|local, _| {
        !context.contains(&format!("{VITEST_LOCAL_MODULE_ALIAS_MARKER}{local}"))
    });
    return symbols;
}

fn validate_test_foreign_crate_aliases(
    uses: &[syn::ItemUse],
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    fn collect(
        tree: &syn::UseTree,
        prefix: &mut Vec<String>,
        aliases: &mut BTreeSet<(String, String)>,
    ) {
        match tree {
            syn::UseTree::Rename(rename) if prefix.is_empty() => {
                aliases.insert((rename.ident.to_string(), rename.rename.to_string()));
            }
            syn::UseTree::Rename(rename) if rename.ident == "self" && prefix.len() == 1 => {
                aliases.insert((prefix[0].clone(), rename.rename.to_string()));
            }
            syn::UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                collect(&path.tree, prefix, aliases);
                prefix.pop();
            }
            syn::UseTree::Group(group) => {
                for tree in &group.items {
                    collect(tree, prefix, aliases);
                }
            }
            syn::UseTree::Glob(_) | syn::UseTree::Name(_) | syn::UseTree::Rename(_) => {}
        }
    }

    let mut aliases = BTreeSet::new();
    for item_use in uses {
        collect(&item_use.tree, &mut Vec::new(), &mut aliases);
    }
    for (root, alias) in aliases {
        if root.starts_with("flight_") && vitest_current_path_prefix(context, &root).is_none() {
            return Err(compile_error(format!(
                "portable test foreign Flight crate `{root}` is imported as namespace alias `{alias}`, which cannot be lowered to a tree-shakeable contract import; import the used items explicitly"
            )));
        }
    }
    return Ok(());
}

fn mixed_foreign_wildcard_roots(
    uses: &[syn::ItemUse],
    context: &HashSet<String>,
) -> BTreeSet<String> {
    let rules = provenance_import_rules(uses.iter(), None);
    let is_local = |module: &str| {
        module
            .split("::")
            .next()
            .is_some_and(|root| vitest_current_path_prefix(context, root).is_some())
    };
    if !rules
        .iter()
        .any(|rule| matches!(rule, ProvenanceImportRule::Wildcard { module } if is_local(module)))
    {
        return BTreeSet::new();
    }
    return rules
        .into_iter()
        .filter_map(|rule| match rule {
            ProvenanceImportRule::Wildcard { module } if !is_local(&module) => {
                module.split("::").next().map(str::to_string)
            }
            ProvenanceImportRule::Wildcard { .. } | ProvenanceImportRule::Explicit { .. } => None,
        })
        .collect();
}

pub(crate) fn test_mixed_foreign_wildcard_roots(
    program: &TestProgram,
    context: &HashSet<String>,
) -> BTreeSet<String> {
    let mut roots = mixed_foreign_wildcard_roots(&program.uses, context);
    for suite in &program.suites {
        let mut suite_context = context.clone();
        insert_vitest_import_alias_context(&mut suite_context, suite.uses.iter());
        roots.extend(mixed_foreign_wildcard_roots(&suite.uses, &suite_context));
    }
    return roots;
}

fn finish_cross_crate_imports(
    collector: CrossCrateUsageCollector<'_>,
    context: &HashSet<String>,
) -> (
    BTreeMap<String, BTreeSet<String>>,
    BTreeMap<String, BTreeSet<String>>,
) {
    let CrossCrateUsageCollector {
        context: _,
        symbols,
        mut type_names,
        value_names,
        ..
    } = collector;
    type_names.retain(|name| !value_names.contains(name));
    let mut value_imports = BTreeMap::<String, BTreeSet<String>>::new();
    let mut type_imports = BTreeMap::<String, BTreeSet<String>>::new();
    for (names, imports) in [
        (value_names, &mut value_imports),
        (type_names, &mut type_imports),
    ] {
        for name in names {
            let symbol = symbols
                .get(&name)
                .expect("collected cross-crate use came from the import map");
            imports
                .entry(symbol.module.clone())
                .or_default()
                .insert(import_specifier(symbol, context));
        }
    }
    return (value_imports, type_imports);
}

fn cross_crate_imports(
    program: &Program,
    context: &HashSet<String>,
) -> (
    BTreeMap<String, BTreeSet<String>>,
    BTreeMap<String, BTreeSet<String>>,
) {
    let symbols = cross_crate_symbols(&program.uses);
    let mut collector = CrossCrateUsageCollector {
        context,
        symbols: &symbols,
        struct_literals_are_types: false,
        type_names: BTreeSet::new(),
        value_names: BTreeSet::new(),
    };
    for constant in &program.constants {
        collector.visit_item_const(constant);
    }
    for rust_enum in &program.enums {
        collector.visit_item_enum(rust_enum);
    }
    for function in &program.functions {
        collector.visit_item_fn(function);
    }
    for rust_static in &program.statics {
        collector.visit_item_static(rust_static);
    }
    for structure in &program.structs {
        let module_private_plain_data =
            !is_public(&structure.vis) && !program.entities.contains(&structure.ident.to_string());
        for field in &structure.fields {
            if module_private_plain_data || is_public(&field.vis) {
                collector.visit_type(&field.ty);
            }
        }
    }
    for type_alias in &program.type_aliases {
        collector.visit_item_type(type_alias);
    }

    return finish_cross_crate_imports(collector, context);
}

pub(crate) fn test_cross_crate_imports(
    program: &TestProgram,
    context: &HashSet<String>,
) -> Result<
    (
        BTreeMap<String, BTreeSet<String>>,
        BTreeMap<String, BTreeSet<String>>,
    ),
    CompileError,
> {
    fn merge_imports(
        target: &mut BTreeMap<String, BTreeSet<String>>,
        source: BTreeMap<String, BTreeSet<String>>,
    ) {
        for (module, names) in source {
            target.entry(module).or_default().extend(names);
        }
    }

    fn record_bindings(
        imports: &BTreeMap<String, BTreeSet<String>>,
        bindings: &mut BTreeMap<String, (String, String)>,
    ) -> Result<(), CompileError> {
        for (module, specifiers) in imports {
            for specifier in specifiers {
                let local = specifier
                    .rsplit_once(" as ")
                    .map_or(specifier.as_str(), |(_, local)| local);
                let Some((previous_module, previous_specifier)) = bindings.get(local) else {
                    bindings.insert(local.to_string(), (module.clone(), specifier.clone()));
                    continue;
                };
                if previous_module != module || previous_specifier != specifier {
                    return Err(compile_error(format!(
                        "portable test modules import TypeScript binding `{local}` from both `{previous_specifier}` in `{previous_module}` and `{specifier}` in `{module}`; use distinct Rust import aliases"
                    )));
                }
            }
        }
        return Ok(());
    }

    validate_test_foreign_crate_aliases(&program.uses, context)?;
    let top_level_symbols = test_cross_crate_symbols(&program.uses, context);
    let mut collector = CrossCrateUsageCollector {
        context,
        symbols: &top_level_symbols,
        struct_literals_are_types: true,
        type_names: BTreeSet::new(),
        value_names: BTreeSet::new(),
    };
    for constant in &program.constants {
        collector.visit_item_const(constant);
    }
    for function in &program.helpers {
        collector.visit_item_fn(function);
    }
    for structure in &program.structs {
        collector.visit_item_struct(structure);
    }
    for type_alias in &program.type_aliases {
        collector.visit_item_type(type_alias);
    }
    let (mut value_imports, mut type_imports) = finish_cross_crate_imports(collector, context);
    let mut bindings = BTreeMap::new();
    record_bindings(&value_imports, &mut bindings)?;
    record_bindings(&type_imports, &mut bindings)?;
    for suite in &program.suites {
        let mut suite_context = context.clone();
        insert_vitest_import_alias_context(&mut suite_context, suite.uses.iter());
        validate_test_foreign_crate_aliases(&suite.uses, &suite_context)?;
        let mut symbols = top_level_symbols.clone();
        symbols.extend(test_cross_crate_symbols(&suite.uses, &suite_context));
        let mut collector = CrossCrateUsageCollector {
            context: &suite_context,
            symbols: &symbols,
            struct_literals_are_types: true,
            type_names: BTreeSet::new(),
            value_names: BTreeSet::new(),
        };
        for function in suite
            .helpers
            .iter()
            .chain(suite.tests.iter().map(|test| &test.function))
        {
            collector.visit_item_fn(function);
        }
        let (suite_value_imports, suite_type_imports) =
            finish_cross_crate_imports(collector, &suite_context);
        record_bindings(&suite_value_imports, &mut bindings)?;
        record_bindings(&suite_type_imports, &mut bindings)?;
        merge_imports(&mut value_imports, suite_value_imports);
        merge_imports(&mut type_imports, suite_type_imports);
    }
    for (module, values) in &value_imports {
        if let Some(types) = type_imports.get_mut(module) {
            types.retain(|name| !values.contains(name));
        }
    }
    type_imports.retain(|_, names| !names.is_empty());
    return Ok((value_imports, type_imports));
}

// flight-lint: allow(hashmap-iteration) Program constants are a Vec retained in Rust source order; the rule's name heuristic cannot see the field type across modules
pub(crate) fn emit_program(input: &EmitProgramInput) -> Result<String, CompileError> {
    let program = input.program;
    let entity_module = input.entity_module;
    let alias_programs = input.alias_programs;
    let external_alias_programs = input.external_alias_programs;
    let external_nullable_programs = input.external_nullable_programs;
    let external_record_structs = input.external_record_structs;
    let dependency_export_names = input.dependency_export_names;
    let external_string_unions = input.external_string_unions;
    let module_identities = input.module_identities;
    let visibility_programs = input.visibility_programs;
    let visibility_identities = input.visibility_identities;
    let source_paths = input.source_paths;
    let external_shared_identity_fields = input.external_shared_identity_fields;
    let programs = std::iter::once(program)
        .chain(alias_programs)
        .collect::<Vec<_>>();
    let uses_allocate_entity = program
        .functions
        .iter()
        .any(|function| expression_contains_path(&function.block, "allocate_entity"));
    let aliases = preferred_aliases(program, alias_programs)?;
    let external_identity_aliases = external_identity_aliases(external_alias_programs)?;
    let used_identity_aliases = used_identity_aliases(program, &external_identity_aliases);
    let mut identity_context = HashSet::new();
    for (name, alias) in &external_identity_aliases {
        identity_context.insert(identity_alias_marker(name, &alias.tag));
    }
    insert_external_nullable_option_context(&mut identity_context, external_nullable_programs);
    // Full module identities when the caller supplies them; otherwise synthetic keys, under which each
    // source resolves only its own declarations.
    let program_modules = match module_identities {
        Some(identities) if identities.len() == programs.len() => identities.to_vec(),
        _ => (0..programs.len())
            .map(|index| format!("typescript-source/{index}"))
            .collect::<Vec<_>>(),
    };
    let program_sources = program_modules
        .iter()
        .zip(&programs)
        .map(|(module, program)| (module.as_str(), *program))
        .collect::<Vec<_>>();
    insert_external_nullable_import_context(
        &mut identity_context,
        &program_modules[0],
        program,
        external_nullable_programs,
    );
    let mut type_context = identity_context.clone();
    type_context.extend(external_shared_identity_fields.iter().cloned());
    let mut expression_context = generation_context_with_types(
        &program_sources,
        external_record_structs,
        &type_context,
        None,
        false,
    )?;
    insert_string_union_context(&mut expression_context, external_string_unions.iter());
    expression_context.insert(format!("{CURRENT_SOURCE_MARKER}{}", program_modules[0]));
    reject_const_group_wildcard_imports(
        dependency_export_names,
        &foreign_wildcard_modules(&program.uses.iter().collect::<Vec<_>>()),
    )?;
    insert_dependency_export_name_context(
        &mut expression_context,
        dependency_export_names,
        &cross_crate_symbols(&program.uses),
        &[],
        &program.functions.iter().collect::<Vec<_>>(),
        &program.constants.iter().collect::<Vec<_>>(),
        &program.statics.iter().collect::<Vec<_>>(),
    )?;
    insert_std_mem_import_context(
        &mut expression_context,
        program.uses.iter(),
        program
            .functions
            .iter()
            .map(|function| function.sig.ident.to_string()),
    );
    insert_program_type_path_context(&mut expression_context, program);
    let (mut value_imports, mut type_imports) = cross_crate_imports(program, &expression_context);
    let entity_construction_parameters = program
        .functions
        .iter()
        .map(|function| {
            return initializes_readonly_entity(
                function,
                &program.entities,
                &program.readonly_structs,
            ) || initializes_resolved_readonly_entity(function, &expression_context);
        })
        .collect::<Vec<_>>();
    let uses_entity_construction = entity_construction_parameters.contains(&true);
    let mut source_context = expression_context.clone();
    if program.nullable_options {
        source_context.insert(NULLABLE_OPTIONS_MARKER.to_string());
    }
    let nullable_types = nullable_guard_types(&programs, &aliases, &expression_context)?;
    let nullable_static_names = program
        .statics
        .iter()
        .filter_map(|rust_static| {
            type_contains_nullable(&rust_static.ty, &source_context, &aliases, &nullable_types)
                .ok()
                .filter(|contains| *contains)
                .map(|_| rust_static.ident.to_string())
        })
        .collect::<HashSet<_>>();
    let mut out = String::new();

    let entity_module =
        if uses_allocate_entity || uses_entity_construction || !program.entities.is_empty() {
            Some(entity_module.ok_or_else(|| {
            compile_error(
                "this Rust module uses entity runtime types; provide a TypeScript entity module",
            )
        })?)
        } else {
            None
        };
    if uses_allocate_entity {
        value_imports
            .entry(
                entity_module
                    .expect("entity module was required")
                    .to_string(),
            )
            .or_default()
            .insert("allocateEntity".to_string());
    }
    validate_dependency_export_name_bindings(
        &expression_context,
        &program_value_bindings(program, &expression_context),
        &value_imports,
    )?;
    if !program.entities.is_empty() {
        type_imports
            .entry(
                entity_module
                    .expect("entity module was required")
                    .to_string(),
            )
            .or_default()
            .insert("EntityRaw".to_string());
    }
    if uses_entity_construction {
        type_imports
            .entry(
                entity_module
                    .expect("entity module was required")
                    .to_string(),
            )
            .or_default()
            .insert("EntityConstruction".to_string());
    }
    for name in used_identity_aliases {
        let alias = external_identity_aliases
            .get(&name)
            .expect("used identity alias came from the external alias map");
        type_imports
            .entry(alias.module.clone())
            .or_default()
            .insert(name);
    }
    reject_entity_runtime_state_store_collisions(program, &programs)?;
    let source_identities = (0..programs.len())
        .map(|index| {
            module_identities
                .and_then(|identities| identities.get(index))
                .cloned()
        })
        .chain(visibility_identities.iter().cloned())
        .collect::<Vec<_>>();
    reject_unsafe_lazy_lock_initializers(
        program,
        &programs,
        visibility_programs,
        &source_identities,
        source_paths,
    )?;
    reject_unsupported_array_like_uses(program, &expression_context)?;
    // The body is emitted before the imports so the package-internal state stores it actually reads
    // or writes can be imported from their declaring sibling modules.
    let mut body = String::new();
    if program.standard_constants.contains("PI") {
        body.push_str("const PI = Math.PI;\n\n");
    }

    for rust_enum in &program.enums {
        emit_enum(
            &mut body,
            rust_enum,
            program
                .string_unions
                .get(&rust_enum.ident.to_string())
                .copied(),
            program
                .string_union_values
                .get(&rust_enum.ident.to_string()),
            program.numeric_unions.get(&rust_enum.ident.to_string()),
            program.data_unions.contains(&rust_enum.ident.to_string()),
            &source_context,
        )?;
        body.push('\n');
    }
    for type_alias in &program.type_aliases {
        emit_type_alias(
            &mut body,
            type_alias,
            &source_context,
            program
                .callable_parameters
                .get(&type_alias.ident.to_string())
                .map(Vec::as_slice),
        )?;
        body.push('\n');
    }
    for structure in &program.structs {
        emit_struct(
            &mut body,
            structure,
            &source_context,
            &aliases,
            &program.callable_field_parameters,
            program
                .readonly_structs
                .contains(&structure.ident.to_string()),
        )?;
        body.push('\n');
    }
    let group_members =
        crate::model::const_group_members(&program.const_groups, &program.constants)?;
    let mut emitted_groups = BTreeSet::new();
    for constant in &program.constants {
        let rust_name = constant.ident.to_string();
        if let Some((_, owner, _)) = group_members.iter().find(|(name, _, _)| *name == rust_name) {
            if emitted_groups.insert(owner.clone()) {
                emit_const_group(
                    &mut body,
                    owner,
                    &group_members,
                    &program.constants,
                    &source_context,
                )?;
                body.push('\n');
            }
            continue;
        }
        emit_constant(
            &mut body,
            constant,
            &source_context,
            program.frozen_objects.get(&rust_name).map(String::as_str),
        )?;
        body.push('\n');
    }
    for rust_static in &program.statics {
        emit_static(
            &mut body,
            rust_static,
            &source_context,
            &aliases,
            &nullable_types,
        )?;
        body.push('\n');
    }
    for (index, function) in program.functions.iter().enumerate() {
        let entity_construction_parameter = entity_construction_parameters[index];
        emit_function(
            &mut body,
            function,
            &source_context,
            &aliases,
            &nullable_static_names,
            entity_construction_parameter,
        )?;
        if index + 1 < program.functions.len() {
            body.push('\n');
        }
    }
    emit_entity_runtime_state_stores(&mut body, program, &source_context)?;
    for (store, module) in entity_runtime_state_store_imports(&body, &programs, &program_modules)? {
        value_imports.entry(module).or_default().insert(store);
    }
    for (module, names) in &value_imports {
        writeln!(
            out,
            "import {{ {} }} from {:?};",
            names.iter().cloned().collect::<Vec<_>>().join(", "),
            module
        )
        .expect("writing to a String cannot fail");
    }
    for (module, names) in &type_imports {
        writeln!(
            out,
            "import type {{ {} }} from {:?};",
            names.iter().cloned().collect::<Vec<_>>().join(", "),
            module
        )
        .expect("writing to a String cannot fail");
    }
    if !value_imports.is_empty() || !type_imports.is_empty() {
        out.push('\n');
    }
    out.push_str(&body);
    return Ok(out);
}

fn emit_single_expression_block(
    block: &syn::Block,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let [Stmt::Expr(expression, _)] = block.stmts.as_slice() else {
        return Err(compile_error(
            "Rust value block must contain exactly one expression",
        ));
    };
    return emit_expression(expression, entities);
}

fn emit_single_generic_type(
    segment: &syn::PathSegment,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return Err(compile_error(format!(
            "`{}` needs one type argument",
            segment.ident
        )));
    };
    let types = arguments
        .args
        .iter()
        .filter_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(rust_type),
            _ => None,
        })
        .collect::<Vec<_>>();
    if types.len() != 1 {
        return Err(compile_error(format!(
            "`{}` needs exactly one type argument",
            segment.ident
        )));
    }
    return emit_type(types[0], entities);
}

fn emit_statement(
    out: &mut String,
    statement: &Stmt,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    match statement {
        Stmt::Local(local) => emit_local(out, local, entities, indent)?,
        Stmt::Expr(Expr::Call(call), _) if throw_call(call).is_some() => {
            let (constructor, message) = throw_call(call).expect("guarded by the match condition");
            write_indent(out, indent);
            writeln!(
                out,
                "throw new {constructor}({});",
                emit_expression(message, entities)?
            )
            .expect("writing to a String cannot fail");
        }
        Stmt::Expr(Expr::If(if_expression), _) => {
            let then_context = if let Expr::Let(binding) = if_expression.cond.as_ref() {
                lexical_pattern_context(entities, &binding.pat)
            } else {
                entities.clone()
            };
            let tuple_binding = emit_data_union_tuple_binding(&if_expression.cond, entities)?;
            let option_binding = if tuple_binding.is_some() {
                None
            } else {
                emit_option_binding(&if_expression.cond, entities)?
            };
            if let Some(binding) = &option_binding
                && emit_receiver_preserving_optional_call(
                    out,
                    if_expression,
                    binding,
                    entities,
                    indent,
                )?
            {
                return Ok(());
            }
            let outer_indent = indent;
            let (indent, wrapped) = if let Some(binding) = &option_binding {
                begin_option_if(
                    out,
                    indent,
                    binding,
                    option_scrutinee_is_rereadable(&if_expression.cond),
                )
            } else {
                write_indent(out, indent);
                if let Some((condition, _)) = &tuple_binding {
                    writeln!(out, "if ({condition}) {{").expect("writing to a String cannot fail");
                } else {
                    writeln!(
                        out,
                        "if ({}) {{",
                        emit_expression(&if_expression.cond, entities)?
                    )
                    .expect("writing to a String cannot fail");
                }
                (indent, false)
            };
            for (name, value) in tuple_binding
                .map(|(_, bindings)| bindings)
                .unwrap_or_default()
            {
                write_indent(out, indent + 1);
                writeln!(out, "const {name} = {value};").expect("writing to a String cannot fail");
            }
            emit_block(
                out,
                &if_expression.then_branch.stmts,
                &then_context,
                indent + 1,
            )?;
            write_indent(out, indent);
            if let Some((_, otherwise)) = &if_expression.else_branch {
                out.push_str("} else {");
                out.push('\n');
                match otherwise.as_ref() {
                    Expr::Block(block) => {
                        emit_block(out, &block.block.stmts, entities, indent + 1)?;
                    }
                    Expr::If(nested) => {
                        emit_statement(
                            out,
                            &Stmt::Expr(Expr::If(nested.clone()), None),
                            entities,
                            indent + 1,
                        )?;
                    }
                    _ => {
                        return Err(compile_error("unsupported non-block else expression"));
                    }
                }
                write_indent(out, indent);
                out.push_str("}\n");
            } else {
                out.push_str("}\n");
            }
            if wrapped {
                write_indent(out, outer_indent);
                out.push_str("}\n");
            }
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "extend" || call.method == "extend_from_slice" =>
        {
            emit_vec_extend_statement(out, call, entities, indent)?;
        }
        Stmt::Expr(Expr::ForLoop(loop_expression), _) => {
            let loop_context = lexical_pattern_context(entities, &loop_expression.pat);
            write_indent(out, indent);
            writeln!(
                out,
                "for ({}) {{",
                emit_for_header(&loop_expression.pat, &loop_expression.expr, entities)?
            )
            .expect("writing to a String cannot fail");
            emit_block(out, &loop_expression.body.stmts, &loop_context, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::While(loop_expression), _) => {
            let loop_context = if let Expr::Let(binding) = loop_expression.cond.as_ref() {
                lexical_pattern_context(entities, &binding.pat)
            } else {
                entities.clone()
            };
            let option_binding = emit_option_binding(&loop_expression.cond, entities)?;
            if let Some(binding) = &option_binding {
                begin_option_while(
                    out,
                    indent,
                    binding,
                    option_scrutinee_is_rereadable(&loop_expression.cond),
                );
            } else {
                write_indent(out, indent);
                writeln!(
                    out,
                    "while ({}) {{",
                    emit_expression(&loop_expression.cond, entities)?
                )
                .expect("writing to a String cannot fail");
            }
            emit_block(out, &loop_expression.body.stmts, &loop_context, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Loop(loop_expression), _) => {
            write_indent(out, indent);
            out.push_str("for (;;) {\n");
            emit_block(out, &loop_expression.body.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Match(match_expression), _) => {
            emit_match_statement(out, match_expression, entities, indent)?;
        }
        Stmt::Expr(Expr::Break(_), _) => {
            write_indent(out, indent);
            out.push_str("break;\n");
        }
        Stmt::Expr(Expr::Continue(_), _) => {
            write_indent(out, indent);
            out.push_str("continue;\n");
        }
        Stmt::Expr(Expr::Return(return_expression), _) => {
            write_indent(out, indent);
            if let Some(value) = &return_expression.expr {
                let returned = value.as_ref();
                let mut value = if expression_is_path_call(value, "allocate_entity") {
                    let return_type = entities
                        .iter()
                        .find_map(|marker| marker.strip_prefix(RETURN_TYPE_MARKER))
                        .ok_or_else(|| {
                            compile_error("allocate_entity return needs an explicit Rust type")
                        })?;
                    entity_allocation(return_type, entities)?
                } else if let Some(array_type) =
                    unique_marker_suffix(entities, RETURNS_TYPED_ARRAY_MARKER)
                    && matches!(
                        peel_reference_and_paren(returned),
                        Expr::Array(_) | Expr::Repeat(_)
                    )
                {
                    typed_array_literal(peel_reference_and_paren(returned), &array_type, entities)?
                } else {
                    emit_expression(value, entities)?
                };
                if entities.contains(RETURNS_U32_MARKER) {
                    value = format!("({value}) >>> 0");
                }
                if entities.contains(RETURNS_NULLABLE_MARKER) {
                    value = nullable_option_value(returned, value);
                }
                writeln!(out, "return {value};").expect("writing to a String cannot fail");
            } else {
                out.push_str("return;\n");
            }
        }
        Stmt::Expr(Expr::Call(call), _)
            if std_mem_function(&call.func, entities).as_deref() == Some("swap") =>
        {
            if call.args.len() != 2 {
                return Err(compile_error(
                    "std::mem::swap requires exactly two arguments",
                ));
            }
            let a = emit_expression(&call.args[0], entities)?;
            let b = emit_expression(&call.args[1], entities)?;
            write_indent(out, indent);
            writeln!(out, "[{a}, {b}] = [{b}, {a}];").expect("writing to a String cannot fail");
        }
        Stmt::Expr(expression, _) => {
            write_indent(out, indent);
            writeln!(out, "{};", emit_expression(expression, entities)?)
                .expect("writing to a String cannot fail");
        }
        Stmt::Item(_) => {
            return Err(compile_error(
                "unsupported item declaration inside function body",
            ));
        }
        Stmt::Macro(statement)
            if statement
                .mac
                .path
                .segments
                .last()
                .is_some_and(|name| name.ident == "unreachable") =>
        {
            write_indent(out, indent);
            writeln!(
                out,
                "throw new Error({});",
                emit_unreachable_message(&statement.mac, entities)?
            )
            .expect("writing to a String cannot fail");
        }
        Stmt::Macro(_) => {
            return Err(compile_error(
                "unsupported macro statement inside function body",
            ));
        }
    }
    return Ok(());
}

fn emit_static(
    out: &mut String,
    rust_static: &syn::ItemStatic,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    nullable_types: &HashSet<String>,
) -> Result<(), CompileError> {
    emit_documentation(out, &rust_static.attrs, 0);
    let export = if is_public(&rust_static.vis) {
        "export "
    } else {
        ""
    };
    let rust_name = rust_static.ident.to_string();
    let name = export_name(entities, &rust_name).unwrap_or(&rust_name);
    // A `LazyLock` static is initialized once, eagerly, when the module loads: `T` from `init()`.
    if let Some((inner, initializer)) = crate::model::lazy_lock_static(rust_static) {
        let typescript_type = emit_type_with_aliases(inner, entities, aliases, nullable_types)?;
        let value = match initializer {
            Expr::Path(_) => format!("{}()", emit_expression(initializer, entities)?),
            Expr::Closure(closure) if !matches!(closure.body.as_ref(), Expr::Block(_)) => {
                emit_expression(&closure.body, entities)?
            }
            _ => format!("({})()", emit_expression(initializer, entities)?),
        };
        writeln!(out, "{export}const {name}: {typescript_type} = {value};")
            .expect("writing to a String cannot fail");
        return Ok(());
    }
    let typescript_type =
        emit_type_with_aliases(&rust_static.ty, entities, aliases, nullable_types)?;
    let mut value = emit_expression(&rust_static.expr, entities)?;
    if typescript_type.contains(" | null") {
        value = value.replace("undefined", "null");
    }
    writeln!(out, "{export}const {name}: {typescript_type} = {value};")
        .expect("writing to a String cannot fail");
    return Ok(());
}

fn emit_struct(
    out: &mut String,
    structure: &ItemStruct,
    entities: &HashSet<String>,
    aliases: &PreferredAliases,
    callable_field_parameters: &BTreeMap<(String, String), Vec<String>>,
    readonly: bool,
) -> Result<(), CompileError> {
    emit_documentation(out, &structure.attrs, 0);
    let rust_name = structure.ident.to_string();
    let entity = entities.contains(&rust_name);
    let name = if entity {
        format!("{rust_name}Raw")
    } else {
        rust_name
    };
    let export = if is_public(&structure.vis) {
        "export "
    } else {
        ""
    };
    let module_private_plain_data = !is_public(&structure.vis) && !entity;
    let extension = if entity { " extends EntityRaw" } else { "" };
    let type_parameters = emit_type_parameters(&structure.generics);
    let mut type_context = entities.clone();
    insert_type_parameter_context(&mut type_context, &structure.generics);
    writeln!(
        out,
        "{export}interface {name}{type_parameters}{extension} {{"
    )
    .expect("writing to a String cannot fail");
    for field in &structure.fields {
        if !module_private_plain_data && !is_public(&field.vis) {
            continue;
        }
        emit_documentation(out, &field.attrs, 1);
        let Some(field_name) = &field.ident else {
            return Err(compile_error(format!(
                "unnamed field on `{}` cannot be transpiled",
                structure.ident
            )));
        };
        let name = snake_to_lower_camel(&field_name.to_string());
        let prefix = if readonly { "readonly " } else { "" };
        if let Some(inner) = option_inner_type(&field.ty)
            && let Some(current) = current_source(entities)
            && entities.contains(&format!(
                "{NULLABLE_OPTION_LITERAL_FIELD_MARKER}{current}{PROVENANCE_SEPARATOR}{}{PROVENANCE_SEPARATOR}{field_name}",
                structure.ident
            ))
        {
            writeln!(
                out,
                "  {prefix}{name}: {};",
                nullable_type(emit_preferred_type(inner, entities, aliases)?)
            )
            .expect("writing to a String cannot fail");
            continue;
        }
        let (optional, rust_type) = if entities.contains(NULLABLE_OPTIONS_MARKER) {
            ("", &field.ty)
        } else if let Some(inner) = option_inner_type(&field.ty) {
            ("?", inner)
        } else {
            ("", &field.ty)
        };
        let parameter_names = callable_field_parameters
            .get(&(structure.ident.to_string(), field_name.to_string()))
            .map(Vec::as_slice);
        let typescript_type = if let Some(parameter_names) = parameter_names {
            emit_named_callable_type(rust_type, &type_context, parameter_names)?
        } else {
            emit_preferred_type(rust_type, &type_context, aliases)?
        };
        writeln!(out, "  {prefix}{name}{optional}: {};", typescript_type)
            .expect("writing to a String cannot fail");
    }
    out.push_str("}\n");
    return Ok(());
}

pub(crate) fn emit_type(
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return match rust_type {
        Type::Array(array) => {
            if let Some(array_type) = typed_array_for_type(&array.elem) {
                Ok(array_type.to_string())
            } else {
                Ok(array_type(emit_type(&array.elem, entities)?))
            }
        }
        Type::Paren(paren) => emit_type(&paren.elem, entities),
        Type::Path(path) => {
            // A pinned boxed future is the value of an asynchronous host operation: `Promise<T>` in a
            // type position. Async bodies and `.await` stay unsupported.
            if let Some(output) = pinned_boxed_future_output(path, entities)? {
                return Ok(format!("Promise<{}>", emit_type(output, entities)?));
            }
            if let Some(kind) = hash_collection_type(rust_type, entities) {
                let segment = path
                    .path
                    .segments
                    .last()
                    .expect("resolved paths have a segment");
                let name = if matches!(kind, BindingFact::HashMap) {
                    "HashMap"
                } else {
                    "HashSet"
                };
                return emit_hash_collection_type(name, segment, entities);
            }
            let Some(segment) = path.path.segments.last() else {
                return Err(compile_error("empty Rust type path"));
            };
            let mut name = segment.ident.to_string();
            if path.path.segments.len() > 1
                && path.path.segments.first().is_some_and(|segment| {
                    vitest_current_path_prefix(entities, &segment.ident.to_string()).is_some()
                })
            {
                name = vitest_struct_path_binding_name(&path.path, entities)?.ok_or_else(|| {
                    compile_error("current-package struct/type path has no binding")
                })?;
            }
            if path.path.segments.len() > 1
                && let Some(first) = path.path.segments.first()
                && first.ident.to_string().starts_with("flight_")
                && !marker_suffixes(entities, VITEST_LOCAL_CRATE_MARKER)
                    .contains(&first.ident.to_string())
            {
                if !matches!(segment.arguments, PathArguments::None) {
                    return Err(compile_error(format!(
                        "foreign Rust type `{name}` cannot use generic arguments in a portable test"
                    )));
                }
                return Ok(format!(
                    "{}.{}",
                    snake_to_lower_camel(&first.ident.to_string()),
                    name
                ));
            }
            if let Some(tag) = identity_alias_tag(entities, &name) {
                let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                    return Err(compile_error(format!(
                        "identity alias `{name}` needs exactly one type argument"
                    )));
                };
                let types = arguments
                    .args
                    .iter()
                    .filter_map(|argument| match argument {
                        GenericArgument::Type(rust_type) => Some(rust_type),
                        _ => None,
                    })
                    .collect::<Vec<_>>();
                if types.len() != 1 {
                    return Err(compile_error(format!(
                        "identity alias `{name}` needs exactly one type argument"
                    )));
                }
                return Ok(format!(
                    "{name}<{}, {tag:?}>",
                    emit_type(types[0], entities)?
                ));
            }
            // A standard `Box` only transfers ownership, so a boxed typed-array alias is that typed
            // array; the owner is proven through the path's provenance (an aliased standard `Box`
            // qualifies, a crate, imported, globbed or unresolved `Box` never does).
            if let Some(typed_array) = boxed_typed_array(segment)
                && resolve_type_path(&path.path, entities)
                    .is_some_and(|owner| is_standard_type_path(&owner, "Box"))
            {
                return Ok(typed_array.to_string());
            }
            match name.as_str() {
                "bool" => Ok("boolean".to_string()),
                "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32"
                | "u64" | "usize" => Ok("number".to_string()),
                "String" | "str" | "char" => Ok("string".to_string()),
                "UnknownValue" => Ok("unknown".to_string()),
                // `std::cmp::Ordering` is a comparator result: its sign is the ordering.
                "Ordering" => Ok("number".to_string()),
                "Option" => {
                    let inner = emit_single_generic_type(segment, entities)?;
                    if entities.contains(NULLABLE_OPTIONS_MARKER) {
                        Ok(nullable_type(inner))
                    } else if inner.contains("=>") {
                        Ok(format!("({inner}) | undefined"))
                    } else {
                        Ok(format!("{inner} | undefined"))
                    }
                }
                "Vec" => Ok(array_type(emit_single_generic_type(segment, entities)?)),
                "HashSet" | "HashMap" if resolve_type_path(&path.path, entities).is_none() => {
                    Err(compile_error(format!(
                        "cannot resolve the provenance of `{name}`; import it from `std::collections` to lower it to a JavaScript collection"
                    )))
                }
                "Mutex" => Ok(format!(
                    "{{ value: {} }}",
                    emit_single_generic_type(segment, entities)?
                )),
                "AtomicU32" => Ok("{ value: number }".to_string()),
                "Arc" => {
                    let interior_mutable = match &segment.arguments {
                        PathArguments::AngleBracketed(arguments) => arguments.args.iter().any(
                            |argument| {
                                matches!(argument, GenericArgument::Type(inner) if rust_type_has_interior_mutability(inner))
                            },
                        ),
                        _ => false,
                    };
                    let inner = emit_single_generic_type(segment, entities)?;
                    if is_primitive_typescript_type(&inner) || interior_mutable {
                        Ok(inner)
                    } else {
                        Ok(format!("Readonly<{inner}>"))
                    }
                }
                "Ref" => emit_single_generic_type(segment, entities),
                _ if entities.contains(&name) => {
                    let arguments = emit_path_type_arguments(segment, entities)?;
                    if entities.contains(&format!("{TARGET_NATIVE_ENTITY_MARKER}{name}")) {
                        Ok(format!("{name}{arguments}"))
                    } else {
                        Ok(format!("{name}Raw{arguments}"))
                    }
                }
                _ => {
                    let typescript_name = export_name(entities, &name).unwrap_or(&name);
                    if matches!(segment.arguments, PathArguments::None) {
                        Ok(typescript_name.to_string())
                    } else {
                        let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                            return Err(compile_error(format!(
                                "unsupported parenthesized type arguments on `{name}`"
                            )));
                        };
                        let rendered = arguments
                            .args
                            .iter()
                            .filter_map(|argument| match argument {
                                GenericArgument::Type(rust_type) => {
                                    Some(emit_type(rust_type, entities))
                                }
                                _ => None,
                            })
                            .collect::<Result<Vec<_>, _>>()?;
                        if rendered.is_empty() {
                            Ok(typescript_name.to_string())
                        } else {
                            Ok(format!("{typescript_name}<{}>", rendered.join(", ")))
                        }
                    }
                }
            }
        }
        Type::Reference(reference) => {
            let inner = emit_type(&reference.elem, entities)?;
            if reference.mutability.is_some()
                || is_primitive_typescript_type(&inner)
                || rust_type_has_interior_mutability(&reference.elem)
                || named_type(&reference.elem).is_some_and(|name| {
                    entities.contains(&format!("{INTERIOR_MUTABLE_STRUCT_MARKER}{name}"))
                })
                || type_is_current_parameter(&reference.elem, entities)
            {
                Ok(inner)
            } else {
                Ok(format!("Readonly<{inner}>"))
            }
        }
        Type::Slice(slice) => Ok(array_type(emit_type(&slice.elem, entities)?)),
        Type::Tuple(tuple) if tuple.elems.is_empty() => Ok("void".to_string()),
        Type::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| emit_type(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("readonly [{}]", elements.join(", ")))
        }
        Type::BareFn(function) => emit_bare_function_type(function, entities, None),
        Type::TraitObject(object) => emit_function_trait_type(&object.bounds, entities),
        _ => Err(compile_error(format!(
            "unsupported Rust type `{}`",
            type_kind(rust_type)
        ))),
    };
}

fn emit_path_type_arguments(
    segment: &syn::PathSegment,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return Ok(String::new());
    };
    let rendered = arguments
        .args
        .iter()
        .filter_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(emit_type(rust_type, entities)),
            _ => None,
        })
        .collect::<Result<Vec<_>, _>>()?;
    if rendered.is_empty() {
        return Ok(String::new());
    }
    return Ok(format!("<{}>", rendered.join(", ")));
}

pub(crate) fn insert_type_parameter_context(
    context: &mut HashSet<String>,
    generics: &syn::Generics,
) {
    for parameter in &generics.params {
        if let syn::GenericParam::Type(parameter) = parameter {
            context.insert(format!("{TYPE_PARAMETER_MARKER}{}", parameter.ident));
        }
    }
}

fn type_is_current_parameter(rust_type: &Type, entities: &HashSet<String>) -> bool {
    return match rust_type {
        Type::Group(group) => type_is_current_parameter(&group.elem, entities),
        Type::Paren(paren) => type_is_current_parameter(&paren.elem, entities),
        Type::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments.first().is_some_and(|segment| {
                entities.contains(&format!("{TYPE_PARAMETER_MARKER}{}", segment.ident))
            })
        }
        _ => false,
    };
}

fn typed_array_for_literal(expression: &Expr) -> Option<&'static str> {
    let Expr::Lit(literal) = expression else {
        return None;
    };
    let suffix = match &literal.lit {
        Lit::Float(value) => value.suffix(),
        Lit::Int(value) => value.suffix(),
        _ => return None,
    };
    return typed_array_for_primitive(suffix);
}

fn typed_array_for_type(rust_type: &Type) -> Option<&'static str> {
    return match rust_type {
        Type::Paren(paren) => typed_array_for_type(&paren.elem),
        Type::Path(path) => path
            .path
            .segments
            .last()
            .and_then(|segment| typed_array_for_primitive(&segment.ident.to_string())),
        _ => None,
    };
}

fn typed_array_for_primitive(name: &str) -> Option<&'static str> {
    return match name {
        "f32" => Some("Float32Array"),
        "f64" => Some("Float64Array"),
        "i8" => Some("Int8Array"),
        "i16" => Some("Int16Array"),
        "i32" => Some("Int32Array"),
        "u8" => Some("Uint8Array"),
        "u16" => Some("Uint16Array"),
        "u32" => Some("Uint32Array"),
        _ => None,
    };
}

fn emit_type_alias(
    out: &mut String,
    type_alias: &syn::ItemType,
    entities: &HashSet<String>,
    parameter_names: Option<&[String]>,
) -> Result<(), CompileError> {
    emit_documentation(out, &type_alias.attrs, 0);
    let export = if is_public(&type_alias.vis) {
        "export "
    } else {
        ""
    };
    let mut type_context = entities.clone();
    insert_type_parameter_context(&mut type_context, &type_alias.generics);
    let rendered = if let Some(parameter_names) = parameter_names {
        emit_named_callable_type(&type_alias.ty, &type_context, parameter_names)?
    } else {
        emit_type(&type_alias.ty, &type_context)?
    };
    writeln!(
        out,
        "{export}type {}{} = {};",
        type_alias.ident,
        emit_type_parameters(&type_alias.generics),
        rendered
    )
    .expect("writing to a String cannot fail");
    return Ok(());
}

fn emit_bare_function_type(
    function: &syn::TypeBareFn,
    entities: &HashSet<String>,
    parameter_names: Option<&[String]>,
) -> Result<String, CompileError> {
    let parameter_types = function
        .inputs
        .iter()
        .map(|argument| &argument.ty)
        .collect::<Vec<_>>();
    let parameters = emit_callable_parameters(&parameter_types, entities, parameter_names)?;
    let output = match &function.output {
        ReturnType::Default => "void".to_string(),
        ReturnType::Type(_, rust_type) => emit_type(rust_type, entities)?,
    };
    return Ok(format!("({}) => {output}", parameters.join(", ")));
}

fn emit_named_callable_type(
    rust_type: &Type,
    entities: &HashSet<String>,
    parameter_names: &[String],
) -> Result<String, CompileError> {
    return match rust_type {
        Type::BareFn(function) => {
            emit_bare_function_type(function, entities, Some(parameter_names))
        }
        Type::Paren(paren) => emit_named_callable_type(&paren.elem, entities, parameter_names),
        Type::Path(path) => {
            let Some(segment) = path.path.segments.last() else {
                return Err(compile_error("empty Rust type path"));
            };
            if !matches!(
                segment.ident.to_string().as_str(),
                "Arc" | "Box" | "Option" | "Ref"
            ) {
                return Err(compile_error(
                    "callable alias shape changed after directive validation",
                ));
            }
            let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                return Err(compile_error(format!(
                    "`{}` needs one type argument",
                    segment.ident
                )));
            };
            let types = arguments
                .args
                .iter()
                .filter_map(|argument| match argument {
                    GenericArgument::Type(rust_type) => Some(rust_type),
                    _ => None,
                })
                .collect::<Vec<_>>();
            if types.len() != 1 {
                return Err(compile_error(format!(
                    "`{}` needs exactly one type argument",
                    segment.ident
                )));
            }
            let inner = emit_named_callable_type(types[0], entities, parameter_names)?;
            if segment.ident == "Option" {
                return Ok(if entities.contains(NULLABLE_OPTIONS_MARKER) {
                    nullable_type(inner)
                } else {
                    format!("({inner}) | undefined")
                });
            }
            Ok(inner)
        }
        Type::TraitObject(object) => emit_function_trait_type_with_parameter_names(
            &object.bounds,
            entities,
            Some(parameter_names),
        ),
        _ => Err(compile_error(
            "callable alias shape changed after directive validation",
        )),
    };
}

pub(crate) fn emit_type_parameters(generics: &syn::Generics) -> String {
    let parameters = generics
        .params
        .iter()
        .filter_map(|parameter| match parameter {
            syn::GenericParam::Type(parameter) => Some(parameter.ident.to_string()),
            syn::GenericParam::Const(_) | syn::GenericParam::Lifetime(_) => None,
        })
        .collect::<Vec<_>>();
    if parameters.is_empty() {
        return String::new();
    }
    return format!("<{}>", parameters.join(", "));
}

// A Rust primary can lower to an operator expression (`v.is_empty()` emits `v.length === 0`,
// `Arc::ptr_eq(a, b)` emits `a === b`). The precedence model above is Rust-shaped, so wherever such a
// lowering becomes an operand it is parenthesized here rather than trusted: an unparenthesized
// `!v.length === 0` parses as `(!v.length) === 0`.
fn emit_unary_expression(
    unary: &syn::ExprUnary,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let operator = emit_unary_operator(&unary.op)?;
    let operand = emit_expression(&unary.expr, entities)?;
    if matches!(unary.op, UnOp::Deref(_))
        && referenced_path_identifier(&unary.expr)
            .and_then(|name| lexical_binding(entities, &name))
            .is_some_and(|id| entities.contains(&format!("{MUTEX_GUARD_BINDING_MARKER}{id}")))
    {
        return Ok(format!("{operand}.value"));
    }
    if matches!(unary.op, UnOp::Not(_))
        && let Expr::MethodCall(method) = unary.expr.as_ref()
        && method.method == "is_empty"
        && method.args.is_empty()
        && let Some(receiver) = operand.strip_suffix(".length === 0")
        && is_primary_expression_text(receiver)
    {
        return Ok(format!("{receiver}.length !== 0"));
    }
    if !is_lowered_primary(&unary.expr, &operand) {
        return Ok(format!("{operator}({operand})"));
    }
    return Ok(format!("{operator}{operand}"));
}

// The cell whose guard is produced by an exact `cell.lock().unwrap()` expression.
fn mutex_guard_receiver(expression: &Expr) -> Option<&Expr> {
    let Expr::MethodCall(unwrap) = expression else {
        return None;
    };
    if unwrap.method != "unwrap" || !unwrap.args.is_empty() {
        return None;
    }
    let Expr::MethodCall(lock) = unwrap.receiver.as_ref() else {
        return None;
    };
    return (lock.method == "lock" && lock.args.is_empty()).then_some(lock.receiver.as_ref());
}

// The cell whose guard is produced by an exact `cell.read().unwrap()` or
// `cell.write().unwrap()` expression.
pub(super) fn direct_lock_guard_receiver(expression: &Expr) -> Option<&Expr> {
    let Expr::MethodCall(unwrap) = expression else {
        return None;
    };
    if unwrap.method != "unwrap" || !unwrap.args.is_empty() {
        return None;
    }
    let Expr::MethodCall(lock) = unwrap.receiver.as_ref() else {
        return None;
    };
    return (matches!(lock.method.to_string().as_str(), "read" | "write") && lock.args.is_empty())
        .then_some(lock.receiver.as_ref());
}

fn direct_lock_guard_target(
    entities: &HashSet<String>,
    id: &str,
) -> Result<Option<Expr>, CompileError> {
    let prefix = format!("{DIRECT_LOCK_GUARD_TARGET_MARKER}{id}{PROVENANCE_SEPARATOR}");
    let mut targets = entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(&prefix));
    let Some(target) = targets.next() else {
        return Ok(None);
    };
    if targets.next().is_some() {
        return Err(compile_error(format!(
            "direct lock guard binding `{id}` has ambiguous target cells"
        )));
    }
    let target = syn::parse_str::<Expr>(target)
        .map_err(|error| compile_error(format!("failed to recover lock target: {error}")))?;
    if let Some(alias) = ref_alias_target(entities, &target)? {
        return Ok(Some(alias));
    }
    return Ok(Some(target));
}

fn direct_lock_assignment_target(
    entities: &HashSet<String>,
    expression: &Expr,
) -> Result<Option<Expr>, CompileError> {
    if let Some(receiver) = direct_lock_guard_receiver(expression) {
        if let Some(target) = ref_alias_target(entities, receiver)? {
            return Ok(Some(target));
        }
        return Ok(Some(receiver.clone()));
    }
    if let Some(id) = referenced_path_identifier(expression)
        .and_then(|name| lexical_binding(entities, &name))
        .filter(|id| entities.contains(&format!("{DIRECT_LOCK_GUARD_BINDING_MARKER}{id}")))
    {
        return direct_lock_guard_target(entities, &id);
    }
    return Ok(None);
}

fn ref_alias_target(
    entities: &HashSet<String>,
    expression: &Expr,
) -> Result<Option<Expr>, CompileError> {
    let Expr::Path(path) = expression else {
        return Ok(None);
    };
    if path.qself.is_some() || path.path.segments.len() != 1 {
        return Ok(None);
    }
    let Some(alias) = path.path.segments.first() else {
        return Ok(None);
    };
    let Some(id) = lexical_binding(entities, &alias.ident.to_string()) else {
        return Ok(None);
    };
    return ref_alias_target_for_id(entities, &id);
}

fn ref_alias_target_for_id(
    entities: &HashSet<String>,
    id: &str,
) -> Result<Option<Expr>, CompileError> {
    let Some(target) = unique_marker_suffix(
        entities,
        &format!("{REF_ALIAS_TARGET_MARKER}{}{PROVENANCE_SEPARATOR}", id),
    ) else {
        return Ok(None);
    };
    return syn::parse_str::<Expr>(&target)
        .map(Some)
        .map_err(|error| compile_error(format!("failed to recover Ref alias target: {error}")));
}

fn ref_alias_receiver_capture(
    entities: &HashSet<String>,
    id: &str,
) -> Result<Option<(String, Expr)>, CompileError> {
    let Some(capture) = unique_marker_suffix(
        entities,
        &format!("{REF_ALIAS_RECEIVER_CAPTURE_MARKER}{id}{PROVENANCE_SEPARATOR}"),
    ) else {
        return Ok(None);
    };
    let Some((stable, expression)) = capture.split_once(PROVENANCE_SEPARATOR) else {
        return Err(compile_error(
            "malformed stable Ref alias receiver capture marker",
        ));
    };
    let expression = syn::parse_str::<Expr>(expression).map_err(|error| {
        compile_error(format!(
            "failed to recover stable Ref alias receiver capture: {error}"
        ))
    })?;
    return Ok(Some((stable.to_string(), expression)));
}

// Shared locks retain interior mutability through immutable Rust references. Wrapping those cells in
// TypeScript `Readonly` would reject the writes that the lock specifically authorizes.
fn rust_type_has_interior_mutability(rust_type: &Type) -> bool {
    let path = match rust_type {
        Type::Group(group) => return rust_type_has_interior_mutability(&group.elem),
        Type::Paren(paren) => return rust_type_has_interior_mutability(&paren.elem),
        Type::Reference(reference) => return rust_type_has_interior_mutability(&reference.elem),
        Type::Path(path) => path,
        _ => return false,
    };
    let Some(segment) = path.path.segments.last() else {
        return false;
    };
    if matches!(
        segment.ident.to_string().as_str(),
        "Mutex" | "RwLock" | "Ref"
    ) {
        return true;
    }
    if segment.ident != "Arc" {
        return false;
    }
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return false;
    };
    return arguments.args.iter().any(|argument| {
        matches!(argument, GenericArgument::Type(inner) if rust_type_has_interior_mutability(inner))
    });
}

fn emit_unary_operator(operator: &UnOp) -> Result<&'static str, CompileError> {
    return match operator {
        UnOp::Deref(_) => Ok(""),
        UnOp::Neg(_) => Ok("-"),
        UnOp::Not(_) => Ok("!"),
        _ => Err(compile_error("unsupported Rust unary operator")),
    };
}

// `Vec::extend` and `Vec::extend_from_slice` as statements: an index loop over the argument's initial length, so no argument
// count ceiling applies and a TypeScript caller passing the receiver as the argument still terminates
// (Rust ownership forbids that aliasing, the emitted signature does not). A non-reusable receiver and
// argument are each evaluated once, in that Rust order, into block-scoped temporaries. Every binding
// avoids the identifiers the operands use.
fn emit_vec_extend_statement(
    out: &mut String,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    validate_sequence_operands(&call.method.to_string(), call, entities)?;
    let receiver = emit_expression(&call.receiver, entities)?;
    let argument = emit_expression(&call.args[0], entities)?;
    let mut used = format!("{receiver} {argument}")
        .split(|character: char| {
            !(character.is_alphanumeric() || character == '_' || character == '$')
        })
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let bind_target = !expression_is_reusable(&call.receiver);
    let bind_source = !expression_is_reusable(&call.args[0]);
    let target = if bind_target {
        fresh_identifier("target", &mut used)
    } else {
        receiver.clone()
    };
    let source = if bind_source {
        fresh_identifier("source", &mut used)
    } else {
        argument.clone()
    };
    let index = fresh_identifier("index", &mut used);
    let count = fresh_identifier("count", &mut used);
    let mut loop_indent = indent;
    if bind_target || bind_source {
        write_indent(out, indent);
        out.push_str("{\n");
        loop_indent += 1;
    }
    if bind_target {
        write_indent(out, loop_indent);
        writeln!(out, "const {target} = {receiver};").expect("writing to a String cannot fail");
    }
    if bind_source {
        write_indent(out, loop_indent);
        writeln!(out, "const {source} = {argument};").expect("writing to a String cannot fail");
    }
    write_indent(out, loop_indent);
    writeln!(
        out,
        "for (let {index} = 0, {count} = {source}.length; {index} < {count}; {index}++) {{"
    )
    .expect("writing to a String cannot fail");
    write_indent(out, loop_indent + 1);
    writeln!(out, "{target}.push({source}[{index}]);").expect("writing to a String cannot fail");
    write_indent(out, loop_indent);
    out.push_str("}\n");
    if bind_target || bind_source {
        write_indent(out, indent);
        out.push_str("}\n");
    }
    return Ok(());
}

// The store holding the designated crate-private entity state a field expression reads or writes. The
// state lives in a WeakMap owned by the declaring module, so no public interface, runtime slot, binding
// or object copy can reach it. A designated field name on a receiver whose struct cannot be resolved
// fails closed rather than emitting a public property access that does not exist.
// flight-lint: allow(hashmap-iteration) designated owners are collected into an ordered BTreeSet
fn entity_runtime_state_access(
    field: &syn::ExprField,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    let syn::Member::Named(member) = &field.member else {
        return Ok(None);
    };
    let owners = entities
        .iter()
        .filter_map(|marker| {
            marker
                .strip_prefix(ENTITY_RUNTIME_STATE_FIELD_MARKER)?
                .strip_prefix(&format!("{member}{PROVENANCE_SEPARATOR}"))
        })
        .collect::<BTreeSet<_>>();
    if owners.is_empty() {
        return Ok(None);
    }
    let Some(identity) = expression_struct_name(&field.base, entities) else {
        return Err(compile_error(format!(
            "cannot resolve the receiver of `.{member}`, which is designated entity runtime state on {}; bind the receiver to a local or parameter of that entity type",
            owners
                .iter()
                .map(|owner| format!("`{owner}`"))
                .collect::<Vec<_>>()
                .join(", ")
        )));
    };
    return Ok(unique_marker_suffix(
        entities,
        &format!(
            "{ENTITY_RUNTIME_STATE_MARKER}{identity}{PROVENANCE_SEPARATOR}{member}{PROVENANCE_SEPARATOR}"
        ),
    ));
}

// Whether `owner` is an entity with designated crate-private runtime state in this context.
// flight-lint: allow(hashmap-iteration) `any` over the markers is order-independent
fn entity_runtime_state_is_designated(entities: &HashSet<String>, owner: &str) -> bool {
    return entities.iter().any(|marker| {
        marker
            .strip_prefix(ENTITY_RUNTIME_STATE_FIELD_MARKER)
            .and_then(|rest| rest.split_once(PROVENANCE_SEPARATOR))
            .is_some_and(|(_, designated_owner)| designated_owner == owner)
    });
}

// The package-internal store of `owner.field` designated entity runtime state.
pub(super) fn entity_runtime_state_store(owner: &str, field: &str) -> String {
    let field = snake_to_lower_camel(field);
    let mut characters = field.chars();
    let field = characters
        .next()
        .map(|first| first.to_ascii_uppercase().to_string() + characters.as_str())
        .unwrap_or_default();
    return format!("{}{field}Store", lower_camel_from_upper_camel(owner));
}

// The `(store, module specifier)` imports `body` needs: each sibling-declared entity runtime state
// store its code reads or writes. A store name cannot come from portable Rust (collisions are
// rejected), so a code-only identifier match is exact. A store in a module this source cannot name
// relatively fails closed.
fn entity_runtime_state_store_imports(
    body: &str,
    programs: &[&Program],
    modules: &[String],
) -> Result<BTreeSet<(String, String)>, CompileError> {
    let code_ranges = crate::typescript_code_ranges(body);
    let mut imports = BTreeSet::new();
    for (index, program) in programs.iter().enumerate().skip(1) {
        for (owner, field_name) in &program.entity_runtime_states {
            let store = entity_runtime_state_store(owner, field_name);
            let used = code_ranges.iter().any(|range| {
                let code = &body[range.clone()];
                code.match_indices(&store).any(|(offset, _)| {
                    let before = code[..offset].chars().next_back();
                    let after = code[offset + store.len()..].chars().next();
                    !before.is_some_and(|character| {
                        character.is_ascii_alphanumeric() || matches!(character, '_' | '$' | '.')
                    }) && !after.is_some_and(|character| {
                        character.is_ascii_alphanumeric() || matches!(character, '_' | '$')
                    })
                })
            });
            if !used {
                continue;
            }
            let current = modules[0].split("::").collect::<Vec<_>>();
            let declaring = modules[index].split("::").collect::<Vec<_>>();
            let [crate_name, module] = declaring.as_slice() else {
                return Err(compile_error(format!(
                    "entity runtime state `{owner}.{field_name}` is declared in `{}`, which this module cannot import; declare it in a top-level module of the crate",
                    modules[index]
                )));
            };
            if current.len() != 2 || current[0] != *crate_name {
                return Err(compile_error(format!(
                    "entity runtime state `{owner}.{field_name}` in `{}` is not reachable from `{}`",
                    modules[index], modules[0]
                )));
            }
            imports.insert((store, format!("./{}.ts", snake_to_lower_camel(module))));
        }
    }
    return Ok(imports);
}

fn expression_contains_identifier(expression: &Expr, expected: &str) -> bool {
    struct IdentifierFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for IdentifierFinder<'_> {
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
        Expr::Call(call) if call.args.len() == 1 && expression_is_path(&call.func, "Some") => {
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

fn expression_is_method(expression: &Expr, expected: &str) -> bool {
    let Expr::MethodCall(call) = expression else {
        return false;
    };
    return call.method == expected && call.args.is_empty();
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
        "boolean" | "number" | "object" | "string" | "void"
    ) || typescript_type.contains("=>");
}

fn is_public(visibility: &Visibility) -> bool {
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
fn is_visible_outside_module(visibility: &Visibility) -> bool {
    return !matches!(visibility, Visibility::Inherited);
}

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
        Pat::TupleStruct(tuple) if tuple.path.is_ident("Some") && tuple.elems.len() == 1 => {
            let Pat::Ident(identifier) = &tuple.elems[0] else {
                return None;
            };
            Some(identifier.ident.to_string())
        }
        Pat::Type(typed) => local_pattern_name(&typed.pat),
        _ => None,
    };
}

fn local_pattern_binding_id(entities: &HashSet<String>, pattern: &Pat) -> Option<String> {
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

pub(crate) fn lower_camel_from_upper_camel(name: &str) -> String {
    let mut characters = name.chars();
    let Some(first) = characters.next() else {
        return String::new();
    };
    return first.to_lowercase().chain(characters).collect();
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

pub(crate) fn string_union_literal(name: &str, style: StringUnionStyle) -> String {
    if style == StringUnionStyle::Exact {
        unreachable!("exact string-union values require their declared metadata");
    }
    if style == StringUnionStyle::LowerCamel {
        return lower_camel_from_upper_camel(name);
    }
    let characters = name.chars().collect::<Vec<_>>();
    let mut literal = String::new();
    for (index, character) in characters.iter().copied().enumerate() {
        if character == '_' {
            if !literal.is_empty() && !literal.ends_with('-') {
                literal.push('-');
            }
            continue;
        }
        if character.is_ascii_uppercase()
            && index > 0
            && !literal.ends_with('-')
            && (characters[index - 1].is_ascii_lowercase()
                || characters[index - 1].is_ascii_digit()
                || characters
                    .get(index + 1)
                    .is_some_and(|next| next.is_ascii_lowercase()))
        {
            literal.push('-');
        }
        literal.extend(character.to_lowercase());
    }
    return literal;
}

fn option_closure_parameter(pattern: &Pat) -> Option<&syn::Ident> {
    return match pattern {
        Pat::Ident(identifier) if identifier.subpat.is_none() => Some(&identifier.ident),
        Pat::Reference(reference) => option_closure_parameter(&reference.pat),
        _ => None,
    };
}

// The payload type name of an expression declared as Rust `Option` (empty when unnamed), or `None` when
// the expression is not known to be an Option. Option-ness comes from declared types only.
fn option_expression_payload(expression: &Expr, entities: &HashSet<String>) -> Option<String> {
    // A name declared as `Option` with different payloads is still an Option, of no known payload.
    let find = |prefix: String| {
        let mut payloads = marker_suffixes(entities, &prefix);
        return match payloads.len() {
            0 => None,
            1 => payloads.pop_first(),
            _ => Some(String::new()),
        };
    };
    return match expression {
        Expr::Call(call) => {
            let Expr::Path(path) = call.func.as_ref() else {
                return None;
            };
            if path.qself.is_some() {
                return None;
            }
            if expression_is_associated_path(&call.func, "char", "from_u32") && call.args.len() == 1
            {
                return Some("char".to_string());
            }
            call_fact(entities, OPTION_RETURN_MARKER, &path.path)
        }
        Expr::Field(field) => {
            let syn::Member::Named(field_name) = &field.member else {
                return None;
            };
            let structure = expression_struct_name(&field.base, entities)?;
            find(format!(
                "{OPTION_FIELD_MARKER}{structure}{PROVENANCE_SEPARATOR}{field_name}{PROVENANCE_SEPARATOR}"
            ))
        }
        Expr::Group(group) => option_expression_payload(&group.expr, entities),
        Expr::MethodCall(call) if call.method == "and_then" || call.method == "map" => {
            option_expression_payload(&call.receiver, entities).map(|_| String::new())
        }
        Expr::MethodCall(call)
            if call.method == "find"
                && call.args.len() == 1
                && expression_is_known_string(&call.receiver, entities) =>
        {
            Some(String::new())
        }
        Expr::MethodCall(call)
            if call.method == "get"
                && call.args.len() == 1
                && expression_is_sequence(&call.receiver, entities) =>
        {
            Some(String::new())
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(call.method.to_string().as_str(), "first" | "last" | "pop")
                && expression_is_sequence(&call.receiver, entities) =>
        {
            Some(String::new())
        }
        Expr::MethodCall(call)
            if call.args.is_empty()
                && matches!(
                    call.method.to_string().as_str(),
                    "as_mut" | "as_ref" | "cloned" | "copied"
                ) =>
        {
            option_expression_payload(&call.receiver, entities)
        }
        Expr::Paren(paren) => option_expression_payload(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            match lexical_fact(entities, &path.path.segments[0].ident.to_string()) {
                Some(BindingFact::Option(payload)) => match *payload {
                    BindingFact::Structure(identity) => Some(identity),
                    _ => Some(String::new()),
                },
                _ => None,
            }
        }
        Expr::Reference(reference) => option_expression_payload(&reference.expr, entities),
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

fn rewrite_code_span(value: &str) -> String {
    let mut out = String::new();
    let mut token = String::new();
    let flush = |out: &mut String, token: &mut String| {
        if token.is_empty() {
            return;
        }
        if token == "None" {
            out.push_str("undefined");
        } else if token.contains('_')
            && token
                .chars()
                .any(|character| character.is_ascii_lowercase())
            && token
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
        {
            out.push_str(&snake_to_lower_camel(token));
        } else {
            out.push_str(token);
        }
        token.clear();
    };
    for character in value.chars() {
        if character.is_ascii_alphanumeric() || character == '_' {
            token.push(character);
        } else {
            flush(&mut out, &mut token);
            out.push(character);
        }
    }
    flush(&mut out, &mut token);
    return out;
}

fn rewrite_documentation(value: &str) -> String {
    let value = value
        .replace("Panics", "Throws")
        .replace("panics", "throws");
    let mut out = String::new();
    for (index, segment) in value.split('`').enumerate() {
        if index > 0 {
            out.push('`');
        }
        if index % 2 == 0 {
            out.push_str(segment);
        } else {
            out.push_str(&rewrite_code_span(segment));
        }
    }
    return out;
}

// Leading underscores mark an intentionally unused Rust binding; TypeScript linters read the same
// prefix the same way, so they are kept rather than treated as an empty first word (`_out` stays
// `_out`, not `Out`).
pub(crate) fn snake_to_lower_camel(name: &str) -> String {
    let name = name.strip_prefix("r#").unwrap_or(name);
    let body = name.trim_start_matches('_');
    let mut out = name[..name.len() - body.len()].to_string();
    let mut words = body.split('_');
    out.push_str(words.next().unwrap_or_default());
    for word in words {
        let mut capitalized = false;
        for character in word.chars() {
            if !capitalized && character.is_alphabetic() {
                out.extend(character.to_uppercase());
                capitalized = true;
            } else {
                out.push(character);
            }
        }
    }
    return out;
}

fn throw_call(call: &syn::ExprCall) -> Option<(&'static str, &Expr)> {
    if call.args.len() != 1 {
        return None;
    }
    let constructor = if expression_path_ends_with(&call.func, "throw_range_error") {
        "RangeError"
    } else if expression_path_ends_with(&call.func, "throw_error") {
        "Error"
    } else {
        return None;
    };
    return Some((constructor, &call.args[0]));
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

pub(crate) fn write_indent(out: &mut String, indent: usize) {
    for _ in 0..indent {
        out.push_str("  ");
    }
}

impl BindingFact {
    fn has_source_structure(&self) -> bool {
        return match self {
            Self::Option(payload) | Self::Sequence(payload) => payload.has_source_structure(),
            Self::Structure(_) => true,
            Self::Tuple(facts) => facts.iter().any(Self::has_source_structure),
            Self::HashMap | Self::HashSet | Self::Unknown | Self::UnresolvedPattern => false,
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
        if self.symbols.contains_key(&name) && !is_lowered_cross_crate_type(&name) {
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
            if let Some((owner, _)) = path_owner_and_member(&expression.path)
                && is_string_union(self.context, &owner)
            {
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
            self.record_value_path(&pattern.path);
        }
        syn::visit::visit_pat_struct(self, pattern);
    }

    fn visit_pat_tuple_struct(&mut self, pattern: &'ast syn::PatTupleStruct) {
        if pattern.qself.is_none() {
            self.record_value_path(&pattern.path);
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
