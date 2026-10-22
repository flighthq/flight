//! Test support for evaluating the arithmetic inside the fragment shader an effect actually ships.
//!
//! A text assertion on a shader is a claim about a spelling; substituting values into the shipped
//! expression and evaluating it is a claim about behaviour, made against the exact text handed to
//! the compiler. It evaluates ONE extracted SCALAR expression over the arithmetic subset GLSL shares
//! with JavaScript (numbers, `+ - * /`, unary signs, parentheses and the scalar builtins). Vector
//! types, swizzles, texture reads and control flow are outside that subset, and an expression using
//! them throws here rather than quietly returning a number. The `%` operator is deliberately absent:
//! GLSL has no integer-modulo on floats, so it is reported as unevaluatable.

use flight_entity::{Record, Ref, get_record_keys, get_record_value, throw_error};
use flight_regexp::{RegExp, exec_reg_exp};

const GLSL_SCALAR_BUILTINS: [&str; 18] = [
    "abs",
    "ceil",
    "clamp",
    "cos",
    "exp",
    "floor",
    "fract",
    "log",
    "max",
    "min",
    "mix",
    "pow",
    "sign",
    "sin",
    "smoothstep",
    "sqrt",
    "step",
    "tan",
];

struct GlslScalarParser<'a> {
    bytes: &'a [u8],
    position: usize,
}

fn apply_glsl_scalar_builtin(name: &str, arguments: &[f32]) -> Option<f32> {
    let argument = |index: usize| arguments.get(index).copied().unwrap_or(f32::NAN);
    return Some(match name {
        "abs" => argument(0).abs(),
        "ceil" => argument(0).ceil(),
        "clamp" => argument(0).max(argument(1)).min(argument(2)),
        "cos" => argument(0).cos(),
        "exp" => argument(0).exp(),
        "floor" => argument(0).floor(),
        "fract" => argument(0) - argument(0).floor(),
        "log" => argument(0).ln(),
        "max" => arguments.iter().copied().fold(f32::NEG_INFINITY, f32::max),
        "min" => arguments.iter().copied().fold(f32::INFINITY, f32::min),
        "mix" => argument(0) + (argument(1) - argument(0)) * argument(2),
        "pow" => argument(0).powf(argument(1)),
        "sign" => {
            let x = argument(0);
            if x > 0.0 {
                1.0
            } else if x < 0.0 {
                -1.0
            } else {
                x
            }
        }
        "sin" => argument(0).sin(),
        "smoothstep" => {
            let t = ((argument(2) - argument(0)) / (argument(1) - argument(0))).clamp(0.0, 1.0);
            t * t * (3.0 - 2.0 * t)
        }
        "sqrt" => argument(0).sqrt(),
        "step" => {
            if argument(1) < argument(0) {
                0.0
            } else {
                1.0
            }
        }
        "tan" => argument(0).tan(),
        _ => return None,
    });
}

/// Evaluates a scalar GLSL expression with each named input bound to a number.
///
/// Every identifier in the expression must be either bound by the caller or a scalar builtin;
/// anything else throws, so a renamed uniform surfaces as a failure rather than as a value computed
/// from a partially substituted expression. Bindings substitute longest name first, so a shorter
/// binding that is a substring of a longer one is never substituted inside it.
pub fn evaluate_glsl_scalar_expression(expression: &str, bindings: &Record<f32>) -> f32 {
    let mut names = Vec::new();
    get_record_keys(&mut names, bindings);
    // Longest name first (stable, so equal lengths keep insertion order as TS `sort` does).
    names.sort_by_key(|name| std::cmp::Reverse(name.len()));
    let mut text = expression.to_string();
    for name in &names {
        let value = *get_record_value(bindings, name).expect("binding key was just listed");
        text = text
            .split(name.as_str())
            .collect::<Vec<_>>()
            .join(&format!("({value})"));
    }
    for token in scan_glsl_identifiers(&text) {
        if !GLSL_SCALAR_BUILTINS.contains(&token.as_str()) {
            throw_error(&format!(
                "evaluateGlslScalarExpression: no binding for '{token}' in: {expression}"
            ));
        }
    }
    let mut parser = GlslScalarParser {
        bytes: text.as_bytes(),
        position: 0,
    };
    let value = parse_glsl_scalar_sum(&mut parser).and_then(|value| {
        skip_glsl_whitespace(&mut parser);
        return if parser.position == parser.bytes.len() {
            Some(value)
        } else {
            None
        };
    });
    return match value {
        Some(value) if value.is_finite() => value,
        _ => throw_error(&format!(
            "evaluateGlslScalarExpression: '{expression}' did not evaluate to a finite number"
        )),
    };
}

/// Pulls one capture group out of a shader source. Throws when the pattern does not match, because
/// a silently-unmatched anchor is the failure mode that lets a test measure nothing and report
/// success.
pub fn extract_glsl_expression(source: &str, pattern: &Ref<RegExp>) -> String {
    let matched =
        exec_reg_exp(pattern, source).and_then(|result| result.matches.get(1).cloned().flatten());
    let Some(expression) = matched else {
        let pattern_text = {
            let pattern = pattern
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            format!("/{}/{}", pattern.source, pattern.flags)
        };
        throw_error(&format!(
            "extractGlslExpression: {pattern_text} matched no expression in the shader source"
        ));
    };
    return expression.trim().to_string();
}

