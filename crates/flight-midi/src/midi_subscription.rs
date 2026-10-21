use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_signals::{clear_signal, create_signal, emit_signal};
use flight_stream::create_shared_future;

use crate::midi_resource::{
    get_midi_access_resource_state, get_midi_input_port_resource_state,
    get_midi_port_resource_state, get_midi_subscription_runtime, release_midi_event_attachment,
    retain_midi_subscription_runtime,
};
use crate::types::*;

pub fn create_midi_access_state_subscription() -> Ref<MidiAccessStateSubscription> {
    let mut out: MidiAccessStateSubscription = allocate_entity();
    initialize_midi_access_state_subscription(&mut out);
    retain_midi_subscription_runtime(&mut out);
    return Arc::new(RwLock::new(out));
}

pub fn create_midi_input_message_subscription() -> Ref<MidiInputMessageSubscription> {
    let mut out: MidiInputMessageSubscription = allocate_entity();
    initialize_midi_input_message_subscription(&mut out);
    retain_midi_subscription_runtime(&mut out);
    return Arc::new(RwLock::new(out));
}

pub fn create_midi_port_state_subscription() -> Ref<MidiPortStateSubscription> {
    let mut out: MidiPortStateSubscription = allocate_entity();
    initialize_midi_port_state_subscription(&mut out);
    retain_midi_subscription_runtime(&mut out);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_midi_access_state_subscription(out: &mut MidiAccessStateSubscription) {
    out.on_midi_access_state_change = create_signal();
}

pub fn initialize_midi_input_message_subscription(out: &mut MidiInputMessageSubscription) {
    out.on_midi_input_message = create_signal();
}

pub fn initialize_midi_port_state_subscription(out: &mut MidiPortStateSubscription) {
    out.on_midi_port_state_change = create_signal();
}

fn attach_failure() -> MidiSubscriptionAttachOutcome {
    return MidiSubscriptionAttachOutcome {
        attach_failed: Some(true),
        reason: MidiSubscriptionAttachReason::OperationFailed,
        release_failed: Some(false),
    };
}

pub async fn attach_midi_access_state_subscription(
    access: &Ref<MidiAccess>,
    subscription: &Ref<MidiAccessStateSubscription>,
) -> MidiSubscriptionAttachOutcome {
    let Some(owner) = get_midi_access_resource_state(access) else {
        return attach_failure();
    };
    let (attach_state_change, signal) = {
        let state = owner.read().unwrap();
        if state.disposed {
            return attach_failure();
        }
        let signal = subscription
            .read()
            .unwrap()
            .on_midi_access_state_change
            .clone();
        (state.operations.attach_state_change.clone(), signal)
    };
    let Some(runtime) = get_midi_subscription_runtime(subscription) else {
        return attach_failure();
    };
    let weak_owner = Arc::downgrade(&owner);
    let listener: MidiAccessStateListener = Arc::new(move |port: &MidiPort| {
        if let Some(owner) = weak_owner.upgrade() {
            let mut state = owner.write().unwrap();
            if !state.known_ports.iter().any(|candidate| candidate == port) {
                state.known_ports.push(port.clone());
            }
        }
        emit_signal(&signal, port);
    });
    let attach = Arc::new(move || (attach_state_change)(listener.clone()));
    let weak_owner = Arc::downgrade(&owner);
    let weak_subscription = Arc::downgrade(subscription);
    let track_subscription = subscription.clone();
    let track_owner = owner.clone();
    let track: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
        let mut state = track_owner.write().unwrap();
        if !state
            .subscriptions
            .iter()
            .any(|candidate| Arc::ptr_eq(candidate, &track_subscription))
        {
            state.subscriptions.push(track_subscription.clone());
        }
    });
    let untrack: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
        if let (Some(owner), Some(subscription)) =
            (weak_owner.upgrade(), weak_subscription.upgrade())
        {
            owner
                .write()
                .unwrap()
                .subscriptions
                .retain(|candidate| !Arc::ptr_eq(candidate, &subscription));
        }
    });
    return attach_midi_subscription(&runtime, track, untrack, attach).await;
}

