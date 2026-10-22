//! Tile-based 2D map: grid of cell indices over a shared texture atlas (TS `tilemap.ts`).

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::{Rectangle, Vector2};
use flight_materials::TintMaterialData;
use flight_node::Node;
use flight_scene2d::contract::{
    Node2DRuntimeMethods, create_node2d, create_node2d_runtime, get_node2d_runtime,
};
use flight_signals::emit_signal;

use crate::types::*;

/// Allocates a tilemap (TS `createTilemap`).
// flight-lint: allow(conform-params) D23 B: authored options removed; kind assigns fields after create
pub fn create_tilemap() -> Ref<Tilemap> {
    let mut out: Tilemap = create_node2d(
        TILEMAP_KIND.to_string(),
        Some(create_tilemap_runtime),
    );
    out.data = create_tilemap_data();
    out.signals = None;
    return flight_scene2d::publish_node2d(out);
}

/// Allocates tilemap kind data (TS `createTilemapData`).
// flight-lint: allow(conform-params) D23 B: authored options removed
pub fn create_tilemap_data() -> TilemapData {
    let mut out: TilemapData = allocate_entity();
    initialize_tilemap_data(&mut out);
    return out;
}

/// The tilemap's 2D runtime tier with the bounds computation installed (TS `createTilemapRuntime`).
pub fn create_tilemap_runtime() -> TilemapRuntime {
    let methods = Node2DRuntimeMethods {
        compute_local_bounds_rectangle: Some(Arc::new(compute_tilemap_local_bounds_rectangle)),
        is_local_bounds_rectangle_valid: None,
    };
    return create_node2d_runtime(Some(&methods));
}

/// Creates the tilemap signals group (TS `createTilemapSignals`).
pub fn create_tilemap_signals() -> TilemapSignals {
    let mut out: TilemapSignals = allocate_entity();
    initialize_tilemap_signals(&mut out);
    return out;
}

/// Tilemap initializer (TS `initializeTilemap`).
// flight-lint: allow(conform-extra) D23 I: public initialize seam extracted from create_tilemap
pub fn initialize_tilemap(out: &mut Tilemap) {
    out.data = create_tilemap_data();
    out.signals = None;
}

/// Data initializer (TS `initializeTilemapData`).
// flight-lint: allow(conform-params) D23 B: authored options removed; kind assigns fields after create
pub fn initialize_tilemap_data(out: &mut TilemapData) {
    out.atlas = None;
    out.columns = 0;
    out.material_data = None;
    out.rows = 0;
    out.tile_height = 0.0;
    out.tile_width = 0.0;
    out.tiles = Vec::new();
}

/// Signals initializer (TS `initializeTilemapSignals`).
pub fn initialize_tilemap_signals(out: &mut TilemapSignals) {
    out.on_cleared = flight_signals::create_signal();
    out.on_tile_changed = flight_signals::create_signal();
    out.on_tiles_changed = flight_signals::create_signal();
}

/// Fills all cells with -1 (empty). Fires `onCleared` when signals are enabled (TS `clearTilemap`).
pub fn clear_tilemap(tilemap: &mut Tilemap) {
    tilemap.data.tiles.fill(-1);
    if let Some(signals) = &tilemap.signals {
        emit_signal(&signals.on_cleared, &());
    }
}

/// Deep-copies `source` into a new `Tilemap` with an independent tiles buffer and a fresh runtime
/// (TS `cloneTilemap`). The atlas is shared; `materialData` is a shallow copy of the array.
pub fn clone_tilemap(source: &Tilemap) -> Ref<Tilemap> {
    let src = &source.data;
    let out = create_tilemap();
    {
        let mut g = out.write().unwrap();
        g.data.atlas = src.atlas.clone();
        g.data.columns = src.columns;
        g.data.material_data = src.material_data.clone();
        g.data.rows = src.rows;
        g.data.tile_height = src.tile_height;
        g.data.tile_width = src.tile_width;
        g.data.tiles = src.tiles.clone();
    }
    return out;
}

