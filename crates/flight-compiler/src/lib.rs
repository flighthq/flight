mod model;
mod typescript;
mod vitest;

use std::error::Error;
use std::fmt;

/// Declares how a Rust source file participates in target generation.
///
/// The directive lives in an inner doc comment at the top of the source file:
/// `//! flight-compiler: target-native` or `//! flight-compiler: rust-only`.
/// Files without either directive are generated normally.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceMode {
    Generate,
    RustOnly,
    TargetNative,
}

/// A Rust source that owns target-language-only identity aliases in an external module.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExternalAliasSource<'a> {
    pub source: &'a str,
    pub module: &'a str,
}

/// A type-only string-literal union proven by an existing external TypeScript contract.
///
/// The compiler still verifies that the literals exactly represent a visible unit Rust enum before
/// it uses this metadata to lower variant expressions. TypeScript runtime enums must not be supplied
/// through this lane.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TypeScriptStringUnion<'a> {
    pub name: &'a str,
    pub module: &'a str,
    pub values: &'a [String],
}

/// A string-literal union proven by an existing inline TypeScript contract position.
///
/// The compiler verifies the same exact Rust representation as [`TypeScriptStringUnion`], but emits
/// the literals directly at type positions instead of introducing a named TypeScript declaration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TypeScriptInlineStringUnion<'a> {
    pub name: &'a str,
    pub values: &'a [String],
}

/// An explicit target-language representation for one Rust type name.
///
/// A module-owned target is imported as a type from that module. An intrinsic target currently
/// supports only `unknown`, which needs no import. Callers derive this metadata from an established
/// TypeScript signature; the compiler never infers it from alias spelling.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TypeScriptTypeAlias<'a> {
    pub name: &'a str,
    pub module: Option<&'a str>,
    pub target: &'a str,
}

/// The exact target-language array representation established for a Rust function parameter.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TypeScriptArrayParameterRepresentation {
    ArrayLikeNumber,
    Float32Array,
}

/// An established TypeScript array representation at one public Rust function parameter.
///
/// The owner and parameter are their emitted TypeScript names. The compiler validates both the
/// unique visible position and its exact Rust shape before using the representation: `&[f32]` for
/// [`TypeScriptArrayParameterRepresentation::ArrayLikeNumber`] and `&mut [f32]` for
/// [`TypeScriptArrayParameterRepresentation::Float32Array`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TypeScriptArrayParameter<'a> {
    pub owner: &'a str,
    pub parameter: &'a str,
    pub representation: TypeScriptArrayParameterRepresentation,
}

/// An established TypeScript contract field whose Rust `Option` uses `null` absence.
///
/// The module and owner identify the canonical TypeScript declaration; the field is its emitted
/// TypeScript name. The compiler validates that exactly one visible Rust owner has a corresponding
/// public `Option` field before changing that position's representation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TypeScriptNullableOptionField<'a> {
    pub module: &'a str,
    pub owner: &'a str,
    pub field: &'a str,
}

/// An established TypeScript function parameter whose Rust `Option` defaults to `null`.
///
/// The owner and parameter are their emitted TypeScript names. The compiler validates that exactly
/// one visible public Rust function has the corresponding `Option` parameter before emitting its
/// `T | null = null` representation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TypeScriptDefaultNullOptionParameter<'a> {
    pub owner: &'a str,
    pub parameter: &'a str,
}

/// An established TypeScript function parameter whose Rust `Option` uses `null` absence.
///
/// The owner and parameter are their emitted TypeScript names. The compiler validates that exactly
/// one visible public Rust function has the corresponding `Option` parameter before changing that
/// position's representation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TypeScriptNullableOptionParameter<'a> {
    pub owner: &'a str,
    pub parameter: &'a str,
}

/// An established TypeScript function or callable type whose Rust `Option` return uses `null`
/// absence.
///
/// The name is the emitted TypeScript function or callable-alias name. The compiler validates that
/// exactly one visible public Rust function or callable alias at that position returns `Option`
/// before changing its representation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TypeScriptNullableOptionReturn<'a> {
    pub name: &'a str,
}

/// A Rust source file and its path. The path (`.../<crate>/src/<module path>.rs`) gives the source its
/// full module identity (`<crate>::<module path>`), which `use` bindings resolve against.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModuleSource<'a> {
    pub path: &'a str,
    pub source: &'a str,
}

/// A Cargo library or binary target root and the crate name paths inside it resolve from.
///
/// Target roots whose file names are not the conventional `src/lib.rs` or `src/main.rs` cannot be
/// identified from a source path alone. Callers that discover Cargo targets, or otherwise know the
/// target boundary, provide that proof explicitly.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CrateRootSource<'a> {
    pub crate_name: &'a str,
    pub path: &'a str,
}

/// A production source and its stable module path for Vitest provenance inference.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VitestAliasSource<'a> {
    pub source: &'a str,
    pub module: &'a str,
}

/// A crate-local test-support module whose public items may satisfy an explicit wildcard import.
///
/// The module identity is caller-owned proof: unlike production aliases, test-support sources are
/// never part of the package contract and only the helpers a portable test actually references are
/// emitted into that test.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VitestSupportSource<'a> {
    pub source: &'a str,
    pub module: &'a str,
}

/// A source construct that cannot yet be lowered mechanically.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileError {
    message: String,
}

// Emitted `Owner.Variant` expressions retain the owner name but not the source or dependency module.
// Equal declarations therefore lower identically, while conflicting declarations would let the
// current-program, same-package-alias and external lowering order choose the literal. Reject that
// ambiguous input before either emitter builds its owner-only context.
struct ExternalStringUnionMetadata<'a> {
    metadata: model::StringUnionMetadata,
    module: &'a str,
}

struct StringUnionMetadataSource<'a> {
    identity: String,
    styles: &'a std::collections::BTreeMap<String, model::StringUnionStyle>,
    values: &'a std::collections::BTreeMap<String, std::collections::BTreeMap<String, String>>,
}

pub(crate) fn compile_error(message: impl Into<String>) -> CompileError {
    return CompileError {
        message: message.into(),
    };
}

/// Compiles one Rust module into its TypeScript functional contract.
///
/// Rust `impl` blocks are deliberately ignored. Entity structs receive a `Raw`
/// suffix so the unsuffixed target-language name remains available to its class
/// layer. The compiler never synthesizes structural `Like` types. Sources whose
/// `Option` values represent explicit API data can use
/// `//! flight-compiler: nullable-options` to emit `T | null`; other sources keep
/// optional properties and `undefined` absence. String unions default to
/// lower-camel literals and can select kebab-case or exact Rust variant spelling per enum with
/// `//! flight-compiler: string-union Reason=kebab-case` or
/// `//! flight-compiler: string-union Mode=rust-variant`. Exact string unions
/// use `Reason=exact` plus one `string-union-value` directive per variant and
/// emit a const object alongside their value union.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_typescript(
    source: &str,
    entity_module: Option<&str>,
) -> Result<String, CompileError> {
    return compile_typescript_with_alias_sources(source, entity_module, &[]);
}

