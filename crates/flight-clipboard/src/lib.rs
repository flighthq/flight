mod clipboard;
mod clipboard_watch;
mod types;

pub mod contract;

// Public lane: the functions exported by pinned TS `index.ts`, plus the locally owned types and
// format constants their signatures use. `initialize_clipboard_watch` stays contract-only.
pub use contract::attach_clipboard_watch;
pub use contract::clear_clipboard;
pub use contract::create_clipboard_watch;
pub use contract::detach_clipboard_watch;
pub use contract::dispose_clipboard_watch;
pub use contract::get_clipboard_formats;
pub use contract::has_clipboard_bookmark;
pub use contract::has_clipboard_format;
pub use contract::has_clipboard_html;
pub use contract::has_clipboard_image;
pub use contract::has_clipboard_rtf;
pub use contract::has_clipboard_text;
pub use contract::read_clipboard;
pub use contract::read_clipboard_bookmark;
pub use contract::read_clipboard_format;
pub use contract::read_clipboard_html;
pub use contract::read_clipboard_image;
pub use contract::read_clipboard_rtf;
pub use contract::read_clipboard_text;
pub use contract::write_clipboard;
pub use contract::write_clipboard_bookmark;
pub use contract::write_clipboard_format;
pub use contract::write_clipboard_html;
pub use contract::write_clipboard_image;
pub use contract::write_clipboard_rtf;
pub use contract::write_clipboard_text;

pub use contract::CLIPBOARD_FORMAT_BOOKMARK;
pub use contract::CLIPBOARD_FORMAT_HTML;
pub use contract::CLIPBOARD_FORMAT_IMAGE;
pub use contract::CLIPBOARD_FORMAT_RTF;
pub use contract::CLIPBOARD_FORMAT_TEXT;
pub use contract::CLIPBOARD_FORMAT_URI_LIST;
pub use contract::ClipboardBookmark;
pub use contract::ClipboardBookmarkFuture;
pub use contract::ClipboardBookmarkResult;
pub use contract::ClipboardBoolFuture;
pub use contract::ClipboardBoolResult;
pub use contract::ClipboardItemsFuture;
pub use contract::ClipboardItemsResult;
pub use contract::ClipboardStringFuture;
pub use contract::ClipboardStringResult;
pub use contract::ClipboardStringsFuture;
pub use contract::ClipboardStringsResult;
pub use contract::ClipboardSubscribe;
pub use contract::ClipboardUnsubscribe;
pub use contract::ClipboardWatch;
pub use contract::ClipboardWriteItem;
pub use contract::HostClipboardBookmarkCapability;
pub use contract::HostClipboardCapabilities;
pub use contract::HostClipboardChangeCapability;
pub use contract::HostClipboardChangeSubscriber;
pub use contract::HostClipboardFormatsCapability;
pub use contract::HostClipboardImageCapability;
pub use contract::HostClipboardTextCapability;

#[cfg(test)]
pub(crate) mod test_support {
    use std::future::Future;
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
}
