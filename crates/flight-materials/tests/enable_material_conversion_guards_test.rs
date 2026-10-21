use flight_log::create_log_state;
use flight_materials::enable_material_conversion_guards::*;
use flight_materials::pbr_materials::report_material_conversion_drop;
use flight_materials::*;
use std::sync::{Arc, RwLock};

mod disable_material_conversion_guards {
    use super::*;

    #[test]
    fn is_idempotent_noop() {
        disable_material_conversion_guards();
        disable_material_conversion_guards();
    }
}

mod enable_material_conversion_guards {
    use super::*;

    #[test]
    fn creates_a_context_that_logs_on_report() {
        let log_state = Arc::new(RwLock::new(create_log_state()));
        let ctx = enable_material_conversion_guards(log_state, Arc::new(|| 42.0));
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["normalMap".to_string()],
            reason: Some(MaterialConversionDropReason::UnsupportedByTargetModel),
        };
        report_material_conversion_drop(Some(&ctx), &explanation, "test_conversion");
    }

    #[test]
    fn samples_clock_at_operation_time() {
        use std::sync::atomic::{AtomicU64, Ordering};
        let log_state = Arc::new(RwLock::new(create_log_state()));
        let time = Arc::new(AtomicU64::new(100));
        let time_clone = time.clone();
        let clock: ClockProvider = Arc::new(move || {
            return f64::from_bits(time_clone.load(Ordering::SeqCst));
        });
        let ctx = enable_material_conversion_guards(log_state, clock);
        time.store(200.0_f64.to_bits(), Ordering::SeqCst);
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["map".to_string()],
            reason: None,
        };
        report_material_conversion_drop(Some(&ctx), &explanation, "test_clock");
    }

    #[test]
    fn independent_contexts_have_separate_log_once_state() {
        let log_state_a = Arc::new(RwLock::new(create_log_state()));
        let log_state_b = Arc::new(RwLock::new(create_log_state()));
        let ctx_a = enable_material_conversion_guards(log_state_a, Arc::new(|| 0.0));
        let ctx_b = enable_material_conversion_guards(log_state_b, Arc::new(|| 0.0));
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["map".to_string()],
            reason: None,
        };
        report_material_conversion_drop(Some(&ctx_a), &explanation, "same_key");
        report_material_conversion_drop(Some(&ctx_b), &explanation, "same_key");
    }
}
