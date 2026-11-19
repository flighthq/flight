// flight-bindgen is a binary crate, so its self-contained FFI surface module is compiled into this
// test crate directly.
#[path = "../src/ffi_surface.rs"]
mod ffi_surface;

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use ffi_surface::*;

const HEADER: &str = "\
#include <stdint.h>
typedef struct FlightShapeBoundsContextVTable {
bool (*close_path)(void *context);
} FlightShapeBoundsContextVTable;
float flight_get_audio_bus_gain(void * arg0);
float flight_set_audio_bus_gain(void * arg0, void * arg1, void * arg2, float arg3);
bool flight_get_audio_bus_muted(void * arg0);
bool flight_set_audio_bus_muted(void * arg0, bool arg1);
float flight_get_video_channel_current_time(void * arg0, void * arg1);
void flight_set_clock_scale(void * arg0, double arg1);
void * flight_create_animation_player(void * arg0 /* ownership transferred; do not use or free after call */);
bool flight_for_each_path_segment(void * arg0, bool (*arg1)(void *, uint32_t, double), void * arg2);
void flight_free_string(char * arg0);
";

const NO_ACCESS: FieldAccess = FieldAccess {
    get: false,
    set: false,
};

const HL_SHIM: &str = "\
HL_PRIM float HL_NAME(flight_get_audio_bus_gain)(vbyte * arg0) { return 0; }
DEFINE_PRIM(_F32, flight_get_audio_bus_gain, _BYTES);
DEFINE_PRIM(_F32, flight_set_audio_bus_gain, _BYTES _BYTES _BYTES _F32);
DEFINE_PRIM(_BOOL, flight_get_audio_bus_muted, _BYTES);
DEFINE_PRIM(_BOOL, flight_set_audio_bus_muted, _BYTES _BOOL);
DEFINE_PRIM(_F32, flight_get_video_channel_current_time, _BYTES _BYTES);
DEFINE_PRIM(_VOID, flight_set_clock_scale, _BYTES _F64);
DEFINE_PRIM(_BYTES, flight_create_animation_player, _BYTES);
DEFINE_PRIM(_BOOL, flight_for_each_path_segment, _BYTES _BYTES _BYTES);
DEFINE_PRIM(_VOID, flight_free_string, _BYTES);
DEFINE_PRIM(_I32, flight_get_answer, _NO_ARG);
";

mod contains_ffi_symbol {
    use super::*;

    #[test]
    fn reports_only_symbols_the_header_declares() {
        let surface = fixture_surface();
        assert!(contains_ffi_symbol(&surface, "flight_get_audio_bus_gain"));
        assert!(!contains_ffi_symbol(&surface, "flight_get_audio_bus_pan"));
        assert!(!contains_ffi_symbol(&surface, "close_path"));
    }
}

mod declaration_matches_ffi_surface {
    use super::*;

    #[test]
    fn accepts_a_callback_pair_as_two_physical_carriers() {
        let surface = fixture_surface();
        let hl = "\t@:hlNative(\"flight\", \"flight_for_each_path_segment\")\n\tpublic static function forEachPathSegment(path:flight._hl.Path, visitorFn:hl.Bytes, visitorCtx:hl.Bytes):Bool;";
        let cpp = "\t@:native(\"flight_for_each_path_segment\")\n\tpublic static function forEachPathSegment(path:flight._cpp.Path, visitorFn:cpp.Star<cpp.Void>, visitorCtx:cpp.Star<cpp.Void>):Bool;";
        assert!(declaration_matches_ffi_surface(&surface, "_hl", hl));
        assert!(declaration_matches_ffi_surface(&surface, "_cpp", cpp));
    }
    #[test]
    fn rejects_a_generic_lowering_with_the_wrong_return_carrier() {
        let surface = fixture_surface();
        let hl = "\t@:hlNative(\"flight\", \"flight_for_each_path_segment\")\n\tpublic static function forEachPathSegment(path:flight._hl.Path, visitorFn:hl.Bytes, visitorCtx:hl.Bytes):Void;";
        assert!(!declaration_matches_ffi_surface(&surface, "_hl", hl));
    }
    #[test]
    fn rejects_a_symbol_the_surface_lacks() {
        let surface = fixture_surface();
        let cpp = "\t@:native(\"flight_missing\")\n\tpublic static function missing():Void;";
        assert!(!declaration_matches_ffi_surface(&surface, "_cpp", cpp));
    }
    #[test]
    fn accepts_a_hashlink_packed_float_array_as_the_arr_carrier() {
        let surface = FfiSurface {
            c: BTreeMap::new(),
            hl: parse_hl_primitives("DEFINE_PRIM(_VOID, flight_set_matrix4, _BYTES _ARR);"),
            native_skips: BTreeSet::new(),
        };
        let hl = "\t@:hlNative(\"flight\", \"flight_set_matrix4\")\n\tprivate static function __flightPacked_setMatrix4(out:flight._hl.Matrix4, values:hl.NativeArray<Float>):Void;";
        assert!(declaration_matches_ffi_surface(&surface, "_hl", hl));
    }
}

