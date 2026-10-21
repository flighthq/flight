//! Recording mock hosts for the window tests (the source's `recording*Backend` doubles).

use std::future::ready;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use crate::contract::*;
use flight_entity::{Ref, allocate_entity};
use flight_hostcapability::ProviderRef;
use flight_input::{
    HostInputDropFileCapability, HostInputFocusCapability, HostInputPointerLockCapability,
    InputIngressRelease, InputPointerLockExitFuture, InputPointerLockExitOutcome,
    InputPointerLockExitReason, InputPointerLockRequestFuture, InputPointerLockRequestOutcome,
    InputPointerLockRequestReason, InputTargetHandle,
};
use flight_screen::{
    HostScreenChangeCapability, ScreenChangeEvent, ScreenChangeKind, ScreenChangeListener,
    ScreenChangedMetrics,
};
use flight_signals::{Signal, connect_signal};

pub type Calls = Arc<Mutex<Vec<String>>>;

pub fn calls_of(calls: &Calls) -> Vec<String> {
    return calls.lock().unwrap().clone();
}

fn record(calls: &Calls, entry: String) {
    calls.lock().unwrap().push(entry);
}

type CloseSubscription = (
    usize,
    WindowCloseRequestListener,
    Arc<dyn Fn() + Send + Sync>,
);

/// One double for every window capability, as the source's `RecordingWindowBackend`.
pub struct WindowBackend {
    pub calls: Calls,
    close: Arc<Mutex<Vec<CloseSubscription>>>,
    moves: Arc<Mutex<Vec<(usize, WindowMoveListener)>>>,
    next: Arc<AtomicUsize>,
    provider: ProviderRef,
    resizes: Arc<Mutex<Vec<(usize, WindowResizeListener)>>>,
    visibility: Arc<Mutex<Vec<(usize, WindowVisibilityListener)>>>,
}

fn release_entry<T: Send + 'static>(
    list: &Arc<Mutex<Vec<(usize, T)>>>,
    id: usize,
) -> AppUnsubscribe {
    let list = list.clone();
    return Arc::new(move || list.lock().unwrap().retain(|(entry, _)| *entry != id));
}

pub fn window_backend() -> WindowBackend {
    return WindowBackend {
        calls: Arc::new(Mutex::new(Vec::new())),
        close: Arc::new(Mutex::new(Vec::new())),
        moves: Arc::new(Mutex::new(Vec::new())),
        next: Arc::new(AtomicUsize::new(0)),
        provider: Arc::new(()),
        resizes: Arc::new(Mutex::new(Vec::new())),
        visibility: Arc::new(Mutex::new(Vec::new())),
    };
}

impl WindowBackend {
    pub fn calls(&self) -> Vec<String> {
        return calls_of(&self.calls);
    }

    pub fn appearance(&self) -> HostWindowAppearanceCapability {
        let (c1, c2, c3) = (self.calls.clone(), self.calls.clone(), self.calls.clone());
        return HostWindowAppearanceCapability {
            provider: self.provider.clone(),
            set_icon: Some(Arc::new(move |_win: &Ref<AppWindow>, icon: &str| {
                record(&c1, format!("setIcon:{}", icon))
            })),
            set_opacity: Some(Arc::new(move |_win: &Ref<AppWindow>, opacity: f32| {
                record(&c2, format!("setOpacity:{}", opacity))
            })),
            set_title: Arc::new(move |_win: &Ref<AppWindow>, title: &str| {
                record(&c3, format!("setTitle:{}", title))
            }),
        };
    }

    pub fn attach(&self) -> HostWindowAttachCapability {
        let calls = self.calls.clone();
        return HostWindowAttachCapability {
            provider: self.provider.clone(),
            attach: Arc::new(
                move |_win: &Ref<AppWindow>,
                      _handle: &NativeWindowHandle,
                      ownership: WindowAttachmentOwnership| {
                    record(
                        &calls,
                        format!(
                            "attach:{}",
                            if ownership == WindowAttachmentOwnership::Host {
                                "host"
                            } else {
                                "flight"
                            }
                        ),
                    );
                    return true;
                },
            ),
        };
    }

