use std::collections::HashSet;
use std::fmt::Write;

use quote::ToTokens;
use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::visit::Visit;
use syn::{BinOp, Expr, Lit, Token, Type};

use crate::CompileError;

use super::{
    FINISH_ENTITY_RETURN_MARKER, TRY_COUNTER_MARKER, TRY_SUBSTITUTION_MARKER, emit_expression,
    is_string_union, lexical_binding, option_return_absent_value, path_owner_and_member,
    write_indent,
};
pub(super) fn bitand_mask_type(expression: &Expr) -> Option<String> {
    let value = match expression {
        Expr::Lit(lit) => match &lit.lit {
            Lit::Int(int_lit) => int_lit.base10_parse::<u64>().ok()?,
            _ => return None,
        },
        _ => return None,
    };
    return match value {
        0xff => Some("u8".to_string()),
        0xffff => Some("u16".to_string()),
        _ => None,
    };
}

// Whether an emitted TypeScript expression is an entity name (`a` or `a.b.c`), the only operand
// form a type-position `typeof` accepts.
pub(super) fn is_typeof_entity_name(expression: &str) -> bool {
    return expression.split('.').all(|segment| {
        let mut chars = segment.chars();
        return chars
            .next()
            .is_some_and(|first| first.is_alphabetic() || first == '_' || first == '$')
            && chars.all(|c| c.is_alphanumeric() || c == '_' || c == '$');
    });
}

pub(super) fn is_widening_integer_cast(source: &str, target: &str) -> bool {
    if source == target {
        return true;
    }
    return match (source, target) {
        ("u32", "usize") | ("usize", "u32" | "i32" | "isize") => true,
        ("i32", "isize") | ("isize", "i32") => true,
        ("u8", "u16" | "u32" | "usize" | "i16" | "i32" | "isize") => true,
        ("u16", "u32" | "usize" | "i32" | "isize") => true,
        ("i8", "i16" | "i32" | "isize") => true,
        ("i16", "i32" | "isize") => true,
        ("f32", "f64") => true,
        _ => false,
    };
}

pub(super) fn strip_as_ptr(expression: &Expr) -> &Expr {
    let expr = peel_reference_and_paren(expression);
    if let Expr::MethodCall(call) = expr {
        if call.method == "as_ptr" && call.args.is_empty() {
            return &call.receiver;
        }
    }
    return expression;
}

pub(super) fn peel_reference_and_paren(expression: &Expr) -> &Expr {
    return match expression {
        Expr::Group(group) => peel_reference_and_paren(&group.expr),
        Expr::Paren(paren) => peel_reference_and_paren(&paren.expr),
        Expr::Reference(reference) => peel_reference_and_paren(&reference.expr),
        _ => expression,
    };
}

pub(super) fn expression_contains_method(expression: &Expr, expected: &str) -> bool {
    struct MethodFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for MethodFinder<'_> {
        fn visit_expr_method_call(&mut self, call: &'ast syn::ExprMethodCall) {
            if call.method == self.expected {
                self.found = true;
            }
            syn::visit::visit_expr_method_call(self, call);
        }
    }

    let mut finder = MethodFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_expr(&mut finder, expression);
    return finder.found;
}