// flight-lint: allow(f64) D1: the native MIDI listener preserves fractional millisecond event timestamps
pub async fn attach_midi_input_message_subscription(
    input: &Ref<MidiInputPort>,
    subscription: &Ref<MidiInputMessageSubscription>,
) -> MidiSubscriptionAttachOutcome {
    let Some(owner) = get_midi_input_port_resource_state(input) else {
        return attach_failure();
    };
    let (attach_message, signal) = {
        let state = owner.read().unwrap();
        let MidiPortResourceState::Input(state) = &*state else {
            return attach_failure();
        };
        if state.disposed {
            return attach_failure();
        }
        let signal = subscription.read().unwrap().on_midi_input_message.clone();
        (state.operations.attach_message.clone(), signal)
    };
    let Some(runtime) = get_midi_subscription_runtime(subscription) else {
        return attach_failure();
    };
    let listener: MidiInputMessageListener = Arc::new(move |data, timestamp| {
        emit_signal(
            &signal,
            &MidiInputMessage {
                data: data.to_vec().into_boxed_slice(),
                timestamp,
            },
        );
    });
    let attach = Arc::new(move || (attach_message)(listener.clone()));
    let weak_owner = Arc::downgrade(&owner);
    let weak_subscription = Arc::downgrade(subscription);
    let track_subscription = subscription.clone();
    let track_owner = owner.clone();
    let track: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
        let mut state = track_owner.write().unwrap();
        if let MidiPortResourceState::Input(state) = &mut *state
            && !state
                .message_subscriptions
                .iter()
                .any(|candidate| Arc::ptr_eq(candidate, &track_subscription))
        {
            state.message_subscriptions.push(track_subscription.clone());
        }
    });
    let untrack: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
        if let (Some(owner), Some(subscription)) =
            (weak_owner.upgrade(), weak_subscription.upgrade())
        {
            if let MidiPortResourceState::Input(state) = &mut *owner.write().unwrap() {
                state
                    .message_subscriptions
                    .retain(|candidate| !Arc::ptr_eq(candidate, &subscription));
            }
        }
    });
    return attach_midi_subscription(&runtime, track, untrack, attach).await;
}

pub async fn attach_midi_port_state_subscription(
    port: &MidiPort,
    subscription: &Ref<MidiPortStateSubscription>,
) -> MidiSubscriptionAttachOutcome {
    let Some(owner) = get_midi_port_resource_state(port) else {
        return attach_failure();
    };
    let (attach_state_change, signal) = {
        let state = owner.read().unwrap();
        if state.disposed() {
            return attach_failure();
        }
        let operation = match &*state {
            MidiPortResourceState::Input(state) => state.operations.attach_state_change.clone(),
            MidiPortResourceState::Output(state) => state.operations.attach_state_change.clone(),
        };
        let signal = subscription
            .read()
            .unwrap()
            .on_midi_port_state_change
            .clone();
        (operation, signal)
    };
    let Some(runtime) = get_midi_subscription_runtime(subscription) else {
        return attach_failure();
    };
    let emitted_port = port.clone();
    let listener: MidiPortStateListener = Arc::new(move || {
        emit_signal(&signal, &emitted_port);
    });
    let attach = Arc::new(move || (attach_state_change)(listener.clone()));
    let weak_owner = Arc::downgrade(&owner);
    let weak_subscription = Arc::downgrade(subscription);
    let track_subscription = subscription.clone();
    let track_owner = owner.clone();
    let track: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
        let mut owner = track_owner.write().unwrap();
        let subscriptions = match &mut *owner {
            MidiPortResourceState::Input(state) => &mut state.state_subscriptions,
            MidiPortResourceState::Output(state) => &mut state.state_subscriptions,
        };
        if !subscriptions
            .iter()
            .any(|candidate| Arc::ptr_eq(candidate, &track_subscription))
        {
            subscriptions.push(track_subscription.clone());
        }
    });
    let untrack: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
        if let (Some(owner), Some(subscription)) =
            (weak_owner.upgrade(), weak_subscription.upgrade())
        {
            let mut owner = owner.write().unwrap();
            let subscriptions = match &mut *owner {
                MidiPortResourceState::Input(state) => &mut state.state_subscriptions,
                MidiPortResourceState::Output(state) => &mut state.state_subscriptions,
            };
            subscriptions.retain(|candidate| !Arc::ptr_eq(candidate, &subscription));
        }
    });
    return attach_midi_subscription(&runtime, track, untrack, attach).await;
}

