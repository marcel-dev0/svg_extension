import * as vscode from 'vscode';
import { SvgPreviewPanel } from './svgPreviewPanel.js';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('svgPreview.open', () => {
			SvgPreviewPanel.open(context);
		}),
	);
}

export function deactivate() { }