pub(super) fn expression_contains_unconditional_try(expression: &Expr) -> bool {
    struct TryFinder {
        found: bool,
        conditional_depth: usize,
    }

    impl<'ast> syn::visit::Visit<'ast> for TryFinder {
        fn visit_expr_try(&mut self, node: &'ast syn::ExprTry) {
            if self.conditional_depth == 0 {
                self.found = true;
            }
            syn::visit::visit_expr_try(self, node);
        }
        fn visit_expr_closure(&mut self, _: &'ast syn::ExprClosure) {}
        fn visit_expr_async(&mut self, _: &'ast syn::ExprAsync) {}
        fn visit_expr_match(&mut self, node: &'ast syn::ExprMatch) {
            syn::visit::Visit::visit_expr(&mut *self, &node.expr);
            self.conditional_depth += 1;
            for arm in &node.arms {
                syn::visit::Visit::visit_arm(&mut *self, arm);
            }
            self.conditional_depth -= 1;
        }
        fn visit_expr_if(&mut self, node: &'ast syn::ExprIf) {
            syn::visit::Visit::visit_expr(&mut *self, &node.cond);
            self.conditional_depth += 1;
            syn::visit::Visit::visit_block(&mut *self, &node.then_branch);
            if let Some((_, else_branch)) = &node.else_branch {
                syn::visit::Visit::visit_expr(&mut *self, else_branch);
            }
            self.conditional_depth -= 1;
        }
        fn visit_expr_binary(&mut self, node: &'ast syn::ExprBinary) {
            syn::visit::Visit::visit_expr(&mut *self, &node.left);
            if matches!(node.op, BinOp::And(_) | BinOp::Or(_)) {
                self.conditional_depth += 1;
                syn::visit::Visit::visit_expr(&mut *self, &node.right);
                self.conditional_depth -= 1;
            } else {
                syn::visit::Visit::visit_expr(&mut *self, &node.right);
            }
        }
    }

    let mut finder = TryFinder {
        found: false,
        conditional_depth: 0,
    };
    syn::visit::Visit::visit_expr(&mut finder, expression);
    return finder.found;
}

pub(super) fn collect_unconditional_try_expressions<'a>(
    expression: &'a Expr,
) -> Vec<&'a syn::ExprTry> {
    struct TryCollector<'b> {
        nodes: Vec<&'b syn::ExprTry>,
        conditional_depth: usize,
    }

    impl<'ast> syn::visit::Visit<'ast> for TryCollector<'ast> {
        fn visit_expr_try(&mut self, node: &'ast syn::ExprTry) {
            if self.conditional_depth == 0 {
                self.nodes.push(node);
            }
            syn::visit::visit_expr_try(self, node);
        }
        fn visit_expr_closure(&mut self, _: &'ast syn::ExprClosure) {}
        fn visit_expr_async(&mut self, _: &'ast syn::ExprAsync) {}
        fn visit_expr_match(&mut self, node: &'ast syn::ExprMatch) {
            syn::visit::Visit::visit_expr(&mut *self, &node.expr);
            self.conditional_depth += 1;
            for arm in &node.arms {
                syn::visit::Visit::visit_arm(&mut *self, arm);
            }
            self.conditional_depth -= 1;
        }
        fn visit_expr_if(&mut self, node: &'ast syn::ExprIf) {
            syn::visit::Visit::visit_expr(&mut *self, &node.cond);
            self.conditional_depth += 1;
            syn::visit::Visit::visit_block(&mut *self, &node.then_branch);
            if let Some((_, else_branch)) = &node.else_branch {
                syn::visit::Visit::visit_expr(&mut *self, else_branch);
            }
            self.conditional_depth -= 1;
        }
        fn visit_expr_binary(&mut self, node: &'ast syn::ExprBinary) {
            syn::visit::Visit::visit_expr(&mut *self, &node.left);
            if matches!(node.op, BinOp::And(_) | BinOp::Or(_)) {
                self.conditional_depth += 1;
                syn::visit::Visit::visit_expr(&mut *self, &node.right);
                self.conditional_depth -= 1;
            } else {
                syn::visit::Visit::visit_expr(&mut *self, &node.right);
            }
        }
    }

    let mut collector = TryCollector {
        nodes: vec![],
        conditional_depth: 0,
    };
    syn::visit::Visit::visit_expr(&mut collector, expression);
    collector.nodes.reverse();
    return collector.nodes;
}

