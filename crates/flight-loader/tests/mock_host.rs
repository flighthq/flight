use flight_hostcapability::{HostSpawnCapability, HostTimerCapability, TimerHandle};
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
    timers: Mutex<Vec<Timer>>,
}
struct Task {
    host: Weak<Inner>,
    future: Mutex<Option<TaskFuture>>,
    queued: AtomicBool,
    woken: AtomicBool,
}
struct Timer {
    due: f64,
    interval: Option<f64>,
    cancelled: Arc<AtomicBool>,
    callback: Arc<dyn Fn() + Send + Sync>,
}

impl MockHost {
    pub(crate) fn new() -> Self {
        return Self {
            inner: Arc::new(Inner {
                provider: Arc::new(()),
                now: Mutex::new(0.0),
                ready: Mutex::new(VecDeque::new()),
                tasks: Mutex::new(Vec::new()),
                timers: Mutex::new(Vec::new()),
            }),
        };
    }
    pub(crate) fn now(&self) -> f64 {
        return *self.inner.now.lock().unwrap();
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
    pub(crate) fn timers(&self) -> HostTimerCapability {
        let clock = Arc::downgrade(&self.inner);
        let timeout = Arc::downgrade(&self.inner);
        let interval = Arc::downgrade(&self.inner);
        return HostTimerCapability {
            provider: self.inner.provider.clone(),
            now_ms: Arc::new(move || *clock.upgrade().unwrap().now.lock().unwrap()),
            set_timeout: Arc::new(move |delay, callback| schedule(&timeout, delay, None, callback)),
            set_interval: Arc::new(move |delay, callback| {
                let period = if delay.is_nan() || delay < 1.0 {
                    1.0
                } else {
                    delay
                };
                schedule(&interval, period, Some(period), callback)
            }),
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
    pub(crate) fn advance(&self, delta: f64) {
        self.run_ready();
        let target = self.now() + delta;
        for _ in 0..100000 {
            let callback = {
                let mut timers = self.inner.timers.lock().unwrap();
                let next = timers
                    .iter()
                    .enumerate()
                    .filter(|(_, timer)| {
                        !timer.cancelled.load(Ordering::SeqCst) && timer.due <= target
                    })
                    .min_by(|a, b| a.1.due.partial_cmp(&b.1.due).unwrap().then(a.0.cmp(&b.0)))
                    .map(|(index, _)| index);
                next.map(|index| {
                    let mut timer = timers.remove(index);
                    *self.inner.now.lock().unwrap() = timer.due;
                    let callback = timer.callback.clone();
                    if let Some(period) = timer.interval {
                        timer.due += period;
                        timers.push(timer);
                    }
                    callback
                })
            };
            let Some(callback) = callback else {
                let mut now = self.inner.now.lock().unwrap();
                *now = now.max(target);
                return;
            };
            callback();
            self.run_ready();
        }
        panic!("deterministic timers did not quiesce");
    }
    pub(crate) fn timer_count(&self) -> usize {
        return self
            .inner
            .timers
            .lock()
            .unwrap()
            .iter()
            .filter(|timer| !timer.cancelled.load(Ordering::SeqCst))
            .count();
    }
}

fn schedule(
    host: &Weak<Inner>,
    delay: f64,
    interval: Option<f64>,
    callback: Arc<dyn Fn() + Send + Sync>,
) -> TimerHandle {
    let inner = host.upgrade().unwrap();
    let delay = if delay.is_nan() || delay < 0.0 {
        0.0
    } else {
        delay
    };
    let due = *inner.now.lock().unwrap() + delay;
    let cancelled = Arc::new(AtomicBool::new(false));
    inner.timers.lock().unwrap().push(Timer {
        due,
        interval,
        cancelled: cancelled.clone(),
        callback,
    });
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
