use flight_materials::STANDARD_MATERIAL_KIND;
use flight_node::{NodeRef, RendererDataRef};
use flight_render::{
    CatalogEntry, CatalogRegistration, NodeRenderer, RenderProxy2D, RenderRegistryTable,
    SceneCoverage, SceneCoverageCatalog, SceneCoverageEntry, register_node_renderer,
};
use flight_render_gl::{
    GlBlendFactor, GlBlendRealization, GlRenderState, register_gl_blend_mode,
    register_gl_quad_material_renderer,
};
use flight_requirement::RequirementFacet;
use flight_scene2d::Scene2DKindUsage;
use flight_scene2d::contract::create_scene2d_kind_usage;
use flight_scene2d_gl::*;

use crate::gl_test_helper::create_gl_state;

fn create_no_data(_state: &mut GlRenderState, _source: &NodeRef) -> Option<RendererDataRef> {
    return None;
}

fn submit_noop(_state: &mut GlRenderState, _proxy: &RenderProxy2D<GlRenderState>) {}

static NODE_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: None,
    create_data: create_no_data,
    destroy_data: None,
    is_dirty: None,
    submit: submit_noop,
};

fn coverage_catalog() -> SceneCoverageCatalog {
    return vec![
        CatalogEntry {
            kind: flight_materials::BLEND_MODE_MULTIPLY.to_string(),
            registrations: vec![CatalogRegistration {
                module: "@flighthq/scene2d-gl".to_string(),
                registrar: "registerGlMultiplyBlendMode".to_string(),
            }],
            registry: RenderRegistryTable::BlendRealization,
        },
        CatalogEntry {
            kind: "acme.Custom".to_string(),
            registrations: vec![CatalogRegistration {
                module: "@acme/gl".to_string(),
                registrar: "registerAcmeGlMaterial".to_string(),
            }],
            registry: RenderRegistryTable::MaterialRenderer,
        },
    ];
}

fn usage(blend_modes: &[&str], material_kinds: &[&str], node_kinds: &[&str]) -> Scene2DKindUsage {
    let mut out = create_scene2d_kind_usage();
    out.blend_modes = blend_modes.iter().map(|value| value.to_string()).collect();
    out.material_kinds = material_kinds.iter().map(|value| value.to_string()).collect();
    out.node_kinds = node_kinds.iter().map(|value| value.to_string()).collect();
    return out;
}

fn entries(state: &GlRenderState, usage: &Scene2DKindUsage) -> Vec<SceneCoverageEntry> {
    let mut out = Vec::new();
    explain_gl_scene2d_coverage(&mut out, state, usage, &coverage_catalog());
    return out;
}

fn register_multiply(state: &mut GlRenderState) {
    register_gl_blend_mode(
        state,
        flight_materials::BLEND_MODE_MULTIPLY.to_string(),
        GlBlendRealization {
            src: GlBlendFactor::DstColor,
            dst: GlBlendFactor::OneMinusSrcAlpha,
            equation: None,
        },
    );
}

fn entry(
    coverage: SceneCoverage,
    facet: RequirementFacet,
    kind: &str,
    registry: RenderRegistryTable,
    remedy: Option<(&str, &str)>,
) -> SceneCoverageEntry {
    return SceneCoverageEntry {
        coverage,
        facet,
        kind: kind.to_string(),
        registry,
        module: remedy.map(|value| value.0.to_string()),
        registrar: remedy.map(|value| value.1.to_string()),
    };
}

mod explain_gl_scene2d_coverage {
    use super::*;

    #[test]
    fn includes_the_shared_node_renderer_answer_rather_than_restating_it() {
        let mut state = create_gl_state();
        register_node_renderer(&mut state, "Shape".to_string(), &NODE_RENDERER);
        assert!(entries(&state, &usage(&[], &[], &["Shape"])).contains(&entry(
            SceneCoverage::Satisfied,
            RequirementFacet::SceneNodeKind,
            "Shape",
            RenderRegistryTable::NodeRenderer,
            None,
        )));
    }

