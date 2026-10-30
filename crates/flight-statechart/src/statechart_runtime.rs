//! flight-compiler: target-native

use crate::types::{StatechartComparison, StatechartInputKind};

fn flight_statechart_input_kind_label(value: StatechartInputKind) -> &'static str {
    match value {
        StatechartInputKind::Boolean => "Boolean",
        StatechartInputKind::Number => "Number",
        StatechartInputKind::Trigger => "Trigger",
    }
}

pub fn is_statechart_comparison(_value: StatechartComparison) -> bool {
    true
}

pub fn is_statechart_integer(_value: i32) -> bool {
    true
}

pub fn is_statechart_string(_value: &str) -> bool {
    true
}

pub fn throw_statechart_input_kind_type_error(
    input_index: i32,
    kind: StatechartInputKind,
    expected_kind: StatechartInputKind,
) -> ! {
    flight_entity::throw_type_error(&format!(
        "Statechart input {} is {}, not {}",
        input_index,
        flight_statechart_input_kind_label(kind),
        flight_statechart_input_kind_label(expected_kind)
    ));
}

pub fn throw_statechart_type_error(message: &str) -> ! {
    flight_entity::throw_type_error(message);
}

pub fn throw_statechart_unknown_input_kind_type_error(
    input_index: usize,
    kind: StatechartInputKind,
) -> ! {
    flight_entity::throw_type_error(&format!(
        "Statechart input {} has unknown kind {}",
        input_index,
        flight_statechart_input_kind_label(kind)
    ));
}
