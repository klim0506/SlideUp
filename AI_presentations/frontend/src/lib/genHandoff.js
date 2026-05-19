/**
 * Handoff for source Files between composers and presentation-scoped generation.
 * sessionStorage can't hold a File, so files live in module memory keyed by deck id.
 */

export const GEN_CONFIG_PREFIX = "genConfig:";
export const LEGACY_GEN_CONFIG_KEY = "genConfig";

const pendingSources = new Map();
let legacyPendingSource = null;

export function genConfigKey(presentationId) {
  return `${GEN_CONFIG_PREFIX}${presentationId}`;
}

function buildSource(file, meta = null) {
  const sourceFile = file instanceof File ? file : null;
  return {
    file: sourceFile,
    meta: sourceFile ? { name: sourceFile.name, type: sourceFile.type, size: sourceFile.size, ...(meta || {}) } : null,
  };
}

export function setPendingSource(presentationId, file, meta = null) {
  const key = presentationId ? String(presentationId) : "";
  const source = buildSource(file, meta);
  if (!key) {
    legacyPendingSource = source;
    return;
  }
  if (source.file) pendingSources.set(key, source);
  else pendingSources.delete(key);
}

export function takePendingSource(presentationId = null) {
  const key = presentationId ? String(presentationId) : "";
  if (!key) {
    const out = legacyPendingSource || { file: null, meta: null };
    legacyPendingSource = null;
    return out;
  }
  const out = pendingSources.get(key) || { file: null, meta: null };
  pendingSources.delete(key);
  return out;
}

export function peekPendingSource(presentationId = null) {
  const key = presentationId ? String(presentationId) : "";
  if (!key) return legacyPendingSource || { file: null, meta: null };
  return pendingSources.get(key) || { file: null, meta: null };
}
