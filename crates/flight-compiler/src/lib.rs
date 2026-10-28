mod model;
mod typescript;

use std::error::Error;
use std::fmt;

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
pub fn compile_typescript(source: &str) -> Result<String, CompileError> {
    let program = model::parse_program(source)?;
    return typescript::emit_program(&program);
}

impl fmt::Display for CompileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter.write_str(&self.message);
    }
}

impl Error for CompileError {}
