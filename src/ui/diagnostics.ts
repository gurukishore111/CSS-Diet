import * as vscode from 'vscode';
import { ClassUsageResult } from '../types';

/** Singleton diagnostics collection. */
let diagnosticCollection: vscode.DiagnosticCollection | undefined;

/**
 * Create the diagnostics collection – call once at activation.
 */
export function createDiagnosticsCollection(): vscode.DiagnosticCollection {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('css-diet');
  return diagnosticCollection;
}

/**
 * Populate the Problems panel from detection results.
 *
 * Unused   → Warning
 * Possibly → Information
 */
export function updateDiagnostics(
  results: ClassUsageResult[],
  showPossiblyUsed: boolean
): void {
  if (!diagnosticCollection) return;

  diagnosticCollection.clear();

  // Group results by CSS file
  const byFile = new Map<string, ClassUsageResult[]>();
  for (const result of results) {
    if (result.status === 'USED') continue;
    if (result.status === 'POSSIBLY_USED' && !showPossiblyUsed) continue;

    const fp = result.cssClass.filePath;
    if (!byFile.has(fp)) byFile.set(fp, []);
    byFile.get(fp)!.push(result);
  }

  for (const [filePath, fileResults] of byFile) {
    const uri = vscode.Uri.file(filePath);
    const diagnostics: vscode.Diagnostic[] = [];

    for (const result of fileResults) {
      const line = Math.max(0, result.cssClass.line - 1);
      const col = Math.max(0, result.cssClass.column - 1);

      const range = new vscode.Range(
        new vscode.Position(line, col),
        new vscode.Position(line, col + result.cssClass.name.length + 1) // +1 for the dot
      );

      let message: string;
      let severity: vscode.DiagnosticSeverity;

      if (result.status === 'UNUSED') {
        message = `Unused CSS class: .${result.cssClass.name}`;
        severity = vscode.DiagnosticSeverity.Warning;
      } else {
        const patternHint = result.matchedPattern
          ? ` (matches pattern "${result.matchedPattern.display}")`
          : '';
        message = `Possibly unused CSS class: .${result.cssClass.name}${patternHint}`;
        severity = vscode.DiagnosticSeverity.Information;
      }

      const diagnostic = new vscode.Diagnostic(range, message, severity);
      diagnostic.source = 'CSS Diet';
      diagnostic.code = result.status === 'UNUSED' ? 'unused-class' : 'possibly-unused-class';

      diagnostics.push(diagnostic);
    }

    diagnosticCollection.set(uri, diagnostics);
  }
}

/**
 * Clear all diagnostics.
 */
export function clearDiagnostics(): void {
  diagnosticCollection?.clear();
}

/**
 * Dispose the collection (call on extension deactivation).
 */
export function disposeDiagnostics(): void {
  diagnosticCollection?.dispose();
  diagnosticCollection = undefined;
}
