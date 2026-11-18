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
    // Only tuple and outcome-reason outputs are references; a new `_REF` carrier must be a
    // deliberate ABI change.
    let mut references: Vec<_> = shim
        .lines()
        .filter(|line| line.starts_with("DEFINE_PRIM") && line.contains("_REF("))
        .collect();
    references.sort();
    assert_eq!(
        references,
        [
            "DEFINE_PRIM(_BOOL, flight_announce_accessibility, _BYTES _BYTES _I32 _REF(_I32));",
            "DEFINE_PRIM(_BOOL, flight_clear_accessibility_tree, _BYTES _REF(_I32));",
            "DEFINE_PRIM(_BOOL, flight_get_index_range_for_cluster, _BYTES _I32 _I32 _REF(_I32) _REF(_I32));",
            "DEFINE_PRIM(_BOOL, flight_get_path_last_point, _BYTES _REF(_F64) _REF(_F64));",
            "DEFINE_PRIM(_BOOL, flight_remove_accessibility_node, _BYTES _BYTES _REF(_I32));",
            "DEFINE_PRIM(_BOOL, flight_set_accessibility_focus, _BYTES _BYTES _REF(_I32));",
            "DEFINE_PRIM(_BOOL, flight_set_accessibility_node, _BYTES _BYTES _REF(_I32));",
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
            "void flight_set_cube_texture_face(void * arg0, size_t arg1, void * arg2 /* cloned; caller retains its handle */);",
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

#[test]
fn ownership_contracts_name_real_frees_and_borrow_anchors() {
    let wrappers = generated_wrappers();
    let (header, shim) = generated();

    let mut ownership_comments = 0usize;
    for line in header.lines().filter(|line| line.contains(" owns ")) {
        let named_free = line
            .split_once("; call ")
            .and_then(|(_, rest)| rest.strip_suffix(" when done. */"))
            .unwrap_or_else(|| panic!("malformed ownership comment: {line}"));
        let free = named_free.strip_suffix(" for each").unwrap_or(named_free);
        assert!(
            header.lines().any(|prototype| {
                prototype.starts_with("void ")
                    && prototype
                        .strip_prefix("void ")
                        .is_some_and(|prototype| prototype.starts_with(&format!("{free}(")))
            }),
            "ownership comment names missing free {free}"
        );
        ownership_comments += 1;
    }
    assert!(
        ownership_comments > 0,
        "generated header has no ownership contracts"
    );

    for line in header
        .lines()
        .filter(|line| line.starts_with("/* Borrowed return;"))
    {
        assert!(line.contains("do not free; valid while "), "{line}");
        assert!(!line.contains("all originating input handles"), "{line}");
    }

    for line in [
        "/* Caller owns the return value; call flight_free_command_history_ref when done. */",
        "void * flight_create_command_history(void);",
        "void flight_free_command_history_ref(void * arg0);",
        "void flight_free_bitmap(void * arg0);",
        "void flight_free_bitmap_ref(void * arg0);",
        "/* Borrowed return; do not free; valid while the machine input handle remains alive. */",
    ] {
        assert_line(&header, line);
    }
    for line in [
        "pub unsafe extern \"C\" fn flight_free_bitmap(ptr: *mut flight_sdk::Bitmap) {",
        "pub unsafe extern \"C\" fn flight_free_bitmap_ref(ptr: *mut flight_sdk::Ref<flight_sdk::Bitmap>) {",
    ] {
        assert_line(&wrappers, line);
    }
    for line in [
        "DEFINE_PRIM(_BYTES, flight_create_command_history, _NO_ARG);",
        "DEFINE_PRIM(_VOID, flight_free_command_history_ref, _BYTES);",
    ] {
        assert_line(&shim, line);
    }

    let borrowed = wrappers
        .split("pub unsafe extern \"C\" fn flight_get_animation_state_machine_current_state")
        .nth(1)
        .expect("missing representative borrowed return")
        .split("#[unsafe(no_mangle)]")
        .next()
        .unwrap();
    assert!(!borrowed.contains("Box::into_raw"));
}

#[test]
fn non_entity_create_result_uses_inner_carriers_and_owned_ref_handles() {
    let out_dir = Path::new(env!("OUT_DIR"));
    let wrappers = fs::read_to_string(out_dir.join("ffi_generated.rs")).unwrap();
    let stats = fs::read_to_string(out_dir.join("ffi_stats.txt")).unwrap();
    let (header, shim) = generated();

    for (name, inner) in [
        ("create_device_capabilities", "DeviceCapabilities"),
        ("create_device_display_metrics", "DeviceDisplayMetrics"),
        ("create_device_info", "DeviceInfo"),
        ("create_modifier_registry", "ModifierRegistry"),
        ("create_safe_area_insets", "SafeAreaInsets"),
    ] {
        assert_line(
            &wrappers,
            &format!("pub unsafe extern \"C\" fn flight_{name}() -> *mut flight_sdk::{inner} {{"),
        );
        assert_line(&header, &format!("void * flight_{name}(void);"));
        assert_line(
            &shim,
            &format!("DEFINE_PRIM(_BYTES, flight_{name}, _NO_ARG);"),
        );
    }

    for name in [
        "create_default_edit_menu_template",
        "create_default_file_menu_template",
        "create_default_help_menu_template",
        "create_default_view_menu_template",
        "create_default_window_menu_template",
    ] {
        assert_line(
            &wrappers,
            &format!("pub unsafe extern \"C\" fn flight_{name}() -> *mut std::ffi::c_void {{"),
        );
        assert_line(&header, &format!("void * flight_{name}(void);"));
        assert_line(
            &shim,
            &format!("DEFINE_PRIM(_BYTES, flight_{name}, _NO_ARG);"),
        );
    }

    for line in [
        "pub unsafe extern \"C\" fn flight_create_menu_item_template(template: *const std::ffi::c_void) -> *mut std::ffi::c_void {",
        "pub unsafe extern \"C\" fn flight_create_default_app_menu_template(app_name: *const std::ffi::c_char) -> *mut std::ffi::c_void {",
        "pub unsafe extern \"C\" fn flight_free_menu_item_template_ref(ptr: *mut flight_sdk::Ref<flight_sdk::MenuItemTemplate>) {",
        "    return Box::into_raw(Box::new(flight_sdk::create_safe_area_insets()));",
    ] {
        assert_line(&wrappers, line);
    }
    let owned_ref = r#"pub unsafe extern "C" fn flight_create_default_edit_menu_template() -> *mut std::ffi::c_void {
    let arc = flight_sdk::create_default_edit_menu_template();
    return Box::into_raw(Box::new(arc)) as *mut std::ffi::c_void;
}"#;
    assert!(
        wrappers.contains(owned_ref),
        "missing owned Ref return:\n{owned_ref}"
    );

    for line in [
        "void * flight_create_menu_item_template(void * arg0);",
        "void * flight_create_default_app_menu_template(const char * arg0);",
        "void flight_free_menu_item_template_ref(void * arg0);",
    ] {
        assert_line(&header, line);
    }
    for line in [
        "DEFINE_PRIM(_BYTES, flight_create_menu_item_template, _BYTES);",
        "DEFINE_PRIM(_BYTES, flight_create_default_app_menu_template, _BYTES);",
        "DEFINE_PRIM(_VOID, flight_free_menu_item_template_ref, _BYTES);",
    ] {
        assert_line(&shim, line);
    }

    assert!(!stats.contains("NonEntityCreateResult"));
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
    // Task E's 28 parsers plus Task H's collect_rive_core_type_counts.
    assert_eq!(
        borrowers, 29,
        "the recovered diagnostics-collecting wrapper count changed"
    );
}

// An `Option<extern "C" fn>` parameter is the same C function-pointer type, where NULL is `None`.
#[test]
fn optional_callbacks_lower_to_nullable_typed_function_pointers() {
    let (header, shim) = generated();
    assert_line(
        &header,
        "bool flight_transition_animation_state_machine(void * arg0, void * arg1 /* ownership transferred; do not use or free after call */, float arg2, float (*arg3)(void *, float), void * arg4);",
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

// An `Arc<T>` return hands C an owned clone of the immutable shared value through T's own carrier,
// freed exactly as a T return is. Extension-point values stay unmapped behind the same wrapper.
#[test]
fn shared_arc_returns_lower_to_owned_inner_carriers() {
    let wrappers = generated_wrappers();
    let stats = generated_stats();
    let (header, shim) = generated();

    for name in ["get_bitmap_font_metrics", "get_glyph_atlas_metrics"] {
        assert!(
            wrappers.contains(&format!("-> *mut flight_sdk::GlyphMetrics {{\n    return Box::into_raw(Box::new((*flight_sdk::{name}(")),
            "{name} must return an owned GlyphMetrics clone"
        );
        assert_line(&header, &format!("void * flight_{name}(void * arg0);"));
        assert_line(
            &shim,
            &format!("DEFINE_PRIM(_BYTES, flight_{name}, _BYTES);"),
        );
    }
    assert_line(
        &wrappers,
        "    let vec = (*flight_sdk::get_timeline_labels(unsafe { &*(timeline as *const flight_sdk::Ref<flight_sdk::Timeline>) })).clone();",
    );
    for line in [
        "void * flight_get_timeline_labels(void * arg0);",
        "size_t flight_get_timeline_labels_result_len(void * arg0);",
        "void * flight_get_timeline_labels_result_get(void * arg0, size_t arg1);",
        "void flight_get_timeline_labels_result_free(void * arg0);",
    ] {
        assert_line(&header, line);
    }

    for skip in [
        "unmapped_return(Option<Arc<RiveCoreObjectHandler>>)",
        "unmapped_return(Option<Arc<SpritesheetFormatEntry>>)",
        "unmapped_return(Option<Arc<TextureAtlasFormatEntry>>)",
        "closure_return(Arc<dyn Fn() + Send + Sync>)",
    ] {
        assert!(stats.contains(skip), "{skip} must stay skipped");
    }
}

// Slice carriers borrow every element for one call: scalar lists as (lists, lengths, count), struct
// and fixed-array elements as pointer arrays, and string pairs as parallel C string arrays. Nested
// list and fixed-array returns are owned and have their own frees.
#[test]
fn slice_and_fixed_array_carriers_have_exact_c_and_hashlink_shapes() {
    let (header, shim) = generated();
    for line in [
        "void * flight_create_clip_region_from_contours(const void * const * arg0, void * arg1, size_t arg2, uint32_t arg3);",
        "void * flight_explain_clip_region_contours(const void * const * arg0, void * arg1, size_t arg2);",
        "void flight_set_clip_region_to_contours(void * arg0, const void * const * arg1, void * arg2, size_t arg3, uint32_t arg4);",
        "void flight_resolve_path_regions(void * arg0, void * arg1, const void * const * arg2, void * arg3, size_t arg4, uint32_t arg5);",
        "void flight_write_path_boolean_contours(void * arg0, const void * const * arg1, void * arg2, size_t arg3);",
        "void flight_union_all_paths(void * arg0, void * arg1, const void * const * arg2, size_t arg3, void * arg4);",
        "void * flight_merge_requirement_sets(const void * const * arg0, size_t arg1);",
        "void flight_destroy_power_keep_awake(const void * const * arg0, size_t arg1, void * arg2);",
        "void * flight_fuse_color_matrices(const void * const * arg0, size_t arg1);",
        "void flight_free_f32_array_20(void * arg0);",
        "void * flight_set_storage_items(void * arg0, const char * const * arg1, const char * const * arg2, size_t arg3, void * arg4);",
        "void flight_split_bitmap_channels(void * arg0, void * * arg1);",
        "void * flight_flatten_path(void * arg0, double arg1);",
        "size_t flight_flatten_path_result_len(void * arg0);",
        "void * flight_flatten_path_result_get(void * arg0, size_t arg1);",
        "size_t flight_flatten_path_result_get_len(void * arg0, size_t arg1);",
        "void flight_flatten_path_result_free(void * arg0);",
    ] {
        assert_line(&header, line);
    }
    for line in [
        "DEFINE_PRIM(_BYTES, flight_create_clip_region_from_contours, _BYTES _BYTES _I32 _I32);",
        "DEFINE_PRIM(_BYTES, flight_set_storage_items, _BYTES _BYTES _BYTES _I32 _BYTES);",
        "DEFINE_PRIM(_VOID, flight_split_bitmap_channels, _BYTES _BYTES);",
        "DEFINE_PRIM(_VOID, flight_free_f32_array_20, _BYTES);",
    ] {
        assert_line(&shim, line);
    }

    let stats = generated_stats();
    for skip in [
        "unmapped_param(&[&StorageMigration])",
        "unmapped_param(&[Option<Node2DRef>])",
    ] {
        assert!(stats.contains(skip), "{skip} must stay skipped");
    }
}

// Outcome wrappers keep their generic reason types: an accessibility outcome is a success flag
// plus a typed reason out-parameter, and a MIDI port outcome is a boxed result with its own helpers.
#[test]
fn outcome_wrappers_lower_to_flags_and_result_handles() {
    let wrappers = generated_wrappers();
    let (header, shim) = generated();
    for name in [
        "announce_accessibility",
        "clear_accessibility_tree",
        "remove_accessibility_node",
        "set_accessibility_focus",
        "set_accessibility_node",
    ] {
        let prototype = header
            .lines()
            .find(|line| line.starts_with(&format!("bool flight_{name}(")))
            .unwrap_or_else(|| panic!("missing flight_{name}"));
        let last = prototype.rsplit(", ").next().unwrap();
        assert!(
            last.starts_with("uint32_t * arg"),
            "{prototype} must end with the reason out-parameter"
        );
        assert!(
            shim.lines().any(|line| line
                .starts_with(&format!("DEFINE_PRIM(_BOOL, flight_{name}, "))
                && line.ends_with(" _REF(_I32));")),
            "flight_{name} must register a typed reason reference"
        );
    }
    assert_line(
        &wrappers,
        "            if !out_0.is_null() { unsafe { *out_0 = blocked.reason as u32; } }",
    );

    for direction in ["input", "output"] {
        let name = format!("flight_get_midi_access_{direction}_ports");
        for line in [
            format!("void * {name}(void * arg0);"),
            format!("int32_t {name}_result_reason(void * arg0);"),
            format!("bool {name}_result_has_ports(void * arg0);"),
            format!("size_t {name}_result_len(void * arg0);"),
            format!("void * {name}_result_get(void * arg0, size_t arg1);"),
            format!("void {name}_result_free(void * arg0);"),
            format!("void flight_free_midi_{direction}_port_ref(void * arg0);"),
        ] {
            assert_line(&header, &line);
        }
        assert_line(
            &shim,
            &format!("DEFINE_PRIM(_VOID, flight_free_midi_{direction}_port_ref, _BYTES);"),
        );
    }
    // `_result_get` hands out an owned clone, never a pointer into the outcome.
    assert_line(
        &wrappers,
        "        Some(port) => Box::into_raw(Box::new(port.clone())) as *mut std::ffi::c_void,",
    );
}

// `Ref<Box<[T]>>` buffers cross as typed array Ref handles that share the SDK's buffer, with one
// create/length/read/write/free family per typed array, and are accepted back as cloned handles.
#[test]
fn typed_array_refs_share_buffers_through_handle_families() {
    let (header, shim) = generated();
    for slug in ["float32_array", "uint8_array"] {
        for line in [
            format!("void * flight_create_{slug}_ref(void * arg0, size_t arg1);"),
            format!("void flight_free_{slug}_ref(void * arg0);"),
            format!("size_t flight_get_{slug}_ref_length(void * arg0);"),
            format!(
                "size_t flight_read_{slug}_ref(void * arg0, size_t arg1, void * arg2, size_t arg3);"
            ),
            format!(
                "size_t flight_write_{slug}_ref(void * arg0, size_t arg1, void * arg2, size_t arg3);"
            ),
        ] {
            assert_line(&header, &line);
        }
    }
    for line in [
        "void * flight_get_audio_resource_channel_data(void * arg0, int32_t arg1);",
        "void * flight_create_audio_resource_from_samples(const void * const * arg0, size_t arg1, float arg2);",
        "void * flight_create_embedded_audio_resource_reference(void * arg0 /* cloned; caller retains its handle */);",
        "void * flight_create_embedded_image_resource_reference(void * arg0 /* cloned; caller retains its handle */);",
    ] {
        assert_line(&header, line);
    }
    assert_line(
        &shim,
        "DEFINE_PRIM(_I32, flight_write_uint8_array_ref, _BYTES _I32 _BYTES _I32);",
    );
}

// A generic carrier is new public surface: a function reached only through a crate root's
// `pub use contract::*` maps only when its package's TS `index.ts` exports it too.
#[test]
fn generic_carriers_require_a_public_ts_export() {
    let (header, shim) = generated();
    let wrappers = generated_wrappers();
    for symbol in ["flight_get_array_buffer_storage", "flight_create_blob"] {
        assert!(
            !header.contains(&format!(" {symbol}(")),
            "{symbol} must stay out of the C header"
        );
        assert!(
            !shim.contains(&format!("({symbol})")),
            "{symbol} must stay out of the HashLink shim"
        );
        assert!(
            !wrappers.contains(&format!("fn {symbol}(")),
            "{symbol} must stay unwrapped"
        );
    }
    let stats = generated_stats();
    for skip in [
        "no_ts_public_export(get_array_buffer_storage)",
        "no_ts_public_export(create_blob)",
    ] {
        assert!(stats.contains(skip), "{skip} must stay skipped");
    }
    // Glob-exported functions the TS root does export still map.
    assert_line(
        &header,
        "bool flight_collect_svg_counts(void * arg0, const char * arg1);",
    );
}

// Maps cross only with typed semantics: an XML attribute record is a boxed result read by index or
// key, and a String -> usize map parameter is a registered caller-owned count map.
#[test]
fn string_maps_lower_to_typed_records_and_count_maps() {
    let (header, shim) = generated();
    for line in [
        "void * flight_parse_xml_attributes(const char * arg0);",
        "size_t flight_parse_xml_attributes_result_len(void * arg0);",
        "char * flight_parse_xml_attributes_result_get(void * arg0, const char * arg1);",
        "char * flight_parse_xml_attributes_result_get_key(void * arg0, size_t arg1);",
        "char * flight_parse_xml_attributes_result_get_value(void * arg0, size_t arg1);",
        "void flight_parse_xml_attributes_result_free(void * arg0);",
        "bool flight_collect_lottie_counts(void * arg0, const char * arg1);",
        "bool flight_collect_svg_counts(void * arg0, const char * arg1);",
        "void * flight_create_string_count_map(void);",
        "void flight_destroy_string_count_map(void * arg0);",
        "void flight_clear_string_count_map(void * arg0);",
        "size_t flight_get_string_count_map_length(void * arg0);",
        "char * flight_get_string_count_map_key(void * arg0, size_t arg1);",
        "int64_t flight_get_string_count_map_value(void * arg0, const char * arg1);",
    ] {
        assert_line(&header, line);
    }
    assert_line(
        &shim,
        "DEFINE_PRIM(_I64, flight_get_string_count_map_value, _BYTES _BYTES);",
    );
    assert_line(
        &generated_wrappers(),
        "    let Some(values_out) = (unsafe { ffi_string_count_map_values(out) }) else { return Default::default(); };",
    );

    let stats = generated_stats();
    for skip in ["unmapped_return(HashMap<String, String>)"] {
        assert!(stats.contains(skip), "{skip} must stay skipped");
    }
}

// `set_storage_items` returns a boxed StorageSetItemsResult with typed reads and its own free; the
// failing key is an owned string.
#[test]
fn storage_set_items_result_has_typed_reads_and_a_free() {
    let (header, shim) = generated();
    for line in [
        "void * flight_set_storage_items(void * arg0, const char * const * arg1, const char * const * arg2, size_t arg3, void * arg4);",
        "bool flight_is_storage_set_items_result_ok(void * arg0);",
        "size_t flight_get_storage_set_items_result_completed(void * arg0);",
        "char * flight_get_storage_set_items_result_failed_key(void * arg0);",
        "int32_t flight_get_storage_set_items_result_reason(void * arg0);",
        "void flight_free_storage_set_items_result(void * arg0);",
    ] {
        assert_line(&header, line);
    }
    for line in [
        "DEFINE_PRIM(_BOOL, flight_is_storage_set_items_result_ok, _BYTES);",
        "DEFINE_PRIM(_BYTES, flight_get_storage_set_items_result_failed_key, _BYTES);",
        "DEFINE_PRIM(_I32, flight_get_storage_set_items_result_reason, _BYTES);",
        "DEFINE_PRIM(_VOID, flight_free_storage_set_items_result, _BYTES);",
    ] {
        assert_line(&shim, line);
    }
}

// Exact mutable collectors cross as registered caller-owned handles; Ref values come back as owned
// clones released by the Ref's own free.
#[test]
fn registered_collectors_return_owned_ref_clones() {
    let (header, shim) = generated();
    for line in [
        "void flight_get_bitmap_font_pages(void * arg0, void * arg1);",
        "void * flight_create_optional_texture_atlas_list(void);",
        "void flight_destroy_optional_texture_atlas_list(void * arg0);",
        "void flight_clear_optional_texture_atlas_list(void * arg0);",
        "size_t flight_get_optional_texture_atlas_list_length(void * arg0);",
        "void * flight_get_optional_texture_atlas_list_item(void * arg0, size_t arg1);",
        "void flight_free_texture_atlas_ref(void * arg0);",
        "void flight_build_texture_atlas_region_index(void * arg0, void * arg1);",
        "void * flight_create_texture_atlas_region_map(void);",
        "void flight_destroy_texture_atlas_region_map(void * arg0);",
        "void flight_clear_texture_atlas_region_map(void * arg0);",
        "size_t flight_get_texture_atlas_region_map_length(void * arg0);",
        "char * flight_get_texture_atlas_region_map_key(void * arg0, size_t arg1);",
        "void * flight_get_texture_atlas_region_map_value(void * arg0, const char * arg1);",
        "void flight_free_texture_atlas_region_ref(void * arg0);",
        "bool flight_collect_rive_core_type_counts(void * arg0, void * arg1, size_t arg2, void * arg3);",
        "void * flight_create_u64_count_map(void);",
        "void flight_destroy_u64_count_map(void * arg0);",
        "void flight_clear_u64_count_map(void * arg0);",
        "size_t flight_get_u64_count_map_length(void * arg0);",
        "bool flight_get_u64_count_map_key(void * arg0, size_t arg1, void * arg2);",
        "int64_t flight_get_u64_count_map_value(void * arg0, uint64_t arg1);",
    ] {
        assert_line(&header, line);
    }
    assert_line(
        &shim,
        "DEFINE_PRIM(_BYTES, flight_get_texture_atlas_region_map_value, _BYTES _BYTES);",
    );
}

// A returned no-argument closure crosses as a callable, freeable disposer handle, but only for a
// call with no caller-provided callback parameter whose context the disposer could capture.
#[test]
fn returned_disposers_lower_to_callable_handles() {
    let (header, shim) = generated();
    for line in [
        "void * flight_reveal_scene3d_resources_on_resolve(void * arg0, void * arg1, void * arg2, void * arg3);",
        "bool flight_call_disposer(void * arg0);",
        "void flight_free_disposer(void * arg0);",
    ] {
        assert_line(&header, line);
    }
    assert_line(&shim, "DEFINE_PRIM(_BOOL, flight_call_disposer, _BYTES);");
    assert_line(
        &generated_wrappers(),
        "    return Box::into_raw(Box::new(FfiDisposer { dispose }));",
    );
    assert!(!header.contains(" flight_enable_scene3d_resource_failure_guards("));
    assert!(!header.contains(" flight_connect_signal_at_frame_rate("));
    assert!(generated_stats().contains("closure_return(Arc<dyn Fn() + Send + Sync>)"));
    // The disposer lowering is allowlisted by function name: exactly one wrapper returns it.
    let wrappers = generated_wrappers();
    let disposer_wrappers: Vec<&str> = wrappers
        .lines()
        .filter(|line| line.starts_with("pub unsafe extern \"C\" fn flight_"))
        .filter(|line| line.ends_with("-> *mut FfiDisposer {"))
        .map(|line| line.split('(').next().unwrap())
        .collect();
    assert_eq!(
        disposer_wrappers,
        ["pub unsafe extern \"C\" fn flight_reveal_scene3d_resources_on_resolve"]
    );
}

// By-value ownership follows the Rust signature: a `Copy` value is copied, a Ref/Arc handle is
// cloned from the caller's borrowed handle, and any other value consumes an FFI-owned box. The C
// header notes each non-obvious transfer. A by-value type whose ownership cannot be proven (a
// generic container, or a type no generated function returns owned) is a skip, never a `ptr::read`.
#[test]
fn by_value_parameters_follow_rust_ownership() {
    let (header, shim) = generated();
    let wrappers = generated_wrappers();
    assert!(!wrappers.contains("std::ptr::read("));
    for line in [
        "void flight_release_vector2(void * arg0 /* ownership transferred; do not use or free after call */);",
        "void * flight_create_bitmap_region(void * arg0 /* ownership transferred; do not use or free after call */, int32_t arg1, int32_t arg2, int32_t arg3, int32_t arg4);",
        "void * flight_ease_invert(void * arg0 /* cloned; caller retains its handle */);",
    ] {
        assert_line(&header, line);
    }
    // Notes never reach the HashLink shim's registrations.
    assert_line(&shim, "DEFINE_PRIM(_VOID, flight_release_vector2, _BYTES);");
    assert_line(
        &wrappers,
        "    assert!(!v.is_null(), \"v must be an owned Vector2 handle\");",
    );
    assert_line(
        &wrappers,
        "    flight_sdk::release_vector2(*unsafe { Box::from_raw(v) });",
    );
    assert_line(
        &wrappers,
        "pub unsafe extern \"C\" fn flight_get_bitmap_pixel_channel(source: *const flight_sdk::Bitmap, x: u32, y: u32, channel: *const flight_sdk::ImageChannel) -> u8 {",
    );
    // Every consumed parameter carries a transfer note on its wrapper.
    let mut notes: Vec<&str> = Vec::new();
    let mut current_notes: Vec<&str> = Vec::new();
    let mut transfers = 0;
    for line in wrappers.lines() {
        if let Some(note) = line.strip_prefix("#[doc = \"ffi-param ") {
            notes.push(note);
        } else if line.starts_with("pub unsafe extern \"C\" fn flight_") {
            current_notes = std::mem::take(&mut notes);
        } else if let Some(rest) = line.split("*unsafe { Box::from_raw(").nth(1) {
            let parameter = rest.split(')').next().unwrap();
            transfers += 1;
            assert!(
                current_notes
                    .iter()
                    .any(|note| note.starts_with(&format!("{parameter}: ownership transferred"))),
                "{parameter} is consumed without a transfer note"
            );
        }
    }
    assert!(transfers > 0);
    let stats = generated_stats();
    for skip in [
        "unmapped_param(HostSpawnCapability)",
        "unmapped_param(ParticleFormatCodec)",
        "unmapped_param(IpcArguments)",
        "unmapped_param(TargetRef)",
        "unmapped_param(ByteChunkStream)",
    ] {
        assert!(stats.contains(skip), "{skip} must stay skipped");
    }
    for symbol in [
        "flight_create_tray_animation_state",
        "flight_register_particle_format",
        "flight_send_ipc_message",
    ] {
        assert!(
            !header.contains(&format!(" {symbol}(")),
            "{symbol} must stay unwrapped"
        );
    }
}

// Public-function enums whose crate roots do not re-export them cross as exact `u32`
// discriminants named through the crate's contract module; `Option<enum>` keeps the -1 sentinel.
#[test]
fn contract_lane_enums_cross_as_u32_discriminants() {
    let (header, shim) = generated();
    let wrappers = generated_wrappers();
    for line in [
        "char * flight_get_spritesheet_parse_diagnostic_severity_string(uint32_t arg0);",
        "bool flight_append_morph_shape_begin_gradient_fill(void * arg0, uint32_t arg1, void * arg2, void * arg3, int32_t arg4, int32_t arg5);",
        "bool flight_append_morph_shape_line_gradient_style(void * arg0, uint32_t arg1, void * arg2, void * arg3, int32_t arg4, int32_t arg5);",
    ] {
        assert_line(&header, line);
    }
    assert_line(
        &shim,
        "DEFINE_PRIM(_BYTES, flight_get_spritesheet_parse_diagnostic_severity_string, _I32);",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_BOOL, flight_append_morph_shape_begin_gradient_fill, _BYTES _I32 _BYTES _BYTES _I32 _I32);",
    );
    assert!(wrappers.contains(
        "Some(unsafe { std::mem::transmute::<u32, flight_sdk::shape::contract::SpreadMethod>(spread_method as u32) })"
    ));
    assert!(wrappers.contains(
        "std::mem::transmute::<u32, flight_sdk::spritesheet::contract::SpritesheetParseDiagnosticSeverity>(value)"
    ));
    let stats = generated_stats();
    assert!(!stats.contains("SpreadMethod"));
    assert!(!stats.contains("SpritesheetParseDiagnosticSeverity"));
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

fn generated_stats() -> String {
    return fs::read_to_string(Path::new(env!("OUT_DIR")).join("ffi_stats.txt")).unwrap();
}

fn generated_wrappers() -> String {
    return fs::read_to_string(Path::new(env!("OUT_DIR")).join("ffi_generated.rs")).unwrap();
}
