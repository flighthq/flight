use crate::text_host::{TextFailure, catch_result};
use crate::types::TextHostOperationExplanationReason;

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
