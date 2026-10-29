use std::collections::{HashMap, HashSet};
use std::fmt::Write;

use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::visit::Visit;
use syn::{BinOp, Expr, Fields, FnArg, ItemFn, Pat, ReturnType, Stmt, Token};

use crate::model::{TestCase, TestProgram, TestSuite};
use crate::typescript::{
    emit_expression, emit_for_header, emit_format_template, emit_local,
    emit_local_with_shadow_and_else, emit_parameter, emit_type, frozen_object_name,
    function_expression_context, insert_vitest_helper_return_context,
    insert_vitest_import_alias_context, insert_vitest_rebound_struct_context,
    is_data_union_variant, is_string_union, is_vitest_struct, numeric_literal_spelling,
    snake_to_lower_camel, update_vitest_local_function_context, update_vitest_struct_local_context,
    validate_vitest_function_provenance, vitest_path_binding_name, vitest_pattern_context,
    write_indent,
};
use crate::{CompileError, compile_error};

fn assertion_message(
    arguments: &Punctuated<Expr, Token![,]>,
    name: &str,
    context: &HashSet<String>,
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
    let values = arguments.iter().skip(message_index + 1).collect::<Vec<_>>();
    return emit_format_template(
        &message.value(),
        &values,
        context,
        "portable assertion message",
    )
    .map(Some);
}

