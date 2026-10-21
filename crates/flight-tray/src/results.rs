use flight_entity::Unknown;
use flight_geometry::Rectangle;

use crate::types::{TrayDestroyFailure, TrayEventRelease};

/// TS `TrayDestroyCapabilityResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayDestroyCapabilityResult {
    Destroyed,
    TrayDestroyFailed { failures: Vec<TrayDestroyFailure> },
}

/// TS `TrayDestroyResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayDestroyResult {
    Destroyed,
    TrayDestroyFailed { failures: Vec<TrayDestroyFailure> },
    AlreadyDestroyed,
}

/// TS `TrayImageUpdateResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayImageUpdateResult {
    Updated,
    TrayDestroyed,
    InvalidIcon { error: Option<Unknown> },
    ImageUpdateFailed { error: Option<Unknown> },
}

/// TS `TrayTitleUpdateResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayTitleUpdateResult {
    Updated,
    TrayDestroyed,
    TitleUpdateFailed { error: Option<Unknown> },
}

/// TS `TrayTooltipUpdateResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayTooltipUpdateResult {
    Updated,
    TrayDestroyed,
    TooltipUpdateFailed { error: Option<Unknown> },
}

/// TS `TrayTemplateImageUpdateResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayTemplateImageUpdateResult {
    Updated,
    TrayDestroyed,
    TemplateImageUpdateFailed { error: Option<Unknown> },
}

/// TS `TrayPressedImageUpdateResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayPressedImageUpdateResult {
    Updated,
    TrayDestroyed,
    InvalidIcon { error: Option<Unknown> },
    PressedImageUpdateFailed { error: Option<Unknown> },
}

/// TS `TrayDoubleClickPolicyUpdateResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayDoubleClickPolicyUpdateResult {
    Updated,
    TrayDestroyed,
    DoubleClickPolicyUpdateFailed { error: Option<Unknown> },
}

/// TS `TrayMenuUpdateResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayMenuUpdateResult {
    Updated,
    TrayDestroyed,
    MenuBuildFailed { error: Option<Unknown> },
    MenuInstallFailed { error: Option<Unknown> },
}

/// TS `TrayTitleReadResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayTitleReadResult {
    Available { title: String },
    TrayDestroyed,
    TitleReadFailed { error: Option<Unknown> },
}

/// TS `TrayTooltipReadResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayTooltipReadResult {
    Available { tooltip: String },
    TrayDestroyed,
    TooltipReadFailed { error: Option<Unknown> },
}

/// TS `TrayBoundsResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayBoundsResult {
    Available { bounds: Rectangle },
    TrayDestroyed,
    BoundsReadFailed { error: Option<Unknown> },
}

/// TS `TrayPopupMenuResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayPopupMenuResult {
    Shown,
    TrayDestroyed,
    MenuNotSet,
    PopupFailed { error: Option<Unknown> },
}

/// TS `TrayBalloonDisplayResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayBalloonDisplayResult {
    Displayed,
    TrayDestroyed,
    BalloonDisplayFailed { error: Option<Unknown> },
}

/// TS `TrayBalloonRemoveResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayBalloonRemoveResult {
    Removed,
    TrayDestroyed,
    BalloonNotActive,
    BalloonRemoveFailed { error: Option<Unknown> },
}

/// TS `TrayReleaseResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayReleaseResult {
    Released,
    AlreadyReleased,
    ReleaseFailed { error: Option<Unknown> },
}

/// TS `TrayEventAttachResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayEventAttachResult {
    Attached { release: TrayEventRelease },
    TrayDestroyed,
    SubscriptionFailed { error: Option<Unknown> },
}

/// TS `TrayAnimationStartResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayAnimationStartResult {
    Started { release: TrayEventRelease },
    Empty,
    TrayDestroyed,
    InvalidIcon { error: Option<Unknown> },
    ImageUpdateFailed { error: Option<Unknown> },
}

/// TS `TrayAnimationStopResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayAnimationStopResult {
    Stopped,
    AlreadyStopped,
}

/// TS `TrayCreateCapabilityResult`: the exact outcome union. `error` is the optional `unknown` the source carries (outer
/// None = absent; `Some(None)` = null).
#[derive(Clone, Debug)]
pub enum TrayCreateCapabilityResult {
    Created,
    Cancelled,
    RuntimeApiUnavailable { error: Option<Unknown> },
    InvalidIcon { error: Option<Unknown> },
    TrayCreateFailed { error: Option<Unknown> },
}

/// Host construction target (TS `DesktopOsProfile`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DesktopOsProfile {
    Linux,
    MacOs,
    Windows,
}

/// The balloon icon kind (TS inline `TrayBalloonOptions['iconType']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayBalloonIconType {
    None,
    Info,
    Warning,
    Error,
}

/// The interaction kind (TS inline `TrayInteractionEvent['type']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayInteractionType {
    Click,
    DoubleClick,
    RightClick,
}

/// The balloon event kind (TS inline `TrayBalloonEvent['type']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayBalloonEventType {
    Click,
    Close,
    Show,
}

/// The non-created outcomes of a create (TS `Exclude<TrayCreateCapabilityResult, created>['outcome']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayCreateFailureOutcome {
    Cancelled,
    RuntimeApiUnavailable,
    InvalidIcon,
    TrayCreateFailed,
}
