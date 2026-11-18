use std::ffi::CString;
use std::sync::Arc;

use crate::*;

mod flight_create_bitmap_region {
    use super::*;

    #[test]
    fn consumes_the_owned_bitmap_box() {
        let bitmap = unsafe { flight_create_bitmap(2, 2, 0x11223344) };
        let region = unsafe { flight_create_bitmap_region(bitmap, 0, 0, 1, 1) };
        assert!(!region.is_null());
        // The bitmap now lives in the region; freeing the region releases it exactly once.
        unsafe { flight_free_bitmap_region(region) };
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

mod flight_register_command_property_access {
    use super::*;

    // An accessor whose closures each hold one clone of `counter`.
    fn box_accessor(counter: &Arc<()>) -> *mut flight_sdk::CommandPropertyAccessor {
        let read_counter = counter.clone();
        let write_counter = counter.clone();
        let accessor = flight_sdk::CommandPropertyAccessor {
            read: Arc::new(move |_| {
                let _ = &read_counter;
                None
            }),
            write: Arc::new(move |_, _| {
                let _ = &write_counter;
            }),
        };
        return Box::into_raw(Box::new(accessor));
    }

    #[test]
    fn moves_each_accessor_into_the_registry_without_a_second_drop() {
        let counter = Arc::new(());
        let access = unsafe { flight_create_command_property_access() };
        let kind = CString::new("sprite").unwrap();
        let property = CString::new("alpha").unwrap();
        unsafe {
            flight_register_command_property_access(
                access,
                kind.as_ptr(),
                property.as_ptr(),
                box_accessor(&counter),
            )
        };
        // The registry owns the accessor's two closures; the box itself is gone.
        assert_eq!(Arc::strong_count(&counter), 3);
        // Replacing the entry drops the first accessor exactly once.
        unsafe {
            flight_register_command_property_access(
                access,
                kind.as_ptr(),
                property.as_ptr(),
                box_accessor(&counter),
            )
        };
        assert_eq!(Arc::strong_count(&counter), 3);
        unsafe { flight_free_command_property_access_ref(access) };
        assert_eq!(Arc::strong_count(&counter), 1);
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
