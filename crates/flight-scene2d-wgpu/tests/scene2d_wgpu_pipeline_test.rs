//! flight-compiler: target-native

use std::sync::Arc;

use flight_bitmaptext::BITMAP_TEXT_KIND;
use flight_materials::STANDARD_MATERIAL_KIND;
use flight_particleemitter::PARTICLE_EMITTER_2D_KIND;
use flight_quadbatch::QUAD_BATCH_KIND;
use flight_registry::with_kind_map_entry;
use flight_render::RENDER_CACHE_KIND;
use flight_render::register_node_renderer;
use flight_render_wgpu::*;
use flight_scene2d::{DISPLAY_OBJECT_KIND, SCALE9_SPRITE_KIND, SPRITE_KIND};
use flight_scene2d_wgpu::contract::*;
use flight_shape::contract::{MORPH_SHAPE_KIND, SCALE9_SHAPE_KIND, SHAPE_KIND};
use flight_text::contract::{RICH_TEXT_KIND, TEXT_LABEL_KIND};
use flight_tilemap::TILEMAP_KIND;

use crate::support::*;

mod register_wgpu_render_preset {
    use super::*;

    #[test]
    fn kind_maps_keep_unrelated_keys_and_take_the_preset_value_for_shared_keys() {
        let mut state = create_wgpu_render_state_for_test(None);
        let runner_keep: WgpuEffectRunner = |_, _| unreachable!("runner keep");
        let runner_old: WgpuEffectRunner = |_, _| unreachable!("runner old");
        let runner_new: WgpuEffectRunner = |_, _| unreachable!("runner new");
        let resolver_keep: WgpuTextureResolver = |_, _, _, _| unreachable!("resolver keep");
        let resolver_old: WgpuTextureResolver = |_, _, _, _| unreachable!("resolver old");
        let resolver_new: WgpuTextureResolver = |_, _, _, _| unreachable!("resolver new");
        let writer_keep: WgpuVelocityWriter = |_, _| unreachable!("writer keep");
        let writer_old: WgpuVelocityWriter = |_, _| unreachable!("writer old");
        let writer_new: WgpuVelocityWriter = |_, _| unreachable!("writer new");
        {
            let registries = &mut get_wgpu_render_state_runtime_mut(&mut state).registries;
            registries.custom_material_shaders = Arc::new(kind_map(&[
                ("Keep", "keep".to_string()),
                ("Shared", "old".to_string()),
            ]));
            registries.effects = Arc::new(kind_map(&[
                ("Keep", effect_registration(runner_keep)),
                ("Shared", effect_registration(runner_old)),
            ]));
            registries.material_renderers = Arc::new(kind_map(&[
                ("Keep", quad_material_renderer(1)),
                ("Shared", quad_material_renderer(2)),
            ]));
            registries.modifier_snippets = Arc::new(kind_map(&[
                ("Keep", &SNIPPET_KEEP),
                ("Shared", &SNIPPET_OLD),
            ]));
            registries.texture_resolvers = Arc::new(kind_map(&[
                ("Keep", resolver_keep),
                ("Shared", resolver_old),
            ]));
            registries.velocity_writers =
                Arc::new(kind_map(&[("Keep", writer_keep), ("Shared", writer_old)]));
        }
        let mut registries = build_wgpu_render_registries(&test_default());
        registries.custom_material_shaders = Arc::new(kind_map(&[
            ("Shared", "new".to_string()),
            ("Added", "added".to_string()),
        ]));
        registries.effects = Arc::new(kind_map(&[
            ("Shared", effect_registration(runner_new)),
            ("Added", effect_registration(runner_new)),
        ]));
        registries.material_renderers = Arc::new(kind_map(&[
            ("Shared", quad_material_renderer(3)),
            ("Added", quad_material_renderer(4)),
        ]));
        registries.modifier_snippets = Arc::new(kind_map(&[
            ("Shared", &SNIPPET_NEW),
            ("Added", &SNIPPET_NEW),
        ]));
        registries.texture_resolvers = Arc::new(kind_map(&[
            ("Shared", resolver_new),
            ("Added", resolver_new),
        ]));
        registries.velocity_writers =
            Arc::new(kind_map(&[("Shared", writer_new), ("Added", writer_new)]));
        register_wgpu_render_preset(&mut state, &preset_with(registries));

        let registries = &get_wgpu_render_state_runtime(&state).registries;
        let shaders = &registries.custom_material_shaders.entries;
        assert_eq!(shaders["Keep"], "keep");
        assert_eq!(shaders["Shared"], "new");
        assert_eq!(shaders["Added"], "added");
        let effects = &registries.effects.entries;
        assert!(std::ptr::fn_addr_eq(effects["Keep"].runner, runner_keep));
        assert!(std::ptr::fn_addr_eq(effects["Shared"].runner, runner_new));
        assert!(std::ptr::fn_addr_eq(effects["Added"].runner, runner_new));
        let materials = &registries.material_renderers.entries;
        for (kind, count) in [("Keep", 1), ("Shared", 3), ("Added", 4)] {
            let WgpuMaterialRenderer::Quad(renderer) = &materials[kind] else {
                panic!("{kind} is not a quad renderer");
            };
            assert_eq!(renderer.instance_float_count, count, "{kind}");
        }
        let snippets = &registries.modifier_snippets.entries;
        assert!(std::ptr::eq(snippets["Keep"], &SNIPPET_KEEP));
        assert!(std::ptr::eq(snippets["Shared"], &SNIPPET_NEW));
        assert!(std::ptr::eq(snippets["Added"], &SNIPPET_NEW));
        let resolvers = &registries.texture_resolvers.entries;
        assert!(std::ptr::fn_addr_eq(resolvers["Keep"], resolver_keep));
        assert!(std::ptr::fn_addr_eq(resolvers["Shared"], resolver_new));
        assert!(std::ptr::fn_addr_eq(resolvers["Added"], resolver_new));
        let writers = &registries.velocity_writers.entries;
        assert!(std::ptr::fn_addr_eq(writers["Keep"], writer_keep));
        assert!(std::ptr::fn_addr_eq(writers["Shared"], writer_new));
        assert!(std::ptr::fn_addr_eq(writers["Added"], writer_new));
    }

