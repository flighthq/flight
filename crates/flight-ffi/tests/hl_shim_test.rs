//! Pins the HashLink carriers `native_bindings.rs` writes into `flight_hl.c` and `flight_ffi.h`.
//! Scalar tuple outputs (`out_0`, `out_1`, ...) are typed `_REF` pointers that match the generated
//! `hl.Ref<T>` externs; every other pointer, including scalar slices and fixed-array outputs, stays an
//! opaque `_BYTES` carrier that matches `hl.Bytes`.

use std::fs;
use std::path::Path;

#[test]
fn opaque_and_scalar_buffer_pointers_stay_bytes_carriers() {
    let (header, shim) = generated();
    // An SDK handle, a scalar fixed-array output named `out`, and a scalar slice.
    for line in [
        "void flight_compute_rectangle_intersection(void * arg0, void * arg1, void * arg2);",
        "void flight_sample_color_lut(void * arg0, void * arg1, float arg2, float arg3, float arg4);",
        "void * flight_read_abc_file(void * arg0, size_t arg1);",
    ] {
        assert_line(&header, line);
    }
    for line in [
        "HL_PRIM void HL_NAME(flight_compute_rectangle_intersection)(vbyte * arg0, vbyte * arg1, vbyte * arg2) { flight_compute_rectangle_intersection((void *)arg0, (void *)arg1, (void *)arg2); }",
        "DEFINE_PRIM(_VOID, flight_compute_rectangle_intersection, _BYTES _BYTES _BYTES);",
        "HL_PRIM void HL_NAME(flight_sample_color_lut)(vbyte * arg0, vbyte * arg1, float arg2, float arg3, float arg4) { flight_sample_color_lut((void *)arg0, (void *)arg1, (float)arg2, (float)arg3, (float)arg4); }",
        "DEFINE_PRIM(_VOID, flight_sample_color_lut, _BYTES _BYTES _F32 _F32 _F32);",
        "HL_PRIM vbyte * HL_NAME(flight_read_abc_file)(vbyte * arg0, int arg1) { return (vbyte *)flight_read_abc_file((void *)arg0, (size_t)arg1); }",
        "DEFINE_PRIM(_BYTES, flight_read_abc_file, _BYTES _I32);",
    ] {
        assert_line(&shim, line);
    }
}

#[test]
fn random_gaussian_pair_outputs_are_typed_hashlink_references() {
    let (header, shim) = generated();
    assert_line(
        &header,
        "void flight_random_gaussian_pair(float (*arg0)(void *), void * arg1, float arg2, float arg3, float * arg4, float * arg5);",
    );
    assert_line(
        &shim,
        "HL_PRIM void HL_NAME(flight_random_gaussian_pair)(vbyte * arg0, vbyte * arg1, float arg2, float arg3, float * arg4, float * arg5) { flight_random_gaussian_pair((float (*)(void *))arg0, (void *)arg1, (float)arg2, (float)arg3, (float *)arg4, (float *)arg5); }",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_VOID, flight_random_gaussian_pair, _BYTES _BYTES _F32 _F32 _REF(_F32) _REF(_F32));",
    );
    // Only tuple outputs are references; a new `_REF` carrier must be a deliberate ABI change.
    let mut references: Vec<_> = shim
        .lines()
        .filter(|line| line.starts_with("DEFINE_PRIM") && line.contains("_REF("))
        .collect();
    references.sort();
    assert_eq!(
        references,
        [
            "DEFINE_PRIM(_BOOL, flight_get_index_range_for_cluster, _BYTES _I32 _I32 _REF(_I32) _REF(_I32));",
            "DEFINE_PRIM(_BOOL, flight_get_path_last_point, _BYTES _REF(_F64) _REF(_F64));",
            "DEFINE_PRIM(_VOID, flight_random_gaussian_pair, _BYTES _BYTES _F32 _F32 _REF(_F32) _REF(_F32));",
        ]
    );
}

