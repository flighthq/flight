use std::sync::{Arc, RwLock};

use crate::*;

mod flight_create_animation_player {
    use super::*;

    // A canonical carrier by value is cloned from the caller's handle: the caller keeps its handle
    // and the SDK owns the clone.
    #[test]
    fn clones_the_clip_from_the_callers_handle_and_drops_the_clone_with_the_player() {
        let track = Arc::new(RwLock::new(flight_sdk::create_animation_track()));
        let channel = flight_sdk::create_animation_channel(&track, None);
        let clip = flight_sdk::create_animation_clip(vec![channel], None, &[]);
        assert_eq!(Arc::strong_count(&track), 2);

        let handle = Box::into_raw(Box::new(Arc::new(RwLock::new(clip))));
        let player = unsafe { flight_create_animation_player(handle.cast()) };
        assert!(!player.is_null());
        assert_eq!(Arc::strong_count(&track), 3);

        unsafe { flight_free_animation_clip_ref(handle) };
        assert_eq!(Arc::strong_count(&track), 2);
        unsafe { flight_free_animation_player(player) };
        assert_eq!(Arc::strong_count(&track), 1);
    }
}

mod flight_create_bitmap_region {
    use super::*;

    #[test]
    fn shares_the_bitmap_ref_without_consuming_the_caller_handle() {
        let shared = unsafe { flight_share_bitmap(flight_create_bitmap(2, 2, 0x11223344)) }
            as *mut flight_sdk::Ref<flight_sdk::Bitmap>;
        let weak = Arc::downgrade(unsafe { &*shared });
        let region = unsafe { flight_create_bitmap_region(shared as *const _, 0, 0, 1, 1) };
        assert!(!region.is_null());
        assert!(Arc::ptr_eq(unsafe { &(*region).bitmap }, unsafe {
            &*shared
        }));
        assert_eq!(weak.strong_count(), 2);

        unsafe { flight_free_bitmap_region(region) };
        // The caller's handle is still live and still owns the pixels.
        assert_eq!(weak.strong_count(), 1);
        assert_eq!(unsafe { (*shared).read().unwrap().data[0] }, 0x11);

        unsafe { flight_free_bitmap_ref(shared) };
        assert!(weak.upgrade().is_none());
    }
}

mod flight_ease_invert {
    use super::*;

    #[test]
    fn clones_the_caller_easing_handle() {
        let ease: flight_sdk::EasingFunction = Arc::new(|t| t * t);
        let inverted = unsafe { flight_ease_invert(&ease) };
        // The wrapper took its own clone; the caller's handle stays valid and owned.
        assert!(Arc::strong_count(&ease) >= 2);
        assert_eq!(ease(0.5), 0.25);
        assert_eq!(
            unsafe { (*inverted)(0.25) },
            flight_sdk::ease_invert(ease.clone())(0.25)
        );
        unsafe { flight_free_easing_function(inverted) };
        assert_eq!(Arc::strong_count(&ease), 1);
    }
}

mod flight_get_bitmap_pixel_channel {
    use super::*;

    #[test]
    fn copies_the_channel_value_without_consuming_the_caller_value() {
        let bitmap = unsafe { flight_create_bitmap(1, 1, 0x11223344) };
        let channel = flight_sdk::ImageChannel::Green;
        assert_eq!(
            unsafe { flight_get_bitmap_pixel_channel(bitmap, 0, 0, &channel) },
            0x22
        );
        assert_eq!(channel, flight_sdk::ImageChannel::Green);
        unsafe { flight_free_bitmap_ref(bitmap.cast()) };
    }
}

mod flight_register_particle_format {
    use super::*;

    #[test]
    fn clones_the_borrowed_codec_and_retains_the_callers_value() {
        let descriptor = flight_sdk::get_libgdx_particle_format();
        let codec = descriptor.codec.as_ref();
        let mut registry = flight_sdk::create_particle_format_registry();
        let kind = std::ffi::CString::new("borrowed-clone").unwrap();
        let detect_count = Arc::strong_count(&codec.detect);

        unsafe { flight_register_particle_format(&mut registry, kind.as_ptr(), codec) };

        assert_eq!(Arc::strong_count(&codec.detect), detect_count + 1);
        assert!((codec.detect)("Particle Effect\n- Duration -"));
        let registered = flight_sdk::get_particle_format_codec(&registry, "borrowed-clone")
            .expect("the cloned codec must be registered");
        assert!((registered.detect)("Particle Effect\n- Duration -"));
        drop(registry);
        assert_eq!(Arc::strong_count(&codec.detect), detect_count);
    }
}

mod flight_release_vector2 {
    use super::*;

    #[test]
    fn consumes_the_owned_vector_box() {
        let vector = unsafe { flight_create_vector2(1.0, 2.0) };
        unsafe { flight_release_vector2(vector) };
        let reused = unsafe { flight_acquire_vector2() };
        assert!(!reused.is_null());
        unsafe { flight_free_vector2(reused) };
    }

    #[test]
    fn rejects_null_as_a_precondition_violation() {
        // A NULL transfer is an assert inside an `extern "C"` wrapper, which aborts the process, so
        // the check runs this module's probe in a child process.
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "by_value_ownership_test::flight_release_vector2::null_probe",
                "--ignored",
                "--test-threads=1",
                "--nocapture",
            ])
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(!output.status.success(), "a NULL transfer must not return");
        assert!(
            stderr.contains("v must be an owned Vector2 handle"),
            "{stderr}"
        );
    }

    #[test]
    #[ignore = "aborts by design; run only by rejects_null_as_a_precondition_violation"]
    fn null_probe() {
        unsafe { flight_release_vector2(std::ptr::null_mut()) };
    }
}

mod flight_share_bitmap {
    use super::*;

    // Bitmap is a canonical carrier: sharing reads the caller's handle and returns a second
    // handle holding a clone; the caller's handle stays valid and is released separately.
    #[test]
    fn shares_a_clone_and_leaves_the_callers_handle_valid() {
        let bitmap = unsafe { flight_create_bitmap(3, 1, 0xaabbccdd) };
        let shared =
            unsafe { flight_share_bitmap(bitmap) } as *mut flight_sdk::Ref<flight_sdk::Bitmap>;
        assert!(!shared.is_null());
        let original = bitmap as *mut flight_sdk::Ref<flight_sdk::Bitmap>;
        assert!(!Arc::ptr_eq(unsafe { &*shared }, unsafe { &*original }));
        let weak = Arc::downgrade(unsafe { &*shared });
        assert_eq!(weak.strong_count(), 1);
        {
            let pixels = unsafe { (*shared).read().unwrap() };
            assert_eq!((pixels.width, pixels.height), (3, 1));
            assert_eq!(&pixels.data[0..4], &[0xaa, 0xbb, 0xcc, 0xdd]);
        }
        unsafe { flight_free_bitmap_ref(original) };
        unsafe { flight_free_bitmap_ref(shared) };
        assert!(weak.upgrade().is_none());
    }

    #[test]
    fn refuses_null_with_null() {
        assert!(unsafe { flight_share_bitmap(std::ptr::null_mut()) }.is_null());
    }
}
