use std::collections::{BTreeSet, HashSet};

use syn::visit::Visit;
use syn::{BinOp, Expr, Lit, Pat, Stmt, Type, UnOp};

use super::{
    BindingFact, ENTITY_CLONE_FIELD_MARKER, EmptyVecInitializer, NULLABLE_BINDING_MARKER,
    NULLABLE_OPTION_BINDING_MARKER, NULLABLE_OPTION_CALLABLE_BINDING_MARKER,
    NULLABLE_OPTION_FIELD_MARKER, NULLABLE_OPTION_RETURN_MARKER, NULLABLE_OPTIONS_MARKER,
    ORDERED_PRIMITIVE_MARKER, PRIMARY_PRECEDENCE, PROVENANCE_SEPARATOR, RENAME_MARKER,
    TYPE_SCRIPT_NULLABLE_OPTION_RETURN_MARKER, call_fact, current_source,
    direct_lock_guard_receiver, empty_vec_initializer, expression_is_known_string,
    expression_numeric_type, expression_precedence, expression_struct_identity,
    inferred_vitest_struct_literal_name, is_integer_division, is_type_script_nullable_option_field,
    is_widening_integer_cast, lexical_binding, lexical_fact, named_type, peel_reference_and_paren,
    referenced_path_identifier, snake_to_lower_camel,
};

pub(super) fn expression_is_empty_vec(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::Group(group) => expression_is_empty_vec(&group.expr, entities),
        Expr::Paren(paren) => expression_is_empty_vec(&paren.expr, entities),
        _ => matches!(
            empty_vec_initializer(expression, entities),
            Some(EmptyVecInitializer::Standard(_))
        ),
    };
}

pub(super) fn unique_marker_suffix(entities: &HashSet<String>, prefix: &str) -> Option<String> {
    let matches = entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(prefix))
        .collect::<BTreeSet<_>>();
    if matches.len() != 1 {
        return None;
    }
    return matches.first().map(|suffix| (*suffix).to_string());
}

pub(super) fn has_entity_clone_fields(entities: &HashSet<String>, owner: &str) -> bool {
    let prefix = format!("{ENTITY_CLONE_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}");
    return entities.iter().any(|marker| marker.starts_with(&prefix));
}

pub(super) fn entity_clone_expression_owner(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    let identity = expression_struct_name(expression, entities)?;
    let owner = identity
        .rsplit_once(PROVENANCE_SEPARATOR)
        .map_or(identity.as_str(), |(_, owner)| owner);
    return has_entity_clone_fields(entities, owner).then(|| owner.to_string());
}

pub(super) fn emit_entity_clone(receiver: &str, owner: &str, entities: &HashSet<String>) -> String {
    let prefix = format!("{ENTITY_CLONE_FIELD_MARKER}{owner}{PROVENANCE_SEPARATOR}");
    let fields = entities
        .iter()
        .filter_map(|marker| marker.strip_prefix(&prefix))
        .map(snake_to_lower_camel)
        .collect::<BTreeSet<_>>();
    let descriptors = fields
        .iter()
        .map(|field| {
            format!(
                "{field}: {{ get: () => {receiver}.{field}, set: (value) => {{ {receiver}.{field} = value; }}, enumerable: true, configurable: true }}"
            )
        })
        .collect::<Vec<_>>()
        .join(", ");
    return format!("Object.defineProperties({{ ...{receiver} }}, {{ {descriptors} }})");
}

pub(super) fn expression_is_field_projection(expression: &Expr, parameter: &syn::Ident) -> bool {
    return match expression {
        Expr::Field(field) => {
            matches!(field.member, syn::Member::Named(_))
                && (expression_is_field_projection(&field.base, parameter)
                    || matches!(field.base.as_ref(), Expr::Path(path) if path.path.is_ident(parameter)))
        }
        Expr::Group(group) => expression_is_field_projection(&group.expr, parameter),
        _ => false,
    };
}

