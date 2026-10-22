use crate::three_ds_parse::{read_chunk_end, read_chunk_length, read_null_terminated_string};
use crate::three_ds_read::{read_three_ds_f32, read_three_ds_u16};
use crate::three_ds_schema::*;
use crate::three_ds_types::{ThreeDsChunkHandler, ThreeDsPivotEntry};
use flight_entity::{Ref, Uint8Array};
use std::sync::{Arc, LazyLock, RwLock};

pub static THREE_DS_KEYFRAME_HANDLER: LazyLock<Ref<ThreeDsChunkHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ThreeDsChunkHandler {
        chunk_ids: vec![THREE_DS_KEYFRAME_OBJECT_NODE],
        build: None,
        collect: Arc::new(|state, view, offset, _end, _name| {
            for pivot in {
                let mut output = Vec::new();
                collect_three_ds_pivots(&mut output, view, offset);
                output
            } {
                set_pivot(&mut state.pivots, pivot);
            }
        }),
    }))
});
pub static THREE_DS_KEYFRAME_FAMILY: LazyLock<Vec<Ref<ThreeDsChunkHandler>>> =
    LazyLock::new(|| vec![THREE_DS_KEYFRAME_HANDLER.clone()]);

fn collect_three_ds_node_pivots(
    view: &Uint8Array,
    offset: usize,
    end: usize,
    pivots: &mut Vec<ThreeDsPivotEntry>,
) {
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            return;
        }
        let chunk_end = chunk_end as usize;
        if chunk_id == THREE_DS_KEYFRAME_OBJECT_NODE {
            collect_three_ds_object_node_pivot(view, cursor, chunk_end, pivots);
        }
        cursor = chunk_end;
    }
}

fn collect_three_ds_object_node_pivot(
    view: &Uint8Array,
    offset: usize,
    end: usize,
    pivots: &mut Vec<ThreeDsPivotEntry>,
) {
    let mut name = None;
    let mut pivot = None;
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            break;
        }
        let chunk_end = chunk_end as usize;
        let data_start = cursor + THREE_DS_CHUNK_HEADER_BYTES;
        if chunk_id == THREE_DS_KEYFRAME_NODE_HEADER {
            name = Some(read_null_terminated_string(view, data_start, chunk_end));
        } else if chunk_id == THREE_DS_KEYFRAME_PIVOT && data_start + 12 <= chunk_end {
            pivot = Some([
                read_three_ds_f32(view, data_start),
                read_three_ds_f32(view, data_start + 4),
                read_three_ds_f32(view, data_start + 8),
            ]);
        }
        cursor = chunk_end;
    }
    if let (Some(name), Some(pivot)) = (name, pivot) {
        if !name.is_empty() && pivot.iter().any(|value| *value != 0.0) {
            set_pivot(
                pivots,
                ThreeDsPivotEntry {
                    key: name,
                    value: pivot,
                },
            );
        }
    }
}

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first ordered pivot output, cleared then filled
pub fn collect_three_ds_pivots(out: &mut Vec<ThreeDsPivotEntry>, view: &Uint8Array, offset: usize) {
    out.clear();
    let end = (offset + read_chunk_length(view, offset) as usize).min(view.len());
    let root_id = read_three_ds_u16(view, offset);
    if root_id == THREE_DS_KEYFRAME_OBJECT_NODE {
        collect_three_ds_object_node_pivot(view, offset, end, out);
        return;
    }
    if root_id == THREE_DS_KEYFRAME {
        collect_three_ds_node_pivots(view, offset, end, out);
        return;
    }
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            break;
        }
        let chunk_end = chunk_end as usize;
        if chunk_id == THREE_DS_MAIN {
            for pivot in {
                let mut output = Vec::new();
                collect_three_ds_pivots(&mut output, view, cursor);
                output
            } {
                set_pivot(out, pivot);
            }
        } else if chunk_id == THREE_DS_KEYFRAME {
            collect_three_ds_node_pivots(view, cursor, chunk_end, out);
        }
        cursor = chunk_end;
    }
    return;
}

fn set_pivot(pivots: &mut Vec<ThreeDsPivotEntry>, entry: ThreeDsPivotEntry) {
    if let Some(previous) = pivots.iter_mut().find(|previous| previous.key == entry.key) {
        previous.value = entry.value;
    } else {
        pivots.push(entry);
    }
}
