use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::UnknownValue;
use flight_registry::KindMap;
use flight_render::*;
use flight_requirement::RequirementFacet;
use flight_scene2d::Scene2DKindUsage;

use crate::support::NOOP_RENDERER;

fn catalog() -> SceneCoverageCatalog {
    return vec![
        CatalogEntry {
            kind: "Shape".to_string(),
            registrations: vec![
                CatalogRegistration {
                    module: "@flighthq/scene2d".to_string(),
                    registrar: "registerShapeRenderer".to_string(),
                },
                CatalogRegistration {
                    module: "@flighthq/scene2d-canvas".to_string(),
                    registrar: "registerCanvasShapeCommands".to_string(),
                },
            ],
            registry: RenderRegistryTable::NodeRenderer,
        },
        CatalogEntry {
            kind: "Sprite".to_string(),
            registrations: vec![CatalogRegistration {
                module: "@flighthq/scene2d".to_string(),
                registrar: "registerSpriteRenderer".to_string(),
            }],
            registry: RenderRegistryTable::NodeRenderer,
        },
        CatalogEntry {
            kind: "beginFill".to_string(),
            registrations: vec![CatalogRegistration {
                module: "@flighthq/scene2d-canvas".to_string(),
                registrar: "registerCanvasShapeCommands".to_string(),
            }],
            registry: RenderRegistryTable::ShapeCommandHandler,
        },
    ];
}

fn usage(node_kinds: &[&str], command_keys: &[&str]) -> Scene2DKindUsage {
    let mut usage = crate::support::test_default::<Scene2DKindUsage>();
    usage.node_kinds = node_kinds
        .iter()
        .map(|value| (*value).to_string())
        .collect();
    usage.shape_command_keys = command_keys
        .iter()
        .map(|value| (*value).to_string())
        .collect();
    return usage;
}

fn wire_shape_command(state: &mut BaseRenderState, key: &str) {
    state.registries.canvas_shape_commands = Some(Arc::new(KindMap {
        entries: HashMap::from([(key.to_string(), Arc::new(key.to_string()) as UnknownValue)]),
        key_order: vec![key.to_string()],
    }));
}

mod explain_scene_2d_coverage {
    use super::*;

    #[test]
    fn coverage_reports_unregistered_node_with_primary_remedy() {
        let state = create_render_state(None);
        let mut out = Vec::new();
        explain_scene_2d_coverage(&mut out, &state, &usage(&["Shape"], &[]), &catalog());
        assert_eq!(
            out,
            vec![SceneCoverageEntry {
                coverage: SceneCoverage::Unregistered,
                facet: RequirementFacet::SceneNodeKind,
                kind: "Shape".to_string(),
                registry: RenderRegistryTable::NodeRenderer,
                module: Some("@flighthq/scene2d".to_string()),
                registrar: Some("registerShapeRenderer".to_string()),
            }]
        );
    }

    #[test]
    fn coverage_reports_uncatalogued_node_as_unavailable() {
        let state = create_render_state(None);
        let mut out = Vec::new();
        explain_scene_2d_coverage(&mut out, &state, &usage(&["Shape"], &[]), &Vec::new());
        assert_eq!(out[0].coverage, SceneCoverage::Unavailable);
        assert!(out[0].module.is_none() && out[0].registrar.is_none());
    }

    #[test]
    fn coverage_reports_registered_node_as_satisfied() {
        let mut state = create_render_state(None);
        register_node_renderer(&mut state, "Shape".to_string(), &NOOP_RENDERER);
        let mut out = Vec::new();
        explain_scene_2d_coverage(&mut out, &state, &usage(&["Shape"], &[]), &catalog());
        assert_eq!(out[0].coverage, SceneCoverage::Satisfied);
    }

    #[test]
    fn coverage_reports_unhandled_shape_command_with_remedy() {
        let state = create_render_state(None);
        let mut out = Vec::new();
        explain_scene_2d_coverage(&mut out, &state, &usage(&[], &["beginFill"]), &catalog());
        assert_eq!(out[0].coverage, SceneCoverage::Unregistered);
        assert_eq!(out[0].facet, RequirementFacet::SceneShapeCommand);
        assert_eq!(out[0].module.as_deref(), Some("@flighthq/scene2d-canvas"));
    }

    #[test]
    fn coverage_reports_wired_shape_command_as_satisfied() {
        let mut state = create_render_state(None);
        wire_shape_command(&mut state, "beginFill");
        let mut out = Vec::new();
        explain_scene_2d_coverage(&mut out, &state, &usage(&[], &["beginFill"]), &catalog());
        assert_eq!(out[0].coverage, SceneCoverage::Satisfied);
    }

    #[test]
    fn coverage_answers_both_registries_in_one_manifest() {
        let mut state = create_render_state(None);
        register_node_renderer(&mut state, "Shape".to_string(), &NOOP_RENDERER);
        let mut out = Vec::new();
        explain_scene_2d_coverage(
            &mut out,
            &state,
            &usage(&["Shape", "Sprite"], &["beginFill"]),
            &catalog(),
        );
        assert_eq!(out.len(), 3);
        assert_eq!(
            out.iter()
                .filter(|entry| entry.coverage != SceneCoverage::Satisfied)
                .map(|entry| entry.kind.as_str())
                .collect::<Vec<_>>(),
            vec!["Sprite", "beginFill"]
        );
    }

    #[test]
    fn coverage_clears_out_before_each_call() {
        let state = create_render_state(None);
        let mut out = Vec::new();
        let usage = usage(&["Shape"], &[]);
        explain_scene_2d_coverage(&mut out, &state, &usage, &catalog());
        let first = out.len();
        explain_scene_2d_coverage(&mut out, &state, &usage, &catalog());
        assert_eq!(out.len(), first);
    }
}

mod has_scene_2d_coverage {
    use super::*;

    #[test]
    fn has_coverage_is_false_for_unserved_kind() {
        assert!(!has_scene_2d_coverage(
            &create_render_state(None),
            &usage(&["Shape"], &[])
        ));
    }

    #[test]
    fn has_coverage_is_true_for_all_satisfied_entries() {
        let mut state = create_render_state(None);
        register_node_renderer(&mut state, "Shape".to_string(), &NOOP_RENDERER);
        wire_shape_command(&mut state, "beginFill");
        assert!(has_scene_2d_coverage(
            &state,
            &usage(&["Shape"], &["beginFill"])
        ));
    }

    #[test]
    fn has_coverage_agrees_with_explanation() {
        let mut state = create_render_state(None);
        register_node_renderer(&mut state, "Shape".to_string(), &NOOP_RENDERER);
        let usage = usage(&["Shape", "Sprite"], &[]);
        let mut out = Vec::new();
        explain_scene_2d_coverage(&mut out, &state, &usage, &catalog());
        let complete = out
            .iter()
            .all(|entry| entry.coverage == SceneCoverage::Satisfied);
        assert_eq!(has_scene_2d_coverage(&state, &usage), complete);
    }

    #[test]
    fn has_coverage_is_true_for_empty_usage() {
        assert!(has_scene_2d_coverage(
            &create_render_state(None),
            &crate::support::test_default::<Scene2DKindUsage>()
        ));
    }
}
