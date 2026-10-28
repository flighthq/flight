//! D18 Rust-only delegates; the free functions remain the canonical contract.
use crate::contract::*;
use flight_entity::Ref;
use flight_scene2d::Node2DRef;

pub trait GuiNodeMethods {
    fn gui_length(&self, orientation: GuiOrientation) -> f32;
    fn gui_position(&self, orientation: GuiOrientation) -> f32;
    fn emit_gui_keyboard(
        &self,
        name: flight_interaction::contract::InteractionSignalName,
        key: &str,
    );
    fn emit_gui_pointer(
        &self,
        name: flight_interaction::contract::InteractionSignalName,
        fields: Option<&GuiPointerOptions>,
    );
}

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use std::sync::{Arc, RwLock};
    fn node() -> Node2DRef {
        return create_gui_test_node(None, None);
    }
    fn timer() -> Arc<flight_host::HostTimerCapability> {
        return Arc::new(flight_host::HostTimerCapability {
            provider: Arc::new(()),
            set_timeout: Arc::new(|_, _| {
                panic!("unexpected timer scheduling in delegate comparison")
            }),
            set_interval: Arc::new(|_, _| {
                panic!("unexpected timer scheduling in delegate comparison")
            }),
            now_ms: Arc::new(|| 0.0),
        });
    }
    fn dialog_entry() -> Ref<GuiDialogEntry> {
        return Arc::new(RwLock::new(GuiDialogEntry {
            dismiss_on_backdrop: None,
            id: "entry".to_string(),
            initial_focus: None,
            root: node(),
        }));
    }
    fn dialog_result() -> Ref<GuiDialogCloseResult> {
        return Arc::new(RwLock::new(GuiDialogCloseResult {
            entry_id: "entry".to_string(),
            reason: GuiDialogCloseReason::Accepted,
            value: None,
        }));
    }
    fn enter() -> flight_input::InputKeyboardData {
        return flight_input::InputKeyboardData {
            alt_key: false,
            caps_lock: false,
            code: "Enter".to_string(),
            ctrl_key: false,
            key: "Enter".to_string(),
            key_code: 13,
            location: 0,
            meta_key: false,
            modifier: 0,
            num_lock: false,
            repeat: false,
            shift_key: false,
            time_stamp: 0.0,
        };
    }
    fn button_options() -> ButtonControllerOptions {
        return ButtonControllerOptions {
            disabled: None,
            down_state: None,
            hit_area: None,
            interactive_state_binding: None,
            over_state: None,
            up_state: node(),
            transition: None,
        };
    }
    fn button() -> ButtonController {
        let options = button_options();
        return create_button_controller(&options);
    }
    #[test]
    fn button_controller_new_matches_free() {
        let options = button_options();
        let method = ButtonController::new(&options);
        let free = create_button_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn button_controller_dispose_matches_free() {
        let method = button();
        let free = button();
        method.dispose();
        dispose_button_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn button_controller_signals_matches_free() {
        let method = button();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_button_controller_signals(&method)
        ));
    }
    #[test]
    fn button_controller_is_disabled_matches_free() {
        let method = button();
        assert_eq!(method.is_disabled(), is_button_controller_disabled(&method));
    }
    #[test]
    fn button_controller_set_disabled_matches_free() {
        let method = button();
        let free = button();
        method.set_disabled(true);
        set_button_controller_disabled(&free, true);
        assert_eq!(method.is_disabled(), free.is_disabled());
    }
    fn toggle_options() -> ToggleControllerOptions {
        return ToggleControllerOptions {
            checked: None,
            checked_state: node(),
            label: None,
            over_state: None,
            unchecked_state: node(),
            transition: None,
        };
    }
    fn toggle() -> ToggleController {
        let options = toggle_options();
        return create_toggle_controller(&options);
    }
    #[test]
    fn toggle_controller_new_matches_free() {
        let options = toggle_options();
        let method = ToggleController::new(&options);
        let free = create_toggle_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn toggle_controller_dispose_matches_free() {
        let method = toggle();
        let free = toggle();
        method.dispose();
        dispose_toggle_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn toggle_controller_signals_matches_free() {
        let method = toggle();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_toggle_controller_signals(&method)
        ));
    }
    #[test]
    fn toggle_controller_is_checked_matches_free() {
        let method = toggle();
        assert_eq!(method.is_checked(), is_toggle_controller_checked(&method));
    }
    #[test]
    fn toggle_controller_set_checked_matches_free() {
        let method = toggle();
        let free = toggle();
        method.set_checked(true);
        set_toggle_controller_checked(&free, true);
        assert_eq!(method.is_checked(), free.is_checked());
    }
    fn progress_bar_options() -> ProgressBarControllerOptions {
        return ProgressBarControllerOptions {
            fill: node(),
            maximum: None,
            minimum: None,
            orientation: None,
            track: node(),
            value: None,
            transition: None,
        };
    }
    fn progress_bar() -> ProgressBarController {
        let options = progress_bar_options();
        return create_progress_bar_controller(&options);
    }
    #[test]
    fn progress_bar_controller_new_matches_free() {
        let options = progress_bar_options();
        let method = ProgressBarController::new(&options);
        let free = create_progress_bar_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn progress_bar_controller_dispose_matches_free() {
        let method = progress_bar();
        let free = progress_bar();
        method.dispose();
        dispose_progress_bar_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn progress_bar_controller_value_matches_free() {
        let method = progress_bar();
        assert_eq!(method.value(), get_progress_bar_controller_value(&method));
    }
    #[test]
    fn progress_bar_controller_set_value_matches_free() {
        let method = progress_bar();
        let free = progress_bar();
        method.set_value(0.5);
        set_progress_bar_controller_value(&free, 0.5);
        assert_eq!(method.value(), free.value());
    }
    fn radio_group_options() -> RadioGroupControllerOptions {
        return RadioGroupControllerOptions {
            selected_index: None,
            toggles: vec![Arc::new(RwLock::new(toggle()))],
        };
    }
    fn radio_group() -> RadioGroupController {
        let options = radio_group_options();
        return create_radio_group_controller(&options);
    }
    #[test]
    fn radio_group_controller_new_matches_free() {
        let options = radio_group_options();
        let method = RadioGroupController::new(&options);
        let free = create_radio_group_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn radio_group_controller_dispose_matches_free() {
        let method = radio_group();
        let free = radio_group();
        method.dispose();
        dispose_radio_group_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn radio_group_controller_selected_index_matches_free() {
        let method = radio_group();
        assert_eq!(
            method.selected_index(),
            get_radio_group_controller_selected_index(&method)
        );
    }
    #[test]
    fn radio_group_controller_signals_matches_free() {
        let method = radio_group();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_radio_group_controller_signals(&method)
        ));
    }
    #[test]
    fn radio_group_controller_set_selected_index_matches_free() {
        let method = radio_group();
        let free = radio_group();
        method.set_selected_index(0);
        set_radio_group_controller_selected_index(&free, 0);
        assert_eq!(method.selected_index(), free.selected_index());
    }
    fn tab_bar_options() -> TabBarControllerOptions {
        return TabBarControllerOptions {
            selected_index: None,
            tabs: vec![Arc::new(RwLock::new(TabBarControllerItem {
                selected_state: node(),
                unselected_state: node(),
            }))],
            transition: None,
        };
    }
    fn tab_bar() -> TabBarController {
        let options = tab_bar_options();
        return create_tab_bar_controller(&options);
    }
    #[test]
    fn tab_bar_controller_new_matches_free() {
        let options = tab_bar_options();
        let method = TabBarController::new(&options);
        let free = create_tab_bar_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn tab_bar_controller_dispose_matches_free() {
        let method = tab_bar();
        let free = tab_bar();
        method.dispose();
        dispose_tab_bar_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn tab_bar_controller_selected_index_matches_free() {
        let method = tab_bar();
        assert_eq!(
            method.selected_index(),
            get_tab_bar_controller_selected_index(&method)
        );
    }
    #[test]
    fn tab_bar_controller_signals_matches_free() {
        let method = tab_bar();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_tab_bar_controller_signals(&method)
        ));
    }
    #[test]
    fn tab_bar_controller_set_selected_index_matches_free() {
        let method = tab_bar();
        let free = tab_bar();
        method.set_selected_index(0);
        set_tab_bar_controller_selected_index(&free, 0);
        assert_eq!(method.selected_index(), free.selected_index());
    }
    fn slider_options() -> SliderControllerOptions {
        return SliderControllerOptions {
            maximum: None,
            minimum: None,
            orientation: None,
            step: None,
            thumb: node(),
            track: node(),
            value: None,
            transition: None,
        };
    }
    fn slider() -> SliderController {
        let options = slider_options();
        return create_slider_controller(&options);
    }
    #[test]
    fn slider_controller_new_matches_free() {
        let options = slider_options();
        let method = SliderController::new(&options);
        let free = create_slider_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn slider_controller_dispose_matches_free() {
        let method = slider();
        let free = slider();
        method.dispose();
        dispose_slider_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn slider_controller_signals_matches_free() {
        let method = slider();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_slider_controller_signals(&method)
        ));
    }
    #[test]
    fn slider_controller_value_matches_free() {
        let method = slider();
        assert_eq!(method.value(), get_slider_controller_value(&method));
    }
    #[test]
    fn slider_controller_set_value_matches_free() {
        let method = slider();
        let free = slider();
        method.set_value(0.5);
        set_slider_controller_value(&free, 0.5);
        assert_eq!(method.value(), free.value());
    }
    fn scroll_bar_options() -> ScrollBarControllerOptions {
        return ScrollBarControllerOptions {
            down_button: None,
            up_button: None,
            line_size: None,
            maximum: None,
            minimum: None,
            orientation: None,
            page_size: None,
            repeat_interval: None,
            thumb: node(),
            track: node(),
            value: None,
            transition: None,
        };
    }
    fn scroll_bar() -> ScrollBarController {
        let options = scroll_bar_options();
        return create_scroll_bar_controller(&options, timer());
    }
    #[test]
    fn scroll_bar_controller_new_matches_free() {
        let options = scroll_bar_options();
        let method = ScrollBarController::new(&options, timer());
        let free = create_scroll_bar_controller(&options, timer());
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn scroll_bar_controller_dispose_matches_free() {
        let method = scroll_bar();
        let free = scroll_bar();
        method.dispose();
        dispose_scroll_bar_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn scroll_bar_controller_signals_matches_free() {
        let method = scroll_bar();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_scroll_bar_controller_signals(&method)
        ));
    }
    #[test]
    fn scroll_bar_controller_value_matches_free() {
        let method = scroll_bar();
        assert_eq!(method.value(), get_scroll_bar_controller_value(&method));
    }
    #[test]
    fn scroll_bar_controller_set_value_matches_free() {
        let method = scroll_bar();
        let free = scroll_bar();
        method.set_value(0.5);
        set_scroll_bar_controller_value(&free, 0.5);
        assert_eq!(method.value(), free.value());
    }
    fn list_options() -> ListControllerOptions {
        return ListControllerOptions {
            content: node(),
            items: vec![node()],
            scroll_bar: None,
            selectable: None,
            selected_index: None,
            viewport: node(),
            transition: None,
        };
    }
    fn list() -> ListController {
        let options = list_options();
        return create_list_controller(&options);
    }
    #[test]
    fn list_controller_new_matches_free() {
        let options = list_options();
        let method = ListController::new(&options);
        let free = create_list_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn list_controller_dispose_matches_free() {
        let method = list();
        let free = list();
        method.dispose();
        dispose_list_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn list_controller_selected_index_matches_free() {
        let method = list();
        assert_eq!(
            method.selected_index(),
            get_list_controller_selected_index(&method)
        );
    }
    #[test]
    fn list_controller_signals_matches_free() {
        let method = list();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_list_controller_signals(&method)
        ));
    }
    #[test]
    fn list_controller_set_selected_index_matches_free() {
        let method = list();
        let free = list();
        method.set_selected_index(0);
        set_list_controller_selected_index(&free, 0);
        assert_eq!(method.selected_index(), free.selected_index());
    }
    #[test]
    fn list_controller_set_visible_matches_free() {
        let method = list();
        let free = list();
        method.set_visible(false);
        set_list_controller_visible(&free, false);
        let a = get_gui_controller_runtime(&method)
            .read()
            .unwrap()
            .fields
            .viewport
            .clone()
            .unwrap();
        let b = get_gui_controller_runtime(&free)
            .read()
            .unwrap()
            .fields
            .viewport
            .clone()
            .unwrap();
        assert_eq!(
            a.read().unwrap().node2d_fields().visible,
            b.read().unwrap().node2d_fields().visible
        );
    }
    fn combo_box_options() -> ComboBoxControllerOptions {
        return ComboBoxControllerOptions {
            button: Arc::new(RwLock::new(button())),
            display: None,
            list: Arc::new(RwLock::new(list())),
            open: None,
            transition: None,
        };
    }
    fn combo_box() -> ComboBoxController {
        let options = combo_box_options();
        return create_combo_box_controller(&options);
    }
    #[test]
    fn combo_box_controller_new_matches_free() {
        let options = combo_box_options();
        let method = ComboBoxController::new(&options);
        let free = create_combo_box_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn combo_box_controller_dispose_matches_free() {
        let method = combo_box();
        let free = combo_box();
        method.dispose();
        dispose_combo_box_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn combo_box_controller_signals_matches_free() {
        let method = combo_box();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_combo_box_controller_signals(&method)
        ));
    }
    #[test]
    fn combo_box_controller_is_open_matches_free() {
        let method = combo_box();
        assert_eq!(method.is_open(), is_combo_box_controller_open(&method));
    }
    #[test]
    fn combo_box_controller_set_open_matches_free() {
        let method = combo_box();
        let free = combo_box();
        method.set_open(true);
        set_combo_box_controller_open(&free, true);
        assert_eq!(method.is_open(), free.is_open());
    }
    fn scroll_view_options() -> ScrollViewControllerOptions {
        return ScrollViewControllerOptions {
            content: create_gui_test_node(Some(200.0), Some(200.0)),
            viewport: node(),
            horizontal_scroll_bar: None,
            vertical_scroll_bar: None,
            mouse_wheel_enabled: None,
            transition: None,
        };
    }
    fn scroll_view() -> ScrollViewController {
        let options = scroll_view_options();
        return create_scroll_view_controller(&options);
    }
    #[test]
    fn scroll_view_controller_new_matches_free() {
        let options = scroll_view_options();
        let method = ScrollViewController::new(&options);
        let free = create_scroll_view_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn scroll_view_controller_dispose_matches_free() {
        let method = scroll_view();
        let free = scroll_view();
        method.dispose();
        dispose_scroll_view_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn scroll_view_controller_signals_matches_free() {
        let method = scroll_view();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_scroll_view_controller_signals(&method)
        ));
    }
    #[test]
    fn scroll_view_controller_x_matches_free() {
        let method = scroll_view();
        assert_eq!(method.x(), get_scroll_view_controller_x(&method));
    }
    #[test]
    fn scroll_view_controller_y_matches_free() {
        let method = scroll_view();
        assert_eq!(method.y(), get_scroll_view_controller_y(&method));
    }
    #[test]
    fn scroll_view_controller_set_position_matches_free() {
        let method = scroll_view();
        let free = scroll_view();
        method.set_position(4.0, 5.0);
        set_scroll_view_controller_position(&free, 4.0, 5.0);
        assert_eq!((method.x(), method.y()), (free.x(), free.y()));
    }
    fn split_pane_options() -> SplitPaneControllerOptions {
        return SplitPaneControllerOptions {
            divider: node(),
            first_region: node(),
            second_region: node(),
            maximum_first: None,
            minimum_first: None,
            minimum_second: None,
            orientation: None,
            position: None,
            total_size: None,
            transition: None,
        };
    }
    fn split_pane() -> SplitPaneController {
        let options = split_pane_options();
        return create_split_pane_controller(&options);
    }
    #[test]
    fn split_pane_controller_new_matches_free() {
        let options = split_pane_options();
        let method = SplitPaneController::new(&options);
        let free = create_split_pane_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn split_pane_controller_dispose_matches_free() {
        let method = split_pane();
        let free = split_pane();
        method.dispose();
        dispose_split_pane_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn split_pane_controller_signals_matches_free() {
        let method = split_pane();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_split_pane_controller_signals(&method)
        ));
    }
    #[test]
    fn split_pane_controller_position_matches_free() {
        let method = split_pane();
        assert_eq!(
            method.position(),
            get_split_pane_controller_position(&method)
        );
    }
    #[test]
    fn split_pane_controller_set_position_matches_free() {
        let method = split_pane();
        let free = split_pane();
        method.set_position(50.0);
        set_split_pane_controller_position(&free, 50.0);
        assert_eq!(method.position(), free.position());
    }
    fn window_options() -> WindowControllerOptions {
        return WindowControllerOptions {
            close_button: None,
            content: None,
            draggable: None,
            frame: node(),
            minimum_height: None,
            minimum_width: None,
            resizable: None,
            resize_handle: None,
            title_bar: None,
            transition: None,
        };
    }
    fn window() -> WindowController {
        let options = window_options();
        return create_window_controller(&options);
    }
    #[test]
    fn window_controller_new_matches_free() {
        let options = window_options();
        let method = WindowController::new(&options);
        let free = create_window_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn window_controller_dispose_matches_free() {
        let method = window();
        let free = window();
        method.dispose();
        dispose_window_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn window_controller_signals_matches_free() {
        let method = window();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_window_controller_signals(&method)
        ));
    }
    #[test]
    fn window_controller_set_position_matches_free() {
        let method = window();
        let free = window();
        method.set_position(4.0, 5.0);
        set_window_controller_position(&free, 4.0, 5.0);
        let a = get_gui_controller_runtime(&method)
            .read()
            .unwrap()
            .fields
            .frame
            .clone()
            .unwrap();
        let b = get_gui_controller_runtime(&free)
            .read()
            .unwrap()
            .fields
            .frame
            .clone()
            .unwrap();
        let a = a.read().unwrap();
        let b = b.read().unwrap();
        assert_eq!(
            (
                a.node2d_fields().x,
                a.node2d_fields().y,
                a.node2d_fields().scale_x,
                a.node2d_fields().scale_y
            ),
            (
                b.node2d_fields().x,
                b.node2d_fields().y,
                b.node2d_fields().scale_x,
                b.node2d_fields().scale_y
            )
        );
    }
    #[test]
    fn window_controller_set_size_matches_free() {
        let method = window();
        let free = window();
        method.set_size(50.0, 50.0);
        set_window_controller_size(&free, 50.0, 50.0);
        let a = get_gui_controller_runtime(&method)
            .read()
            .unwrap()
            .fields
            .frame
            .clone()
            .unwrap();
        let b = get_gui_controller_runtime(&free)
            .read()
            .unwrap()
            .fields
            .frame
            .clone()
            .unwrap();
        let a = a.read().unwrap();
        let b = b.read().unwrap();
        assert_eq!(
            (
                a.node2d_fields().x,
                a.node2d_fields().y,
                a.node2d_fields().scale_x,
                a.node2d_fields().scale_y
            ),
            (
                b.node2d_fields().x,
                b.node2d_fields().y,
                b.node2d_fields().scale_x,
                b.node2d_fields().scale_y
            )
        );
    }
    fn tooltip_options() -> TooltipControllerOptions {
        return TooltipControllerOptions {
            content: node(),
            target: node(),
            delay: None,
            offset: None,
            transition: None,
        };
    }
    fn tooltip() -> TooltipController {
        let options = tooltip_options();
        return create_tooltip_controller(&options, timer());
    }
    #[test]
    fn tooltip_controller_new_matches_free() {
        let options = tooltip_options();
        let method = TooltipController::new(&options, timer());
        let free = create_tooltip_controller(&options, timer());
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn tooltip_controller_dispose_matches_free() {
        let method = tooltip();
        let free = tooltip();
        method.dispose();
        dispose_tooltip_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn tooltip_controller_hide_matches_free() {
        let method = tooltip();
        let free = tooltip();
        method.hide();
        hide_tooltip_controller(&free);
        let a = get_gui_controller_runtime(&method)
            .read()
            .unwrap()
            .fields
            .content
            .clone()
            .unwrap();
        let b = get_gui_controller_runtime(&free)
            .read()
            .unwrap()
            .fields
            .content
            .clone()
            .unwrap();
        assert_eq!(
            a.read().unwrap().node2d_fields().visible,
            b.read().unwrap().node2d_fields().visible
        );
    }
    #[test]
    fn tooltip_controller_show_matches_free() {
        let method = tooltip();
        let free = tooltip();
        method.show();
        show_tooltip_controller(&free);
        let a = get_gui_controller_runtime(&method)
            .read()
            .unwrap()
            .fields
            .content
            .clone()
            .unwrap();
        let b = get_gui_controller_runtime(&free)
            .read()
            .unwrap()
            .fields
            .content
            .clone()
            .unwrap();
        assert_eq!(
            a.read().unwrap().node2d_fields().visible,
            b.read().unwrap().node2d_fields().visible
        );
    }
    fn tree_view_options() -> TreeViewControllerOptions {
        return TreeViewControllerOptions {
            items: vec![Arc::new(RwLock::new(TreeViewControllerItem {
                children: Some(vec![Arc::new(RwLock::new(TreeViewControllerItem {
                    children: None,
                    expanded: None,
                    visual: node(),
                }))]),
                expanded: None,
                visual: node(),
            }))],
            selected_item: None,
            transition: None,
        };
    }
    fn tree_view() -> TreeViewController {
        let options = tree_view_options();
        return create_tree_view_controller(&options);
    }
    #[test]
    fn tree_view_controller_new_matches_free() {
        let options = tree_view_options();
        let method = TreeViewController::new(&options);
        let free = create_tree_view_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn tree_view_controller_dispose_matches_free() {
        let method = tree_view();
        let free = tree_view();
        method.dispose();
        dispose_tree_view_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn tree_view_controller_signals_matches_free() {
        let method = tree_view();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_tree_view_controller_signals(&method)
        ));
    }
    #[test]
    fn tree_view_controller_selected_item_matches_free() {
        let method = tree_view();
        assert!(method.selected_item().is_none());
        assert!(get_tree_view_controller_selected_item(&method).is_none());
    }
    #[test]
    fn tree_view_controller_is_item_expanded_matches_free() {
        let method = tree_view();
        let free = tree_view();
        let a = get_gui_controller_runtime(&method)
            .read()
            .unwrap()
            .fields
            .roots[0]
            .clone();
        let b = get_gui_controller_runtime(&free)
            .read()
            .unwrap()
            .fields
            .roots[0]
            .clone();
        assert_eq!(
            method.is_item_expanded(&a),
            is_tree_view_controller_item_expanded(&free, &b)
        );
    }
    #[test]
    fn tree_view_controller_set_item_expanded_matches_free() {
        let method = tree_view();
        let free = tree_view();
        let a = get_gui_controller_runtime(&method)
            .read()
            .unwrap()
            .fields
            .roots[0]
            .clone();
        let b = get_gui_controller_runtime(&free)
            .read()
            .unwrap()
            .fields
            .roots[0]
            .clone();
        method.set_item_expanded(&a, true);
        set_tree_view_controller_item_expanded(&free, &b, true);
        assert_eq!(method.is_item_expanded(&a), free.is_item_expanded(&b));
    }
    #[test]
    fn tree_view_controller_set_selected_item_matches_free() {
        let method = tree_view();
        let free = tree_view();
        let a = get_gui_controller_runtime(&method)
            .read()
            .unwrap()
            .fields
            .roots[0]
            .clone();
        let b = get_gui_controller_runtime(&free)
            .read()
            .unwrap()
            .fields
            .roots[0]
            .clone();
        method.set_selected_item(Some(a));
        set_tree_view_controller_selected_item(&free, Some(b));
        assert_eq!(
            method.selected_item().is_some(),
            free.selected_item().is_some()
        );
    }
    #[test]
    fn tree_view_controller_toggle_item_matches_free() {
        let method = tree_view();
        let free = tree_view();
        let a = get_gui_controller_runtime(&method)
            .read()
            .unwrap()
            .fields
            .roots[0]
            .clone();
        let b = get_gui_controller_runtime(&free)
            .read()
            .unwrap()
            .fields
            .roots[0]
            .clone();
        method.toggle_item(&a);
        toggle_tree_view_controller_item(&free, &b);
        assert_eq!(method.is_item_expanded(&a), free.is_item_expanded(&b));
    }
    fn text_input_options() -> TextInputControllerOptions {
        return TextInputControllerOptions {
            background: None,
            caret: None,
            input: None,
            manager: None,
            text_field: flight_text::create_rich_text(None),
            transition: None,
        };
    }
    fn text_input() -> TextInputController {
        let options = text_input_options();
        return create_text_input_controller(&options);
    }
    #[test]
    fn text_input_controller_new_matches_free() {
        let options = text_input_options();
        let method = TextInputController::new(&options);
        let free = create_text_input_controller(&options);
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn text_input_controller_dispose_matches_free() {
        let method = text_input();
        let free = text_input();
        method.dispose();
        dispose_text_input_controller(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn text_input_controller_signals_matches_free() {
        let method = text_input();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_text_input_controller_signals(&method)
        ));
    }
    #[test]
    fn text_input_controller_blur_matches_free() {
        let method = text_input();
        let free = text_input();
        method.blur();
        blur_text_input_controller(&free);
        let a = get_gui_controller_runtime(&method)
            .read()
            .unwrap()
            .fields
            .manager
            .clone();
        let b = get_gui_controller_runtime(&free)
            .read()
            .unwrap()
            .fields
            .manager
            .clone();
        assert_eq!(
            a.read().unwrap().focused.is_some(),
            b.read().unwrap().focused.is_some()
        );
    }
    #[test]
    fn text_input_controller_focus_matches_free() {
        let method = text_input();
        let free = text_input();
        method.focus();
        focus_text_input_controller(&free);
        let a = get_gui_controller_runtime(&method)
            .read()
            .unwrap()
            .fields
            .manager
            .clone();
        let b = get_gui_controller_runtime(&free)
            .read()
            .unwrap()
            .fields
            .manager
            .clone();
        assert_eq!(
            a.read().unwrap().focused.is_some(),
            b.read().unwrap().focused.is_some()
        );
    }
    #[test]
    fn text_input_controller_dispatch_key_down_matches_free() {
        let method = text_input();
        let free = text_input();
        assert_eq!(
            method.dispatch_key_down(&enter()),
            dispatch_text_input_controller_key_down(&free, &enter())
        );
    }
    #[test]
    fn text_input_controller_dispatch_text_matches_free() {
        let method = text_input();
        let free = text_input();
        assert_eq!(
            method.dispatch_text("abc"),
            dispatch_text_input_controller_text(&free, "abc")
        );
    }
    fn gui_dialog_options() -> GuiDialogOptions {
        return GuiDialogOptions {
            backdrop: None,
            focus_manager: None,
            transition: None,
        };
    }
    fn gui_dialog() -> GuiDialog {
        let options = gui_dialog_options();
        return create_gui_dialog(Some(&options));
    }
    #[test]
    fn gui_dialog_new_matches_free() {
        let options = gui_dialog_options();
        let method = GuiDialog::new(Some(&options));
        let free = create_gui_dialog(Some(&options));
        let method = get_gui_controller_runtime(&method);
        let free = get_gui_controller_runtime(&free);
        assert_eq!(
            method.read().unwrap().disposed,
            free.read().unwrap().disposed
        );
        assert_eq!(
            method.read().unwrap().cleanups.len(),
            free.read().unwrap().cleanups.len()
        );
    }
    #[test]
    fn gui_dialog_dispose_matches_free() {
        let method = gui_dialog();
        let free = gui_dialog();
        method.dispose();
        dispose_gui_dialog(&free);
        assert_eq!(
            get_gui_controller_runtime(&method).read().unwrap().disposed,
            get_gui_controller_runtime(&free).read().unwrap().disposed
        );
        assert_eq!(
            get_gui_controller_runtime(&method)
                .read()
                .unwrap()
                .cleanups
                .len(),
            get_gui_controller_runtime(&free)
                .read()
                .unwrap()
                .cleanups
                .len()
        );
    }
    #[test]
    fn gui_dialog_signals_matches_free() {
        let method = gui_dialog();
        assert!(Arc::ptr_eq(
            &method.signals(),
            &get_gui_dialog_signals(&method)
        ));
    }
    #[test]
    fn gui_dialog_active_entry_matches_free() {
        let method = gui_dialog();
        assert!(method.active_entry().is_none());
        assert!(get_active_gui_dialog_entry(&method).is_none());
    }
    #[test]
    fn gui_dialog_entries_matches_free() {
        let method = gui_dialog();
        let free = gui_dialog();
        let entry = dialog_entry();
        enqueue_gui_dialog(&method, &entry);
        enqueue_gui_dialog(&free, &entry);
        let mut a = Vec::new();
        let mut b = Vec::new();
        method.entries(&mut a);
        get_gui_dialog_entries(&mut b, &free);
        assert_eq!(a.len(), b.len());
        assert!(Arc::ptr_eq(&a[0], &b[0]));
    }
    #[test]
    fn gui_dialog_enqueue_matches_free() {
        let method = gui_dialog();
        let free = gui_dialog();
        let entry = dialog_entry();
        assert_eq!(method.enqueue(&entry), enqueue_gui_dialog(&free, &entry));
    }
    #[test]
    fn gui_dialog_close_matches_free() {
        let method = gui_dialog();
        let free = gui_dialog();
        let entry = dialog_entry();
        enqueue_gui_dialog(&method, &entry);
        enqueue_gui_dialog(&free, &entry);
        let result = dialog_result();
        assert_eq!(method.close(&result), close_gui_dialog(&free, &result));
    }
    #[test]
    fn gui_dialog_remove_entry_matches_free() {
        let method = gui_dialog();
        let free = gui_dialog();
        let _entry = dialog_entry();
        assert_eq!(
            method.remove_entry("entry"),
            remove_gui_dialog_entry(&free, "entry")
        );
    }
    #[test]
    fn generic_from_runtime_matches_free() {
        let runtime = create_gui_controller_runtime((), None);
        let method = GuiController::from_runtime(runtime.clone());
        let free = create_gui_controller(runtime);
        assert!(Arc::ptr_eq(
            &get_gui_controller_runtime(&method),
            &get_gui_controller_runtime(&free)
        ));
    }
    #[test]
    fn generic_dispose_with_clear_matches_free() {
        let method = GuiController::from_runtime(create_gui_controller_runtime((), None));
        let free = create_gui_controller(create_gui_controller_runtime((), None));
        let calls = Arc::new(RwLock::new(0));
        let copy = calls.clone();
        method.dispose_gui_controller(&|| *copy.write().unwrap() += 1);
        let method_calls = *calls.read().unwrap();
        dispose_gui_controller(&free, &|| *calls.write().unwrap() += 1);
        assert_eq!(method_calls, *calls.read().unwrap() - method_calls);
    }
    #[test]
    fn gui_orientation_parse_matches_free() {
        assert_eq!(
            GuiOrientation::parse("horizontal"),
            parse_gui_orientation("horizontal")
        );
    }
    #[test]
    fn gui_orientation_as_str_matches_free() {
        let value = parse_gui_orientation("horizontal").unwrap();
        assert_eq!(value.as_str(), get_gui_orientation_string(value));
    }
    #[test]
    fn gui_dialog_close_reason_parse_matches_free() {
        assert_eq!(
            GuiDialogCloseReason::parse("accepted"),
            parse_gui_dialog_close_reason("accepted")
        );
    }
    #[test]
    fn gui_dialog_close_reason_as_str_matches_free() {
        let value = parse_gui_dialog_close_reason("accepted").unwrap();
        assert_eq!(value.as_str(), get_gui_dialog_close_reason_string(value));
    }
    #[test]
    fn node_gui_length_matches_free() {
        let node = node();
        assert_eq!(
            node.gui_length(GuiOrientation::Horizontal),
            get_gui_length(&node, GuiOrientation::Horizontal)
        );
    }
    #[test]
    fn node_gui_position_matches_free() {
        let node = node();
        assert_eq!(
            node.gui_position(GuiOrientation::Vertical),
            get_gui_position(&node, GuiOrientation::Vertical)
        );
    }
    #[test]
    fn node_emit_gui_pointer_matches_free() {
        let node = node();
        let target: flight_node::NodeRef = node.clone();
        let signals = flight_interaction::contract::enable_interaction_signals(&target);
        let seen = Arc::new(RwLock::new(Vec::new()));
        let copy = seen.clone();
        flight_signals::connect_signal(
            &signals.read().unwrap().on_click,
            Arc::new(move |data| copy.write().unwrap().push(data.pointer_id)),
            None,
        );
        node.emit_gui_pointer(
            flight_interaction::contract::InteractionSignalName::OnClick,
            None,
        );
        emit_gui_pointer(
            &node,
            flight_interaction::contract::InteractionSignalName::OnClick,
            None,
        );
        let seen = seen.read().unwrap();
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0], seen[1]);
    }
    #[test]
    fn node_emit_gui_keyboard_matches_free() {
        let node = node();
        let target: flight_node::NodeRef = node.clone();
        let signals = flight_interaction::contract::enable_interaction_signals(&target);
        let seen = Arc::new(RwLock::new(Vec::new()));
        let copy = seen.clone();
        flight_signals::connect_signal(
            &signals.read().unwrap().on_key_down,
            Arc::new(move |data| copy.write().unwrap().push(data.key.clone())),
            None,
        );
        node.emit_gui_keyboard(
            flight_interaction::contract::InteractionSignalName::OnKeyDown,
            "x",
        );
        emit_gui_keyboard(
            &node,
            flight_interaction::contract::InteractionSignalName::OnKeyDown,
            "x",
        );
        let seen = seen.read().unwrap();
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0], seen[1]);
    }
}

