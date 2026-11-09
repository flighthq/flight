use std::collections::HashSet;
use std::fmt::Write;

use syn::{Expr, Pat, Stmt};

use crate::{CompileError, compile_error};

use super::{
    HoistedMatchAction, analyze_option_wrapped_inferred_data_union_match, data_union_pattern_test,
    emit_block, emit_expression, emit_hoisted_match_arm_body, emit_literal, emit_match_patterns,
    emit_match_scrutinee, emit_statement, is_data_union_variant, is_tagged_data_union_variant,
    lexical_pattern_context, option_absent_value, path_owner_and_member,
    reserved_key_data_union_variants, resolve_type_path, scrutinee_elements, snake_to_lower_camel,
    write_indent,
};

// A match whose patterns destructure a constructor inside another constructor
// (`Outer::A(Inner::X(v))`, `(Some(Kind::Number(a)), Some(Kind::Number(b)))`). Such a pattern has no
// switch case value, so the match lowers to an if/else-if chain whose conditions compose the
// single-level test of each constructor along the path, in the representation that constructor's
// own owner lowers to. `Some(Variant(..))` over an undeclared enum keeps its dedicated lowering.
pub(super) fn match_has_nested_patterns(
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
) -> bool {
    return expression
        .arms
        .iter()
        .any(|arm| pattern_has_nested_constructor(&arm.pat, false))
        && analyze_option_wrapped_inferred_data_union_match(&expression.arms, entities).is_none();
}

