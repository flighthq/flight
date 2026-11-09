pub(super) const CALLBACK_ARGUMENT_MARKER: &str = "@callback-argument:";

// Lexical value bindings. Every binding site of an emitted function gets a canonical BindingId
// (`function#b<ordinal>`, ordinals in source order); `@binding-site:` maps a binding identifier node to
// it, `@binding-fact:` records what the binding is proven to hold, and `@binding:` names the binding
// currently in scope for an identifier. Emission installs `@binding:` in scope-local contexts, so a
// shadow is distinct and scope exit restores the outer binding.
pub(super) const BINDING_MARKER: &str = "@binding:";

pub(super) const BINDING_FACT_MARKER: &str = "@binding-fact:";

pub(super) const BINDING_SITE_MARKER: &str = "@binding-site:";

pub(super) const BINDING_FACT_SEPARATOR: char = '\u{1e}';

pub(super) const CLOSURE_PARAMETER_MARKER: &str = "@closure-parameter:";

// `export-name` mappings: `@export-name:rust` marks a mapped item and `@export-name-target:rust:Name`
// carries its TypeScript name.
pub(super) const EXPORT_NAME_MARKER: &str = "@export-name:";

// A dependency package's `export-name` mapping: `@dependency-export-name:module|rust` marks a mapped
// item of that package's contract module and `@dependency-export-name-target:module|rust:Name`
// carries its TypeScript name.
pub(super) const DEPENDENCY_EXPORT_NAME_MARKER: &str = "@dependency-export-name:";

// `std::mem` provenance recorded from `use` items (see `insert_std_mem_import_context`).
pub(super) const STD_MEM_FUNCTION_MARKER: &str = "@std-mem-function:";

pub(super) const STD_MEM_FUNCTION_TARGET_MARKER: &str = "@std-mem-function-target:";

pub(super) const STD_MEM_FUNCTIONS: &[&str] = &["replace", "swap", "take"];

pub(super) const STD_MEM_GLOB_MARKER: &str = "@std-mem-glob";

pub(super) const STD_MEM_MODULE_MARKER: &str = "@std-mem-module:";

pub(super) const STD_MEM_SHADOWED_MARKER: &str = "@std-mem-shadowed:";

// Bare float constant names imported from `std::f32::consts` / `std::f64::consts` (see
// `insert_std_float_consts_context`).
pub(super) const FLOAT_CONST_MARKER: &str = "@float-const:";

pub(super) const JSON_VALUE_MARKER: &str = "@json-value:";
pub(super) const JSON_VALUE_OPTION_MARKER: &str = "@json-value-option:";

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
pub(super) const TYPE_PARAMETER_MARKER: &str = "@type-parameter:";

// Explicit Rust-name to established TypeScript representation metadata. The marker stores
// `rust␟module␟target`; an empty module is the intrinsic `unknown` representation.
pub(super) const TYPE_SCRIPT_TYPE_ALIAS_MARKER: &str = "@typescript-type-alias:";

// An established target-native module owns this type for generated siblings, but not for public
// contract/root lanes. Its representation is supplied separately as an explicit alias or validated
// string union; this marker keeps references named and suppresses a foreign contract import.
pub(super) const INTERNAL_TYPE_EXPORT_MARKER: &str = "@internal-type-export:";

pub(super) const DEPENDENCY_EXPORT_NAME_TARGET_MARKER: &str = "@dependency-export-name-target:";

// A dependency item the current source binds by its mapped name: `@dependency-export-name-binding:
// Name|module|rust`. `@dependency-export-name-bindings` marks that at least one exists.
pub(super) const DEPENDENCY_EXPORT_NAME_BINDING_MARKER: &str = "@dependency-export-name-binding:";

pub(super) const DEPENDENCY_EXPORT_NAME_BINDINGS_MARKER: &str = "@dependency-export-name-bindings";

pub(super) const EXPORT_NAME_TARGET_MARKER: &str = "@export-name-target:";

// The module of the program being emitted; struct and function facts resolve against it.
pub(super) const CURRENT_SOURCE_MARKER: &str = "@current-source:";

