use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::task::{Context, Poll, Wake, Waker};

use flight_entity::Ref;
use flight_shell::*;
use flight_stream::{
    ReadableStream, SharedFuture, WritableStream, close_writable_stream, create_readable_stream,
    create_shared_future, create_writable_stream, read_readable_stream, write_writable_stream,
};

fn exit_status(code: i32) -> SharedFuture<Ref<ShellProcessExitStatus>> {
    return create_shared_future(Box::pin(async move {
        Arc::new(RwLock::new(ShellProcessExitStatus {
            code: Some(code),
            signal: None,
        }))
    }));
}

use crate::block_on;

mod is_shell_url_allowed {
    use super::*;

    #[test]
    fn matches_schemes_case_insensitively_from_an_explicit_policy() {
        assert!(is_shell_url_allowed(
            "https://example.test",
            &policy(&["HTTPS"])
        ));
        assert!(!is_shell_url_allowed(
            "mailto:user@example.test",
            &policy(&["https"])
        ));
    }

    #[test]
    fn blocks_malformed_urls_and_an_empty_policy() {
        assert!(!is_shell_url_allowed("not a URL", &policy(&["https"])));
        assert!(!is_shell_url_allowed("https://example.test", &policy(&[])));
    }

    #[test]
    fn rejects_special_urls_without_a_host_and_accepts_file_urls() {
        assert!(!is_shell_url_allowed("https://", &policy(&["https"])));
        assert!(!is_shell_url_allowed("https:", &policy(&["https"])));
        assert!(!is_shell_url_allowed(
            "1https://example.test",
            &policy(&["https"])
        ));
        assert!(is_shell_url_allowed(
            "file:///etc/passwd",
            &policy(&["file"])
        ));
        assert!(is_shell_url_allowed(
            "https:example.test",
            &policy(&["https"])
        ));
        assert!(is_shell_url_allowed(
            "https:///example.test",
            &policy(&["https"])
        ));
        assert!(!is_shell_url_allowed(
            "https://example.test:99999",
            &policy(&["https"])
        ));
        assert!(is_shell_url_allowed(
            "https://example.test:8443",
            &policy(&["https"])
        ));
    }

    #[test]
    fn matches_new_url_parse_acceptance_for_malformed_and_custom_urls() {
        let policy = policy(&[
            "https",
            "file",
            "mailto",
            "javascript",
            "foo",
            "a",
            "blob",
            "custom",
        ]);
        let accepted = [
            "https:////example.com",
            "https://[::1]:8080/",
            "https://user:pass@example.test:443/path",
            "https:/example.com",
            "https://.",
            "https://example.test.",
            "https://相対.jp",
            "https://example.test:",
            "https://exa%6dple.com/",
            "file:",
            "file:relative",
            "mailto:",
            " javascript:alert(1)",
            "foo:%",
            "a:b c",
            "blob:https://example.test/id",
            "custom:thing",
        ];
        let rejected = [
            "https://[gg]/",
            "https://exa%mple.com/",
            "https://%2f",
            "https://[]",
            "https://[::1",
            "https://example.test:abc",
            "https://exa mple.com",
            "https://example.test:65536",
            "/relative/path",
        ];
        for url in accepted {
            assert!(
                is_shell_url_allowed(url, &policy),
                "expected accepted: {}",
                url
            );
        }
        for url in rejected {
            assert!(
                !is_shell_url_allowed(url, &policy),
                "expected rejected: {}",
                url
            );
        }
    }

    fn policy(schemes: &[&str]) -> ShellExternalUrlPolicy {
        return ShellExternalUrlPolicy {
            allowed_schemes: schemes.iter().map(|scheme| scheme.to_string()).collect(),
        };
    }
}

mod move_shell_item_to_trash {
    use super::*;

    #[test]
    fn routes_through_the_supplied_trash_provider() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let host = HostShellTrashCapability {
            move_to_trash: Arc::new(move |path: String| {
                captured.lock().unwrap().push(path);
                let future: ShellTrashFuture = Box::pin(async {
                    ShellTrashOutcome {
                        reason: ShellTrashReason::Ok,
                    }
                });
                return future;
            }),
        };
        let outcome = block_on(move_shell_item_to_trash(&host, "/item"));
        assert_eq!(outcome.reason, ShellTrashReason::Ok);
        assert_eq!(*seen.lock().unwrap(), vec!["/item".to_string()]);
    }
}

mod move_shell_items_to_trash {
    use super::*;

