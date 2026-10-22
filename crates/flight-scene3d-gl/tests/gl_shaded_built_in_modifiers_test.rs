use std::num::NonZeroU32;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::{create_vector2, create_vector3};
use flight_render_gl::{GlModifierBindContext, GlModifierSnippet, GlRenderState};
use flight_scene3d_gl::contract::*;
use flight_shading::{
    ANIMATED_NORMAL_MODIFIER_KIND, AnimatedNormalModifier, DISSOLVE_MODIFIER_KIND, DissolveModifier,
    EMISSIVE_MODIFIER_KIND, ENV_REFLECT_MODIFIER_KIND, EmissiveModifier, EmissiveModifierFacing,
    FOG_MODIFIER_KIND, FogModifier, FogModifierMode, Modifier, RIM_MODIFIER_KIND, RimModifier,
    TOON_MODIFIER_KIND, ToonModifier, VERTEX_DISPLACE_MODIFIER_KIND, VertexDisplaceModifier,
    VertexDisplaceModifierSource, create_animated_normal_modifier, create_dissolve_modifier,
    create_emissive_modifier, create_env_reflect_modifier, create_fog_modifier, create_rim_modifier,
    create_toon_modifier, create_vertex_displace_modifier,
};
use flight_texture::{Texture, create_texture};

use crate::gl_test_helper::{calls_with, count_calls, make_gl_scene3d_state};

// A Texture whose image is unloaded — the snippet binds the sampler unit without an upload.
fn unloaded_texture() -> Ref<Texture> {
    return Arc::new(RwLock::new(create_texture(None)));
}

// TS `makeContext`: a bind context over `state` whose texture-unit allocator hands out units from 3,
// or always -1 when `exhausted`.
fn bind_with_context(
    snippet: &GlModifierSnippet,
    modifier: &dyn Modifier,
    state: &mut GlRenderState,
    exhausted: bool,
) {
    let mut unit = 3;
    let mut acquire = || -> i32 {
        if exhausted {
            return -1;
        }
        let next = unit;
        unit += 1;
        return next;
    };
    let mut context = GlModifierBindContext {
        acquire_modifier_texture_unit: &mut acquire,
        index: 0,
        program: glow::NativeProgram(NonZeroU32::new(1).unwrap()),
        state,
    };
    (snippet.bind.unwrap())(modifier, &mut context);
}

fn signature(snippet: &GlModifierSnippet, modifier: &dyn Modifier) -> String {
    return (snippet.get_define_signature.unwrap())(modifier);
}

fn animated_normal(map: bool, scroll_x: f32, scroll_y: f32) -> AnimatedNormalModifier {
    let mut modifier = create_animated_normal_modifier();
    modifier.map = if map { Some(unloaded_texture()) } else { None };
    modifier.scroll = create_vector2(scroll_x, scroll_y);
    return modifier;
}

fn dissolve(threshold: f32, map: bool) -> DissolveModifier {
    let mut modifier = create_dissolve_modifier();
    modifier.threshold = threshold;
    modifier.map = if map { Some(unloaded_texture()) } else { None };
    return modifier;
}

fn emissive(color: u32, facing: EmissiveModifierFacing) -> EmissiveModifier {
    let mut modifier = create_emissive_modifier();
    modifier.color = color;
    modifier.facing = facing;
    return modifier;
}

fn fog(color: u32, mode: FogModifierMode) -> FogModifier {
    let mut modifier = create_fog_modifier();
    modifier.color = color;
    modifier.mode = mode;
    return modifier;
}

fn rim(color: u32) -> RimModifier {
    let mut modifier = create_rim_modifier();
    modifier.color = color;
    return modifier;
}

fn toon(steps: f32) -> ToonModifier {
    let mut modifier = create_toon_modifier();
    modifier.steps = steps;
    return modifier;
}

fn vertex_displace(source: VertexDisplaceModifierSource, amplitude: f32, axis: bool) -> VertexDisplaceModifier {
    let mut modifier = create_vertex_displace_modifier();
    modifier.source = source;
    modifier.amplitude = amplitude;
    modifier.axis = if axis { Some(create_vector3(0.0, 1.0, 0.0)) } else { None };
    return modifier;
}

fn is_snippet(actual: Option<&'static GlModifierSnippet>, expected: &'static GlModifierSnippet) -> bool {
    return actual.is_some_and(|actual| std::ptr::eq(actual, expected));
}