mod get_ffi_field_access {
    use super::*;

    #[test]
    fn binds_each_direction_only_with_accessor_shape() {
        let surface = fixture_surface();
        let gain = get_ffi_field_access(
            &surface,
            "flight_get_audio_bus_gain",
            "flight_set_audio_bus_gain",
            "f32",
        );
        assert_eq!(
            gain,
            FieldAccess {
                get: true,
                set: false
            }
        );
        let muted = get_ffi_field_access(
            &surface,
            "flight_get_audio_bus_muted",
            "flight_set_audio_bus_muted",
            "bool",
        );
        assert_eq!(
            muted,
            FieldAccess {
                get: true,
                set: true
            }
        );
    }
    #[test]
    fn rejects_a_getter_with_extra_parameters_and_a_void_setter() {
        let surface = fixture_surface();
        let current_time = get_ffi_field_access(
            &surface,
            "flight_get_video_channel_current_time",
            "flight_set_video_channel_current_time",
            "f32",
        );
        assert_eq!(current_time, NO_ACCESS);
        let scale = get_ffi_field_access(
            &surface,
            "flight_get_clock_scale",
            "flight_set_clock_scale",
            "f64",
        );
        assert_eq!(scale, NO_ACCESS);
    }
    #[test]
    fn rejects_a_direction_whose_hashlink_carrier_drifted_alone() {
        let mut surface = fixture_surface();
        surface.hl = parse_hl_primitives(&HL_SHIM.replace(
            "DEFINE_PRIM(_BOOL, flight_get_audio_bus_muted, _BYTES);",
            "DEFINE_PRIM(_I32, flight_get_audio_bus_muted, _BYTES);",
        ));
        let muted = get_ffi_field_access(
            &surface,
            "flight_get_audio_bus_muted",
            "flight_set_audio_bus_muted",
            "bool",
        );
        assert_eq!(
            muted,
            FieldAccess {
                get: false,
                set: true
            }
        );
        surface.hl.remove("flight_set_audio_bus_muted");
        let muted = get_ffi_field_access(
            &surface,
            "flight_get_audio_bus_muted",
            "flight_set_audio_bus_muted",
            "bool",
        );
        assert_eq!(muted, NO_ACCESS);
    }
    #[test]
    fn rejects_a_field_type_that_disagrees_with_the_native_carrier() {
        let surface = fixture_surface();
        let gain = get_ffi_field_access(
            &surface,
            "flight_get_audio_bus_gain",
            "flight_set_audio_bus_gain",
            "f64",
        );
        assert_eq!(gain, NO_ACCESS);
    }
}

mod has_native_ffi_symbol {
    use super::*;

    #[test]
    fn excludes_reviewed_native_skips_and_absent_symbols() {
        let surface = fixture_surface();
        assert!(has_native_ffi_symbol(&surface, "flight_get_audio_bus_gain"));
        assert!(!has_native_ffi_symbol(
            &surface,
            "flight_for_each_path_segment"
        ));
        assert!(contains_ffi_symbol(
            &surface,
            "flight_for_each_path_segment"
        ));
        assert!(!has_native_ffi_symbol(&surface, "flight_missing"));
    }
}

mod has_retained_callback_carrier {
    use super::*;

    // Exact flight-ffi output for retained callbacks: a trailing carrier, one followed by a scalar,
    // and two carriers in one wrapper.
    const CARRIER_HEADER: &str = "\
void * flight_watch_path(const char * arg0, void (*arg1)(void *, void *), void * arg2, void (*arg3)(void *));
void flight_enable_node_guards(void * arg0, void * arg1, double (*arg2)(void *), void * arg3, void (*arg4)(void *));
void flight_start_input_key_repeat_timer(void * arg0, void (*arg1)(void *), void * arg2, void (*arg3)(void *), double arg4);
int32_t flight_watch_geolocation_position(void * arg0, void (*arg1)(void *, void *), void * arg2, void (*arg3)(void *), void * arg4, void (*arg5)(void *, uint32_t), void * arg6, void (*arg7)(void *));
";
    const CARRIER_HL: &str = "\
DEFINE_PRIM(_BYTES, flight_watch_path, _BYTES _BYTES _BYTES _BYTES);
DEFINE_PRIM(_VOID, flight_enable_node_guards, _BYTES _BYTES _BYTES _BYTES _BYTES);
DEFINE_PRIM(_VOID, flight_start_input_key_repeat_timer, _BYTES _BYTES _BYTES _BYTES _F64);
DEFINE_PRIM(_I32, flight_watch_geolocation_position, _BYTES _BYTES _BYTES _BYTES _BYTES _BYTES _BYTES _BYTES);
";

