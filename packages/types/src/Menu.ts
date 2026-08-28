import type { BackendOperationExplanation } from './BackendOperationExplanation';
import type { WellKnownMenuItemRoleValue } from './WellKnownMenuItemRole';

// Application and context menu seam. Free functions in @flighthq/menu delegate to the active
// MenuBackend (web default or a native host's). Web cannot install an application menu bar, but the
// web backend renders context menus in the DOM; Electron/Tauri hosts can replace it with native OS
// menus. This is the platform-suite command pattern: a plain-data MenuItemTemplate descriptor plus
// flat free functions, kept symmetric with tray/notification/shell. The same MenuItemTemplate is
// consumed by tray via setTrayIconContextMenu, so the descriptor must not grow a menu-specific OOP
// surface.
export type MenuItemType = 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';

// Open enum: the documented built-in roles (WellKnownMenuItemRole) plus any other string, so native
// hosts and vendors can introduce their own (vendor-prefix custom roles to avoid collisions). The
// `(string & {})` arm keeps editor autocomplete for the well-known values while still accepting any
// string; backends resolve an unrecognized role to a sentinel/no-op. The full role list and platform
// support matrix live in WellKnownMenuItemRole.
export type MenuItemRole = WellKnownMenuItemRoleValue | (string & {});

export interface MenuItemTemplate {
  id?: string;
  label?: string;
  type?: MenuItemType;
  role?: MenuItemRole;
  accelerator?: string;
  enabled?: boolean;
  checked?: boolean;
  // Omitting the item entirely, distinct from `enabled: false` which shows it greyed and unselectable.
  // Defaults to visible, so `visible: false` is the only value that changes anything.
  visible?: boolean;
  // Secondary text shown alongside the label (macOS-style). Advisory: a backend without a place to put
  // it ignores it rather than failing.
  sublabel?: string;
  // Hover/long-press help text. Advisory in the same way as `sublabel`.
  toolTip?: string;
  submenu?: MenuItemTemplate[];
}

// Native replacement guarantees are properties of the transition between two application menus, not
// separate operations. A backend can therefore implement `destroy` while truthfully declaring that its
// host API cannot provide one of these orderings.
export type MenuReplacementGuarantee = 'native-clear-to-sentinel' | 'native-destroy-before-install';

export type MenuReplacementGuaranteeReason = 'no-atomic-replace-rollback-or-current-menu';

export type MenuReplacementLiftPremise =
  | 'atomic-replace-retains-old-on-rejection'
  | 'current-app-menu-getter'
  | 'rollback-or-undo';

export type MenuReplacementGuaranteeDeclaration =
  | {
      readonly guarantee: MenuReplacementGuarantee;
      readonly liftableBy: readonly [];
      readonly reason: null;
      readonly support: 'supported';
    }
  | {
      readonly guarantee: MenuReplacementGuarantee;
      readonly liftableBy: readonly MenuReplacementLiftPremise[];
      readonly reason: MenuReplacementGuaranteeReason;
      readonly support: 'unsupported';
    };

export type MenuReplacementGuaranteeExplanation = BackendOperationExplanation &
  (
    | {
        readonly guarantee: MenuReplacementGuarantee;
        readonly liftableBy: readonly [];
        readonly operation: 'destroy';
        readonly reason: null;
        readonly support: 'supported' | 'unobserved';
      }
    | {
        readonly guarantee: MenuReplacementGuarantee;
        readonly liftableBy: readonly MenuReplacementLiftPremise[];
        readonly operation: 'destroy';
        readonly reason: MenuReplacementGuaranteeReason;
        readonly support: 'unsupported';
      }
  );

// The backend seam realized by the web default and by native hosts (e.g. host-electron). This is the
// honored shape — a method no real host implements would be a phantom. Application-menu installation
// returns a boolean (false when the host has no native menu bar, e.g. web); context-menu popups
// resolve to the selected item id, or null when dismissed; selections are delivered by id.
export interface MenuBackend {
  // Static facts about cross-menu replacement behavior. This is intentionally separate from operation
  // presence: `has*Operation` remains structural, while these guarantees cannot be derived from a method's
  // existence. Omission means unobserved, never implicitly supported.
  readonly replacementGuarantees?: readonly MenuReplacementGuaranteeDeclaration[];
  destroy?(): void;
  setApplicationMenu(items: readonly MenuItemTemplate[]): boolean;
  popupContextMenu(items: readonly MenuItemTemplate[], x: number, y: number): Promise<string | null>;
  subscribeSelect(listener: (id: string) => void): () => void;
}
