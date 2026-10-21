//! Tilemap-owned declarations: the Tilemap kind struct, its data and runtime (TS `Tilemap`,
//! `TilemapData`, `TilemapRuntime`, `TilemapSignals`).

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_materials::contract::MaterialData;
use flight_scene2d::contract::{Node2DFields, Node2DRuntime};
use flight_signals::Signal;
use flight_textureatlas::TextureAtlas;

/// The kind string for a tilemap (TS `TilemapKind`).
pub const TILEMAP_KIND: &str = "Tilemap";

/// The 2D runtime tier inherited by `Tilemap` (TS `TilemapRuntime`, which adds nothing).
pub type TilemapRuntime = Node2DRuntime;

/// A tile-based 2D map (TS `Tilemap extends Node2D`).
#[derive(Default)]
pub struct Tilemap {
    node: Node2DFields,
    pub data: TilemapData,
    pub(crate) signals: Option<TilemapSignals>,
}

/// Tilemap kind data (TS `TilemapData`): the atlas, grid dimensions and the tile buffer.
#[derive(Clone)]
pub struct TilemapData {
    runtime: EntityRuntimeSlot,
    pub atlas: Option<Ref<TextureAtlas>>,
    pub columns: i32,
    pub material_data: Option<Vec<Option<Ref<dyn MaterialData>>>>,
    pub rows: i32,
    pub tile_height: f32,
    pub tile_width: f32,
    pub tiles: Vec<i16>,
}

/// Options for `create_tilemap_data` (TS `Partial<TilemapData>`).
#[derive(Clone, Default)]
pub struct TilemapDataOptions {
    pub atlas: Option<Ref<TextureAtlas>>,
    pub columns: Option<i32>,
    pub material_data: Option<Vec<Option<Ref<dyn MaterialData>>>>,
    pub rows: Option<i32>,
    pub tile_height: Option<f32>,
    pub tile_width: Option<f32>,
    pub tiles: Option<Vec<i16>>,
}

/// Options for `create_tilemap` (TS `PartialNode<Tilemap>`).
#[derive(Clone, Default)]
pub struct PartialTilemap {
    pub data: Option<TilemapDataOptions>,
    pub node: flight_scene2d::contract::PartialNode2D,
}

/// Opt-in signal group for tilemap events (TS `TilemapSignals`).
pub struct TilemapSignals {
    runtime: EntityRuntimeSlot,
    pub on_cleared: Signal<()>,
    pub on_tile_changed: Signal<(i32, i32, i16)>,
    pub on_tiles_changed: Signal<(i32, i32, i32, i32)>,
}

flight_scene2d::impl_node2d!(Tilemap);

impl Default for TilemapData {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            atlas: None,
            columns: 0,
            material_data: None,
            rows: 0,
            tile_height: 0.0,
            tile_width: 0.0,
            tiles: Vec::new(),
        };
    }
}

flight_entity::impl_entity!(TilemapData);

impl Default for TilemapSignals {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            on_cleared: flight_signals::create_signal(),
            on_tile_changed: flight_signals::create_signal(),
            on_tiles_changed: flight_signals::create_signal(),
        };
    }
}

flight_entity::impl_entity!(TilemapSignals);
