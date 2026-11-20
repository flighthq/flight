//! The net capability against a server the test starts on loopback: bytes, methods, headers,
//! statuses, bodies, redirects, timeouts, aborts and transport failures. No external network.

use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use flight_entity::{Record, Ref, get_record_value};
use flight_host_net::*;
use flight_net::{
    NetBody, NetProgress, NetProgressPhase, NetRedirect, NetRequest, NetRequestOptions,
    NetResponse, NetResponseBody, NetResponseExplanationReason, NetResponseType,
    explain_net_response, send_net_request,
};
use flight_signals::{Signal, connect_signal, create_signal};
use flight_stream::{abort_controller, create_abort_controller};

use crate::support::*;

fn fetch(
    host: &NetHost,
    request: &Ref<NetRequest>,
    options: Option<&Ref<NetRequestOptions>>,
) -> NetResponse {
    let label = request.read().unwrap().url.clone();
    let response = block_on_within(
        &label,
        TEST_DEADLINE,
        send_net_request(
            get_net_host_capability(host),
            request,
            options,
            &create_unguarded_net_state(),
        ),
    )
    .expect("the net host resolves every request to a response");
    return response.read().unwrap().clone();
}

fn assert_host_failure(response: &NetResponse, reason: NetHostResponseExplanationReason) {
    let explanation = explain_net_host_response(response).unwrap_or_else(|| {
        panic!(
            "expected a {reason:?} failure, got status {} with status text {:?}",
            response.status, response.status_text
        )
    });
    assert_eq!(explanation.reason, reason);
    assert_eq!(response.status, 0);
    assert!(!response.ok);
    assert!(response.body.is_none());
}

fn get_header(response: &NetResponse, name: &str) -> Option<String> {
    return get_record_value(&response.headers.read().unwrap(), name).cloned();
}

mod loopback_fetch {
    use super::*;

    #[test]
    fn get_returns_the_served_bytes_exactly() {
        let payload = generate_payload(256 * 1024 + 17);
        let served = payload.clone();
        let server = start_loopback_server(Arc::new(move |_| ok_reply(&served)));
        let host = create_net_host(None);
        let request = create_get_request(&server.url("/payload.bin"));
        request.write().unwrap().response_type = Some(NetResponseType::ArrayBuffer);
        let response = fetch(&host, &request, None);
        assert_eq!(
            response.status, 200,
            "status text {:?}",
            response.status_text
        );
        assert!(response.ok);
        assert_eq!(response.status_text, "OK");
        assert_eq!(response.url, server.url("/payload.bin"));
        let bytes = get_response_bytes(&response);
        assert_eq!(bytes.len(), payload.len());
        if let Some(index) = bytes
            .iter()
            .zip(&payload)
            .position(|(got, want)| got != want)
        {
            panic!("first differing byte at offset {index}");
        }
        let received = server.received();
        assert_eq!(received.len(), 1);
        assert_eq!(received[0].method, "GET");
        assert_eq!(received[0].path, "/payload.bin");
        assert!(received[0].body.is_empty());
    }

    #[test]
    fn requests_share_the_pool_and_each_resolve_independently() {
        let server = start_loopback_server(Arc::new(|request| ok_reply(request.path.as_bytes())));
        let host = create_net_host(None);
        for index in 0..4 {
            let path = format!("/item/{index}");
            let response = fetch(&host, &create_get_request(&server.url(&path)), None);
            assert_eq!(
                response
                    .body
                    .as_ref()
                    .map(|_| get_response_bytes(&response)),
                Some(path.into_bytes())
            );
        }
        assert_eq!(server.received().len(), 4);
    }
}

mod methods_and_bodies {
    use super::*;

