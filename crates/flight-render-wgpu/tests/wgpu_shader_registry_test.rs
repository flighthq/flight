use flight_render_wgpu::*;

use crate::support::*;

fn bind_noop(_state: &mut WgpuRenderState, _alpha: f32) {}

// The source's `{ pipeline: {}, bind }` fake: a real noop pipeline plus a no-op bind hook.
fn create_fake_shader(state: &mut WgpuRenderState, mode: &str) -> WgpuBitmapShader {
    let mode = mode.to_string();
    return WgpuBitmapShader {
        pipeline: get_wgpu_pipeline(state, Some(&mode), WgpuStencilMode::Normal),
        bind: bind_noop,
    };
}

mod register_wgpu_bitmap_shader {
    use super::*;

    #[test]
    fn sets_the_shader_as_the_state_default() {
        let mut state = create_wgpu_render_state_for_test(None);
        let fake_shader = create_fake_shader(&mut state, "Add");
        register_wgpu_bitmap_shader(&mut state, fake_shader.clone());
        let registered = get_wgpu_render_state_runtime(&state)
            .default_bitmap_shader
            .clone()
            .expect("a default shader");
        assert_eq!(registered.pipeline, fake_shader.pipeline);
    }

    #[test]
    fn replaces_a_previously_registered_shader() {
        let mut state = create_wgpu_render_state_for_test(None);
        let shader1 = create_fake_shader(&mut state, "Add");
        let shader2 = create_fake_shader(&mut state, "Screen");
        assert_ne!(shader1.pipeline, shader2.pipeline);
        register_wgpu_bitmap_shader(&mut state, shader1);
        register_wgpu_bitmap_shader(&mut state, shader2.clone());
        let registered = get_wgpu_render_state_runtime(&state)
            .default_bitmap_shader
            .clone()
            .expect("a default shader");
        assert_eq!(registered.pipeline, shader2.pipeline);
    }
}