/// Writes the tilemap's local bounds into `out` (TS `computeTilemapLocalBoundsRectangle`).
pub fn compute_tilemap_local_bounds_rectangle(out: &mut Rectangle, source: &dyn Node) {
    let tilemap = source.as_any().downcast_ref::<Tilemap>().unwrap();
    let data = &tilemap.data;
    out.x = 0.0;
    out.y = 0.0;
    if data.atlas.is_some() {
        out.width = data.columns as f32 * data.tile_width;
        out.height = data.rows as f32 * data.tile_height;
    } else {
        out.width = 0.0;
        out.height = 0.0;
    }
}

/// Opt-in signals for a `Tilemap` node (TS `enableTilemapSignals`). Returns the signal group,
/// creating it on the first call.
pub fn enable_tilemap_signals(target: &mut Tilemap) -> &TilemapSignals {
    if target.signals.is_none() {
        target.signals = Some(create_tilemap_signals());
    }
    return target.signals.as_ref().unwrap();
}

/// Fills all cells with the given id (TS `fillTilemapTiles`).
pub fn fill_tilemap_tiles(tilemap: &mut Tilemap, id: i16) {
    tilemap.data.tiles.fill(id);
}

/// Returns the column index for a local-space x coordinate, or -1 (TS `getTilemapColumnAtX`).
pub fn get_tilemap_column_at_x(source: &Tilemap, x: f32) -> i32 {
    let data = &source.data;
    if data.atlas.is_none() || data.tile_width <= 0.0 {
        return -1;
    }
    let col = (x / data.tile_width).floor() as i32;
    if col < 0 || col >= data.columns {
        return -1;
    }
    return col;
}

/// Writes the column and row for a local-space point into `out` (TS `getTilemapColumnRowAtPoint`).
/// Returns false when the point is outside the tilemap bounds.
pub fn get_tilemap_column_row_at_point(
    out: &mut Vector2,
    source: &Tilemap,
    x: f32,
    y: f32,
) -> bool {
    let col = get_tilemap_column_at_x(source, x);
    let row = get_tilemap_row_at_y(source, y);
    if col < 0 || row < 0 {
        return false;
    }
    out.x = col as f32;
    out.y = row as f32;
    return true;
}

/// Returns the row index for a local-space y coordinate, or -1 (TS `getTilemapRowAtY`).
pub fn get_tilemap_row_at_y(source: &Tilemap, y: f32) -> i32 {
    let data = &source.data;
    if data.atlas.is_none() || data.tile_height <= 0.0 {
        return -1;
    }
    let row = (y / data.tile_height).floor() as i32;
    if row < 0 || row >= data.rows {
        return -1;
    }
    return row;
}

/// Returns the tilemap's runtime tier (TS `getTilemapRuntime`).
pub fn get_tilemap_runtime(source: &Tilemap) -> &TilemapRuntime {
    return get_node2d_runtime(source);
}

/// Returns the signals group, or `None` if not yet enabled (TS `getTilemapSignals`).
pub fn get_tilemap_signals(source: &Tilemap) -> Option<&TilemapSignals> {
    return source.signals.as_ref();
}

/// Returns the tile at `(column, row)`, or -1 for out-of-bounds (TS `getTilemapTile`).
pub fn get_tilemap_tile(tilemap: &Tilemap, column: i32, row: i32) -> i16 {
    let data = &tilemap.data;
    if column < 0 || column >= data.columns || row < 0 || row >= data.rows {
        return -1;
    }
    return data.tiles[(row * data.columns + column) as usize];
}

/// Returns the cell value at a local-space point (TS `getTilemapTileAtPoint`).
pub fn get_tilemap_tile_at_point(source: &Tilemap, point: &Vector2) -> i16 {
    return get_tilemap_tile_at_point_xy(source, point.x, point.y);
}

