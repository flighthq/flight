import {
  createWebClipboardBackend,
  installClipboardHostBackend,
  observeClipboardHostResult,
} from '@flighthq/clipboard/contract';
import type { ClipboardBackend } from '@flighthq/types/contract';

export function enableHostWebClipboard(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebClipboardBackend();
  const backend: ClipboardBackend = {
    async readFormat(format) {
      try {
        const result = await inner.readFormat(format);
        observeClipboardHostResult('readFormat', true);
        return result;
      } catch {
        observeClipboardHostResult('readFormat', false);
        return '';
      }
    },
    async writeFormat(format, data) {
      try {
        const result = await inner.writeFormat(format, data);
        observeClipboardHostResult('writeFormat', result);
        return result;
      } catch {
        observeClipboardHostResult('writeFormat', false);
        return false;
      }
    },
    async hasFormat(format) {
      return inner.hasFormat(format);
    },
    async getFormats() {
      return inner.getFormats();
    },
    async writeItems(items) {
      try {
        const result = await inner.writeItems(items);
        observeClipboardHostResult('writeItems', result);
        return result;
      } catch {
        observeClipboardHostResult('writeItems', false);
        return false;
      }
    },
    async readItems(formats) {
      try {
        const result = await inner.readItems(formats);
        observeClipboardHostResult('readItems', true);
        return result;
      } catch {
        observeClipboardHostResult('readItems', false);
        return {};
      }
    },
    async readText() {
      try {
        const result = await inner.readText();
        observeClipboardHostResult('readText', true);
        return result;
      } catch {
        observeClipboardHostResult('readText', false);
        return '';
      }
    },
    async writeText(text) {
      try {
        const result = await inner.writeText(text);
        observeClipboardHostResult('writeText', result);
        return result;
      } catch {
        observeClipboardHostResult('writeText', false);
        return false;
      }
    },
    async readHtml() {
      return inner.readHtml();
    },
    async writeHtml(html) {
      return inner.writeHtml(html);
    },
    async hasText() {
      return inner.hasText();
    },
    async readImage() {
      return inner.readImage();
    },
    async writeImage(dataUrl) {
      return inner.writeImage(dataUrl);
    },
    async hasImage() {
      return inner.hasImage();
    },
    async readRTF() {
      return inner.readRTF();
    },
    async writeRTF(rtf) {
      return inner.writeRTF(rtf);
    },
    async readBookmark() {
      return inner.readBookmark();
    },
    async writeBookmark(title, url) {
      return inner.writeBookmark(title, url);
    },
    async readFiles() {
      return inner.readFiles();
    },
    async writeFiles(paths) {
      return inner.writeFiles(paths);
    },
    async clear() {
      return inner.clear();
    },
    getChangeCount() {
      return inner.getChangeCount();
    },
    subscribeClipboardChange(listener) {
      return inner.subscribeClipboardChange(listener);
    },
  };
  installClipboardHostBackend(backend);
}

export function resetHostWebClipboardForTest(): void {
  _enabled = false;
}

let _enabled = false;