    fn carrier_surface(header: &str, hl: &str) -> FfiSurface {
        return FfiSurface {
            c: parse_ffi_header(header),
            hl: parse_hl_primitives(hl),
            native_skips: BTreeSet::new(),
        };
    }

    #[test]
    fn accepts_the_callback_context_release_triple() {
        let surface = carrier_surface(CARRIER_HEADER, CARRIER_HL);
        for symbol in [
            "flight_enable_node_guards",
            "flight_start_input_key_repeat_timer",
            "flight_watch_geolocation_position",
            "flight_watch_path",
        ] {
            assert!(has_retained_callback_carrier(&surface, symbol), "{symbol}");
        }
    }

    #[test]
    fn rejects_a_borrowed_callback_or_a_pair_without_release() {
        let surface = fixture_surface();
        assert!(!has_retained_callback_carrier(
            &surface,
            "flight_for_each_path_segment"
        ));
        assert!(!has_retained_callback_carrier(
            &surface,
            "flight_set_audio_bus_gain"
        ));
        let before_release = carrier_surface(
            "void flight_enable_node_guards(void * arg0, void * arg1, double (*arg2)(void *), void * arg3);",
            "DEFINE_PRIM(_VOID, flight_enable_node_guards, _BYTES _BYTES _BYTES _BYTES);",
        );
        assert!(!has_retained_callback_carrier(
            &before_release,
            "flight_enable_node_guards"
        ));
    }

    #[test]
    fn rejects_a_carrier_missing_or_drifted_on_one_surface() {
        let hl_release_drift = CARRIER_HL.replace(
            "flight_watch_path, _BYTES _BYTES _BYTES _BYTES",
            "flight_watch_path, _BYTES _BYTES _BYTES _I32",
        );
        let hl_arity_drift = CARRIER_HL.replace(
            "flight_watch_path, _BYTES _BYTES _BYTES _BYTES",
            "flight_watch_path, _BYTES _BYTES _BYTES",
        );
        let c_release_drift = CARRIER_HEADER.replace(
            "void * arg2, void (*arg3)(void *));\nvoid flight_enable",
            "void * arg2, void * arg3);\nvoid flight_enable",
        );
        for surface in [
            carrier_surface(CARRIER_HEADER, &hl_release_drift),
            carrier_surface(CARRIER_HEADER, &hl_arity_drift),
            carrier_surface(&c_release_drift, CARRIER_HL),
            carrier_surface(CARRIER_HEADER, ""),
            carrier_surface("", CARRIER_HL),
        ] {
            assert!(!has_retained_callback_carrier(
                &surface,
                "flight_watch_path"
            ));
        }
    }
}

mod load_ffi_surface {
    use super::*;

    #[test]
    fn reads_the_header_and_the_hashlink_shim() {
        let dir = scratch_dir("load");
        fs::write(dir.join("flight_ffi.h"), HEADER).unwrap();
        fs::write(dir.join("flight_hl.c"), HL_SHIM).unwrap();
        let surface = load_ffi_surface(&dir);
        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(surface.c.len(), 9);
        assert_eq!(surface.hl.len(), 10);
        assert!(surface.native_skips.is_empty());
    }
}

mod native_node_carrier {
    use super::*;

    #[test]
    fn recognizes_only_the_typed_node_handle_and_collection_carriers() {
        assert_eq!(
            native_node_carrier("FlightNode *"),
            Some(NativeNodeCarrier::Node)
        );
        assert_eq!(
            native_node_carrier("const FlightNode *"),
            Some(NativeNodeCarrier::Node)
        );
        assert_eq!(
            native_node_carrier("FlightNodeArray *"),
            Some(NativeNodeCarrier::NodeArray)
        );
        assert_eq!(
            native_node_carrier("const FlightNode * const *"),
            Some(NativeNodeCarrier::NodePointerArray)
        );
        assert_eq!(native_node_carrier("void *"), None);
    }
}

mod parse_ffi_header {
    use super::*;

