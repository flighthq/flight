mod host_explain;
mod menu;
mod menu_templates;
mod menu_watch;
mod types;

pub mod contract;

// Public lane: the functions exported by pinned TS `index.ts`, plus the locally owned types their
// signatures use. `initialize_menu_highlight` / `initialize_menu_select` stay contract-only.
pub use contract::attach_menu_highlight;
pub use contract::attach_menu_select;
pub use contract::clone_menu_template;
pub use contract::create_default_app_menu_template;
pub use contract::create_default_edit_menu_template;
pub use contract::create_default_file_menu_template;
pub use contract::create_default_help_menu_template;
pub use contract::create_default_view_menu_template;
pub use contract::create_default_window_menu_template;
pub use contract::create_menu_highlight;
pub use contract::create_menu_item_template;
pub use contract::create_menu_select;
pub use contract::destroy_app_menu;
pub use contract::detach_menu_highlight;
pub use contract::detach_menu_select;
pub use contract::dispose_menu_highlight;
pub use contract::dispose_menu_select;
pub use contract::enable_menu_signals;
pub use contract::get_menu_signals;
pub use contract::set_app_menu;
pub use contract::show_context_menu;
pub use contract::validate_menu_item_template;

pub use contract::AppMenuDestroyedProviders;
pub use contract::HostAppMenuCapability;
pub use contract::HostAppMenuCapabilityMethods;
pub use contract::HostMenuCapabilities;
pub use contract::HostMenuHighlightCapability;
pub use contract::HostMenuPopupCapability;
pub use contract::HostMenuSelectCapability;
pub use contract::MenuHighlight;
pub use contract::MenuItemRole;
pub use contract::MenuItemTemplate;
pub use contract::MenuItemType;
pub use contract::MenuPopupFuture;
pub use contract::MenuPopupResult;
pub use contract::MenuSelect;
pub use contract::MenuSignals;
pub use contract::MenuSignalsState;
pub use contract::MenuSubscribe;
pub use contract::MenuUnsubscribe;
pub use contract::WellKnownMenuItemRoleValue;

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
