use std::collections::{BTreeSet, HashSet};
use std::fmt::Write;

use syn::punctuated::Punctuated;
use syn::{BinOp, Expr, Lit, Pat, Stmt};

use crate::{CompileError, compile_error};

use super::{
    BINDING_FACT_MARKER, BINDING_SITE_MARKER, BindingFact, GeneralTupleAlternative,
    GeneralTupleElement, GeneralTupleElementCondition, GeneralTupleMatchArm, JSON_VALUE_MARKER,
    NULLABLE_BINDING_MARKER, ORDERED_PRIMITIVE_MARKER, OptionMatchArm, RuntimeCategory,
    STRING_EXPRESSION_MARKER, TupleOptionElement, TupleOptionMatchArm, associated_numeric_method,
    binding_fact_marker, binding_site_key, closure_pattern_is_tuple, closure_pattern_is_wildcard,
    emit_block_with_context, emit_closure, emit_expression, emit_match_statement, emit_member,
    emit_pattern, expression_is_field_projection, expression_is_json_value,
    expression_is_option_of_json_value, expression_is_path, expression_is_reusable,
    indent_continuation_lines, inline_emitted_closure, is_lowered_primary, js_string_literal,
    json_value_function_ref_lowering, local_pattern_name, lower_camel_from_upper_camel,
    option_absent_value, option_closure_parameter, path_owner_and_member, peel_reference_and_paren,
    snake_to_lower_camel, unique_marker_suffix, write_indent,
};
pub(super) fn runtime_category_predicate(category: RuntimeCategory, value: &str) -> String {
    return match category {
        RuntimeCategory::Null => format!("{value} === null"),
        RuntimeCategory::Boolean => format!("typeof {value} === 'boolean'"),
        RuntimeCategory::Number => format!("typeof {value} === 'number'"),
        RuntimeCategory::String => format!("typeof {value} === 'string'"),
        RuntimeCategory::Array => format!("Array.isArray({value})"),
        RuntimeCategory::Record => format!(
            "typeof {value} === 'object' && {value} !== null && !Array.isArray({value}) && (Object.getPrototypeOf({value}) === Object.prototype || Object.getPrototypeOf({value}) === null)"
        ),
        RuntimeCategory::Function => format!("typeof {value} === 'function'"),
        RuntimeCategory::Object => format!(
            "typeof {value} === 'object' && {value} !== null && !Array.isArray({value}) && Object.getPrototypeOf({value}) !== Object.prototype && Object.getPrototypeOf({value}) !== null"
        ),
    };
}

pub(super) fn runtime_categories_predicate(
    categories: &BTreeSet<RuntimeCategory>,
    value: &str,
) -> String {
    return categories
        .iter()
        .map(|category| runtime_category_predicate(*category, value))
        .map(|predicate| format!("({predicate})"))
        .collect::<Vec<_>>()
        .join(" || ");
}

pub(super) fn analyze_option_match(arms: &[syn::Arm]) -> Option<Vec<OptionMatchArm>> {
    let mut has_some = false;
    let mut analyzed = Vec::new();
    for arm in arms {
        let info = match &arm.pat {
            Pat::TupleStruct(pattern)
                if (pattern.path.is_ident("Some") || pattern.path.is_ident("Ok"))
                    && pattern.elems.len() == 1 =>
            {
                let binding = match &pattern.elems[0] {
                    Pat::Ident(identifier) if identifier.subpat.is_none() => {
                        Some(snake_to_lower_camel(&identifier.ident.to_string()))
                    }
                    Pat::Wild(_) => None,
                    Pat::Tuple(tuple) => {
                        let mut names = Vec::new();
                        let mut wild_count = 0usize;
                        for elem in &tuple.elems {
                            match elem {
                                Pat::Ident(ident) if ident.subpat.is_none() => {
                                    names.push(snake_to_lower_camel(&ident.ident.to_string()));
                                }
                                Pat::Wild(_) => {
                                    names.push(format!("_unused{wild_count}"));
                                    wild_count += 1;
                                }
                                _ => return None,
                            }
                        }
                        Some(format!("[{}]", names.join(", ")))
                    }
                    _ => return None,
                };
                has_some = true;
                OptionMatchArm {
                    binding,
                    present: true,
                }
            }
            Pat::TupleStruct(pattern)
                if pattern.path.is_ident("Err") && pattern.elems.len() == 1 =>
            {
                OptionMatchArm {
                    binding: None,
                    present: false,
                }
            }
            Pat::Path(path) if path.path.is_ident("None") => OptionMatchArm {
                binding: None,
                present: false,
            },
            Pat::Ident(identifier) if identifier.ident == "None" && identifier.subpat.is_none() => {
                OptionMatchArm {
                    binding: None,
                    present: false,
                }
            }
            Pat::Wild(_) => OptionMatchArm {
                binding: None,
                present: false,
            },
            _ => return None,
        };
        analyzed.push(info);
    }
    return has_some.then_some(analyzed);
}

