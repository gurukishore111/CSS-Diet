/**
 * Core types for CSS Diet extension
 */

export type ClassStatus = 'USED' | 'POSSIBLY_USED' | 'UNUSED';

export type FileType = 'css' | 'scss' | 'html' | 'jsx' | 'tsx' | 'vue' | 'angular';

/** A CSS class defined in a stylesheet */
export interface CSSClass {
  name: string;
  filePath: string;
  line: number;
  column: number;
}

/** A class reference found in markup/code */
export interface ClassReference {
  name: string;
  filePath: string;
  line: number;
  /** Whether this was found via a dynamic expression */
  isDynamic: boolean;
}

/** A dynamic pattern extracted from template literals or concatenation */
export interface DynamicPattern {
  /** Regex pattern built from the template, e.g. /^btn-.*$/ */
  pattern: RegExp;
  /** Human-readable representation, e.g. "btn-*" */
  display: string;
  filePath: string;
  line: number;
}

/** Classification result for a single CSS class */
export interface ClassUsageResult {
  cssClass: CSSClass;
  status: ClassStatus;
  /** Matched dynamic pattern (only for POSSIBLY_USED) */
  matchedPattern?: DynamicPattern;
}

/** Aggregated scan result for the entire workspace */
export interface ScanResult {
  cssClasses: CSSClass[];
  classReferences: ClassReference[];
  dynamicPatterns: DynamicPattern[];
  usageResults: ClassUsageResult[];
  scannedAt: Date;
  /** Duration in milliseconds */
  durationMs: number;
}

/** Cache entry for a single parsed file */
export interface FileCache {
  filePath: string;
  mtime: number;
  cssClasses?: CSSClass[];
  classReferences?: ClassReference[];
  dynamicPatterns?: DynamicPattern[];
}

/** Extension configuration */
export interface CssDietConfig {
  enableDynamicDetection: boolean;
  ignoredPatterns: string[];
  scanOnSave: boolean;
  scanOnActivation: boolean;
  showInformationForPossiblyUsed: boolean;
}