fn compile_typescript_sources(
    source: &str,
    entity_module: Option<&str>,
    alias_sources: &[&str],
    external_alias_sources: &[ExternalAliasSource<'_>],
    module_identities: Option<Vec<String>>,
    source_paths: &[&str],
    visibility_sources: &[ModuleSource<'_>],
    crate_roots: &[CrateRootSource<'_>],
) -> Result<String, CompileError> {
    return compile_typescript_sources_with_options(
        source,
        entity_module,
        alias_sources,
        external_alias_sources,
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        module_identities,
        source_paths,
        visibility_sources,
        crate_roots,
        false,
    );
}

fn compile_typescript_sources_with_options(
    source: &str,
    entity_module: Option<&str>,
    alias_sources: &[&str],
    external_alias_sources: &[ExternalAliasSource<'_>],
    type_script_string_unions: &[TypeScriptStringUnion<'_>],
    type_script_inline_string_unions: &[TypeScriptInlineStringUnion<'_>],
    type_script_type_aliases: &[TypeScriptTypeAlias<'_>],
    internal_type_exports: &[&str],
    type_script_array_parameters: &[TypeScriptArrayParameter<'_>],
    type_script_nullable_option_fields: &[TypeScriptNullableOptionField<'_>],
    type_script_default_null_option_parameters: &[TypeScriptDefaultNullOptionParameter<'_>],
    type_script_nullable_option_parameters: &[TypeScriptNullableOptionParameter<'_>],
    type_script_nullable_option_returns: &[TypeScriptNullableOptionReturn<'_>],
    module_identities: Option<Vec<String>>,
    source_paths: &[&str],
    visibility_sources: &[ModuleSource<'_>],
    crate_roots: &[CrateRootSource<'_>],
    lenient: bool,
) -> Result<String, CompileError> {
    validate_type_script_type_aliases(type_script_type_aliases)?;
    validate_type_script_array_parameters(type_script_array_parameters)?;
    validate_type_script_nullable_option_fields(type_script_nullable_option_fields)?;
    validate_type_script_default_null_option_parameters(
        type_script_default_null_option_parameters,
        type_script_nullable_option_parameters,
    )?;
    validate_type_script_nullable_option_parameters(type_script_nullable_option_parameters)?;
    validate_type_script_nullable_option_returns(type_script_nullable_option_returns)?;
    require_generated_source(source)?;
    let program = if lenient {
        model::parse_program_lenient(source)?
    } else {
        model::parse_program(source)?
    };
    validate_internal_type_exports(
        internal_type_exports,
        &program,
        type_script_inline_string_unions,
        type_script_type_aliases,
    )?;
    let alias_programs = alias_sources
        .iter()
        .map(|alias_source| model::parse_program_lenient(alias_source))
        .collect::<Result<Vec<_>, _>>()?;
    let visibility_programs = visibility_sources
        .iter()
        .map(|visibility_source| model::parse_visibility_program(visibility_source.source))
        .collect::<Result<Vec<_>, _>>()?;
    let visibility_identities = visibility_sources
        .iter()
        .map(|visibility_source| module_identity_from_path(visibility_source.path, crate_roots))
        .collect::<Vec<_>>();
    let external_alias_programs = external_alias_sources
        .iter()
        .map(|external| {
            if external.module.is_empty() {
                return Err(compile_error("external alias module cannot be empty"));
            }
            return Ok((
                model::parse_identity_alias_metadata(external.source)?,
                external.module,
            ));
        })
        .collect::<Result<Vec<_>, _>>()?;
    let external_visibility_programs = external_alias_sources
        .iter()
        .map(|external| model::parse_visibility_program(external.source))
        .collect::<Result<Vec<_>, _>>()?;
    let external_nullable_programs = external_alias_sources
        .iter()
        .filter(|external| has_nullable_option_directive(external.source))
        .filter_map(|external| {
            external_rust_crate_root(external.module).map(|module| {
                (
                    module,
                    model::parse_external_nullable_options(external.source),
                )
            })
        })
        .map(|(module, program)| program.map(|program| (module, program)))
        .collect::<Result<Vec<_>, _>>()?;
    let external_nullable_program_refs = external_nullable_programs
        .iter()
        .map(|(module, program)| (module.as_str(), program))
        .collect::<Vec<_>>();
    let external_record_structs = external_alias_sources
        .iter()
        .map(|external| model::parse_public_record_structs(external.source))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let dependency_export_names = dependency_export_names(external_alias_sources)?;
    let external_string_union_metadata =
        parse_external_string_union_metadata(external_alias_sources)?;
    let type_script_string_union_metadata = resolve_type_script_string_union_metadata(
        type_script_string_unions,
        std::iter::once(&program)
            .chain(&alias_programs)
            .chain(&visibility_programs)
            .chain(&external_visibility_programs),
        "external TypeScript",
    )?;
    let inline_string_union_proxies = type_script_inline_string_unions
        .iter()
        .map(|union| TypeScriptStringUnion {
            name: union.name,
            module: "inline TypeScript signature",
            values: union.values,
        })
        .collect::<Vec<_>>();
    let type_script_inline_string_union_metadata = resolve_type_script_string_union_metadata(
        &inline_string_union_proxies,
        std::iter::once(&program)
            .chain(&alias_programs)
            .chain(&visibility_programs)
            .chain(&external_visibility_programs),
        "inline TypeScript",
    )?;
    let named_type_script_string_unions = type_script_string_unions
        .iter()
        .map(|union| union.name)
        .collect::<std::collections::BTreeSet<_>>();
    if let Some(name) = type_script_inline_string_unions
        .iter()
        .map(|union| union.name)
        .find(|name| named_type_script_string_unions.contains(name))
    {
        return Err(compile_error(format!(
            "TypeScript string union `{name}` cannot be both named and inline"
        )));
    }
    validate_string_union_metadata(
        std::iter::once(StringUnionMetadataSource {
            identity: module_identities
                .as_deref()
                .and_then(|identities| identities.first())
                .map_or_else(
                    || {
                        source_paths.first().map_or_else(
                            || "current source".to_string(),
                            |path| format!("current source `{path}`"),
                        )
                    },
                    |module| format!("current module `{module}`"),
                ),
            styles: &program.string_unions,
            values: &program.string_union_values,
        })
        .chain(alias_programs.iter().enumerate().map(|(index, program)| {
            return StringUnionMetadataSource {
                identity: module_identities
                    .as_deref()
                    .and_then(|identities| identities.get(index + 1))
                    .map_or_else(
                        || {
                            source_paths.get(index + 1).map_or_else(
                                || format!("same-package alias source #{}", index + 1),
                                |path| format!("same-package source `{path}`"),
                            )
                        },
                        |module| format!("same-package module `{module}`"),
                    ),
                styles: &program.string_unions,
                values: &program.string_union_values,
            };
        }))
        .chain(external_string_union_metadata.iter().map(|external| {
            return StringUnionMetadataSource {
                identity: format!("external module `{}`", external.module),
                styles: &external.metadata.styles,
                values: &external.metadata.values,
            };
        }))
        .chain(type_script_string_union_metadata.iter().map(|external| {
            return StringUnionMetadataSource {
                identity: format!("external TypeScript module `{}`", external.module),
                styles: &external.metadata.styles,
                values: &external.metadata.values,
            };
        }))
        .chain(
            type_script_inline_string_union_metadata
                .iter()
                .map(|external| {
                    return StringUnionMetadataSource {
                        identity: "inline TypeScript signature".to_string(),
                        styles: &external.metadata.styles,
                        values: &external.metadata.values,
                    };
                }),
        ),
    )?;
    let external_string_unions = external_string_union_metadata
        .iter()
        .chain(&type_script_string_union_metadata)
        .chain(&type_script_inline_string_union_metadata)
        .flat_map(|external| external.metadata.styles.keys().cloned())
        .collect::<std::collections::BTreeSet<_>>();
    let inline_string_unions = type_script_inline_string_unions
        .iter()
        .map(|union| (union.name.to_string(), union.values.to_vec()))
        .collect::<std::collections::BTreeMap<_, _>>();
    let all_source_paths = (0..=alias_sources.len())
        .map(|index| source_paths.get(index).map(|path| (*path).to_string()))
        .chain(
            visibility_sources
                .iter()
                .map(|visibility_source| Some(visibility_source.path.to_string())),
        )
        .collect::<Vec<_>>();
    let mut output = typescript::emit_program(&typescript::EmitProgramInput {
        program: &program,
        entity_module,
        alias_programs: &alias_programs,
        external_alias_programs: &external_alias_programs,
        external_nullable_programs: &external_nullable_program_refs,
        external_record_structs: &external_record_structs,
        dependency_export_names: &dependency_export_names,
        external_string_unions: &external_string_unions,
        inline_string_unions: &inline_string_unions,
        internal_type_exports,
        type_script_type_aliases,
        type_script_array_parameters,
        type_script_nullable_option_fields,
        type_script_default_null_option_parameters,
        type_script_nullable_option_parameters,
        type_script_nullable_option_returns,
        external_shared_identity_fields: &external_shared_identity_fields(external_alias_sources)?,
        module_identities: module_identities.as_deref(),
        visibility_programs: &visibility_programs,
        visibility_identities: &visibility_identities,
        source_paths: &all_source_paths,
        lenient,
    })?;
    output =
        lower_string_union_variants(output, &program.string_unions, &program.string_union_values)?;
    output = lower_numeric_union_variants(output, &program.numeric_unions)?;
    for alias_program in &alias_programs {
        output = lower_string_union_variants(
            output,
            &alias_program.string_unions,
            &alias_program.string_union_values,
        )?;
        output = lower_numeric_union_variants(output, &alias_program.numeric_unions)?;
    }
    for external in &external_string_union_metadata {
        output = lower_string_union_variants(
            output,
            &external.metadata.styles,
            &external.metadata.values,
        )?;
    }
    for external in &type_script_string_union_metadata {
        output = lower_string_union_variants(
            output,
            &external.metadata.styles,
            &external.metadata.values,
        )?;
    }
    for external in &type_script_inline_string_union_metadata {
        output = lower_string_union_variants(
            output,
            &external.metadata.styles,
            &external.metadata.values,
        )?;
    }
    validate_const_group_bindings(&output, &program.const_groups)?;
    let sibling_sources = alias_sources
        .iter()
        .copied()
        .chain(
            visibility_sources
                .iter()
                .map(|visibility_source| visibility_source.source)
                .filter(|source| matches!(source_mode(source), Ok(SourceMode::TargetNative))),
        )
        .collect::<Vec<_>>();
    return Ok(export_crate_visible_items(
        output,
        &program,
        &sibling_sources,
        source_paths.first().copied(),
    ));
}

/// Compiles one Rust module while reusing canonical callable aliases declared by sibling sources.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_typescript_with_alias_sources(
    source: &str,
    entity_module: Option<&str>,
    alias_sources: &[&str],
) -> Result<String, CompileError> {
    return compile_typescript_with_external_alias_sources(
        source,
        entity_module,
        alias_sources,
        &[],
    );
}

/// Compiles one Rust module with same-package aliases and externally owned identity aliases.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_typescript_with_external_alias_sources(
    source: &str,
    entity_module: Option<&str>,
    alias_sources: &[&str],
    external_alias_sources: &[ExternalAliasSource<'_>],
) -> Result<String, CompileError> {
    return compile_typescript_sources(
        source,
        entity_module,
        alias_sources,
        external_alias_sources,
        None,
        &[],
        &[],
        &[],
    );
}

/// Compiles one Rust module with sibling sources identified by their file paths. Each source's full
/// module identity follows from its path, so struct and function facts resolve through its `use`
/// bindings. When any identity cannot be derived, or two sources share one, every source resolves
/// only its own declarations.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_typescript_with_module_sources(
    source: ModuleSource<'_>,
    entity_module: Option<&str>,
    alias_sources: &[ModuleSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
) -> Result<String, CompileError> {
    return compile_typescript_with_visibility_sources(
        source,
        entity_module,
        alias_sources,
        external_alias_sources,
        &[],
    );
}

/// Compiles one Rust module like `compile_typescript_with_module_sources`, also seeing the crate's
/// other sources (target-native modules, the crate root) as visibility-only inputs: the
/// eager-initialization proof reads their `impl`, derive, attribute and macro facts, and nothing in
/// them is validated, walked or emitted.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_typescript_with_visibility_sources(
    source: ModuleSource<'_>,
    entity_module: Option<&str>,
    alias_sources: &[ModuleSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
    visibility_sources: &[ModuleSource<'_>],
) -> Result<String, CompileError> {
    return compile_typescript_with_visibility_sources_and_crate_roots(
        source,
        entity_module,
        alias_sources,
        external_alias_sources,
        visibility_sources,
        &[],
    );
}

/// Compiles one Rust module with visibility sources and proven Cargo target roots.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_typescript_with_visibility_sources_and_crate_roots(
    source: ModuleSource<'_>,
    entity_module: Option<&str>,
    alias_sources: &[ModuleSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
    visibility_sources: &[ModuleSource<'_>],
    crate_roots: &[CrateRootSource<'_>],
) -> Result<String, CompileError> {
    return compile_typescript_with_options(
        source,
        entity_module,
        alias_sources,
        external_alias_sources,
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        visibility_sources,
        crate_roots,
        false,
    );
}

/// Compiles one Rust module with full options including lenient mode.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_typescript_with_options(
    source: ModuleSource<'_>,
    entity_module: Option<&str>,
    alias_sources: &[ModuleSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
    type_script_string_unions: &[TypeScriptStringUnion<'_>],
    type_script_inline_string_unions: &[TypeScriptInlineStringUnion<'_>],
    type_script_type_aliases: &[TypeScriptTypeAlias<'_>],
    type_script_nullable_option_fields: &[TypeScriptNullableOptionField<'_>],
    type_script_default_null_option_parameters: &[TypeScriptDefaultNullOptionParameter<'_>],
    type_script_nullable_option_parameters: &[TypeScriptNullableOptionParameter<'_>],
    type_script_nullable_option_returns: &[TypeScriptNullableOptionReturn<'_>],
    visibility_sources: &[ModuleSource<'_>],
    crate_roots: &[CrateRootSource<'_>],
    lenient: bool,
) -> Result<String, CompileError> {
    return compile_typescript_with_options_and_internal_type_exports(
        source,
        entity_module,
        alias_sources,
        external_alias_sources,
        type_script_string_unions,
        type_script_inline_string_unions,
        type_script_type_aliases,
        &[],
        type_script_nullable_option_fields,
        type_script_default_null_option_parameters,
        type_script_nullable_option_parameters,
        type_script_nullable_option_returns,
        visibility_sources,
        crate_roots,
        lenient,
    );
}

/// Compiles one Rust module with explicit crate-internal TypeScript type owners. These names remain
/// off the package contract and root lanes; callers must derive them from an established internal
/// TypeScript module.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_typescript_with_options_and_internal_type_exports(
    source: ModuleSource<'_>,
    entity_module: Option<&str>,
    alias_sources: &[ModuleSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
    type_script_string_unions: &[TypeScriptStringUnion<'_>],
    type_script_inline_string_unions: &[TypeScriptInlineStringUnion<'_>],
    type_script_type_aliases: &[TypeScriptTypeAlias<'_>],
    internal_type_exports: &[&str],
    type_script_nullable_option_fields: &[TypeScriptNullableOptionField<'_>],
    type_script_default_null_option_parameters: &[TypeScriptDefaultNullOptionParameter<'_>],
    type_script_nullable_option_parameters: &[TypeScriptNullableOptionParameter<'_>],
    type_script_nullable_option_returns: &[TypeScriptNullableOptionReturn<'_>],
    visibility_sources: &[ModuleSource<'_>],
    crate_roots: &[CrateRootSource<'_>],
    lenient: bool,
) -> Result<String, CompileError> {
    return compile_typescript_with_options_and_internal_type_exports_and_array_parameters(
        source,
        entity_module,
        alias_sources,
        external_alias_sources,
        type_script_string_unions,
        type_script_inline_string_unions,
        type_script_type_aliases,
        internal_type_exports,
        &[],
        type_script_nullable_option_fields,
        type_script_default_null_option_parameters,
        type_script_nullable_option_parameters,
        type_script_nullable_option_returns,
        visibility_sources,
        crate_roots,
        lenient,
    );
}

/// Compiles one Rust module with explicit crate-internal type owners and established TypeScript
/// array representations at exact function-parameter positions.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_typescript_with_options_and_internal_type_exports_and_array_parameters(
    source: ModuleSource<'_>,
    entity_module: Option<&str>,
    alias_sources: &[ModuleSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
    type_script_string_unions: &[TypeScriptStringUnion<'_>],
    type_script_inline_string_unions: &[TypeScriptInlineStringUnion<'_>],
    type_script_type_aliases: &[TypeScriptTypeAlias<'_>],
    internal_type_exports: &[&str],
    type_script_array_parameters: &[TypeScriptArrayParameter<'_>],
    type_script_nullable_option_fields: &[TypeScriptNullableOptionField<'_>],
    type_script_default_null_option_parameters: &[TypeScriptDefaultNullOptionParameter<'_>],
    type_script_nullable_option_parameters: &[TypeScriptNullableOptionParameter<'_>],
    type_script_nullable_option_returns: &[TypeScriptNullableOptionReturn<'_>],
    visibility_sources: &[ModuleSource<'_>],
    crate_roots: &[CrateRootSource<'_>],
    lenient: bool,
) -> Result<String, CompileError> {
    let identities = std::iter::once(&source)
        .chain(alias_sources)
        .map(|module| module_identity_from_path(module.path, crate_roots))
        .collect::<Option<Vec<_>>>()
        .filter(|identities| {
            identities
                .iter()
                .collect::<std::collections::BTreeSet<_>>()
                .len()
                == identities.len()
        });
    let alias_source_texts = alias_sources
        .iter()
        .map(|module| module.source)
        .collect::<Vec<_>>();
    return compile_typescript_sources_with_options(
        source.source,
        entity_module,
        &alias_source_texts,
        external_alias_sources,
        type_script_string_unions,
        type_script_inline_string_unions,
        type_script_type_aliases,
        internal_type_exports,
        type_script_array_parameters,
        type_script_nullable_option_fields,
        type_script_default_null_option_parameters,
        type_script_nullable_option_parameters,
        type_script_nullable_option_returns,
        identities,
        &std::iter::once(source.path)
            .chain(alias_sources.iter().map(|module| module.path))
            .collect::<Vec<_>>(),
        visibility_sources,
        crate_roots,
        lenient,
    );
}

/// Compiles one Rust module in lenient mode: unsupported constructs emit a diagnostic comment
/// instead of failing, so the output contains all items the compiler can lower and comment stubs
/// for the rest.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_typescript_lenient(
    source: &str,
    entity_module: Option<&str>,
) -> Result<String, CompileError> {
    return compile_typescript_sources_with_options(
        source,
        entity_module,
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        None,
        &[],
        &[],
        &[],
        true,
    );
}

/// Compiles one canonical Rust contract-test module into a Vitest suite.
///
/// Only tests of the free-function contract are portable. Rust `impl` tests
/// are rejected, while target-specific TypeScript tests remain handwritten.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_vitest(source: &str, contract_module: &str) -> Result<String, CompileError> {
    return compile_vitest_with_alias_sources(source, contract_module, &[]);
}

/// Compiles one Rust test module with signature and directive hints from production sources.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_vitest_with_alias_sources(
    source: &str,
    contract_module: &str,
    alias_sources: &[&str],
) -> Result<String, CompileError> {
    let module_paths = (0..alias_sources.len())
        .map(|index| format!("alias-source/{index}"))
        .collect::<Vec<_>>();
    let named_alias_sources = alias_sources
        .iter()
        .zip(&module_paths)
        .map(|(source, module)| VitestAliasSource { source, module })
        .collect::<Vec<_>>();
    return compile_vitest_with_module_alias_sources(source, contract_module, &named_alias_sources);
}

/// Compiles one Rust test module with production hints selected by public contract re-exports.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_vitest_with_contract_alias_sources(
    source: &str,
    contract_module: &str,
    contract_source: &str,
    alias_sources: &[VitestAliasSource<'_>],
) -> Result<String, CompileError> {
    return compile_vitest_with_contract_alias_sources_internal(
        source,
        contract_module,
        Some(contract_source),
        alias_sources,
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
    );
}

fn compile_vitest_with_contract_alias_sources_internal(
    source: &str,
    contract_module: &str,
    contract_source: Option<&str>,
    alias_sources: &[VitestAliasSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
    type_script_string_unions: &[TypeScriptStringUnion<'_>],
    visibility_sources: &[&str],
    type_script_type_aliases: &[TypeScriptTypeAlias<'_>],
    type_script_array_parameters: &[TypeScriptArrayParameter<'_>],
    type_script_nullable_option_fields: &[TypeScriptNullableOptionField<'_>],
    type_script_default_null_option_parameters: &[TypeScriptDefaultNullOptionParameter<'_>],
    type_script_nullable_option_parameters: &[TypeScriptNullableOptionParameter<'_>],
    type_script_nullable_option_returns: &[TypeScriptNullableOptionReturn<'_>],
    support_sources: &[VitestSupportSource<'_>],
) -> Result<String, CompileError> {
    validate_type_script_type_aliases(type_script_type_aliases)?;
    validate_type_script_array_parameters(type_script_array_parameters)?;
    validate_type_script_nullable_option_fields(type_script_nullable_option_fields)?;
    validate_type_script_default_null_option_parameters(
        type_script_default_null_option_parameters,
        type_script_nullable_option_parameters,
    )?;
    validate_type_script_nullable_option_parameters(type_script_nullable_option_parameters)?;
    validate_type_script_nullable_option_returns(type_script_nullable_option_returns)?;
    require_generated_source(source)?;
    let mut program = model::parse_test_program(source)?;
    let dependency_export_names = dependency_export_names(external_alias_sources)?;
    let mut alias_programs = alias_sources
        .iter()
        .map(|alias_source| model::parse_program_lenient(alias_source.source))
        .collect::<Result<Vec<_>, _>>()?;
    let support_programs = support_sources
        .iter()
        .map(|support_source| model::parse_program_lenient(support_source.source))
        .collect::<Result<Vec<_>, _>>()?;
    let support_program_refs = support_sources
        .iter()
        .zip(&support_programs)
        .map(|(source, program)| (source.module, program))
        .collect::<Vec<_>>();
    // A test reads a factory's result as the record it is: an identity alias such as
    // `NonEntityCreateResult<T>` classifies the production signature and is `T` for every value a test
    // binds. Tests emit no production signatures, so the alias peels here, before return provenance.
    let mut identity_aliases = std::collections::BTreeSet::new();
    for external in external_alias_sources {
        identity_aliases.extend(model::parse_identity_alias_metadata(external.source)?.into_keys());
    }
    for alias_program in &mut alias_programs {
        for function in &mut alias_program.functions {
            peel_identity_alias_return(&mut function.sig.output, &identity_aliases);
        }
    }
    let external_record_structs = external_alias_sources
        .iter()
        .map(|external| model::parse_public_record_structs(external.source))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let alias_program_refs = alias_sources
        .iter()
        .zip(&alias_programs)
        .map(|(source, program)| (source.module, program))
        .collect::<Vec<_>>();
    let string_unions = model::parse_string_union_metadata(source)?;
    let contract_string_unions = contract_source
        .map(|source| model::parse_string_union_metadata(source))
        .transpose()?;
    let external_string_union_metadata =
        parse_external_string_union_metadata(external_alias_sources)?;
    let visibility_programs = visibility_sources
        .iter()
        .map(|source| model::parse_visibility_program(source))
        .collect::<Result<Vec<_>, _>>()?;
    let type_script_string_union_metadata = resolve_type_script_string_union_metadata(
        type_script_string_unions,
        alias_programs.iter().chain(&visibility_programs),
        "external TypeScript",
    )?;
    validate_string_union_metadata(
        std::iter::once(StringUnionMetadataSource {
            identity: format!("current test source for module `{contract_module}`"),
            styles: &string_unions.styles,
            values: &string_unions.values,
        })
        .chain(contract_string_unions.iter().map(|contract_su| {
            return StringUnionMetadataSource {
                identity: format!("contract source for module `{contract_module}`"),
                styles: &contract_su.styles,
                values: &contract_su.values,
            };
        }))
        .chain(
            alias_sources
                .iter()
                .zip(&alias_programs)
                .map(|(source, program)| {
                    return StringUnionMetadataSource {
                        identity: format!("same-package module `{}`", source.module),
                        styles: &program.string_unions,
                        values: &program.string_union_values,
                    };
                }),
        )
        .chain(external_string_union_metadata.iter().map(|external| {
            return StringUnionMetadataSource {
                identity: format!("external module `{}`", external.module),
                styles: &external.metadata.styles,
                values: &external.metadata.values,
            };
        }))
        .chain(type_script_string_union_metadata.iter().map(|external| {
            return StringUnionMetadataSource {
                identity: format!("external TypeScript module `{}`", external.module),
                styles: &external.metadata.styles,
                values: &external.metadata.values,
            };
        })),
    )?;
    let mut context = typescript::generation_context(
        &alias_program_refs,
        &external_record_structs,
        &external_shared_identity_fields(external_alias_sources)?,
        contract_source,
    )?;
    typescript::insert_type_script_type_alias_context(&mut context, type_script_type_aliases);
    let visibility_program_refs = visibility_programs
        .iter()
        .enumerate()
        .map(|(index, program)| (format!("vitest-visibility/{index}"), program))
        .collect::<Vec<_>>();
    typescript::insert_type_script_array_parameter_context(
        &mut context,
        alias_program_refs.iter().copied().chain(
            visibility_program_refs
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_array_parameters,
    )?;
    typescript::insert_type_script_nullable_option_field_context(
        &mut context,
        alias_program_refs.iter().copied().chain(
            visibility_program_refs
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_nullable_option_fields,
    )?;
    typescript::insert_type_script_nullable_option_return_context(
        &mut context,
        alias_program_refs.iter().copied().chain(
            visibility_program_refs
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_nullable_option_returns,
    )?;
    typescript::insert_type_script_nullable_option_parameter_context(
        &mut context,
        alias_program_refs.iter().copied().chain(
            visibility_program_refs
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_nullable_option_parameters,
    )?;
    typescript::insert_type_script_default_null_option_parameter_context(
        &mut context,
        alias_program_refs.iter().copied().chain(
            visibility_program_refs
                .iter()
                .map(|(module, program)| (module.as_str(), *program)),
        ),
        type_script_default_null_option_parameters,
    )?;
    typescript::insert_vitest_own_public_context(
        &mut context,
        &alias_program_refs
            .iter()
            .map(|(_, program)| *program)
            .collect::<Vec<_>>(),
    );
    let external_string_unions = external_string_union_metadata
        .iter()
        .chain(&type_script_string_union_metadata)
        .flat_map(|external| external.metadata.styles.keys().cloned())
        .collect::<std::collections::BTreeSet<_>>();
    typescript::insert_string_union_context(&mut context, external_string_unions.iter());
    if program.nullable_options {
        typescript::insert_nullable_options_context(&mut context);
        typescript::insert_vitest_nullable_call_context(
            &mut context,
            program
                .helpers
                .iter()
                .chain(program.suites.iter().flat_map(|suite| &suite.helpers)),
        );
    }
    // A target-native sibling's hand-written TypeScript twin takes `T | null` for the Option parameters
    // of a `nullable-options` module, so a `None` argument passed to its public functions lowers to `null`.
    for visibility_source in visibility_sources {
        if !matches!(source_mode(visibility_source)?, SourceMode::TargetNative) {
            continue;
        }
        let visibility_program = model::parse_external_nullable_options(visibility_source)?;
        if visibility_program.nullable_options {
            typescript::insert_vitest_nullable_call_context(
                &mut context,
                visibility_program
                    .functions
                    .iter()
                    .filter(|function| matches!(function.vis, syn::Visibility::Public(_))),
            );
        }
    }
    typescript::insert_vitest_local_crate_context(
        &mut context,
        contract_module,
        alias_sources.iter().map(|source| source.module),
    );
    vitest::resolve_test_support_wildcards(&mut program, &support_program_refs, &context)?;
    typescript::insert_string_union_context(&mut context, string_unions.styles.keys());
    if let Some(ref contract_su) = contract_string_unions {
        typescript::insert_string_union_context(&mut context, contract_su.styles.keys());
    }
    for alias_program in &alias_programs {
        typescript::insert_string_union_context(&mut context, alias_program.string_unions.keys());
    }
    typescript::insert_vitest_import_alias_context(&mut context, program.uses.iter());
    typescript::insert_vitest_dependency_export_name_context(
        &mut context,
        &program,
        &dependency_export_names,
    )?;
    typescript::insert_std_mem_import_context(
        &mut context,
        program
            .uses
            .iter()
            .chain(program.suites.iter().flat_map(|suite| &suite.uses)),
        program
            .helpers
            .iter()
            .map(|helper| helper.sig.ident.to_string()),
    );
    typescript::insert_std_float_consts_context(
        &mut context,
        program
            .uses
            .iter()
            .chain(program.suites.iter().flat_map(|suite| &suite.uses)),
    );
    typescript::insert_type_path_context(
        &mut context,
        program
            .uses
            .iter()
            .chain(program.suites.iter().flat_map(|suite| &suite.uses)),
        program
            .structs
            .iter()
            .map(|structure| structure.ident.to_string())
            .chain(
                program
                    .type_aliases
                    .iter()
                    .map(|type_alias| type_alias.ident.to_string()),
            ),
    );
    typescript::insert_vitest_struct_context(
        &mut context,
        alias_programs.iter().flat_map(|program| &program.structs),
    );
    typescript::insert_vitest_local_struct_context(&mut context, program.structs.iter());
    typescript::insert_vitest_local_type_alias_context(&mut context, program.type_aliases.iter());
    typescript::insert_vitest_local_shared_identity_context(
        &mut context,
        program.structs.iter(),
        program.type_aliases.iter(),
    );
    typescript::insert_vitest_helper_return_context(
        &mut context,
        "vitest/top-level",
        program.helpers.iter(),
    );
    typescript::insert_typed_array_constant_context(&mut context, &program.constants);
    let mut type_script_string_union_owners = std::collections::BTreeMap::new();
    for external in &type_script_string_union_metadata {
        for name in external.metadata.styles.keys() {
            if let Some(previous) =
                type_script_string_union_owners.insert(name.clone(), external.module)
                && previous != external.module
            {
                return Err(compile_error(format!(
                    "external TypeScript string union `{name}` has conflicting owners `{previous}` and `{}`",
                    external.module
                )));
            }
        }
    }
    let mut output = vitest::emit_test_program(
        &program,
        contract_module,
        &type_script_string_union_owners,
        &context,
    )?;
    output = lower_string_union_variants(output, &string_unions.styles, &string_unions.values)?;
    if let Some(ref contract_su) = contract_string_unions {
        output = lower_string_union_variants(output, &contract_su.styles, &contract_su.values)?;
    }
    for alias_program in &alias_programs {
        output = lower_string_union_variants(
            output,
            &alias_program.string_unions,
            &alias_program.string_union_values,
        )?;
        output = lower_numeric_union_variants(output, &alias_program.numeric_unions)?;
    }
    for external in &external_string_union_metadata {
        output = lower_string_union_variants(
            output,
            &external.metadata.styles,
            &external.metadata.values,
        )?;
    }
    for external in &type_script_string_union_metadata {
        output = lower_string_union_variants(
            output,
            &external.metadata.styles,
            &external.metadata.values,
        )?;
    }
    return Ok(output);
}

/// Compiles one Rust test module with production hints and dependency sources owned by other
/// packages, whose `export-name` directives name the items the tests import from them.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_vitest_with_external_alias_sources(
    source: &str,
    contract_module: &str,
    contract_source: Option<&str>,
    alias_sources: &[VitestAliasSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
) -> Result<String, CompileError> {
    return compile_vitest_with_contract_alias_sources_internal(
        source,
        contract_module,
        contract_source,
        alias_sources,
        external_alias_sources,
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
    );
}

/// Compiles one Rust test module with source-qualified production hints.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_vitest_with_module_alias_sources(
    source: &str,
    contract_module: &str,
    alias_sources: &[VitestAliasSource<'_>],
) -> Result<String, CompileError> {
    return compile_vitest_with_contract_alias_sources_internal(
        source,
        contract_module,
        None,
        alias_sources,
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
    );
}

/// Compiles one Rust test module with production hints, dependency sources, and the crate's
/// target-native sources, read only for the nullable Option parameters their `nullable-options`
/// directive declares.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_vitest_with_visibility_sources(
    source: &str,
    contract_module: &str,
    contract_source: Option<&str>,
    alias_sources: &[VitestAliasSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
    visibility_sources: &[&str],
    type_script_type_aliases: &[TypeScriptTypeAlias<'_>],
) -> Result<String, CompileError> {
    return compile_vitest_with_options(
        source,
        contract_module,
        contract_source,
        alias_sources,
        external_alias_sources,
        &[],
        visibility_sources,
        type_script_type_aliases,
        &[],
        &[],
        &[],
        &[],
        &[],
    );
}

/// Compiles one Rust test module with production hints, dependency sources, explicit TypeScript
/// string-union, type-alias, and nullable field/parameter/return representations, plus target-native
/// visibility sources.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_vitest_with_options(
    source: &str,
    contract_module: &str,
    contract_source: Option<&str>,
    alias_sources: &[VitestAliasSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
    type_script_string_unions: &[TypeScriptStringUnion<'_>],
    visibility_sources: &[&str],
    type_script_type_aliases: &[TypeScriptTypeAlias<'_>],
    type_script_nullable_option_fields: &[TypeScriptNullableOptionField<'_>],
    type_script_default_null_option_parameters: &[TypeScriptDefaultNullOptionParameter<'_>],
    type_script_nullable_option_parameters: &[TypeScriptNullableOptionParameter<'_>],
    type_script_nullable_option_returns: &[TypeScriptNullableOptionReturn<'_>],
    support_sources: &[VitestSupportSource<'_>],
) -> Result<String, CompileError> {
    return compile_vitest_with_options_and_array_parameters(
        source,
        contract_module,
        contract_source,
        alias_sources,
        external_alias_sources,
        type_script_string_unions,
        visibility_sources,
        type_script_type_aliases,
        &[],
        type_script_nullable_option_fields,
        type_script_default_null_option_parameters,
        type_script_nullable_option_parameters,
        type_script_nullable_option_returns,
        support_sources,
    );
}

/// Compiles one Rust test module with established TypeScript array representations at exact
/// production function-parameter positions.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_vitest_with_options_and_array_parameters(
    source: &str,
    contract_module: &str,
    contract_source: Option<&str>,
    alias_sources: &[VitestAliasSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
    type_script_string_unions: &[TypeScriptStringUnion<'_>],
    visibility_sources: &[&str],
    type_script_type_aliases: &[TypeScriptTypeAlias<'_>],
    type_script_array_parameters: &[TypeScriptArrayParameter<'_>],
    type_script_nullable_option_fields: &[TypeScriptNullableOptionField<'_>],
    type_script_default_null_option_parameters: &[TypeScriptDefaultNullOptionParameter<'_>],
    type_script_nullable_option_parameters: &[TypeScriptNullableOptionParameter<'_>],
    type_script_nullable_option_returns: &[TypeScriptNullableOptionReturn<'_>],
    support_sources: &[VitestSupportSource<'_>],
) -> Result<String, CompileError> {
    return compile_vitest_with_contract_alias_sources_internal(
        source,
        contract_module,
        contract_source,
        alias_sources,
        external_alias_sources,
        type_script_string_unions,
        visibility_sources,
        type_script_type_aliases,
        type_script_array_parameters,
        type_script_nullable_option_fields,
        type_script_default_null_option_parameters,
        type_script_nullable_option_parameters,
        type_script_nullable_option_returns,
        support_sources,
    );
}

// Rewrites `-> Alias<T>` to `-> T` while `Alias` is a declared identity alias, so return provenance reads
// the record the alias wraps.
fn peel_identity_alias_return(
    output: &mut syn::ReturnType,
    identity_aliases: &std::collections::BTreeSet<String>,
) {
    let syn::ReturnType::Type(_, rust_type) = output else {
        return;
    };
    loop {
        let syn::Type::Path(path) = rust_type.as_ref() else {
            return;
        };
        let Some(segment) = path.path.segments.last() else {
            return;
        };
        if path.qself.is_some() || !identity_aliases.contains(&segment.ident.to_string()) {
            return;
        }
        let syn::PathArguments::AngleBracketed(arguments) = &segment.arguments else {
            return;
        };
        let [syn::GenericArgument::Type(inner)] = arguments.args.iter().collect::<Vec<_>>()[..]
        else {
            return;
        };
        **rust_type = inner.clone();
    }
}

fn crate_root_module_identity(path: &str, crate_roots: &[CrateRootSource<'_>]) -> Option<String> {
    fn canonical(path: &str) -> std::path::PathBuf {
        return std::fs::canonicalize(path).unwrap_or_else(|_| std::path::PathBuf::from(path));
    }

    fn module_segments(path: &std::path::Path) -> Option<Vec<String>> {
        let mut segments = path
            .components()
            .map(|component| component.as_os_str().to_str().map(str::to_string))
            .collect::<Option<Vec<_>>>()?;
        let file = segments.pop()?;
        let stem = file.strip_suffix(".rs")?;
        if stem != "mod" {
            segments.push(stem.to_string());
        }
        let valid = segments.iter().all(|segment| {
            !segment.is_empty()
                && segment
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '_')
        });
        return valid.then_some(segments);
    }

    let path = canonical(path);
    let roots = crate_roots
        .iter()
        .map(|root| (root, canonical(root.path)))
        .collect::<Vec<_>>();
    if let Some((root, _)) = roots.iter().find(|(_, root_path)| *root_path == path) {
        return valid_crate_name(root.crate_name).then(|| root.crate_name.replace('-', "_"));
    }
    let mut candidates = roots
        .iter()
        .filter_map(|(root, root_path)| {
            let relative = path.strip_prefix(root_path.parent()?).ok()?;
            let modules = module_segments(relative)?;
            let depth = root_path.parent()?.components().count();
            Some((depth, root, modules))
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|(depth, _, _)| *depth);
    let (depth, root, modules) = candidates.pop()?;
    if candidates
        .last()
        .is_some_and(|(other_depth, _, _)| *other_depth == depth)
        || !valid_crate_name(root.crate_name)
    {
        return None;
    }
    return Some(
        std::iter::once(root.crate_name.replace('-', "_"))
            .chain(modules)
            .collect::<Vec<_>>()
            .join("::"),
    );
}

fn dependency_export_names<'a>(
    external_alias_sources: &[ExternalAliasSource<'a>],
) -> Result<Vec<(std::collections::BTreeMap<String, String>, &'a str)>, CompileError> {
    return external_alias_sources
        .iter()
        .map(|external| {
            if external.module.is_empty() {
                return Err(compile_error("external alias module cannot be empty"));
            }
            let mut names = model::parse_export_name_metadata(external.source)?;
            // A dependency entity keeps its exact contract name unless its Rust owner declares a
            // companion wrapper. Then the generated record is the `Raw` representation and the
            // unsuffixed TypeScript name belongs to the companion class.
            if model::has_companion_metadata(external.source)? {
                for entity in model::parse_entity_names(external.source)? {
                    names
                        .entry(entity.clone())
                        .or_insert_with(|| format!("{entity}Raw"));
                }
            }
            return Ok((names, external.module));
        })
        .collect();
}

// The value bindings the final emitted TypeScript introduces, in code only: every value import
// specifier (named, renamed, default or namespace; `import type` and `type` specifiers bind no
// value), every `const` / `let` / `var` / `function` / `class` / `enum` declaration, and every
// function and arrow parameter, including every destructured, renamed, nested, rest or defaulted
// name. Compiler-injected locals and compiler-provided imports pass through here like any other
// binding, so one inventory covers every emitter feature. A parenthesized list that only looks like
// parameters (a function type's) is still counted, which can only fail closed.
fn emitted_value_bindings(output: &str) -> Vec<String> {
    let mut code = vec![b' '; output.len()];
    for range in typescript_code_ranges(output) {
        code[range.clone()].copy_from_slice(&output.as_bytes()[range]);
    }
    let code = String::from_utf8(code).expect("code ranges split on ASCII delimiters");
    let mut bindings = Vec::new();
    let identifier = |text: &str| -> Option<String> {
        let name = text
            .trim()
            .trim_start_matches("...")
            .chars()
            .take_while(|character| {
                character.is_ascii_alphanumeric() || *character == '_' || *character == '$'
            })
            .collect::<String>();
        return (!name.is_empty()).then_some(name);
    };
    let words = code
        .char_indices()
        .filter(|(index, character)| {
            (character.is_ascii_alphabetic() || *character == '_')
                && code[..*index].chars().last().is_none_or(|previous| {
                    !(previous.is_ascii_alphanumeric()
                        || previous == '_'
                        || previous == '$'
                        || previous == '.')
                })
        })
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    for start in words {
        let rest = &code[start..];
        let keyword = rest
            .split(|character: char| !(character.is_ascii_alphanumeric() || character == '_'))
            .next()
            .unwrap_or_default();
        let after = rest[keyword.len()..].trim_start();
        match keyword {
            "import" => {
                if after.starts_with("type ") || after.starts_with("type{") {
                    continue;
                }
                let Some(clause_end) = after.find(" from ") else {
                    continue;
                };
                let clause = &after[..clause_end];
                let (head, braced) = match clause.find('{') {
                    Some(open) => (
                        &clause[..open],
                        clause[open + 1..].split('}').next().unwrap_or_default(),
                    ),
                    None => (clause, ""),
                };
                for part in head.split(',') {
                    let part = part.trim();
                    if let Some(namespace) = part.strip_prefix("* as ") {
                        bindings.extend(identifier(namespace));
                    } else {
                        bindings.extend(identifier(part));
                    }
                }
                for specifier in braced.split(',') {
                    let specifier = specifier.trim();
                    if specifier.is_empty() || specifier.starts_with("type ") {
                        continue;
                    }
                    let local = specifier.rsplit(" as ").next().unwrap_or(specifier);
                    bindings.extend(identifier(local));
                }
            }
            "class" | "const" | "enum" | "function" | "let" | "var" => {
                let after = after.trim_start_matches('*').trim_start();
                if let Some(pattern) = after.strip_prefix('[').or_else(|| after.strip_prefix('{')) {
                    let mut depth = 1;
                    let end = pattern
                        .char_indices()
                        .find(|(_, character)| {
                            if *character == '[' || *character == '{' {
                                depth += 1;
                            } else if *character == ']' || *character == '}' {
                                depth -= 1;
                            }
                            return depth == 0;
                        })
                        .map_or(pattern.len(), |(index, _)| index);
                    let opener = &after[..1];
                    pattern_bindings(
                        &format!("{opener}{}", &pattern[..=end.min(pattern.len() - 1)]),
                        &mut bindings,
                    );
                } else {
                    bindings.extend(identifier(after));
                }
            }
            _ => {}
        }
    }
    parameter_bindings(&code, &mut bindings);
    return bindings;
}

// Appends crate-internal exports for the crate-visible items (`pub(crate)`, `pub(super)`,
// `pub(in …)`) a generated or target-native sibling source of the same package references, so those
// modules can import them. Rust-only modules and the lane roots have no TypeScript twin to import with. They
// use `export { … }` / `export type { … }` lists, which the public-lane scan of `export <declaration>`
// lines does not read: a crate-visible item never reaches `contract.ts` or `index.ts`. Items no sibling
// names stay unexported.
// flight-lint: allow(hashmap-iteration) program items are Vecs in Rust source order and names sort before output
fn export_crate_visible_items(
    mut output: String,
    program: &model::Program,
    sibling_sources: &[&str],
    source_path: Option<&str>,
) -> String {
    let own_module = source_path.and_then(|path| {
        std::path::Path::new(path)
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(str::to_string)
    });
    let mut referenced = std::collections::BTreeSet::<String>::new();
    let mut referenced_all = false;
    for source in sibling_sources {
        match &own_module {
            Some(module) => {
                let (names, glob) = sibling_references_to_module(source, module);
                referenced.extend(names);
                referenced_all |= glob;
            }
            None => referenced.extend(
                source
                    .split(|character: char| {
                        !(character.is_ascii_alphanumeric() || character == '_')
                    })
                    .filter(|word| !word.is_empty())
                    .map(str::to_string),
            ),
        }
    }
    let crate_visible = |visibility: &syn::Visibility| {
        return matches!(visibility, syn::Visibility::Restricted(_));
    };
    let named = |rust_name: String, default: String| {
        return program
            .export_names
            .get(&rust_name)
            .cloned()
            .unwrap_or(default);
    };
    let mut candidates = Vec::new();
    for structure in &program.structs {
        if crate_visible(&structure.vis) {
            let name = structure.ident.to_string();
            candidates.push((name.clone(), name));
        }
    }
    for rust_enum in &program.enums {
        if crate_visible(&rust_enum.vis) {
            let name = rust_enum.ident.to_string();
            candidates.push((name.clone(), name));
        }
    }
    for alias in &program.type_aliases {
        if crate_visible(&alias.vis) {
            let name = alias.ident.to_string();
            candidates.push((name.clone(), name));
        }
    }
    for function in &program.functions {
        if crate_visible(&function.vis) {
            let name = function.sig.ident.to_string();
            candidates.push((
                name.clone(),
                named(name.clone(), typescript::snake_to_lower_camel(&name)),
            ));
        }
    }
    for constant in &program.constants {
        if crate_visible(&constant.vis) {
            let name = constant.ident.to_string();
            candidates.push((name.clone(), named(name.clone(), name)));
        }
    }
    for rust_static in &program.statics {
        if crate_visible(&rust_static.vis) {
            let name = rust_static.ident.to_string();
            candidates.push((name.clone(), named(name.clone(), name)));
        }
    }
    let mut values = Vec::new();
    let mut types = Vec::new();
    for (rust_name, name) in candidates {
        if !referenced_all && !referenced.contains(rust_name.as_str()) {
            continue;
        }
        let declares = |keyword: &str| {
            return output.lines().any(|line| {
                line.strip_prefix(keyword).is_some_and(|rest| {
                    rest.strip_prefix(name.as_str()).is_some_and(|tail| {
                        tail.starts_with(|character: char| {
                            !(character.is_ascii_alphanumeric()
                                || character == '_'
                                || character == '$')
                        })
                    })
                })
            });
        };
        if ["function ", "const ", "enum ", "class ", "let "]
            .iter()
            .any(|keyword| declares(keyword))
        {
            values.push(name);
        } else if ["interface ", "type "]
            .iter()
            .any(|keyword| declares(keyword))
        {
            types.push(name);
        }
    }
    values.sort();
    values.dedup();
    types.sort();
    types.dedup();
    if values.is_empty() && types.is_empty() {
        return output;
    }
    if !output.ends_with("\n\n") {
        output.push('\n');
    }
    if !values.is_empty() {
        output.push_str(&format!("export {{ {} }};\n", values.join(", ")));
    }
    if !types.is_empty() {
        output.push_str(&format!("export type {{ {} }};\n", types.join(", ")));
    }
    return output;
}

fn external_rust_crate_root(module: &str) -> Option<String> {
    let package = module
        .strip_prefix("@flighthq/")?
        .strip_suffix("/contract")?;
    return Some(format!("flight_{}", package.replace('-', "_")));
}

// The identity-bearing types and public fields of the dependency sources (see
// `typescript::external_shared_identity_facts`).
fn external_shared_identity_fields(
    external_alias_sources: &[ExternalAliasSource<'_>],
) -> Result<std::collections::BTreeSet<String>, CompileError> {
    return typescript::external_shared_identity_facts(
        &external_alias_sources
            .iter()
            .map(|external| (external.source, external.module))
            .collect::<Vec<_>>(),
    );
}

fn has_nullable_option_directive(source: &str) -> bool {
    return source.lines().any(|line| {
        let Some(directive) = line
            .trim()
            .strip_prefix("//! flight-compiler: ")
            .and_then(|line| line.split_whitespace().next())
        else {
            return false;
        };
        return matches!(directive, "nullable-option" | "nullable-options");
    });
}

// Replaces each emitted `Owner.Variant` reference to a numeric union with the variant's declared
// integer discriminant and drops the owner from value import lists: the TypeScript declaration is a
// type-only alias, so no runtime value exists. Only code is rewritten (see `typescript_code_ranges`);
// string, comment, and template-literal text is data and stays byte-for-byte. A reference to an
// undeclared variant, or one whose replacement would read as a different expression (adjacent to an
// identifier, `.`, `+` or `-`), fails closed.
fn lower_numeric_union_variants(
    mut output: String,
    numeric_unions: &std::collections::BTreeMap<String, Vec<(String, i64)>>,
) -> Result<String, CompileError> {
    for (owner, variants) in numeric_unions {
        let prefix = format!("{owner}.");
        output = rewrite_typescript_code(&output, |code| {
            let mut code = code.to_string();
            let mut cursor = 0;
            while let Some(relative_start) = code[cursor..].find(&prefix) {
                let start = cursor + relative_start;
                let variant_start = start + prefix.len();
                let preceding = code[..start].chars().next_back();
                if preceding.is_some_and(|character| {
                    character.is_ascii_alphanumeric() || character == '_' || character == '.'
                }) {
                    cursor = variant_start;
                    continue;
                }
                let variant_length = code[variant_start..]
                    .chars()
                    .take_while(|character| character.is_ascii_alphanumeric() || *character == '_')
                    .map(char::len_utf8)
                    .sum::<usize>();
                let end = variant_start + variant_length;
                let variant = &code[variant_start..end];
                let Some((_, value)) = variants.iter().find(|(name, _)| name == variant) else {
                    return Err(compile_error(format!(
                        "numeric union `{owner}` has no variant `{variant}`"
                    )));
                };
                let before = code[..start].trim_end().chars().next_back();
                if *value < 0
                    && before.is_some_and(|character| character == '-' || character == '+')
                {
                    return Err(compile_error(format!(
                        "numeric union `{owner}::{variant}` cannot follow a unary or binary sign"
                    )));
                }
                let literal = value.to_string();
                code.replace_range(start..end, &literal);
                cursor = start + literal.len();
            }
            return Ok(code);
        })?;
        output = remove_numeric_union_value_import(output, owner);
    }
    return Ok(output);
}

// Replaces each emitted `Owner.Variant` reference to a string union with its string literal. Only
// code is rewritten (see `typescript_code_ranges`); string, comment, and template-literal text is
// data and stays byte-for-byte.
fn lower_string_union_variants(
    mut output: String,
    string_unions: &std::collections::BTreeMap<String, model::StringUnionStyle>,
    string_union_values: &std::collections::BTreeMap<
        String,
        std::collections::BTreeMap<String, String>,
    >,
) -> Result<String, CompileError> {
    for (owner, style) in string_unions {
        let prefix = format!("{owner}.");
        output = rewrite_typescript_code(&output, |code| {
            let mut code = code.to_string();
            let mut cursor = 0;
            while let Some(relative_start) = code[cursor..].find(&prefix) {
                let start = cursor + relative_start;
                let variant_start = start + prefix.len();
                // Only the owner itself, as for numeric unions: `OtherOwner.` or a namespace property
                // `module.Owner.` is not this owner's variant.
                let preceding = code[..start].chars().next_back();
                if preceding.is_some_and(|character| {
                    character.is_ascii_alphanumeric() || character == '_' || character == '.'
                }) {
                    cursor = variant_start;
                    continue;
                }
                let variant_length = code[variant_start..]
                    .chars()
                    .take_while(|character| character.is_ascii_alphanumeric() || *character == '_')
                    .map(char::len_utf8)
                    .sum::<usize>();
                if variant_length == 0 {
                    cursor = variant_start;
                    continue;
                }
                let end = variant_start + variant_length;
                let variant = &code[variant_start..end];
                let value = if *style == model::StringUnionStyle::Exact {
                    string_union_values
                        .get(owner)
                        .and_then(|values| values.get(variant))
                        .ok_or_else(|| {
                            compile_error(format!(
                                "exact string union `{owner}` has no value for referenced variant `{variant}`"
                            ))
                        })?
                        .clone()
                } else {
                    typescript::string_union_literal(variant, *style)
                };
                let literal = typescript::js_string_literal(&value);
                code.replace_range(start..end, &literal);
                cursor = start + literal.len();
            }
            return Ok(code);
        })?;
    }
    return Ok(output);
}

// The index of the bracket closing the one opened at `open`, counting `(`/`[`/`{` nesting.
fn matching_bracket_end(code: &str, open: usize) -> Option<usize> {
    let mut depth = 0usize;
    for (index, character) in code[open..].char_indices() {
        match character {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(open + index);
                }
            }
            _ => {}
        }
    }
    return None;
}

// The full module identity (`crate::module::path`) of a Rust source file at `path`: the crate directory
// before the last `src` component (hyphens become underscores), then the module path below it, with
// `lib.rs` / `main.rs` as the crate root and `mod.rs` as its directory. `None` when the path has no
// such shape.
fn module_identity_from_path(path: &str, crate_roots: &[CrateRootSource<'_>]) -> Option<String> {
    if let Some(identity) = crate_root_module_identity(path, crate_roots) {
        return Some(identity);
    }
    let segments = path
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .collect::<Vec<_>>();
    let source_index = segments.iter().rposition(|segment| *segment == "src")?;
    let crate_name = segments
        .get(source_index.checked_sub(1)?)?
        .replace('-', "_");
    let mut modules = segments[source_index + 1..]
        .iter()
        .map(|segment| (*segment).to_string())
        .collect::<Vec<_>>();
    let file = modules.pop()?;
    let stem = file.strip_suffix(".rs")?;
    if !(modules.is_empty() && matches!(stem, "lib" | "main")) && stem != "mod" {
        modules.push(stem.to_string());
    }
    let identity = std::iter::once(crate_name)
        .chain(modules)
        .collect::<Vec<_>>();
    let valid = identity.iter().all(|segment| {
        !segment.is_empty()
            && segment
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
    });
    return valid.then(|| identity.join("::"));
}

// Every function and arrow parameter name: the list after `function [name][<…>]`, a parenthesized
// list followed by `=>` (optionally after a `: ReturnType` annotation), and a bare `name =>`.
fn parameter_bindings(code: &str, out: &mut Vec<String>) {
    let bytes = code.as_bytes();
    for (open, _) in code.match_indices('(') {
        let Some(close) = matching_bracket_end(code, open) else {
            continue;
        };
        let before = code[..open].trim_end();
        let before = match before.strip_suffix('>') {
            Some(_) => {
                let mut depth = 0usize;
                let mut start = before.len();
                for (index, character) in before.char_indices().rev() {
                    match character {
                        '>' => depth += 1,
                        '<' => {
                            depth -= 1;
                            if depth == 0 {
                                start = index;
                                break;
                            }
                        }
                        _ => {}
                    }
                }
                before[..start].trim_end()
            }
            None => before,
        };
        let name_start = before
            .rfind(|character: char| {
                !(character.is_ascii_alphanumeric() || character == '_' || character == '$')
            })
            .map_or(0, |index| index + 1);
        let declared = before[..name_start].trim_end().ends_with("function")
            || &before[name_start..] == "function";
        let after = code[close + 1..].trim_start();
        let arrow = after.starts_with("=>")
            || (after.starts_with(':') && {
                let mut depth = 0usize;
                let mut found = false;
                let tail = &after[1..];
                for (index, character) in tail.char_indices() {
                    match character {
                        '(' | '[' | '<' => depth += 1,
                        ')' | ']' => {
                            if depth == 0 {
                                break;
                            }
                            depth -= 1;
                        }
                        '>' if index > 0 && tail.as_bytes()[index - 1] == b'=' => {
                            if depth == 0 {
                                found = true;
                                break;
                            }
                        }
                        '>' => depth = depth.saturating_sub(1),
                        '{' | ';' | ',' if depth == 0 => break,
                        _ => {}
                    }
                }
                found
            });
        if declared || arrow {
            for parameter in split_top_level(&code[open + 1..close], ',') {
                let pattern = split_top_level(parameter, ':')[0];
                pattern_bindings(pattern.trim_end_matches('?'), out);
            }
        }
    }
    for (arrow, _) in code.match_indices("=>") {
        let before = code[..arrow].trim_end();
        if before.ends_with(')') || before.is_empty() {
            continue;
        }
        let start = before
            .rfind(|character: char| {
                !(character.is_ascii_alphanumeric() || character == '_' || character == '$')
            })
            .map_or(0, |index| index + 1);
        if start < before.len() && bytes[start] != b'>' {
            pattern_bindings(&before[start..], out);
        }
    }
}

fn parse_external_string_union_metadata<'a>(
    external_alias_sources: &[ExternalAliasSource<'a>],
) -> Result<Vec<ExternalStringUnionMetadata<'a>>, CompileError> {
    return external_alias_sources
        .iter()
        .map(|external| {
            return Ok(ExternalStringUnionMetadata {
                metadata: model::parse_string_union_metadata(external.source)?,
                module: external.module,
            });
        })
        .collect();
}

fn resolve_type_script_string_union_metadata<'a, 'program>(
    unions: &[TypeScriptStringUnion<'a>],
    programs: impl IntoIterator<Item = &'program model::Program>,
    representation: &str,
) -> Result<Vec<ExternalStringUnionMetadata<'a>>, CompileError> {
    let programs = programs.into_iter().collect::<Vec<_>>();
    let mut declarations = std::collections::BTreeMap::<String, Vec<(String, bool)>>::new();
    let mut ambiguous = std::collections::BTreeSet::new();
    for enumeration in programs
        .iter()
        .copied()
        .flat_map(|program| program.enums.iter())
    {
        let name = enumeration.ident.to_string();
        let variants = enumeration
            .variants
            .iter()
            .map(|variant| {
                (
                    variant.ident.to_string(),
                    matches!(variant.fields, syn::Fields::Unit),
                )
            })
            .collect::<Vec<_>>();
        if declarations
            .get(&name)
            .is_some_and(|declared| declared != &variants)
        {
            ambiguous.insert(name);
        } else {
            declarations.insert(name, variants);
        }
    }
    let mut explicit = std::collections::BTreeMap::<
        String,
        (
            model::StringUnionStyle,
            std::collections::BTreeMap<String, String>,
        ),
    >::new();
    let mut conflicting_explicit = std::collections::BTreeSet::new();
    for program in &programs {
        for (name, style) in &program.string_unions {
            if conflicting_explicit.contains(name) {
                continue;
            }
            let values = program
                .string_union_values
                .get(name)
                .cloned()
                .unwrap_or_default();
            if let Some((declared_style, declared_values)) = explicit.get(name)
                && (*declared_style != *style || declared_values != &values)
            {
                // The provenance-aware metadata validator below reports conflicts with both source
                // identities. Do not replace that established diagnostic while collecting the
                // optional TypeScript representation proof.
                explicit.remove(name);
                conflicting_explicit.insert(name.clone());
                continue;
            }
            explicit.insert(name.clone(), (*style, values));
        }
    }

    return unions
        .iter()
        .map(|union| {
            if union.module.is_empty() {
                return Err(compile_error(
                    "external TypeScript string-union module cannot be empty",
                ));
            }
            if union.name.is_empty()
                || !union
                    .name
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '_')
                || union
                    .name
                    .chars()
                    .next()
                    .is_some_and(|character| character.is_ascii_digit())
            {
                return Err(compile_error(format!(
                    "{representation} string-union name `{}` is not a valid identifier",
                    union.name
                )));
            }
            if ambiguous.contains(union.name) {
                return Err(compile_error(format!(
                    "{representation} string union `{}` matches conflicting Rust enum declarations",
                    union.name
                )));
            }
            let Some(variants) = declarations.get(union.name) else {
                return Err(compile_error(format!(
                    "{representation} string union `{}` has no visible Rust enum declaration",
                    union.name
                )));
            };
            if variants.is_empty() || variants.iter().any(|(_, unit)| !unit) {
                return Err(compile_error(format!(
                    "{representation} string union `{}` must match a non-empty unit Rust enum",
                    union.name
                )));
            }
            let values = union.values.iter().cloned().collect::<std::collections::BTreeSet<_>>();
            if values.len() != union.values.len() || values.is_empty() {
                return Err(compile_error(format!(
                    "{representation} string union `{}` must have distinct literal values",
                    union.name
                )));
            }
            let (style, declared_values) = if let Some((style, declared_values)) = explicit.get(union.name) {
                let expected = if *style == model::StringUnionStyle::Exact {
                    variants
                        .iter()
                        .map(|(variant, _)| {
                            declared_values.get(variant).cloned().ok_or_else(|| {
                                compile_error(format!(
                                    "exact string union `{}` has no value for variant `{variant}`",
                                    union.name
                                ))
                            })
                        })
                        .collect::<Result<Vec<_>, _>>()?
                } else {
                    variants
                        .iter()
                        .map(|(variant, _)| typescript::string_union_literal(variant, *style))
                        .collect::<Vec<_>>()
                };
                let expected_set = expected.iter().cloned().collect::<std::collections::BTreeSet<_>>();
                if expected_set.len() != variants.len() || expected_set != values {
                    return Err(compile_error(format!(
                        "{representation} string union `{}` does not match explicit Rust `{}` style: expected {}, received {}",
                        union.name,
                        style.directive_name(),
                        serde_json::to_string(&expected).expect("string literals serialize"),
                        serde_json::to_string(union.values).expect("string literals serialize")
                    )));
                }
                (*style, declared_values.clone())
            } else {
                let style = [
                    model::StringUnionStyle::LowerCamel,
                    model::StringUnionStyle::KebabCase,
                ]
                .into_iter()
                .find(|style| {
                    let literals = variants
                        .iter()
                        .map(|(variant, _)| typescript::string_union_literal(variant, *style))
                        .collect::<std::collections::BTreeSet<_>>();
                    return literals.len() == variants.len() && literals == values;
                })
                .ok_or_else(|| {
                    compile_error(format!(
                        "{representation} string union `{}` does not match the literals of its Rust enum",
                        union.name
                    ))
                })?;
                (style, std::collections::BTreeMap::new())
            };
            return Ok(ExternalStringUnionMetadata {
                metadata: model::StringUnionMetadata {
                    styles: std::collections::BTreeMap::from([(union.name.to_string(), style)]),
                    values: if declared_values.is_empty() {
                        std::collections::BTreeMap::new()
                    } else {
                        std::collections::BTreeMap::from([(union.name.to_string(), declared_values)])
                    },
                },
                module: union.module,
            });
        })
        .collect();
}

// The names a binding pattern introduces: an identifier, or every name an array or object
// destructuring pattern binds, through renames (`key: name`), nesting, rest (`...name`) and
// defaults (`name = value`).
fn pattern_bindings(pattern: &str, out: &mut Vec<String>) {
    let pattern = pattern.trim().trim_start_matches("...").trim();
    let pattern = split_top_level(pattern, '=')[0].trim();
    if let Some(inner) = pattern
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
    {
        for element in split_top_level(inner, ',') {
            pattern_bindings(element, out);
        }
        return;
    }
    if let Some(inner) = pattern
        .strip_prefix('{')
        .and_then(|rest| rest.strip_suffix('}'))
    {
        for element in split_top_level(inner, ',') {
            let parts = split_top_level(element, ':');
            pattern_bindings(parts.get(1).copied().unwrap_or(parts[0]), out);
        }
        return;
    }
    let name = pattern
        .chars()
        .take_while(|character| {
            character.is_ascii_alphanumeric() || *character == '_' || *character == '$'
        })
        .collect::<String>();
    if !name.is_empty() && !name.starts_with(|character: char| character.is_ascii_digit()) {
        out.push(name);
    }
}

// Removes `owner` from every value import list (the type-only alias has no runtime binding), and
// drops an import declaration left empty. Type imports and export lists are left untouched, and a
// line that begins inside string, comment, or template-literal text is never read as an import.
fn remove_numeric_union_value_import(output: String, owner: &str) -> String {
    let code_ranges = typescript_code_ranges(&output);
    let mut lines: Vec<String> = Vec::new();
    let mut block: Option<Vec<String>> = None;
    let mut line_start = 0;
    for line in output.lines() {
        let offset = line_start;
        line_start += line.len() + 1;
        if !code_ranges.iter().any(|range| range.contains(&offset)) {
            lines.push(line.to_string());
            continue;
        }
        if let Some(names) = block.as_mut() {
            let trimmed = line.trim();
            if trimmed.starts_with('}') {
                let names = std::mem::take(names);
                block = None;
                if !names.is_empty() {
                    lines.push("import {".to_string());
                    lines.extend(names);
                    lines.push(line.to_string());
                }
                continue;
            }
            if trimmed.trim_end_matches(',') != owner {
                names.push(line.to_string());
            }
            continue;
        }
        if line == "import {" {
            block = Some(Vec::new());
            continue;
        }
        if let Some(rest) = line.strip_prefix("import {")
            && let Some((list, tail)) = rest.split_once('}')
        {
            let names = list
                .split(',')
                .map(str::trim)
                .filter(|name| !name.is_empty() && *name != owner)
                .collect::<Vec<_>>();
            if !names.is_empty() {
                lines.push(format!("import {{ {} }}{tail}", names.join(", ")));
            }
            continue;
        }
        lines.push(line.to_string());
    }
    let mut result = lines.join("\n");
    if output.ends_with('\n') {
        result.push('\n');
    }
    return result;
}

fn require_generated_source(source: &str) -> Result<(), CompileError> {
    return match source_mode(source)? {
        SourceMode::Generate => Ok(()),
        SourceMode::RustOnly => Err(compile_error(
            "source is marked `flight-compiler: rust-only` and has no TypeScript output",
        )),
        SourceMode::TargetNative => Err(compile_error(
            "source is marked `flight-compiler: target-native`; preserve its target-native TypeScript file",
        )),
    };
}

// Rebuilds `source` with each code range (see `typescript_code_ranges`) passed through `rewrite`;
// string, comment, and template-literal text between them is copied byte-for-byte.
fn rewrite_typescript_code(
    source: &str,
    mut rewrite: impl FnMut(&str) -> Result<String, CompileError>,
) -> Result<String, CompileError> {
    let mut result = String::with_capacity(source.len());
    let mut copied = 0;
    for range in typescript_code_ranges(source) {
        result.push_str(&source[copied..range.start]);
        result.push_str(&rewrite(&source[range.clone()])?);
        copied = range.end;
    }
    result.push_str(&source[copied..]);
    return Ok(result);
}

/// Returns the exact TypeScript package-root export names designated by this Rust source.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn root_only_names(source: &str) -> Result<Vec<String>, CompileError> {
    return model::parse_root_only_metadata(source);
}

// The items of `module` that a sibling source names through that module: `use crate::module::…` /
// `use super::module::…` trees (by original name, through renames and groups) and `module::Name`
// paths, plus whether it glob-imports the module. Same-named crate-visible items of other modules
// therefore stay unexported here.
fn sibling_references_to_module(
    source: &str,
    module: &str,
) -> (std::collections::BTreeSet<String>, bool) {
    fn collect(
        tree: &syn::UseTree,
        prefix: &mut Vec<String>,
        module: &str,
        names: &mut std::collections::BTreeSet<String>,
        glob: &mut bool,
    ) {
        let in_module = prefix.last().is_some_and(|last| last == module)
            && prefix.len() >= 2
            && matches!(prefix[0].as_str(), "crate" | "super" | "self");
        match tree {
            syn::UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                collect(&path.tree, prefix, module, names, glob);
                prefix.pop();
            }
            syn::UseTree::Group(group) => {
                for item in &group.items {
                    collect(item, prefix, module, names, glob);
                }
            }
            syn::UseTree::Name(name) if in_module => {
                names.insert(name.ident.to_string());
            }
            syn::UseTree::Rename(rename) if in_module => {
                names.insert(rename.ident.to_string());
            }
            syn::UseTree::Glob(_) if in_module => *glob = true,
            _ => {}
        }
    }

    let mut names = std::collections::BTreeSet::new();
    let mut glob = false;
    if let Ok(file) = syn::parse_file(source) {
        for item in &file.items {
            if let syn::Item::Use(item_use) = item {
                collect(
                    &item_use.tree,
                    &mut Vec::new(),
                    module,
                    &mut names,
                    &mut glob,
                );
            }
        }
    }
    let tokens = source
        .split(|character: char| {
            !(character.is_ascii_alphanumeric() || character == '_' || character == ':')
        })
        .collect::<Vec<_>>();
    let qualifier = format!("{module}::");
    for token in tokens {
        if let Some(index) = token.find(&qualifier)
            && (index == 0 || token[..index].ends_with("::"))
        {
            let name = token[index + qualifier.len()..]
                .split("::")
                .next()
                .unwrap_or_default();
            if !name.is_empty() {
                names.insert(name.to_string());
            }
        }
    }
    return (names, glob);
}

/// Reads the source-local generation mode for a Rust module or test file.
pub fn source_mode(source: &str) -> Result<SourceMode, CompileError> {
    return model::source_mode(source);
}

// `text` split at each `separator` outside `()`, `[]`, `{}` and `<>` nesting.
fn split_top_level(text: &str, separator: char) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0usize;
    let mut start = 0;
    let mut previous = ' ';
    for (index, character) in text.char_indices() {
        match character {
            '(' | '[' | '{' | '<' => depth += 1,
            ')' | ']' | '}' => depth = depth.saturating_sub(1),
            '>' if previous != '=' => depth = depth.saturating_sub(1),
            _ if character == separator
                && depth == 0
                && !(separator == '=' && text[index + 1..].starts_with('>')) =>
            {
                parts.push(&text[start..index]);
                start = index + character.len_utf8();
            }
            _ => {}
        }
        previous = character;
    }
    parts.push(&text[start..]);
    return parts;
}

// The byte ranges of emitted TypeScript `source` that are code rather than literal text: everything
// outside `'…'` / `"…"` string literals, `//` and `/* … */` comments, and template-literal text. A
// template's `${…}` interpolation is code again, nesting to any depth. The emitter writes no
// regular-expression literals, so `/` is either a comment opener or the division operator.
fn typescript_code_ranges(source: &str) -> Vec<std::ops::Range<usize>> {
    // Each entry is an open template; its value is the brace depth of the interpolation being
    // scanned, or `None` while scanning the template's own text.
    let mut templates: Vec<Option<usize>> = Vec::new();
    let mut ranges: Vec<std::ops::Range<usize>> = Vec::new();
    let bytes = source.as_bytes();
    let mut code_start = 0;
    let mut index = 0;
    while index < bytes.len() {
        if let Some(None) = templates.last() {
            match bytes[index] {
                b'\\' => index += 2,
                b'`' => {
                    templates.pop();
                    index += 1;
                    code_start = index;
                }
                b'$' if bytes.get(index + 1) == Some(&b'{') => {
                    *templates.last_mut().unwrap() = Some(0);
                    index += 2;
                    code_start = index;
                }
                _ => index += 1,
            }
            continue;
        }
        let literal_end = match bytes[index] {
            b'/' if bytes.get(index + 1) == Some(&b'/') => Some(
                source[index..]
                    .find('\n')
                    .map_or(bytes.len(), |offset| index + offset),
            ),
            b'/' if bytes.get(index + 1) == Some(&b'*') => Some(
                source[index + 2..]
                    .find("*/")
                    .map_or(bytes.len(), |offset| index + 2 + offset + 2),
            ),
            quote @ (b'\'' | b'"') => {
                let mut end = index + 1;
                while end < bytes.len() && bytes[end] != quote && bytes[end] != b'\n' {
                    end += if bytes[end] == b'\\' { 2 } else { 1 };
                }
                Some((end + 1).min(bytes.len()))
            }
            b'`' => {
                if index > code_start {
                    ranges.push(code_start..index);
                }
                templates.push(None);
                index += 1;
                continue;
            }
            b'{' => {
                if let Some(Some(depth)) = templates.last_mut() {
                    *depth += 1;
                }
                None
            }
            b'}' => match templates.last_mut() {
                Some(Some(0)) => {
                    if index > code_start {
                        ranges.push(code_start..index);
                    }
                    *templates.last_mut().unwrap() = None;
                    index += 1;
                    continue;
                }
                Some(Some(depth)) => {
                    *depth -= 1;
                    None
                }
                _ => None,
            },
            _ => None,
        };
        match literal_end {
            Some(end) => {
                if index > code_start {
                    ranges.push(code_start..index);
                }
                index = end;
                code_start = end;
            }
            None => index += 1,
        }
    }
    if templates.last().is_none_or(Option::is_some) && bytes.len() > code_start {
        ranges.push(code_start..bytes.len());
    }
    return ranges;
}

fn valid_crate_name(name: &str) -> bool {
    return !name.is_empty()
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'));
}

// A `const-group` owner is one exported value; any other value binding of that name anywhere in the
// final output (a declaration, a compiler-injected local, or a provided or dependency import) would
// redeclare or shadow it, so it fails closed before the TypeScript is written.
fn validate_const_group_bindings(
    output: &str,
    groups: &std::collections::BTreeMap<String, String>,
) -> Result<(), CompileError> {
    if groups.is_empty() {
        return Ok(());
    }
    let bindings = emitted_value_bindings(output);
    for owner in groups.keys() {
        if bindings.iter().filter(|binding| *binding == owner).count() > 1 {
            return Err(compile_error(format!(
                "`const-group {owner}` collides with another emitted value binding named `{owner}`"
            )));
        }
    }
    return Ok(());
}

fn validate_string_union_metadata<'a>(
    sources: impl IntoIterator<Item = StringUnionMetadataSource<'a>>,
) -> Result<(), CompileError> {
    let mut owners = std::collections::BTreeMap::<
        String,
        Vec<(
            String,
            model::StringUnionStyle,
            std::collections::BTreeMap<String, String>,
        )>,
    >::new();
    for source in sources {
        for (owner, style) in source.styles {
            owners.entry(owner.clone()).or_default().push((
                source.identity.clone(),
                *style,
                source.values.get(owner).cloned().unwrap_or_default(),
            ));
        }
    }
    for (owner, declarations) in owners {
        let Some((_, first_style, first_values)) = declarations.first() else {
            continue;
        };
        if declarations
            .iter()
            .skip(1)
            .any(|(_, style, values)| style != first_style || values != first_values)
        {
            let identities = declarations
                .iter()
                .map(|(identity, _, _)| identity)
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .cloned()
                .collect::<Vec<_>>()
                .join(", ");
            return Err(compile_error(format!(
                "string union `{owner}` has conflicting metadata across {identities}"
            )));
        }
    }
    return Ok(());
}

fn validate_type_script_type_aliases(
    aliases: &[TypeScriptTypeAlias<'_>],
) -> Result<(), CompileError> {
    let mut by_name = std::collections::BTreeMap::new();
    let mut target_owners = std::collections::BTreeMap::new();
    for alias in aliases {
        if syn::parse_str::<syn::Ident>(alias.name).is_err() {
            return Err(compile_error(format!(
                "TypeScript type-alias metadata has invalid Rust type name `{}`",
                alias.name
            )));
        }
        match alias.module {
            Some(module) => {
                if module.is_empty() {
                    return Err(compile_error(format!(
                        "TypeScript type alias `{}` has an empty owner module",
                        alias.name
                    )));
                }
                if !valid_type_script_identifier(alias.target) {
                    return Err(compile_error(format!(
                        "TypeScript type alias `{}` has invalid owner type `{}`",
                        alias.name, alias.target
                    )));
                }
            }
            None if !matches!(alias.target, "boolean" | "number" | "string" | "unknown") => {
                return Err(compile_error(format!(
                    "TypeScript type alias `{}` has unsupported intrinsic target `{}`",
                    alias.name, alias.target
                )));
            }
            None => {}
        }
        let representation = (alias.module, alias.target);
        if let Some(previous) = by_name.insert(alias.name, representation)
            && previous != representation
        {
            return Err(compile_error(format!(
                "TypeScript type alias `{}` has conflicting representations",
                alias.name
            )));
        }
        if let Some(module) = alias.module
            && let Some(previous) = target_owners.insert(alias.target, module)
            && previous != module
        {
            return Err(compile_error(format!(
                "TypeScript owner type `{}` is supplied by both `{previous}` and `{module}`",
                alias.target
            )));
        }
    }
    return Ok(());
}

fn validate_internal_type_exports(
    names: &[&str],
    program: &model::Program,
    inline_string_unions: &[TypeScriptInlineStringUnion<'_>],
    type_aliases: &[TypeScriptTypeAlias<'_>],
) -> Result<(), CompileError> {
    let mut reexports = std::collections::BTreeSet::new();
    for item_use in &program.uses {
        if !matches!(item_use.vis, syn::Visibility::Restricted(_)) {
            continue;
        }
        let mut symbols = std::collections::BTreeMap::new();
        typescript::collect_cross_crate_use_tree(&item_use.tree, &mut Vec::new(), &mut symbols);
        reexports.extend(symbols.into_keys());
    }
    let aliases = type_aliases
        .iter()
        .map(|alias| (alias.name, alias))
        .collect::<std::collections::BTreeMap<_, _>>();
    let union_names = inline_string_unions
        .iter()
        .map(|union| union.name)
        .collect::<std::collections::BTreeSet<_>>();
    let mut seen = std::collections::BTreeSet::new();
    for name in names {
        if syn::parse_str::<syn::Ident>(name).is_err() || !seen.insert(*name) {
            return Err(compile_error(format!(
                "invalid or duplicate internal TypeScript type export `{name}`"
            )));
        }
        if !reexports.contains(*name) {
            return Err(compile_error(format!(
                "internal TypeScript type export `{name}` must name a crate-visible foreign Rust re-export"
            )));
        }
        if aliases
            .get(name)
            .is_some_and(|alias| alias.module.is_some())
        {
            return Err(compile_error(format!(
                "internal TypeScript type export `{name}` must use a local intrinsic or string-union representation"
            )));
        }
        if aliases.contains_key(name) && union_names.contains(name) {
            return Err(compile_error(format!(
                "internal TypeScript type export `{name}` has conflicting alias and string-union representations"
            )));
        }
        if !aliases.contains_key(name) && !union_names.contains(name) {
            return Err(compile_error(format!(
                "internal TypeScript type export `{name}` needs an explicit type-alias or string-union representation"
            )));
        }
    }
    return Ok(());
}

fn validate_type_script_nullable_option_fields(
    fields: &[TypeScriptNullableOptionField<'_>],
) -> Result<(), CompileError> {
    let mut owners = std::collections::BTreeMap::new();
    for field in fields {
        if field.module.is_empty() {
            return Err(compile_error(
                "TypeScript nullable Option field has an empty owner module",
            ));
        }
        if syn::parse_str::<syn::Ident>(field.owner).is_err()
            || !valid_type_script_identifier(field.field)
        {
            return Err(compile_error(format!(
                "TypeScript nullable Option field has invalid owner position `{}.{}`",
                field.owner, field.field
            )));
        }
        let position = (field.owner, field.field);
        if let Some(previous) = owners.insert(position, field.module)
            && previous != field.module
        {
            return Err(compile_error(format!(
                "TypeScript nullable Option field `{}.{}` is supplied by both `{previous}` and `{}`",
                field.owner, field.field, field.module
            )));
        }
    }
    return Ok(());
}

fn validate_type_script_array_parameters(
    parameters: &[TypeScriptArrayParameter<'_>],
) -> Result<(), CompileError> {
    let mut positions = std::collections::BTreeSet::new();
    for parameter in parameters {
        if !valid_type_script_identifier(parameter.owner)
            || !valid_type_script_identifier(parameter.parameter)
        {
            return Err(compile_error(format!(
                "TypeScript array parameter has invalid function position `{}.{}`",
                parameter.owner, parameter.parameter
            )));
        }
        if !positions.insert((parameter.owner, parameter.parameter)) {
            return Err(compile_error(format!(
                "duplicate TypeScript array parameter `{}.{}`",
                parameter.owner, parameter.parameter
            )));
        }
    }
    return Ok(());
}

fn validate_type_script_nullable_option_parameters(
    parameters: &[TypeScriptNullableOptionParameter<'_>],
) -> Result<(), CompileError> {
    let mut positions = std::collections::BTreeSet::new();
    for parameter in parameters {
        if !valid_type_script_identifier(parameter.owner)
            || !valid_type_script_identifier(parameter.parameter)
        {
            return Err(compile_error(format!(
                "TypeScript nullable Option parameter has invalid function position `{}.{}`",
                parameter.owner, parameter.parameter
            )));
        }
        if !positions.insert((parameter.owner, parameter.parameter)) {
            return Err(compile_error(format!(
                "duplicate TypeScript nullable Option parameter `{}.{}`",
                parameter.owner, parameter.parameter
            )));
        }
    }
    return Ok(());
}

fn validate_type_script_default_null_option_parameters(
    parameters: &[TypeScriptDefaultNullOptionParameter<'_>],
    nullable_parameters: &[TypeScriptNullableOptionParameter<'_>],
) -> Result<(), CompileError> {
    let nullable_positions = nullable_parameters
        .iter()
        .map(|parameter| (parameter.owner, parameter.parameter))
        .collect::<std::collections::BTreeSet<_>>();
    let mut positions = std::collections::BTreeSet::new();
    for parameter in parameters {
        if !valid_type_script_identifier(parameter.owner)
            || !valid_type_script_identifier(parameter.parameter)
        {
            return Err(compile_error(format!(
                "TypeScript default-null Option parameter has invalid function position `{}.{}`",
                parameter.owner, parameter.parameter
            )));
        }
        if !positions.insert((parameter.owner, parameter.parameter)) {
            return Err(compile_error(format!(
                "duplicate TypeScript default-null Option parameter `{}.{}`",
                parameter.owner, parameter.parameter
            )));
        }
        if nullable_positions.contains(&(parameter.owner, parameter.parameter)) {
            return Err(compile_error(format!(
                "TypeScript Option parameter `{}.{}` cannot be both nullable and default-null",
                parameter.owner, parameter.parameter
            )));
        }
    }
    return Ok(());
}

fn validate_type_script_nullable_option_returns(
    returns: &[TypeScriptNullableOptionReturn<'_>],
) -> Result<(), CompileError> {
    let mut positions = std::collections::BTreeSet::new();
    for return_position in returns {
        if !valid_type_script_identifier(return_position.name) {
            return Err(compile_error(format!(
                "TypeScript nullable Option return has invalid function position `{}`",
                return_position.name
            )));
        }
        if !positions.insert(return_position.name) {
            return Err(compile_error(format!(
                "duplicate TypeScript nullable Option return `{}`",
                return_position.name
            )));
        }
    }
    return Ok(());
}

fn valid_type_script_identifier(name: &str) -> bool {
    let mut characters = name.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    return (first == '_' || first == '$' || first.is_ascii_alphabetic())
        && characters.all(|character| {
            character == '_' || character == '$' || character.is_ascii_alphanumeric()
        });
}

impl fmt::Display for CompileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter.write_str(&self.message);
    }
}

impl Error for CompileError {}
