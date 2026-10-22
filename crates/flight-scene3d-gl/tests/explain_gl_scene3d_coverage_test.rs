use flight_materials::STANDARD_MATERIAL_KIND;
use flight_render::{
    CatalogEntry, CatalogRegistration, RenderRegistryTable, SceneCoverage, SceneCoverageCatalog,
    SceneCoverageEntry,
};
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState};
use flight_requirement::RequirementFacet;
use flight_scene3d::{Scene3DKindUsage, create_scene3d_kind_usage};
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::make_gl_scene3d_state;

fn noop_bind(
    _state: &mut GlRenderState,
    _material: Option<&dyn flight_materials::Material3D>,
    _lights: &std::rc::Rc<flight_lighting::Scene3DLightBlock>,
    _camera: &flight_camera::Camera3D,
) {
}

fn noop_draw(
    _state: &mut GlRenderState,
    _proxy: &flight_render::Scene3DRenderProxy,
    _geometry: &flight_meshgeometry::MeshGeometry,
) {
}

static RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: noop_bind,
    draw: noop_draw,
};

fn registration(registrar: &str) -> Vec<CatalogRegistration> {
    return vec![CatalogRegistration {
        module: "@flighthq/scene3d-gl".to_string(),
        registrar: registrar.to_string(),
    }];
}

fn coverage_catalog() -> SceneCoverageCatalog {
    return vec![
        CatalogEntry {
            kind: "ShadedMaterial".to_string(),
            registrations: registration("registerGlShadedMaterial"),
            registry: RenderRegistryTable::MaterialRenderer,
        },
        CatalogEntry {
            kind: "image".to_string(),
            registrations: registration("registerGlImageTextureResolver"),
            registry: RenderRegistryTable::TextureResolver,
        },
        CatalogEntry {
            kind: "RimModifier".to_string(),
            registrations: registration("registerGlRimModifier"),
            registry: RenderRegistryTable::ModifierSnippet,
        },
    ];
}

// The usage a ShadedMaterial mesh with an embedded image diffuse map (and optionally a rim modifier)
// reports (TS `getScene3DKindUsage` over the shambler-like scene).
fn shambler_like_usage(with_modifier: bool) -> Scene3DKindUsage {
    let mut usage = create_scene3d_kind_usage();
    usage.material_kinds = vec!["ShadedMaterial".to_string()];
    usage.texture_source_kinds = vec!["image".to_string()];
    usage.node_kinds = vec!["Mesh".to_string()];
    if with_modifier {
        usage.modifier_kinds = vec!["RimModifier".to_string()];
    }
    return usage;
}

fn gaps(state: &GlRenderState, with_modifier: bool) -> Vec<SceneCoverageEntry> {
    let mut out = Vec::new();
    explain_gl_scene3d_coverage(&mut out, state, &shambler_like_usage(with_modifier), &coverage_catalog());
    return out;
}

fn remediable(
    coverage: SceneCoverage,
    facet: RequirementFacet,
    kind: &str,
    registrar: &str,
    registry: RenderRegistryTable,
) -> SceneCoverageEntry {
    return SceneCoverageEntry {
        coverage,
        facet,
        kind: kind.to_string(),
        registry,
        module: Some("@flighthq/scene3d-gl".to_string()),
        registrar: Some(registrar.to_string()),
    };
}

mod explain_gl_scene3d_coverage {
    use super::*;

    #[test]
    fn reports_a_bare_state_with_remedies_for_both_unregistered_requirements() {
        let found = gaps(&make_gl_scene3d_state(), false);
        assert!(found.contains(&remediable(
            SceneCoverage::Unregistered,
            RequirementFacet::SceneMaterialKind,
            "ShadedMaterial",
            "registerGlShadedMaterial",
            RenderRegistryTable::MaterialRenderer,
        )));
        assert!(found.contains(&remediable(
            SceneCoverage::Unregistered,
            RequirementFacet::SceneTextureSourceKind,
            "image",
            "registerGlImageTextureResolver",
            RenderRegistryTable::TextureResolver,
        )));
    }

