use std::sync::{Arc, Mutex};

use flight_skeleton2d::contract::*;

mod report_skeleton_2d_coerced_interpolation {
    use super::*;

    #[test]
    fn costs_a_null_check_when_no_guard_is_installed() {
        let state = Skeleton2DGuardState {
            coerced_interpolation: None,
            deform_length: None,
        };
        report_skeleton_2d_coerced_interpolation(&state, "Attachment", "Linear", "Step");
    }

    #[test]
    fn hands_the_installed_guard_what_was_stated_and_applied() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let mut state = Skeleton2DGuardState {
            coerced_interpolation: Some(Arc::new(
                move |report: &Skeleton2DCoercedInterpolation| {
                    sink.lock().unwrap().push(report.clone());
                },
            )),
            deform_length: None,
        };
        report_skeleton_2d_coerced_interpolation(&state, "Attachment", "Linear", "Step");
        assert_eq!(seen.lock().unwrap()[0].stated, "Linear");
        assert_eq!(seen.lock().unwrap()[0].applied, "Step");
        set_skeleton_2d_coerced_interpolation_guard(&mut state, None);
        report_skeleton_2d_coerced_interpolation(&state, "Attachment", "Linear", "Step");
        assert_eq!(seen.lock().unwrap().len(), 1);
    }
}

mod report_skeleton_2d_deform_length_mismatch {
    use super::*;

    #[test]
    fn hands_the_installed_guard_both_lengths() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let mut state = Skeleton2DGuardState {
            coerced_interpolation: None,
            deform_length: Some(Arc::new(move |report: &Skeleton2DDeformLengthMismatch| {
                sink.lock()
                    .unwrap()
                    .push((report.offsets, report.addressed));
            })),
        };
        report_skeleton_2d_deform_length_mismatch(&state, "MeshAttachment2D", 2, 4);
        assert_eq!(*seen.lock().unwrap(), vec![(2, 4)]);
        set_skeleton_2d_deform_length_guard(&mut state, None);
        report_skeleton_2d_deform_length_mismatch(&state, "MeshAttachment2D", 2, 4);
        assert_eq!(seen.lock().unwrap().len(), 1);
    }
}

mod set_skeleton_2d_coerced_interpolation_guard {
    use super::*;

    #[test]
    fn installs_and_clears_the_guard() {
        let mut state = Skeleton2DGuardState {
            coerced_interpolation: None,
            deform_length: None,
        };
        set_skeleton_2d_coerced_interpolation_guard(&mut state, Some(Arc::new(|_report| {})));
        assert!(state.coerced_interpolation.is_some());
        set_skeleton_2d_coerced_interpolation_guard(&mut state, None);
        assert!(state.coerced_interpolation.is_none());
    }
}

mod set_skeleton_2d_deform_length_guard {
    use super::*;

    #[test]
    fn installs_and_clears_the_guard() {
        let mut state = Skeleton2DGuardState {
            coerced_interpolation: None,
            deform_length: None,
        };
        set_skeleton_2d_deform_length_guard(&mut state, Some(Arc::new(|_report| {})));
        assert!(state.deform_length.is_some());
        set_skeleton_2d_deform_length_guard(&mut state, None);
        assert!(state.deform_length.is_none());
    }
}

mod source_guard_records {
    use super::*;

    #[test]
    fn coerced_report_carries_subject_stated_and_applied() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let mut state = Skeleton2DGuardState {
            coerced_interpolation: Some(Arc::new(
                move |report: &Skeleton2DCoercedInterpolation| {
                    sink.lock().unwrap().push(report.clone());
                },
            )),
            deform_length: None,
        };
        report_skeleton_2d_coerced_interpolation(&state, "DrawOrder", "Cubic", "Step");
        let seen = seen.lock().unwrap();
        assert_eq!(seen[0].subject, "DrawOrder");
        assert_eq!(seen[0].stated, "Cubic");
        assert_eq!(seen[0].applied, "Step");
        set_skeleton_2d_coerced_interpolation_guard(&mut state, None);
    }

    #[test]
    fn deform_report_carries_subject_and_both_lengths() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let mut state = Skeleton2DGuardState {
            coerced_interpolation: None,
            deform_length: Some(Arc::new(move |report: &Skeleton2DDeformLengthMismatch| {
                sink.lock().unwrap().push(report.clone());
            })),
        };
        report_skeleton_2d_deform_length_mismatch(&state, "torso", 6, 8);
        let seen = seen.lock().unwrap();
        assert_eq!(seen[0].subject, "torso");
        assert_eq!(seen[0].offsets, 6);
        assert_eq!(seen[0].addressed, 8);
        set_skeleton_2d_deform_length_guard(&mut state, None);
    }

    #[test]
    fn setting_a_guard_replaces_rather_than_accumulates() {
        let first = Arc::new(Mutex::new(0u32));
        let second = Arc::new(Mutex::new(0u32));
        let mut state = Skeleton2DGuardState {
            coerced_interpolation: None,
            deform_length: None,
        };
        let first_sink = first.clone();
        set_skeleton_2d_coerced_interpolation_guard(
            &mut state,
            Some(Arc::new(move |_report: &Skeleton2DCoercedInterpolation| {
                *first_sink.lock().unwrap() += 1;
            })),
        );
        let second_sink = second.clone();
        set_skeleton_2d_coerced_interpolation_guard(
            &mut state,
            Some(Arc::new(move |_report: &Skeleton2DCoercedInterpolation| {
                *second_sink.lock().unwrap() += 1;
            })),
        );
        report_skeleton_2d_coerced_interpolation(&state, "Attachment", "Linear", "Step");
        assert_eq!(*first.lock().unwrap(), 0);
        assert_eq!(*second.lock().unwrap(), 1);
    }
}
