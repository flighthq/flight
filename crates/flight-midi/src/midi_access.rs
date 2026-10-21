use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_stream::create_shared_future;

use crate::midi_port::dispose_midi_port;
use crate::midi_resource::{get_midi_access_resource_state, retain_midi_access_resource_state};
use crate::midi_subscription::dispose_midi_access_state_subscription;
use crate::types::*;

/// Provider-contract constructor. Native MIDIAccess identity remains in provider-local state; the
/// returned Entity handle owns only its exact operation record and cleanup ledger.
pub fn create_midi_access_resource(operations: MidiAccessResourceOperations) -> Ref<MidiAccess> {
    let mut out: MidiAccess = allocate_entity();
    initialize_midi_access_resource(&mut out);
    retain_midi_access_resource_state(&mut out, operations);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_midi_access_resource(_out: &mut MidiAccess) {}

pub async fn dispose_midi_access(access: &Ref<MidiAccess>) -> MidiAccessDisposeOutcome {
    let Some(state) = get_midi_access_resource_state(access) else {
        return MidiAccessDisposeOutcome {
            failures: None,
            reason: MidiAccessDisposeReason::AlreadyDisposed,
        };
    };
    let (generation, pending) = {
        let mut state = state.write().unwrap();
        if state.dispose_completed {
            return MidiAccessDisposeOutcome {
                failures: None,
                reason: MidiAccessDisposeReason::AlreadyDisposed,
            };
        }
        if let Some(pending) = &state.dispose_pending {
            (state.dispose_generation, pending.clone())
        } else {
            state.disposed = true;
            state.dispose_generation += 1;
            let generation = state.dispose_generation;
            let target = access.clone();
            let pending = create_shared_future(Box::pin(async move {
                return dispose_midi_access_known_ports(&target).await;
            }));
            state.dispose_pending = Some(pending.clone());
            (generation, pending)
        }
    };
    let outcome = pending.await;
    let mut state = state.write().unwrap();
    if state.dispose_generation == generation {
        state.dispose_pending = None;
    }
    return outcome;
}

async fn dispose_midi_access_known_ports(access: &Ref<MidiAccess>) -> MidiAccessDisposeOutcome {
    let Some(state) = get_midi_access_resource_state(access) else {
        return MidiAccessDisposeOutcome {
            failures: None,
            reason: MidiAccessDisposeReason::AlreadyDisposed,
        };
    };
    let subscriptions = state.read().unwrap().subscriptions.clone();
    let mut failures = Vec::new();
    for subscription in subscriptions {
        let outcome = dispose_midi_access_state_subscription(&subscription).await;
        if outcome.reason == MidiSubscriptionDisposeReason::OperationFailed
            && outcome.release_failed == Some(true)
        {
            failures.push(MidiAccessLifecycleFailure {
                id: None,
                operation: MidiPortLifecycleFailureOperation::StateSubscriptionRelease,
                type_: None,
            });
        } else {
            let mut state = state.write().unwrap();
            state
                .subscriptions
                .retain(|candidate| !Arc::ptr_eq(candidate, &subscription));
        }
    }
    let ports = state.read().unwrap().known_ports.clone();
    for port in ports {
        let (id, type_) = match &port {
            MidiPort::Input(port) => {
                let port = port.read().unwrap();
                (port.id.clone(), MidiPortType::Input)
            }
            MidiPort::Output(port) => {
                let port = port.read().unwrap();
                (port.id.clone(), MidiPortType::Output)
            }
        };
        let outcome = dispose_midi_port(&port).await;
        if outcome.reason == MidiPortDisposeReason::OperationFailed {
            for failure in outcome.failures.unwrap_or_default() {
                failures.push(MidiAccessLifecycleFailure {
                    id: Some(id.clone()),
                    operation: failure.operation,
                    type_: Some(type_),
                });
            }
        } else {
            let mut state = state.write().unwrap();
            state.known_ports.retain(|candidate| candidate != &port);
        }
    }
    if !failures.is_empty() {
        return MidiAccessDisposeOutcome {
            failures: Some(failures),
            reason: MidiAccessDisposeReason::OperationFailed,
        };
    }
    state.write().unwrap().dispose_completed = true;
    return MidiAccessDisposeOutcome {
        failures: None,
        reason: MidiAccessDisposeReason::Ok,
    };
}

pub fn get_midi_access_input_ports(
    access: &Ref<MidiAccess>,
) -> MidiAccessPortsOutcome<MidiInputPort> {
    let Some(state) = get_midi_access_resource_state(access) else {
        return MidiAccessPortsOutcome {
            ports: None,
            reason: MidiAccessPortsReason::OperationFailed,
        };
    };
    let operation = {
        let state = state.read().unwrap();
        if state.disposed {
            return MidiAccessPortsOutcome {
                ports: None,
                reason: MidiAccessPortsReason::Disposed,
            };
        }
        state.operations.get_input_ports.clone()
    };
    let ports = match operation() {
        Ok(ports) => ports,
        Err(_) => {
            return MidiAccessPortsOutcome {
                ports: None,
                reason: MidiAccessPortsReason::OperationFailed,
            };
        }
    };
    {
        let mut state = state.write().unwrap();
        for port in &ports {
            push_midi_access_port(&mut state.known_ports, MidiPort::Input(port.clone()));
        }
    }
    return MidiAccessPortsOutcome {
        ports: Some(ports),
        reason: MidiAccessPortsReason::Ok,
    };
}

pub fn get_midi_access_output_ports(
    access: &Ref<MidiAccess>,
) -> MidiAccessPortsOutcome<MidiOutputPort> {
    let Some(state) = get_midi_access_resource_state(access) else {
        return MidiAccessPortsOutcome {
            ports: None,
            reason: MidiAccessPortsReason::OperationFailed,
        };
    };
    let operation = {
        let state = state.read().unwrap();
        if state.disposed {
            return MidiAccessPortsOutcome {
                ports: None,
                reason: MidiAccessPortsReason::Disposed,
            };
        }
        state.operations.get_output_ports.clone()
    };
    let ports = match operation() {
        Ok(ports) => ports,
        Err(_) => {
            return MidiAccessPortsOutcome {
                ports: None,
                reason: MidiAccessPortsReason::OperationFailed,
            };
        }
    };
    {
        let mut state = state.write().unwrap();
        for port in &ports {
            push_midi_access_port(&mut state.known_ports, MidiPort::Output(port.clone()));
        }
    }
    return MidiAccessPortsOutcome {
        ports: Some(ports),
        reason: MidiAccessPortsReason::Ok,
    };
}

fn push_midi_access_port(ports: &mut Vec<MidiPort>, port: MidiPort) {
    if !ports.iter().any(|candidate| candidate == &port) {
        ports.push(port);
    }
}

pub async fn request_midi_access(
    host_midi_access: &HostMidiAccessCapability,
) -> MidiAccessRequestOutcome {
    return match (host_midi_access.request_access)().await {
        Ok(outcome) => outcome,
        Err(_) => MidiAccessRequestOutcome {
            access: None,
            reason: MidiAccessRequestReason::OperationFailed,
        },
    };
}