    #[test]
    fn node_renderers_replace_preset_kinds_and_keep_other_kinds() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_node_renderer(&mut state, "Custom".to_string(), &WGPU_SPRITE_RENDERER);
        flight_render::register_node_renderer(
            &mut state,
            flight_shape::contract::SHAPE_KIND.to_string(),
            &flight_scene2d_wgpu::WGPU_SHAPE_RENDERER,
        );
        // The shape kind holds the shape renderer the registration bound, and no other kind took it,
        // before the preset replaces it.
        assert!(std::ptr::eq(
            get_registered_node_renderer(&state, SHAPE_KIND).unwrap(),
            &flight_scene2d_wgpu::WGPU_SHAPE_RENDERER
        ));
        assert!(get_registered_node_renderer(&state, MORPH_SHAPE_KIND).is_none());
        let preset = WgpuScene2DRenderPreset {
            node_renderers: kind_map(&[(SHAPE_KIND, &WGPU_MESH_SHAPE_RENDERER)]),
            registries: build_wgpu_render_registries(&test_default()),
        };
        register_wgpu_render_preset(&mut state, &preset);
        assert!(std::ptr::eq(
            get_registered_node_renderer(&state, SHAPE_KIND).unwrap(),
            &WGPU_MESH_SHAPE_RENDERER
        ));
        assert!(std::ptr::eq(
            get_registered_node_renderer(&state, "Custom").unwrap(),
            &WGPU_SPRITE_RENDERER
        ));
    }

    #[test]
    fn option_slots_keep_the_state_value_when_unset_and_take_the_preset_value_when_set() {
        let mut state = create_wgpu_render_state_for_test(None);
        let guard_a: WgpuColorAdjustmentMaterialFeatureGuard = |_, _| unreachable!("guard a");
        let guard_b: WgpuColorAdjustmentMaterialFeatureGuard = |_, _| unreachable!("guard b");
        let upload_a: WgpuCompressedTextureUploader = |_, _, _, _| unreachable!("upload a");
        let upload_b: WgpuCompressedTextureUploader = |_, _, _, _| unreachable!("upload b");
        let pass_a: WgpuScene3DPass = |_, _, _, _| unreachable!("pass a");
        let pass_b: WgpuScene3DPass = |_, _, _, _| unreachable!("pass b");
        {
            let registries = &mut get_wgpu_render_state_runtime_mut(&mut state).registries;
            registries.color_adjustment_feature = Some(&FEATURE_A);
            registries.color_adjustment_feature_guard = Some(guard_a);
            registries.compressed_texture_decoder = Some(Arc::new(|_, _, _, _| None));
            registries.compressed_texture_upload = Some(upload_a);
            registries.gpu_skinning = Some(&SKINNING_A);
            registries.passes = Some(Arc::new(vec![pass_a]));
            registries.shape_rasterizer = Some(Arc::new(|_, _, _| {}));
        }
        let before = get_wgpu_render_state_runtime(&state).registries.clone();

        let unset = build_wgpu_render_registries(&test_default());
        assert!(unset.color_adjustment_feature.is_none());
        assert!(unset.color_adjustment_feature_guard.is_none());
        assert!(unset.compressed_texture_decoder.is_none());
        assert!(unset.compressed_texture_upload.is_none());
        assert!(unset.gpu_skinning.is_none());
        assert!(unset.passes.is_none());
        assert!(unset.shape_rasterizer.is_none());
        register_wgpu_render_preset(&mut state, &preset_with(unset));
        assert_option_slots_equal(&get_wgpu_render_state_runtime(&state).registries, &before);

        let mut set = build_wgpu_render_registries(&test_default());
        set.color_adjustment_feature = Some(&FEATURE_B);
        set.color_adjustment_feature_guard = Some(guard_b);
        set.compressed_texture_decoder = Some(Arc::new(|_, _, _, _| None));
        set.compressed_texture_upload = Some(upload_b);
        set.gpu_skinning = Some(&SKINNING_B);
        set.passes = Some(Arc::new(vec![pass_b]));
        set.shape_rasterizer = Some(Arc::new(|_, _, _| {}));
        let expected = set.clone();
        register_wgpu_render_preset(&mut state, &preset_with(set));
        let registries = &get_wgpu_render_state_runtime(&state).registries;
        assert_option_slots_equal(registries, &expected);
        // Passes are one ordered list: a preset list replaces the state's list, never appends.
        let passes = registries.passes.as_ref().unwrap();
        assert_eq!(passes.len(), 1);
        assert!(std::ptr::fn_addr_eq(passes[0], pass_b));
    }
}

