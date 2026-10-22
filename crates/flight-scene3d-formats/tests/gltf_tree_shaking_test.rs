use flight_entity::Ref;
use flight_scene3d_formats::{GltfCoreFeatureHandler, GltfExtensionHandler};
use std::path::Path;

struct RealizationGraph {
    implementation: String,
    modules: Vec<String>,
}

mod gltf_tree_shaking {
    use super::*;

    #[test]
    fn configured_parser_stays_independent_of_every_optional_core_handler() {
        let graph = realization_graph("gltf_parse");
        for marker in [
            "gltf.animation-target-unresolved",
            "gltf.camera-invalid-perspective",
            "gltf.skin-ibm-count-mismatch",
        ] {
            assert!(!graph.implementation.contains(marker));
        }
        for module in [
            "gltf_animations",
            "gltf_cameras",
            "gltf_skins",
            "register_gltf_animation_handlers",
            "register_gltf_camera_handlers",
            "register_gltf_skin_handlers",
            "register_all_gltf_handlers",
            "register_gltf_material_extension_handlers",
            "register_gltf_lighting_extension_handlers",
        ] {
            assert!(
                !graph.modules.iter().any(|entry| entry == module),
                "selective core reaches {module}"
            );
        }
    }

    #[test]
    fn public_core_registration_door_stays_independent_of_every_builtin_handler_family() {
        assert_registration_door("gltf_core_feature_registry");
    }

    #[test]
    fn public_extension_registration_door_stays_independent_of_every_builtin_handler_family() {
        assert_registration_door("gltf_extension_handler_registry");
    }

    #[test]
    fn animation_registrar_is_independently_reachable() {
        assert_family_graph(
            "register_gltf_animation_handlers",
            "gltf.animation-target-unresolved",
            "gltf.camera-invalid-perspective",
        );
    }

    #[test]
    fn camera_registrar_is_independently_reachable() {
        assert_family_graph(
            "register_gltf_camera_handlers",
            "gltf.camera-invalid-perspective",
            "gltf.animation-target-unresolved",
        );
    }

    #[test]
    fn lighting_registrar_is_independently_reachable() {
        assert_family_graph(
            "register_gltf_lighting_extension_handlers",
            "KHR_lights_punctual",
            "KHR_materials_anisotropy",
        );
    }

    #[test]
    fn material_registrar_is_independently_reachable() {
        assert_family_graph(
            "register_gltf_material_extension_handlers",
            "KHR_materials_anisotropy",
            "KHR_lights_punctual",
        );
    }

    #[test]
    fn skin_registrar_is_independently_reachable() {
        assert_family_graph(
            "register_gltf_skin_handlers",
            "gltf.skin-ibm-count-mismatch",
            "gltf.animation-target-unresolved",
        );
    }

    #[test]
    fn all_registrar_and_zero_config_parser_include_their_actual_presets() {
        let all = realization_graph("register_all_gltf_handlers");
        for marker in [
            "gltf.animation-target-unresolved",
            "gltf.camera-invalid-perspective",
            "gltf.skin-ibm-count-mismatch",
            "KHR_materials_anisotropy",
            "KHR_lights_punctual",
        ] {
            assert!(
                all.implementation.contains(marker),
                "all registrar omits {marker}"
            );
        }
        let parser = realization_graph("gltf_import");
        for marker in [
            "gltf.animation-target-unresolved",
            "gltf.camera-invalid-perspective",
            "gltf.skin-ibm-count-mismatch",
        ] {
            assert!(
                parser.implementation.contains(marker),
                "default parser omits {marker}"
            );
        }
        for marker in ["KHR_materials_anisotropy", "KHR_lights_punctual"] {
            assert!(!parser.implementation.contains(marker));
        }
        for module in [
            "gltf_anisotropy",
            "gltf_punctual_lights",
            "register_gltf_material_extension_handlers",
            "register_gltf_lighting_extension_handlers",
        ] {
            assert!(!parser.modules.iter().any(|entry| entry == module));
        }
    }

    #[test]
    fn core_parser_stays_independent_of_optional_punctual_light_realization() {
        let graph = realization_graph("gltf_import");
        assert!(!graph.implementation.contains("flight_lighting::"));
        assert!(!graph.implementation.contains("KHR_lights_punctual"));
        assert!(
            !graph
                .modules
                .iter()
                .any(|entry| entry == "gltf_punctual_lights")
        );
        // Rust's typed JSON projection retains the wire key even when no light handler is reachable.
        assert!(graph.modules.iter().any(|entry| entry == "gltf_json"));
        let projection =
            std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/gltf_json.rs"))
                .unwrap();
        assert!(projection.contains("KHR_lights_punctual"));
    }

