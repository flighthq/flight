use flight_importdiagnostics::{ImportDiagnostic, ImportDiagnosticSeverity};
use flight_scene2d::{Node2DRef, create_display_object};
use flight_scene2d_formats::contract::*;
use flight_shape::Shape;

const ARTBOARD: u64 = 1;
const SHAPE: u64 = 3;
const RECTANGLE: u64 = 7;
const FILL: u64 = 20;
const N_SLICED_NODE: u64 = 508;
const NAME: u64 = 4;
const PARAMETRIC_WIDTH: u64 = 20;
const PARAMETRIC_HEIGHT: u64 = 21;

mod import_rive_n_sliced_node_component {
    use super::*;

    #[test]
    fn substitutes_a_container_and_reports_the_slicing_it_cannot_carry() {
        let diagnostics = Box::leak(Box::new(Vec::new()));
        let mut context = context_for(
            vec![object(N_SLICED_NODE, vec![text(NAME, "sliced")])],
            Some(diagnostics),
            false,
            false,
        );
        let node = import_rive_n_sliced_node_component(&mut context, 1).unwrap();
        assert_eq!(
            node.read().unwrap().node_fields().name.as_deref(),
            Some("sliced"),
        );
        let diagnostics = context.diagnostics.as_ref().unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.nine-slice-substituted");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
    }
}

mod import_rive_shape_component {
    use super::*;

    #[test]
    fn builds_a_shape_carrying_the_component_name() {
        let mut context = context_for(
            vec![object(SHAPE, vec![text(NAME, "box")])],
            None,
            false,
            false,
        );
        let node = import_rive_shape_component(&mut context, 1).unwrap();
        assert_eq!(
            node.read().unwrap().node_fields().name.as_deref(),
            Some("box"),
        );
    }
}

mod rebuild_rive_shapes {
    use super::*;

    #[test]
    fn fills_each_shape_from_the_paths_collected_under_it_and_stores_the_rebuild() {
        let mut context = context_for(
            vec![object(SHAPE, vec![text(NAME, "box")]), rectangle()],
            None,
            true,
            true,
        );
        import_shape_and_path(&mut context);
        rebuild_rive_shapes(&mut context);
        assert!(!shape_commands(&context.nodes[1].as_ref().unwrap()).is_empty());
        assert!(context.rebuilds.contains_key(&1));
    }

    #[test]
    fn draws_geometry_with_no_paint_when_the_paint_family_is_not_registered() {
        let painted = build_shape_commands(true);
        let bare = build_shape_commands(false);
        assert!(!bare.is_empty());
        assert!(bare.len() < painted.len());
    }

    #[test]
    fn skips_a_shape_index_whose_node_never_became_a_display_object() {
        let mut context = context_for(
            vec![object(SHAPE, vec![text(NAME, "box")])],
            None,
            false,
            false,
        );
        context.nodes.push(None);
        context.shape_paths.insert(1, Vec::new());
        rebuild_rive_shapes(&mut context);
        assert!(context.rebuilds.is_empty());
    }
}

mod register_rive_shape_handlers {
    use super::*;

    #[test]
    fn claims_the_shape_and_the_nine_sliced_node() {
        let mut registry = create_rive_import_registry();
        register_rive_shape_handlers(&mut registry);
        assert!(get_rive_core_object_handler(&registry, SHAPE as i32).is_some());
        assert!(get_rive_core_object_handler(&registry, N_SLICED_NODE as i32).is_some());
    }
}

fn build_shape_commands(with_paint: bool) -> Vec<flight_shape::ShapeCommandToken> {
    let mut context = context_for(
        vec![object(SHAPE, vec![text(NAME, "box")]), rectangle(), fill()],
        None,
        true,
        with_paint,
    );
    import_shape_and_path(&mut context);
    context.nodes.push(None);
    rebuild_rive_shapes(&mut context);
    return shape_commands(context.nodes[1].as_ref().unwrap());
}

fn context_for(
    components: Vec<RiveCoreObject>,
    diagnostics: Option<&'static mut Vec<ImportDiagnostic>>,
    with_path: bool,
    with_paint: bool,
) -> RiveArtboardImportContext<'static> {
    let mut registry = create_rive_import_registry();
    if with_path {
        register_rive_path_handlers(&mut registry);
    }
    if with_paint {
        register_rive_paint_handlers(&mut registry);
    }
    let registry = Box::leak(Box::new(registry));
    let mut objects = vec![object(ARTBOARD, vec![text(NAME, "Board")])];
    objects.extend(components);
    let graph = Box::leak(Box::new(RiveArtboardGraph {
        parent_indices: objects
            .iter()
            .enumerate()
            .map(|(index, _)| {
                if index == 0 {
                    -1
                } else if index == 1 {
                    0
                } else {
                    1
                }
            })
            .collect(),
        stream_end: objects.len(),
        stream_start: 0,
        objects,
    }));
    let root: Node2DRef = create_display_object();
    return create_rive_artboard_import_context(
        registry,
        graph,
        &graph.objects,
        root,
        &[],
        diagnostics,
    );
}

fn double(key: u64, value: f32) -> RiveProperty {
    return RiveProperty {
        key,
        r#type: RiveFieldType::Double,
        value: RiveValue::Double(value),
    };
}

fn fill() -> RiveCoreObject {
    return object(FILL, Vec::new());
}

fn import_shape_and_path(context: &mut RiveArtboardImportContext<'_>) {
    let shape = import_rive_shape_component(context, 1);
    context.nodes.push(shape);
    let handler = get_rive_core_object_handler(context.registry, 12).unwrap();
    (handler.import_component.as_ref().unwrap())(context, 2);
}

fn object(type_key: u64, properties: Vec<RiveProperty>) -> RiveCoreObject {
    return RiveCoreObject {
        properties,
        type_key,
    };
}

fn rectangle() -> RiveCoreObject {
    return object(
        RECTANGLE,
        vec![
            double(PARAMETRIC_WIDTH, 10.0),
            double(PARAMETRIC_HEIGHT, 20.0),
        ],
    );
}

fn shape_commands(node: &Node2DRef) -> Vec<flight_shape::ShapeCommandToken> {
    let guard = node.read().unwrap();
    return guard
        .as_any()
        .downcast_ref::<Shape>()
        .unwrap()
        .data
        .commands
        .clone();
}

fn text(key: u64, value: &str) -> RiveProperty {
    return RiveProperty {
        key,
        r#type: RiveFieldType::String,
        value: RiveValue::String(value.to_string()),
    };
}
