use std::collections::BTreeSet;

const BUILD: &str = include_str!("../build.rs");
const GENERATED: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"));
const HEADER: &str = include_str!(concat!(env!("OUT_DIR"), "/flight_ffi.h"));
const STATS: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_stats.txt"));

fn constant_block(name: &str) -> &'static str {
    let start = BUILD.find(name).unwrap_or_else(|| panic!("missing {name}"));
    let rest = &BUILD[start..];
    let end = rest.find("\n];").expect("constant terminator") + 3;
    &rest[..end]
}

fn wrapper(name: &str) -> &'static str {
    GENERATED
        .split_once(&format!("fn {name}("))
        .unwrap_or_else(|| panic!("missing generated wrapper {name}"))
        .1
        .split("#[unsafe(no_mangle)]")
        .next()
        .unwrap()
}

#[test]
fn scan_membership_is_literal_and_excludes_gl_backends() {
    let scan = constant_block("const SCAN_CRATES:");
    for crate_name in [
        "flight-effects-wgpu",
        "flight-render-wgpu",
        "flight-scene2d-wgpu",
        "flight-scene3d-wgpu",
    ] {
        assert_eq!(scan.matches(&format!("\"{crate_name}\"")).count(), 1);
    }
    for crate_name in ["flight-render-gl", "flight-scene2d-gl"] {
        assert!(!scan.contains(&format!("\"{crate_name}\"")));
    }
}

#[test]
fn backend_policy_partition_is_named_reasoned_and_closed() {
    // Backend policy skips are recorded, not accepted: the root census lists each one as an
    // actionable residual row under its skip category.
    assert!(STATS.contains("FFI root census: "));
    assert!(!STATS.contains("FFI public skip partition"));
    let backend_skips = STATS
        .lines()
        .filter_map(|line| line.strip_prefix("  public skip: "))
        .filter(|line| {
            [
                "backend_behavior_policy_skip(",
                "bracket_policy_skip(",
                "native_layout_policy_skip(",
                "nested_bracket_policy_skip(",
                "scoped_callback_policy_skip(",
                "trait_carrier_policy_skip(",
            ]
            .iter()
            .any(|category| line.contains(category))
                || *line
                    == "apply_wgpu_effects_to_render_texture: safety_policy_skip(apply_wgpu_effects_to_render_texture)"
        })
        .collect::<Vec<_>>();
    assert_eq!(backend_skips.len(), 63);
    assert!(
        backend_skips
            .iter()
            .filter(|line| !line.contains("apply_wgpu_effects_to_render_texture"))
            .all(|line| line.contains(": ")),
        "every backend-specific policy row carries a code-facing reason"
    );

    for symbol in [
        "flight_create_external_wgpu_texture",
        "flight_create_wgpu_texture_render_target",
        "flight_set_wgpu_effect_velocity_texture",
    ] {
        assert!(!GENERATED.contains(&format!("fn {symbol}(")));
        assert!(!HEADER.contains(&format!(" {symbol}(")));
    }
}

#[test]
fn renderer_registrations_are_non_generic_generated_externs() {
    let scene2d = [
        "flight_register_wgpu_bitmap_text_renderer",
        "flight_register_wgpu_render_cache_renderer",
        "flight_register_wgpu_mesh_shape_renderer",
        "flight_register_wgpu_scene2d_renderer",
        "flight_register_wgpu_particle_emitter2d_renderer",
        "flight_register_wgpu_quad_batch_renderer",
        "flight_register_wgpu_raster_shape_renderer",
        "flight_register_wgpu_rich_text_renderer",
        "flight_register_wgpu_scale9_shape_renderer",
        "flight_register_wgpu_scale9_sprite_renderer",
        "flight_register_wgpu_morph_shape_renderer",
        "flight_register_wgpu_shape_renderer",
        "flight_register_wgpu_sprite_renderer",
        "flight_register_wgpu_standard_material",
        "flight_register_wgpu_text_label_renderer",
        "flight_register_wgpu_tilemap_renderer",
        "flight_register_wgpu_scene2d_render_preset",
    ];
    let scene3d = [
        "flight_register_wgpu_blinn_phong_material",
        "flight_register_wgpu_custom_shader_material",
        "flight_register_wgpu_depth_material",
        "flight_register_wgpu_emissive_material",
        "flight_register_wgpu_lambert_material",
        "flight_register_wgpu_matcap_material",
        "flight_register_wgpu_normal_material",
        "flight_register_wgpu_phong_material",
        "flight_register_wgpu_shaded_material",
        "flight_register_wgpu_specular_glossiness_pbr_material",
        "flight_register_wgpu_standard_pbr_material",
        "flight_register_wgpu_toon_material",
        "flight_register_wgpu_unlit_material",
        "flight_register_wgpu_vertex_color_material",
        "flight_register_wgpu_wireframe_material",
        "flight_register_wgpu_scene3d_render_preset",
    ];
    let expected = scene2d.into_iter().chain(scene3d).collect::<BTreeSet<_>>();
    assert_eq!(expected.len(), 33);
    for symbol in expected {
        assert_eq!(GENERATED.matches(&format!("fn {symbol}(")).count(), 1);
        assert_eq!(HEADER.matches(&format!(" {symbol}(")).count(), 1);
    }
}

#[test]
fn ref_only_wgpu_borrows_rely_on_guard_auto_deref() {
    let expected = [
        (
            "flight_explain_wgpu_effect_application",
            "&guard_source, guard_dest.as_deref().unwrap_or(&guard_source)",
        ),
        (
            "flight_destroy_wgpu_render_texture",
            "&guard_render_texture",
        ),
        (
            "flight_explain_wgpu_render_texture",
            "&guard_render_texture",
        ),
        (
            "flight_is_wgpu_render_texture_ready",
            "&guard_render_texture",
        ),
    ];
    for (name, fragment) in expected {
        let body = wrapper(name);
        assert!(body.contains(fragment), "{name} lacks {fragment}");
        assert!(
            !body.contains("&*guard_") && !body.contains("&mut *guard_"),
            "{name} restored an explicit dereference that guard auto-deref supplies"
        );
    }
}

#[test]
fn every_ref_only_guard_call_avoids_an_explicit_deref() {
    let mut checked = 0;
    for body in GENERATED.split("#[unsafe(no_mangle)]") {
        for line in body.lines() {
            let Some(rest) = line.trim().strip_prefix("let arc_") else {
                continue;
            };
            if !line.contains("as *const flight_sdk::Ref<") {
                continue;
            }
            let Some((clean, _)) = rest.split_once(" = ") else {
                continue;
            };
            if !body.contains(&format!("guard_{clean}")) {
                continue;
            }
            checked += 1;
            assert!(
                !body.contains(&format!("&*guard_{clean}"))
                    && !body.contains(&format!("&mut *guard_{clean}")),
                "the {clean} Ref guard restored an explicit dereference"
            );
        }
    }
    assert!(
        checked > 100,
        "ref-only guard census became vacuous: {checked}"
    );
}
