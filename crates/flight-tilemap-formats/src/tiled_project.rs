//! Projects one Tiled tile layer into runtime `TilemapData`, split by tileset
//! (TS `tiledProject.ts`).

use std::collections::{HashMap, HashSet};

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_tilemap::create_tilemap_data;

use crate::tiled_gid::{decode_tiled_gid, get_tiled_tileset_ref_for_gid};
use crate::types::*;

pub fn build_tilemap_layers_from_tiled(
    map: &TiledMap,
    layer_index: usize,
    resolve_tileset: &dyn Fn(&TiledTilesetRef) -> Option<TiledTilesetLayout>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Vec<flight_tilemap::TilemapData>> {
    let layer = map.layers.get(layer_index)?;
    let (data, width, height) = match layer {
        TiledLayer::TileLayer(d) => (&d.data, d.width, d.height),
        _ => return None,
    };

    let cell_count = (width * height) as usize;

    struct TilesetGroup {
        first_gid: i32,
        layout: TiledTilesetLayout,
        tiles: Vec<i16>,
    }

    let mut groups: Vec<TilesetGroup> = Vec::new();
    let mut by_first_gid: HashMap<i32, Option<usize>> = HashMap::new();
    let mut any_resolved = false;
    let mut cells_without_tileset: usize = 0;
    let mut cells_left_empty: usize = 0;
    let mut unresolved_tilesets: HashSet<i32> = HashSet::new();

    for i in 0..cell_count {
        let decoded = decode_tiled_gid(data[i]);
        if decoded.tile_id == 0 {
            continue;
        }
        let tileset_ref = get_tiled_tileset_ref_for_gid(map, decoded.tile_id);
        let Some(tileset_ref) = tileset_ref else {
            cells_without_tileset += 1;
            continue;
        };

        let group_entry = by_first_gid.get(&tileset_ref.first_gid).copied();
        let group_idx = match group_entry {
            Some(Some(idx)) => Some(idx),
            Some(None) => None,
            None => {
                let layout = resolve_tileset(tileset_ref);
                if let Some(layout) = layout {
                    any_resolved = true;
                    let idx = groups.len();
                    groups.push(TilesetGroup {
                        first_gid: tileset_ref.first_gid,
                        layout,
                        tiles: vec![-1i16; cell_count],
                    });
                    by_first_gid.insert(tileset_ref.first_gid, Some(idx));
                    Some(idx)
                } else {
                    by_first_gid.insert(tileset_ref.first_gid, None);
                    None
                }
            }
        };

        if let Some(idx) = group_idx {
            groups[idx].tiles[i] = (decoded.tile_id as i32 - groups[idx].first_gid) as i16;
        } else {
            cells_left_empty += 1;
            unresolved_tilesets.insert(tileset_ref.first_gid);
        }
    }

    if cells_without_tileset > 0 {
        report_import_diagnostic(
            diagnostics.as_mut().map(|v| &mut **v),
            ImportDiagnosticSeverity::Drop,
            "tiled.tile-outside-every-tileset",
            "buildTilemapLayersFromTiled",
            detail_map(&[
                (
                    "cells",
                    ImportDiagnosticDetailValue::Number(cells_without_tileset as f32),
                ),
                (
                    "layerIndex",
                    ImportDiagnosticDetailValue::Number(layer_index as f32),
                ),
            ]),
        );
    }
    if cells_left_empty > 0 {
        report_import_diagnostic(
            diagnostics.as_mut().map(|v| &mut **v),
            ImportDiagnosticSeverity::Drop,
            "tiled.tileset-unresolved",
            "buildTilemapLayersFromTiled",
            detail_map(&[
                (
                    "cells",
                    ImportDiagnosticDetailValue::Number(cells_left_empty as f32),
                ),
                (
                    "layerIndex",
                    ImportDiagnosticDetailValue::Number(layer_index as f32),
                ),
                (
                    "tilesets",
                    ImportDiagnosticDetailValue::Number(unresolved_tilesets.len() as f32),
                ),
            ]),
        );
    }

    if !any_resolved {
        return None;
    }

    return Some(
        groups
            .into_iter()
            .map(|group| {
                let mut data = create_tilemap_data();
                data.atlas = group.layout.atlas;
                data.columns = width;
                data.rows = height;
                data.tile_height = group.layout.tile_height;
                data.tile_width = group.layout.tile_width;
                data.tiles = group.tiles;
                data
            })
            .collect(),
    );
}
