use std::collections::HashSet;
use std::fmt::Write;

use syn::Expr;

use crate::{CompileError, compile_error};

use super::{
    binary_is_assignment, emit_binary_operator, emit_expression, expression_hash_collection,
    expression_is_iterator_chain, expression_is_reusable, expression_is_sequence, fresh_identifier,
    indent_continuation_lines, inline_emitted_closure, is_typeof_entity_name,
    peel_reference_and_paren, write_indent,
};

// `Vec::extend` and `Vec::extend_from_slice` as statements: an index loop over the argument's initial length, so no argument
// count ceiling applies and a TypeScript caller passing the receiver as the argument still terminates
// (Rust ownership forbids that aliasing, the emitted signature does not). A non-reusable receiver and
// argument are each evaluated once, in that Rust order, into block-scoped temporaries. Every binding
// avoids the identifiers the operands use.
pub(super) fn entry_or_default_parts<'a>(
    call: &'a syn::ExprMethodCall,
    entities: &HashSet<String>,
) -> Option<(&'a Expr, &'a Expr)> {
    if call.method != "or_default" || !call.args.is_empty() {
        return None;
    }
    let Expr::MethodCall(entry) = call.receiver.as_ref() else {
        return None;
    };
    if entry.method != "entry" || entry.args.len() != 1 {
        return None;
    }
    if expression_hash_collection(&entry.receiver, entities).is_none() {
        return None;
    }
    return Some((&entry.receiver, &entry.args[0]));
}

