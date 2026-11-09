use std::collections::HashSet;
use std::fmt::Write;

use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::{BinOp, Expr, Lit, Pat, Token};

use crate::{CompileError, compile_error};

use super::{
    BINDING_MARKER, DataUnionPatternTest, NULLABLE_OPTIONS_MARKER, data_union_pattern_test,
    emit_expression, emit_literal, emit_path_segment, expression_is_reusable, js_string_literal,
    parse_matches_arguments, parse_vec_repeat, snake_to_lower_camel, write_indent,
};

pub(crate) fn emit_format_template(
    template: &str,
    values: &[&Expr],
    entities: &HashSet<String>,
    error_prefix: &str,
) -> Result<String, CompileError> {
    let mut template = template
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${");
    let mut value_index = 0;
    let mut positional_used = false;
    let mut rendered = String::new();
    while let Some(start) = template.find('{') {
        if template[start + 1..].starts_with('{') {
            rendered.push_str(&template[..start].replace("}}", "}"));
            rendered.push('{');
            template = template[start + 2..].to_string();
            continue;
        }
        let Some(relative_end) = template[start + 1..].find('}') else {
            break;
        };
        let end = start + 1 + relative_end;
        rendered.push_str(&template[..start].replace("}}", "}"));
        let placeholder = &template[start + 1..end];
        let (name, specifier) = placeholder.split_once(':').unwrap_or((placeholder, ""));
        let value = if name.is_empty() {
            let Some(value) = values.get(value_index) else {
                return Err(compile_error(format!(
                    "{error_prefix} has too few formatting values"
                )));
            };
            value_index += 1;
            emit_expression(value, entities)?
        } else if let Ok(positional) = name.parse::<usize>() {
            let Some(value) = values.get(positional) else {
                return Err(compile_error(format!(
                    "{error_prefix} positional argument {{{positional}}} is out of range"
                )));
            };
            positional_used = true;
            emit_expression(value, entities)?
        } else if let Ok(identifier) = syn::parse_str::<syn::Ident>(name) {
            emit_expression(
                &Expr::Path(syn::ExprPath {
                    attrs: Vec::new(),
                    qself: None,
                    path: identifier.into(),
                }),
                entities,
            )?
        } else {
            snake_to_lower_camel(name)
        };
        let value = if specifier.is_empty() {
            value
        } else if specifier == "?" {
            format!("JSON.stringify({value})")
        } else if specifier == "x" {
            format!("({value}).toString(16)")
        } else if specifier == "X" {
            format!("({value}).toString(16).toUpperCase()")
        } else if specifier == "e" {
            format!("({value}).toExponential()")
        } else if specifier == "E" {
            format!("({value}).toExponential().toUpperCase()")
        } else if let Some(width) = specifier
            .strip_prefix('0')
            .and_then(|value| value.strip_suffix('x'))
            .and_then(|value| value.parse::<usize>().ok())
        {
            format!("({value}).toString(16).padStart({width}, '0')")
        } else if let Some(width) = specifier
            .strip_prefix('0')
            .and_then(|value| value.strip_suffix('X'))
            .and_then(|value| value.parse::<usize>().ok())
        {
            format!("({value}).toString(16).toUpperCase().padStart({width}, '0')")
        } else if let Some(precision) = specifier
            .strip_prefix('.')
            .and_then(|value| value.parse::<usize>().ok())
        {
            format!("({value}).toFixed({precision})")
        } else if let Some(precision) = specifier
            .strip_prefix('.')
            .and_then(|value| value.strip_suffix('e'))
            .and_then(|value| value.parse::<usize>().ok())
        {
            format!("({value}).toExponential({precision})")
        } else if let Some(precision) = specifier
            .strip_prefix('.')
            .and_then(|value| value.strip_suffix('E'))
            .and_then(|value| value.parse::<usize>().ok())
        {
            format!("({value}).toExponential({precision}).toUpperCase()")
        } else {
            return Err(compile_error(format!(
                "{error_prefix} uses unsupported format specifier `:{specifier}`"
            )));
        };
        rendered.push_str("${");
        rendered.push_str(&value);
        rendered.push('}');
        template = template[end + 1..].to_string();
    }
    rendered.push_str(&template.replace("}}", "}"));
    if !positional_used && value_index != values.len() {
        return Err(compile_error(format!(
            "{error_prefix} has unused formatting values"
        )));
    }
    return Ok(format!("`{rendered}`"));
}

pub(super) fn emit_macro_expression(
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let Some(name) = rust_macro.path.segments.last() else {
        return Err(compile_error("Rust macro expression has an empty path"));
    };
    if name.ident == "vec" {
        if let Ok((value, length)) = parse_vec_repeat(rust_macro) {
            return Ok(format!(
                "new Array({}).fill({})",
                emit_expression(&length, entities)?,
                emit_expression(&value, entities)?
            ));
        }
        let values = Punctuated::<Expr, Token![,]>::parse_terminated
            .parse2(rust_macro.tokens.clone())
            .map_err(|error| compile_error(format!("failed to parse `vec!` values: {error}")))?;
        let values = values
            .iter()
            .map(|value| emit_expression(value, entities))
            .collect::<Result<Vec<_>, _>>()?;
        return Ok(format!("[{}]", values.join(", ")));
    }
    if name.ident == "matches" {
        return emit_matches_macro(rust_macro, entities);
    }
    if name.ident == "unreachable" {
        return Ok(format!(
            "(() => {{ throw new Error({}); }})()",
            emit_unreachable_message(rust_macro, entities)?
        ));
    }
    if name.ident == "panic" {
        return Ok(format!(
            "(() => {{ throw new Error({}); }})()",
            emit_panic_message(rust_macro, entities)?
        ));
    }
    if name.ident == "concat" {
        return emit_concat_macro(rust_macro, entities);
    }
    if name.ident == "todo" {
        return Ok("(() => { throw new Error('not implemented'); })()".to_string());
    }
    if name.ident == "json" {
        return emit_json_macro_value(
            &mut rust_macro.tokens.clone().into_iter().peekable(),
            entities,
        );
    }
    if name.ident == "assert" || name.ident == "debug_assert" {
        let mut body = String::new();
        emit_assert_statement(&mut body, rust_macro, entities, 1)?;
        return Ok(format!("(() => {{\n{body}}})()",));
    }
    if name.ident == "assert_eq"
        || name.ident == "assert_ne"
        || name.ident == "debug_assert_eq"
        || name.ident == "debug_assert_ne"
    {
        let mut body = String::new();
        emit_assert_comparison_statement(&mut body, rust_macro, entities, 1)?;
        return Ok(format!("(() => {{\n{body}}})()",));
    }
    if name.ident != "format" {
        return Err(compile_error(format!(
            "unsupported Rust macro expression `{}!`",
            name.ident
        )));
    }
    let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
        .parse2(rust_macro.tokens.clone())
        .map_err(|error| compile_error(format!("failed to parse `format!` arguments: {error}")))?;
    let Some(Expr::Lit(template)) = arguments.first() else {
        return Err(compile_error(
            "portable `format!` expression needs a string literal template",
        ));
    };
    let Lit::Str(template) = &template.lit else {
        return Err(compile_error(
            "portable `format!` expression needs a string literal template",
        ));
    };
    let values = arguments.iter().skip(1).collect::<Vec<_>>();
    return emit_format_template(&template.value(), &values, entities, "portable `format!`");
}

pub(super) fn emit_json_macro_value(
    tokens: &mut std::iter::Peekable<proc_macro2::token_stream::IntoIter>,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    use proc_macro2::{Delimiter, TokenTree};
    let Some(first) = tokens.peek() else {
        return Ok("null".to_string());
    };
    match first {
        TokenTree::Group(group) if group.delimiter() == Delimiter::Brace => {
            let inner = group.stream();
            let group_clone = group.clone();
            tokens.next();
            let mut items = inner.into_iter().peekable();
            let mut entries = Vec::new();
            loop {
                if items.peek().is_none() {
                    break;
                }
                let key = match items.next() {
                    Some(TokenTree::Literal(lit)) => {
                        let text = lit.to_string();
                        if text.starts_with('"') {
                            text
                        } else {
                            return Err(compile_error(format!(
                                "portable `json!` object key must be a string literal, got `{text}`"
                            )));
                        }
                    }
                    Some(other) => {
                        return Err(compile_error(format!(
                            "portable `json!` object key must be a string literal, got `{other}`"
                        )));
                    }
                    None => break,
                };
                match items.next() {
                    Some(TokenTree::Punct(p)) if p.as_char() == ':' => {}
                    _ => {
                        return Err(compile_error(
                            "portable `json!` object entry must have `:` after key",
                        ));
                    }
                }
                let value = emit_json_macro_value(&mut items, entities)?;
                entries.push(format!("{key}: {value}"));
                if let Some(TokenTree::Punct(p)) = items.peek() {
                    if p.as_char() == ',' {
                        items.next();
                    }
                }
            }
            let _ = &group_clone;
            if entries.is_empty() {
                Ok("{}".to_string())
            } else {
                Ok(format!("{{ {} }}", entries.join(", ")))
            }
        }
        TokenTree::Group(group) if group.delimiter() == Delimiter::Bracket => {
            let inner = group.stream();
            tokens.next();
            let mut items = inner.into_iter().peekable();
            let mut elements = Vec::new();
            while items.peek().is_some() {
                elements.push(emit_json_macro_value(&mut items, entities)?);
                if let Some(TokenTree::Punct(p)) = items.peek() {
                    if p.as_char() == ',' {
                        items.next();
                    }
                }
            }
            Ok(format!("[{}]", elements.join(", ")))
        }
        TokenTree::Ident(ident) if *ident == "null" => {
            tokens.next();
            Ok("null".to_string())
        }
        TokenTree::Ident(ident) if *ident == "true" => {
            tokens.next();
            Ok("true".to_string())
        }
        TokenTree::Ident(ident) if *ident == "false" => {
            tokens.next();
            Ok("false".to_string())
        }
        TokenTree::Literal(_) => {
            let lit = tokens.next().unwrap();
            let text = lit.to_string();
            Ok(text)
        }
        _ => {
            let mut expr_tokens = proc_macro2::TokenStream::new();
            while let Some(token) = tokens.peek() {
                match token {
                    TokenTree::Punct(p) if p.as_char() == ',' || p.as_char() == ':' => break,
                    _ => {
                        expr_tokens.extend(std::iter::once(tokens.next().unwrap()));
                    }
                }
            }
            let expression: Expr = syn::parse2(expr_tokens).map_err(|error| {
                compile_error(format!("failed to parse `json!` value: {error}"))
            })?;
            emit_expression(&expression, entities)
        }
    }
}

pub(super) fn emit_matches_macro(
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let (value, pattern, guard) = parse_matches_arguments(rust_macro)
        .map_err(|error| compile_error(format!("failed to parse `matches!` arguments: {error}")))?;
    let text = emit_expression(&value, entities)?;
    let reusable = expression_is_reusable(&value);
    let subject = if reusable { text.as_str() } else { "value" };
    if let Some(test) = data_union_pattern_test(&pattern, subject, entities)? {
        let predicate = test.predicate.unwrap_or_else(|| "true".to_string());
        let full_predicate = if let Some(guard_expr) = &guard {
            let guard_text = emit_matches_guard(guard_expr, &test.bindings, entities)?;
            if guard_text == "true" {
                predicate
            } else {
                format!("{predicate} && {guard_text}")
            }
        } else {
            predicate
        };
        if reusable {
            return Ok(full_predicate);
        }
        return Ok(format!("((value) => {full_predicate})({text})"));
    }
    if let Some(guard_expr) = &guard {
        let Some(test) = matches_binding_pattern_test(&pattern, subject, entities)? else {
            return Err(compile_error(
                "portable `matches!` guard requires a data union variant, `Some`, binding or literal pattern",
            ));
        };
        let guard_text = emit_matches_guard(guard_expr, &test.bindings, entities)?;
        let full_predicate = match test.predicate {
            Some(predicate) if guard_text != "true" => format!("{predicate} && {guard_text}"),
            Some(predicate) => predicate,
            None => guard_text,
        };
        if reusable {
            return Ok(full_predicate);
        }
        return Ok(format!("((value) => {full_predicate})({text})"));
    }
    if let Some(predicate) = emit_matches_literal_predicate(&pattern, subject, entities)? {
        if reusable {
            return Ok(predicate);
        }
        return Ok(format!("((value) => {predicate})({text})"));
    }
    return Err(compile_error(
        "portable `matches!` supports only data union variant patterns",
    ));
}

pub(super) fn emit_matches_guard(
    guard: &Expr,
    bindings: &[(String, String)],
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if bindings.is_empty() {
        return emit_expression(guard, entities);
    }
    let mut guard_entities = entities.clone();
    for (rust_name, _) in bindings {
        let ts_name = snake_to_lower_camel(rust_name);
        let id = format!("{BINDING_MARKER}{ts_name}");
        guard_entities.insert(id);
    }
    let guard_text = emit_expression(guard, &guard_entities)?;
    let params = bindings
        .iter()
        .map(|(name, _)| snake_to_lower_camel(name))
        .collect::<Vec<_>>()
        .join(", ");
    let args = bindings
        .iter()
        .map(|(_, expr)| expr.clone())
        .collect::<Vec<_>>()
        .join(", ");
    Ok(format!("(({params}) => {guard_text})({args})"))
}

// A `matches!` pattern whose bindings a guard reads: a binding identifier (`v`, `v @ inner`), `Some`
// over one (an `Option` lowers to its payload or an absent value), a reference pattern, or a data
// union variant or literal pattern. `None` when the pattern has no portable test.
fn matches_binding_pattern_test(
    pattern: &Pat,
    subject: &str,
    entities: &HashSet<String>,
) -> Result<Option<DataUnionPatternTest>, CompileError> {
    match pattern {
        Pat::Paren(paren) => return matches_binding_pattern_test(&paren.pat, subject, entities),
        Pat::Reference(reference) => {
            return matches_binding_pattern_test(&reference.pat, subject, entities);
        }
        Pat::Ident(ident) if pattern_identifier_is_binding(&ident.ident) => {
            let mut test = match &ident.subpat {
                Some((_, inner)) => {
                    let Some(test) = matches_binding_pattern_test(inner, subject, entities)? else {
                        return Ok(None);
                    };
                    test
                }
                None => DataUnionPatternTest {
                    bindings: Vec::new(),
                    predicate: None,
                },
            };
            test.bindings
                .insert(0, (ident.ident.to_string(), subject.to_string()));
            return Ok(Some(test));
        }
        Pat::TupleStruct(tuple)
            if tuple.qself.is_none() && tuple.path.is_ident("Some") && tuple.elems.len() == 1 =>
        {
            let Some(inner) = matches_binding_pattern_test(&tuple.elems[0], subject, entities)?
            else {
                return Ok(None);
            };
            let absent = if entities.contains(NULLABLE_OPTIONS_MARKER) {
                "null"
            } else {
                "undefined"
            };
            let present = format!("{subject} !== {absent}");
            return Ok(Some(DataUnionPatternTest {
                bindings: inner.bindings,
                predicate: Some(match inner.predicate {
                    Some(predicate) => format!("{present} && ({predicate})"),
                    None => present,
                }),
            }));
        }
        _ => {}
    }
    if let Some(test) = data_union_pattern_test(pattern, subject, entities)? {
        return Ok(Some(test));
    }
    return Ok(
        emit_matches_literal_predicate(pattern, subject, entities)?.map(|predicate| {
            DataUnionPatternTest {
                bindings: Vec::new(),
                predicate: Some(predicate),
            }
        }),
    );
}

// A lowercase pattern identifier binds the matched value; an uppercase one names a constant or a
// unit struct, which the pattern compares against.
fn pattern_identifier_is_binding(identifier: &syn::Ident) -> bool {
    return identifier
        .to_string()
        .starts_with(|character: char| character.is_lowercase() || character == '_');
}

pub(super) fn emit_matches_literal_predicate(
    pattern: &Pat,
    subject: &str,
    entities: &HashSet<String>,
) -> Result<Option<String>, CompileError> {
    return match pattern {
        Pat::Lit(literal) => {
            let value = emit_literal(&literal.lit)?;
            Ok(Some(format!("{subject} === {value}")))
        }
        Pat::Or(or_pattern) => {
            let mut parts = Vec::new();
            for case in &or_pattern.cases {
                let Some(predicate) = emit_matches_literal_predicate(case, subject, entities)?
                else {
                    return Ok(None);
                };
                parts.push(predicate);
            }
            Ok(Some(parts.join(" || ")))
        }
        Pat::Wild(_) => Ok(Some("true".to_string())),
        Pat::Ident(ident)
            if ident.subpat.is_none() && pattern_identifier_is_binding(&ident.ident) =>
        {
            Ok(Some("true".to_string()))
        }
        Pat::Ident(ident) if ident.subpat.is_none() => {
            let name = emit_path_segment(&ident.ident.to_string());
            Ok(Some(format!("{subject} === {name}")))
        }
        Pat::Path(path) => {
            let emitted = emit_expression(
                &Expr::Path(syn::ExprPath {
                    attrs: Vec::new(),
                    qself: path.qself.clone(),
                    path: path.path.clone(),
                }),
                entities,
            )?;
            Ok(Some(format!("{subject} === {emitted}")))
        }
        Pat::Range(range) => {
            let lo = range
                .start
                .as_ref()
                .map(|expr| emit_expression(expr, entities))
                .transpose()?;
            let hi = range
                .end
                .as_ref()
                .map(|expr| emit_expression(expr, entities))
                .transpose()?;
            let inclusive = matches!(range.limits, syn::RangeLimits::Closed(_));
            match (lo, hi) {
                (Some(lo), Some(hi)) => {
                    let op = if inclusive { "<=" } else { "<" };
                    Ok(Some(format!("{subject} >= {lo} && {subject} {op} {hi}")))
                }
                (Some(lo), None) => Ok(Some(format!("{subject} >= {lo}"))),
                (None, Some(hi)) => {
                    let op = if inclusive { "<=" } else { "<" };
                    Ok(Some(format!("{subject} {op} {hi}")))
                }
                (None, None) => Ok(Some("true".to_string())),
            }
        }
        Pat::TupleStruct(tuple)
            if (tuple.path.is_ident("Some") || tuple.path.is_ident("Ok"))
                && tuple.elems.len() == 1 =>
        {
            let absent = if entities.contains(NULLABLE_OPTIONS_MARKER) {
                "null"
            } else {
                "undefined"
            };
            if let Pat::Wild(_) = &tuple.elems[0] {
                return Ok(Some(format!("{subject} !== {absent}")));
            }
            if let Some(inner) = emit_matches_literal_predicate(&tuple.elems[0], subject, entities)?
            {
                if inner == "true" {
                    return Ok(Some(format!("{subject} !== {absent}")));
                }
                return Ok(Some(format!("{subject} !== {absent} && ({inner})")));
            }
            if let Some(test) = data_union_pattern_test(&tuple.elems[0], subject, entities)? {
                let inner = test.predicate.unwrap_or_else(|| "true".to_string());
                return Ok(Some(format!("{subject} !== {absent} && ({inner})")));
            }
            Ok(None)
        }
        _ => Ok(None),
    };
}

pub(super) fn emit_unreachable_message(
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    const DEFAULT_MESSAGE: &str = "internal error: entered unreachable code";

    let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
        .parse2(rust_macro.tokens.clone())
        .map_err(|error| {
            compile_error(format!("failed to parse `unreachable!` arguments: {error}"))
        })?;
    let Some(Expr::Lit(template)) = arguments.first() else {
        if arguments.is_empty() {
            return Ok(js_string_literal(DEFAULT_MESSAGE));
        }
        return Err(compile_error(
            "portable `unreachable!` needs a string literal template",
        ));
    };
    let Lit::Str(template) = &template.lit else {
        return Err(compile_error(
            "portable `unreachable!` needs a string literal template",
        ));
    };
    let template = format!("{DEFAULT_MESSAGE}: {}", template.value());
    let values = arguments.iter().skip(1).collect::<Vec<_>>();
    return emit_format_template(
        &template,
        &values,
        entities,
        "portable `unreachable!` message",
    );
}

pub(crate) fn emit_panic_message(
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
        .parse2(rust_macro.tokens.clone())
        .map_err(|error| compile_error(format!("failed to parse `panic!` arguments: {error}")))?;
    let Some(Expr::Lit(template)) = arguments.first() else {
        if arguments.is_empty() {
            return Ok("'explicit panic'".to_string());
        }
        return Err(compile_error(
            "portable `panic!` needs a string literal template",
        ));
    };
    let Lit::Str(template) = &template.lit else {
        return Err(compile_error(
            "portable `panic!` needs a string literal template",
        ));
    };
    let values = arguments.iter().skip(1).collect::<Vec<_>>();
    return emit_format_template(
        &template.value(),
        &values,
        entities,
        "portable `panic!` message",
    );
}

pub(super) fn emit_assert_statement(
    out: &mut String,
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
        .parse2(rust_macro.tokens.clone())
        .map_err(|error| compile_error(format!("failed to parse `assert!` arguments: {error}")))?;
    let Some(condition) = arguments.first() else {
        return Err(compile_error("portable `assert!` needs a condition"));
    };
    let condition_text = emit_expression(condition, entities)?;
    let negated_condition = if let Expr::Binary(binary) = condition {
        match binary.op {
            BinOp::Ne(_) => {
                let left = emit_expression(&binary.left, entities)?;
                let right = emit_expression(&binary.right, entities)?;
                Some(format!("{left} === {right}"))
            }
            BinOp::Eq(_) => {
                let left = emit_expression(&binary.left, entities)?;
                let right = emit_expression(&binary.right, entities)?;
                Some(format!("{left} !== {right}"))
            }
            BinOp::Lt(_) => {
                let left = emit_expression(&binary.left, entities)?;
                let right = emit_expression(&binary.right, entities)?;
                Some(format!("{left} >= {right}"))
            }
            BinOp::Le(_) => {
                let left = emit_expression(&binary.left, entities)?;
                let right = emit_expression(&binary.right, entities)?;
                Some(format!("{left} > {right}"))
            }
            BinOp::Gt(_) => {
                let left = emit_expression(&binary.left, entities)?;
                let right = emit_expression(&binary.right, entities)?;
                Some(format!("{left} <= {right}"))
            }
            BinOp::Ge(_) => {
                let left = emit_expression(&binary.left, entities)?;
                let right = emit_expression(&binary.right, entities)?;
                Some(format!("{left} < {right}"))
            }
            _ => None,
        }
    } else if let Expr::Unary(unary) = condition
        && matches!(unary.op, syn::UnOp::Not(_))
    {
        Some(emit_expression(&unary.expr, entities)?)
    } else {
        None
    };
    let message = if arguments.len() >= 2 {
        if let Expr::Lit(literal) = &arguments[1]
            && let Lit::Str(template) = &literal.lit
        {
            let values = arguments.iter().skip(2).collect::<Vec<_>>();
            emit_format_template(
                &template.value(),
                &values,
                entities,
                "portable `assert!` message",
            )?
        } else {
            format!("`${{{}}}`", emit_expression(&arguments[1], entities)?)
        }
    } else {
        format!(
            "'assertion failed: {}'",
            condition_text.replace('\'', "\\'")
        )
    };
    write_indent(out, indent);
    if let Some(inverted) = negated_condition {
        writeln!(out, "if ({inverted}) {{").expect("writing to a String cannot fail");
    } else {
        writeln!(out, "if (!({condition_text})) {{").expect("writing to a String cannot fail");
    }
    write_indent(out, indent + 1);
    writeln!(out, "throw new Error({message});").expect("writing to a String cannot fail");
    write_indent(out, indent);
    writeln!(out, "}}").expect("writing to a String cannot fail");
    return Ok(());
}

pub(super) fn emit_assert_comparison_statement(
    out: &mut String,
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let macro_name = rust_macro
        .path
        .segments
        .last()
        .map(|s| s.ident.to_string())
        .unwrap_or_default();
    let is_ne = macro_name.ends_with("_ne");
    let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
        .parse2(rust_macro.tokens.clone())
        .map_err(|error| {
            compile_error(format!(
                "failed to parse `{macro_name}!` arguments: {error}"
            ))
        })?;
    if arguments.len() < 2 {
        return Err(compile_error(format!(
            "portable `{macro_name}!` needs two arguments"
        )));
    }
    let left_text = emit_expression(&arguments[0], entities)?;
    let right_text = emit_expression(&arguments[1], entities)?;
    let operator = if is_ne { "===" } else { "!==" };
    let verb = if is_ne { "not equal" } else { "equal" };
    let message = if arguments.len() >= 3 {
        if let Expr::Lit(literal) = &arguments[2]
            && let Lit::Str(template) = &literal.lit
        {
            let values = arguments.iter().skip(3).collect::<Vec<_>>();
            emit_format_template(
                &template.value(),
                &values,
                entities,
                &format!("portable `{macro_name}!` message"),
            )?
        } else {
            format!("`${{{}}}`", emit_expression(&arguments[2], entities)?)
        }
    } else {
        format!(
            "`assertion failed: expected ${{JSON.stringify({left_text})}} to {verb} ${{JSON.stringify({right_text})}}`"
        )
    };
    write_indent(out, indent);
    writeln!(out, "if ({left_text} {operator} {right_text}) {{")
        .expect("writing to a String cannot fail");
    write_indent(out, indent + 1);
    writeln!(out, "throw new Error({message});").expect("writing to a String cannot fail");
    write_indent(out, indent);
    writeln!(out, "}}").expect("writing to a String cannot fail");
    return Ok(());
}

pub(super) fn emit_concat_macro(
    rust_macro: &syn::Macro,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let arguments = Punctuated::<Expr, Token![,]>::parse_terminated
        .parse2(rust_macro.tokens.clone())
        .map_err(|error| compile_error(format!("failed to parse `concat!` arguments: {error}")))?;
    let parts = arguments
        .iter()
        .map(|arg| emit_expression(arg, entities))
        .collect::<Result<Vec<_>, _>>()?;
    if parts.is_empty() {
        return Ok("''".to_string());
    }
    if parts.len() == 1 {
        return Ok(parts.into_iter().next().unwrap());
    }
    return Ok(parts.join(" + "));
}
