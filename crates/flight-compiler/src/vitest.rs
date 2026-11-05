use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fmt::Write;

use quote::ToTokens;
use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::visit::Visit;
use syn::{
    BinOp, Expr, Fields, FnArg, ItemFn, ItemUse, Pat, ReturnType, Stmt, Token, Type, UseTree,
};

use crate::model::{Program, TestCase, TestProgram, TestSuite};
use crate::typescript::{
    ASYNC_FUNCTION_MARKER, ASYNC_RESULT_FUNCTION_MARKER, BLOCK_ON_HELPER_MARKER,
    FLIGHT_ERROR_HELPER_MARKER, PANIC_MESSAGE_HELPER_MARKER,
    RETURNS_CONTRACT_TYPED_ARRAY_MARKER,
};
use crate::typescript::{
    ProvenanceImportRule, begin_option_if, begin_option_while, contract_typed_array_return_value,
    emit_block_with_tail_returns,
    emit_expression, emit_expression_for_type, emit_for_header, emit_format_template, emit_local,
    emit_local_function, emit_local_with_shadow_and_else, emit_match_statement,
    emit_option_binding, emit_parameter, emit_type, emit_type_parameters,
    emit_vec_extend_statement, export_name, frozen_object_name, function_expression_context,
    function_returns_uint8_array, exact_mutable_scalar_reference, exact_portable_scalar_type,
    insert_type_parameter_context, lexical_binding_names,
    insert_vitest_helper_return_context, insert_vitest_import_alias_context,
    insert_vitest_rebound_struct_context, is_data_union_variant, is_lowered_cross_crate_type,
    is_lowered_cross_crate_value, is_string_union, is_vitest_function, is_vitest_own_public,
    is_vitest_struct, js_string_literal, lexical_pattern_context, local_pattern_binding_id,
    numeric_literal_spelling,
    option_scrutinee_is_rereadable, provenance_import_rules, snake_to_lower_camel,
    type_script_type_aliases, update_vitest_local_function_context,
    update_vitest_struct_local_context, validate_vitest_function_provenance,
    vitest_current_path_prefix, vitest_function_path_binding_name, vitest_struct_path_binding_name,
    write_indent, MUTABLE_SCALAR_REFERENCE_ARGUMENT_MARKER,
    VITEST_MUTABLE_SCALAR_CELL_LOCAL_BINDING_MARKER,
    VITEST_MUTABLE_SCALAR_CELL_PARAMETER_MARKER,
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

// The production `async fn` a `block_on` argument awaits: one direct, unqualified call of it.
fn block_on_awaited_function(argument: &Expr, context: &HashSet<String>) -> Option<String> {
    let Expr::Call(call) = unparenthesized(argument) else {
        return None;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return None;
    };
    let name = path.path.get_ident()?.to_string();
    return context
        .contains(&format!("{ASYNC_FUNCTION_MARKER}{name}"))
        .then_some(name);
}

// Proves the file's canonical noop-waker executor (see `block_on_helper_is_canonical`) and every use
// of it, returning the helper's name. A call lowers to one `await` of its future, which evaluates the
// future once and rethrows what it throws, exactly as the executor returns its output or unwinds
// its panic; so a call is admitted only where an `await` keeps that meaning:
// - in a `#[test]` body (not a `should_panic` test), outside any closure or async block, never
//   from a helper and never as a value;
// - around exactly one direct call of a production `async fn` that no test helper shadows, whose
//   arguments do not call the executor again;
// - never for a `Result<T, FlightError>` future: no lowering proves its `Err` is the TypeScript
//   promise's rejection (a production `return Err(..)` does not reject), so `await` could not
//   reproduce the returned `Err`.
// A file that otherwise names `Waker`, `RawWaker`, `Poll` or `poll` tests wake or poll behavior,
// which `await` does not reproduce, so it refuses.
// flight-lint: allow(hashmap-iteration) program items are Vecs in Rust source order and only a refusal reason is kept
fn block_on_calls_are_proven(
    program: &TestProgram,
    context: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    // Walks one test body for its uses of the proven `block_on` executor `helper`, recording the first
    // reason one cannot lower to `await` (see `block_on_calls_are_proven`).
    struct BlockOnUses<'a> {
        context: &'a HashSet<String>,
        error: Option<String>,
        // Closures and async blocks entered: an `await` inside one would not suspend the test.
        escaping: usize,
        helper: &'a str,
        shadowed: &'a dyn Fn(&str) -> bool,
    }

    impl BlockOnUses<'_> {
        fn check_call(&mut self, call: &syn::ExprCall) {
            if self.escaping > 0 {
                return self.fail("a call inside a closure or async block");
            }
            let [argument] = call.args.iter().collect::<Vec<_>>()[..] else {
                return self.fail("a call without exactly one future");
            };
            let Some(function) = block_on_awaited_function(argument, self.context) else {
                return self.fail(
                    "an argument other than one direct call of a production `async fn` (a custom or local future)",
                );
            };
            if (self.shadowed)(&function) {
                return self.fail(&format!("`{function}`, which a test helper shadows"));
            }
            if block_on_tokens_name(argument.to_token_stream(), self.helper) {
                return self.fail("a nested call");
            }
            if self
                .context
                .contains(&format!("{ASYNC_RESULT_FUNCTION_MARKER}{function}"))
            {
                return self.fail(&format!(
                    "the `Result` future of `{function}`: no lowering proves its `Err` is the TypeScript promise's rejection, so an `await` could not reproduce the returned `Err`"
                ));
            }
            self.visit_expr(argument);
        }

        fn fail(&mut self, reason: &str) {
            self.error.get_or_insert_with(|| reason.to_string());
        }
    }

    impl<'ast> Visit<'ast> for BlockOnUses<'_> {
        fn visit_expr_async(&mut self, block: &'ast syn::ExprAsync) {
            self.escaping += 1;
            syn::visit::visit_expr_async(self, block);
            self.escaping -= 1;
        }

        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            if let Expr::Path(path) = call.func.as_ref()
                && path.path.is_ident(self.helper)
            {
                return self.check_call(call);
            }
            syn::visit::visit_expr_call(self, call);
        }

        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            self.escaping += 1;
            syn::visit::visit_expr_closure(self, closure);
            self.escaping -= 1;
        }

        // Any other mention, with or without a turbofish, uses the executor as a value.
        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if let [segment] = path.path.segments.iter().collect::<Vec<_>>()[..]
                && segment.ident == self.helper
            {
                self.fail("its use as a value");
            }
        }

        fn visit_macro(&mut self, rust_macro: &'ast syn::Macro) {
            let Ok(arguments) = parse_macro_arguments(rust_macro) else {
                if block_on_tokens_name(rust_macro.tokens.clone(), self.helper) {
                    self.fail("a call inside a macro whose arguments are not expressions");
                }
                return;
            };
            for argument in &arguments {
                self.visit_expr(argument);
            }
        }
    }

    let canonical = program
        .helpers
        .iter()
        .filter(|helper| block_on_helper_is_canonical(helper, program))
        .collect::<Vec<_>>();
    let helper = match canonical.as_slice() {
        [] => return Ok(None),
        [helper] => helper.sig.ident.to_string(),
        _ => {
            return Err(compile_error(
                "portable test declares more than one `block_on` executor",
            ));
        }
    };
    let refuse = |reason: String| {
        return Err(compile_error(format!(
            "portable test `{helper}` executor refuses {reason}; only a test call awaiting one production future lowers to `await`"
        )));
    };
    let helper_functions = program
        .helpers
        .iter()
        .chain(program.suites.iter().flat_map(|suite| suite.helpers.iter()))
        .filter(|function| function.sig.ident != helper.as_str())
        .collect::<Vec<_>>();
    let tests = program
        .suites
        .iter()
        .flat_map(|suite| suite.tests.iter())
        .collect::<Vec<_>>();
    let other_tokens = helper_functions
        .iter()
        .map(|function| function.to_token_stream())
        .chain(tests.iter().map(|test| test.function.to_token_stream()))
        .chain(program.structs.iter().map(ToTokens::to_token_stream))
        .chain(program.constants.iter().map(ToTokens::to_token_stream))
        .collect::<Vec<_>>();
    for tokens in &other_tokens {
        for name in ["Waker", "RawWaker", "Poll", "poll"] {
            if block_on_tokens_name(tokens.clone(), name) {
                return refuse(format!("a file that tests `{name}` behavior"));
            }
        }
    }
    for function in helper_functions {
        if block_on_tokens_name(function.block.to_token_stream(), &helper) {
            return refuse(format!(
                "its use in helper `{}`, where an `await` would escape the test",
                function.sig.ident
            ));
        }
    }
    let shadowed = |name: &str| {
        return program
            .helpers
            .iter()
            .chain(program.suites.iter().flat_map(|suite| suite.helpers.iter()))
            .any(|function| function.sig.ident == name);
    };
    for test in tests {
        if !block_on_tokens_name(test.function.block.to_token_stream(), &helper) {
            continue;
        }
        if test.should_panic {
            return refuse(
                "a `should_panic` test, whose synchronous `toThrow` cannot await".into(),
            );
        }
        let mut uses = BlockOnUses {
            context,
            error: None,
            escaping: 0,
            helper: &helper,
            shadowed: &shadowed,
        };
        uses.visit_block(&test.function.block);
        if let Some(reason) = uses.error {
            return refuse(reason);
        }
    }
    return Ok(Some(helper));
}

// Whether `function` is exactly the canonical noop-waker executor
//
//     fn block_on<F: Future>(future: F) -> F::Output {
//         let mut future = Box::pin(future);
//         let mut context = Context::from_waker(Waker::noop());
//         loop {
//             match future.as_mut().poll(&mut context) {
//                 Poll::Ready(value) => return value,
//                 Poll::Pending => std::thread::yield_now(),
//             }
//         }
//     }
//
// (any name and visibility), which polls its future to completion with no observable effect but
// the future's own. `Future`, `Context`, `Waker` and `Poll` must each be spelled through `std`, or
// imported unrenamed from `std::future`/`std::task` and not redeclared by the file.
fn block_on_helper_is_canonical(function: &ItemFn, program: &TestProgram) -> bool {
    const STANDARD: [(&str, &str); 4] = [
        ("Future", "std :: future :: Future"),
        ("Context", "std :: task :: Context"),
        ("Waker", "std :: task :: Waker"),
        ("Poll", "std :: task :: Poll"),
    ];
    if !function.attrs.is_empty() {
        return false;
    }
    let name = &function.sig.ident;
    let actual = format!(
        "{} {}",
        function.sig.to_token_stream(),
        function.block.to_token_stream()
    );
    let Ok(canonical) = syn::parse_str::<ItemFn>(&format!(
        "fn {name}<F: Future>(future: F) -> F::Output {{ let mut future = Box::pin(future); let mut context = Context::from_waker(Waker::noop()); loop {{ match future.as_mut().poll(&mut context) {{ Poll::Ready(value) => return value, Poll::Pending => std::thread::yield_now(), }} }} }}"
    )) else {
        return false;
    };
    let canonical = format!(
        "{} {}",
        canonical.sig.to_token_stream(),
        canonical.block.to_token_stream()
    );
    let mut normalized = actual.clone();
    for (short, path) in STANDARD {
        normalized = normalized.replace(path, short);
    }
    if normalized != canonical {
        return false;
    }
    let declared = program
        .structs
        .iter()
        .map(|structure| structure.ident.to_string())
        .chain(
            program
                .type_aliases
                .iter()
                .map(|alias| alias.ident.to_string()),
        )
        .chain(
            program
                .helpers
                .iter()
                .map(|helper| helper.sig.ident.to_string()),
        )
        .collect::<HashSet<_>>();
    let imported = program
        .uses
        .iter()
        .flat_map(|item_use| block_on_std_imports(&item_use.tree, &mut Vec::new()))
        .collect::<HashSet<_>>();
    return STANDARD.iter().all(|(short, path)| {
        let unqualified = actual.matches(&format!(" {short} ")).count()
            + usize::from(actual.starts_with(&format!("{short} ")))
            > actual.matches(*path).count();
        return !unqualified
            || (!declared.contains(*short) && imported.contains(&path.replace(" :: ", "::")));
    });
}

// The `std::future`/`std::task` paths a `use` tree imports unrenamed, a glob importing every one.
fn block_on_std_imports(tree: &UseTree, prefix: &mut Vec<String>) -> Vec<String> {
    let module = prefix.join("::");
    let paths = match tree {
        UseTree::Path(path) => {
            prefix.push(path.ident.to_string());
            let paths = block_on_std_imports(&path.tree, prefix);
            prefix.pop();
            paths
        }
        UseTree::Name(name) => vec![format!("{module}::{}", name.ident)],
        UseTree::Glob(_) => ["Future", "Context", "Waker", "Poll"]
            .iter()
            .map(|name| format!("{module}::{name}"))
            .collect(),
        UseTree::Group(group) => group
            .items
            .iter()
            .flat_map(|tree| block_on_std_imports(tree, prefix))
            .collect(),
        UseTree::Rename(_) => Vec::new(),
    };
    return paths
        .into_iter()
        .filter(|path| {
            matches!(
                path.as_str(),
                "std::future::Future"
                    | "std::task::Context"
                    | "std::task::Waker"
                    | "std::task::Poll"
            )
        })
        .collect();
}