    pub fn attention(&self) -> HostWindowAttentionCapability {
        let (c1, c2) = (self.calls.clone(), self.calls.clone());
        return HostWindowAttentionCapability {
            provider: self.provider.clone(),
            flash_window_frame: Some(Arc::new(move |_win: &Ref<AppWindow>| {
                record(&c1, "flashWindowFrame".to_string())
            })),
            request_attention: Arc::new(move |_win: &Ref<AppWindow>, attention: bool| {
                record(&c2, format!("requestAttention:{}", attention));
            }),
        };
    }

    pub fn content_protection(&self) -> HostWindowContentProtectionCapability {
        let calls = self.calls.clone();
        return HostWindowContentProtectionCapability {
            provider: self.provider.clone(),
            set_content_protection: Arc::new(move |_win: &Ref<AppWindow>, enabled: bool| {
                record(&calls, format!("setContentProtection:{}", enabled));
            }),
        };
    }

    pub fn focus(&self) -> HostWindowFocusCapability {
        let calls = self.calls.clone();
        return HostWindowFocusCapability {
            provider: self.provider.clone(),
            focus: Arc::new(move |_win: &Ref<AppWindow>| record(&calls, "focus".to_string())),
        };
    }

    pub fn fullscreen(&self) -> HostWindowFullscreenCapability {
        let calls = self.calls.clone();
        return HostWindowFullscreenCapability {
            provider: self.provider.clone(),
            set_fullscreen: Arc::new(move |_win: &Ref<AppWindow>, fullscreen: bool| {
                record(&calls, format!("setFullscreen:{}", fullscreen));
            }),
        };
    }

    pub fn geometry(&self) -> HostWindowGeometryCapability {
        let (c1, c2, c3, c4) = (
            self.calls.clone(),
            self.calls.clone(),
            self.calls.clone(),
            self.calls.clone(),
        );
        let (moves, resizes) = (self.moves.clone(), self.resizes.clone());
        let (next_move, next_resize) = (self.next.clone(), self.next.clone());
        return HostWindowGeometryCapability {
            provider: self.provider.clone(),
            center: Some(Arc::new(move |_win: &Ref<AppWindow>| {
                record(&c1, "center".to_string())
            })),
            get_bounds: Arc::new(move |out: &mut WindowBounds, _win: &Ref<AppWindow>| {
                record(&c2, "getBounds".to_string());
                out.x = 1.0;
                out.y = 2.0;
                out.width = 3.0;
                out.height = 4.0;
            }),
            set_position: Arc::new(move |_win: &Ref<AppWindow>, x: f32, y: f32| {
                record(&c3, format!("setPosition:{},{}", x, y))
            }),
            set_size: Arc::new(move |_win: &Ref<AppWindow>, width: f32, height: f32| {
                record(&c4, format!("setSize:{},{}", width, height));
            }),
            subscribe_move: Some(Arc::new(move |listener: WindowMoveListener| {
                let id = next_move.fetch_add(1, Ordering::SeqCst);
                moves.lock().unwrap().push((id, listener));
                return release_entry(&moves, id);
            })),
            subscribe_resize: Some(Arc::new(
                move |_target: &Ref<WindowResizeTargetHandle>, listener: WindowResizeListener| {
                    let id = next_resize.fetch_add(1, Ordering::SeqCst);
                    resizes.lock().unwrap().push((id, listener));
                    return release_entry(&resizes, id);
                },
            )),
        };
    }

    pub fn hierarchy(&self) -> HostWindowHierarchyCapability {
        let calls = self.calls.clone();
        return HostWindowHierarchyCapability {
            provider: self.provider.clone(),
            set_parent: Arc::new(
                move |_win: &Ref<AppWindow>, parent: Option<&Ref<AppWindow>>| {
                    record(
                        &calls,
                        format!(
                            "setParent:{}",
                            if parent.is_none() { "null" } else { "win" }
                        ),
                    );
                },
            ),
        };
    }

