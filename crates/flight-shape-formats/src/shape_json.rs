//! Native retained-shape JSON (TS `shapeJson.ts`).
// flight-lint: allow-file(f64) D1: retained ShapeCommandToken scalars and JSON numbers use the canonical f64 shape/path lane; Matrix remains f32

use flight_entity::{Ref, throw_type_error};
use flight_geometry::{Matrix, create_matrix};
use flight_path::contract::{PathWinding, parse_path_winding};
use flight_shape::contract::{
    CapsStyle, GradientType, InterpolationMethod, JointStyle, LineScaleMode, Shape,
    ShapeCommandNumbers, ShapeCommandToken, SpreadMethod, TriangleCulling, append_shape_begin_fill,
    append_shape_begin_gradient_fill, append_shape_begin_texture_fill, append_shape_circle,
    append_shape_cubic_curve_to, append_shape_draw_triangles, append_shape_ellipse,
    append_shape_end_fill, append_shape_line_gradient_style, append_shape_line_style,
    append_shape_line_texture_style, append_shape_line_to, append_shape_move_to, append_shape_path,
    append_shape_quadratic_curve_to, append_shape_rectangle, append_shape_rounded_rectangle,
    create_shape,
};
use serde_json::{Map, Number, Value};

use crate::shape_command_schemas::DEFAULT_SHAPE_COMMAND_SCHEMAS;
use crate::types::{
    ShapeCommandSchemaArgumentType, ShapeJsonFormatOptions, ShapeJsonFormatSpace,
    ShapeJsonParseOptions, ShapeTextureReference,
};

const SHAPE_JSON_FORMAT: u32 = 3;

