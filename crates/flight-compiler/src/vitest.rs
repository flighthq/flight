use std::collections::HashSet;
use std::fmt::Write;

use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::visit::Visit;
use syn::{Expr, FnArg, ItemFn, Pat, ReturnType, Stmt, Token};

use crate::model::{TestCase, TestProgram, TestSuite};
use crate::typescript::{
    emit_expression, emit_local, emit_parameter, emit_type, snake_to_lower_camel, write_indent,
};
use crate::{CompileError, compile_error};

fn assertion_message(
    arguments: &Punctuated<Expr, Token![,]>,
    name: &str,
) -> Result<Option<String>, CompileError> {
    let message_index = if name == "assert" { 1 } else { 2 };
    let Some(message) = arguments.get(message_index) else {
        return Ok(None);
    };
    let Expr::Lit(literal) = message else {
        return Err(compile_error(
            "portable assertion messages must be string literals",
        ));
    };
    let syn::Lit::Str(message) = &literal.lit else {
        return Err(compile_error(
            "portable assertion messages must be string literals",
        ));
    };
    return Ok(Some(format!("{:?}", message.value())));
}

fn collect_contract_symbols(program: &TestProgram) -> Vec<String> {
    struct ContractSymbolCollector<'a> {
        declared: HashSet<String>,
        helper_names: &'a HashSet<String>,
        standard_constants: &'a HashSet<String>,
        symbols: Vec<String>,
    }

    impl ContractSymbolCollector<'_> {
        fn collect_expression(&mut self, expression: &Expr) {
            self.visit_expr(expression);
        }

        fn record_identifier(&mut self, identifier: &syn::Ident) {
            let name = identifier.to_string();
            if !self.declared.contains(&name)
                && !self.helper_names.contains(&name)
                && !self.standard_constants.contains(&name)
                && !matches!(name.as_str(), "None" | "Some")
                && !self.symbols.contains(&name)
            {
                self.symbols.push(name);
            }
        }
    }

    impl<'ast> Visit<'ast> for ContractSymbolCollector<'_> {
        fn visit_expr_macro(&mut self, expression: &'ast syn::ExprMacro) {
            if let Ok(arguments) = parse_macro_arguments(&expression.mac) {
                for argument in &arguments {
                    self.collect_expression(argument);
                }
            }
        }

        fn visit_expr_path(&mut self, expression: &'ast syn::ExprPath) {
            if expression.qself.is_none()
                && expression.path.segments.len() == 1
                && let Some(segment) = expression.path.segments.first()
            {
                self.record_identifier(&segment.ident);
            }
            syn::visit::visit_expr_path(self, expression);
        }

        fn visit_expr_struct(&mut self, expression: &'ast syn::ExprStruct) {
            if expression.qself.is_none()
                && expression.path.segments.len() == 1
                && let Some(segment) = expression.path.segments.first()
            {
                self.record_identifier(&segment.ident);
            }
            syn::visit::visit_expr_struct(self, expression);
        }

        fn visit_macro(&mut self, rust_macro: &'ast syn::Macro) {
            if let Ok(arguments) = parse_macro_arguments(rust_macro) {
                for argument in &arguments {
                    self.collect_expression(argument);
                }
            }
        }
    }

    let helper_names = program
        .helpers
        .iter()
        .map(|function| function.sig.ident.to_string())
        .collect::<HashSet<_>>();
    let mut symbols = Vec::new();
    for function in program.helpers.iter().chain(
        program
            .suites
            .iter()
            .flat_map(|suite| suite.tests.iter().map(|test| &test.function)),
    ) {
        let mut collector = ContractSymbolCollector {
            declared: collect_declared_names(function),
            helper_names: &helper_names,
            standard_constants: &program.standard_constants,
            symbols: Vec::new(),
        };
        collector.visit_block(&function.block);
        symbols.extend(collector.symbols);
    }
    symbols.sort_by_key(|symbol| emit_path_name(symbol));
    symbols.dedup();
    return symbols;
}