async fn attach_midi_subscription(
    runtime: &Ref<MidiSubscriptionRuntime>,
    track: Arc<dyn Fn() + Send + Sync>,
    untrack: Arc<dyn Fn() + Send + Sync>,
    attach: Arc<dyn Fn() -> MidiEventBackendAttachFuture + Send + Sync>,
) -> MidiSubscriptionAttachOutcome {
    loop {
        let attaching = {
            let mut state = runtime.write().unwrap();
            if state.disposed {
                return attach_failure();
            }
            if state.attaching.is_some() {
                state.generation += 1;
            }
            state.attaching.clone().zip(state.attaching_generation)
        };
        if let Some((attaching, attaching_generation)) = attaching {
            let _ = attaching.await;
            let mut state = runtime.write().unwrap();
            if state.attaching_generation == Some(attaching_generation) {
                state.attaching = None;
                state.attaching_generation = None;
            }
            continue;
        }
        if runtime.read().unwrap().attachment.is_some() {
            let detached = detach_midi_subscription(runtime).await;
            if detached.reason == MidiSubscriptionDetachReason::OperationFailed {
                return MidiSubscriptionAttachOutcome {
                    attach_failed: Some(false),
                    reason: MidiSubscriptionAttachReason::OperationFailed,
                    release_failed: Some(true),
                };
            }
            continue;
        }
        let installed = {
            let mut state = runtime.write().unwrap();
            if state.disposed {
                return attach_failure();
            }
            if state.attaching.is_some() || state.attachment.is_some() {
                None
            } else {
                state.generation += 1;
                let generation = state.generation;
                state.untrack = Some(untrack.clone());
                let target = runtime.clone();
                let attach = attach.clone();
                let pending = create_shared_future(Box::pin(async move {
                    return perform_midi_attach(&target, generation, attach).await;
                }));
                state.attaching = Some(pending.clone());
                state.attaching_generation = Some(generation);
                track();
                Some((generation, pending))
            }
        };
        let Some((generation, pending)) = installed else {
            continue;
        };
        let outcome = pending.await;
        let mut state = runtime.write().unwrap();
        if state.attaching_generation == Some(generation) {
            state.attaching = None;
            state.attaching_generation = None;
        }
        return outcome;
    }
}

pub async fn detach_midi_access_state_subscription(
    subscription: &Ref<MidiAccessStateSubscription>,
) -> MidiSubscriptionDetachOutcome {
    let Some(runtime) = get_midi_subscription_runtime(subscription) else {
        return MidiSubscriptionDetachOutcome {
            reason: MidiSubscriptionDetachReason::NotAttached,
            release_failed: None,
        };
    };
    return detach_midi_subscription(&runtime).await;
}

pub async fn detach_midi_input_message_subscription(
    subscription: &Ref<MidiInputMessageSubscription>,
) -> MidiSubscriptionDetachOutcome {
    let Some(runtime) = get_midi_subscription_runtime(subscription) else {
        return MidiSubscriptionDetachOutcome {
            reason: MidiSubscriptionDetachReason::NotAttached,
            release_failed: None,
        };
    };
    return detach_midi_subscription(&runtime).await;
}