// Whether any identifier token in `tokens`, at any group depth, is `name`.
fn block_on_tokens_name(tokens: proc_macro2::TokenStream, name: &str) -> bool {
    return tokens.into_iter().any(|token| match token {
        proc_macro2::TokenTree::Ident(identifier) => identifier == name,
        proc_macro2::TokenTree::Group(group) => block_on_tokens_name(group.stream(), name),
        _ => false,
    });
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
            self.record_identifier_name(identifier.to_string());
        }

        fn record_identifier_name(&mut self, name: String) {
            if !self.declared.contains(&name)
                && !self.helper_names.contains(&name)
                && !self.standard_constants.contains(&name)
                // `std::panic` names that the panic-message assertion lowering consumes.
                && !matches!(
                    name.as_str(),
                    "None" | "Some" | "drop" | "AssertUnwindSafe" | "catch_unwind" | "get_entity_id"
                )
                && !is_lowered_cross_crate_value(&name)
                && !self.symbols.contains(&name)
            {
                self.symbols.push(name);
            }
        }

        fn record_type_identifier(&mut self, identifier: &syn::Ident) {
            self.record_type_name(identifier.to_string());
        }

        fn record_type_name(&mut self, name: String) {
            let name = emit_type(
                &syn::parse_str::<syn::Type>(&name).expect("identifier is a type"),
                self.context,
            )
            .expect("a named type can be emitted");
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
            // Rust function items are in scope throughout their block, including before the item.
            // Record all of them before walking any expression so they are never mistaken for
            // package-contract imports.
            self.declared.extend(block.stmts.iter().filter_map(|statement| {
                let Stmt::Item(syn::Item::Fn(function)) = statement else {
                    return None;
                };
                Some(function.sig.ident.to_string())
            }));
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

        fn visit_item_fn(&mut self, function: &'ast ItemFn) {
            let outer = self.declared.clone();
            self.declared.insert(function.sig.ident.to_string());
            self.declared.extend(
                function
                    .sig
                    .generics
                    .type_params()
                    .map(|parameter| parameter.ident.to_string()),
            );
            for argument in &function.sig.inputs {
                if let FnArg::Typed(argument) = argument {
                    self.declared.extend(pattern_names(&argument.pat));
                }
            }
            self.visit_signature(&function.sig);
            self.visit_block(&function.block);
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
                    && let Ok(Some(name)) =
                        vitest_function_path_binding_name(&expression.path, self.context)
                    && is_vitest_function(self.context, &name)
                {
                    self.record_identifier_name(name);
                }
                // A qualified string-union variant lowers to its literal, so it names no module.
                let string_union_variant = segments.len() > 2
                    && is_string_union(
                        self.context,
                        &segments[segments.len() - 2].ident.to_string(),
                    );
                if segments.len() > 1
                    && !string_union_variant
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
                    && !is_lowered_cross_crate_value(&segment.ident.to_string())
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
                && let Ok(Some(name)) =
                    vitest_struct_path_binding_name(&expression.path, self.context)
                && is_vitest_struct(self.context, &name)
            {
                self.record_type_name(name);
            }
            syn::visit::visit_expr_struct(self, expression);
        }

        fn visit_type_path(&mut self, rust_type: &'ast syn::TypePath) {
            if rust_type.qself.is_none()
                && let Some(first) = rust_type.path.segments.first()
            {
                if rust_type.path.segments.len() > 1
                    && let Ok(Some(name)) =
                        vitest_struct_path_binding_name(&rust_type.path, self.context)
                    && is_vitest_struct(self.context, &name)
                {
                    self.record_type_name(name);
                }
                if rust_type.path.segments.len() > 1 {
                    self.record_external_module(&first.ident);
                }
                if first
                    .ident
                    .to_string()
                    .chars()
                    .next()
                    .is_some_and(|character| character.is_ascii_uppercase())
                    && !is_lowered_cross_crate_type(&first.ident.to_string())
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
        // The proven `block_on` executor has no TypeScript body, so it imports nothing.
        .filter(|helper| {
            !context.contains(&format!("{BLOCK_ON_HELPER_MARKER}{}", helper.sig.ident))
        })
        .chain(program.suites.iter().flat_map(|suite| {
            suite
                .helpers
                .iter()
                .chain(suite.tests.iter().map(|test| &test.function))
        }))
    {
        let mut declared = collect_declared_names(function);
        // A helper's own type parameters are declared by its signature, not imported from the contract.
        declared.extend(
            function
                .sig
                .generics
                .type_params()
                .map(|parameter| parameter.ident.to_string()),
        );
        let mut collector = ContractSymbolCollector {
            declared,
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
    symbols.sort_by_key(|symbol| emit_path_name(symbol, context));
    symbols.dedup();
    type_symbols.sort_by_key(|symbol| emit_path_name(symbol, context));
    type_symbols.dedup();
    type_symbols.retain(|symbol| !symbols.contains(symbol));
    external_modules.sort();
    external_modules.dedup();
    return (symbols, type_symbols, external_modules);
}

fn crate_local_wildcard_module(item_use: &ItemUse) -> Option<String> {
    fn collect(tree: &UseTree, path: &mut Vec<String>) -> Option<String> {
        return match tree {
            UseTree::Path(segment) => {
                path.push(segment.ident.to_string());
                let module = collect(&segment.tree, path);
                path.pop();
                module
            }
            UseTree::Glob(_)
                if path.first().is_some_and(|root| root == "crate") && path.len() > 1 =>
            {
                Some(path[1..].join("::"))
            }
            UseTree::Glob(_) | UseTree::Group(_) | UseTree::Name(_) | UseTree::Rename(_) => None,
        };
    }

    return collect(&item_use.tree, &mut Vec::new());
}

fn explicit_import_names<'a>(uses: impl Iterator<Item = &'a ItemUse>) -> BTreeSet<String> {
    fn collect(tree: &UseTree, names: &mut BTreeSet<String>) {
        match tree {
            UseTree::Name(name) if name.ident != "self" => {
                names.insert(name.ident.to_string());
            }
            UseTree::Rename(rename) => {
                names.insert(rename.rename.to_string());
            }
            UseTree::Path(path) => collect(&path.tree, names),
            UseTree::Group(group) => {
                for tree in &group.items {
                    collect(tree, names);
                }
            }
            UseTree::Glob(_) | UseTree::Name(_) => {}
        }
    }

    let mut names = BTreeSet::new();
    for item_use in uses {
        collect(&item_use.tree, &mut names);
    }
    return names;
}

// Records the production `async fn`s a portable test may await through a proven `block_on`
// executor, and which of them resolve to `Result<T, FlightError>` (directly or through a type alias
// any source declares), which a test must not await.
pub(crate) fn insert_async_function_context<'a>(
    context: &mut HashSet<String>,
    production: impl Iterator<Item = &'a Program> + Clone,
) {
    let flight_error_result = |rust_type: &Type| {
        let Type::Path(path) = rust_type else {
            return false;
        };
        let Some(segment) = path.path.segments.last() else {
            return false;
        };
        let syn::PathArguments::AngleBracketed(arguments) = &segment.arguments else {
            return false;
        };
        return segment.ident == "Result"
            && arguments.args.len() == 2
            && matches!(&arguments.args[1], syn::GenericArgument::Type(Type::Path(error))
                if error.path.segments.last().is_some_and(|segment| segment.ident == "FlightError"));
    };
    let result_aliases = production
        .clone()
        .flat_map(|program| &program.type_aliases)
        .filter(|alias| alias.generics.params.is_empty() && flight_error_result(&alias.ty))
        .map(|alias| alias.ident.to_string())
        .collect::<HashSet<_>>();
    for function in production.flat_map(|program| &program.functions) {
        if function.sig.asyncness.is_none() {
            continue;
        }
        let name = &function.sig.ident;
        context.insert(format!("{ASYNC_FUNCTION_MARKER}{name}"));
        if let ReturnType::Type(_, rust_type) = &function.sig.output
            && (flight_error_result(rust_type)
                || matches!(rust_type.as_ref(), Type::Path(path)
                    if path.path.get_ident().is_some_and(|alias| result_aliases.contains(&alias.to_string()))))
        {
            context.insert(format!("{ASYNC_RESULT_FUNCTION_MARKER}{name}"));
        }
    }
}

// Whether a parameter type formats identically under Rust `Display` and a JavaScript template:
// a string (`&str`, `String`, `&String`) or an integer no wider than 32 bits.
fn panic_display_parameter(rust_type: &Type) -> bool {
    let rust_type = match rust_type {
        Type::Reference(reference) if reference.mutability.is_none() => reference.elem.as_ref(),
        rust_type => rust_type,
    };
    let Type::Path(path) = rust_type else {
        return false;
    };
    if path.qself.is_some() || path.path.segments.len() != 1 {
        return false;
    }
    let segment = &path.path.segments[0];
    return segment.arguments.is_empty()
        && matches!(
            segment.ident.to_string().as_str(),
            "String" | "i8" | "i16" | "i32" | "str" | "u8" | "u16" | "u32"
        );
}

// Whether a macro is the standard `panic!` (`panic!`, `std::panic!` or `core::panic!`).
fn panic_macro_is_std(rust_macro: &syn::Macro) -> bool {
    let segments = rust_macro
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    return rust_macro.path.leading_colon.is_none()
        && matches!(
            segments
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                .as_slice(),
            ["panic"] | ["std" | "core", "panic"]
        );
}

// Proves a `panic!` message renders exactly as Rust would: no arguments (`explicit panic`), or a
// string literal whose placeholders are bare `{}` or `{name}` (no format specifier, positional
// index or named argument) filled only by string literals or by `Display`-faithful parameters, each
// evaluated once in order.
fn panic_message_is_representable(
    rust_macro: &syn::Macro,
    parameters: &BTreeSet<String>,
) -> Result<(), CompileError> {
    let refuse = |reason: &str| {
        return Err(compile_error(format!(
            "portable test `panic!` refuses {reason}: its message would not render exactly as Rust formats it"
        )));
    };
    let arguments = parse_macro_arguments(rust_macro)?;
    let Some(first) = arguments.first() else {
        return Ok(());
    };
    let Some(template) = string_literal_value(first) else {
        return refuse("a non-literal or `Any` payload");
    };
    let value_is_faithful = |value: &Expr| match unparenthesized(value) {
        Expr::Lit(literal) => matches!(literal.lit, syn::Lit::Str(_)),
        Expr::Path(path) => path
            .path
            .get_ident()
            .is_some_and(|name| parameters.contains(&name.to_string())),
        _ => false,
    };
    let mut positional = 0;
    let mut characters = template.chars().peekable();
    while let Some(character) = characters.next() {
        match character {
            '{' if characters.peek() == Some(&'{') => {
                characters.next();
            }
            '}' if characters.peek() == Some(&'}') => {
                characters.next();
            }
            '{' => {
                let mut placeholder = String::new();
                loop {
                    match characters.next() {
                        Some('}') => break,
                        Some(character) => placeholder.push(character),
                        None => return refuse("an unterminated placeholder"),
                    }
                }
                if placeholder.is_empty() {
                    positional += 1;
                } else if syn::parse_str::<syn::Ident>(&placeholder).is_err()
                    || !parameters.contains(&placeholder)
                {
                    return refuse(&format!("the placeholder `{{{placeholder}}}`"));
                }
            }
            '}' => return refuse("an unmatched `}`"),
            _ => {}
        }
    }
    let values = arguments.iter().skip(1).collect::<Vec<_>>();
    if values.len() != positional {
        return refuse("formatting values that do not match its placeholders");
    }
    if !values.iter().all(|value| value_is_faithful(value)) {
        return refuse(
            "a formatting value other than a string literal or a string or 32-bit integer parameter",
        );
    }
    return Ok(());
}

// The `panic!` statements the portable test emitter itself reaches: those of the function body and
// of its `if`/`else`, plain-block and loop bodies. A panic in expression position (a closure, a
// `match` arm, a `let`-`else` block) keeps the expression lowering it already had.
fn panic_statement_reached(statements: &[Stmt]) -> bool {
    return statements.iter().any(|statement| match statement {
        Stmt::Macro(statement) => panic_macro_is_std(&statement.mac),
        Stmt::Expr(Expr::If(branch), _) => {
            let mut branch = branch;
            loop {
                if panic_statement_reached(&branch.then_branch.stmts) {
                    return true;
                }
                match branch
                    .else_branch
                    .as_ref()
                    .map(|(_, otherwise)| otherwise.as_ref())
                {
                    Some(Expr::If(next)) => branch = next,
                    Some(Expr::Block(otherwise)) => {
                        return panic_statement_reached(&otherwise.block.stmts);
                    }
                    _ => return false,
                }
            }
        }
        Stmt::Expr(Expr::Block(block), _) => panic_statement_reached(&block.block.stmts),
        Stmt::Expr(Expr::ForLoop(body), _) => panic_statement_reached(&body.body.stmts),
        Stmt::Expr(Expr::Loop(body), _) => panic_statement_reached(&body.body.stmts),
        Stmt::Expr(Expr::While(body), _) => panic_statement_reached(&body.body.stmts),
        _ => false,
    });
}

// Proves every `panic!` statement the portable test emitter reaches (see `panic_statement_reached`)
// is an explicit throw TypeScript reproduces faithfully: reached only through `if`/`else` and plain
// blocks of a synchronous function, never from a loop; with no `let` or `if let` binding in scope
// and no by-value lock or borrow guard parameter, so no Rust unwind drop (or mutex poisoning) is
// observable; and with a representable message (see `panic_message_is_representable`). Such a panic
// was previously refused outright, so this proof only admits statements, never retracts one.
fn panic_statements_are_proven(function: &ItemFn) -> Result<(), CompileError> {
    if !panic_statement_reached(&function.block.stmts) {
        return Ok(());
    }
    let name = &function.sig.ident;
    if function.sig.asyncness.is_some() {
        return Err(compile_error(format!(
            "portable test `panic!` in async `{name}` is not an immediate throw"
        )));
    }
    let mut parameters = BTreeSet::new();
    for argument in &function.sig.inputs {
        let FnArg::Typed(argument) = argument else {
            continue;
        };
        if !matches!(argument.ty.as_ref(), Type::Reference(_))
            && argument.ty.to_token_stream().into_iter().any(|token| {
                matches!(&token, proc_macro2::TokenTree::Ident(identifier)
                    if identifier.to_string().ends_with("Guard") || *identifier == "RefMut")
            })
        {
            return Err(compile_error(format!(
                "portable test `panic!` in `{name}` would unwind a by-value guard parameter, whose drop TypeScript does not reproduce"
            )));
        }
        if let Pat::Ident(identifier) = argument.pat.as_ref()
            && panic_display_parameter(&argument.ty)
        {
            parameters.insert(identifier.ident.to_string());
        }
    }
    return panic_statements_in_block(&function.block.stmts, false, &parameters, name);
}

fn panic_statements_in_block(
    statements: &[Stmt],
    mut locals_in_scope: bool,
    parameters: &BTreeSet<String>,
    function: &syn::Ident,
) -> Result<(), CompileError> {
    for statement in statements {
        match statement {
            Stmt::Macro(statement) if panic_macro_is_std(&statement.mac) => {
                if locals_in_scope {
                    return Err(compile_error(format!(
                        "portable test `panic!` in `{function}` would unwind live locals, whose drop TypeScript does not reproduce"
                    )));
                }
                panic_message_is_representable(&statement.mac, parameters)?;
            }
            Stmt::Expr(Expr::If(branch), _) => {
                panic_statements_in_if(branch, locals_in_scope, parameters, function)?;
            }
            Stmt::Expr(Expr::Block(block), _) => {
                panic_statements_in_block(
                    &block.block.stmts,
                    locals_in_scope,
                    parameters,
                    function,
                )?;
            }
            Stmt::Expr(Expr::ForLoop(_) | Expr::Loop(_) | Expr::While(_), _)
                if panic_statement_reached(std::slice::from_ref(statement)) =>
            {
                return Err(compile_error(format!(
                    "portable test `panic!` in `{function}` is inside a loop, whose control flow it would escape"
                )));
            }
            Stmt::Local(_) => locals_in_scope = true,
            _ => {}
        }
    }
    return Ok(());
}

fn panic_statements_in_if(
    branch: &syn::ExprIf,
    locals_in_scope: bool,
    parameters: &BTreeSet<String>,
    function: &syn::Ident,
) -> Result<(), CompileError> {
    // An `if let` binds its pattern for the `then` branch.
    let binds = matches!(branch.cond.as_ref(), Expr::Let(_));
    panic_statements_in_block(
        &branch.then_branch.stmts,
        locals_in_scope || binds,
        parameters,
        function,
    )?;
    return match branch
        .else_branch
        .as_ref()
        .map(|(_, otherwise)| otherwise.as_ref())
    {
        Some(Expr::If(next)) => panic_statements_in_if(next, locals_in_scope, parameters, function),
        Some(Expr::Block(otherwise)) => panic_statements_in_block(
            &otherwise.block.stmts,
            locals_in_scope,
            parameters,
            function,
        ),
        _ => Ok(()),
    };
}

fn test_support_item_is_visible(visibility: &syn::Visibility) -> bool {
    return !matches!(visibility, syn::Visibility::Inherited);
}

/// Resolves an explicitly-owned `crate::<module>::*` test-support import into only the helpers the
/// portable test actually reads. The ordinary contract-symbol collector supplies lexical shadowing:
/// parameters, locals, closures, patterns, and test-local helpers never become support candidates.
pub(crate) fn resolve_test_support_wildcards(
    program: &mut TestProgram,
    support_sources: &[(&str, &Program)],
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    let mut sources = BTreeMap::new();
    for (module, support) in support_sources {
        if module.is_empty()
            || module
                .split("::")
                .any(|segment| syn::parse_str::<syn::Ident>(segment).is_err())
        {
            return Err(compile_error(format!(
                "portable test-support module owner `{module}` is not a valid crate-local module path"
            )));
        }
        if sources.insert((*module).to_string(), *support).is_some() {
            return Err(compile_error(format!(
                "portable test-support module `{module}` has more than one explicit source owner"
            )));
        }
    }
    if sources.is_empty() {
        return Ok(());
    }

    let test_uses = program
        .uses
        .iter()
        .chain(program.suites.iter().flat_map(|suite| &suite.uses))
        .collect::<Vec<_>>();
    let active_modules = test_uses
        .iter()
        .filter_map(|item_use| crate_local_wildcard_module(item_use))
        .filter(|module| sources.contains_key(module))
        .collect::<BTreeSet<_>>();
    if active_modules.is_empty() {
        return Ok(());
    }

    let explicit_names = explicit_import_names(test_uses.iter().copied());
    let mut foreign_wildcards = BTreeSet::new();
    for rule in provenance_import_rules(test_uses.iter().copied(), None) {
        let ProvenanceImportRule::Wildcard { module } = rule else {
            continue;
        };
        if active_modules.contains(&module) {
            continue;
        }
        let root = module.split("::").next().unwrap_or_default();
        if vitest_current_path_prefix(context, root).is_none() {
            foreign_wildcards.insert(root.to_string());
        }
    }

    let mut value_items = BTreeMap::<String, Vec<(String, TestSupportValue)>>::new();
    let mut type_items = BTreeMap::<String, Vec<(String, TestSupportType)>>::new();
    for module in &active_modules {
        let support = sources
            .get(module)
            .expect("an active support module has an explicit source owner");
        for function in &support.functions {
            if test_support_item_is_visible(&function.vis) {
                value_items
                    .entry(function.sig.ident.to_string())
                    .or_default()
                    .push((module.clone(), TestSupportValue::Function(function.clone())));
            }
        }
        for constant in &support.constants {
            if test_support_item_is_visible(&constant.vis) {
                value_items
                    .entry(constant.ident.to_string())
                    .or_default()
                    .push((module.clone(), TestSupportValue::Constant(constant.clone())));
            }
        }
        for structure in &support.structs {
            if test_support_item_is_visible(&structure.vis) {
                type_items
                    .entry(structure.ident.to_string())
                    .or_default()
                    .push((
                        module.clone(),
                        TestSupportType::Structure(structure.clone()),
                    ));
            }
        }
        for type_alias in &support.type_aliases {
            if test_support_item_is_visible(&type_alias.vis) {
                type_items
                    .entry(type_alias.ident.to_string())
                    .or_default()
                    .push((module.clone(), TestSupportType::Alias(type_alias.clone())));
            }
        }
        for rust_enum in &support.enums {
            if test_support_item_is_visible(&rust_enum.vis) {
                type_items
                    .entry(rust_enum.ident.to_string())
                    .or_default()
                    .push((module.clone(), TestSupportType::UnsupportedEnum));
            }
        }
    }

    let mut selected_values = BTreeSet::new();
    let mut selected_types = BTreeSet::new();
    let mut selected_modules = BTreeSet::new();
    loop {
        let (referenced_values, referenced_types, _) = collect_contract_symbols(program, context);
        let mut changed = false;
        for name in referenced_values {
            if explicit_names.contains(&name) || selected_values.contains(&name) {
                continue;
            }
            let Some(candidates) = value_items.get(&name) else {
                continue;
            };
            if is_vitest_own_public(context, &name) || candidates.len() != 1 {
                let owners = candidates
                    .iter()
                    .map(|(module, _)| module.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                return Err(compile_error(format!(
                    "portable test-support value `{name}` is ambiguous between crate contract or support owners {owners}; import it explicitly"
                )));
            }
            if !foreign_wildcards.is_empty() {
                return Err(compile_error(format!(
                    "portable test-support value `{name}` is ambiguous with foreign wildcard crates {}; import the used items explicitly",
                    foreign_wildcards
                        .iter()
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(", ")
                )));
            }
            let (module, item) = &candidates[0];
            match item {
                TestSupportValue::Function(function) => program.helpers.push(function.clone()),
                TestSupportValue::Constant(constant) => program.constants.push(constant.clone()),
            }
            selected_values.insert(name);
            selected_modules.insert(module.clone());
            changed = true;
        }
        for name in referenced_types {
            if explicit_names.contains(&name) || selected_types.contains(&name) {
                continue;
            }
            let Some(candidates) = type_items.get(&name) else {
                continue;
            };
            if is_vitest_own_public(context, &name) || candidates.len() != 1 {
                let owners = candidates
                    .iter()
                    .map(|(module, _)| module.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                return Err(compile_error(format!(
                    "portable test-support type `{name}` is ambiguous between crate contract or support owners {owners}; import it explicitly"
                )));
            }
            if !foreign_wildcards.is_empty() {
                return Err(compile_error(format!(
                    "portable test-support type `{name}` is ambiguous with foreign wildcard crates {}; import the used items explicitly",
                    foreign_wildcards
                        .iter()
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(", ")
                )));
            }
            let (module, item) = &candidates[0];
            match item {
                TestSupportType::Structure(structure) => program.structs.push(structure.clone()),
                TestSupportType::Alias(type_alias) => program.type_aliases.push(type_alias.clone()),
                TestSupportType::UnsupportedEnum => {
                    return Err(compile_error(format!(
                        "portable test-support enum `{name}` cannot be emitted as a local test helper type"
                    )));
                }
            }
            selected_types.insert(name);
            selected_modules.insert(module.clone());
            changed = true;
        }
        if !changed {
            break;
        }
    }

    program.uses.retain(|item_use| {
        crate_local_wildcard_module(item_use).is_none_or(|module| !active_modules.contains(&module))
    });
    for suite in &mut program.suites {
        suite.uses.retain(|item_use| {
            crate_local_wildcard_module(item_use)
                .is_none_or(|module| !active_modules.contains(&module))
        });
    }
    for module in selected_modules {
        let support = sources
            .get(&module)
            .expect("a selected support module has an explicit source owner");
        program.uses.extend(support.uses.iter().cloned());
    }
    return Ok(());
}

#[derive(Clone)]
enum TestSupportValue {
    Constant(syn::ItemConst),
    Function(ItemFn),
}

#[derive(Clone)]
enum TestSupportType {
    Alias(syn::ItemType),
    Structure(syn::ItemStruct),
    UnsupportedEnum,
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
    if matches!(name.as_str(), "assert_eq" | "assert_ne")
        && arguments.len() >= 2
        && let (Some(left), Some(right)) = (
            entity_identity_operand(&arguments[0], context),
            entity_identity_operand(&arguments[1], context),
        )
    {
        // Entity ids are allocation identity, which TypeScript compares by reference.
        let matcher = if name == "assert_eq" {
            "toBe"
        } else {
            "not.toBe"
        };
        let left = emit_expression(left, context)?;
        let right = emit_expression(right, context)?;
        write_indent(out, indent);
        match assertion_message(&arguments, &name, context)? {
            Some(message) => writeln!(out, "expect({left}, {message}).{matcher}({right});"),
            None => writeln!(out, "expect({left}).{matcher}({right});"),
        }
        .expect("writing to a String cannot fail");
        return Ok(());
    }
    if name == "assert"
        && let Some(closure) = arguments.first().and_then(caught_panic_is_err)
    {
        return emit_panic_assertion(
            out,
            &PanicAssertion {
                assertion: Some(rust_macro),
                closure,
                exact: false,
                expect_message: None,
                flight_error: None,
                length: 1,
                needle: None,
            },
            context,
            indent,
        );
    }
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
    // Comparing `.as_ptr()` compares buffer identity, not contents: a clone has equal contents at
    // a different address.
    let matcher = match name.as_str() {
        "assert_eq" if arguments.iter().take(2).any(expression_is_as_ptr) => "toBe",
        "assert_ne" if arguments.iter().take(2).any(expression_is_as_ptr) => "not.toBe",
        _ => matcher,
    };
    if matches!(name.as_str(), "assert_eq" | "assert_ne") && arguments.len() >= 2 {
        // A literal `None` compares as the absent value of the other operand: `null` for a
        // `nullable-option` return or field, `undefined` otherwise.
        if crate::typescript::expression_is_path(unparenthesized(&arguments[1]), "None") {
            expected = crate::typescript::option_absent_value(&arguments[0], context).to_string();
        }
        if crate::typescript::expression_is_path(unparenthesized(&arguments[0]), "None") {
            actual = crate::typescript::option_absent_value(&arguments[1], context).to_string();
        }
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

fn expression_is_as_ptr(expression: &Expr) -> bool {
    return matches!(unparenthesized(expression), Expr::MethodCall(call)
        if call.method == "as_ptr" && call.args.is_empty());
}

// Proves the one mutable-reference shape whose aliasing TypeScript can reproduce for portable
// tests: a nested helper's sole `&mut` parameter is an exact representable scalar, and every call
// passes one directly named mutable local. The local becomes one `{ value: T }` cell; ordinary reads
// and writes use `.value`, while the call passes the cell itself. Any shape that could create a
// second live alias or let the reference escape fails before emission.
fn insert_vitest_mutable_scalar_cell_context(
    statements: &[Stmt],
    context: &mut HashSet<String>,
) -> Result<(), CompileError> {
    #[derive(Clone)]
    struct Candidate {
        index: usize,
        parameter: String,
        scalar: &'static str,
    }

    fn direct_path_name(expression: &Expr) -> Option<String> {
        let Expr::Path(path) = unparenthesized(expression) else {
            return None;
        };
        if path.qself.is_some()
            || path.path.leading_colon.is_some()
            || path.path.segments.len() != 1
        {
            return None;
        }
        return path.path
            .segments
            .first()
            .map(|segment| segment.ident.to_string());
    }

    fn expression_mentions(expression: &Expr, name: &str) -> bool {
        struct Finder<'a> {
            found: bool,
            name: &'a str,
        }
        impl<'ast> Visit<'ast> for Finder<'_> {
            fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
                if path.qself.is_none()
                    && path.path.is_ident(self.name)
                {
                    self.found = true;
                    return;
                }
                syn::visit::visit_expr_path(self, path);
            }
            fn visit_item(&mut self, _: &'ast syn::Item) {}
        }
        let mut finder = Finder { found: false, name };
        finder.visit_expr(expression);
        return finder.found;
    }

    fn local_scalar(local: &syn::Local) -> Option<(String, &'static str)> {
        let (pattern, declared) = match &local.pat {
            Pat::Ident(pattern) => (pattern, None),
            Pat::Type(typed) => {
                let Pat::Ident(pattern) = typed.pat.as_ref() else {
                    return None;
                };
                (pattern, exact_portable_scalar_type(&typed.ty))
            }
            _ => return None,
        };
        pattern.mutability?;
        if pattern.subpat.is_some() {
            return None;
        }
        let initializer = local.init.as_ref()?;
        if initializer.diverge.is_some() {
            return None;
        }
        let inferred = match unparenthesized(&initializer.expr) {
            Expr::Lit(literal) => match &literal.lit {
                syn::Lit::Bool(_) => Some("bool"),
                syn::Lit::Float(value) => {
                    let suffix = value.suffix();
                    (!suffix.is_empty())
                        .then(|| syn::parse_str::<Type>(suffix).ok())
                        .flatten()
                        .and_then(|rust_type| exact_portable_scalar_type(&rust_type))
                }
                syn::Lit::Int(value) => {
                    let suffix = value.suffix();
                    (!suffix.is_empty())
                        .then(|| syn::parse_str::<Type>(suffix).ok())
                        .flatten()
                        .and_then(|rust_type| exact_portable_scalar_type(&rust_type))
                }
                _ => None,
            },
            Expr::Cast(cast) => exact_portable_scalar_type(&cast.ty),
            _ => None,
        };
        let scalar = match (declared, inferred) {
            (Some(declared), Some(inferred)) if declared != inferred => return None,
            (Some(declared), _) => declared,
            (None, Some(inferred)) => inferred,
            (None, None) => return None,
        };
        return Some((pattern.ident.to_string(), scalar));
    }

    fn parameter_use_error(function: &ItemFn, parameter: &str) -> Option<&'static str> {
        struct Proof<'a> {
            error: Option<&'static str>,
            parameter: &'a str,
        }
        impl<'ast> Visit<'ast> for Proof<'_> {
            fn visit_expr_async(&mut self, expression: &'ast syn::ExprAsync) {
                if expression_mentions(&Expr::Async(expression.clone()), self.parameter) {
                    self.error = Some("async block capture");
                }
            }

            fn visit_expr_closure(&mut self, expression: &'ast syn::ExprClosure) {
                if expression_mentions(&Expr::Closure(expression.clone()), self.parameter) {
                    self.error = Some("closure capture");
                }
            }

            fn visit_expr_method_call(&mut self, call: &'ast syn::ExprMethodCall) {
                if direct_path_name(&call.receiver).as_deref() == Some(self.parameter) {
                    for argument in &call.args {
                        self.visit_expr(argument);
                    }
                    return;
                }
                syn::visit::visit_expr_method_call(self, call);
            }

            fn visit_expr_reference(&mut self, reference: &'ast syn::ExprReference) {
                if expression_mentions(&reference.expr, self.parameter) {
                    self.error = Some("reborrow");
                    return;
                }
                syn::visit::visit_expr_reference(self, reference);
            }

            fn visit_expr_unary(&mut self, unary: &'ast syn::ExprUnary) {
                if matches!(unary.op, syn::UnOp::Deref(_))
                    && direct_path_name(&unary.expr).as_deref() == Some(self.parameter)
                {
                    return;
                }
                syn::visit::visit_expr_unary(self, unary);
            }

            fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
                if path.qself.is_none() && path.path.is_ident(self.parameter) {
                    self.error = Some("escaping or stored reference");
                    return;
                }
                syn::visit::visit_expr_path(self, path);
            }

            fn visit_item(&mut self, _: &'ast syn::Item) {}

            fn visit_macro(&mut self, rust_macro: &'ast syn::Macro) {
                if let Ok(arguments) = parse_macro_arguments(rust_macro) {
                    for argument in &arguments {
                        self.visit_expr(argument);
                    }
                }
            }
        }
        let mut proof = Proof {
            error: None,
            parameter,
        };
        proof.visit_block(&function.block);
        return proof.error;
    }

    fn dereferences_parameter(function: &ItemFn, parameter: &str) -> bool {
        struct Finder<'a> {
            found: bool,
            parameter: &'a str,
        }
        impl<'ast> Visit<'ast> for Finder<'_> {
            fn visit_expr_unary(&mut self, unary: &'ast syn::ExprUnary) {
                if matches!(unary.op, syn::UnOp::Deref(_))
                    && direct_path_name(&unary.expr).as_deref() == Some(self.parameter)
                {
                    self.found = true;
                    return;
                }
                syn::visit::visit_expr_unary(self, unary);
            }
            fn visit_item(&mut self, _: &'ast syn::Item) {}
        }
        let mut finder = Finder {
            found: false,
            parameter,
        };
        finder.visit_block(&function.block);
        return finder.found;
    }

    let functions = statements
        .iter()
        .filter_map(|statement| match statement {
            Stmt::Item(syn::Item::Fn(function)) => Some(function),
            _ => None,
        })
        .collect::<Vec<_>>();
    let mut candidates = BTreeMap::<String, Candidate>::new();
    for function in &functions {
        let mutable_references = function
            .sig
            .inputs
            .iter()
            .enumerate()
            .filter_map(|(index, argument)| {
                let FnArg::Typed(argument) = argument else {
                    return None;
                };
                let Type::Reference(reference) = argument.ty.as_ref() else {
                    return None;
                };
                reference.mutability.map(|_| (index, argument, reference))
            })
            .collect::<Vec<_>>();
        let scalar_references = mutable_references
            .iter()
            .filter_map(|(index, argument, _)| {
                let scalar = exact_mutable_scalar_reference(&argument.ty)?;
                let Pat::Ident(pattern) = argument.pat.as_ref() else {
                    return None;
                };
                (pattern.subpat.is_none()).then(|| Candidate {
                    index: *index,
                    parameter: pattern.ident.to_string(),
                    scalar,
                })
            })
            .collect::<Vec<_>>();
        if scalar_references.is_empty() {
            for (_, argument, _) in mutable_references {
                let Some(parameter) = pattern_names(&argument.pat).into_iter().next() else {
                    continue;
                };
                if dereferences_parameter(function, &parameter) {
                    return Err(compile_error(format!(
                        "portable nested function `{}` dereferences mutable parameter `{parameter}` whose exact scalar type is ambiguous or custom",
                        function.sig.ident
                    )));
                }
            }
            continue;
        }
        if mutable_references.len() != 1 || scalar_references.len() != 1 {
            return Err(compile_error(format!(
                "portable nested function `{}` cannot lower multiple mutable-reference aliases",
                function.sig.ident
            )));
        }
        let candidate = scalar_references.into_iter().next().expect("one candidate");
        if let Some(reason) = parameter_use_error(function, &candidate.parameter) {
            return Err(compile_error(format!(
                "portable nested function `{}` mutable scalar parameter `{}` has unsupported {reason}",
                function.sig.ident, candidate.parameter
            )));
        }
        candidates.insert(function.sig.ident.to_string(), candidate);
    }
    if candidates.is_empty() {
        return Ok(());
    }

    let locals = statements
        .iter()
        .filter_map(|statement| {
            let Stmt::Local(local) = statement else {
                return None;
            };
            let (name, scalar) = local_scalar(local)?;
            let id = local_pattern_binding_id(context, &local.pat)?;
            Some((name, (scalar, id)))
        })
        .collect::<BTreeMap<_, _>>();

    struct CallProof<'a> {
        calls: Vec<(String, String)>,
        candidates: &'a BTreeMap<String, Candidate>,
        closure_depth: usize,
        errors: Vec<String>,
        forbidden_borrows: BTreeSet<String>,
        captured: BTreeSet<String>,
        local_names: BTreeSet<String>,
        shadow_counts: BTreeMap<String, usize>,
    }
    impl<'ast> Visit<'ast> for CallProof<'_> {
        fn visit_expr_async(&mut self, expression: &'ast syn::ExprAsync) {
            self.closure_depth += 1;
            syn::visit::visit_expr_async(self, expression);
            self.closure_depth -= 1;
        }

        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            let helper = direct_path_name(&call.func);
            let candidate = helper
                .as_ref()
                .and_then(|helper| self.candidates.get(helper));
            if let (Some(helper), Some(candidate)) = (helper, candidate) {
                let Some(argument) = call.args.get(candidate.index) else {
                    self.errors.push(format!(
                        "portable mutable scalar cell call `{helper}` is missing argument {}",
                        candidate.index
                    ));
                    return;
                };
                let Expr::Reference(reference) = unparenthesized(argument) else {
                    self.errors.push(format!(
                        "portable mutable scalar cell call `{helper}` requires a direct `&mut local` argument"
                    ));
                    return;
                };
                let Some(local) = reference
                    .mutability
                    .and_then(|_| direct_path_name(&reference.expr))
                else {
                    self.errors.push(format!(
                        "portable mutable scalar cell call `{helper}` refuses borrowed fields or elements, reborrows, and non-local arguments"
                    ));
                    return;
                };
                if self.closure_depth > 0 {
                    self.captured.insert(local.clone());
                }
                self.calls.push((helper, local));
                for (index, argument) in call.args.iter().enumerate() {
                    if index != candidate.index {
                        self.visit_expr(argument);
                    }
                }
                return;
            }
            syn::visit::visit_expr_call(self, call);
        }

        fn visit_expr_closure(&mut self, expression: &'ast syn::ExprClosure) {
            self.closure_depth += 1;
            syn::visit::visit_expr_closure(self, expression);
            self.closure_depth -= 1;
        }

        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if self.closure_depth > 0
                && path.qself.is_none()
                && let Some(name) = path.path.get_ident()
                && self.local_names.contains(&name.to_string())
            {
                self.captured.insert(name.to_string());
            }
            syn::visit::visit_expr_path(self, path);
        }

        fn visit_expr_reference(&mut self, reference: &'ast syn::ExprReference) {
            if reference.mutability.is_some()
                && let Some(name) = direct_path_name(&reference.expr)
                && self.local_names.contains(&name)
            {
                self.forbidden_borrows.insert(name);
            }
            syn::visit::visit_expr_reference(self, reference);
        }

        fn visit_item_fn(&mut self, _: &'ast ItemFn) {}

        fn visit_macro(&mut self, rust_macro: &'ast syn::Macro) {
            if let Ok(arguments) = parse_macro_arguments(rust_macro) {
                for argument in &arguments {
                    self.visit_expr(argument);
                }
            }
        }

        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            let name = pattern.ident.to_string();
            if self.local_names.contains(&name) {
                *self.shadow_counts.entry(name).or_insert(0) += 1;
            }
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut proof = CallProof {
        calls: Vec::new(),
        candidates: &candidates,
        closure_depth: 0,
        errors: Vec::new(),
        forbidden_borrows: BTreeSet::new(),
        captured: BTreeSet::new(),
        local_names: locals.keys().cloned().collect(),
        shadow_counts: BTreeMap::new(),
    };
    for statement in statements {
        proof.visit_stmt(statement);
    }
    if let Some(error) = proof.errors.into_iter().next() {
        return Err(compile_error(error));
    }

    let mut used_helpers = BTreeSet::new();
    let mut used_locals = BTreeSet::new();
    for (helper, local) in proof.calls {
        let candidate = candidates.get(&helper).expect("recorded candidate");
        let Some((scalar, _)) = locals.get(&local) else {
            return Err(compile_error(format!(
                "portable mutable scalar cell call `{helper}` requires `{local}` to be one directly declared mutable local with an explicit or suffixed exact scalar type"
            )));
        };
        if scalar != &candidate.scalar {
            return Err(compile_error(format!(
                "portable mutable scalar cell call `{helper}` has conflicting scalar types `{}` and `{scalar}` for `{local}`",
                candidate.scalar
            )));
        }
        used_helpers.insert(helper);
        used_locals.insert(local);
    }
    for local in &used_locals {
        if proof.forbidden_borrows.contains(local) {
            return Err(compile_error(format!(
                "portable mutable scalar cell local `{local}` has an escaping, stored, or additional mutable-reference alias"
            )));
        }
        if proof.captured.contains(local) {
            return Err(compile_error(format!(
                "portable mutable scalar cell local `{local}` is captured by a closure or async block"
            )));
        }
        if proof.shadow_counts.get(local).copied().unwrap_or(0) != 1 {
            return Err(compile_error(format!(
                "portable mutable scalar cell local `{local}` has ambiguous shadowed bindings"
            )));
        }
        let (_, id) = locals.get(local).expect("used local was resolved");
        context.insert(format!(
            "{VITEST_MUTABLE_SCALAR_CELL_LOCAL_BINDING_MARKER}{id}"
        ));
    }
    for helper in used_helpers {
        let candidate = candidates.get(&helper).expect("used helper is a candidate");
        context.insert(format!(
            "{VITEST_MUTABLE_SCALAR_CELL_PARAMETER_MARKER}{helper}:{}",
            candidate.parameter
        ));
        context.insert(format!(
            "{MUTABLE_SCALAR_REFERENCE_ARGUMENT_MARKER}{helper}:{}",
            candidate.index
        ));
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

// Proves the local function items declared directly by one Rust block. A Rust function item is
// block-scoped and hoisted, cannot capture its environment, and is a value that could otherwise
// escape. TypeScript function declarations have the same block hoisting, but JavaScript would allow
// captures and first-class uses, so every difference is rejected explicitly before emission.
fn validate_vitest_local_functions(
    statements: &[Stmt],
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    let functions = statements
        .iter()
        .filter_map(|statement| {
            let Stmt::Item(syn::Item::Fn(function)) = statement else {
                return None;
            };
            Some(function)
        })
        .collect::<Vec<_>>();
    if functions.is_empty() {
        return Ok(());
    }

    let names = functions
        .iter()
        .map(|function| function.sig.ident.to_string())
        .collect::<BTreeSet<_>>();
    if names.len() != functions.len() {
        return Err(compile_error(
            "portable nested function names must be unique within their Rust block",
        ));
    }
    let mut emitted_names = BTreeMap::new();
    for name in &names {
        let emitted = snake_to_lower_camel(name);
        if let Some(previous) = emitted_names.insert(emitted.clone(), name.clone()) {
            return Err(compile_error(format!(
                "portable nested functions `{previous}` and `{name}` both emit as `{emitted}`"
            )));
        }
    }

    struct OuterUseCollector<'a> {
        emitted_names: &'a BTreeMap<String, String>,
        escaped: BTreeSet<String>,
        local_names: &'a BTreeSet<String>,
        shadowed: BTreeSet<String>,
    }

    impl OuterUseCollector<'_> {
        fn local_name(&self, path: &syn::Path) -> Option<String> {
            let [segment] = path.segments.iter().collect::<Vec<_>>()[..] else {
                return None;
            };
            let name = segment.ident.to_string();
            return self.local_names.contains(&name).then_some(name);
        }
    }

    impl<'ast> Visit<'ast> for OuterUseCollector<'_> {
        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            if let Expr::Path(path) = call.func.as_ref()
                && path.qself.is_none()
                && self.local_name(&path.path).is_some()
            {
                for argument in &call.args {
                    self.visit_expr(argument);
                }
                return;
            }
            syn::visit::visit_expr_call(self, call);
        }

        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path.qself.is_none()
                && let Some(name) = self.local_name(&path.path)
            {
                self.escaped.insert(name);
                return;
            }
            syn::visit::visit_expr_path(self, path);
        }

        fn visit_item_fn(&mut self, _function: &'ast ItemFn) {
            // Its signature and body have their own proof below.
        }

        fn visit_macro(&mut self, rust_macro: &'ast syn::Macro) {
            if let Ok(arguments) = parse_macro_arguments(rust_macro) {
                for argument in &arguments {
                    self.visit_expr(argument);
                }
            }
        }

        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            let name = pattern.ident.to_string();
            if self
                .emitted_names
                .contains_key(&snake_to_lower_camel(&name))
            {
                self.shadowed.insert(name);
            }
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut outer_uses = OuterUseCollector {
        emitted_names: &emitted_names,
        escaped: BTreeSet::new(),
        local_names: &names,
        shadowed: BTreeSet::new(),
    };
    for statement in statements {
        outer_uses.visit_stmt(statement);
    }
    let outer_binding_collisions = lexical_binding_names(context)
        .into_iter()
        .filter(|name| {
            emitted_names.contains_key(&snake_to_lower_camel(name)) && !names.contains(name)
        })
        .collect::<BTreeSet<_>>();
    outer_uses.shadowed.extend(outer_binding_collisions);
    if !outer_uses.shadowed.is_empty() {
        return Err(compile_error(format!(
            "portable nested function call provenance is shadow-ambiguous with binding(s) {}",
            outer_uses
                .shadowed
                .into_iter()
                .collect::<Vec<_>>()
                .join(", ")
        )));
    }
    if !outer_uses.escaped.is_empty() {
        return Err(compile_error(format!(
            "portable nested function value(s) {} escape direct call position",
            outer_uses
                .escaped
                .into_iter()
                .collect::<Vec<_>>()
                .join(", ")
        )));
    }

    struct BodyCollector<'a> {
        calls: Vec<(syn::Path, bool)>,
        captures: BTreeSet<String>,
        escaped: BTreeSet<String>,
        inner_bindings: BTreeSet<String>,
        local_names: &'a BTreeSet<String>,
        nested_items: BTreeSet<String>,
        outer_bindings: &'a BTreeSet<String>,
        scopes: Vec<BTreeSet<String>>,
    }

    impl BodyCollector<'_> {
        fn is_bound(&self, name: &str) -> bool {
            return self.scopes.iter().rev().any(|scope| scope.contains(name));
        }

        fn path_name(path: &syn::Path) -> Option<String> {
            let [segment] = path.segments.iter().collect::<Vec<_>>()[..] else {
                return None;
            };
            return Some(segment.ident.to_string());
        }

        fn record_reference(&mut self, name: &str) {
            if self.outer_bindings.contains(name) && !self.is_bound(name) {
                self.captures.insert(name.to_string());
            }
        }

        fn push_pattern_scope(&mut self, pattern: &Pat) {
            let bindings = pattern_names(pattern).into_iter().collect::<BTreeSet<_>>();
            self.inner_bindings.extend(bindings.iter().cloned());
            self.scopes.push(bindings);
        }
    }

    impl<'ast> Visit<'ast> for BodyCollector<'_> {
        fn visit_block(&mut self, block: &'ast syn::Block) {
            self.scopes.push(BTreeSet::new());
            for statement in &block.stmts {
                if let Stmt::Local(local) = statement {
                    if let Some(initializer) = &local.init {
                        self.visit_expr(&initializer.expr);
                        if let Some((_, diverge)) = &initializer.diverge {
                            self.visit_expr(diverge);
                        }
                    }
                    self.visit_pat(&local.pat);
                    let bindings = pattern_names(&local.pat);
                    self.inner_bindings.extend(bindings.iter().cloned());
                    self.scopes
                        .last_mut()
                        .expect("a block scope exists")
                        .extend(bindings);
                } else {
                    self.visit_stmt(statement);
                }
            }
            self.scopes.pop();
        }

        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            if let Expr::Path(path) = call.func.as_ref()
                && path.qself.is_none()
            {
                let name = Self::path_name(&path.path);
                let bound = name.as_ref().is_some_and(|name| self.is_bound(name));
                if let Some(name) = &name {
                    self.record_reference(name);
                }
                self.calls.push((path.path.clone(), bound));
                for argument in &call.args {
                    self.visit_expr(argument);
                }
                return;
            }
            syn::visit::visit_expr_call(self, call);
        }

        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            let bindings = closure
                .inputs
                .iter()
                .flat_map(pattern_names)
                .collect::<BTreeSet<_>>();
            self.inner_bindings.extend(bindings.iter().cloned());
            self.scopes.push(bindings);
            self.visit_expr(&closure.body);
            self.scopes.pop();
        }

        fn visit_expr_for_loop(&mut self, expression: &'ast syn::ExprForLoop) {
            self.visit_expr(&expression.expr);
            self.push_pattern_scope(&expression.pat);
            self.visit_block(&expression.body);
            self.scopes.pop();
        }

        fn visit_expr_if(&mut self, expression: &'ast syn::ExprIf) {
            if let Expr::Let(binding) = expression.cond.as_ref() {
                self.visit_expr(&binding.expr);
                self.push_pattern_scope(&binding.pat);
                self.visit_block(&expression.then_branch);
                self.scopes.pop();
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
                self.push_pattern_scope(&arm.pat);
                if let Some((_, guard)) = &arm.guard {
                    self.visit_expr(guard);
                }
                self.visit_expr(&arm.body);
                self.scopes.pop();
            }
        }

        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path.qself.is_none()
                && let Some(name) = Self::path_name(&path.path)
            {
                self.record_reference(&name);
                if self.local_names.contains(&name) {
                    self.escaped.insert(name);
                }
                return;
            }
            syn::visit::visit_expr_path(self, path);
        }

        fn visit_expr_while(&mut self, expression: &'ast syn::ExprWhile) {
            if let Expr::Let(binding) = expression.cond.as_ref() {
                self.visit_expr(&binding.expr);
                self.push_pattern_scope(&binding.pat);
                self.visit_block(&expression.body);
                self.scopes.pop();
            } else {
                self.visit_expr(&expression.cond);
                self.visit_block(&expression.body);
            }
        }

        fn visit_item(&mut self, item: &'ast syn::Item) {
            self.nested_items.insert(match item {
                syn::Item::Fn(function) => function.sig.ident.to_string(),
                syn::Item::Impl(_) => "impl".to_string(),
                _ => "item".to_string(),
            });
        }

        fn visit_macro(&mut self, rust_macro: &'ast syn::Macro) {
            if let Ok(arguments) = parse_macro_arguments(rust_macro) {
                for argument in &arguments {
                    self.visit_expr(argument);
                }
            }
        }

        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            self.inner_bindings.insert(pattern.ident.to_string());
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut outer_bindings = lexical_binding_names(context);
    // Validation runs before statement emission so every function item has Rust's block-wide
    // hoisting. Collect the block's locals up front as well: even a binding written after an item
    // is an enclosing value that the item must never acquire as a JavaScript closure capture.
    outer_bindings.extend(statements.iter().filter_map(|statement| {
        let Stmt::Local(local) = statement else {
            return None;
        };
        Some(pattern_names(&local.pat))
    }).flatten());
    let mut call_graph = BTreeMap::<String, BTreeSet<String>>::new();
    for function in functions {
        if !function.attrs.is_empty()
            || !matches!(function.vis, syn::Visibility::Inherited)
            || function.sig.constness.is_some()
            || function.sig.asyncness.is_some()
            || function.sig.unsafety.is_some()
            || function.sig.abi.is_some()
            || function.sig.variadic.is_some()
            || !function.sig.generics.params.is_empty()
            || function.sig.generics.where_clause.is_some()
            || function
                .sig
                .inputs
                .iter()
                .any(|argument| matches!(argument, FnArg::Receiver(_)))
        {
            return Err(compile_error(format!(
                "portable nested function `{}` must be a plain non-async, non-generic free function",
                function.sig.ident
            )));
        }
        for argument in &function.sig.inputs {
            emit_parameter(argument, context)?;
        }
        if let ReturnType::Type(_, rust_type) = &function.sig.output {
            emit_type(rust_type, context)?;
        }
        validate_vitest_function_provenance(function, context)?;

        let parameter_bindings = function
            .sig
            .inputs
            .iter()
            .filter_map(|argument| match argument {
                FnArg::Typed(argument) => Some(pattern_names(&argument.pat)),
                FnArg::Receiver(_) => None,
            })
            .flatten()
            .collect::<BTreeSet<_>>();
        let mut body = BodyCollector {
            calls: Vec::new(),
            captures: BTreeSet::new(),
            escaped: BTreeSet::new(),
            inner_bindings: parameter_bindings.clone(),
            local_names: &names,
            nested_items: BTreeSet::new(),
            outer_bindings: &outer_bindings,
            scopes: vec![parameter_bindings],
        };
        body.visit_block(&function.block);
        if !body.nested_items.is_empty() {
            return Err(compile_error(format!(
                "portable nested function `{}` contains unsupported nested item(s) {}",
                function.sig.ident,
                body.nested_items.into_iter().collect::<Vec<_>>().join(", ")
            )));
        }
        if !body.captures.is_empty() {
            return Err(compile_error(format!(
                "portable nested function `{}` captures outer binding(s) {}",
                function.sig.ident,
                body.captures.into_iter().collect::<Vec<_>>().join(", ")
            )));
        }
        if !body.escaped.is_empty() {
            return Err(compile_error(format!(
                "portable nested function value(s) {} escape direct call position inside `{}`",
                body.escaped.into_iter().collect::<Vec<_>>().join(", "),
                function.sig.ident
            )));
        }
        let shadowed_helpers = body
            .inner_bindings
            .iter()
            .filter(|binding| {
                emitted_names.contains_key(&snake_to_lower_camel(binding))
            })
            .cloned()
            .collect::<BTreeSet<_>>();
        if !shadowed_helpers.is_empty() {
            return Err(compile_error(format!(
                "portable nested function `{}` has shadow-ambiguous binding(s) {}",
                function.sig.ident,
                shadowed_helpers.into_iter().collect::<Vec<_>>().join(", ")
            )));
        }

        let mut local_calls = BTreeSet::new();
        for (called, shadowed) in body.calls {
            let called_name = called
                .segments
                .iter()
                .map(|segment| segment.ident.to_string())
                .collect::<Vec<_>>()
                .join("::");
            if shadowed {
                return Err(compile_error(format!(
                    "portable nested function `{}` calls shadowed or unresolved local value `{called_name}`",
                    function.sig.ident
                )));
            }
            if called.segments.len() == 1 && names.contains(&called_name) {
                local_calls.insert(called_name);
                continue;
            }
            if vitest_function_path_binding_name(&called, context)?.is_none() {
                return Err(compile_error(format!(
                    "portable nested function `{}` calls unresolved function `{called_name}`",
                    function.sig.ident
                )));
            }
        }
        call_graph.insert(function.sig.ident.to_string(), local_calls);
    }

    fn reaches_cycle(
        name: &str,
        graph: &BTreeMap<String, BTreeSet<String>>,
        visiting: &mut BTreeSet<String>,
        visited: &mut BTreeSet<String>,
    ) -> bool {
        if visiting.contains(name) {
            return true;
        }
        if !visited.insert(name.to_string()) {
            return false;
        }
        visiting.insert(name.to_string());
        let cycle = graph.get(name).is_some_and(|called| {
            called
                .iter()
                .any(|called| reaches_cycle(called, graph, visiting, visited))
        });
        visiting.remove(name);
        return cycle;
    }

    let mut visited = BTreeSet::new();
    for name in &names {
        if reaches_cycle(name, &call_graph, &mut BTreeSet::new(), &mut visited) {
            return Err(compile_error(format!(
                "recursive portable nested function cycle reaches `{name}`"
            )));
        }
    }
    return Ok(());
}