    #[test]
    fn post_sends_the_text_body_with_the_default_content_type() {
        let server = start_loopback_server(Arc::new(|_| ok_reply(b"stored")));
        let host = create_net_host(None);
        let request = create_get_request(&server.url("/form"));
        {
            let mut request = request.write().unwrap();
            request.method = "post".to_string();
            request.body = create_text_body("name=flight&size=2");
        }
        let response = fetch(&host, &request, None);
        assert_eq!(response.status, 200);
        let received = &server.received()[0];
        assert_eq!(received.method, "POST", "standard methods are upper-cased");
        assert_eq!(received.body, b"name=flight&size=2");
        assert_eq!(
            received.header("content-type"),
            Some("text/plain;charset=UTF-8")
        );
    }

    #[test]
    fn identifies_the_host_rather_than_the_backing_library() {
        let server = start_loopback_server(Arc::new(|_| ok_reply(b"")));
        let host = create_net_host(None);
        fetch(&host, &create_get_request(&server.url("/agent")), None);
        assert_eq!(
            server.received()[0].header("user-agent"),
            Some("flight-host-net")
        );
    }

    #[test]
    fn caller_content_type_and_headers_are_sent_unchanged() {
        let server = start_loopback_server(Arc::new(|_| ok_reply(b"")));
        let host = create_net_host(None);
        let request = create_get_request(&server.url("/json"));
        {
            let mut request = request.write().unwrap();
            request.method = "PUT".to_string();
            request.headers = Some(create_headers(&[
                ("Content-Type", "application/json"),
                ("X-Flight-Trace", "abc 123"),
            ]));
            request.body = create_text_body("{\"a\":1}");
        }
        fetch(&host, &request, None);
        let received = &server.received()[0];
        assert_eq!(received.method, "PUT");
        assert_eq!(received.header("content-type"), Some("application/json"));
        assert_eq!(received.header("x-flight-trace"), Some("abc 123"));
        assert_eq!(received.body, b"{\"a\":1}");
    }

    #[test]
    fn buffer_and_view_bodies_send_their_bytes() {
        let server = start_loopback_server(Arc::new(|_| ok_reply(b"")));
        let host = create_net_host(None);
        let payload = generate_payload(300);
        let buffer =
            flight_buffer::create_array_buffer_from_bytes(payload.clone().into_boxed_slice());
        let view = flight_buffer::create_array_buffer_view(
            &buffer,
            10,
            20,
            flight_buffer::ArrayBufferViewKind::Uint8Array,
        )
        .unwrap();
        for body in [NetBody::Buffer(buffer.clone()), NetBody::View(view)] {
            let request = create_get_request(&server.url("/upload"));
            request.write().unwrap().method = "POST".to_string();
            request.write().unwrap().body = Some(Some(body));
            assert_eq!(fetch(&host, &request, None).status, 200);
        }
        let received = server.received();
        assert_eq!(received[0].body, payload);
        assert_eq!(received[1].body, &payload[10..30]);
        assert_eq!(received[0].header("content-type"), None);
    }

    #[test]
    fn extension_methods_keep_their_case() {
        let server = start_loopback_server(Arc::new(|_| ok_reply(b"")));
        let host = create_net_host(None);
        for method in ["PATCH", "PROPFIND", "Patch"] {
            let request = create_get_request(&server.url("/resource"));
            request.write().unwrap().method = method.to_string();
            assert_eq!(fetch(&host, &request, None).status, 200, "method {method}");
        }
        let methods: Vec<String> = server
            .received()
            .into_iter()
            .map(|request| request.method)
            .collect();
        assert_eq!(methods, ["PATCH", "PROPFIND", "Patch"]);
    }

    #[test]
    fn head_returns_headers_without_a_body() {
        let server = start_loopback_server(Arc::new(|_| ok_reply(b"not sent for head")));
        let host = create_net_host(None);
        let request = create_get_request(&server.url("/head"));
        request.write().unwrap().method = "HEAD".to_string();
        let response = fetch(&host, &request, None);
        assert_eq!(response.status, 200);
        assert_eq!(
            get_header(&response, "content-length").as_deref(),
            Some("17")
        );
        assert!(matches!(&response.body, Some(NetResponseBody::Text(text)) if text.is_empty()));
    }