// `{module}␟{Owner}␟{field}␟{store}` for each designated crate-private entity state field, and
// `{field}␟{Owner}` so an access whose receiver type cannot be resolved fails closed.
pub(super) const ENTITY_RUNTIME_STATE_MARKER: &str = "@entity-runtime-state:";

pub(super) const ENTITY_RUNTIME_STATE_FIELD_MARKER: &str = "@entity-runtime-state-field:";

// `{module}␟{Entity}` for an exact source entity declaration. Unlike the bare entity-name
// context used while rendering `Raw` types, this remains unambiguous across sibling modules and is
// suitable as evidence for lifecycle lowering.
pub(super) const ENTITY_TYPE_MARKER: &str = "@entity-type:";

// An entity declared by a target-native sibling keeps the type name that sibling owns. Generated
// entity declarations still reserve the unsuffixed name for their wrapper and emit `NameRaw`.
pub(super) const TARGET_NATIVE_ENTITY_MARKER: &str = "@target-native-entity:";

pub(super) const DATA_UNION_UNIT_MARKER: &str = "@data-union-unit:";

pub(super) const DATA_UNION_VARIANT_MARKER: &str = "@data-union-variant:";

pub(super) const RESERVED_KEY_DATA_UNION_VARIANT_MARKER: &str = "@reserved-key-data-union-variant:";

pub(super) const RESERVED_KEY_DATA_UNION_VARIANT_TYPE_MARKER: &str =
    "@reserved-key-data-union-variant-type:";

pub(super) const TAGGED_DATA_UNION_VARIANT_MARKER: &str = "@tagged-data-union-variant:";
// `{owner}:{variant}` for a `record-map` data-union variant, whose string-keyed `HashMap` payload is a
// plain object record in TypeScript.
pub(super) const RECORD_MAP_VARIANT_MARKER: &str = "@record-map-variant:";
// A local passed directly as a record-map variant payload in the function being emitted, so its
// `HashMap` construction, `insert`, `get` and index reads lower to a plain object record.
pub(super) const RECORD_MAP_LOCAL_MARKER: &str = "@record-map-local:";

// A field an `allocate_entity` local may leave out of its default object because the construction
// initializer called on it in the very next statement definitely assigns it (`type:field`).
pub(super) const ENTITY_ALLOCATION_INITIALIZED_FIELD_MARKER: &str =
    "@entity-allocation-initialized-field:";

// A field an `allocate_entity` local leaves out of its default object entirely (`type:field`): the
// construction initializer called on it in the very next statement writes the field before anything
// can read or capture the allocation, so the default would only be an overwritten placeholder.
pub(super) const ENTITY_ALLOCATION_OMITTED_FIELD_MARKER: &str = "@entity-allocation-omitted-field:";

// A field an initializer writes in its leading run of plain `parameter.field = value;` statements,
// whose values never mention the parameter (`function:type:field`): written before any read or escape.
pub(super) const ENTITY_INITIALIZER_PREFIX_FIELD_MARKER: &str = "@entity-initializer-prefix-field:";

pub(super) const ENTITY_DEFAULT_FIELD_MARKER: &str = "@entity-default-field:";

// A field an initializer definitely assigns through its leading `&mut Entity` parameter on every
// completing path (`function:type:field`).
pub(super) const ENTITY_DEFINITELY_INITIALIZED_FIELD_MARKER: &str =
    "@entity-definitely-initialized-field:";

pub(super) const ENTITY_UNSUPPORTED_DEFAULT_FIELD_MARKER: &str =
    "@entity-unsupported-default-field:";

pub(super) const ENTITY_CLONE_FIELD_MARKER: &str = "@entity-clone-field:";

pub(super) const ENUM_DEFAULT_VARIANT_MARKER: &str = "@enum-default-variant:";

// A struct field whose declared type provably erases an identity-bearing shared cell in TypeScript:
// `flight_entity::Ref<T>` or the equivalent standard `Arc<RwLock<T>>`. Only clones of these fields
// may be rewritten as forwarding aliases to the original field.
pub(super) const ERASED_SHARED_CELL_FIELD_MARKER: &str = "@erased-shared-cell-field:";

