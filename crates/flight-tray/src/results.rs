use crate::types::*;

/// TS `TrayDestroyCapabilityResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayDestroyCapabilityResult {
    Destroyed,
    TrayDestroyFailed(TrayDestroyFailures),
}

/// TS `TrayDestroyResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayDestroyResult {
    Destroyed,
    TrayDestroyFailed(TrayDestroyFailures),
    AlreadyDestroyed,
}

/// TS `TrayImageUpdateResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayImageUpdateResult {
    Updated,
    TrayDestroyed,
    InvalidIcon(TrayFailure),
    ImageUpdateFailed(TrayFailure),
}

/// TS `TrayTitleUpdateResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayTitleUpdateResult {
    Updated,
    TrayDestroyed,
    TitleUpdateFailed(TrayFailure),
}

/// TS `TrayTooltipUpdateResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayTooltipUpdateResult {
    Updated,
    TrayDestroyed,
    TooltipUpdateFailed(TrayFailure),
}

/// TS `TrayTemplateImageUpdateResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayTemplateImageUpdateResult {
    Updated,
    TrayDestroyed,
    TemplateImageUpdateFailed(TrayFailure),
}

/// TS `TrayPressedImageUpdateResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayPressedImageUpdateResult {
    Updated,
    TrayDestroyed,
    InvalidIcon(TrayFailure),
    PressedImageUpdateFailed(TrayFailure),
}

/// TS `TrayDoubleClickPolicyUpdateResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayDoubleClickPolicyUpdateResult {
    Updated,
    TrayDestroyed,
    DoubleClickPolicyUpdateFailed(TrayFailure),
}

/// TS `TrayMenuUpdateResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayMenuUpdateResult {
    Updated,
    TrayDestroyed,
    MenuBuildFailed(TrayFailure),
    MenuInstallFailed(TrayFailure),
}

/// TS `TrayTitleReadResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayTitleReadResult {
    Available(TrayTitleReading),
    TrayDestroyed,
    TitleReadFailed(TrayFailure),
}

/// TS `TrayTooltipReadResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayTooltipReadResult {
    Available(TrayTooltipReading),
    TrayDestroyed,
    TooltipReadFailed(TrayFailure),
}

/// TS `TrayBoundsResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayBoundsResult {
    Available(TrayBoundsReading),
    TrayDestroyed,
    BoundsReadFailed(TrayFailure),
}

/// TS `TrayPopupMenuResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayPopupMenuResult {
    Shown,
    TrayDestroyed,
    MenuNotSet,
    PopupFailed(TrayFailure),
}

/// TS `TrayBalloonDisplayResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayBalloonDisplayResult {
    Displayed,
    TrayDestroyed,
    BalloonDisplayFailed(TrayFailure),
}

/// TS `TrayBalloonRemoveResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayBalloonRemoveResult {
    Removed,
    TrayDestroyed,
    BalloonNotActive,
    BalloonRemoveFailed(TrayFailure),
}

/// TS `TrayReleaseResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayReleaseResult {
    Released,
    AlreadyReleased,
    ReleaseFailed(TrayFailure),
}

/// TS `TrayEventAttachResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayEventAttachResult {
    Attached(TrayEventRelease),
    TrayDestroyed,
    SubscriptionFailed(TrayFailure),
}

/// TS `TrayAnimationStartResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayAnimationStartResult {
    Started(TrayEventRelease),
    Empty,
    TrayDestroyed,
    InvalidIcon(TrayFailure),
    ImageUpdateFailed(TrayFailure),
}

/// TS `TrayAnimationStopResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayAnimationStopResult {
    Stopped,
    AlreadyStopped,
}

/// TS `TrayCreateCapabilityResult`: the exact outcome union; failure arms carry a `TrayFailure`.
#[derive(Clone, Debug)]
pub enum TrayCreateCapabilityResult {
    Created,
    Cancelled,
    RuntimeApiUnavailable(TrayFailure),
    InvalidIcon(TrayFailure),
    TrayCreateFailed(TrayFailure),
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
