use std::future::Future;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};

use flight_entity::Unknown;
use flight_font::contract::*;

pub(crate) struct FontBackendRecord {
    pub added: Mutex<Vec<Arc<FontFace>>>,
    pub checked: Mutex<Vec<String>>,
    pub constructions: Mutex<Vec<(String, FontFaceSource, Arc<FontFace>)>>,
    pub existing: Mutex<Vec<Arc<FontFace>>>,
    pub load_error: Mutex<Option<Unknown>>,
    pub loaded: Mutex<Vec<Arc<FontFace>>>,
    pub lookup_error: Mutex<Option<Unknown>>,
    pub lookups: Mutex<Vec<String>>,
    pub ready_count: AtomicUsize,
    pub ready_error: Mutex<Option<Unknown>>,
}

pub(crate) fn backend() -> (HostFontLoadingCapability, Arc<FontBackendRecord>) {
    let provider = Arc::new(()) as flight_hostcapability::ProviderRef;
    let record = Arc::new(FontBackendRecord {
        added: Mutex::new(Vec::new()),
        checked: Mutex::new(Vec::new()),
        constructions: Mutex::new(Vec::new()),
        existing: Mutex::new(Vec::new()),
        load_error: Mutex::new(None),
        loaded: Mutex::new(Vec::new()),
        lookup_error: Mutex::new(None),
        lookups: Mutex::new(Vec::new()),
        ready_count: AtomicUsize::new(0),
        ready_error: Mutex::new(None),
    });

    let add_record = record.clone();
    let check_record = record.clone();
    let create_record = record.clone();
    let face_provider = provider.clone();
    let load_record = record.clone();
    let lookup_record = record.clone();
    let ready_record = record.clone();
    let capability = HostFontLoadingCapability {
        add_font_face: Arc::new(move |face| add_record.added.lock().unwrap().push(face.clone())),
        check_font_face: Arc::new(move |shorthand| {
            check_record
                .checked
                .lock()
                .unwrap()
                .push(shorthand.to_string());
            return shorthand != "1em 'Absent'";
        }),
        create_font_face: Arc::new(move |family, source| {
            let face = Arc::new(FontFace {
                provider: face_provider.clone(),
                handle: Arc::new(()),
                family: family.to_string(),
            });
            create_record.constructions.lock().unwrap().push((
                family.to_string(),
                source.clone(),
                face.clone(),
            ));
            return face;
        }),
        load_font_face: Arc::new(move |face| {
            load_record.loaded.lock().unwrap().push(face.clone());
            let error = load_record.load_error.lock().unwrap().take();
            return Box::pin(async move {
                if let Some(error) = error {
                    return Err(error);
                }
                return Ok(());
            });
        }),
        load_font_faces: Arc::new(move |shorthand| {
            lookup_record
                .lookups
                .lock()
                .unwrap()
                .push(shorthand.to_string());
            let error = lookup_record.lookup_error.lock().unwrap().take();
            let faces = lookup_record.existing.lock().unwrap().clone();
            return Box::pin(async move {
                if let Some(error) = error {
                    return Err(error);
                }
                return Ok(faces);
            });
        }),
        provider,
        when_ready: Arc::new(move || {
            ready_record.ready_count.fetch_add(1, Ordering::SeqCst);
            let error = ready_record.ready_error.lock().unwrap().take();
            return Box::pin(async move {
                if let Some(error) = error {
                    return Err(error);
                }
                return Ok(());
            });
        }),
    };
    return (capability, record);
}

pub(crate) fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

pub(crate) fn face(family: &str) -> Arc<FontFace> {
    return Arc::new(FontFace {
        provider: Arc::new(()),
        handle: Arc::new(()),
        family: family.to_string(),
    });
}

pub(crate) fn rejection(message: &str) -> Unknown {
    return Some(Arc::new(message.to_string()));
}

pub(crate) fn rejection_message(error: &Unknown) -> Option<&str> {
    return error
        .as_ref()
        .and_then(|error| error.downcast_ref::<String>())
        .map(String::as_str);
}