pub(super) fn expression_is_ordered_primitive(
    expression: &Expr,
    entities: &HashSet<String>,
) -> bool {
    return match expression {
        Expr::Binary(binary)
            if matches!(
                binary.op,
                BinOp::Add(_) | BinOp::Sub(_) | BinOp::Mul(_) | BinOp::Div(_) | BinOp::Rem(_)
            ) =>
        {
            expression_is_ordered_primitive(&binary.left, entities)
                && expression_is_ordered_primitive(&binary.right, entities)
        }
        Expr::Call(_) | Expr::Cast(_) | Expr::Field(_) | Expr::Index(_) | Expr::MethodCall(_) => {
            true
        }
        Expr::Group(group) => expression_is_ordered_primitive(&group.expr, entities),
        Expr::Lit(literal) => matches!(&literal.lit, Lit::Int(_) | Lit::Str(_)),
        Expr::Paren(paren) => expression_is_ordered_primitive(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments.first().is_some_and(|segment| {
                entities.contains(&format!("{ORDERED_PRIMITIVE_MARKER}{}", segment.ident))
            }) || expression_is_known_string(expression, entities)
        }
        Expr::Reference(reference) => expression_is_ordered_primitive(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_is_ordered_primitive(&unary.expr, entities)
        }
        _ => expression_is_known_string(expression, entities),
    };
}

pub(super) fn method_chain_includes(expression: &Expr, method_name: &str) -> bool {
    return match expression {
        Expr::MethodCall(call) => {
            call.method == method_name || method_chain_includes(&call.receiver, method_name)
        }
        _ => false,
    };
}

pub(super) fn immediate_receiver_is_method(expression: &Expr, method_name: &str) -> bool {
    return matches!(expression, Expr::MethodCall(call) if call.method == method_name);
}

pub(super) fn expression_is_reusable(expression: &Expr) -> bool {
    return match expression {
        Expr::Field(field) => expression_is_reusable(&field.base),
        Expr::Group(group) => expression_is_reusable(&group.expr),
        Expr::Lit(_) => true,
        Expr::Paren(paren) => expression_is_reusable(&paren.expr),
        Expr::Path(path) => path.qself.is_none(),
        Expr::Reference(reference) => expression_is_reusable(&reference.expr),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_is_reusable(&unary.expr)
        }
        _ => false,
    };
}

pub(super) fn expression_struct_name(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Option<String> {
    return match expression {
        Expr::Group(group) => expression_struct_name(&group.expr, entities),
        Expr::MethodCall(_) => direct_lock_guard_receiver(expression)
            .and_then(|receiver| expression_struct_name(receiver, entities)),
        Expr::Paren(paren) => expression_struct_name(&paren.expr, entities),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            match lexical_fact(entities, &path.path.segments[0].ident.to_string()) {
                Some(BindingFact::Structure(identity)) => Some(identity),
                _ => None,
            }
        }
        Expr::Reference(reference) => expression_struct_name(&reference.expr, entities),
        Expr::Unary(unary) if matches!(unary.op, UnOp::Deref(_)) => {
            expression_struct_name(&unary.expr, entities)
        }
        _ => None,
    };
}

pub(crate) fn option_absent_value(expression: &Expr, entities: &HashSet<String>) -> &'static str {
    let normalized = current_source(entities).is_some();
    if entities.contains(NULLABLE_OPTIONS_MARKER)
        || expression_is_type_script_nullable_option_field(expression, entities)
        || expression_is_type_script_nullable_option_return(expression, entities)
        || !normalized && expression_is_nullable_option_field(expression, entities)
        || !normalized && expression_is_nullable_option_return(expression, entities)
        || referenced_path_identifier(expression)
            .and_then(|name| lexical_binding(entities, &name))
            .is_some_and(|id| entities.contains(&format!("{NULLABLE_OPTION_BINDING_MARKER}{id}")))
        || referenced_path_identifier(expression)
            .is_some_and(|name| entities.contains(&format!("{NULLABLE_BINDING_MARKER}{name}")))
        || expression_is_nullable_callable_return(expression, entities)
    {
        return "null";
    }
    return "undefined";
}

