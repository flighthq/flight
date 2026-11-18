use std::ffi::{CStr, CString, c_void};
use std::sync::Arc;

use flight_sdk::node::contract::AdjustmentRef;
use flight_sdk::{LogValue, NodeRef, Ref};

#[test]
fn borrowed_opaque_slice_is_ptr_len_anchored_to_the_source_registry() {
    let registry = flight_sdk::create_spritesheet_format_registry();
    let expected = flight_sdk::spritesheet_all_formats(&registry);
    let mut len = usize::MAX;
    let ptr = unsafe { crate::flight_spritesheet_all_formats(&registry, &mut len) };

    assert_eq!(len, expected.len());
    assert_eq!(ptr, expected.as_ptr());
    assert!(!ptr.is_null());
    let first_kind = unsafe { &*ptr }.kind.clone();
    assert_eq!(first_kind, expected[0].kind);

    drop(registry);
    assert!(
        !first_kind.is_empty(),
        "only copied data may outlive the borrowed slice anchor"
    );
}

#[test]
fn hash_map_return_executes_len_get_key_get_and_free_contract() {
    let message = CString::new("task-k-error").unwrap();
    let key = CString::new("value").unwrap();
    let result = unsafe { crate::flight_serialize_log_error(message.as_ptr()) };
    assert!(!result.is_null());
    assert_eq!(
        unsafe { crate::flight_serialize_log_error_result_len(result) },
        1
    );

    let returned_key = unsafe { crate::flight_serialize_log_error_result_get_key(result, 0) };
    assert!(!returned_key.is_null());
    assert_eq!(unsafe { CStr::from_ptr(returned_key) }.to_bytes(), b"value");
    unsafe { crate::flight_free_string(returned_key) };

    let value = unsafe { crate::flight_serialize_log_error_result_get(result, key.as_ptr()) };
    assert!(!value.is_null());
    assert!(matches!(
        unsafe { &*value },
        LogValue::Str(value) if value == "task-k-error"
    ));
    unsafe {
        crate::flight_serialize_log_error_result_free(
            result.cast::<std::collections::HashMap<String, LogValue>>(),
        );
    }

    assert_eq!(
        unsafe { crate::flight_serialize_log_error_result_len(std::ptr::null()) },
        0
    );
    assert!(unsafe {
        crate::flight_serialize_log_error_result_get(std::ptr::null(), key.as_ptr()).is_null()
    });
    assert!(unsafe {
        crate::flight_serialize_log_error_result_get_key(std::ptr::null(), 0).is_null()
    });
    unsafe { crate::flight_serialize_log_error_result_free(std::ptr::null_mut()) };
}

#[test]
fn nullable_borrowed_opaque_parameter_executes_the_null_path() {
    let html = CString::new("plain text").unwrap();
    let explanation = unsafe { crate::flight_explain_text_markup(html.as_ptr(), std::ptr::null()) };
    assert!(!explanation.is_null());
    unsafe { crate::flight_free_text_markup_explanation(explanation) };
}

#[test]
fn producer_owned_handle_has_one_drop_and_its_clone_consumer_retains_the_caller_handle() {
    let source: NodeRef = flight_sdk::create_shape();
    let target: NodeRef = flight_sdk::create_shape();
    let adjustments: Ref<Vec<AdjustmentRef>> = Arc::new(std::sync::RwLock::new(Vec::new()));
    flight_sdk::set_node_color_adjustments(&source, Some(adjustments.clone()));

    let source_ptr = std::ptr::from_ref(&source).cast::<c_void>();
    let target_ptr = std::ptr::from_ref(&target).cast::<c_void>();
    let baseline = Arc::strong_count(&adjustments);

    let produced = unsafe { crate::flight_get_node_color_adjustments(source_ptr) };
    assert!(!produced.is_null());
    assert_eq!(
        Arc::strong_count(&adjustments),
        baseline + 1,
        "the producer must transfer exactly one owned Ref handle to the caller"
    );
    unsafe {
        crate::flight_free_adjustment_ref_vec_ref(produced.cast::<Ref<Vec<AdjustmentRef>>>());
    }
    assert_eq!(
        Arc::strong_count(&adjustments),
        baseline,
        "the paired free must drop exactly the caller-owned handle"
    );

    let produced = unsafe { crate::flight_get_node_color_adjustments(source_ptr) };
    assert_eq!(Arc::strong_count(&adjustments), baseline + 1);
    unsafe {
        crate::flight_set_node_color_adjustments(target_ptr, produced.cast_const());
    }
    let after_call = Arc::strong_count(&adjustments);
    assert_eq!(
        after_call,
        baseline + 2,
        "the clone consumer must retain the target value without consuming the caller handle"
    );
    unsafe {
        crate::flight_free_adjustment_ref_vec_ref(produced.cast::<Ref<Vec<AdjustmentRef>>>());
    }
    assert_eq!(
        Arc::strong_count(&adjustments),
        baseline + 1,
        "the target must retain its clone after the caller frees its handle"
    );
    assert!(flight_sdk::get_node_color_adjustments(&*target.read().unwrap()).is_some());
}
