use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use flight_entity::Uint8Array;
use flight_shell::*;

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
        assert_eq!(
            block_on(spawned.exit),
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
                        Box::pin(async {
                            ShellProcessExitStatus {
                                code: Some(7),
                                signal: None,
                            }
                        }),
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

    fn empty_readable() -> ShellReadableStream {
        return ShellReadableStream {
            read: Arc::new(|| -> ShellReadChunkFuture { Box::pin(async { None }) }),
        };
    }

    fn empty_writable() -> ShellWritableStream {
        return ShellWritableStream {
            write: Arc::new(|_chunk: Box<Uint8Array>| -> ShellWriteFuture { Box::pin(async {}) }),
            close: Arc::new(|| -> ShellWriteFuture { Box::pin(async {}) }),
        };
    }

    fn process() -> ShellProcess {
        return create_shell_process(
            Box::pin(async {
                ShellProcessExitStatus {
                    code: Some(0),
                    signal: None,
                }
            }),
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
