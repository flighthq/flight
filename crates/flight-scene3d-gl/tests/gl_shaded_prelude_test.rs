use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_registry::{KindMap, with_kind_map_entry};
use flight_render::RenderProxy2D;
use flight_render_gl::{
    GlColorAdjustmentData, GlColorAdjustmentMaterialFeature, GlModifierSnippet, GlRenderState,
    GlRenderStateRuntime, GlShapeMesh,
};
use flight_scene3d_gl::contract::*;
use flight_shading::{
    MODIFIER_SLOT_EFFECT, Modifier, VertexDisplaceModifierSource, create_emissive_modifier,
    create_env_reflect_modifier, create_rim_modifier, create_vertex_displace_modifier,
};

use crate::gl_test_helper::{calls_named, make_gl, make_gl_scene3d_state, shader_sources};

fn base_key() -> GlShadedDefineKey {
    return GlShadedDefineKey {
        alpha_mask_enabled: false,
        has_color_adjustment: None,
        has_color_matrix: None,
        has_diffuse_map: false,
        has_instances: None,
        has_normal_map: false,
        has_skin: None,
        has_specular_map: false,
        has_uv_transform: false,
    };
}

fn draw_no_meshes(
    _state: &mut GlRenderState,
    _proxy: &RenderProxy2D<GlRenderState>,
    _meshes: &[GlShapeMesh],
) {
}

fn flush_unhandled(_state: &mut GlRenderState, _count: usize) -> bool {
    return false;
}

fn record_nothing(
    _runtime: &mut GlRenderStateRuntime,
    _value: Option<&GlColorAdjustmentData>,
    _instance_index: usize,
) {
}

static COLOR_FEATURE: GlColorAdjustmentMaterialFeature = GlColorAdjustmentMaterialFeature {
    fragment_shader_chunk: "vec4 applyFlightColorAdjustment(vec4 c, vec4 m, vec4 o) { return c * m + o; }",
    matrix_fragment_shader_chunk: "vec4 applyFlightColorMatrix(vec4 c, vec4 a, vec4 b, vec4 d, vec4 e, vec4 o) { return c; }",
    draw_shape_meshes: draw_no_meshes,
    flush: flush_unhandled,
    record: record_nothing,
};

fn marker_contribution(_modifier: &dyn Modifier, _index: usize) -> String {
    return "// compiler-marker-B".to_string();
}

static MARKER_SNIPPET: GlModifierSnippet = GlModifierSnippet {
    kind: "acme.Replace",
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: None,
    bind: None,
    contribution: marker_contribution,
    declarations: None,
};

// TS `createModifierRegistry()`: an empty snippet table.
fn create_snippet_table() -> KindMap<&'static GlModifierSnippet> {
    return KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
}

