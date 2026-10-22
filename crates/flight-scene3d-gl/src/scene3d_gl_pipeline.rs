// flight-lint: allow-file(contract-vocabulary) D17 render presets hold backend-typed renderer tables over thread-bound render-gl state

use std::sync::Arc;

use flight_entity::Kind;
use flight_materials::{
    ANISOTROPY_PBR_EXTENSION_KIND, BLINN_PHONG_MATERIAL_KIND, CLEARCOAT_PBR_EXTENSION_KIND,
    CUSTOM_SHADER_MATERIAL_KIND, DEPTH_MATERIAL_KIND, EMISSIVE_MATERIAL_KIND,
    EXTENDED_PBR_MATERIAL_KIND, IRIDESCENCE_PBR_EXTENSION_KIND, LAMBERT_MATERIAL_KIND,
    MATCAP_MATERIAL_KIND, NORMAL_MATERIAL_KIND, PHONG_MATERIAL_KIND, SHEEN_PBR_EXTENSION_KIND,
    SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND, SPECULAR_PBR_EXTENSION_KIND, STANDARD_PBR_MATERIAL_KIND,
    TOON_MATERIAL_KIND, TRANSMISSION_VOLUME_PBR_EXTENSION_KIND, UNLIT_MATERIAL_KIND,
    VERTEX_COLOR_MATERIAL_KIND, WIREFRAME_MATERIAL_KIND, WRAPPED_DIFFUSE_PBR_EXTENSION_KIND,
};
use flight_registry::{KindMap, with_kind_map_entry};
use flight_render_gl::{
    GlMaterialRenderer, GlMeshMaterialRenderer, GlModifierSnippet, GlPbrExtensionRegistration,
    GlRenderStateOptions,
};
use flight_scene2d_gl::gl_scene2d_render_preset;
use flight_shading::{
    ANIMATED_NORMAL_MODIFIER_KIND, DISSOLVE_MODIFIER_KIND, EMISSIVE_MODIFIER_KIND,
    ENV_REFLECT_MODIFIER_KIND, FOG_MODIFIER_KIND, RIM_MODIFIER_KIND, SHADED_MATERIAL_KIND,
    TOON_MODIFIER_KIND, VERTEX_DISPLACE_MODIFIER_KIND,
};

use crate::anisotropy_pbr_gl_extension::ANISOTROPY_PBR_GL_EXTENSION;
use crate::clearcoat_pbr_gl_extension::CLEARCOAT_PBR_GL_EXTENSION;
use crate::gl_blinn_phong_mesh_material_renderer::GL_BLINN_PHONG_MESH_MATERIAL_RENDERER;
use crate::gl_custom_shader_mesh_material_renderer::GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER;
use crate::gl_depth_mesh_material_renderer::GL_DEPTH_MESH_MATERIAL_RENDERER;
use crate::gl_emissive_mesh_material_renderer::GL_EMISSIVE_MESH_MATERIAL_RENDERER;
use crate::gl_extended_pbr_mesh_material_renderer::GL_EXTENDED_PBR_MESH_MATERIAL_RENDERER;
use crate::gl_lambert_mesh_material_renderer::GL_LAMBERT_MESH_MATERIAL_RENDERER;
use crate::gl_matcap_mesh_material_renderer::GL_MATCAP_MESH_MATERIAL_RENDERER;
use crate::gl_normal_mesh_material_renderer::GL_NORMAL_MESH_MATERIAL_RENDERER;
use crate::gl_phong_mesh_material_renderer::GL_PHONG_MESH_MATERIAL_RENDERER;
use crate::gl_shaded_built_in_modifiers::{
    ANIMATED_NORMAL_GL_MODIFIER_SNIPPET, DISSOLVE_GL_MODIFIER_SNIPPET,
    EMISSIVE_GL_MODIFIER_SNIPPET, ENV_REFLECT_GL_MODIFIER_SNIPPET, FOG_GL_MODIFIER_SNIPPET,
    RIM_GL_MODIFIER_SNIPPET, TOON_GL_MODIFIER_SNIPPET, VERTEX_DISPLACE_GL_MODIFIER_SNIPPET,
};
use crate::gl_shaded_mesh_material_renderer::GL_SHADED_MESH_MATERIAL_RENDERER;
use crate::gl_specular_glossiness_pbr_mesh_material_renderer::GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER;
use crate::gl_standard_pbr_mesh_material_renderer::GL_STANDARD_PBR_MESH_MATERIAL_RENDERER;
use crate::gl_toon_mesh_material_renderer::GL_TOON_MESH_MATERIAL_RENDERER;
use crate::gl_unlit_mesh_material_renderer::GL_UNLIT_MESH_MATERIAL_RENDERER;
use crate::gl_vertex_color_mesh_material_renderer::GL_VERTEX_COLOR_MESH_MATERIAL_RENDERER;
use crate::gl_wireframe_mesh_material_renderer::GL_WIREFRAME_MESH_MATERIAL_RENDERER;
use crate::iridescence_pbr_gl_extension::IRIDESCENCE_PBR_GL_EXTENSION;
use crate::sheen_pbr_gl_extension::SHEEN_PBR_GL_EXTENSION;
use crate::specular_pbr_gl_extension::SPECULAR_PBR_GL_EXTENSION;
use crate::transmission_volume_pbr_gl_extension::TRANSMISSION_VOLUME_PBR_GL_EXTENSION;
use crate::wrapped_diffuse_pbr_gl_extension::WRAPPED_DIFFUSE_PBR_GL_EXTENSION;