fn emit_block(
    out: &mut String,
    statements: &[Stmt],
    context: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let mut block_context = context.clone();
    insert_vitest_rebound_struct_context(statements, &mut block_context);
    insert_vitest_mutable_scalar_cell_context(statements, &mut block_context)?;
    validate_vitest_local_functions(statements, &block_context)?;
    // Panic assertions spanning several statements, by the index of their first statement. The
    // locals they replace are not emitted, so they do not count as declarations.
    let mut panic_assertions = HashMap::new();
    let mut skipped = HashSet::new();
    let mut index = 0;
    while index < statements.len() {
        let assertion = flight_error_helper_assertion(statements, index, &block_context)
            .or_else(|| flight_error_assertion(statements, index))
            .or_else(|| caught_panic_assertion(statements, index, &block_context))
            .or_else(|| panic_is_err_assertion(statements, index));
        if let Some(assertion) = assertion {
            let length = assertion.length;
            skipped.extend(index + 1..index + length);
            panic_assertions.insert(index, assertion);
            index += length;
        } else {
            index += 1;
        }
    }
    let mut declaration_counts = HashMap::new();
    for (index, statement) in statements.iter().enumerate() {
        if !skipped.contains(&index)
            && !panic_assertions.contains_key(&index)
            && let Stmt::Local(local) = statement
            && let Some(name) = local_name(&local.pat)
        {
            *declaration_counts.entry(name).or_insert(0_usize) += 1;
        }
    }
    let entity_id_bindings = proven_entity_id_bindings(statements);
    let mut declared = HashSet::new();
    for (index, statement) in statements.iter().enumerate() {
        if let Some(assertion) = panic_assertions.get(&index) {
            emit_panic_assertion(out, assertion, &block_context, indent)?;
            continue;
        }
        if skipped.contains(&index) {
            continue;
        }
        if let Stmt::Local(local) = statement
            && let Some(name) = local_name(&local.pat)
        {
            let rebound = declaration_counts
                .get(&name)
                .is_some_and(|count| *count > 1);
            let marker = format!("{ENTITY_ID_BINDING_MARKER}{name}");
            let shadowed = !declared.insert(name);
            // A proven entity-id binding holds the allocation itself: `const id = object;`.
            let identity_local = entity_id_bindings.contains(&index).then(|| {
                let mut identity = local.clone();
                if let Some(initializer) = &mut identity.init
                    && let Some(object) = entity_id_operand(&initializer.expr)
                {
                    initializer.expr = Box::new(object.clone());
                }
                identity
            });
            if identity_local.is_some() {
                block_context.insert(marker);
            } else {
                block_context.remove(&marker);
            }
            emit_local_with_shadow_and_else(
                out,
                &block_context,
                identity_local.as_ref().unwrap_or(local),
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
        } else if let Stmt::Item(syn::Item::Fn(function)) = statement {
            emit_local_function(out, function, &block_context, indent)?;
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
    // A proven panic-message helper has no TypeScript body: its calls lower into `toThrow(..)`.
    if proven_panic_message_helper(function) || proven_flight_error_helper(function).is_some() {
        return Ok(());
    }
    // The proven `block_on` executor has no TypeScript body: its calls lower to `await`.
    if context.contains(&format!("{BLOCK_ON_HELPER_MARKER}{}", function.sig.ident)) {
        return Ok(());
    }
    if function.sig.asyncness.is_some() {
        return Err(compile_error(format!(
            "async portable helper `{}` is not supported yet",
            function.sig.ident
        )));
    }
    validate_vitest_function_provenance(function, context)?;
    let mut context = function_expression_context(function, context);
    if function_returns_uint8_array(function, &context) {
        context.insert(format!(
            "{RETURNS_CONTRACT_TYPED_ARRAY_MARKER}Uint8Array"
        ));
    }
    insert_type_parameter_context(&mut context, &function.sig.generics);
    let parameters = function
        .sig
        .inputs
        .iter()
        .map(|argument| emit_parameter(argument, &context))
        .collect::<Result<Vec<_>, _>>()?;
    let return_type = match &function.sig.output {
        ReturnType::Default => "void".to_string(),
        ReturnType::Type(_, _) if function_returns_uint8_array(function, &context) => {
            "Uint8Array".to_string()
        }
        ReturnType::Type(_, rust_type) => emit_type(rust_type, &context)?,
    };
    write_indent(out, indent);
    writeln!(
        out,
        "function {}{}({}): {return_type} {{",
        snake_to_lower_camel(&function.sig.ident.to_string()),
        emit_type_parameters(&function.sig.generics),
        parameters.join(", ")
    )
    .expect("writing to a String cannot fail");
    if helper_has_proven_object_result(function, &context) {
        emit_block_with_tail_returns(out, &function.block.stmts, &context, indent + 1)?;
    } else {
        emit_block(out, &function.block.stmts, &context, indent + 1)?;
    }
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

// A helper's declared struct result plus a value-producing Rust tail (or explicit `return`) proves
// that TypeScript must return an object. Keep unit helpers and statement blocks on the ordinary
// statement emitter: a struct literal followed by `;` is an effect-free statement, not a result.
fn helper_has_proven_object_result(function: &ItemFn, context: &HashSet<String>) -> bool {
    let Some(last) = function.block.stmts.last() else {
        return false;
    };
    if statement_proves_object_result(last) {
        return true;
    }
    let ReturnType::Type(_, rust_type) = &function.sig.output else {
        return false;
    };
    let Type::Path(path) = rust_type.as_ref() else {
        return false;
    };
    let Some(name) = path
        .path
        .segments
        .last()
        .map(|segment| segment.ident.to_string())
    else {
        return false;
    };
    if !is_vitest_struct(context, &name) {
        return false;
    }
    return statement_proves_value_result(last);
}

fn statement_proves_object_result(statement: &Stmt) -> bool {
    return match statement {
        Stmt::Expr(Expr::Return(returned), _) => returned
            .expr
            .as_deref()
            .is_some_and(expression_proves_object_result),
        Stmt::Expr(expression, None) => expression_proves_object_result(expression),
        _ => false,
    };
}

fn expression_proves_object_result(expression: &Expr) -> bool {
    return match expression {
        Expr::Block(block) => block
            .block
            .stmts
            .last()
            .is_some_and(statement_proves_object_result),
        Expr::Group(group) => expression_proves_object_result(&group.expr),
        Expr::If(branch) => {
            branch
                .then_branch
                .stmts
                .last()
                .is_some_and(statement_proves_object_result)
                && branch
                    .else_branch
                    .as_ref()
                    .is_some_and(|(_, otherwise)| expression_proves_object_result(otherwise))
        }
        Expr::Match(branch) => {
            !branch.arms.is_empty()
                && branch
                    .arms
                    .iter()
                    .all(|arm| expression_proves_object_result(&arm.body))
        }
        Expr::Paren(paren) => expression_proves_object_result(&paren.expr),
        Expr::Return(returned) => returned
            .expr
            .as_deref()
            .is_some_and(expression_proves_object_result),
        Expr::Struct(_) => true,
        Expr::Unsafe(block) => block
            .block
            .stmts
            .last()
            .is_some_and(statement_proves_object_result),
        _ => false,
    };
}

fn statement_proves_value_result(statement: &Stmt) -> bool {
    return match statement {
        Stmt::Expr(Expr::Return(returned), _) => returned.expr.is_some(),
        Stmt::Expr(expression, None) => expression_proves_value_result(expression),
        _ => false,
    };
}

fn expression_proves_value_result(expression: &Expr) -> bool {
    return match expression {
        Expr::Block(block) => block
            .block
            .stmts
            .last()
            .is_some_and(statement_proves_value_result),
        Expr::Group(group) => expression_proves_value_result(&group.expr),
        Expr::If(branch) => {
            branch
                .then_branch
                .stmts
                .last()
                .is_some_and(statement_proves_value_result)
                && branch
                    .else_branch
                    .as_ref()
                    .is_some_and(|(_, otherwise)| expression_proves_value_result(otherwise))
        }
        Expr::Match(branch) => {
            !branch.arms.is_empty()
                && branch
                    .arms
                    .iter()
                    .all(|arm| expression_proves_value_result(&arm.body))
        }
        Expr::Paren(paren) => expression_proves_value_result(&paren.expr),
        Expr::Return(returned) => returned.expr.is_some(),
        Expr::Tuple(tuple) => !tuple.elems.is_empty(),
        Expr::Unsafe(block) => block
            .block
            .stmts
            .last()
            .is_some_and(statement_proves_value_result),
        Expr::Break(_) | Expr::Continue(_) | Expr::ForLoop(_) | Expr::Loop(_) | Expr::While(_) => {
            false
        }
        _ => true,
    };
}

// The contract binding a referenced contract item is imported as: a frozen object's name, the owner of
// a const-object member's `Owner.Member` name, or the item's own TypeScript name.
fn contract_import_name(symbol: &str, context: &HashSet<String>) -> String {
    if let Some(name) = frozen_object_name(context, symbol) {
        return name.to_string();
    }
    let name = emit_path_name(symbol, context);
    return name
        .split_once('.')
        .map_or(name.clone(), |(owner, _)| owner.to_string());
}

fn emit_path_name(name: &str, context: &HashSet<String>) -> String {
    if let Some(target) = export_name(context, name) {
        return target.to_string();
    }
    if name.chars().all(|character| {
        character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
    }) {
        return name.to_string();
    }
    return snake_to_lower_camel(name);
}

fn emit_vitest_else_chain(
    out: &mut String,
    otherwise: &Expr,
    context: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    match otherwise {
        Expr::If(else_if) => {
            let else_context = if let Expr::Let(binding) = else_if.cond.as_ref() {
                lexical_pattern_context(context, &binding.pat)
            } else {
                context.clone()
            };
            let option_binding = emit_option_binding(&else_if.cond, context)?;
            if option_binding.is_some() {
                return Err(compile_error(
                    "portable test `else if let` option binding is not supported; rewrite as `else { if let ... }`",
                ));
            }
            writeln!(
                out,
                "}} else if ({}) {{",
                emit_expression(&else_if.cond, context)?
            )
            .expect("writing to a String cannot fail");
            emit_block(out, &else_if.then_branch.stmts, &else_context, indent + 1)?;
            write_indent(out, indent);
            if let Some((_, next)) = &else_if.else_branch {
                emit_vitest_else_chain(out, next, context, indent)?;
            } else {
                out.push_str("}\n");
            }
        }
        Expr::Block(block) => {
            out.push_str("} else {\n");
            emit_block(out, &block.block.stmts, context, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        _ => {
            return Err(compile_error(
                "portable test else branches must use a block",
            ));
        }
    }
    Ok(())
}

// A Rust panic test that lowers to `expect(() => ..).toThrow(..)`: the statements it spans, the
// closure that must panic, the message substring it requires (if any), the `assert!` it ends with
// (if any), and the `expect_err` message (if any). Either message becomes the vitest failure message.
struct PanicAssertion<'a> {
    assertion: Option<&'a syn::Macro>,
    closure: &'a syn::ExprClosure,
    exact: bool,
    expect_message: Option<Expr>,
    flight_error: Option<FlightErrorMatcher>,
    length: usize,
    needle: Option<Expr>,
}

// What a test checks of a caught `FlightError` payload, as one vitest `toThrow` argument. vitest's
// `toThrow(new K(message))` requires the exact class and message; `toThrow(K)` is `instanceof`, so it
// is exact only for a class nothing else extends (`RangeError`, `TypeError`, `SyntaxError`); a
// string is a substring check, and an anchored regex an exact message of any class.
enum FlightErrorMatcher {
    Class(&'static str),
    Contains(Expr),
    ExactMessage(String),
    Instance(&'static str, Expr),
}

// `expect(() => .., message).toThrow(needle)`. The closure runs once, where the Rust test runs it;
// `toThrow()` passes on any throw, and `toThrow(needle)` when the message contains `needle`. The
// message is the `assert!` message, else the `expect_err` message: what Rust reports when the
// closure does not panic.
fn emit_panic_assertion(
    out: &mut String,
    assertion: &PanicAssertion<'_>,
    context: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let closure = emit_expression(&Expr::Closure(assertion.closure.clone()), context)?;
    let mut needle = assertion
        .needle
        .as_ref()
        .map(|needle| emit_expression(needle, context))
        .transpose()?
        .unwrap_or_default();
    if assertion.exact {
        // `toThrow(error)` passes only when the thrown `Error`'s message equals this one.
        needle = format!("new Error({needle})");
    }
    match &assertion.flight_error {
        Some(FlightErrorMatcher::Class(class)) => needle = (*class).to_string(),
        Some(FlightErrorMatcher::Contains(text)) => needle = emit_expression(text, context)?,
        Some(FlightErrorMatcher::ExactMessage(text)) => needle = anchored_message_pattern(text),
        Some(FlightErrorMatcher::Instance(class, message)) => {
            needle = format!("new {class}({})", emit_expression(message, context)?);
        }
        None => {}
    }
    let assert_message = match assertion.assertion {
        Some(assertion) => {
            let name = assertion
                .path
                .segments
                .last()
                .map(|segment| segment.ident.to_string())
                .unwrap_or_default();
            assertion_message(&parse_macro_arguments(assertion)?, &name, context)?
        }
        None => None,
    };
    let message = match (assert_message, assertion.expect_message.as_ref()) {
        (Some(message), _) => Some(message),
        (None, Some(message)) => Some(emit_expression(message, context)?),
        (None, None) => None,
    };
    write_indent(out, indent);
    match message {
        Some(message) => writeln!(out, "expect({closure}, {message}).toThrow({needle});"),
        None => writeln!(out, "expect({closure}).toThrow({needle});"),
    }
    .expect("writing to a String cannot fail");
    return Ok(());
}

const PANIC_IS_ERR_ASSERTION_LENGTH: usize = 2;

// `let result = catch_unwind(..); assert!(result.is_err());`, where nothing later reads `result`.
fn panic_is_err_assertion(statements: &[Stmt], start: usize) -> Option<PanicAssertion<'_>> {
    let window = statements.get(start..start + PANIC_IS_ERR_ASSERTION_LENGTH)?;
    let (result, caught) = simple_local(&window[0])?;
    let closure = caught_panic_closure(caught)?;
    let Stmt::Macro(assertion) = &window[1] else {
        return None;
    };
    if !assertion.mac.path.is_ident("assert") {
        return None;
    }
    let arguments = parse_macro_arguments(&assertion.mac).ok()?;
    let Expr::MethodCall(is_err) = unparenthesized(arguments.first()?) else {
        return None;
    };
    if is_err.method != "is_err"
        || !is_err.args.is_empty()
        || !expression_is_name(&is_err.receiver, &result)
        || statements_read_name(
            &statements[start + PANIC_IS_ERR_ASSERTION_LENGTH..],
            &result,
        )
    {
        return None;
    }
    return Some(PanicAssertion {
        assertion: Some(&assertion.mac),
        closure,
        exact: false,
        expect_message: None,
        flight_error: None,
        length: PANIC_IS_ERR_ASSERTION_LENGTH,
        needle: None,
    });
}

// The closure of `catch_unwind(..).is_err()`, the whole expression an inline panic assertion
// (`assert!(catch_unwind(|| ..).is_err())`) asserts.
fn caught_panic_is_err(expression: &Expr) -> Option<&syn::ExprClosure> {
    let Expr::MethodCall(is_err) = unparenthesized(expression) else {
        return None;
    };
    if is_err.method != "is_err" || !is_err.args.is_empty() {
        return None;
    }
    return caught_panic_closure(&is_err.receiver);
}

// A caught panic followed by what the test checks of it:
//
//     let err = catch_unwind(|| ..).expect_err("..");       // or .unwrap_err()
//     // or: let result = catch_unwind(|| ..); let err = result.expect_err("..");  (or .unwrap_err())
//     let msg = err.downcast_ref::<&str>().copied().unwrap();
//            // or err.downcast_ref::<String>().map(|s| s.as_str()).unwrap()
//     assert!(msg.contains(needle));
//
// is `expect(() => .., message).toThrow(needle)`; without the last two statements, when nothing reads
// `err` again, it is `expect(() => .., message).toThrow()`. A payload inspected any other way (a
// `FlightError`, a helper, an exact comparison) is not expressible, and neither is a result or
// payload read again later: those do not match, and their `catch_unwind` call then refuses.
fn caught_panic_assertion<'a>(
    statements: &'a [Stmt],
    start: usize,
    context: &HashSet<String>,
) -> Option<PanicAssertion<'a>> {
    // `let result = catch_unwind(..);` then a helper assertion on `result.unwrap_err()` (or
    // `.expect_err(..)`), with `result` not read after.
    if let Some((result, caught)) = statements.get(start).and_then(simple_local)
        && let Some(closure) = caught_panic_closure(caught)
        && let Some(Stmt::Macro(assertion)) = statements.get(start + 1)
        && let Some((payload, needle, exact)) = panic_helper_assertion(&assertion.mac, context)
        && let Some((receiver, expect_message)) = unwrapped_panic_payload(peel_payload(&payload))
        && expression_is_name(receiver, &result)
        && !statements_read_name(&statements[start + 2..], &result)
    {
        return Some(PanicAssertion {
            assertion: Some(&assertion.mac),
            closure,
            exact,
            expect_message: expect_message.cloned(),
            flight_error: None,
            length: 2,
            needle: Some(needle),
        });
    }
    let (closure, error, expect_message, prefix) = caught_panic_error(statements, start)?;
    let message_start = start + prefix;
    // The payload checked through a proven helper: `assert!(panic_message(err).contains(..))`.
    if let Some(Stmt::Macro(assertion)) = statements.get(message_start)
        && let Some((payload, needle, exact)) = panic_helper_assertion(&assertion.mac, context)
        && expression_is_name(peel_payload(&payload), &error)
        && !statements_read_name(&statements[message_start + 1..], &error)
    {
        return Some(PanicAssertion {
            assertion: Some(&assertion.mac),
            closure,
            exact,
            expect_message: expect_message.cloned(),
            flight_error: None,
            length: prefix + 1,
            needle: Some(needle),
        });
    }
    let message_start = start + prefix;
    if let Some(window) = statements.get(message_start..message_start + 2)
        && let Some((message, downcast)) = simple_local(&window[0])
        && panic_message_downcast(downcast, &error)
        && let Stmt::Macro(assertion) = &window[1]
        && assertion.mac.path.is_ident("assert")
        && let Ok(arguments) = parse_macro_arguments(&assertion.mac)
        && let Some(Expr::MethodCall(contains)) = arguments.first().map(unparenthesized)
        && contains.method == "contains"
        && contains.args.len() == 1
        && expression_is_name(&contains.receiver, &message)
        && !statements_read_name(&statements[message_start + 2..], &error)
        && !statements_read_name(&statements[message_start + 2..], &message)
    {
        return Some(PanicAssertion {
            assertion: Some(&assertion.mac),
            closure,
            exact: false,
            expect_message: expect_message.cloned(),
            flight_error: None,
            length: prefix + 2,
            needle: Some(contains.args[0].clone()),
        });
    }
    if error != "_" && statements_read_name(&statements[message_start..], &error) {
        return None;
    }
    return Some(PanicAssertion {
        assertion: None,
        closure,
        exact: false,
        expect_message: expect_message.cloned(),
        flight_error: None,
        length: prefix,
        needle: None,
    });
}

// The caught panic's payload binding at `statements[start]`: the closure, the payload's name (`_`
// for `let _ = ..`), the `expect_err` message, and how many statements bind it. One statement
// (`let err = catch_unwind(..).expect_err(..)`) or two (`let result = catch_unwind(..);` then
// `let err = result.expect_err(..)` or `.unwrap_err()`, with `result` not read after).
fn caught_panic_error(
    statements: &[Stmt],
    start: usize,
) -> Option<(&syn::ExprClosure, String, Option<&Expr>, usize)> {
    let (name, initializer) = payload_local(statements.get(start)?)?;
    if let Some((caught, expect_message)) = unwrapped_panic_payload(initializer) {
        return Some((caught_panic_closure(caught)?, name, expect_message, 1));
    }
    let closure = caught_panic_closure(initializer)?;
    let (error, unwrapped) = payload_local(statements.get(start + 1)?)?;
    let (result, expect_message) = unwrapped_panic_payload(unwrapped)?;
    if !expression_is_name(result, &name) || statements_read_name(&statements[start + 2..], &name) {
        return None;
    }
    return Some((closure, error, expect_message, 2));
}

// `receiver.unwrap_err()` or `receiver.expect_err(message)`: the receiver and the message.
fn unwrapped_panic_payload(expression: &Expr) -> Option<(&Expr, Option<&Expr>)> {
    let Expr::MethodCall(call) = expression else {
        return None;
    };
    // `.err().unwrap()` / `.err().expect(message)` are `.unwrap_err()` / `.expect_err(message)`.
    if let Expr::MethodCall(err) = call.receiver.as_ref()
        && err.method == "err"
        && err.args.is_empty()
    {
        return match (call.method.to_string().as_str(), call.args.len()) {
            ("unwrap", 0) => Some((&err.receiver, None)),
            ("expect", 1) => Some((&err.receiver, Some(&call.args[0]))),
            _ => None,
        };
    }
    return match (call.method.to_string().as_str(), call.args.len()) {
        ("unwrap_err", 0) => Some((&call.receiver, None)),
        ("expect_err", 1) => Some((&call.receiver, Some(&call.args[0]))),
        _ => None,
    };
}

// `let name = init;` or `let _ = init;`, or the expression statement `init;` (named `_`).
fn payload_local(statement: &Stmt) -> Option<(String, &Expr)> {
    if let Stmt::Expr(expression, Some(_)) = statement {
        return Some(("_".to_string(), expression));
    }
    if let Stmt::Local(local) = statement
        && matches!(local.pat, Pat::Wild(_))
        && let Some(initializer) = &local.init
        && initializer.diverge.is_none()
    {
        return Some(("_".to_string(), &initializer.expr));
    }
    return simple_local(statement);
}

// `let name = init;` with a plain, non-`mut` identifier pattern and no `else`.
fn simple_local(statement: &Stmt) -> Option<(String, &Expr)> {
    let Stmt::Local(local) = statement else {
        return None;
    };
    let Pat::Ident(identifier) = &local.pat else {
        return None;
    };
    let initializer = local.init.as_ref()?;
    if identifier.mutability.is_some()
        || identifier.subpat.is_some()
        || initializer.diverge.is_some()
    {
        return None;
    }
    return Some((identifier.ident.to_string(), &initializer.expr));
}

// The parameterless closure of `catch_unwind(|| ..)` or `catch_unwind(AssertUnwindSafe(|| ..))`,
// with either spelled bare or as `std::panic::..`.
fn caught_panic_closure(expression: &Expr) -> Option<&syn::ExprClosure> {
    let Expr::Call(call) = expression else {
        return None;
    };
    if !path_is_std_panic(&call.func, "catch_unwind") || call.args.len() != 1 {
        return None;
    }
    let mut argument = &call.args[0];
    if let Expr::Call(wrapper) = argument
        && path_is_std_panic(&wrapper.func, "AssertUnwindSafe")
        && wrapper.args.len() == 1
    {
        argument = &wrapper.args[0];
    }
    let Expr::Closure(closure) = argument else {
        return None;
    };
    return (closure.inputs.is_empty() && closure.asyncness.is_none()).then_some(closure);
}

fn path_is_std_panic(expression: &Expr, name: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    let segments = path
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    return path.qself.is_none()
        && (segments == [name]
            || segments == ["std", "panic", name]
            || segments == ["panic", name]);
}

// `error.downcast_ref::<&str>().copied().unwrap()` or
// `error.downcast_ref::<String>().map(|s| s.as_str()).unwrap()`.
fn panic_message_downcast(expression: &Expr, error: &str) -> bool {
    let Expr::MethodCall(unwrap) = expression else {
        return false;
    };
    if unwrap.method != "unwrap" || !unwrap.args.is_empty() {
        return false;
    }
    let Expr::MethodCall(adapter) = unwrap.receiver.as_ref() else {
        return false;
    };
    let Expr::MethodCall(downcast) = adapter.receiver.as_ref() else {
        return false;
    };
    if downcast.method != "downcast_ref"
        || !downcast.args.is_empty()
        || !expression_is_name(&downcast.receiver, error)
    {
        return false;
    }
    let Some(turbofish) = &downcast.turbofish else {
        return false;
    };
    let [syn::GenericArgument::Type(payload)] = turbofish.args.iter().collect::<Vec<_>>()[..]
    else {
        return false;
    };
    return match payload {
        syn::Type::Reference(reference) => {
            matches!(reference.elem.as_ref(), syn::Type::Path(path) if path.qself.is_none() && path.path.is_ident("str"))
                && adapter.method == "copied"
                && adapter.args.is_empty()
        }
        syn::Type::Path(path) if path.qself.is_none() && path.path.is_ident("String") => {
            adapter.method == "map"
                && adapter.args.len() == 1
                && closure_returns_parameter_as_str(&adapter.args[0])
        }
        _ => false,
    };
}

// `|s| s.as_str()`.
fn closure_returns_parameter_as_str(expression: &Expr) -> bool {
    let Expr::Closure(closure) = expression else {
        return false;
    };
    let [Pat::Ident(parameter)] = closure.inputs.iter().collect::<Vec<_>>()[..] else {
        return false;
    };
    let Expr::MethodCall(as_str) = closure.body.as_ref() else {
        return false;
    };
    return as_str.method == "as_str"
        && as_str.args.is_empty()
        && expression_is_name(&as_str.receiver, &parameter.ident.to_string());
}

fn expression_is_name(expression: &Expr, name: &str) -> bool {
    return matches!(unparenthesized(expression), Expr::Path(path)
        if path.qself.is_none() && path.path.is_ident(name));
}

// Whether `statements` read `name` before a `let` of it starts a new binding. Macro arguments
// (`assert!(name ..)`) are read as expressions; a macro whose tokens cannot be parsed counts as a
// read when they mention the name.
fn statements_read_name(statements: &[Stmt], name: &str) -> bool {
    struct NameReader<'a> {
        name: &'a str,
        found: bool,
    }

    impl<'ast> Visit<'ast> for NameReader<'_> {
        // A closure parameter of the same name is a different binding: its body reads that one.
        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            if closure
                .inputs
                .iter()
                .any(|input| pattern_names(input).contains(self.name))
            {
                return;
            }
            syn::visit::visit_expr_closure(self, closure);
        }

        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path.qself.is_none() && path.path.is_ident(self.name) {
                self.found = true;
            }
            syn::visit::visit_expr_path(self, path);
        }

        fn visit_macro(&mut self, rust_macro: &'ast syn::Macro) {
            match parse_macro_arguments(rust_macro) {
                Ok(arguments) => {
                    for argument in &arguments {
                        self.visit_expr(argument);
                    }
                }
                Err(_) => {
                    if rust_macro
                        .tokens
                        .clone()
                        .into_iter()
                        .any(|token| token.to_string() == self.name)
                    {
                        self.found = true;
                    }
                }
            }
        }
    }

    for statement in statements {
        let mut reader = NameReader { name, found: false };
        match statement {
            Stmt::Local(local) => {
                if let Some(initializer) = &local.init {
                    reader.visit_local_init(initializer);
                }
                if reader.found {
                    return true;
                }
                if local_name(&local.pat).as_deref() == Some(name) {
                    return false;
                }
            }
            statement => {
                reader.visit_stmt(statement);
                if reader.found {
                    return true;
                }
            }
        }
    }
    return false;
}