    #[test]
    fn keeps_callback_pairs_and_strips_ownership_comments() {
        let header = parse_ffi_header(HEADER);
        assert_eq!(
            header["flight_for_each_path_segment"],
            FfiSignature {
                ret: "bool".into(),
                params: vec!["void *".into(), "fn *".into(), "void *".into()],
            }
        );
        assert_eq!(header["flight_create_animation_player"].params, ["void *"]);
        assert_eq!(header["flight_free_string"].params, ["char *"]);
        assert!(!header.contains_key("close_path"));
    }
}

mod parse_hl_primitives {
    use super::*;

    #[test]
    fn reads_define_prim_carriers_including_no_arg() {
        let primitives = parse_hl_primitives(HL_SHIM);
        assert_eq!(
            primitives["flight_set_audio_bus_gain"],
            FfiSignature {
                ret: "_F32".into(),
                params: vec![
                    "_BYTES".into(),
                    "_BYTES".into(),
                    "_BYTES".into(),
                    "_F32".into()
                ],
            }
        );
        assert!(primitives["flight_get_answer"].params.is_empty());
    }
}

mod signature_has_native_node {
    use super::*;

    #[test]
    fn detects_node_handles_in_returns_and_parameters() {
        assert!(signature_has_native_node(&FfiSignature {
            ret: "FlightNode *".to_string(),
            params: vec![],
        }));
        assert!(signature_has_native_node(&FfiSignature {
            ret: "void".to_string(),
            params: vec!["FlightNodeArray *".to_string()],
        }));
        assert!(!signature_has_native_node(&FfiSignature {
            ret: "bool".to_string(),
            params: vec!["void *".to_string()],
        }));
    }
}

mod symbol_has_native_node {
    use super::*;

    #[test]
    fn consults_the_exact_c_signature() {
        let surface = FfiSurface {
            c: BTreeMap::from([(
                "flight_make_node".to_string(),
                FfiSignature {
                    ret: "FlightNode *".to_string(),
                    params: vec![],
                },
            )]),
            hl: BTreeMap::new(),
            native_skips: BTreeSet::new(),
        };
        assert!(symbol_has_native_node(&surface, "flight_make_node"));
        assert!(!symbol_has_native_node(&surface, "flight_missing"));
    }
}

mod verify_generated_externs {
    use super::*;

    #[test]
    fn accepts_correct_accessors_and_module_functions() {
        let dir = scratch_dir("verify-ok");
        write_tree(
            &dir,
            "private extern class AudioBus_Ffi {\n\t@:hlNative(\"flight\", \"flight_get_audio_bus_gain\")\n\tstatic function get_gain(ptr:hl.Bytes):Single;\n}\n",
            "private extern class AudioBus_Ffi {\n\t@:native(\"flight_get_audio_bus_muted\") static function get_muted(ptr:cpp.Star<cpp.Void>):Bool;\n\t@:native(\"flight_set_audio_bus_muted\") static function set_muted(ptr:cpp.Star<cpp.Void>, value:Bool):Bool;\n}\n",
            "\t@:native(\"flight_free_string\")\n\tpublic static function freeString(ptr:cpp.ConstCharStar):Void;\n",
        );
        let report = verify_generated_externs(&dir, &fixture_surface());
        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(report.mismatches, Vec::<String>::new());
        assert_eq!(report.checked, 4);
    }
    #[test]
    fn fails_a_wrong_arity_accessor() {
        let dir = scratch_dir("verify-arity");
        write_tree(
            &dir,
            "abstract AudioBus(hl.Bytes) {}\n",
            "private extern class AudioBus_Ffi {\n\t@:native(\"flight_set_audio_bus_gain\") static function set_gain(ptr:cpp.Star<cpp.Void>, value:Single):Single;\n}\n",
            "",
        );
        let report = verify_generated_externs(&dir, &fixture_surface());
        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(report.mismatches.len(), 1, "{:?}", report.mismatches);
        assert!(report.mismatches[0].contains("flight_set_audio_bus_gain"));
    }
    #[test]
    fn fails_a_symbol_declared_by_two_modules() {
        let dir = scratch_dir("verify-twice");
        let free = "\t@:native(\"flight_free_string\")\n\tpublic static function freeString(ptr:cpp.ConstCharStar):Void;\n";
        write_tree(&dir, "abstract AudioBus(hl.Bytes) {}\n", "", free);
        let second = dir.join("flight/_cpp/_fn/Audio.hx");
        fs::write(second, format!("extern class Audio {{\n{free}}}\n")).unwrap();
        let report = verify_generated_externs(&dir, &fixture_surface());
        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(report.mismatches.len(), 1, "{:?}", report.mismatches);
        assert!(report.mismatches[0].contains("declared by 2 modules"));
    }
}

