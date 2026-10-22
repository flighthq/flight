use flight_scene2d_wgpu::contract::*;

use crate::support::*;

mod get_wgpu_render_stats {
    use super::*;

    #[test]
    fn returns_zeroed_stats_for_a_fresh_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let stats = get_wgpu_render_stats(&mut state);
        assert_eq!(stats.draw_call_count, 0);
        assert_eq!(stats.instance_count, 0);
        assert_eq!(stats.batch_flush_count, 0);
        assert_eq!(stats.texture_upload_count, 0);
    }

    // The source returns one live object per state; Rust returns snapshots of the one per-state
    // record, so repeated reads agree.
    #[test]
    fn returns_the_same_stats_on_repeated_calls() {
        let mut state = create_wgpu_render_state_for_test(None);
        let a = get_wgpu_render_stats(&mut state);
        let b = get_wgpu_render_stats(&mut state);
        assert_eq!(a, b);
    }
}

mod record_wgpu_batch_flush {
    use super::*;

    #[test]
    fn increments_draw_call_instance_and_batch_flush_counts() {
        let mut state = create_wgpu_render_state_for_test(None);
        reset_wgpu_render_stats(&mut state);
        record_wgpu_batch_flush(&mut state, 10);
        let stats = get_wgpu_render_stats(&mut state);
        assert_eq!(stats.draw_call_count, 1);
        assert_eq!(stats.instance_count, 10);
        assert_eq!(stats.batch_flush_count, 1);
    }

    #[test]
    fn accumulates_across_multiple_flushes() {
        let mut state = create_wgpu_render_state_for_test(None);
        reset_wgpu_render_stats(&mut state);
        record_wgpu_batch_flush(&mut state, 5);
        record_wgpu_batch_flush(&mut state, 3);
        let stats = get_wgpu_render_stats(&mut state);
        assert_eq!(stats.draw_call_count, 2);
        assert_eq!(stats.instance_count, 8);
        assert_eq!(stats.batch_flush_count, 2);
    }

    #[test]
    fn is_a_no_op_when_stats_have_not_been_initialized() {
        let mut state = create_wgpu_render_state_for_test(None);
        record_wgpu_batch_flush(&mut state, 10);
        assert_eq!(get_wgpu_render_stats(&mut state).batch_flush_count, 0);
    }
}

mod record_wgpu_texture_upload {
    use super::*;

    #[test]
    fn increments_texture_upload_count() {
        let mut state = create_wgpu_render_state_for_test(None);
        reset_wgpu_render_stats(&mut state);
        record_wgpu_texture_upload(&mut state);
        record_wgpu_texture_upload(&mut state);
        assert_eq!(get_wgpu_render_stats(&mut state).texture_upload_count, 2);
    }

    #[test]
    fn is_a_no_op_when_stats_have_not_been_initialized() {
        let mut state = create_wgpu_render_state_for_test(None);
        record_wgpu_texture_upload(&mut state);
        assert_eq!(get_wgpu_render_stats(&mut state).texture_upload_count, 0);
    }
}

mod reset_wgpu_render_stats {
    use super::*;

    #[test]
    fn zeroes_all_counts() {
        let mut state = create_wgpu_render_state_for_test(None);
        reset_wgpu_render_stats(&mut state);
        record_wgpu_batch_flush(&mut state, 100);
        record_wgpu_texture_upload(&mut state);
        reset_wgpu_render_stats(&mut state);
        let stats = get_wgpu_render_stats(&mut state);
        assert_eq!(stats.draw_call_count, 0);
        assert_eq!(stats.instance_count, 0);
        assert_eq!(stats.batch_flush_count, 0);
        assert_eq!(stats.texture_upload_count, 0);
    }
}