pub(super) const FIXED_BUFFER_ARGUMENT_MARKER: &str = "@fixed-buffer-argument:";

pub(super) const FIXED_BUFFER_LOCAL_MARKER: &str = "@fixed-buffer-local:";

// The BindingId of a local bound to a dereferenced `MutexGuard`. `Mutex<T>` is a `{ value: T }` cell
// in TypeScript, so that exact binding must retain the cell while dereferences read or replace its
// `value`; another binding with the same identifier remains independent.
pub(super) const MUTEX_GUARD_BINDING_MARKER: &str = "@mutex-guard-binding:";

// A local initialized from `RwLock::read`/`write`. `Ref<T>` and `Arc<RwLock<T>>` lower to `T`, so
// dereferencing this guard is a target no-op rather than a `.value` wrapper access.
pub(super) const DIRECT_LOCK_GUARD_BINDING_MARKER: &str = "@direct-lock-guard-binding:";

pub(super) const DIRECT_LOCK_GUARD_TARGET_MARKER: &str = "@direct-lock-guard-target:";
// An `async fn` (`name`) whose output is a proven D15 `Result<T, FlightError>` (see
// `flight_error_result_type`): its promise resolves `Ok` and rejects with the canonical error of `Err`.
pub(crate) const ASYNC_FLIGHT_ERROR_FUNCTION_MARKER: &str = "@async-flight-error-function:";
// Inside such a function's own body (never a closure): each proven `return Err(e)` lowers to
// `throw e`, which rejects the promise exactly as Rust resolves `Err(e)`.
pub(super) const FLIGHT_ERROR_RETURNS_MARKER: &str = "@flight-error-returns";
// `{Struct}.{field}` for a callable field whose declared output is a pinned boxed future of a proven
// D15 `Result<T, FlightError>` (`Arc<dyn Fn(..) -> Pin<Box<dyn Future<Output = Result<..>>>>>`, through
// unambiguous aliases): the closure a struct literal stores there returns that promise.
pub(crate) const D15_FUTURE_FIELD_MARKER: &str = "@d15-future-field:";
// Set on the value of such a field while it is emitted; only the field's own closure consumes it.
pub(super) const D15_FUTURE_CLOSURE_MARKER: &str = "@d15-future-closure";
// Inside that closure's own body (never a nested closure): its D15 provider tail may lower.
pub(super) const D15_FUTURE_RETURN_MARKER: &str = "@d15-future-return";
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
pub(super) const ERASED_CELL_WRITTEN_MARKER: &str = "@erased-cell-written:";
// A direct lock guard whose whole value is replaced (`*guard = ..`, `*guard += ..`): its binding is a
// snapshot of the old value, so every use of it reads its target cell instead.
pub(super) const DIRECT_LOCK_GUARD_REPLACED_MARKER: &str = "@direct-lock-guard-replaced:";

pub(super) const INTERIOR_MUTABLE_STRUCT_MARKER: &str = "@interior-mutable-struct:";

// `{module}␟{Struct}` for each entity a source declares `readonly-fields`, so an `initialize_*`
// function in another source that resolves its leading `&mut` parameter to it gets the writable
// construction view.
pub(super) const READONLY_ENTITY_MARKER: &str = "@readonly-entity:";

pub(super) const REF_ALIAS_TARGET_MARKER: &str = "@ref-alias-target:";

pub(super) const REF_ALIAS_RECEIVER_CAPTURE_MARKER: &str = "@ref-alias-receiver-capture:";

pub(super) const REFERENCE_PARAMETER_BINDING_MARKER: &str = "@reference-parameter-binding:";
// A nested portable-test helper parameter approved by `vitest` as the sole non-escaping mutable
// reference to an exact scalar (`function:parameter`). The name marker is translated to the
// parameter's lexical BindingId inside `function_expression_context`.
pub(crate) const VITEST_MUTABLE_SCALAR_CELL_PARAMETER_MARKER: &str =
    "@vitest-mutable-scalar-cell-parameter:";