    pub fn lifecycle(&self) -> HostWindowLifecycleCapability {
        let (c1, c2) = (self.calls.clone(), self.calls.clone());
        let (close, next) = (self.close.clone(), self.next.clone());
        return HostWindowLifecycleCapability {
            provider: self.provider.clone(),
            close: Arc::new(move |_win: &Ref<AppWindow>| record(&c1, "close".to_string())),
            open: Arc::new(move |_win: &Ref<AppWindow>, options: &WindowOptions| {
                record(
                    &c2,
                    format!("open:{}", options.title.clone().unwrap_or_default()),
                );
                return true;
            }),
            subscribe_close: Some(Arc::new(
                move |on_close_request: WindowCloseRequestListener,
                      on_close: Arc<dyn Fn() + Send + Sync>| {
                    let id = next.fetch_add(1, Ordering::SeqCst);
                    close.lock().unwrap().push((id, on_close_request, on_close));
                    let close = close.clone();
                    let release: AppUnsubscribe = Arc::new(move || {
                        close.lock().unwrap().retain(|(entry, _, _)| *entry != id)
                    });
                    return release;
                },
            )),
        };
    }

    pub fn progress(&self) -> HostWindowProgressCapability {
        let calls = self.calls.clone();
        return HostWindowProgressCapability {
            provider: self.provider.clone(),
            set_progress: Arc::new(move |_win: &Ref<AppWindow>, progress: f32| {
                record(&calls, format!("setProgress:{}", progress))
            }),
        };
    }

    pub fn shadow(&self) -> HostWindowShadowCapability {
        let calls = self.calls.clone();
        return HostWindowShadowCapability {
            provider: self.provider.clone(),
            set_has_shadow: Arc::new(move |_win: &Ref<AppWindow>, has_shadow: bool| {
                record(&calls, format!("setHasShadow:{}", has_shadow));
            }),
        };
    }

    pub fn shell(&self) -> HostWindowShellCapability {
        let (c1, c2) = (self.calls.clone(), self.calls.clone());
        return HostWindowShellCapability {
            provider: self.provider.clone(),
            set_menu_bar_visible: Some(Arc::new(move |_win: &Ref<AppWindow>, visible: bool| {
                record(&c1, format!("setMenuBarVisible:{}", visible));
            })),
            set_skip_taskbar: Some(Arc::new(move |_win: &Ref<AppWindow>, skip: bool| {
                record(&c2, format!("setSkipTaskbar:{}", skip))
            })),
        };
    }

    pub fn size_constraints(&self) -> HostWindowSizeConstraintsCapability {
        let (c1, c2, c3) = (self.calls.clone(), self.calls.clone(), self.calls.clone());
        return HostWindowSizeConstraintsCapability {
            provider: self.provider.clone(),
            set_maximum_size: Arc::new(move |_win: &Ref<AppWindow>, width: f32, height: f32| {
                record(&c1, format!("setMaximumSize:{},{}", width, height));
            }),
            set_minimum_size: Arc::new(move |_win: &Ref<AppWindow>, width: f32, height: f32| {
                record(&c2, format!("setMinimumSize:{},{}", width, height));
            }),
            set_resizable: Some(Arc::new(move |_win: &Ref<AppWindow>, resizable: bool| {
                record(&c3, format!("setResizable:{}", resizable));
            })),
        };
    }

    pub fn state(&self) -> HostWindowStateCapability {
        let (c1, c2, c3) = (self.calls.clone(), self.calls.clone(), self.calls.clone());
        return HostWindowStateCapability {
            provider: self.provider.clone(),
            maximize: Arc::new(move |_win: &Ref<AppWindow>| record(&c1, "maximize".to_string())),
            minimize: Arc::new(move |_win: &Ref<AppWindow>| record(&c2, "minimize".to_string())),
            restore: Arc::new(move |_win: &Ref<AppWindow>| record(&c3, "restore".to_string())),
        };
    }