impl<F> GuiController<F> {
    // Keep the full name because the concrete controller aliases each have their own dispose method.
    pub fn dispose_gui_controller(&self, clear: &dyn Fn()) {
        dispose_gui_controller(self, clear);
    }

    pub fn from_runtime(runtime: Ref<GuiControllerRuntime<F>>) -> Self {
        return create_gui_controller(runtime);
    }
}

impl GuiNodeMethods for Node2DRef {
    fn emit_gui_keyboard(
        &self,
        name: flight_interaction::contract::InteractionSignalName,
        key: &str,
    ) {
        emit_gui_keyboard(self, name, key);
    }
    fn emit_gui_pointer(
        &self,
        name: flight_interaction::contract::InteractionSignalName,
        fields: Option<&GuiPointerOptions>,
    ) {
        emit_gui_pointer(self, name, fields);
    }
    fn gui_length(&self, orientation: GuiOrientation) -> f32 {
        return get_gui_length(self, orientation);
    }
    fn gui_position(&self, orientation: GuiOrientation) -> f32 {
        return get_gui_position(self, orientation);
    }
}

impl GuiOrientation {
    pub fn as_str(&self) -> &'static str {
        return get_gui_orientation_string(*self);
    }
    pub fn parse(value: &str) -> Option<Self> {
        return parse_gui_orientation(value);
    }
}