pub(super) fn analyze_tuple_option_element(pattern: &Pat) -> Option<TupleOptionElement> {
    return match pattern {
        Pat::TupleStruct(ts)
            if (ts.path.is_ident("Some") || ts.path.is_ident("Ok")) && ts.elems.len() == 1 =>
        {
            match &ts.elems[0] {
                Pat::Ident(identifier) if identifier.subpat.is_none() => Some(
                    TupleOptionElement::SomeBinding(identifier.ident.to_string()),
                ),
                Pat::Wild(_) => Some(TupleOptionElement::SomeWild),
                _ => None,
            }
        }
        Pat::TupleStruct(ts) if ts.path.is_ident("Err") && ts.elems.len() == 1 => {
            Some(TupleOptionElement::None)
        }
        Pat::Path(path) if path.path.is_ident("None") => Some(TupleOptionElement::None),
        Pat::Ident(identifier) if identifier.ident == "None" && identifier.subpat.is_none() => {
            Some(TupleOptionElement::None)
        }
        Pat::Wild(_) => Some(TupleOptionElement::Wild),
        _ => None,
    };
}

pub(super) fn analyze_tuple_option_match(
    scrutinee: &syn::ExprTuple,
    arms: &[syn::Arm],
) -> Option<Vec<TupleOptionMatchArm>> {
    let arity = scrutinee.elems.len();
    if arity < 2 {
        return None;
    }
    let mut has_option_test = false;
    let mut analyzed = Vec::new();
    for arm in arms {
        match &arm.pat {
            Pat::Tuple(tuple) if tuple.elems.len() == arity => {
                let mut elements = Vec::new();
                for elem in &tuple.elems {
                    let element = analyze_tuple_option_element(elem)?;
                    if matches!(
                        element,
                        TupleOptionElement::SomeBinding(_)
                            | TupleOptionElement::SomeWild
                            | TupleOptionElement::None
                    ) {
                        has_option_test = true;
                    }
                    elements.push(element);
                }
                analyzed.push(TupleOptionMatchArm {
                    elements,
                    catch_all: false,
                });
            }
            Pat::Wild(_) => {
                analyzed.push(TupleOptionMatchArm {
                    elements: Vec::new(),
                    catch_all: true,
                });
            }
            Pat::Ident(identifier) if identifier.subpat.is_none() && identifier.ident == "_" => {
                analyzed.push(TupleOptionMatchArm {
                    elements: Vec::new(),
                    catch_all: true,
                });
            }
            _ => return None,
        }
    }
    return has_option_test.then_some(analyzed);
}