    #[test]
    fn a_body_on_get_or_head_is_rejected_without_sending() {
        let server = start_loopback_server(Arc::new(|_| ok_reply(b"")));
        let host = create_net_host(None);
        for method in ["GET", "head"] {
            let request = create_get_request(&server.url("/never"));
            request.write().unwrap().method = method.to_string();
            request.write().unwrap().body = create_text_body("x");
            assert_host_failure(
                &fetch(&host, &request, None),
                NetHostResponseExplanationReason::InvalidRequest,
            );
        }
        let request = create_get_request(&server.url("/null-body"));
        request.write().unwrap().body = Some(None);
        assert_eq!(
            fetch(&host, &request, None).status,
            200,
            "an explicit null body is no body"
        );
        assert_eq!(server.received().len(), 1);
    }
}

mod responses {
    use super::*;

    #[test]
    fn error_statuses_are_responses_not_failures() {
        let server = start_loopback_server(Arc::new(|request| Reply::Full {
            status: if request.path == "/missing" { 404 } else { 503 },
            reason: "Ignored Phrase",
            headers: vec![],
            body: b"problem".to_vec(),
        }));
        let host = create_net_host(None);
        let missing = fetch(&host, &create_get_request(&server.url("/missing")), None);
        assert_eq!(missing.status, 404);
        assert!(!missing.ok);
        assert_eq!(missing.status_text, "Not Found");
        assert!(matches!(&missing.body, Some(NetResponseBody::Text(text)) if text == "problem"));
        assert_eq!(explain_net_response(&missing), None);
        assert_eq!(explain_net_host_response(&missing), None);
        let unavailable = fetch(&host, &create_get_request(&server.url("/busy")), None);
        assert_eq!(unavailable.status, 503);
        assert_eq!(unavailable.status_text, "Service Unavailable");
    }

    #[test]
    fn header_names_are_lowercased_and_repeats_joined() {
        let server = start_loopback_server(Arc::new(|_| Reply::Full {
            status: 200,
            reason: "OK",
            headers: vec![
                ("X-Repeat", "one".to_string()),
                ("X-Repeat", "two".to_string()),
                ("Content-Type", "Text/Plain".to_string()),
            ],
            body: b"".to_vec(),
        }));
        let host = create_net_host(None);
        let response = fetch(&host, &create_get_request(&server.url("/headers")), None);
        assert_eq!(
            get_header(&response, "x-repeat").as_deref(),
            Some("one, two")
        );
        assert_eq!(
            get_header(&response, "content-type").as_deref(),
            Some("Text/Plain")
        );
        assert_eq!(get_header(&response, "X-Repeat"), None);
    }

    #[test]
    fn text_decodes_utf8_lossily_and_drops_a_leading_bom() {
        let mut body = vec![0xEF, 0xBB, 0xBF];
        body.extend_from_slice("héllo ".as_bytes());
        body.push(0xFF);
        let server = start_loopback_server(Arc::new(move |_| ok_reply(&body)));
        let host = create_net_host(None);
        let response = fetch(&host, &create_get_request(&server.url("/text")), None);
        assert!(
            matches!(&response.body, Some(NetResponseBody::Text(text)) if text == "héllo \u{FFFD}")
        );
    }