impl GuiDialogCloseReason {
    pub fn as_str(&self) -> &'static str {
        return get_gui_dialog_close_reason_string(*self);
    }
    pub fn parse(value: &str) -> Option<Self> {
        return parse_gui_dialog_close_reason(value);
    }
}

impl ButtonController {
    pub fn dispose(&self) {
        dispose_button_controller(self);
    }
    pub fn is_disabled(&self) -> bool {
        return is_button_controller_disabled(self);
    }
    pub fn set_disabled(&self, disabled: bool) {
        set_button_controller_disabled(self, disabled);
    }
    pub fn signals(&self) -> Ref<ButtonControllerSignals> {
        return get_button_controller_signals(self);
    }
}

impl ToggleController {
    pub fn dispose(&self) {
        dispose_toggle_controller(self);
    }
    pub fn is_checked(&self) -> bool {
        return is_toggle_controller_checked(self);
    }
    pub fn set_checked(&self, checked: bool) {
        set_toggle_controller_checked(self, checked);
    }
    pub fn signals(&self) -> Ref<ToggleControllerSignals> {
        return get_toggle_controller_signals(self);
    }
}

impl ProgressBarController {
    pub fn dispose(&self) {
        dispose_progress_bar_controller(self);
    }
    pub fn set_value(&self, value: f32) {
        set_progress_bar_controller_value(self, value);
    }
    pub fn value(&self) -> f32 {
        return get_progress_bar_controller_value(self);
    }
}

