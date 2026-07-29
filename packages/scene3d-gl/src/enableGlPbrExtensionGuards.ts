import { logOnce } from '@flighthq/log/contract';
import type { GlPbrExtensionIssue, GlRenderState, PbrExtension } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { explainGlPbrExtensions } from './glPbrExtensionRegistry';
import { getGlScene3DRuntime } from './glScene3DRuntime';

export function areGlPbrExtensionGuardsEnabled(state: GlRenderState): boolean {
  return getGlScene3DRuntime(state).pbrExtensionGuard !== null;
}

export function enableGlPbrExtensionGuards(state: GlRenderState): void {
  getGlScene3DRuntime(state).pbrExtensionGuard = (extensions): void => {
    warnGlPbrExtensionIssues(state, extensions);
  };
}

function getGlPbrExtensionIssueMessage(issue: Readonly<GlPbrExtensionIssue>): string {
  switch (issue.code) {
    case 'duplicate-kind':
      return `extendedPbrGlMeshMaterialRenderer: extension kind '${issue.kind}' appears more than once — call createExtendedPbrMaterial with each extension kind at most once`;
    case 'framebuffer-feedback':
      return 'extendedPbrGlMeshMaterialRenderer: transmission scene color aliases the active draw attachment — call setGlPbrTransmissionSceneColor(state, a distinct resolved scene-color target)';
    case 'missing-registration':
      return `extendedPbrGlMeshMaterialRenderer: extension kind '${issue.kind}' has no GL registration — call registerGlPbrExtension(state, kind, registration)`;
    case 'texture-unit-exhaustion':
      return 'extendedPbrGlMeshMaterialRenderer: extension maps exceed the available fragment texture units — call createExtendedPbrMaterial with fewer mapped extensions';
    case 'unsupported-extension':
      return `extendedPbrGlMeshMaterialRenderer: extension kind '${issue.kind}' is unsupported by its GL registration — call registerGlPbrExtension(state, kind, a supported registration)`;
  }
}

function warnGlPbrExtensionIssues(state: GlRenderState, extensions: readonly PbrExtension[]): void {
  const issues = explainGlPbrExtensions(state, extensions);
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    logOnce(
      `scene-gl:pbr-extension:${issue.code}:${issue.kind}`,
      LogLevel.Warn,
      { code: issue.code, kind: issue.kind, message: getGlPbrExtensionIssueMessage(issue) },
      'scene-gl',
    );
  }
}
