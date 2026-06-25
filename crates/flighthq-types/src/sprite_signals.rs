//! Opt-in signal surfaces for the sprite graph kinds (`Sprite`, `QuadBatch`,
//! `Tilemap`). Each maps the TS `*Signals` group; multi-argument TS emits are
//! carried as named payload structs, mirroring the codebase's
//! one-payload-per-signal model.

use flighthq_signals::Signal;

// ---------------------------------------------------------------------------
// SpriteSignals
// ---------------------------------------------------------------------------

/// Signals emitted by a `Sprite` node. `on_frame_changed` carries the new
/// region id selected via `set_sprite_frame`.
#[derive(Debug, Default)]
pub struct SpriteSignals {
    pub on_frame_changed: Signal<u32>,
}

// ---------------------------------------------------------------------------
// QuadBatchSignals
// ---------------------------------------------------------------------------

/// Signals emitted by a `QuadBatch` node.
///
/// `on_instance_appended` carries the appended instance index;
/// `on_instance_removed` carries the removed index and the swap-source index
/// (`-1` when the removed instance was already last); `on_cleared` is a bare
/// notification.
#[derive(Debug, Default)]
pub struct QuadBatchSignals {
    pub on_cleared: Signal<()>,
    pub on_instance_appended: Signal<u32>,
    pub on_instance_removed: Signal<QuadBatchInstanceRemoved>,
}

/// Payload for `QuadBatchSignals::on_instance_removed`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct QuadBatchInstanceRemoved {
    pub index: u32,
    /// Index the last instance was swapped from, or `-1` when the removed
    /// instance was already the last one.
    pub swap_source: i32,
}

// ---------------------------------------------------------------------------
// TilemapSignals
// ---------------------------------------------------------------------------

/// Signals emitted by a `Tilemap` node.
///
/// `on_tile_changed` carries the changed cell and its new id;
/// `on_tiles_changed` carries the blitted region origin and size; `on_cleared`
/// is a bare notification.
#[derive(Debug, Default)]
pub struct TilemapSignals {
    pub on_cleared: Signal<()>,
    pub on_tile_changed: Signal<TilemapTileChanged>,
    pub on_tiles_changed: Signal<TilemapTilesChanged>,
}

/// Payload for `TilemapSignals::on_tile_changed`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TilemapTileChanged {
    pub column: u32,
    pub row: u32,
    pub id: i16,
}

/// Payload for `TilemapSignals::on_tiles_changed`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TilemapTilesChanged {
    pub offset_column: u32,
    pub offset_row: u32,
    pub width: u32,
    pub height: u32,
}
