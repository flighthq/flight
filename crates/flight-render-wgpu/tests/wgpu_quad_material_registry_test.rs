use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogEntry, LogStateRef, LogValue, MemoryLogSink, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_materials::standard_material::create_standard_material;
use flight_materials::{STANDARD_MATERIAL_KIND, StandardMaterial};
use flight_render::{
    RenderRegistriesMiss, RenderRegistryTable, enable_render_registries_guards,
    explain_render_registries_misses,
};
use flight_render_wgpu::*;

use crate::support::*;

const TEST_KIND: &str = "TestMaterial";

fn get_test_shader_module(state: &mut WgpuRenderState) -> wgpu::ShaderModule {
    return get_wgpu_render_state_native_device(state)
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(
                "@vertex fn vs_main() -> @builtin(position) vec4f { return vec4f(0.0); }".into(),
            ),
        });
}

fn get_replacement_shader_module(state: &mut WgpuRenderState) -> wgpu::ShaderModule {
    return get_test_shader_module(state);
}

fn test_renderer() -> WgpuQuadMaterialRenderer {
    return WgpuQuadMaterialRenderer {
        instance_float_count: 0,
        get_shader_module: get_test_shader_module,
        pack_instance: None,
    };
}

fn replacement_renderer() -> WgpuQuadMaterialRenderer {
    return WgpuQuadMaterialRenderer {
        instance_float_count: 4,
        get_shader_module: get_replacement_shader_module,
        pack_instance: None,
    };
}

// Renderer identity: the source compares objects with toBe; a Rust renderer is a value, so its
// float count (distinct per fixture) and shader-module hook carry its identity.
fn is_same_renderer(a: &WgpuQuadMaterialRenderer, b: &WgpuQuadMaterialRenderer) -> bool {
    return a.instance_float_count == b.instance_float_count
        && std::ptr::fn_addr_eq(a.get_shader_module, b.get_shader_module);
}

fn make_material(kind: &str) -> StandardMaterial {
    let mut material = create_standard_material();
    material.kind = kind.to_string();
    return material;
}

fn logger() -> (LogStateRef, MemoryLogSink) {
    let state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(4);
    add_log_sink(&state, sink.sink.clone());
    return (state, sink);
}

fn record_str(entry: &LogEntry, key: &str) -> Option<String> {
    let LogData::Record(record) = &entry.data else {
        return None;
    };
    let Some(LogValue::Str(value)) = record.get(key) else {
        return None;
    };
    return Some(value.clone());
}

fn record_number(entry: &LogEntry, key: &str) -> Option<f64> {
    let LogData::Record(record) = &entry.data else {
        return None;
    };
    let Some(LogValue::Number(value)) = record.get(key) else {
        return None;
    };
    return Some(*value);
}

mod get_wgpu_quad_material_renderer {
    use super::*;

    #[test]
    fn returns_null_when_nothing_is_registered_for_the_kind() {
        let state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_quad_material_renderer(&state, &TEST_KIND.to_string()).is_none());
    }
}

mod register_wgpu_quad_material_renderer {
    use super::*;

    #[test]
    fn registers_a_renderer_retrievable_by_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        let before = get_wgpu_render_state_runtime(&state)
            .registries
            .material_renderers
            .clone();
        register_wgpu_quad_material_renderer(&mut state, TEST_KIND.to_string(), test_renderer());
        let registered = get_wgpu_quad_material_renderer(&state, &TEST_KIND.to_string())
            .expect("a registered renderer");
        assert!(is_same_renderer(&registered, &test_renderer()));
        assert!(!Arc::ptr_eq(
            &get_wgpu_render_state_runtime(&state)
                .registries
                .material_renderers,
            &before
        ));
        assert_eq!(before.entries.len(), 0);
    }

    #[test]
    fn is_last_write_wins_without_mutating_the_earlier_snapshot() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_quad_material_renderer(&mut state, TEST_KIND.to_string(), test_renderer());
        let before = get_wgpu_render_state_runtime(&state)
            .registries
            .material_renderers
            .clone();

        register_wgpu_quad_material_renderer(
            &mut state,
            TEST_KIND.to_string(),
            replacement_renderer(),
        );

        let current = get_wgpu_quad_material_renderer(&state, &TEST_KIND.to_string())
            .expect("the replacement");
        assert!(is_same_renderer(&current, &replacement_renderer()));
        let Some(WgpuMaterialRenderer::Quad(earlier)) = before.entries.get(TEST_KIND) else {
            panic!("the earlier snapshot keeps its quad renderer");
        };
        assert!(is_same_renderer(earlier, &test_renderer()));
    }
}

mod resolve_wgpu_quad_material_renderer {
    use super::*;

    #[test]
    fn returns_null_when_nothing_is_registered_no_built_in_fallback() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(resolve_wgpu_quad_material_renderer(&mut state, None).is_none());
        let material = make_material(TEST_KIND);
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(resolve_wgpu_quad_material_renderer(&mut state, Some(&material)).is_none());
    }

    #[test]
    fn returns_the_registered_renderer_for_a_material_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_quad_material_renderer(&mut state, TEST_KIND.to_string(), test_renderer());
        let material = make_material(TEST_KIND);
        let resolved = resolve_wgpu_quad_material_renderer(&mut state, Some(&material))
            .expect("the registered renderer");
        assert!(is_same_renderer(&resolved, &test_renderer()));
    }

    #[test]
    fn falls_back_to_the_renderer_registered_for_standard_material_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_quad_material_renderer(
            &mut state,
            STANDARD_MATERIAL_KIND.to_string(),
            test_renderer(),
        );
        let material = make_material("Other");
        let resolved = resolve_wgpu_quad_material_renderer(&mut state, Some(&material))
            .expect("the standard fallback");
        assert!(is_same_renderer(&resolved, &test_renderer()));
        let resolved =
            resolve_wgpu_quad_material_renderer(&mut state, None).expect("the standard renderer");
        assert!(is_same_renderer(&resolved, &test_renderer()));
    }

    #[test]
    fn reports_the_missing_kind_against_the_wgpu_registrar_not_the_gl_one() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (log_state, sink) = logger();
        enable_render_registries_guards(&mut state, Some(log_state));

        let material = make_material(TEST_KIND);
        resolve_wgpu_quad_material_renderer(&mut state, Some(&material));

        assert_eq!(
            explain_render_registries_misses(&state).misses,
            vec![RenderRegistriesMiss {
                kind: TEST_KIND.to_string(),
                registry: RenderRegistryTable::MaterialRenderer,
            }]
        );
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        let entry = entries.first().expect("one registry-miss warning");
        assert_eq!(record_str(entry, "kind").as_deref(), Some(TEST_KIND));
        assert_eq!(
            record_str(entry, "message").as_deref(),
            Some(
                "resolveWgpuQuadMaterialRenderer: material kind has no registered renderer, so nodes using it do not draw — call registerWgpuQuadMaterialRenderer(state, kind, renderer)"
            )
        );
        assert_eq!(
            record_number(entry, "registry"),
            Some(RenderRegistryTable::MaterialRenderer as i64 as f64)
        );
    }
}