pub(super) const MUTABLE_SCALAR_CELL_PARAMETER_NAME_MARKER: &str =
    "@mutable-scalar-cell-parameter-name:";
pub(super) const MUTABLE_SCALAR_CELL_PARAMETER_BINDING_MARKER: &str =
    "@mutable-scalar-cell-parameter-binding:";
// The outer portable-test local whose identity is the cell passed to an approved helper.
pub(crate) const VITEST_MUTABLE_SCALAR_CELL_LOCAL_BINDING_MARKER: &str =
    "@vitest-mutable-scalar-cell-local-binding:";
// An exact mutable-scalar parameter position. Production calls at this boundary fail closed; only
// the Vitest proof above may opt a local into the shared-cell representation.
pub(crate) const MUTABLE_SCALAR_REFERENCE_ARGUMENT_MARKER: &str =
    "@mutable-scalar-reference-argument:";

pub(super) const ITER_MUT_ALIAS_MARKER: &str = "@iter-mut-alias:";

pub(super) const SCOPE_DECLARED_MARKER: &str = "@scope-declared:";
pub(super) const MUTABLE_PARAMETER_MARKER: &str = "@mutable-parameter:";
pub(super) const RENAME_MARKER: &str = "@rename:";
pub(super) const TRY_SUBSTITUTION_MARKER: &str = "@try-sub:";
pub(super) const TRY_COUNTER_MARKER: &str = "@try-counter:";

// A `const-group` member reference: `@const-group-member:<RUST_NAME>:<Owner>.<Member>`.
pub(super) const CONST_GROUP_MEMBER_MARKER: &str = "@const-group-member:";

pub(super) const FROZEN_OBJECT_MARKER: &str = "@frozen-object:";

// Free functions, structs and type aliases by declaring module
// (`module SEP name SEP public|crate|private`). A name used in a source resolves through Rust's
// module visibility: private in its owner, crate-visible inside that crate, and public everywhere.
pub(super) const FUNCTION_OWNER_MARKER: &str = "@function-owner:";

// A source's `use` bindings resolved to full module identities: explicit or renamed items
// (`module SEP bound name SEP target module SEP item`) and globs (`module SEP target module`). Only
// sources with a full module identity (`crate::path`) record them; others resolve their own
// declarations alone.
pub(super) const USE_BINDING_MARKER: &str = "@use-binding:";

pub(super) const USE_GLOB_MARKER: &str = "@use-glob:";

// The `pub` plus `pub(crate)` subset of those bindings, followed while resolving inside one crate.
pub(super) const CRATE_USE_BINDING_MARKER: &str = "@crate-use-binding:";

pub(super) const CRATE_USE_GLOB_MARKER: &str = "@crate-use-glob:";

// The public subset of the same bindings. Resolution starts with all bindings in the source being
// compiled, then follows only these markers through intermediate modules so a private import never
// becomes an accidental re-export.
pub(super) const PUBLIC_USE_BINDING_MARKER: &str = "@public-use-binding:";

pub(super) const PUBLIC_USE_GLOB_MARKER: &str = "@public-use-glob:";

pub(super) const IDENTITY_ALIAS_MARKER: &str = "@identity-alias:";

pub(super) const NULLABLE_BINDING_MARKER: &str = "@nullable:";

pub(super) const NULLABLE_CALL_MARKER: &str = "@nullable-call:";

// The BindingId of a Vitest local whose initializer is proven to retain a nullable Option return's
// `null` representation. Binding identity, rather than the Rust identifier, keeps shadows separate.
pub(super) const NULLABLE_OPTION_BINDING_MARKER: &str = "@nullable-option-binding:";

pub(super) const NULLABLE_OPTION_FIELD_MARKER: &str = "@nullable-option-field:";

pub(super) const NULLABLE_OPTION_PARAMETER_MARKER: &str = "@nullable-option-parameter:";

pub(super) const DEFAULT_NULL_OPTION_PARAMETER_MARKER: &str = "@default-null-option-parameter:";

