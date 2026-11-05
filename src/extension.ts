import * as vscode from 'vscode';
import { SvgPreviewPanel } from './svgPreviewPanel.js';
import { SvgFormattingProvider } from './svgFormatter.js';

function isSvgEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
	return !!editor
		&& editor.document.fileName.toLowerCase().endsWith('.svg')
		&& (editor.document.uri.scheme === 'file' || editor.document.uri.scheme === 'untitled');
}

export function activate(context: vscode.ExtensionContext) {
	// Auto-open the preview beside the editor the first time each SVG document is shown.
	// Documents already handled are remembered, so closing the preview isn't undone on every tab switch.
	const autoOpened = new Set<string>();

	const maybeAutoOpen = (editor: vscode.TextEditor | undefined) => {
		if (!isSvgEditor(editor)) { return; }
		if (!vscode.workspace.getConfiguration('svgPreview').get<boolean>('autoOpen', true)) { return; }
		const key = editor.document.uri.toString();
		if (autoOpened.has(key)) { return; }
		autoOpened.add(key);
		if (!SvgPreviewPanel.isOpen()) {
			SvgPreviewPanel.open(context, editor);
		}
	};

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(maybeAutoOpen),
		vscode.workspace.onDidCloseTextDocument(doc => autoOpened.delete(doc.uri.toString())),
	);
	maybeAutoOpen(vscode.window.activeTextEditor);

	// Fallback for the "*.svg": "default" editor association contributed in package.json:
	// if VS Code still opens an SVG in the built-in image preview, reopen it as text.
	const redirected = new Set<string>();
	const redirectImagePreview = async (tab: vscode.Tab) => {
		if (!(tab.input instanceof vscode.TabInputCustom)) { return; }
		if (tab.input.viewType !== 'imagePreview.previewEditor') { return; }
		const uri = tab.input.uri;
		if (!uri.path.toLowerCase().endsWith('.svg')) { return; }
		// An explicit association (ours or the user's) means the image preview was chosen
		// deliberately, e.g. via "Open With...". Leave it alone.
		const associations = vscode.workspace.getConfiguration('workbench')
			.get<Record<string, string>>('editorAssociations', {});
		if (associations['*.svg'] !== undefined) { return; }
		// Only redirect once per file, so the user can still pick the image preview afterwards.
		const key = uri.toString();
		if (redirected.has(key)) { return; }
		redirected.add(key);

		await vscode.commands.executeCommand('vscode.openWith', uri, 'default', {
			viewColumn: tab.group.viewColumn,
			preview: tab.isPreview,
		});
		await vscode.window.tabGroups.close(tab);
	};

	context.subscriptions.push(
		vscode.window.tabGroups.onDidChangeTabs(e => {
			for (const tab of e.opened) { void redirectImagePreview(tab); }
		}),
	);
	for (const group of vscode.window.tabGroups.all) {
		for (const tab of group.tabs) { void redirectImagePreview(tab); }
	}

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