#[test]
fn skip_reduction_carriers_have_exact_header_and_hashlink_registrations() {
    let (header, shim) = generated();
    for (prototype, registration) in [
        // &[&str] -> borrowed C string array + length.
        (
            "char * flight_join_file_path(const char * const * arg0, size_t arg1);",
            "DEFINE_PRIM(_BYTES, flight_join_file_path, _BYTES _I32);",
        ),
        // Option<bool> return -> i32 sentinel.
        (
            "int32_t flight_get_connectivity_online(void * arg0);",
            "DEFINE_PRIM(_I32, flight_get_connectivity_online, _BYTES);",
        ),
        // NonEntityCreateResult<T> peeled to T (struct) and to Ref<T>.
        (
            "void * flight_create_safe_area_insets(void);",
            "DEFINE_PRIM(_BYTES, flight_create_safe_area_insets, _NO_ARG);",
        ),
        (
            "void * flight_create_default_edit_menu_template(void);",
            "DEFINE_PRIM(_BYTES, flight_create_default_edit_menu_template, _NO_ARG);",
        ),
        // Option<&dyn TextureVariant> monomorphized to nullable concrete pointers.
        (
            "bool flight_equals_texture__texture__texture(void * arg0, void * arg1);",
            "DEFINE_PRIM(_BOOL, flight_equals_texture__texture__texture, _BYTES _BYTES);",
        ),
        // Option<TextureSourceRef> -> nullable opaque handle.
        (
            "void flight_set_texture_source__texture(void * arg0, void * arg1);",
            "DEFINE_PRIM(_VOID, flight_set_texture_source__texture, _BYTES _BYTES);",
        ),
        (
            "void flight_set_cube_texture_face(void * arg0, size_t arg1, void * arg2);",
            "DEFINE_PRIM(_VOID, flight_set_cube_texture_face, _BYTES _I32 _BYTES);",
        ),
        // Option<scalar tuple> -> bool presence + typed out references.
        (
            "bool flight_get_path_last_point(void * arg0, double * arg1, double * arg2);",
            "DEFINE_PRIM(_BOOL, flight_get_path_last_point, _BYTES _REF(_F64) _REF(_F64));",
        ),
        (
            "bool flight_get_index_range_for_cluster(void * arg0, int32_t arg1, int32_t arg2, int32_t * arg3, int32_t * arg4);",
            "DEFINE_PRIM(_BOOL, flight_get_index_range_for_cluster, _BYTES _I32 _I32 _REF(_I32) _REF(_I32));",
        ),
        // Signal<()> and Option<Signal<()>> -> owned opaque handles released by one free.
        (
            "void * flight_enable_command_history_signals(void * arg0);",
            "DEFINE_PRIM(_BYTES, flight_enable_command_history_signals, _BYTES);",
        ),
        (
            "void * flight_get_command_history_signals(void * arg0);",
            "DEFINE_PRIM(_BYTES, flight_get_command_history_signals, _BYTES);",
        ),
        (
            "void flight_free_unit_signal(void * arg0);",
            "DEFINE_PRIM(_VOID, flight_free_unit_signal, _BYTES);",
        ),
    ] {
        assert_line(&header, prototype);
        assert_line(&shim, registration);
    }
}

// C cannot construct a HostConnectivityStatusCapability (its callback is an `Arc<dyn Fn>`), so the
// Option<bool> return sentinel is pinned at the generated wrapper instead of called from C.
#[test]
fn optional_bool_return_uses_the_parameter_sentinel_encoding() {
    let wrappers = fs::read_to_string(Path::new(env!("OUT_DIR")).join("ffi_generated.rs")).unwrap();
    let expected = "pub unsafe extern \"C\" fn flight_get_connectivity_online(host_connectivity_status: *const flight_sdk::HostConnectivityStatusCapability) -> i32 {
    match flight_sdk::get_connectivity_online(unsafe { &*host_connectivity_status }) {
        Some(v) => v as i32,
        None => -1,
    }
}";
    assert!(wrappers.contains(expected), "missing:\n{expected}");
}

