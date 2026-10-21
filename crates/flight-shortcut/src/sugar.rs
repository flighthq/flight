use flight_entity::Ref;
use flight_platform::PlatformName;

use crate::shortcut::*;
use crate::shortcut_explicit_dependency::*;
use crate::shortcut_key_name::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, RwLock};

    use super::*;
    use crate::test_support::block_on;

    fn shortcut(accelerator: &str) -> Ref<GlobalShortcut> {
        let CreateGlobalShortcutOutcome::Created(outcome) = create_global_shortcut(accelerator)
        else {
            panic!("expected shortcut to parse");
        };
        return outcome.shortcut;
    }

    fn trigger_provider() -> HostShortcutTriggerCapability {
        return HostShortcutTriggerCapability {
            provider: Arc::new(()),
            destroy: Arc::new(|| Box::pin(async { Ok(()) })),
            subscribe: Arc::new(|_, _| {
                let subscription = Arc::new(RwLock::new(flight_entity::allocate_entity()));
                Box::pin(async move {
                    Ok(ShortcutTriggerSubscribeOutcome::Subscribed(
                        ShortcutTriggerSubscribeOutcomeSubscribed { subscription },
                    ))
                })
            }),
            unsubscribe: Arc::new(|_| {
                Box::pin(async {
                    Ok(ShortcutTriggerUnsubscribeOutcome {
                        reason: ShortcutTriggerUnsubscribeReason::Unsubscribed,
                    })
                })
            }),
        };
    }

    fn query_reason(outcome: GlobalShortcutQueryOutcome) -> GlobalShortcutQueryReason {
        return match outcome {
            GlobalShortcutQueryOutcome::NotRegistered(_) => {
                GlobalShortcutQueryReason::NotRegistered
            }
            GlobalShortcutQueryOutcome::QueryProviderFailed(_) => {
                GlobalShortcutQueryReason::QueryProviderFailed
            }
            GlobalShortcutQueryOutcome::Registered(_) => GlobalShortcutQueryReason::Registered,
            GlobalShortcutQueryOutcome::Unparseable(_) => GlobalShortcutQueryReason::Unparseable,
        };
    }

    #[test]
    fn host_query_conflict_matches_free_function() {
        let host = HostShortcutQueryCapability {
            provider: Arc::new(()),
            is_registered: Arc::new(|_| Box::pin(async { Ok(true) })),
        };
        let method = block_on(host.query_conflict("ctrl+q"));
        let free = block_on(query_global_shortcut_conflict(&host, "ctrl+q"));
        assert_eq!(query_reason(method), query_reason(free));
    }

    #[test]
    fn host_query_registration_matches_free_function() {
        let host = HostShortcutQueryCapability {
            provider: Arc::new(()),
            is_registered: Arc::new(|_| Box::pin(async { Ok(false) })),
        };
        let method = block_on(host.query_registration("ctrl+q"));
        let free = block_on(query_global_shortcut_registration(&host, "ctrl+q"));
        assert_eq!(query_reason(method), query_reason(free));
    }

    #[test]
    fn host_trigger_destroy_matches_free_function() {
        let calls = Arc::new(AtomicUsize::new(0));
        let mut host = trigger_provider();
        host.destroy = Arc::new({
            let calls = calls.clone();
            move || {
                calls.fetch_add(1, Ordering::SeqCst);
                Box::pin(async { Ok(()) })
            }
        });
        assert!(block_on(host.destroy()).is_ok());
        assert!(block_on(destroy_shortcut_trigger(&host)).is_ok());
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn host_trigger_detach_matches_free_function() {
        let host = trigger_provider();
        let method_shortcut = shortcut("Control+D");
        let free_shortcut = shortcut("Control+F");
        block_on(attach_global_shortcut(
            &create_shortcut_state(),
            &host,
            &method_shortcut,
        ));
        block_on(attach_global_shortcut(
            &create_shortcut_state(),
            &host,
            &free_shortcut,
        ));
        let method = block_on(host.detach(&method_shortcut));
        let free = block_on(detach_global_shortcut(&host, &free_shortcut));
        assert_eq!(method.reason, free.reason);
    }

    #[test]
    fn host_trigger_dispose_matches_free_function() {
        let host = trigger_provider();
        let method_shortcut = shortcut("Control+G");
        let free_shortcut = shortcut("Control+H");
        block_on(attach_global_shortcut(
            &create_shortcut_state(),
            &host,
            &method_shortcut,
        ));
        block_on(attach_global_shortcut(
            &create_shortcut_state(),
            &host,
            &free_shortcut,
        ));
        let method = block_on(host.dispose(&method_shortcut));
        let free = block_on(dispose_global_shortcut(&host, &free_shortcut));
        assert_eq!(method.reason, free.reason);
    }

    #[test]
    fn parsed_accelerator_new_matches_free_function() {
        assert_eq!(ParsedAccelerator::new(), make_parsed_accelerator());
    }

    #[test]
    fn parsed_accelerator_parse_matches_free_function() {
        let mut method = ParsedAccelerator::new();
        let mut free = make_parsed_accelerator();
        assert_eq!(
            method.parse("shift+ctrl+k"),
            parse_accelerator(&mut free, "shift+ctrl+k")
        );
        assert_eq!(method, free);
    }

    #[test]
    fn parsed_accelerator_parse_detailed_matches_free_function() {
        let mut method = ParsedAccelerator::new();
        let mut free = make_parsed_accelerator();
        assert_eq!(
            method.parse_detailed("Control+NotAKey"),
            parse_accelerator_detailed(&mut free, "Control+NotAKey")
        );
        assert_eq!(method, free);
    }

    #[test]
    fn shortcut_key_label_matches_free_function() {
        assert_eq!(
            ShortcutKeyName::ArrowUp.label(),
            get_accelerator_key_label(ShortcutKeyName::ArrowUp)
        );
    }

    #[test]
    fn shortcut_digit_key_name_to_key_name_matches_free_function() {
        assert_eq!(
            ShortcutDigitKeyName::Digit7.to_key_name(),
            shortcut_digit_key_name_to_key_name(ShortcutDigitKeyName::Digit7)
        );
    }

    #[test]
    fn shortcut_editing_key_name_to_key_name_matches_free_function() {
        assert_eq!(
            ShortcutEditingKeyName::Return.to_key_name(),
            shortcut_editing_key_name_to_key_name(ShortcutEditingKeyName::Return)
        );
    }

    #[test]
    fn shortcut_function_key_name_to_key_name_matches_free_function() {
        assert_eq!(
            ShortcutFunctionKeyName::F24.to_key_name(),
            shortcut_function_key_name_to_key_name(ShortcutFunctionKeyName::F24)
        );
    }

    #[test]
    fn shortcut_key_name_to_digit_key_name_matches_free_function() {
        assert_eq!(
            ShortcutKeyName::Digit7.to_digit_key_name(),
            shortcut_key_name_to_digit_key_name(ShortcutKeyName::Digit7)
        );
    }

    #[test]
    fn shortcut_key_name_to_editing_key_name_matches_free_function() {
        assert_eq!(
            ShortcutKeyName::Return.to_editing_key_name(),
            shortcut_key_name_to_editing_key_name(ShortcutKeyName::Return)
        );
    }

    #[test]
    fn shortcut_key_name_to_function_key_name_matches_free_function() {
        assert_eq!(
            ShortcutKeyName::F24.to_function_key_name(),
            shortcut_key_name_to_function_key_name(ShortcutKeyName::F24)
        );
    }

    #[test]
    fn shortcut_key_name_to_letter_key_name_matches_free_function() {
        assert_eq!(
            ShortcutKeyName::Q.to_letter_key_name(),
            shortcut_key_name_to_letter_key_name(ShortcutKeyName::Q)
        );
    }

    #[test]
    fn shortcut_key_name_to_lock_key_name_matches_free_function() {
        assert_eq!(
            ShortcutKeyName::CapsLock.to_lock_key_name(),
            shortcut_key_name_to_lock_key_name(ShortcutKeyName::CapsLock)
        );
    }

    #[test]
    fn shortcut_key_name_to_media_key_name_matches_free_function() {
        assert_eq!(
            ShortcutKeyName::VolumeMute.to_media_key_name(),
            shortcut_key_name_to_media_key_name(ShortcutKeyName::VolumeMute)
        );
    }

    #[test]
    fn shortcut_key_name_to_navigation_key_name_matches_free_function() {
        assert_eq!(
            ShortcutKeyName::ArrowUp.to_navigation_key_name(),
            shortcut_key_name_to_navigation_key_name(ShortcutKeyName::ArrowUp)
        );
    }

    #[test]
    fn shortcut_key_name_to_numpad_key_name_matches_free_function() {
        assert_eq!(
            ShortcutKeyName::NumpadEnter.to_numpad_key_name(),
            shortcut_key_name_to_numpad_key_name(ShortcutKeyName::NumpadEnter)
        );
    }

    #[test]
    fn shortcut_key_name_to_punctuation_key_name_matches_free_function() {
        assert_eq!(
            ShortcutKeyName::Semicolon.to_punctuation_key_name(),
            shortcut_key_name_to_punctuation_key_name(ShortcutKeyName::Semicolon)
        );
    }

    #[test]
    fn shortcut_letter_key_name_to_key_name_matches_free_function() {
        assert_eq!(
            ShortcutLetterKeyName::Q.to_key_name(),
            shortcut_letter_key_name_to_key_name(ShortcutLetterKeyName::Q)
        );
    }

    #[test]
    fn shortcut_lock_key_name_to_key_name_matches_free_function() {
        assert_eq!(
            ShortcutLockKeyName::CapsLock.to_key_name(),
            shortcut_lock_key_name_to_key_name(ShortcutLockKeyName::CapsLock)
        );
    }

    #[test]
    fn shortcut_media_key_name_to_key_name_matches_free_function() {
        assert_eq!(
            ShortcutMediaKeyName::VolumeMute.to_key_name(),
            shortcut_media_key_name_to_key_name(ShortcutMediaKeyName::VolumeMute)
        );
    }

    #[test]
    fn shortcut_navigation_key_name_to_key_name_matches_free_function() {
        assert_eq!(
            ShortcutNavigationKeyName::ArrowUp.to_key_name(),
            shortcut_navigation_key_name_to_key_name(ShortcutNavigationKeyName::ArrowUp)
        );
    }

    #[test]
    fn shortcut_numpad_key_name_to_key_name_matches_free_function() {
        assert_eq!(
            ShortcutNumpadKeyName::NumpadEnter.to_key_name(),
            shortcut_numpad_key_name_to_key_name(ShortcutNumpadKeyName::NumpadEnter)
        );
    }

    #[test]
    fn shortcut_punctuation_key_name_to_key_name_matches_free_function() {
        assert_eq!(
            ShortcutPunctuationKeyName::Semicolon.to_key_name(),
            shortcut_punctuation_key_name_to_key_name(ShortcutPunctuationKeyName::Semicolon)
        );
    }

    #[test]
    fn shortcut_modifier_label_matches_free_function() {
        assert_eq!(
            ShortcutModifier::CommandOrControl.label(PlatformName::MacOs),
            get_accelerator_modifier_label(ShortcutModifier::CommandOrControl, PlatformName::MacOs)
        );
    }

    #[test]
    fn shortcut_state_attach_matches_free_function() {
        let host = trigger_provider();
        let method_state = ShortcutState::new();
        let free_state = create_shortcut_state();
        let method = block_on(method_state.attach(&host, &shortcut("Control+M")));
        let free = block_on(attach_global_shortcut(
            &free_state,
            &host,
            &shortcut("Control+N"),
        ));
        assert_eq!(method.reason, free.reason);
    }

    #[test]
    fn shortcut_state_new_matches_free_function() {
        assert_eq!(
            format!("{:?}", ShortcutState::new()),
            format!("{:?}", create_shortcut_state())
        );
    }
}

