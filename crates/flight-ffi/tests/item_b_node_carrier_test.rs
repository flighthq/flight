use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

const COMMITTED_DUAL_REPORT: &str = include_str!("ffi_dual_produced_types.tsv");
const GENERATED_DUAL_REPORT: &str =
    include_str!(concat!(env!("OUT_DIR"), "/ffi_dual_produced_types.tsv"));
const GENERATED_REACHABILITY_GRAPH: &str =
    include_str!(concat!(env!("OUT_DIR"), "/ffi_reachability_graph.tsv"));
const NODE_CONSUMER_MIGRATION: &str = include_str!("ffi_node_consumer_migration.tsv");

fn generated(name: &str) -> String {
    fs::read_to_string(Path::new(env!("OUT_DIR")).join(name)).unwrap()
}

fn wrapper<'a>(wrappers: &'a str, name: &str) -> &'a str {
    wrappers
        .split_once(&format!("fn {name}("))
        .unwrap_or_else(|| panic!("missing generated wrapper {name}"))
        .1
        .split("#[unsafe(no_mangle)]")
        .next()
        .unwrap()
}

#[test]
fn one_node_carrier_covers_concrete_abstract_nullable_array_and_callback_paths() {
    let header = generated("flight_ffi.h");
    let wrappers = generated("ffi_generated.rs");

    for line in [
        "typedef struct FlightNode FlightNode;",
        "typedef struct FlightNodeArray FlightNodeArray;",
        "FlightNode * flight_create_sprite(void);",
        "FlightNode * flight_add_node_child(const FlightNode * arg0, const FlightNode * arg1);",
        "void flight_compute_node_bounds_rectangle(void * arg0, const FlightNode * arg1, const FlightNode * arg2);",
        "void flight_add_node_children(const FlightNode * arg0, const FlightNodeArray * arg1);",
        "void flight_get_node_children(FlightNodeArray * arg0, const FlightNode * arg1);",
        "void flight_for_each_node_child(const FlightNode * arg0, bool (*arg1)(void *, const FlightNode *, size_t), void * arg2);",
        "void flight_free_node(FlightNode * arg0);",
        "void flight_free_node_array(FlightNodeArray * arg0);",
    ] {
        assert!(
            header.lines().any(|actual| actual == line),
            "missing {line}"
        );
    }
    for obsolete in [
        "flight_free_node_ref",
        "flight_free_node2_d_ref",
        "flight_free_node3_d_ref",
        "flight_free_sprite_ref",
        "flight_free_shape_ref",
        "flight_free_text_label_ref",
    ] {
        assert!(!header.contains(obsolete), "obsolete node free {obsolete}");
    }
    assert_eq!(header.matches("void flight_free_node(").count(), 1);

    for fragment in [
        "pub struct FfiNodeHandle {",
        "node: flight_sdk::NodeRef,",
        "node2d: Option<flight_sdk::Node2DRef>,",
        "node3d: Option<flight_sdk::Node3DRef>,",
        "concrete: Option<Box<dyn std::any::Any + Send + Sync>>",
        "std::sync::Arc::ptr_eq(&a.node, &b.node)",
        "flight_sdk::downcast_node_ref::<T>(&node.node)",
        "&ffi_node_from_node_ref(__a0.clone()) as *const FlightNode",
    ] {
        assert!(
            wrappers.contains(fragment),
            "missing generated fragment {fragment}"
        );
    }
    assert!(
        wrapper(&wrappers, "flight_get_text_label_string")
            .contains("ffi_node_concrete::<flight_sdk::TextLabel>")
    );
    assert!(
        wrapper(&wrappers, "flight_get_text_label_string").contains("return std::ptr::null_mut();")
    );
}

#[test]
fn generated_node_wrappers_have_no_raw_fat_ref_casts() {
    let wrappers = generated("ffi_generated.rs");
    for (line_number, line) in wrappers.lines().enumerate() {
        let normalized = line.replace("flight_sdk::", "");
        for pointer in ["*const", "*mut"] {
            for target in [
                "Ref<dyn Node>",
                "Ref<dyn Node2D>",
                "Ref<dyn Node3D>",
                "NodeRef",
                "Node2DRef",
                "Node3DRef",
            ] {
                let raw_cast = format!("as {pointer} {target}");
                assert!(
                    !normalized.contains(&raw_cast),
                    "generated raw node-ref cast at line {}: {line}",
                    line_number + 1
                );
            }
        }
    }
}