    #[test]
    fn json_parses_to_a_value_and_malformed_json_is_the_decode_sentinel() {
        let server = start_loopback_server(Arc::new(|request| {
            if request.path == "/good" {
                return ok_reply(br#"{"name":"flight","sizes":[1,2]}"#);
            }
            return ok_reply(b"{not json");
        }));
        let host = create_net_host(None);
        let good = create_get_request(&server.url("/good"));
        good.write().unwrap().response_type = Some(NetResponseType::Json);
        let response = fetch(&host, &good, None);
        let Some(NetResponseBody::Unknown(Some(value))) = &response.body else {
            panic!("json body is not a parsed value");
        };
        let value = value
            .downcast_ref::<serde_json::Value>()
            .expect("parsed json value");
        assert_eq!(value["name"], "flight");
        assert_eq!(value["sizes"][1], 2);
        let bad = create_get_request(&server.url("/bad"));
        bad.write().unwrap().response_type = Some(NetResponseType::Json);
        let response = fetch(&host, &bad, None);
        assert_eq!(response.status, 200);
        assert!(matches!(
            response.body,
            Some(NetResponseBody::Unknown(None))
        ));
        assert_eq!(
            explain_net_response(&response).map(|explanation| explanation.reason),
            Some(NetResponseExplanationReason::DecodeFailure)
        );
    }

    #[test]
    fn blob_carries_the_bytes_size_and_lowercased_type() {
        let payload = generate_payload(1000);
        let served = payload.clone();
        let server = start_loopback_server(Arc::new(move |_| Reply::Full {
            status: 200,
            reason: "OK",
            headers: vec![("Content-Type", "Image/PNG".to_string())],
            body: served.clone(),
        }));
        let host = create_net_host(None);
        let request = create_get_request(&server.url("/blob"));
        request.write().unwrap().response_type = Some(NetResponseType::Blob);
        let response = fetch(&host, &request, None);
        let Some(NetResponseBody::Blob(blob)) = &response.body else {
            panic!("blob body expected");
        };
        assert_eq!(blob.size, payload.len());
        assert_eq!(blob.mime_type, "image/png");
        let reader = blob.array_buffer_reader.clone().expect("blob reader");
        let buffer = block_on_within("blob read", TEST_DEADLINE, reader())
            .ok()
            .unwrap();
        assert_eq!(
            *flight_buffer::get_array_buffer_storage(&buffer)
                .read()
                .unwrap(),
            payload.into_boxed_slice()
        );
    }

    #[test]
    fn download_progress_counts_to_the_declared_length() {
        let payload = generate_payload(200 * 1024);
        let served = payload.clone();
        let server = start_loopback_server(Arc::new(move |_| ok_reply(&served)));
        let host = create_net_host(None);
        let signal: Ref<Signal<Ref<NetProgress>>> = Arc::new(RwLock::new(create_signal()));
        let seen = Arc::new(Mutex::new(Vec::<NetProgress>::new()));
        let record = seen.clone();
        connect_signal(
            &signal.read().unwrap(),
            Arc::new(move |progress: &Ref<NetProgress>| {
                record
                    .lock()
                    .unwrap()
                    .push(progress.read().unwrap().clone());
            }),
            None,
        );
        let options = Arc::new(RwLock::new(NetRequestOptions {
            progress: Some(signal),
            signal: None,
        }));
        let request = create_get_request(&server.url("/progress"));
        request.write().unwrap().response_type = Some(NetResponseType::ArrayBuffer);
        let response = fetch(&host, &request, Some(&options));
        assert_eq!(get_response_bytes(&response), payload);
        let seen = seen.lock().unwrap();
        assert!(!seen.is_empty(), "no progress was emitted");
        assert!(
            seen.iter()
                .all(|progress| progress.phase == NetProgressPhase::Download)
        );
        assert!(seen.iter().all(|progress| progress.total == payload.len()));
        assert!(seen.windows(2).all(|pair| pair[0].loaded < pair[1].loaded));
        assert_eq!(seen.last().unwrap().loaded, payload.len());
    }
}

mod redirects {
    use super::*;

    fn start_redirecting_server() -> LoopbackServer {
        return start_loopback_server(Arc::new(|request| match request.path.as_str() {
            "/start" => Reply::Full {
                status: 302,
                reason: "Found",
                headers: vec![("Location", "/end".to_string())],
                body: b"moved".to_vec(),
            },
            "/loop" => Reply::Full {
                status: 307,
                reason: "Temporary Redirect",
                headers: vec![("Location", "/loop".to_string())],
                body: vec![],
            },
            _ => ok_reply(b"arrived"),
        }));
    }

