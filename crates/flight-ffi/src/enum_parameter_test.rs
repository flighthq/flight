use crate::*;

mod flight_create_path {
    use super::*;

    #[test]
    fn reads_minus_one_as_none_and_each_discriminant_as_its_variant() {
        for (winding, expected) in [
            (-1, flight_sdk::PathWinding::NonZero),
            (0, flight_sdk::PathWinding::NonZero),
            (1, flight_sdk::PathWinding::EvenOdd),
        ] {
            let path = unsafe { flight_create_path(winding) };
            assert_eq!(unsafe { &*path }.winding, expected);
            unsafe { flight_free_path(path) };
        }
    }

    #[test]
    fn rejects_every_value_that_is_not_minus_one_or_a_discriminant() {
        for (probe, value) in [
            ("flight_create_path::just_above_range_probe", "2"),
            ("flight_create_path::negative_probe", "-2"),
            ("flight_create_path::large_probe", "2147483647"),
        ] {
            let stderr = run_aborting_probe(probe);
            let message = format!("winding must be -1 or a PathWinding discriminant, got {value}");
            assert!(stderr.contains(&message), "{stderr}");
        }
    }

    #[test]
    #[ignore = "aborts by design; run by rejects_every_value_that_is_not_minus_one_or_a_discriminant"]
    fn just_above_range_probe() {
        unsafe { flight_create_path(2) };
    }

    #[test]
    #[ignore = "aborts by design; run by rejects_every_value_that_is_not_minus_one_or_a_discriminant"]
    fn negative_probe() {
        unsafe { flight_create_path(-2) };
    }

    #[test]
    #[ignore = "aborts by design; run by rejects_every_value_that_is_not_minus_one_or_a_discriminant"]
    fn large_probe() {
        unsafe { flight_create_path(i32::MAX) };
    }
}

mod flight_trigger_haptic_notification {
    use super::*;

    #[test]
    fn rejects_values_outside_the_declared_variants() {
        for (probe, value) in [
            (
                "flight_trigger_haptic_notification::just_above_range_probe",
                "3",
            ),
            (
                "flight_trigger_haptic_notification::large_probe",
                "4294967295",
            ),
        ] {
            let stderr = run_aborting_probe(probe);
            let message =
                format!("type must be a HapticNotificationType discriminant, got {value}");
            assert!(stderr.contains(&message), "{stderr}");
        }
    }

    #[test]
    #[ignore = "aborts by design; run by rejects_values_outside_the_declared_variants"]
    fn just_above_range_probe() {
        unsafe { flight_trigger_haptic_notification(std::ptr::null(), 3) };
    }

    #[test]
    #[ignore = "aborts by design; run by rejects_values_outside_the_declared_variants"]
    fn large_probe() {
        unsafe { flight_trigger_haptic_notification(std::ptr::null(), u32::MAX) };
    }
}

// Runs one ignored probe in a child process and returns its stderr; an invalid enum aborts by design.
fn run_aborting_probe(probe: &str) -> String {
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            &format!("enum_parameter_test::{probe}"),
            "--ignored",
            "--test-threads=1",
            "--nocapture",
        ])
        .output()
        .unwrap();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    assert!(
        !output.status.success(),
        "{probe} must not return:\n{stderr}"
    );
    return stderr;
}
