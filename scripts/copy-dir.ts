import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Recursively copy the contents of a directory tree, preserving file permissions.
//
// Node's cpSync({ recursive: true }) drops permission bits on this project's FUSE-backed worktree
// mount: copied files come out write-only (mode 200), unreadable by the next pipeline stage (the
// site-assembly copy, a static server, the browser). copyFileSync preserves the source mode
// correctly on the same filesystem, so the tree is walked by hand instead. Existing files at the
// destination are overwritten; destination directories are created as needed. This is the merge
// primitive behind every pooled-asset directory in the build (examples, functional, build:site).
export function copyDirectoryContents(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) copyDirectoryContents(from, to);
    else copyFileSync(from, to);
  }
}