pub(super) fn expression_is_nullable_callable_return(
    expression: &Expr,
    entities: &HashSet<String>,
) -> bool {
    let Expr::Call(call) = peel_reference_and_paren(expression) else {
        return false;
    };
    let Some(name) = referenced_path_identifier(&call.func) else {
        return false;
    };
    return lexical_binding(entities, &name).is_some_and(|id| {
        !id.is_empty()
            && entities.contains(&format!("{NULLABLE_OPTION_CALLABLE_BINDING_MARKER}{id}"))
    });
}

pub(super) fn expression_is_nullable_option_return(
    expression: &Expr,
    entities: &HashSet<String>,
) -> bool {
    let Expr::Call(call) = expression else {
        return false;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return false;
    };
    return call_fact(entities, NULLABLE_OPTION_RETURN_MARKER, &path.path).is_some();
}

pub(super) fn expression_is_type_script_nullable_option_return(
    expression: &Expr,
    entities: &HashSet<String>,
) -> bool {
    let Expr::Call(call) = expression else {
        return false;
    };
    let Expr::Path(path) = call.func.as_ref() else {
        return false;
    };
    return call_fact(
        entities,
        TYPE_SCRIPT_NULLABLE_OPTION_RETURN_MARKER,
        &path.path,
    )
    .is_some();
}

pub(super) fn expression_is_nullable_option_field(
    expression: &Expr,
    entities: &HashSet<String>,
) -> bool {
    let Expr::Field(field) = expression else {
        return false;
    };
    let syn::Member::Named(field_name) = &field.member else {
        return false;
    };
    let structure = if current_source(entities).is_some() {
        expression_struct_identity(&field.base, entities)
    } else {
        inferred_vitest_struct_literal_name(&field.base, entities)
    };
    let Some(structure) = structure else {
        return false;
    };
    return entities.contains(&format!(
        "{NULLABLE_OPTION_FIELD_MARKER}{structure}{PROVENANCE_SEPARATOR}{field_name}"
    )) || is_type_script_nullable_option_field(entities, &structure, field_name);
}

pub(super) fn expression_is_type_script_nullable_option_field(
    expression: &Expr,
    entities: &HashSet<String>,
) -> bool {
    let Expr::Field(field) = expression else {
        return false;
    };
    let syn::Member::Named(field_name) = &field.member else {
        return false;
    };
    let Some(structure) = expression_struct_identity(&field.base, entities) else {
        return false;
    };
    return is_type_script_nullable_option_field(entities, &structure, field_name);
}

pub(super) struct TuplePatternBinding {
    pub(super) mutable: bool,
    pub(super) name: String,
    pub(super) path: Vec<usize>,
}

pub(super) fn tuple_pattern_bindings(tuple: &syn::PatTuple) -> Vec<TuplePatternBinding> {
    fn collect(pattern: &Pat, path: &mut Vec<usize>, out: &mut Vec<TuplePatternBinding>) {
        match pattern {
            Pat::Ident(ident) if ident.ident != "_" && ident.ident != "None" => {
                out.push(TuplePatternBinding {
                    mutable: ident.mutability.is_some(),
                    name: ident.ident.to_string(),
                    path: path.clone(),
                });
            }
            Pat::Paren(paren) => collect(&paren.pat, path, out),
            Pat::Tuple(tuple) => {
                for (index, element) in tuple.elems.iter().enumerate() {
                    path.push(index);
                    collect(element, path, out);
                    path.pop();
                }
            }
            _ => {}
        }
    }
    let mut out = Vec::new();
    for (index, element) in tuple.elems.iter().enumerate() {
        collect(element, &mut vec![index], &mut out);
    }
    return out;
}

pub(super) fn resolve_rename(entities: &HashSet<String>, js_name: &str) -> String {
    let prefix = format!("{RENAME_MARKER}{js_name}=");
    if let Some(marker) = entities.iter().find(|m| m.starts_with(&prefix)) {
        return marker[prefix.len()..].to_string();
    }
    return js_name.to_string();
}