impl RadioGroupController {
    pub fn dispose(&self) {
        dispose_radio_group_controller(self);
    }
    pub fn selected_index(&self) -> i32 {
        return get_radio_group_controller_selected_index(self);
    }
    pub fn set_selected_index(&self, index: i32) {
        set_radio_group_controller_selected_index(self, index);
    }
    pub fn signals(&self) -> Ref<RadioGroupControllerSignals> {
        return get_radio_group_controller_signals(self);
    }
}

impl TabBarController {
    pub fn dispose(&self) {
        dispose_tab_bar_controller(self);
    }
    pub fn selected_index(&self) -> i32 {
        return get_tab_bar_controller_selected_index(self);
    }
    pub fn set_selected_index(&self, index: i32) {
        set_tab_bar_controller_selected_index(self, index);
    }
    pub fn signals(&self) -> Ref<TabBarControllerSignals> {
        return get_tab_bar_controller_signals(self);
    }
}

impl SliderController {
    pub fn dispose(&self) {
        dispose_slider_controller(self);
    }
    pub fn set_value(&self, value: f32) {
        set_slider_controller_value(self, value);
    }
    pub fn signals(&self) -> Ref<SliderControllerSignals> {
        return get_slider_controller_signals(self);
    }
    pub fn value(&self) -> f32 {
        return get_slider_controller_value(self);
    }
}

