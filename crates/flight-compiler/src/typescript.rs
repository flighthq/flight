use std::collections::HashSet;
use std::fmt::Write;

use syn::{
    BinOp, Expr, FnArg, GenericArgument, ItemFn, ItemStruct, Lit, Pat, PathArguments, ReturnType,
    Stmt, Type, UnOp, Visibility,
};

use crate::model::Program;
use crate::{CompileError, compile_error};

fn emit_binary_operator(operator: &BinOp) -> Result<&'static str, CompileError> {
    return match operator {
        BinOp::Add(_) => Ok("+"),
        BinOp::AddAssign(_) => Ok("+="),
        BinOp::And(_) => Ok("&&"),
        BinOp::BitAnd(_) => Ok("&"),
        BinOp::BitOr(_) => Ok("|"),
        BinOp::BitXor(_) => Ok("^"),
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

fn emit_block(
    out: &mut String,
    statements: &[Stmt],
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    for statement in statements {
        emit_statement(out, statement, entities, indent)?;
    }
    return Ok(());
}

pub(crate) fn emit_expression(
    expression: &Expr,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return match expression {
        Expr::Array(array) => {
            let elements = array
                .elems
                .iter()
                .map(|element| emit_expression(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Expr::Assign(assign) => Ok(format!(
            "{} = {}",
            emit_expression(&assign.left, entities)?,
            emit_expression(&assign.right, entities)?
        )),
        Expr::Binary(binary) => Ok(format!(
            "{} {} {}",
            emit_expression(&binary.left, entities)?,
            emit_binary_operator(&binary.op)?,
            emit_expression(&binary.right, entities)?
        )),
        Expr::Call(call) => {
            if expression_is_path(&call.func, "Some") && call.args.len() == 1 {
                return emit_expression(&call.args[0], entities);
            }
            let function = emit_expression(&call.func, entities)?;
            let arguments = call
                .args
                .iter()
                .map(|argument| emit_expression(argument, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("{function}({})", arguments.join(", ")))
        }
        Expr::Cast(cast) => emit_expression(&cast.expr, entities),
        Expr::Field(field) => Ok(format!(
            "{}.{}",
            emit_expression(&field.base, entities)?,
            emit_member(&field.member)
        )),
        Expr::Group(group) => emit_expression(&group.expr, entities),
        Expr::Index(index) => Ok(format!(
            "{}[{}]",
            emit_expression(&index.expr, entities)?,
            emit_expression(&index.index, entities)?
        )),
        Expr::Lit(literal) => emit_literal(&literal.lit),
        Expr::MethodCall(call) => emit_method_call(call, entities),
        Expr::Paren(paren) => Ok(format!("({})", emit_expression(&paren.expr, entities)?)),
        Expr::Path(path) => {
            if path.path.is_ident("None") {
                return Ok("null".to_string());
            }
            if path_is_float_constant(&path.path, "NAN") {
                return Ok("Number.NaN".to_string());
            }
            let rendered = path
                .path
                .segments
                .iter()
                .map(|segment| emit_path_segment(&segment.ident.to_string()))
                .collect::<Vec<_>>()
                .join(".");
            Ok(rendered)
        }
        Expr::Reference(reference) => emit_expression(&reference.expr, entities),
        Expr::Repeat(repeat) => {
            let value = emit_expression(&repeat.expr, entities)?;
            let length = emit_expression(&repeat.len, entities)?;
            if expression_is_f32(&repeat.expr) {
                Ok(format!("new Float32Array({length}).fill({value})"))
            } else {
                Ok(format!("new Array({length}).fill({value})"))
            }
        }
        Expr::Struct(structure) => {
            let fields = structure
                .fields
                .iter()
                .map(|field| {
                    Ok(format!(
                        "{}: {}",
                        emit_member(&field.member),
                        emit_expression(&field.expr, entities)?
                    ))
                })
                .collect::<Result<Vec<_>, CompileError>>()?;
            if structure.rest.is_some() {
                return Err(compile_error(
                    "unsupported struct update expression; refusing a lossy object literal",
                ));
            }
            Ok(format!("{{ {} }}", fields.join(", ")))
        }
        Expr::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| emit_expression(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Expr::Unary(unary) => Ok(format!(
            "{}{}",
            emit_unary_operator(&unary.op)?,
            emit_expression(&unary.expr, entities)?
        )),
        _ => Err(compile_error(format!(
            "unsupported Rust expression `{}`",
            expression_kind(expression)
        ))),
    };
}

fn emit_expression_for_type(
    expression: &Expr,
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    if let Expr::Reference(reference) = expression {
        return emit_expression_for_type(&reference.expr, rust_type, entities);
    }
    return match rust_type {
        Type::Array(array_type) => match expression {
            Expr::Array(array) => {
                let elements = array
                    .elems
                    .iter()
                    .map(|element| emit_expression_for_type(element, &array_type.elem, entities))
                    .collect::<Result<Vec<_>, _>>()?;
                if type_is_named(&array_type.elem, "f32") {
                    Ok(format!("new Float32Array([{}])", elements.join(", ")))
                } else {
                    Ok(format!("[{}]", elements.join(", ")))
                }
            }
            Expr::Repeat(repeat) => {
                let value = emit_expression_for_type(&repeat.expr, &array_type.elem, entities)?;
                let length = emit_expression(&repeat.len, entities)?;
                if type_is_named(&array_type.elem, "f32") {
                    Ok(format!("new Float32Array({length}).fill({value})"))
                } else {
                    Ok(format!("new Array({length}).fill({value})"))
                }
            }
            _ => emit_expression(expression, entities),
        },
        Type::Paren(paren) => emit_expression_for_type(expression, &paren.elem, entities),
        Type::Reference(reference) => {
            emit_expression_for_type(expression, &reference.elem, entities)
        }
        Type::Slice(slice) => match expression {
            Expr::Array(array) => {
                let elements = array
                    .elems
                    .iter()
                    .map(|element| emit_expression_for_type(element, &slice.elem, entities))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(format!("[{}]", elements.join(", ")))
            }
            _ => emit_expression(expression, entities),
        },
        Type::Tuple(tuple_type) => match expression {
            Expr::Tuple(tuple) if tuple.elems.len() == tuple_type.elems.len() => {
                let elements = tuple
                    .elems
                    .iter()
                    .zip(&tuple_type.elems)
                    .map(|(element, element_type)| {
                        emit_expression_for_type(element, element_type, entities)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(format!("[{}]", elements.join(", ")))
            }
            Expr::Tuple(_) => Err(compile_error(
                "tuple initializer length does not match its Rust type",
            )),
            _ => emit_expression(expression, entities),
        },
        _ => emit_expression(expression, entities),
    };
}

fn emit_function(
    out: &mut String,
    function: &ItemFn,
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    let export = if is_public(&function.vis) {
        "export "
    } else {
        ""
    };
    let name = snake_to_lower_camel(&function.sig.ident.to_string());
    let parameters = function
        .sig
        .inputs
        .iter()
        .map(|argument| emit_parameter(argument, entities))
        .collect::<Result<Vec<_>, _>>()?;
    let return_type = match &function.sig.output {
        ReturnType::Default => "void".to_string(),
        ReturnType::Type(_, rust_type) => emit_type(rust_type, entities)?,
    };
    writeln!(
        out,
        "{export}function {name}({}): {return_type} {{",
        parameters.join(", ")
    )
    .expect("writing to a String cannot fail");
    emit_block(out, &function.block.stmts, entities, 1)?;
    out.push_str("}\n");
    return Ok(());
}

fn emit_literal(literal: &Lit) -> Result<String, CompileError> {
    return match literal {
        Lit::Bool(value) => Ok(value.value.to_string()),
        Lit::Byte(value) => Ok(value.value().to_string()),
        Lit::ByteStr(value) => Ok(format!("new Uint8Array({:?})", value.value())),
        Lit::Char(value) => Ok(format!("{:?}", value.value().to_string())),
        Lit::Float(value) => Ok(value.base10_digits().to_string()),
        Lit::Int(value) => Ok(value.base10_digits().to_string()),
        Lit::Str(value) => Ok(format!("{:?}", value.value())),
        _ => Err(compile_error("unsupported Rust literal")),
    };
}

pub(crate) fn emit_local(
    out: &mut String,
    local: &syn::Local,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let (name, rust_type) = match &local.pat {
        Pat::Ident(pattern) => (pattern.ident.to_string(), None),
        Pat::Type(pattern) => {
            let Pat::Ident(identifier) = pattern.pat.as_ref() else {
                return Err(compile_error(
                    "unsupported typed destructuring in local binding",
                ));
            };
            (identifier.ident.to_string(), Some(pattern.ty.as_ref()))
        }
        _ => {
            return Err(compile_error("unsupported destructuring in local binding"));
        }
    };
    let Some(initializer) = &local.init else {
        return Err(compile_error(format!("local `{name}` has no initializer")));
    };
    if initializer.diverge.is_some() {
        return Err(compile_error("unsupported let-else local binding"));
    }
    let typescript_type = rust_type
        .map(|rust_type| emit_type(rust_type, entities))
        .transpose()?;
    let mut value = if expression_is_path_call(&initializer.expr, "allocate_entity") {
        let Some(typescript_type) = &typescript_type else {
            return Err(compile_error(
                "allocate_entity local needs an explicit Rust type",
            ));
        };
        format!("allocateEntity<{typescript_type}>()")
    } else if let Some(rust_type) = rust_type {
        emit_expression_for_type(&initializer.expr, rust_type, entities)?
    } else {
        emit_expression(&initializer.expr, entities)?
    };
    if typescript_type.as_deref() == Some("Float32Array") && !value.starts_with("new Float32Array(")
    {
        value = format!("new Float32Array({value})");
    }
    write_indent(out, indent);
    write!(out, "let {}", snake_to_lower_camel(&name)).expect("writing to a String cannot fail");
    if let Some(typescript_type) = typescript_type {
        write!(out, ": {typescript_type}").expect("writing to a String cannot fail");
    }
    writeln!(out, " = {value};").expect("writing to a String cannot fail");
    return Ok(());
}

fn emit_member(member: &syn::Member) -> String {
    return match member {
        syn::Member::Named(identifier) => snake_to_lower_camel(&identifier.to_string()),
        syn::Member::Unnamed(index) => index.index.to_string(),
    };
}

fn emit_method_call(
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let receiver = emit_expression(&call.receiver, entities)?;
    let arguments = call
        .args
        .iter()
        .map(|argument| emit_expression(argument, entities))
        .collect::<Result<Vec<_>, _>>()?;
    let method = call.method.to_string();
    return match method.as_str() {
        "abs" if arguments.is_empty() => Ok(format!("Math.abs({receiver})")),
        "acos" if arguments.is_empty() => Ok(format!("Math.acos({receiver})")),
        "asin" if arguments.is_empty() => Ok(format!("Math.asin({receiver})")),
        "atan" if arguments.is_empty() => Ok(format!("Math.atan({receiver})")),
        "atan2" if arguments.len() == 1 => Ok(format!("Math.atan2({receiver}, {})", arguments[0])),
        "ceil" if arguments.is_empty() => Ok(format!("Math.ceil({receiver})")),
        "clamp" if arguments.len() == 2 => Ok(format!(
            "Math.min({}, Math.max({}, {receiver}))",
            arguments[1], arguments[0]
        )),
        "cos" if arguments.is_empty() => Ok(format!("Math.cos({receiver})")),
        "floor" if arguments.is_empty() => Ok(format!("Math.floor({receiver})")),
        "is_nan" if arguments.is_empty() => Ok(format!("Number.isNaN({receiver})")),
        "max" if arguments.len() == 1 => Ok(format!("Math.max({receiver}, {})", arguments[0])),
        "min" if arguments.len() == 1 => Ok(format!("Math.min({receiver}, {})", arguments[0])),
        "powf" if arguments.len() == 1 => Ok(format!("Math.pow({receiver}, {})", arguments[0])),
        "round" if arguments.is_empty() => Ok(format!("Math.round({receiver})")),
        "sin" if arguments.is_empty() => Ok(format!("Math.sin({receiver})")),
        "sqrt" if arguments.is_empty() => Ok(format!("Math.sqrt({receiver})")),
        "tan" if arguments.is_empty() => Ok(format!("Math.tan({receiver})")),
        _ => Err(compile_error(format!(
            "unsupported Rust method call `.{method}()`; impl sugar is not a transpilation source"
        ))),
    };
}

pub(crate) fn emit_parameter(
    argument: &FnArg,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let FnArg::Typed(argument) = argument else {
        return Err(compile_error(
            "free-function contract cannot contain a self receiver",
        ));
    };
    let Pat::Ident(pattern) = argument.pat.as_ref() else {
        return Err(compile_error(
            "unsupported destructuring in function parameter",
        ));
    };
    return Ok(format!(
        "{}: {}",
        snake_to_lower_camel(&pattern.ident.to_string()),
        emit_type(&argument.ty, entities)?
    ));
}

fn emit_path_segment(segment: &str) -> String {
    if segment.chars().all(|character| {
        character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
    }) {
        return segment.to_string();
    }
    return snake_to_lower_camel(segment);
}

pub(crate) fn emit_program(program: &Program) -> Result<String, CompileError> {
    let uses_allocate_entity = program
        .functions
        .iter()
        .any(|function| expression_contains_path(&function.block, "allocate_entity"));
    let mut out = String::new();

    if uses_allocate_entity {
        out.push_str("import { allocateEntity } from '@flighthq/entity/contract';\n");
    }
    if !program.entities.is_empty() {
        out.push_str("import type { EntityRaw } from '@flighthq/entity/contract';\n");
    }
    if uses_allocate_entity || !program.entities.is_empty() {
        out.push('\n');
    }

    for structure in &program.structs {
        emit_struct(&mut out, structure, &program.entities)?;
        out.push('\n');
    }
    for (index, function) in program.functions.iter().enumerate() {
        emit_function(&mut out, function, &program.entities)?;
        if index + 1 < program.functions.len() {
            out.push('\n');
        }
    }
    return Ok(out);
}

fn emit_single_generic_type(
    segment: &syn::PathSegment,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return Err(compile_error(format!(
            "`{}` needs one type argument",
            segment.ident
        )));
    };
    let types = arguments
        .args
        .iter()
        .filter_map(|argument| match argument {
            GenericArgument::Type(rust_type) => Some(rust_type),
            _ => None,
        })
        .collect::<Vec<_>>();
    if types.len() != 1 {
        return Err(compile_error(format!(
            "`{}` needs exactly one type argument",
            segment.ident
        )));
    }
    return emit_type(types[0], entities);
}

fn emit_statement(
    out: &mut String,
    statement: &Stmt,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    match statement {
        Stmt::Local(local) => emit_local(out, local, entities, indent)?,
        Stmt::Expr(Expr::If(if_expression), _) => {
            write_indent(out, indent);
            writeln!(
                out,
                "if ({}) {{",
                emit_expression(&if_expression.cond, entities)?
            )
            .expect("writing to a String cannot fail");
            emit_block(out, &if_expression.then_branch.stmts, entities, indent + 1)?;
            write_indent(out, indent);
            if let Some((_, otherwise)) = &if_expression.else_branch {
                out.push_str("} else {");
                out.push('\n');
                match otherwise.as_ref() {
                    Expr::Block(block) => {
                        emit_block(out, &block.block.stmts, entities, indent + 1)?;
                    }
                    Expr::If(nested) => {
                        emit_statement(
                            out,
                            &Stmt::Expr(Expr::If(nested.clone()), None),
                            entities,
                            indent + 1,
                        )?;
                    }
                    _ => {
                        return Err(compile_error("unsupported non-block else expression"));
                    }
                }
                write_indent(out, indent);
                out.push_str("}\n");
            } else {
                out.push_str("}\n");
            }
        }
        Stmt::Expr(Expr::Return(return_expression), _) => {
            write_indent(out, indent);
            if let Some(value) = &return_expression.expr {
                writeln!(out, "return {};", emit_expression(value, entities)?)
                    .expect("writing to a String cannot fail");
            } else {
                out.push_str("return;\n");
            }
        }
        Stmt::Expr(expression, _) => {
            write_indent(out, indent);
            writeln!(out, "{};", emit_expression(expression, entities)?)
                .expect("writing to a String cannot fail");
        }
        Stmt::Item(_) => {
            return Err(compile_error(
                "unsupported item declaration inside function body",
            ));
        }
        Stmt::Macro(_) => {
            return Err(compile_error(
                "unsupported macro statement inside function body",
            ));
        }
    }
    return Ok(());
}

fn emit_struct(
    out: &mut String,
    structure: &ItemStruct,
    entities: &HashSet<String>,
) -> Result<(), CompileError> {
    let rust_name = structure.ident.to_string();
    let entity = entities.contains(&rust_name);
    let name = if entity {
        format!("{rust_name}Raw")
    } else {
        rust_name
    };
    let export = if is_public(&structure.vis) {
        "export "
    } else {
        ""
    };
    let extension = if entity { " extends EntityRaw" } else { "" };
    writeln!(out, "{export}interface {name}{extension} {{")
        .expect("writing to a String cannot fail");
    for field in &structure.fields {
        if !is_public(&field.vis) {
            continue;
        }
        let Some(field_name) = &field.ident else {
            return Err(compile_error(format!(
                "unnamed field on `{}` cannot be transpiled",
                structure.ident
            )));
        };
        writeln!(
            out,
            "  {}: {};",
            snake_to_lower_camel(&field_name.to_string()),
            emit_type(&field.ty, entities)?
        )
        .expect("writing to a String cannot fail");
    }
    out.push_str("}\n");
    return Ok(());
}

pub(crate) fn emit_type(
    rust_type: &Type,
    entities: &HashSet<String>,
) -> Result<String, CompileError> {
    return match rust_type {
        Type::Array(array) if type_is_named(&array.elem, "f32") => Ok("Float32Array".to_string()),
        Type::Array(array) => Ok(format!("readonly {}[]", emit_type(&array.elem, entities)?)),
        Type::Paren(paren) => emit_type(&paren.elem, entities),
        Type::Path(path) => {
            let Some(segment) = path.path.segments.last() else {
                return Err(compile_error("empty Rust type path"));
            };
            let name = segment.ident.to_string();
            match name.as_str() {
                "bool" => Ok("boolean".to_string()),
                "f32" | "f64" | "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32"
                | "u64" | "usize" => Ok("number".to_string()),
                "String" | "str" => Ok("string".to_string()),
                "Option" => Ok(format!(
                    "{} | null",
                    emit_single_generic_type(segment, entities)?
                )),
                "Vec" => Ok(format!(
                    "{}[]",
                    emit_single_generic_type(segment, entities)?
                )),
                "Ref" => emit_single_generic_type(segment, entities),
                _ if entities.contains(&name) => Ok(format!("{name}Raw")),
                _ => {
                    if matches!(segment.arguments, PathArguments::None) {
                        Ok(name)
                    } else {
                        let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
                            return Err(compile_error(format!(
                                "unsupported parenthesized type arguments on `{name}`"
                            )));
                        };
                        let rendered = arguments
                            .args
                            .iter()
                            .filter_map(|argument| match argument {
                                GenericArgument::Type(rust_type) => {
                                    Some(emit_type(rust_type, entities))
                                }
                                _ => None,
                            })
                            .collect::<Result<Vec<_>, _>>()?;
                        Ok(format!("{name}<{}>", rendered.join(", ")))
                    }
                }
            }
        }
        Type::Reference(reference) => {
            let inner = emit_type(&reference.elem, entities)?;
            if reference.mutability.is_some() || is_primitive_typescript_type(&inner) {
                Ok(inner)
            } else {
                Ok(format!("Readonly<{inner}>"))
            }
        }
        Type::Slice(slice) => {
            let element = emit_type(&slice.elem, entities)?;
            match element.as_str() {
                "number" => Ok("Float32Array".to_string()),
                _ => Ok(format!("{element}[]")),
            }
        }
        Type::Tuple(tuple) if tuple.elems.is_empty() => Ok("void".to_string()),
        Type::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| emit_type(element, entities))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("readonly [{}]", elements.join(", ")))
        }
        _ => Err(compile_error(format!(
            "unsupported Rust type `{}`",
            type_kind(rust_type)
        ))),
    };
}

fn emit_unary_operator(operator: &UnOp) -> Result<&'static str, CompileError> {
    return match operator {
        UnOp::Deref(_) => Ok(""),
        UnOp::Neg(_) => Ok("-"),
        UnOp::Not(_) => Ok("!"),
        _ => Err(compile_error("unsupported Rust unary operator")),
    };
}

fn expression_contains_path(block: &syn::Block, expected: &str) -> bool {
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

fn expression_is_f32(expression: &Expr) -> bool {
    let Expr::Lit(literal) = expression else {
        return false;
    };
    return match &literal.lit {
        Lit::Float(value) => value.suffix() == "f32",
        Lit::Int(value) => value.suffix() == "f32",
        _ => false,
    };
}

fn expression_is_path(expression: &Expr, expected: &str) -> bool {
    let Expr::Path(path) = expression else {
        return false;
    };
    return path.path.is_ident(expected);
}

fn expression_is_path_call(expression: &Expr, expected: &str) -> bool {
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

fn expression_kind(expression: &Expr) -> &'static str {
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

fn is_primitive_typescript_type(typescript_type: &str) -> bool {
    return matches!(typescript_type, "boolean" | "number" | "string" | "void");
}

fn is_public(visibility: &Visibility) -> bool {
    return matches!(visibility, Visibility::Public(_));
}

fn path_is_float_constant(path: &syn::Path, constant: &str) -> bool {
    if path.segments.len() != 2 {
        return false;
    }
    let mut segments = path.segments.iter();
    let Some(rust_type) = segments.next() else {
        return false;
    };
    let Some(name) = segments.next() else {
        return false;
    };
    return matches!(rust_type.ident.to_string().as_str(), "f32" | "f64") && name.ident == constant;
}

pub(crate) fn snake_to_lower_camel(name: &str) -> String {
    let mut words = name.split('_');
    let mut out = words.next().unwrap_or_default().to_string();
    for word in words {
        let mut characters = word.chars();
        if let Some(first) = characters.next() {
            out.extend(first.to_uppercase());
            out.extend(characters);
        }
    }
    return out;
}

fn type_is_named(rust_type: &Type, expected: &str) -> bool {
    let Type::Path(path) = rust_type else {
        return false;
    };
    return path.path.is_ident(expected);
}

fn type_kind(rust_type: &Type) -> &'static str {
    return match rust_type {
        Type::BareFn(_) => "bare function",
        Type::ImplTrait(_) => "impl trait",
        Type::Infer(_) => "inferred type",
        Type::Macro(_) => "type macro",
        Type::Never(_) => "never type",
        Type::Ptr(_) => "raw pointer",
        Type::TraitObject(_) => "trait object",
        Type::Verbatim(_) => "verbatim type tokens",
        _ => "unknown type",
    };
}

pub(crate) fn write_indent(out: &mut String, indent: usize) {
    for _ in 0..indent {
        out.push_str("  ");
    }
}