pub(super) fn emit_entry_or_default_assign(
    out: &mut String,
    binary: &syn::ExprBinary,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<bool, CompileError> {
    if !binary_is_assignment(&binary.op) {
        return Ok(false);
    }
    let Expr::Unary(unary) = binary.left.as_ref() else {
        return Ok(false);
    };
    if !matches!(unary.op, syn::UnOp::Deref(_)) {
        return Ok(false);
    }
    let Expr::MethodCall(call) = unary.expr.as_ref() else {
        return Ok(false);
    };
    let Some((map_expr, key_expr)) = entry_or_default_parts(call, entities) else {
        return Ok(false);
    };
    let map = emit_expression(map_expr, entities)?;
    let key = emit_expression(key_expr, entities)?;
    let rhs = emit_expression(&binary.right, entities)?;
    let op = emit_binary_operator(&binary.op)?;
    write_indent(out, indent);
    writeln!(out, "{map}.set({key}, ({map}.get({key}) ?? 0) {op} {rhs});",)
        .expect("writing to a String cannot fail");
    return Ok(true);
}

pub(super) fn emit_entry_or_default_method(
    out: &mut String,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<bool, CompileError> {
    let Expr::MethodCall(or_default) = call.receiver.as_ref() else {
        return Ok(false);
    };
    let Some((map_expr, key_expr)) = entry_or_default_parts(or_default, entities) else {
        return Ok(false);
    };
    let map = emit_expression(map_expr, entities)?;
    let key = emit_expression(key_expr, entities)?;
    let method = call.method.to_string();
    let arguments = call
        .args
        .iter()
        .map(|argument| emit_expression(argument, entities))
        .collect::<Result<Vec<_>, _>>()?;
    write_indent(out, indent);
    writeln!(
        out,
        "if (!{map}.has({key})) {{ {map}.set({key}, []); }} {map}.get({key})!.{method}({});",
        arguments.join(", ")
    )
    .expect("writing to a String cannot fail");
    return Ok(true);
}

pub(crate) fn emit_vec_extend_statement(
    out: &mut String,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let method = call.method.to_string();
    if call.args.len() != 1 {
        return Err(compile_error(format!(
            "portable `.{method}()` takes exactly one argument"
        )));
    }
    if method == "extend" {
        if !expression_is_sequence(&call.receiver, entities) {
            return Err(compile_error(format!(
                "portable `.{method}()` requires a receiver declared as Rust `Vec`"
            )));
        }
        if !expression_is_sequence(&call.args[0], entities)
            && !expression_is_iterator_chain(&call.args[0])
        {
            return Err(compile_error(format!(
                "portable `.{method}()` requires an argument declared as Rust `Vec` or slice; iterator and Option arguments are not supported"
            )));
        }
    }
    let receiver = emit_expression(&call.receiver, entities)?;
    let argument = emit_expression(&call.args[0], entities)?;
    let mut used = format!("{receiver} {argument}")
        .split(|character: char| {
            !(character.is_alphanumeric() || character == '_' || character == '$')
        })
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let bind_target = !expression_is_reusable(&call.receiver);
    let bind_source = !expression_is_reusable(&call.args[0]);
    let target = if bind_target {
        fresh_identifier("target", &mut used)
    } else {
        receiver.clone()
    };
    let source = if bind_source {
        fresh_identifier("source", &mut used)
    } else {
        argument.clone()
    };
    let index = fresh_identifier("index", &mut used);
    let count = fresh_identifier("count", &mut used);
    let mut loop_indent = indent;
    if bind_target || bind_source {
        write_indent(out, indent);
        out.push_str("{\n");
        loop_indent += 1;
    }
    if bind_target {
        write_indent(out, loop_indent);
        writeln!(out, "const {target} = {receiver};").expect("writing to a String cannot fail");
    }
    if bind_source {
        write_indent(out, loop_indent);
        writeln!(out, "const {source} = {argument};").expect("writing to a String cannot fail");
    }
    write_indent(out, loop_indent);
    writeln!(
        out,
        "for (let {index} = 0, {count} = {source}.length; {index} < {count}; {index}++) {{"
    )
    .expect("writing to a String cannot fail");
    write_indent(out, loop_indent + 1);
    writeln!(out, "{target}.push({source}[{index}]);").expect("writing to a String cannot fail");
    write_indent(out, loop_indent);
    out.push_str("}\n");
    if bind_target || bind_source {
        write_indent(out, indent);
        out.push_str("}\n");
    }
    return Ok(());
}

pub(super) fn emit_copy_from_slice_statement(
    out: &mut String,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    if call.args.len() != 1 {
        return Err(compile_error(
            "portable `.copy_from_slice()` requires exactly one argument",
        ));
    }
    let source_expr = peel_reference_and_paren(&call.args[0]);
    let source = emit_expression(source_expr, entities)?;
    if let Expr::Index(index) = call.receiver.as_ref() {
        if let Expr::Range(range) = index.index.as_ref() {
            if matches!(range.limits, syn::RangeLimits::Closed(_)) {
                return Err(compile_error(
                    "portable `.copy_from_slice()` does not support inclusive range `..=`",
                ));
            }
            let dest = emit_expression(&index.expr, entities)?;
            let start = range
                .start
                .as_deref()
                .map(|start| emit_expression(start, entities))
                .transpose()?
                .unwrap_or_else(|| "0".to_string());
            write_indent(out, indent);
            if let Expr::Index(src_index) = source_expr {
                if let Expr::Range(src_range) = src_index.index.as_ref() {
                    let src_array = emit_expression(&src_index.expr, entities)?;
                    let src_start = src_range
                        .start
                        .as_deref()
                        .map(|s| emit_expression(s, entities))
                        .transpose()?
                        .unwrap_or_else(|| "0".to_string());
                    let src_end = src_range
                        .end
                        .as_deref()
                        .map(|e| emit_expression(e, entities))
                        .transpose()?;
                    let count = if let Some(end) = &src_end {
                        format!("{end} - {src_start}")
                    } else {
                        format!("{src_array}.length - {src_start}")
                    };
                    writeln!(
                        out,
                        "for (let __i = 0; __i < {count}; __i++) {{ {dest}[{start} + __i] = {src_array}[{src_start} + __i]; }}"
                    )
                    .expect("writing to a String cannot fail");
                    return Ok(());
                }
            }
            writeln!(
                out,
                "for (let __i = 0; __i < {source}.length; __i++) {{ {dest}[{start} + __i] = {source}[__i]; }}"
            )
            .expect("writing to a String cannot fail");
            return Ok(());
        }
    }
    let dest = emit_expression(&call.receiver, entities)?;
    write_indent(out, indent);
    writeln!(
        out,
        "for (let __i = 0; __i < {source}.length; __i++) {{ {dest}[__i] = {source}[__i]; }}"
    )
    .expect("writing to a String cannot fail");
    return Ok(());
}

pub(super) fn emit_retain_statement(
    out: &mut String,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let receiver = emit_expression(&call.receiver, entities)?;
    let predicate = emit_expression(&call.args[0], entities)?;
    let mut used = format!("{receiver} {predicate}")
        .split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$'))
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let bind_predicate = !expression_is_reusable(&call.args[0]);
    // A bound closure predicate loses the contextual parameter type the call site gave it, so it is
    // annotated with the element type read through `typeof`, which accepts only an entity name: a
    // receiver emitted as anything else is bound first.
    let bind_receiver = !expression_is_reusable(&call.receiver)
        || (bind_predicate && !is_typeof_entity_name(&receiver));
    let items = if bind_receiver {
        fresh_identifier("items", &mut used)
    } else {
        receiver.clone()
    };
    let keep = if bind_predicate {
        fresh_identifier("keep", &mut used)
    } else {
        predicate.clone()
    };
    let kept = fresh_identifier("kept", &mut used);
    let index = fresh_identifier("retainIndex", &mut used);
    let item = fresh_identifier("item", &mut used);
    let length = fresh_identifier("retainLength", &mut used);
    let rest = fresh_identifier("rest", &mut used);
    write_indent(out, indent);
    out.push_str("{\n");
    let bi = indent + 1;
    if bind_receiver {
        write_indent(out, bi);
        writeln!(out, "const {items} = {receiver};").expect("writing to a String cannot fail");
    }
    if bind_predicate {
        write_indent(out, bi);
        writeln!(
            out,
            "const {keep}: ({item}: (typeof {items})[number]) => boolean = {predicate};"
        )
        .expect("writing to a String cannot fail");
    }
    write_indent(out, bi);
    writeln!(out, "let {kept} = 0;").expect("writing to a String cannot fail");
    write_indent(out, bi);
    writeln!(out, "let {index} = 0;").expect("writing to a String cannot fail");
    write_indent(out, bi);
    out.push_str("try {\n");
    let ti = bi + 1;
    write_indent(out, ti);
    writeln!(out, "for (; {index} < {items}.length; {index}++) {{")
        .expect("writing to a String cannot fail");
    let fi = ti + 1;
    write_indent(out, fi);
    writeln!(out, "const {item} = {items}[{index}];").expect("writing to a String cannot fail");
    write_indent(out, fi);
    writeln!(out, "if ({keep}({item})) {{").expect("writing to a String cannot fail");
    write_indent(out, fi + 1);
    writeln!(out, "{items}[{kept}] = {item};").expect("writing to a String cannot fail");
    write_indent(out, fi + 1);
    writeln!(out, "{kept}++;").expect("writing to a String cannot fail");
    write_indent(out, fi);
    out.push_str("}\n");
    write_indent(out, ti);
    out.push_str("}\n");
    write_indent(out, bi);
    out.push_str("} finally {\n");
    write_indent(out, ti);
    writeln!(out, "const {length} = {items}.length;").expect("writing to a String cannot fail");
    write_indent(out, ti);
    writeln!(
        out,
        "for (let {rest} = {index}; {rest} < {length}; {rest}++) {{"
    )
    .expect("writing to a String cannot fail");
    write_indent(out, ti + 1);
    writeln!(out, "{items}[{kept} + {rest} - {index}] = {items}[{rest}];")
        .expect("writing to a String cannot fail");
    write_indent(out, ti);
    out.push_str("}\n");
    write_indent(out, ti);
    writeln!(out, "{items}.length = {kept} + {length} - {index};")
        .expect("writing to a String cannot fail");
    write_indent(out, bi);
    out.push_str("}\n");
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

pub(super) fn emit_dedup_statement(
    out: &mut String,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let receiver = emit_expression(&call.receiver, entities)?;
    let bind_receiver = !expression_is_reusable(&call.receiver);
    let mut used = receiver
        .split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$'))
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let items = if bind_receiver {
        fresh_identifier("items", &mut used)
    } else {
        receiver.clone()
    };
    let write = fresh_identifier("write", &mut used);
    let read = fresh_identifier("read", &mut used);
    write_indent(out, indent);
    out.push_str("{\n");
    let bi = indent + 1;
    if bind_receiver {
        write_indent(out, bi);
        writeln!(out, "const {items} = {receiver};").expect("writing to a String cannot fail");
    }
    write_indent(out, bi);
    writeln!(out, "let {write} = 1;").expect("writing to a String cannot fail");
    write_indent(out, bi);
    writeln!(
        out,
        "for (let {read} = 1; {read} < {items}.length; {read}++) {{"
    )
    .expect("writing to a String cannot fail");
    let fi = bi + 1;
    write_indent(out, fi);
    writeln!(out, "if ({items}[{read}] !== {items}[{read} - 1]) {{")
        .expect("writing to a String cannot fail");
    write_indent(out, fi + 1);
    writeln!(out, "{items}[{write}] = {items}[{read}];").expect("writing to a String cannot fail");
    write_indent(out, fi + 1);
    writeln!(out, "{write}++;").expect("writing to a String cannot fail");
    write_indent(out, fi);
    out.push_str("}\n");
    write_indent(out, bi);
    out.push_str("}\n");
    write_indent(out, bi);
    writeln!(out, "{items}.length = Math.min({write}, {items}.length);")
        .expect("writing to a String cannot fail");
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}

pub(super) fn emit_hashset_retain_statement(
    out: &mut String,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let receiver = emit_expression(&call.receiver, entities)?;
    let predicate = emit_expression(&call.args[0], entities)?;
    if let Some(inlined) = inline_emitted_closure(&predicate, "item") {
        write_indent(out, indent);
        writeln!(out, "for (const item of {receiver}) {{")
            .expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "if (!({inlined})) {{").expect("writing to a String cannot fail");
        write_indent(out, indent + 2);
        writeln!(out, "{receiver}.delete(item);").expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        out.push_str("}\n");
        write_indent(out, indent);
        out.push_str("}\n");
    } else {
        let value = indent_continuation_lines(
            &emit_expression(&Expr::MethodCall(call.clone()), entities)?,
            indent,
        );
        write_indent(out, indent);
        writeln!(out, "{value};").expect("writing to a String cannot fail");
    }
    return Ok(());
}

pub(super) fn emit_hashmap_retain_statement(
    out: &mut String,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let receiver = emit_expression(&call.receiver, entities)?;
    let predicate = emit_expression(&call.args[0], entities)?;
    let s = predicate.trim();
    let inlined = if let Some(rest) = s.strip_prefix('(') {
        if let Some((params, body)) = rest.split_once(") => ") {
            let params = params.trim();
            let body = body.trim();
            if !body.contains('{') && params.contains(',') {
                let parts: Vec<&str> = params.splitn(2, ',').map(str::trim).collect();
                if parts.len() == 2 && !parts[0].contains(':') && !parts[1].contains(':') {
                    let replaced = body.replace(parts[0], "key").replace(parts[1], "value");
                    Some(replaced)
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };
    if let Some(inlined) = inlined {
        write_indent(out, indent);
        writeln!(out, "for (const [key, value] of {receiver}) {{")
            .expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "if (!({inlined})) {{").expect("writing to a String cannot fail");
        write_indent(out, indent + 2);
        writeln!(out, "{receiver}.delete(key);").expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        out.push_str("}\n");
        write_indent(out, indent);
        out.push_str("}\n");
    } else {
        let value = indent_continuation_lines(
            &emit_expression(&Expr::MethodCall(call.clone()), entities)?,
            indent,
        );
        write_indent(out, indent);
        writeln!(out, "{value};").expect("writing to a String cannot fail");
    }
    return Ok(());
}

pub(super) fn emit_resize_statement(
    out: &mut String,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let receiver = emit_expression(&call.receiver, entities)?;
    let length = emit_expression(&call.args[0], entities)?;
    let value = emit_expression(&call.args[1], entities)?;
    let bind_receiver = !expression_is_reusable(&call.receiver);
    let bind_length = !expression_is_reusable(&call.args[0]);
    let mut used = receiver
        .split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$'))
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let items = if bind_receiver {
        fresh_identifier("items", &mut used)
    } else {
        receiver.clone()
    };
    let len = if bind_length {
        fresh_identifier("len", &mut used)
    } else {
        length.clone()
    };
    if bind_receiver || bind_length {
        write_indent(out, indent);
        out.push_str("{\n");
        let bi = indent + 1;
        if bind_receiver {
            write_indent(out, bi);
            writeln!(out, "const {items} = {receiver};").expect("writing to a String cannot fail");
        }
        if bind_length {
            write_indent(out, bi);
            writeln!(out, "const {len} = {length};").expect("writing to a String cannot fail");
        }
        write_indent(out, bi);
        writeln!(out, "while ({items}.length < {len}) {{")
            .expect("writing to a String cannot fail");
        write_indent(out, bi + 1);
        writeln!(out, "{items}.push({value});").expect("writing to a String cannot fail");
        write_indent(out, bi);
        out.push_str("}\n");
        write_indent(out, bi);
        writeln!(out, "{items}.length = {len};").expect("writing to a String cannot fail");
        write_indent(out, indent);
        out.push_str("}\n");
    } else {
        write_indent(out, indent);
        writeln!(out, "while ({items}.length < {len}) {{")
            .expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "{items}.push({value});").expect("writing to a String cannot fail");
        write_indent(out, indent);
        out.push_str("}\n");
        write_indent(out, indent);
        writeln!(out, "{items}.length = {len};").expect("writing to a String cannot fail");
    }
    return Ok(());
}

pub(super) fn emit_resize_with_statement(
    out: &mut String,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let receiver = emit_expression(&call.receiver, entities)?;
    let length = emit_expression(&call.args[0], entities)?;
    let bind_receiver = !expression_is_reusable(&call.receiver);
    let bind_length = !expression_is_reusable(&call.args[0]);
    let factory_is_closure = matches!(&call.args[1], Expr::Closure(_));
    let factory_is_reusable = expression_is_reusable(&call.args[1]);
    let factory = emit_expression(&call.args[1], entities)?;
    let push_expr = if factory_is_closure {
        if let Expr::Closure(closure) = &call.args[1] {
            if closure.inputs.is_empty() {
                emit_expression(&closure.body, entities)?
            } else {
                format!("({factory})()")
            }
        } else {
            format!("({factory})()")
        }
    } else if factory_is_reusable {
        format!("{factory}()")
    } else {
        format!("({factory})()")
    };
    let mut used = receiver
        .split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$'))
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let items = if bind_receiver {
        fresh_identifier("items", &mut used)
    } else {
        receiver.clone()
    };
    let len = if bind_length {
        fresh_identifier("len", &mut used)
    } else {
        length.clone()
    };
    let needs_block = bind_receiver || bind_length;
    if needs_block {
        write_indent(out, indent);
        out.push_str("{\n");
        let bi = indent + 1;
        if bind_receiver {
            write_indent(out, bi);
            writeln!(out, "const {items} = {receiver};").expect("writing to a String cannot fail");
        }
        if bind_length {
            write_indent(out, bi);
            writeln!(out, "const {len} = {length};").expect("writing to a String cannot fail");
        }
        write_indent(out, bi);
        writeln!(out, "while ({items}.length < {len}) {{")
            .expect("writing to a String cannot fail");
        write_indent(out, bi + 1);
        writeln!(out, "{items}.push({push_expr});").expect("writing to a String cannot fail");
        write_indent(out, bi);
        out.push_str("}\n");
        write_indent(out, bi);
        writeln!(out, "{items}.length = {len};").expect("writing to a String cannot fail");
        write_indent(out, indent);
        out.push_str("}\n");
    } else {
        write_indent(out, indent);
        writeln!(out, "while ({items}.length < {len}) {{")
            .expect("writing to a String cannot fail");
        write_indent(out, indent + 1);
        writeln!(out, "{items}.push({push_expr});").expect("writing to a String cannot fail");
        write_indent(out, indent);
        out.push_str("}\n");
        write_indent(out, indent);
        writeln!(out, "{items}.length = {len};").expect("writing to a String cannot fail");
    }
    return Ok(());
}

pub(super) fn emit_swap_remove_statement(
    out: &mut String,
    call: &syn::ExprMethodCall,
    entities: &HashSet<String>,
    indent: usize,
) -> Result<(), CompileError> {
    let receiver = emit_expression(&call.receiver, entities)?;
    let index = emit_expression(&call.args[0], entities)?;
    let bind_receiver = !expression_is_reusable(&call.receiver);
    let bind_index = !expression_is_reusable(&call.args[0]);
    let mut used = receiver
        .split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$'))
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let items = if bind_receiver {
        fresh_identifier("items", &mut used)
    } else {
        receiver.clone()
    };
    let idx = if bind_index {
        fresh_identifier("index", &mut used)
    } else {
        index.clone()
    };
    let last = fresh_identifier("last", &mut used);
    write_indent(out, indent);
    out.push_str("{\n");
    let bi = indent + 1;
    if bind_receiver {
        write_indent(out, bi);
        writeln!(out, "const {items} = {receiver};").expect("writing to a String cannot fail");
    }
    if bind_index {
        write_indent(out, bi);
        writeln!(out, "const {idx} = {index};").expect("writing to a String cannot fail");
    }
    write_indent(out, bi);
    writeln!(out, "const {last} = {items}.length - 1;").expect("writing to a String cannot fail");
    write_indent(out, bi);
    writeln!(out, "if ({idx} !== {last}) {{").expect("writing to a String cannot fail");
    write_indent(out, bi + 1);
    writeln!(
        out,
        "[{items}[{idx}], {items}[{last}]] = [{items}[{last}], {items}[{idx}]];"
    )
    .expect("writing to a String cannot fail");
    write_indent(out, bi);
    out.push_str("}\n");
    write_indent(out, bi);
    writeln!(out, "{items}.pop();").expect("writing to a String cannot fail");
    write_indent(out, indent);
    out.push_str("}\n");
    return Ok(());
}
