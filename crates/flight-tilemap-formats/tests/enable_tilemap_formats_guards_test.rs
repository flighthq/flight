use std::sync::{Arc, RwLock};

use flight_tilemap_formats::*;

mod disable_tilemap_formats_guards {
    use super::*;

    #[test]
    fn does_not_panic() {
        disable_tilemap_formats_guards();
    }
}

mod enable_tilemap_formats_guards {
    use super::*;

    #[test]
    fn accepts_log_state() {
        let state = Arc::new(RwLock::new(flight_log::create_log_state()));
        enable_tilemap_formats_guards(&state, 0.0);
        disable_tilemap_formats_guards();
    }
}
