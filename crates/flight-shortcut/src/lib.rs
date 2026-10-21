mod shortcut;
mod shortcut_explicit_dependency;
mod types;

pub mod contract;

// Public lane: the twenty functions named by pinned TS `index.ts`, the explicit D5 state factory,
// and the locally owned types their signatures require. `initialize_global_shortcut` and D9e
// string-table helpers remain in `contract`.
pub use contract::attach_global_shortcut;
pub use contract::create_global_shortcut;
pub use contract::create_shortcut_state;
pub use contract::destroy_shortcut_trigger;
pub use contract::detach_global_shortcut;
pub use contract::dispose_global_shortcut;
pub use contract::equals_accelerator;
pub use contract::find_accelerator_conflict;
pub use contract::format_accelerator_for_display;
pub use contract::get_accelerator_key;
pub use contract::get_accelerator_key_label;
pub use contract::get_accelerator_modifier_label;
pub use contract::get_accelerator_modifiers;
pub use contract::is_accelerator_valid;
pub use contract::make_parsed_accelerator;
pub use contract::normalize_accelerator;
pub use contract::parse_accelerator;
pub use contract::parse_accelerator_detailed;
pub use contract::query_global_shortcut_conflict;
pub use contract::query_global_shortcut_registration;
pub use contract::resolve_command_or_control_modifier;

pub use contract::Accelerator;
pub use contract::AcceleratorParseError;
pub use contract::AcceleratorParseErrorReason;
pub use contract::CreateGlobalShortcutOutcome;
pub use contract::GlobalShortcut;
pub use contract::GlobalShortcutAttachOutcome;
pub use contract::GlobalShortcutAttachReason;
pub use contract::GlobalShortcutDetachOutcome;
pub use contract::GlobalShortcutDetachReason;
pub use contract::GlobalShortcutQueryOutcome;
pub use contract::GlobalShortcutQueryReason;
pub use contract::HostShortcutCapabilities;
pub use contract::HostShortcutQueryCapability;
pub use contract::HostShortcutTriggerCapability;
pub use contract::ParsedAccelerator;
pub use contract::ShortcutDigitKeyName;
pub use contract::ShortcutEditingKeyName;
pub use contract::ShortcutFunctionKeyName;
pub use contract::ShortcutKeyName;
pub use contract::ShortcutLetterKeyName;
pub use contract::ShortcutLockKeyName;
pub use contract::ShortcutMediaKeyName;
pub use contract::ShortcutModifier;
pub use contract::ShortcutNavigationKeyName;
pub use contract::ShortcutNumpadKeyName;
pub use contract::ShortcutPunctuationKeyName;
pub use contract::ShortcutState;
pub use contract::ShortcutTriggerSubscribeOutcome;
pub use contract::ShortcutTriggerSubscribeReason;
pub use contract::ShortcutTriggerSubscription;
pub use contract::ShortcutTriggerUnsubscribeOutcome;
pub use contract::ShortcutTriggerUnsubscribeReason;

#[cfg(test)]
pub(crate) mod test_support {
    use std::future::Future;
    use std::pin::pin;
    use std::sync::Arc;
    use std::task::{Context, Poll, Wake, Waker};

    struct NoopWake;

    impl Wake for NoopWake {
        fn wake(self: Arc<Self>) {}
    }

    pub(crate) fn block_on<F: Future>(future: F) -> F::Output {
        let waker = Waker::from(Arc::new(NoopWake));
        let mut context = Context::from_waker(&waker);
        let mut future = pin!(future);
        loop {
            if let Poll::Ready(output) = future.as_mut().poll(&mut context) {
                return output;
            }
            std::thread::yield_now();
        }
    }
}