fn parse_glsl_scalar_call(parser: &mut GlslScalarParser<'_>, name: &str) -> Option<f32> {
    let mut arguments = Vec::new();
    skip_glsl_whitespace(parser);
    if peek_glsl_byte(parser) == Some(b')') {
        parser.position += 1;
        return apply_glsl_scalar_builtin(name, &arguments);
    }
    loop {
        arguments.push(parse_glsl_scalar_sum(parser)?);
        skip_glsl_whitespace(parser);
        match peek_glsl_byte(parser) {
            Some(b',') => parser.position += 1,
            Some(b')') => {
                parser.position += 1;
                return apply_glsl_scalar_builtin(name, &arguments);
            }
            _ => return None,
        }
    }
}

fn parse_glsl_scalar_primary(parser: &mut GlslScalarParser<'_>) -> Option<f32> {
    skip_glsl_whitespace(parser);
    let byte = peek_glsl_byte(parser)?;
    if byte == b'(' {
        parser.position += 1;
        let value = parse_glsl_scalar_sum(parser)?;
        skip_glsl_whitespace(parser);
        if peek_glsl_byte(parser) != Some(b')') {
            return None;
        }
        parser.position += 1;
        return Some(value);
    }
    if byte.is_ascii_digit() || byte == b'.' {
        let start = parser.position;
        while let Some(next) = peek_glsl_byte(parser) {
            if next.is_ascii_digit() || next == b'.' {
                parser.position += 1;
            } else {
                break;
            }
        }
        let text = std::str::from_utf8(&parser.bytes[start..parser.position]).ok()?;
        return text.parse::<f32>().ok();
    }
    if byte.is_ascii_alphabetic() || byte == b'_' {
        let start = parser.position;
        while let Some(next) = peek_glsl_byte(parser) {
            if next.is_ascii_alphanumeric() || next == b'_' {
                parser.position += 1;
            } else {
                break;
            }
        }
        let name = std::str::from_utf8(&parser.bytes[start..parser.position])
            .ok()?
            .to_string();
        skip_glsl_whitespace(parser);
        if peek_glsl_byte(parser) != Some(b'(') {
            return None;
        }
        parser.position += 1;
        return parse_glsl_scalar_call(parser, &name);
    }
    return None;
}

fn parse_glsl_scalar_product(parser: &mut GlslScalarParser<'_>) -> Option<f32> {
    let mut value = parse_glsl_scalar_unary(parser)?;
    loop {
        skip_glsl_whitespace(parser);
        match peek_glsl_byte(parser) {
            Some(b'*') => {
                parser.position += 1;
                value *= parse_glsl_scalar_unary(parser)?;
            }
            Some(b'/') => {
                parser.position += 1;
                value /= parse_glsl_scalar_unary(parser)?;
            }
            _ => return Some(value),
        }
    }
}

fn parse_glsl_scalar_sum(parser: &mut GlslScalarParser<'_>) -> Option<f32> {
    let mut value = parse_glsl_scalar_product(parser)?;
    loop {
        skip_glsl_whitespace(parser);
        match peek_glsl_byte(parser) {
            Some(b'+') => {
                parser.position += 1;
                value += parse_glsl_scalar_product(parser)?;
            }
            Some(b'-') => {
                parser.position += 1;
                value -= parse_glsl_scalar_product(parser)?;
            }
            _ => return Some(value),
        }
    }
}

fn parse_glsl_scalar_unary(parser: &mut GlslScalarParser<'_>) -> Option<f32> {
    skip_glsl_whitespace(parser);
    return match peek_glsl_byte(parser) {
        Some(b'-') => {
            parser.position += 1;
            Some(-parse_glsl_scalar_unary(parser)?)
        }
        Some(b'+') => {
            parser.position += 1;
            parse_glsl_scalar_unary(parser)
        }
        _ => parse_glsl_scalar_primary(parser),
    };
}

fn peek_glsl_byte(parser: &GlslScalarParser<'_>) -> Option<u8> {
    return parser.bytes.get(parser.position).copied();
}

/// The identifier tokens TS finds with `/[A-Za-z_][\w.]*/g`.
fn scan_glsl_identifiers(text: &str) -> Vec<String> {
    let bytes = text.as_bytes();
    let mut tokens = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        let byte = bytes[index];
        if byte.is_ascii_alphabetic() || byte == b'_' {
            let start = index;
            index += 1;
            while index < bytes.len()
                && (bytes[index].is_ascii_alphanumeric()
                    || bytes[index] == b'_'
                    || bytes[index] == b'.')
            {
                index += 1;
            }
            tokens.push(text[start..index].to_string());
        } else {
            index += 1;
        }
    }
    return tokens;
}

fn skip_glsl_whitespace(parser: &mut GlslScalarParser<'_>) {
    while let Some(byte) = peek_glsl_byte(parser) {
        if byte.is_ascii_whitespace() {
            parser.position += 1;
        } else {
            break;
        }
    }
}