pub(super) fn emit_try_pre_extractions(
    out: &mut String,
    expression: &Expr,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<HashSet<String>, CompileError> {
    let try_nodes = collect_unconditional_try_expressions(expression);
    if try_nodes.is_empty() {
        return Ok(entities.clone());
    }
    let base_index = entities
        .iter()
        .find_map(|m| m.strip_prefix(TRY_COUNTER_MARKER))
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);
    let mut context = entities.clone();
    for (offset, try_node) in try_nodes.iter().enumerate() {
        let inner = emit_expression(&try_node.expr, &context)?;
        let key = try_node.to_token_stream().to_string();
        let temp = format!("__try{}", base_index + offset);
        write_indent(out, indent);
        writeln!(out, "const {temp} = {inner};").expect("writing to a String cannot fail");
        write_indent(out, indent);
        writeln!(out, "if ({temp} === undefined) {{").expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "return {};", option_return_absent_value(entities))
            .expect("writing to a String cannot fail");
        write_indent(out, indent);
        writeln!(out, "}}").expect("writing to a String cannot fail");
        context.insert(format!("{TRY_SUBSTITUTION_MARKER}{key}={temp}"));
    }
    context.retain(|m| !m.starts_with(TRY_COUNTER_MARKER));
    context.insert(format!(
        "{TRY_COUNTER_MARKER}{}",
        base_index + try_nodes.len()
    ));
    return Ok(context);
}

pub(super) fn expression_contains_string_union_variant(
    expression: &Expr,
    context: &HashSet<String>,
) -> bool {
    struct StringUnionVariantFinder<'a> {
        context: &'a HashSet<String>,
        found: bool,
    }

    impl<'ast> Visit<'ast> for StringUnionVariantFinder<'_> {
        fn visit_expr_macro(&mut self, expression: &'ast syn::ExprMacro) {
            if expression
                .mac
                .path
                .segments
                .last()
                .is_some_and(|segment| segment.ident == "vec")
                && let Ok(values) = Punctuated::<Expr, Token![,]>::parse_terminated
                    .parse2(expression.mac.tokens.clone())
            {
                for value in &values {
                    self.visit_expr(value);
                }
            }
        }

        fn visit_expr_path(&mut self, expression: &'ast syn::ExprPath) {
            if expression.qself.is_none()
                && let Some((owner, _)) = path_owner_and_member(&expression.path)
                && is_string_union(self.context, &owner)
            {
                self.found = true;
            }
            syn::visit::visit_expr_path(self, expression);
        }
    }

    let mut finder = StringUnionVariantFinder {
        context,
        found: false,
    };
    finder.visit_expr(expression);
    return finder.found;
}

// A const assertion is useful for aggregate literals containing string-union variants because
// TypeScript otherwise widens their elements or fields. It is invalid on a call expression, even
// when one of the call's arguments lowers from a Rust enum variant to a string literal.
pub(super) fn expression_requires_string_union_const_assertion(
    expression: &Expr,
    context: &HashSet<String>,
) -> bool {
    let aggregate = match expression {
        Expr::Array(_) | Expr::Repeat(_) | Expr::Struct(_) | Expr::Tuple(_) => expression,
        Expr::Macro(macro_expression)
            if macro_expression
                .mac
                .path
                .segments
                .last()
                .is_some_and(|segment| segment.ident == "vec") =>
        {
            expression
        }
        Expr::Call(call)
            if call.args.len() == 1
                && (expression_is_path(&call.func, "Some")
                    || expression_is_path(&call.func, "Ok")) =>
        {
            return expression_requires_string_union_const_assertion(&call.args[0], context);
        }
        Expr::Group(group) => {
            return expression_requires_string_union_const_assertion(&group.expr, context);
        }
        Expr::Paren(paren) => {
            return expression_requires_string_union_const_assertion(&paren.expr, context);
        }
        Expr::Reference(reference) => {
            return expression_requires_string_union_const_assertion(&reference.expr, context);
        }
        _ => return false,
    };
    return expression_contains_string_union_variant(aggregate, context);
}