// `Option<&mut Vec<ImportDiagnostic>>` lowers to one nullable opaque list carrier, and the list's
// helpers are plain scalar, string and pointer carriers on both sides.
#[test]
fn optional_diagnostics_lower_to_a_nullable_import_diagnostic_list() {
    let (header, shim) = generated();
    for (prototype, registration) in [
        (
            "void * flight_parse_starling_spritesheet(const char * arg0, void * arg1, void * arg2);",
            "DEFINE_PRIM(_BYTES, flight_parse_starling_spritesheet, _BYTES _BYTES _BYTES);",
        ),
        (
            "void * flight_create_import_diagnostic_list(void);",
            "DEFINE_PRIM(_BYTES, flight_create_import_diagnostic_list, _NO_ARG);",
        ),
        (
            "void flight_clear_import_diagnostic_list(void * arg0);",
            "DEFINE_PRIM(_VOID, flight_clear_import_diagnostic_list, _BYTES);",
        ),
        (
            "void flight_destroy_import_diagnostic_list(void * arg0);",
            "DEFINE_PRIM(_VOID, flight_destroy_import_diagnostic_list, _BYTES);",
        ),
        (
            "size_t flight_get_import_diagnostic_list_length(void * arg0);",
            "DEFINE_PRIM(_I32, flight_get_import_diagnostic_list_length, _BYTES);",
        ),
        (
            "int32_t flight_get_import_diagnostic_list_severity(void * arg0, size_t arg1);",
            "DEFINE_PRIM(_I32, flight_get_import_diagnostic_list_severity, _BYTES _I32);",
        ),
        (
            "char * flight_get_import_diagnostic_list_message(void * arg0, size_t arg1);",
            "DEFINE_PRIM(_BYTES, flight_get_import_diagnostic_list_message, _BYTES _I32);",
        ),
        (
            "float flight_get_import_diagnostic_list_detail_number(void * arg0, size_t arg1, size_t arg2);",
            "DEFINE_PRIM(_F32, flight_get_import_diagnostic_list_detail_number, _BYTES _I32 _I32);",
        ),
    ] {
        assert_line(&header, prototype);
        assert_line(&shim, registration);
    }
    let wrappers = fs::read_to_string(Path::new(env!("OUT_DIR")).join("ffi_generated.rs")).unwrap();
    assert!(wrappers.contains("unsafe { ffi_import_diagnostic_list_values(diagnostics) }"));
    let borrowers = wrappers
        .lines()
        .filter(|line| {
            line.starts_with("pub unsafe extern \"C\" fn flight_")
                && line.contains("diagnostics: *mut FfiImportDiagnosticList")
        })
        .count();
    assert_eq!(
        borrowers, 28,
        "the recovered diagnostics-collecting wrapper count changed"
    );
}

// An `Option<extern "C" fn>` parameter is the same C function-pointer type, where NULL is `None`.
#[test]
fn optional_callbacks_lower_to_nullable_typed_function_pointers() {
    let (header, shim) = generated();
    assert_line(
        &header,
        "bool flight_transition_animation_state_machine(void * arg0, void * arg1, float arg2, float (*arg3)(void *, float), void * arg4);",
    );
    assert_line(
        &shim,
        "HL_PRIM bool HL_NAME(flight_transition_animation_state_machine)(vbyte * arg0, vbyte * arg1, float arg2, vbyte * arg3, vbyte * arg4) { return (bool)flight_transition_animation_state_machine((void *)arg0, (void *)arg1, (float)arg2, (float (*)(void *, float))arg3, (void *)arg4); }",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_BOOL, flight_transition_animation_state_machine, _BYTES _BYTES _F32 _BYTES _BYTES);",
    );
}

