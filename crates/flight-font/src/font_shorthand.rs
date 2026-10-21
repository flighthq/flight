/// Produces the exact quoted CSS font shorthand used by the host loading capability.
pub fn get_font_shorthand(family: &str, style: Option<&str>) -> String {
    let mut escaped = String::with_capacity(family.len());
    for character in family.chars() {
        if character == '\\' || character == '\'' {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    let quoted = format!("'{escaped}'");
    return match style {
        Some(style) if !style.is_empty() => format!("{style} 1em {quoted}"),
        _ => format!("1em {quoted}"),
    };
}