    #[test]
    fn follow_reports_the_final_url() {
        let server = start_redirecting_server();
        let host = create_net_host(None);
        let response = fetch(&host, &create_get_request(&server.url("/start")), None);
        assert_eq!(response.status, 200);
        assert_eq!(response.url, server.url("/end"));
        assert!(matches!(&response.body, Some(NetResponseBody::Text(text)) if text == "arrived"));
    }

    #[test]
    fn follow_stops_at_the_redirect_limit() {
        let server = start_redirecting_server();
        let mut options = create_net_host_options();
        options.redirect_limit = 3;
        let host = create_net_host(Some(&options));
        let response = fetch(&host, &create_get_request(&server.url("/loop")), None);
        assert_host_failure(
            &response,
            NetHostResponseExplanationReason::TooManyRedirects,
        );
        assert_eq!(server.received().len(), 4);
    }

    #[test]
    fn error_mode_fails_on_a_redirect() {
        let server = start_redirecting_server();
        let host = create_net_host(None);
        let request = create_get_request(&server.url("/start"));
        request.write().unwrap().redirect = Some(NetRedirect::Error);
        assert_host_failure(
            &fetch(&host, &request, None),
            NetHostResponseExplanationReason::RedirectRejected,
        );
        assert_eq!(server.received().len(), 1);
    }

    #[test]
    fn follow_with_no_redirects_allowed_fails_on_the_first_redirect() {
        let server = start_redirecting_server();
        let mut options = create_net_host_options();
        options.redirect_limit = 0;
        let host = create_net_host(Some(&options));
        let response = fetch(&host, &create_get_request(&server.url("/start")), None);
        assert_host_failure(
            &response,
            NetHostResponseExplanationReason::TooManyRedirects,
        );
        assert_eq!(server.received().len(), 1);
        let direct = fetch(&host, &create_get_request(&server.url("/end")), None);
        assert_eq!(
            direct.status, 200,
            "a response that is not a redirect still succeeds"
        );
    }

    #[test]
    fn manual_mode_returns_the_redirect_response() {
        let server = start_redirecting_server();
        let host = create_net_host(None);
        let request = create_get_request(&server.url("/start"));
        request.write().unwrap().redirect = Some(NetRedirect::Manual);
        let response = fetch(&host, &request, None);
        assert_eq!(response.status, 302);
        assert!(!response.ok);
        assert_eq!(get_header(&response, "location").as_deref(), Some("/end"));
        assert_eq!(response.url, server.url("/start"));
        assert_eq!(server.received().len(), 1);
    }
}

mod failures {
    use super::*;

    fn start_stalling_server() -> LoopbackServer {
        return start_loopback_server(Arc::new(|_| Reply::Stall {
            head_and_part: b"HTTP/1.1 200 OK\r\ncontent-length: 1000\r\n\r\npartial".to_vec(),
            hold: Duration::from_secs(5),
        }));
    }

    #[test]
    fn timeout_fails_a_stalled_body_within_the_bound() {
        let server = start_stalling_server();
        let host = create_net_host(None);
        let request = create_get_request(&server.url("/stall"));
        request.write().unwrap().timeout_ms = Some(200.0);
        let started = Instant::now();
        let response = fetch(&host, &request, None);
        let elapsed = started.elapsed();
        assert_host_failure(&response, NetHostResponseExplanationReason::Timeout);
        assert_eq!(
            explain_net_response(&response).map(|explanation| explanation.reason),
            Some(NetResponseExplanationReason::Timeout)
        );
        assert!(elapsed < Duration::from_secs(3), "timeout took {elapsed:?}");
    }

