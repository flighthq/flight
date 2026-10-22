use flight_host::{HostSpawnCapability, HostTimerCapability, TimerHandle};
use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, Weak};
use std::task::{Context, Poll, Wake, Waker};

type TaskFuture = Pin<Box<dyn Future<Output = ()> + Send>>;

#[derive(Clone)]
pub(crate) struct MockHost {
    inner: Arc<Inner>,
}
struct Inner {
    provider: Arc<()>,
    now: Mutex<f64>,
    ready: Mutex<VecDeque<Arc<Task>>>,
    tasks: Mutex<Vec<Arc<Task>>>,
}
struct Task {
    host: Weak<Inner>,
    future: Mutex<Option<TaskFuture>>,
    queued: AtomicBool,
    woken: AtomicBool,
}
impl MockHost {
    pub(crate) fn new() -> Self {
        return Self {
            inner: Arc::new(Inner {
                provider: Arc::new(()),
                now: Mutex::new(0.0),
                ready: Mutex::new(VecDeque::new()),
                tasks: Mutex::new(Vec::new()),
            }),
        };
    }
    pub(crate) fn spawn(&self) -> HostSpawnCapability {
        let host = Arc::downgrade(&self.inner);
        return HostSpawnCapability {
            provider: self.inner.provider.clone(),
            spawn: Arc::new(move |future| {
                let Some(inner) = host.upgrade() else {
                    return;
                };
                let task = Arc::new(Task {
                    host: host.clone(),
                    future: Mutex::new(Some(future)),
                    queued: AtomicBool::new(false),
                    woken: AtomicBool::new(false),
                });
                inner.tasks.lock().unwrap().push(task.clone());
                // A JS async call starts its prefix synchronously, then enqueues pending work.
                task.poll_once();
            }),
        };
    }
    /// The resolver's loader runs without timeouts or retry delays in this suite, so the host's clock
    /// stays at zero and scheduled callbacks never come due; handles still cancel.
    pub(crate) fn timers(&self) -> HostTimerCapability {
        let clock = Arc::downgrade(&self.inner);
        return HostTimerCapability {
            provider: self.inner.provider.clone(),
            now_ms: Arc::new(move || *clock.upgrade().unwrap().now.lock().unwrap()),
            set_timeout: Arc::new(|_, _| inert_timer()),
            set_interval: Arc::new(|_, _| inert_timer()),
        };
    }
    pub(crate) fn run_ready(&self) {
        for _ in 0..100000 {
            let next = self.inner.ready.lock().unwrap().pop_front();
            let Some(task) = next else {
                return;
            };
            task.queued.store(false, Ordering::SeqCst);
            task.poll_once();
        }
        panic!("deterministic host did not quiesce");
    }
}

fn inert_timer() -> TimerHandle {
    let cancelled = Arc::new(AtomicBool::new(false));
    return TimerHandle {
        cancel: Arc::new(move || {
            cancelled.store(true, Ordering::SeqCst);
        }),
    };
}

impl Task {
    fn enqueue(self: &Arc<Self>) {
        if !self.queued.swap(true, Ordering::SeqCst) {
            if let Some(host) = self.host.upgrade() {
                host.ready.lock().unwrap().push_back(self.clone());
            }
        }
    }
    fn poll_once(self: &Arc<Self>) {
        let future = self.future.lock().unwrap().take();
        let Some(mut future) = future else {
            return;
        };
        self.woken.store(false, Ordering::SeqCst);
        let waker = Waker::from(self.clone());
        let result = future.as_mut().poll(&mut Context::from_waker(&waker));
        match result {
            Poll::Pending => {
                *self.future.lock().unwrap() = Some(future);
                if self.woken.load(Ordering::SeqCst) {
                    self.enqueue();
                }
            }
            Poll::Ready(()) => {
                if let Some(host) = self.host.upgrade() {
                    host.tasks
                        .lock()
                        .unwrap()
                        .retain(|task| !Arc::ptr_eq(task, self));
                }
            }
        }
    }
}
impl Wake for Task {
    fn wake(self: Arc<Self>) {
        self.wake_by_ref();
    }
    fn wake_by_ref(self: &Arc<Self>) {
        self.woken.store(true, Ordering::SeqCst);
        self.enqueue();
    }
}

impl Drop for Inner {
    fn drop(&mut self) {
        for task in self.tasks.get_mut().unwrap().drain(..) {
            let future = task.future.lock().unwrap().take();
            drop(future);
        }
    }
}
