// flight-bindgen is a binary crate, so its self-contained FFI surface module is compiled into this
// test crate directly.
#[path = "../src/ffi_surface.rs"]
mod ffi_surface;

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

fn fixture_surface() -> FfiSurface {
    return FfiSurface {
        c: parse_ffi_header(HEADER),
        hl: parse_hl_primitives(HL_SHIM),
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