pub async fn detach_midi_port_state_subscription(
    subscription: &Ref<MidiPortStateSubscription>,
) -> MidiSubscriptionDetachOutcome {
    let Some(runtime) = get_midi_subscription_runtime(subscription) else {
        return MidiSubscriptionDetachOutcome {
            reason: MidiSubscriptionDetachReason::NotAttached,
            release_failed: None,
        };
    };
    return detach_midi_subscription(&runtime).await;
}

async fn detach_midi_subscription(
    runtime: &Ref<MidiSubscriptionRuntime>,
) -> MidiSubscriptionDetachOutcome {
    let attaching = {
        let mut state = runtime.write().unwrap();
        state.generation += 1;
        state.attaching.clone()
    };
    let mut invalidated_attach = false;
    if let Some(attaching) = attaching {
        let outcome = attaching.await;
        if outcome.reason == MidiSubscriptionAttachReason::OperationFailed
            && outcome.release_failed == Some(true)
        {
            return MidiSubscriptionDetachOutcome {
                reason: MidiSubscriptionDetachReason::OperationFailed,
                release_failed: Some(true),
            };
        }
        invalidated_attach = outcome.reason == MidiSubscriptionAttachReason::Ok;
    }
    if runtime.read().unwrap().attachment.is_none() {
        return MidiSubscriptionDetachOutcome {
            reason: if invalidated_attach {
                MidiSubscriptionDetachReason::Ok
            } else {
                MidiSubscriptionDetachReason::NotAttached
            },
            release_failed: None,
        };
    }
    if !release_tracked_midi_attachment(runtime).await {
        return MidiSubscriptionDetachOutcome {
            reason: MidiSubscriptionDetachReason::OperationFailed,
            release_failed: Some(true),
        };
    }
    return MidiSubscriptionDetachOutcome {
        reason: MidiSubscriptionDetachReason::Ok,
        release_failed: None,
    };
}

pub async fn dispose_midi_access_state_subscription(
    subscription: &Ref<MidiAccessStateSubscription>,
) -> MidiSubscriptionDisposeOutcome {
    let signal = subscription
        .read()
        .unwrap()
        .on_midi_access_state_change
        .clone();
    let Some(runtime) = get_midi_subscription_runtime(subscription) else {
        return MidiSubscriptionDisposeOutcome {
            attach_failed: None,
            reason: MidiSubscriptionDisposeReason::AlreadyDisposed,
            release_failed: None,
        };
    };
    let clear: Arc<dyn Fn() + Send + Sync> = Arc::new(move || clear_signal(&signal));
    return dispose_midi_subscription(&runtime, clear).await;
}

pub async fn dispose_midi_input_message_subscription(
    subscription: &Ref<MidiInputMessageSubscription>,
) -> MidiSubscriptionDisposeOutcome {
    let signal = subscription.read().unwrap().on_midi_input_message.clone();
    let Some(runtime) = get_midi_subscription_runtime(subscription) else {
        return MidiSubscriptionDisposeOutcome {
            attach_failed: None,
            reason: MidiSubscriptionDisposeReason::AlreadyDisposed,
            release_failed: None,
        };
    };
    let clear: Arc<dyn Fn() + Send + Sync> = Arc::new(move || clear_signal(&signal));
    return dispose_midi_subscription(&runtime, clear).await;
}

pub async fn dispose_midi_port_state_subscription(
    subscription: &Ref<MidiPortStateSubscription>,
) -> MidiSubscriptionDisposeOutcome {
    let signal = subscription
        .read()
        .unwrap()
        .on_midi_port_state_change
        .clone();
    let Some(runtime) = get_midi_subscription_runtime(subscription) else {
        return MidiSubscriptionDisposeOutcome {
            attach_failed: None,
            reason: MidiSubscriptionDisposeReason::AlreadyDisposed,
            release_failed: None,
        };
    };
    let clear: Arc<dyn Fn() + Send + Sync> = Arc::new(move || clear_signal(&signal));
    return dispose_midi_subscription(&runtime, clear).await;
}