    #[test]
    fn abort_resolves_a_request_in_flight() {
        let server = start_stalling_server();
        let host = create_net_host(None);
        let controller = create_abort_controller();
        let options = Arc::new(RwLock::new(NetRequestOptions {
            progress: None,
            signal: Some(controller.signal.clone()),
        }));
        let request = create_get_request(&server.url("/stall"));
        let aborter = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(150));
            abort_controller(&controller, None);
        });
        let started = Instant::now();
        let response = fetch(&host, &request, Some(&options));
        aborter.join().unwrap();
        assert_host_failure(&response, NetHostResponseExplanationReason::Aborted);
        assert_eq!(
            explain_net_response(&response).map(|explanation| explanation.reason),
            Some(NetResponseExplanationReason::Aborted)
        );
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn an_already_aborted_signal_sends_nothing() {
        let server = start_loopback_server(Arc::new(|_| ok_reply(b"")));
        let host = create_net_host(None);
        let controller = create_abort_controller();
        abort_controller(&controller, None);
        let options = Arc::new(RwLock::new(NetRequestOptions {
            progress: None,
            signal: Some(controller.signal.clone()),
        }));
        let response = fetch(
            &host,
            &create_get_request(&server.url("/x")),
            Some(&options),
        );
        assert_host_failure(&response, NetHostResponseExplanationReason::Aborted);
        // A worker that was started anyway would connect within milliseconds.
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(
            server.accepted(),
            0,
            "a pre-aborted request opened a connection"
        );
        assert!(server.received().is_empty());
    }

    #[test]
    fn a_closed_port_is_a_connection_failure() {
        let port = {
            let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
            listener.local_addr().unwrap().port()
        };
        let host = create_net_host(None);
        let url = format!("http://127.0.0.1:{port}/closed");
        let response = fetch(&host, &create_get_request(&url), None);
        assert_host_failure(
            &response,
            NetHostResponseExplanationReason::ConnectionFailed,
        );
        assert_eq!(response.url, url);
        assert_eq!(
            explain_net_response(&response).map(|explanation| explanation.reason),
            Some(NetResponseExplanationReason::TransportFailure)
        );
    }

    #[test]
    fn a_malformed_response_is_a_protocol_error() {
        let server = start_loopback_server(Arc::new(|_| {
            Reply::Raw(b"NOT HTTP AT ALL\r\n\r\n".to_vec())
        }));
        let host = create_net_host(None);
        let response = fetch(&host, &create_get_request(&server.url("/garbage")), None);
        assert_host_failure(&response, NetHostResponseExplanationReason::ProtocolError);
    }

    #[test]
    fn malformed_urls_methods_and_headers_are_invalid_requests() {
        let host = create_net_host(None);
        let bad_url = create_get_request("http://exa mple.invalid/");
        assert_host_failure(
            &fetch(&host, &bad_url, None),
            NetHostResponseExplanationReason::InvalidRequest,
        );
        let bad_method = create_get_request("http://127.0.0.1:9/");
        bad_method.write().unwrap().method = "BAD METHOD".to_string();
        assert_host_failure(
            &fetch(&host, &bad_method, None),
            NetHostResponseExplanationReason::InvalidRequest,
        );
        let bad_header = create_get_request("http://127.0.0.1:9/");
        bad_header.write().unwrap().headers = Some(create_headers(&[("bad header", "x")]));
        assert_host_failure(
            &fetch(&host, &bad_header, None),
            NetHostResponseExplanationReason::InvalidRequest,
        );
    }

    #[test]
    fn non_http_schemes_are_unsupported() {
        let host = create_net_host(None);
        let response = fetch(&host, &create_get_request("ftp://127.0.0.1/file"), None);
        assert_host_failure(
            &response,
            NetHostResponseExplanationReason::UnsupportedScheme,
        );
    }

    #[cfg(not(feature = "https"))]
    #[test]
    fn https_without_the_https_feature_is_unsupported() {
        let host = create_net_host(None);
        let response = fetch(&host, &create_get_request("https://127.0.0.1:9/"), None);
        assert_host_failure(
            &response,
            NetHostResponseExplanationReason::UnsupportedScheme,
        );
    }

    #[test]
    fn the_failure_response_keeps_empty_headers() {
        let host = create_net_host(None);
        let response = fetch(&host, &create_get_request("ftp://127.0.0.1/file"), None);
        let headers: Record<String> = response.headers.read().unwrap().clone();
        let mut keys = Vec::new();
        flight_entity::get_record_keys(&mut keys, &headers);
        assert!(keys.is_empty());
    }
}