fn append_reconstructed_shape_command(
    shape: &Ref<Shape>,
    key: &str,
    arguments: &[ShapeCommandToken],
) -> bool {
    let command_start = shape.read().unwrap().data.commands.len();
    match key {
        "beginTextureFill" => {
            let texture = arguments[0].as_texture().unwrap();
            append_shape_begin_texture_fill(shape, texture, matrix_argument(arguments, 1));
        }
        "beginFill" => {
            let color = number_argument(arguments, 0).unwrap_or(0.0) as u32;
            append_shape_begin_fill(shape, color, number_argument(arguments, 1));
        }
        "beginGradientFill" => {
            let Some(gradient_type) = gradient_type_argument(arguments, 0) else {
                return false;
            };
            let colors = color_arguments(arguments, 1);
            let Some(spread_method) = optional_spread_method_argument(arguments, 5) else {
                return false;
            };
            let Some(interpolation_method) = optional_interpolation_method_argument(arguments, 6)
            else {
                return false;
            };
            append_shape_begin_gradient_fill(
                shape,
                gradient_type,
                &colors,
                number_array_argument(arguments, 2).unwrap(),
                number_array_argument(arguments, 3).unwrap(),
                matrix_argument(arguments, 4),
                spread_method,
                interpolation_method,
                number_argument(arguments, 7),
            );
        }
        "cubicCurveTo" => append_shape_cubic_curve_to(
            shape,
            number_argument(arguments, 0).unwrap(),
            number_argument(arguments, 1).unwrap(),
            number_argument(arguments, 2).unwrap(),
            number_argument(arguments, 3).unwrap(),
            number_argument(arguments, 4).unwrap(),
            number_argument(arguments, 5).unwrap(),
        ),
        "quadraticCurveTo" => append_shape_quadratic_curve_to(
            shape,
            number_argument(arguments, 0).unwrap(),
            number_argument(arguments, 1).unwrap(),
            number_argument(arguments, 2).unwrap(),
            number_argument(arguments, 3).unwrap(),
        ),
        "drawCircle" => append_shape_circle(
            shape,
            number_argument(arguments, 0).unwrap(),
            number_argument(arguments, 1).unwrap(),
            number_argument(arguments, 2).unwrap(),
        ),
        "drawEllipse" => append_shape_ellipse(
            shape,
            number_argument(arguments, 0).unwrap(),
            number_argument(arguments, 1).unwrap(),
            number_argument(arguments, 2).unwrap(),
            number_argument(arguments, 3).unwrap(),
        ),
        "drawPath" => {
            let commands: Vec<u8> = number_array_argument(arguments, 0)
                .unwrap()
                .iter()
                .map(|value| *value as u8)
                .collect();
            let winding = match arguments.get(2) {
                None => Some(PathWinding::EvenOdd),
                Some(value) => value.as_str().and_then(parse_path_winding),
            };
            let Some(winding) = winding else {
                return false;
            };
            append_shape_path(
                shape,
                &commands,
                number_array_argument(arguments, 1).unwrap(),
                Some(winding),
            );
        }
        "drawRectangle" => append_shape_rectangle(
            shape,
            number_argument(arguments, 0).unwrap(),
            number_argument(arguments, 1).unwrap(),
            number_argument(arguments, 2).unwrap(),
            number_argument(arguments, 3).unwrap(),
        ),
        "drawRoundedRectangle" => append_shape_rounded_rectangle(
            shape,
            number_argument(arguments, 0).unwrap(),
            number_argument(arguments, 1).unwrap(),
            number_argument(arguments, 2).unwrap(),
            number_argument(arguments, 3).unwrap(),
            number_argument(arguments, 4).unwrap(),
        ),
        "drawTriangles" => {
            let Some(culling) = optional_triangle_culling_argument(arguments, 3) else {
                return false;
            };
            append_shape_draw_triangles(
                shape,
                number_array_argument(arguments, 0).unwrap(),
                nullable_number_array_argument(arguments, 1),
                nullable_number_array_argument(arguments, 2),
                culling,
            );
        }
        "endFill" => append_shape_end_fill(shape),
        "lineTextureStyle" => {
            let texture = arguments[0].as_texture().unwrap();
            append_shape_line_texture_style(shape, texture, matrix_argument(arguments, 1));
        }
        "lineGradientStyle" => {
            let Some(gradient_type) = gradient_type_argument(arguments, 0) else {
                return false;
            };
            let colors = color_arguments(arguments, 1);
            let Some(spread_method) = optional_spread_method_argument(arguments, 5) else {
                return false;
            };
            let Some(interpolation_method) = optional_interpolation_method_argument(arguments, 6)
            else {
                return false;
            };
            append_shape_line_gradient_style(
                shape,
                gradient_type,
                &colors,
                number_array_argument(arguments, 2).unwrap(),
                number_array_argument(arguments, 3).unwrap(),
                matrix_argument(arguments, 4),
                spread_method,
                interpolation_method,
                number_argument(arguments, 7),
            );
        }
        "lineStyle" => {
            let Some(scale_mode) = optional_line_scale_mode_argument(arguments, 4) else {
                return false;
            };
            let Some(caps) = optional_caps_style_argument(arguments, 5) else {
                return false;
            };
            let Some(joints) = optional_joint_style_argument(arguments, 6) else {
                return false;
            };
            append_shape_line_style(
                shape,
                number_argument(arguments, 0),
                number_argument(arguments, 1).unwrap_or(0.0) as u32,
                number_argument(arguments, 2),
                boolean_argument(arguments, 3),
                scale_mode,
                caps,
                joints,
                number_argument(arguments, 7),
            );
        }
        "lineTo" => append_shape_line_to(
            shape,
            number_argument(arguments, 0).unwrap(),
            number_argument(arguments, 1).unwrap(),
        ),
        "moveTo" => append_shape_move_to(
            shape,
            number_argument(arguments, 0).unwrap(),
            number_argument(arguments, 1).unwrap(),
        ),
        _ => return false,
    }
    // The canonical typed appenders supply every omitted default and perform normal invalidation.
    // Restore the caller's already-validated dynamic JSON values over the provided prefix so the
    // codec does not invent integer narrowing for source `number`/`number[]` lanes such as packed
    // colors or path command arrays.
    let mut shape = shape.write().unwrap();
    for (index, argument) in arguments.iter().enumerate() {
        shape.data.commands[command_start + index + 2] = argument.clone();
    }
    return true;
}

