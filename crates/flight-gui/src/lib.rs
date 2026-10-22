//! Controllers operate on caller-owned visuals; runtime access stays on the contract lane.
mod gui_controller;
mod gui_test_helper;

pub mod contract;
pub use gui_controller::{
    GuiController, GuiControllerOptions, GuiControllerRuntime, GuiFocusSlot, GuiInteractionSlot,
    GuiKeyboardSlot, GuiOrientation, GuiPointerSlot, GuiTransitionDescriptor,
    GuiTransitionProperty, GuiTransitionRequest, GuiTransitionValue, clamp_gui_value,
    configure_gui_hit_area, connect_gui_interaction, connect_gui_signal, create_gui_controller,
    dispose_gui_controller, get_gui_length, get_gui_orientation_string, get_gui_position,
    parse_gui_orientation, set_gui_position, set_gui_scale, set_gui_visible,
    set_gui_visual_property, snap_gui_value,
};
pub use gui_test_helper::*;

mod button_controller;
pub use button_controller::{
    ButtonController, ButtonControllerOptions, ButtonControllerSignals, create_button_controller,
    dispose_button_controller, get_button_controller_signals, is_button_controller_disabled,
    set_button_controller_disabled,
};

mod toggle_controller;
pub use toggle_controller::{
    ToggleController, ToggleControllerOptions, ToggleControllerSignals, create_toggle_controller,
    dispose_toggle_controller, get_toggle_controller_signals, is_toggle_controller_checked,
    set_toggle_controller_checked,
};

mod progress_bar_controller;
pub use progress_bar_controller::{
    ProgressBarController, ProgressBarControllerOptions, create_progress_bar_controller,
    dispose_progress_bar_controller, get_progress_bar_controller_value,
    set_progress_bar_controller_value,
};

mod radio_group_controller;
pub use radio_group_controller::{
    RadioGroupController, RadioGroupControllerOptions, RadioGroupControllerSignals,
    create_radio_group_controller, dispose_radio_group_controller,
    get_radio_group_controller_selected_index, get_radio_group_controller_signals,
    set_radio_group_controller_selected_index,
};

mod tab_bar_controller;
pub use tab_bar_controller::{
    TabBarController, TabBarControllerItem, TabBarControllerOptions, TabBarControllerSignals,
    create_tab_bar_controller, dispose_tab_bar_controller, get_tab_bar_controller_selected_index,
    get_tab_bar_controller_signals, set_tab_bar_controller_selected_index,
};

mod slider_controller;
pub use slider_controller::{
    SliderController, SliderControllerOptions, SliderControllerSignals, create_slider_controller,
    dispose_slider_controller, get_slider_controller_signals, get_slider_controller_value,
    set_slider_controller_value,
};

mod scroll_bar_controller;
pub use scroll_bar_controller::{
    ScrollBarController, ScrollBarControllerOptions, ScrollBarControllerSignals,
    create_scroll_bar_controller, dispose_scroll_bar_controller, get_scroll_bar_controller_signals,
    get_scroll_bar_controller_value, set_scroll_bar_controller_value,
};

mod tooltip_controller;
pub use tooltip_controller::{
    TooltipController, TooltipControllerOptions, create_tooltip_controller,
    dispose_tooltip_controller, hide_tooltip_controller, show_tooltip_controller,
};

mod list_controller;
pub use list_controller::{
    ListController, ListControllerOptions, ListControllerSignals, create_list_controller,
    dispose_list_controller, get_list_controller_selected_index, get_list_controller_signals,
    set_list_controller_selected_index, set_list_controller_visible,
};

mod combo_box_controller;
pub use combo_box_controller::{
    ComboBoxController, ComboBoxControllerOptions, ComboBoxControllerSignals,
    create_combo_box_controller, dispose_combo_box_controller, get_combo_box_controller_signals,
    is_combo_box_controller_open, set_combo_box_controller_open,
};

mod scroll_view_controller;
pub use scroll_view_controller::{
    ScrollViewController, ScrollViewControllerOptions, ScrollViewControllerSignals,
    create_scroll_view_controller, dispose_scroll_view_controller,
    get_scroll_view_controller_signals, get_scroll_view_controller_x, get_scroll_view_controller_y,
    set_scroll_view_controller_position,
};

mod split_pane_controller;
pub use split_pane_controller::{
    SplitPaneController, SplitPaneControllerOptions, SplitPaneControllerSignals,
    create_split_pane_controller, dispose_split_pane_controller,
    get_split_pane_controller_position, get_split_pane_controller_signals,
    set_split_pane_controller_position,
};

mod window_controller;
pub use window_controller::{
    WindowController, WindowControllerOptions, WindowControllerSignals, create_window_controller,
    dispose_window_controller, get_window_controller_signals, set_window_controller_position,
    set_window_controller_size,
};

mod tree_view_controller;
pub use tree_view_controller::{
    TreeViewController, TreeViewControllerItem, TreeViewControllerOptions,
    TreeViewControllerSignals, create_tree_view_controller, dispose_tree_view_controller,
    get_tree_view_controller_selected_item, get_tree_view_controller_signals,
    is_tree_view_controller_item_expanded, set_tree_view_controller_item_expanded,
    set_tree_view_controller_selected_item, toggle_tree_view_controller_item,
};

mod text_input_controller;
pub use text_input_controller::{
    TextInputController, TextInputControllerKeyboardData, TextInputControllerOptions,
    TextInputControllerSignals, blur_text_input_controller, create_text_input_controller,
    dispatch_text_input_controller_key_down, dispatch_text_input_controller_text,
    dispose_text_input_controller, focus_text_input_controller, get_text_input_controller_signals,
};

mod gui_dialog;
pub use gui_dialog::{
    GuiDialog, GuiDialogCloseReason, GuiDialogCloseResult, GuiDialogEntry, GuiDialogOptions,
    GuiDialogSignals, close_gui_dialog, create_gui_dialog, dispose_gui_dialog, enqueue_gui_dialog,
    get_active_gui_dialog_entry, get_gui_dialog_close_reason_string, get_gui_dialog_entries,
    get_gui_dialog_signals, parse_gui_dialog_close_reason, remove_gui_dialog_entry,
};

mod sugar;
pub use sugar::GuiNodeMethods;
