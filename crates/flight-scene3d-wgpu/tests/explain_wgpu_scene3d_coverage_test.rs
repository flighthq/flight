use std::sync::{Arc, RwLock};

use flight_camera::Camera3D;
use flight_entity::Ref;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material, Material3D, STANDARD_MATERIAL_KIND};
use flight_meshgeometry::{MeshGeometry, create_box_mesh_geometry};
use flight_render::{
    CatalogEntry, CatalogRegistration, RenderRegistryTable, Scene3DRenderProxy, SceneCoverage,
    SceneCoverageCatalog, SceneCoverageEntry,
};
use flight_render_wgpu::*;
use flight_requirement::RequirementFacet;
use flight_scene3d::{Scene3DKindUsage, create_scene3d, create_scene3d_kind_usage, get_scene3d_kind_usage};
use flight_scene3d_wgpu::*;
use flight_shading::contract::{Modifier, create_rim_modifier, create_shaded_material};

use crate::support::*;

fn bind_nothing(
    _state: &mut WgpuRenderState,
    _material: Option<&dyn Material>,
    _lights: &Scene3DLightBlock,
    _camera: &Camera3D,
) {
}

fn draw_nothing(_state: &mut WgpuRenderState, _proxy: &Scene3DRenderProxy, _geometry: &MeshGeometry) {}

static RENDERER: WgpuMeshMaterialRenderer = WgpuMeshMaterialRenderer {
    bind: bind_nothing,
    draw: draw_nothing,
};

fn coverage_catalog() -> SceneCoverageCatalog {
    let entry = |kind: &str, registrar: &str, registry: RenderRegistryTable| CatalogEntry {
        kind: kind.to_string(),
        registrations: vec![CatalogRegistration {
            module: "@flighthq/scene3d-wgpu".to_string(),
            registrar: registrar.to_string(),
        }],
        registry,
    };
    return vec![
        entry("ShadedMaterial", "registerWgpuShadedMaterial", RenderRegistryTable::MaterialRenderer),
        entry("image", "registerWgpuImageTextureResolver", RenderRegistryTable::TextureResolver),
        entry("RimModifier", "registerWgpuRimModifier", RenderRegistryTable::ModifierSnippet),
    ];
}

// A scene with one shaded mesh whose diffuse map is backed by an embedded image reference (and,
// optionally, a rim modifier), read through the scene's own usage collector.
fn shaded_usage(with_modifier: bool) -> Scene3DKindUsage {
    let reference = flight_image::create_embedded_image_resource_reference(Arc::new(RwLock::new(
        vec![1, 2, 3].into_boxed_slice(),
    )));
    reference.write().unwrap().mime_type = Some("image/png".to_string());
    let texture = Arc::new(RwLock::new(create_test_unbacked_texture()));
    reference.write().unwrap().textures.push(texture.clone());
    let mut material = create_shaded_material();
    material.diffuse_map = Some(texture);
    if with_modifier {
        let mut rim = create_rim_modifier();
        rim.color = 0x49d8ffff;
        rim.intensity = 0.7;
        rim.power = 2.4;
        let rim: Ref<dyn Modifier> = Arc::new(RwLock::new(rim));
        material.modifiers = vec![rim];
    }
    let mut scene = create_scene3d();
    scene.resources.push(flight_image::ImageResourceReference::Embedded(
        flight_image::EmbeddedImageResourceReferenceValue { reference },
    ));
    let material: Ref<dyn Material3D> = Arc::new(RwLock::new(material));
    let root: flight_node::NodeRef = scene.root.clone();
    add_test_child(&root, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(material)]));
    let mut usage = create_scene3d_kind_usage();
    get_scene3d_kind_usage(&mut usage, &scene);
    return usage;
}

fn entries(state: &WgpuRenderState, with_modifier: bool) -> Vec<SceneCoverageEntry> {
    let mut out = Vec::new();
    explain_wgpu_scene3d_coverage(&mut out, state, &shaded_usage(with_modifier), &coverage_catalog());
    return out;
}

fn entry(
    coverage: SceneCoverage,
    facet: RequirementFacet,
    kind: &str,
    registrar: Option<&str>,
    registry: RenderRegistryTable,
) -> SceneCoverageEntry {
    return SceneCoverageEntry {
        coverage,
        facet,
        kind: kind.to_string(),
        registry,
        module: registrar.map(|_| "@flighthq/scene3d-wgpu".to_string()),
        registrar: registrar.map(str::to_string),
    };
}

mod explain_wgpu_scene3d_coverage {
    use super::*;