impl HostShortcutQueryCapability {
    pub async fn query_conflict(&self, accelerator: &str) -> GlobalShortcutQueryOutcome {
        return query_global_shortcut_conflict(self, accelerator).await;
    }

    pub async fn query_registration(&self, accelerator: &str) -> GlobalShortcutQueryOutcome {
        return query_global_shortcut_registration(self, accelerator).await;
    }
}

impl HostShortcutTriggerCapability {
    pub async fn destroy(&self) -> ShortcutTriggerDestroyResult {
        return destroy_shortcut_trigger(self).await;
    }

    pub async fn detach(&self, shortcut: &Ref<GlobalShortcut>) -> GlobalShortcutDetachOutcome {
        return detach_global_shortcut(self, shortcut).await;
    }

    pub async fn dispose(&self, shortcut: &Ref<GlobalShortcut>) -> GlobalShortcutDetachOutcome {
        return dispose_global_shortcut(self, shortcut).await;
    }
}

impl ParsedAccelerator {
    pub fn new() -> Self {
        return make_parsed_accelerator();
    }

    pub fn parse(&mut self, input: &str) -> bool {
        return parse_accelerator(self, input);
    }

    pub fn parse_detailed(&mut self, input: &str) -> Option<AcceleratorParseError> {
        return parse_accelerator_detailed(self, input);
    }
}