pub(super) fn next_try_rename(entities: &HashSet<String>, js_name: &str) -> String {
    let prefix = format!("{RENAME_MARKER}{js_name}=");
    if let Some(marker) = entities.iter().find(|m| m.starts_with(&prefix)) {
        let current = &marker[prefix.len()..];
        if let Some(num_str) = current.rsplit('_').next() {
            if let Ok(n) = num_str.parse::<usize>() {
                return format!("{js_name}_{}", n + 1);
            }
        }
    }
    return format!("{js_name}_1");
}

pub(super) fn expression_contains_identifier(expression: &Expr, expected: &str) -> bool {
    struct IdentifierFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for IdentifierFinder<'_> {
        fn visit_arm(&mut self, arm: &'ast syn::Arm) {
            if pattern_binds_identifier(&arm.pat, self.expected) {
                return;
            }
            syn::visit::visit_arm(self, arm);
        }

        fn visit_expr_closure(&mut self, closure: &'ast syn::ExprClosure) {
            if closure
                .inputs
                .iter()
                .any(|pattern| pattern_binds_identifier(pattern, self.expected))
            {
                return;
            }
            syn::visit::visit_expr_closure(self, closure);
        }

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

    let mut finder = IdentifierFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_expr(&mut finder, expression);
    return finder.found;
}

pub(super) fn statement_contains_identifier(statement: &Stmt, expected: &str) -> bool {
    struct IdentifierFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> Visit<'ast> for IdentifierFinder<'_> {
        fn visit_expr_path(&mut self, path: &'ast syn::ExprPath) {
            if path.path.is_ident(self.expected) {
                self.found = true;
            }
            syn::visit::visit_expr_path(self, path);
        }
    }

    let mut finder = IdentifierFinder {
        expected,
        found: false,
    };
    finder.visit_stmt(statement);
    return finder.found;
}

pub(super) fn is_lowered_primary(expression: &Expr, text: &str) -> bool {
    if expression_precedence(expression) < PRIMARY_PRECEDENCE {
        return true;
    }
    return is_primary_expression_text(text);
}

pub(super) fn is_primary_expression_text(text: &str) -> bool {
    let mut depth: i32 = 0;
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for character in text.chars() {
        if let Some(open) = quote {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == open {
                quote = None;
            }
            continue;
        }
        match character {
            '"' | '\'' | '`' => quote = Some(character),
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth -= 1,
            _ if character.is_whitespace() && depth == 0 => return false,
            _ => {}
        }
    }
    return true;
}

pub(super) fn strip_value_position_parens(text: &str) -> &str {
    let bytes = text.as_bytes();
    if bytes.len() < 3 || bytes[0] != b'(' || bytes[bytes.len() - 1] != b')' {
        return text;
    }
    let inner = &text[1..text.len() - 1];
    let mut depth: i32 = 0;
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for c in inner.chars() {
        if let Some(open) = quote {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == open {
                quote = None;
            }
            continue;
        }
        match c {
            '"' | '\'' | '`' => quote = Some(c),
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => {
                depth -= 1;
                if depth < 0 {
                    return text;
                }
            }
            _ => {}
        }
    }
    if depth != 0 {
        return text;
    }
    return inner;
}

pub(super) fn pattern_binds_identifier(pattern: &Pat, expected: &str) -> bool {
    struct PatternFinder<'a> {
        expected: &'a str,
        found: bool,
    }

    impl<'ast> syn::visit::Visit<'ast> for PatternFinder<'_> {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            if pattern.ident == self.expected {
                self.found = true;
            }
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut finder = PatternFinder {
        expected,
        found: false,
    };
    syn::visit::Visit::visit_pat(&mut finder, pattern);
    return finder.found;
}

pub(super) fn pattern_identifiers(pattern: &Pat) -> Vec<&syn::Ident> {
    struct Collector<'ast> {
        identifiers: Vec<&'ast syn::Ident>,
    }

    impl<'ast> Visit<'ast> for Collector<'ast> {
        fn visit_pat_ident(&mut self, pattern: &'ast syn::PatIdent) {
            self.identifiers.push(&pattern.ident);
            syn::visit::visit_pat_ident(self, pattern);
        }
    }

    let mut collector = Collector {
        identifiers: Vec::new(),
    };
    collector.visit_pat(pattern);
    return collector.identifiers;
}