impl ScrollBarController {
    pub fn dispose(&self) {
        dispose_scroll_bar_controller(self);
    }
    pub fn set_value(&self, value: f32) {
        set_scroll_bar_controller_value(self, value);
    }
    pub fn signals(&self) -> Ref<ScrollBarControllerSignals> {
        return get_scroll_bar_controller_signals(self);
    }
    pub fn value(&self) -> f32 {
        return get_scroll_bar_controller_value(self);
    }
}

impl ListController {
    pub fn dispose(&self) {
        dispose_list_controller(self);
    }
    pub fn selected_index(&self) -> i32 {
        return get_list_controller_selected_index(self);
    }
    pub fn set_selected_index(&self, index: i32) {
        set_list_controller_selected_index(self, index);
    }
    pub fn set_visible(&self, visible: bool) {
        set_list_controller_visible(self, visible);
    }
    pub fn signals(&self) -> Ref<ListControllerSignals> {
        return get_list_controller_signals(self);
    }
}

impl ComboBoxController {
    pub fn dispose(&self) {
        dispose_combo_box_controller(self);
    }
    pub fn is_open(&self) -> bool {
        return is_combo_box_controller_open(self);
    }
    pub fn set_open(&self, open: bool) {
        set_combo_box_controller_open(self, open);
    }
    pub fn signals(&self) -> Ref<ComboBoxControllerSignals> {
        return get_combo_box_controller_signals(self);
    }
}