fn collect_contract_symbols(
    program: &TestProgram,
    context: &HashSet<String>,
) -> (Vec<String>, Vec<String>, Vec<String>) {
    struct ContractSymbolCollector<'a> {
        declared: HashSet<String>,
        helper_names: &'a HashSet<String>,
        standard_constants: &'a HashSet<String>,
        context: &'a HashSet<String>,
        symbols: Vec<String>,
        type_symbols: Vec<String>,
        external_modules: Vec<String>,
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

        fn record_type_identifier(&mut self, identifier: &syn::Ident) {
            let name = identifier.to_string();
            if !self.declared.contains(&name)
                && !self.helper_names.contains(&name)
                && !self.standard_constants.contains(&name)
                && !self.symbols.contains(&name)
                && !self.type_symbols.contains(&name)
            {
                self.type_symbols.push(name);
            }
        }

        fn record_external_module(&mut self, identifier: &syn::Ident) {
            let name = identifier.to_string();
            if name.starts_with("flight_") && !self.external_modules.contains(&name) {
                self.external_modules.push(name);
            }
        }
    }

    impl<'ast> Visit<'ast> for ContractSymbolCollector<'_> {
        fn visit_block(&mut self, block: &'ast syn::Block) {
            let outer = self.declared.clone();
            for statement in &block.stmts {
                if let Stmt::Local(local) = statement {
                    if let Some(initializer) = &local.init {
                        self.visit_expr(&initializer.expr);
                        if let Some((_, diverge)) = &initializer.diverge {
                            self.visit_expr(diverge);
                        }
                    }
                    self.visit_pat(&local.pat);
                    self.declared.extend(pattern_names(&local.pat));
                } else {
                    self.visit_stmt(statement);
                }
            }
            self.declared = outer;
        }

        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            let outer = self.declared.clone();
            for input in &closure.inputs {
                self.visit_pat(input);
                self.declared.extend(pattern_names(input));
            }
            self.visit_expr(&closure.body);
            self.declared = outer;
        }

        fn visit_expr_for_loop(&mut self, expression: &'ast syn::ExprForLoop) {
            self.visit_expr(&expression.expr);
            self.visit_pat(&expression.pat);
            let outer = self.declared.clone();
            self.declared.extend(pattern_names(&expression.pat));
            self.visit_block(&expression.body);
            self.declared = outer;
        }

        fn visit_expr_if(&mut self, expression: &'ast syn::ExprIf) {
            if let Expr::Let(binding) = expression.cond.as_ref() {
                self.visit_expr(&binding.expr);
                self.visit_pat(&binding.pat);
                let outer = self.declared.clone();
                self.declared.extend(pattern_names(&binding.pat));
                self.visit_block(&expression.then_branch);
                self.declared = outer;
            } else {
                self.visit_expr(&expression.cond);
                self.visit_block(&expression.then_branch);
            }
            if let Some((_, otherwise)) = &expression.else_branch {
                self.visit_expr(otherwise);
            }
        }

        fn visit_expr_match(&mut self, expression: &'ast syn::ExprMatch) {
            self.visit_expr(&expression.expr);
            for arm in &expression.arms {
                self.visit_pat(&arm.pat);
                let outer = self.declared.clone();
                self.declared.extend(pattern_names(&arm.pat));
                if let Some((_, guard)) = &arm.guard {
                    self.visit_expr(guard);
                }
                self.visit_expr(&arm.body);
                self.declared = outer;
            }
        }

        fn visit_expr_while(&mut self, expression: &'ast syn::ExprWhile) {
            if let Expr::Let(binding) = expression.cond.as_ref() {
                self.visit_expr(&binding.expr);
                self.visit_pat(&binding.pat);
                let outer = self.declared.clone();
                self.declared.extend(pattern_names(&binding.pat));
                self.visit_block(&expression.body);
                self.declared = outer;
            } else {
                self.visit_expr(&expression.cond);
                self.visit_block(&expression.body);
            }
        }

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
                if segments.len() > 1
                    && let Some(segment) = segments.first()
                {
                    self.record_external_module(&segment.ident);
                }
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
                        "Arc"
                            | "Box"
                            | "Mutex"
                            | "Option"
                            | "Ref"
                            | "Result"
                            | "RwLock"
                            | "String"
                            | "Vec"
                    )
                {
                    if is_string_union(self.context, &segment.ident.to_string()) {
                        syn::visit::visit_expr_path(self, expression);
                        return;
                    }
                    if segments.len() == 2
                        && let Some(variant) = segments.last()
                        && is_data_union_variant(
                            self.context,
                            &segment.ident.to_string(),
                            &variant.ident.to_string(),
                        )
                    {
                        syn::visit::visit_expr_path(self, expression);
                        return;
                    }
                    // Rust enum variants are paths (`Type::Variant`) while the generated TypeScript
                    // test needs the owning enum object imported from the contract lane.
                    self.record_identifier(&segment.ident);
                }
            }
            syn::visit::visit_expr_path(self, expression);
        }

        fn visit_expr_struct(&mut self, expression: &'ast syn::ExprStruct) {
            if expression.qself.is_none()
                && let Some(name) = vitest_path_binding_name(&expression.path, self.context)
                && is_vitest_struct(self.context, &name)
            {
                let segment = expression
                    .path
                    .segments
                    .last()
                    .expect("resolved struct path has a final segment");
                self.record_type_identifier(&segment.ident);
            }
            syn::visit::visit_expr_struct(self, expression);
        }

        fn visit_type_path(&mut self, rust_type: &'ast syn::TypePath) {
            if rust_type.qself.is_none()
                && let Some(first) = rust_type.path.segments.first()
            {
                if rust_type.path.segments.len() > 1 {
                    self.record_external_module(&first.ident);
                }
                if first
                    .ident
                    .to_string()
                    .chars()
                    .next()
                    .is_some_and(|character| character.is_ascii_uppercase())
                    && !matches!(
                        first.ident.to_string().as_str(),
                        "Arc"
                            | "Box"
                            | "Mutex"
                            | "Option"
                            | "Ref"
                            | "Result"
                            | "RwLock"
                            | "String"
                            | "Vec"
                    )
                {
                    self.record_type_identifier(&first.ident);
                }
            }
            syn::visit::visit_type_path(self, rust_type);
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
    let mut type_symbols = Vec::new();
    let mut external_modules = Vec::new();
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
            context,
            symbols: Vec::new(),
            type_symbols: Vec::new(),
            external_modules: Vec::new(),
        };
        collector.visit_signature(&function.sig);
        collector.visit_block(&function.block);
        symbols.extend(collector.symbols);
        type_symbols.extend(collector.type_symbols);
        external_modules.extend(collector.external_modules);
    }
    let mut collector = ContractSymbolCollector {
        declared: HashSet::new(),
        helper_names: &helper_names,
        standard_constants: &program.standard_constants,
        context,
        symbols: Vec::new(),
        type_symbols: Vec::new(),
        external_modules: Vec::new(),
    };
    for constant in &program.constants {
        collector.visit_item_const(constant);
    }
    for structure in &program.structs {
        collector.visit_item_struct(structure);
    }
    for type_alias in &program.type_aliases {
        collector.visit_item_type(type_alias);
    }
    symbols.extend(collector.symbols);
    type_symbols.extend(collector.type_symbols);
    external_modules.extend(collector.external_modules);
    symbols.sort_by_key(|symbol| emit_path_name(symbol));
    symbols.dedup();
    type_symbols.sort_by_key(|symbol| emit_path_name(symbol));
    type_symbols.dedup();
    type_symbols.retain(|symbol| !symbols.contains(symbol));
    external_modules.sort();
    external_modules.dedup();
    return (symbols, type_symbols, external_modules);
}