mod cancellation {
    use super::*;

    fn start_trickling_server() -> LoopbackServer {
        return start_loopback_server(Arc::new(|_| Reply::Trickle {
            chunk: vec![b'x'; 1024],
            count: 400,
            interval: Duration::from_millis(10),
        }));
    }

    fn create_progress_options(
        signal: Option<flight_stream::AbortSignal>,
    ) -> (Ref<NetRequestOptions>, Arc<Mutex<usize>>) {
        let progress: Ref<Signal<Ref<NetProgress>>> = Arc::new(RwLock::new(create_signal()));
        let ticks = Arc::new(Mutex::new(0));
        let count = ticks.clone();
        connect_signal(
            &progress.read().unwrap(),
            Arc::new(move |_: &Ref<NetProgress>| *count.lock().unwrap() += 1),
            None,
        );
        let options = Arc::new(RwLock::new(NetRequestOptions {
            progress: Some(progress),
            signal,
        }));
        return (options, ticks);
    }

    #[test]
    fn abort_mid_body_stops_the_worker_reading() {
        let server = start_trickling_server();
        let host = create_net_host(None);
        let controller = create_abort_controller();
        let (options, _) = create_progress_options(Some(controller.signal.clone()));
        let request = create_get_request(&server.url("/trickle"));
        let aborter = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(150));
            abort_controller(&controller, None);
        });
        let response = fetch(&host, &request, Some(&options));
        aborter.join().unwrap();
        assert_host_failure(&response, NetHostResponseExplanationReason::Aborted);
        // The full body takes 4 s to trickle; a worker that stopped reading closes its connection
        // and the server's next writes fail.
        wait_until(
            "server sees the aborted body abandoned",
            Duration::from_secs(2),
            || {
                return server.abandoned_bodies() == 1;
            },
        );
    }

    #[test]
    fn dropping_the_future_mid_body_stops_the_worker_reading() {
        let server = start_trickling_server();
        let host = create_net_host(None);
        let (options, ticks) = create_progress_options(None);
        let request = create_get_request(&server.url("/trickle"));
        let state = create_unguarded_net_state();
        let mut future = Box::pin(send_net_request(
            get_net_host_capability(&host),
            &request,
            Some(&options),
            &state,
        ));
        let waker = std::task::Waker::noop();
        let mut context = std::task::Context::from_waker(waker);
        let started = Instant::now();
        while *ticks.lock().unwrap() == 0 {
            assert!(future.as_mut().poll(&mut context).is_pending());
            assert!(
                started.elapsed() < Duration::from_secs(3),
                "no body bytes arrived"
            );
            std::thread::sleep(Duration::from_millis(5));
        }
        drop(future);
        wait_until(
            "server sees the dropped body abandoned",
            Duration::from_secs(2),
            || {
                return server.abandoned_bodies() == 1;
            },
        );
    }
}

mod gzip_responses {
    use super::*;

