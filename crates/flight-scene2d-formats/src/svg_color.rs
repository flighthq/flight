use crate::types::SvgColor;

fn hsl_to_rgb(hue: f32, saturation: f32, lightness: f32) -> u32 {
    let normalized_hue = hue.rem_euclid(360.0) / 60.0;
    let chroma = (1.0 - (2.0 * lightness - 1.0).abs()) * saturation;
    let secondary = chroma * (1.0 - (normalized_hue.rem_euclid(2.0) - 1.0).abs());
    let (red, green, blue) = if normalized_hue < 1.0 {
        (chroma, secondary, 0.0)
    } else if normalized_hue < 2.0 {
        (secondary, chroma, 0.0)
    } else if normalized_hue < 3.0 {
        (0.0, chroma, secondary)
    } else if normalized_hue < 4.0 {
        (0.0, secondary, chroma)
    } else if normalized_hue < 5.0 {
        (secondary, 0.0, chroma)
    } else {
        (chroma, 0.0, secondary)
    };
    let offset = lightness - chroma / 2.0;
    let red = ((red + offset) * 255.0).round() as u32;
    let green = ((green + offset) * 255.0).round() as u32;
    let blue = ((blue + offset) * 255.0).round() as u32;
    return (red << 16) | (green << 8) | blue;
}

fn parse_color_function(value: &str) -> Option<(&str, &str)> {
    let open = value.find('(')?;
    if !value.ends_with(')') {
        return None;
    }
    let name = &value[..open];
    if !matches!(name, "rgb" | "rgba" | "hsl" | "hsla") {
        return None;
    }
    return Some((name, &value[open + 1..value.len() - 1]));
}

fn parse_css_alpha(value: &str) -> Option<f32> {
    let parsed = parse_float_prefix(value)?;
    return Some(if value.ends_with('%') {
        (parsed / 100.0).clamp(0.0, 1.0)
    } else {
        parsed.clamp(0.0, 1.0)
    });
}

fn parse_css_fraction(value: &str) -> Option<f32> {
    return parse_css_alpha(value);
}

fn parse_css_hue(value: &str) -> Option<f32> {
    let parsed = parse_float_prefix(value)?;
    return Some(if value.ends_with("turn") {
        parsed * 360.0
    } else if value.ends_with("grad") {
        parsed * 0.9
    } else if value.ends_with("rad") {
        parsed * 180.0 / std::f32::consts::PI
    } else {
        parsed
    });
}

fn parse_float_prefix(value: &str) -> Option<f32> {
    let bytes = value.trim_start().as_bytes();
    let mut index = 0;
    if bytes
        .get(index)
        .is_some_and(|byte| *byte == b'+' || *byte == b'-')
    {
        index += 1;
    }
    let integer_start = index;
    while bytes.get(index).is_some_and(u8::is_ascii_digit) {
        index += 1;
    }
    let mut has_digits = index > integer_start;
    if bytes.get(index) == Some(&b'.') {
        index += 1;
        let fraction_start = index;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            index += 1;
        }
        has_digits = has_digits || index > fraction_start;
    }
    if !has_digits {
        return None;
    }
    if bytes
        .get(index)
        .is_some_and(|byte| *byte == b'e' || *byte == b'E')
    {
        let mut exponent_end = index + 1;
        if bytes
            .get(exponent_end)
            .is_some_and(|byte| *byte == b'+' || *byte == b'-')
        {
            exponent_end += 1;
        }
        let exponent_start = exponent_end;
        while bytes.get(exponent_end).is_some_and(u8::is_ascii_digit) {
            exponent_end += 1;
        }
        if exponent_end > exponent_start {
            index = exponent_end;
        }
    }
    return value.trim_start()[..index]
        .parse::<f32>()
        .ok()
        .filter(|number| number.is_finite());
}

fn parse_hex_prefix(value: &str) -> Option<u32> {
    let end = value
        .bytes()
        .position(|byte| !byte.is_ascii_hexdigit())
        .unwrap_or(value.len());
    if end == 0 {
        return None;
    }
    return u32::from_str_radix(&value[..end], 16).ok();
}

