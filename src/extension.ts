import * as vscode from 'vscode';
import { scanWorkspace, invalidateCache } from './scanner/fileScanner';
import { runDetection, summariseResults } from './engine/detectionEngine';
import {
  createDecorationTypes,
  applyDecorations,
  clearDecorations,
  disposeDecorationTypes,
} from './ui/decorations';
import {
  createDiagnosticsCollection,
  updateDiagnostics,
  clearDiagnostics,
  disposeDiagnostics,
} from './ui/diagnostics';
import { getConfig, debounce, log } from './utils/helpers';
import { ScanResult } from './types';

let outputChannel: vscode.OutputChannel;
let lastScanResult: ScanResult | undefined;

/**
 * Extension activation entry point.
 */
export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('CSS Diet');
  log(outputChannel, 'CSS Diet extension activated');

  // Initialise UI subsystems
  createDecorationTypes();
  const diagCollection = createDiagnosticsCollection();

  // ── Commands ────────────────────────────────────────────────────────────────

  const scanCommand = vscode.commands.registerCommand('css-diet.scan', async () => {
    await performScan();
  });

  const clearCommand = vscode.commands.registerCommand('css-diet.clearDiagnostics', () => {
    clearDiagnostics();
    clearDecorations();
    lastScanResult = undefined;
    log(outputChannel, 'Diagnostics cleared');
    vscode.window.setStatusBarMessage('$(trash) CSS Diet: diagnostics cleared', 3000);
  });

  // ── Debounced re-scan ────────────────────────────────────────────────────────

  const debouncedScan = debounce(async (..._args: unknown[]) => {
    await performScan();
  }, 300);

  // ── File save listener ───────────────────────────────────────────────────────

  const saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
    const cfg = getConfig();
    if (!cfg.scanOnSave) return;

    // Invalidate cache entry so the saved file is re-parsed
    invalidateCache(doc.uri.fsPath);
    debouncedScan();
  });

  // ── Active editor change listener ────────────────────────────────────────────
  // Re-apply decorations whenever the user switches to a CSS file.

  const editorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor || !lastScanResult) return;
    applyDecorationsToEditor(editor, lastScanResult);
  });

  // ── Configuration change listener ────────────────────────────────────────────

  const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('cssDiet')) {
      log(outputChannel, 'Configuration changed – re-scanning');
      debouncedScan();
    }
  });

  // Register all disposables
  context.subscriptions.push(
    outputChannel,
    diagCollection,
    scanCommand,
    clearCommand,
    saveListener,
    editorChangeListener,
    configListener,
    { dispose: disposeDecorationTypes },
    { dispose: disposeDiagnostics }
  );

  // ── Auto-scan on activation ───────────────────────────────────────────────────

  const cfg = getConfig();
  if (cfg.scanOnActivation && vscode.workspace.workspaceFolders?.length) {
    // Defer slightly so the extension host is fully ready
    setTimeout(() => performScan(), 500);
  }
}

/**
 * Run a full workspace scan and update all UI elements.
 */
async function performScan(): Promise<void> {
  const config = getConfig();

  if (!vscode.workspace.workspaceFolders?.length) {
    vscode.window.showWarningMessage('CSS Diet: No workspace folder open.');
    return;
  }

  const statusBar = vscode.window.setStatusBarMessage('$(loading~spin) CSS Diet: scanning…');

  try {
    log(outputChannel, '─'.repeat(60));
    log(outputChannel, 'Starting scan…');

    const start = Date.now();

    const { cssClasses, classReferences, dynamicPatterns } = await scanWorkspace(
      config,
      outputChannel
    );

    const scanResult = runDetection(
      cssClasses,
      classReferences,
      dynamicPatterns,
      config.enableDynamicDetection
    );

    lastScanResult = scanResult;

    // Update Problems panel
    updateDiagnostics(scanResult.usageResults, config.showInformationForPossiblyUsed);

    // Update decorations in all visible CSS editors
    clearDecorations();
    for (const editor of vscode.window.visibleTextEditors) {
      applyDecorationsToEditor(editor, scanResult);
    }

    const { used, possiblyUsed, unused } = summariseResults(scanResult);
    const elapsed = Date.now() - start;

    // ── Detailed per-class report ─────────────────────────────────────────────
    const byStatus = {
      UNUSED: scanResult.usageResults.filter((r) => r.status === 'UNUSED'),
      POSSIBLY_USED: scanResult.usageResults.filter((r) => r.status === 'POSSIBLY_USED'),
      USED: scanResult.usageResults.filter((r) => r.status === 'USED'),
    };

    if (byStatus.UNUSED.length > 0) {
      log(outputChannel, `\n❌ UNUSED (${byStatus.UNUSED.length}):`);
      for (const r of byStatus.UNUSED) {
        const rel = vscode.workspace.asRelativePath(r.cssClass.filePath);
        log(outputChannel, `   .${r.cssClass.name}  →  ${rel}:${r.cssClass.line}`);
      }
    }

    if (byStatus.POSSIBLY_USED.length > 0) {
      log(outputChannel, `\n⚠️  POSSIBLY USED (${byStatus.POSSIBLY_USED.length}):`);
      for (const r of byStatus.POSSIBLY_USED) {
        const rel = vscode.workspace.asRelativePath(r.cssClass.filePath);
        const hint = r.matchedPattern ? `  [matches "${r.matchedPattern.display}"]` : '';
        log(outputChannel, `   .${r.cssClass.name}  →  ${rel}:${r.cssClass.line}${hint}`);
      }
    }

    if (byStatus.USED.length > 0) {
      log(outputChannel, `\n✅ USED (${byStatus.USED.length}):`);
      for (const r of byStatus.USED) {
        const rel = vscode.workspace.asRelativePath(r.cssClass.filePath);
        log(outputChannel, `   .${r.cssClass.name}  →  ${rel}:${r.cssClass.line}`);
      }
    }

    log(outputChannel, '');
    // ─────────────────────────────────────────────────────────────────────────

    const summary =
      `CSS Diet: ${unused} unused, ${possiblyUsed} possibly used, ${used} used — ` +
      `${cssClasses.length} classes scanned in ${elapsed}ms`;

    log(outputChannel, summary);
    statusBar.dispose();
    vscode.window.setStatusBarMessage(`$(shield) ${summary}`, 8000);

    if (unused > 0) {
      vscode.window
        .showInformationMessage(
          `CSS Diet found ${unused} unused class${unused === 1 ? '' : 'es'}.`,
          'Show Output'
        )
        .then((choice) => {
          if (choice === 'Show Output') outputChannel.show();
        });
    } else {
      vscode.window.showInformationMessage('CSS Diet: No unused CSS classes found! 🎉');
    }
  } catch (err) {
    statusBar.dispose();
    const msg = err instanceof Error ? err.message : String(err);
    log(outputChannel, `ERROR: ${msg}`);
    vscode.window.showErrorMessage(`CSS Diet scan failed: ${msg}`);
  }
}

/**
 * Apply decorations to a single editor if it is a CSS/SCSS file.
 */
function applyDecorationsToEditor(
  editor: vscode.TextEditor,
  scanResult: ScanResult
): void {
  const ext = editor.document.uri.fsPath.split('.').pop()?.toLowerCase();
  if (ext === 'css' || ext === 'scss') {
    applyDecorations(editor, scanResult.usageResults);
  }
}

/**
 * Extension deactivation – VS Code handles subscription disposal automatically.
 */
export function deactivate(): void {
  log(outputChannel, 'CSS Diet extension deactivated');
}
