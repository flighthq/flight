use flight_textformat::TextFormat;

pub fn compute_text_format_font_string(format: &TextFormat) -> String {
    let style = if format.italic.unwrap_or(false) {
        "italic"
    } else {
        "normal"
    };
    let weight = if format.bold.unwrap_or(false) {
        "bold"
    } else {
        "normal"
    };
    let size = format.size.unwrap_or(12.0);
    let family = format.font.as_deref().unwrap_or("sans-serif");
    return format!("{style} {weight} {size}px {family}");
}