pub(super) fn analyze_general_tuple_element(
    pattern: &Pat,
    scrutinee_elem: Option<&Expr>,
    entities: &HashSet<String>,
) -> Option<GeneralTupleElement> {
    return match pattern {
        Pat::Lit(lit) => {
            let value = match &lit.lit {
                Lit::Str(s) => js_string_literal(&s.value()),
                Lit::Int(i) => i.base10_digits().to_string(),
                Lit::Byte(b) => (b.value() as i64).to_string(),
                Lit::Bool(b) => b.value.to_string(),
                _ => return None,
            };
            Some(GeneralTupleElement {
                condition: GeneralTupleElementCondition::Literal(value),
                binding: None,
                field_bindings: Vec::new(),
            })
        }
        Pat::Path(path) => {
            if path.path.segments.len() == 1 && path.path.segments[0].ident == "None" {
                let absent = scrutinee_elem
                    .map(|e| option_absent_value(e, entities))
                    .unwrap_or("null");
                return Some(GeneralTupleElement {
                    condition: GeneralTupleElementCondition::OptionNone(absent.to_string()),
                    binding: None,
                    field_bindings: Vec::new(),
                });
            }
            let (_owner, variant) = path_owner_and_member(&path.path)?;
            Some(GeneralTupleElement {
                condition: GeneralTupleElementCondition::EnumVariant(lower_camel_from_upper_camel(
                    &variant,
                )),
                binding: None,
                field_bindings: Vec::new(),
            })
        }
        Pat::TupleStruct(ts) => {
            if ts.path.segments.len() == 1 && ts.path.segments[0].ident == "Some" {
                let absent = scrutinee_elem
                    .map(|e| option_absent_value(e, entities))
                    .unwrap_or("null");
                let binding = if ts.elems.len() == 1 {
                    match &ts.elems[0] {
                        Pat::Ident(id) if id.subpat.is_none() && id.ident != "_" => {
                            Some(snake_to_lower_camel(&id.ident.to_string()))
                        }
                        Pat::Wild(_) => None,
                        Pat::Reference(r) => match r.pat.as_ref() {
                            Pat::Ident(id) if id.subpat.is_none() && id.ident != "_" => {
                                Some(snake_to_lower_camel(&id.ident.to_string()))
                            }
                            Pat::Wild(_) => None,
                            _ => return None,
                        },
                        _ => return None,
                    }
                } else {
                    return None;
                };
                return Some(GeneralTupleElement {
                    condition: GeneralTupleElementCondition::OptionSome(absent.to_string()),
                    binding,
                    field_bindings: Vec::new(),
                });
            }
            let (_, variant) = path_owner_and_member(&ts.path)?;
            let binding = if ts.elems.len() == 1 {
                match &ts.elems[0] {
                    Pat::Ident(id) if id.subpat.is_none() && id.ident != "_" => {
                        Some(snake_to_lower_camel(&id.ident.to_string()))
                    }
                    Pat::Wild(_) => None,
                    Pat::Reference(r) => match r.pat.as_ref() {
                        Pat::Ident(id) if id.subpat.is_none() && id.ident != "_" => {
                            Some(snake_to_lower_camel(&id.ident.to_string()))
                        }
                        Pat::Wild(_) => None,
                        _ => return None,
                    },
                    _ => return None,
                }
            } else if ts.elems.is_empty() {
                None
            } else {
                return None;
            };
            Some(GeneralTupleElement {
                condition: GeneralTupleElementCondition::DataUnionKind(
                    lower_camel_from_upper_camel(&variant),
                ),
                binding,
                field_bindings: Vec::new(),
            })
        }
        Pat::Struct(s) => {
            let (_, variant) = path_owner_and_member(&s.path)?;
            let mut field_bindings = Vec::new();
            for field in &s.fields {
                let source = emit_member(&field.member);
                let binding_name = match field.pat.as_ref() {
                    Pat::Ident(id) if id.subpat.is_none() => {
                        snake_to_lower_camel(&id.ident.to_string())
                    }
                    Pat::Wild(_) => continue,
                    Pat::Reference(r) => match r.pat.as_ref() {
                        Pat::Ident(id) if id.subpat.is_none() => {
                            snake_to_lower_camel(&id.ident.to_string())
                        }
                        Pat::Wild(_) => continue,
                        _ => return None,
                    },
                    _ => return None,
                };
                field_bindings.push((binding_name, source));
            }
            Some(GeneralTupleElement {
                condition: GeneralTupleElementCondition::DataUnionKind(
                    lower_camel_from_upper_camel(&variant),
                ),
                binding: None,
                field_bindings,
            })
        }
        Pat::Wild(_) => Some(GeneralTupleElement {
            condition: GeneralTupleElementCondition::Wild,
            binding: None,
            field_bindings: Vec::new(),
        }),
        Pat::Ident(id) if id.subpat.is_none() => {
            if id.ident == "_" {
                Some(GeneralTupleElement {
                    condition: GeneralTupleElementCondition::Wild,
                    binding: None,
                    field_bindings: Vec::new(),
                })
            } else if id.ident == "None" {
                let absent = scrutinee_elem
                    .map(|e| option_absent_value(e, entities))
                    .unwrap_or("null");
                Some(GeneralTupleElement {
                    condition: GeneralTupleElementCondition::OptionNone(absent.to_string()),
                    binding: None,
                    field_bindings: Vec::new(),
                })
            } else {
                Some(GeneralTupleElement {
                    condition: GeneralTupleElementCondition::Wild,
                    binding: Some(snake_to_lower_camel(&id.ident.to_string())),
                    field_bindings: Vec::new(),
                })
            }
        }
        Pat::Reference(reference) => {
            analyze_general_tuple_element(&reference.pat, scrutinee_elem, entities)
        }
        Pat::Paren(paren) => analyze_general_tuple_element(&paren.pat, scrutinee_elem, entities),
        _ => None,
    };
}