    #[test]
    fn starts_every_operation_and_preserves_input_order_while_awaiting_all() {
        let started = Arc::new(Mutex::new(Vec::new()));
        let started_by_host = started.clone();
        let host = HostShellTrashCapability {
            move_to_trash: Arc::new(move |path: String| {
                started_by_host.lock().unwrap().push(path.clone());
                let seen = started_by_host.clone();
                let future: ShellTrashFuture = Box::pin(async move {
                    assert_eq!(seen.lock().unwrap().len(), 2);
                    if path == "/second" {
                        return ShellTrashOutcome {
                            reason: ShellTrashReason::OperationFailed,
                        };
                    }
                    return ShellTrashOutcome {
                        reason: ShellTrashReason::Ok,
                    };
                });
                return future;
            }),
        };
        let outcomes = block_on(move_shell_items_to_trash(
            &host,
            &["/first".to_string(), "/second".to_string()],
        ));
        assert_eq!(
            *started.lock().unwrap(),
            vec!["/first".to_string(), "/second".to_string()]
        );
        assert_eq!(outcomes[0].reason, ShellTrashReason::Ok);
        assert_eq!(outcomes[1].reason, ShellTrashReason::OperationFailed);
    }

    #[test]
    fn polls_every_unfinished_future_so_a_later_one_can_unblock_an_earlier_one() {
        let flag = Arc::new(Mutex::new(false));
        let started = Arc::new(Mutex::new(Vec::new()));
        let started_by_host = started.clone();
        let first_flag = flag.clone();
        let second_flag = flag.clone();
        let host = HostShellTrashCapability {
            move_to_trash: Arc::new(move |path: String| {
                started_by_host.lock().unwrap().push(path.clone());
                if path == "/first" {
                    let future: ShellTrashFuture = Box::pin(WaitForFlag {
                        flag: first_flag.clone(),
                        outcome: ShellTrashOutcome {
                            reason: ShellTrashReason::Ok,
                        },
                    });
                    return future;
                }
                let future: ShellTrashFuture = Box::pin(SetFlagThenDone {
                    flag: second_flag.clone(),
                    outcome: ShellTrashOutcome {
                        reason: ShellTrashReason::OperationFailed,
                    },
                });
                return future;
            }),
        };
        let paths = ["/first".to_string(), "/second".to_string()];
        let mut joined = Box::pin(move_shell_items_to_trash(&host, &paths));
        let recorder = Arc::new(RecordingWake {
            woken: AtomicBool::new(false),
        });
        let waker = Waker::from(recorder.clone());
        let mut context = Context::from_waker(&waker);
        assert!(joined.as_mut().poll(&mut context).is_pending());
        assert_eq!(
            *started.lock().unwrap(),
            vec!["/first".to_string(), "/second".to_string()]
        );
        assert!(recorder.woken.load(Ordering::SeqCst));
        let outcomes = match joined.as_mut().poll(&mut context) {
            Poll::Ready(outcomes) => outcomes,
            Poll::Pending => panic!("join did not settle after the later future made progress"),
        };
        assert_eq!(outcomes[0].reason, ShellTrashReason::Ok);
        assert_eq!(outcomes[1].reason, ShellTrashReason::OperationFailed);
    }

    struct WaitForFlag {
        flag: Arc<Mutex<bool>>,
        outcome: ShellTrashOutcome,
    }

    impl Future for WaitForFlag {
        type Output = ShellTrashOutcome;

        fn poll(self: Pin<&mut Self>, _context: &mut Context<'_>) -> Poll<ShellTrashOutcome> {
            if *self.flag.lock().unwrap() {
                return Poll::Ready(self.outcome);
            }
            return Poll::Pending;
        }
    }

    struct SetFlagThenDone {
        flag: Arc<Mutex<bool>>,
        outcome: ShellTrashOutcome,
    }

    impl Future for SetFlagThenDone {
        type Output = ShellTrashOutcome;

        fn poll(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<ShellTrashOutcome> {
            *self.flag.lock().unwrap() = true;
            context.waker().wake_by_ref();
            return Poll::Ready(self.outcome);
        }
    }

    struct RecordingWake {
        woken: AtomicBool,
    }

    impl Wake for RecordingWake {
        fn wake(self: Arc<Self>) {
            self.woken.store(true, Ordering::SeqCst);
        }

        fn wake_by_ref(self: &Arc<Self>) {
            self.woken.store(true, Ordering::SeqCst);
        }
    }
}

mod open_shell_external_url {
    use super::*;