#[test]
fn landed_base_node_consumer_census_has_exact_reviewed_outcomes() {
    let mut fixture = NODE_CONSUMER_MIGRATION.lines();
    assert_eq!(
        fixture.next(),
        Some("format|ffi-node-consumer-migration|1")
    );
    assert_eq!(
        fixture.next(),
        Some(
            "source|ffi_reachability_graph.tsv|base|f56ed33887f1f426f01fe78d5efacb95fadc9d8f"
        )
    );
    assert_eq!(
        fixture.next(),
        Some("columns|function|base_carrier|expected_outcome")
    );

    let graph_rows: BTreeSet<_> = GENERATED_REACHABILITY_GRAPH.lines().collect();
    let generated_functions: BTreeSet<_> = GENERATED_REACHABILITY_GRAPH
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('|');
            (fields.next()? == "function").then(|| fields.next().unwrap())
        })
        .collect();
    let wrappers = generated("ffi_generated.rs");
    let header = generated("flight_ffi.h");
    let mut names = BTreeSet::new();
    let mut base_carriers = BTreeMap::new();
    let mut outcomes = BTreeMap::new();

    for (index, line) in fixture.enumerate() {
        let fields: Vec<_> = line.split('|').collect();
        assert_eq!(fields.len(), 4, "malformed census row {}: {line}", index + 4);
        assert_eq!(fields[0], "consumer", "malformed census row: {line}");
        let function = fields[1];
        let base_carrier = fields[2];
        let expected = fields[3];
        assert!(names.insert(function), "duplicate census function: {function}");
        *base_carriers.entry(base_carrier).or_insert(0usize) += 1;
        *outcomes.entry(expected).or_insert(0usize) += 1;

        let old_edge = format!("consume|{function}|{base_carrier}");
        match expected {
            "FlightNode" => {
                assert!(
                    graph_rows.contains(format!("consume|{function}|Box<FlightNode>").as_str()),
                    "{function} did not migrate to FlightNode"
                );
                assert!(!graph_rows.contains(old_edge.as_str()));
            }
            "FlightNodeArray" => {
                assert!(
                    graph_rows
                        .contains(format!("consume|{function}|Box<FlightNodeArray>").as_str()),
                    "{function} did not migrate to FlightNodeArray"
                );
                assert!(!graph_rows.contains(old_edge.as_str()));
            }
            "retired" => {
                assert!(!generated_functions.contains(function));
                assert!(!wrappers.contains(&format!("fn {function}(")));
                assert!(!header.contains(function));
            }
            "unreachable-optional" => {
                assert_eq!(function, "flight_create_rive_animation_clips");
                assert_eq!(
                    base_carrier,
                    "*const Option<flight_sdk::Ref<dyn flight_sdk::Node2D>>"
                );
                assert!(graph_rows.contains(old_edge.as_str()));
                assert!(graph_rows.contains(
                    format!("function|{function}|surface|unreachable|{base_carrier}").as_str()
                ));
                assert!(wrappers.contains(&format!("fn {function}(")));
                assert!(header.contains(function));
            }
            _ => panic!("unknown census outcome {expected} for {function}"),
        }
    }

    assert_eq!(names.len(), 162);
    assert_eq!(
        base_carriers["Box<flight_sdk::Ref<dyn flight_sdk::Node>>"],
        153
    );
    assert_eq!(
        base_carriers["Box<flight_sdk::Ref<dyn flight_sdk::Node2D>>"],
        8
    );
    assert_eq!(
        base_carriers["*const Option<flight_sdk::Ref<dyn flight_sdk::Node2D>>"],
        1
    );
    assert_eq!(outcomes["FlightNode"], 155);
    assert_eq!(outcomes["FlightNodeArray"], 4);
    assert_eq!(outcomes["retired"], 2);
    assert_eq!(outcomes["unreachable-optional"], 1);
}

