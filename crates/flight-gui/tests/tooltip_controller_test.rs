use flight_gui::contract::*;
use flight_interaction::contract::InteractionSignalName;
#[path = "gui_timer_fixture.rs"]
mod gui_timer_fixture;
use gui_timer_fixture::{advance_timers, timer_fixture};
#[path = "gui_pointer_fixture.rs"]
mod gui_pointer_fixture;
use gui_pointer_fixture::pointer_fields;
fn options(
    content: flight_scene2d::Node2DRef,
    target: flight_scene2d::Node2DRef,
) -> TooltipControllerOptions {
    return TooltipControllerOptions {
        content,
        target,
        delay: None,
        offset: None,
        transition: None,
    };
}
mod create_tooltip_controller {
    use super::*;
    #[test]
    fn shows_after_delay_at_the_pointer_offset_and_hides_on_exit() {
        let content = create_gui_test_node(None, None);
        let mut options = options(content.clone(), create_gui_test_node(None, None));
        options.delay = Some(50.0);
        options.offset = Some(flight_geometry::create_vector2(3.0, 4.0));
        let (timer, time) = timer_fixture();
        let _controller = create_tooltip_controller(&options, timer);
        let mut fields = pointer_fields();
        fields.world_x = Some(10.0);
        fields.world_y = Some(20.0);
        emit_gui_pointer(
            &options.target,
            InteractionSignalName::OnPointerOver,
            Some(&fields),
        );
        assert!(!content.read().unwrap().visible);
        advance_timers(&time, 50.0);
        {
            let content = content.read().unwrap();
            assert!(content.visible);
            assert_eq!([content.x, content.y], [13.0, 24.0]);
        }
        emit_gui_pointer(&options.target, InteractionSignalName::OnPointerOut, None);
        assert!(!content.read().unwrap().visible);
    }
}
mod dispose_tooltip_controller {
    use super::*;
    #[test]
    fn cancels_delayed_display() {
        let content = create_gui_test_node(None, None);
        let mut options = options(content.clone(), create_gui_test_node(None, None));
        options.delay = Some(50.0);
        let (timer, time) = timer_fixture();
        let controller = create_tooltip_controller(&options, timer);
        emit_gui_pointer(&options.target, InteractionSignalName::OnPointerOver, None);
        dispose_tooltip_controller(&controller);
        advance_timers(&time, 50.0);
        assert!(!content.read().unwrap().visible);
    }
}
mod hide_tooltip_controller {
    use super::*;
    #[test]
    fn hides_immediately() {
        let content = create_gui_test_node(None, None);
        let (timer, _) = timer_fixture();
        let controller = create_tooltip_controller(
            &options(content.clone(), create_gui_test_node(None, None)),
            timer,
        );
        show_tooltip_controller(&controller);
        hide_tooltip_controller(&controller);
        assert!(!content.read().unwrap().visible);
    }
}
mod initialize_tooltip_controller {
    use super::*;
    #[test]
    fn preserves_controller_identity_and_content_handle() {
        let content = create_gui_test_node(None, None);
        let (timer, _) = timer_fixture();
        let mut controller: TooltipController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_tooltip_controller(
            &mut controller,
            &options(content.clone(), create_gui_test_node(None, None)),
            timer,
        );
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        assert!(std::sync::Arc::ptr_eq(
            get_gui_controller_runtime(&controller)
                .read()
                .unwrap()
                .fields
                .content
                .as_ref()
                .unwrap(),
            &options(content, create_gui_test_node(None, None)).content
        ));
    }
}
mod show_tooltip_controller {
    use super::*;
    #[test]
    fn shows_immediately_when_called() {
        let content = create_gui_test_node(None, None);
        let (timer, _) = timer_fixture();
        let controller = create_tooltip_controller(
            &options(content.clone(), create_gui_test_node(None, None)),
            timer,
        );
        show_tooltip_controller(&controller);
        assert!(content.read().unwrap().visible);
    }
}