// The assertion on a panic payload through a proven panic-message helper: the payload expression,
// the message (a substring, or the exact message), and whether it is exact.
//
//     assert!(panic_message(payload).contains(needle));
//     assert!(str::contains(&panic_message(payload), needle));
//     assert_eq!(panic_message(payload), message);   // either operand order
fn panic_helper_assertion(
    assertion: &syn::Macro,
    context: &HashSet<String>,
) -> Option<(Expr, Expr, bool)> {
    let arguments = parse_macro_arguments(assertion).ok()?;
    let helper_payload = |expression: &Expr| -> Option<Expr> {
        let Expr::Call(call) = unparenthesized(expression) else {
            return None;
        };
        let Expr::Path(path) = call.func.as_ref() else {
            return None;
        };
        let name = path.path.get_ident()?.to_string();
        return (path.qself.is_none()
            && call.args.len() == 1
            && context.contains(&format!("{PANIC_MESSAGE_HELPER_MARKER}{name}")))
        .then(|| call.args[0].clone());
    };
    if assertion.path.is_ident("assert") {
        return match unparenthesized(arguments.first()?) {
            Expr::MethodCall(contains)
                if contains.method == "contains" && contains.args.len() == 1 =>
            {
                Some((
                    helper_payload(&contains.receiver)?,
                    contains.args[0].clone(),
                    false,
                ))
            }
            Expr::Call(call)
                if path_is(&call.func, &["str", "contains"]) && call.args.len() == 2 =>
            {
                let Expr::Reference(message) = unparenthesized(&call.args[0]) else {
                    return None;
                };
                Some((helper_payload(&message.expr)?, call.args[1].clone(), false))
            }
            _ => None,
        };
    }
    if assertion.path.is_ident("assert_eq") && arguments.len() >= 2 {
        if let Some(payload) = helper_payload(&arguments[0]) {
            return Some((payload, arguments[1].clone(), true));
        }
        return Some((helper_payload(&arguments[1])?, arguments[0].clone(), true));
    }
    return None;
}