mod animated_normal_gl_modifier_snippet {
    use super::*;

    #[test]
    fn reports_the_disabled_single_dual_define_signature_from_map_structure() {
        let disabled = animated_normal(false, 0.0, 0.0);
        let single = animated_normal(true, 0.1, 0.0);
        let mut dual = animated_normal(true, 0.1, 0.0);
        dual.secondary_map = Some(unloaded_texture());
        dual.secondary_scroll = Some(create_vector2(-0.05, 0.0));
        assert_eq!(signature(&ANIMATED_NORMAL_GL_MODIFIER_SNIPPET, &disabled), "0");
        assert_eq!(signature(&ANIMATED_NORMAL_GL_MODIFIER_SNIPPET, &single), "1");
        assert_eq!(signature(&ANIMATED_NORMAL_GL_MODIFIER_SNIPPET, &dual), "2");
    }

    #[test]
    fn emits_u_time_scrolled_sampling_into_the_normal_for_a_mapped_modifier() {
        let modifier = animated_normal(true, 0.1, 0.0);
        let contribution = (ANIMATED_NORMAL_GL_MODIFIER_SNIPPET.contribution)(&modifier, 0);
        assert!(contribution.contains("u_animNormalScroll_0 * u_time"));
        assert!(contribution.contains("normal = normalize(tbn * animNormal);"));
    }

    #[test]
    fn emits_nothing_for_a_disabled_null_map_modifier() {
        let modifier = animated_normal(false, 0.0, 0.0);
        assert_eq!((ANIMATED_NORMAL_GL_MODIFIER_SNIPPET.declarations.unwrap())(&modifier, 0), "");
        assert_eq!((ANIMATED_NORMAL_GL_MODIFIER_SNIPPET.contribution)(&modifier, 0), "");
    }

    #[test]
    fn bind_uploads_scroll_and_strength_and_binds_the_sampler_unit() {
        let mut state = make_gl_scene3d_state();
        let mut modifier = animated_normal(true, 0.2, 0.3);
        modifier.strength = 2.0;
        bind_with_context(&ANIMATED_NORMAL_GL_MODIFIER_SNIPPET, &modifier, &mut state, false);
        assert_eq!(count_calls("uniform_2_f32"), 1);
        assert_eq!(count_calls("uniform_1_f32"), 1);
        assert_eq!(count_calls("uniform_1_i32"), 1);
    }

    #[test]
    fn bind_is_a_no_op_for_a_disabled_modifier() {
        let mut state = make_gl_scene3d_state();
        let modifier = animated_normal(false, 0.0, 0.0);
        bind_with_context(&ANIMATED_NORMAL_GL_MODIFIER_SNIPPET, &modifier, &mut state, false);
        assert_eq!(count_calls("uniform_2_f32"), 0);
        assert_eq!(count_calls("uniform_1_i32"), 0);
    }

    #[test]
    fn drops_the_sampler_no_bind_when_the_texture_unit_allocator_is_exhausted() {
        let mut state = make_gl_scene3d_state();
        let modifier = animated_normal(true, 0.2, 0.3);
        bind_with_context(&ANIMATED_NORMAL_GL_MODIFIER_SNIPPET, &modifier, &mut state, true);
        assert_eq!(count_calls("uniform_1_i32"), 0);
        assert_eq!(count_calls("active_texture"), 0);
    }
}

mod dissolve_gl_modifier_snippet {
    use super::*;

    #[test]
    fn reports_the_procedural_mapped_define_signature_structurally() {
        assert_eq!(signature(&DISSOLVE_GL_MODIFIER_SNIPPET, &dissolve(0.5, false)), "");
        assert_eq!(signature(&DISSOLVE_GL_MODIFIER_SNIPPET, &dissolve(0.5, true)), "m");
    }

    #[test]
    fn discards_below_threshold_and_tints_the_burn_edge_into_the_radiance() {
        let contribution = (DISSOLVE_GL_MODIFIER_SNIPPET.contribution)(&dissolve(0.4, false), 0);
        assert!(contribution.contains("discard;"));
        assert!(contribution.contains("radiance = mix(radiance, u_dissolveEdgeColor_0, dissolveEdge);"));
        assert!(contribution.contains("shadedValueNoise"));
    }

    #[test]
    fn samples_the_noise_map_instead_of_procedural_noise_when_a_map_is_set() {
        let contribution = (DISSOLVE_GL_MODIFIER_SNIPPET.contribution)(&dissolve(0.4, true), 1);
        assert!(contribution.contains("texture(u_dissolveMap_1, v_uv0).r"));
        assert!(!contribution.contains("shadedValueNoise"));
    }

