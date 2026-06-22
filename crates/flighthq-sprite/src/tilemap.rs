//! Tilemap display object — a grid of integer tile indices rendered from a tileset.
//!
//! The tile grid is stored as a flat `Vec<i16>` (row-major, index = row * columns + col).
//! Negative values indicate empty tiles.

use flighthq_node::NodeId;
use flighthq_types::{Rectangle, TilemapData, Tileset, tilemap_kind};

use flighthq_displayobject::{DisplayObjectArena, create_display_object_generic};

/// Runtime behavior for a tilemap.
///
/// Mirrors TS `TilemapRuntime`, whose distinguishing behavior is its
/// `computeLocalBoundsRectangle` method. In the Rust arena model the runtime is
/// captured as the per-kind bounds-compute function the tilemap installs.
pub type TilemapRuntime = fn(&mut Rectangle, &DisplayObjectArena, NodeId);

// ---------------------------------------------------------------------------
// compute_tilemap_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Writes the local bounds of the tilemap into `out`.
///
/// Width = `columns × tileset.tile_width`, height = `rows × tileset.tile_height`.
/// If no tileset is set, width and height are zero.
pub fn compute_tilemap_local_bounds_rectangle(
    out: &mut Rectangle,
    arena: &DisplayObjectArena,
    source: NodeId,
) {
    out.x = 0.0;
    out.y = 0.0;
    let Some(data) = get_tilemap_data(arena, source) else {
        return;
    };
    if let Some(ref ts) = data.tileset {
        out.width = data.columns as f32 * ts.tile_width;
        out.height = data.rows as f32 * ts.tile_height;
    } else {
        out.width = 0.0;
        out.height = 0.0;
    }
}

// ---------------------------------------------------------------------------
// create_tilemap
// ---------------------------------------------------------------------------

/// Inserts a new tilemap node into `arena` and returns its id.
pub fn create_tilemap(arena: &mut DisplayObjectArena) -> NodeId {
    let data: Box<dyn std::any::Any + Send + Sync> = Box::new(TilemapData {
        tileset: None,
        columns: 0,
        rows: 0,
        tiles: Vec::new(),
        material_data: None,
    });
    create_display_object_generic(arena, tilemap_kind(), Some(data))
}

// ---------------------------------------------------------------------------
// create_tilemap_data
// ---------------------------------------------------------------------------

/// Builds a `TilemapData` payload for a `columns × rows` grid.
///
/// Mirrors TS `createTilemapData({ columns, rows })`: the `tiles` buffer is sized
/// to `columns * rows` and filled with `-1` (empty), and `tileset` is `None`.
pub fn create_tilemap_data(columns: u32, rows: u32) -> TilemapData {
    TilemapData {
        tileset: None,
        columns,
        rows,
        tiles: vec![-1i16; (columns * rows) as usize],
        material_data: None,
    }
}

// ---------------------------------------------------------------------------
// create_tilemap_runtime
// ---------------------------------------------------------------------------

/// Builds the runtime behavior for a tilemap.
///
/// Mirrors TS `createTilemapRuntime()`, which installs
/// `computeTilemapLocalBoundsRectangle` as the runtime's bounds-compute method.
pub fn create_tilemap_runtime() -> TilemapRuntime {
    compute_tilemap_local_bounds_rectangle
}

// ---------------------------------------------------------------------------
// fill_tilemap_tiles
// ---------------------------------------------------------------------------

/// Fills every tile in the tilemap with the given `id`.
pub fn fill_tilemap_tiles(arena: &mut DisplayObjectArena, target: NodeId, id: i16) {
    if let Some(data) = get_tilemap_data_mut(arena, target) {
        data.tiles.fill(id);
    }
}

// ---------------------------------------------------------------------------
// get_tilemap_columns
// ---------------------------------------------------------------------------

