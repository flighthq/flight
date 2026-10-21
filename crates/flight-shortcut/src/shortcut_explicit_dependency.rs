use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_signals::{clear_signal, create_signal, emit_signal};

use crate::shortcut::{
    format_parsed_accelerator, make_parsed_accelerator, parse_accelerator_detailed,
};
use crate::types::*;

struct PendingRegistrationGuard {
    accelerator: Accelerator,
    armed: bool,
    registration_id: u64,
    shortcut: Ref<GlobalShortcut>,
    state: ShortcutState,
}

/// Creates a shortcut Entity only after the accelerator parses and normalizes successfully.
pub fn create_global_shortcut(accelerator: &str) -> CreateGlobalShortcutOutcome {
    let mut parsed = make_parsed_accelerator();
    if let Some(parse_error) = parse_accelerator_detailed(&mut parsed, accelerator) {
        return CreateGlobalShortcutOutcome::Unparseable(CreateGlobalShortcutOutcomeUnparseable {
            parse_error,
        });
    }
    let mut out: GlobalShortcut = allocate_entity();
    initialize_global_shortcut(&mut out, format_parsed_accelerator(&parsed));
    return CreateGlobalShortcutOutcome::Created(CreateGlobalShortcutOutcomeCreated {
        shortcut: Arc::new(RwLock::new(out)),
    });
}

/// Creates one explicit registration domain in place of the source module's hidden maps.
// flight-lint: allow(conform-extra) D5: Rust makes mutable module-global registration state explicit and caller-owned
pub fn create_shortcut_state() -> ShortcutState {
    return ShortcutState::default();
}

/// Initializes a shortcut under construction with its normalized chord and private signal.
pub fn initialize_global_shortcut(out: &mut GlobalShortcut, accelerator: Accelerator) {
    out.accelerator = accelerator;
    out.on_trigger = create_signal();
    out.attachment = None;
    out.pending_registration_id = None;
}

/// Acquires a native shortcut registration without retaining a lock across the provider await.
// flight-lint: allow(conform-params) D5: explicit state replaces the source module's semantic globals
pub async fn attach_global_shortcut(
    state: &ShortcutState,
    host_shortcut_trigger: &HostShortcutTriggerCapability,
    shortcut: &Ref<GlobalShortcut>,
) -> GlobalShortcutAttachOutcome {
    let (accelerator, signal) = {
        let shortcut = shortcut.read().unwrap();
        if shortcut.attachment.is_some() {
            return GlobalShortcutAttachOutcome {
                reason: GlobalShortcutAttachReason::AlreadyAttached,
            };
        }
        if shortcut.pending_registration_id.is_some() {
            return GlobalShortcutAttachOutcome {
                reason: GlobalShortcutAttachReason::RegistrationInProgress,
            };
        }
        (shortcut.accelerator.clone(), shortcut.on_trigger.clone())
    };

    let registration_id = {
        let mut state_data = state.data.lock().unwrap();
        if state_data
            .attached_by_accelerator
            .contains_key(&accelerator)
        {
            return GlobalShortcutAttachOutcome {
                reason: GlobalShortcutAttachReason::AlreadyRegistered,
            };
        }
        if state_data.pending_accelerators.contains_key(&accelerator) {
            return GlobalShortcutAttachOutcome {
                reason: GlobalShortcutAttachReason::RegistrationInProgress,
            };
        }
        let mut shortcut_data = shortcut.write().unwrap();
        if shortcut_data.attachment.is_some() {
            return GlobalShortcutAttachOutcome {
                reason: GlobalShortcutAttachReason::AlreadyAttached,
            };
        }
        if shortcut_data.pending_registration_id.is_some() {
            return GlobalShortcutAttachOutcome {
                reason: GlobalShortcutAttachReason::RegistrationInProgress,
            };
        }
        state_data.next_registration_id = state_data.next_registration_id.wrapping_add(1).max(1);
        let registration_id = state_data.next_registration_id;
        state_data
            .pending_accelerators
            .insert(accelerator.clone(), registration_id);
        shortcut_data.pending_registration_id = Some(registration_id);
        registration_id
    };

    let mut guard = PendingRegistrationGuard {
        accelerator: accelerator.clone(),
        armed: true,
        registration_id,
        shortcut: shortcut.clone(),
        state: state.clone(),
    };
    let listener: ShortcutTriggerListener = Arc::new(move || emit_signal(&signal, &()));
    let subscribe_outcome = match (host_shortcut_trigger.subscribe)(&accelerator, listener).await {
        Ok(outcome) => outcome,
        Err(_) => {
            return GlobalShortcutAttachOutcome {
                reason: GlobalShortcutAttachReason::TriggerProviderFailed,
            };
        }
    };
    let subscription = match subscribe_outcome {
        ShortcutTriggerSubscribeOutcome::Refused(_) => {
            return GlobalShortcutAttachOutcome {
                reason: GlobalShortcutAttachReason::NativeRefused,
            };
        }
        ShortcutTriggerSubscribeOutcome::Subscribed(outcome) => outcome.subscription,
    };

    let finalized = {
        let mut state_data = state.data.lock().unwrap();
        let mut shortcut_data = shortcut.write().unwrap();
        let reservation_is_current = state_data.pending_accelerators.get(&accelerator)
            == Some(&registration_id)
            && shortcut_data.pending_registration_id == Some(registration_id)
            && shortcut_data.attachment.is_none()
            && !state_data
                .attached_by_accelerator
                .contains_key(&accelerator);
        if reservation_is_current {
            state_data.pending_accelerators.remove(&accelerator);
            shortcut_data.pending_registration_id = None;
            shortcut_data.attachment = Some(GlobalShortcutAttachment {
                provider: host_shortcut_trigger.clone(),
                registration_id,
                state: Arc::downgrade(&state.data),
                subscription: subscription.clone(),
            });
            state_data
                .attached_by_accelerator
                .insert(accelerator.clone(), shortcut.clone());
        }
        reservation_is_current
    };
    if !finalized {
        let _ = (host_shortcut_trigger.unsubscribe)(&subscription).await;
        return GlobalShortcutAttachOutcome {
            reason: GlobalShortcutAttachReason::TriggerProviderFailed,
        };
    }
    guard.armed = false;
    return GlobalShortcutAttachOutcome {
        reason: GlobalShortcutAttachReason::Attached,
    };
}