    #[test]
    fn reports_a_bare_state_with_remedies_for_both_unregistered_requirements() {
        let test = make_wgpu_scene3d_state(None);
        let found = entries(&test.state, false);
        assert!(found.contains(&entry(
            SceneCoverage::Unregistered,
            RequirementFacet::SceneMaterialKind,
            "ShadedMaterial",
            Some("registerWgpuShadedMaterial"),
            RenderRegistryTable::MaterialRenderer,
        )));
        assert!(found.contains(&entry(
            SceneCoverage::Unregistered,
            RequirementFacet::SceneTextureSourceKind,
            "image",
            Some("registerWgpuImageTextureResolver"),
            RenderRegistryTable::TextureResolver,
        )));
    }

    #[test]
    fn downgrades_the_material_gap_to_fallback_once_a_standard_renderer_can_absorb_it() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_mesh_material_renderer(&mut test.state, STANDARD_MATERIAL_KIND.to_string(), &RENDERER);
        assert!(entries(&test.state, false).contains(&entry(
            SceneCoverage::FallbackRemediable,
            RequirementFacet::SceneMaterialKind,
            "ShadedMaterial",
            Some("registerWgpuShadedMaterial"),
            RenderRegistryTable::MaterialRenderer,
        )));
    }

    #[test]
    fn reports_the_material_as_satisfied_once_its_own_renderer_is_registered() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_mesh_material_renderer(&mut test.state, "ShadedMaterial".to_string(), &RENDERER);
        assert!(entries(&test.state, false).contains(&entry(
            SceneCoverage::Satisfied,
            RequirementFacet::SceneMaterialKind,
            "ShadedMaterial",
            None,
            RenderRegistryTable::MaterialRenderer,
        )));
    }

    // The shaded compiler assembles base + modifiers into one program, so an absent snippet fails
    // the whole material rather than degrading it.
    #[test]
    fn reports_an_unregistered_modifier_snippet_as_actionable_never_a_fallback() {
        let test = make_wgpu_scene3d_state(None);
        assert!(entries(&test.state, true).contains(&entry(
            SceneCoverage::Unregistered,
            RequirementFacet::SceneModifierKind,
            "RimModifier",
            Some("registerWgpuRimModifier"),
            RenderRegistryTable::ModifierSnippet,
        )));
    }

    #[test]
    fn never_reports_a_node_kind_entry_since_3d_collects_meshes_structurally() {
        let test = make_wgpu_scene3d_state(None);
        assert!(!entries(&test.state, false)
            .iter()
            .any(|entry| entry.registry == RenderRegistryTable::NodeRenderer));
    }

    #[test]
    fn clears_out_so_a_repeated_call_does_not_accumulate() {
        let test = make_wgpu_scene3d_state(None);
        let usage = shaded_usage(false);
        let mut out = Vec::new();
        explain_wgpu_scene3d_coverage(&mut out, &test.state, &usage, &coverage_catalog());
        let first = out.len();
        explain_wgpu_scene3d_coverage(&mut out, &test.state, &usage, &coverage_catalog());
        assert_eq!(out.len(), first);
    }
}

mod has_wgpu_scene3d_coverage {
    use super::*;

    #[test]
    fn is_false_for_a_bare_state_and_stays_false_while_any_kind_is_unserved() {
        let test = make_wgpu_scene3d_state(None);
        assert!(!has_wgpu_scene3d_coverage(&test.state, &shaded_usage(false)));
    }

    #[test]
    fn counts_a_standard_material_fallback_as_uncovered_since_the_authored_material_would_not_appear() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_mesh_material_renderer(&mut test.state, STANDARD_MATERIAL_KIND.to_string(), &RENDERER);
        assert!(!has_wgpu_scene3d_coverage(&test.state, &shaded_usage(false)));
    }

    #[test]
    fn agrees_with_the_explain_tier_on_the_same_state_so_the_two_can_never_disagree() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_mesh_material_renderer(&mut test.state, "ShadedMaterial".to_string(), &RENDERER);
        let usage = shaded_usage(false);
        let mut out = Vec::new();
        explain_wgpu_scene3d_coverage(&mut out, &test.state, &usage, &coverage_catalog());
        let gaps = out
            .iter()
            .filter(|entry| entry.coverage != SceneCoverage::Satisfied)
            .count();
        assert_eq!(has_wgpu_scene3d_coverage(&test.state, &usage), gaps == 0);
    }

    #[test]
    fn is_true_once_nothing_in_the_usage_is_unserved() {
        let test = make_wgpu_scene3d_state(None);
        let mut usage = create_scene3d_kind_usage();
        get_scene3d_kind_usage(&mut usage, &create_scene3d());
        assert!(has_wgpu_scene3d_coverage(&test.state, &usage));
    }
}
