use flight_app::contract::{AppWindow, create_app_window};
use flight_entity::Ref;
use flight_surface::contract::*;

mod detach_window_render_state {
    use super::*;

    #[test]
    fn is_a_no_op_when_nothing_is_attached_and_leaves_the_window_usable() {
        let win: Ref<AppWindow> = create_app_window();
        detach_window_render_state(&win);
        detach_window_render_state(&win);
        win.write().unwrap().width = 10.0;
        assert_eq!(win.read().unwrap().width, 10.0);
    }
}