fn boolean_argument(arguments: &[ShapeCommandToken], index: usize) -> Option<bool> {
    return arguments.get(index).and_then(ShapeCommandToken::as_boolean);
}

fn caps_style_argument(value: &ShapeCommandToken) -> Option<CapsStyle> {
    return match value.as_str()? {
        "none" => Some(CapsStyle::None),
        "round" => Some(CapsStyle::Round),
        "square" => Some(CapsStyle::Square),
        _ => None,
    };
}

fn color_arguments(arguments: &[ShapeCommandToken], index: usize) -> Vec<u32> {
    return number_array_argument(arguments, index)
        .unwrap()
        .iter()
        .map(|value| *value as u32)
        .collect();
}

fn format_js_number(value: f64) -> String {
    if value == 0.0 {
        return "0".to_string();
    }
    let negative = value.is_sign_negative();
    let raw = serde_json::to_string(&value.abs()).unwrap();
    let (mantissa, exponent) = match raw.find(['e', 'E']) {
        Some(index) => (&raw[..index], raw[index + 1..].parse::<i32>().unwrap()),
        None => (raw.as_str(), 0),
    };
    let decimal_index = mantissa.find('.').unwrap_or(mantissa.len());
    let mut digits: String = mantissa
        .chars()
        .filter(|character| *character != '.')
        .collect();
    let mut decimal_position = decimal_index as i32 + exponent;
    while digits.len() > 1 && digits.starts_with('0') {
        digits.remove(0);
        decimal_position -= 1;
    }
    while digits.len() > 1 && digits.ends_with('0') {
        digits.pop();
    }
    let digit_count = digits.len() as i32;
    let mut out = String::new();
    if negative {
        out.push('-');
    }
    if decimal_position > 0 && decimal_position <= digit_count {
        let split = decimal_position as usize;
        out.push_str(&digits[..split]);
        if split < digits.len() {
            out.push('.');
            out.push_str(&digits[split..]);
        }
    } else if decimal_position <= 0 && decimal_position > -6 {
        out.push_str("0.");
        for _ in 0..-decimal_position {
            out.push('0');
        }
        out.push_str(&digits);
    } else if decimal_position > digit_count && decimal_position <= 21 {
        out.push_str(&digits);
        for _ in 0..decimal_position - digit_count {
            out.push('0');
        }
    } else {
        out.push_str(&digits[..1]);
        if digits.len() > 1 {
            out.push('.');
            out.push_str(&digits[1..]);
        }
        out.push('e');
        let exponent = decimal_position - 1;
        if exponent >= 0 {
            out.push('+');
        }
        out.push_str(&exponent.to_string());
    }
    return out;
}

/// Serializes a shape's complete retained command stream to native versioned JSON (TS
/// `formatShapeJson`). An unrepresentable command throws the exact source `TypeError`.
pub fn format_shape_json(shape: &Shape, options: Option<&ShapeJsonFormatOptions>) -> String {
    let mut entries = Vec::new();
    let mut texture_ordinal = 0usize;
    let mut index = 0usize;
    while index < shape.data.commands.len() {
        let key = shape.data.commands[index]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| shape_command_key_string(&shape.data.commands[index]));
        let Some(argument_count_value) = shape
            .data
            .commands
            .get(index + 1)
            .and_then(ShapeCommandToken::as_number)
        else {
            throw_unrepresentable_shape_command(&key);
        };
        if !argument_count_value.is_finite()
            || argument_count_value < 0.0
            || argument_count_value.fract() != 0.0
            || argument_count_value > usize::MAX as f64
        {
            throw_unrepresentable_shape_command(&key);
        }
        let argument_count = argument_count_value as usize;
        let base = index + 2;
        let Some(end) = base.checked_add(argument_count) else {
            throw_unrepresentable_shape_command(&key);
        };
        let Some(command_arguments) = shape.data.commands.get(base..end) else {
            throw_unrepresentable_shape_command(&key);
        };
        if !is_valid_shape_command_args(&key, command_arguments) {
            throw_unrepresentable_shape_command(&key);
        }
        let arguments = command_arguments
            .iter()
            .map(|value| shape_command_arg_json(value, &mut texture_ordinal))
            .collect();
        let mut entry = Map::new();
        entry.insert("key".to_string(), Value::String(key));
        entry.insert("args".to_string(), Value::Array(arguments));
        entries.push(Value::Object(entry));
        index = end;
    }
    let mut root = Map::new();
    root.insert(
        "shapeFormat".to_string(),
        Value::Number(Number::from(SHAPE_JSON_FORMAT)),
    );
    root.insert("commands".to_string(), Value::Array(entries));
    return stringify_shape_json(&Value::Object(root), options);
}

