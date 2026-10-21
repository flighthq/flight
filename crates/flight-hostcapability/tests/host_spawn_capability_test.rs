use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Wake, Waker};

use flight_hostcapability::contract::*;

type SpawnedFuture = Pin<Box<dyn Future<Output = ()> + Send>>;

struct NoopWake;

impl Wake for NoopWake {
    fn wake(self: Arc<Self>) {}
}

fn drive(mut future: SpawnedFuture) {
    let waker = Waker::from(Arc::new(NoopWake));
    let mut context = Context::from_waker(&waker);
    loop {
        if let Poll::Ready(()) = future.as_mut().poll(&mut context) {
            return;
        }
        std::thread::yield_now();
    }
}

#[test]
fn host_drives_every_retained_future_without_an_sdk_executor() {
    let retained: Arc<Mutex<Vec<SpawnedFuture>>> = Arc::new(Mutex::new(Vec::new()));
    let provider: ProviderRef = Arc::new(());
    let capability = HostSpawnCapability {
        provider: provider.clone(),
        spawn: Arc::new({
            let retained = retained.clone();
            move |future| {
                retained.lock().unwrap().push(future);
            }
        }),
    };
    let completed = Arc::new(AtomicUsize::new(0));

    for _ in 0..2 {
        let completed = completed.clone();
        (capability.spawn)(Box::pin(async move {
            completed.fetch_add(1, Ordering::SeqCst);
        }));
    }

    assert_eq!(completed.load(Ordering::SeqCst), 0);
    assert_eq!(retained.lock().unwrap().len(), 2);
    let futures = std::mem::take(&mut *retained.lock().unwrap());
    for future in futures {
        drive(future);
    }
    assert_eq!(completed.load(Ordering::SeqCst), 2);
    assert!(Arc::ptr_eq(&capability.provider, &provider));
}

#[test]
fn optional_slot_preserves_capability_absence_and_provider_identity() {
    let unavailable: Option<HostSpawnCapability> = None;
    assert!(unavailable.is_none());

    let provider: ProviderRef = Arc::new(());
    let available = Some(HostSpawnCapability {
        provider: provider.clone(),
        spawn: Arc::new(|_| {}),
    });
    let cloned = available.clone().unwrap();
    assert!(Arc::ptr_eq(&cloned.provider, &provider));
}