/// XY variant of `get_tilemap_tile_at_point` (TS `getTilemapTileAtPointXY`).
pub fn get_tilemap_tile_at_point_xy(source: &Tilemap, x: f32, y: f32) -> i16 {
    let col = get_tilemap_column_at_x(source, x);
    let row = get_tilemap_row_at_y(source, y);
    if col < 0 || row < 0 {
        return -1;
    }
    return get_tilemap_tile(source, col, row);
}

/// Writes the local-space rectangle for the cell at `(column, row)` into `out`
/// (TS `getTilemapTileRect`). Returns false when the atlas is null or coordinates are out of bounds.
pub fn get_tilemap_tile_rect(
    out: &mut Rectangle,
    source: &Tilemap,
    column: i32,
    row: i32,
) -> bool {
    let data = &source.data;
    if data.atlas.is_none()
        || column < 0
        || column >= data.columns
        || row < 0
        || row >= data.rows
    {
        return false;
    }
    out.x = column as f32 * data.tile_width;
    out.y = row as f32 * data.tile_height;
    out.width = data.tile_width;
    out.height = data.tile_height;
    return true;
}

/// Resizes the tilemap, copying surviving cells and filling new ones with -1
/// (TS `resizeTilemap`).
pub fn resize_tilemap(tilemap: &mut Tilemap, columns: i32, rows: i32) {
    let data = &tilemap.data;
    let mut new_tiles = vec![-1i16; (columns * rows) as usize];
    let copy_columns = columns.min(data.columns);
    let copy_rows = rows.min(data.rows);
    for r in 0..copy_rows {
        for c in 0..copy_columns {
            new_tiles[(r * columns + c) as usize] = data.tiles[(r * data.columns + c) as usize];
        }
    }
    tilemap.data.columns = columns;
    tilemap.data.rows = rows;
    tilemap.data.tiles = new_tiles;
}

/// Sets the tile at `(column, row)`. Fires `onTileChanged` when signals are enabled
/// (TS `setTilemapTile`).
pub fn set_tilemap_tile(tilemap: &mut Tilemap, column: i32, row: i32, id: i16) {
    let data = &mut tilemap.data;
    if column < 0 || column >= data.columns || row < 0 || row >= data.rows {
        return;
    }
    data.tiles[(row * data.columns + column) as usize] = id;
    if let Some(signals) = &tilemap.signals {
        emit_signal(&signals.on_tile_changed, &(column, row, id));
    }
}

/// Sets one tile's compact multiply-only tint (TS `setTilemapTileTint`). The material-data array
/// is allocated on first use. Invalid coordinates are ignored.
pub fn set_tilemap_tile_tint(tilemap: &mut Tilemap, column: i32, row: i32, rgba: u32) {
    let data = &mut tilemap.data;
    if column < 0 || column >= data.columns || row < 0 || row >= data.rows {
        return;
    }
    let size = (data.columns * data.rows) as usize;
    if data.material_data.is_none() {
        data.material_data = Some(vec![None; size]);
    }
    let mut tint: TintMaterialData = allocate_entity();
    tint.tint = rgba;
    let material_data = data.material_data.as_mut().unwrap();
    material_data[(row * data.columns + column) as usize] =
        Some(Arc::new(RwLock::new(tint)));
}

/// Blits a sub-grid of tile ids into the tilemap (TS `setTilemapTiles`). Clips writes to the
/// tilemap bounds.
pub fn set_tilemap_tiles(
    tilemap: &mut Tilemap,
    ids: &[i16],
    offset_column: i32,
    offset_row: i32,
    width: i32,
    height: i32,
) {
    let data = &mut tilemap.data;
    for r in 0..height {
        let target_row = offset_row + r;
        if target_row < 0 || target_row >= data.rows {
            continue;
        }
        for c in 0..width {
            let target_col = offset_column + c;
            if target_col < 0 || target_col >= data.columns {
                continue;
            }
            data.tiles[(target_row * data.columns + target_col) as usize] =
                ids[(r * width + c) as usize];
        }
    }
    if let Some(signals) = &tilemap.signals {
        emit_signal(
            &signals.on_tiles_changed,
            &(offset_column, offset_row, width, height),
        );
    }
}