fn gradient_type_argument(arguments: &[ShapeCommandToken], index: usize) -> Option<GradientType> {
    return match arguments.get(index)?.as_str()? {
        "linear" => Some(GradientType::Linear),
        "radial" => Some(GradientType::Radial),
        _ => None,
    };
}

fn indentation(options: Option<&ShapeJsonFormatOptions>) -> Option<String> {
    let space = options.and_then(|value| value.space.as_ref())?;
    let gap = match space {
        ShapeJsonFormatSpace::Number(value) => {
            let count = if value.is_nan() || *value <= 0.0 {
                0usize
            } else if value.is_infinite() {
                10usize
            } else {
                value.trunc().min(10.0) as usize
            };
            " ".repeat(count)
        }
        ShapeJsonFormatSpace::String(value) => {
            let mut units = 0usize;
            value
                .chars()
                .take_while(|character| {
                    let next = units + character.len_utf16();
                    if next > 10 {
                        return false;
                    }
                    units = next;
                    return true;
                })
                .collect()
        }
    };
    return if gap.is_empty() { None } else { Some(gap) };
}

fn interpolation_method_argument(value: &ShapeCommandToken) -> Option<InterpolationMethod> {
    return match value.as_str()? {
        "linearRGB" => Some(InterpolationMethod::LinearRgb),
        "rgb" => Some(InterpolationMethod::Rgb),
        _ => None,
    };
}

fn is_finite_matrix(value: &Matrix) -> bool {
    return value.a.is_finite()
        && value.b.is_finite()
        && value.c.is_finite()
        && value.d.is_finite()
        && value.tx.is_finite()
        && value.ty.is_finite();
}

fn is_shape_command_appender(key: &str) -> bool {
    return matches!(
        key,
        "beginTextureFill"
            | "beginFill"
            | "beginGradientFill"
            | "cubicCurveTo"
            | "quadraticCurveTo"
            | "drawCircle"
            | "drawEllipse"
            | "drawPath"
            | "drawRectangle"
            | "drawRoundedRectangle"
            | "drawTriangles"
            | "endFill"
            | "lineTextureStyle"
            | "lineGradientStyle"
            | "lineStyle"
            | "lineTo"
            | "moveTo"
    );
}

fn is_valid_shape_command_arg(
    value: &ShapeCommandToken,
    r#type: ShapeCommandSchemaArgumentType,
) -> bool {
    return match r#type {
        ShapeCommandSchemaArgumentType::Boolean => value.as_boolean().is_some(),
        ShapeCommandSchemaArgumentType::MatrixOrNull => {
            value.is_null() || value.as_matrix().map(is_finite_matrix).unwrap_or(false)
        }
        ShapeCommandSchemaArgumentType::Number => {
            value.as_number().map(f64::is_finite).unwrap_or(false)
        }
        ShapeCommandSchemaArgumentType::Numbers => value
            .as_numbers()
            .map(|values| values.iter().all(|entry| entry.is_finite()))
            .unwrap_or(false),
        ShapeCommandSchemaArgumentType::NumbersOrNull => {
            value.is_null()
                || value
                    .as_numbers()
                    .map(|values| values.iter().all(|entry| entry.is_finite()))
                    .unwrap_or(false)
        }
        ShapeCommandSchemaArgumentType::String => value.as_str().is_some(),
        ShapeCommandSchemaArgumentType::Texture => value.as_texture().is_some(),
    };
}