pub(super) fn pattern_elements(
    pattern: &Pat,
    arity: usize,
) -> Option<&Punctuated<Pat, syn::token::Comma>> {
    return match pattern {
        Pat::Tuple(tuple) if tuple.elems.len() == arity => Some(&tuple.elems),
        Pat::Slice(slice) if slice.elems.len() == arity => Some(&slice.elems),
        _ => None,
    };
}

pub(super) fn analyze_general_tuple_pattern(
    pattern: &Pat,
    scrutinee_elems: &Punctuated<Expr, syn::token::Comma>,
    entities: &HashSet<String>,
) -> Option<GeneralTupleMatchArm> {
    let arity = scrutinee_elems.len();
    if let Some(elems) = pattern_elements(pattern, arity) {
        let mut elements = Vec::new();
        for (i, elem) in elems.iter().enumerate() {
            elements.push(analyze_general_tuple_element(
                elem,
                Some(&scrutinee_elems[i]),
                entities,
            )?);
        }
        return Some(GeneralTupleMatchArm {
            catch_all: false,
            alternatives: vec![GeneralTupleAlternative { elements }],
        });
    }
    return match pattern {
        Pat::Or(or) => {
            let mut alternatives = Vec::new();
            for case in &or.cases {
                if let Some(elems) = pattern_elements(case, arity) {
                    let mut elements = Vec::new();
                    for (i, elem) in elems.iter().enumerate() {
                        elements.push(analyze_general_tuple_element(
                            elem,
                            Some(&scrutinee_elems[i]),
                            entities,
                        )?);
                    }
                    alternatives.push(GeneralTupleAlternative { elements });
                } else {
                    return None;
                }
            }
            Some(GeneralTupleMatchArm {
                catch_all: false,
                alternatives,
            })
        }
        Pat::Wild(_) => Some(GeneralTupleMatchArm {
            catch_all: true,
            alternatives: Vec::new(),
        }),
        Pat::Ident(id) if id.subpat.is_none() && id.ident == "_" => Some(GeneralTupleMatchArm {
            catch_all: true,
            alternatives: Vec::new(),
        }),
        _ => None,
    };
}

pub(super) fn scrutinee_elements(
    expression: &Expr,
) -> Option<&Punctuated<Expr, syn::token::Comma>> {
    return match expression {
        Expr::Tuple(tuple) if tuple.elems.len() >= 2 => Some(&tuple.elems),
        Expr::Array(array) if array.elems.len() >= 2 => Some(&array.elems),
        _ => None,
    };
}

pub(super) fn analyze_general_compound_match(
    scrutinee: &Expr,
    arms: &[syn::Arm],
    entities: &HashSet<String>,
) -> Option<Vec<GeneralTupleMatchArm>> {
    let elems = scrutinee_elements(scrutinee)?;
    let mut has_condition = false;
    let mut analyzed = Vec::new();
    for arm in arms {
        let info = analyze_general_tuple_pattern(&arm.pat, elems, entities)?;
        if !info.catch_all {
            has_condition = true;
        }
        analyzed.push(info);
    }
    return has_condition.then_some(analyzed);
}

pub(super) fn emit_general_tuple_element_condition(
    element: &GeneralTupleElement,
    temp: &str,
) -> Option<String> {
    return match &element.condition {
        GeneralTupleElementCondition::Literal(value) => Some(format!("{temp} === {value}")),
        GeneralTupleElementCondition::EnumVariant(variant) => {
            Some(format!("{temp} === {}", js_string_literal(variant)))
        }
        GeneralTupleElementCondition::DataUnionKind(kind) => {
            Some(format!("{temp}.kind === {}", js_string_literal(kind)))
        }
        GeneralTupleElementCondition::OptionSome(absent) => Some(format!("{temp} !== {absent}")),
        GeneralTupleElementCondition::OptionNone(absent) => Some(format!("{temp} === {absent}")),
        GeneralTupleElementCondition::Wild => None,
    };
}

