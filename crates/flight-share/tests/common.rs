use crate::share_api::*;
use flight_entity::{FlightError, FlightErrorKind, Ref};
use std::future::Future;
use std::sync::{Arc, RwLock};
use std::task::{Context, Poll, Waker};

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

pub(crate) fn content_host() -> HostShareContentCapability {
    return HostShareContentCapability {
        can_share_content: Arc::new(|_| true),
        share_content: Arc::new(|_| Box::pin(async { Ok(true) })),
        share_content_with_result: Arc::new(|_| Box::pin(async { Ok(share_result()) })),
    };
}

pub(crate) fn files_host() -> HostShareFilesCapability {
    return HostShareFilesCapability {
        can_share_content: Arc::new(|_| true),
        share_content: Arc::new(|_| Box::pin(async { Ok(true) })),
        share_content_with_result: Arc::new(|_| Box::pin(async { Ok(share_result()) })),
    };
}

pub(crate) fn provider_error() -> FlightError {
    return FlightError {
        kind: FlightErrorKind::TypeError,
        message: "provider declined the invocation".to_string(),
    };
}

pub(crate) fn share_file() -> Ref<ShareFile> {
    return Arc::new(RwLock::new(ShareFile {
        name: "a.txt".to_string(),
        mime_type: "text/plain".to_string(),
        data_url: "data:text/plain;base64,QQ==".to_string(),
    }));
}

pub(crate) fn share_result() -> Ref<ShareResult> {
    return Arc::new(RwLock::new(ShareResult {
        completed: true,
        activity_type: Some("mail".to_string()),
        dismissed: false,
    }));
}

// flight-lint: allow(test-default-call) D5 caller-owned plain ShareState has no source create factory; do not invent an Entity allocation for test scaffolding
pub(crate) fn share_state() -> ShareState {
    return ShareState::default();
}

pub(crate) fn text_content(text: &str) -> Ref<ShareContent> {
    return Arc::new(RwLock::new(ShareContent::Text(ShareTextContent {
        text: text.to_string(),
        title: None,
        url: None,
    })));
}

pub(crate) fn title_content(title: &str) -> Ref<ShareContent> {
    return Arc::new(RwLock::new(ShareContent::Title(ShareTitleContent {
        text: None,
        title: title.to_string(),
        url: None,
    })));
}