fn is_valid_shape_command_args(key: &str, arguments: &[ShapeCommandToken]) -> bool {
    let Some(schema) = DEFAULT_SHAPE_COMMAND_SCHEMAS.entries.get(key) else {
        return false;
    };
    if arguments.len() < schema.required_argument_count || arguments.len() > schema.arguments.len()
    {
        return false;
    }
    for (index, argument) in arguments.iter().enumerate() {
        if !is_valid_shape_command_arg(argument, schema.arguments[index].r#type) {
            return false;
        }
    }
    return true;
}

fn joint_style_argument(value: &ShapeCommandToken) -> Option<JointStyle> {
    return match value.as_str()? {
        "bevel" => Some(JointStyle::Bevel),
        "miter" => Some(JointStyle::Miter),
        "round" => Some(JointStyle::Round),
        _ => None,
    };
}

fn json_number(value: f64) -> Value {
    return Value::Number(Number::from_f64(value).unwrap());
}

fn line_scale_mode_argument(value: &ShapeCommandToken) -> Option<LineScaleMode> {
    return match value.as_str()? {
        "horizontal" => Some(LineScaleMode::Horizontal),
        "none" => Some(LineScaleMode::None),
        "normal" => Some(LineScaleMode::Normal),
        "vertical" => Some(LineScaleMode::Vertical),
        _ => None,
    };
}

fn matrix_argument(arguments: &[ShapeCommandToken], index: usize) -> Option<&Matrix> {
    return arguments.get(index).and_then(ShapeCommandToken::as_matrix);
}

fn matrix_from_json(value: &Map<String, Value>) -> Option<Matrix> {
    let a = value.get("a")?.as_f64()? as f32;
    let b = value.get("b")?.as_f64()? as f32;
    let c = value.get("c")?.as_f64()? as f32;
    let d = value.get("d")?.as_f64()? as f32;
    let tx = value.get("tx")?.as_f64()? as f32;
    let ty = value.get("ty")?.as_f64()? as f32;
    let matrix = create_matrix(a, b, c, d, tx, ty);
    return is_finite_matrix(&matrix).then_some(matrix);
}

fn nullable_number_array_argument(arguments: &[ShapeCommandToken], index: usize) -> Option<&[f64]> {
    return match arguments.get(index) {
        None | Some(ShapeCommandToken::Null) => None,
        Some(value) => value.as_numbers().map(Vec::as_slice),
    };
}

fn number_argument(arguments: &[ShapeCommandToken], index: usize) -> Option<f64> {
    return arguments.get(index).and_then(ShapeCommandToken::as_number);
}

fn number_array_argument(arguments: &[ShapeCommandToken], index: usize) -> Option<&[f64]> {
    return arguments
        .get(index)
        .and_then(ShapeCommandToken::as_numbers)
        .map(Vec::as_slice);
}

fn optional_caps_style_argument(
    arguments: &[ShapeCommandToken],
    index: usize,
) -> Option<Option<CapsStyle>> {
    return match arguments.get(index) {
        None => Some(None),
        Some(value) => caps_style_argument(value).map(Some),
    };
}

fn optional_interpolation_method_argument(
    arguments: &[ShapeCommandToken],
    index: usize,
) -> Option<Option<InterpolationMethod>> {
    return match arguments.get(index) {
        None => Some(None),
        Some(value) => interpolation_method_argument(value).map(Some),
    };
}

fn optional_joint_style_argument(
    arguments: &[ShapeCommandToken],
    index: usize,
) -> Option<Option<JointStyle>> {
    return match arguments.get(index) {
        None => Some(None),
        Some(value) => joint_style_argument(value).map(Some),
    };
}

fn optional_line_scale_mode_argument(
    arguments: &[ShapeCommandToken],
    index: usize,
) -> Option<Option<LineScaleMode>> {
    return match arguments.get(index) {
        None => Some(None),
        Some(value) => line_scale_mode_argument(value).map(Some),
    };
}

fn optional_spread_method_argument(
    arguments: &[ShapeCommandToken],
    index: usize,
) -> Option<Option<SpreadMethod>> {
    return match arguments.get(index) {
        None => Some(None),
        Some(value) => spread_method_argument(value).map(Some),
    };
}

