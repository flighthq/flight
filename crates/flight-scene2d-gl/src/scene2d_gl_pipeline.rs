// flight-lint: allow-file(contract-vocabulary) D17 render presets hold backend-typed renderer tables over thread-bound render-gl state

use std::collections::HashMap;
use std::sync::Arc;

use flight_bitmaptext::BITMAP_TEXT_KIND;
use flight_materials::STANDARD_MATERIAL_KIND;
use flight_particleemitter::PARTICLE_EMITTER_2D_KIND;
use flight_quadbatch::QUAD_BATCH_KIND;
use flight_registry::{KindMap, with_kind_map_entry};
use flight_render::{NodeRenderer, RENDER_CACHE_KIND, RenderStateOptions};
use flight_render_gl::{
    GlMaterialRenderer, GlQuadMaterialRenderer, GlRenderRegistries, GlRenderState,
    GlRenderStateOptions, standard_gl_blend_realizations, standard_gl_texture_resolvers,
};
use flight_scene2d::{DISPLAY_OBJECT_KIND, SCALE9_SPRITE_KIND, SPRITE_KIND};
use flight_shape::contract::{MORPH_SHAPE_KIND, SCALE9_SHAPE_KIND, SHAPE_KIND};
use flight_text::contract::{RICH_TEXT_KIND, TEXT_LABEL_KIND};
use flight_tilemap::TILEMAP_KIND;

use crate::enable_gl_stroke_path_tessellation::tessellate_gl_stroke_path;
use crate::gl_bitmap_text::GL_BITMAP_TEXT_RENDERER;
use crate::gl_cache::GL_RENDER_CACHE_RENDERER;
use crate::gl_node2d::GL_SCENE2D_RENDERER;
use crate::gl_particle_emitter2d::GL_PARTICLE_EMITTER2D_RENDERER;
use crate::gl_quad_batch::GL_QUAD_BATCH_RENDERER;
use crate::gl_rich_text::GL_RICH_TEXT_RENDERER;
use crate::gl_scale9_shape::GL_SCALE9_SHAPE_RENDERER;
use crate::gl_scale9_sprite::GL_SCALE9_SPRITE_RENDERER;
use crate::gl_shape::{GL_MORPH_SHAPE_RENDERER, GL_SHAPE_RENDERER};
use crate::gl_sprite::GL_SPRITE_RENDERER;
use crate::gl_standard_material::STANDARD_GL_QUAD_MATERIAL_RENDERER;
use crate::gl_text_label::GL_TEXT_LABEL_RENDERER;
use crate::gl_tilemap::GL_TILEMAP_RENDERER;

fn build_scene2d_gl_renderers() -> KindMap<&'static NodeRenderer<GlRenderState>> {
    let mut table = empty_kind_map();
    table = with_kind_map_entry(
        &table,
        BITMAP_TEXT_KIND.to_string(),
        &GL_BITMAP_TEXT_RENDERER,
    );
    table = with_kind_map_entry(
        &table,
        DISPLAY_OBJECT_KIND.to_string(),
        &GL_SCENE2D_RENDERER,
    );
    table = with_kind_map_entry(
        &table,
        MORPH_SHAPE_KIND.to_string(),
        GL_MORPH_SHAPE_RENDERER,
    );
    table = with_kind_map_entry(
        &table,
        PARTICLE_EMITTER_2D_KIND.to_string(),
        &GL_PARTICLE_EMITTER2D_RENDERER,
    );
    table = with_kind_map_entry(&table, QUAD_BATCH_KIND.to_string(), &GL_QUAD_BATCH_RENDERER);
    table = with_kind_map_entry(
        &table,
        RENDER_CACHE_KIND.to_string(),
        &GL_RENDER_CACHE_RENDERER,
    );
    table = with_kind_map_entry(&table, RICH_TEXT_KIND.to_string(), &GL_RICH_TEXT_RENDERER);
    table = with_kind_map_entry(
        &table,
        SCALE9_SPRITE_KIND.to_string(),
        &GL_SCALE9_SPRITE_RENDERER,
    );
    table = with_kind_map_entry(
        &table,
        SCALE9_SHAPE_KIND.to_string(),
        &GL_SCALE9_SHAPE_RENDERER,
    );
    table = with_kind_map_entry(&table, SHAPE_KIND.to_string(), &GL_SHAPE_RENDERER);
    table = with_kind_map_entry(&table, SPRITE_KIND.to_string(), &GL_SPRITE_RENDERER);
    table = with_kind_map_entry(&table, TEXT_LABEL_KIND.to_string(), &GL_TEXT_LABEL_RENDERER);
    table = with_kind_map_entry(&table, TILEMAP_KIND.to_string(), &GL_TILEMAP_RENDERER);
    return table;
}

fn empty_kind_map<T>() -> KindMap<T> {
    return KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
}

/// Everything this backend needs that the CONTENT does not choose — the preset with no node
/// renderers (TS `glRenderInfrastructure`). A per-file manifest replaces exactly one part of a
/// render configuration: the node renderers, because those are what a document implies.
// flight-lint: allow(conform-extra) TS exports a frozen const; native GL registries are not Sync, so the preset is built on demand
pub fn gl_render_infrastructure() -> GlRenderStateOptions {
    let mut render_registries: RenderStateOptions<GlRenderState> = RenderStateOptions::default();
    render_registries.stroke_tessellator = Some(Some(tessellate_gl_stroke_path));
    let material: &'static dyn GlQuadMaterialRenderer = &STANDARD_GL_QUAD_MATERIAL_RENDERER;
    let gl_registries = GlRenderRegistries {
        blend_realizations: Arc::new(standard_gl_blend_realizations()),
        material_renderers: Arc::new(with_kind_map_entry(
            &empty_kind_map(),
            STANDARD_MATERIAL_KIND.to_string(),
            GlMaterialRenderer::Quad(material),
        )),
        texture_resolvers: Arc::new(standard_gl_texture_resolvers()),
        ..GlRenderRegistries::default()
    };
    return GlRenderStateOptions {
        render_registries,
        gl_registries,
        canvas_host: None,
        image_host: None,
        image_resolver: None,
    };
}

/// The complete standard 2D GL configuration: the infrastructure plus every standard node renderer
/// bound (TS `glScene2DRenderPreset`).
// flight-lint: allow(conform-extra) TS exports a frozen const; native GL registries are not Sync, so the preset is built on demand
pub fn gl_scene2d_render_preset() -> GlRenderStateOptions {
    let mut out = gl_render_infrastructure();
    out.render_registries.node_renderers = Some(build_scene2d_gl_renderers());
    return out;
}