pub(super) fn constructor_path_default_value(expression: &Expr) -> Option<&'static str> {
    let expression = peel_reference_and_paren(expression);
    let Expr::Path(path) = expression else {
        return None;
    };
    if path.qself.is_some() {
        return None;
    }
    let segments: Vec<_> = path
        .path
        .segments
        .iter()
        .map(|s| s.ident.to_string())
        .collect();
    match segments
        .iter()
        .map(|s| s.as_str())
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["String", "new"] => Some("''"),
        ["Vec", "new"] => Some("[]"),
        ["HashMap", "new"] | ["BTreeMap", "new"] => Some("new Map()"),
        ["HashSet", "new"] | ["BTreeSet", "new"] => Some("new Set()"),
        _ => None,
    }
}

pub(super) fn expression_is_unsigned_result(expression: &Expr, entities: &HashSet<String>) -> bool {
    return match expression {
        Expr::Cast(cast) => matches!(
            named_type(&cast.ty).as_deref(),
            Some("u8" | "u16" | "u32" | "usize")
        ),
        Expr::Lit(lit) => {
            matches!(&lit.lit, Lit::Int(int_lit) if int_lit.base10_parse::<u64>().ok().is_some_and(|v| v <= 4294967295))
        }
        Expr::Paren(paren) => expression_is_unsigned_result(&paren.expr, entities),
        Expr::Group(group) => expression_is_unsigned_result(&group.expr, entities),
        Expr::Call(_) | Expr::MethodCall(_) => matches!(
            expression_numeric_type(expression, entities).as_deref(),
            Some("u8" | "u16" | "u32" | "usize")
        ),
        Expr::Binary(binary)
            if matches!(binary.op, BinOp::Div(_)) && is_integer_division(binary, entities) =>
        {
            true
        }
        _ => false,
    };
}

pub(super) fn is_integer_cast_elided(
    inner: &Expr,
    target: &Type,
    entities: &HashSet<String>,
) -> bool {
    let Some(target_name) = named_type(target) else {
        return false;
    };
    let Some(source_name) = expression_numeric_type(inner, entities) else {
        return false;
    };
    return is_widening_integer_cast(&source_name, &target_name);
}

pub(super) fn integer_literal_fits_cast(expr: &Expr, ty: &Type) -> bool {
    let Some(target) = named_type(ty) else {
        return false;
    };
    let inner = peel_reference_and_paren(expr);
    let value: Option<i128> = match inner {
        Expr::Lit(lit) => match &lit.lit {
            Lit::Int(int_lit) => int_lit.base10_parse::<u64>().ok().map(|v| v as i128),
            _ => None,
        },
        Expr::Unary(unary) if matches!(unary.op, syn::UnOp::Neg(_)) => {
            if let Expr::Lit(lit) = peel_reference_and_paren(&unary.expr) {
                if let Lit::Int(int_lit) = &lit.lit {
                    int_lit.base10_parse::<u64>().ok().map(|v| -(v as i128))
                } else {
                    None
                }
            } else {
                None
            }
        }
        _ => None,
    };
    let Some(value) = value else {
        return false;
    };
    return match target.as_str() {
        "u8" => (0..=255).contains(&value),
        "u16" => (0..=65535).contains(&value),
        "u32" | "usize" => (0..=4294967295i128).contains(&value),
        "i8" => (-128..=127).contains(&value),
        "i16" => (-32768..=32767).contains(&value),
        "i32" | "isize" => (-2147483648..=2147483647i128).contains(&value),
        _ => false,
    };
}

pub(super) fn integer_literal_fits_u32(expr: &Expr) -> bool {
    let inner = peel_reference_and_paren(expr);
    if let Expr::Lit(lit) = inner {
        if let Lit::Int(int_lit) = &lit.lit {
            return int_lit
                .base10_parse::<u64>()
                .ok()
                .is_some_and(|v| v <= 4294967295);
        }
    }
    return false;
}
