use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Kind;
use flight_render_gl::GlRenderState;
use flight_scene3d::{
    AnimatedNormalModifierKind, BlinnPhongMaterialKind, CustomShaderMaterialKind,
    DepthMaterialKind, EmissiveMaterialKind, ExtendedPbrMaterialKind, LambertMaterialKind,
    MatcapMaterialKind, NormalMaterialKind, PhongMaterialKind, ShadedMaterialKind,
    SpecularGlossinessPbrMaterialKind, StandardPbrMaterialKind, ToonMaterialKind,
    UnlitMaterialKind, VertexColorMaterialKind, WireframeMaterialKind,
    DissolveModifierKind, EmissiveModifierKind, EnvReflectModifierKind, FogModifierKind,
    RimModifierKind, ToonModifierKind, VertexDisplaceModifierKind,
    AnisotropyPbrExtensionKind, ClearcoatPbrExtensionKind, IridescencePbrExtensionKind,
    SheenPbrExtensionKind, SpecularPbrExtensionKind, TransmissionVolumePbrExtensionKind,
    WrappedDiffusePbrExtensionKind,
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
use crate::types::{
    GlMeshMaterialRenderer, GlModifierSnippet, GlPbrExtensionRegistration,
};

pub struct GlScene3DRenderPreset {
    pub material_renderers: HashMap<Kind, Arc<dyn GlMeshMaterialRenderer>>,
    pub modifier_snippets: HashMap<Kind, GlModifierSnippet>,
    pub pbr_extensions: HashMap<Kind, GlPbrExtensionRegistration>,
}

pub fn build_scene3d_gl_mesh_material_renderers() -> HashMap<Kind, Arc<dyn GlMeshMaterialRenderer>> {
    let mut table: HashMap<Kind, Arc<dyn GlMeshMaterialRenderer>> = HashMap::new();
    table.insert(BlinnPhongMaterialKind, Arc::new(GL_BLINN_PHONG_MESH_MATERIAL_RENDERER));
    table.insert(CustomShaderMaterialKind, Arc::new(GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER));
    table.insert(DepthMaterialKind, Arc::new(GL_DEPTH_MESH_MATERIAL_RENDERER));
    table.insert(EmissiveMaterialKind, Arc::new(GL_EMISSIVE_MESH_MATERIAL_RENDERER));
    table.insert(ExtendedPbrMaterialKind, Arc::new(GL_EXTENDED_PBR_MESH_MATERIAL_RENDERER));
    table.insert(LambertMaterialKind, Arc::new(GL_LAMBERT_MESH_MATERIAL_RENDERER));
    table.insert(MatcapMaterialKind, Arc::new(GL_MATCAP_MESH_MATERIAL_RENDERER));
    table.insert(NormalMaterialKind, Arc::new(GL_NORMAL_MESH_MATERIAL_RENDERER));
    table.insert(PhongMaterialKind, Arc::new(GL_PHONG_MESH_MATERIAL_RENDERER));
    table.insert(ShadedMaterialKind, Arc::new(GL_SHADED_MESH_MATERIAL_RENDERER));
    table.insert(SpecularGlossinessPbrMaterialKind, Arc::new(GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER));
    table.insert(StandardPbrMaterialKind, Arc::new(GL_STANDARD_PBR_MESH_MATERIAL_RENDERER));
    table.insert(ToonMaterialKind, Arc::new(GL_TOON_MESH_MATERIAL_RENDERER));
    table.insert(UnlitMaterialKind, Arc::new(GL_UNLIT_MESH_MATERIAL_RENDERER));
    table.insert(VertexColorMaterialKind, Arc::new(GL_VERTEX_COLOR_MESH_MATERIAL_RENDERER));
    table.insert(WireframeMaterialKind, Arc::new(GL_WIREFRAME_MESH_MATERIAL_RENDERER));
    return table;
}

pub fn build_scene3d_gl_modifier_snippets() -> HashMap<Kind, GlModifierSnippet> {
    let mut table: HashMap<Kind, GlModifierSnippet> = HashMap::new();
    table.insert(AnimatedNormalModifierKind, ANIMATED_NORMAL_GL_MODIFIER_SNIPPET.clone());
    table.insert(DissolveModifierKind, DISSOLVE_GL_MODIFIER_SNIPPET.clone());
    table.insert(EmissiveModifierKind, EMISSIVE_GL_MODIFIER_SNIPPET.clone());
    table.insert(EnvReflectModifierKind, ENV_REFLECT_GL_MODIFIER_SNIPPET.clone());
    table.insert(FogModifierKind, FOG_GL_MODIFIER_SNIPPET.clone());
    table.insert(RimModifierKind, RIM_GL_MODIFIER_SNIPPET.clone());
    table.insert(ToonModifierKind, TOON_GL_MODIFIER_SNIPPET.clone());
    table.insert(VertexDisplaceModifierKind, VERTEX_DISPLACE_GL_MODIFIER_SNIPPET.clone());
    return table;
}

pub fn build_scene3d_gl_pbr_extensions() -> HashMap<Kind, GlPbrExtensionRegistration> {
    let mut table: HashMap<Kind, GlPbrExtensionRegistration> = HashMap::new();
    table.insert(AnisotropyPbrExtensionKind, ANISOTROPY_PBR_GL_EXTENSION.clone());
    table.insert(ClearcoatPbrExtensionKind, CLEARCOAT_PBR_GL_EXTENSION.clone());
    table.insert(IridescencePbrExtensionKind, IRIDESCENCE_PBR_GL_EXTENSION.clone());
    table.insert(SheenPbrExtensionKind, SHEEN_PBR_GL_EXTENSION.clone());
    table.insert(SpecularPbrExtensionKind, SPECULAR_PBR_GL_EXTENSION.clone());
    table.insert(TransmissionVolumePbrExtensionKind, TRANSMISSION_VOLUME_PBR_GL_EXTENSION.clone());
    table.insert(WrappedDiffusePbrExtensionKind, WRAPPED_DIFFUSE_PBR_GL_EXTENSION.clone());
    return table;
}

pub fn create_gl_scene3d_render_preset() -> GlScene3DRenderPreset {
    return GlScene3DRenderPreset {
        material_renderers: build_scene3d_gl_mesh_material_renderers(),
        modifier_snippets: build_scene3d_gl_modifier_snippets(),
        pbr_extensions: build_scene3d_gl_pbr_extensions(),
    };
}

pub fn register_gl_scene3d_pipeline(state: &GlRenderState) {
    let preset = create_gl_scene3d_render_preset();
    crate::gl_scene3d_runtime::get_gl_scene3d_runtime_mut(state, |rt| {
        rt.material_renderers = preset.material_renderers;
        rt.modifier_snippets = preset.modifier_snippets;
        rt.pbr_extension_registrations = preset.pbr_extensions;
    });
}
