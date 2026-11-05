use std::fmt::Write;

use syn::{GenericArgument, PathArguments, Type};

use super::{value_references_name, write_indent};

// Opens `if let Some(name) = value` on the absent value. A scrutinee that only reads a binding or a
// field chain is re-read in the test and the binding (and a `name` that is that same binding needs no
// redeclaration: the test narrows it); any other scrutinee is evaluated exactly once into a block
// scoped `$name` temporary, a spelling no Rust identifier can take. Returns the indent of the `if` and
// whether a wrapping block must be closed after its `else`.
pub(crate) fn begin_option_if(
    out: &mut String,
    indent: usize,
    binding: &(String, String, &'static str),
    rereadable: bool,
) -> (usize, bool) {
    return begin_option_if_with_rebind(out, indent, binding, rereadable, false);
}

pub(crate) fn begin_option_if_with_rebind(
    out: &mut String,
    indent: usize,
    binding: &(String, String, &'static str),
    rereadable: bool,
    body_rebinds: bool,
) -> (usize, bool) {
    let (name, value, absent) = binding;
    let is_destructure = name.starts_with('[');
    let (if_indent, test) = if rereadable {
        (indent, value.clone())
    } else {
        write_indent(out, indent);
        out.push_str("{\n");
        write_indent(out, indent + 1);
        if is_destructure {
            writeln!(out, "const $opt = {value};").expect("writing to a String cannot fail");
            (indent + 1, "$opt".to_string())
        } else if value_references_name(name, value) {
            writeln!(out, "const ${name} = {value};").expect("writing to a String cannot fail");
            (indent + 1, format!("${name}"))
        } else {
            let keyword = if body_rebinds { "let" } else { "const" };
            writeln!(out, "{keyword} {name} = {value};").expect("writing to a String cannot fail");
            (indent + 1, name.clone())
        }
    };
    write_indent(out, if_indent);
    writeln!(out, "if ({test} !== {absent}) {{").expect("writing to a String cannot fail");
    if &test != name {
        let keyword = if body_rebinds { "let" } else { "const" };
        write_indent(out, if_indent + 1);
        writeln!(out, "{keyword} {name} = {test};").expect("writing to a String cannot fail");
    }
    return (if_indent, !rereadable);
}

// Opens `while let Some(name) = value`. A re-readable scrutinee keeps `while (value !== absent)`; any
// other is evaluated exactly once per iteration in a `for (;;)` that breaks on the absent value, so a
// side-effecting scrutinee such as a pop runs once per pass.
pub(crate) fn begin_option_while(
    out: &mut String,
    indent: usize,
    binding: &(String, String, &'static str),
    rereadable: bool,
) {
    let (name, value, absent) = binding;
    let is_destructure = name.starts_with('[');
    write_indent(out, indent);
    if rereadable {
        writeln!(out, "while ({value} !== {absent}) {{").expect("writing to a String cannot fail");
        if value != name {
            write_indent(out, indent + 1);
            writeln!(out, "const {name} = {value};").expect("writing to a String cannot fail");
        }
        return;
    }
    let temp = if is_destructure {
        "$opt"
    } else {
        &format!("${name}")
    };
    out.push_str("for (;;) {\n");
    write_indent(out, indent + 1);
    writeln!(out, "const {temp} = {value};").expect("writing to a String cannot fail");
    write_indent(out, indent + 1);
    writeln!(out, "if ({temp} === {absent}) {{").expect("writing to a String cannot fail");
    write_indent(out, indent + 2);
    out.push_str("break;\n");
    write_indent(out, indent + 1);
    out.push_str("}\n");
    write_indent(out, indent + 1);
    writeln!(out, "const {name} = {temp};").expect("writing to a String cannot fail");
}

pub(super) fn option_inner_type(rust_type: &Type) -> Option<&Type> {
    let Type::Path(path) = rust_type else {
        return None;
    };
    let segment = path.path.segments.last()?;
    if segment.ident != "Option" {
        return None;
    }
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return None;
    };
    let mut types = arguments.args.iter().filter_map(|argument| match argument {
        GenericArgument::Type(rust_type) => Some(rust_type),
        _ => None,
    });
    let inner = types.next()?;
    return types.next().is_none().then_some(inner);
}

pub(super) fn result_ok_type(rust_type: &Type) -> Option<&Type> {
    let Type::Path(path) = rust_type else {
        return None;
    };
    let segment = path.path.segments.last()?;
    if segment.ident != "Result" {
        return None;
    }
    let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
        return None;
    };
    let mut types = arguments.args.iter().filter_map(|argument| match argument {
        GenericArgument::Type(rust_type) => Some(rust_type),
        _ => None,
    });
    let ok_type = types.next()?;
    if types.next().is_none() {
        return None;
    }
    return Some(ok_type);
}

pub(super) fn named_type(rust_type: &Type) -> Option<String> {
    return match rust_type {
        Type::Group(group) => named_type(&group.elem),
        Type::Paren(paren) => named_type(&paren.elem),
        Type::Reference(reference) => named_type(&reference.elem),
        Type::Path(path) => path
            .path
            .segments
            .last()
            .map(|segment| segment.ident.to_string()),
        _ => None,
    };
}