    #[test]
    fn blocks_before_dispatch_when_the_scheme_is_not_allowed() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let captured = calls.clone();
        let host = HostShellExternalCapability {
            open: Arc::new(move |url: String| {
                captured.lock().unwrap().push(url);
                let future: ShellExternalFuture = Box::pin(async {
                    ShellExternalOutcome {
                        reason: ShellExternalReason::Ok,
                    }
                });
                return future;
            }),
        };
        let outcome = block_on(open_shell_external_url(
            &host,
            "file:///etc/passwd",
            &ShellExternalUrlPolicy {
                allowed_schemes: vec!["https".to_string()],
            },
        ));
        assert_eq!(outcome.reason, ShellExternalReason::BlockedScheme);
        assert!(calls.lock().unwrap().is_empty());
    }

    #[test]
    fn blocks_malformed_hosts_before_dispatch_and_forwards_a_single_dot_host() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let captured = calls.clone();
        let host = HostShellExternalCapability {
            open: Arc::new(move |url: String| {
                captured.lock().unwrap().push(url);
                let future: ShellExternalFuture = Box::pin(async {
                    ShellExternalOutcome {
                        reason: ShellExternalReason::Ok,
                    }
                });
                return future;
            }),
        };
        let policy = ShellExternalUrlPolicy {
            allowed_schemes: vec!["https".to_string()],
        };
        for url in ["https://[gg]/", "https://exa%mple.com/"] {
            let outcome = block_on(open_shell_external_url(&host, url, &policy));
            assert_eq!(outcome.reason, ShellExternalReason::BlockedScheme);
        }
        assert!(calls.lock().unwrap().is_empty());
        let outcome = block_on(open_shell_external_url(&host, "https://.", &policy));
        assert_eq!(outcome.reason, ShellExternalReason::Ok);
        assert_eq!(*calls.lock().unwrap(), vec!["https://.".to_string()]);
    }

    #[test]
    fn forwards_an_allowed_url_to_the_host() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let captured = calls.clone();
        let host = HostShellExternalCapability {
            open: Arc::new(move |url: String| {
                captured.lock().unwrap().push(url);
                let future: ShellExternalFuture = Box::pin(async {
                    ShellExternalOutcome {
                        reason: ShellExternalReason::PopupBlocked,
                    }
                });
                return future;
            }),
        };
        let outcome = block_on(open_shell_external_url(
            &host,
            "https://example.test",
            &ShellExternalUrlPolicy {
                allowed_schemes: vec!["https".to_string()],
            },
        ));
        assert_eq!(outcome.reason, ShellExternalReason::PopupBlocked);
        assert_eq!(
            *calls.lock().unwrap(),
            vec!["https://example.test".to_string()]
        );
    }

    #[test]
    fn keeps_two_live_hosts_isolated() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let captured = calls.clone();
        let first = HostShellExternalCapability {
            open: Arc::new(move |url: String| {
                captured.lock().unwrap().push(format!("first:{}", url));
                let future: ShellExternalFuture = Box::pin(async {
                    ShellExternalOutcome {
                        reason: ShellExternalReason::Ok,
                    }
                });
                return future;
            }),
        };
        let captured = calls.clone();
        let second = HostShellExternalCapability {
            open: Arc::new(move |url: String| {
                captured.lock().unwrap().push(format!("second:{}", url));
                let future: ShellExternalFuture = Box::pin(async {
                    ShellExternalOutcome {
                        reason: ShellExternalReason::OperationFailed,
                    }
                });
                return future;
            }),
        };
        let policy = ShellExternalUrlPolicy {
            allowed_schemes: vec!["https".to_string()],
        };
        let first_outcome = block_on(open_shell_external_url(&first, "https://one.test", &policy));
        let second_outcome = block_on(open_shell_external_url(
            &second,
            "https://two.test",
            &policy,
        ));
        assert_eq!(first_outcome.reason, ShellExternalReason::Ok);
        assert_eq!(second_outcome.reason, ShellExternalReason::OperationFailed);
        assert_eq!(
            *calls.lock().unwrap(),
            vec![
                "first:https://one.test".to_string(),
                "second:https://two.test".to_string(),
            ]
        );
    }
}

mod open_shell_path {
    use super::*;

