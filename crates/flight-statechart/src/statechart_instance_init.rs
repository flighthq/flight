//! flight-compiler: target-native

use flight_entity::Ref;

use crate::statechart::initialize_statechart_instance_portable;
use crate::types::{Statechart, StatechartInstance};

pub fn initialize_statechart_instance(out: &mut StatechartInstance, chart: &Ref<Statechart>) {
    initialize_statechart_instance_portable(out, chart);
}
