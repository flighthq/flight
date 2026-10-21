use flight_importdiagnostics::ImportDiagnostic;
use flight_scene2d_formats::contract::*;

const ARTBOARD: u64 = 1;
const ELLIPSE: u64 = 4;
const LINEAR_ANIMATION: u64 = 31;
const PARENT_ID: u64 = 5;
const SHAPE: u64 = 3;

mod create_rive_object_graph {
    use super::*;

    #[test]
    fn breaks_a_parent_ring_instead_of_walking_it_forever() {
        let mut diagnostics = Vec::new();
        let graph = create_rive_object_graph(
            &document(vec![artboard(), component(SHAPE, 2), component(ELLIPSE, 1)]),
            Some(&mut diagnostics),
        );
        assert_eq!(graph.artboards[0].parent_indices, [-1, -1, 1]);
        assert_eq!(diagnostic_kinds(&diagnostics), ["rive.parent-cycle"]);
    }

    #[test]
    fn ignores_components_before_any_artboard() {
        let graph = create_rive_object_graph(
            &document(vec![component(SHAPE, 0), artboard(), component(SHAPE, 0)]),
            None,
        );
        assert_eq!(graph.artboards.len(), 1);
        assert_eq!(graph.artboards[0].objects.len(), 2);
    }

    #[test]
    fn numbers_only_components_skipping_objects_that_share_the_stream() {
        let graph = create_rive_object_graph(
            &document(vec![
                artboard(),
                component(SHAPE, 0),
                RiveCoreObject {
                    properties: Vec::new(),
                    type_key: LINEAR_ANIMATION,
                },
                component(ELLIPSE, 1),
            ]),
            None,
        );
        assert_eq!(type_keys(&graph.artboards[0]), [ARTBOARD, SHAPE, ELLIPSE]);
        assert_eq!(graph.artboards[0].parent_indices, [-1, 0, 1]);
    }

    #[test]
    fn numbers_the_artboard_as_index_zero_of_its_own_objects() {
        let graph = create_rive_object_graph(
            &document(vec![artboard(), component(SHAPE, 0), component(ELLIPSE, 1)]),
            None,
        );
        assert_eq!(graph.artboards.len(), 1);
        assert_eq!(type_keys(&graph.artboards[0]), [ARTBOARD, SHAPE, ELLIPSE]);
        assert_eq!(graph.artboards[0].parent_indices, [-1, 0, 1]);
    }

    #[test]
    fn reaches_every_component_from_its_artboard_root() {
        let graph = create_rive_object_graph(
            &document(vec![
                artboard(),
                component(SHAPE, 0),
                component(ELLIPSE, 1),
                component(ELLIPSE, 1),
                component(SHAPE, 3),
            ]),
            None,
        );
        let parents = &graph.artboards[0].parent_indices;
        for index in 1..parents.len() {
            let mut steps = 0;
            let mut current = index;
            while current != 0 {
                current = parents[current] as usize;
                steps += 1;
                assert!(steps < parents.len());
            }
        }
    }

    #[test]
    fn returns_no_artboards_for_a_document_that_declares_none() {
        let graph = create_rive_object_graph(
            &document(vec![RiveCoreObject {
                properties: Vec::new(),
                type_key: LINEAR_ANIMATION,
            }]),
            None,
        );
        assert!(graph.artboards.is_empty());
    }

    #[test]
    fn roots_a_component_that_parents_itself() {
        let mut diagnostics = Vec::new();
        let graph = create_rive_object_graph(
            &document(vec![artboard(), component(SHAPE, 1)]),
            Some(&mut diagnostics),
        );
        assert_eq!(graph.artboards[0].parent_indices, [-1, -1]);
        assert_eq!(diagnostic_kinds(&diagnostics), ["rive.unresolved-parent"]);
    }

    #[test]
    fn roots_a_component_that_states_no_parent_at_all() {
        let mut diagnostics = Vec::new();
        let graph = create_rive_object_graph(
            &document(vec![
                artboard(),
                RiveCoreObject {
                    properties: Vec::new(),
                    type_key: SHAPE,
                },
            ]),
            Some(&mut diagnostics),
        );
        assert_eq!(graph.artboards[0].parent_indices, [-1, -1]);
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["rive.component-without-parent"]
        );
    }

    #[test]
    fn roots_a_component_whose_stated_parent_is_out_of_range_and_says_so() {
        let mut diagnostics = Vec::new();
        let graph = create_rive_object_graph(
            &document(vec![artboard(), component(SHAPE, 99)]),
            Some(&mut diagnostics),
        );
        assert_eq!(graph.artboards[0].parent_indices, [-1, -1]);
        assert_eq!(diagnostic_kinds(&diagnostics), ["rive.unresolved-parent"]);
    }

    #[test]
    fn starts_a_new_numbering_space_at_each_artboard() {
        let graph = create_rive_object_graph(
            &document(vec![
                artboard(),
                component(SHAPE, 0),
                artboard(),
                component(SHAPE, 0),
                component(ELLIPSE, 1),
            ]),
            None,
        );
        assert_eq!(
            graph
                .artboards
                .iter()
                .map(|board| board.objects.len())
                .collect::<Vec<_>>(),
            [2, 3]
        );
        assert_eq!(graph.artboards[1].parent_indices, [-1, 0, 1]);
    }
}

mod initialize_rive_object_graph {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_rive_object_graph() {
        let source = document(vec![artboard()]);
        let mut graph = create_rive_object_graph(&source, None);
        initialize_rive_object_graph(&mut graph, &document(Vec::new()), None);
        assert!(graph.artboards.is_empty());
    }
}

fn artboard() -> RiveCoreObject {
    return RiveCoreObject {
        properties: Vec::new(),
        type_key: ARTBOARD,
    };
}

fn component(type_key: u64, parent_index: u64) -> RiveCoreObject {
    return RiveCoreObject {
        properties: vec![RiveProperty {
            key: PARENT_ID,
            r#type: RiveFieldType::Uint,
            value: RiveValue::Uint(parent_index),
        }],
        type_key,
    };
}

fn diagnostic_kinds(diagnostics: &[ImportDiagnostic]) -> Vec<&str> {
    return diagnostics
        .iter()
        .map(|diagnostic| diagnostic.kind.as_str())
        .collect();
}

fn document(objects: Vec<RiveCoreObject>) -> RiveDocument {
    return RiveDocument {
        header: RiveDocumentHeader {
            file_id: 0,
            major_version: 7,
            minor_version: 0,
            table_of_contents: Vec::new(),
        },
        objects,
    };
}

fn type_keys(artboard: &RiveArtboardGraph) -> Vec<u64> {
    return artboard
        .objects
        .iter()
        .map(|object| object.type_key)
        .collect();
}
