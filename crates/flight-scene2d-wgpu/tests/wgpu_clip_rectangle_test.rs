use flight_geometry::{create_matrix, create_rectangle};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::*;

use crate::support::*;

fn scissors(
    records: &std::sync::Arc<std::sync::Mutex<Vec<WgpuCommandRecord>>>,
) -> Vec<WgpuScissorRectRecord> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::SetScissorRect(rect) => Some(*rect),
            _ => None,
        })
        .collect();
}

mod pop_wgpu_clip_rectangle {
    use super::*;

    #[test]
    fn pops_the_scissor_rect_from_the_stack() {
        let mut state = create_test_state_in_pass();
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        push_wgpu_clip_rectangle(
            &mut state,
            &create_rectangle(0.0, 0.0, 50.0, 50.0),
            &create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
        );
        pop_wgpu_clip_rectangle(&mut state);

        let runtime = get_wgpu_render_state_runtime(&state);
        assert!(runtime.scissor_stack.is_empty());
        assert!(runtime.current_scissor_rect.is_none());
        // The pop restores the full-viewport scissor.
        assert_eq!(
            scissors(&records).last().copied(),
            Some(WgpuScissorRectRecord {
                height: 600,
                width: 800,
                x: 0,
                y: 0,
            })
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn is_safe_to_pop_from_an_empty_stack() {
        let mut state = create_test_state_in_pass();
        pop_wgpu_clip_rectangle(&mut state);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .scissor_stack
                .is_empty()
        );
        submit_wgpu_frame(&mut state);
    }
}

mod push_wgpu_clip_rectangle {
    use super::*;

    #[test]
    fn pushes_a_scissor_rect_onto_the_stack() {
        let mut state = create_test_state_in_pass();
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        push_wgpu_clip_rectangle(
            &mut state,
            &create_rectangle(10.0, 10.0, 100.0, 100.0),
            &create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
        );

        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(runtime.scissor_stack.len(), 1);
        assert!(runtime.current_scissor_rect.is_some());
        assert_eq!(
            scissors(&records).last().copied(),
            Some(WgpuScissorRectRecord {
                height: 100,
                width: 100,
                x: 10,
                y: 10,
            })
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn intersects_a_nested_clip_with_its_parent() {
        let mut state = create_test_state_in_pass();
        let identity = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        push_wgpu_clip_rectangle(
            &mut state,
            &create_rectangle(10.0, 10.0, 100.0, 100.0),
            &identity,
        );
        push_wgpu_clip_rectangle(
            &mut state,
            &create_rectangle(50.0, 60.0, 100.0, 100.0),
            &identity,
        );
        let current = get_wgpu_render_state_runtime(&state)
            .current_scissor_rect
            .unwrap();
        assert_eq!(
            (current.x, current.y, current.width, current.height),
            (50.0, 60.0, 60.0, 50.0)
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn uses_a_degenerate_scissor_for_a_clip_entirely_outside_the_viewport() {
        let mut state = create_test_state_in_pass();
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        push_wgpu_clip_rectangle(
            &mut state,
            &create_rectangle(-500.0, -500.0, 10.0, 10.0),
            &create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
        );
        assert_eq!(
            scissors(&records).last().copied(),
            Some(WgpuScissorRectRecord {
                height: 1,
                width: 1,
                x: 0,
                y: 0,
            })
        );
        submit_wgpu_frame(&mut state);
    }
}
