use std::collections::HashSet;
use std::fmt::Write;

use syn::{Attribute, BinOp, Expr, Lit, Type};

use crate::CompileError;
use crate::model::Program;

use super::{
    PRIMARY_PRECEDENCE, compile_error, emit_expression, emit_expression_for_type, emit_type,
    entity_runtime_state_store, export_name, integer_literal_fits_cast, is_integer_cast_elided,
    is_lowered_primary, is_public, rewrite_documentation, type_is_named, write_indent,
};

pub(super) fn documentation(attributes: &[Attribute]) -> Vec<String> {
    return attributes
        .iter()
        .filter(|attribute| attribute.path().is_ident("doc"))
        .filter_map(|attribute| {
            let syn::Meta::NameValue(meta) = &attribute.meta else {
                return None;
            };
            let Expr::Lit(value) = &meta.value else {
                return None;
            };
            let Lit::Str(value) = &value.lit else {
                return None;
            };
            Some(rewrite_documentation(value.value().trim_start()))
        })
        .collect();
}

pub(super) fn emit_binary_operator(operator: &BinOp) -> Result<&'static str, CompileError> {
    return match operator {
        BinOp::Add(_) => Ok("+"),
        BinOp::AddAssign(_) => Ok("+="),
        BinOp::And(_) => Ok("&&"),
        BinOp::BitAnd(_) => Ok("&"),
        BinOp::BitAndAssign(_) => Ok("&="),
        BinOp::BitOr(_) => Ok("|"),
        BinOp::BitOrAssign(_) => Ok("|="),
        BinOp::BitXor(_) => Ok("^"),
        BinOp::BitXorAssign(_) => Ok("^="),
        BinOp::Div(_) => Ok("/"),
        BinOp::DivAssign(_) => Ok("/="),
        BinOp::Eq(_) => Ok("==="),
        BinOp::Ge(_) => Ok(">="),
        BinOp::Gt(_) => Ok(">"),
        BinOp::Le(_) => Ok("<="),
        BinOp::Lt(_) => Ok("<"),
        BinOp::Mul(_) => Ok("*"),
        BinOp::MulAssign(_) => Ok("*="),
        BinOp::Ne(_) => Ok("!=="),
        BinOp::Or(_) => Ok("||"),
        BinOp::Rem(_) => Ok("%"),
        BinOp::RemAssign(_) => Ok("%="),
        BinOp::Shl(_) => Ok("<<"),
        BinOp::ShlAssign(_) => Ok("<<="),
        BinOp::Shr(_) => Ok(">>"),
        BinOp::ShrAssign(_) => Ok(">>="),
        BinOp::Sub(_) => Ok("-"),
        BinOp::SubAssign(_) => Ok("-="),
        _ => Err(compile_error("unsupported Rust binary operator")),
    };
}

pub(super) fn binary_precedence(operator: &BinOp) -> u8 {
    return match operator {
        BinOp::Add(_) | BinOp::Sub(_) => 11,
        BinOp::And(_) => 4,
        BinOp::BitAnd(_) => 7,
        BinOp::BitOr(_) => 5,
        BinOp::BitXor(_) => 6,
        BinOp::Div(_) | BinOp::Mul(_) | BinOp::Rem(_) => 12,
        BinOp::Eq(_) | BinOp::Ne(_) => 8,
        BinOp::Ge(_) | BinOp::Gt(_) | BinOp::Le(_) | BinOp::Lt(_) => 9,
        BinOp::Or(_) => 3,
        BinOp::Shl(_) | BinOp::Shr(_) => 10,
        BinOp::AddAssign(_)
        | BinOp::BitAndAssign(_)
        | BinOp::BitOrAssign(_)
        | BinOp::BitXorAssign(_)
        | BinOp::DivAssign(_)
        | BinOp::MulAssign(_)
        | BinOp::RemAssign(_)
        | BinOp::ShlAssign(_)
        | BinOp::ShrAssign(_)
        | BinOp::SubAssign(_) => 1,
        _ => 0,
    };
}

pub(super) fn binary_is_assignment(operator: &BinOp) -> bool {
    return matches!(
        operator,
        BinOp::AddAssign(_)
            | BinOp::BitAndAssign(_)
            | BinOp::BitOrAssign(_)
            | BinOp::BitXorAssign(_)
            | BinOp::DivAssign(_)
            | BinOp::MulAssign(_)
            | BinOp::RemAssign(_)
            | BinOp::ShlAssign(_)
            | BinOp::ShrAssign(_)
            | BinOp::SubAssign(_)
    );
}

pub(super) fn literal_shift_amount(expression: &Expr) -> Option<u64> {
    return match expression {
        Expr::Lit(lit) => {
            if let Lit::Int(int) = &lit.lit {
                int.base10_parse::<u64>().ok()
            } else {
                None
            }
        }
        Expr::Paren(paren) => literal_shift_amount(&paren.expr),
        Expr::Group(group) => literal_shift_amount(&group.expr),
        _ => None,
    };
}

