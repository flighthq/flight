//! Tilemap display object — a grid of integer tile indices rendered from a tileset.
//!
//! The tile grid is stored as a flat `Vec<i16>` (row-major, index = row * columns + col).
//! Negative values indicate empty tiles.

use flighthq_node::NodeId;
use flighthq_signals::emit_signal;
use flighthq_types::{
    Rectangle, TilemapData, TilemapSignals, TilemapTileChanged, TilemapTilesChanged, Tileset,
    Vector2Like, tilemap_kind,
};

use flighthq_displayobject::{DisplayObjectArena, create_display_object_generic};

/// Runtime behavior for a tilemap.
///
/// Mirrors TS `TilemapRuntime`, whose distinguishing behavior is its
/// `computeLocalBoundsRectangle` method. In the Rust arena model the runtime is
/// captured as the per-kind bounds-compute function the tilemap installs.
pub type TilemapRuntime = fn(&mut Rectangle, &DisplayObjectArena, NodeId);

// ---------------------------------------------------------------------------
// TilemapMeta — runtime-side tilemap state stored alongside the node
// ---------------------------------------------------------------------------

/// Extended state for a tilemap node (data payload + lazily-armed signal set).
///
/// The signal set is the Rust home for the TS `tilemapSignalsSlot` symbol slot —
/// `None` until [`enable_tilemap_signals`] arms it.
#[derive(Debug, Default)]
pub struct TilemapMeta {
    pub data: TilemapData,
    pub signals: Option<Box<TilemapSignals>>,
}

// ---------------------------------------------------------------------------
// clear_tilemap
// ---------------------------------------------------------------------------

/// Fills all cells with -1 (empty). Fires `on_cleared` when signals are enabled.
pub fn clear_tilemap(arena: &mut DisplayObjectArena, target: NodeId) {
    let Some(meta) = get_tilemap_meta_mut(arena, target) else {
        return;
    };
    meta.data.tiles.fill(-1);
    if let Some(signals) = meta.signals.as_deref() {
        emit_signal(&signals.on_cleared, &());
    }
}

// ---------------------------------------------------------------------------
// clone_tilemap
// ---------------------------------------------------------------------------

/// Deep-copies the tilemap at `source` into a new tilemap node in `arena` and
/// returns its id.
///
/// Mirrors TS `cloneTilemap`: `columns`, `rows`, `tileset`, and the `tiles`
/// buffer are copied; the new node has a fresh runtime. Signals are not cloned.
pub fn clone_tilemap(arena: &mut DisplayObjectArena, source: NodeId) -> NodeId {
    let (columns, rows, tileset, tiles) = match get_tilemap_meta(arena, source) {
        Some(meta) => (
            meta.data.columns,
            meta.data.rows,
            meta.data.tileset.clone(),
            meta.data.tiles.clone(),
        ),
        None => (0, 0, None, Vec::new()),
    };
    let clone = create_tilemap(arena);
    if let Some(meta) = get_tilemap_meta_mut(arena, clone) {
        meta.data.columns = columns;
        meta.data.rows = rows;
        meta.data.tileset = tileset;
        meta.data.tiles = tiles;
    }
    clone
}

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
    let meta: Box<dyn std::any::Any + Send + Sync> = Box::new(TilemapMeta::default());
    create_display_object_generic(arena, tilemap_kind(), Some(meta))
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
// create_tilemap_signals
// ---------------------------------------------------------------------------

/// Creates a fresh `TilemapSignals` value.
pub fn create_tilemap_signals() -> TilemapSignals {
    TilemapSignals::default()
}

// ---------------------------------------------------------------------------
// enable_tilemap_signals
// ---------------------------------------------------------------------------