mod verify_generated_node_externs {
    use super::*;

    fn node_surface() -> FfiSurface {
        return FfiSurface {
            c: parse_ffi_header(
                "FlightNode * flight_make_node(const FlightNode * arg0);\n\
                 void flight_fill_nodes(FlightNodeArray * arg0, const FlightNode * const * arg1, size_t arg2);",
            ),
            hl: parse_hl_primitives(
                "DEFINE_PRIM(_BYTES, flight_make_node, _BYTES);\n\
                 DEFINE_PRIM(_VOID, flight_fill_nodes, _BYTES _BYTES _I32);",
            ),
            native_skips: BTreeSet::new(),
        };
    }

    #[test]
    fn accepts_only_exact_node_handle_array_and_pointer_array_types() {
        let dir = scratch_dir("node-types-ok");
        let hl = dir.join("flight/_hl");
        let cpp = dir.join("flight/_cpp");
        fs::create_dir_all(&hl).unwrap();
        fs::create_dir_all(&cpp).unwrap();
        fs::write(
            hl.join("Nodes.hx"),
            "@:hlNative(\"flight\", \"flight_make_node\")\nstatic function make(node:flight._hl.FlightNode):flight._hl.FlightNode;\n\
             @:hlNative(\"flight\", \"flight_fill_nodes\")\nstatic function fill(out:flight._hl.FlightNodeArray, nodes:flight._hl.FlightNodePointerArray, count:Int):Void;\n",
        )
        .unwrap();
        fs::write(
            cpp.join("Nodes.hx"),
            "@:native(\"flight_make_node\") static function make(node:flight._cpp.FlightNode):flight._cpp.FlightNode;\n\
             @:native(\"flight_fill_nodes\") static function fill(out:flight._cpp.FlightNodeArray, nodes:flight._cpp.FlightNodePointerArray, count:Int):Void;\n",
        )
        .unwrap();
        let report = verify_generated_node_externs(&dir, &node_surface());
        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(report.checked, 4);
        assert_eq!(report.mismatches, Vec::<String>::new());
    }

    #[test]
    fn rejects_raw_and_old_per_kind_node_carriers_even_when_the_physical_abi_matches() {
        let dir = scratch_dir("node-types-wrong");
        let hl = dir.join("flight/_hl");
        let cpp = dir.join("flight/_cpp");
        fs::create_dir_all(&hl).unwrap();
        fs::create_dir_all(&cpp).unwrap();
        fs::write(
            hl.join("Nodes.hx"),
            "@:hlNative(\"flight\", \"flight_make_node\")\nstatic function make(node:hl.Bytes):hl.Bytes;\n",
        )
        .unwrap();
        fs::write(
            cpp.join("Nodes.hx"),
            "@:native(\"flight_make_node\") static function make(node:flight._cpp.Node2DFields):flight._cpp.Node2DFields;\n",
        )
        .unwrap();
        let report = verify_generated_node_externs(&dir, &node_surface());
        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(report.checked, 2);
        assert_eq!(report.mismatches.len(), 4, "{:?}", report.mismatches);
        assert!(
            report
                .mismatches
                .iter()
                .any(|error| error.contains("hl.Bytes"))
        );
        assert!(
            report
                .mismatches
                .iter()
                .any(|error| error.contains("Node2DFields"))
        );
    }
}

fn fixture_surface() -> FfiSurface {
    return FfiSurface {
        c: parse_ffi_header(HEADER),
        hl: parse_hl_primitives(HL_SHIM),
        native_skips: BTreeSet::from(["flight_for_each_path_segment".to_string()]),
    };
}

fn scratch_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "flight-bindgen-ffi-surface-{name}-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    return dir;
}

fn write_tree(dir: &Path, hl_type: &str, cpp_type: &str, cpp_module: &str) {
    let hl = dir.join("flight/_hl");
    let cpp_fn = dir.join("flight/_cpp/_fn");
    fs::create_dir_all(&hl).unwrap();
    fs::create_dir_all(&cpp_fn).unwrap();
    fs::write(hl.join("AudioBus.hx"), hl_type).unwrap();
    fs::write(dir.join("flight/_cpp/AudioBus.hx"), cpp_type).unwrap();
    fs::write(
        cpp_fn.join("App.hx"),
        format!("extern class App {{\n{cpp_module}}}\n"),
    )
    .unwrap();
}