// Emits a nested-pattern match as a statement. `action` carries a hoisted value match (assign or
// return each arm's value); `None` emits each arm body as a statement.
pub(super) fn emit_nested_pattern_match(
    out: &mut String,
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
    indent: usize,
    action: Option<&HoistedMatchAction<'_>>,
) -> Result<(), CompileError> {
    let has_guards = expression.arms.iter().any(|arm| arm.guard.is_some());
    write_indent(out, indent);
    out.push_str("{\n");
    let scrutinee = match scrutinee_elements(&expression.expr) {
        Some(elements) => {
            let mut temps = Vec::new();
            for (index, element) in elements.iter().enumerate() {
                let value = emit_expression(element, entities)?;
                let temp = format!("$m{index}");
                write_indent(out, indent + 1);
                writeln!(out, "const {temp} = {value};").expect("writing to a String cannot fail");
                let absent = option_absent_value(element, entities).to_string();
                temps.push((temp, absent));
            }
            NestedScrutinee::Elements(temps)
        }
        None => {
            let value = emit_match_scrutinee(out, expression, entities, indent + 1)?;
            let absent = option_absent_value(&expression.expr, entities).to_string();
            NestedScrutinee::Single(value, absent)
        }
    };
    if has_guards {
        write_indent(out, indent + 1);
        out.push_str("let $matched = false;\n");
    }
    let mut first = true;
    for arm in &expression.arms {
        let test = scrutinee_pattern_test(&arm.pat, &scrutinee, entities)?;
        let predicate = test.predicate();
        write_indent(out, indent + 1);
        match (&predicate, has_guards) {
            (Some(predicate), true) => {
                writeln!(out, "if (!$matched && {predicate}) {{")
                    .expect("writing to a String cannot fail");
            }
            (None, true) => out.push_str("if (!$matched) {\n"),
            (Some(predicate), false) => {
                let prefix = if first { "if" } else { "else if" };
                writeln!(out, "{prefix} ({predicate}) {{")
                    .expect("writing to a String cannot fail");
            }
            (None, false) => out.push_str(if first { "{\n" } else { "else {\n" }),
        }
        first = false;
        for (binding, value) in &test.bindings {
            write_indent(out, indent + 2);
            writeln!(out, "const {binding} = {value};").expect("writing to a String cannot fail");
        }
        let arm_context = lexical_pattern_context(entities, &arm.pat);
        let body_indent = if let Some((_, guard)) = &arm.guard {
            let guard = emit_expression(guard, &arm_context)?;
            write_indent(out, indent + 2);
            writeln!(out, "if ({guard}) {{").expect("writing to a String cannot fail");
            write_indent(out, indent + 3);
            out.push_str("$matched = true;\n");
            indent + 3
        } else {
            if has_guards {
                write_indent(out, indent + 2);
                out.push_str("$matched = true;\n");
            }
            indent + 2
        };
        match (action, arm.body.as_ref()) {
            (Some(action), body) => {
                emit_hoisted_match_arm_body(out, body, action, &arm_context, body_indent)?
            }
            (None, Expr::Block(block)) => {
                emit_block(out, &block.block.stmts, &arm_context, body_indent)?
            }
            (None, body) => emit_statement(
                out,
                &Stmt::Expr(body.clone(), None),
                &arm_context,
                body_indent,
            )?,
        }
        if arm.guard.is_some() {
            write_indent(out, indent + 2);
            out.push_str("}\n");
        }
        write_indent(out, indent + 1);
        out.push_str("}\n");
        // Later arms are unreachable after an unguarded catch-all closes the chain.
        if predicate.is_none() && arm.guard.is_none() {
            break;
        }
    }
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

// The value-position form: the statement lowering inside an immediately invoked arrow function whose
// arms return their values.
pub(super) fn emit_nested_pattern_match_expression(
    expression: &syn::ExprMatch,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let mut out = String::from("(() => {\n");
    emit_nested_pattern_match(
        &mut out,
        expression,
        entities,
        1,
        Some(&HoistedMatchAction::Return),
    )?;
    out.push_str("})()");
    return Ok(out);
}

enum NestedScrutinee {
    // Each element of a tuple scrutinee, bound once to a temporary, with its `None` value.
    Elements(Vec<(String, String)>),
    Single(String, String),
}

#[derive(Default)]
struct NestedPatternTest {
    bindings: Vec<(String, String)>,
    predicates: Vec<String>,
}

impl NestedPatternTest {
    fn predicate(&self) -> Option<String> {
        return (!self.predicates.is_empty()).then(|| self.predicates.join(" && "));
    }
}

fn scrutinee_pattern_test(
    pattern: &Pat,
    scrutinee: &NestedScrutinee,
    entities: &HashSet<String>,
) -> Result<NestedPatternTest, CompileError> {
    let mut test = NestedPatternTest::default();
    match scrutinee {
        NestedScrutinee::Single(value, absent) => {
            nested_pattern_test(pattern, value, absent, entities, &mut test)?
        }
        NestedScrutinee::Elements(temps) => match peel_pattern(pattern) {
            Pat::Tuple(tuple) if tuple.elems.len() == temps.len() => {
                for (element, (temp, absent)) in tuple.elems.iter().zip(temps) {
                    nested_pattern_test(element, temp, absent, entities, &mut test)?;
                }
            }
            Pat::Or(or) => {
                let alternatives = or
                    .cases
                    .iter()
                    .map(|case| scrutinee_pattern_test(case, scrutinee, entities))
                    .collect::<Result<Vec<_>, _>>()?;
                merge_alternatives(alternatives, &mut test)?;
            }
            Pat::Wild(_) => {}
            Pat::Ident(identifier) if identifier.subpat.is_none() => {
                if identifier.ident != "_" {
                    let elements = temps
                        .iter()
                        .map(|(temp, _)| temp.as_str())
                        .collect::<Vec<_>>()
                        .join(", ");
                    test.bindings.push((
                        snake_to_lower_camel(&identifier.ident.to_string()),
                        format!("[{elements}]"),
                    ));
                }
            }
            _ => return Err(unsupported_nested_pattern()),
        },
    }
    return Ok(test);
}

// Appends to `test` the conditions under which `pattern` matches the JavaScript value `value`, and the
// bindings it introduces. `absent` is the value `None` lowers to at this position.
fn nested_pattern_test(
    pattern: &Pat,
    value: &str,
    absent: &str,
    entities: &HashSet<String>,
    test: &mut NestedPatternTest,
) -> Result<(), CompileError> {
    match pattern {
        Pat::Paren(paren) => return nested_pattern_test(&paren.pat, value, absent, entities, test),
        Pat::Reference(reference) => {
            return nested_pattern_test(&reference.pat, value, absent, entities, test);
        }
        Pat::Wild(_) => {}
        Pat::Ident(identifier) if identifier.subpat.is_none() => {
            if identifier.ident == "None" {
                test.predicates.push(format!("{value} === {absent}"));
            } else if identifier.ident != "_" {
                test.bindings.push((
                    snake_to_lower_camel(&identifier.ident.to_string()),
                    value.to_string(),
                ));
            }
        }
        Pat::Lit(literal) => {
            let literal = emit_literal(&literal.lit)?;
            test.predicates.push(format!("{value} === {literal}"));
        }
        Pat::Path(path) if path.path.is_ident("None") => {
            test.predicates.push(format!("{value} === {absent}"));
        }
        Pat::Path(path) if let Some(variant) = json_value_variant(&path.path, entities) => {
            test.predicates.push(json_value_predicate(&variant, value)?);
        }
        Pat::TupleStruct(tuple_struct)
            if tuple_struct.elems.len() == 1
                && let Some(variant) = json_value_variant(&tuple_struct.path, entities) =>
        {
            test.predicates.push(json_value_predicate(&variant, value)?);
            nested_pattern_test(&tuple_struct.elems[0], value, absent, entities, test)?;
        }
        Pat::Path(_) => {
            if let Some(single) = data_union_pattern_test(pattern, value, entities)? {
                push_single_level_test(single.predicate, single.bindings, test);
            } else {
                let cases = emit_match_patterns(pattern, entities)?
                    .into_iter()
                    .map(|case| format!("{value} === {case}"))
                    .collect::<Vec<_>>();
                test.predicates
                    .push(parenthesize_disjunction(cases.join(" || ")));
            }
        }
        Pat::TupleStruct(tuple_struct)
            if tuple_struct.path.is_ident("Some") && tuple_struct.elems.len() == 1 =>
        {
            let inner = peel_pattern(&tuple_struct.elems[0]);
            if is_option_pattern(inner) {
                return Err(compile_error(
                    "nested Option pattern (`Some(Some(..))` or `Some(None)`) has no lowering: \
                     `Option<Option<T>>` erases both levels to one TypeScript `undefined`",
                ));
            }
            test.predicates.push(format!("{value} !== {absent}"));
            nested_pattern_test(inner, value, absent, entities, test)?;
        }
        Pat::TupleStruct(tuple_struct) => {
            let elements = tuple_struct.elems.iter().collect::<Vec<_>>();
            constructor_pattern_test(
                pattern,
                &tuple_struct.path,
                &elements,
                value,
                entities,
                test,
            )?;
        }
        Pat::Struct(structure) => {
            let elements = structure
                .fields
                .iter()
                .map(|field| field.pat.as_ref())
                .collect::<Vec<_>>();
            constructor_pattern_test(pattern, &structure.path, &elements, value, entities, test)?;
        }
        Pat::Tuple(tuple) => {
            for (index, element) in tuple.elems.iter().enumerate() {
                nested_pattern_test(
                    element,
                    &format!("{value}[{index}]"),
                    absent,
                    entities,
                    test,
                )?;
            }
        }
        Pat::Or(or) => {
            let alternatives = or
                .cases
                .iter()
                .map(|case| {
                    let mut alternative = NestedPatternTest::default();
                    nested_pattern_test(case, value, absent, entities, &mut alternative)?;
                    return Ok(alternative);
                })
                .collect::<Result<Vec<_>, CompileError>>()?;
            merge_alternatives(alternatives, test)?;
        }
        _ => return Err(unsupported_nested_pattern()),
    }
    return Ok(());
}

// One enum constructor: its own single-level test (the owner's representation decides the predicate
// and where each payload lives), then each nested payload pattern tested against that payload.
fn constructor_pattern_test(
    pattern: &Pat,
    path: &syn::Path,
    elements: &[&Pat],
    value: &str,
    entities: &HashSet<String>,
    test: &mut NestedPatternTest,
) -> Result<(), CompileError> {
    let nested = elements
        .iter()
        .enumerate()
        .filter(|(_, element)| !is_simple_payload_pattern(element))
        .map(|(position, _)| position)
        .collect::<Vec<_>>();
    if nested.is_empty() {
        let Some(single) = data_union_pattern_test(pattern, value, entities)? else {
            return Err(unsupported_nested_pattern());
        };
        push_single_level_test(single.predicate, single.bindings, test);
        return Ok(());
    }
    // Bind each nested payload to a placeholder name so the single-level test reports where it lives.
    let mut flattened = pattern.clone();
    let mut placeholders = Vec::new();
    for position in &nested {
        let placeholder = format!("nested_payload_{position}");
        flattened = with_placeholder(&flattened, *position, &placeholder);
        placeholders.push((*position, snake_to_lower_camel(&placeholder)));
    }
    let Some(single) = data_union_pattern_test(&flattened, value, entities)? else {
        return Err(unsupported_nested_pattern());
    };
    let mut bindings = single.bindings;
    let mut payloads = Vec::new();
    for (position, placeholder) in placeholders {
        let Some(index) = bindings.iter().position(|(name, _)| *name == placeholder) else {
            return Err(unsupported_nested_pattern());
        };
        payloads.push((position, bindings.remove(index).1));
    }
    let owner_is_declared = path_owner_and_member(path).is_some_and(|(owner, variant)| {
        is_data_union_variant(entities, &owner, &variant)
            || is_tagged_data_union_variant(entities, &owner, &variant)
            || !reserved_key_data_union_variants(entities, &owner).is_empty()
    });
    // An undeclared owner lowers as `{ kind, ...payload }`, so a payload that is itself an enum shares
    // the outer object and its `kind`: the outer variant is a transparent wrapper, identified by the
    // inner variant's test alone (a second `kind` comparison could never hold).
    let wrapper = !owner_is_declared
        && payloads.len() == 1
        && payloads[0].1 == value
        && is_enum_constructor_pattern(elements[payloads[0].0]);
    let predicate = if wrapper { None } else { single.predicate };
    push_single_level_test(predicate, bindings, test);
    for (position, payload) in payloads {
        nested_pattern_test(elements[position], &payload, "undefined", entities, test)?;
    }
    return Ok(());
}

// `pattern` with the payload at `position` replaced by a binding named `placeholder`.
fn with_placeholder(pattern: &Pat, position: usize, placeholder: &str) -> Pat {
    let replacement = Pat::Ident(syn::PatIdent {
        attrs: Vec::new(),
        by_ref: None,
        mutability: None,
        ident: syn::Ident::new(placeholder, proc_macro2::Span::call_site()),
        subpat: None,
    });
    return match pattern.clone() {
        Pat::TupleStruct(mut tuple_struct) => {
            tuple_struct.elems[position] = replacement;
            Pat::TupleStruct(tuple_struct)
        }
        Pat::Struct(mut structure) => {
            let field = &mut structure.fields[position];
            field.colon_token.get_or_insert_with(Default::default);
            *field.pat = replacement;
            Pat::Struct(structure)
        }
        other => other,
    };
}

// The variant a `serde_json::Value` constructor pattern names. A JSON value lowers to the plain
// JavaScript value it parses to, so each variant is a runtime type test and its payload is the value.
fn json_value_variant(path: &syn::Path, entities: &HashSet<String>) -> Option<String> {
    let (_, variant) = path_owner_and_member(path)?;
    let mut owner = path.clone();
    owner.segments.pop();
    owner.segments.pop_punct();
    let resolved = resolve_type_path(&owner, entities)?;
    let resolved = resolved.iter().map(String::as_str).collect::<Vec<_>>();
    return matches!(
        resolved.as_slice(),
        ["serde_json", "Value"] | ["serde_json", "value", "Value"]
    )
    .then_some(variant);
}

fn json_value_predicate(variant: &str, value: &str) -> Result<String, CompileError> {
    return match variant {
        "Null" => Ok(format!("{value} === null")),
        "Bool" => Ok(format!("typeof {value} === 'boolean'")),
        "Number" => Ok(format!("typeof {value} === 'number'")),
        "String" => Ok(format!("typeof {value} === 'string'")),
        "Array" => Ok(format!("Array.isArray({value})")),
        "Object" => Ok(format!(
            "(typeof {value} === 'object' && {value} !== null && !Array.isArray({value}))"
        )),
        _ => Err(unsupported_nested_pattern()),
    };
}

fn push_single_level_test(
    predicate: Option<String>,
    bindings: Vec<(String, String)>,
    test: &mut NestedPatternTest,
) {
    if let Some(predicate) = predicate {
        test.predicates.push(parenthesize_disjunction(predicate));
    }
    test.bindings.extend(bindings);
}

// Or-alternatives join as a disjunction of their conjunctions; each must bind the same names from the
// same place, since one `const` per name follows the condition.
fn merge_alternatives(
    alternatives: Vec<NestedPatternTest>,
    test: &mut NestedPatternTest,
) -> Result<(), CompileError> {
    let Some(first) = alternatives.first() else {
        return Ok(());
    };
    if alternatives
        .iter()
        .any(|alternative| alternative.bindings != first.bindings)
    {
        return Err(compile_error(
            "nested or-pattern alternatives must bind the same names from the same payloads",
        ));
    }
    let bindings = first.bindings.clone();
    if alternatives
        .iter()
        .any(|alternative| alternative.predicates.is_empty())
    {
        test.bindings.extend(bindings);
        return Ok(());
    }
    let disjunction = alternatives
        .iter()
        .map(|alternative| {
            let conjunction = alternative.predicates.join(" && ");
            if alternative.predicates.len() > 1 {
                format!("({conjunction})")
            } else {
                conjunction
            }
        })
        .collect::<Vec<_>>()
        .join(" || ");
    test.predicates.push(format!("({disjunction})"));
    test.bindings.extend(bindings);
    return Ok(());
}

fn parenthesize_disjunction(predicate: String) -> String {
    if predicate.contains(" || ") && !(predicate.starts_with('(') && predicate.ends_with(')')) {
        return format!("({predicate})");
    }
    return predicate;
}

fn peel_pattern(pattern: &Pat) -> &Pat {
    return match pattern {
        Pat::Paren(paren) => peel_pattern(&paren.pat),
        Pat::Reference(reference) => peel_pattern(&reference.pat),
        _ => pattern,
    };
}

fn is_option_pattern(pattern: &Pat) -> bool {
    return match pattern {
        Pat::TupleStruct(tuple_struct) => tuple_struct.path.is_ident("Some"),
        Pat::Path(path) => path.path.is_ident("None"),
        Pat::Ident(identifier) => identifier.ident == "None" && identifier.subpat.is_none(),
        Pat::Or(or) => or
            .cases
            .iter()
            .any(|case| is_option_pattern(peel_pattern(case))),
        _ => false,
    };
}

fn is_enum_constructor_pattern(pattern: &Pat) -> bool {
    return match peel_pattern(pattern) {
        Pat::TupleStruct(tuple_struct) => path_owner_and_member(&tuple_struct.path).is_some(),
        Pat::Struct(structure) => path_owner_and_member(&structure.path).is_some(),
        Pat::Path(path) => path_owner_and_member(&path.path).is_some(),
        Pat::Or(or) => or.cases.iter().all(is_enum_constructor_pattern),
        _ => false,
    };
}

// A payload position the single-level lowerings already bind: a name, `_`, a reference to one, or a
// struct pattern of those.
fn is_simple_payload_pattern(pattern: &Pat) -> bool {
    return match peel_pattern(pattern) {
        Pat::Wild(_) => true,
        Pat::Ident(identifier) => identifier.subpat.is_none() && identifier.ident != "None",
        Pat::Struct(structure) => structure
            .fields
            .iter()
            .all(|field| is_simple_payload_pattern(&field.pat)),
        _ => false,
    };
}

// Whether a constructor somewhere in `pattern` destructures another constructor (an enum variant,
// `Some`, or `None`) in one of its payload positions.
fn pattern_has_nested_constructor(pattern: &Pat, inside_constructor: bool) -> bool {
    return match pattern {
        Pat::Paren(paren) => pattern_has_nested_constructor(&paren.pat, inside_constructor),
        Pat::Reference(reference) => {
            pattern_has_nested_constructor(&reference.pat, inside_constructor)
        }
        Pat::Tuple(tuple) => tuple
            .elems
            .iter()
            .any(|element| pattern_has_nested_constructor(element, inside_constructor)),
        Pat::Or(or) => or
            .cases
            .iter()
            .any(|case| pattern_has_nested_constructor(case, inside_constructor)),
        // `Ok`/`Err` payloads keep the switch lowering's own handling.
        Pat::TupleStruct(tuple_struct)
            if tuple_struct.path.is_ident("Ok") || tuple_struct.path.is_ident("Err") =>
        {
            false
        }
        Pat::TupleStruct(tuple_struct) => {
            inside_constructor
                || tuple_struct
                    .elems
                    .iter()
                    .any(|element| pattern_has_nested_constructor(element, true))
        }
        // A struct pattern destructures its fields in place, so only a constructor inside a field nests.
        Pat::Struct(structure) => structure
            .fields
            .iter()
            .any(|field| pattern_has_nested_constructor(&field.pat, true)),
        Pat::Path(path) => {
            inside_constructor
                && (path.path.is_ident("None") || path_owner_and_member(&path.path).is_some())
        }
        Pat::Ident(identifier) => {
            inside_constructor && identifier.ident == "None" && identifier.subpat.is_none()
        }
        _ => false,
    };
}

fn unsupported_nested_pattern() -> CompileError {
    return compile_error("unsupported portable Rust match pattern");
}