mod register_wgpu_scene2d_render_preset {
    use super::*;

    #[test]
    fn registers_every_preset_node_renderer_and_the_standard_material() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_scene2d_render_preset(&mut state);
        let preset = &WGPU_SCENE2D_RENDER_PRESET.node_renderers;
        assert_eq!(preset.key_order.len(), 13);
        for kind in &preset.key_order {
            assert!(
                std::ptr::eq(
                    get_registered_node_renderer(&state, kind).unwrap(),
                    *preset.entries.get(kind).unwrap()
                ),
                "{kind}"
            );
        }
        assert!(
            get_wgpu_quad_material_renderer(&state, &STANDARD_MATERIAL_KIND.to_string()).is_some()
        );
    }
}

mod wgpu_render_infrastructure {
    use super::*;

    #[test]
    fn carries_the_standard_quad_material_renderer_and_no_node_renderers() {
        assert_eq!(
            WGPU_RENDER_INFRASTRUCTURE.material_renderers.entries.len(),
            1
        );
        assert!(
            WGPU_RENDER_INFRASTRUCTURE
                .material_renderers
                .entries
                .contains_key(STANDARD_MATERIAL_KIND)
        );
    }
}

mod wgpu_scene2d_render_preset {
    use super::*;

    #[test]
    fn carries_every_standard_2d_wgpu_renderer_bound() {
        let expected_kinds = [
            BITMAP_TEXT_KIND,
            DISPLAY_OBJECT_KIND,
            MORPH_SHAPE_KIND,
            PARTICLE_EMITTER_2D_KIND,
            QUAD_BATCH_KIND,
            RENDER_CACHE_KIND,
            RICH_TEXT_KIND,
            SCALE9_SHAPE_KIND,
            SCALE9_SPRITE_KIND,
            SHAPE_KIND,
            SPRITE_KIND,
            TEXT_LABEL_KIND,
            TILEMAP_KIND,
        ];
        for kind in expected_kinds {
            assert!(
                WGPU_SCENE2D_RENDER_PRESET
                    .node_renderers
                    .entries
                    .contains_key(kind),
                "{kind}"
            );
        }
        assert!(std::ptr::eq(
            *WGPU_SCENE2D_RENDER_PRESET
                .node_renderers
                .entries
                .get(SCALE9_SPRITE_KIND)
                .unwrap(),
            &WGPU_SCALE9_SPRITE_RENDERER
        ));
    }

    #[test]
    fn carries_the_standard_quad_material_renderer() {
        let materials = &WGPU_SCENE2D_RENDER_PRESET.registries.material_renderers;
        assert_eq!(materials.entries.len(), 1);
        assert!(materials.entries.contains_key(STANDARD_MATERIAL_KIND));
    }

    // TS checks const identity and Object.freeze: a Rust static is one immutable value.
    #[test]
    fn is_one_shared_immutable_value() {
        assert!(std::ptr::eq(
            &*WGPU_SCENE2D_RENDER_PRESET,
            &*WGPU_SCENE2D_RENDER_PRESET
        ));
    }
}

