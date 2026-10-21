use flight_importdiagnostics::{ImportDiagnostic, ImportDiagnosticSeverity};
use flight_scene2d::{Node2DRef, create_display_object};
use flight_scene2d_formats::contract::*;

const ACTIVE_COMPONENT_ID: u64 = 296;
const ARTBOARD: u64 = 1;
const NAME: u64 = 4;
const SHAPE: u64 = 3;
const SOLO: u64 = 147;

mod apply_rive_solo {
    use super::*;

    #[test]
    fn shows_only_the_child_the_solo_names_active() {
        let artboard = graph(
            vec![
                object(ARTBOARD, &[], None),
                object(SOLO, &[(ACTIVE_COMPONENT_ID, 3)], Some("variants")),
                object(SHAPE, &[], Some("a")),
                object(SHAPE, &[], Some("b")),
            ],
            vec![-1, 0, 1, 1],
        );
        let nodes = named_nodes(["Board", "variants", "a", "b"]);
        apply_rive_solo(&nodes, &artboard, None);
        assert_eq!(
            visibility(&nodes, &[2, 3]),
            [("a".to_string(), false), ("b".to_string(), true)]
        );
    }

    #[test]
    fn leaves_a_node_that_is_not_a_solo_entirely_visible() {
        let artboard = graph(
            vec![
                object(ARTBOARD, &[], None),
                object(SHAPE, &[], Some("a")),
                object(SHAPE, &[], Some("b")),
            ],
            vec![-1, 0, 0],
        );
        let nodes = named_nodes(["Board", "a", "b"]);
        apply_rive_solo(&nodes, &artboard, None);
        assert_eq!(
            visibility(&nodes, &[1, 2]),
            [("a".to_string(), true), ("b".to_string(), true)]
        );
    }

    #[test]
    fn hides_nothing_outside_the_solo_so_a_sibling_subtree_is_untouched() {
        let artboard = graph(
            vec![
                object(ARTBOARD, &[], None),
                object(SOLO, &[(ACTIVE_COMPONENT_ID, 2)], Some("variants")),
                object(SHAPE, &[], Some("a")),
                object(SHAPE, &[], Some("outside")),
            ],
            vec![-1, 0, 1, 0],
        );
        let nodes = named_nodes(["Board", "variants", "a", "outside"]);
        apply_rive_solo(&nodes, &artboard, None);
        assert_eq!(
            visibility(&nodes, &[1, 3]),
            [
                ("variants".to_string(), true),
                ("outside".to_string(), true),
            ]
        );
    }

    #[test]
    fn reports_a_solo_whose_active_child_does_not_resolve_rather_than_hiding_every_variant() {
        let artboard = graph(
            vec![
                object(ARTBOARD, &[], None),
                object(SOLO, &[(ACTIVE_COMPONENT_ID, 99)], Some("variants")),
                object(SHAPE, &[], Some("a")),
            ],
            vec![-1, 0, 1],
        );
        let nodes = named_nodes(["Board", "variants", "a"]);
        let mut diagnostics = Vec::new();
        apply_rive_solo(&nodes, &artboard, Some(&mut diagnostics));
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["rive.solo-unresolved-active"]
        );
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(visibility(&nodes, &[2]), [("a".to_string(), true)]);
    }

    #[test]
    fn reports_an_active_index_that_is_not_the_solo_own_child() {
        let artboard = graph(
            vec![
                object(ARTBOARD, &[], None),
                object(SOLO, &[(ACTIVE_COMPONENT_ID, 2)], Some("variants")),
                object(SHAPE, &[], Some("other")),
            ],
            vec![-1, 0, 0],
        );
        let nodes = named_nodes(["Board", "variants", "other"]);
        let mut diagnostics = Vec::new();
        apply_rive_solo(&nodes, &artboard, Some(&mut diagnostics));
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["rive.solo-unresolved-active"]
        );
    }
}

mod import_rive_solo_component {
    use super::*;

    #[test]
    fn imports_the_solo_as_an_ordinary_container_carrying_its_name() {
        let registry = create_rive_import_registry();
        let artboard = graph(vec![object(SOLO, &[], Some("variants"))], vec![-1]);
        let root: Node2DRef = create_display_object(None);
        let mut context = create_rive_artboard_import_context(
            &registry,
            &artboard,
            &artboard.objects,
            root,
            &[],
            None,
        );
        let solo = import_rive_solo_component(&mut context, 0).unwrap();
        assert_eq!(
            solo.read().unwrap().node2d_fields().name.as_deref(),
            Some("variants")
        );
    }
}

mod register_rive_solo_handlers {
    use super::*;

    #[test]
    fn claims_the_solo_and_registers_hiding_as_a_pass() {
        let mut registry = create_rive_import_registry();
        register_rive_solo_handlers(&mut registry);
        let handler = get_rive_core_object_handler(&registry, SOLO as i32).unwrap();
        assert!(handler.import_component.is_some());
        assert!(handler.apply_artboard.is_some());
    }
}

fn diagnostic_kinds(diagnostics: &[ImportDiagnostic]) -> Vec<&str> {
    return diagnostics
        .iter()
        .map(|diagnostic| diagnostic.kind.as_str())
        .collect();
}

fn graph(objects: Vec<RiveCoreObject>, parent_indices: Vec<i32>) -> RiveArtboardGraph {
    let stream_end = objects.len();
    return RiveArtboardGraph {
        objects,
        parent_indices,
        stream_end,
        stream_start: 0,
    };
}

fn named_nodes<const N: usize>(names: [&str; N]) -> Vec<Option<Node2DRef>> {
    return names
        .iter()
        .map(|name| {
            let node: Node2DRef = create_display_object(None);
            node.write().unwrap().node2d_fields_mut().name = Some((*name).to_string());
            return Some(node);
        })
        .collect();
}

fn object(type_key: u64, numbers: &[(u64, u64)], name: Option<&str>) -> RiveCoreObject {
    let mut properties = numbers
        .iter()
        .map(|(key, value)| RiveProperty {
            key: *key,
            r#type: RiveFieldType::Uint,
            value: RiveValue::Uint(*value),
        })
        .collect::<Vec<_>>();
    if let Some(name) = name {
        properties.push(RiveProperty {
            key: NAME,
            r#type: RiveFieldType::String,
            value: RiveValue::String(name.to_string()),
        });
    }
    return RiveCoreObject {
        properties,
        type_key,
    };
}

fn visibility(nodes: &[Option<Node2DRef>], indices: &[usize]) -> Vec<(String, bool)> {
    return indices
        .iter()
        .map(|index| {
            let node = nodes[*index].as_ref().unwrap();
            let guard = node.read().unwrap();
            let fields = guard.node2d_fields();
            let name = fields.name.clone().unwrap_or_default();
            return (name, fields.visible);
        })
        .collect();
}