fn pattern_names(pattern: &Pat) -> HashSet<String> {
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
    collector.visit_pat(pattern);
    return collector.names;
}

fn collect_declared_names(function: &ItemFn) -> HashSet<String> {
    let mut names = HashSet::new();
    for argument in &function.sig.inputs {
        if let FnArg::Typed(argument) = argument {
            names.extend(pattern_names(&argument.pat));
        }
    }
    return names;
}

fn emit_assertion(
    out: &mut String,
    rust_macro: &syn::Macro,
    indent: usize,
    context: &HashSet<String>,
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
            emit_assertion_expression(&arguments[0], context)?,
            "toBe",
            "true".to_string(),
        ),
        "assert_eq" if arguments.len() >= 2 => (
            emit_assertion_expression(&arguments[0], context)?,
            "toEqual",
            emit_assertion_expression(&arguments[1], context)?,
        ),
        "assert_ne" if arguments.len() >= 2 => (
            emit_assertion_expression(&arguments[0], context)?,
            "not.toEqual",
            emit_assertion_expression(&arguments[1], context)?,
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
    let message = assertion_message(&arguments, name.as_str(), context)?;
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

fn emit_assertion_expression(
    expression: &Expr,
    context: &HashSet<String>,
) -> Result<String, CompileError> {
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
                emit_expression(&difference.left, context)?,
                emit_expression(&difference.right, context)?,
                emit_expression(&comparison.right, context)?
            ));
        }
    }
    return emit_expression(expression, context);
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

fn emit_block(
    out: &mut String,
    statements: &[Stmt],
    context: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let mut block_context = context.clone();
    insert_vitest_rebound_struct_context(statements, &mut block_context);
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
            emit_local_with_shadow_and_else(
                out,
                &block_context,
                local,
                indent,
                shadowed,
                rebound,
                emit_block,
            )?;
            update_vitest_struct_local_context(local, &mut block_context);
            update_vitest_local_function_context(local, &mut block_context);
        } else if let Stmt::Local(local) = statement {
            emit_statement(out, statement, &block_context, indent)?;
            update_vitest_local_function_context(local, &mut block_context);
        } else {
            emit_statement(out, statement, &block_context, indent)?;
        }
    }
    return Ok(());
}