    #[test]
    fn downgrades_the_material_gap_to_fallback_once_a_standard_renderer_can_absorb_it() {
        // resolve_gl_mesh_material_renderer falls back to StandardMaterialKind, so the mesh still
        // draws — as the wrong material: a downgrade to report, not a silence.
        let mut state = make_gl_scene3d_state();
        register_gl_mesh_material_renderer(&mut state, STANDARD_MATERIAL_KIND.to_string(), &RENDERER);
        assert!(gaps(&state, false).contains(&remediable(
            SceneCoverage::FallbackRemediable,
            RequirementFacet::SceneMaterialKind,
            "ShadedMaterial",
            "registerGlShadedMaterial",
            RenderRegistryTable::MaterialRenderer,
        )));
    }

    #[test]
    fn reports_the_material_as_satisfied_once_its_own_renderer_is_registered() {
        let mut state = make_gl_scene3d_state();
        register_gl_mesh_material_renderer(&mut state, "ShadedMaterial".to_string(), &RENDERER);
        assert!(gaps(&state, false).contains(&SceneCoverageEntry {
            coverage: SceneCoverage::Satisfied,
            facet: RequirementFacet::SceneMaterialKind,
            kind: "ShadedMaterial".to_string(),
            registry: RenderRegistryTable::MaterialRenderer,
            module: None,
            registrar: None,
        }));
        assert!(!gaps(&state, false).iter().any(|gap| gap.coverage != SceneCoverage::Satisfied
            && gap.registry == RenderRegistryTable::MaterialRenderer));
    }

    #[test]
    fn reports_an_unregistered_modifier_snippet_as_actionable_never_a_fallback() {
        // The shaded compiler assembles base + modifiers into one program, so an absent snippet fails
        // the whole material rather than degrading it.
        let found = gaps(&make_gl_scene3d_state(), true);
        assert!(found.contains(&remediable(
            SceneCoverage::Unregistered,
            RequirementFacet::SceneModifierKind,
            "RimModifier",
            "registerGlRimModifier",
            RenderRegistryTable::ModifierSnippet,
        )));
    }

    #[test]
    fn never_reports_a_node_kind_gap_since_3d_collects_meshes_structurally() {
        assert!(!gaps(&make_gl_scene3d_state(), false)
            .iter()
            .any(|gap| gap.registry == RenderRegistryTable::NodeRenderer));
    }

    #[test]
    fn clears_out_so_a_repeated_call_does_not_accumulate() {
        let state = make_gl_scene3d_state();
        let usage = shambler_like_usage(false);
        let mut out = Vec::new();
        explain_gl_scene3d_coverage(&mut out, &state, &usage, &coverage_catalog());
        let first = out.len();
        explain_gl_scene3d_coverage(&mut out, &state, &usage, &coverage_catalog());
        assert_eq!(out.len(), first);
    }
}

mod has_gl_scene3d_coverage {
    use super::*;

    #[test]
    fn is_false_for_a_bare_state_and_stays_false_while_any_kind_is_unserved() {
        assert!(!has_gl_scene3d_coverage(&make_gl_scene3d_state(), &shambler_like_usage(false)));
    }

    #[test]
    fn counts_a_standard_material_fallback_as_uncovered_since_the_authored_material_would_not_appear() {
        let mut state = make_gl_scene3d_state();
        register_gl_mesh_material_renderer(&mut state, STANDARD_MATERIAL_KIND.to_string(), &RENDERER);
        assert!(!has_gl_scene3d_coverage(&state, &shambler_like_usage(false)));
    }

    #[test]
    fn agrees_with_the_explain_tier_on_the_same_state_so_the_two_can_never_disagree() {
        let mut state = make_gl_scene3d_state();
        register_gl_mesh_material_renderer(&mut state, "ShadedMaterial".to_string(), &RENDERER);
        let usage = shambler_like_usage(false);
        let mut out = Vec::new();
        explain_gl_scene3d_coverage(&mut out, &state, &usage, &coverage_catalog());
        let shortfalls = out
            .iter()
            .filter(|entry| entry.coverage != SceneCoverage::Satisfied)
            .count();
        assert_eq!(has_gl_scene3d_coverage(&state, &usage), shortfalls == 0);
    }

    #[test]
    fn is_true_once_nothing_in_the_usage_is_unserved() {
        let state = make_gl_scene3d_state();
        let usage = create_scene3d_kind_usage();
        assert!(has_gl_scene3d_coverage(&state, &usage));
    }
}
