//! Opt-in change signal for a command history (TS `commandHistorySignals.ts`). A history that never
//! enables it pays no signal allocation or dispatch cost.

use flight_entity::Ref;
use flight_signals::{Signal, create_signal};

use crate::types::CommandHistory;

/// Allocates the change signal on first call and returns it; a second call returns the same signal
/// (TS `enableCommandHistorySignals`).
pub fn enable_command_history_signals(history: &Ref<CommandHistory>) -> Signal<()> {
    let mut guard = history.write().unwrap();
    if guard.on_change.is_none() {
        guard.on_change = Some(create_signal());
    }
    return guard.on_change.clone().unwrap();
}

/// The change signal if one was enabled, else `None`; never allocates (TS `getCommandHistorySignals`).
pub fn get_command_history_signals(history: &Ref<CommandHistory>) -> Option<Signal<()>> {
    return history.read().unwrap().on_change.clone();
}