fn parse_repeated_hex_digit(value: &str, index: usize) -> Option<u8> {
    let digit = value.get(index..index + 1)?;
    return parse_hex_prefix(&format!("{digit}{digit}"))?
        .try_into()
        .ok();
}

fn parse_rgb_component(value: &str) -> Option<u8> {
    let parsed = parse_float_prefix(value)?;
    let scaled = if value.ends_with('%') {
        parsed * 255.0 / 100.0
    } else {
        parsed
    };
    return Some(scaled.clamp(0.0, 255.0).round() as u8);
}

pub fn parse_svg_color(value: &str) -> Option<SvgColor> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() || normalized == "none" || normalized == "transparent" {
        return None;
    }
    if let Some(hex) = normalized.strip_prefix('#') {
        if hex.len() == 3 || hex.len() == 4 {
            let red = parse_repeated_hex_digit(hex, 0)?;
            let green = parse_repeated_hex_digit(hex, 1)?;
            let blue = parse_repeated_hex_digit(hex, 2)?;
            let alpha = if hex.len() == 4 {
                f32::from(parse_repeated_hex_digit(hex, 3)?) / 255.0
            } else {
                1.0
            };
            return Some(SvgColor {
                alpha,
                rgb: (u32::from(red) << 16) | (u32::from(green) << 8) | u32::from(blue),
            });
        }
        if hex.len() == 6 || hex.len() == 8 {
            let rgb = parse_hex_prefix(&hex[..6])?;
            let alpha = if hex.len() == 8 {
                parse_hex_prefix(&hex[6..])? as f32 / 255.0
            } else {
                1.0
            };
            return Some(SvgColor { alpha, rgb });
        }
    }
    if let Some((name, arguments)) = parse_color_function(&normalized) {
        let components = arguments
            .split(|character: char| {
                character.is_ascii_whitespace() || character == ',' || character == '/'
            })
            .filter(|component| !component.is_empty())
            .collect::<Vec<_>>();
        if (name == "rgb" || name == "rgba") && components.len() >= 3 {
            let red = parse_rgb_component(components[0])?;
            let green = parse_rgb_component(components[1])?;
            let blue = parse_rgb_component(components[2])?;
            let alpha = components
                .get(3)
                .map_or(Some(1.0), |value| parse_css_alpha(value))?;
            return Some(SvgColor {
                alpha,
                rgb: (u32::from(red) << 16) | (u32::from(green) << 8) | u32::from(blue),
            });
        }
        if (name == "hsl" || name == "hsla") && components.len() >= 3 {
            let hue = parse_css_hue(components[0])?;
            let saturation = parse_css_fraction(components[1])?;
            let lightness = parse_css_fraction(components[2])?;
            let alpha = components
                .get(3)
                .map_or(Some(1.0), |value| parse_css_alpha(value))?;
            return Some(SvgColor {
                alpha,
                rgb: hsl_to_rgb(hue, saturation, lightness),
            });
        }
    }
    return svg_named_color(&normalized).map(|rgb| SvgColor { alpha: 1.0, rgb });
}

pub fn resolve_svg_color(value: &str, current_color: &str) -> Option<SvgColor> {
    return parse_svg_color(if value.trim().eq_ignore_ascii_case("currentcolor") {
        current_color
    } else {
        value
    });
}

fn svg_named_color(value: &str) -> Option<u32> {
    return match value {
        "aqua" | "cyan" => Some(0x00ffff),
        "black" => Some(0x000000),
        "blue" => Some(0x0000ff),
        "fuchsia" | "magenta" => Some(0xff00ff),
        "gray" | "grey" => Some(0x808080),
        "green" => Some(0x008000),
        "lime" => Some(0x00ff00),
        "maroon" => Some(0x800000),
        "navy" => Some(0x000080),
        "olive" => Some(0x808000),
        "orange" => Some(0xffa500),
        "purple" => Some(0x800080),
        "red" => Some(0xff0000),
        "silver" => Some(0xc0c0c0),
        "teal" => Some(0x008080),
        "white" => Some(0xffffff),
        "yellow" => Some(0xffff00),
        _ => None,
    };
}
