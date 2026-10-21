//! Free-function contract for methods declared directly on the final-owner MIDI operation records.

use flight_entity::Uint8Array;

use crate::types::*;

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiAccessResourceOperations method
pub async fn attach_midi_access_resource_state_change(
    operations: &MidiAccessResourceOperations,
    listener: MidiAccessStateListener,
) -> MidiEventBackendAttachProviderResult {
    return (operations.attach_state_change)(listener).await;
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiInputPortResourceOperations method
pub async fn attach_midi_input_port_resource_message(
    operations: &MidiInputPortResourceOperations,
    listener: MidiInputMessageListener,
) -> MidiEventBackendAttachProviderResult {
    return (operations.attach_message)(listener).await;
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiInputPortResourceOperations method
pub async fn attach_midi_input_port_resource_state_change(
    operations: &MidiInputPortResourceOperations,
    listener: MidiPortStateListener,
) -> MidiEventBackendAttachProviderResult {
    return (operations.attach_state_change)(listener).await;
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiOutputPortResourceOperations method
pub async fn attach_midi_output_port_resource_state_change(
    operations: &MidiOutputPortResourceOperations,
    listener: MidiPortStateListener,
) -> MidiEventBackendAttachProviderResult {
    return (operations.attach_state_change)(listener).await;
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiPortResourceOperations method
pub async fn attach_midi_port_resource_state_change(
    operations: &MidiPortResourceOperations,
    listener: MidiPortStateListener,
) -> MidiEventBackendAttachProviderResult {
    return (operations.attach_state_change)(listener).await;
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiInputPortResourceOperations method
pub async fn close_midi_input_port_resource(
    operations: &MidiInputPortResourceOperations,
) -> MidiPortCommandResult {
    return (operations.close)().await;
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiOutputPortResourceOperations method
pub async fn close_midi_output_port_resource(
    operations: &MidiOutputPortResourceOperations,
) -> MidiPortCommandResult {
    return (operations.close)().await;
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiPortResourceOperations method
pub async fn close_midi_port_resource(
    operations: &MidiPortResourceOperations,
) -> MidiPortCommandResult {
    return (operations.close)().await;
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiAccessResourceOperations method
pub fn get_midi_access_resource_input_ports(
    operations: &MidiAccessResourceOperations,
) -> MidiInputPortsProviderResult {
    return (operations.get_input_ports)();
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiAccessResourceOperations method
pub fn get_midi_access_resource_output_ports(
    operations: &MidiAccessResourceOperations,
) -> MidiOutputPortsProviderResult {
    return (operations.get_output_ports)();
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiInputPortResourceOperations method
pub fn get_midi_input_port_resource_connection(
    operations: &MidiInputPortResourceOperations,
) -> MidiPortConnectionProviderResult {
    return (operations.get_connection)();
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiOutputPortResourceOperations method
pub fn get_midi_output_port_resource_connection(
    operations: &MidiOutputPortResourceOperations,
) -> MidiPortConnectionProviderResult {
    return (operations.get_connection)();
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiPortResourceOperations method
pub fn get_midi_port_resource_connection(
    operations: &MidiPortResourceOperations,
) -> MidiPortConnectionProviderResult {
    return (operations.get_connection)();
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiInputPortResourceOperations method
pub async fn open_midi_input_port_resource(
    operations: &MidiInputPortResourceOperations,
) -> MidiPortCommandResult {
    return (operations.open)().await;
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiOutputPortResourceOperations method
pub async fn open_midi_output_port_resource(
    operations: &MidiOutputPortResourceOperations,
) -> MidiPortCommandResult {
    return (operations.open)().await;
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiPortResourceOperations method
pub async fn open_midi_port_resource(
    operations: &MidiPortResourceOperations,
) -> MidiPortCommandResult {
    return (operations.open)().await;
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiInputPortResourceOperations method
pub fn read_midi_input_port_resource_state(
    operations: &MidiInputPortResourceOperations,
) -> MidiPortStateProviderResult {
    return (operations.get_state)();
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiOutputPortResourceOperations method
pub fn read_midi_output_port_resource_state(
    operations: &MidiOutputPortResourceOperations,
) -> MidiPortStateProviderResult {
    return (operations.get_state)();
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiPortResourceOperations method
pub fn read_midi_port_resource_state(
    operations: &MidiPortResourceOperations,
) -> MidiPortStateProviderResult {
    return (operations.get_state)();
}

// flight-lint: allow(conform-extra) D18: the source declares this operation as a MidiOutputPortResourceOperations method
// flight-lint: allow(f64) D1: the optional Web MIDI send timestamp preserves fractional milliseconds
pub fn send_midi_output_port_resource(
    operations: &MidiOutputPortResourceOperations,
    data: &Uint8Array,
    timestamp: Option<f64>,
) -> MidiSendProviderResult {
    return (operations.send)(data.to_vec(), timestamp);
}
