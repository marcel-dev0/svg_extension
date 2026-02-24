import * as vscode from 'vscode';
import { SvgPreviewPanel } from './svgPreviewPanel.js';
import { SvgFormattingProvider } from './svgFormatter.js';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('svgPreview.open', () => {
			SvgPreviewPanel.open(context);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('svgPreview.insertEmptyPath', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) { return; }
			editor.edit(editBuilder => {
				editBuilder.insert(editor.selection.active, '<path d="" />');
			});
		}),
	);

	context.subscriptions.push(
		vscode.languages.registerDocumentFormattingEditProvider(
			{ language: 'xml', pattern: '**/*.svg' },
			new SvgFormattingProvider(),
		),
	);
}

export function deactivate() { }