fn collect_declared_names(function: &ItemFn) -> HashSet<String> {
    struct DeclaredNameCollector {
        names: HashSet<String>,
    }

    impl<'ast> Visit<'ast> for DeclaredNameCollector {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            self.names.insert(pattern.ident.to_string());
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut collector = DeclaredNameCollector {
        names: HashSet::new(),
    };
    for argument in &function.sig.inputs {
        if let FnArg::Typed(argument) = argument
            && let Pat::Ident(pattern) = argument.pat.as_ref()
        {
            collector.names.insert(pattern.ident.to_string());
        }
    }
    collector.visit_block(&function.block);
    return collector.names;
}

fn emit_assertion(
    out: &mut String,
    rust_macro: &syn::Macro,
    indent: usize,
) -> Result<(), CompileError> {
    let Some(name) = rust_macro
        .path
        .segments
        .last()
        .map(|segment| segment.ident.to_string())
    else {
        return Err(compile_error("assertion macro has an empty path"));
    };
    let arguments = parse_macro_arguments(rust_macro)?;
    let (actual, matcher, expected) = match name.as_str() {
        "assert" if arguments.len() == 1 || arguments.len() == 2 => (
            emit_expression(&arguments[0], &HashSet::new())?,
            "toBe",
            "true".to_string(),
        ),
        "assert_eq" if arguments.len() == 2 || arguments.len() == 3 => (
            emit_expression(&arguments[0], &HashSet::new())?,
            "toEqual",
            emit_expression(&arguments[1], &HashSet::new())?,
        ),
        "assert_ne" if arguments.len() == 2 || arguments.len() == 3 => (
            emit_expression(&arguments[0], &HashSet::new())?,
            "not.toEqual",
            emit_expression(&arguments[1], &HashSet::new())?,
        ),
        "assert" | "assert_eq" | "assert_ne" => {
            return Err(compile_error(format!(
                "unsupported argument count for `{name}!` in portable test"
            )));
        }
        _ => {
            return Err(compile_error(format!(
                "unsupported Rust test macro `{name}!`; refusing to omit test behavior"
            )));
        }
    };
    let message = assertion_message(&arguments, name.as_str())?;
    write_indent(out, indent);
    if let Some(message) = message {
        writeln!(out, "expect({actual}, {message}).{matcher}({expected});")
            .expect("writing to a String cannot fail");
    } else {
        writeln!(out, "expect({actual}).{matcher}({expected});")
            .expect("writing to a String cannot fail");
    }
    return Ok(());
}

fn emit_block(out: &mut String, statements: &[Stmt], indent: usize) -> Result<(), CompileError> {
    for statement in statements {
        emit_statement(out, statement, indent)?;
    }
    return Ok(());
}

fn emit_helper(out: &mut String, function: &ItemFn) -> Result<(), CompileError> {
    if function.sig.asyncness.is_some() {
        return Err(compile_error(format!(
            "async portable helper `{}` is not supported yet",
            function.sig.ident
        )));
    }
    let parameters = function
        .sig
        .inputs
        .iter()
        .map(|argument| emit_parameter(argument, &HashSet::new()))
        .collect::<Result<Vec<_>, _>>()?;
    let return_type = match &function.sig.output {
        ReturnType::Default => "void".to_string(),
        ReturnType::Type(_, rust_type) => emit_type(rust_type, &HashSet::new())?,
    };
    writeln!(
        out,
        "function {}({}): {return_type} {{",
        snake_to_lower_camel(&function.sig.ident.to_string()),
        parameters.join(", ")
    )
    .expect("writing to a String cannot fail");
    emit_block(out, &function.block.stmts, 1)?;
    out.push_str("}\n");
    return Ok(());
}

fn emit_path_name(name: &str) -> String {
    if name.chars().all(|character| {
        character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
    }) {
        return name.to_string();
    }
    return snake_to_lower_camel(name);
}

fn emit_pattern(pattern: &Pat) -> Result<String, CompileError> {
    return match pattern {
        Pat::Ident(identifier) => Ok(snake_to_lower_camel(&identifier.ident.to_string())),
        Pat::Reference(reference) => emit_pattern(&reference.pat),
        Pat::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(emit_pattern)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        _ => Err(compile_error(
            "unsupported destructuring pattern in portable test loop",
        )),
    };
}

fn emit_statement(out: &mut String, statement: &Stmt, indent: usize) -> Result<(), CompileError> {
    match statement {
        Stmt::Local(local) => emit_local(out, local, &HashSet::new(), indent)?,
        Stmt::Expr(Expr::If(expression), _) => {
            write_indent(out, indent);
            writeln!(
                out,
                "if ({}) {{",
                emit_expression(&expression.cond, &HashSet::new())?
            )
            .expect("writing to a String cannot fail");
            emit_block(out, &expression.then_branch.stmts, indent + 1)?;
            write_indent(out, indent);
            if let Some((_, otherwise)) = &expression.else_branch {
                out.push_str("} else {\n");
                let Expr::Block(otherwise) = otherwise.as_ref() else {
                    return Err(compile_error(
                        "portable test else branches must use a block",
                    ));
                };
                emit_block(out, &otherwise.block.stmts, indent + 1)?;
                write_indent(out, indent);
            }
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::ForLoop(expression), _) => {
            write_indent(out, indent);
            writeln!(
                out,
                "for (const {} of {}) {{",
                emit_pattern(&expression.pat)?,
                emit_expression(&expression.expr, &HashSet::new())?
            )
            .expect("writing to a String cannot fail");
            emit_block(out, &expression.body.stmts, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Return(expression), _) => {
            write_indent(out, indent);
            if let Some(value) = &expression.expr {
                writeln!(out, "return {};", emit_expression(value, &HashSet::new())?)
                    .expect("writing to a String cannot fail");
            } else {
                out.push_str("return;\n");
            }
        }
        Stmt::Expr(expression, _) => {
            write_indent(out, indent);
            writeln!(out, "{};", emit_expression(expression, &HashSet::new())?)
                .expect("writing to a String cannot fail");
        }
        Stmt::Macro(statement) => emit_assertion(out, &statement.mac, indent)?,
        Stmt::Item(_) => {
            return Err(compile_error(
                "unsupported item declaration inside portable test function",
            ));
        }
    }
    return Ok(());
}

fn emit_suite(out: &mut String, suite: &TestSuite) -> Result<(), CompileError> {
    writeln!(
        out,
        "describe({:?}, () => {{",
        snake_to_lower_camel(&suite.name)
    )
    .expect("writing to a String cannot fail");
    for test in &suite.tests {
        emit_test(out, test)?;
    }
    out.push_str("});\n");
    return Ok(());
}

fn emit_test(out: &mut String, test: &TestCase) -> Result<(), CompileError> {
    let function = &test.function;
    if function.sig.asyncness.is_some() {
        return Err(compile_error(format!(
            "async portable test `{}` is not supported yet",
            function.sig.ident
        )));
    }
    if !function.sig.inputs.is_empty() || !matches!(function.sig.output, ReturnType::Default) {
        return Err(compile_error(format!(
            "portable test `{}` must have signature `fn name()`",
            function.sig.ident
        )));
    }
    let name = function.sig.ident.to_string().replace('_', " ");
    writeln!(out, "  it({name:?}, () => {{").expect("writing to a String cannot fail");
    if test.should_panic {
        out.push_str("    expect(() => {\n");
        emit_block(out, &function.block.stmts, 3)?;
        out.push_str("    }).toThrow();\n");
    } else {
        emit_block(out, &function.block.stmts, 2)?;
    }
    out.push_str("  });\n");
    return Ok(());
}

pub(crate) fn emit_test_program(program: &TestProgram) -> Result<String, CompileError> {
    let contract_symbols = collect_contract_symbols(program);
    let mut out = String::new();
    out.push_str("import { describe, expect, it } from 'vitest';\n");
    if !contract_symbols.is_empty() {
        out.push_str("\nimport {\n");
        for symbol in contract_symbols {
            writeln!(out, "  {},", emit_path_name(&symbol))
                .expect("writing to a String cannot fail");
        }
        writeln!(out, "}} from '{}';", program.contract_package)
            .expect("writing to a String cannot fail");
    }
    if program.standard_constants.contains("PI") {
        out.push_str("\nconst PI = Math.PI;\n");
    }
    for helper in &program.helpers {
        out.push('\n');
        emit_helper(&mut out, helper)?;
    }
    for suite in &program.suites {
        out.push('\n');
        emit_suite(&mut out, suite)?;
    }
    return Ok(out);
}

fn parse_macro_arguments(
    rust_macro: &syn::Macro,
) -> Result<Punctuated<Expr, Token![,]>, CompileError> {
    return Punctuated::<Expr, Token![,]>::parse_terminated
        .parse2(rust_macro.tokens.clone())
        .map_err(|error| {
            compile_error(format!(
                "failed to parse arguments for `{}` macro: {error}",
                rust_macro
                    .path
                    .segments
                    .last()
                    .map(|segment| segment.ident.to_string())
                    .unwrap_or_else(|| "<unknown>".to_string())
            ))
        });
}
