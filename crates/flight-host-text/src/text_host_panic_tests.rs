use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Barrier};

use flight_buffer::{
    ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
};
use flight_font::{FontFace, FontFaceSource, FontFaceSourceData};
use flight_font_formats::{
    SyntheticFontOptions, create_synthetic_font, empty_synthetic_glyph, square_synthetic_glyph,
};
use flight_host::FontFaceHandle;

use crate::opentype_backend;
use crate::text_host::{
    TextFailure, catch_operation, catch_result, create_text_host, dispose_text_host,
    get_text_host_font_capabilities,
};
use crate::types::{TextHostOperationExplanationReason, TextHostTestHook};

#[test]
fn create_face_checks_liveness_before_and_after_parsing() {
    let calls = Arc::new(AtomicUsize::new(0));
    let retained = calls.clone();
    let mut disposed = create_text_host(None);
    *disposed.state.test_hook.write().expect("test hook") = Some(Arc::new(move |point| {
        if point == TextHostTestHook::CreateAfterPrecheck {
            retained.fetch_add(1, Ordering::Relaxed);
        }
    }));
    let loader = get_text_host_font_capabilities(&disposed)
        .loader
        .as_ref()
        .expect("loader")
        .clone();
    dispose_text_host(&mut disposed);
    let face = (loader.create_font_face)("disposed", &valid_face_source());
    assert_eq!(calls.load(Ordering::Relaxed), 0);
    assert!(opentype_backend::validate_face(&face).is_err());

    let mut racing = create_text_host(None);
    let loader = get_text_host_font_capabilities(&racing)
        .loader
        .as_ref()
        .expect("loader")
        .clone();
    let reached = Arc::new(Barrier::new(2));
    let resume = Arc::new(Barrier::new(2));
    let hook_reached = reached.clone();
    let hook_resume = resume.clone();
    *racing.state.test_hook.write().expect("test hook") = Some(Arc::new(move |point| {
        if point == TextHostTestHook::CreateAfterParse {
            hook_reached.wait();
            hook_resume.wait();
        }
    }));
    let thread = std::thread::spawn(move || {
        return (loader.create_font_face)("racing", &valid_face_source());
    });
    reached.wait();
    dispose_text_host(&mut racing);
    resume.wait();
    let face = thread.join().expect("create thread");
    assert!(opentype_backend::validate_face(&face).is_err());
}

#[test]
fn add_face_rechecks_liveness_after_validation() {
    let mut host = create_text_host(None);
    let loader = get_text_host_font_capabilities(&host)
        .loader
        .as_ref()
        .expect("loader")
        .clone();
    let face = (loader.create_font_face)("racing", &valid_face_source());
    assert!(opentype_backend::validate_face(&face).is_ok());
    let reached = Arc::new(Barrier::new(2));
    let resume = Arc::new(Barrier::new(2));
    let hook_reached = reached.clone();
    let hook_resume = resume.clone();
    *host.state.test_hook.write().expect("test hook") = Some(Arc::new(move |point| {
        if point == TextHostTestHook::AddAfterPrecheck {
            hook_reached.wait();
            hook_resume.wait();
        }
    }));
    let thread = std::thread::spawn(move || (loader.add_font_face)(&face));
    reached.wait();
    dispose_text_host(&mut host);
    resume.wait();
    thread.join().expect("add thread");
    assert!(host.state.faces.read().expect("faces").is_empty());
}

#[test]
fn catch_operation_converts_a_callback_panic_to_none() {
    let result = catch_operation(|| -> usize { panic!("injected callback panic") });
    assert_eq!(result, None);
}

#[test]
fn catch_result_converts_a_backend_panic_to_the_closed_reason() {
    let result: Result<(), TextFailure> = catch_result(|| {
        panic!("injected backend panic");
    });
    let error = result.expect_err("panic must fail closed");
    assert_eq!(
        error.reason,
        TextHostOperationExplanationReason::BackendPanicked
    );
}

#[test]
fn disposal_releases_registered_faces() {
    let mut host = create_text_host(None);
    host.state
        .faces
        .write()
        .expect("face registry")
        .push(Arc::new(FontFace {
            family: "injected".to_string(),
            handle: FontFaceHandle {
                handle: Arc::new(()),
                provider: Arc::new(()),
            },
        }));
    dispose_text_host(&mut host);
    assert!(host.state.faces.read().expect("face registry").is_empty());
}

fn valid_face_source() -> FontFaceSource {
    let bytes = create_synthetic_font(Some(&SyntheticFontOptions {
        advances: Some(vec![500.0, 600.0]),
        codepoints: Some(vec![(65.0, 1.0)]),
        glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(700.0)]),
        units_per_em: Some(1_000.0),
        charstrings: None,
        cid: None,
        flavor: None,
        omit_table: None,
    }));
    let length = bytes.len();
    let buffer = create_array_buffer_from_bytes(bytes);
    let value = create_array_buffer_view(&buffer, 0, length, ArrayBufferViewKind::Uint8Array)
        .expect("font view");
    return FontFaceSource::Data(FontFaceSourceData { value });
}