    #[test]
    fn preserves_a_provider_failure_and_its_message() {
        let host = HostShellPathOpenCapability {
            open: Arc::new(|_path: String| {
                let future: ShellPathOpenFuture = Box::pin(async {
                    ShellPathOpenOutcome::OperationFailed(ShellPathOpenOutcomeOperationFailed {
                        message: String::new(),
                    })
                });
                return future;
            }),
        };
        assert_eq!(
            block_on(open_shell_path(&host, "/missing")),
            ShellPathOpenOutcome::OperationFailed(ShellPathOpenOutcomeOperationFailed {
                message: String::new(),
            })
        );
    }

    #[test]
    fn forwards_the_path_to_the_host() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let host = HostShellPathOpenCapability {
            open: Arc::new(move |path: String| {
                captured.lock().unwrap().push(path);
                let future: ShellPathOpenFuture =
                    Box::pin(async { ShellPathOpenOutcome::Ok(ShellPathOpenOutcomeOk {}) });
                return future;
            }),
        };
        assert_eq!(
            block_on(open_shell_path(&host, "/item")),
            ShellPathOpenOutcome::Ok(ShellPathOpenOutcomeOk {})
        );
        assert_eq!(*seen.lock().unwrap(), vec!["/item".to_string()]);
    }
}

mod read_shell_shortcut_link {
    use super::*;

    #[test]
    fn returns_the_read_specific_outcome() {
        let host = HostShellShortcutLinkCapability {
            read: Arc::new(|_shortcut_path: String| {
                let future: ShellShortcutLinkReadFuture = Box::pin(async {
                    ShellShortcutLinkReadOutcome::Ok(ShellShortcutLinkReadOutcomeOk {
                        link: link("/app"),
                    })
                });
                return future;
            }),
            write: Arc::new(
                |_shortcut_path: String,
                 _shortcut_link: ShellShortcutLink,
                 _operation: ShellShortcutWriteOperation| {
                    let future: ShellShortcutLinkWriteFuture = Box::pin(async {
                        ShellShortcutLinkWriteOutcome {
                            reason: ShellShortcutLinkWriteReason::Ok,
                        }
                    });
                    return future;
                },
            ),
        };
        assert_eq!(
            block_on(read_shell_shortcut_link(&host, "/app.lnk")),
            ShellShortcutLinkReadOutcome::Ok(ShellShortcutLinkReadOutcomeOk { link: link("/app") })
        );
    }

    fn link(target: &str) -> ShellShortcutLink {
        return ShellShortcutLink {
            target: target.to_string(),
            app_user_model_id: None,
            args: None,
            description: None,
            icon: None,
            icon_index: None,
            working_directory: None,
        };
    }
}

mod reveal_shell_path {
    use super::*;

    #[test]
    fn returns_the_reveal_specific_outcome() {
        let host = HostShellPathRevealCapability {
            reveal: Arc::new(|_path: String| {
                let future: ShellPathRevealFuture = Box::pin(async {
                    ShellPathRevealOutcome {
                        reason: ShellPathRevealReason::OperationFailed,
                    }
                });
                return future;
            }),
        };
        assert_eq!(
            block_on(reveal_shell_path(&host, "/item")),
            ShellPathRevealOutcome {
                reason: ShellPathRevealReason::OperationFailed,
            }
        );
    }
}

mod shell_beep {
    use super::*;

    #[test]
    fn dispatches_synchronously() {
        let count = Arc::new(Mutex::new(0));
        let captured = count.clone();
        let host = HostShellBeepCapability {
            beep: Arc::new(move || *captured.lock().unwrap() += 1),
        };
        shell_beep(&host);
        assert_eq!(*count.lock().unwrap(), 1);
    }
}

mod shell_process_streams {
    use super::*;
    use futures::io::{AsyncRead, AsyncWrite};
    use std::collections::VecDeque;
    use std::io;

    enum ReadStep {
        Bytes(Vec<u8>),
        Error(String),
    }

    struct MockReader {
        steps: Mutex<VecDeque<ReadStep>>,
        dropped: Arc<AtomicBool>,
    }

    impl AsyncRead for MockReader {
        fn poll_read(
            self: Pin<&mut Self>,
            _context: &mut Context<'_>,
            buf: &mut [u8],
        ) -> Poll<io::Result<usize>> {
            let mut steps = self.steps.lock().unwrap();
            return match steps.pop_front() {
                None => Poll::Ready(Ok(0)),
                Some(ReadStep::Error(message)) => Poll::Ready(Err(io::Error::other(message))),
                Some(ReadStep::Bytes(bytes)) => {
                    let count = bytes.len().min(buf.len());
                    buf[..count].copy_from_slice(&bytes[..count]);
                    if count < bytes.len() {
                        steps.push_front(ReadStep::Bytes(bytes[count..].to_vec()));
                    }
                    Poll::Ready(Ok(count))
                }
            };
        }
    }