pub(super) fn expression_precedence(expression: &Expr) -> u8 {
    return match expression {
        Expr::Assign(_) => 1,
        Expr::Binary(binary) => binary_precedence(&binary.op),
        Expr::Cast(cast) if type_is_named(&cast.ty, "i32") || type_is_named(&cast.ty, "isize") => 5,
        Expr::Cast(cast) if type_is_named(&cast.ty, "u8") || type_is_named(&cast.ty, "u16") => 7,
        Expr::Cast(cast)
            if type_is_named(&cast.ty, "u32")
                || type_is_named(&cast.ty, "usize")
                || type_is_named(&cast.ty, "i8")
                || type_is_named(&cast.ty, "i16") =>
        {
            10
        }
        Expr::Cast(cast) => expression_precedence(&cast.expr),
        Expr::Group(group) => expression_precedence(&group.expr),
        Expr::Paren(paren) => expression_precedence(&paren.expr),
        Expr::If(_) => 2,
        Expr::Reference(reference) => expression_precedence(&reference.expr),
        Expr::Unary(_) => 13,
        _ => PRIMARY_PRECEDENCE,
    };
}

pub(super) fn emit_binary_operand(
    expression: &Expr,
    entities: &HashSet<String>,
    parent_precedence: u8,
    right: bool,
) -> Result<String, CompileError> {
    let value = emit_expression(expression, entities)?;
    let precedence = if let Expr::Cast(cast) = expression {
        if is_integer_cast_elided(&cast.expr, &cast.ty, entities)
            || integer_literal_fits_cast(&cast.expr, &cast.ty)
        {
            expression_precedence(&cast.expr)
        } else {
            expression_precedence(expression)
        }
    } else {
        expression_precedence(expression)
    };
    if precedence < parent_precedence
        || (right && precedence == parent_precedence)
        || !is_lowered_primary(expression, &value)
    {
        return Ok(format!("({value})"));
    }
    return Ok(value);
}

pub(super) fn emit_constant(
    out: &mut String,
    constant: &syn::ItemConst,
    entities: &HashSet<String>,
    frozen_name: Option<&str>,
) -> Result<(), CompileError> {
    emit_documentation(out, &constant.attrs, 0);
    let export = if is_public(&constant.vis) {
        "export "
    } else {
        ""
    };
    let value = emit_expression_for_type(&constant.expr, &constant.ty, entities)?;
    let rust_name = constant.ident.to_string();
    if let Some(name) = frozen_name {
        writeln!(
            out,
            "{export}const {name}: Readonly<{}> = Object.freeze({value});",
            emit_type(&constant.ty, entities)?,
        )
        .expect("writing to a String cannot fail");
        return Ok(());
    }
    let name = export_name(entities, &rust_name).unwrap_or(&rust_name);
    if matches!(constant.expr.as_ref(), Expr::Lit(value) if matches!(&value.lit, Lit::Str(_)))
        && matches!(constant.ty.as_ref(), Type::Reference(reference) if type_is_named(&reference.elem, "str"))
    {
        writeln!(out, "{export}const {name} = {value} as const;")
            .expect("writing to a String cannot fail");
        return Ok(());
    }
    writeln!(
        out,
        "{export}const {name}: {} = {};",
        emit_type(&constant.ty, entities)?,
        value
    )
    .expect("writing to a String cannot fail");
    return Ok(());
}

pub(super) fn emit_documentation(out: &mut String, attributes: &[Attribute], indent: usize) {
    let lines = documentation(attributes);
    if lines.is_empty() {
        return;
    }
    write_indent(out, indent);
    out.push_str("/**\n");
    for line in lines {
        write_indent(out, indent);
        if line.is_empty() {
            out.push_str(" *\n");
        } else {
            writeln!(out, " * {}", line.replace("*/", "*\\/"))
                .expect("writing to a String cannot fail");
        }
    }
    write_indent(out, indent);
    out.push_str(" */\n");
}

// Declares the package-internal store of each entity runtime state field `program` designates, at the
// end of the declaring module. The store is exported only as a list export, never as a declaration
// export, so a wildcard contract over the module never makes it public; sibling modules import it.
pub(super) fn emit_entity_runtime_state_stores(
    out: &mut String,
    program: &Program,
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    for (owner, field_name) in &program.entity_runtime_states {
        let field = program
            .structs
            .iter()
            .find(|structure| structure.ident == owner.as_str())
            .and_then(|structure| {
                structure.fields.iter().find(|field| {
                    field
                        .ident
                        .as_ref()
                        .is_some_and(|ident| ident == field_name)
                })
            })
            .ok_or_else(|| {
                compile_error(format!(
                    "entity runtime state `{owner}.{field_name}` was not validated"
                ))
            })?;
        let store = entity_runtime_state_store(owner, field_name);
        let structure = program
            .structs
            .iter()
            .find(|structure| structure.ident == owner.as_str())
            .expect("entity runtime state owner was validated");
        let key = if structure.generics.params.is_empty() {
            format!("Readonly<{owner}Raw>")
        } else {
            // One store serves every monomorphization. Entity identity is the only key fact the
            // runtime needs, and spelling a particular generic substitution would be unsound.
            "object".to_string()
        };
        writeln!(
            out,
            "\n// Crate-private `{owner}.{field_name}`, keyed by entity identity and reachable only from this package's modules.\nconst {store} = /* @__PURE__ */ new WeakMap<{key}, {}>();\n\nexport {{ {store} }};",
            emit_type(&field.ty, entities)?
        )
        .expect("writing to a String cannot fail");
    }
    return Ok(());
}