/// Splits a let-chain condition into the let-binding, pre-guards (conditions
/// before the let), and post-guards (conditions after the let).
pub(super) fn split_let_chain(condition: &Expr) -> Option<(&syn::ExprLet, Vec<&Expr>, Vec<&Expr>)> {
    return match condition {
        Expr::Let(binding) => Some((binding, Vec::new(), Vec::new())),
        Expr::Binary(binary) if matches!(binary.op, BinOp::And(_)) => {
            if let Some((binding, pre_guards, mut post_guards)) = split_let_chain(&binary.left) {
                post_guards.push(&binary.right);
                Some((binding, pre_guards, post_guards))
            } else if let Expr::Let(binding) = binary.right.as_ref() {
                Some((binding, vec![&binary.left], Vec::new()))
            } else {
                None
            }
        }
        _ => None,
    };
}

pub(crate) fn emit_option_binding(
    condition: &Expr,
    entities: &HashSet<String>,
) -> Result<Option<(String, String, &'static str)>, CompileError> {
    let binding = match condition {
        Expr::Let(binding) => binding,
        _ => {
            return Ok(None);
        }
    };
    let Pat::TupleStruct(pattern) = &*binding.pat else {
        return Ok(None);
    };
    if !(pattern.path.is_ident("Some") || pattern.path.is_ident("Ok")) || pattern.elems.len() != 1 {
        return Ok(None);
    }
    if let Pat::Tuple(tuple) = &pattern.elems[0] {
        let mut names = Vec::new();
        let mut wild_count = 0usize;
        for elem in &tuple.elems {
            match elem {
                Pat::Ident(ident) => {
                    names.push(snake_to_lower_camel(&ident.ident.to_string()));
                }
                Pat::Reference(reference) => {
                    if let Pat::Ident(ident) = reference.pat.as_ref() {
                        names.push(snake_to_lower_camel(&ident.ident.to_string()));
                    } else {
                        return Err(compile_error(
                            "portable `if let Some((..))` tuple elements must be identifiers",
                        ));
                    }
                }
                Pat::Wild(_) => {
                    names.push(format!("_unused{wild_count}"));
                    wild_count += 1;
                }
                _ => {
                    return Err(compile_error(
                        "portable `if let Some((..))` tuple elements must be identifiers",
                    ));
                }
            }
        }
        return Ok(Some((
            format!("[{}]", names.join(", ")),
            emit_expression(&binding.expr, entities)?,
            option_absent_value(&binding.expr, entities),
        )));
    }
    if let Pat::TupleStruct(inner_ts) = &pattern.elems[0]
        && (inner_ts.path.is_ident("Some") || inner_ts.path.is_ident("Ok"))
        && inner_ts.elems.len() == 1
        && let Pat::Ident(identifier) = &inner_ts.elems[0]
        && identifier.subpat.is_none()
    {
        return Ok(Some((
            snake_to_lower_camel(&identifier.ident.to_string()),
            emit_expression(&binding.expr, entities)?,
            option_absent_value(&binding.expr, entities),
        )));
    }
    let Pat::Ident(identifier) = &pattern.elems[0] else {
        return Ok(None);
    };
    return Ok(Some((
        snake_to_lower_camel(&identifier.ident.to_string()),
        emit_expression(&binding.expr, entities)?,
        option_absent_value(&binding.expr, entities),
    )));
}

