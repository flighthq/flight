use flight_geometry::create_matrix;
use flight_path::PathWinding;
use flight_render_wgpu::*;
use flight_scene2d_wgpu::*;

use crate::support::*;

fn square() -> Vec<Vec<f64>> {
    return vec![vec![0.0, 0.0, 50.0, 0.0, 50.0, 50.0, 0.0, 50.0]];
}

fn identity() -> flight_geometry::Matrix {
    return create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
}

mod pop_wgpu_clip_contours {
    use super::*;

    #[test]
    fn decrements_the_stencil_depth_and_pops_the_contour_stack() {
        let mut state = create_test_state_in_pass();
        push_wgpu_clip_contours(&mut state, &square(), PathWinding::NonZero, &identity());
        assert_eq!(get_wgpu_render_state_runtime(&state).current_mask_depth, 1);
        assert_eq!(
            get_wgpu_render_state_runtime(&state)
                .clip_contour_stack
                .len(),
            1
        );

        pop_wgpu_clip_contours(&mut state);

        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(runtime.current_mask_depth, 0);
        assert!(runtime.clip_contour_stack.is_empty());
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn retires_the_stored_geometry_until_the_frame_submits() {
        let mut state = create_test_state_in_pass();
        let native = get_wgpu_render_state_native_device(&state);
        push_wgpu_clip_contours(&mut state, &square(), PathWinding::NonZero, &identity());
        let entry = get_wgpu_render_state_runtime(&state).clip_contour_stack[0].clone();

        pop_wgpu_clip_contours(&mut state);

        let retired = get_wgpu_render_state_runtime(&state)
            .retired_buffers
            .clone()
            .unwrap();
        assert!(retired.contains(&entry.vertex_buffer));
        assert!(retired.contains(&entry.uniform_buffer));
        assert!(!is_test_buffer_destroyed(&native, &entry.uniform_buffer));
        submit_wgpu_frame(&mut state);
        assert!(is_test_buffer_destroyed(&native, &entry.uniform_buffer));
    }
}

mod push_wgpu_clip_contours {
    use super::*;

    #[test]
    fn increments_the_stencil_depth_and_records_the_clip_on_the_stack() {
        let mut state = create_test_state_in_pass();
        push_wgpu_clip_contours(&mut state, &square(), PathWinding::NonZero, &identity());
        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(runtime.current_mask_depth, 1);
        assert_eq!(runtime.clip_contour_stack.len(), 1);
        // One quad fan -> two triangles -> six vertices.
        assert_eq!(runtime.clip_contour_stack[0].vertex_count, 6);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn draws_the_contour_with_the_parent_depth_as_the_stencil_reference() {
        let mut state = create_test_state_in_pass();
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        push_wgpu_clip_contours(&mut state, &square(), PathWinding::NonZero, &identity());

        assert_eq!(
            get_wgpu_render_state_runtime(&state).clip_contour_stack[0].depth,
            0
        );
        let pipelines = recorded_pipelines(&records);
        assert_eq!(pipelines.len(), 2);
        let write = pipelines[0].depth_stencil.clone().unwrap().stencil;
        let erase = pipelines[1].depth_stencil.clone().unwrap().stencil;
        assert_eq!(write.front.pass_op, wgpu::StencilOperation::IncrementClamp);
        assert_eq!(erase.front.pass_op, wgpu::StencilOperation::DecrementClamp);
        assert_eq!(write.front.compare, wgpu::CompareFunction::Equal);
        assert_eq!(
            pipelines[0].targets[0].as_ref().unwrap().write_mask,
            wgpu::ColorWrites::empty()
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn nests_with_a_second_clip_incrementing_from_depth_1() {
        let mut state = create_test_state_in_pass();
        push_wgpu_clip_contours(&mut state, &square(), PathWinding::NonZero, &identity());
        push_wgpu_clip_contours(&mut state, &square(), PathWinding::NonZero, &identity());
        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(runtime.current_mask_depth, 2);
        assert_eq!(runtime.clip_contour_stack[1].depth, 1);
        submit_wgpu_frame(&mut state);
    }
}