#[test]
fn node_fields_are_locked_complete_and_never_implicitly_invalidate() {
    let header = generated("flight_ffi.h");
    let wrappers = generated("ffi_generated.rs");
    assert!(!header.contains("NodeFields *"));
    assert!(!header.contains("Node2DFields *"));
    assert!(!header.contains("Node3DFields *"));

    for field in ["enabled", "kind", "name"] {
        assert!(
            header.contains(&format!("flight_get_node_fields_{field}(")),
            "missing NodeFields getter for {field}"
        );
        assert!(
            header.contains(&format!("flight_set_node_fields_{field}(")),
            "missing NodeFields setter for {field}"
        );
    }
    for field in [
        "alpha",
        "pivot_x",
        "pivot_y",
        "rotation",
        "scale_x",
        "scale_y",
        "skew_x",
        "skew_y",
        "visible",
        "x",
        "y",
        "blend_mode",
        "clip",
        "material",
        "material_data",
    ] {
        assert!(
            header.contains(&format!("flight_get_node2_dfields_{field}(")),
            "missing Node2DFields getter for {field}"
        );
        assert!(
            header.contains(&format!("flight_set_node2_dfields_{field}(")),
            "missing Node2DFields setter for {field}"
        );
    }
    assert!(header.contains("flight_has_node2_dfields_blend_mode("));
    for field in ["alpha", "visible"] {
        assert!(header.contains(&format!("flight_get_node3_dfields_{field}(")));
        assert!(header.contains(&format!("flight_set_node3_dfields_{field}(")));
    }
    for field in [
        "position_x",
        "position_y",
        "position_z",
        "rotation_x",
        "rotation_y",
        "rotation_z",
        "rotation_w",
        "scale_x",
        "scale_y",
        "scale_z",
    ] {
        assert!(header.contains(&format!("flight_get_node3_dfields_{field}(")));
        assert!(header.contains(&format!("flight_set_node3_dfields_{field}(")));
    }

    for setter in [
        "flight_set_node_fields_name",
        "flight_set_node2_dfields_x",
        "flight_set_node2_dfields_blend_mode",
        "flight_set_node3_dfields_position_x",
    ] {
        let body = wrapper(&wrappers, setter);
        assert!(body.contains(".write()"), "{setter} does not lock");
        assert!(
            !body.contains("invalidate_"),
            "{setter} implicitly invalidates"
        );
    }
}

#[test]
fn ref_only_values_borrow_ref_handles_while_dual_produced_types_stay_pinned() {
    let wrappers = generated("ffi_generated.rs");
    for name in ["flight_get_clock_elapsed", "flight_set_clock_elapsed"] {
        let body = wrapper(&wrappers, name);
        assert!(body.contains("flight_sdk::Ref<flight_sdk::Clock>"));
        assert!(body.contains(if name.contains("set_") {
            ".write()"
        } else {
            ".read()"
        }));
    }

    assert_eq!(GENERATED_DUAL_REPORT, COMMITTED_DUAL_REPORT);
    let mut types: Vec<_> = GENERATED_DUAL_REPORT
        .lines()
        .skip(1)
        .map(|line| line.split('\t').next().unwrap())
        .collect();
    let original = types.clone();
    types.sort_unstable();
    assert_eq!(
        original, types,
        "dual-produced report must be deterministic"
    );
    assert_eq!(
        original,
        [
            "Bitmap",
            "Path",
            "TextLayoutResult",
            "Texture",
            "Texture2D",
            "XmlElement"
        ]
    );
}

#[test]
fn monomorphized_ref_only_trait_borrows_lock_the_ref_handle() {
    let wrappers = generated("ffi_generated.rs");
    for (name, concrete) in [
        (
            "flight_write_physics2d_joint_reaction__physics2_ddistance_joint",
            "Physics2DDistanceJoint",
        ),
        (
            "flight_write_physics2d_abi_set_joint_command__physics2_dwheel_joint",
            "Physics2DWheelJoint",
        ),
    ] {
        let body = wrapper(&wrappers, name);
        assert!(body.contains(&format!(
            "*const flight_sdk::Ref<flight_sdk::{concrete}>"
        )));
        assert!(body.contains(".read()"));
        assert!(body.contains("as &dyn flight_sdk::Physics2DJoint"));
    }
}

#[test]
fn hashlink_keeps_node_carriers_opaque_bytes() {
    let shim = generated("flight_hl.c");
    for line in [
        "DEFINE_PRIM(_BOOL, flight_node_equals, _BYTES _BYTES);",
        "DEFINE_PRIM(_BYTES, flight_node_array_create, _NO_ARG);",
        "DEFINE_PRIM(_BYTES, flight_node_array_get, _BYTES _I32);",
        "DEFINE_PRIM(_BOOL, flight_node_array_push, _BYTES _BYTES);",
        "DEFINE_PRIM(_BYTES, flight_create_sprite, _NO_ARG);",
        "DEFINE_PRIM(_F64, flight_get_node2_dfields_x, _BYTES);",
        "DEFINE_PRIM(_BOOL, flight_set_node2_dfields_blend_mode, _BYTES _I32 _BOOL);",
        "DEFINE_PRIM(_VOID, flight_get_node_children, _BYTES _BYTES);",
    ] {
        assert!(shim.lines().any(|actual| actual == line), "missing {line}");
    }
}
