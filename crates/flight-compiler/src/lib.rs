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

/// A production source and its stable module path for Vitest provenance inference.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VitestAliasSource<'a> {
    pub source: &'a str,
    pub module: &'a str,
}

/// A source construct that cannot yet be lowered mechanically.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileError {
    message: String,
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
/// lower-camel literals and can select kebab-case per enum with
/// `//! flight-compiler: string-union Reason=kebab-case`. Exact string unions
/// use `Reason=exact` plus one `string-union-value` directive per variant and
/// emit a const object alongside their value union.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn compile_typescript(
    source: &str,
    entity_module: Option<&str>,
) -> Result<String, CompileError> {
    return compile_typescript_with_alias_sources(source, entity_module, &[]);
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
    require_generated_source(source)?;
    let program = model::parse_program(source)?;
    let alias_programs = alias_sources
        .iter()
        .map(|alias_source| model::parse_program(alias_source))
        .collect::<Result<Vec<_>, _>>()?;
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
    let mut output = typescript::emit_program(
        &program,
        entity_module,
        &alias_programs,
        &external_alias_programs,
    )?;
    output = lower_string_union_variants(
        output,
        &program.string_unions,
        &program.string_union_values,
        false,
    )?;
    for alias_program in &alias_programs {
        output = lower_string_union_variants(
            output,
            &alias_program.string_unions,
            &alias_program.string_union_values,
            false,
        )?;
    }
    return Ok(output);
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
    );
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
    );
}

fn compile_vitest_with_contract_alias_sources_internal(
    source: &str,
    contract_module: &str,
    contract_source: Option<&str>,
    alias_sources: &[VitestAliasSource<'_>],
) -> Result<String, CompileError> {
    require_generated_source(source)?;
    let program = model::parse_test_program(source)?;
    let alias_programs = alias_sources
        .iter()
        .map(|alias_source| model::parse_program(alias_source.source))
        .collect::<Result<Vec<_>, _>>()?;
    let alias_program_refs = alias_sources
        .iter()
        .zip(&alias_programs)
        .map(|(source, program)| (source.module, program))
        .collect::<Vec<_>>();
    let string_unions = model::parse_string_union_metadata(source)?;
    let mut context = typescript::generation_context(&alias_program_refs, contract_source)?;
    typescript::insert_vitest_local_crate_context(
        &mut context,
        contract_module,
        alias_sources.iter().map(|source| source.module),
    );
    typescript::insert_string_union_context(&mut context, string_unions.styles.keys());
    typescript::insert_vitest_import_alias_context(&mut context, program.uses.iter());
    typescript::insert_vitest_struct_context(
        &mut context,
        alias_programs.iter().flat_map(|program| &program.structs),
    );
    typescript::insert_vitest_local_struct_context(&mut context, program.structs.iter());
    typescript::insert_vitest_local_type_alias_context(&mut context, program.type_aliases.iter());
    typescript::insert_vitest_helper_return_context(
        &mut context,
        "vitest/top-level",
        program.helpers.iter(),
    );
    let mut output = vitest::emit_test_program(&program, contract_module, &context)?;
    output =
        lower_string_union_variants(output, &string_unions.styles, &string_unions.values, false)?;
    for alias_program in &alias_programs {
        output = lower_string_union_variants(
            output,
            &alias_program.string_unions,
            &alias_program.string_union_values,
            false,
        )?;
    }
    return Ok(output);
}

fn lower_string_union_variants(
    mut output: String,
    string_unions: &std::collections::BTreeMap<String, model::StringUnionStyle>,
    string_union_values: &std::collections::BTreeMap<
        String,
        std::collections::BTreeMap<String, String>,
    >,
    remove_runtime_imports: bool,
) -> Result<String, CompileError> {
    for (owner, style) in string_unions {
        if remove_runtime_imports {
            output = output.replace(&format!("  {owner},\n"), "");
        }
        let prefix = format!("{owner}.");
        let mut cursor = 0;
        while let Some(relative_start) = output[cursor..].find(&prefix) {
            let start = cursor + relative_start;
            let variant_start = start + prefix.len();
            let variant_length = output[variant_start..]
                .chars()
                .take_while(|character| character.is_ascii_alphanumeric() || *character == '_')
                .map(char::len_utf8)
                .sum::<usize>();
            if variant_length == 0 {
                cursor = variant_start;
                continue;
            }
            let end = variant_start + variant_length;
            let variant = &output[variant_start..end];
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
            let literal = format!("{value:?}");
            output.replace_range(start..end, &literal);
            cursor = start + literal.len();
        }
    }
    return Ok(output);
}

/// Reads the source-local generation mode for a Rust module or test file.
pub fn source_mode(source: &str) -> Result<SourceMode, CompileError> {
    return model::source_mode(source);
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

impl fmt::Display for CompileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter.write_str(&self.message);
    }
}

impl Error for CompileError {}