// A payload expression as a helper receives it: `payload`, `payload.as_ref()`, `&*payload` or
// `&payload`, each the payload itself.
fn peel_payload(expression: &Expr) -> &Expr {
    let expression = unparenthesized(expression);
    if let Expr::MethodCall(as_ref) = expression
        && as_ref.method == "as_ref"
        && as_ref.args.is_empty()
    {
        return peel_payload(&as_ref.receiver);
    }
    if let Expr::Reference(reference) = expression {
        return peel_payload(&reference.expr);
    }
    if let Expr::Unary(unary) = expression
        && matches!(unary.op, syn::UnOp::Deref(_))
    {
        return peel_payload(&unary.expr);
    }
    return expression;
}

fn path_is(expression: &Expr, segments: &[&str]) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path.qself.is_none()
        && path.path.segments.len() == segments.len()
        && path
            .path
            .segments
            .iter()
            .zip(segments)
            .all(|(segment, expected)| segment.ident == expected);
}

// Whether `function` is proven to compute a panic payload's message as `toThrow` reads it: the
// `String` or `&str` payload, else the empty string. It takes one payload parameter
// (`Box<dyn Any + Send>` or `&(dyn Any + Send)`), returns `String`, and its body is only
//
//     if let Some(message) = payload.downcast_ref::<T>() { return CONVERT(message); }   // any number
//     return MESSAGE;
//
// where MESSAGE is the empty string, `payload.downcast_ref::<T>().map(|m| CONVERT(m))` with an
// empty default, or `match payload.downcast_ref::<T>() { Some(m) => CONVERT(m), None => MESSAGE }`,
// T is `String` or `&str`, and both are read. The function's name is not part of the proof.
fn proven_panic_message_helper(function: &ItemFn) -> bool {
    let signature = &function.sig;
    if signature.asyncness.is_some()
        || !signature.generics.params.is_empty()
        || signature.inputs.len() != 1
    {
        return false;
    }
    let Some(FnArg::Typed(parameter)) = signature.inputs.first() else {
        return false;
    };
    let Pat::Ident(parameter_name) = parameter.pat.as_ref() else {
        return false;
    };
    let ReturnType::Type(_, returned) = &signature.output else {
        return false;
    };
    if !type_is_string(returned) || !type_is_panic_payload(&parameter.ty) {
        return false;
    }
    let payload = parameter_name.ident.to_string();
    let mut read = Vec::new();
    let Some((last, guards)) = function.block.stmts.split_last() else {
        return false;
    };
    for guard in guards {
        let Stmt::Expr(Expr::If(if_let), _) = guard else {
            return false;
        };
        if if_let.else_branch.is_some() {
            return false;
        }
        let Expr::Let(binding) = if_let.cond.as_ref() else {
            return false;
        };
        let Some((bound, payload_type)) =
            some_downcast_binding(&binding.pat, &binding.expr, &payload)
        else {
            return false;
        };
        let [Stmt::Expr(Expr::Return(returned), _)] = if_let.then_branch.stmts.as_slice() else {
            return false;
        };
        if !returned
            .expr
            .as_ref()
            .is_some_and(|value| converts_binding_to_string(value, &bound))
        {
            return false;
        }
        read.push(payload_type);
    }
    let Stmt::Expr(Expr::Return(returned), _) = last else {
        return false;
    };
    let Some(message) = &returned.expr else {
        return false;
    };
    if !panic_message_expression(message, &payload, &mut read) {
        return false;
    }
    return read.contains(&PanicPayloadType::String) && read.contains(&PanicPayloadType::Str);
}

#[derive(PartialEq)]
enum PanicPayloadType {
    Str,
    String,
}

fn panic_message_expression(
    expression: &Expr,
    payload: &str,
    read: &mut Vec<PanicPayloadType>,
) -> bool {
    if expression_is_empty_string(expression) {
        return true;
    }
    if let Expr::Match(choice) = expression {
        let Some(payload_type) = payload_downcast(&choice.expr, payload) else {
            return false;
        };
        let [first, second] = choice.arms.as_slice() else {
            return false;
        };
        let (some, none) = if matches!(&first.pat, Pat::Ident(identifier) if identifier.ident == "None")
            || matches!(&first.pat, Pat::Path(path) if path.path.is_ident("None"))
        {
            (second, first)
        } else {
            (first, second)
        };
        if some.guard.is_some() || none.guard.is_some() {
            return false;
        }
        let Pat::TupleStruct(some_pattern) = &some.pat else {
            return false;
        };
        let [Pat::Ident(bound)] = some_pattern.elems.iter().collect::<Vec<_>>()[..] else {
            return false;
        };
        if !some_pattern.path.is_ident("Some")
            || !converts_binding_to_string(&some.body, &bound.ident.to_string())
        {
            return false;
        }
        let none_is_none = matches!(&none.pat, Pat::Ident(identifier) if identifier.ident == "None")
            || matches!(&none.pat, Pat::Path(path) if path.path.is_ident("None"));
        read.push(payload_type);
        return none_is_none && panic_message_expression(&none.body, payload, read);
    }
    // `payload.downcast_ref::<T>().map(|m| CONVERT(m))` with an empty default.
    let Expr::MethodCall(default) = expression else {
        return false;
    };
    let empty_default = match (default.method.to_string().as_str(), default.args.len()) {
        ("unwrap_or_default", 0) => true,
        ("unwrap_or", 1) => expression_is_empty_string(&default.args[0]),
        ("unwrap_or_else", 1) => {
            path_is(&default.args[0], &["String", "new"])
                || path_is(&default.args[0], &["String", "default"])
        }
        _ => false,
    };
    let Expr::MethodCall(map) = default.receiver.as_ref() else {
        return false;
    };
    if !empty_default || map.method != "map" || map.args.len() != 1 {
        return false;
    }
    let Expr::Closure(convert) = &map.args[0] else {
        return false;
    };
    let [Pat::Ident(bound)] = convert.inputs.iter().collect::<Vec<_>>()[..] else {
        return false;
    };
    let Some(payload_type) = payload_downcast(&map.receiver, payload) else {
        return false;
    };
    if !converts_binding_to_string(&convert.body, &bound.ident.to_string()) {
        return false;
    }
    read.push(payload_type);
    return true;
}

// `Some(bound)` matched against `payload.downcast_ref::<T>()`.
fn some_downcast_binding(
    pattern: &Pat,
    expression: &Expr,
    payload: &str,
) -> Option<(String, PanicPayloadType)> {
    let Pat::TupleStruct(some) = pattern else {
        return None;
    };
    let [Pat::Ident(bound)] = some.elems.iter().collect::<Vec<_>>()[..] else {
        return None;
    };
    if !some.path.is_ident("Some") || bound.subpat.is_some() {
        return None;
    }
    return Some((
        bound.ident.to_string(),
        payload_downcast(expression, payload)?,
    ));
}

