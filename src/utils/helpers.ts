import * as vscode from 'vscode';
import * as path from 'path';
import { CssDietConfig, DynamicPattern } from '../types';

/**
 * Read current extension configuration from VS Code settings.
 */
export function getConfig(): CssDietConfig {
  const cfg = vscode.workspace.getConfiguration('cssDiet');
  return {
    enableDynamicDetection: cfg.get<boolean>('enableDynamicDetection', true),
    ignoredPatterns: cfg.get<string[]>('ignoredPatterns', ['node_modules', 'dist', 'build', '.git', 'out']),
    scanOnSave: cfg.get<boolean>('scanOnSave', true),
    scanOnActivation: cfg.get<boolean>('scanOnActivation', true),
    showInformationForPossiblyUsed: cfg.get<boolean>('showInformationForPossiblyUsed', true),
  };
}

/**
 * Determine what kind of file this is based on its extension.
 */
export function getFileType(filePath: string): string {
  return path.extname(filePath).toLowerCase().replace('.', '');
}

/**
 * Normalise a class name: strip leading dot if present, trim whitespace.
 */
export function normaliseClassName(name: string): string {
  return name.trim().replace(/^\./, '');
}

/**
 * Split a space-separated class attribute value into individual class names.
 */
export function splitClasses(value: string): string[] {
  return value
    .split(/\s+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * Build a glob exclude pattern from the ignored directories list.
 */
export function buildExcludeGlob(ignoredPatterns: string[]): string {
  if (ignoredPatterns.length === 0) return '';
  const parts = ignoredPatterns.map((p) => `**/${p}/**`);
  return `{${parts.join(',')}}`;
}

/**
 * Create a debounced version of a function.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Test whether a CSS class name matches any of the given dynamic patterns.
 */
export function matchesDynamicPattern(
  className: string,
  patterns: DynamicPattern[]
): DynamicPattern | undefined {
  return patterns.find((p) => p.pattern.test(className));
}

/**
 * Convert a template-literal like "btn-${size}" into a RegExp: /^btn-.*$/
 * Returns undefined if no interpolation is present.
 */
export function templateLiteralToPattern(raw: string): DynamicPattern | undefined {
  if (!raw.includes('${')) return undefined;

  // STEP 1 – split on interpolations FIRST (before any escaping touches `$`)
  const staticParts = raw.split(/\$\{[^}]*\}/);

  // STEP 2 – human-readable display: "btn-${size}" → "btn-*"
  const display = staticParts.join('*');

  // STEP 3 – escape regex special chars in each static segment individually
  const escapedParts = staticParts.map((part) =>
    part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );

  // STEP 4 – join escaped segments with .* to represent each interpolation
  const patternStr = escapedParts.join('.*');

  try {
    // e.g. "btn-${size}" → /^btn\-.*$/  which matches btn-sm, btn-lg, etc.
    return {
      pattern: new RegExp(`^${patternStr}$`),
      display,
      filePath: '',
      line: 0,
    };
  } catch {
    return undefined;
  }
}


/**
 * Safely get the last modified time (ms) of a file URI, or -1 on error.
 */
export async function getFileMtime(uri: vscode.Uri): Promise<number> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return stat.mtime;
  } catch {
    return -1;
  }
}

/**
 * Read the text content of a file URI, returning empty string on failure.
 */
export async function readFileText(uri: vscode.Uri): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Log a message to the output channel with a timestamp prefix.
 */
export function log(channel: vscode.OutputChannel, message: string): void {
  const ts = new Date().toISOString();
  channel.appendLine(`[${ts}] ${message}`);
}