impl ScrollViewController {
    pub fn dispose(&self) {
        dispose_scroll_view_controller(self);
    }
    pub fn set_position(&self, x: f32, y: f32) {
        set_scroll_view_controller_position(self, x, y);
    }
    pub fn signals(&self) -> Ref<ScrollViewControllerSignals> {
        return get_scroll_view_controller_signals(self);
    }
    pub fn x(&self) -> f32 {
        return get_scroll_view_controller_x(self);
    }
    pub fn y(&self) -> f32 {
        return get_scroll_view_controller_y(self);
    }
}

impl SplitPaneController {
    pub fn dispose(&self) {
        dispose_split_pane_controller(self);
    }
    pub fn position(&self) -> f32 {
        return get_split_pane_controller_position(self);
    }
    pub fn set_position(&self, position: f32) {
        set_split_pane_controller_position(self, position);
    }
    pub fn signals(&self) -> Ref<SplitPaneControllerSignals> {
        return get_split_pane_controller_signals(self);
    }
}

impl WindowController {
    pub fn dispose(&self) {
        dispose_window_controller(self);
    }
    pub fn set_position(&self, x: f32, y: f32) {
        set_window_controller_position(self, x, y);
    }
    pub fn set_size(&self, width: f32, height: f32) {
        set_window_controller_size(self, width, height);
    }
    pub fn signals(&self) -> Ref<WindowControllerSignals> {
        return get_window_controller_signals(self);
    }
}