    impl Drop for MockReader {
        fn drop(&mut self) {
            self.dropped.store(true, Ordering::SeqCst);
        }
    }

    struct MockWriter {
        capacity: usize,
        written: Arc<Mutex<Vec<u8>>>,
        closed: Arc<AtomicBool>,
        dropped: Arc<AtomicBool>,
    }

    impl AsyncWrite for MockWriter {
        fn poll_write(
            self: Pin<&mut Self>,
            _context: &mut Context<'_>,
            buf: &[u8],
        ) -> Poll<io::Result<usize>> {
            let count = buf.len().min(self.capacity);
            self.written
                .lock()
                .unwrap()
                .extend_from_slice(&buf[..count]);
            return Poll::Ready(Ok(count));
        }

        fn poll_flush(self: Pin<&mut Self>, _context: &mut Context<'_>) -> Poll<io::Result<()>> {
            return Poll::Ready(Ok(()));
        }

        fn poll_close(self: Pin<&mut Self>, _context: &mut Context<'_>) -> Poll<io::Result<()>> {
            self.closed.store(true, Ordering::SeqCst);
            return Poll::Ready(Ok(()));
        }
    }

    impl Drop for MockWriter {
        fn drop(&mut self) {
            self.dropped.store(true, Ordering::SeqCst);
        }
    }

    #[test]
    fn stdout_reads_partial_byob_chunks_and_end_of_stream() {
        let process = create_shell_process(
            exit_status(0),
            create_readable_stream(Box::new(futures::io::empty())),
            create_writable_stream(Box::new(futures::io::sink())),
            create_readable_stream(Box::new(MockReader {
                steps: Mutex::new(
                    vec![
                        ReadStep::Bytes(b"ab".to_vec()),
                        ReadStep::Bytes(b"cdef".to_vec()),
                    ]
                    .into(),
                ),
                dropped: Arc::new(AtomicBool::new(false)),
            })),
            Arc::new(|| {}),
        );
        let mut stderr = process.stderr;
        let mut stdout = process.stdout;
        let mut out = [0u8; 3];
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stderr)), Ok(0));
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stdout)), Ok(2));
        assert_eq!(&out[..2], b"ab");
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stdout)), Ok(3));
        assert_eq!(&out[..3], b"cde");
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stdout)), Ok(1));
        assert_eq!(&out[..1], b"f");
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stdout)), Ok(0));
    }

    #[test]
    fn stdin_writes_partial_chunks_and_closes() {
        let written = Arc::new(Mutex::new(Vec::new()));
        let closed = Arc::new(AtomicBool::new(false));
        let process = create_shell_process(
            exit_status(0),
            create_readable_stream(Box::new(futures::io::empty())),
            create_writable_stream(Box::new(MockWriter {
                capacity: 2,
                written: written.clone(),
                closed: closed.clone(),
                dropped: Arc::new(AtomicBool::new(false)),
            })),
            create_readable_stream(Box::new(futures::io::empty())),
            Arc::new(|| {}),
        );
        let mut stdin = process.stdin;
        assert_eq!(block_on(write_writable_stream(&mut stdin, b"abcd")), Ok(2));
        assert_eq!(&*written.lock().unwrap(), b"ab");
        assert_eq!(block_on(write_writable_stream(&mut stdin, b"cd")), Ok(2));
        assert_eq!(&*written.lock().unwrap(), b"abcd");
        assert!(block_on(close_writable_stream(&mut stdin)).is_ok());
        assert!(closed.load(Ordering::SeqCst));
    }

    #[test]
    fn dropping_the_process_drops_its_streams() {
        let stdout_dropped = Arc::new(AtomicBool::new(false));
        let stdin_dropped = Arc::new(AtomicBool::new(false));
        let process = create_shell_process(
            exit_status(0),
            create_readable_stream(Box::new(futures::io::empty())),
            create_writable_stream(Box::new(MockWriter {
                capacity: 8,
                written: Arc::new(Mutex::new(Vec::new())),
                closed: Arc::new(AtomicBool::new(false)),
                dropped: stdin_dropped.clone(),
            })),
            create_readable_stream(Box::new(MockReader {
                steps: Mutex::new(VecDeque::new()),
                dropped: stdout_dropped.clone(),
            })),
            Arc::new(|| {}),
        );
        drop(process);
        assert!(stdout_dropped.load(Ordering::SeqCst));
        assert!(stdin_dropped.load(Ordering::SeqCst));
    }
}

