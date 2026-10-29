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

/// Returns the exact TypeScript package-root export names designated by this Rust source.
// flight-lint: allow(contract-vocabulary) compiler host tooling is not a transpilation contract
pub fn root_only_names(source: &str) -> Result<Vec<String>, CompileError> {
    return model::parse_root_only_metadata(source);
}

/// A Rust source that owns target-language-only identity aliases in an external module.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExternalAliasSource<'a> {
    pub source: &'a str,
    pub module: &'a str,
}

/// A Rust source file and its path. The path (`.../<crate>/src/<module path>.rs`) gives the source its
/// full module identity (`<crate>::<module path>`), which `use` bindings resolve against.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModuleSource<'a> {
    pub path: &'a str,
    pub source: &'a str,
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

fn compile_typescript_sources(
    source: &str,
    entity_module: Option<&str>,
    alias_sources: &[&str],
    external_alias_sources: &[ExternalAliasSource<'_>],
    module_identities: Option<Vec<String>>,
    source_paths: &[&str],
    visibility_sources: &[ModuleSource<'_>],
) -> Result<String, CompileError> {
    require_generated_source(source)?;
    let program = model::parse_program(source)?;
    let alias_programs = alias_sources
        .iter()
        .map(|alias_source| model::parse_program(alias_source))
        .collect::<Result<Vec<_>, _>>()?;
    let visibility_programs = visibility_sources
        .iter()
        .map(|visibility_source| model::parse_visibility_program(visibility_source.source))
        .collect::<Result<Vec<_>, _>>()?;
    let visibility_identities = visibility_sources
        .iter()
        .map(|visibility_source| module_identity_from_path(visibility_source.path))
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
    let external_record_structs = external_alias_sources
        .iter()
        .map(|external| model::parse_public_record_structs(external.source))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let dependency_export_names = dependency_export_names(external_alias_sources)?;
    let mut output = typescript::emit_program(
        &program,
        entity_module,
        &alias_programs,
        &external_alias_programs,
        &external_record_structs,
        &dependency_export_names,
        module_identities.as_deref(),
        &visibility_programs,
        &visibility_identities,
        &(0..=alias_sources.len())
            .map(|index| source_paths.get(index).map(|path| (*path).to_string()))
            .chain(
                visibility_sources
                    .iter()
                    .map(|visibility_source| Some(visibility_source.path.to_string())),
            )
            .collect::<Vec<_>>(),
    )?;
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
    validate_const_group_bindings(&output, &program.const_groups)?;
    return Ok(output);
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
    let identities = std::iter::once(&source)
        .chain(alias_sources)
        .map(|module| module_identity_from_path(module.path))
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
    return compile_typescript_sources(
        source.source,
        entity_module,
        &alias_source_texts,
        external_alias_sources,
        identities,
        &std::iter::once(source.path)
            .chain(alias_sources.iter().map(|module| module.path))
            .collect::<Vec<_>>(),
        visibility_sources,
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
        &[],
    );
}

fn compile_vitest_with_contract_alias_sources_internal(
    source: &str,
    contract_module: &str,
    contract_source: Option<&str>,
    alias_sources: &[VitestAliasSource<'_>],
    external_alias_sources: &[ExternalAliasSource<'_>],
) -> Result<String, CompileError> {
    require_generated_source(source)?;
    let program = model::parse_test_program(source)?;
    let dependency_export_names = dependency_export_names(external_alias_sources)?;
    let alias_programs = alias_sources
        .iter()
        .map(|alias_source| model::parse_program(alias_source.source))
        .collect::<Result<Vec<_>, _>>()?;
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
    let mut context = typescript::generation_context(
        &alias_program_refs,
        &external_record_structs,
        contract_source,
    )?;
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
    typescript::insert_vitest_local_crate_context(
        &mut context,
        contract_module,
        alias_sources.iter().map(|source| source.module),
    );
    typescript::insert_string_union_context(&mut context, string_unions.styles.keys());
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
    typescript::insert_vitest_helper_return_context(
        &mut context,
        "vitest/top-level",
        program.helpers.iter(),
    );
    let mut output = vitest::emit_test_program(&program, contract_module, &context)?;
    output = lower_string_union_variants(output, &string_unions.styles, &string_unions.values)?;
    for alias_program in &alias_programs {
        output = lower_string_union_variants(
            output,
            &alias_program.string_unions,
            &alias_program.string_union_values,
        )?;
        output = lower_numeric_union_variants(output, &alias_program.numeric_unions)?;
    }
    return Ok(output);
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
            return Ok((
                model::parse_export_name_metadata(external.source)?,
                external.module,
            ));
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
                let literal = format!("{value:?}");
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
fn module_identity_from_path(path: &str) -> Option<String> {
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

impl fmt::Display for CompileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter.write_str(&self.message);
    }
}

impl Error for CompileError {}
