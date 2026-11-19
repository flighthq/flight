use std::fs;
use std::path::Path;

const COMMITTED_DUAL_REPORT: &str = include_str!("ffi_dual_produced_types.tsv");
const GENERATED_DUAL_REPORT: &str =
    include_str!(concat!(env!("OUT_DIR"), "/ffi_dual_produced_types.tsv"));

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
    assert!(!wrappers.contains("as *const flight_sdk::Ref<dyn flight_sdk::Node>"));
    assert!(!wrappers.contains("as *mut flight_sdk::Ref<dyn flight_sdk::Node>"));

    for fragment in [
        "pub struct FfiNodeHandle {",
        "node: flight_sdk::NodeRef,",
        "node2d: Option<flight_sdk::Node2DRef>,",
        "node3d: Option<flight_sdk::Node3DRef>,",
        "concrete: Option<Box<dyn std::any::Any + Send + Sync>>",
        "std::sync::Arc::ptr_eq(&a.node, &b.node)",
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
fn hashlink_keeps_node_carriers_opaque_bytes() {
    let shim = generated("flight_hl.c");
    for line in [
        "DEFINE_PRIM(_BOOL, flight_node_equals, _BYTES _BYTES);",
        "DEFINE_PRIM(_BYTES, flight_node_array_create, _NO_ARG);",
        "DEFINE_PRIM(_BYTES, flight_node_array_get, _BYTES _I32);",
        "DEFINE_PRIM(_BOOL, flight_node_array_push, _BYTES _BYTES);",
        "DEFINE_PRIM(_BYTES, flight_create_sprite, _NO_ARG);",
        "DEFINE_PRIM(_F32, flight_get_node2_dfields_x, _BYTES);",
        "DEFINE_PRIM(_BOOL, flight_set_node2_dfields_blend_mode, _BYTES _I32 _BOOL);",
        "DEFINE_PRIM(_VOID, flight_get_node_children, _BYTES _BYTES);",
    ] {
        assert!(shim.lines().any(|actual| actual == line), "missing {line}");
    }
}
