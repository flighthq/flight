pub(super) fn array_type(inner: String) -> String {
    if inner.starts_with("readonly [") {
        return format!("Array<{inner}>");
    }
    if inner.contains(" | ") || inner.contains("=>") {
        return format!("({inner})[]");
    }
    return format!("{inner}[]");
}

pub(super) fn indent_continuation_lines(text: &str, indent: usize) -> String {
    if indent == 0 || !text.contains('\n') {
        return text.to_string();
    }
    let prefix = "  ".repeat(indent);
    let mut result = String::with_capacity(text.len() + indent * 2 * text.matches('\n').count());
    let mut first = true;
    for line in text.split('\n') {
        if !first {
            result.push('\n');
            if !line.is_empty() {
                result.push_str(&prefix);
            }
        }
        result.push_str(line);
        first = false;
    }
    return result;
}

pub(super) fn is_primitive_typescript_type(typescript_type: &str) -> bool {
    return matches!(
        typescript_type,
        "boolean" | "number" | "object" | "string" | "unknown" | "void"
    ) || typescript_type.contains("=>");
}

pub(super) fn join_closing_brace_with(out: &mut String, continuation: &str) {
    if out.ends_with("}\n") {
        out.pop();
        out.push(' ');
    }
    out.push_str(continuation);
}

pub(super) fn parenthesize_compound(expr: &str) -> std::borrow::Cow<'_, str> {
    let trimmed = expr.trim();
    if trimmed.starts_with('(') && trimmed.ends_with(')') {
        return std::borrow::Cow::Borrowed(expr);
    }
    let bytes = trimmed.as_bytes();
    let len = bytes.len();
    let mut depth = 0i32;
    let mut i = 0;
    while i < len {
        match bytes[i] {
            b'(' | b'[' => depth += 1,
            b')' | b']' => depth -= 1,
            b'>' if depth == 0 && i + 1 < len && bytes[i + 1] == b'>' => {
                return std::borrow::Cow::Owned(format!("({expr})"));
            }
            b'<' if depth == 0 && i + 1 < len && bytes[i + 1] == b'<' => {
                return std::borrow::Cow::Owned(format!("({expr})"));
            }
            b'?' if depth == 0 => {
                return std::borrow::Cow::Owned(format!("({expr})"));
            }
            _ => {}
        }
        i += 1;
    }
    return std::borrow::Cow::Borrowed(expr);
}

// JavaScript forbids mixing `??` with `||`/`&&` without explicit grouping, and a bare arrow
// function as `??` operand is ambiguous (the parser cannot tell a typed parameter list from a
// parenthesized expression until it reaches `=>`). This wraps an expression in parentheses when
// it contains a top-level `||`, `&&`, or `=>`.
pub(super) fn coalesce_safe(expr: &str) -> std::borrow::Cow<'_, str> {
    let trimmed = expr.trim();
    if trimmed.starts_with('(') && trimmed.ends_with(')') {
        return std::borrow::Cow::Borrowed(expr);
    }
    let bytes = trimmed.as_bytes();
    let len = bytes.len();
    let mut depth = 0i32;
    let mut i = 0;
    while i < len {
        match bytes[i] {
            b'(' | b'[' => depth += 1,
            b')' | b']' => depth -= 1,
            b'&' if depth == 0 && i + 1 < len && bytes[i + 1] == b'&' => {
                return std::borrow::Cow::Owned(format!("({expr})"));
            }
            b'|' if depth == 0 && i + 1 < len && bytes[i + 1] == b'|' => {
                return std::borrow::Cow::Owned(format!("({expr})"));
            }
            b'=' if depth == 0 && i + 1 < len && bytes[i + 1] == b'>' => {
                return std::borrow::Cow::Owned(format!("({expr})"));
            }
            _ => {}
        }
        i += 1;
    }
    return std::borrow::Cow::Borrowed(expr);
}

pub(crate) fn write_indent(out: &mut String, indent: usize) {
    for _ in 0..indent {
        out.push_str("  ");
    }
}