impl TooltipController {
    pub fn dispose(&self) {
        dispose_tooltip_controller(self);
    }
    pub fn hide(&self) {
        hide_tooltip_controller(self);
    }
    pub fn show(&self) {
        show_tooltip_controller(self);
    }
}

impl TreeViewController {
    pub fn dispose(&self) {
        dispose_tree_view_controller(self);
    }
    pub fn is_item_expanded(&self, item: &Ref<TreeViewControllerItem>) -> bool {
        return is_tree_view_controller_item_expanded(self, item);
    }
    pub fn selected_item(&self) -> Option<Ref<TreeViewControllerItem>> {
        return get_tree_view_controller_selected_item(self);
    }
    pub fn set_item_expanded(&self, item: &Ref<TreeViewControllerItem>, expanded: bool) {
        set_tree_view_controller_item_expanded(self, item, expanded);
    }
    pub fn set_selected_item(&self, item: Option<Ref<TreeViewControllerItem>>) {
        set_tree_view_controller_selected_item(self, item);
    }
    pub fn signals(&self) -> Ref<TreeViewControllerSignals> {
        return get_tree_view_controller_signals(self);
    }
    pub fn toggle_item(&self, item: &Ref<TreeViewControllerItem>) {
        toggle_tree_view_controller_item(self, item);
    }
}

