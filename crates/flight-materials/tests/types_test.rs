use flight_materials::*;
use flight_materials::pbr_materials::report_material_conversion_drop;
use std::sync::{Arc, Mutex};

mod create_material_conversion_context {
    use super::*;

    #[test]
    fn wraps_guard_and_invokes_on_report() {
        let called = Arc::new(Mutex::new(false));
        let c = called.clone();
        let guard: MaterialConversionGuard = Box::new(move |_, _| {
            *c.lock().unwrap() = true;
        });
        let ctx = create_material_conversion_context(guard);
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["map".to_string()],
            reason: None,
        };
        report_material_conversion_drop(Some(&ctx), &explanation, "test");
        assert!(*called.lock().unwrap());
    }
}

mod material_alpha_mode {
    use super::*;

    #[test]
    fn defaults_to_opaque() {
        assert_eq!(MaterialAlphaMode::default(), MaterialAlphaMode::Opaque);
    }
}