    #[test]
    fn bind_uploads_threshold_edge_and_the_noise_scale_for_the_procedural_variant() {
        let mut state = make_gl_scene3d_state();
        bind_with_context(&DISSOLVE_GL_MODIFIER_SNIPPET, &dissolve(0.5, false), &mut state, false);
        // threshold + edgeWidth + scale.
        assert_eq!(count_calls("uniform_1_f32"), 3);
        assert_eq!(count_calls("uniform_3_f32"), 1);
    }
}

mod emissive_gl_modifier_snippet {
    use super::*;

    #[test]
    fn reports_the_mask_gate_define_signature_structurally() {
        assert_eq!(
            signature(&EMISSIVE_GL_MODIFIER_SNIPPET, &emissive(0xffffffff, EmissiveModifierFacing::Ignore)),
            ""
        );
        assert_eq!(
            signature(
                &EMISSIVE_GL_MODIFIER_SNIPPET,
                &emissive(0xffffffff, EmissiveModifierFacing::AwayFromLight)
            ),
            "g"
        );
        let mut masked = emissive(0xffffffff, EmissiveModifierFacing::AwayFromLight);
        masked.mask = Some(unloaded_texture());
        assert_eq!(signature(&EMISSIVE_GL_MODIFIER_SNIPPET, &masked), "mg");
    }

    #[test]
    fn gates_the_contribution_by_facing_only_when_gated() {
        let plain = (EMISSIVE_GL_MODIFIER_SNIPPET.contribution)(&emissive(0xffffffff, EmissiveModifierFacing::Ignore), 0);
        assert!(!plain.contains("u_emissiveFacingSign_0"));
        let gated = (EMISSIVE_GL_MODIFIER_SNIPPET.contribution)(
            &emissive(0xffffffff, EmissiveModifierFacing::AwayFromLight),
            0,
        );
        assert!(gated.contains("u_emissiveFacingSign_0"));
        assert!(gated.contains("emissive += emissiveTerm;"));
    }

    #[test]
    fn bind_uploads_color_and_strength_plus_the_facing_sign_when_gated() {
        let mut state = make_gl_scene3d_state();
        bind_with_context(
            &EMISSIVE_GL_MODIFIER_SNIPPET,
            &emissive(0xffcc88ff, EmissiveModifierFacing::Ignore),
            &mut state,
            false,
        );
        assert_eq!(count_calls("uniform_3_f32"), 1);
        let plain_floats = count_calls("uniform_1_f32");
        assert_eq!(plain_floats, 1);

        let mut gated = make_gl_scene3d_state();
        let mut modifier = emissive(0xffcc88ff, EmissiveModifierFacing::AwayFromLight);
        modifier.facing_softness = 0.1;
        bind_with_context(&EMISSIVE_GL_MODIFIER_SNIPPET, &modifier, &mut gated, false);
        // strength + facing sign + facing softness.
        assert_eq!(count_calls("uniform_1_f32"), 3);
    }
}

mod env_reflect_gl_modifier_snippet {
    use super::*;

    #[test]
    fn has_no_define_signature_single_program_shape() {
        assert!(ENV_REFLECT_GL_MODIFIER_SNIPPET.get_define_signature.is_none());
    }

    #[test]
    fn reflects_the_view_vector_and_samples_the_shared_prefiltered_environment_cube() {
        let contribution = (ENV_REFLECT_GL_MODIFIER_SNIPPET.contribution)(&create_env_reflect_modifier(), 0);
        assert!(contribution.contains("reflect(-viewDir, normal)"));
        assert!(contribution.contains("textureLod(u_iblPrefiltered, envReflectDir"));
        assert!(contribution.contains("radiance +="));
    }

    #[test]
    fn declares_the_shared_ibl_environment_samplers_so_two_instances_can_be_deduped() {
        let declarations = (ENV_REFLECT_GL_MODIFIER_SNIPPET.declarations.unwrap())(&create_env_reflect_modifier(), 0);
        assert!(declarations.contains("uniform samplerCube u_iblPrefiltered;"));
        assert!(declarations.contains("uniform float u_iblEnabled;"));
    }