/// Lazily creates `TilemapSignals` on `target` and returns a mutable reference.
///
/// Subsequent calls return the already-created set.
pub fn enable_tilemap_signals(
    arena: &mut DisplayObjectArena,
    target: NodeId,
) -> &mut TilemapSignals {
    let meta = get_tilemap_meta_mut(arena, target).expect("not a tilemap node");
    meta.signals
        .get_or_insert_with(|| Box::new(TilemapSignals::default()))
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
// get_tilemap_column_at_x
// ---------------------------------------------------------------------------

/// Returns the floored column index for a local-space x coordinate, or -1 when
/// the tileset is null or `x` is outside the tilemap bounds.
pub fn get_tilemap_column_at_x(arena: &DisplayObjectArena, source: NodeId, x: f32) -> i32 {
    let Some(data) = get_tilemap_data(arena, source) else {
        return -1;
    };
    let Some(ref ts) = data.tileset else {
        return -1;
    };
    if ts.tile_width <= 0.0 {
        return -1;
    }
    let col = (x / ts.tile_width).floor() as i32;
    if col < 0 || col >= data.columns as i32 {
        return -1;
    }
    col
}

// ---------------------------------------------------------------------------
// get_tilemap_column_row_at_point
// ---------------------------------------------------------------------------

/// Writes the column and row for a local-space point `(x, y)` into `out.x`/`out.y`.
/// Returns false when the tileset is null or the point is outside the tilemap
/// bounds; on a false return, `out` is not modified.
pub fn get_tilemap_column_row_at_point(
    out: &mut Vector2Like,
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
) -> bool {
    let col = get_tilemap_column_at_x(arena, source, x);
    let row = get_tilemap_row_at_y(arena, source, y);
    if col < 0 || row < 0 {
        return false;
    }
    out.x = col as f32;
    out.y = row as f32;
    true
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
// get_tilemap_row_at_y
// ---------------------------------------------------------------------------

/// Returns the floored row index for a local-space y coordinate, or -1 when the
/// tileset is null or `y` is outside the tilemap bounds.
pub fn get_tilemap_row_at_y(arena: &DisplayObjectArena, source: NodeId, y: f32) -> i32 {
    let Some(data) = get_tilemap_data(arena, source) else {
        return -1;
    };
    let Some(ref ts) = data.tileset else {
        return -1;
    };
    if ts.tile_height <= 0.0 {
        return -1;
    }
    let row = (y / ts.tile_height).floor() as i32;
    if row < 0 || row >= data.rows as i32 {
        return -1;
    }
    row
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
// get_tilemap_signals
// ---------------------------------------------------------------------------

/// Returns the `TilemapSignals` attached to `source`, or `None` if not yet enabled.
pub fn get_tilemap_signals(arena: &DisplayObjectArena, source: NodeId) -> Option<&TilemapSignals> {
    get_tilemap_meta(arena, source)?.signals.as_deref()
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
// get_tilemap_tile_at_point
// ---------------------------------------------------------------------------

/// Returns the cell value at local-space point `point`, or -1 when the tileset is
/// null, the point is outside the tilemap, or the cell is empty.
pub fn get_tilemap_tile_at_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    point: &Vector2Like,
) -> i16 {
    get_tilemap_tile_at_point_xy(arena, source, point.x, point.y)
}

// ---------------------------------------------------------------------------
// get_tilemap_tile_at_point_xy
// ---------------------------------------------------------------------------

/// XY variant of [`get_tilemap_tile_at_point`]. Returns the cell value or -1.
pub fn get_tilemap_tile_at_point_xy(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
) -> i16 {
    let col = get_tilemap_column_at_x(arena, source, x);
    let row = get_tilemap_row_at_y(arena, source, y);
    if col < 0 || row < 0 {
        return -1;
    }
    get_tilemap_tile(arena, source, col as u32, row as u32)
}

// ---------------------------------------------------------------------------
// get_tilemap_tile_rect
// ---------------------------------------------------------------------------

/// Writes the local-space rectangle for the cell at `(column, row)` into `out`.
/// Returns false and does not modify `out` when the tileset is null or the
/// column/row is out of bounds.
pub fn get_tilemap_tile_rect(
    out: &mut Rectangle,
    arena: &DisplayObjectArena,
    source: NodeId,
    column: u32,
    row: u32,
) -> bool {
    let Some(data) = get_tilemap_data(arena, source) else {
        return false;
    };
    let Some(ref ts) = data.tileset else {
        return false;
    };
    if column >= data.columns || row >= data.rows {
        return false;
    }
    out.x = column as f32 * ts.tile_width;
    out.y = row as f32 * ts.tile_height;
    out.width = ts.tile_width;
    out.height = ts.tile_height;
    true
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
/// Fires `on_tile_changed` when signals are enabled.
pub fn set_tilemap_tile(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    column: u32,
    row: u32,
    id: i16,
) {
    let Some(meta) = get_tilemap_meta_mut(arena, target) else {
        return;
    };
    let data = &mut meta.data;
    if column >= data.columns || row >= data.rows {
        return;
    }
    let idx = (row * data.columns + column) as usize;
    if let Some(cell) = data.tiles.get_mut(idx) {
        *cell = id;
    }
    if let Some(signals) = meta.signals.as_deref() {
        emit_signal(
            &signals.on_tile_changed,
            &TilemapTileChanged { column, row, id },
        );
    }
}

// ---------------------------------------------------------------------------
// set_tilemap_tiles
// ---------------------------------------------------------------------------

/// Blits a sub-grid of tile ids from `ids` into the tilemap starting at
/// (`offset_column`, `offset_row`), reading `width × height` tiles from `ids` in
/// row-major order. Clips the write to the tilemap bounds. Fires `on_tiles_changed`
/// when signals are enabled.
pub fn set_tilemap_tiles(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    ids: &[i16],
    offset_column: i32,
    offset_row: i32,
    width: u32,
    height: u32,
) {
    let Some(meta) = get_tilemap_meta_mut(arena, target) else {
        return;
    };
    let data = &mut meta.data;
    let columns = data.columns as i32;
    let rows = data.rows as i32;
    for r in 0..height as i32 {
        let target_row = offset_row + r;
        if target_row < 0 || target_row >= rows {
            continue;
        }
        for c in 0..width as i32 {
            let target_col = offset_column + c;
            if target_col < 0 || target_col >= columns {
                continue;
            }
            let dst = (target_row * columns + target_col) as usize;
            let src = (r * width as i32 + c) as usize;
            data.tiles[dst] = ids[src];
        }
    }
    if let Some(signals) = meta.signals.as_deref() {
        emit_signal(
            &signals.on_tiles_changed,
            &TilemapTilesChanged {
                offset_column: offset_column.max(0) as u32,
                offset_row: offset_row.max(0) as u32,
                width,
                height,
            },
        );
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

fn get_tilemap_meta(arena: &DisplayObjectArena, source: NodeId) -> Option<&TilemapMeta> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<TilemapMeta>())
}

fn get_tilemap_meta_mut(
    arena: &mut DisplayObjectArena,
    source: NodeId,
) -> Option<&mut TilemapMeta> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<TilemapMeta>())
}

fn get_tilemap_data(arena: &DisplayObjectArena, source: NodeId) -> Option<&TilemapData> {
    get_tilemap_meta(arena, source).map(|m| &m.data)
}

fn get_tilemap_data_mut(
    arena: &mut DisplayObjectArena,
    source: NodeId,
) -> Option<&mut TilemapData> {
    get_tilemap_meta_mut(arena, source).map(|m| &mut m.data)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::connect_signal;
    use flighthq_types::tilemap_kind;
    use std::sync::{Arc, Mutex};

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

    // clear_tilemap

    #[test]
    fn clear_tilemap_sets_all_cells_to_negative_one() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 2, 2);
        fill_tilemap_tiles(&mut arena, id, 5);
        clear_tilemap(&mut arena, id);
        assert_eq!(get_tilemap_tile(&arena, id, 0, 0), -1);
        assert_eq!(get_tilemap_tile(&arena, id, 1, 1), -1);
    }

    #[test]
    fn clear_tilemap_fires_on_cleared() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 2, 2);
        let count = Arc::new(Mutex::new(0));
        let on_cleared = enable_tilemap_signals(&mut arena, id).on_cleared.clone();
        let c = Arc::clone(&count);
        let _guard = connect_signal(
            &on_cleared,
            Arc::new(move |_: &()| {
                *c.lock().unwrap() += 1;
            }),
            Default::default(),
        );
        clear_tilemap(&mut arena, id);
        assert_eq!(*count.lock().unwrap(), 1);
    }

    // clone_tilemap

    #[test]
    fn clone_tilemap_copies_tiles_and_dimensions() {
        let mut arena = new_arena();
        let source = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, source, 2, 2);
        set_tilemap_tileset(&mut arena, source, Some(make_tileset(16.0, 16.0)));
        set_tilemap_tile(&mut arena, source, 0, 0, 7);
        let clone = clone_tilemap(&mut arena, source);
        assert_ne!(clone, source);
        assert_eq!(get_tilemap_columns(&arena, clone), 2);
        assert_eq!(get_tilemap_rows(&arena, clone), 2);
        assert_eq!(get_tilemap_tile(&arena, clone, 0, 0), 7);
        assert!(get_tilemap_tileset(&arena, clone).is_some());
        assert_eq!(arena[clone].kind, tilemap_kind());
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

    // create_tilemap_signals

    #[test]
    fn create_tilemap_signals_returns_default_signal_set() {
        let signals = create_tilemap_signals();
        assert!(!signals.on_cleared.has_listeners());
        assert!(!signals.on_tile_changed.has_listeners());
        assert!(!signals.on_tiles_changed.has_listeners());
    }

    // enable_tilemap_signals

    #[test]
    fn enable_tilemap_signals_attaches_on_first_call() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        assert!(get_tilemap_signals(&arena, id).is_none());
        enable_tilemap_signals(&mut arena, id);
        assert!(get_tilemap_signals(&arena, id).is_some());
    }

    // get_tilemap_column_at_x / get_tilemap_row_at_y

    #[test]
    fn get_tilemap_column_at_x_floors_within_bounds() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        set_tilemap_tileset(&mut arena, id, Some(make_tileset(16.0, 16.0)));
        assert_eq!(get_tilemap_column_at_x(&arena, id, 33.0), 2);
        assert_eq!(get_tilemap_column_at_x(&arena, id, -1.0), -1);
        assert_eq!(get_tilemap_column_at_x(&arena, id, 1000.0), -1);
    }

    #[test]
    fn get_tilemap_column_at_x_no_tileset_returns_neg_one() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        assert_eq!(get_tilemap_column_at_x(&arena, id, 10.0), -1);
    }

    #[test]
    fn get_tilemap_row_at_y_floors_within_bounds() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        set_tilemap_tileset(&mut arena, id, Some(make_tileset(16.0, 16.0)));
        assert_eq!(get_tilemap_row_at_y(&arena, id, 50.0), 3);
        assert_eq!(get_tilemap_row_at_y(&arena, id, -5.0), -1);
    }

    // get_tilemap_column_row_at_point

    #[test]
    fn get_tilemap_column_row_at_point_writes_out() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        set_tilemap_tileset(&mut arena, id, Some(make_tileset(16.0, 16.0)));
        let mut out = Vector2Like::default();
        assert!(get_tilemap_column_row_at_point(
            &mut out, &arena, id, 33.0, 50.0
        ));
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 3.0);
    }

    #[test]
    fn get_tilemap_column_row_at_point_out_of_bounds_returns_false() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        set_tilemap_tileset(&mut arena, id, Some(make_tileset(16.0, 16.0)));
        let mut out = Vector2Like { x: 9.0, y: 9.0 };
        assert!(!get_tilemap_column_row_at_point(
            &mut out, &arena, id, -1.0, 0.0
        ));
        assert_eq!(out.x, 9.0); // unchanged on false
        assert_eq!(out.y, 9.0);
    }

    // get_tilemap_tile_at_point / get_tilemap_tile_at_point_xy

    #[test]
    fn get_tilemap_tile_at_point_returns_cell_value() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        set_tilemap_tileset(&mut arena, id, Some(make_tileset(16.0, 16.0)));
        set_tilemap_tile(&mut arena, id, 2, 3, 9);
        let p = Vector2Like { x: 33.0, y: 50.0 };
        assert_eq!(get_tilemap_tile_at_point(&arena, id, &p), 9);
    }

    #[test]
    fn get_tilemap_tile_at_point_xy_out_of_bounds_returns_neg_one() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        set_tilemap_tileset(&mut arena, id, Some(make_tileset(16.0, 16.0)));
        assert_eq!(get_tilemap_tile_at_point_xy(&arena, id, -1.0, 0.0), -1);
    }

    // get_tilemap_tile_rect

    #[test]
    fn get_tilemap_tile_rect_writes_cell_rectangle() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        set_tilemap_tileset(&mut arena, id, Some(make_tileset(16.0, 16.0)));
        let mut out = Rectangle::default();
        assert!(get_tilemap_tile_rect(&mut out, &arena, id, 2, 3));
        assert_eq!(out.x, 32.0);
        assert_eq!(out.y, 48.0);
        assert_eq!(out.width, 16.0);
        assert_eq!(out.height, 16.0);
    }

    #[test]
    fn get_tilemap_tile_rect_no_tileset_returns_false() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        let mut out = Rectangle {
            x: 1.0,
            y: 1.0,
            width: 1.0,
            height: 1.0,
        };
        assert!(!get_tilemap_tile_rect(&mut out, &arena, id, 0, 0));
        assert_eq!(out.x, 1.0); // unchanged on false
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

    // get_tilemap_signals

    #[test]
    fn get_tilemap_signals_none_before_enable() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        assert!(get_tilemap_signals(&arena, id).is_none());
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
    fn set_tilemap_tile_fires_on_tile_changed() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        let captured = Arc::new(Mutex::new(TilemapTileChanged::default()));
        let on_tile_changed = enable_tilemap_signals(&mut arena, id)
            .on_tile_changed
            .clone();
        let c = Arc::clone(&captured);
        let _guard = connect_signal(
            &on_tile_changed,
            Arc::new(move |p: &TilemapTileChanged| {
                *c.lock().unwrap() = *p;
            }),
            Default::default(),
        );
        set_tilemap_tile(&mut arena, id, 1, 2, 8);
        let p = *captured.lock().unwrap();
        assert_eq!(p.column, 1);
        assert_eq!(p.row, 2);
        assert_eq!(p.id, 8);
    }

    #[test]
    fn get_tilemap_tile_out_of_range_returns_neg_one() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 2, 2);
        assert_eq!(get_tilemap_tile(&arena, id, 5, 5), -1);
    }

    // set_tilemap_tiles

    #[test]
    fn set_tilemap_tiles_blits_sub_grid() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        // 2x2 block of ids starting at (1, 1)
        let ids = [1i16, 2, 3, 4];
        set_tilemap_tiles(&mut arena, id, &ids, 1, 1, 2, 2);
        assert_eq!(get_tilemap_tile(&arena, id, 1, 1), 1);
        assert_eq!(get_tilemap_tile(&arena, id, 2, 1), 2);
        assert_eq!(get_tilemap_tile(&arena, id, 1, 2), 3);
        assert_eq!(get_tilemap_tile(&arena, id, 2, 2), 4);
    }

    #[test]
    fn set_tilemap_tiles_clips_out_of_bounds() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 2, 2);
        // 2x2 block starting at (1, 1) — only (1,1) is in-bounds.
        let ids = [5i16, 6, 7, 8];
        set_tilemap_tiles(&mut arena, id, &ids, 1, 1, 2, 2);
        assert_eq!(get_tilemap_tile(&arena, id, 1, 1), 5);
    }

    #[test]
    fn set_tilemap_tiles_fires_on_tiles_changed() {
        let mut arena = new_arena();
        let id = create_tilemap(&mut arena);
        resize_tilemap(&mut arena, id, 4, 4);
        let captured = Arc::new(Mutex::new(TilemapTilesChanged::default()));
        let on_tiles_changed = enable_tilemap_signals(&mut arena, id)
            .on_tiles_changed
            .clone();
        let c = Arc::clone(&captured);
        let _guard = connect_signal(
            &on_tiles_changed,
            Arc::new(move |p: &TilemapTilesChanged| {
                *c.lock().unwrap() = *p;
            }),
            Default::default(),
        );
        let ids = [1i16, 2, 3, 4];
        set_tilemap_tiles(&mut arena, id, &ids, 1, 1, 2, 2);
        let p = *captured.lock().unwrap();
        assert_eq!(p.offset_column, 1);
        assert_eq!(p.offset_row, 1);
        assert_eq!(p.width, 2);
        assert_eq!(p.height, 2);
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