fn emit_helper(
    out: &mut String,
    function: &ItemFn,
    context: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    if function.sig.asyncness.is_some() {
        return Err(compile_error(format!(
            "async portable helper `{}` is not supported yet",
            function.sig.ident
        )));
    }
    validate_vitest_function_provenance(function, context)?;
    let context = function_expression_context(function, context);
    let parameters = function
        .sig
        .inputs
        .iter()
        .map(|argument| emit_parameter(argument, &context))
        .collect::<Result<Vec<_>, _>>()?;
    let return_type = match &function.sig.output {
        ReturnType::Default => "void".to_string(),
        ReturnType::Type(_, rust_type) => emit_type(rust_type, &context)?,
    };
    write_indent(out, indent);
    writeln!(
        out,
        "function {}({}): {return_type} {{",
        snake_to_lower_camel(&function.sig.ident.to_string()),
        parameters.join(", ")
    )
    .expect("writing to a String cannot fail");
    emit_block(out, &function.block.stmts, &context, indent + 1)?;
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

fn emit_test_constant(
    out: &mut String,
    constant: &syn::ItemConst,
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    writeln!(
        out,
        "const {}: {} = {};",
        constant.ident,
        emit_type(&constant.ty, context)?,
        emit_expression(&constant.expr, context)?
    )
    .expect("writing to a String cannot fail");
    return Ok(());
}

fn emit_test_struct(
    out: &mut String,
    structure: &syn::ItemStruct,
    context: &HashSet<String>,
) -> Result<(), CompileError> {
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
            emit_type(&field.ty, context)?
        )
        .expect("writing to a String cannot fail");
    }
    out.push_str("}\n");
    return Ok(());
}

