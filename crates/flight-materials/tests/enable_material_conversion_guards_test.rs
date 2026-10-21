use std::sync::{Arc, RwLock};
use flight_log::create_log_state;
use flight_materials::enable_material_conversion_guards::*;
use flight_materials::pbr_materials::set_material_conversion_guard;

mod disable_material_conversion_guards {
    use super::*;

    #[test]
    fn clears_the_guard() {
        let log_state = Arc::new(RwLock::new(create_log_state()));
        enable_material_conversion_guards(log_state, 0.0);
        disable_material_conversion_guards();
    }
}

mod enable_material_conversion_guards {
    use super::*;

    #[test]
    fn installs_a_guard() {
        let log_state = Arc::new(RwLock::new(create_log_state()));
        enable_material_conversion_guards(log_state, 0.0);
        set_material_conversion_guard(None);
    }
}