pub(super) const NULLABLE_OPTION_RETURN_MARKER: &str = "@nullable-option-return:";

// A function whose exact TypeScript contract, rather than a source-wide Rust directive, proves
// that its Option return retains `null` through internal expression paths.
pub(super) const TYPE_SCRIPT_NULLABLE_OPTION_RETURN_MARKER: &str =
    "@typescript-nullable-option-return:";

// A public callable type alias whose exact Rust return is `Option` and whose established
// TypeScript contract uses `null` absence: `{source} SEP {alias}`.
pub(super) const NULLABLE_OPTION_CALLABLE_RETURN_MARKER: &str = "@nullable-option-callable-return:";

// A struct `HashMap`/`BTreeMap` field whose values use such a callable alias:
// `{struct source} SEP {Struct} SEP {field}`.
pub(super) const NULLABLE_OPTION_CALLABLE_MAP_FIELD_MARKER: &str =
    "@nullable-option-callable-map-field:";

// The BindingId of a local proven to hold a callable whose Option result uses `null`.
pub(super) const NULLABLE_OPTION_CALLABLE_BINDING_MARKER: &str =
    "@nullable-option-callable-binding:";

pub(super) const NULLABLE_OPTIONS_MARKER: &str = "@nullable-options";

// `{source}␟{function}␟{position}` for each `array-like` slice parameter, by its argument position, so
// an onward call can check the parameter of the callee it resolves to.
pub(super) const ARRAY_LIKE_ARGUMENT_MARKER: &str = "@array-like-argument:";

// `{source}␟{function}␟{parameter}` for each `array-like` slice parameter, typed `ArrayLike<T>`; the
// source identity keeps a sibling's designation from applying to a same-named local function.
pub(super) const ARRAY_LIKE_PARAMETER_MARKER: &str = "@array-like-parameter:";

// `{source}␟{function}␟{parameter}` for a contract-proven `&mut [f32]` parameter whose exact
// TypeScript representation is `Float32Array`.
pub(super) const FLOAT32_ARRAY_PARAMETER_MARKER: &str = "@float32-array-parameter:";
pub(super) const UINT8_ARRAY_PARAMETER_MARKER: &str = "@uint8-array-parameter:";
pub(super) const UINT8_ARRAY_RETURN_MARKER: &str = "@uint8-array-return:";
pub(super) const TYPE_SCRIPT_ARRAY_FIELD_MARKER: &str = "@typescript-array-field:";

// `{source}␟{Struct}␟{field}` for a `nullable-option` struct field, read where that struct is declared or
// built by literal.
pub(super) const NULLABLE_OPTION_LITERAL_FIELD_MARKER: &str = "@nullable-option-literal-field:";
pub(super) const TYPE_SCRIPT_NULLABLE_OPTION_FIELD_MARKER: &str =
    "@typescript-nullable-option-field:";
// `{module}` for each source declaring module-wide `nullable-options`: every `Option` its structs
// declare is `T | null`.
pub(super) const NULLABLE_OPTIONS_SOURCE_MARKER: &str = "@nullable-options-source:";

// A function whose `Option` return is designated `nullable-option`: its returns use `null`.
pub(super) const RETURNS_NULLABLE_MARKER: &str = "@returns-nullable";

// A function returning a fixed array of a typed-array primitive (`[f64; 4]` is `Float64Array`): its
// returned array literals construct that typed array.
pub(super) const RETURNS_TYPED_ARRAY_MARKER: &str = "@returns-typed-array:";
pub(crate) const RETURNS_CONTRACT_TYPED_ARRAY_MARKER: &str = "@returns-contract-typed-array:";

pub(super) const PROVENANCE_SEPARATOR: char = '\u{1f}';

// Struct fields (`struct identity SEP field SEP payload`), locals and parameters (`name:payload`), and
// function returns (`module SEP function SEP payload`) declared as Rust `Option<T>`. The payload is the
// resolved struct identity of `T`, or empty. They make Option `.and_then()` / `.map()` type-directed.
pub(super) const OPTION_FIELD_MARKER: &str = "@option-field:";

