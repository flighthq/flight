//! Pins the HashLink carriers `native_bindings.rs` writes into `flight_hl.c` and `flight_ffi.h`.
//! Scalar tuple outputs (`out_0`, `out_1`, ...) are typed `_REF` pointers that match the generated
//! `hl.Ref<T>` externs; every other pointer, including scalar slices and fixed-array outputs, stays an
//! opaque `_BYTES` carrier that matches `hl.Bytes`.

use std::fs;
use std::path::Path;

#[test]
fn hashlink_packs_every_signature_above_six_float_lanes_without_changing_the_c_abi() {
    let (header, shim) = generated();
    let mut packed_names: Vec<&str> = shim
        .lines()
        .filter_map(|line| {
            let body = line.strip_prefix("DEFINE_PRIM(")?.strip_suffix(");")?;
            let mut fields = body.splitn(3, ',').map(str::trim);
            let _return_carrier = fields.next()?;
            let name = fields.next()?;
            let parameters = fields.next()?;
            return parameters
                .split_whitespace()
                .any(|value| value == "_ARR")
                .then_some(name);
        })
        .collect();
    packed_names.sort_unstable();
    assert_eq!(
        packed_names,
        [
            "flight_append_path_rounded_rectangle_with_corner_radii",
            "flight_apply_physics_3d_joint_impulse",
            "flight_apply_physics_3d_joint_row_impulse",
            "flight_create_capsule",
            "flight_create_matrix3_from_values",
            "flight_create_matrix4_from_values",
            "flight_create_obb",
            "flight_create_transform2d",
            "flight_get_cubic_bezier_curvature",
            "flight_get_cubic_bezier_point",
            "flight_get_cubic_bezier_tangent",
            "flight_get_physics_3d_joint_row_mass",
            "flight_get_physics_3d_joint_row_velocity",
            "flight_get_quadratic_bezier_curvature",
            "flight_get_quadratic_bezier_point",
            "flight_get_quadratic_bezier_tangent",
            "flight_lerp_hsv_direct",
            "flight_query_physics3d_abi_ray",
            "flight_query_physics3d_abi_ray_closest",
            "flight_query_physics_3d_ray",
            "flight_query_physics_3d_ray_closest",
            "flight_raycast_collision_heightfield3d",
            "flight_raycast_collision_shape3d",
            "flight_raycast_collision_triangle_mesh3d",
            "flight_raycast_physics_3d_collider_shape",
            "flight_set_capsule",
            "flight_set_color_scale_bias",
            "flight_set_matrix3",
            "flight_set_matrix4",
            "flight_set_obb",
            "flight_set_physics_3d_body_transform",
            "flight_sweep_collision_shape3d",
            "flight_sweep_physics_3d_collider_shapes",
            "flight_write_physics_3d_joint_relative_rotation",
            "flight_write_physics_3d_joint_rotation_error",
            "flight_write_row",
        ]
    );
    for name in &packed_names {
        assert_eq!(
            header
                .lines()
                .filter(|line| line.contains(&format!(" {name}(")))
                .count(),
            1,
            "{name} C ABI declaration"
        );
        assert_eq!(
            shim.matches(&format!("HL_NAME({name})")).count(),
            1,
            "{name} HashLink entry"
        );
        assert_eq!(
            shim.lines()
                .filter(|line| {
                    line.starts_with("DEFINE_PRIM(") && line.contains(&format!(", {name}, "))
                })
                .count(),
            1,
            "{name} HashLink registration"
        );
    }

    assert_line(
        &header,
        "void * flight_create_matrix4_from_values(double arg0, double arg1, double arg2, double arg3, double arg4, double arg5, double arg6, double arg7, double arg8, double arg9, double arg10, double arg11, double arg12, double arg13, double arg14, double arg15);",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_BYTES, flight_create_matrix4_from_values, _ARR);",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_VOID, flight_set_matrix4, _BYTES _ARR);",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_VOID, flight_lerp_hsv_direct, _BYTES _I32 _I32 _ARR);",
    );

    let matrix_entry = shim
        .lines()
        .find(|line| line.contains("HL_NAME(flight_create_matrix4_from_values)"))
        .unwrap();
    let mut previous = 0usize;
    for index in 0..16 {
        let needle = format!("(double)hl_aptr(flight_values, double)[{index}]");
        let position = matrix_entry.find(&needle).unwrap_or_else(|| {
            panic!("matrix lane {index} missing from packed entry:\n{matrix_entry}")
        });
        assert!(
            index == 0 || position > previous,
            "matrix lane order drifted"
        );
        previous = position;
    }

    // Exactly six lanes remain on the ordinary ABI, pinning the strict `> 6` threshold.
    assert_line(
        &shim,
        "DEFINE_PRIM(_BYTES, flight_create_matrix4_from_2d, _F64 _F64 _F64 _F64 _F64 _F64);",
    );
    let packed_registrations: Vec<&str> = shim
        .lines()
        .filter(|line| line.starts_with("DEFINE_PRIM(") && line.contains("_ARR"))
        .collect();
    assert!(packed_registrations.iter().all(|line| {
        line.splitn(3, ',').nth(2).is_some_and(|parameters| {
            !parameters
                .split_whitespace()
                .any(|parameter| matches!(parameter, "_F32" | "_F64"))
        })
    }));
}

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
fn random_gaussian_pair_outputs_are_typed_f64_hashlink_references() {
    let (header, shim) = generated();
    assert_line(
        &header,
        "void flight_random_gaussian_pair(double (*arg0)(void *), void * arg1, double arg2, double arg3, double * arg4, double * arg5);",
    );
    assert_line(
        &shim,
        "HL_PRIM void HL_NAME(flight_random_gaussian_pair)(vbyte * arg0, vbyte * arg1, double arg2, double arg3, double * arg4, double * arg5) { flight_random_gaussian_pair((double (*)(void *))arg0, (void *)arg1, (double)arg2, (double)arg3, (double *)arg4, (double *)arg5); }",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_VOID, flight_random_gaussian_pair, _BYTES _BYTES _F64 _F64 _REF(_F64) _REF(_F64));",
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
            "DEFINE_PRIM(_VOID, flight_random_gaussian_pair, _BYTES _BYTES _F64 _F64 _REF(_F64) _REF(_F64));",
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
        // Option<&dyn TextureVariant> monomorphized to nullable concrete pointers.
        (
            "bool flight_equals_texture__texture__texture(void * arg0, void * arg1);",
            "DEFINE_PRIM(_BOOL, flight_equals_texture__texture__texture, _BYTES _BYTES);",
        ),
        // Option<TextureSourceRef> -> nullable opaque handle.
        (
            "void flight_set_texture_source__texture(void * arg0, void * arg1 /* cloned; caller retains its handle */);",
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
        "void flight_free_bitmap_ref(void * arg0);",
        "/* Borrowed return; do not free; valid while the machine input handle remains alive. */",
    ] {
        assert_line(&header, line);
    }
    // Bitmap is a canonical carrier: its one shared-handle free, and no raw-value free.
    assert_line(
        &wrappers,
        "pub unsafe extern \"C\" fn flight_free_bitmap_ref(ptr: *mut flight_sdk::Ref<flight_sdk::Bitmap>) {",
    );
    assert!(!wrappers.contains("fn flight_free_bitmap(ptr"));
    assert!(!header.contains("void flight_free_bitmap(void * arg0);"));
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

// C cannot construct a HostConnectivityStatusCapability because it contains an `Arc<dyn Fn>`.
#[test]
fn connectivity_callback_capability_stays_outside_the_ffi_perimeter() {
    let wrappers = generated_wrappers();
    let (header, shim) = generated();
    for output in [&wrappers, &header, &shim] {
        assert!(!output.contains("flight_get_connectivity_online"));
    }
}

#[test]
fn owned_readers_and_effect_snapshots_have_exact_c_and_hashlink_shapes() {
    let (header, shim) = generated();
    for line in [
        "void flight_free_owned_byte_reader(void * arg0);",
        "void * flight_create_byte_reader(void * arg0, size_t arg1, int64_t arg2);",
        "bool flight_has_byte_reader_bytes(void * arg0, size_t arg1);",
        "uint32_t flight_read_byte_reader_u24_big_endian(void * arg0);",
        "void * flight_create_spine_binary_reader(void * arg0, size_t arg1);",
        "char * flight_read_spine_binary_string(void * arg0);",
        "bool flight_is_spine_binary_reader_overrun(void * arg0);",
        "void * flight_get_effect_inputs(void * arg0);",
        "size_t flight_get_effect_inputs_result_len(void * arg0);",
        "int32_t flight_get_effect_inputs_result_get(void * arg0, size_t arg1);",
        "void flight_get_effect_inputs_result_free(void * arg0);",
        "void * flight_get_effect_kinds(void);",
        "char * flight_get_effect_kinds_result_get(void * arg0, size_t arg1);",
        "void flight_get_effect_kinds_result_free(void * arg0);",
    ] {
        assert_line(&header, line);
    }
    for line in [
        "DEFINE_PRIM(_VOID, flight_free_owned_byte_reader, _BYTES);",
        "DEFINE_PRIM(_BYTES, flight_create_byte_reader, _BYTES _I32 _I64);",
        "DEFINE_PRIM(_BOOL, flight_has_byte_reader_bytes, _BYTES _I32);",
        "DEFINE_PRIM(_I32, flight_read_byte_reader_u24_big_endian, _BYTES);",
        "DEFINE_PRIM(_BYTES, flight_create_spine_binary_reader, _BYTES _I32);",
        "DEFINE_PRIM(_BYTES, flight_read_spine_binary_string, _BYTES);",
        "DEFINE_PRIM(_BOOL, flight_is_spine_binary_reader_overrun, _BYTES);",
        "DEFINE_PRIM(_BYTES, flight_get_effect_inputs, _BYTES);",
        "DEFINE_PRIM(_I32, flight_get_effect_inputs_result_len, _BYTES);",
        "DEFINE_PRIM(_I32, flight_get_effect_inputs_result_get, _BYTES _I32);",
        "DEFINE_PRIM(_VOID, flight_get_effect_inputs_result_free, _BYTES);",
        "DEFINE_PRIM(_BYTES, flight_get_effect_kinds, _NO_ARG);",
        "DEFINE_PRIM(_BYTES, flight_get_effect_kinds_result_get, _BYTES _I32);",
        "DEFINE_PRIM(_VOID, flight_get_effect_kinds_result_free, _BYTES);",
    ] {
        assert_line(&shim, line);
    }
}

// `Option<&mut Vec<ImportDiagnostic>>` lowers to one nullable opaque list carrier, and the list's
// helpers are plain scalar, string and pointer carriers on both sides.
#[test]
fn optional_diagnostics_lower_to_a_nullable_import_diagnostic_list() {
    let (header, shim) = generated();
    for (prototype, registration) in [
        (
            "void * flight_parse_cocos_plist_spritesheet(const char * arg0, void * arg1);",
            "DEFINE_PRIM(_BYTES, flight_parse_cocos_plist_spritesheet, _BYTES _BYTES);",
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
    assert!(wrappers.contains("fn flight_collect_rive_core_type_counts(out: *mut FfiU64CountMap"));
}

// A Clone Rust type still needs a genuine public producer before C may transfer it. StateRef has
// none, so its callback-bearing transition remains outside the ABI.
#[test]
fn optional_callbacks_lower_to_nullable_typed_function_pointers() {
    let (header, shim) = generated();
    assert!(!header.contains(" flight_transition_animation_state_machine("));
    assert!(!shim.contains("(flight_transition_animation_state_machine)"));
    assert!(
        generated_stats().contains("ownership_policy_skip(transition_animation_state_machine)")
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

// An `Arc<T>` return hands C an owned clone. Data values use T's carrier, while opaque extension
// entries retain the Arc itself and receive an exact paired free.
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

    for line in [
        "/* Caller owns the return value; call flight_free_spritesheet_format_entry_arc when done. */",
        "void * flight_get_spritesheet_format(void * arg0, void * arg1);",
        "void flight_free_spritesheet_format_entry_arc(void * arg0);",
        "/* Caller owns the return value; call flight_free_texture_atlas_format_entry_arc when done. */",
        "void * flight_get_texture_atlas_format(void * arg0, void * arg1);",
        "void flight_free_texture_atlas_format_entry_arc(void * arg0);",
    ] {
        assert_line(&header, line);
    }
    for skip in ["no_ts_public_export(get_rive_core_object_handler)"] {
        assert!(stats.contains(skip), "{skip} must stay skipped");
    }
    assert!(stats.contains("safety_policy_skip(enable_scene3d_resource_failure_guards)"));
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
    assert!(!header.contains(" flight_migrate_storage("));
    assert!(stats.contains("extension_policy_skip(migrate_storage)"));
    assert!(!stats.contains("unmapped_param(&[Option<Node2DRef>])"));
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

// The TypeScript root graph is the single admission boundary for every scanned Rust function.
// Neither a legacy Rust contract glob nor a newly discovered module re-export can bypass it.
#[test]
fn every_wrapper_requires_a_public_ts_export() {
    let (header, shim) = generated();
    let wrappers = generated_wrappers();
    for symbol in [
        "flight_get_array_buffer_storage",
        "flight_create_blob",
        "flight_initialize_geolocation_position",
        "flight_svg_attribute",
        "flight_svg_first_number",
        "flight_svg_local_name",
        "flight_svg_number_attribute",
        "flight_svg_optional_number_attribute",
        "flight_visit_svg_elements",
    ] {
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
    assert!(!stats.contains("prefix_skip(initialize_)"));
    for skip in [
        "no_ts_public_export(get_array_buffer_storage)",
        "no_ts_public_export(create_blob)",
        "no_ts_public_export(initialize_geolocation_position)",
        "no_ts_public_export(svg_attribute)",
        "no_ts_public_export(svg_first_number)",
        "no_ts_public_export(svg_local_name)",
        "no_ts_public_export(svg_number_attribute)",
        "no_ts_public_export(svg_optional_number_attribute)",
        "no_ts_public_export(visit_svg_elements)",
    ] {
        assert!(stats.contains(skip), "{skip} must stay skipped");
    }
    // A named TS re-export and a star-chain TS re-export both remain admitted.
    for line in [
        "void * flight_create_byte_reader(void * arg0, size_t arg1, int64_t arg2);",
        "bool flight_collect_svg_counts(void * arg0, const char * arg1);",
    ] {
        assert_line(&header, line);
    }

    // Avoid brittle global pins while keeping source decisions and emitted wrappers in distinct
    // units. Monomorphization may increase only the wrapper side of the second identity.
    let mut lines = stats.lines();
    let source = numeric_fields(lines.next().unwrap(), "FFI source decisions:");
    let wrappers = numeric_fields(lines.next().unwrap(), "FFI emitted wrappers:");
    let census = numeric_fields(lines.next().unwrap(), "FFI public census:");
    let [total, generated_sources, skipped] = source.as_slice() else {
        panic!("source headline must contain total, generated, and skipped counts")
    };
    let [generated_wrappers, wrapper_sources, monomorphized_extras] = wrappers.as_slice() else {
        panic!("wrapper headline must contain total, source, and monomorphized counts")
    };
    let [public, non_public] = census.as_slice() else {
        panic!("public census must contain public and non-public counts")
    };
    assert_eq!(*total, generated_sources + skipped);
    assert_eq!(*generated_wrappers, wrapper_sources + monomorphized_extras);
    assert_eq!(generated_sources, wrapper_sources);
    assert_eq!(public + non_public, *total);
    // Every non-public source is a no-export or internal-contract skip, except the explicit-state
    // seam constructors, which generate so public functions that borrow their state are callable.
    assert_eq!(
        stats.matches("no_ts_public_export(").count()
            + stats.matches("sdk_internal_contract_export(").count()
            + stats.matches("  state seam: ").count(),
        *non_public
    );
}

#[test]
fn sdk_font_contract_promotions_have_explicit_decisions() {
    let (header, shim) = generated();
    let wrappers = generated_wrappers();
    let stats = generated_stats();

    assert_line(
        &header,
        "void flight_initialize_font_resource(void * arg0);",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_VOID, flight_initialize_font_resource, _BYTES);",
    );
    assert!(wrappers.contains(
        "pub unsafe extern \"C\" fn flight_initialize_font_resource(out: *mut flight_sdk::FontResource)"
    ));
    assert!(wrappers.contains("flight_sdk::font::contract::initialize_font_resource"));
    assert!(
        stats.contains("SDK contract decision: initialize_font_resource generated: 1 wrapper(s)")
    );

    let glyph_initializer = "flight_initialize_glyph_rasterizer_backend_from_glyph_outline_source";
    assert!(!header.contains(&format!(" {glyph_initializer}(")));
    assert!(!shim.contains(&format!("({glyph_initializer})")));
    assert!(!wrappers.contains(&format!("fn {glyph_initializer}(")));
    assert!(stats.contains(
        "SDK contract decision: initialize_glyph_rasterizer_backend_from_glyph_outline_source skipped: extension_policy_skip(initialize_glyph_rasterizer_backend_from_glyph_outline_source)"
    ));

    for name in [
        "_load_font_face_from_bytes",
        "_load_font_face_from_url",
        "_load_font_face_from_urls",
        "_load_font_faces_from_name",
    ] {
        let symbol = format!("flight_{name}");
        assert!(!header.contains(&format!(" {symbol}(")));
        assert!(!shim.contains(&format!("({symbol})")));
        assert!(!wrappers.contains(&format!("fn {symbol}(")));
        assert!(stats.contains(&format!("sdk_internal_contract_export({name})")));
    }
}

#[test]
fn behavior_extensions_and_unowned_log_carriers_are_policy_skips() {
    let (header, shim) = generated();
    let wrappers = generated_wrappers();
    let extension_points = [
        "allocate_glyph_rasterizer_backend_from_glyph_outline_source",
        "create_filter_log_sink",
        "enable_log_signals",
        "initialize_glyph_rasterizer_backend_from_glyph_outline_source",
        "migrate_storage",
        "register_dragon_bones_section_handler",
        "register_dragon_bones_timeline_handler",
        "register_log_serializer",
        "register_rive_core_object_handler",
        "register_skeleton_2d_json_analyzer",
        "register_spine_binary_section_handler",
        "register_spine_binary_timeline_handler",
        "register_spine_json_section_handler",
        "register_spine_json_timeline_handler",
        "register_spine_skeleton_binary_parser",
        "set_log_sink",
    ];
    let ownership_gaps = [
        "build_tilemap_layers_from_tiled",
        "create_animation_clip",
        "create_animation_state_machine",
        "create_canvas_surface_from_native_handle",
        "create_fanout_log_sink",
        "create_skeleton_2d",
        "create_skin_2d",
        "explain_host_capability_slot",
        "get_memory_log_sink_entries",
        "report_import_diagnostic",
        "send_ipc_message",
        "transition_animation_state_machine",
        "write_binary_file_chunks",
    ];
    for name in extension_points {
        let symbol = format!("flight_{name}");
        assert!(!header.contains(&format!(" {symbol}(")));
        assert!(!shim.contains(&format!("({symbol})")));
        assert!(!wrappers.contains(&format!("fn {symbol}(")));
        assert!(generated_stats().contains(&format!("extension_policy_skip({name})")));
    }
    for name in ownership_gaps {
        let symbol = format!("flight_{name}");
        assert!(!header.contains(&format!(" {symbol}(")));
        assert!(!shim.contains(&format!("({symbol})")));
        assert!(!wrappers.contains(&format!("fn {symbol}(")));
        assert!(generated_stats().contains(&format!("ownership_policy_skip({name})")));
    }
    for name in [
        "register_dragon_bones_section_handlers",
        "register_dragon_bones_timeline_handlers",
        "register_spine_binary_section_handlers",
        "register_spine_binary_timeline_handlers",
        "register_spine_json_section_handlers",
        "register_spine_json_timeline_handlers",
    ] {
        assert!(wrappers.contains(&format!("fn flight_{name}(")));
    }
}

// Default shape-bounds handler values compose ShapeBoundsCommand registrations: an extension point
// whose cursor C cannot obtain, so all eleven are policy skips rather than unknown trait objects.
#[test]
fn shape_bounds_handler_values_are_extension_policy_skips() {
    let (header, shim) = generated();
    let wrappers = generated_wrappers();
    let stats = generated_stats();
    let handlers = [
        "default_shape_bounds_cubic_curve_to",
        "default_shape_bounds_draw_circle",
        "default_shape_bounds_draw_ellipse",
        "default_shape_bounds_draw_path",
        "default_shape_bounds_draw_rectangle",
        "default_shape_bounds_draw_rounded_rectangle",
        "default_shape_bounds_expand_point_pairs",
        "default_shape_bounds_line_style",
        "default_shape_bounds_line_to",
        "default_shape_bounds_move_to",
        "default_shape_bounds_quadratic_curve_to",
    ];
    for name in handlers {
        let symbol = format!("flight_{name}");
        assert!(!header.contains(&format!(" {symbol}(")));
        assert!(!shim.contains(&format!("({symbol})")));
        assert!(!wrappers.contains(&format!("fn {symbol}(")));
        assert!(stats.contains(&format!("extension_policy_skip({name})")));
    }
    assert!(!stats.contains("ShapeCommandArgumentCursor"));
    assert!(!wrappers.contains("ShapeCommandArgumentCursor"));
}

#[test]
fn owned_string_arrays_have_strict_c_and_hashlink_shapes() {
    let (header, shim) = generated();
    assert_line(
        &header,
        "void flight_set_log_redaction_paths(void * arg0, const char * const * arg1, size_t arg2);",
    );
    assert_line(
        &shim,
        "HL_PRIM void HL_NAME(flight_set_log_redaction_paths)(vbyte * arg0, vbyte * arg1, int arg2) { flight_set_log_redaction_paths((void *)arg0, (const char * const *)arg1, (size_t)arg2); }",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_VOID, flight_set_log_redaction_paths, _BYTES _BYTES _I32);",
    );
    let wrappers = generated_wrappers();
    assert!(wrappers.contains("paths_ptr: *const *const std::ffi::c_char"));
    assert!(!wrappers.contains("paths_ptr: *const String"));
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
    let skip = "no_ts_public_export(parse_style_declarations)";
    assert!(stats.contains(skip), "{skip} must stay skipped");
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

// Approved returned closures cross as callable, independently freeable disposer handles. The
// callback-retaining frame-rate connection returns a signal connection instead.
#[test]
fn returned_disposers_lower_to_callable_handles() {
    let (header, shim) = generated();
    for line in [
        "void * flight_reveal_scene3d_resources_on_resolve(void * arg0, void * arg1, void * arg2, void * arg3);",
        "void * flight_connect_signal_at_frame_rate(void * arg0, double arg1, void (*arg2)(void *, double), void * arg3, void (*arg4)(void *));",
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
    assert_line(
        &shim,
        "DEFINE_PRIM(_BYTES, flight_connect_signal_at_frame_rate, _BYTES _F64 _BYTES _BYTES _BYTES);",
    );
    assert!(
        generated_stats().contains("safety_policy_skip(enable_scene3d_resource_failure_guards)")
    );
    // The disposer lowering is allowlisted by function name: exactly these wrappers return it.
    let wrappers = generated_wrappers();
    let disposer_wrappers: Vec<&str> = wrappers
        .lines()
        .filter(|line| line.starts_with("pub unsafe extern \"C\" fn flight_"))
        .filter(|line| line.ends_with("-> *mut FfiDisposer {"))
        .map(|line| line.split('(').next().unwrap())
        .collect();
    assert_eq!(
        disposer_wrappers,
        [
            "pub unsafe extern \"C\" fn flight_connect_focus_navigation",
            "pub unsafe extern \"C\" fn flight_connect_input_to_interaction",
            "pub unsafe extern \"C\" fn flight_reveal_scene3d_resources_on_resolve",
        ]
    );
}

#[test]
fn native_contract_docs_stay_attached_to_native_symbols() {
    let (header, shim) = generated();
    for (comment, ownership, prototype, hl_prim) in [
        (
            "Connects callback_fn(callback_ctx, accumulated_ms) to a FrameTick signal at a reduced frame rate and returns an owned connection; NULL source or callback_fn returns NULL without calling release_fn. Teardown matches flight_connect_*_signal: release_fn(callback_ctx) runs exactly once, with no signal lock held, when flight_free_signal_connection or flight_disconnect_signal_connection disconnects it, the source is cleared, or the last handle to the source is dropped; the callback never runs after it. Callbacks run on the emitting thread, and the connection reports disconnected as soon as it is torn down, even while a callback already running on another thread finishes.",
            Some("Caller owns the return value; call flight_free_signal_connection when done."),
            "void * flight_connect_signal_at_frame_rate(void * arg0, double arg1, void (*arg2)(void *, double), void * arg3, void (*arg4)(void *));",
            "HL_PRIM vbyte * HL_NAME(flight_connect_signal_at_frame_rate)(vbyte * arg0, double arg1, vbyte * arg2, vbyte * arg3, vbyte * arg4) { return (vbyte *)flight_connect_signal_at_frame_rate((void *)arg0, (double)arg1, (void (*)(void *, double))arg2, (void *)arg3, (void (*)(void *))arg4); }",
        ),
        (
            "Handler and error contexts are retained until flight_clear_geolocation_watch(id); each nullable release callback then receives its context exactly once, when the host drops that callback, and the caller must keep a context alive until it is released.",
            None,
            "int32_t flight_watch_geolocation_position(void * arg0, void (*arg1)(void *, void *), void * arg2, void (*arg3)(void *), void * arg4, void (*arg5)(void *, uint32_t), void * arg6, void (*arg7)(void *));",
            "HL_PRIM int HL_NAME(flight_watch_geolocation_position)(vbyte * arg0, vbyte * arg1, vbyte * arg2, vbyte * arg3, vbyte * arg4, vbyte * arg5, vbyte * arg6, vbyte * arg7) { return (int)flight_watch_geolocation_position((void *)arg0, (void (*)(void *, void *))arg1, (void *)arg2, (void (*)(void *))arg3, (void *)arg4, (void (*)(void *, uint32_t))arg5, (void *)arg6, (void (*)(void *))arg7); }",
        ),
        (
            "data_kind tag: 0 means bytes; 1 means UTF-8 text; all other tags are invalid.",
            None,
            "void flight_write_file_atomic(void * arg0, const char * arg1, uint32_t arg2, const uint8_t * arg3, size_t arg4, void * arg5, void (*arg6)(void *, bool, char *), void * arg7);",
            "HL_PRIM void HL_NAME(flight_write_file_atomic)(vbyte * arg0, vbyte * arg1, int arg2, vbyte * arg3, int arg4, vbyte * arg5, vbyte * arg6, vbyte * arg7) { flight_write_file_atomic((void *)arg0, (const char *)arg1, (uint32_t)arg2, (const uint8_t *)arg3, (size_t)arg4, (void *)arg5, (void (*)(void *, bool, char *))arg6, (void *)arg7); }",
        ),
        (
            "Segment kind: 0 move, 1 line, 2 quadratic, 3 cubic, 4 close; unused coordinates are zero. The path is visited as it was when the call began. Callback and context are valid only until this function returns and must not be retained.",
            None,
            "bool flight_for_each_path_segment(void * arg0, bool (*arg1)(void *, uint32_t, double, double, double, double, double, double), void * arg2);",
            "HL_PRIM bool HL_NAME(flight_for_each_path_segment)(vbyte * arg0, vbyte * arg1, vbyte * arg2) { return (bool)flight_for_each_path_segment((void *)arg0, (bool (*)(void *, uint32_t, double, double, double, double, double, double))arg1, (void *)arg2); }",
        ),
        (
            "Callback and context are valid only until this function returns and must not be retained. The callback output buffer is valid only for the callback duration and must not be retained.",
            Some(
                "Caller owns the return value; call flight_build_particle_color_curve_result_free when done.",
            ),
            "void * flight_build_particle_color_curve(bool (*arg0)(void *, float, float *), void * arg1, int32_t arg2);",
            "HL_PRIM vbyte * HL_NAME(flight_build_particle_color_curve)(vbyte * arg0, vbyte * arg1, int arg2) { return (vbyte *)flight_build_particle_color_curve((bool (*)(void *, float, float *))arg0, (void *)arg1, (int32_t)arg2); }",
        ),
        (
            "Callback and context are valid only until this function returns and must not be retained. The borrowed diagnostic-list handle is valid only for the callback duration and must not be retained or destroyed.",
            None,
            "bool flight_collect_import_diagnostics(void * arg0, bool (*arg1)(void *, void *), void * arg2);",
            "HL_PRIM bool HL_NAME(flight_collect_import_diagnostics)(vbyte * arg0, vbyte * arg1, vbyte * arg2) { return (bool)flight_collect_import_diagnostics((void *)arg0, (bool (*)(void *, void *))arg1, (void *)arg2); }",
        ),
        (
            "Callback and context are valid only until this function returns and must not be retained. The borrowed requirement-list handle is valid only for the callback duration and must not be retained or destroyed.",
            Some("Caller owns the return value; call flight_free_requirement_set when done."),
            "void * flight_collect_scene2d_requirements(bool (*arg0)(void *, void *), void * arg1);",
            "HL_PRIM vbyte * HL_NAME(flight_collect_scene2d_requirements)(vbyte * arg0, vbyte * arg1) { return (vbyte *)flight_collect_scene2d_requirements((bool (*)(void *, void *))arg0, (void *)arg1); }",
        ),
    ] {
        let comment = format!("/* {comment} */");
        let header_contract = match ownership {
            Some(ownership) => format!("{comment}\n/* {ownership} */\n{prototype}"),
            None => format!("{comment}\n{prototype}"),
        };
        assert!(
            header.contains(&header_contract),
            "contract comment drifted from C prototype:\n{header_contract}"
        );
        let shim_contract = format!("{comment}\n{hl_prim}");
        assert!(
            shim.contains(&shim_contract),
            "contract comment drifted from HashLink primitive:\n{shim_contract}"
        );
    }
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
        "void * flight_share_bitmap(void * arg0 /* ownership transferred; do not use or free after call */);",
        "void * flight_create_bitmap_region(void * arg0, int32_t arg1, int32_t arg2, int32_t arg3, int32_t arg4);",
        "void * flight_ease_invert(void * arg0 /* cloned; caller retains its handle */);",
        "void flight_register_particle_format(void * arg0, const char * arg1, void * arg2 /* cloned; caller retains its handle */);",
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
        "pub unsafe extern \"C\" fn flight_get_bitmap_pixel_channel(source: *const std::ffi::c_void, x: u32, y: u32, channel: *const flight_sdk::ImageChannel) -> u8 {",
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
            let parameter = rest
                .split(')')
                .next()
                .unwrap()
                .split(" as ")
                .next()
                .unwrap();
            if parameter.starts_with("__") {
                continue;
            }
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
    assert!(stats.contains("no_ts_public_export(create_tray_animation_state)"));
    for recovered in [
        "unmapped_param(ParticleFormatCodec)",
        "unmapped_param(TargetRef)",
    ] {
        assert!(!stats.contains(recovered), "{recovered} must be recovered");
    }
    assert!(header.contains(" flight_register_particle_format("));
    assert!(wrappers.contains("codec: *const flight_sdk::ParticleFormatCodec"));
    assert!(wrappers.contains("unsafe { (*codec).clone() }"));
    for name in ["send_ipc_message", "write_binary_file_chunks"] {
        let symbol = format!("flight_{name}");
        assert!(!header.contains(&format!(" {symbol}(")));
        assert!(stats.contains(&format!("ownership_policy_skip({name})")));
    }
}

// Public-function enums whose crate roots do not re-export them cross as exact `u32`
// discriminants named through the crate's contract module; `Option<enum>` keeps the -1 sentinel.
#[test]
fn contract_lane_enums_cross_as_u32_discriminants() {
    let (header, shim) = generated();
    let wrappers = generated_wrappers();
    for line in [
        "bool flight_append_morph_shape_begin_gradient_fill(const FlightNode * arg0, uint32_t arg1, void * arg2, void * arg3, int32_t arg4, int32_t arg5);",
        "bool flight_append_morph_shape_line_gradient_style(const FlightNode * arg0, uint32_t arg1, void * arg2, void * arg3, int32_t arg4, int32_t arg5);",
    ] {
        assert_line(&header, line);
    }
    assert_line(
        &shim,
        "DEFINE_PRIM(_BOOL, flight_append_morph_shape_begin_gradient_fill, _BYTES _I32 _BYTES _BYTES _I32 _I32);",
    );
    assert!(wrappers.contains(
        "ffi_enum_from_u32!(raw, [flight_sdk::shape::contract::SpreadMethod::Pad, flight_sdk::shape::contract::SpreadMethod::Reflect, flight_sdk::shape::contract::SpreadMethod::Repeat])"
    ));
    let stats = generated_stats();
    assert!(!stats.contains("SpreadMethod"));
    assert!(
        stats.contains("no_ts_public_export(get_spritesheet_parse_diagnostic_severity_string)")
    );
}

#[test]
fn byte_reader_inventory_is_complete_and_ts_gated() {
    let wrappers = generated_wrappers();
    let header = generated().0;
    for symbol in [
        "flight_create_byte_reader",
        "flight_has_byte_reader_bytes",
        "flight_read_byte_reader_u8",
        "flight_read_byte_reader_u16",
        "flight_read_byte_reader_u24",
        "flight_read_byte_reader_u24_big_endian",
        "flight_read_byte_reader_u32",
        "flight_read_byte_reader_u32_big_endian",
        "flight_read_byte_reader_u64",
        "flight_skip_byte_reader",
        "flight_create_spine_binary_reader",
        "flight_has_spine_binary_bytes",
        "flight_is_spine_binary_reader_overrun",
        "flight_read_spine_binary_boolean",
        "flight_read_spine_binary_byte",
        "flight_read_spine_binary_float",
        "flight_read_spine_binary_int",
        "flight_read_spine_binary_signed_varint",
        "flight_read_spine_binary_string",
        "flight_read_spine_binary_unsigned_short",
        "flight_read_spine_binary_varint",
        "flight_skip_spine_binary_bytes",
        "flight_skip_spine_binary_curve_frames",
        "flight_skip_spine_binary_curve_tag",
    ] {
        assert!(
            wrappers.contains(&format!("fn {symbol}(")),
            "missing {symbol}"
        );
        assert!(header.contains(&format!(" {symbol}(")), "missing {symbol}");
    }
    // This Rust contract member is deliberately absent from the package's TypeScript root.
    assert!(!wrappers.contains("flight_report_spine_binary_crumb"));
    assert!(wrappers.contains("flight_read_spine_binary_string_reference"));
    let stats = generated_stats();
    assert!(!stats.contains("unmapped_param(&mut ByteReader"));
    assert!(!stats.contains("unmapped_param(&ByteReader"));
    assert!(!stats.contains("unmapped_return(&'static [EffectInput])"));
    assert!(!stats.contains("unmapped_return(&'static [&'static str])"));
    assert!(!stats.contains("unmapped_param(&[Option<String>])"));
}

// Every caller-supplied enum is checked against its own variants before the enum exists: a direct
// enum rejects any other value, and `Option<enum>` reads only -1 as None. No wrapper transmutes a C
// integer into an enum, and an async wrapper checks inside its existing panic boundary.
#[test]
fn enum_parameters_are_checked_before_conversion() {
    let wrappers = generated_wrappers();
    assert!(!wrappers.contains("transmute::<u32"));
    assert!(!wrappers.contains("transmute::<i32"));
    assert_line(
        &wrappers,
        "    let winding_enum = match winding { -1 => None, raw => match u32::try_from(raw).ok().and_then(|raw| ffi_enum_from_u32!(raw, [flight_sdk::PathWinding::NonZero, flight_sdk::PathWinding::EvenOdd])) { Some(value) => Some(value), None => panic!(\"winding must be -1 or a PathWinding discriminant, got {}\", winding) } };",
    );
    assert_line(
        &wrappers,
        "    let type_enum = match ffi_enum_from_u32!(r#type, [flight_sdk::HapticNotificationType::Success, flight_sdk::HapticNotificationType::Warning, flight_sdk::HapticNotificationType::Error]) { Some(value) => value, None => panic!(\"type must be a HapticNotificationType discriminant, got {}\", r#type) };",
    );
    let async_wrapper = wrappers
        .split("pub unsafe extern \"C\" fn flight_can_access_file(")
        .nth(1)
        .unwrap();
    let boundary = async_wrapper.find("catch_unwind").unwrap();
    let conversion = async_wrapper.find("let mode_enum = ").unwrap();
    assert!(
        boundary < conversion,
        "the async enum check must run inside catch_unwind"
    );
    let (header, _) = generated();
    assert_line(&header, "void * flight_create_path(int32_t arg0);");
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

fn numeric_fields(line: &str, prefix: &str) -> Vec<usize> {
    let fields = line
        .strip_prefix(prefix)
        .unwrap_or_else(|| panic!("expected {prefix:?}, got {line:?}"));
    return fields
        .split_whitespace()
        .filter_map(|field| field.trim_end_matches(',').parse().ok())
        .collect();
}

fn generated_wrappers() -> String {
    return fs::read_to_string(Path::new(env!("OUT_DIR")).join("ffi_generated.rs")).unwrap();
}
