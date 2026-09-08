import type {
  BitmapFontParseExplanation,
  BitmapFontParseExplanationFormat,
  BitmapFontParseExplanationReason,
  BitmapFontParseOptions,
} from '@flighthq/types/contract';

export function explainBitmapFontParse(
  text: string,
  options?: Readonly<BitmapFontParseOptions>,
): BitmapFontParseExplanation {
  const json = probeJson(text);
  if (json !== null) return buildExplanation('json', json, options);
  const xml = probeXml(text);
  if (xml !== null) return buildExplanation('xml', xml, options);
  const fnt = probeFnt(text);
  if (fnt !== null) return buildExplanation('fnt', fnt, options);
  return {
    charCount: 0,
    detectedFormat: 'unknown',
    kerningCount: 0,
    pageCount: 0,
    reason: 'invalid-data',
    success: false,
    unresolvedPages: [],
  };
}

interface ProbeResult {
  charCount: number;
  hasCommon: boolean;
  kerningCount: number;
  pageIds: number[];
  referencedPages: Set<number>;
}

function buildExplanation(
  detectedFormat: BitmapFontParseExplanationFormat,
  probe: Readonly<ProbeResult>,
  options: Readonly<BitmapFontParseOptions> | undefined,
): BitmapFontParseExplanation {
  let reason: BitmapFontParseExplanationReason;
  const unresolvedPages: number[] = [];
  if (!probe.hasCommon) {
    reason = 'missing-common';
  } else if (probe.charCount === 0) {
    reason = 'missing-chars';
  } else {
    const resolvePage = options?.resolvePage;
    for (const pageId of probe.referencedPages) {
      if (resolvePage === undefined || resolvePage(pageId, '') === null) {
        unresolvedPages.push(pageId);
      }
    }
    reason = unresolvedPages.length > 0 ? 'unresolved-page' : 'ok';
  }
  return {
    charCount: probe.charCount,
    detectedFormat,
    kerningCount: probe.kerningCount,
    pageCount: probe.pageIds.length,
    reason,
    success: reason === 'ok',
    unresolvedPages,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function probeJson(text: string): ProbeResult | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(root)) return null;

  const common = root.common;
  const hasCommon =
    isObject(common) &&
    typeof common.lineHeight === 'number' &&
    Number.isFinite(common.lineHeight) &&
    typeof common.base === 'number' &&
    Number.isFinite(common.base);

  const rawChars = root.chars;
  const charIterable = Array.isArray(rawChars) ? rawChars : isObject(rawChars) ? Object.values(rawChars) : [];
  let charCount = 0;
  const referencedPages = new Set<number>();
  for (const raw of charIterable) {
    if (isObject(raw) && typeof raw.id === 'number' && Number.isFinite(raw.id)) {
      charCount++;
      const page = typeof raw.page === 'number' && Number.isFinite(raw.page) ? raw.page : 0;
      referencedPages.add(page);
    }
  }

  const pageIds: number[] = [];
  if (Array.isArray(root.pages)) {
    for (let id = 0; id < root.pages.length; id++) pageIds.push(id);
  }

  let kerningCount = 0;
  if (Array.isArray(root.kernings)) {
    for (const raw of root.kernings) {
      if (
        isObject(raw) &&
        typeof raw.first === 'number' &&
        typeof raw.second === 'number' &&
        typeof raw.amount === 'number'
      ) {
        kerningCount++;
      }
    }
  }

  return { charCount, hasCommon, kerningCount, pageIds, referencedPages };
}

function probeFnt(text: string): ProbeResult | null {
  let hasCommon = false;
  let charCount = 0;
  let kerningCount = 0;
  const pageIds: number[] = [];
  const referencedPages = new Set<number>();
  let hasAnyTag = false;

  for (const rawLine of text.split(/\r\n?|\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    const spaceAt = line.search(/\s/);
    const tag = spaceAt < 0 ? line : line.slice(0, spaceAt);

    if (tag === 'common') {
      hasAnyTag = true;
      const fields = parseFntFields(line.slice(tag.length));
      hasCommon = fields.lineHeight !== undefined && fields.base !== undefined;
    } else if (tag === 'page') {
      hasAnyTag = true;
      const fields = parseFntFields(line.slice(tag.length));
      const id = readFntNumber(fields.id);
      if (id !== null) pageIds.push(id);
    } else if (tag === 'char') {
      hasAnyTag = true;
      const fields = parseFntFields(line.slice(tag.length));
      if (fields.id !== undefined) {
        charCount++;
        const page = readFntNumber(fields.page) ?? 0;
        referencedPages.add(page);
      }
    } else if (tag === 'kerning') {
      hasAnyTag = true;
      kerningCount++;
    } else if (tag === 'info' || tag === 'chars' || tag === 'kernings') {
      hasAnyTag = true;
    }
  }

  if (!hasAnyTag) return null;
  return { charCount, hasCommon, kerningCount, pageIds, referencedPages };
}

function probeXml(text: string): ProbeResult | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('<')) return null;
  if (trimmed.indexOf('<font') < 0 && trimmed.indexOf('<Font') < 0) return null;

  let hasCommon = false;
  let charCount = 0;
  let kerningCount = 0;
  const pageIds: number[] = [];
  const referencedPages = new Set<number>();

  const commonMatch = /<common\s[^>]*?lineHeight\s*=\s*"(\d+)"[^>]*?base\s*=\s*"(\d+)"/i.exec(text);
  if (commonMatch === null) {
    const altMatch = /<common\s[^>]*?base\s*=\s*"(\d+)"[^>]*?lineHeight\s*=\s*"(\d+)"/i.exec(text);
    hasCommon = altMatch !== null;
  } else {
    hasCommon = true;
  }

  const pageRe = /<page\s[^>]*?id\s*=\s*"(\d+)"/gi;
  let pageMatch: RegExpExecArray | null;
  while ((pageMatch = pageRe.exec(text)) !== null) {
    pageIds.push(Number(pageMatch[1]));
  }

  const charRe = /<char\s[^>]*?id\s*=\s*"(\d+)"[^>]*/gi;
  let charMatch: RegExpExecArray | null;
  while ((charMatch = charRe.exec(text)) !== null) {
    charCount++;
    const pageAttr = /\bpage\s*=\s*"(\d+)"/.exec(charMatch[0]);
    referencedPages.add(pageAttr !== null ? Number(pageAttr[1]) : 0);
  }

  const kerningRe = /<kerning\s/gi;
  while (kerningRe.exec(text) !== null) kerningCount++;

  return { charCount, hasCommon, kerningCount, pageIds, referencedPages };
}

function parseFntFields(rest: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const re = /([A-Za-z_]\w*)\s*=\s*(?:"([^"]*)"|(\S+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rest)) !== null) {
    fields[match[1]] = match[2] !== undefined ? match[2] : (match[3] ?? '');
  }
  return fields;
}

function readFntNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