    #[test]
    fn decodes_the_body_and_keeps_the_encoding_headers_and_encoded_total() {
        let payload = generate_payload(150 * 1024);
        let encoded = encode_gzip_stored(&payload);
        let encoded_length = encoded.len();
        let server = start_loopback_server(Arc::new(move |_| Reply::Full {
            status: 200,
            reason: "OK",
            headers: vec![
                ("Content-Encoding", "gzip".to_string()),
                ("X-Keep", "1".to_string()),
            ],
            body: encoded.clone(),
        }));
        let host = create_net_host(None);
        let signal: Ref<Signal<Ref<NetProgress>>> = Arc::new(RwLock::new(create_signal()));
        let seen = Arc::new(Mutex::new(Vec::<NetProgress>::new()));
        let record = seen.clone();
        connect_signal(
            &signal.read().unwrap(),
            Arc::new(move |progress: &Ref<NetProgress>| {
                record
                    .lock()
                    .unwrap()
                    .push(progress.read().unwrap().clone());
            }),
            None,
        );
        let options = Arc::new(RwLock::new(NetRequestOptions {
            progress: Some(signal),
            signal: None,
        }));
        let request = create_get_request(&server.url("/compressed"));
        {
            let mut request = request.write().unwrap();
            request.response_type = Some(NetResponseType::ArrayBuffer);
            request.headers = Some(create_headers(&[("Accept-Encoding", "br")]));
        }
        let response = fetch(&host, &request, Some(&options));
        assert_eq!(
            response.status, 200,
            "status text {:?}",
            response.status_text
        );
        assert_eq!(
            get_response_bytes(&response),
            payload,
            "decoded body differs"
        );
        assert_eq!(
            get_header(&response, "content-encoding").as_deref(),
            Some("gzip")
        );
        assert_eq!(
            get_header(&response, "content-length"),
            Some(encoded_length.to_string())
        );
        assert_eq!(get_header(&response, "x-keep").as_deref(), Some("1"));
        let seen = seen.lock().unwrap();
        assert!(!seen.is_empty(), "no progress was emitted");
        assert!(seen.iter().all(|progress| progress.total == encoded_length));
        assert_eq!(seen.last().unwrap().loaded, payload.len());
        assert_eq!(server.received()[0].header("accept-encoding"), Some("gzip"));
    }

    #[test]
    fn an_empty_gzip_labelled_head_response_succeeds() {
        let server = start_loopback_server(Arc::new(|_| Reply::Full {
            status: 200,
            reason: "OK",
            headers: vec![("Content-Encoding", "gzip".to_string())],
            body: encode_gzip_stored(b"head"),
        }));
        let host = create_net_host(None);
        let request = create_get_request(&server.url("/head"));
        request.write().unwrap().method = "HEAD".to_string();
        let response = fetch(&host, &request, None);
        assert_eq!(
            response.status, 200,
            "status text {:?}",
            response.status_text
        );
        assert!(matches!(&response.body, Some(NetResponseBody::Text(text)) if text.is_empty()));
    }

    #[test]
    fn a_corrupt_gzip_body_is_a_protocol_error() {
        let server = start_loopback_server(Arc::new(|_| Reply::Full {
            status: 200,
            reason: "OK",
            headers: vec![("Content-Encoding", "gzip".to_string())],
            body: b"definitely not gzip".to_vec(),
        }));
        let host = create_net_host(None);
        let response = fetch(&host, &create_get_request(&server.url("/corrupt")), None);
        assert_host_failure(&response, NetHostResponseExplanationReason::ProtocolError);
    }
}

mod timeouts {
    use super::*;

    #[test]
    fn huge_infinite_nan_and_negative_timeouts_resolve_without_panicking() {
        let server = start_loopback_server(Arc::new(|_| ok_reply(b"done")));
        let host = create_net_host(None);
        for timeout in [
            1.0e15,
            1.0e22,
            1.0e30,
            f32::MAX,
            f32::INFINITY,
            f32::NAN,
            -5.0,
        ] {
            let request = create_get_request(&server.url("/huge"));
            request.write().unwrap().timeout_ms = Some(timeout);
            let response = fetch(&host, &request, None);
            assert_eq!(
                response.status, 200,
                "timeout {timeout}: {:?}",
                response.status_text
            );
        }
    }

    #[test]
    fn a_zero_timeout_times_out() {
        let server = start_loopback_server(Arc::new(|_| ok_reply(b"late")));
        let host = create_net_host(None);
        let request = create_get_request(&server.url("/zero"));
        request.write().unwrap().timeout_ms = Some(0.0);
        assert_host_failure(
            &fetch(&host, &request, None),
            NetHostResponseExplanationReason::Timeout,
        );
    }
}