    #[test]
    fn named_punctual_handler_reaches_its_real_light_constructors() {
        let graph = realization_graph("gltf_punctual_lights");
        assert!(graph.implementation.contains("create_directional_light"));
        assert!(graph.implementation.contains("KHR_lights_punctual"));
        assert!(graph.implementation.contains("flight_lighting::"));
    }

    #[test]
    fn public_barrel_exposes_generic_doors_and_keeps_builtin_atoms_on_the_contract_barrel() {
        let _core_door: fn(&mut Vec<Ref<GltfCoreFeatureHandler>>, Ref<GltfCoreFeatureHandler>) =
            flight_scene3d_formats::register_gltf_core_feature_handler;
        let _extension_door: fn(&mut Vec<Ref<GltfExtensionHandler>>, Ref<GltfExtensionHandler>) =
            flight_scene3d_formats::register_gltf_extension_handler;
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let public = std::fs::read_to_string(root.join("lib.rs")).unwrap();
        let contract = std::fs::read_to_string(root.join("contract.rs")).unwrap();
        let public_exports = export_statements(&public);
        let contract_exports = export_statements(&contract);
        for (module, atom) in [
            ("gltf_animations", "GLTF_ANIMATIONS_CORE_FEATURE_HANDLER"),
            ("gltf_cameras", "GLTF_CAMERAS_CORE_FEATURE_HANDLER"),
            ("gltf_skins", "GLTF_SKINS_CORE_FEATURE_HANDLER"),
            (
                "gltf_punctual_lights",
                "GLTF_PUNCTUAL_LIGHTS_EXTENSION_HANDLER",
            ),
            ("gltf_anisotropy", "GLTF_ANISOTROPY_EXTENSION_HANDLER"),
        ] {
            assert!(
                !public_exports
                    .iter()
                    .any(|statement| statement.contains(&format!("{module}::"))
                        || statement.contains(atom)),
                "public barrel promotes {atom}"
            );
            assert!(
                contract_exports
                    .iter()
                    .any(|statement| statement.contains(&format!("{module}::"))
                        || statement.contains(atom)),
                "contract barrel omits {atom}"
            );
        }
        assert!(
            !public_exports
                .iter()
                .any(|statement| statement.contains("contract::*"))
        );
    }
}

fn assert_family_graph(module: &str, included: &str, excluded: &str) {
    let graph = realization_graph(module);
    assert!(
        graph.implementation.contains(included),
        "{module} does not reach {included}"
    );
    assert!(
        !graph.implementation.contains(excluded),
        "{module} reaches sibling {excluded}"
    );
}

fn assert_registration_door(module: &str) {
    let graph = realization_graph(module);
    for marker in [
        "gltf.animation-target-unresolved",
        "gltf.camera-invalid-perspective",
        "gltf.skin-ibm-count-mismatch",
        "KHR_materials_anisotropy",
        "KHR_lights_punctual",
    ] {
        assert!(
            !graph.implementation.contains(marker),
            "{module} reaches {marker}"
        );
    }
    for family in [
        "gltf_animations",
        "gltf_cameras",
        "gltf_skins",
        "gltf_anisotropy",
        "gltf_punctual_lights",
    ] {
        assert!(!graph.modules.iter().any(|entry| entry == family));
    }
}

fn export_statements(source: &str) -> Vec<String> {
    return source
        .split("pub use ")
        .skip(1)
        .map(|tail| {
            tail.split(';')
                .next()
                .unwrap()
                .chars()
                .filter(|character| !character.is_whitespace())
                .collect()
        })
        .collect();
}

// Counterpart to the TS packages-external source-graph instrument, not an artifact-size measurement.
// Traverse actual crate-qualified implementation dependencies; external crates remain external.
// Retain wire modules in reachability, but their typed JSON key projection is not handler realization.
fn realization_graph(entry: &str) -> RealizationGraph {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut pending = vec![entry.to_string()];
    let mut modules = Vec::new();
    let mut implementation = String::new();
    while let Some(module) = pending.pop() {
        if modules.contains(&module) {
            continue;
        }
        let source = std::fs::read_to_string(root.join(format!("{module}.rs"))).unwrap();
        // The GLTF implementation uses explicit module-qualified paths; fail if that grammar changes.
        assert!(
            !source.contains("use crate::{"),
            "update graph traversal for root-group import in {module}"
        );
        for (_, tail) in source
            .match_indices("crate::")
            .map(|(index, _)| (index, &source[index + 7..]))
        {
            let name: String = tail
                .chars()
                .take_while(|character| character.is_ascii_alphanumeric() || *character == '_')
                .collect();
            if !name.is_empty()
                && root.join(format!("{name}.rs")).is_file()
                && !modules.contains(&name)
            {
                pending.push(name);
            }
        }
        if module != "gltf_json" && module != "gltf_schema" {
            implementation.push_str(&source);
            implementation.push('\n');
        }
        modules.push(module);
    }
    return RealizationGraph {
        implementation,
        modules,
    };
}