// `payload.downcast_ref::<String>()` or `payload.downcast_ref::<&str>()`.
fn payload_downcast(expression: &Expr, payload: &str) -> Option<PanicPayloadType> {
    let Expr::MethodCall(downcast) = unparenthesized(expression) else {
        return None;
    };
    if downcast.method != "downcast_ref"
        || !downcast.args.is_empty()
        || !expression_is_name(&downcast.receiver, payload)
    {
        return None;
    }
    let turbofish = downcast.turbofish.as_ref()?;
    let [syn::GenericArgument::Type(payload_type)] = turbofish.args.iter().collect::<Vec<_>>()[..]
    else {
        return None;
    };
    return match payload_type {
        syn::Type::Reference(reference)
            if reference.mutability.is_none()
                && matches!(reference.elem.as_ref(), syn::Type::Path(path) if path.qself.is_none() && path.path.is_ident("str")) =>
        {
            Some(PanicPayloadType::Str)
        }
        _ if type_is_string(payload_type) => Some(PanicPayloadType::String),
        _ => None,
    };
}

// The bound message (`message` or `*message`) as an owned `String`: `.clone()`, `.to_string()`,
// `.to_owned()` or `String::from(..)`.
fn converts_binding_to_string(expression: &Expr, bound: &str) -> bool {
    let is_bound = |expression: &Expr| {
        let expression = unparenthesized(expression);
        if let Expr::Unary(unary) = expression
            && matches!(unary.op, syn::UnOp::Deref(_))
        {
            return expression_is_name(&unary.expr, bound);
        }
        return expression_is_name(expression, bound);
    };
    return match unparenthesized(expression) {
        Expr::MethodCall(call) => {
            matches!(
                call.method.to_string().as_str(),
                "clone" | "to_string" | "to_owned"
            ) && call.args.is_empty()
                && is_bound(&call.receiver)
        }
        Expr::Call(call) => {
            path_is(&call.func, &["String", "from"])
                && call.args.len() == 1
                && is_bound(&call.args[0])
        }
        _ => false,
    };
}

fn expression_is_empty_string(expression: &Expr) -> bool {
    let empty_literal = |expression: &Expr| {
        matches!(unparenthesized(expression), Expr::Lit(literal)
            if matches!(&literal.lit, syn::Lit::Str(text) if text.value().is_empty()))
    };
    return match unparenthesized(expression) {
        Expr::Call(call) if call.args.is_empty() => {
            path_is(&call.func, &["String", "new"]) || path_is(&call.func, &["String", "default"])
        }
        Expr::Call(call) => {
            path_is(&call.func, &["String", "from"])
                && call.args.len() == 1
                && empty_literal(&call.args[0])
        }
        Expr::MethodCall(call) => {
            matches!(call.method.to_string().as_str(), "to_string" | "to_owned")
                && call.args.is_empty()
                && empty_literal(&call.receiver)
        }
        _ => false,
    };
}

fn type_is_string(rust_type: &syn::Type) -> bool {
    return matches!(rust_type, syn::Type::Path(path) if path.qself.is_none() && path.path.is_ident("String"));
}

// `Box<dyn Any + Send>` or `&(dyn Any + Send)` / `&dyn Any`, with `Any` spelled bare or as
// `std::any::Any`.
fn type_is_panic_payload(rust_type: &syn::Type) -> bool {
    let trait_object_is_any = |rust_type: &syn::Type| {
        let rust_type = match rust_type {
            syn::Type::Paren(paren) => paren.elem.as_ref(),
            rust_type => rust_type,
        };
        let syn::Type::TraitObject(object) = rust_type else {
            return false;
        };
        return object.bounds.iter().any(|bound| {
            matches!(bound, syn::TypeParamBound::Trait(bound)
                if bound.path.segments.last().is_some_and(|segment| segment.ident == "Any"))
        });
    };
    return match rust_type {
        syn::Type::Reference(reference) => {
            reference.mutability.is_none() && trait_object_is_any(&reference.elem)
        }
        syn::Type::Path(path) if path.qself.is_none() => {
            let Some(segment) = path.path.segments.last() else {
                return false;
            };
            let syn::PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                return false;
            };
            let [syn::GenericArgument::Type(inner)] = arguments.args.iter().collect::<Vec<_>>()[..]
            else {
                return false;
            };
            segment.ident == "Box" && trait_object_is_any(inner)
        }
        _ => false,
    };
}

// An exact message as a vitest `toThrow` pattern: anchored, with every regex metacharacter escaped.
fn anchored_message_pattern(message: &str) -> String {
    let mut pattern = String::from("/^");
    for character in message.chars() {
        match character {
            '\\' | '^' | '$' | '.' | '|' | '?' | '*' | '+' | '(' | ')' | '[' | ']' | '{' | '}'
            | '/' => {
                pattern.push('\\');
                pattern.push(character);
            }
            '\n' => pattern.push_str("\\n"),
            '\r' => pattern.push_str("\\r"),
            '\t' => pattern.push_str("\\t"),
            character => pattern.push(character),
        }
    }
    pattern.push_str("$/");
    return pattern;
}

// A caught panic whose `FlightError` payload the test checks, at `statements[start]`:
//
//     let error = catch_unwind(|| ..).unwrap_err();                // or .expect_err(..), or via a result
//     let error = error.downcast_ref::<FlightError>().unwrap();   // or downcast, or .expect(..)
//     assert_eq!(error.kind, FlightErrorKind::RangeError);         // and/or
//     assert_eq!(error.message, "offset is out of bounds");        // or assert!(error.message.contains(..))
//
// The downcast may also chain onto the unwrap (`catch_unwind(..).unwrap_err().downcast::<..>()`), and
// a kind-only check may read `result.is_err_and(|p| p.downcast_ref::<FlightError>()
// .is_some_and(|e| e.kind == K))`. The checked kind and message choose one `toThrow` argument (see
// `FlightErrorMatcher`); a check vitest cannot express exactly does not match, and the
// `catch_unwind` then refuses: a DOMException kind (it lowers without its name), a kind-only `Error`
// (every class extends it), a kind with a substring, no check at all, or a payload read again later.
fn flight_error_assertion(statements: &[Stmt], start: usize) -> Option<PanicAssertion<'_>> {
    if let Some(assertion) = flight_error_is_err_and_assertion(statements, start) {
        return Some(assertion);
    }
    // A bound `FlightError`, or assertions on an inline downcast of a bound payload:
    // `assert_eq!(thrown.downcast::<FlightError>().unwrap().kind, K)`.
    let (closure, error, expect_message, consumed) = match flight_error_binding(statements, start) {
        Some((closure, error, expect_message, consumed)) => {
            (closure, ErrorRef::Bound(error), expect_message, consumed)
        }
        None => {
            let (closure, payload, expect_message, prefix) = caught_panic_error(statements, start)?;
            (
                closure,
                ErrorRef::Inline(payload),
                expect_message.cloned(),
                prefix,
            )
        }
    };
    let mut kind = None;
    let mut exact = None;
    let mut contains = None;
    let mut index = start + consumed;
    while let Some(Stmt::Macro(assertion)) = statements.get(index) {
        let Ok(arguments) = parse_macro_arguments(&assertion.mac) else {
            break;
        };
        if assertion.mac.path.is_ident("assert_eq") && arguments.len() == 2 {
            let pair = [
                (&arguments[0], &arguments[1]),
                (&arguments[1], &arguments[0]),
            ];
            if kind.is_none()
                && let Some(found) = pair.iter().find_map(|(field, value)| {
                    error_field_is(field, &error, "kind").then(|| flight_error_kind(value))?
                })
            {
                kind = Some(found);
            } else if exact.is_none()
                && let Some(found) = pair.iter().find_map(|(field, value)| {
                    error_field_is(field, &error, "message").then(|| string_literal_value(value))?
                })
            {
                exact = Some(found);
            } else {
                break;
            }
        } else if assertion.mac.path.is_ident("assert")
            && arguments.len() == 1
            && contains.is_none()
            && let Expr::MethodCall(call) = unparenthesized(&arguments[0])
            && call.method == "contains"
            && call.args.len() == 1
            && error_field_is(&call.receiver, &error, "message")
        {
            contains = Some(call.args[0].clone());
        } else {
            break;
        }
        index += 1;
    }
    if statements_read_name(&statements[index..], error.name()) {
        return None;
    }
    let matcher = match (kind, exact, contains) {
        (Some(kind), Some(message), None) => {
            let class = exact_error_class(kind)?;
            FlightErrorMatcher::Instance(
                class,
                syn::parse_str::<Expr>(&format!("{message:?}")).ok()?,
            )
        }
        (Some(kind), None, None) => FlightErrorMatcher::Class(instance_exact_error_class(kind)?),
        (None, Some(message), None) => FlightErrorMatcher::ExactMessage(message),
        (None, None, Some(text)) => FlightErrorMatcher::Contains(text),
        _ => return None,
    };
    return Some(PanicAssertion {
        assertion: None,
        closure,
        exact: false,
        expect_message,
        flight_error: Some(matcher),
        length: index - start,
        needle: None,
    });
}

// The closure, the `FlightError` binding's name, the `expect_err` message, and how many statements
// bind it (see `flight_error_assertion`). A binding through a result or payload name requires that
// name be read nowhere after, unless the `FlightError` binding shadows it.
fn flight_error_binding(
    statements: &[Stmt],
    start: usize,
) -> Option<(&syn::ExprClosure, String, Option<Expr>, usize)> {
    if let Some((closure, payload, expect_message, prefix)) = caught_panic_error(statements, start)
        && let Some((error, downcast)) = statements.get(start + prefix).and_then(simple_local)
        && let Some(receiver) = flight_error_downcast(downcast)
        && expression_is_name(receiver, &payload)
        && (error == payload || !statements_read_name(&statements[start + prefix + 1..], &payload))
    {
        return Some((closure, error, expect_message.cloned(), prefix + 1));
    }
    // `let error = catch_unwind(..).unwrap_err().downcast::<FlightError>().unwrap();`
    if let Some((error, downcast)) = statements.get(start).and_then(simple_local)
        && let Some(payload) = flight_error_downcast(downcast)
        && let Some((caught, expect_message)) = unwrapped_panic_payload(payload)
        && let Some(closure) = caught_panic_closure(caught)
    {
        return Some((closure, error, expect_message.cloned(), 1));
    }
    // `let result = catch_unwind(..);` then
    // `let error = result.expect_err(..).downcast::<FlightError>().expect(..);`
    let (result, caught) = statements.get(start).and_then(simple_local)?;
    let closure = caught_panic_closure(caught)?;
    let (error, downcast) = statements.get(start + 1).and_then(simple_local)?;
    let payload = flight_error_downcast(downcast)?;
    let (receiver, expect_message) = unwrapped_panic_payload(payload)?;
    if !expression_is_name(receiver, &result)
        || (error != result && statements_read_name(&statements[start + 2..], &result))
    {
        return None;
    }
    return Some((closure, error, expect_message.cloned(), 2));
}

// `payload.downcast_ref::<FlightError>()` or `payload.downcast::<FlightError>()`, then `.unwrap()` or
// `.expect(..)`: the payload expression.
fn flight_error_downcast(expression: &Expr) -> Option<&Expr> {
    let Expr::MethodCall(unwrap) = unparenthesized(expression) else {
        return None;
    };
    if !matches!(
        (unwrap.method.to_string().as_str(), unwrap.args.len()),
        ("unwrap", 0) | ("expect", 1)
    ) {
        return None;
    }
    let Expr::MethodCall(downcast) = unwrap.receiver.as_ref() else {
        return None;
    };
    return (matches!(
        downcast.method.to_string().as_str(),
        "downcast_ref" | "downcast"
    ) && downcast.args.is_empty()
        && downcast_names_flight_error(downcast))
    .then_some(downcast.receiver.as_ref());
}

// The turbofish names the canonical `FlightError`: `FlightError` or `flight_entity::FlightError`.
fn downcast_names_flight_error(downcast: &syn::ExprMethodCall) -> bool {
    let Some(turbofish) = &downcast.turbofish else {
        return false;
    };
    let [syn::GenericArgument::Type(syn::Type::Path(path))] =
        turbofish.args.iter().collect::<Vec<_>>()[..]
    else {
        return false;
    };
    let segments = path
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    return path.qself.is_none()
        && (segments == ["FlightError"] || segments == ["flight_entity", "FlightError"]);
}

// `assert!(result.is_err_and(|payload| payload.downcast_ref::<FlightError>().is_some_and(|error|
// error.kind == K)))` after `let result = catch_unwind(..);`, with `result` read nowhere after.
fn flight_error_is_err_and_assertion(
    statements: &[Stmt],
    start: usize,
) -> Option<PanicAssertion<'_>> {
    let (result, caught) = statements.get(start).and_then(simple_local)?;
    let closure = caught_panic_closure(caught)?;
    let Some(Stmt::Macro(assertion)) = statements.get(start + 1) else {
        return None;
    };
    if !assertion.mac.path.is_ident("assert") {
        return None;
    }
    let arguments = parse_macro_arguments(&assertion.mac).ok()?;
    let Expr::MethodCall(is_err_and) = unparenthesized(arguments.first()?) else {
        return None;
    };
    if is_err_and.method != "is_err_and"
        || is_err_and.args.len() != 1
        || !expression_is_name(&is_err_and.receiver, &result)
        || statements_read_name(&statements[start + 2..], &result)
    {
        return None;
    }
    let Expr::Closure(check) = &is_err_and.args[0] else {
        return None;
    };
    let [Pat::Ident(payload)] = check.inputs.iter().collect::<Vec<_>>()[..] else {
        return None;
    };
    let body = closure_result_expression(&check.body)?;
    let Expr::MethodCall(is_some_and) = body else {
        return None;
    };
    let Expr::MethodCall(downcast) = is_some_and.receiver.as_ref() else {
        return None;
    };
    if is_some_and.method != "is_some_and"
        || is_some_and.args.len() != 1
        || downcast.method != "downcast_ref"
        || !downcast_names_flight_error(downcast)
        || !expression_is_name(&downcast.receiver, &payload.ident.to_string())
    {
        return None;
    }
    let Expr::Closure(kind_check) = &is_some_and.args[0] else {
        return None;
    };
    let [Pat::Ident(error)] = kind_check.inputs.iter().collect::<Vec<_>>()[..] else {
        return None;
    };
    let Expr::Binary(equals) = closure_result_expression(&kind_check.body)? else {
        return None;
    };
    if !matches!(equals.op, BinOp::Eq(_)) {
        return None;
    }
    let error = ErrorRef::Bound(error.ident.to_string());
    let kind = if error_field_is(&equals.left, &error, "kind") {
        flight_error_kind(&equals.right)?
    } else if error_field_is(&equals.right, &error, "kind") {
        flight_error_kind(&equals.left)?
    } else {
        return None;
    };
    return Some(PanicAssertion {
        assertion: Some(&assertion.mac),
        closure,
        exact: false,
        expect_message: None,
        flight_error: Some(FlightErrorMatcher::Class(instance_exact_error_class(kind)?)),
        length: 2,
        needle: None,
    });
}

// A closure body's value: the expression itself, `{ value }`, or `{ return value; }`.
fn closure_result_expression(body: &Expr) -> Option<&Expr> {
    let Expr::Block(block) = body else {
        return Some(body);
    };
    return match block.block.stmts.as_slice() {
        [Stmt::Expr(Expr::Return(returned), _)] => returned.expr.as_deref(),
        [Stmt::Expr(value, None)] => Some(value),
        _ => None,
    };
}

// `error.field`, or `error.field.as_str()` / `&error.field`. `error` is a bound `FlightError`, or
// (`ErrorRef::Inline`) the payload whose inline `.downcast::<FlightError>().unwrap()` is the base.
fn error_field_is(expression: &Expr, error: &ErrorRef, field: &str) -> bool {
    let mut expression = unparenthesized(expression);
    if let Expr::Reference(reference) = expression {
        expression = unparenthesized(&reference.expr);
    }
    if let Expr::MethodCall(as_str) = expression
        && as_str.method == "as_str"
        && as_str.args.is_empty()
    {
        expression = unparenthesized(&as_str.receiver);
    }
    let Expr::Field(access) = expression else {
        return false;
    };
    let base_is_error = match error {
        ErrorRef::Bound(name) => expression_is_name(&access.base, name),
        ErrorRef::Inline(payload) => flight_error_downcast(&access.base)
            .is_some_and(|receiver| expression_is_name(receiver, payload)),
    };
    return matches!(&access.member, syn::Member::Named(name) if name == field) && base_is_error;
}

// How an assertion names the checked `FlightError`: a binding, or an inline downcast of the payload.
enum ErrorRef {
    Bound(String),
    Inline(String),
}

impl ErrorRef {
    fn name(&self) -> &str {
        return match self {
            ErrorRef::Bound(name) | ErrorRef::Inline(name) => name,
        };
    }
}

// `FlightErrorKind::Variant` (optionally `flight_entity::`-qualified): the variant.
fn flight_error_kind(expression: &Expr) -> Option<String> {
    let Expr::Path(path) = unparenthesized(expression) else {
        return None;
    };
    let segments = path
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    return match segments.as_slice() {
        [owner, variant] | [_, owner, variant] if owner == "FlightErrorKind" => {
            Some(variant.clone())
        }
        _ => None,
    };
}

// The class a `FlightErrorKind` throws as (`throw new K(message)`). DOMException kinds lower without
// their name, so a test cannot tell them apart in TypeScript: they have no class here.
fn exact_error_class(kind: String) -> Option<&'static str> {
    return match kind.as_str() {
        "Error" => Some("Error"),
        "RangeError" => Some("RangeError"),
        "SyntaxError" => Some("SyntaxError"),
        "TypeError" => Some("TypeError"),
        _ => None,
    };
}

// The class `toThrow(K)` checks exactly by `instanceof`: every kind but `Error`, which every class
// extends.
fn instance_exact_error_class(kind: String) -> Option<&'static str> {
    return exact_error_class(kind).filter(|class| *class != "Error");
}

// A string literal, or `"..".to_string()` / `String::from("..")`: its value.
fn string_literal_value(expression: &Expr) -> Option<String> {
    let literal = match unparenthesized(expression) {
        Expr::MethodCall(call)
            if matches!(call.method.to_string().as_str(), "to_string" | "to_owned")
                && call.args.is_empty() =>
        {
            call.receiver.as_ref()
        }
        Expr::Call(call) if path_is(&call.func, &["String", "from"]) && call.args.len() == 1 => {
            &call.args[0]
        }
        expression => expression,
    };
    let Expr::Lit(syn::ExprLit {
        lit: syn::Lit::Str(text),
        ..
    }) = unparenthesized(literal)
    else {
        return None;
    };
    return Some(text.value());
}

const FLIGHT_ERROR_HELPER_SEPARATOR: char = '\u{1f}';

// A proven entity-id test binding, which holds its allocation (`proven_entity_id_bindings`).
const ENTITY_ID_BINDING_MARKER: &str = "@entity-id-binding:";

// A test helper proven to consume either a closure run once under `catch_unwind` or its canonical
// `std::thread::Result`, require a canonical `FlightError` payload of one kind, and optionally
// assert or return its message:
//
//     fn assert_range_error(run: impl FnOnce()) -> String {
//         let payload = catch_unwind(AssertUnwindSafe(run)).expect_err("expected a RangeError");
//         let error = payload.downcast_ref::<FlightError>().expect("a FlightError");
//         assert_eq!(error.kind, FlightErrorKind::RangeError);
//         return error.message.clone();
//     }
//
// A call is then one `toThrow` on the closure it is given or the inline caught-result closure
// (`flight_error_helper_assertion`).
struct FlightErrorHelper {
    input: FlightErrorHelperInput,
    exact_message: Option<String>,
    expect_message: Option<String>,
    kind: String,
    returns_message: bool,
}

#[derive(Clone, Copy)]
enum FlightErrorHelperInput {
    Closure,
    PanicResult,
}

impl FlightErrorHelper {
    fn marker(&self, name: &str) -> String {
        let separator = FLIGHT_ERROR_HELPER_SEPARATOR;
        return format!(
            "{FLIGHT_ERROR_HELPER_MARKER}{name}{separator}{}{separator}{}{separator}{}{separator}{}{separator}{}",
            self.kind,
            u8::from(self.returns_message),
            match self.input {
                FlightErrorHelperInput::Closure => "closure",
                FlightErrorHelperInput::PanicResult => "panic-result",
            },
            self.exact_message
                .as_deref()
                .map_or(String::new(), |message| format!("{message:?}")),
            self.expect_message
                .as_deref()
                .map_or(String::new(), |message| format!("{message:?}")),
        );
    }

