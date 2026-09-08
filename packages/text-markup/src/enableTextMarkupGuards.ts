import { logOnce } from '@flighthq/log/contract';
import type { TextMarkupIssue } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setTextMarkupGuard } from './textMarkupGuards';

/** Uninstalls the guard installed by enableTextMarkupGuards. */
export function disableTextMarkupGuards(): void {
  setTextMarkupGuard(null);
}

/** Installs opt-in diagnostics for tags and attributes that parsing drops or ignores. */
export function enableTextMarkupGuards(): void {
  setTextMarkupGuard(warnOnTextMarkupIssue);
}

function warnOnTextMarkupIssue(issue: Readonly<TextMarkupIssue>): void {
  switch (issue.kind) {
    case 'unknown-tag':
      logOnce(
        `text-markup:unknown-tag:${issue.tag}`,
        LogLevel.Warn,
        {
          message: `parseTextMarkup: <${issue.tag}> has no registered handler, so the tag was dropped while its text was kept. Register it with registerMarkupTag(registry, '${issue.tag}', handler), or remove it from the source markup.`,
        },
        'text-markup',
      );
      break;
    case 'unresolved-font-color':
      logOnce(
        `text-markup:unresolved-font-color:${issue.value ?? ''}`,
        LogLevel.Warn,
        {
          message: `parseTextMarkup: <font color="${issue.value ?? ''}"> did not resolve, so that color was ignored. Register named colors with registerMarkupNamedColors(registry), assign registry.colorResolver, or use #rgb, #rrggbb, or 0xRRGGBB.`,
        },
        'text-markup',
      );
      break;
    case 'unsafe-href':
      logOnce(
        `text-markup:unsafe-href:${issue.value ?? ''}`,
        LogLevel.Warn,
        {
          message: `parseTextMarkup: <a href="${issue.value ?? ''}"> uses an unsafe URL scheme, so the href was dropped. Use an http, https, mailto, tel, relative, or fragment URL instead.`,
        },
        'text-markup',
      );
      break;
  }
}