/// Destroys all registrations owned by the exact supplied provider.
pub async fn destroy_shortcut_trigger(
    host_shortcut_trigger: &HostShortcutTriggerCapability,
) -> ShortcutTriggerDestroyResult {
    return (host_shortcut_trigger.destroy)().await;
}

/// Releases an attached shortcut through its origin provider, retaining failures for exact retry.
pub async fn detach_global_shortcut(
    host_shortcut_trigger: &HostShortcutTriggerCapability,
    shortcut: &Ref<GlobalShortcut>,
) -> GlobalShortcutDetachOutcome {
    let (accelerator, attachment) = {
        let shortcut = shortcut.read().unwrap();
        let Some(attachment) = shortcut.attachment.clone() else {
            return GlobalShortcutDetachOutcome {
                reason: GlobalShortcutDetachReason::NotAttached,
            };
        };
        (shortcut.accelerator.clone(), attachment)
    };
    let provider = select_trigger_provider(host_shortcut_trigger, &attachment.provider);
    let unsubscribe_outcome = match (provider.unsubscribe)(&attachment.subscription).await {
        Ok(outcome) => outcome,
        Err(_) => {
            return GlobalShortcutDetachOutcome {
                reason: GlobalShortcutDetachReason::TriggerProviderFailed,
            };
        }
    };
    if unsubscribe_outcome.reason != ShortcutTriggerUnsubscribeReason::Unsubscribed {
        return GlobalShortcutDetachOutcome {
            reason: GlobalShortcutDetachReason::TriggerProviderFailed,
        };
    }

    let removed = {
        let mut shortcut_data = shortcut.write().unwrap();
        let is_current = shortcut_data.attachment.as_ref().is_some_and(|current| {
            current.registration_id == attachment.registration_id
                && Arc::ptr_eq(&current.subscription, &attachment.subscription)
        });
        if is_current {
            shortcut_data.attachment = None;
        }
        is_current
    };
    if removed && let Some(state) = attachment.state.upgrade() {
        let mut state_data = state.lock().unwrap();
        let points_to_shortcut = state_data
            .attached_by_accelerator
            .get(&accelerator)
            .is_some_and(|current| Arc::ptr_eq(current, shortcut));
        if points_to_shortcut {
            state_data.attached_by_accelerator.remove(&accelerator);
        }
    }
    return GlobalShortcutDetachOutcome {
        reason: GlobalShortcutDetachReason::Detached,
    };
}