    fn from_context(context: &HashSet<String>, name: &str) -> Option<FlightErrorHelper> {
        let prefix = format!("{FLIGHT_ERROR_HELPER_MARKER}{name}{FLIGHT_ERROR_HELPER_SEPARATOR}");
        let marker = context
            .iter()
            .find_map(|marker| marker.strip_prefix(&prefix))?;
        let mut fields = marker.splitn(5, FLIGHT_ERROR_HELPER_SEPARATOR);
        let kind = fields.next()?.to_string();
        let returns_message = fields.next()? == "1";
        let input = match fields.next()? {
            "closure" => FlightErrorHelperInput::Closure,
            "panic-result" => FlightErrorHelperInput::PanicResult,
            _ => return None,
        };
        let exact_message = fields
            .next()
            .filter(|message| !message.is_empty())
            .and_then(|message| syn::parse_str::<syn::LitStr>(message).ok())
            .map(|literal| literal.value());
        let expect_message = fields
            .next()
            .filter(|message| !message.is_empty())
            .and_then(|message| syn::parse_str::<syn::LitStr>(message).ok())
            .map(|literal| literal.value());
        return Some(FlightErrorHelper {
            input,
            exact_message,
            expect_message,
            kind,
            returns_message,
        });
    }
}

// The proof for `function` (see `FlightErrorHelper`), or `None`. Its one parameter is either
// `impl FnOnce()` or the canonical panic result `std::thread::Result<T>`. A closure parameter is
// caught inside the helper; a result parameter must be consumed immediately by `.unwrap_err()`.
// Both shapes then downcast to canonical `FlightError` and assert its kind, optionally followed by
// one exact message assertion. Closure helpers may instead return the message for one exact caller
// assertion. No other statement or read is admitted, so the panic payload cannot escape or be
// reused. The helper's name plays no part in the proof.
fn proven_flight_error_helper(function: &ItemFn) -> Option<FlightErrorHelper> {
    let signature = &function.sig;
    if signature.asyncness.is_some()
        || !signature.generics.params.is_empty()
        || signature.inputs.len() != 1
    {
        return None;
    }
    let Some(FnArg::Typed(parameter)) = signature.inputs.first() else {
        return None;
    };
    let Pat::Ident(parameter_pattern) = parameter.pat.as_ref() else {
        return None;
    };
    let parameter_name = parameter_pattern.ident.to_string();
    let input = if type_is_unit_fn_once(&parameter.ty) {
        FlightErrorHelperInput::Closure
    } else if type_is_thread_result(&parameter.ty) {
        FlightErrorHelperInput::PanicResult
    } else {
        return None;
    };
    let returns_message = match &signature.output {
        ReturnType::Default => false,
        ReturnType::Type(_, returned)
            if matches!(input, FlightErrorHelperInput::Closure) && type_is_string(returned) =>
        {
            true
        }
        ReturnType::Type(..) => return None,
    };
    let statements = function.block.stmts.as_slice();
    // The panic payload, consumed in one or two statements for a closure input and exactly one for
    // a result input.
    let (payload, expect_message, rest) = match input {
        FlightErrorHelperInput::Closure => {
            let (payload, initializer) = simple_local(statements.first()?)?;
            if let Some((caught, message)) = unwrapped_panic_payload(initializer)
                && catches_parameter(caught, &parameter_name)
            {
                (payload, message, &statements[1..])
            } else if catches_parameter(initializer, &parameter_name) {
                let (unwrapped, after) = simple_local(statements.get(1)?)?;
                let (receiver, message) = unwrapped_panic_payload(after)?;
                if !expression_is_name(receiver, &payload) {
                    return None;
                }
                (unwrapped, message, &statements[2..])
            } else {
                return None;
            }
        }
        FlightErrorHelperInput::PanicResult => {
            let (payload, initializer) = simple_local(statements.first()?)?;
            let receiver = unwrap_err_receiver(initializer)?;
            if !expression_is_name(receiver, &parameter_name) {
                return None;
            }
            (payload, None, &statements[1..])
        }
    };
    let (error, downcast) = simple_local(rest.first()?)?;
    if !flight_error_downcast(downcast)
        .is_some_and(|receiver| expression_is_name(receiver, &payload))
    {
        return None;
    }
    let error_ref = ErrorRef::Bound(error.clone());
    let mut kind = None;
    let mut exact_message = None;
    let mut consumed = 1;
    while let Some(Stmt::Macro(assertion)) = rest.get(consumed) {
        let arguments = parse_macro_arguments(&assertion.mac).ok()?;
        if !assertion.mac.path.is_ident("assert_eq") || arguments.len() != 2 {
            break;
        }
        let pairs = [
            (&arguments[0], &arguments[1]),
            (&arguments[1], &arguments[0]),
        ];
        if kind.is_none()
            && let Some(found) = pairs.iter().find_map(|(field, value)| {
                error_field_is(field, &error_ref, "kind").then(|| flight_error_kind(value))?
            })
        {
            kind = Some(found);
        } else if exact_message.is_none()
            && let Some(found) = pairs.iter().find_map(|(field, value)| {
                error_field_is(field, &error_ref, "message").then(|| string_literal_value(value))?
            })
        {
            exact_message = Some(found);
        } else {
            break;
        }
        consumed += 1;
    }
    let kind = kind?;
    exact_error_class(kind.clone())?;
    if exact_message.is_some() && returns_message {
        return None;
    }
    match (&rest[consumed..], returns_message) {
        ([], false) => {}
        ([Stmt::Expr(Expr::Return(returned), _)], true)
            if returned
                .expr
                .as_deref()
                .is_some_and(|value| message_clone_of(value, &error_ref)) => {}
        _ => return None,
    }
    let expect_message = match expect_message {
        Some(message) => Some(string_literal_value(message)?),
        None => None,
    };
    return Some(FlightErrorHelper {
        input,
        exact_message,
        expect_message,
        kind,
        returns_message,
    });
}

// `std::thread::Result<T>`, whose error is the standard caught-panic payload. An ordinary
// `Result<T, E>` is deliberately not inferred as throwable TypeScript error provenance.
fn type_is_thread_result(rust_type: &syn::Type) -> bool {
    let syn::Type::Path(path) = rust_type else {
        return false;
    };
    let segments = path.path.segments.iter().collect::<Vec<_>>();
    let [standard, thread, result] = segments.as_slice() else {
        return false;
    };
    let syn::PathArguments::AngleBracketed(arguments) = &result.arguments else {
        return false;
    };
    return path.qself.is_none()
        && path.path.leading_colon.is_none()
        && standard.ident == "std"
        && thread.ident == "thread"
        && result.ident == "Result"
        && matches!(
            arguments.args.iter().collect::<Vec<_>>()[..],
            [syn::GenericArgument::Type(_)]
        );
}

// The receiver of an exact `.unwrap_err()` call. Broader Result extraction remains unsupported.
fn unwrap_err_receiver(expression: &Expr) -> Option<&Expr> {
    let Expr::MethodCall(call) = unparenthesized(expression) else {
        return None;
    };
    return (call.method == "unwrap_err" && call.args.is_empty()).then_some(call.receiver.as_ref());
}

// `impl FnOnce()`: a closure taking nothing and returning nothing.
fn type_is_unit_fn_once(rust_type: &syn::Type) -> bool {
    let syn::Type::ImplTrait(implemented) = rust_type else {
        return false;
    };
    let [syn::TypeParamBound::Trait(bound)] = implemented.bounds.iter().collect::<Vec<_>>()[..]
    else {
        return false;
    };
    let Some(segment) = bound.path.segments.last() else {
        return false;
    };
    let syn::PathArguments::Parenthesized(arguments) = &segment.arguments else {
        return false;
    };
    return bound.path.segments.len() == 1
        && segment.ident == "FnOnce"
        && arguments.inputs.is_empty()
        && matches!(arguments.output, ReturnType::Default);
}

// `catch_unwind(run)` or `catch_unwind(AssertUnwindSafe(run))` for the parameter `run`.
fn catches_parameter(expression: &Expr, run: &str) -> bool {
    let Expr::Call(call) = unparenthesized(expression) else {
        return false;
    };
    if !path_is_std_panic(&call.func, "catch_unwind") || call.args.len() != 1 {
        return false;
    }
    let mut argument = &call.args[0];
    if let Expr::Call(wrapper) = argument
        && path_is_std_panic(&wrapper.func, "AssertUnwindSafe")
        && wrapper.args.len() == 1
    {
        argument = &wrapper.args[0];
    }
    return expression_is_name(argument, run);
}

// `error.message.clone()` / `.to_string()` / `.to_owned()`.
fn message_clone_of(expression: &Expr, error: &ErrorRef) -> bool {
    let Expr::MethodCall(call) = unparenthesized(expression) else {
        return false;
    };
    return matches!(
        call.method.to_string().as_str(),
        "clone" | "to_string" | "to_owned"
    ) && call.args.is_empty()
        && error_field_is(&call.receiver, error, "message");
}

// A call of a proven `FlightError` helper on a closure literal or an inline `catch_unwind(..)`
// result, at `statements[start]`:
//
//     assert_range_error(|| ..);                              // toThrow(K)
//     let message = assert_range_error(|| ..);               // unread after: toThrow(K)
//     let message = assert_range_error(|| ..);
//     assert_eq!(message, "..");                              // toThrow(new K(".."))
//
// `toThrow(K)` requires a kind nothing else extends; an exact message pairs with any kind.
fn flight_error_helper_assertion<'a>(
    statements: &'a [Stmt],
    start: usize,
    context: &HashSet<String>,
) -> Option<PanicAssertion<'a>> {
    let helper_call = |expression: &'a Expr| -> Option<(&'a syn::ExprClosure, FlightErrorHelper)> {
        let Expr::Call(call) = unparenthesized(expression) else {
            return None;
        };
        let Expr::Path(path) = call.func.as_ref() else {
            return None;
        };
        let helper = FlightErrorHelper::from_context(context, &path.path.get_ident()?.to_string())?;
        let [argument] = call.args.iter().collect::<Vec<_>>()[..] else {
            return None;
        };
        let closure = match helper.input {
            FlightErrorHelperInput::Closure => {
                let Expr::Closure(closure) = argument else {
                    return None;
                };
                closure
            }
            FlightErrorHelperInput::PanicResult => caught_panic_closure(argument)?,
        };
        return (closure.inputs.is_empty() && closure.asyncness.is_none())
            .then_some((closure, helper));
    };
    let assertion = |closure, helper: &FlightErrorHelper, message: Option<Expr>, length| {
        let matcher = match (message, helper.exact_message.as_deref()) {
            (Some(message), _) => {
                FlightErrorMatcher::Instance(exact_error_class(helper.kind.clone())?, message)
            }
            (None, Some(message)) => FlightErrorMatcher::Instance(
                exact_error_class(helper.kind.clone())?,
                syn::parse_str::<Expr>(&format!("{message:?}")).ok()?,
            ),
            (None, None) => {
                FlightErrorMatcher::Class(instance_exact_error_class(helper.kind.clone())?)
            }
        };
        let expect_message = match &helper.expect_message {
            Some(message) => Some(syn::parse_str::<Expr>(&format!("{message:?}")).ok()?),
            None => None,
        };
        return Some(PanicAssertion {
            assertion: None,
            closure,
            exact: false,
            expect_message,
            flight_error: Some(matcher),
            length,
            needle: None,
        });
    };
    let statement = statements.get(start)?;
    // `assert_range_error(|| ..);`
    if let Stmt::Expr(expression, Some(_)) = statement
        && let Some((closure, helper)) = helper_call(expression)
    {
        return assertion(closure, &helper, None, 1);
    }
    // `let message = assert_range_error(|| ..);`, then optionally `assert_eq!(message, "..")`.
    let (message, initializer) = simple_local(statement)?;
    let (closure, helper) = helper_call(initializer)?;
    if let Some(Stmt::Macro(check)) = statements.get(start + 1)
        && check.mac.path.is_ident("assert_eq")
        && let Ok(arguments) = parse_macro_arguments(&check.mac)
        && arguments.len() == 2
        && helper.returns_message
    {
        for (name, value) in [
            (&arguments[0], &arguments[1]),
            (&arguments[1], &arguments[0]),
        ] {
            if expression_is_name(name, &message)
                && let Some(text) = string_literal_value(value)
                && !statements_read_name(&statements[start + 2..], &message)
            {
                let text = syn::parse_str::<Expr>(&format!("{text:?}")).ok()?;
                return assertion(closure, &helper, Some(text), 2);
            }
        }
    }
    if statements_read_name(&statements[start + 1..], &message) {
        return None;
    }
    return assertion(closure, &helper, None, 1);
}

// A test's entity-id comparison: `get_entity_id(..)` is Rust-only identity machinery (D12; its
// `flight-entity` source is rust-only), the id of one allocation. TypeScript compares allocations by
// reference, so a test whose ids serve only identity assertions lowers to object identity:
//
//     let id = get_entity_id(&buffer);               // const id = buffer;
//     initialize_buffer(&mut buffer, 2);
//     assert_eq!(get_entity_id(&buffer), id);        // expect(buffer).toBe(id);
//     assert_ne!(get_entity_id(&copy), id);          // expect(copy).not.toBe(id);
//
// Any other use (arithmetic, ordering, printing, a map key, a read outside such an assertion, or
// production code) has no TypeScript value and refuses at the call.
fn entity_id_operand(expression: &Expr) -> Option<&Expr> {
    let Expr::Call(call) = unparenthesized(expression) else {
        return None;
    };
    if call.args.len() != 1
        || !(path_is(&call.func, &["get_entity_id"])
            || path_is(&call.func, &["flight_entity", "get_entity_id"]))
    {
        return None;
    }
    let mut object = unparenthesized(&call.args[0]);
    while let Expr::Reference(reference) = object {
        object = unparenthesized(&reference.expr);
    }
    return Some(object);
}

// An identity operand of an entity-id assertion: `get_entity_id(object)`'s object, or a proven
// entity-id binding (which already holds its object).
fn entity_identity_operand<'a>(
    expression: &'a Expr,
    context: &HashSet<String>,
) -> Option<&'a Expr> {
    if let Some(object) = entity_id_operand(expression) {
        return Some(object);
    }
    let Expr::Path(path) = unparenthesized(expression) else {
        return None;
    };
    let name = path.path.get_ident()?.to_string();
    return context
        .contains(&format!("{ENTITY_ID_BINDING_MARKER}{name}"))
        .then_some(unparenthesized(expression));
}

// The indices of `let id = get_entity_id(..);` statements in `statements` whose binding is read only
// as an operand of a top-level `assert_eq!`/`assert_ne!` between identity operands (other such
// bindings or `get_entity_id(..)` calls), up to the next `let` of its name. A binding read anywhere
// else is not proven, and neither is one compared with an unproven binding.
fn proven_entity_id_bindings(statements: &[Stmt]) -> HashSet<usize> {
    let mut candidates = statements
        .iter()
        .enumerate()
        .filter_map(|(index, statement)| {
            let (name, initializer) = simple_local(statement)?;
            entity_id_operand(initializer).map(|_| (index, name))
        })
        .collect::<Vec<_>>();
    loop {
        let names = candidates
            .iter()
            .map(|(_, name)| name.clone())
            .collect::<HashSet<_>>();
        let identity_operand = |expression: &Expr| {
            entity_id_operand(expression).is_some()
                || matches!(unparenthesized(expression), Expr::Path(path)
                    if path.path.get_ident().is_some_and(|name| names.contains(&name.to_string())))
        };
        let before = candidates.len();
        candidates.retain(|(index, name)| {
            for statement in &statements[index + 1..] {
                if let Stmt::Local(local) = statement
                    && local_name(&local.pat).as_deref() == Some(name.as_str())
                {
                    // Its initializer still sees this binding.
                    return !statements_read_name(std::slice::from_ref(statement), name);
                }
                if !statements_read_name(std::slice::from_ref(statement), name) {
                    continue;
                }
                let Stmt::Macro(assertion) = statement else {
                    return false;
                };
                if !(assertion.mac.path.is_ident("assert_eq")
                    || assertion.mac.path.is_ident("assert_ne"))
                {
                    return false;
                }
                let Ok(arguments) = parse_macro_arguments(&assertion.mac) else {
                    return false;
                };
                if arguments.len() < 2
                    || !identity_operand(&arguments[0])
                    || !identity_operand(&arguments[1])
                    || statements_read_name_in(arguments.iter().skip(2), name)
                {
                    return false;
                }
            }
            return true;
        });
        if candidates.len() == before {
            break;
        }
    }
    return candidates.into_iter().map(|(index, _)| index).collect();
}

// Whether any of `expressions` reads `name` (an assertion's message arguments).
fn statements_read_name_in<'a>(expressions: impl Iterator<Item = &'a Expr>, name: &str) -> bool {
    return expressions.into_iter().any(|expression| {
        statements_read_name(
            &[Stmt::Expr(expression.clone(), Some(Default::default()))],
            name,
        )
    });
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
                lexical_pattern_context(context, &binding.pat)
            } else {
                context.clone()
            };
            let option_binding = emit_option_binding(&expression.cond, context)?;
            let outer_indent = indent;
            let (indent, wrapped) = if let Some(binding) = &option_binding {
                begin_option_if(
                    out,
                    indent,
                    binding,
                    option_scrutinee_is_rereadable(&expression.cond),
                )
            } else {
                write_indent(out, indent);
                writeln!(
                    out,
                    "if ({}) {{",
                    emit_expression(&expression.cond, context)?
                )
                .expect("writing to a String cannot fail");
                (indent, false)
            };
            emit_block(
                out,
                &expression.then_branch.stmts,
                &then_context,
                indent + 1,
            )?;
            write_indent(out, indent);
            if let Some((_, otherwise)) = &expression.else_branch {
                emit_vitest_else_chain(out, otherwise, context, indent)?;
            } else {
                out.push_str("}\n");
            }
            if wrapped {
                write_indent(out, outer_indent);
                out.push_str("}\n");
            }
        }
        Stmt::Expr(Expr::ForLoop(expression), _) => {
            let loop_context = lexical_pattern_context(context, &expression.pat);
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
                lexical_pattern_context(context, &binding.pat)
            } else {
                context.clone()
            };
            let option_binding = emit_option_binding(&expression.cond, context)?;
            if let Some(binding) = &option_binding {
                begin_option_while(
                    out,
                    indent,
                    binding,
                    option_scrutinee_is_rereadable(&expression.cond),
                );
            } else {
                write_indent(out, indent);
                writeln!(
                    out,
                    "while ({}) {{",
                    emit_expression(&expression.cond, context)?
                )
                .expect("writing to a String cannot fail");
            }
            emit_block(out, &expression.body.stmts, &loop_context, indent + 1)?;
            write_indent(out, indent);
            out.push_str("}\n");
        }
        Stmt::Expr(Expr::Match(expression), _) => {
            emit_match_statement(out, expression, context, indent)?;
        }
        Stmt::Expr(Expr::Break(_), _) => {
            write_indent(out, indent);
            out.push_str("break;\n");
        }
        Stmt::Expr(Expr::Return(expression), _) => {
            write_indent(out, indent);
            if let Some(value) = &expression.expr {
                let emitted = contract_typed_array_return_value(
                    value,
                    emit_expression(value, context)?,
                    context,
                );
                writeln!(out, "return {emitted};")
                    .expect("writing to a String cannot fail");
            } else {
                out.push_str("return;\n");
            }
        }
        Stmt::Expr(Expr::MethodCall(call), _)
            if call.method == "extend" || call.method == "extend_from_slice" =>
        {
            emit_vec_extend_statement(out, call, context, indent)?;
        }
        Stmt::Expr(expression, _) => {
            write_indent(out, indent);
            writeln!(out, "{};", emit_expression(expression, context)?)
                .expect("writing to a String cannot fail");
        }
        // `panic_statements_are_proven` admitted this panic before any function was emitted.
        Stmt::Macro(statement) if panic_macro_is_std(&statement.mac) => {
            write_indent(out, indent);
            writeln!(
                out,
                "throw new Error({});",
                crate::typescript::emit_panic_message(&statement.mac, context)?
            )
            .expect("writing to a String cannot fail");
        }
        Stmt::Macro(statement) => emit_assertion(out, &statement.mac, indent, context)?,
        Stmt::Item(syn::Item::Use(item_use))
            if portable_test_current_contract_use(&item_use.tree, context) => {}
        Stmt::Item(syn::Item::Use(_)) => {
            return Err(compile_error(
                "portable test function-local `use` supports only unrenamed items from the current package `flight_*::contract` module",
            ));
        }
        Stmt::Item(_) => {
            return Err(compile_error(
                "unsupported item declaration inside portable test function",
            ));
        }
    }
    return Ok(());
}

