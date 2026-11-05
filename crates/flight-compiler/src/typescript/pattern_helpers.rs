use syn::visit::Visit;
use syn::{Expr, Pat, Stmt, Type};

use super::shadow_preserves_parameter_type;

pub(super) fn closure_parameter_identifier(pattern: &Pat) -> Option<String> {
    return match pattern {
        Pat::Ident(identifier) => Some(identifier.ident.to_string()),
        Pat::Reference(reference) => closure_parameter_identifier(&reference.pat),
        Pat::Type(typed) => closure_parameter_identifier(&typed.pat),
        _ => None,
    };
}

pub(super) fn emitted_closure_is_identity(emitted: &str) -> bool {
    let s = emitted.trim();
    if let Some(rest) = s.strip_prefix('(') {
        if let Some((param, body)) = rest.split_once(") => ") {
            let param = param.trim();
            let body = body.trim();
            return !param.is_empty()
                && !param.contains(',')
                && !param.contains(':')
                && param == body;
        }
    }
    false
}

pub(super) fn inline_emitted_closure(emitted: &str, receiver: &str) -> Option<String> {
    let s = emitted.trim();
    let rest = s.strip_prefix('(')?;
    let (param, body) = rest.split_once(") => ")?;
    let param = param.trim();
    if param.is_empty() || param.contains(',') || param.contains(':') {
        return None;
    }
    let body = body.trim();
    if body.contains('{') {
        return None;
    }
    let mut result = String::new();
    let mut remaining = body;
    while let Some(pos) = remaining.find(param) {
        let before = pos > 0 && remaining.as_bytes()[pos - 1].is_ascii_alphanumeric();
        let after_end = pos + param.len();
        let after =
            after_end < remaining.len() && remaining.as_bytes()[after_end].is_ascii_alphanumeric();
        if before || after {
            result.push_str(&remaining[..after_end]);
            remaining = &remaining[after_end..];
        } else {
            result.push_str(&remaining[..pos]);
            result.push_str(receiver);
            remaining = &remaining[after_end..];
        }
    }
    result.push_str(remaining);
    Some(result)
}

pub(super) fn pattern_is_mutable(pattern: &Pat) -> bool {
    return match pattern {
        Pat::Ident(identifier) => identifier.mutability.is_some(),
        Pat::Reference(reference) => {
            reference.mutability.is_some() || pattern_is_mutable(&reference.pat)
        }
        Pat::Tuple(tuple) => tuple.elems.iter().any(pattern_is_mutable),
        Pat::TupleStruct(tuple) => tuple.elems.iter().any(pattern_is_mutable),
        Pat::Type(typed) => pattern_is_mutable(&typed.pat),
        _ => false,
    };
}

// Whether every shadow of parameter `name` may lower to a plain reassignment of the TypeScript
// parameter instead of a fresh `name_N` binding. Reassignment overwrites the one JS binding, so it is
// only sound when each shadowing `let` is a top-level statement of the body (a shadow inside a block,
// branch, loop or closure would leak past its Rust scope), no closure or async block reads the
// parameter (it would observe the later value), and each initializer provably keeps the parameter's
// TypeScript type.
pub(super) fn parameter_is_reassignable(
    name: &str,
    parameter_type: &Type,
    body: &syn::Block,
) -> bool {
    struct NestedUseFinder<'a> {
        name: &'a str,
        found: bool,
    }
    impl<'ast> Visit<'ast> for NestedUseFinder<'_> {
        fn visit_local(&mut self, local: &'ast syn::Local) {
            if pattern_binds_name(&local.pat, self.name) {
                self.found = true;
            }
            syn::visit::visit_local(self, local);
        }
        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            self.found |= expression_reads_name(&closure.body, self.name);
            syn::visit::visit_expr_closure(self, closure);
        }
        fn visit_expr_async(&mut self, block: &'ast syn::ExprAsync) {
            self.found |= block_reads_name(&block.block, self.name);
            syn::visit::visit_expr_async(self, block);
        }
    }
    fn pattern_binds_name(pattern: &Pat, name: &str) -> bool {
        struct Binder<'a> {
            name: &'a str,
            found: bool,
        }
        impl<'ast> Visit<'ast> for Binder<'_> {
            fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
                self.found |= pattern.ident == self.name;
                syn::visit::visit_pat_ident(self, pattern);
            }
        }
        let mut binder = Binder { name, found: false };
        binder.visit_pat(pattern);
        return binder.found;
    }
    struct Reader<'a> {
        name: &'a str,
        found: bool,
    }
    impl<'ast> Visit<'ast> for Reader<'_> {
        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            self.found |= path.qself.is_none() && path.path.is_ident(self.name);
            syn::visit::visit_expr_path(self, path);
        }
    }
    fn expression_reads_name(expression: &Expr, name: &str) -> bool {
        let mut reader = Reader { name, found: false };
        reader.visit_expr(expression);
        return reader.found;
    }
    fn block_reads_name(block: &syn::Block, name: &str) -> bool {
        let mut reader = Reader { name, found: false };
        reader.visit_block(block);
        return reader.found;
    }
    let mut finder = NestedUseFinder { name, found: false };
    for statement in &body.stmts {
        match statement {
            Stmt::Local(local) if pattern_binds_name(&local.pat, name) => {
                let pattern = match &local.pat {
                    Pat::Type(typed) => typed.pat.as_ref(),
                    pattern => pattern,
                };
                let Pat::Ident(identifier) = pattern else {
                    return false;
                };
                let Some(initializer) = &local.init else {
                    return false;
                };
                if identifier.subpat.is_some()
                    || identifier.by_ref.is_some()
                    || initializer.diverge.is_some()
                    || !shadow_preserves_parameter_type(name, parameter_type, &initializer.expr)
                {
                    return false;
                }
                finder.visit_expr(&initializer.expr);
            }
            statement => finder.visit_stmt(statement),
        }
        if finder.found {
            return false;
        }
    }
    return true;
}