async fn dispose_midi_subscription(
    runtime: &Ref<MidiSubscriptionRuntime>,
    clear: Arc<dyn Fn() + Send + Sync>,
) -> MidiSubscriptionDisposeOutcome {
    let attaching = {
        let mut state = runtime.write().unwrap();
        if state.dispose_completed {
            return MidiSubscriptionDisposeOutcome {
                attach_failed: None,
                reason: MidiSubscriptionDisposeReason::AlreadyDisposed,
                release_failed: None,
            };
        }
        state.disposed = true;
        state.generation += 1;
        state.attaching.clone()
    };
    let mut attach_failed = false;
    let mut release_failed = false;
    if let Some(attaching) = attaching {
        let outcome = attaching.await;
        if outcome.reason == MidiSubscriptionAttachReason::OperationFailed {
            attach_failed = outcome.attach_failed.unwrap_or(false);
            release_failed = outcome.release_failed.unwrap_or(false);
        }
    }
    if !release_failed {
        let detached = detach_midi_subscription(runtime).await;
        if detached.reason == MidiSubscriptionDetachReason::OperationFailed {
            release_failed = true;
        }
    }
    clear();
    if attach_failed || release_failed {
        return MidiSubscriptionDisposeOutcome {
            attach_failed: Some(attach_failed),
            reason: MidiSubscriptionDisposeReason::OperationFailed,
            release_failed: Some(release_failed),
        };
    }
    runtime.write().unwrap().dispose_completed = true;
    return MidiSubscriptionDisposeOutcome {
        attach_failed: None,
        reason: MidiSubscriptionDisposeReason::Ok,
        release_failed: None,
    };
}

async fn perform_midi_attach(
    runtime: &Ref<MidiSubscriptionRuntime>,
    generation: u64,
    attach: Arc<dyn Fn() -> MidiEventBackendAttachFuture + Send + Sync>,
) -> MidiSubscriptionAttachOutcome {
    let outcome = match attach().await {
        Ok(outcome) => outcome,
        Err(_) => {
            untrack_midi_subscription(runtime);
            return attach_failure();
        }
    };
    if outcome.reason == MidiEventBackendAttachReason::OperationFailed {
        untrack_midi_subscription(runtime);
        return MidiSubscriptionAttachOutcome {
            attach_failed: Some(true),
            reason: MidiSubscriptionAttachReason::OperationFailed,
            release_failed: outcome.release_failed,
        };
    }
    let stale = {
        let mut state = runtime.write().unwrap();
        state.attachment = outcome.attachment;
        state.disposed || state.generation != generation
    };
    if stale {
        if release_tracked_midi_attachment(runtime).await {
            return MidiSubscriptionAttachOutcome {
                attach_failed: None,
                reason: MidiSubscriptionAttachReason::Ok,
                release_failed: None,
            };
        }
        return MidiSubscriptionAttachOutcome {
            attach_failed: Some(false),
            reason: MidiSubscriptionAttachReason::OperationFailed,
            release_failed: Some(true),
        };
    }
    return MidiSubscriptionAttachOutcome {
        attach_failed: None,
        reason: MidiSubscriptionAttachReason::Ok,
        release_failed: None,
    };
}

async fn release_tracked_midi_attachment(runtime: &Ref<MidiSubscriptionRuntime>) -> bool {
    let Some(attachment) = runtime.read().unwrap().attachment.clone() else {
        return false;
    };
    let released = matches!(
        release_midi_event_attachment(&attachment).await,
        Ok(MidiEventReleaseOutcome {
            reason: MidiEventReleaseReason::Ok
        })
    );
    if !released {
        return false;
    }
    let untrack = {
        let mut state = runtime.write().unwrap();
        if state
            .attachment
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, &attachment))
        {
            state.attachment = None;
            state.untrack.take()
        } else {
            None
        }
    };
    if let Some(untrack) = untrack {
        untrack();
    }
    return true;
}

fn untrack_midi_subscription(runtime: &Ref<MidiSubscriptionRuntime>) {
    let untrack = runtime.write().unwrap().untrack.take();
    if let Some(untrack) = untrack {
        untrack();
    }
}