// TypeScript imports are module-scoped, so a Rust block-local import is safe to erase only when its
// unrenamed binding is already guaranteed to come from this generated test's contract module. The
// ordinary symbol collector then emits the actual TypeScript import for every binding the block uses.
fn portable_test_current_contract_use(tree: &UseTree, context: &HashSet<String>) -> bool {
    fn validate(tree: &UseTree, prefix: &mut Vec<String>, context: &HashSet<String>) -> bool {
        return match tree {
            UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                let valid = validate(&path.tree, prefix, context);
                prefix.pop();
                valid
            }
            UseTree::Group(group) => {
                !group.items.is_empty()
                    && group
                        .items
                        .iter()
                        .all(|item| validate(item, prefix, context))
            }
            UseTree::Name(name) => {
                name.ident != "self"
                    && prefix.len() == 2
                    && prefix[1] == "contract"
                    && vitest_current_path_prefix(context, &prefix[0]).is_some()
            }
            UseTree::Glob(_) | UseTree::Rename(_) => false,
        };
    }

    return validate(tree, &mut Vec::new(), context);
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
    let name =
        export_name(context, name).map_or_else(|| snake_to_lower_camel(name), str::to_string);
    writeln!(out, "describe({}, () => {{", js_string_literal(&name))
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

// flight-lint: allow(hashmap-iteration) markers are only tested with `any`, so visit order is unobservable
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
    // A test that awaits through the proven `block_on` executor is an async test.
    let awaits = context
        .iter()
        .filter_map(|marker| marker.strip_prefix(BLOCK_ON_HELPER_MARKER))
        .any(|helper| block_on_tokens_name(function.block.to_token_stream(), helper));
    let arrow = if awaits { "async () =>" } else { "() =>" };
    writeln!(out, "  it({}, {arrow} {{", js_string_literal(&name))
        .expect("writing to a String cannot fail");
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

fn emit_test_constant(
    out: &mut String,
    constant: &syn::ItemConst,
    mutable: bool,
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    if mutable {
        writeln!(
            out,
            "let {} = {};",
            constant.ident,
            emit_expression_for_type(&constant.expr, &constant.ty, context)?
        )
        .expect("writing to a String cannot fail");
        return Ok(());
    }
    writeln!(
        out,
        "const {}: {} = {};",
        constant.ident,
        emit_type(&constant.ty, context)?,
        emit_expression_for_type(&constant.expr, &constant.ty, context)?
    )
    .expect("writing to a String cannot fail");
    return Ok(());
}

// A string-union variant is a literal in TypeScript, so a test may only name it as `Owner::Variant`
// and compare, assign or pass it. Uses that need the Rust enum as a value fail closed: calling through
// the owner (`Owner::from_index(1)` is not a variant), casting or calling a method on a variant,
// formatting one with `{:?}` (Rust prints the bare variant name), importing variants by `use`, and
// reaching the owner through a test `type` alias, which TypeScript keeps as a type only.
fn validate_string_union_test_uses(
    program: &TestProgram,
    context: &HashSet<String>,
) -> Result<(), CompileError> {
    struct StringUnionUseValidator<'a> {
        aliases: HashMap<String, String>,
        context: &'a HashSet<String>,
        error: Option<CompileError>,
    }

    impl StringUnionUseValidator<'_> {
        fn fail(&mut self, message: String) {
            if self.error.is_none() {
                self.error = Some(compile_error(message));
            }
        }

        // The string-union owner and member a path names through its last two segments.
        fn member(&self, path: &syn::Path) -> Option<(String, String)> {
            let [.., owner, member] = path.segments.iter().collect::<Vec<_>>()[..] else {
                return None;
            };
            let owner = owner.ident.to_string();
            return is_string_union(self.context, &owner)
                .then(|| (owner, member.ident.to_string()));
        }

        fn variant(&self, expression: &Expr) -> Option<(String, String)> {
            return match expression {
                Expr::Group(group) => self.variant(&group.expr),
                Expr::Paren(paren) => self.variant(&paren.expr),
                Expr::Reference(reference) => self.variant(&reference.expr),
                Expr::Path(path) if path.qself.is_none() => self.member(&path.path),
                _ => None,
            };
        }

        fn check_use_tree(&mut self, tree: &UseTree) {
            match tree {
                UseTree::Path(path) => {
                    let owner = path.ident.to_string();
                    if is_string_union(self.context, &owner) {
                        self.fail(format!(
                            "importing variants of string union `{owner}` has no portable lowering; reference them as `{owner}::Variant`"
                        ));
                        return;
                    }
                    self.check_use_tree(&path.tree);
                }
                UseTree::Group(group) => {
                    for item in &group.items {
                        self.check_use_tree(item);
                    }
                }
                UseTree::Glob(_) | UseTree::Name(_) | UseTree::Rename(_) => {}
            }
        }

        fn check_format_macro(&mut self, mac: &syn::Macro) {
            let Ok(arguments) =
                Punctuated::<Expr, Token![,]>::parse_terminated.parse2(mac.tokens.clone())
            else {
                return;
            };
            let mut arguments = arguments.into_iter();
            let has_debug = arguments.by_ref().any(|argument| {
                matches!(&argument, Expr::Lit(syn::ExprLit { lit: syn::Lit::Str(template), .. }) if template.value().contains(":?"))
            });
            if !has_debug {
                return;
            }
            for argument in arguments {
                if let Some((owner, variant)) = self.variant(&argument) {
                    self.fail(format!(
                        "formatting string-union variant `{owner}::{variant}` with `{{:?}}` has no portable lowering; compare the variant instead"
                    ));
                }
            }
        }
    }

    impl<'ast> Visit<'ast> for StringUnionUseValidator<'_> {
        fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
            if let Expr::Path(path) = call.func.as_ref()
                && path.qself.is_none()
                && let Some((owner, member)) = self.member(&path.path)
            {
                self.fail(format!(
                    "`{owner}::{member}` is not a variant of string union `{owner}`; a computed member has no portable lowering"
                ));
            }
            syn::visit::visit_expr_call(self, call);
        }

        fn visit_expr_cast(&mut self, cast: &'ast syn::ExprCast) {
            if let Some((owner, variant)) = self.variant(&cast.expr) {
                self.fail(format!(
                    "casting string-union variant `{owner}::{variant}` needs a Rust enum value, which TypeScript does not have"
                ));
            }
            syn::visit::visit_expr_cast(self, cast);
        }

        fn visit_expr_method_call(&mut self, call: &'ast syn::ExprMethodCall) {
            if let Some((owner, variant)) = self.variant(&call.receiver) {
                self.fail(format!(
                    "calling `{}` on string-union variant `{owner}::{variant}` needs a Rust enum value, which TypeScript does not have",
                    call.method
                ));
            }
            syn::visit::visit_expr_method_call(self, call);
        }

        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path.qself.is_none()
                && let [.., owner, member] = path.path.segments.iter().collect::<Vec<_>>()[..]
                && let Some(target) = self.aliases.get(&owner.ident.to_string())
            {
                self.fail(format!(
                    "`{}::{}` reaches string union `{target}` through a type alias, which TypeScript keeps as a type; use `{target}::{}`",
                    owner.ident, member.ident, member.ident
                ));
            }
            syn::visit::visit_expr_path(self, path);
        }

        fn visit_item_use(&mut self, item: &'ast ItemUse) {
            self.check_use_tree(&item.tree);
        }

        // Macro arguments are tokens to `syn`; parse them as expressions so assertions are checked.
        fn visit_macro(&mut self, mac: &'ast syn::Macro) {
            self.check_format_macro(mac);
            if let Ok(arguments) =
                Punctuated::<Expr, Token![,]>::parse_terminated.parse2(mac.tokens.clone())
            {
                for argument in &arguments {
                    self.visit_expr(argument);
                }
            }
        }
    }

    let aliases = program
        .type_aliases
        .iter()
        .filter_map(|alias| {
            let Type::Path(target) = alias.ty.as_ref() else {
                return None;
            };
            let target = target.path.segments.last()?.ident.to_string();
            return is_string_union(context, &target).then(|| (alias.ident.to_string(), target));
        })
        .collect::<HashMap<_, _>>();
    let mut validator = StringUnionUseValidator {
        aliases,
        context,
        error: None,
    };
    for item_use in program
        .uses
        .iter()
        .chain(program.suites.iter().flat_map(|suite| &suite.uses))
    {
        validator.visit_item_use(item_use);
    }
    for constant in &program.constants {
        validator.visit_item_const(constant);
    }
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
        validator.visit_item_fn(function);
    }
    return validator.error.map_or(Ok(()), Err);
}

pub(crate) fn emit_test_program(
    program: &TestProgram,
    contract_module: &str,
    external_type_owners: &BTreeMap<String, &str>,
    context: &HashSet<String>,
) -> Result<String, CompileError> {
    validate_string_union_test_uses(program, context)?;
    let mut panic_helper_context = context.clone();
    for helper in program
        .helpers
        .iter()
        .chain(program.suites.iter().flat_map(|suite| suite.helpers.iter()))
    {
        if proven_panic_message_helper(helper) {
            panic_helper_context
                .insert(format!("{PANIC_MESSAGE_HELPER_MARKER}{}", helper.sig.ident));
        }
        if let Some(proof) = proven_flight_error_helper(helper) {
            panic_helper_context.insert(proof.marker(&helper.sig.ident.to_string()));
        }
    }
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
        panic_statements_are_proven(function)?;
    }
    if let Some(helper) = block_on_calls_are_proven(program, &panic_helper_context)? {
        panic_helper_context.insert(format!("{BLOCK_ON_HELPER_MARKER}{helper}"));
    }
    let context = &panic_helper_context;
    let (mut contract_symbols, mut contract_type_symbols, external_modules) =
        collect_contract_symbols(program, context);
    let (mut cross_crate_values, mut cross_crate_types) =
        crate::typescript::test_cross_crate_imports(program, context)?;
    // `get_entity_id` is Rust-only: every test use lowers to object identity or refuses, so its
    // binding is never imported.
    for specifiers in cross_crate_values.values_mut() {
        specifiers.retain(|specifier| specifier.split(" as ").next() != Some("getEntityId"));
    }
    cross_crate_values.retain(|_, specifiers| !specifiers.is_empty());
    contract_symbols
        .retain(|symbol| !external_type_owners.contains_key(&emit_path_name(symbol, context)));
    contract_type_symbols.retain(|symbol| {
        let name = emit_path_name(symbol, context);
        let Some(module) = external_type_owners.get(&name) else {
            return true;
        };
        cross_crate_types
            .entry((*module).to_string())
            .or_default()
            .insert(name);
        return false;
    });
    let local_type_names = program
        .structs
        .iter()
        .map(|structure| structure.ident.to_string())
        .chain(
            program
                .type_aliases
                .iter()
                .map(|type_alias| type_alias.ident.to_string()),
        )
        .collect::<BTreeSet<_>>();
    let mut represented_local_types = BTreeSet::new();
    for (name, target, module) in type_script_type_aliases(context) {
        if local_type_names.contains(&name) {
            represented_local_types.insert(name);
            if let Some(module) = module {
                cross_crate_types.entry(module).or_default().insert(target);
            }
            continue;
        }
        if !contract_type_symbols.contains(&target) {
            continue;
        }
        contract_type_symbols.retain(|symbol| symbol != &target);
        if let Some(module) = module {
            cross_crate_types.entry(module).or_default().insert(target);
        }
    }
    let mixed_foreign_wildcards =
        crate::typescript::test_mixed_foreign_wildcard_roots(program, context);
    let mut cross_crate_local_names = cross_crate_values
        .values()
        .chain(cross_crate_types.values())
        .flat_map(|names| names.iter())
        .map(|specifier| {
            specifier
                .rsplit_once(" as ")
                .map_or(specifier.as_str(), |(_, local)| local)
                .to_string()
        })
        .collect::<HashSet<_>>();
    let unresolved_wildcard_values = contract_symbols
        .iter()
        .filter(|symbol| {
            let local_name = emit_path_name(symbol, context);
            !cross_crate_local_names.contains(&local_name)
                && !is_vitest_function(context, symbol)
                && frozen_object_name(context, symbol).is_none()
                && !is_string_union(context, symbol)
                && !is_vitest_own_public(context, symbol)
        })
        .cloned()
        .collect::<Vec<_>>();
    if !mixed_foreign_wildcards.is_empty() && !unresolved_wildcard_values.is_empty() {
        if mixed_foreign_wildcards.len() != 1 {
            return Err(compile_error(format!(
                "portable test values {} are unresolved between mixed foreign wildcard crates {}; use explicit Rust imports",
                unresolved_wildcard_values.join(", "),
                mixed_foreign_wildcards
                    .iter()
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }
        let foreign_root = mixed_foreign_wildcards
            .first()
            .expect("one foreign wildcard root exists");
        let Some(package) = foreign_root.strip_prefix("flight_") else {
            return Err(compile_error(format!(
                "portable test values {} come from foreign wildcard crate `{foreign_root}`, which has no @flighthq contract mapping; use explicit Rust imports",
                unresolved_wildcard_values.join(", ")
            )));
        };
        let module = format!("@flighthq/{}/contract", package.replace('_', "-"));
        cross_crate_values.entry(module).or_default().extend(
            unresolved_wildcard_values
                .iter()
                .map(|symbol| emit_path_name(symbol, context)),
        );
        cross_crate_local_names.extend(
            unresolved_wildcard_values
                .iter()
                .map(|symbol| emit_path_name(symbol, context)),
        );
        contract_symbols.retain(|symbol| !unresolved_wildcard_values.contains(symbol));
    }
    let unresolved_wildcard_types = contract_type_symbols
        .iter()
        .filter(|symbol| {
            let local_name = emit_path_name(symbol, context);
            !cross_crate_local_names.contains(&local_name)
                && !is_vitest_struct(context, symbol)
                && !is_string_union(context, symbol)
                && !is_vitest_own_public(context, symbol)
        })
        .cloned()
        .collect::<Vec<_>>();
    if !mixed_foreign_wildcards.is_empty() && !unresolved_wildcard_types.is_empty() {
        if mixed_foreign_wildcards.len() != 1 {
            return Err(compile_error(format!(
                "portable test types {} are unresolved between mixed foreign wildcard crates {}; use explicit Rust imports",
                unresolved_wildcard_types.join(", "),
                mixed_foreign_wildcards
                    .iter()
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }
        let foreign_root = mixed_foreign_wildcards
            .first()
            .expect("one foreign wildcard root exists");
        let Some(package) = foreign_root.strip_prefix("flight_") else {
            return Err(compile_error(format!(
                "portable test types {} come from foreign wildcard crate `{foreign_root}`, which has no @flighthq contract mapping; use explicit Rust imports",
                unresolved_wildcard_types.join(", ")
            )));
        };
        let module = format!("@flighthq/{}/contract", package.replace('_', "-"));
        cross_crate_types.entry(module).or_default().extend(
            unresolved_wildcard_types
                .iter()
                .map(|symbol| emit_path_name(symbol, context)),
        );
        cross_crate_local_names.extend(
            unresolved_wildcard_types
                .iter()
                .map(|symbol| emit_path_name(symbol, context)),
        );
        contract_type_symbols.retain(|symbol| !unresolved_wildcard_types.contains(symbol));
    }
    // The complete emitted value namespace, before contract symbols that are really the dependency's
    // own items are folded into its import: the compiler's Vitest import, contract imports, cross-crate
    // and qualified namespace imports, local helpers and constants, and the injected `PI`. The
    // generator's `rustTestSupport as crate` import is added once the output shows it is needed.
    let dependency_items = crate::typescript::dependency_export_name_local_items(context);
    let mut emitted_imports = cross_crate_values.clone();
    emitted_imports
        .entry("vitest".to_string())
        .or_default()
        .extend(["describe", "expect", "it"].into_iter().map(str::to_string));
    emitted_imports
        .entry(contract_module.to_string())
        .or_default()
        .extend(
            contract_symbols
                .iter()
                .filter(|symbol| !dependency_items.contains(*symbol))
                .map(|symbol| contract_import_name(symbol, context)),
        );
    let local_values = program
        .helpers
        .iter()
        .map(|helper| snake_to_lower_camel(&helper.sig.ident.to_string()))
        .chain(
            program
                .constants
                .iter()
                .map(|constant| emit_path_name(&constant.ident.to_string(), context)),
        )
        .collect::<std::collections::BTreeSet<_>>();
    contract_symbols.retain(|symbol| {
        return !dependency_items.contains(symbol)
            && !cross_crate_local_names.contains(&emit_path_name(symbol, context));
    });
    contract_type_symbols.retain(|symbol| {
        return !dependency_items.contains(symbol)
            && !cross_crate_local_names.contains(&emit_path_name(symbol, context));
    });
    let mut out = String::new();
    out.push_str("import { describe, expect, it } from 'vitest';\n");
    for (module, names) in &cross_crate_values {
        writeln!(
            out,
            "\nimport {{ {} }} from {};",
            names.iter().cloned().collect::<Vec<_>>().join(", "),
            js_string_literal(module)
        )
        .expect("writing to a String cannot fail");
    }
    for (module, names) in &cross_crate_types {
        writeln!(
            out,
            "\nimport type {{ {} }} from {};",
            names.iter().cloned().collect::<Vec<_>>().join(", "),
            js_string_literal(module)
        )
        .expect("writing to a String cannot fail");
    }
    if !contract_symbols.is_empty() {
        out.push_str("\nimport {\n");
        let mut imported = HashSet::new();
        for symbol in &contract_symbols {
            let name = contract_import_name(symbol, context);
            if imported.insert(name.clone()) {
                writeln!(out, "  {name},").expect("writing to a String cannot fail");
            }
        }
        writeln!(out, "}} from {};", js_string_literal(contract_module))
            .expect("writing to a String cannot fail");
    }
    if !contract_type_symbols.is_empty() {
        out.push_str("\nimport type {\n");
        for symbol in &contract_type_symbols {
            writeln!(out, "  {},", emit_path_name(symbol, context))
                .expect("writing to a String cannot fail");
        }
        writeln!(out, "}} from {};", js_string_literal(contract_module))
            .expect("writing to a String cannot fail");
    }
    // The body is emitted apart from the header so namespace imports are decided by the final
    // output: canonical lowering (e.g. FlightError panic-payload downcasts) can erase every use of a
    // qualified `flight_*` path, and an unread `import * as` would add an undeclared dependency.
    let header_len = out.len();
    for type_alias in &program.type_aliases {
        if represented_local_types.contains(&type_alias.ident.to_string()) {
            continue;
        }
        out.push('\n');
        emit_test_type_alias(&mut out, type_alias, context)?;
    }
    for structure in &program.structs {
        if represented_local_types.contains(&structure.ident.to_string()) {
            continue;
        }
        out.push('\n');
        emit_test_struct(&mut out, structure, context)?;
    }
    for constant in &program.constants {
        out.push('\n');
        emit_test_constant(
            &mut out,
            constant,
            program
                .thread_local_cells
                .contains(&constant.ident.to_string()),
            context,
        )?;
    }
    for helper in &program.helpers {
        if proven_panic_message_helper(helper) || proven_flight_error_helper(helper).is_some() {
            continue;
        }
        out.push('\n');
        emit_helper(&mut out, helper, context, 0)?;
    }
    for suite in &program.suites {
        out.push('\n');
        emit_suite(&mut out, suite, &contract_symbols, context)?;
    }
    let body = out.split_off(header_len);
    for module in external_modules {
        let Some(package) = module.strip_prefix("flight_") else {
            continue;
        };
        let namespace = snake_to_lower_camel(&module);
        if !references_namespace(&body, &namespace) {
            continue;
        }
        let specifier = format!("@flighthq/{}/contract", package.replace('_', "-"));
        writeln!(
            out,
            "\nimport * as {namespace} from {};",
            js_string_literal(&specifier)
        )
        .expect("writing to a String cannot fail");
        emitted_imports
            .entry(specifier)
            .or_default()
            .insert(format!("* as {namespace}"));
    }
    out.push_str(&body);
    // The package generator injects `rustTestSupport as crate` exactly when the output reads `crate.`.
    if out.contains("crate.") {
        emitted_imports
            .entry("./rustTestSupport.ts".to_string())
            .or_default()
            .insert("rustTestSupport as crate".to_string());
    }
    crate::typescript::validate_dependency_export_name_bindings(
        context,
        &local_values,
        &emitted_imports,
    )?;
    return Ok(out);
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

/// Whether `body` reads `namespace.` as a standalone identifier, not as the tail of a longer
/// identifier or member path (`otherFlightEntity.`, `x.flightEntity.`).
fn references_namespace(body: &str, namespace: &str) -> bool {
    let needle = format!("{namespace}.");
    return body.match_indices(&needle).any(|(index, _)| {
        return !body[..index].chars().next_back().is_some_and(|previous| {
            previous.is_alphanumeric() || matches!(previous, '_' | '$' | '.')
        });
    });
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

fn unparenthesized(mut expression: &Expr) -> &Expr {
    while let Expr::Paren(parenthesized) = expression {
        expression = &parenthesized.expr;
    }
    return expression;
}