    pub fn visibility(&self) -> HostWindowVisibilityCapability {
        let (c1, c2) = (self.calls.clone(), self.calls.clone());
        let (listeners, next) = (self.visibility.clone(), self.next.clone());
        return HostWindowVisibilityCapability {
            provider: self.provider.clone(),
            hide: Arc::new(move |_win: &Ref<AppWindow>| record(&c1, "hide".to_string())),
            show: Arc::new(move |_win: &Ref<AppWindow>| record(&c2, "show".to_string())),
            subscribe_visibility: Some(Arc::new(move |listener: WindowVisibilityListener| {
                let id = next.fetch_add(1, Ordering::SeqCst);
                listeners.lock().unwrap().push((id, listener));
                return release_entry(&listeners, id);
            })),
        };
    }

    pub fn z_order(&self) -> HostWindowZOrderCapability {
        let calls = self.calls.clone();
        return HostWindowZOrderCapability {
            provider: self.provider.clone(),
            set_always_on_top: Arc::new(move |_win: &Ref<AppWindow>, always_on_top: bool| {
                record(&calls, format!("setAlwaysOnTop:{}", always_on_top));
            }),
        };
    }

    pub fn emit_close_request(&self) -> bool {
        let subscriptions: Vec<WindowCloseRequestListener> = self
            .close
            .lock()
            .unwrap()
            .iter()
            .map(|(_, request, _)| request.clone())
            .collect();
        let mut cancelled = false;
        for request in subscriptions {
            if request() {
                cancelled = true;
            }
        }
        return cancelled;
    }

    pub fn emit_closed(&self) {
        let closes: Vec<Arc<dyn Fn() + Send + Sync>> = self
            .close
            .lock()
            .unwrap()
            .iter()
            .map(|(_, _, close)| close.clone())
            .collect();
        for close in closes {
            close();
        }
    }

    pub fn emit_move(&self, x: f32, y: f32) {
        let listeners: Vec<WindowMoveListener> = self
            .moves
            .lock()
            .unwrap()
            .iter()
            .map(|(_, l)| l.clone())
            .collect();
        for listener in listeners {
            listener(x, y);
        }
    }

    pub fn emit_resize(&self, width: f32, height: f32, device_pixel_ratio: f32) {
        let listeners: Vec<WindowResizeListener> = self
            .resizes
            .lock()
            .unwrap()
            .iter()
            .map(|(_, l)| l.clone())
            .collect();
        for listener in listeners {
            listener(width, height, device_pixel_ratio);
        }
    }

    pub fn emit_visibility(&self, visible: bool) {
        let listeners: Vec<WindowVisibilityListener> = self
            .visibility
            .lock()
            .unwrap()
            .iter()
            .map(|(_, l)| l.clone())
            .collect();
        for listener in listeners {
            listener(visible);
        }
    }
}

/// The source's `recordingFullscreenBackend`.
pub struct FullscreenBackend {
    pub calls: Calls,
    callbacks: Arc<Mutex<Vec<(usize, Arc<dyn Fn(bool) + Send + Sync>)>>>,
    pub capability: HostElementFullscreenCapability,
}

pub fn fullscreen_backend() -> FullscreenBackend {
    let calls: Calls = Arc::new(Mutex::new(Vec::new()));
    let callbacks: Arc<Mutex<Vec<(usize, Arc<dyn Fn(bool) + Send + Sync>)>>> =
        Arc::new(Mutex::new(Vec::new()));
    let (c1, c2, c3) = (calls.clone(), calls.clone(), calls.clone());
    let (live, next) = (callbacks.clone(), Arc::new(AtomicUsize::new(0)));
    let capability = HostElementFullscreenCapability {
        provider: Arc::new(()),
        exit: Arc::new(move || {
            record(&c1, "exit".to_string());
            let resolved: AppProviderFuture<bool> = Box::pin(ready(Ok(true)));
            return resolved;
        }),
        request: Arc::new(move |_target: &Ref<FullscreenTargetHandle>| {
            record(&c2, "request".to_string());
            let resolved: AppProviderFuture<bool> = Box::pin(ready(Ok(true)));
            return resolved;
        }),
        subscribe: Some(Arc::new(
            move |callback: Arc<dyn Fn(bool) + Send + Sync>| {
                record(&c3, "subscribe".to_string());
                let id = next.fetch_add(1, Ordering::SeqCst);
                live.lock().unwrap().push((id, callback));
                let (log, live, active) =
                    (c3.clone(), live.clone(), Arc::new(AtomicBool::new(true)));
                let release: AppUnsubscribe = Arc::new(move || {
                    if !active.swap(false, Ordering::SeqCst) {
                        return;
                    }
                    record(&log, "release".to_string());
                    live.lock().unwrap().retain(|(entry, _)| *entry != id);
                });
                return release;
            },
        )),
    };
    return FullscreenBackend {
        calls,
        callbacks,
        capability,
    };
}