pub(super) fn expression_contains_path(block: &syn::Block, expected: &str) -> bool {
    struct PathFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for PathFinder<'_> {
        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path
                .path
                .segments
                .last()
                .is_some_and(|segment| segment.ident == self.expected)
            {
                self.found = true;
            }
            syn::visit::visit_expr_path(self, path);
        }
    }

    let mut finder = PathFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_block(&mut finder, block);
    return finder.found;
}

pub(super) fn numeric_associated_call_type(func: &Expr) -> Option<String> {
    let Expr::Path(path) = func else {
        return None;
    };
    if let Some(qself) = path.qself.as_ref() {
        let Type::Path(type_path) = qself.ty.as_ref() else {
            return None;
        };
        if type_path.qself.is_some() || type_path.path.segments.len() != 1 {
            return None;
        }
        let type_name = type_path.path.segments[0].ident.to_string();
        return match type_name.as_str() {
            "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128" | "isize" | "u8" | "u16"
            | "u32" | "u64" | "u128" | "usize" => Some(type_name),
            _ => None,
        };
    }
    if path.path.segments.len() == 2 {
        let type_name = path.path.segments[0].ident.to_string();
        return match type_name.as_str() {
            "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128" | "isize" | "u8" | "u16"
            | "u32" | "u64" | "u128" | "usize" => Some(type_name),
            _ => None,
        };
    }
    return None;
}

pub(super) fn expression_is_associated_path(expression: &Expr, owner: &str, member: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    if path.path.segments.len() < 2 {
        return false;
    }
    let mut segments = path.path.segments.iter().rev();
    return segments
        .next()
        .is_some_and(|segment| segment.ident == member)
        && segments
            .next()
            .is_some_and(|segment| segment.ident == owner);
}

pub(super) fn expression_is_none(expression: &Expr) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path.path.is_ident("None");
}

pub(crate) fn expression_is_path(expression: &Expr, expected: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path.path.is_ident(expected);
}

pub(super) fn expression_is_finished_entity_return(
    expression: &Expr,
    context: &HashSet<String>,
) -> bool {
    let inner = super::peel_ref_constructor(expression);
    let Expr::Path(path) = inner else {
        return false;
    };
    if path.qself.is_some() || path.path.segments.len() != 1 {
        return false;
    }
    let name = path.path.segments[0].ident.to_string();
    return lexical_binding(context, &name)
        .is_some_and(|id| context.contains(&format!("{FINISH_ENTITY_RETURN_MARKER}{id}")));
}

pub(super) fn expression_is_path_call(expression: &Expr, expected: &str) -> bool {
    let Expr::Call(call) = expression else {
        return false;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return false;
    };
    return call.args.is_empty()
        && path
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == expected);
}

pub(super) fn expression_kind(expression: &Expr) -> &'static str {
    return match expression {
        Expr::Async(_) => "async block",
        Expr::Await(_) => "await expression",
        Expr::Block(_) => "block expression",
        Expr::Break(_) => "break expression",
        Expr::Closure(_) => "closure",
        Expr::Const(_) => "const block",
        Expr::Continue(_) => "continue expression",
        Expr::ForLoop(_) => "for loop",
        Expr::If(_) => "if expression",
        Expr::Let(_) => "let expression",
        Expr::Loop(_) => "loop",
        Expr::Macro(_) => "macro expression",
        Expr::Match(_) => "match expression",
        Expr::Range(_) => "range expression",
        Expr::RawAddr(_) => "raw address",
        Expr::Repeat(_) => "array repeat expression",
        Expr::Return(_) => "return expression",
        Expr::Try(_) => "try expression",
        Expr::TryBlock(_) => "try block",
        Expr::Unsafe(_) => "unsafe block",
        Expr::Verbatim(_) => "verbatim tokens",
        Expr::While(_) => "while loop",
        Expr::Yield(_) => "yield expression",
        _ => "unknown expression",
    };
}

pub(super) fn expression_path_ends_with(expression: &Expr, expected: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path
        .path
        .segments
        .last()
        .is_some_and(|segment| segment.ident == expected);
}