fn optional_triangle_culling_argument(
    arguments: &[ShapeCommandToken],
    index: usize,
) -> Option<Option<TriangleCulling>> {
    return match arguments.get(index) {
        None => Some(None),
        Some(value) => triangle_culling_argument(value).map(Some),
    };
}

/// Parses native versioned shape JSON, returning `None` for every malformed document (TS
/// `parseShapeJson`). Unresolved texture commands alone are dropped.
pub fn parse_shape_json(text: &str, options: Option<&ShapeJsonParseOptions>) -> Option<Ref<Shape>> {
    let root: Value = serde_json::from_str(text).ok()?;
    let root = root.as_object()?;
    if root.get("shapeFormat")?.as_f64()? != SHAPE_JSON_FORMAT as f64 {
        return None;
    }
    let raw_commands = root.get("commands")?.as_array()?;
    let shape = create_shape(None);
    for raw_entry in raw_commands {
        let entry = raw_entry.as_object()?;
        let key = entry.get("key")?.as_str()?;
        let raw_arguments = entry.get("args")?.as_array()?;
        if !is_shape_command_appender(key) {
            return None;
        }
        let mut arguments = Vec::new();
        let mut drop_command = false;
        for raw_argument in raw_arguments {
            match reconstruct_shape_command_arg(raw_argument, options) {
                Ok(Some(argument)) => arguments.push(argument),
                Ok(None) => {
                    drop_command = true;
                    break;
                }
                Err(()) => return None,
            }
        }
        if drop_command {
            continue;
        }
        if !is_valid_shape_command_args(key, &arguments) {
            return None;
        }
        if !append_reconstructed_shape_command(&shape, key, &arguments) {
            return None;
        }
    }
    return Some(shape);
}

fn reconstruct_shape_command_arg(
    value: &Value,
    options: Option<&ShapeJsonParseOptions>,
) -> Result<Option<ShapeCommandToken>, ()> {
    return match value {
        Value::Null => Ok(Some(ShapeCommandToken::Null)),
        Value::Bool(value) => Ok(Some(ShapeCommandToken::Boolean(*value))),
        Value::Number(value) => value
            .as_f64()
            .filter(|value| value.is_finite())
            .map(ShapeCommandToken::Number)
            .map(Some)
            .ok_or(()),
        Value::String(value) => Ok(Some(ShapeCommandToken::String(value.clone()))),
        Value::Array(values) => {
            let mut numbers = Vec::with_capacity(values.len());
            for value in values {
                let Some(value) = value.as_f64().filter(|value| value.is_finite()) else {
                    return Err(());
                };
                numbers.push(value);
            }
            Ok(Some(ShapeCommandToken::Numbers(ShapeCommandNumbers {
                values: numbers,
            })))
        }
        Value::Object(value) => {
            if let Some(reference) = value.get("texture").and_then(Value::as_object) {
                if let Some(index) = reference.get("index").and_then(Value::as_f64) {
                    let Some(resolve_texture) =
                        options.and_then(|value| value.resolve_texture.as_ref())
                    else {
                        return Ok(None);
                    };
                    return Ok(resolve_texture(&ShapeTextureReference { index })
                        .map(ShapeCommandToken::Texture));
                }
            }
            matrix_from_json(value)
                .map(ShapeCommandToken::Matrix)
                .map(Some)
                .ok_or(())
        }
    };
}

