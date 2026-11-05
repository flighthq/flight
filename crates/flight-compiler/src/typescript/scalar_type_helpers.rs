use std::collections::HashSet;

use syn::{Expr, PathArguments, Type};

use crate::CompileError;

use super::{compile_error, emit_expression, type_is_named};

pub(super) fn float_bit_comparison(
    binary: &syn::ExprBinary,
    entities: &HashSet<String>,
) -> Result<Option<(String, String)>, CompileError> {
    let Expr::MethodCall(left) = binary.left.as_ref() else {
        return Ok(None);
    };
    let Expr::MethodCall(right) = binary.right.as_ref() else {
        return Ok(None);
    };
    if left.method != "to_bits"
        || right.method != "to_bits"
        || !left.args.is_empty()
        || !right.args.is_empty()
    {
        return Ok(None);
    }
    return Ok(Some((
        emit_expression(&left.receiver, entities)?,
        emit_expression(&right.receiver, entities)?,
    )));
}

pub(super) fn float_constant_type(path: &syn::Path) -> Option<&'static str> {
    let segments = path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    if segments.len() >= 2 {
        let rust_type = segments[segments.len() - 2].as_str();
        if rust_type == "f32" {
            return Some("f32");
        }
        if rust_type == "f64" {
            return Some("f64");
        }
    }
    if segments.len() >= 3 && segments[segments.len() - 2] == "consts" {
        let rust_type = segments[segments.len() - 3].as_str();
        if rust_type == "f32" {
            return Some("f32");
        }
        if rust_type == "f64" {
            return Some("f64");
        }
    }
    return None;
}

pub(super) fn emit_numeric_function_reference(
    numeric_type: &str,
    method: &str,
) -> Result<String, CompileError> {
    return match method {
        "from" | "try_from" | "try_into" => Ok("(v) => v".to_string()),
        "is_ascii_digit" => Ok("((v: string | number): boolean => typeof v === 'number' ? v >= 48 && v <= 57 : v >= '0' && v <= '9')".to_string()),
        "is_ascii_lowercase" => Ok("((v: string | number): boolean => typeof v === 'number' ? v >= 97 && v <= 122 : v >= 'a' && v <= 'z')".to_string()),
        "is_ascii_uppercase" => Ok("((v: string | number): boolean => typeof v === 'number' ? v >= 65 && v <= 90 : v >= 'A' && v <= 'Z')".to_string()),
        "is_ascii_alphabetic" => Ok("((v: string | number): boolean => typeof v === 'number' ? (v >= 65 && v <= 90) || (v >= 97 && v <= 122) : (/^[a-zA-Z]$/).test(v))".to_string()),
        "is_ascii_alphanumeric" => Ok("((v: string | number): boolean => typeof v === 'number' ? (v >= 48 && v <= 57) || (v >= 65 && v <= 90) || (v >= 97 && v <= 122) : (/^[a-zA-Z0-9]$/).test(v))".to_string()),
        "is_ascii_hexdigit" => Ok("((v: string | number): boolean => typeof v === 'number' ? (v >= 48 && v <= 57) || (v >= 65 && v <= 70) || (v >= 97 && v <= 102) : (/^[0-9a-fA-F]$/).test(v))".to_string()),
        "is_ascii_whitespace" => Ok("((v: string | number): boolean => typeof v === 'number' ? v === 32 || v === 9 || v === 10 || v === 13 || v === 12 : v === ' ' || v === '\\t' || v === '\\n' || v === '\\r' || v === '\\x0C')".to_string()),
        "is_finite" => Ok("((v: number): boolean => Number.isFinite(v))".to_string()),
        "is_nan" => Ok("((v: number): boolean => Number.isNaN(v))".to_string()),
        "is_infinite" => Ok("((v: number): boolean => !Number.isFinite(v) && !Number.isNaN(v))".to_string()),
        "min" => Ok("Math.min".to_string()),
        "max" => Ok("Math.max".to_string()),
        "round" if matches!(numeric_type, "f32" | "f64") => {
            Ok("((n: number): number => Math.trunc(n + 0.5 * Math.sign(n)))".to_string())
        }
        "floor" if matches!(numeric_type, "f32" | "f64") => Ok("Math.floor".to_string()),
        "ceil" if matches!(numeric_type, "f32" | "f64") => Ok("Math.ceil".to_string()),
        "abs" if matches!(numeric_type, "f32" | "f64") => Ok("Math.abs".to_string()),
        "sqrt" if matches!(numeric_type, "f32" | "f64") => Ok("Math.sqrt".to_string()),
        _ => Err(compile_error(format!(
            "portable `{numeric_type}::{method}` as a function reference is not supported"
        ))),
    };
}

pub(super) fn associated_numeric_method(expression: &Expr) -> Option<(String, String)> {
    let Expr::Path(path) = expression else {
        return None;
    };
    if path.path.segments.len() < 2 {
        return None;
    }
    let mut segments = path.path.segments.iter().rev();
    let method = segments.next()?.ident.to_string();
    let owner = segments.next()?.ident.to_string();
    match owner.as_str() {
        "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32" | "u64"
        | "usize" => Some((owner, method)),
        _ => None,
    }
}

