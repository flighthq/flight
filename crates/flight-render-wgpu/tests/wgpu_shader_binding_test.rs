use flight_entity::get_entity_id;
use flight_render::{RenderProxies2D, get_or_create_render_proxy_2d};
use flight_render_wgpu::*;

use crate::support::*;

fn bind_noop(_state: &mut WgpuRenderState, _alpha: f32) {}

// The source's `{ pipeline: {} as never, bind }` fake: a real noop pipeline plus a no-op bind hook.
fn create_fake_shader(state: &mut WgpuRenderState, mode: &str) -> WgpuBitmapShader {
    let mode = mode.to_string();
    return WgpuBitmapShader {
        pipeline: get_wgpu_pipeline(state, Some(&mode), WgpuStencilMode::Normal),
        bind: bind_noop,
    };
}

mod get_wgpu_shader {
    use super::*;

    #[test]
    fn returns_undefined_when_no_shader_is_bound() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut proxies = test_default::<RenderProxies2D<WgpuRenderState>>();
        let bitmap = create_test_node("Sprite");
        let render_proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &bitmap);
        assert!(get_wgpu_shader(&state, render_proxy).is_none());
    }
}

mod resolve_wgpu_shader {
    use super::*;

    #[test]
    fn returns_null_when_no_shader_feature_is_enabled() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut proxies = test_default::<RenderProxies2D<WgpuRenderState>>();
        let bitmap = create_test_node("Sprite");
        let render_proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &bitmap);
        assert!(resolve_wgpu_shader(&state, render_proxy).is_none());
    }

    #[test]
    fn returns_the_bound_shader_once_a_binding_is_installed() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut proxies = test_default::<RenderProxies2D<WgpuRenderState>>();
        let bitmap = create_test_node("Sprite");
        let other = create_test_node("Sprite");
        let fake_shader = create_fake_shader(&mut state, "Add");
        set_wgpu_shader(&mut state, &mut proxies, &bitmap, Some(fake_shader.clone()));

        let render_proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &bitmap);
        let resolved = resolve_wgpu_shader(&state, render_proxy).expect("a bound shader");
        assert_eq!(resolved.pipeline, fake_shader.pipeline);
        let other_proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &other);
        assert!(resolve_wgpu_shader(&state, other_proxy).is_none());
    }
}

mod set_wgpu_shader {
    use super::*;

    #[test]
    fn binds_a_shader_to_a_display_object() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut proxies = test_default::<RenderProxies2D<WgpuRenderState>>();
        let bitmap = create_test_node("Sprite");
        let fake_shader = create_fake_shader(&mut state, "Add");

        set_wgpu_shader(&mut state, &mut proxies, &bitmap, Some(fake_shader.clone()));

        let render_proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &bitmap);
        let bound = get_wgpu_shader(&state, render_proxy).expect("a bound shader");
        assert_eq!(bound.pipeline, fake_shader.pipeline);
        assert!(std::ptr::fn_addr_eq(
            bound.bind,
            bind_noop as fn(&mut WgpuRenderState, f32)
        ));
    }

    // TS compares the installed resolver to `getWgpuShader` by identity; the Rust resolver is the
    // state-local table lookup keyed by node id, so its installation and its lookup are asserted.
    #[test]
    fn installs_the_per_node_shader_binding_resolver() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut proxies = test_default::<RenderProxies2D<WgpuRenderState>>();
        let bitmap = create_test_node("Sprite");
        let fake_shader = create_fake_shader(&mut state, "Add");
        assert!(
            get_wgpu_render_state_runtime(&state)
                .webgpu_shader_binding_resolver
                .is_none()
        );
        set_wgpu_shader(&mut state, &mut proxies, &bitmap, Some(fake_shader.clone()));
        let resolver = get_wgpu_render_state_runtime(&state)
            .webgpu_shader_binding_resolver
            .expect("the per-node resolver");
        let id = get_entity_id(&*bitmap.read().unwrap());
        assert_eq!(
            resolver(&state, id).map(|shader| shader.pipeline),
            Some(fake_shader.pipeline)
        );
    }

    #[test]
    fn removes_the_binding_when_shader_is_null() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut proxies = test_default::<RenderProxies2D<WgpuRenderState>>();
        let bitmap = create_test_node("Sprite");
        let fake_shader = create_fake_shader(&mut state, "Add");
        set_wgpu_shader(&mut state, &mut proxies, &bitmap, Some(fake_shader));
        set_wgpu_shader(&mut state, &mut proxies, &bitmap, None);
        let render_proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &bitmap);
        assert!(get_wgpu_shader(&state, render_proxy).is_none());
    }
}