impl FullscreenBackend {
    pub fn emit(&self, fullscreen: bool) {
        let callbacks: Vec<Arc<dyn Fn(bool) + Send + Sync>> = self
            .callbacks
            .lock()
            .unwrap()
            .iter()
            .map(|(_, c)| c.clone())
            .collect();
        for callback in callbacks {
            callback(fullscreen);
        }
    }

    pub fn calls(&self) -> Vec<String> {
        return calls_of(&self.calls);
    }
}

/// The source's `recordingInputDropFileBackend`: one listener, replaced by each subscribe.
pub struct DropFileBackend {
    pub calls: Calls,
    pub capability: HostInputDropFileCapability,
    listener: Arc<Mutex<Option<Arc<dyn Fn(&str) + Send + Sync>>>>,
}

pub fn drop_file_backend() -> DropFileBackend {
    let calls: Calls = Arc::new(Mutex::new(Vec::new()));
    let listener: Arc<Mutex<Option<Arc<dyn Fn(&str) + Send + Sync>>>> = Arc::new(Mutex::new(None));
    let (log, slot) = (calls.clone(), listener.clone());
    let capability = HostInputDropFileCapability {
        provider: Arc::new(()),
        subscribe: Arc::new(
            move |_target: &InputTargetHandle, next: Arc<dyn Fn(&str) + Send + Sync>| {
                record(&log, "subscribe".to_string());
                *slot.lock().unwrap() = Some(next.clone());
                let (log, slot) = (log.clone(), slot.clone());
                let release: InputIngressRelease = Arc::new(move || {
                    record(&log, "release".to_string());
                    let mut current = slot.lock().unwrap();
                    if current
                        .as_ref()
                        .is_some_and(|existing| Arc::ptr_eq(existing, &next))
                    {
                        *current = None;
                    }
                });
                return release;
            },
        ),
    };
    return DropFileBackend {
        calls,
        capability,
        listener,
    };
}

impl DropFileBackend {
    pub fn emit(&self, path: &str) {
        let listener = self.listener.lock().unwrap().clone();
        if let Some(listener) = listener {
            listener(path);
        }
    }
}

type Pair = (Arc<dyn Fn() + Send + Sync>, Arc<dyn Fn() + Send + Sync>);

/// The source's `recordingInputFocusBackend`.
pub struct FocusBackend {
    pub calls: Calls,
    pub capability: HostInputFocusCapability,
    listeners: Arc<Mutex<Option<Pair>>>,
}

pub fn focus_backend() -> FocusBackend {
    let calls: Calls = Arc::new(Mutex::new(Vec::new()));
    let listeners: Arc<Mutex<Option<Pair>>> = Arc::new(Mutex::new(None));
    let (log, slot) = (calls.clone(), listeners.clone());
    let capability = HostInputFocusCapability {
        provider: Arc::new(()),
        subscribe: Arc::new(
            move |_target: &InputTargetHandle,
                  focus: Arc<dyn Fn() + Send + Sync>,
                  blur: Arc<dyn Fn() + Send + Sync>| {
                record(&log, "subscribe".to_string());
                *slot.lock().unwrap() = Some((focus.clone(), blur));
                let (log, slot) = (log.clone(), slot.clone());
                let release: InputIngressRelease = Arc::new(move || {
                    record(&log, "release".to_string());
                    let mut current = slot.lock().unwrap();
                    if current
                        .as_ref()
                        .is_some_and(|(existing, _)| Arc::ptr_eq(existing, &focus))
                    {
                        *current = None;
                    }
                });
                return release;
            },
        ),
    };
    return FocusBackend {
        calls,
        capability,
        listeners,
    };
}

