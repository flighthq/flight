use std::sync::Arc;

use super::*;

mod create_video_channel_runtime_state {
    use super::*;

    #[test]
    fn creates_independent_caller_owned_registries() {
        let a = create_video_channel_runtime_state();
        let b = create_video_channel_runtime_state();
        assert!(!Arc::ptr_eq(&a, &b));
    }
}