/// Returns the number of columns in the tilemap.
pub fn get_tilemap_columns(arena: &DisplayObjectArena, source: NodeId) -> u32 {
    get_tilemap_data(arena, source)
        .map(|d| d.columns)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// get_tilemap_rows
// ---------------------------------------------------------------------------

/// Returns the number of rows in the tilemap.
pub fn get_tilemap_rows(arena: &DisplayObjectArena, source: NodeId) -> u32 {
    get_tilemap_data(arena, source).map(|d| d.rows).unwrap_or(0)
}

// ---------------------------------------------------------------------------
// get_tilemap_runtime
// ---------------------------------------------------------------------------

/// Returns the runtime behavior for the tilemap at `source`.
///
/// Mirrors TS `getTilemapRuntime(source)`. The returned function is the
/// tilemap's bounds-compute method (the same one its factory installs via
/// [`create_tilemap_runtime`]).
pub fn get_tilemap_runtime(_arena: &DisplayObjectArena, _source: NodeId) -> TilemapRuntime {
    compute_tilemap_local_bounds_rectangle
}

// ---------------------------------------------------------------------------
// get_tilemap_tile
// ---------------------------------------------------------------------------

/// Returns the tile id at `(column, row)`, or -1 if out of range.
pub fn get_tilemap_tile(arena: &DisplayObjectArena, source: NodeId, column: u32, row: u32) -> i16 {
    let Some(data) = get_tilemap_data(arena, source) else {
        return -1;
    };
    if column >= data.columns || row >= data.rows {
        return -1;
    }
    *data
        .tiles
        .get((row * data.columns + column) as usize)
        .unwrap_or(&-1)
}

// ---------------------------------------------------------------------------
// get_tilemap_tileset
// ---------------------------------------------------------------------------

/// Returns the tileset assigned to this tilemap, if any.
pub fn get_tilemap_tileset(arena: &DisplayObjectArena, source: NodeId) -> Option<&Tileset> {
    get_tilemap_data(arena, source)?.tileset.as_ref()
}

// ---------------------------------------------------------------------------
// resize_tilemap
// ---------------------------------------------------------------------------

/// Resizes the tilemap to `columns × rows`, preserving existing tile data where
/// possible. New cells are initialized to -1 (empty).
pub fn resize_tilemap(arena: &mut DisplayObjectArena, target: NodeId, columns: u32, rows: u32) {
    let Some(data) = get_tilemap_data_mut(arena, target) else {
        return;
    };
    let mut new_tiles = vec![-1i16; (columns * rows) as usize];
    let copy_cols = columns.min(data.columns);
    let copy_rows = rows.min(data.rows);
    for r in 0..copy_rows {
        for c in 0..copy_cols {
            let src = (r * data.columns + c) as usize;
            let dst = (r * columns + c) as usize;
            new_tiles[dst] = data.tiles[src];
        }
    }
    data.columns = columns;
    data.rows = rows;
    data.tiles = new_tiles;
}

// ---------------------------------------------------------------------------
// set_tilemap_tile
// ---------------------------------------------------------------------------

/// Sets the tile id at `(column, row)`. No-op if the coordinates are out of range.
pub fn set_tilemap_tile(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    column: u32,
    row: u32,
    id: i16,
) {
    let Some(data) = get_tilemap_data_mut(arena, target) else {
        return;
    };
    if column >= data.columns || row >= data.rows {
        return;
    }
    let idx = (row * data.columns + column) as usize;
    if let Some(cell) = data.tiles.get_mut(idx) {
        *cell = id;
    }
}

// ---------------------------------------------------------------------------
// set_tilemap_tileset
// ---------------------------------------------------------------------------

/// Sets the tileset on this tilemap.
pub fn set_tilemap_tileset(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    tileset: Option<Tileset>,
) {
    if let Some(data) = get_tilemap_data_mut(arena, target) {
        data.tileset = tileset;
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_tilemap_data(arena: &DisplayObjectArena, source: NodeId) -> Option<&TilemapData> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<TilemapData>())
}

fn get_tilemap_data_mut(
    arena: &mut DisplayObjectArena,
    source: NodeId,
) -> Option<&mut TilemapData> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<TilemapData>())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::tilemap_kind;

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    fn make_tileset(tile_w: f32, tile_h: f32) -> Tileset {
        Tileset {
            tile_width: tile_w,
            tile_height: tile_h,
            ..Default::default()
        }
    }

    // compute_tilemap_local_bounds_rectangle

    #[test]
    fn compute_tilemap_local_bounds_rectangle_no_tileset_is_zero() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 3);
        let mut out = Rectangle {
            x: 1.0,
            y: 1.0,
            width: 1.0,
            height: 1.0,
        };
        compute_tilemap_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    #[test]
    fn compute_tilemap_local_bounds_rectangle_with_tileset() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 3);
        set_tilemap_tileset(&mut arena, id, Some(make_tileset(16.0, 16.0)));
        let mut out = Rectangle::default();
        compute_tilemap_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 64.0);
        assert_eq!(out.height, 48.0);
    }

    // create_tilemap

    #[test]
    fn create_tilemap_uses_tilemap_kind() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        assert_eq!(arena[id].kind, tilemap_kind());
    }

    // create_tilemap_data

    #[test]
    fn create_tilemap_data_fills_tiles_with_negative_one() {
        let data = create_tilemap_data(2, 3);
        assert_eq!(data.columns, 2);
        assert_eq!(data.rows, 3);
        assert_eq!(data.tiles.len(), 6);
        assert!(data.tiles.iter().all(|&t| t == -1));
        assert!(data.tileset.is_none());
    }

    #[test]
    fn create_tilemap_data_default_is_empty() {
        let data = create_tilemap_data(0, 0);
        assert_eq!(data.columns, 0);
        assert_eq!(data.rows, 0);
        assert!(data.tiles.is_empty());
    }

    // create_tilemap_runtime

    #[test]
    fn create_tilemap_runtime_uses_compute_local_bounds() {
        let runtime = create_tilemap_runtime();
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 3);
        set_tilemap_tileset(&mut arena, id, Some(make_tileset(16.0, 16.0)));
        let mut out = Rectangle::default();
        runtime(&mut out, &arena, id);
        assert_eq!(out.width, 64.0);
        assert_eq!(out.height, 48.0);
    }

    // get_tilemap_runtime

    #[test]
    fn get_tilemap_runtime_returns_compute_for_tilemap() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        let runtime = get_tilemap_runtime(&arena, id);
        resize_tilemap(&mut arena, id, 2, 2);
        set_tilemap_tileset(&mut arena, id, Some(make_tileset(8.0, 8.0)));
        let mut out = Rectangle::default();
        runtime(&mut out, &arena, id);
        assert_eq!(out.width, 16.0);
        assert_eq!(out.height, 16.0);
    }

    // fill_tilemap_tiles

    #[test]
    fn fill_tilemap_tiles_sets_all_cells() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 2, 2);
        fill_tilemap_tiles(&mut arena, id, 3);
        for r in 0..2 {
            for c in 0..2 {
                assert_eq!(get_tilemap_tile(&arena, id, c, r), 3);
            }
        }
    }

    // get_tilemap_tile / set_tilemap_tile

    #[test]
    fn tiles_default_to_negative_one() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 3, 3);
        assert_eq!(get_tilemap_tile(&arena, id, 1, 1), -1);
    }

    #[test]
    fn set_tilemap_tile_roundtrip() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        set_tilemap_tile(&mut arena, id, 2, 3, 5);
        assert_eq!(get_tilemap_tile(&arena, id, 2, 3), 5);
    }

    #[test]
    fn get_tilemap_tile_out_of_range_returns_neg_one() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 2, 2);
        assert_eq!(get_tilemap_tile(&arena, id, 5, 5), -1);
    }

    // resize_tilemap

    #[test]
    fn resize_tilemap_preserves_existing_data() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 2, 2);
        set_tilemap_tile(&mut arena, id, 0, 0, 7);
        resize_tilemap(&mut arena, id, 4, 4);
        assert_eq!(get_tilemap_tile(&arena, id, 0, 0), 7);
    }

    #[test]
    fn resize_tilemap_new_cells_are_empty() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 2, 2);
        resize_tilemap(&mut arena, id, 4, 4);
        assert_eq!(get_tilemap_tile(&arena, id, 3, 3), -1);
    }
}
