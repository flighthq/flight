use flight_entity::Kind;
use flight_registry::{KindMap, get_kind_map_keys};
use flight_scene2d_gl::gl_scene2d_render_preset;
use flight_scene3d_gl::contract::*;

fn expect_exact_keys<T>(table: &KindMap<T>, expected: &[&str]) {
    let mut actual: Vec<Kind> = Vec::new();
    get_kind_map_keys(&mut actual, table);
    let expected: Vec<Kind> = expected.iter().map(|kind| kind.to_string()).collect();
    assert_eq!(actual, expected);
    assert_eq!(table.entries.len(), expected.len());
}

fn keys<T>(table: &KindMap<T>) -> Vec<Kind> {
    let mut out = Vec::new();
    get_kind_map_keys(&mut out, table);
    return out;
}

mod gl_scene3d_render_preset {
    use super::*;

    #[test]
    fn inherits_every_unchanged_scene2d_gl_registry_table() {
        // The preset is built on demand in Rust (native registries are not Sync), so "the same table"
        // is checked by content: every unchanged table carries exactly the Scene2D preset's entries.
        let scene2d = gl_scene2d_render_preset();
        let scene3d = gl_scene3d_render_preset();
        assert_eq!(
            keys(&*scene3d.gl_registries.blend_realizations),
            keys(&*scene2d.gl_registries.blend_realizations)
        );
        assert_eq!(
            scene3d.gl_registries.compressed_texture_decoder.is_some(),
            scene2d.gl_registries.compressed_texture_decoder.is_some()
        );
        assert_eq!(
            scene3d.gl_registries.compressed_texture_upload.is_some(),
            scene2d.gl_registries.compressed_texture_upload.is_some()
        );
        assert_eq!(
            keys(&*scene3d.gl_registries.custom_effect_shaders),
            keys(&*scene2d.gl_registries.custom_effect_shaders)
        );
        assert_eq!(
            keys(&*scene3d.gl_registries.custom_material_shaders),
            keys(&*scene2d.gl_registries.custom_material_shaders)
        );
        assert_eq!(
            keys(&*scene3d.gl_registries.effects),
            keys(&*scene2d.gl_registries.effects)
        );
        assert_eq!(
            keys(scene3d.render_registries.node_renderers.as_ref().unwrap()),
            keys(scene2d.render_registries.node_renderers.as_ref().unwrap())
        );
        assert_eq!(
            scene3d.gl_registries.shape_rasterizer.is_some(),
            scene2d.gl_registries.shape_rasterizer.is_some()
        );
        assert_eq!(
            scene3d
                .render_registries
                .stroke_tessellator
                .flatten()
                .is_some(),
            scene2d
                .render_registries
                .stroke_tessellator
                .flatten()
                .is_some()
        );
        assert_eq!(
            keys(&*scene3d.gl_registries.texture_resolvers),
            keys(&*scene2d.gl_registries.texture_resolvers)
        );
        assert_eq!(
            keys(&*scene3d.gl_registries.velocity_writers),
            keys(&*scene2d.gl_registries.velocity_writers)
        );
    }

    #[test]
    fn carries_the_standard_quad_material_and_all_sixteen_standard_gl_mesh_material_renderers() {
        expect_exact_keys(
            &gl_scene3d_render_preset().gl_registries.material_renderers,
            &[
                "BlinnPhongMaterial",
                "CustomShaderMaterial",
                "DepthMaterial",
                "EmissiveMaterial",
                "ExtendedPbrMaterial",
                "LambertMaterial",
                "MatcapMaterial",
                "NormalMaterial",
                "PhongMaterial",
                "ShadedMaterial",
                "SpecularGlossinessPbrMaterial",
                "StandardMaterial",
                "StandardPbrMaterial",
                "ToonMaterial",
                "UnlitMaterial",
                "VertexColorMaterial",
                "WireframeMaterial",
            ],
        );
    }

    #[test]
    fn carries_exactly_the_seven_standard_gl_pbr_extensions() {
        expect_exact_keys(
            &gl_scene3d_render_preset().gl_registries.pbr_extensions,
            &[
                "AnisotropyPbrExtension",
                "ClearcoatPbrExtension",
                "IridescencePbrExtension",
                "SheenPbrExtension",
                "SpecularPbrExtension",
                "TransmissionVolumePbrExtension",
                "WrappedDiffusePbrExtension",
            ],
        );
    }

    #[test]
    fn carries_exactly_the_eight_built_in_gl_modifier_snippets() {
        expect_exact_keys(
            &gl_scene3d_render_preset().gl_registries.modifier_snippets,
            &[
                "AnimatedNormalModifier",
                "DissolveModifier",
                "EmissiveModifier",
                "EnvReflectModifier",
                "FogModifier",
                "RimModifier",
                "ToonModifier",
                "VertexDisplaceModifier",
            ],
        );
    }

    #[test]
    fn inherits_exactly_the_three_standard_gl_texture_resolvers() {
        expect_exact_keys(
            &gl_scene3d_render_preset().gl_registries.texture_resolvers,
            &[
                flight_bitmap::BITMAP_TEXTURE_SOURCE_KIND,
                flight_image::IMAGE_TEXTURE_SOURCE_KIND,
                flight_render::RENDER_TARGET_TEXTURE_SOURCE_KIND,
            ],
        );
    }
}