    #[test]
    fn bind_uploads_the_tint_and_the_three_reflection_scalars() {
        let mut state = make_gl_scene3d_state();
        bind_with_context(&ENV_REFLECT_GL_MODIFIER_SNIPPET, &create_env_reflect_modifier(), &mut state, false);
        assert_eq!(count_calls("uniform_3_f32"), 1);
        // intensity + fresnel + roughness.
        assert_eq!(count_calls("uniform_1_f32"), 3);
    }
}

mod fog_gl_modifier_snippet {
    use super::*;

    #[test]
    fn reports_the_mode_define_signature_structurally() {
        assert_eq!(signature(&FOG_GL_MODIFIER_SNIPPET, &fog(0xffffffff, FogModifierMode::Linear)), "l");
        assert_eq!(signature(&FOG_GL_MODIFIER_SNIPPET, &fog(0xffffffff, FogModifierMode::Exponential)), "e");
        assert_eq!(signature(&FOG_GL_MODIFIER_SNIPPET, &fog(0xffffffff, FogModifierMode::Exponential2)), "x");
    }

    #[test]
    fn emits_a_near_far_ramp_for_linear_and_an_exp_falloff_for_exponential() {
        let linear = (FOG_GL_MODIFIER_SNIPPET.contribution)(&fog(0xffffffff, FogModifierMode::Linear), 0);
        assert!(linear.contains("u_fogNear_0"));
        assert!(linear.contains("length(u_cameraPosition - v_worldPosition)"));
        let exp = (FOG_GL_MODIFIER_SNIPPET.contribution)(&fog(0xffffffff, FogModifierMode::Exponential), 0);
        assert!(exp.contains("exp(-u_fogDensity_0 * fogDist)"));
    }

    #[test]
    fn bind_uploads_the_color_and_near_far_for_linear_density_for_exponential() {
        let mut linear = make_gl_scene3d_state();
        bind_with_context(&FOG_GL_MODIFIER_SNIPPET, &fog(0xaabbccff, FogModifierMode::Linear), &mut linear, false);
        assert_eq!(count_calls("uniform_3_f32"), 1);
        assert_eq!(count_calls("uniform_1_f32"), 2);

        let mut exp = make_gl_scene3d_state();
        let mut modifier = fog(0xaabbccff, FogModifierMode::Exponential2);
        modifier.density = 0.02;
        bind_with_context(&FOG_GL_MODIFIER_SNIPPET, &modifier, &mut exp, false);
        assert_eq!(count_calls("uniform_1_f32"), 1);
    }
}

mod register_built_in_gl_modifier_snippets {
    use super::*;

    #[test]
    fn registers_all_eight_built_in_snippets_on_the_state() {
        let mut state = make_gl_scene3d_state();
        register_built_in_gl_modifier_snippets(&mut state);
        assert!(is_snippet(
            resolve_gl_modifier_snippet(&state, ANIMATED_NORMAL_MODIFIER_KIND),
            &ANIMATED_NORMAL_GL_MODIFIER_SNIPPET
        ));
        assert!(is_snippet(
            resolve_gl_modifier_snippet(&state, EMISSIVE_MODIFIER_KIND),
            &EMISSIVE_GL_MODIFIER_SNIPPET
        ));
        assert!(is_snippet(resolve_gl_modifier_snippet(&state, RIM_MODIFIER_KIND), &RIM_GL_MODIFIER_SNIPPET));
        assert!(is_snippet(
            resolve_gl_modifier_snippet(&state, ENV_REFLECT_MODIFIER_KIND),
            &ENV_REFLECT_GL_MODIFIER_SNIPPET
        ));
        assert!(is_snippet(resolve_gl_modifier_snippet(&state, FOG_MODIFIER_KIND), &FOG_GL_MODIFIER_SNIPPET));
        assert!(is_snippet(
            resolve_gl_modifier_snippet(&state, DISSOLVE_MODIFIER_KIND),
            &DISSOLVE_GL_MODIFIER_SNIPPET
        ));
        assert!(is_snippet(resolve_gl_modifier_snippet(&state, TOON_MODIFIER_KIND), &TOON_GL_MODIFIER_SNIPPET));
        assert!(is_snippet(
            resolve_gl_modifier_snippet(&state, VERTEX_DISPLACE_MODIFIER_KIND),
            &VERTEX_DISPLACE_GL_MODIFIER_SNIPPET
        ));
    }
}

mod rim_gl_modifier_snippet {
    use super::*;

    #[test]
    fn has_no_define_signature_single_program_shape() {
        assert!(RIM_GL_MODIFIER_SNIPPET.get_define_signature.is_none());
    }