// Option `.and_then(f)` / `.map(f)` over a receiver declared as Rust `Option`. The receiver is evaluated
// once. A body that only reads fields of the closure parameter lowers to optional chaining when the
// absent value is `undefined`; every other body binds the receiver in an arrow and tests it against the
// absent value. `.and_then` bodies already yield an Option, and `.map` bodies a payload, so both share
// one shape.
// flight-lint: allow(hashmap-iteration) the closure context filters one set into another; order is never observed
pub(super) fn emit_option_combinator(
    call: &syn::ExprMethodCall,
    receiver: &str,
    payload: &str,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let method = call.method.to_string();
    if call.args.len() == 1 && !matches!(call.args.first(), Some(Expr::Closure(_))) {
        if let Some((_, ref_method)) = associated_numeric_method(&call.args[0])
            && matches!(ref_method.as_str(), "from" | "try_from" | "try_into")
        {
            return Ok(receiver.to_string());
        }
        if let Some(json_lowering) =
            json_value_function_ref_lowering(call.args.first().unwrap(), entities)
        {
            let absent = option_absent_value(&call.receiver, entities);
            return Ok(format!(
                "((value) => value === {absent} ? {absent} : {json_lowering})({receiver})"
            ));
        }
        let function_ref = emit_expression(&call.args[0], entities)?;
        let absent = option_absent_value(&call.receiver, entities);
        let call_expr = if function_ref.starts_with('(') {
            format!("({function_ref})(value)")
        } else {
            format!("{function_ref}(value)")
        };
        return Ok(format!(
            "((value) => value === {absent} ? {absent} : {call_expr})({receiver})"
        ));
    }
    let closure = match call.args.first() {
        Some(Expr::Closure(closure)) if call.args.len() == 1 && closure.inputs.len() == 1 => {
            closure
        }
        _ => {
            return Err(compile_error(format!(
                "portable Option `.{method}()` needs a single-parameter closure"
            )));
        }
    };
    let parameter = option_closure_parameter(&closure.inputs[0]);
    if parameter.is_none() && closure_pattern_is_tuple(&closure.inputs[0]) {
        let absent = option_absent_value(&call.receiver, entities);
        let emitted = emit_closure(closure, entities)?;
        return Ok(format!(
            "((_optionPayload) => _optionPayload === {absent} ? {absent} : ({emitted})(_optionPayload))({receiver})"
        ));
    }
    let parameter_name = match parameter {
        Some(ident) => ident.to_string(),
        None if closure_pattern_is_wildcard(&closure.inputs[0]) => "_unused0".to_string(),
        None => {
            return Err(compile_error(format!(
                "portable Option `.{method}()` closure parameter must be an identifier"
            )));
        }
    };
    let mut closure_context = entities
        .iter()
        .filter(|marker| {
            **marker != format!("{ORDERED_PRIMITIVE_MARKER}{parameter_name}")
                && **marker != format!("{STRING_EXPRESSION_MARKER}{parameter_name}")
                && **marker != format!("{NULLABLE_BINDING_MARKER}{parameter_name}")
        })
        .cloned()
        .collect::<HashSet<_>>();
    // The parameter binds the receiver's payload; its site's fact is replaced so the closure body
    // resolves the parameter's fields through it.
    if let Some(parameter) = parameter
        && let Some(id) = unique_marker_suffix(
            &closure_context,
            &format!("{BINDING_SITE_MARKER}{}=", binding_site_key(parameter)),
        )
    {
        let prefix = format!("{BINDING_FACT_MARKER}{id}=");
        closure_context.retain(|marker| !marker.starts_with(&prefix));
        let fact = if payload.is_empty() {
            BindingFact::Unknown
        } else {
            BindingFact::Structure(payload.to_string())
        };
        closure_context.insert(format!("{prefix}{}", binding_fact_marker(&fact)));
    }
    if expression_is_json_value(&call.receiver, entities)
        || expression_is_option_of_json_value(&call.receiver, entities)
    {
        if let Some(parameter) = parameter {
            closure_context.insert(format!("{JSON_VALUE_MARKER}{parameter}"));
        }
    }
    let absent = option_absent_value(&call.receiver, entities);
    let binding = snake_to_lower_camel(&parameter_name);
    let body = emit_closure(closure, &closure_context)?;
    let body = body.strip_prefix(&format!("({binding}) => ")).or_else(|| {
        let after_name = body.strip_prefix(&format!("({binding}: "))?;
        let close = after_name.find(") => ")?;
        Some(&after_name[close + ") => ".len()..])
    });
    let Some(body) = body else {
        return Err(compile_error(format!(
            "portable Option `.{method}()` closure cannot declare parameter or return types"
        )));
    };
    if absent == "undefined"
        && let Some(parameter) = parameter
        && expression_is_field_projection(&closure.body, parameter)
        && let Some(fields) = body.strip_prefix(&format!("{binding}."))
    {
        let receiver = if is_lowered_primary(&call.receiver, receiver) {
            receiver.to_string()
        } else {
            format!("({receiver})")
        };
        return Ok(format!("{receiver}?.{fields}"));
    }
    let body = if matches!(closure.body.as_ref(), Expr::Block(_)) {
        format!("(({binding}) => {body})({binding})")
    } else {
        body.to_string()
    };
    if !receiver.contains('(') && !body.contains('{') && !body.contains('(') && !body.contains('?')
    {
        let emitted_closure = format!("({binding}) => {body}");
        if let Some(inlined) = inline_emitted_closure(&emitted_closure, receiver) {
            return Ok(format!("({receiver} === {absent} ? {absent} : {inlined})"));
        }
    }
    return Ok(format!(
        "(({binding}) => {binding} === {absent} ? {absent} : {body})({receiver})"
    ));
}
