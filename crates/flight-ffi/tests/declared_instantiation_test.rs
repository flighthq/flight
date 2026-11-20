//! The explicit backend instantiation table: exactly the declared wgpu 2D render instantiations,
//! their proxy carrier and the per-backend node-renderer registrars reach the header and the
//! HashLink shim, each generic call names its concrete backend, and the census keeps them apart from
//! scanned source decisions.

use std::fs;
use std::path::Path;

fn generated(name: &str) -> String {
    return fs::read_to_string(Path::new(env!("OUT_DIR")).join(name)).unwrap();
}

fn assert_line(text: &str, line: &str) {
    assert!(
        text.lines().any(|candidate| candidate == line),
        "missing generated line:\n{line}"
    );
}

#[test]
fn declares_exactly_the_wgpu_scene_2d_render_pair_and_proxy_carrier() {
    let header = generated("flight_ffi.h");
    for line in [
        "bool flight_prepare_wgpu_scene_2d_render(void * arg0, void * arg1, const FlightNode * arg2);",
        "void flight_destroy_wgpu_scene_2d_render(void * arg0, void * arg1);",
        "/* Caller owns the return value; call flight_free_wgpu_scene_2d_render_proxies when done. */",
        "void * flight_create_wgpu_scene_2d_render_proxies(void);",
        "void flight_free_wgpu_scene_2d_render_proxies(void * arg0);",
    ] {
        assert_line(&header, line);
    }
    let declared: Vec<&str> = header
        .lines()
        .filter(|line| line.contains("wgpu_scene_2d_render"))
        .filter(|line| !line.starts_with("/*"))
        .collect();
    assert_eq!(declared.len(), 4, "{declared:#?}");
    for internal in [
        "get_or_create_render_proxy_2d",
        "create_render_proxy_2d",
        "flight_prepare_scene_2d_render(",
        "flight_destroy_render_state(",
    ] {
        assert!(
            !header.contains(internal),
            "{internal} must stay undeclared"
        );
    }
}

#[test]
fn reaches_the_hashlink_shim() {
    let shim = generated("flight_hl.c");
    for line in [
        "DEFINE_PRIM(_BOOL, flight_prepare_wgpu_scene_2d_render, _BYTES _BYTES _BYTES);",
        "DEFINE_PRIM(_VOID, flight_destroy_wgpu_scene_2d_render, _BYTES _BYTES);",
        "DEFINE_PRIM(_BYTES, flight_create_wgpu_scene_2d_render_proxies, _NO_ARG);",
        "DEFINE_PRIM(_VOID, flight_free_wgpu_scene_2d_render_proxies, _BYTES);",
    ] {
        assert_line(&shim, line);
    }
}

#[test]
fn calls_each_generic_with_its_explicit_backend() {
    let wrappers = generated("ffi_generated.rs");
    for call in [
        "    return flight_sdk::prepare_scene_2d_render::<flight_sdk::WgpuRenderState>(",
        "    flight_sdk::destroy_render_state::<flight_sdk::WgpuRenderState>(",
    ] {
        assert_eq!(
            wrappers
                .lines()
                .filter(|line| line.starts_with(call))
                .count(),
            1,
            "{call}"
        );
    }
    assert_line(
        &wrappers,
        "    let carrier: flight_sdk::RenderProxies2D<flight_sdk::WgpuRenderState> = Default::default();",
    );
}

#[test]
fn reports_declared_instantiations_outside_the_source_census() {
    let stats = generated("ffi_stats.txt");
    for line in [
        "FFI declared instantiations: 4 wrappers, 1 carriers",
        "  declared: flight_register_gl_node_renderer = flight-render::register_node_renderer<S = GlRenderState>",
        "  declared: flight_register_wgpu_node_renderer = flight-render::register_node_renderer<S = WgpuRenderState>",
        "  declared: flight_prepare_wgpu_scene_2d_render = flight-render::prepare_scene_2d_render<S = WgpuRenderState>",
        "  declared: flight_destroy_wgpu_scene_2d_render = flight-render::destroy_render_state<S = WgpuRenderState>",
        "  declared: flight_create_wgpu_scene_2d_render_proxies / flight_free_wgpu_scene_2d_render_proxies = RenderProxies2D<WgpuRenderState>",
    ] {
        assert_line(&stats, line);
    }
}

// Each backend's node-renderer registrar is the generic `register_node_renderer` at that backend's
// state, taking the state, a C string kind and a borrowed renderer handle typed for the backend.
#[test]
fn declares_one_node_renderer_registrar_per_backend() {
    let header = generated("flight_ffi.h");
    for line in [
        "void flight_register_gl_node_renderer(void * arg0, const char * arg1, const FlightBuiltinGlNodeRenderer * arg2);",
        "void flight_register_wgpu_node_renderer(void * arg0, const char * arg1, const FlightBuiltinWgpuNodeRenderer * arg2);",
    ] {
        assert_line(&header, line);
    }
    let shim = generated("flight_hl.c");
    for line in [
        "DEFINE_PRIM(_VOID, flight_register_gl_node_renderer, _BYTES _BYTES _ABSTRACT(FlightBuiltinGlNodeRenderer));",
        "DEFINE_PRIM(_VOID, flight_register_wgpu_node_renderer, _BYTES _BYTES _ABSTRACT(FlightBuiltinWgpuNodeRenderer));",
    ] {
        assert_line(&shim, line);
    }
    let wrappers = generated("ffi_generated.rs");
    for (state, family, borrowed) in [
        ("GlRenderState", "gl", "FfiBuiltinGlNodeRenderer"),
        ("WgpuRenderState", "wgpu", "FfiBuiltinWgpuNodeRenderer"),
    ] {
        assert_line(
            &wrappers,
            &format!(
                "pub unsafe extern \"C\" fn flight_register_{family}_node_renderer(state: *mut flight_sdk::{state}, kind: *const std::ffi::c_char, renderer: *const {borrowed}) {{"
            ),
        );
        assert_eq!(
            wrappers
                .lines()
                .filter(|line| line.starts_with(&format!(
                    "    flight_sdk::register_node_renderer::<flight_sdk::{state}>("
                )))
                .count(),
            1,
            "{state}"
        );
        assert!(wrappers.contains(&format!(
            "    let Some(renderer) = ffi_resolve_{family}_node_renderer(renderer) else {{"
        )));
    }
    assert!(!wrappers.contains("renderer as *const flight_sdk::NodeRenderer"));
}
