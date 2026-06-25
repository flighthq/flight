//! Whether an application launch is a fresh process or a warm resume.

/// The kind of application launch — a fresh process (`Cold`) or a resume from
/// background (`Warm`). The web backend approximates this via
/// `PerformanceNavigationTiming.type` (`back_forward` → `Warm`, all others →
/// `Cold`).
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum AppLaunchKind {
    #[default]
    Cold,
    Warm,
}