mod spawn_shell_process {
    use super::*;

    #[test]
    fn forwards_the_command_argument_vector_and_options_unchanged() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let captured = calls.clone();
        let host = HostShellProcessCapability {
            spawn: Arc::new(
                move |command: &str, args: &[String], options: Option<&ShellProcessOptions>| {
                    captured.lock().unwrap().push((
                        command.to_string(),
                        args.to_vec(),
                        options.cloned(),
                    ));
                    return process();
                },
            ),
        };
        let args = vec!["--flag".to_string(), "value".to_string()];
        let options = ShellProcessOptions {
            cwd: Some("/work".to_string()),
            environment: Some(HashMap::from([("MODE".to_string(), "test".to_string())])),
        };
        let spawned = spawn_shell_process(&host, "/bin/tool", &args, Some(&options));
        assert_eq!(
            *calls.lock().unwrap(),
            vec![("/bin/tool".to_string(), args.clone(), Some(options.clone()))]
        );
        let status = block_on(spawned.exit.clone());
        assert_eq!(
            *status.read().unwrap(),
            ShellProcessExitStatus {
                code: Some(0),
                signal: None,
            }
        );
    }

    #[test]
    fn returns_the_provider_owned_process_handle() {
        let terminate_seen = Arc::new(Mutex::new(0));
        let captured = terminate_seen.clone();
        let terminate: Arc<dyn Fn() + Send + Sync> =
            Arc::new(move || *captured.lock().unwrap() += 1);
        let expected = terminate.clone();
        let host = HostShellProcessCapability {
            spawn: Arc::new(
                move |_command: &str, _args: &[String], _options: Option<&ShellProcessOptions>| {
                    return create_shell_process(
                        exit_status(7),
                        empty_readable(),
                        empty_writable(),
                        empty_readable(),
                        expected.clone(),
                    );
                },
            ),
        };
        let spawned = spawn_shell_process(&host, "/bin/tool", &[], None);
        assert!(Arc::ptr_eq(&spawned.terminate, &terminate));
        terminate_shell_process(&spawned);
        assert_eq!(*terminate_seen.lock().unwrap(), 1);
    }

    fn empty_readable() -> ReadableStream {
        return create_readable_stream(Box::new(futures::io::empty()));
    }

    fn empty_writable() -> WritableStream {
        return create_writable_stream(Box::new(futures::io::sink()));
    }

    fn process() -> ShellProcess {
        return create_shell_process(
            exit_status(0),
            empty_readable(),
            empty_writable(),
            empty_readable(),
            Arc::new(|| {}),
        );
    }
}

mod write_shell_shortcut_link {
    use super::*;

    #[test]
    fn requires_an_explicit_write_operation_and_forwards_it() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let captured = calls.clone();
        let host = HostShellShortcutLinkCapability {
            read: Arc::new(|_shortcut_path: String| {
                let future: ShellShortcutLinkReadFuture = Box::pin(async {
                    ShellShortcutLinkReadOutcome::Ok(ShellShortcutLinkReadOutcomeOk {
                        link: link("/app"),
                    })
                });
                return future;
            }),
            write: Arc::new(
                move |shortcut_path: String,
                      shortcut_link: ShellShortcutLink,
                      operation: ShellShortcutWriteOperation| {
                    captured
                        .lock()
                        .unwrap()
                        .push((shortcut_path, shortcut_link.target, operation));
                    let future: ShellShortcutLinkWriteFuture = Box::pin(async {
                        ShellShortcutLinkWriteOutcome {
                            reason: ShellShortcutLinkWriteReason::Ok,
                        }
                    });
                    return future;
                },
            ),
        };
        let outcome = block_on(write_shell_shortcut_link(
            &host,
            "/app.lnk",
            &link("/app"),
            ShellShortcutWriteOperation::Replace,
        ));
        assert_eq!(outcome.reason, ShellShortcutLinkWriteReason::Ok);
        assert_eq!(
            *calls.lock().unwrap(),
            vec![(
                "/app.lnk".to_string(),
                "/app".to_string(),
                ShellShortcutWriteOperation::Replace,
            )]
        );
    }

    fn link(target: &str) -> ShellShortcutLink {
        return ShellShortcutLink {
            target: target.to_string(),
            app_user_model_id: None,
            args: None,
            description: None,
            icon: None,
            icon_index: None,
            working_directory: None,
        };
    }
}