impl TextInputController {
    pub fn blur(&self) {
        blur_text_input_controller(self);
    }
    pub fn dispatch_key_down(&self, data: &flight_input::InputKeyboardData) -> bool {
        return dispatch_text_input_controller_key_down(self, data);
    }
    pub fn dispatch_text(&self, text: &str) -> bool {
        return dispatch_text_input_controller_text(self, text);
    }
    pub fn dispose(&self) {
        dispose_text_input_controller(self);
    }
    pub fn focus(&self) {
        focus_text_input_controller(self);
    }
    pub fn signals(&self) -> Ref<TextInputControllerSignals> {
        return get_text_input_controller_signals(self);
    }
}

impl GuiDialog {
    pub fn active_entry(&self) -> Option<Ref<GuiDialogEntry>> {
        return get_active_gui_dialog_entry(self);
    }
    pub fn close(&self, result: &Ref<GuiDialogCloseResult>) -> bool {
        return close_gui_dialog(self, result);
    }
    pub fn dispose(&self) {
        dispose_gui_dialog(self);
    }
    pub fn enqueue(&self, entry: &Ref<GuiDialogEntry>) -> bool {
        return enqueue_gui_dialog(self, entry);
    }
    pub fn entries(&self, out: &mut Vec<Ref<GuiDialogEntry>>) {
        get_gui_dialog_entries(out, self);
    }
    pub fn remove_entry(&self, id: &str) -> bool {
        return remove_gui_dialog_entry(self, id);
    }
    pub fn signals(&self) -> Ref<GuiDialogSignals> {
        return get_gui_dialog_signals(self);
    }
}