pub(super) fn numeric_dataview_info(rust_type: &str) -> Option<(&'static str, u8)> {
    return match rust_type {
        "f32" => Some(("Float32", 4)),
        "f64" => Some(("Float64", 8)),
        "i8" => Some(("Int8", 1)),
        "i16" => Some(("Int16", 2)),
        "i32" | "isize" => Some(("Int32", 4)),
        "i64" => Some(("BigInt64", 8)),
        "u8" => Some(("Uint8", 1)),
        "u16" => Some(("Uint16", 2)),
        "u32" | "usize" => Some(("Uint32", 4)),
        "u64" => Some(("BigUint64", 8)),
        _ => None,
    };
}

pub(super) fn numeric_native_integer_typed_array(rust_type: &str) -> Option<&'static str> {
    return match rust_type {
        "i8" => Some("Int8Array"),
        "i16" => Some("Int16Array"),
        "i32" => Some("Int32Array"),
        "u8" => Some("Uint8Array"),
        "u16" => Some("Uint16Array"),
        "u32" => Some("Uint32Array"),
        _ => None,
    };
}

pub(super) fn primitive_type_identity(rust_type: &Type) -> Option<String> {
    let name = match rust_type {
        Type::Group(group) => return primitive_type_identity(&group.elem),
        Type::Paren(paren) => return primitive_type_identity(&paren.elem),
        Type::Reference(reference) => return primitive_type_identity(&reference.elem),
        Type::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => {
            path.path.segments[0].ident.to_string()
        }
        _ => return None,
    };
    return match name.as_str() {
        "bool" | "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "i128" | "isize" | "str"
        | "String" | "u8" | "u16" | "u32" | "u64" | "u128" | "usize" => Some(name),
        _ => None,
    };
}

pub(super) fn path_is_type_constant(path: &syn::Path, rust_type: &str, constant: &str) -> bool {
    let mut segments = path.segments.iter().rev();
    return segments
        .next()
        .is_some_and(|segment| segment.ident == constant)
        && segments
            .next()
            .is_some_and(|segment| segment.ident == rust_type);
}

pub(super) fn type_is_unsigned_integer(rust_type: &Type) -> bool {
    return ["u8", "u16", "u32", "u64", "usize"]
        .iter()
        .any(|name| type_is_named(rust_type, name));
}

// Exact scalar types whose complete runtime representation is one TypeScript primitive. Aliases,
// qualified paths, generics and 64/128-bit integers stay unproven: the mutable-reference cell
// lowering must never infer their ownership or precision contract from a spelling alone.
pub(crate) fn exact_portable_scalar_type(rust_type: &Type) -> Option<&'static str> {
    let Type::Path(path) = rust_type else {
        return None;
    };
    if path.qself.is_some() || path.path.leading_colon.is_some() || path.path.segments.len() != 1 {
        return None;
    }
    let segment = path.path.segments.first()?;
    if !matches!(segment.arguments, PathArguments::None) {
        return None;
    }
    return match segment.ident.to_string().as_str() {
        "bool" => Some("bool"),
        "f32" => Some("f32"),
        "f64" => Some("f64"),
        "i8" => Some("i8"),
        "i16" => Some("i16"),
        "i32" => Some("i32"),
        "isize" => Some("isize"),
        "u8" => Some("u8"),
        "u16" => Some("u16"),
        "u32" => Some("u32"),
        "usize" => Some("usize"),
        _ => None,
    };
}

pub(crate) fn exact_mutable_scalar_reference(rust_type: &Type) -> Option<&'static str> {
    let Type::Reference(reference) = rust_type else {
        return None;
    };
    reference.mutability?;
    return exact_portable_scalar_type(&reference.elem);
}

pub(super) fn referenced_path_identifier(expression: &Expr) -> Option<String> {
    return match expression {
        Expr::Group(group) => referenced_path_identifier(&group.expr),
        Expr::Paren(paren) => referenced_path_identifier(&paren.expr),
        Expr::Path(path) if path.qself.is_none() && path.path.segments.len() == 1 => path
            .path
            .segments
            .first()
            .map(|segment| segment.ident.to_string()),
        Expr::Reference(reference) => referenced_path_identifier(&reference.expr),
        _ => None,
    };
}

pub(super) fn path_is_float_constant(path: &syn::Path, constant: &str) -> bool {
    return float_constant_type(path).is_some()
        && path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == constant);
}

pub(super) fn float_const_js_value(name: &str) -> Option<&'static str> {
    return match name {
        "E" => Some("Math.E"),
        "FRAC_1_PI" => Some("(1 / Math.PI)"),
        "FRAC_1_SQRT_2" => Some("Math.SQRT1_2"),
        "FRAC_2_PI" => Some("(2 / Math.PI)"),
        "FRAC_2_SQRT_PI" => Some("(2 / Math.sqrt(Math.PI))"),
        "FRAC_PI_2" => Some("(Math.PI / 2)"),
        "FRAC_PI_3" => Some("(Math.PI / 3)"),
        "FRAC_PI_4" => Some("(Math.PI / 4)"),
        "FRAC_PI_6" => Some("(Math.PI / 6)"),
        "FRAC_PI_8" => Some("(Math.PI / 8)"),
        "LN_2" => Some("Math.LN2"),
        "LN_10" => Some("Math.LN10"),
        "LOG2_E" => Some("Math.LOG2E"),
        "LOG2_10" => Some("(Math.LN10 / Math.LN2)"),
        "LOG10_E" => Some("Math.LOG10E"),
        "LOG10_2" => Some("(Math.LN2 / Math.LN10)"),
        "PI" => Some("Math.PI"),
        "SQRT_2" => Some("Math.SQRT2"),
        "TAU" => Some("(Math.PI * 2)"),
        _ => None,
    };
}
