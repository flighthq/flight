//! Ordered node selection plus marquee, lasso, and pointer selection policies.

mod lasso_selection;
mod marquee_mode_native;
mod marquee_selection;
mod node_compat;
mod path_compat;
mod pointer_selection_policy;
mod selection_compat;
mod selection_compat_types;
mod selection_state;
mod types;

pub mod contract;

pub use contract::add_lasso_selection_point;
pub use contract::add_node_to_selection;
pub use contract::apply_pointer_selection_policy;
pub use contract::apply_pointer_up_selection_policy;
pub use contract::begin_lasso_selection;
pub use contract::begin_marquee_selection;
pub use contract::clear_selection;
pub use contract::create_lasso_selection;
pub use contract::create_marquee_selection;
pub use contract::create_selection_state;
pub use contract::end_lasso_selection;
pub use contract::end_marquee_selection;
pub use contract::find_nodes_in_lasso_selection;
pub use contract::find_nodes_in_marquee_selection;
pub use contract::get_active_node;
pub use contract::get_lasso_selection_path;
pub use contract::get_marquee_rectangle;
pub use contract::get_selected_nodes;
pub use contract::get_selection_count;
pub use contract::get_selection_signals;
pub use contract::has_selection;
pub use contract::is_node_selected;
pub use contract::remove_node_from_selection;
pub use contract::select_all_nodes;
pub use contract::select_node;
pub use contract::toggle_node_selection;
pub use contract::update_marquee_selection;

pub use contract::LassoSelection;
pub use contract::MarqueeSelection;
pub use contract::MarqueeSelectionMode;
pub use contract::SelectionModifierState;
pub use contract::SelectionSignals;
pub use contract::SelectionState;
