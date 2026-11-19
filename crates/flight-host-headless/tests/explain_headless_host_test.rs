use flight_host_headless::*;

mod explain_headless_host {
    use super::*;

    #[test]
    fn reports_ready_exactly_when_creation_succeeds() {
        let explanation = explain_headless_host(None);
        let host = create_headless_host(None);
        assert_eq!(
            explanation.reason == HeadlessHostExplanationReason::Ready,
            host.is_some(),
            "{explanation:?}"
        );
        if let Some(mut host) = host {
            assert_eq!(
                explanation.adapter_name,
                get_headless_host_adapter_name(&host)
            );
            assert_eq!(
                explanation.adapter_backend,
                get_headless_host_adapter_backend(&host)
            );
            assert!(explanation.message.is_empty());
            destroy_headless_host(&mut host);
        }
    }

    #[test]
    fn reports_no_adapter_when_no_backend_is_selected() {
        let mut options = create_headless_host_options();
        options.backends = HeadlessHostBackends {
            dx12: false,
            metal: false,
            vulkan: false,
        };
        let explanation = explain_headless_host(Some(&options));
        assert_eq!(explanation.reason, HeadlessHostExplanationReason::NoAdapter);
        assert!(explanation.adapter_name.is_empty());
        assert!(!explanation.message.is_empty());
    }

    #[test]
    fn reports_a_rejected_software_adapter_by_name() {
        let explanation = explain_headless_host(None);
        let Some(mut host) = create_headless_host(None) else {
            eprintln!(
                "SKIPPED reports_a_rejected_software_adapter_by_name: no headless adapter ({:?})",
                explanation.reason
            );
            return;
        };
        let mut options = create_headless_host_options();
        options.allow_software_adapter = false;
        let refused = explain_headless_host(Some(&options));
        if is_headless_host_software_adapter(&host) {
            assert_eq!(
                refused.reason,
                HeadlessHostExplanationReason::SoftwareAdapterRejected
            );
            assert_eq!(refused.adapter_name, get_headless_host_adapter_name(&host));
        } else {
            assert_eq!(refused.reason, HeadlessHostExplanationReason::Ready);
        }
        destroy_headless_host(&mut host);
    }
}
