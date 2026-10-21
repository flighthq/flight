mod statusbar;
mod types;

pub mod contract;

// Public lane: the fourteen functions the pinned TS `index.ts` names, plus the types their signatures
// require and the D9e string tables. create_status_bar_info, packed_rgba_to_hex_color and the
// initializers are exported by TS `contract.ts` only, so they stay in `contract`.
pub use contract::HostStatusBarCapabilities;
pub use contract::HostStatusBarChangeCapability;
pub use contract::HostStatusBarColorCapability;
pub use contract::HostStatusBarInfoCapability;
pub use contract::HostStatusBarOverlaysCapability;
pub use contract::HostStatusBarStyleCapability;
pub use contract::HostStatusBarVisibilityCapability;
pub use contract::StatusBar;
pub use contract::StatusBarAnimation;
pub use contract::StatusBarChangeListener;
pub use contract::StatusBarInfo;
pub use contract::StatusBarStyle;
pub use contract::StatusBarStyleEntry;
pub use contract::StatusBarStyleEntryHandle;
pub use contract::StatusBarStyleStacks;
pub use contract::StatusBarUnsubscribe;
pub use contract::attach_status_bar;
pub use contract::clear_status_bar_style_stack;
pub use contract::create_status_bar;
pub use contract::create_status_bar_style_stacks;
pub use contract::detach_status_bar;
pub use contract::dispose_status_bar;
pub use contract::get_status_bar_animation_string;
pub use contract::get_status_bar_height;
pub use contract::get_status_bar_info;
pub use contract::get_status_bar_style_string;
pub use contract::has_status_bar_style_entry;
pub use contract::parse_status_bar_animation;
pub use contract::parse_status_bar_style;
pub use contract::pop_status_bar_style_entry;
pub use contract::push_status_bar_style_entry;
pub use contract::set_status_bar_color;
pub use contract::set_status_bar_overlays_content;
pub use contract::set_status_bar_style;
pub use contract::set_status_bar_visible;
