/**
 * Handoff for the source File between the composer (Home) and the Generating screen.
 * sessionStorage can't hold a File, so we keep it in module memory until /generating reads it.
 */

let pendingFile = null;
let pendingMeta = null;

export function setPendingSource(file, meta = null) {
  pendingFile = file instanceof File ? file : null;
  pendingMeta = pendingFile ? { name: pendingFile.name, type: pendingFile.type, size: pendingFile.size, ...(meta || {}) } : null;
}

export function takePendingSource() {
  const out = { file: pendingFile, meta: pendingMeta };
  pendingFile = null;
  pendingMeta = null;
  return out;
}

export function peekPendingSource() {
  return { file: pendingFile, meta: pendingMeta };
}
