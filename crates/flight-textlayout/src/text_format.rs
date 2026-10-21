use flight_textformat::TextFormat;

const DEFAULT_SIZE: f32 = 12.0;

pub fn get_text_format_ascent(format: &TextFormat) -> f32 {
    return format.size.unwrap_or(DEFAULT_SIZE);
}

pub fn get_text_format_descent(format: &TextFormat) -> f32 {
    return format.size.unwrap_or(DEFAULT_SIZE) * 0.185;
}

pub fn get_text_format_height(format: &TextFormat) -> f32 {
    return get_text_format_ascent(format)
        + get_text_format_descent(format)
        + get_text_format_leading(format);
}

pub fn get_text_format_leading(format: &TextFormat) -> f32 {
    return format.leading.unwrap_or(0.0);
}

pub fn merge_text_format(base: &TextFormat, r#override: &TextFormat) -> TextFormat {
    let mut result = base.clone();
    if r#override.align.is_some() {
        result.align = r#override.align;
    }
    if r#override.block_indent.is_some() {
        result.block_indent = r#override.block_indent;
    }
    if r#override.bold.is_some() {
        result.bold = r#override.bold;
    }
    if r#override.bullet.is_some() {
        result.bullet = r#override.bullet;
    }
    if r#override.color.is_some() {
        result.color = r#override.color;
    }
    if r#override.font.is_some() {
        result.font = r#override.font.clone();
    }
    if r#override.indent.is_some() {
        result.indent = r#override.indent;
    }
    if r#override.italic.is_some() {
        result.italic = r#override.italic;
    }
    if r#override.kerning.is_some() {
        result.kerning = r#override.kerning;
    }
    if r#override.leading.is_some() {
        result.leading = r#override.leading;
    }
    if r#override.left_margin.is_some() {
        result.left_margin = r#override.left_margin;
    }
    if r#override.letter_spacing.is_some() {
        result.letter_spacing = r#override.letter_spacing;
    }
    if r#override.list_marker.is_some() {
        result.list_marker = r#override.list_marker;
    }
    if r#override.right_margin.is_some() {
        result.right_margin = r#override.right_margin;
    }
    if r#override.size.is_some() {
        result.size = r#override.size;
    }
    if r#override.strikethrough.is_some() {
        result.strikethrough = r#override.strikethrough;
    }
    if r#override.tab_stops.is_some() {
        result.tab_stops = r#override.tab_stops.clone();
    }
    if r#override.target.is_some() {
        result.target = r#override.target.clone();
    }
    if r#override.underline.is_some() {
        result.underline = r#override.underline;
    }
    if r#override.url.is_some() {
        result.url = r#override.url.clone();
    }
    if r#override.variations.is_some() {
        result.variations = r#override.variations.clone();
    }
    return result;
}