fn build_scene3d_gl_mesh_material_renderers(
    base: &KindMap<GlMaterialRenderer>,
) -> KindMap<GlMaterialRenderer> {
    let entries: [(&str, &'static GlMeshMaterialRenderer); 16] = [
        (
            BLINN_PHONG_MATERIAL_KIND,
            &GL_BLINN_PHONG_MESH_MATERIAL_RENDERER,
        ),
        (
            CUSTOM_SHADER_MATERIAL_KIND,
            &GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER,
        ),
        (DEPTH_MATERIAL_KIND, &GL_DEPTH_MESH_MATERIAL_RENDERER),
        (EMISSIVE_MATERIAL_KIND, &GL_EMISSIVE_MESH_MATERIAL_RENDERER),
        (
            EXTENDED_PBR_MATERIAL_KIND,
            &GL_EXTENDED_PBR_MESH_MATERIAL_RENDERER,
        ),
        (LAMBERT_MATERIAL_KIND, &GL_LAMBERT_MESH_MATERIAL_RENDERER),
        (MATCAP_MATERIAL_KIND, &GL_MATCAP_MESH_MATERIAL_RENDERER),
        (NORMAL_MATERIAL_KIND, &GL_NORMAL_MESH_MATERIAL_RENDERER),
        (PHONG_MATERIAL_KIND, &GL_PHONG_MESH_MATERIAL_RENDERER),
        (SHADED_MATERIAL_KIND, &GL_SHADED_MESH_MATERIAL_RENDERER),
        (
            SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND,
            &GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER,
        ),
        (
            STANDARD_PBR_MATERIAL_KIND,
            &GL_STANDARD_PBR_MESH_MATERIAL_RENDERER,
        ),
        (TOON_MATERIAL_KIND, &GL_TOON_MESH_MATERIAL_RENDERER),
        (UNLIT_MATERIAL_KIND, &GL_UNLIT_MESH_MATERIAL_RENDERER),
        (
            VERTEX_COLOR_MATERIAL_KIND,
            &GL_VERTEX_COLOR_MESH_MATERIAL_RENDERER,
        ),
        (
            WIREFRAME_MATERIAL_KIND,
            &GL_WIREFRAME_MESH_MATERIAL_RENDERER,
        ),
    ];
    let mut table = base.clone();
    for (kind, renderer) in entries {
        table = with_kind_map_entry(&table, Kind::from(kind), GlMaterialRenderer::Mesh(renderer));
    }
    return table;
}

fn build_scene3d_gl_modifier_snippets(
    base: &KindMap<&'static GlModifierSnippet>,
) -> KindMap<&'static GlModifierSnippet> {
    let entries: [(&str, &'static GlModifierSnippet); 8] = [
        (
            ANIMATED_NORMAL_MODIFIER_KIND,
            &ANIMATED_NORMAL_GL_MODIFIER_SNIPPET,
        ),
        (DISSOLVE_MODIFIER_KIND, &DISSOLVE_GL_MODIFIER_SNIPPET),
        (EMISSIVE_MODIFIER_KIND, &EMISSIVE_GL_MODIFIER_SNIPPET),
        (ENV_REFLECT_MODIFIER_KIND, &ENV_REFLECT_GL_MODIFIER_SNIPPET),
        (FOG_MODIFIER_KIND, &FOG_GL_MODIFIER_SNIPPET),
        (RIM_MODIFIER_KIND, &RIM_GL_MODIFIER_SNIPPET),
        (TOON_MODIFIER_KIND, &TOON_GL_MODIFIER_SNIPPET),
        (
            VERTEX_DISPLACE_MODIFIER_KIND,
            &VERTEX_DISPLACE_GL_MODIFIER_SNIPPET,
        ),
    ];
    let mut table = base.clone();
    for (kind, snippet) in entries {
        table = with_kind_map_entry(&table, Kind::from(kind), snippet);
    }
    return table;
}

fn build_scene3d_gl_pbr_extensions(
    base: &KindMap<&'static GlPbrExtensionRegistration>,
) -> KindMap<&'static GlPbrExtensionRegistration> {
    let entries: [(&str, &'static GlPbrExtensionRegistration); 7] = [
        (ANISOTROPY_PBR_EXTENSION_KIND, &ANISOTROPY_PBR_GL_EXTENSION),
        (CLEARCOAT_PBR_EXTENSION_KIND, &CLEARCOAT_PBR_GL_EXTENSION),
        (
            IRIDESCENCE_PBR_EXTENSION_KIND,
            &IRIDESCENCE_PBR_GL_EXTENSION,
        ),
        (SHEEN_PBR_EXTENSION_KIND, &SHEEN_PBR_GL_EXTENSION),
        (SPECULAR_PBR_EXTENSION_KIND, &SPECULAR_PBR_GL_EXTENSION),
        (
            TRANSMISSION_VOLUME_PBR_EXTENSION_KIND,
            &TRANSMISSION_VOLUME_PBR_GL_EXTENSION,
        ),
        (
            WRAPPED_DIFFUSE_PBR_EXTENSION_KIND,
            &WRAPPED_DIFFUSE_PBR_GL_EXTENSION,
        ),
    ];
    let mut table = base.clone();
    for (kind, registration) in entries {
        table = with_kind_map_entry(&table, Kind::from(kind), registration);
    }
    return table;
}

/// The complete standard 3D GL configuration (TS `glScene3DRenderPreset`): the Scene2D GL preset with
/// every standard mesh-material renderer, built-in modifier snippet and PBR extension added. Every
/// other registry table is the Scene2D preset's own.
// flight-lint: allow(conform-extra) TS exports a frozen const; native GL registries are not Sync, so the preset is built on demand
pub fn gl_scene3d_render_preset() -> GlRenderStateOptions {
    let mut out = gl_scene2d_render_preset();
    let registries = &mut out.gl_registries;
    registries.material_renderers = Arc::new(build_scene3d_gl_mesh_material_renderers(
        &registries.material_renderers,
    ));
    registries.modifier_snippets = Arc::new(build_scene3d_gl_modifier_snippets(
        &registries.modifier_snippets,
    ));
    registries.pbr_extensions =
        Arc::new(build_scene3d_gl_pbr_extensions(&registries.pbr_extensions));
    return out;
}