impl ShortcutDigitKeyName {
    pub fn to_key_name(self) -> ShortcutKeyName {
        return shortcut_digit_key_name_to_key_name(self);
    }
}

impl ShortcutEditingKeyName {
    pub fn to_key_name(self) -> ShortcutKeyName {
        return shortcut_editing_key_name_to_key_name(self);
    }
}

impl ShortcutFunctionKeyName {
    pub fn to_key_name(self) -> ShortcutKeyName {
        return shortcut_function_key_name_to_key_name(self);
    }
}

impl ShortcutKeyName {
    pub fn label(self) -> String {
        return get_accelerator_key_label(self);
    }

    pub fn to_digit_key_name(self) -> Option<ShortcutDigitKeyName> {
        return shortcut_key_name_to_digit_key_name(self);
    }

    pub fn to_editing_key_name(self) -> Option<ShortcutEditingKeyName> {
        return shortcut_key_name_to_editing_key_name(self);
    }

    pub fn to_function_key_name(self) -> Option<ShortcutFunctionKeyName> {
        return shortcut_key_name_to_function_key_name(self);
    }

    pub fn to_letter_key_name(self) -> Option<ShortcutLetterKeyName> {
        return shortcut_key_name_to_letter_key_name(self);
    }

    pub fn to_lock_key_name(self) -> Option<ShortcutLockKeyName> {
        return shortcut_key_name_to_lock_key_name(self);
    }