// TS `registerModifier(registry, snippet)` on a fresh table.
fn snippet_table_with(snippet: &'static GlModifierSnippet) -> KindMap<&'static GlModifierSnippet> {
    return with_kind_map_entry(&create_snippet_table(), snippet.kind.to_string(), snippet);
}

fn share<T: Modifier>(modifier: T) -> Ref<dyn Modifier> {
    return Arc::new(RwLock::new(modifier));
}

fn fragment_source() -> String {
    return shader_sources()
        .into_iter()
        .find(|source| source.contains("fragColor"))
        .unwrap_or_default();
}

fn vertex_source() -> String {
    return shader_sources()
        .into_iter()
        .find(|source| source.contains("a_position") && !source.contains("fragColor"))
        .unwrap_or_default();
}

mod build_gl_shaded_cache_key {
    use super::*;

    #[test]
    fn namespaces_under_shaded_and_joins_base_flags_with_the_modifier_define_key() {
        assert_eq!(
            build_gl_shaded_cache_key(&base_key(), ""),
            "shaded:-------|"
        );
        assert_eq!(
            build_gl_shaded_cache_key(
                &GlShadedDefineKey {
                    has_diffuse_map: true,
                    ..base_key()
                },
                "EmissiveModifier:m"
            ),
            "shaded:-d-----|EmissiveModifier:m"
        );
    }

    #[test]
    fn encodes_a_non_identity_uv_transform_in_the_u_slot_ahead_of_skin() {
        let key = GlShadedDefineKey {
            has_uv_transform: true,
            ..base_key()
        };
        assert_eq!(build_gl_shaded_cache_key(&key, ""), "shaded:----u--|");
        assert_ne!(
            build_gl_shaded_cache_key(&key, ""),
            build_gl_shaded_cache_key(&base_key(), "")
        );
    }

    #[test]
    fn sets_the_trailing_skin_flag_so_a_skinned_variant_keys_distinctly_from_the_rigid_one() {
        let key = GlShadedDefineKey {
            has_skin: Some(true),
            ..base_key()
        };
        assert_eq!(build_gl_shaded_cache_key(&key, ""), "shaded:-----k-|");
        assert_ne!(
            build_gl_shaded_cache_key(&key, ""),
            build_gl_shaded_cache_key(&base_key(), "")
        );
    }
}

mod compile_gl_shaded_program {
    use super::*;

    #[test]
    fn assembles_the_lean_base_shader_with_no_modifier_glsl_for_an_empty_stack() {
        let gl = make_gl();
        compile_gl_shaded_program(&gl, &base_key(), &[], &create_snippet_table(), None, None);
        let fragment = fragment_source();
        assert!(fragment.contains("void main()"));
        assert!(fragment.contains("fragColor"));
        assert!(!fragment.contains("u_emissiveColor"));
    }

    #[test]
    fn injects_a_registered_modifier_snippet_at_its_slot_hook() {
        let gl = make_gl();
        let registry = snippet_table_with(&EMISSIVE_GL_MODIFIER_SNIPPET);
        let mut emissive = create_emissive_modifier();
        emissive.color = 0xffcc88ff;
        let modifiers = [share(emissive)];
        compile_gl_shaded_program(&gl, &base_key(), &modifiers, &registry, None, None);
        let fragment = fragment_source();
        assert!(fragment.contains("uniform vec3 u_emissiveColor_0;"));
        assert!(fragment.contains("emissive += emissiveTerm;"));
    }

    #[test]
    fn gram_schmidt_reorthogonalizes_the_tangent_frame_before_sampling_the_normal_map() {
        let gl = make_gl();
        let key = GlShadedDefineKey {
            has_normal_map: true,
            ..base_key()
        };
        compile_gl_shaded_program(&gl, &key, &[], &create_snippet_table(), None, None);
        let fragment = fragment_source();
        // The interpolated tangent is projected off the normal (the fix for the skewed-TBN normal-map bug).
        assert!(
            fragment
                .contains("v_tangent.xyz - geometricNormal * dot(v_tangent.xyz, geometricNormal)")
        );
        assert!(fragment.contains("normal = normalize(tbn * baseTangentNormal);"));
    }

    #[test]
    fn carries_the_tangent_through_the_model_matrix_and_the_mirror_through_its_handedness() {
        // A tangent is a true surface vector and follows the model matrix; only the normal is a covector
        // needing the inverse-transpose. They agree under rotation and uniform scale — which is why one
        // shared u_normalMatrix looked right — and diverge under non-uniform scale, tilting the tangent
        // off the surface. And the bitangent is rebuilt as w * cross(N, T), so a mirroring model
        // transform must reach tangent.w or every mirrored instance lights with a flipped frame.
        let gl = make_gl();
        let key = GlShadedDefineKey {
            has_normal_map: true,
            ..base_key()
        };
        compile_gl_shaded_program(&gl, &key, &[], &create_snippet_table(), None, None);
        let vertex = vertex_source();
        assert!(vertex.contains("mat3 modelRotation = mat3(u_model);"));
        assert!(
            vertex.contains("v_tangent = vec4(modelRotation * localTangent, tangentHandedness);")
        );
        assert!(vertex.contains("determinant(modelRotation) < 0.0 ? -1.0 : 1.0"));
        // The normal keeps the inverse-transpose: the point is that the two DIVERGE, not that the
        // tangent's matrix replaced both.
        assert!(vertex.contains("v_normal = u_normalMatrix * localNormal;"));
        // And the tangent must no longer ride the normal's matrix at all.
        assert!(!vertex.contains("u_normalMatrix * localTangent"));
    }

    #[test]
    fn reuses_gl_mesh_light_block_glsl_rather_than_declaring_a_second_light_block() {
        let gl = make_gl();
        compile_gl_shaded_program(&gl, &base_key(), &[], &create_snippet_table(), None, None);
        let fragment = fragment_source();
        // The shared block declares u_directional exactly once (no forked light loop).
        assert_eq!(fragment.matches("uniform vec4 u_directional;").count(), 1);
        assert_eq!(
            fragment
                .matches("float sampleDirectionalShadow(vec3 worldPos, vec3 geometricNormal)")
                .count(),
            1
        );
    }

    #[test]
    fn injects_the_skin_define_and_vertex_declarations_only_into_the_skinned_vertex_source() {
        let gl = make_gl();
        let key = GlShadedDefineKey {
            has_skin: Some(true),
            ..base_key()
        };
        compile_gl_shaded_program(
            &gl,
            &key,
            &[],
            &create_snippet_table(),
            None,
            Some(GL_SKIN_VERTEX_DECLARATIONS_GLSL),
        );
        let vertex = vertex_source();
        assert!(vertex.contains("#define HAS_SKIN"));
        assert!(!vertex.contains("#define MAX_JOINTS"));
        assert!(vertex.contains("sampler2D u_jointTexture"));
        assert!(vertex.contains("texelFetch"));
        assert!(vertex.contains("mat4 skinMatrix()"));
        assert!(vertex.contains("a_joints0"));
        // Skinning is vertex-only — the fragment stage never sees the skin attributes.
        assert!(!fragment_source().contains("a_joints0"));
    }

    #[test]
    fn leaves_the_rigid_vertex_source_free_of_the_skin_define_and_declarations() {
        let gl = make_gl();
        compile_gl_shaded_program(&gl, &base_key(), &[], &create_snippet_table(), None, None);
        let vertex = vertex_source();
        assert!(!vertex.contains("#define HAS_SKIN"));
        assert!(!vertex.contains("a_joints0"));
        assert!(!fragment_source().contains("a_joints0"));
    }

    #[test]
    fn splices_color_adjustment_after_shading_only_for_the_promoted_variant() {
        let base_gl = make_gl();
        compile_gl_shaded_program(
            &base_gl,
            &base_key(),
            &[],
            &create_snippet_table(),
            Some(&COLOR_FEATURE),
            None,
        );
        assert!(!fragment_source().contains("vec4 applyFlightColorAdjustment"));

        let adjusted_gl = make_gl();
        compile_gl_shaded_program(
            &adjusted_gl,
            &GlShadedDefineKey {
                has_color_adjustment: Some(true),
                ..base_key()
            },
            &[],
            &create_snippet_table(),
            Some(&COLOR_FEATURE),
            None,
        );
        let adjusted = fragment_source();
        assert!(adjusted.contains(COLOR_FEATURE.fragment_shader_chunk));
        assert!(adjusted.contains("fragColor = applyFlightColorAdjustment"));
    }

    #[test]
    fn splices_the_full_matrix_adjustment_after_shading() {
        let gl = make_gl();
        compile_gl_shaded_program(
            &gl,
            &GlShadedDefineKey {
                has_color_matrix: Some(true),
                ..base_key()
            },
            &[],
            &create_snippet_table(),
            Some(&COLOR_FEATURE),
            None,
        );
        let source = fragment_source();
        assert!(source.contains(COLOR_FEATURE.matrix_fragment_shader_chunk));
        assert!(source.contains("fragColor = applyFlightColorMatrix"));
    }

    #[test]
    fn injects_a_vertex_slot_modifier_into_the_vertex_source_never_the_fragment() {
        let gl = make_gl();
        let registry = snippet_table_with(&VERTEX_DISPLACE_GL_MODIFIER_SNIPPET);
        let mut displace = create_vertex_displace_modifier();
        displace.source = VertexDisplaceModifierSource::Sine;
        displace.amplitude = 0.2;
        let modifiers = [share(displace)];
        compile_gl_shaded_program(&gl, &base_key(), &modifiers, &registry, None, None);
        let vertex = vertex_source();
        assert!(vertex.contains("localPosition.xyz += vDisplaceAxis * vDisplaceAmount;"));
        assert!(vertex.contains("uniform float u_vDisplaceAmplitude_0;"));
        assert!(!fragment_source().contains("u_vDisplaceAmplitude_0"));
    }

    #[test]
    fn dedupes_the_shared_ibl_environment_declaration_across_two_env_reflect_modifiers() {
        let gl = make_gl();
        let registry = snippet_table_with(&ENV_REFLECT_GL_MODIFIER_SNIPPET);
        let modifiers = [
            share(create_env_reflect_modifier()),
            share(create_env_reflect_modifier()),
        ];
        compile_gl_shaded_program(&gl, &base_key(), &modifiers, &registry, None, None);
        let fragment = fragment_source();
        // The shared samplerCube declares once (deduped), while the per-instance tints stay distinct.
        assert_eq!(
            fragment
                .matches("uniform samplerCube u_iblPrefiltered;")
                .count(),
            1
        );
        assert!(fragment.contains("u_envReflectTint_0"));
        assert!(fragment.contains("u_envReflectTint_1"));
    }
}

mod ensure_gl_shaded_program {
    use super::*;

    #[test]
    fn caches_the_compiled_program_under_a_shaded_key_and_reuses_it() {
        let state = make_gl_scene3d_state();
        let first = ensure_gl_shaded_program(&state, &base_key(), &[]);
        let second = ensure_gl_shaded_program(&state, &base_key(), &[]);
        assert!(Rc::ptr_eq(&first, &second));
        assert!(
            get_gl_scene3d_runtime(&state)
                .program_cache
                .keys()
                .any(|key| key.starts_with("shaded:"))
        );
    }

    #[test]
    fn folds_the_render_state_skinned_run_flag_into_a_distinct_has_skin_variant() {
        let state = make_gl_scene3d_state();
        let rigid = ensure_gl_shaded_program(&state, &base_key(), &[]);
        get_gl_scene3d_runtime(&state).active_skinned_run = true;
        let skinned = ensure_gl_shaded_program(&state, &base_key(), &[]);

        assert!(!Rc::ptr_eq(&skinned, &rigid));
        assert!(
            get_gl_scene3d_runtime(&state)
                .program_cache
                .contains_key("shaded:-----k-||registry:0")
        );
        assert!(matches!(skinned.loc_joint_texture.get(), Some(Some(_))));
    }

    #[test]
    fn compiles_distinct_variants_for_distinct_modifier_feature_sets() {
        let mut state = make_gl_scene3d_state();
        register_built_in_gl_modifier_snippets(&mut state);
        ensure_gl_shaded_program(&state, &base_key(), &[]);
        let mut emissive = create_emissive_modifier();
        emissive.color = 0xffffffff;
        ensure_gl_shaded_program(&state, &base_key(), &[share(emissive)]);
        let keys: HashSet<String> = get_gl_scene3d_runtime(&state)
            .program_cache
            .keys()
            .filter(|key| key.starts_with("shaded:"))
            .cloned()
            .collect();
        assert_eq!(keys.len(), 2);
    }

    #[test]
    fn recompiles_after_a_last_write_wins_snippet_replacement_with_the_same_define_signature() {
        let mut state = make_gl_scene3d_state();
        let modifier = {
            let mut out = create_rim_modifier();
            out.kind = "acme.Replace".to_string();
            out.slot = MODIFIER_SLOT_EFFECT.to_string();
            share(out)
        };
        ensure_gl_shaded_program(&state, &base_key(), std::slice::from_ref(&modifier));
        let before = calls_named("link_program");

        register_gl_modifier_snippet(&mut state, &MARKER_SNIPPET);
        ensure_gl_shaded_program(&state, &base_key(), std::slice::from_ref(&modifier));

        assert_eq!(calls_named("link_program"), before + 1);
        assert!(
            shader_sources()
                .iter()
                .any(|source| source.contains("compiler-marker-B"))
        );
    }
}