fn emit_test_type_alias(
    out: &mut String,
    type_alias: &syn::ItemType,
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    writeln!(
        out,
        "type {} = {};",
        type_alias.ident,
        emit_type(&type_alias.ty, context)?
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

fn emit_statement(
    out: &mut String,
    statement: &Stmt,
    context: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    match statement {
        Stmt::Local(local) => emit_local(out, local, context, indent)?,
        Stmt::Expr(Expr::If(expression), _) => {
            let then_context = if let Expr::Let(binding) = expression.cond.as_ref() {
                vitest_pattern_context(context, &binding.pat)
            } else {
                context.clone()
            };
            write_indent(out, indent);
            writeln!(
                out,
                "if ({}) {{",
                emit_expression(&expression.cond, context)?
            )
            .expect("writing to a String cannot fail");
            emit_block(
                out,
                &expression.then_branch.stmts,
                &then_context,
                indent + 1,
            )?;
            write_indent(out, indent);
            if let Some((_, otherwise)) = &expression.else_branch {
                out.push_str("} else {\n");
                let Expr::Block(otherwise) = otherwise.as_ref() else {
                    return Err(compile_error(
                        "portable test else branches must use a block",
                    ));
                };
                emit_block(out, &otherwise.block.stmts, context, indent + 1)?;
                write_indent(out, indent);
            }
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::ForLoop(expression), _) => {
            let loop_context = vitest_pattern_context(context, &expression.pat);
            write_indent(out, indent);
            writeln!(
                out,
                "for ({}) {{",
                emit_for_header(&expression.pat, &expression.expr, context)?
            )
            .expect("writing to a String cannot fail");
            emit_block(out, &expression.body.stmts, &loop_context, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::While(expression), _) => {
            let loop_context = if let Expr::Let(binding) = expression.cond.as_ref() {
                vitest_pattern_context(context, &binding.pat)
            } else {
                context.clone()
            };
            write_indent(out, indent);
            writeln!(
                out,
                "while ({}) {{",
                emit_expression(&expression.cond, context)?
            )
            .expect("writing to a String cannot fail");
            emit_block(out, &expression.body.stmts, &loop_context, indent + 1)?;
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
                writeln!(out, "return {};", emit_expression(value, context)?)
                    .expect("writing to a String cannot fail");
            } else {
                out.push_str("return;\n");
            }
        }
        Stmt::Expr(expression, _) => {
            write_indent(out, indent);
            writeln!(out, "{};", emit_expression(expression, context)?)
                .expect("writing to a String cannot fail");
        }
        Stmt::Macro(statement) => emit_assertion(out, &statement.mac, indent, context)?,
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
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    let mut suite_context = context.clone();
    insert_vitest_import_alias_context(&mut suite_context, suite.uses.iter());
    insert_vitest_helper_return_context(
        &mut suite_context,
        &format!("vitest/suite/{}", suite.name),
        suite.helpers.iter(),
    );
    let name = resolve_suite_name(&suite.name, contract_symbols);
    writeln!(out, "describe({:?}, () => {{", snake_to_lower_camel(name))
        .expect("writing to a String cannot fail");
    for helper in &suite.helpers {
        emit_helper(out, helper, &suite_context, 1)?;
    }
    for test in &suite.skipped_tests {
        writeln!(out, "  // Rust-only: {}", test.replace('_', " "))
            .expect("writing to a String cannot fail");
    }
    for test in &suite.tests {
        emit_test(out, test, &suite_context)?;
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

fn emit_test(
    out: &mut String,
    test: &TestCase,
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    let function = &test.function;
    if function.sig.asyncness.is_some() {
        return Err(compile_error(format!(
            "async portable test `{}` is not supported yet",
            function.sig.ident
        )));
    }
    validate_vitest_function_provenance(function, context)?;
    let context = function_expression_context(function, context);
    if !function.sig.inputs.is_empty() || !matches!(function.sig.output, ReturnType::Default) {
        return Err(compile_error(format!(
            "portable test `{}` must have signature `fn name()`",
            function.sig.ident
        )));
    }
    let name = test_display_name(function);
    writeln!(out, "  it({name:?}, () => {{").expect("writing to a String cannot fail");
    if test.should_panic {
        out.push_str("    expect(() => {\n");
        emit_block(out, &function.block.stmts, &context, 3)?;
        out.push_str("    }).toThrow();\n");
    } else {
        emit_block(out, &function.block.stmts, &context, 2)?;
    }
    out.push_str("  });\n");
    return Ok(());
}

fn test_display_name(function: &ItemFn) -> String {
    struct DecimalLiteralCollector {
        literals: HashSet<(String, String)>,
    }

    impl<'ast> Visit<'ast> for DecimalLiteralCollector {
        fn visit_lit_float(&mut self, literal: &'ast syn::LitFloat) {
            let spelling = numeric_literal_spelling(&literal.to_string(), literal.suffix());
            let Some((whole, fraction)) = spelling.split_once('.') else {
                return;
            };
            let fractional_digits = fraction.replace('_', "");
            if !whole
                .chars()
                .all(|character| character.is_ascii_digit() || character == '_')
                || fractional_digits.is_empty()
                || !fractional_digits
                    .chars()
                    .all(|character| character.is_ascii_digit())
                || !fractional_digits.chars().any(|character| character != '0')
            {
                return;
            }
            self.literals.insert((
                spelling.replace('.', "_"),
                format!("{}.{}", whole.replace('_', ""), fractional_digits),
            ));
        }

        fn visit_macro(&mut self, rust_macro: &'ast syn::Macro) {
            if let Ok(arguments) = parse_macro_arguments(rust_macro) {
                for argument in &arguments {
                    self.visit_expr(argument);
                }
            }
        }
    }

    let mut collector = DecimalLiteralCollector {
        literals: HashSet::new(),
    };
    collector.visit_block(&function.block);
    let mut literals = collector.literals.into_iter().collect::<Vec<_>>();
    literals.sort_by_key(|(encoded, _)| std::cmp::Reverse(encoded.len()));

    let mut name = format!("_{}_", function.sig.ident);
    for (encoded, display) in literals {
        name = name.replace(&format!("_{encoded}_"), &format!("_{display}_"));
    }
    return name.trim_matches('_').replace('_', " ");
}

pub(crate) fn emit_test_program(
    program: &TestProgram,
    contract_module: &str,
    context: &HashSet<String>,
) -> Result<String, CompileError> {
    let (mut contract_symbols, mut contract_type_symbols, external_modules) =
        collect_contract_symbols(program, context);
    let (cross_crate_values, cross_crate_types) =
        crate::typescript::test_cross_crate_imports(program)?;
    let cross_crate_local_names = cross_crate_values
        .values()
        .chain(cross_crate_types.values())
        .flat_map(|names| names.iter())
        .map(|specifier| {
            specifier
                .rsplit_once(" as ")
                .map_or(specifier.as_str(), |(_, local)| local)
        })
        .collect::<HashSet<_>>();
    contract_symbols
        .retain(|symbol| !cross_crate_local_names.contains(emit_path_name(symbol).as_str()));
    contract_type_symbols
        .retain(|symbol| !cross_crate_local_names.contains(emit_path_name(symbol).as_str()));
    let mut out = String::new();
    out.push_str("import { describe, expect, it } from 'vitest';\n");
    for (module, names) in &cross_crate_values {
        writeln!(
            out,
            "\nimport {{ {} }} from {:?};",
            names.iter().cloned().collect::<Vec<_>>().join(", "),
            module
        )
        .expect("writing to a String cannot fail");
    }
    for (module, names) in &cross_crate_types {
        writeln!(
            out,
            "\nimport type {{ {} }} from {:?};",
            names.iter().cloned().collect::<Vec<_>>().join(", "),
            module
        )
        .expect("writing to a String cannot fail");
    }
    if !contract_symbols.is_empty() {
        out.push_str("\nimport {\n");
        for symbol in &contract_symbols {
            let name = frozen_object_name(context, symbol)
                .map(str::to_string)
                .unwrap_or_else(|| emit_path_name(symbol));
            writeln!(out, "  {name},").expect("writing to a String cannot fail");
        }
        writeln!(out, "}} from {contract_module:?};").expect("writing to a String cannot fail");
    }
    if !contract_type_symbols.is_empty() {
        out.push_str("\nimport type {\n");
        for symbol in &contract_type_symbols {
            writeln!(out, "  {},", emit_path_name(symbol))
                .expect("writing to a String cannot fail");
        }
        writeln!(out, "}} from {contract_module:?};").expect("writing to a String cannot fail");
    }
    for module in external_modules {
        let Some(package) = module.strip_prefix("flight_") else {
            continue;
        };
        let package = package.replace('_', "-");
        writeln!(
            out,
            "\nimport * as {} from {:?};",
            snake_to_lower_camel(&module),
            format!("@flighthq/{package}/contract")
        )
        .expect("writing to a String cannot fail");
    }
    if program.standard_constants.contains("PI") {
        out.push_str("\nconst PI = Math.PI;\n");
    }
    for type_alias in &program.type_aliases {
        out.push('\n');
        emit_test_type_alias(&mut out, type_alias, context)?;
    }
    for structure in &program.structs {
        out.push('\n');
        emit_test_struct(&mut out, structure, context)?;
    }
    for constant in &program.constants {
        out.push('\n');
        emit_test_constant(&mut out, constant, context)?;
    }
    for helper in &program.helpers {
        out.push('\n');
        emit_helper(&mut out, helper, context, 0)?;
    }
    for suite in &program.suites {
        out.push('\n');
        emit_suite(&mut out, suite, &contract_symbols, context)?;
    }
    return Ok(out);
}

fn local_name(pattern: &Pat) -> Option<String> {
    return match pattern {
        Pat::Ident(identifier) => Some(identifier.ident.to_string()),
        Pat::TupleStruct(tuple) if tuple.path.is_ident("Some") && tuple.elems.len() == 1 => {
            let Pat::Ident(identifier) = &tuple.elems[0] else {
                return None;
            };
            Some(identifier.ident.to_string())
        }
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
