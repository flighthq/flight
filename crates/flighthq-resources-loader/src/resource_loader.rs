//! Batch resource loader — queues load tasks, runs them on start, and emits
//! progress / error / completion signals.
//!
//! # Relationship to the TypeScript module
//!
//! The TS `ResourceLoader` queues `() => Promise<T>` factories and runs them
//! concurrently on the JS event loop, handing each caller back a `Promise<T>`.
//! There is no async runtime in this workspace to drive `Future`s, so the Rust
//! port models each queued task as a synchronous factory closure returning a
//! `Result`. `start_resource_load` runs every queued task in order, fulfilling
//! each task's [`ResourceLoadResult`] handle and emitting the same observable
//! signals: `on_progress` after each task, `on_error` for a failed task, and
//! `on_complete` once every task has finished (or immediately for an empty
//! queue). The only behavior dropped relative to TS is true wall-clock
//! parallelism, which requires an executor that does not exist here.
//!
//! # Usage
//!
//! ```rust
//! use flighthq_resources_loader::{
//!     create_resource_loader, get_resource_loader_result, queue_resource_load,
//!     start_resource_load,
//! };
//!
//! let mut loader = create_resource_loader();
//! let handle = queue_resource_load(&mut loader, || Ok(42));
//! start_resource_load(&mut loader);
//! assert_eq!(get_resource_loader_result(&handle).unwrap().unwrap(), 42);
//! ```

use std::sync::{Arc, Mutex};

use flighthq_signals::emit_signal;
use flighthq_types::ResourceLoadProgress;
use flighthq_types::ResourceLoader;

/// The error type carried by a failed load. Mirrors the boxed error payload on
/// [`ResourceLoader::on_error`].
pub type LoadError = Box<dyn std::error::Error + Send + Sync>;

/// Handle returned by [`queue_resource_load`]. Read the resolved value with
/// [`get_resource_loader_result`] after [`start_resource_load`] has run.
///
/// `T` is the loaded value type for this specific task. The handle is cheaply
/// cloneable; all clones observe the same fulfilled result.
pub struct ResourceLoadResult<T> {
    slot: Arc<Mutex<Option<Result<T, LoadError>>>>,
}

impl<T> Clone for ResourceLoadResult<T> {
    fn clone(&self) -> Self {
        Self {
            slot: Arc::clone(&self.slot),
        }
    }
}

/// Extended loader that carries the queued tasks alongside the public signals.
///
/// The public [`ResourceLoader`] (from `flighthq-types`) exposes only the
/// signals; this wrapper holds the private task queue and progress counters.
pub struct ResourceLoaderHandle {
    /// Public signals surface: `on_complete`, `on_error`, `on_progress`.
    pub loader: ResourceLoader,
    items: Vec<QueuedItem>,
    loaded: u32,
    started: bool,
    total: u32,
}

/// Allocates a new, empty [`ResourceLoaderHandle`].
///
/// Queue tasks with [`queue_resource_load`], then run them with
/// [`start_resource_load`].
pub fn create_resource_loader() -> ResourceLoaderHandle {
    ResourceLoaderHandle {
        loader: ResourceLoader::default(),
        items: Vec::new(),
        loaded: 0,
        started: false,
        total: 0,
    }
}

/// Returns `(loaded, total)` — the number of completed tasks and the total
/// number of queued tasks. Returns `(0, 0)` before [`start_resource_load`].
pub fn get_resource_loader_progress(handle: &ResourceLoaderHandle) -> (u32, u32) {
    (handle.loaded, handle.total)
}

/// Returns the resolved result for a queued task, or `None` if the loader has
/// not been started (or the task has not yet run). Cloned when present, so the
/// handle can be read more than once.
pub fn get_resource_loader_result<T: Clone>(
    result: &ResourceLoadResult<T>,
) -> Option<Result<T, LoadError>> {
    let guard = result.slot.lock().unwrap();
    match &*guard {
        Some(Ok(value)) => Some(Ok(value.clone())),
        Some(Err(error)) => Some(Err(clone_load_error(error))),
        None => None,
    }
}

