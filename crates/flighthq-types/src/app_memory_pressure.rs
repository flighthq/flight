//! Memory-pressure severity reported to an application by the host.

/// Severity of a host memory-pressure warning. `Normal` signals that an earlier
/// pressure condition has been relieved; `Moderate` and `Critical` are
/// escalating warnings that the application should free non-essential memory.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum AppMemoryPressure {
    #[default]
    Normal,
    Moderate,
    Critical,
}