    pub fn to_media_key_name(self) -> Option<ShortcutMediaKeyName> {
        return shortcut_key_name_to_media_key_name(self);
    }

    pub fn to_navigation_key_name(self) -> Option<ShortcutNavigationKeyName> {
        return shortcut_key_name_to_navigation_key_name(self);
    }

    pub fn to_numpad_key_name(self) -> Option<ShortcutNumpadKeyName> {
        return shortcut_key_name_to_numpad_key_name(self);
    }

    pub fn to_punctuation_key_name(self) -> Option<ShortcutPunctuationKeyName> {
        return shortcut_key_name_to_punctuation_key_name(self);
    }
}

impl ShortcutLetterKeyName {
    pub fn to_key_name(self) -> ShortcutKeyName {
        return shortcut_letter_key_name_to_key_name(self);
    }
}

impl ShortcutLockKeyName {
    pub fn to_key_name(self) -> ShortcutKeyName {
        return shortcut_lock_key_name_to_key_name(self);
    }
}

impl ShortcutMediaKeyName {
    pub fn to_key_name(self) -> ShortcutKeyName {
        return shortcut_media_key_name_to_key_name(self);
    }
}

impl ShortcutNavigationKeyName {
    pub fn to_key_name(self) -> ShortcutKeyName {
        return shortcut_navigation_key_name_to_key_name(self);
    }
}

impl ShortcutNumpadKeyName {
    pub fn to_key_name(self) -> ShortcutKeyName {
        return shortcut_numpad_key_name_to_key_name(self);
    }
}

impl ShortcutPunctuationKeyName {
    pub fn to_key_name(self) -> ShortcutKeyName {
        return shortcut_punctuation_key_name_to_key_name(self);
    }
}

impl ShortcutModifier {
    pub fn label(self, platform: PlatformName) -> String {
        return get_accelerator_modifier_label(self, platform);
    }
}

impl ShortcutState {
    pub fn new() -> Self {
        return create_shortcut_state();
    }

    pub async fn attach(
        &self,
        host_shortcut_trigger: &HostShortcutTriggerCapability,
        shortcut: &Ref<GlobalShortcut>,
    ) -> GlobalShortcutAttachOutcome {
        return attach_global_shortcut(self, host_shortcut_trigger, shortcut).await;
    }
}
