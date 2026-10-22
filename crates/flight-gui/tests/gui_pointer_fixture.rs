use flight_gui::GuiPointerOptions;
pub fn pointer_fields() -> GuiPointerOptions {
    return GuiPointerOptions {
        alt_key: None,
        button: None,
        buttons: None,
        ctrl_key: None,
        current_target: None,
        delta_x: None,
        delta_y: None,
        local_x: None,
        local_y: None,
        meta_key: None,
        pointer_id: None,
        pointer_type: None,
        shift_key: None,
        x: None,
        y: None,
        target: None,
        world_x: None,
        world_y: None,
    };
}
