use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_materials::Material3D;
use flight_materials::contract::{create_blinn_phong_material, create_unlit_material};
use flight_render::{
    CatalogEntry, CatalogRegistration, RenderRegistryTable, SceneCoverage, SceneCoverageCatalog,
    SceneCoverageEntry,
};
use flight_requirement::RequirementFacet;
use flight_scene3d::{
    Scene3DKindUsage, create_scene3d, create_scene3d_kind_usage, get_scene3d_kind_usage,
};
use flight_scene3d_resources::contract::*;
use flight_shading::contract::create_shaded_material;

use crate::mock_host::MockHost;
use crate::support::{add_scene_mesh, context, host_image, mesh_of, scene_with};

fn coverage_catalog() -> SceneCoverageCatalog {
    return vec![
        CatalogEntry {
            kind: "UnlitMaterial".to_string(),
            registrations: vec![CatalogRegistration {
                module: "@flighthq/scene3d-resources".to_string(),
                registrar: "registerUnlitScene3DMaterialTextures".to_string(),
            }],
            registry: RenderRegistryTable::MaterialTextureLister,
        },
        CatalogEntry {
            kind: "ShadedMaterial".to_string(),
            registrations: vec![CatalogRegistration {
                module: "@flighthq/scene3d-resources".to_string(),
                registrar: "registerShadedScene3DMaterialTextures".to_string(),
            }],
            registry: RenderRegistryTable::MaterialTextureLister,
        },
    ];
}

fn usage_of(materials: Vec<Ref<dyn Material3D>>) -> Scene3DKindUsage {
    let scene = scene_with(Vec::new());
    for material in materials {
        add_scene_mesh(&scene, &mesh_of(vec![material]));
    }
    let mut usage = create_scene3d_kind_usage();
    get_scene3d_kind_usage(&mut usage, &scene.read().unwrap());
    return usage;
}

fn unlit() -> Ref<dyn Material3D> {
    return Arc::new(RwLock::new(create_unlit_material()));
}

fn shaded() -> Ref<dyn Material3D> {
    return Arc::new(RwLock::new(create_shaded_material()));
}

fn gaps(
    resolver: &Ref<Scene3DResourceResolver>,
    usage: &Scene3DKindUsage,
) -> Vec<SceneCoverageEntry> {
    let mut out = Vec::new();
    explain_scene3d_resource_coverage(&mut out, resolver, usage, &coverage_catalog());
    return out;
}

fn satisfied(kind: &str) -> SceneCoverageEntry {
    return SceneCoverageEntry {
        coverage: SceneCoverage::Satisfied,
        facet: RequirementFacet::SceneMaterialKind,
        kind: kind.to_string(),
        module: None,
        registrar: None,
        registry: RenderRegistryTable::MaterialTextureLister,
    };
}

fn unregistered(kind: &str, registrar: &str) -> SceneCoverageEntry {
    return SceneCoverageEntry {
        coverage: SceneCoverage::Unregistered,
        facet: RequirementFacet::SceneMaterialKind,
        kind: kind.to_string(),
        module: Some("@flighthq/scene3d-resources".to_string()),
        registrar: Some(registrar.to_string()),
        registry: RenderRegistryTable::MaterialTextureLister,
    };
}

mod explain_scene3d_resource_coverage {
    use super::*;

    #[test]
    fn reports_a_bare_resolver_with_the_call_that_registers_the_material_lister() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let found = gaps(&resolver, &usage_of(vec![unlit()]));
        assert_eq!(
            found,
            vec![unregistered("UnlitMaterial", "registerUnlitScene3DMaterialTextures")]
        );
    }

    #[test]
    fn reports_a_covered_kind_as_satisfied_rather_than_omitting_it() {
        let host = MockHost::new();
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), None, &context(&host));
        assert_eq!(gaps(&resolver, &usage_of(vec![unlit()])), vec![satisfied("UnlitMaterial")]);
    }

    #[test]
    fn reports_shaded_material_against_the_built_in_assembly_which_does_not_wire_its_lister() {
        let host = MockHost::new();
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), None, &context(&host));
        assert!(
            gaps(&resolver, &usage_of(vec![shaded()]))
                .contains(&unregistered("ShadedMaterial", "registerShadedScene3DMaterialTextures"))
        );
    }

    #[test]
    fn stops_reporting_once_the_named_door_for_that_family_is_called() {
        let host = MockHost::new();
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let registry = resolver.read().unwrap().registry.clone();
        register_shaded_scene3d_material_textures(&registry);
        assert_eq!(gaps(&resolver, &usage_of(vec![shaded()])), vec![satisfied("ShadedMaterial")]);
    }

    #[test]
    fn reports_a_family_that_ships_no_lister_at_all_so_the_omission_is_visible_rather_than_inferred() {
        // BlinnPhongMaterial carries four texture slots and has no lister anywhere in the SDK.
        let host = MockHost::new();
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let blinn_phong: Ref<dyn Material3D> = Arc::new(RwLock::new(create_blinn_phong_material()));
        assert!(gaps(&resolver, &usage_of(vec![blinn_phong])).contains(&SceneCoverageEntry {
            coverage: SceneCoverage::Unavailable,
            facet: RequirementFacet::SceneMaterialKind,
            kind: "BlinnPhongMaterial".to_string(),
            module: None,
            registrar: None,
            registry: RenderRegistryTable::MaterialTextureLister,
        }));
    }

    #[test]
    fn clears_out_so_a_repeated_call_does_not_accumulate() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let usage = usage_of(vec![unlit()]);
        let mut out = Vec::new();
        explain_scene3d_resource_coverage(&mut out, &resolver, &usage, &coverage_catalog());
        let first = out.len();
        explain_scene3d_resource_coverage(&mut out, &resolver, &usage, &coverage_catalog());
        assert_eq!(out.len(), first);
    }
}

mod has_scene3d_resource_coverage {
    use super::*;

    #[test]
    fn is_false_while_any_material_kind_is_undescribed() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        assert!(!has_scene3d_resource_coverage(&resolver, &usage_of(vec![unlit()])));
    }

    #[test]
    fn agrees_with_the_explain_tier_on_the_same_resolver_so_the_two_can_never_disagree() {
        let host = MockHost::new();
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let usage = usage_of(vec![unlit(), shaded()]);
        let mut out = Vec::new();
        explain_scene3d_resource_coverage(&mut out, &resolver, &usage, &coverage_catalog());
        assert_eq!(has_scene3d_resource_coverage(&resolver, &usage), out.is_empty());
    }

    #[test]
    fn stays_true_when_the_manifest_is_all_satisfied_entries_which_are_not_shortfalls() {
        let host = MockHost::new();
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let usage = usage_of(vec![unlit()]);
        let mut out = Vec::new();
        explain_scene3d_resource_coverage(&mut out, &resolver, &usage, &coverage_catalog());
        assert!(!out.is_empty());
        assert!(out.iter().all(|entry| entry.coverage == SceneCoverage::Satisfied));
        assert!(has_scene3d_resource_coverage(&resolver, &usage));
    }

    #[test]
    fn is_true_for_an_empty_scene_which_names_no_material_kinds() {
        let host = MockHost::new();
        let mut usage = create_scene3d_kind_usage();
        get_scene3d_kind_usage(&mut usage, &create_scene3d());
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        assert!(has_scene3d_resource_coverage(&resolver, &usage));
    }
}