/// Queues a load `factory` onto the loader and returns a [`ResourceLoadResult`]
/// handle for the eventual value.
///
/// # Panics
///
/// Panics if called after [`start_resource_load`] — tasks must be queued before
/// the batch starts. This mirrors the TS `throw` and is a programmer error.
pub fn queue_resource_load<T, F>(
    handle: &mut ResourceLoaderHandle,
    factory: F,
) -> ResourceLoadResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, LoadError> + Send + 'static,
{
    if handle.started {
        panic!("Cannot queue resources after loading has started");
    }

    let slot: Arc<Mutex<Option<Result<T, LoadError>>>> = Arc::new(Mutex::new(None));
    let task_slot = Arc::clone(&slot);

    handle.items.push(QueuedItem {
        // Erase T: run the typed factory, store the result in the typed slot,
        // and report success/error back to the loader as an erased outcome.
        run: Box::new(move || match factory() {
            Ok(value) => {
                *task_slot.lock().unwrap() = Some(Ok(value));
                Ok(())
            }
            Err(error) => {
                let reported = clone_load_error(&error);
                *task_slot.lock().unwrap() = Some(Err(error));
                Err(reported)
            }
        }),
    });

    ResourceLoadResult { slot }
}

/// Runs all queued load tasks in queue order.
///
/// Emits `on_progress` after each task completes and `on_complete` once every
/// task has finished (or immediately, alongside `on_progress(0, 0)`, when the
/// queue is empty). Failed tasks emit `on_error` but still count toward
/// completion. A no-op if called more than once.
pub fn start_resource_load(handle: &mut ResourceLoaderHandle) {
    if handle.started {
        return;
    }
    handle.started = true;
    handle.total = handle.items.len() as u32;
    handle.loaded = 0;

    if handle.total == 0 {
        emit_signal(
            &handle.loader.on_progress,
            &ResourceLoadProgress {
                loaded: 0,
                total: 0,
            },
        );
        emit_signal(&handle.loader.on_complete, &());
        return;
    }

    let items = std::mem::take(&mut handle.items);
    let total = handle.total;
    for item in items {
        let outcome = (item.run)();
        if let Err(error) = outcome {
            emit_signal(&handle.loader.on_error, &error);
        }
        handle.loaded += 1;
        emit_signal(
            &handle.loader.on_progress,
            &ResourceLoadProgress {
                loaded: handle.loaded,
                total,
            },
        );
        if handle.loaded == total {
            emit_signal(&handle.loader.on_complete, &());
        }
    }
}

/// A type-erased queued task. Running it fulfills the task's typed result slot
/// and returns an erased success/error outcome for the loader to report.
struct QueuedItem {
    run: Box<dyn FnOnce() -> Result<(), LoadError> + Send>,
}