    #[test]
    fn reports_an_unregistered_blend_mode_as_a_remediable_fallback() {
        let state = create_gl_state();
        assert_eq!(
            entries(&state, &usage(&[flight_materials::BLEND_MODE_MULTIPLY], &[], &[])),
            vec![entry(
                SceneCoverage::FallbackRemediable,
                RequirementFacet::SceneBlendMode,
                flight_materials::BLEND_MODE_MULTIPLY,
                RenderRegistryTable::BlendRealization,
                Some(("@flighthq/scene2d-gl", "registerGlMultiplyBlendMode")),
            )]
        );
    }

    #[test]
    fn reports_a_registered_blend_mode_as_satisfied() {
        let mut state = create_gl_state();
        register_multiply(&mut state);
        assert_eq!(
            entries(&state, &usage(&[flight_materials::BLEND_MODE_MULTIPLY], &[], &[])),
            vec![entry(
                SceneCoverage::Satisfied,
                RequirementFacet::SceneBlendMode,
                flight_materials::BLEND_MODE_MULTIPLY,
                RenderRegistryTable::BlendRealization,
                None,
            )]
        );
    }

    #[test]
    fn reports_an_unregistered_material_as_actionable_when_nothing_can_absorb_it() {
        let state = create_gl_state();
        assert!(entries(&state, &usage(&[], &["acme.Custom"], &[])).contains(&entry(
            SceneCoverage::Unregistered,
            RequirementFacet::SceneMaterialKind,
            "acme.Custom",
            RenderRegistryTable::MaterialRenderer,
            Some(("@acme/gl", "registerAcmeGlMaterial")),
        )));
    }

    #[test]
    fn downgrades_the_material_gap_to_fallback_once_a_standard_renderer_can_absorb_it() {
        let mut state = create_gl_state();
        register_gl_quad_material_renderer(
            &mut state,
            STANDARD_MATERIAL_KIND.to_string(),
            &STANDARD_GL_QUAD_MATERIAL_RENDERER,
        );
        assert!(entries(&state, &usage(&[], &["acme.Custom"], &[])).contains(&entry(
            SceneCoverage::FallbackRemediable,
            RequirementFacet::SceneMaterialKind,
            "acme.Custom",
            RenderRegistryTable::MaterialRenderer,
            Some(("@acme/gl", "registerAcmeGlMaterial")),
        )));
    }
}

mod has_gl_scene2d_coverage {
    use super::*;

    #[test]
    fn is_false_when_only_the_shared_half_is_unserved_so_composition_cannot_hide_a_gap() {
        let mut state = create_gl_state();
        register_multiply(&mut state);
        assert!(!has_gl_scene2d_coverage(&state, &usage(&[flight_materials::BLEND_MODE_MULTIPLY], &[], &["Shape"])));
    }

    #[test]
    fn is_false_when_only_the_gl_half_is_unserved() {
        let mut state = create_gl_state();
        register_node_renderer(&mut state, "Shape".to_string(), &NODE_RENDERER);
        assert!(!has_gl_scene2d_coverage(&state, &usage(&[flight_materials::BLEND_MODE_MULTIPLY], &[], &["Shape"])));
    }

    #[test]
    fn is_true_once_both_halves_are_served() {
        let mut state = create_gl_state();
        register_node_renderer(&mut state, "Shape".to_string(), &NODE_RENDERER);
        register_multiply(&mut state);
        assert!(has_gl_scene2d_coverage(&state, &usage(&[flight_materials::BLEND_MODE_MULTIPLY], &[], &["Shape"])));
    }

    #[test]
    fn agrees_with_the_explain_tier_so_the_two_can_never_disagree() {
        let mut state = create_gl_state();
        register_node_renderer(&mut state, "Shape".to_string(), &NODE_RENDERER);
        let usage = usage(&[], &["acme.Custom"], &["Shape"]);
        let out = entries(&state, &usage);
        let gaps = out
            .iter()
            .filter(|entry| entry.coverage != SceneCoverage::Satisfied)
            .count();
        assert_eq!(has_gl_scene2d_coverage(&state, &usage), gaps == 0);
    }
}