// Every Option slot is the same value (by identity) on both registries.
fn assert_option_slots_equal(actual: &WgpuRenderRegistries, expected: &WgpuRenderRegistries) {
    assert!(std::ptr::eq(
        actual.color_adjustment_feature.unwrap(),
        expected.color_adjustment_feature.unwrap()
    ));
    assert!(std::ptr::fn_addr_eq(
        actual.color_adjustment_feature_guard.unwrap(),
        expected.color_adjustment_feature_guard.unwrap()
    ));
    assert!(Arc::ptr_eq(
        actual.compressed_texture_decoder.as_ref().unwrap(),
        expected.compressed_texture_decoder.as_ref().unwrap()
    ));
    assert!(std::ptr::fn_addr_eq(
        actual.compressed_texture_upload.unwrap(),
        expected.compressed_texture_upload.unwrap()
    ));
    assert!(std::ptr::eq(
        actual.gpu_skinning.unwrap(),
        expected.gpu_skinning.unwrap()
    ));
    assert!(Arc::ptr_eq(
        actual.passes.as_ref().unwrap(),
        expected.passes.as_ref().unwrap()
    ));
    assert!(Arc::ptr_eq(
        actual.shape_rasterizer.as_ref().unwrap(),
        expected.shape_rasterizer.as_ref().unwrap()
    ));
}

fn effect_registration(runner: WgpuEffectRunner) -> WgpuEffectRegistration {
    return WgpuEffectRegistration {
        is_resolvable: None,
        runner,
    };
}

fn kind_map<T: Clone>(entries: &[(&str, T)]) -> flight_registry::KindMap<T> {
    let mut map = flight_registry::KindMap {
        entries: std::collections::HashMap::new(),
        key_order: Vec::new(),
    };
    for (kind, value) in entries {
        map = with_kind_map_entry(&map, kind.to_string(), value.clone());
    }
    return map;
}

fn preset_with(registries: WgpuRenderRegistries) -> WgpuScene2DRenderPreset {
    return WgpuScene2DRenderPreset {
        node_renderers: kind_map(&[]),
        registries,
    };
}

fn quad_material_renderer(instance_float_count: u32) -> WgpuMaterialRenderer {
    let mut renderer = STANDARD_WGPU_QUAD_MATERIAL_RENDERER.clone();
    renderer.instance_float_count = instance_float_count;
    return WgpuMaterialRenderer::Quad(renderer);
}

static FEATURE_A: WgpuColorAdjustmentMaterialFeature = WgpuColorAdjustmentMaterialFeature {
    fragment_shader_chunk: "a",
    matrix_fragment_shader_chunk: "a",
    draw_shape_meshes: None,
    record: |_, _, _| unreachable!("feature a"),
    resolve_flush: |_, _| unreachable!("feature a"),
};

static FEATURE_B: WgpuColorAdjustmentMaterialFeature = WgpuColorAdjustmentMaterialFeature {
    fragment_shader_chunk: "b",
    matrix_fragment_shader_chunk: "b",
    draw_shape_meshes: None,
    record: |_, _, _| unreachable!("feature b"),
    resolve_flush: |_, _| unreachable!("feature b"),
};

static SKINNING_A: WgpuSkinningAdapter = test_skinning_adapter();

static SKINNING_B: WgpuSkinningAdapter = test_skinning_adapter();

static SNIPPET_KEEP: WgpuModifierSnippet = test_modifier_snippet("keep");

static SNIPPET_NEW: WgpuModifierSnippet = test_modifier_snippet("new");

static SNIPPET_OLD: WgpuModifierSnippet = test_modifier_snippet("old");

const fn test_modifier_snippet(kind: &'static str) -> WgpuModifierSnippet {
    return WgpuModifierSnippet {
        kind,
        slot: kind,
        get_define_signature: None,
        bind: None,
        contribution: |_, _, _| unreachable!("snippet contribution"),
        textures: None,
    };
}

const fn test_skinning_adapter() -> WgpuSkinningAdapter {
    return WgpuSkinningAdapter {
        extend_mesh_prelude: |_| unreachable!("skinning"),
        extend_shadow_depth_prelude: |_| unreachable!("skinning"),
        get_draw_bind_group: |_, _| unreachable!("skinning"),
        get_draw_layout: |_| unreachable!("skinning"),
        get_mesh_draw_bind_group: |_, _, _| unreachable!("skinning"),
        get_mesh_draw_layout: |_| unreachable!("skinning"),
        get_upload_vertices: |_| unreachable!("skinning"),
        has_bind_pose: |_| unreachable!("skinning"),
        is_gpu_skinned: |_| unreachable!("skinning"),
        vertex_buffer_layouts: &[],
    };
}