impl FocusBackend {
    pub fn emit_focus(&self) {
        let pair = self.listeners.lock().unwrap().clone();
        if let Some((focus, _)) = pair {
            focus();
        }
    }

    pub fn emit_blur(&self) {
        let pair = self.listeners.lock().unwrap().clone();
        if let Some((_, blur)) = pair {
            blur();
        }
    }
}

/// The source's `recordingInputPointerLockBackend`: both operations succeed and record.
pub fn pointer_lock_backend() -> (HostInputPointerLockCapability, Calls) {
    let calls: Calls = Arc::new(Mutex::new(Vec::new()));
    let (c1, c2) = (calls.clone(), calls.clone());
    let capability = HostInputPointerLockCapability {
        provider: Arc::new(()),
        exit: Arc::new(move || {
            record(&c1, "exit".to_string());
            let outcome: InputPointerLockExitFuture =
                Box::pin(ready(InputPointerLockExitOutcome {
                    reason: InputPointerLockExitReason::Ok,
                }));
            return outcome;
        }),
        request: Arc::new(move |_target: &InputTargetHandle| {
            record(&c2, "request".to_string());
            let outcome: InputPointerLockRequestFuture =
                Box::pin(ready(InputPointerLockRequestOutcome {
                    reason: InputPointerLockRequestReason::Ok,
                }));
            return outcome;
        }),
    };
    return (capability, calls);
}

/// The source's `recordingScreenChangeBackend`: emits orientation-only metric changes.
pub struct ScreenBackend {
    pub capability: HostScreenChangeCapability,
    listeners: Arc<Mutex<Vec<(usize, ScreenChangeListener)>>>,
}

pub fn screen_backend() -> ScreenBackend {
    let listeners: Arc<Mutex<Vec<(usize, ScreenChangeListener)>>> =
        Arc::new(Mutex::new(Vec::new()));
    let (live, next) = (listeners.clone(), Arc::new(AtomicUsize::new(0)));
    let capability = HostScreenChangeCapability {
        provider: Arc::new(()),
        subscribe: Arc::new(move |listener: ScreenChangeListener| {
            let id = next.fetch_add(1, Ordering::SeqCst);
            live.lock().unwrap().push((id, listener));
            let live = live.clone();
            return Arc::new(move || live.lock().unwrap().retain(|(entry, _)| *entry != id));
        }),
    };
    return ScreenBackend {
        capability,
        listeners,
    };
}

impl ScreenBackend {
    pub fn emit_orientation(&self) {
        let event = ScreenChangeEvent {
            kind: ScreenChangeKind::ScreenMetricsChanged,
            screen: allocate_entity(),
            changed_metrics: Some(ScreenChangedMetrics {
                bounds: false,
                work_area: false,
                scale_factor: false,
                orientation: true,
            }),
        };
        let listeners: Vec<ScreenChangeListener> = self
            .listeners
            .lock()
            .unwrap()
            .iter()
            .map(|(_, l)| l.clone())
            .collect();
        for listener in listeners {
            listener(&event);
        }
    }
}

pub fn target() -> InputTargetHandle {
    return allocate_entity();
}

pub fn resize_target() -> Ref<WindowResizeTargetHandle> {
    return Arc::new(std::sync::RwLock::new(allocate_entity()));
}

/// A counter connected to one of the window's payload-free signals.
pub fn count(win: &Ref<AppWindow>, pick: fn(&AppWindow) -> &Signal<()>) -> Arc<AtomicUsize> {
    let counter = Arc::new(AtomicUsize::new(0));
    let tally = counter.clone();
    let signal = pick(&win.read().unwrap()).clone();
    connect_signal(
        &signal,
        Arc::new(move |_value: &()| {
            tally.fetch_add(1, Ordering::SeqCst);
        }),
        None,
    );
    return counter;
}

pub fn signal(win: &Ref<AppWindow>, pick: fn(&AppWindow) -> &Signal<()>) -> Signal<()> {
    return pick(&win.read().unwrap()).clone();
}

pub fn hits(counter: &Arc<AtomicUsize>) -> usize {
    return counter.load(Ordering::SeqCst);
}
