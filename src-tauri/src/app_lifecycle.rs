use serde::{Deserialize, Serialize};

pub const TRAY_MENU_OPEN: &str = "tray_open";
pub const TRAY_MENU_STOP_ALL: &str = "tray_stop_all";
pub const TRAY_MENU_EXIT: &str = "tray_exit";

pub fn begin_exit_shutdown(started: &std::sync::atomic::AtomicBool) -> bool {
    !started.swap(true, std::sync::atomic::Ordering::AcqRel)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CloseBehavior {
    HideToTray,
    ExitApp,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LaunchBehavior {
    ShowWindow,
    StartMinimized,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub close_behavior: CloseBehavior,
    pub launch_behavior: LaunchBehavior,
    pub confirm_exit_when_running: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            close_behavior: CloseBehavior::HideToTray,
            launch_behavior: LaunchBehavior::ShowWindow,
            confirm_exit_when_running: true,
        }
    }
}

pub fn should_hide_on_close(settings: &AppSettings, tray_available: bool) -> bool {
    settings.close_behavior == CloseBehavior::HideToTray && tray_available
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseRequestedAction {
    HideToTray,
    RequestAppExitConfirmation,
    ExitAfterStoppingProfiles,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayMenuAction {
    OpenMainWindow,
    StopAllProfiles,
    ExitAfterStoppingProfiles,
}

pub fn tray_menu_action(menu_id: &str) -> Option<TrayMenuAction> {
    match menu_id {
        TRAY_MENU_OPEN => Some(TrayMenuAction::OpenMainWindow),
        TRAY_MENU_STOP_ALL => Some(TrayMenuAction::StopAllProfiles),
        TRAY_MENU_EXIT => Some(TrayMenuAction::ExitAfterStoppingProfiles),
        _ => None,
    }
}

pub fn close_requested_action(
    settings: &AppSettings,
    tray_available: bool,
    has_running_profile: bool,
) -> CloseRequestedAction {
    if should_hide_on_close(settings, tray_available) {
        CloseRequestedAction::HideToTray
    } else if has_running_profile && settings.confirm_exit_when_running {
        CloseRequestedAction::RequestAppExitConfirmation
    } else {
        CloseRequestedAction::ExitAfterStoppingProfiles
    }
}

#[cfg(test)]
mod tests {
    use super::{
        begin_exit_shutdown, close_requested_action, should_hide_on_close, AppSettings, CloseBehavior, CloseRequestedAction,
        tray_menu_action, LaunchBehavior, TrayMenuAction, TRAY_MENU_EXIT,
        TRAY_MENU_OPEN, TRAY_MENU_STOP_ALL,
    };

    #[test]
    fn default_settings_keep_the_window_available_in_the_tray() {
        let settings = AppSettings::default();
        assert!(should_hide_on_close(&settings, true));
        assert!(!should_hide_on_close(&settings, false));
        assert_eq!(
            close_requested_action(&settings, true, true),
            CloseRequestedAction::HideToTray,
        );
        assert_eq!(settings.launch_behavior, LaunchBehavior::ShowWindow);
        assert!(settings.confirm_exit_when_running);
    }

    #[test]
    fn exit_behavior_without_running_profiles_stops_profiles_and_exits_natively() {
        let settings = AppSettings {
            close_behavior: CloseBehavior::ExitApp,
            launch_behavior: LaunchBehavior::StartMinimized,
            confirm_exit_when_running: true,
        };
        assert_eq!(
            close_requested_action(&settings, true, false),
            CloseRequestedAction::ExitAfterStoppingProfiles,
        );
    }

    #[test]
    fn exit_behavior_with_running_profiles_requests_confirmation_when_enabled() {
        let settings = AppSettings {
            close_behavior: CloseBehavior::ExitApp,
            launch_behavior: LaunchBehavior::ShowWindow,
            confirm_exit_when_running: true,
        };
        assert_eq!(
            close_requested_action(&settings, true, true),
            CloseRequestedAction::RequestAppExitConfirmation,
        );
    }

    #[test]
    fn tray_menu_identifiers_are_distinct_and_stable() {
        assert_ne!(TRAY_MENU_OPEN, TRAY_MENU_STOP_ALL);
        assert_ne!(TRAY_MENU_STOP_ALL, TRAY_MENU_EXIT);
    }

    #[test]
    fn tray_exit_always_stops_profiles_and_exits_without_webview_round_trip() {
        assert_eq!(
            tray_menu_action(TRAY_MENU_EXIT),
            Some(TrayMenuAction::ExitAfterStoppingProfiles),
        );
    }

    #[test]
    fn controlled_exit_shutdown_is_started_only_once() {
        let started = std::sync::atomic::AtomicBool::new(false);

        assert!(begin_exit_shutdown(&started));
        assert!(!begin_exit_shutdown(&started));
    }
}
