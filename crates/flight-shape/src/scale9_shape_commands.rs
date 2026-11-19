//! flight-compiler: target-native

//! Nine-slice command-stream rewriting (TS `scale9ShapeCommands.ts`).

use crate::types::*;

fn map_number(out: &mut [ShapeCommandToken], index: usize, mapper: &Scale9Mapper) {
    if let Some(value) = out.get_mut(index).and_then(|token| token.as_number()) {
        out[index] = ShapeCommandToken::Number((mapper)(value));
    }
}

/// Rewrites a command stream through a nine-slice mapper (TS `mapScale9ShapeCommands`); `out` may
/// alias `source`.
pub fn map_scale9_shape_commands(
    out: &mut Vec<ShapeCommandToken>,
    source: &[ShapeCommandToken],
    mapper: &ShapeScale9Mapper,
) {
    if !std::ptr::eq(out.as_slice(), source) {
        out.clear();
        out.extend_from_slice(source);
    }
    let mut index = 0;
    while index < out.len() {
        let key = out[index].as_str().unwrap_or("").to_string();
        let argument_count = out[index + 1].as_number().unwrap_or(0.0) as usize;
        match key.as_str() {
            "moveTo" | "lineTo" => {
                map_number(out, index + 2, &mapper.map_x);
                map_number(out, index + 3, &mapper.map_y);
            }
            "quadraticCurveTo" => {
                map_number(out, index + 2, &mapper.map_x);
                map_number(out, index + 3, &mapper.map_y);
                map_number(out, index + 4, &mapper.map_x);
                map_number(out, index + 5, &mapper.map_y);
            }
            "cubicCurveTo" => {
                map_number(out, index + 2, &mapper.map_x);
                map_number(out, index + 3, &mapper.map_y);
                map_number(out, index + 4, &mapper.map_x);
                map_number(out, index + 5, &mapper.map_y);
                map_number(out, index + 6, &mapper.map_x);
                map_number(out, index + 7, &mapper.map_y);
            }
            "drawRectangle" | "drawRoundedRectangle" => {
                let x = number_at(out, index + 2);
                let y = number_at(out, index + 3);
                let width = number_at(out, index + 4);
                let height = number_at(out, index + 5);
                let mapped_x = (mapper.map_x)(x);
                let mapped_y = (mapper.map_y)(y);
                out[index + 2] = ShapeCommandToken::Number(mapped_x);
                out[index + 3] = ShapeCommandToken::Number(mapped_y);
                out[index + 4] = ShapeCommandToken::Number((mapper.map_x)(x + width) - mapped_x);
                out[index + 5] = ShapeCommandToken::Number((mapper.map_y)(y + height) - mapped_y);
            }
            "drawEllipse" => {
                let center_x = number_at(out, index + 2);
                let center_y = number_at(out, index + 3);
                let radius_x = number_at(out, index + 4);
                let radius_y = number_at(out, index + 5);
                let left = (mapper.map_x)(center_x - radius_x);
                let right = (mapper.map_x)(center_x + radius_x);
                let top = (mapper.map_y)(center_y - radius_y);
                let bottom = (mapper.map_y)(center_y + radius_y);
                out[index + 2] = ShapeCommandToken::Number((left + right) / 2.0);
                out[index + 3] = ShapeCommandToken::Number((top + bottom) / 2.0);
                out[index + 4] = ShapeCommandToken::Number((right - left).abs() / 2.0);
                out[index + 5] = ShapeCommandToken::Number((bottom - top).abs() / 2.0);
            }
            "drawCircle" => {
                map_number(out, index + 2, &mapper.map_x);
                map_number(out, index + 3, &mapper.map_y);
            }
            "drawPath" => {
                let verbs = out[index + 2]
                    .as_numbers()
                    .map(|values| values.clone())
                    .unwrap_or_default();
                let data = out[index + 3]
                    .as_numbers()
                    .map(|values| values.clone())
                    .unwrap_or_default();
                let remapped = remap_path_data(&data, &verbs, mapper);
                out[index + 3] =
                    ShapeCommandToken::Numbers(ShapeCommandNumbers { values: remapped });
            }
            _ => {}
        }
        index += argument_count + 2;
        let _ = &key;
    }
}

fn number_at(commands: &[ShapeCommandToken], index: usize) -> f64 {
    return commands
        .get(index)
        .and_then(|token| token.as_number())
        .unwrap_or(f64::NAN);
}

fn remap_path_data(source: &[f64], verbs: &[f64], mapper: &ShapeScale9Mapper) -> Vec<f64> {
    let mut out = source.to_vec();
    let mut data_index = 0;
    for verb in verbs {
        match *verb as u8 {
            1 | 2 => {
                out[data_index] = (mapper.map_x)(out[data_index]);
                out[data_index + 1] = (mapper.map_y)(out[data_index + 1]);
                data_index += 2;
            }
            3 => {
                out[data_index] = (mapper.map_x)(out[data_index]);
                out[data_index + 1] = (mapper.map_y)(out[data_index + 1]);
                out[data_index + 2] = (mapper.map_x)(out[data_index + 2]);
                out[data_index + 3] = (mapper.map_y)(out[data_index + 3]);
                data_index += 4;
            }
            4 | 5 => {
                out[data_index + 2] = (mapper.map_x)(out[data_index + 2]);
                out[data_index + 3] = (mapper.map_y)(out[data_index + 3]);
                data_index += 4;
            }
            6 => {
                out[data_index] = (mapper.map_x)(out[data_index]);
                out[data_index + 1] = (mapper.map_y)(out[data_index + 1]);
                out[data_index + 2] = (mapper.map_x)(out[data_index + 2]);
                out[data_index + 3] = (mapper.map_y)(out[data_index + 3]);
                out[data_index + 4] = (mapper.map_x)(out[data_index + 4]);
                out[data_index + 5] = (mapper.map_y)(out[data_index + 5]);
                data_index += 6;
            }
            _ => {}
        }
    }
    return out;
}