pub(super) const OPTION_RETURN_MARKER: &str = "@option-return:";

// Locals and parameters known to hold a Rust integer or string, the operand types `.cmp()` lowers
// to a JavaScript relational comparison.
pub(super) const ORDERED_PRIMITIVE_MARKER: &str = "@ordered-primitive:";

// The precedence `expression_precedence` assigns to Rust primary expressions.
pub(super) const PRIMARY_PRECEDENCE: u8 = 15;

pub(super) const RECORD_CLONE_ARGUMENT_MARKER: &str = "@record-clone-argument:";

pub(super) const RECORD_CLONE_LOCAL_MARKER: &str = "@record-clone-local:";

pub(super) const RECORD_CLONE_TYPE_MARKER: &str = "@record-clone-type:";

pub(super) const RECORD_VEC_FIELD_MARKER: &str = "@record-vec-field:";

pub(super) const RETURN_TYPE_MARKER: &str = "@return-type:";

// The BindingId of the one local a proven Rust allocate/initialize/return entity factory finishes
// at its TypeScript return boundary. This marker is function-local and never inherited by closures.
pub(super) const FINISH_ENTITY_RETURN_MARKER: &str = "@finish-entity-return:";

pub(super) const RETURN_BINDING_FACT_MARKER: &str = "@return-binding-fact:";

pub(super) const RETURNS_U32_MARKER: &str = "@returns-u32";

// Struct fields (`struct identity SEP field`) and locals or parameters whose every binding is declared
// as a Rust `Vec`, slice or fixed array, the operand types `.extend()` and `.extend_from_slice()` lower
// over.
// A struct field typed `HashSet` / `HashMap`: `identity SEP field SEP hash-set|hash-map`.
pub(super) const HASH_COLLECTION_FIELD_MARKER: &str = "@hash-collection-field:";

pub(super) const SEQUENCE_FIELD_MARKER: &str = "@sequence-field:";
pub(super) const SEQUENCE_FIELD_ELEMENT_MARKER: &str = "@sequence-field-element:";
// `{BindingId} SEP {TypeScript element type}` for a local initialized by an empty standard `Vec`
// construction. The element type is recorded only when declared, receiver and function-result
// provenance agree on one fully representable non-generic type.
pub(super) const EMPTY_SEQUENCE_ELEMENT_TYPE_MARKER: &str = "@empty-sequence-element-type:";
// `{module}␟{function}␟{index}={element},…` listing each `&mut Vec<element>` parameter of a non-generic
// function, `element` the element's Rust primitive name or resolved struct identity (empty when neither
// resolves). Rust requires the argument's element type to match exactly, so an empty local `Vec`
// passed there as `&mut local` holds that element.
pub(super) const MUT_VEC_PARAMETERS_MARKER: &str = "@mut-vec-parameters:";
// `{function}:{index}:{kind}` for each typed parameter: `slice` (`&[f64]`) or `mut-slice` (`&mut [f64]`)
// over a typed-array primitive, otherwise `other`. A fixed typed array (`Float64Array`) coerces to such a
// slice in Rust but not to its `number[]` in TypeScript, so a call converts or rejects it.
pub(super) const SLICE_ARGUMENT_MARKER: &str = "@slice-argument:";
// `{name}:{typed array}` for a constant typed as a fixed typed-primitive array.
pub(super) const TYPED_ARRAY_CONSTANT_MARKER: &str = "@typed-array-constant:";
// `{struct identity}␟{field}␟{typed array}` for a field typed as a fixed typed-primitive array.
pub(super) const TYPED_ARRAY_FIELD_MARKER: &str = "@typed-array-field:";
// `{struct identity}␟{field}␟{typed array}` for a `Vec`/slice field of fixed typed-primitive arrays
// (`Vec<[f64; 2]>`), whose elements are typed arrays in TypeScript.
pub(super) const TYPED_ARRAY_SEQUENCE_FIELD_MARKER: &str = "@typed-array-sequence-field:";

