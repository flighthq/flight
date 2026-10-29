use flight_textinput::contract::*;

mod common;

pub fn create_default_rich_text() -> flight_entity::Ref<flight_text::RichText> {
    return flight_text::create_rich_text(None);
}

#[path = "selectable_rich_text_manager_test.rs"]
mod flight_textinput_selectable_rich_text_manager_test;
#[path = "text_input_editing_test.rs"]
mod flight_textinput_text_input_editing_test;
#[path = "text_input_manager_test.rs"]
mod flight_textinput_text_input_manager_test;
#[path = "text_input_test.rs"]
mod flight_textinput_text_input_test;