/// Releases native state and always clears consumer listeners, even when release fails.
pub async fn dispose_global_shortcut(
    host_shortcut_trigger: &HostShortcutTriggerCapability,
    shortcut: &Ref<GlobalShortcut>,
) -> GlobalShortcutDetachOutcome {
    let signal = shortcut.read().unwrap().on_trigger.clone();
    let outcome = detach_global_shortcut(host_shortcut_trigger, shortcut).await;
    clear_signal(&signal);
    return outcome;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS CreateGlobalShortcutOutcome reason union
pub fn get_create_global_shortcut_reason_string(value: CreateGlobalShortcutReason) -> &'static str {
    return match value {
        CreateGlobalShortcutReason::Created => "created",
        CreateGlobalShortcutReason::Unparseable => "unparseable",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS GlobalShortcutAttachOutcome reason union
pub fn get_global_shortcut_attach_reason_string(value: GlobalShortcutAttachReason) -> &'static str {
    return match value {
        GlobalShortcutAttachReason::AlreadyAttached => "already-attached",
        GlobalShortcutAttachReason::AlreadyRegistered => "already-registered",
        GlobalShortcutAttachReason::Attached => "attached",
        GlobalShortcutAttachReason::NativeRefused => "native-refused",
        GlobalShortcutAttachReason::RegistrationInProgress => "registration-in-progress",
        GlobalShortcutAttachReason::TriggerProviderFailed => "trigger-provider-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS GlobalShortcutDetachOutcome reason union
pub fn get_global_shortcut_detach_reason_string(value: GlobalShortcutDetachReason) -> &'static str {
    return match value {
        GlobalShortcutDetachReason::Detached => "detached",
        GlobalShortcutDetachReason::NotAttached => "not-attached",
        GlobalShortcutDetachReason::TriggerProviderFailed => "trigger-provider-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS GlobalShortcutQueryOutcome reason union
pub fn get_global_shortcut_query_reason_string(value: GlobalShortcutQueryReason) -> &'static str {
    return match value {
        GlobalShortcutQueryReason::NotRegistered => "not-registered",
        GlobalShortcutQueryReason::QueryProviderFailed => "query-provider-failed",
        GlobalShortcutQueryReason::Registered => "registered",
        GlobalShortcutQueryReason::Unparseable => "unparseable",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShortcutTriggerSubscribeOutcome reason union
pub fn get_shortcut_trigger_subscribe_reason_string(
    value: ShortcutTriggerSubscribeReason,
) -> &'static str {
    return match value {
        ShortcutTriggerSubscribeReason::Refused => "refused",
        ShortcutTriggerSubscribeReason::Subscribed => "subscribed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShortcutTriggerUnsubscribeOutcome reason union
pub fn get_shortcut_trigger_unsubscribe_reason_string(
    value: ShortcutTriggerUnsubscribeReason,
) -> &'static str {
    return match value {
        ShortcutTriggerUnsubscribeReason::UnknownSubscription => "unknown-subscription",
        ShortcutTriggerUnsubscribeReason::Unsubscribed => "unsubscribed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS CreateGlobalShortcutOutcome reason union
pub fn parse_create_global_shortcut_reason(value: &str) -> Option<CreateGlobalShortcutReason> {
    return match value {
        "created" => Some(CreateGlobalShortcutReason::Created),
        "unparseable" => Some(CreateGlobalShortcutReason::Unparseable),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS GlobalShortcutAttachOutcome reason union
pub fn parse_global_shortcut_attach_reason(value: &str) -> Option<GlobalShortcutAttachReason> {
    return match value {
        "already-attached" => Some(GlobalShortcutAttachReason::AlreadyAttached),
        "already-registered" => Some(GlobalShortcutAttachReason::AlreadyRegistered),
        "attached" => Some(GlobalShortcutAttachReason::Attached),
        "native-refused" => Some(GlobalShortcutAttachReason::NativeRefused),
        "registration-in-progress" => Some(GlobalShortcutAttachReason::RegistrationInProgress),
        "trigger-provider-failed" => Some(GlobalShortcutAttachReason::TriggerProviderFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS GlobalShortcutDetachOutcome reason union
pub fn parse_global_shortcut_detach_reason(value: &str) -> Option<GlobalShortcutDetachReason> {
    return match value {
        "detached" => Some(GlobalShortcutDetachReason::Detached),
        "not-attached" => Some(GlobalShortcutDetachReason::NotAttached),
        "trigger-provider-failed" => Some(GlobalShortcutDetachReason::TriggerProviderFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS GlobalShortcutQueryOutcome reason union
pub fn parse_global_shortcut_query_reason(value: &str) -> Option<GlobalShortcutQueryReason> {
    return match value {
        "not-registered" => Some(GlobalShortcutQueryReason::NotRegistered),
        "query-provider-failed" => Some(GlobalShortcutQueryReason::QueryProviderFailed),
        "registered" => Some(GlobalShortcutQueryReason::Registered),
        "unparseable" => Some(GlobalShortcutQueryReason::Unparseable),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS ShortcutTriggerSubscribeOutcome reason union
pub fn parse_shortcut_trigger_subscribe_reason(
    value: &str,
) -> Option<ShortcutTriggerSubscribeReason> {
    return match value {
        "refused" => Some(ShortcutTriggerSubscribeReason::Refused),
        "subscribed" => Some(ShortcutTriggerSubscribeReason::Subscribed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS ShortcutTriggerUnsubscribeOutcome reason union
pub fn parse_shortcut_trigger_unsubscribe_reason(
    value: &str,
) -> Option<ShortcutTriggerUnsubscribeReason> {
    return match value {
        "unknown-subscription" => Some(ShortcutTriggerUnsubscribeReason::UnknownSubscription),
        "unsubscribed" => Some(ShortcutTriggerUnsubscribeReason::Unsubscribed),
        _ => None,
    };
}

/// Queries the native registration witness after validating and normalizing the accelerator.
pub async fn query_global_shortcut_conflict(
    host_shortcut_query: &HostShortcutQueryCapability,
    accelerator: &str,
) -> GlobalShortcutQueryOutcome {
    return query_global_shortcut_registration(host_shortcut_query, accelerator).await;
}

/// Queries the native registration witness after validating and normalizing the accelerator.
pub async fn query_global_shortcut_registration(
    host_shortcut_query: &HostShortcutQueryCapability,
    accelerator: &str,
) -> GlobalShortcutQueryOutcome {
    let mut parsed = make_parsed_accelerator();
    if let Some(parse_error) = parse_accelerator_detailed(&mut parsed, accelerator) {
        return GlobalShortcutQueryOutcome::Unparseable(GlobalShortcutQueryOutcomeUnparseable {
            parse_error,
        });
    }
    return match (host_shortcut_query.is_registered)(&format_parsed_accelerator(&parsed)).await {
        Ok(true) => GlobalShortcutQueryOutcome::Registered(GlobalShortcutQueryOutcomeRegistered {}),
        Ok(false) => {
            GlobalShortcutQueryOutcome::NotRegistered(GlobalShortcutQueryOutcomeNotRegistered {})
        }
        Err(_) => GlobalShortcutQueryOutcome::QueryProviderFailed(
            GlobalShortcutQueryOutcomeQueryProviderFailed {},
        ),
    };
}

fn release_pending_registration(
    state: &ShortcutState,
    shortcut: &Ref<GlobalShortcut>,
    accelerator: &str,
    registration_id: u64,
) {
    let mut state_data = state.data.lock().unwrap();
    if state_data.pending_accelerators.get(accelerator) == Some(&registration_id) {
        state_data.pending_accelerators.remove(accelerator);
    }
    let mut shortcut_data = shortcut.write().unwrap();
    if shortcut_data.pending_registration_id == Some(registration_id) {
        shortcut_data.pending_registration_id = None;
    }
}

fn select_trigger_provider(
    selected: &HostShortcutTriggerCapability,
    origin: &HostShortcutTriggerCapability,
) -> HostShortcutTriggerCapability {
    return if Arc::ptr_eq(&selected.provider, &origin.provider) {
        selected.clone()
    } else {
        origin.clone()
    };
}

// flight-lint: allow(sugar-delegates) RAII is the Rust representation of source `finally` cleanup when an async Future is cancelled
impl Drop for PendingRegistrationGuard {
    fn drop(&mut self) {
        if self.armed {
            release_pending_registration(
                &self.state,
                &self.shortcut,
                &self.accelerator,
                self.registration_id,
            );
        }
    }
}