// Functions returning a Rust `Vec`, slice or fixed array (`module SEP function SEP`).
pub(super) const SEQUENCE_RETURN_MARKER: &str = "@sequence-return:";

pub(super) const BOOLEAN_EXPRESSION_MARKER: &str = "@boolean-expression:";

pub(super) const BOOLEAN_FIELD_MARKER: &str = "@boolean-field:";

pub(super) const CHAR_EXPRESSION_MARKER: &str = "@char-expression:";

pub(super) const STRING_EXPRESSION_MARKER: &str = "@string-expression:";

pub(super) const STRING_FIELD_MARKER: &str = "@string-field:";

pub(super) const STRING_RETURN_MARKER: &str = "@string-return:";

pub(super) const STRING_UNION_MARKER: &str = "@string-union:";

pub(super) const INLINE_STRING_UNION_MARKER: &str = "@inline-string-union:";

pub(super) const STRUCT_OWNER_MARKER: &str = "@struct-owner:";

// `{struct identity} SEP { TypeScript object literal }` for an explicitly designated public record
// whose standard derived `Default` is proven to be structural.
pub(super) const DEFAULT_OBJECT_MARKER: &str = "@default-object:";

// `{module}␟{type-path fact}` retains the source-local canonical type-path context in the aggregate
// provenance context. This lets later alias expansion resolve every spelling of a proven standard
// `Arc`, including absolute paths and renamed root or module imports.
pub(super) const SOURCE_TYPE_PATH_CONTEXT_MARKER: &str = "@source-type-path-context:";

// Owner facts for each source type alias, and `{module}␟{alias}␟{type tokens}` for its
// definition, so a struct identity is seen through alias chains across sources.
pub(super) const TYPE_ALIAS_DEFINITION_MARKER: &str = "@type-alias-definition:";

// Generic parameter names for a type alias: `{module}␟{alias}␟{param1,param2,...}`.
pub(super) const TYPE_ALIAS_GENERICS_MARKER: &str = "@type-alias-generics:";

pub(super) const TYPE_ALIAS_OWNER_MARKER: &str = "@type-alias-owner:";

// Functions returning a resolved struct (`module SEP function SEP struct identity`).
pub(super) const STRUCT_RETURN_MARKER: &str = "@struct-return:";

// `{struct identity}␟{field}␟{field struct identity}` for each field whose declared type is a struct of
// a source, so a nested field read resolves its owner through the declarations.
pub(super) const STRUCT_FIELD_TYPE_MARKER: &str = "@struct-field-type:";
// `{owner struct identity}␟{method}␟{module}␟{function}␟{arguments}` for each impl method that only
// forwards to a free function. `arguments` lists the forwarded operands in call order, `self` for the
// receiver and a method parameter index otherwise (`self,0,1`).
pub(super) const METHOD_DELEGATION_MARKER: &str = "@method-delegation:";
// `{struct identity}␟{field}␟{numeric_type}` for each field declared as a Rust numeric primitive.
pub(super) const NUMERIC_FIELD_TYPE_MARKER: &str = "@numeric-field-type:";
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
pub(super) const EXTERNAL_STRUCT_RETURN_MARKER: &str = "@external-struct-return:";
// `{struct identity}␟{field}␟{crate}::{Struct}` for a source struct field declared as a dependency
// crate's struct.
pub(super) const EXTERNAL_STRUCT_FIELD_MARKER: &str = "@external-struct-field:";
// `{crate}::{Name}` for a dependency crate's public struct, or public type alias whose definition
// lowers to an identity-bearing object, read in that crate's own source.
pub(super) const SHARED_IDENTITY_EXTERNAL_TYPE_MARKER: &str = "@shared-identity-external-type:";

pub(super) const VEC_CLONE_ARGUMENT_MARKER: &str = "@vec-clone-argument:";

pub(super) const VEC_CLONE_EXPRESSION_MARKER: &str = "@vec-clone-expression:";

pub(super) const UNSIGNED_INTEGER_LOCAL_MARKER: &str = "@unsigned-integer-local:";