/// Clones a boxed error into a fresh boxed error by preserving its `Display`
/// text. Boxed `dyn Error` is not `Clone`, so both the reported copy and the
/// stored copy reduce to a string-backed error carrying the original message.
fn clone_load_error(error: &LoadError) -> LoadError {
    Box::<dyn std::error::Error + Send + Sync>::from(error.to_string())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use flighthq_signals::connect_signal;

    use super::*;

    // --- create_resource_loader ---

    #[test]
    fn create_resource_loader_returns_clean_state() {
        let handle = create_resource_loader();
        assert_eq!(get_resource_loader_progress(&handle), (0, 0));
    }

    #[test]
    fn create_resource_loader_has_all_signals() {
        let handle = create_resource_loader();
        // Signals are present and connectable.
        let _a = connect_signal(&handle.loader.on_complete, Arc::new(|_: &()| {}), Default::default());
        let _b = connect_signal(
            &handle.loader.on_error,
            Arc::new(|_: &LoadError| {}),
            Default::default(),
        );
        let _c = connect_signal(
            &handle.loader.on_progress,
            Arc::new(|_: &ResourceLoadProgress| {}),
            Default::default(),
        );
    }

    // --- get_resource_loader_result ---

    #[test]
    fn get_resource_loader_result_none_before_start() {
        let mut loader = create_resource_loader();
        let handle = queue_resource_load(&mut loader, || Ok::<_, LoadError>(1));
        assert!(get_resource_loader_result(&handle).is_none());
    }

    #[test]
    fn get_resource_loader_result_can_be_read_twice() {
        let mut loader = create_resource_loader();
        let handle = queue_resource_load(&mut loader, || Ok::<_, LoadError>(7));
        start_resource_load(&mut loader);
        assert_eq!(get_resource_loader_result(&handle).unwrap().unwrap(), 7);
        assert_eq!(get_resource_loader_result(&handle).unwrap().unwrap(), 7);
    }

    // --- queue_resource_load ---

    #[test]
    #[should_panic(expected = "Cannot queue resources after loading has started")]
    fn queue_resource_load_panics_after_start() {
        let mut loader = create_resource_loader();
        start_resource_load(&mut loader);
        let _ = queue_resource_load(&mut loader, || Ok::<_, LoadError>(1));
    }

    #[test]
    fn queue_resource_load_resolves_with_loaded_value() {
        let mut loader = create_resource_loader();
        let handle = queue_resource_load(&mut loader, || Ok::<_, LoadError>("hello".to_string()));
        start_resource_load(&mut loader);
        assert_eq!(get_resource_loader_result(&handle).unwrap().unwrap(), "hello");
    }

    #[test]
    fn queue_resource_load_rejects_when_factory_errs() {
        let mut loader = create_resource_loader();
        let handle = queue_resource_load(&mut loader, || {
            Err::<i32, LoadError>("load failed".into())
        });
        start_resource_load(&mut loader);
        let result = get_resource_loader_result(&handle).unwrap();
        assert_eq!(result.unwrap_err().to_string(), "load failed");
    }

    #[test]
    fn queue_resource_load_fires_progress_after_each_item() {
        let mut loader = create_resource_loader();
        let progress = Arc::new(Mutex::new(Vec::<(u32, u32)>::new()));
        let p = Arc::clone(&progress);
        let _guard = connect_signal(
            &loader.loader.on_progress,
            Arc::new(move |e: &ResourceLoadProgress| {
                p.lock().unwrap().push((e.loaded, e.total));
            }),
            Default::default(),
        );

        queue_resource_load(&mut loader, || Ok::<_, LoadError>("a"));
        queue_resource_load(&mut loader, || Ok::<_, LoadError>("b"));
        queue_resource_load(&mut loader, || Ok::<_, LoadError>("c"));
        start_resource_load(&mut loader);

        let recorded = progress.lock().unwrap();
        assert_eq!(recorded.len(), 3);
        assert_eq!(recorded[2], (3, 3));
    }

    #[test]
    fn queue_resource_load_fires_complete_after_all_items() {
        let mut loader = create_resource_loader();
        let completed = Arc::new(Mutex::new(false));
        let c = Arc::clone(&completed);
        let _guard = connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |_: &()| {
                *c.lock().unwrap() = true;
            }),
            Default::default(),
        );

        queue_resource_load(&mut loader, || Ok::<_, LoadError>(1));
        queue_resource_load(&mut loader, || Ok::<_, LoadError>(2));
        start_resource_load(&mut loader);

        assert!(*completed.lock().unwrap());
    }

    #[test]
    fn queue_resource_load_fires_error_but_still_completes() {
        let mut loader = create_resource_loader();
        let errors = Arc::new(Mutex::new(Vec::<String>::new()));
        let e = Arc::clone(&errors);
        let _err_guard = connect_signal(
            &loader.loader.on_error,
            Arc::new(move |err: &LoadError| {
                e.lock().unwrap().push(err.to_string());
            }),
            Default::default(),
        );
        let completed = Arc::new(Mutex::new(false));
        let c = Arc::clone(&completed);
        let _done_guard = connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |_: &()| {
                *c.lock().unwrap() = true;
            }),
            Default::default(),
        );

        queue_resource_load(&mut loader, || Ok::<_, LoadError>("ok"));
        queue_resource_load(&mut loader, || Err::<&str, LoadError>("oops".into()));
        start_resource_load(&mut loader);

        let recorded = errors.lock().unwrap();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0], "oops");
        assert!(*completed.lock().unwrap());
    }

    // --- start_resource_load ---

    #[test]
    fn start_resource_load_completes_immediately_when_empty() {
        let mut loader = create_resource_loader();
        let called = Arc::new(Mutex::new(false));
        let c = Arc::clone(&called);
        let _guard = connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |_: &()| {
                *c.lock().unwrap() = true;
            }),
            Default::default(),
        );
        start_resource_load(&mut loader);
        assert!(*called.lock().unwrap());
    }

    #[test]
    fn start_resource_load_fires_progress_zero_zero_when_empty() {
        let mut loader = create_resource_loader();
        let args = Arc::new(Mutex::new(None::<(u32, u32)>));
        let a = Arc::clone(&args);
        let _guard = connect_signal(
            &loader.loader.on_progress,
            Arc::new(move |e: &ResourceLoadProgress| {
                *a.lock().unwrap() = Some((e.loaded, e.total));
            }),
            Default::default(),
        );
        start_resource_load(&mut loader);
        assert_eq!(*args.lock().unwrap(), Some((0, 0)));
    }

    #[test]
    fn start_resource_load_is_no_op_on_second_call() {
        let mut loader = create_resource_loader();
        let count = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&count);
        let _guard = connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |_: &()| {
                *c.lock().unwrap() += 1;
            }),
            Default::default(),
        );
        start_resource_load(&mut loader);
        start_resource_load(&mut loader);
        assert_eq!(*count.lock().unwrap(), 1);
    }
}
