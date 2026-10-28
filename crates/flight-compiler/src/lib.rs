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
/// layer. The compiler never synthesizes structural `Like` types.
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
    let output = typescript::emit_program(
        &program,
        entity_module,
        &alias_programs,
        &external_alias_programs,
    )?;
    return Ok(lower_string_union_variants(output, source, false));
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
    require_generated_source(source)?;
    let program = model::parse_test_program(source)?;
    let alias_programs = alias_sources
        .iter()
        .map(|alias_source| model::parse_program(alias_source))
        .collect::<Result<Vec<_>, _>>()?;
    let alias_program_refs = alias_programs.iter().collect::<Vec<_>>();
    let context = typescript::generation_context(&alias_program_refs)?;
    let mut output = vitest::emit_test_program(&program, contract_module, &context)?;
    output = lower_string_union_variants(output, source, true);
    for alias_source in alias_sources {
        output = lower_string_union_variants(output, alias_source, true);
    }
    return Ok(output);
}

fn lower_string_union_variants(
    mut output: String,
    source: &str,
    remove_runtime_imports: bool,
) -> String {
    for owner in model::directive_names(source, "string-union") {
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
            let literal = format!(
                "{:?}",
                typescript::lower_camel_from_upper_camel(&output[variant_start..end])
            );
            output.replace_range(start..end, &literal);
            cursor = start + literal.len();
        }
    }
    return output;
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
