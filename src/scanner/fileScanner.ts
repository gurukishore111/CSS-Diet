import * as vscode from 'vscode';
import * as path from 'path';
import {
  CSSClass,
  ClassReference,
  DynamicPattern,
  FileCache,
  CssDietConfig,
} from '../types';
import { parseCSSClasses } from '../parser/cssParser';
import { parseHTMLClasses } from '../parser/htmlParser';
import { parseJSXClasses } from '../parser/jsParser';
import { parseVueClasses } from '../parser/vueParser';
import { parseAngularClasses } from '../parser/angularParser';
import { buildExcludeGlob, readFileText, getFileMtime, log } from '../utils/helpers';

export interface ScanFiles {
  cssClasses: CSSClass[];
  classReferences: ClassReference[];
  dynamicPatterns: DynamicPattern[];
}

/**
 * Singleton file cache shared across scans to avoid re-parsing unchanged files.
 */
const fileCache = new Map<string, FileCache>();

/**
 * Scan the entire workspace and return all CSS class definitions and usages.
 */
export async function scanWorkspace(
  config: CssDietConfig,
  channel: vscode.OutputChannel
): Promise<ScanFiles> {
  const cssClasses: CSSClass[] = [];
  const classReferences: ClassReference[] = [];
  const dynamicPatterns: DynamicPattern[] = [];

  const excludeGlob = buildExcludeGlob(config.ignoredPatterns);

  log(channel, 'Scanning workspace...');

  // --- CSS / SCSS files ---
  const cssFiles = await vscode.workspace.findFiles(
    '**/*.{css,scss}',
    excludeGlob
  );
  log(channel, `Found ${cssFiles.length} CSS/SCSS file(s)`);

  for (const uri of cssFiles) {
    const { classes } = await parseCssFile(uri, config, channel);
    cssClasses.push(...classes);
  }

  // --- Markup / Code files ---
  const markupFiles = await vscode.workspace.findFiles(
    '**/*.{html,jsx,tsx,vue,ts,js}',
    excludeGlob
  );
  log(channel, `Found ${markupFiles.length} markup/code file(s)`);

  for (const uri of markupFiles) {
    const { refs, patterns } = await parseMarkupFile(uri, config, channel);
    classReferences.push(...refs);
    dynamicPatterns.push(...patterns);
  }

  log(
    channel,
    `Scan complete: ${cssClasses.length} CSS classes, ${classReferences.length} references, ${dynamicPatterns.length} dynamic patterns`
  );

  return { cssClasses, classReferences, dynamicPatterns };
}

/**
 * Parse a single CSS or SCSS file, using cache when the file has not changed.
 */
async function parseCssFile(
  uri: vscode.Uri,
  _config: CssDietConfig,
  channel: vscode.OutputChannel
): Promise<{ classes: CSSClass[] }> {
  const filePath = uri.fsPath;
  const mtime = await getFileMtime(uri);
  const cached = fileCache.get(filePath);

  if (cached && cached.mtime === mtime && cached.cssClasses) {
    return { classes: cached.cssClasses };
  }

  const content = await readFileText(uri);
  if (!content) return { classes: [] };

  const isSCSS = path.extname(filePath).toLowerCase() === '.scss';
  const classes = parseCSSClasses(content, filePath, isSCSS);

  fileCache.set(filePath, { filePath, mtime, cssClasses: classes });
  log(channel, `  CSS: ${path.basename(filePath)} → ${classes.length} class(es)`);

  return { classes };
}

/**
 * Parse a markup/code file, using cache when the file has not changed.
 */
async function parseMarkupFile(
  uri: vscode.Uri,
  config: CssDietConfig,
  channel: vscode.OutputChannel
): Promise<{ refs: ClassReference[]; patterns: DynamicPattern[] }> {
  const filePath = uri.fsPath;
  const ext = path.extname(filePath).toLowerCase();

  // Skip files we don't know how to parse
  const supported = ['.html', '.jsx', '.tsx', '.vue', '.ts', '.js'];
  if (!supported.includes(ext)) return { refs: [], patterns: [] };

  const mtime = await getFileMtime(uri);
  const cached = fileCache.get(filePath);

  if (
    cached &&
    cached.mtime === mtime &&
    cached.classReferences &&
    cached.dynamicPatterns
  ) {
    return { refs: cached.classReferences, patterns: cached.dynamicPatterns };
  }

  const content = await readFileText(uri);
  if (!content) return { refs: [], patterns: [] };

  let refs: ClassReference[] = [];
  let patterns: DynamicPattern[] = [];

  switch (ext) {
    case '.html': {
      const result = parseHTMLClasses(content, filePath);
      refs = result.references;
      patterns = result.patterns;

      // Angular templates are typically .html – also run Angular parser
      const angResult = parseAngularClasses(content, filePath, config.enableDynamicDetection);
      refs.push(...angResult.references);
      patterns.push(...angResult.patterns);
      break;
    }

    case '.jsx':
    case '.tsx': {
      const result = parseJSXClasses(content, filePath, config.enableDynamicDetection);
      refs = result.references;
      patterns = result.patterns;
      break;
    }

    case '.ts':
    case '.js': {
      // Could be Angular component with inline template, or plain TS/JS
      // Run JSX parser (it handles TS) + look for templateUrl patterns
      const result = parseJSXClasses(content, filePath, config.enableDynamicDetection);
      refs = result.references;
      patterns = result.patterns;
      break;
    }

    case '.vue': {
      const result = parseVueClasses(content, filePath, config.enableDynamicDetection);
      refs = result.references;
      patterns = result.patterns;
      break;
    }
  }

  // Deduplicate references by name+file
  const seen = new Set<string>();
  refs = refs.filter((r) => {
    const key = `${r.name}|${r.filePath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  fileCache.set(filePath, {
    filePath,
    mtime,
    classReferences: refs,
    dynamicPatterns: patterns,
  });

  log(channel, `  Markup: ${path.basename(filePath)} → ${refs.length} ref(s)`);

  return { refs, patterns };
}

/**
 * Invalidate the cache entry for a given file path (called on save).
 */
export function invalidateCache(filePath: string): void {
  fileCache.delete(filePath);
}

/**
 * Clear the entire file cache.
 */
export function clearCache(): void {
  fileCache.clear();
}
