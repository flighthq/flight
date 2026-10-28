use std::collections::{HashMap, HashSet};
use std::fmt::Write;

use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::visit::Visit;
use syn::{BinOp, Expr, Fields, FnArg, ItemFn, Pat, ReturnType, Stmt, Token};

use crate::model::{TestCase, TestProgram, TestSuite};
use crate::typescript::{
    emit_expression, emit_for_header, emit_local, emit_local_with_shadow, emit_parameter,
    emit_type, snake_to_lower_camel, write_indent,
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
    let mut template = message
        .value()
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${");
    let values = arguments.iter().skip(message_index + 1).collect::<Vec<_>>();
    let mut value_index = 0;
    let mut rendered = String::new();
    while let Some(start) = template.find('{') {
        let Some(relative_end) = template[start + 1..].find('}') else {
            break;
        };
        let end = start + 1 + relative_end;
        rendered.push_str(&template[..start]);
        let placeholder = &template[start + 1..end];
        if placeholder.is_empty() {
            let Some(value) = values.get(value_index) else {
                return Err(compile_error(
                    "portable assertion message has too few formatting values",
                ));
            };
            rendered.push_str("${");
            rendered.push_str(&emit_expression(value, &HashSet::new())?);
            rendered.push('}');
            value_index += 1;
        } else {
            let name = placeholder.split(':').next().unwrap_or(placeholder);
            rendered.push_str("${");
            rendered.push_str(&snake_to_lower_camel(name));
            rendered.push('}');
        }
        template = template[end + 1..].to_string();
    }
    rendered.push_str(&template);
    if value_index != values.len() {
        return Err(compile_error(
            "portable assertion message has unused formatting values",
        ));
    }
    return Ok(Some(format!("`{rendered}`")));
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
            struct ExpressionBindingCollector {
                names: HashSet<String>,
            }

            impl<'ast> Visit<'ast> for ExpressionBindingCollector {
                fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
                    self.names.insert(pattern.ident.to_string());
                    syn::visit::visit_pat_ident(self, pattern);
                }
            }

            let mut bindings = ExpressionBindingCollector {
                names: HashSet::new(),
            };
            bindings.visit_expr(expression);
            let newly_declared = bindings
                .names
                .into_iter()
                .filter(|name| self.declared.insert(name.clone()))
                .collect::<Vec<_>>();
            self.visit_expr(expression);
            for name in newly_declared {
                self.declared.remove(&name);
            }
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
            if expression.qself.is_none() {
                let segments = &expression.path.segments;
                if segments.len() == 1
                    && let Some(segment) = segments.first()
                {
                    self.record_identifier(&segment.ident);
                } else if let Some(segment) = segments.first()
                    && segment
                        .ident
                        .to_string()
                        .chars()
                        .next()
                        .is_some_and(|character| character.is_ascii_uppercase())
                    && !matches!(
                        segment.ident.to_string().as_str(),
                        "Arc" | "Box" | "Option" | "Result" | "String" | "Vec"
                    )
                {
                    // Rust enum variants are paths (`Type::Variant`) while the generated TypeScript
                    // test needs the owning enum object imported from the contract lane.
                    self.record_identifier(&segment.ident);
                }
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
        .chain(program.suites.iter().flat_map(|suite| suite.helpers.iter()))
        .map(|function| function.sig.ident.to_string())
        .chain(
            program
                .constants
                .iter()
                .map(|constant| constant.ident.to_string()),
        )
        .chain(
            program
                .structs
                .iter()
                .map(|structure| structure.ident.to_string()),
        )
        .chain(
            program
                .type_aliases
                .iter()
                .map(|type_alias| type_alias.ident.to_string()),
        )
        .collect::<HashSet<_>>();
    let mut symbols = Vec::new();
    for function in program
        .helpers
        .iter()
        .chain(program.suites.iter().flat_map(|suite| {
            suite
                .helpers
                .iter()
                .chain(suite.tests.iter().map(|test| &test.function))
        }))
    {
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
    let (mut actual, matcher, mut expected) = match name.as_str() {
        "assert" if !arguments.is_empty() => (
            emit_assertion_expression(&arguments[0])?,
            "toBe",
            "true".to_string(),
        ),
        "assert_eq" if arguments.len() >= 2 => (
            emit_assertion_expression(&arguments[0])?,
            "toEqual",
            emit_assertion_expression(&arguments[1])?,
        ),
        "assert_ne" if arguments.len() >= 2 => (
            emit_assertion_expression(&arguments[0])?,
            "not.toEqual",
            emit_assertion_expression(&arguments[1])?,
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
    if matches!(name.as_str(), "assert_eq" | "assert_ne") && arguments.len() >= 2 {
        if is_array_expression(&arguments[1]) {
            actual = format!("Array.from({actual})");
        }
        if is_array_expression(&arguments[0]) {
            expected = format!("Array.from({expected})");
        }
    }
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

fn emit_assertion_expression(expression: &Expr) -> Result<String, CompileError> {
    if let Expr::Binary(comparison) = expression
        && matches!(comparison.op, BinOp::Lt(_))
        && let Expr::MethodCall(absolute) = comparison.left.as_ref()
        && absolute.method == "abs"
        && absolute.args.is_empty()
    {
        let difference = unparenthesized(&absolute.receiver);
        if let Expr::Binary(difference) = difference
            && matches!(difference.op, BinOp::Sub(_))
            && matches!(unparenthesized(&difference.left), Expr::Index(_))
            && expression_contains_suffixed_f32(&difference.right)
        {
            return Ok(format!(
                "Math.abs({} - Math.fround({})) < {}",
                emit_expression(&difference.left, &HashSet::new())?,
                emit_expression(&difference.right, &HashSet::new())?,
                emit_expression(&comparison.right, &HashSet::new())?
            ));
        }
    }
    return emit_expression(expression, &HashSet::new());
}

fn expression_contains_suffixed_f32(expression: &Expr) -> bool {
    struct F32Finder {
        found: bool,
    }

    impl<'ast> Visit<'ast> for F32Finder {
        fn visit_lit_float(&mut self, literal: &'ast syn::LitFloat) {
            self.found |= literal.suffix() == "f32";
            syn::visit::visit_lit_float(self, literal);
        }
    }

    let mut finder = F32Finder { found: false };
    finder.visit_expr(expression);
    return finder.found;
}

fn is_array_expression(expression: &Expr) -> bool {
    return matches!(
        unparenthesized(expression),
        Expr::Array(_) | Expr::Repeat(_)
    );
}

fn unparenthesized(mut expression: &Expr) -> &Expr {
    while let Expr::Paren(parenthesized) = expression {
        expression = &parenthesized.expr;
    }
    return expression;
}

fn emit_block(out: &mut String, statements: &[Stmt], indent: usize) -> Result<(), CompileError> {
    let mut declaration_counts = HashMap::new();
    for statement in statements {
        if let Stmt::Local(local) = statement
            && let Some(name) = local_name(&local.pat)
        {
            *declaration_counts.entry(name).or_insert(0_usize) += 1;
        }
    }
    let mut declared = HashSet::new();
    for statement in statements {
        if let Stmt::Local(local) = statement
            && let Some(name) = local_name(&local.pat)
        {
            let rebound = declaration_counts
                .get(&name)
                .is_some_and(|count| *count > 1);
            let shadowed = !declared.insert(name);
            emit_local_with_shadow(out, local, &HashSet::new(), indent, shadowed, rebound)?;
        } else {
            emit_statement(out, statement, indent)?;
        }
    }
    return Ok(());
}

fn emit_helper(out: &mut String, function: &ItemFn, indent: usize) -> Result<(), CompileError> {
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
    write_indent(out, indent);
    writeln!(
        out,
        "function {}({}): {return_type} {{",
        snake_to_lower_camel(&function.sig.ident.to_string()),
        parameters.join(", ")
    )
    .expect("writing to a String cannot fail");
    emit_block(out, &function.block.stmts, indent + 1)?;
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

fn emit_test_constant(out: &mut String, constant: &syn::ItemConst) -> Result<(), CompileError> {
    writeln!(
        out,
        "const {}: {} = {};",
        constant.ident,
        emit_type(&constant.ty, &HashSet::new())?,
        emit_expression(&constant.expr, &HashSet::new())?
    )
    .expect("writing to a String cannot fail");
    return Ok(());
}

fn emit_test_struct(out: &mut String, structure: &syn::ItemStruct) -> Result<(), CompileError> {
    let Fields::Named(fields) = &structure.fields else {
        return Err(compile_error(format!(
            "portable test struct `{}` must use named fields",
            structure.ident
        )));
    };
    writeln!(out, "interface {} {{", structure.ident).expect("writing to a String cannot fail");
    for field in &fields.named {
        let Some(name) = &field.ident else {
            return Err(compile_error(format!(
                "portable test struct `{}` has an unnamed field",
                structure.ident
            )));
        };
        writeln!(
            out,
            "  {}: {};",
            snake_to_lower_camel(&name.to_string()),
            emit_type(&field.ty, &HashSet::new())?
        )
        .expect("writing to a String cannot fail");
    }
    out.push_str("}\n");
    return Ok(());
}

fn emit_test_type_alias(out: &mut String, type_alias: &syn::ItemType) -> Result<(), CompileError> {
    writeln!(
        out,
        "type {} = {};",
        type_alias.ident,
        emit_type(&type_alias.ty, &HashSet::new())?
    )
    .expect("writing to a String cannot fail");
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
                "for ({}) {{",
                emit_for_header(&expression.pat, &expression.expr, &HashSet::new())?
            )
            .expect("writing to a String cannot fail");
            emit_block(out, &expression.body.stmts, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::While(expression), _) => {
            write_indent(out, indent);
            writeln!(
                out,
                "while ({}) {{",
                emit_expression(&expression.cond, &HashSet::new())?
            )
            .expect("writing to a String cannot fail");
            emit_block(out, &expression.body.stmts, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Break(_), _) => {
            write_indent(out, indent);
            out.push_str("break;\n");
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

fn emit_suite(
    out: &mut String,
    suite: &TestSuite,
    contract_symbols: &[String],
) -> Result<(), CompileError> {
    let name = resolve_suite_name(&suite.name, contract_symbols);
    writeln!(out, "describe({:?}, () => {{", snake_to_lower_camel(name))
        .expect("writing to a String cannot fail");
    for helper in &suite.helpers {
        emit_helper(out, helper, 1)?;
    }
    for test in &suite.skipped_tests {
        writeln!(out, "  // Rust-only: {}", test.replace('_', " "))
            .expect("writing to a String cannot fail");
    }
    for test in &suite.tests {
        emit_test(out, test)?;
    }
    out.push_str("});\n");
    return Ok(());
}

fn resolve_suite_name<'a>(name: &'a str, contract_symbols: &'a [String]) -> &'a str {
    if contract_symbols.iter().any(|symbol| symbol == name) {
        return name;
    }
    if let Some(callable) = name.strip_suffix("_tests")
        && contract_symbols.iter().any(|symbol| symbol == callable)
    {
        return callable;
    }
    return name;
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

pub(crate) fn emit_test_program(
    program: &TestProgram,
    contract_module: &str,
) -> Result<String, CompileError> {
    let contract_symbols = collect_contract_symbols(program);
    let mut out = String::new();
    out.push_str("import { describe, expect, it } from 'vitest';\n");
    if !contract_symbols.is_empty() {
        out.push_str("\nimport {\n");
        for symbol in &contract_symbols {
            writeln!(out, "  {},", emit_path_name(&symbol))
                .expect("writing to a String cannot fail");
        }
        writeln!(out, "}} from {contract_module:?};").expect("writing to a String cannot fail");
    }
    if program.standard_constants.contains("PI") {
        out.push_str("\nconst PI = Math.PI;\n");
    }
    for type_alias in &program.type_aliases {
        out.push('\n');
        emit_test_type_alias(&mut out, type_alias)?;
    }
    for structure in &program.structs {
        out.push('\n');
        emit_test_struct(&mut out, structure)?;
    }
    for constant in &program.constants {
        out.push('\n');
        emit_test_constant(&mut out, constant)?;
    }
    for helper in &program.helpers {
        out.push('\n');
        emit_helper(&mut out, helper, 0)?;
    }
    for suite in &program.suites {
        out.push('\n');
        emit_suite(&mut out, suite, &contract_symbols)?;
    }
    return Ok(out);
}

fn local_name(pattern: &Pat) -> Option<String> {
    return match pattern {
        Pat::Ident(identifier) => Some(identifier.ident.to_string()),
        Pat::Type(typed) => local_name(&typed.pat),
        _ => None,
    };
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