    #[test]
    fn adds_a_view_dependent_fresnel_term_to_the_radiance() {
        let contribution = (RIM_GL_MODIFIER_SNIPPET.contribution)(&rim(0x88ccffff), 0);
        assert!(contribution.contains("dot(normal, viewDir)"));
        assert!(contribution.contains("radiance += u_rimColor_0 * rim;"));
    }

    #[test]
    fn bind_uploads_the_rim_color_and_power_intensity_bias_uniforms() {
        let mut state = make_gl_scene3d_state();
        bind_with_context(&RIM_GL_MODIFIER_SNIPPET, &rim(0x88ccffff), &mut state, false);
        assert_eq!(count_calls("uniform_3_f32"), 1);
        assert_eq!(count_calls("uniform_1_f32"), 3);
    }
}

mod toon_gl_modifier_snippet {
    use super::*;

    #[test]
    fn has_no_define_signature_single_program_shape() {
        assert!(TOON_GL_MODIFIER_SNIPPET.get_define_signature.is_none());
    }

    #[test]
    fn quantizes_the_radiance_luminance_into_cel_bands() {
        let contribution = (TOON_GL_MODIFIER_SNIPPET.contribution)(&toon(3.0), 0);
        assert!(contribution.contains("u_toonSteps_0"));
        assert!(contribution.contains("radiance *="));
    }

    #[test]
    fn bind_uploads_steps_floored_at_2_and_smoothness() {
        let mut state = make_gl_scene3d_state();
        bind_with_context(&TOON_GL_MODIFIER_SNIPPET, &toon(1.0), &mut state, false);
        assert_eq!(count_calls("uniform_1_f32"), 2);
        let steps_call = &calls_with("uniform_1_f32")[0];
        assert_eq!(steps_call.floats[0], 2.0);
    }
}

mod vertex_displace_gl_modifier_snippet {
    use super::*;

    #[test]
    fn reports_the_source_and_fixed_axis_define_signature_structurally() {
        assert_eq!(
            signature(
                &VERTEX_DISPLACE_GL_MODIFIER_SNIPPET,
                &vertex_displace(VertexDisplaceModifierSource::Sine, 1.0, false)
            ),
            "s"
        );
        assert_eq!(
            signature(
                &VERTEX_DISPLACE_GL_MODIFIER_SNIPPET,
                &vertex_displace(VertexDisplaceModifierSource::HeightMap, 1.0, false)
            ),
            "h"
        );
        assert_eq!(
            signature(
                &VERTEX_DISPLACE_GL_MODIFIER_SNIPPET,
                &vertex_displace(VertexDisplaceModifierSource::Sine, 1.0, true)
            ),
            "sa"
        );
    }

    #[test]
    fn displaces_local_position_along_the_normal_with_a_u_time_scrolled_sine_wave() {
        let contribution = (VERTEX_DISPLACE_GL_MODIFIER_SNIPPET.contribution)(
            &vertex_displace(VertexDisplaceModifierSource::Sine, 0.2, false),
            0,
        );
        assert!(contribution.contains("normalize(localNormal)"));
        assert!(contribution.contains("u_time * u_vDisplaceSpeed_0"));
        assert!(contribution.contains("localPosition.xyz += vDisplaceAxis * vDisplaceAmount;"));
    }

    #[test]
    fn reads_the_height_map_and_a_fixed_axis_when_configured() {
        let contribution = (VERTEX_DISPLACE_GL_MODIFIER_SNIPPET.contribution)(
            &vertex_displace(VertexDisplaceModifierSource::HeightMap, 1.0, true),
            2,
        );
        assert!(contribution.contains("texture(u_vDisplaceMap_2, vertexUv).r"));
        assert!(contribution.contains("normalize(u_vDisplaceAxis_2)"));
    }

    #[test]
    fn bind_uploads_amplitude_plus_the_sine_wave_params_for_the_procedural_source() {
        let mut state = make_gl_scene3d_state();
        bind_with_context(
            &VERTEX_DISPLACE_GL_MODIFIER_SNIPPET,
            &vertex_displace(VertexDisplaceModifierSource::Sine, 0.3, false),
            &mut state,
            false,
        );
        // amplitude + frequency + speed.
        assert_eq!(count_calls("uniform_1_f32"), 3);
        // direction.
        assert_eq!(count_calls("uniform_3_f32"), 1);
    }
}
