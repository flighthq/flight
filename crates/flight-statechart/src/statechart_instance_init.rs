//! flight-compiler: target-native

use flight_entity::Ref;

use crate::statechart::initialize_statechart_instance_portable;
use crate::types::{StatechartInstanceRaw, StatechartRaw};

pub fn initialize_statechart_instance(out: &mut StatechartInstanceRaw, chart: &Ref<StatechartRaw>) {
    initialize_statechart_instance_portable(out, chart);
}
