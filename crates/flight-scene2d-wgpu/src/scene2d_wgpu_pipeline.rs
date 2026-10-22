// flight-lint: allow-file(contract-vocabulary) D17 render presets hold backend-typed renderer tables over render-wgpu state
//! The standard 2D WebGPU render presets (TS `scene2DWgpuPipeline.ts`): the infrastructure every
//! build needs whatever the content is, and the full preset with every standard node renderer.

use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use flight_bitmaptext::BITMAP_TEXT_KIND;
use flight_materials::STANDARD_MATERIAL_KIND;
use flight_particleemitter::PARTICLE_EMITTER_2D_KIND;
use flight_quadbatch::QUAD_BATCH_KIND;
use flight_registry::{KindMap, with_kind_map_entry};
use flight_render::{NodeRenderer, RENDER_CACHE_KIND};
use flight_render_wgpu::{
    WgpuMaterialRenderer, WgpuRenderRegistries, WgpuRenderState, build_wgpu_render_registries,
};
use flight_scene2d::{DISPLAY_OBJECT_KIND, SCALE9_SPRITE_KIND, SPRITE_KIND};
use flight_shape::contract::{MORPH_SHAPE_KIND, SCALE9_SHAPE_KIND, SHAPE_KIND};
use flight_text::contract::{RICH_TEXT_KIND, TEXT_LABEL_KIND};
use flight_tilemap::TILEMAP_KIND;

use crate::types::*;
use crate::wgpu_bitmap_text::WGPU_BITMAP_TEXT_RENDERER;
use crate::wgpu_cache::WGPU_RENDER_CACHE_RENDERER;
use crate::wgpu_node2d::WGPU_SCENE2D_RENDERER;
use crate::wgpu_particle_emitter2d::WGPU_PARTICLE_EMITTER2D_RENDERER;
use crate::wgpu_quad_batch::WGPU_QUAD_BATCH_RENDERER;
use crate::wgpu_rich_text::WGPU_RICH_TEXT_RENDERER;
use crate::wgpu_scale9_shape::WGPU_SCALE9_SHAPE_RENDERER;
use crate::wgpu_scale9_sprite::WGPU_SCALE9_SPRITE_RENDERER;
use crate::wgpu_shape::{WGPU_MORPH_SHAPE_RENDERER, WGPU_SHAPE_RENDERER};
use crate::wgpu_sprite::WGPU_SPRITE_RENDERER;
use crate::wgpu_standard_material::STANDARD_WGPU_QUAD_MATERIAL_RENDERER;
use crate::wgpu_text_label::WGPU_TEXT_LABEL_RENDERER;
use crate::wgpu_tilemap::WGPU_TILEMAP_RENDERER;

/// Everything this backend needs that the CONTENT does not choose — the preset with no node
/// renderers (TS `wgpuRenderInfrastructure`). A per-file manifest replaces exactly one part of a
/// render configuration, the node renderers, because those are what a document implies; splitting
/// the two lets a generated fragment compose into a complete configuration.
pub static WGPU_RENDER_INFRASTRUCTURE: LazyLock<WgpuRenderRegistries> = LazyLock::new(|| {
    let mut registries = build_wgpu_render_registries(&Default::default());
    registries.material_renderers = Arc::new(with_kind_map_entry(
        &empty_kind_map(),
        STANDARD_MATERIAL_KIND.to_string(),
        WgpuMaterialRenderer::Quad(STANDARD_WGPU_QUAD_MATERIAL_RENDERER.clone()),
    ));
    return registries;
});

/// The complete standard 2D WebGPU configuration: the infrastructure plus every standard node
/// renderer bound (TS `wgpuScene2DRenderPreset`).
pub static WGPU_SCENE2D_RENDER_PRESET: LazyLock<WgpuScene2DRenderPreset> = LazyLock::new(|| {
    return WgpuScene2DRenderPreset {
        node_renderers: build_scene2d_wgpu_renderers(),
        registries: WGPU_RENDER_INFRASTRUCTURE.clone(),
    };
});

fn build_scene2d_wgpu_renderers() -> KindMap<&'static NodeRenderer<WgpuRenderState>> {
    let mut table = empty_kind_map();
    table = with_kind_map_entry(
        &table,
        BITMAP_TEXT_KIND.to_string(),
        &WGPU_BITMAP_TEXT_RENDERER,
    );
    table = with_kind_map_entry(
        &table,
        DISPLAY_OBJECT_KIND.to_string(),
        &WGPU_SCENE2D_RENDERER,
    );
    table = with_kind_map_entry(
        &table,
        MORPH_SHAPE_KIND.to_string(),
        WGPU_MORPH_SHAPE_RENDERER,
    );
    table = with_kind_map_entry(
        &table,
        PARTICLE_EMITTER_2D_KIND.to_string(),
        &WGPU_PARTICLE_EMITTER2D_RENDERER,
    );
    table = with_kind_map_entry(
        &table,
        QUAD_BATCH_KIND.to_string(),
        &WGPU_QUAD_BATCH_RENDERER,
    );
    table = with_kind_map_entry(
        &table,
        RENDER_CACHE_KIND.to_string(),
        &WGPU_RENDER_CACHE_RENDERER,
    );
    table = with_kind_map_entry(&table, RICH_TEXT_KIND.to_string(), &WGPU_RICH_TEXT_RENDERER);
    table = with_kind_map_entry(
        &table,
        SCALE9_SHAPE_KIND.to_string(),
        &WGPU_SCALE9_SHAPE_RENDERER,
    );
    table = with_kind_map_entry(
        &table,
        SCALE9_SPRITE_KIND.to_string(),
        &WGPU_SCALE9_SPRITE_RENDERER,
    );
    table = with_kind_map_entry(&table, SHAPE_KIND.to_string(), &WGPU_SHAPE_RENDERER);
    table = with_kind_map_entry(&table, SPRITE_KIND.to_string(), &WGPU_SPRITE_RENDERER);
    table = with_kind_map_entry(
        &table,
        TEXT_LABEL_KIND.to_string(),
        &WGPU_TEXT_LABEL_RENDERER,
    );
    table = with_kind_map_entry(&table, TILEMAP_KIND.to_string(), &WGPU_TILEMAP_RENDERER);
    return table;
}

fn empty_kind_map<T>() -> KindMap<T> {
    return KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
}
