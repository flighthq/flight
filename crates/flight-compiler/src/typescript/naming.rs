use syn::{Member, Pat};

use crate::model::StringUnionStyle;

pub(crate) fn default_item_name(segment: &str) -> String {
    return emit_path_segment(segment);
}

pub(super) fn emit_member(member: &Member) -> String {
    return match member {
        Member::Named(identifier) => snake_to_lower_camel(&identifier.to_string()),
        Member::Unnamed(index) => index.index.to_string(),
    };
}

pub(super) fn emit_path_segment(segment: &str) -> String {
    if segment.chars().all(|character| {
        character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
    }) {
        return segment.to_string();
    }
    return snake_to_lower_camel(segment);
}

pub(super) fn is_js_identifier(s: &str) -> bool {
    !s.is_empty()
        && s.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_' || c == '$')
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

pub(crate) fn lower_camel_from_upper_camel(name: &str) -> String {
    let mut characters = name.chars();
    let Some(first) = characters.next() else {
        return String::new();
    };
    return first.to_lowercase().chain(characters).collect();
}

pub(super) fn rewrite_code_span(value: &str) -> String {
    let mut out = String::new();
    let mut token = String::new();
    let flush = |out: &mut String, token: &mut String| {
        if token.is_empty() {
            return;
        }
        if token == "None" {
            out.push_str("undefined");
        } else if token.contains('_')
            && token
                .chars()
                .any(|character| character.is_ascii_lowercase())
            && token
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
        {
            out.push_str(&snake_to_lower_camel(token));
        } else {
            out.push_str(token);
        }
        token.clear();
    };
    for character in value.chars() {
        if character.is_ascii_alphanumeric() || character == '_' {
            token.push(character);
        } else {
            flush(&mut out, &mut token);
            out.push(character);
        }
    }
    flush(&mut out, &mut token);
    return out;
}

pub(super) fn rewrite_documentation(value: &str) -> String {
    let value = value
        .replace("Panics", "Throws")
        .replace("panics", "throws");
    let mut out = String::new();
    for (index, segment) in value.split('`').enumerate() {
        if index > 0 {
            out.push('`');
        }
        if index % 2 == 0 {
            out.push_str(segment);
        } else {
            out.push_str(&rewrite_code_span(segment));
        }
    }
    return out;
}

// Leading underscores mark an intentionally unused Rust binding; TypeScript linters read the same
// prefix the same way, so they are kept rather than treated as an empty first word (`_out` stays
// `_out`, not `Out`).
pub(crate) fn snake_to_lower_camel(name: &str) -> String {
    let name = name.strip_prefix("r#").unwrap_or(name);
    let body = name.trim_start_matches('_');
    let mut out = name[..name.len() - body.len()].to_string();
    let mut words = body.split('_');
    out.push_str(words.next().unwrap_or_default());
    for word in words {
        let mut capitalized = false;
        for character in word.chars() {
            if !capitalized && character.is_alphabetic() {
                out.extend(character.to_uppercase());
                capitalized = true;
            } else {
                out.push(character);
            }
        }
    }
    apply_acronym_casing(&mut out);
    if is_js_reserved_word(&out) {
        out.push('_');
    }
    return out;
}

pub(crate) fn string_union_literal(name: &str, style: StringUnionStyle) -> String {
    if style == StringUnionStyle::Exact {
        unreachable!("exact string-union values require their declared metadata");
    }
    if style == StringUnionStyle::LowerCamel {
        return lower_camel_from_upper_camel(name);
    }
    if style == StringUnionStyle::RustVariant {
        return name.to_string();
    }
    let characters = name.chars().collect::<Vec<_>>();
    let mut literal = String::new();
    for (index, character) in characters.iter().copied().enumerate() {
        if character == '_' {
            if !literal.is_empty() && !literal.ends_with('-') {
                literal.push('-');
            }
            continue;
        }
        if character.is_ascii_uppercase()
            && index > 0
            && !literal.ends_with('-')
            && (characters[index - 1].is_ascii_lowercase()
                || characters[index - 1].is_ascii_digit()
                || characters
                    .get(index + 1)
                    .is_some_and(|next| next.is_ascii_lowercase()))
        {
            literal.push('-');
        }
        literal.extend(character.to_lowercase());
    }
    return literal;
}

pub(crate) fn emit_pattern(pattern: &Pat) -> Result<String, crate::CompileError> {
    return match pattern {
        Pat::Ident(identifier) => Ok(snake_to_lower_camel(&identifier.ident.to_string())),
        Pat::Reference(reference) => emit_pattern(&reference.pat),
        Pat::Tuple(tuple) => {
            let elements = tuple
                .elems
                .iter()
                .map(|element| {
                    if matches!(element, Pat::Wild(_)) {
                        Ok(String::new())
                    } else {
                        emit_pattern(element)
                    }
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Pat::Slice(slice) => {
            let elements = slice
                .elems
                .iter()
                .map(|element| {
                    if matches!(element, Pat::Wild(_)) {
                        Ok(String::new())
                    } else {
                        emit_pattern(element)
                    }
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", elements.join(", ")))
        }
        Pat::Struct(structure) => {
            let mut fields = Vec::new();
            for field in &structure.fields {
                let member_name = match &field.member {
                    Member::Named(name) => snake_to_lower_camel(&name.to_string()),
                    Member::Unnamed(index) => index.index.to_string(),
                };
                let binding = emit_pattern(&field.pat)?;
                if member_name == binding {
                    fields.push(member_name);
                } else {
                    fields.push(format!("{member_name}: {binding}"));
                }
            }
            Ok(format!("{{ {} }}", fields.join(", ")))
        }
        Pat::Paren(paren) => emit_pattern(&paren.pat),
        Pat::Type(typed) => emit_pattern(&typed.pat),
        Pat::Wild(_) => Ok("_".to_string()),
        _ => Err(crate::compile_error("unsupported portable loop pattern")),
    };
}

fn apply_acronym_casing(name: &mut String) {
    let bytes = name.as_bytes().to_vec();
    let len = bytes.len();
    let mut result = Vec::with_capacity(len);
    let mut i = 0;
    while i < len {
        if bytes[i].is_ascii_digit()
            && i + 1 < len
            && bytes[i + 1] == b'd'
            && (i + 2 >= len
                || bytes[i + 2].is_ascii_uppercase()
                || !bytes[i + 2].is_ascii_alphabetic())
        {
            result.push(bytes[i]);
            result.push(b'D');
            i += 2;
        } else if bytes[i] == b'X'
            && i + 2 < len
            && bytes[i + 1] == b'y'
            && bytes[i + 2] == b'z'
            && (i + 3 >= len
                || bytes[i + 3].is_ascii_uppercase()
                || !bytes[i + 3].is_ascii_alphabetic())
        {
            result.push(b'X');
            result.push(b'Y');
            result.push(b'Z');
            i += 3;
        } else if bytes[i] == b'X'
            && i + 1 < len
            && bytes[i + 1] == b'y'
            && (i + 2 >= len
                || bytes[i + 2].is_ascii_uppercase()
                || !bytes[i + 2].is_ascii_alphabetic())
        {
            result.push(b'X');
            result.push(b'Y');
            i += 2;
        } else {
            result.push(bytes[i]);
            i += 1;
        }
    }
    *name = String::from_utf8(result).expect("ASCII transform preserves UTF-8");
}

fn is_js_reserved_word(name: &str) -> bool {
    matches!(
        name,
        "abstract"
            | "arguments"
            | "await"
            | "boolean"
            | "break"
            | "byte"
            | "case"
            | "catch"
            | "char"
            | "class"
            | "const"
            | "continue"
            | "debugger"
            | "default"
            | "delete"
            | "do"
            | "double"
            | "else"
            | "enum"
            | "eval"
            | "export"
            | "extends"
            | "false"
            | "final"
            | "finally"
            | "float"
            | "for"
            | "function"
            | "goto"
            | "if"
            | "implements"
            | "import"
            | "in"
            | "instanceof"
            | "int"
            | "interface"
            | "let"
            | "long"
            | "native"
            | "new"
            | "null"
            | "package"
            | "private"
            | "protected"
            | "public"
            | "return"
            | "short"
            | "static"
            | "super"
            | "switch"
            | "synchronized"
            | "this"
            | "throw"
            | "throws"
            | "transient"
            | "true"
            | "try"
            | "typeof"
            | "undefined"
            | "var"
            | "void"
            | "volatile"
            | "while"
            | "with"
            | "yield"
    )
}