#[test]
fn shape_bounds_context_vtable_and_failure_boundary_are_pinned() {
    let out_dir = Path::new(env!("OUT_DIR"));
    let wrappers = fs::read_to_string(out_dir.join("ffi_generated.rs")).unwrap();
    let stats = fs::read_to_string(out_dir.join("ffi_stats.txt")).unwrap();
    let (header, shim) = generated();

    for (rust_member, c_member) in [
        (
            "    pub close_path: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void) -> bool>,",
            "bool (*close_path)(void *context);",
        ),
        (
            "    pub cubic_curve_to: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void, f64, f64, f64, f64, f64, f64) -> bool>,",
            "bool (*cubic_curve_to)(void *context, double control_x1, double control_y1, double control_x2, double control_y2, double x, double y);",
        ),
        (
            "    pub draw_circle: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void, f64, f64, f64) -> bool>,",
            "bool (*draw_circle)(void *context, double center_x, double center_y, double radius);",
        ),
        (
            "    pub draw_ellipse: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void, f64, f64, f64, f64) -> bool>,",
            "bool (*draw_ellipse)(void *context, double center_x, double center_y, double radius_x, double radius_y);",
        ),
        (
            "    pub draw_rectangle: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void, f64, f64, f64, f64) -> bool>,",
            "bool (*draw_rectangle)(void *context, double x, double y, double width, double height);",
        ),
        (
            "    pub draw_rounded_rectangle: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void, f64, f64, f64, f64, f64) -> bool>,",
            "bool (*draw_rounded_rectangle)(void *context, double x, double y, double width, double height, double radius);",
        ),
        (
            "    pub expand_point: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void, f64, f64) -> bool>,",
            "bool (*expand_point)(void *context, double x, double y);",
        ),
        (
            "    pub flush_path: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void) -> bool>,",
            "bool (*flush_path)(void *context);",
        ),
        (
            "    pub line_to: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void, f64, f64) -> bool>,",
            "bool (*line_to)(void *context, double x, double y);",
        ),
        (
            "    pub move_to: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void, f64, f64) -> bool>,",
            "bool (*move_to)(void *context, double x, double y);",
        ),
        (
            "    pub quadratic_curve_to: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void, f64, f64, f64, f64) -> bool>,",
            "bool (*quadratic_curve_to)(void *context, double control_x, double control_y, double x, double y);",
        ),
        (
            "    pub set_stroke_style: Option<unsafe extern \"C-unwind\" fn(*mut std::ffi::c_void, f64, u32, u32, f64) -> bool>,",
            "bool (*set_stroke_style)(void *context, double width, uint32_t caps, uint32_t joints, double miter_limit);",
        ),
    ] {
        assert_line(&wrappers, rust_member);
        assert_line(&header, c_member);
    }

    for representative in [
        "        self.failed = !unsafe { callback(self.context) };",
        "        self.failed = !unsafe { callback(self.context, width, caps as u32, joints as u32, miter_limit) };",
    ] {
        assert_line(&wrappers, representative);
    }

    let wrapper = r#"pub unsafe extern "C" fn flight_default_shape_bounds_flush(context_ptr: *mut std::ffi::c_void, context_vtable: *const FfiShapeBoundsContextVTable) -> bool {
    let Some(mut ffi_context) = (unsafe { FfiShapeBoundsContext::new(context_ptr, context_vtable) }) else { return false; };
    let call_succeeded = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        flight_sdk::default_shape_bounds_flush(&mut ffi_context);
    })).is_ok();
    return call_succeeded && !ffi_context.failed;
}"#;
    assert!(
        wrappers.contains(wrapper),
        "missing generated wrapper:\n{wrapper}"
    );

    assert_line(
        &header,
        "bool flight_default_shape_bounds_flush(void * arg0, const FlightShapeBoundsContextVTable * arg1);",
    );
    assert_line(
        &shim,
        "HL_PRIM bool HL_NAME(flight_default_shape_bounds_flush)(vbyte * arg0, vbyte * arg1) { return (bool)flight_default_shape_bounds_flush((void *)arg0, (const FlightShapeBoundsContextVTable *)arg1); }",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_BOOL, flight_default_shape_bounds_flush, _BYTES _BYTES);",
    );

    assert!(!stats.contains("ShapeBoundsContext)"));
}

// A provider future returns through trailing `complete_fn` / `complete_ctx` parameters. C sees the
// callback's real function-pointer type; HashLink carries it as bytes and casts at the call.
#[test]
fn provider_future_returns_lower_to_typed_completion_callbacks() {
    let (header, shim) = generated();
    assert_line(
        &header,
        "void flight_file_exists(void * arg0, const char * arg1, void (*arg2)(void *, bool, char *), void * arg3);",
    );
    assert_line(
        &shim,
        "HL_PRIM void HL_NAME(flight_file_exists)(vbyte * arg0, vbyte * arg1, vbyte * arg2, vbyte * arg3) { flight_file_exists((void *)arg0, (const char *)arg1, (void (*)(void *, bool, char *))arg2, (void *)arg3); }",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_VOID, flight_file_exists, _BYTES _BYTES _BYTES _BYTES);",
    );
}

fn assert_line(text: &str, line: &str) {
    assert!(
        text.lines().any(|candidate| candidate == line),
        "missing generated line:\n{line}"
    );
}

fn generated() -> (String, String) {
    let out_dir = Path::new(env!("OUT_DIR"));
    let header = fs::read_to_string(out_dir.join("flight_ffi.h")).unwrap();
    let shim = fs::read_to_string(out_dir.join("flight_hl.c")).unwrap();
    return (header, shim);
}
