use crate::three_ds_parse::{parse_color_chunk, read_chunk_end, read_null_terminated_string};
use crate::three_ds_read::{read_three_ds_f32, read_three_ds_u16};
use crate::three_ds_schema::*;
use crate::three_ds_types::{ThreeDsChunkHandler, ThreeDsMaterialEntry};
use flight_entity::{Ref, Uint8Array};
use std::sync::{Arc, LazyLock, RwLock};

pub static THREE_DS_MATERIAL_HANDLER: LazyLock<Ref<ThreeDsChunkHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ThreeDsChunkHandler {
        chunk_ids: vec![THREE_DS_MATERIAL],
        build: None,
        collect: Arc::new(|state, view, offset, end, _name| {
            let material = parse_three_ds_material(view, offset, end);
            if !material.name.is_empty() {
                if let Some(entry) = state
                    .materials
                    .iter_mut()
                    .find(|entry| entry.key == material.name)
                {
                    entry.value = material;
                } else {
                    state.materials.push(ThreeDsMaterialEntry {
                        key: material.name.clone(),
                        value: material,
                    });
                }
            }
        }),
    }))
});
pub static THREE_DS_MATERIAL_FAMILY: LazyLock<Vec<Ref<ThreeDsChunkHandler>>> =
    LazyLock::new(|| vec![THREE_DS_MATERIAL_HANDLER.clone()]);

fn parse_percentage_chunk(view: &Uint8Array, offset: usize, end: usize) -> Option<f32> {
    let mut cursor = offset;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            break;
        }
        let chunk_end = chunk_end as usize;
        let data_start = cursor + THREE_DS_CHUNK_HEADER_BYTES;
        if chunk_id == THREE_DS_PERCENT_INT && data_start + 2 <= chunk_end {
            return Some((read_three_ds_u16(view, data_start) as f32 / 100.0).clamp(0.0, 1.0));
        }
        if chunk_id == THREE_DS_PERCENT_FLOAT && data_start + 4 <= chunk_end {
            return Some(read_three_ds_f32(view, data_start).clamp(0.0, 1.0));
        }
        cursor = chunk_end;
    }
    return None;
}

fn parse_texture_filename(view: &Uint8Array, offset: usize, end: usize) -> Option<String> {
    let mut cursor = offset;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            break;
        }
        let chunk_end = chunk_end as usize;
        if chunk_id == THREE_DS_MATERIAL_TEXTURE_FILENAME {
            let name =
                read_null_terminated_string(view, cursor + THREE_DS_CHUNK_HEADER_BYTES, chunk_end);
            return if name.is_empty() { None } else { Some(name) };
        }
        cursor = chunk_end;
    }
    return None;
}

pub fn parse_three_ds_material(view: &Uint8Array, offset: usize, end: usize) -> ThreeDsMaterial {
    let mut material = ThreeDsMaterial {
        ambient: [0.0; 3],
        bump_filename: None,
        diffuse: [1.0; 3],
        name: String::new(),
        opacity: 1.0,
        opacity_filename: None,
        shininess: None,
        specular: [1.0; 3],
        texture_filename: None,
    };
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            break;
        }
        let chunk_end = chunk_end as usize;
        let data_start = cursor + THREE_DS_CHUNK_HEADER_BYTES;
        match chunk_id {
            THREE_DS_MATERIAL_NAME => {
                material.name = read_null_terminated_string(view, data_start, chunk_end)
            }
            THREE_DS_MATERIAL_AMBIENT => {
                material.ambient =
                    parse_color_chunk(view, data_start, chunk_end).unwrap_or(material.ambient)
            }
            THREE_DS_MATERIAL_DIFFUSE => {
                material.diffuse =
                    parse_color_chunk(view, data_start, chunk_end).unwrap_or(material.diffuse)
            }
            THREE_DS_MATERIAL_SPECULAR => {
                material.specular =
                    parse_color_chunk(view, data_start, chunk_end).unwrap_or(material.specular)
            }
            THREE_DS_MATERIAL_SHININESS => {
                if let Some(fraction) = parse_percentage_chunk(view, data_start, chunk_end) {
                    material.shininess = Some(fraction * 128.0);
                }
            }
            THREE_DS_MATERIAL_TRANSPARENCY => {
                if let Some(fraction) = parse_percentage_chunk(view, data_start, chunk_end) {
                    material.opacity = 1.0 - fraction;
                }
            }
            THREE_DS_MATERIAL_TEXTURE_MAP => {
                material.texture_filename = parse_texture_filename(view, data_start, chunk_end)
            }
            THREE_DS_MATERIAL_BUMP_MAP => {
                material.bump_filename = parse_texture_filename(view, data_start, chunk_end)
            }
            THREE_DS_MATERIAL_OPACITY_MAP => {
                material.opacity_filename = parse_texture_filename(view, data_start, chunk_end)
            }
            _ => {}
        }
        cursor = chunk_end;
    }
    return material;
}
