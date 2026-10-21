use std::task::Poll;

use url::Url;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use flight_stream::{create_readable_stream, create_shared_future, create_writable_stream};
    use std::sync::{Arc, Mutex, RwLock};

    fn process() -> ShellProcess {
        return crate::shell_process::create_shell_process(
            create_shared_future(Box::pin(async {
                Arc::new(RwLock::new(ShellProcessExitStatus {
                    code: Some(0),
                    signal: None,
                }))
            })),
            create_readable_stream(Box::new(futures::io::empty())),
            create_writable_stream(Box::new(futures::io::sink())),
            create_readable_stream(Box::new(futures::io::empty())),
            Arc::new(|| {}),
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

    fn trash_host(seen: Arc<Mutex<Vec<String>>>) -> HostShellTrashCapability {
        return HostShellTrashCapability {
            move_to_trash: Arc::new(move |path: String| {
                seen.lock().unwrap().push(path);
                let future: ShellTrashFuture = Box::pin(async {
                    ShellTrashOutcome {
                        reason: ShellTrashReason::Ok,
                    }
                });
                return future;
            }),
        };
    }

    #[test]
    fn beep_method_matches_shell_beep() {
        let method_count = Arc::new(Mutex::new(0));
        let captured = method_count.clone();
        let method_host = HostShellBeepCapability {
            beep: Arc::new(move || *captured.lock().unwrap() += 1),
        };
        let free_count = Arc::new(Mutex::new(0));
        let captured = free_count.clone();
        let free_host = HostShellBeepCapability {
            beep: Arc::new(move || *captured.lock().unwrap() += 1),
        };
        method_host.beep();
        shell_beep(&free_host);
        assert_eq!(*method_count.lock().unwrap(), *free_count.lock().unwrap());
    }

    #[test]
    fn open_external_url_method_matches_open_shell_external_url() {
        let method_calls = Arc::new(Mutex::new(Vec::new()));
        let captured = method_calls.clone();
        let method_host = HostShellExternalCapability {
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
        let free_calls = Arc::new(Mutex::new(Vec::new()));
        let captured = free_calls.clone();
        let free_host = HostShellExternalCapability {
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
        let via_method = block_on(method_host.open_external_url("https://one.test", &policy));
        let via_free = block_on(open_shell_external_url(
            &free_host,
            "https://one.test",
            &policy,
        ));
        assert_eq!(via_method, via_free);
        assert_eq!(*method_calls.lock().unwrap(), *free_calls.lock().unwrap());
    }

    #[test]
    fn open_path_method_matches_open_shell_path() {
        let method_host = HostShellPathOpenCapability {
            open: Arc::new(|_path: String| {
                let future: ShellPathOpenFuture =
                    Box::pin(async { ShellPathOpenOutcome::Ok(ShellPathOpenOutcomeOk {}) });
                return future;
            }),
        };
        let free_host = HostShellPathOpenCapability {
            open: Arc::new(|_path: String| {
                let future: ShellPathOpenFuture =
                    Box::pin(async { ShellPathOpenOutcome::Ok(ShellPathOpenOutcomeOk {}) });
                return future;
            }),
        };
        assert_eq!(
            block_on(method_host.open_path("/item")),
            block_on(open_shell_path(&free_host, "/item"))
        );
    }

    #[test]
    fn read_shortcut_link_method_matches_read_shell_shortcut_link() {
        let method_host = HostShellShortcutLinkCapability {
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
                 _link: ShellShortcutLink,
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
        let free_host = HostShellShortcutLinkCapability {
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
                 _link: ShellShortcutLink,
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
            block_on(method_host.read_shortcut_link("/app.lnk")),
            block_on(read_shell_shortcut_link(&free_host, "/app.lnk"))
        );
    }

    #[test]
    fn reveal_path_method_matches_reveal_shell_path() {
        let method_host = HostShellPathRevealCapability {
            reveal: Arc::new(|_path: String| {
                let future: ShellPathRevealFuture = Box::pin(async {
                    ShellPathRevealOutcome {
                        reason: ShellPathRevealReason::Ok,
                    }
                });
                return future;
            }),
        };
        let free_host = HostShellPathRevealCapability {
            reveal: Arc::new(|_path: String| {
                let future: ShellPathRevealFuture = Box::pin(async {
                    ShellPathRevealOutcome {
                        reason: ShellPathRevealReason::Ok,
                    }
                });
                return future;
            }),
        };
        assert_eq!(
            block_on(method_host.reveal_path("/item")),
            block_on(reveal_shell_path(&free_host, "/item"))
        );
    }

    #[test]
    fn spawn_process_method_matches_spawn_shell_process() {
        let method_host = HostShellProcessCapability {
            spawn: Arc::new(
                |_command: &str, _args: &[String], _options: Option<&ShellProcessOptions>| {
                    return process();
                },
            ),
        };
        let free_host = HostShellProcessCapability {
            spawn: Arc::new(
                |_command: &str, _args: &[String], _options: Option<&ShellProcessOptions>| {
                    return process();
                },
            ),
        };
        let via_method = method_host.spawn_process("/bin/tool", &[], None);
        let via_free = spawn_shell_process(&free_host, "/bin/tool", &[], None);
        assert_eq!(
            block_on(via_method.exit.clone()).read().unwrap().code,
            block_on(via_free.exit.clone()).read().unwrap().code
        );
    }

    #[test]
    fn move_item_to_trash_method_matches_move_shell_item_to_trash() {
        let method_seen = Arc::new(Mutex::new(Vec::new()));
        let method_host = trash_host(method_seen.clone());
        let free_seen = Arc::new(Mutex::new(Vec::new()));
        let free_host = trash_host(free_seen.clone());
        let via_method = block_on(method_host.move_item_to_trash("/item"));
        let via_free = block_on(move_shell_item_to_trash(&free_host, "/item"));
        assert_eq!(via_method, via_free);
        assert_eq!(*method_seen.lock().unwrap(), *free_seen.lock().unwrap());
    }

    #[test]
    fn move_items_to_trash_method_matches_move_shell_items_to_trash() {
        let method_seen = Arc::new(Mutex::new(Vec::new()));
        let method_host = trash_host(method_seen.clone());
        let free_seen = Arc::new(Mutex::new(Vec::new()));
        let free_host = trash_host(free_seen.clone());
        let paths = ["/first".to_string(), "/second".to_string()];
        let via_method = block_on(method_host.move_items_to_trash(&paths));
        let via_free = block_on(move_shell_items_to_trash(&free_host, &paths));
        assert_eq!(via_method, via_free);
        assert_eq!(*method_seen.lock().unwrap(), *free_seen.lock().unwrap());
    }

    #[test]
    fn write_shortcut_link_method_matches_write_shell_shortcut_link() {
        let method_seen = Arc::new(Mutex::new(Vec::new()));
        let captured = method_seen.clone();
        let method_host = HostShellShortcutLinkCapability {
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
        let free_seen = Arc::new(Mutex::new(Vec::new()));
        let captured = free_seen.clone();
        let free_host = HostShellShortcutLinkCapability {
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
        let link_value = link("/app");
        let via_method = block_on(method_host.write_shortcut_link(
            "/app.lnk",
            &link_value,
            ShellShortcutWriteOperation::Replace,
        ));
        let via_free = block_on(write_shell_shortcut_link(
            &free_host,
            "/app.lnk",
            &link_value,
            ShellShortcutWriteOperation::Replace,
        ));
        assert_eq!(via_method, via_free);
        assert_eq!(*method_seen.lock().unwrap(), *free_seen.lock().unwrap());
    }
}

/// Pure policy validation used by `open_shell_external_url` before any host effect (TS
/// `isShellUrlAllowed`). Parsing uses the WHATWG URL parser, so a URL that `new URL(url)` rejects
/// is blocked. The policy is required on every call; an empty `allowed_schemes` intentionally
/// blocks every URL.
pub fn is_shell_url_allowed(url: &str, policy: &ShellExternalUrlPolicy) -> bool {
    let Ok(parsed) = Url::parse(url) else {
        return false;
    };
    let scheme = parsed.scheme().to_lowercase();
    for allowed in &policy.allowed_schemes {
        if allowed.to_lowercase() == scheme {
            return true;
        }
    }
    return false;
}

/// Moves one path to the trash through the host (TS `moveShellItemToTrash`).
pub async fn move_shell_item_to_trash(
    host_shell_trash: &HostShellTrashCapability,
    path: &str,
) -> ShellTrashOutcome {
    return (host_shell_trash.move_to_trash)(path.to_string()).await;
}

/// Projects the one-path provider operation across the batch (TS `moveShellItemsToTrash`). Every
/// operation is started before the first outcome is awaited, every unfinished future is polled on
/// each wake so one can make progress that unblocks another, and outcomes keep the input order.
pub async fn move_shell_items_to_trash(
    host_shell_trash: &HostShellTrashCapability,
    paths: &[String],
) -> Vec<ShellTrashOutcome> {
    let mut futures: Vec<ShellTrashFuture> = Vec::new();
    for path in paths {
        futures.push((host_shell_trash.move_to_trash)(path.clone()));
    }
    let mut outcomes: Vec<Option<ShellTrashOutcome>> = vec![None; futures.len()];
    std::future::poll_fn(|context| {
        let mut pending = false;
        for index in 0..futures.len() {
            if outcomes[index].is_some() {
                continue;
            }
            match futures[index].as_mut().poll(context) {
                Poll::Ready(outcome) => outcomes[index] = Some(outcome),
                Poll::Pending => pending = true,
            }
        }
        if pending {
            return Poll::Pending;
        }
        return Poll::Ready(());
    })
    .await;
    return outcomes
        .into_iter()
        .map(|outcome| outcome.expect("joined shell trash outcome"))
        .collect();
}

/// Hands a URL to an OS handler after the required per-call policy check (TS
/// `openShellExternalUrl`). A blocked or malformed scheme never reaches the host; there is
/// intentionally no policy default, ambient allowlist or allow-all path.
pub async fn open_shell_external_url(
    host_shell_external: &HostShellExternalCapability,
    url: &str,
    policy: &ShellExternalUrlPolicy,
) -> ShellExternalOutcome {
    if !is_shell_url_allowed(url, policy) {
        return ShellExternalOutcome {
            reason: ShellExternalReason::BlockedScheme,
        };
    }
    return (host_shell_external.open)(url.to_string()).await;
}

/// Opens a path through the host (TS `openShellPath`).
pub async fn open_shell_path(
    host_shell_path_open: &HostShellPathOpenCapability,
    path: &str,
) -> ShellPathOpenOutcome {
    return (host_shell_path_open.open)(path.to_string()).await;
}

/// Reads a shortcut link through the host (TS `readShellShortcutLink`).
pub async fn read_shell_shortcut_link(
    host_shell_shortcut_link: &HostShellShortcutLinkCapability,
    shortcut_path: &str,
) -> ShellShortcutLinkReadOutcome {
    return (host_shell_shortcut_link.read)(shortcut_path.to_string()).await;
}

/// Reveals a path through the host (TS `revealShellPath`).
pub async fn reveal_shell_path(
    host_shell_path_reveal: &HostShellPathRevealCapability,
    path: &str,
) -> ShellPathRevealOutcome {
    return (host_shell_path_reveal.reveal)(path.to_string()).await;
}

/// Plays the platform alert sound through the host (TS `shellBeep`). Synchronous dispatch.
pub fn shell_beep(host_shell_beep: &HostShellBeepCapability) {
    (host_shell_beep.beep)();
}

/// Spawns one child process from an argument vector (TS `spawnShellProcess`). The command, the
/// argument vector and the optional options are forwarded unchanged; the provider owns the
/// returned live handle.
pub fn spawn_shell_process(
    host_shell_process: &HostShellProcessCapability,
    command: &str,
    args: &[String],
    options: Option<&ShellProcessOptions>,
) -> ShellProcess {
    return (host_shell_process.spawn)(command, args, options);
}

/// Writes a shortcut link through the host (TS `writeShellShortcutLink`). The operation is
/// explicit and forwarded unchanged.
pub async fn write_shell_shortcut_link(
    host_shell_shortcut_link: &HostShellShortcutLinkCapability,
    shortcut_path: &str,
    link: &ShellShortcutLink,
    operation: ShellShortcutWriteOperation,
) -> ShellShortcutLinkWriteOutcome {
    return (host_shell_shortcut_link.write)(shortcut_path.to_string(), link.clone(), operation)
        .await;
}

// ============================================================================
// D18 sugar: methods on the capability records delegate to the free functions
// ============================================================================

impl HostShellBeepCapability {
    pub fn beep(&self) {
        return shell_beep(self);
    }
}

impl HostShellExternalCapability {
    pub async fn open_external_url(
        &self,
        url: &str,
        policy: &ShellExternalUrlPolicy,
    ) -> ShellExternalOutcome {
        return open_shell_external_url(self, url, policy).await;
    }
}

impl HostShellPathOpenCapability {
    pub async fn open_path(&self, path: &str) -> ShellPathOpenOutcome {
        return open_shell_path(self, path).await;
    }
}

impl HostShellPathRevealCapability {
    pub async fn reveal_path(&self, path: &str) -> ShellPathRevealOutcome {
        return reveal_shell_path(self, path).await;
    }
}

impl HostShellProcessCapability {
    pub fn spawn_process(
        &self,
        command: &str,
        args: &[String],
        options: Option<&ShellProcessOptions>,
    ) -> ShellProcess {
        return spawn_shell_process(self, command, args, options);
    }
}

impl HostShellShortcutLinkCapability {
    pub async fn read_shortcut_link(&self, shortcut_path: &str) -> ShellShortcutLinkReadOutcome {
        return read_shell_shortcut_link(self, shortcut_path).await;
    }

    pub async fn write_shortcut_link(
        &self,
        shortcut_path: &str,
        link: &ShellShortcutLink,
        operation: ShellShortcutWriteOperation,
    ) -> ShellShortcutLinkWriteOutcome {
        return write_shell_shortcut_link(self, shortcut_path, link, operation).await;
    }
}

impl HostShellTrashCapability {
    pub async fn move_item_to_trash(&self, path: &str) -> ShellTrashOutcome {
        return move_shell_item_to_trash(self, path).await;
    }

    pub async fn move_items_to_trash(&self, paths: &[String]) -> Vec<ShellTrashOutcome> {
        return move_shell_items_to_trash(self, paths).await;
    }
}
