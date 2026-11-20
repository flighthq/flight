use std::sync::Arc;

use flight_host::HostExplanation;
use flight_host_net::*;
use flight_net::contract::explain_host_net_capabilities;
use flight_net::send_net_request;

use crate::support::*;

mod create_net_host {
    use super::*;

    #[test]
    fn fills_the_http_slot_with_the_host_provider() {
        let host = create_net_host(None);
        let http = get_net_host_capabilities(&host)
            .http
            .as_ref()
            .expect("http slot");
        assert!(Arc::ptr_eq(&http.provider, get_net_host_provider(&host)));
        assert!(Arc::ptr_eq(
            &get_net_host_capability(&host).provider,
            get_net_host_provider(&host)
        ));
        assert!(!is_net_host_destroyed(&host));
    }

    #[test]
    fn separate_hosts_have_separate_providers() {
        let first = create_net_host(None);
        let second = create_net_host(None);
        assert!(!Arc::ptr_eq(
            get_net_host_provider(&first),
            get_net_host_provider(&second)
        ));
    }
}

mod create_net_host_options {
    use super::*;

    #[test]
    fn defaults_follow_the_fetch_redirect_limit() {
        let options = create_net_host_options();
        assert_eq!(options.redirect_limit, 20);
        assert_eq!(options.max_idle_connections, 10);
    }
}

mod destroy_net_host {
    use super::*;

    #[test]
    fn later_requests_resolve_to_the_destroyed_sentinel_without_sending() {
        let server = start_loopback_server(Arc::new(|_| ok_reply(b"")));
        let mut host = create_net_host(None);
        let capability = get_net_host_capability(&host).clone();
        destroy_net_host(&mut host);
        destroy_net_host(&mut host);
        assert!(is_net_host_destroyed(&host));
        let request = create_get_request(&server.url("/after"));
        let response = block_on_within(
            "destroyed host",
            TEST_DEADLINE,
            send_net_request(&capability, &request, None, &create_unguarded_net_state()),
        )
        .unwrap();
        let explanation = explain_net_host_response(&response.read().unwrap()).unwrap();
        assert_eq!(
            explanation.reason,
            NetHostResponseExplanationReason::HostDestroyed
        );
        assert!(server.received().is_empty());
    }
}

mod destroy_net_host_with_connections {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn closes_idle_connections_and_ends_requests_in_flight() {
        let idle_server = start_loopback_server(Arc::new(|_| ok_reply(b"pooled")));
        let stalled_server = start_loopback_server(Arc::new(|_| Reply::Stall {
            head_and_part: b"HTTP/1.1 200 OK\r\ncontent-length: 100\r\n\r\npart".to_vec(),
            hold: Duration::from_secs(5),
        }));
        let mut host = create_net_host(None);
        let capability = get_net_host_capability(&host).clone();
        let pooled = block_on_within(
            "pooled request",
            TEST_DEADLINE,
            send_net_request(
                &capability,
                &create_get_request(&idle_server.url("/pooled")),
                None,
                &create_unguarded_net_state(),
            ),
        )
        .unwrap();
        assert_eq!(pooled.read().unwrap().status, 200);
        assert_eq!(
            idle_server.closed_by_client(),
            0,
            "the connection should stay pooled"
        );
        let in_flight_capability = capability.clone();
        let stalled_url = stalled_server.url("/stalled");
        let in_flight = std::thread::spawn(move || {
            let request = create_get_request(&stalled_url);
            request.write().unwrap().timeout_ms = None;
            let response = block_on_within(
                "request in flight across destroy",
                TEST_DEADLINE,
                send_net_request(
                    &in_flight_capability,
                    &request,
                    None,
                    &create_unguarded_net_state(),
                ),
            )
            .unwrap();
            return (response.read().unwrap().clone(), Instant::now());
        });
        wait_until(
            "the stalled request reaches its server",
            Duration::from_secs(3),
            || {
                return stalled_server.received().len() == 1;
            },
        );
        std::thread::sleep(Duration::from_millis(50));
        let destroyed_at = Instant::now();
        destroy_net_host(&mut host);
        wait_until(
            "the idle pooled connection closes",
            Duration::from_secs(1),
            || {
                return idle_server.closed_by_client() == 1;
            },
        );
        let (response, resolved_at) = in_flight.join().unwrap();
        assert!(
            resolved_at.duration_since(destroyed_at) < Duration::from_secs(1),
            "the request in flight outlived destroy by {:?}",
            resolved_at.duration_since(destroyed_at)
        );
        assert_eq!(
            explain_net_host_response(&response).map(|explanation| explanation.reason),
            Some(NetHostResponseExplanationReason::HostDestroyed)
        );
    }
}

mod get_net_host_capabilities {
    use super::*;

    #[test]
    fn explains_as_a_present_net_capability() {
        let host = create_net_host(None);
        let mut explanation = HostExplanation {
            capabilities: Vec::new(),
            groups: Vec::new(),
        };
        explain_host_net_capabilities(&mut explanation, get_net_host_capabilities(&host));
        assert_eq!(explanation.groups[0].slots, ["http"]);
        assert!(explanation.capabilities[0].is_present);
    }
}

mod get_net_host_capability {
    use super::*;

    #[test]
    fn clones_share_the_host_lifetime() {
        let mut host = create_net_host(None);
        let clone = get_net_host_capability(&host).clone();
        destroy_net_host(&mut host);
        let request = create_get_request("http://127.0.0.1:9/");
        let response = block_on_within(
            "cloned capability",
            TEST_DEADLINE,
            send_net_request(&clone, &request, None, &create_unguarded_net_state()),
        )
        .unwrap();
        assert_eq!(
            explain_net_host_response(&response.read().unwrap())
                .map(|explanation| explanation.reason),
            Some(NetHostResponseExplanationReason::HostDestroyed)
        );
    }
}

mod get_net_host_provider {
    use super::*;

    #[test]
    fn is_stable_across_calls() {
        let host = create_net_host(None);
        assert!(Arc::ptr_eq(
            get_net_host_provider(&host),
            get_net_host_provider(&host)
        ));
    }
}

mod is_net_host_destroyed {
    use super::*;

    #[test]
    fn reports_destroy() {
        let mut host = create_net_host(None);
        assert!(!is_net_host_destroyed(&host));
        destroy_net_host(&mut host);
        assert!(is_net_host_destroyed(&host));
    }
}
