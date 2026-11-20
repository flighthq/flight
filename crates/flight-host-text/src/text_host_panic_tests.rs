use std::sync::Arc;

use flight_font::FontFace;
use flight_host::FontFaceHandle;

use crate::text_host::{
    TextFailure, catch_operation, catch_result, create_text_host, dispose_text_host,
};
use crate::types::TextHostOperationExplanationReason;

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