fn shape_command_arg_json(value: &ShapeCommandToken, texture_ordinal: &mut usize) -> Value {
    return match value {
        ShapeCommandToken::Boolean(value) => Value::Bool(*value),
        ShapeCommandToken::Matrix(value) => {
            let mut matrix = Map::new();
            matrix.insert("a".to_string(), json_number(value.a as f64));
            matrix.insert("b".to_string(), json_number(value.b as f64));
            matrix.insert("c".to_string(), json_number(value.c as f64));
            matrix.insert("d".to_string(), json_number(value.d as f64));
            matrix.insert("tx".to_string(), json_number(value.tx as f64));
            matrix.insert("ty".to_string(), json_number(value.ty as f64));
            Value::Object(matrix)
        }
        ShapeCommandToken::Null => Value::Null,
        ShapeCommandToken::Number(value) => json_number(*value),
        ShapeCommandToken::Numbers(value) => Value::Array(
            value
                .values
                .iter()
                .map(|entry| json_number(*entry))
                .collect(),
        ),
        ShapeCommandToken::String(value) => Value::String(value.clone()),
        ShapeCommandToken::Texture(_) => {
            let index = *texture_ordinal;
            *texture_ordinal += 1;
            let mut reference = Map::new();
            reference.insert("index".to_string(), json_number(index as f64));
            let mut texture = Map::new();
            texture.insert("texture".to_string(), Value::Object(reference));
            Value::Object(texture)
        }
    };
}

fn shape_command_key_string(value: &ShapeCommandToken) -> String {
    return match value {
        ShapeCommandToken::Boolean(value) => value.to_string(),
        ShapeCommandToken::Matrix(_) | ShapeCommandToken::Texture(_) => {
            "[object Object]".to_string()
        }
        ShapeCommandToken::Null => "null".to_string(),
        ShapeCommandToken::Number(value) => {
            if value.is_finite() {
                format_js_number(*value)
            } else {
                value.to_string()
            }
        }
        ShapeCommandToken::Numbers(value) => value
            .values
            .iter()
            .map(|entry| format_js_number(*entry))
            .collect::<Vec<_>>()
            .join(","),
        ShapeCommandToken::String(value) => value.clone(),
    };
}

fn spread_method_argument(value: &ShapeCommandToken) -> Option<SpreadMethod> {
    return match value.as_str()? {
        "pad" => Some(SpreadMethod::Pad),
        "reflect" => Some(SpreadMethod::Reflect),
        "repeat" => Some(SpreadMethod::Repeat),
        _ => None,
    };
}

fn stringify_shape_json(value: &Value, options: Option<&ShapeJsonFormatOptions>) -> String {
    let gap = indentation(options);
    let mut out = String::new();
    write_json_value(&mut out, value, gap.as_deref(), 0);
    return out;
}

fn throw_unrepresentable_shape_command(key: &str) -> ! {
    throw_type_error(&format!(
        "Shape command \"{}\" cannot be represented as shape JSON",
        key
    ));
}

fn triangle_culling_argument(value: &ShapeCommandToken) -> Option<TriangleCulling> {
    return match value.as_str()? {
        "negative" => Some(TriangleCulling::Negative),
        "none" => Some(TriangleCulling::None),
        "positive" => Some(TriangleCulling::Positive),
        _ => None,
    };
}

fn write_json_indent(out: &mut String, gap: &str, depth: usize) {
    for _ in 0..depth {
        out.push_str(gap);
    }
}

fn write_json_value(out: &mut String, value: &Value, gap: Option<&str>, depth: usize) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(value) => out.push_str(if *value { "true" } else { "false" }),
        Value::Number(value) => out.push_str(&format_js_number(value.as_f64().unwrap())),
        Value::String(value) => out.push_str(&serde_json::to_string(value).unwrap()),
        Value::Array(values) => {
            out.push('[');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                if let Some(gap) = gap {
                    out.push('\n');
                    write_json_indent(out, gap, depth + 1);
                }
                write_json_value(out, value, gap, depth + 1);
            }
            if !values.is_empty() {
                if let Some(gap) = gap {
                    out.push('\n');
                    write_json_indent(out, gap, depth);
                }
            }
            out.push(']');
        }
        Value::Object(values) => {
            out.push('{');
            for (index, (key, value)) in values.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                if let Some(gap) = gap {
                    out.push('\n');
                    write_json_indent(out, gap, depth + 1);
                }
                out.push_str(&serde_json::to_string(key).unwrap());
                out.push(':');
                if gap.is_some() {
                    out.push(' ');
                }
                write_json_value(out, value, gap, depth + 1);
            }
            if !values.is_empty() {
                if let Some(gap) = gap {
                    out.push('\n');
                    write_json_indent(out, gap, depth);
                }
            }
            out.push('}');
        }
    }
}
