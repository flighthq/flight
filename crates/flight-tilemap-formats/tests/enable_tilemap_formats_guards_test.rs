use std::sync::{Arc, Mutex, RwLock};

use flight_tilemap_formats::*;

mod disable_tilemap_formats_guards {
    use super::*;

    #[test]
    fn uninstalls_the_guard_restoring_the_silent_parse() {
        let guard_state = create_tiled_guard_state();
        let log_state = Arc::new(RwLock::new(flight_log::create_log_state()));
        enable_tilemap_formats_guards(&guard_state, &log_state, 0.0);
        disable_tilemap_formats_guards(&guard_state);
        let result = decode_tiled_base64_layer(
            "AQAAAAIAAAA=",
            Some(TiledCompression::Zlib),
            None,
            Some(&guard_state),
        );
        assert!(result.is_none());
    }
}

mod enable_tilemap_formats_guards {
    use super::*;

    #[test]
    fn accepts_log_state() {
        let guard_state = create_tiled_guard_state();
        let log_state = Arc::new(RwLock::new(flight_log::create_log_state()));
        enable_tilemap_formats_guards(&guard_state, &log_state, 0.0);
        disable_tilemap_formats_guards(&guard_state);
    }

    #[test]
    fn invokes_guard_on_compressed_without_inflate() {
        let guard_state = create_tiled_guard_state();
        let called = Arc::new(Mutex::new(false));
        let called_clone = called.clone();
        set_tiled_layer_data_guard(
            &guard_state,
            Some(Arc::new(move |_reason, _compression| {
                *called_clone.lock().unwrap() = true;
            })),
        );
        let result = decode_tiled_base64_layer(
            "AQAAAAIAAAA=",
            Some(TiledCompression::Zlib),
            None,
            Some(&guard_state),
        );
        assert!(result.is_none());
        assert!(*called.lock().unwrap());
    }

    #[test]
    fn replace_guard_then_decode_invokes_only_replacement() {
        let guard_state = create_tiled_guard_state();
        let a_called = Arc::new(Mutex::new(false));
        let b_called = Arc::new(Mutex::new(false));
        let a_clone = a_called.clone();
        let b_clone = b_called.clone();
        set_tiled_layer_data_guard(
            &guard_state,
            Some(Arc::new(move |_r, _c| {
                *a_clone.lock().unwrap() = true;
            })),
        );
        set_tiled_layer_data_guard(
            &guard_state,
            Some(Arc::new(move |_r, _c| {
                *b_clone.lock().unwrap() = true;
            })),
        );
        decode_tiled_base64_layer(
            "AQAAAAIAAAA=",
            Some(TiledCompression::Zlib),
            None,
            Some(&guard_state),
        );
        assert!(!*a_called.lock().unwrap());
        assert!(*b_called.lock().unwrap());
    }

    #[test]
    fn disable_then_set_none_and_decode_invokes_neither() {
        let guard_state = create_tiled_guard_state();
        let called = Arc::new(Mutex::new(false));
        let called_clone = called.clone();
        set_tiled_layer_data_guard(
            &guard_state,
            Some(Arc::new(move |_r, _c| {
                *called_clone.lock().unwrap() = true;
            })),
        );
        set_tiled_layer_data_guard(&guard_state, None);
        decode_tiled_base64_layer(
            "AQAAAAIAAAA=",
            Some(TiledCompression::Zlib),
            None,
            Some(&guard_state),
        );
        assert!(!*called.lock().unwrap());
    }

    #[test]
    fn reenable_resumes_guard() {
        let guard_state = create_tiled_guard_state();
        let called = Arc::new(Mutex::new(0u32));
        let called_clone = called.clone();
        let guard = Arc::new(move |_r: TiledLayerDataFailure, _c: TiledCompression| {
            *called_clone.lock().unwrap() += 1;
        });
        set_tiled_layer_data_guard(&guard_state, Some(guard.clone()));
        decode_tiled_base64_layer(
            "AQAAAAIAAAA=",
            Some(TiledCompression::Zlib),
            None,
            Some(&guard_state),
        );
        assert_eq!(*called.lock().unwrap(), 1);
        disable_tilemap_formats_guards(&guard_state);
        decode_tiled_base64_layer(
            "AQAAAAIAAAA=",
            Some(TiledCompression::Zlib),
            None,
            Some(&guard_state),
        );
        assert_eq!(*called.lock().unwrap(), 1);
        set_tiled_layer_data_guard(&guard_state, Some(guard));
        decode_tiled_base64_layer(
            "AQAAAAIAAAA=",
            Some(TiledCompression::Zlib),
            None,
            Some(&guard_state),
        );
        assert_eq!(*called.lock().unwrap(), 2);
    }

    #[test]
    fn two_independent_contexts_affected_only_by_own_guard() {
        let state_a = create_tiled_guard_state();
        let state_b = create_tiled_guard_state();
        let a_called = Arc::new(Mutex::new(false));
        let b_called = Arc::new(Mutex::new(false));
        let a_clone = a_called.clone();
        let b_clone = b_called.clone();
        set_tiled_layer_data_guard(
            &state_a,
            Some(Arc::new(move |_r, _c| {
                *a_clone.lock().unwrap() = true;
            })),
        );
        set_tiled_layer_data_guard(
            &state_b,
            Some(Arc::new(move |_r, _c| {
                *b_clone.lock().unwrap() = true;
            })),
        );
        disable_tilemap_formats_guards(&state_a);
        decode_tiled_base64_layer(
            "AQAAAAIAAAA=",
            Some(TiledCompression::Zlib),
            None,
            Some(&state_a),
        );
        decode_tiled_base64_layer(
            "AQAAAAIAAAA=",
            Some(TiledCompression::Zlib),
            None,
            Some(&state_b),
        );
        assert!(!*a_called.lock().unwrap());
        assert!(*b_called.lock().unwrap());
    }

    #[test]
    fn silent_without_guard_the_production_default() {
        let result =
            decode_tiled_base64_layer("AQAAAAIAAAA=", Some(TiledCompression::Zlib), None, None);
        assert!(result.is_none());
    }
}
