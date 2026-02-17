import * as vscode from 'vscode';

export class SvgPreviewPanel {

	private static currentPanel: SvgPreviewPanel | undefined;
	private static readonly viewType = 'svgPreview';

	private readonly panel: vscode.WebviewPanel;
	private readonly extensionUri: vscode.Uri;
	private trackedDocument: vscode.TextDocument | undefined;
	private readonly disposables: vscode.Disposable[] = [];

	public static open(context: vscode.ExtensionContext): void {
		const editor = vscode.window.activeTextEditor;
		if (!editor || !editor.document.fileName.endsWith('.svg')) {
			vscode.window.showErrorMessage('Open an SVG file first.');
			return;
		}

		if (SvgPreviewPanel.currentPanel) {
			SvgPreviewPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
			SvgPreviewPanel.currentPanel.setDocument(editor.document);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			SvgPreviewPanel.viewType,
			'SVG Preview',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'media'),
				],
			},
		);

		SvgPreviewPanel.currentPanel = new SvgPreviewPanel(panel, context.extensionUri, editor.document);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
		this.panel = panel;
		this.extensionUri = extensionUri;
		this.trackedDocument = document;

		this.panel.webview.html = this.getHtmlForWebview(document);

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument(e => {
				if (this.trackedDocument && e.document.uri.toString() === this.trackedDocument.uri.toString()) {
					this.update();
				}
			}),
		);

		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(editor => {
				if (editor && editor.document.fileName.endsWith('.svg')) {
					this.setDocument(editor.document);
				}
			}),
		);

		this.disposables.push(
			vscode.window.onDidChangeTextEditorSelection(e => {
				if (this.trackedDocument && e.textEditor.document.uri.toString() === this.trackedDocument.uri.toString()) {
					this.highlightAtCursor(e.textEditor);
				}
			}),
		);
	}

	private setDocument(document: vscode.TextDocument): void {
		this.trackedDocument = document;
		this.panel.title = `SVG Preview — ${vscode.workspace.asRelativePath(document.uri)}`;
		this.update();
	}

	private update(): void {
		if (!this.trackedDocument) {
			return;
		}
		this.panel.webview.postMessage({
			type: 'update',
			content: this.trackedDocument.getText(),
		});
	}

	private highlightAtCursor(editor: vscode.TextEditor): void {
		const offset = editor.document.offsetAt(editor.selection.active);
		const text = editor.document.getText();
		const element = findElementAtOffset(text, offset);

		let segment: PathSegmentInfo | null = null;
		if (element && element.tagName === 'path') {
			segment = findPathSegmentAtOffset(text, offset, element.openTagStart, element.openTagEnd) ?? null;
		}

		this.panel.webview.postMessage({
			type: 'highlight',
			path: element?.path ?? null,
			segment,
		});
	}

	private dispose(): void {
		SvgPreviewPanel.currentPanel = undefined;
		this.panel.dispose();
		while (this.disposables.length) {
			const d = this.disposables.pop();
			d?.dispose();
		}
	}

	private getHtmlForWebview(document: vscode.TextDocument): string {
		const webview = this.panel.webview;
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css')
		);
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js')
		);

		const nonce = getNonce();
		const svgContent = document.getText();

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${styleUri}" rel="stylesheet">
	<title>SVG Preview</title>
</head>
<body>
	<div class="toolbar">
		<button id="btn-zoom-in" title="Zoom In">+</button>
		<span id="zoom-level">100%</span>
		<button id="btn-zoom-out" title="Zoom Out">&minus;</button>
		<button id="btn-fit" title="Fit to View">Fit</button>
		<button id="btn-reset" title="Reset Zoom">1:1</button>
		<span class="separator"></span>
		<button id="btn-bg" title="Toggle Background">BG</button>
	</div>
	<div id="svg-container" class="svg-container bg-checkered">
		<div id="svg-content">${svgContent}</div>
	</div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

// ─── Element-at-offset detection ────────────────────────────────────

interface ElementInfo {
	path: number[];
	tagName: string;
	openTagStart: number;
	openTagEnd: number;
}

function findElementAtOffset(text: string, offset: number): ElementInfo | undefined {
	const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)[^>]*?\/?>/g;
	const stack: { tagName: string; childCount: number; start: number; tagEnd: number; path: number[] }[] = [];

	interface ElementRange {
		path: number[];
		tagName: string;
		openTagStart: number;
		openTagEnd: number;
		rangeEnd: number;
	}
	const elements: ElementRange[] = [];
	let rootChildCount = 0;

	let match;
	while ((match = tagRegex.exec(text)) !== null) {
		const fullMatch = match[0];
		const tagName = match[1];
		const tagStart = match.index;
		const tagEnd = match.index + fullMatch.length;
		const isSelfClosing = fullMatch.endsWith('/>');
		const isClosing = fullMatch.startsWith('</');

		if (isClosing) {
			if (stack.length > 0) {
				const top = stack.pop()!;
				elements.push({
					path: top.path,
					tagName: top.tagName,
					openTagStart: top.start,
					openTagEnd: top.tagEnd,
					rangeEnd: tagEnd,
				});
			}
		} else if (isSelfClosing) {
			const parent = stack.length > 0 ? stack[stack.length - 1] : undefined;
			const childIndex = parent ? parent.childCount : rootChildCount;
			const path = parent ? [...parent.path, childIndex] : [childIndex];

			elements.push({
				path,
				tagName,
				openTagStart: tagStart,
				openTagEnd: tagEnd,
				rangeEnd: tagEnd,
			});

			if (parent) {
				parent.childCount++;
			} else {
				rootChildCount++;
			}
		} else {
			const parent = stack.length > 0 ? stack[stack.length - 1] : undefined;
			const childIndex = parent ? parent.childCount : rootChildCount;
			const path = parent ? [...parent.path, childIndex] : [childIndex];

			stack.push({ tagName, childCount: 0, start: tagStart, tagEnd: tagEnd, path });

			if (parent) {
				parent.childCount++;
			} else {
				rootChildCount++;
			}
		}
	}

	// Unclosed elements still on the stack
	while (stack.length > 0) {
		const top = stack.pop()!;
		elements.push({
			path: top.path,
			tagName: top.tagName,
			openTagStart: top.start,
			openTagEnd: top.tagEnd,
			rangeEnd: text.length,
		});
	}

	// Deepest element containing the offset
	let best: ElementRange | undefined;
	for (const el of elements) {
		if (offset >= el.openTagStart && offset <= el.rangeEnd) {
			if (!best || el.path.length > best.path.length) {
				best = el;
			}
		}
	}

	if (!best) {
		return undefined;
	}
	return {
		path: best.path,
		tagName: best.tagName,
		openTagStart: best.openTagStart,
		openTagEnd: best.openTagEnd,
	};
}

// ─── Path segment detection ─────────────────────────────────────────

interface PathSegmentInfo {
	command: string;
	startPoint: [number, number];
	endPoint: [number, number];
	controlPoints?: [number, number][];
}

const ARG_COUNTS: Record<string, number> = {
	M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};

function findPathSegmentAtOffset(
	text: string,
	offset: number,
	openTagStart: number,
	openTagEnd: number,
): PathSegmentInfo | undefined {
	const tagText = text.substring(openTagStart, openTagEnd);
	const dMatch = tagText.match(/\bd\s*=\s*(['"])([\s\S]*?)\1/);
	if (!dMatch || dMatch.index === undefined) {
		return undefined;
	}

	const dValue = dMatch[2];
	const quoteChar = dMatch[1];
	const dValueStart = openTagStart + dMatch.index + dMatch[0].indexOf(quoteChar) + 1;
	const dValueEnd = dValueStart + dValue.length;

	if (offset < dValueStart || offset > dValueEnd) {
		return undefined;
	}

	const cursorInD = offset - dValueStart;
	return parsePathSegmentAtCursor(dValue, cursorInD);
}

interface ParsedSegment {
	command: string;
	isRelative: boolean;
	args: number[];
	startOffset: number;
	endOffset: number;
	startPoint: [number, number];
	subpathStart: [number, number];
}

function parsePathSegmentAtCursor(d: string, cursorPos: number): PathSegmentInfo | undefined {
	// Tokenize
	interface Token { type: 'cmd' | 'num'; value: string; start: number; end: number }
	const tokens: Token[] = [];
	const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[+-]?\d+)?)/g;
	let m;
	while ((m = re.exec(d)) !== null) {
		tokens.push({
			type: m[1] ? 'cmd' : 'num',
			value: m[0],
			start: m.index,
			end: m.index + m[0].length,
		});
	}

	// Build segments
	const segments: ParsedSegment[] = [];
	let cmd = '';
	let isRel = false;
	let expectedArgs = 0;
	let args: number[] = [];
	let segStartOffset = 0;
	let segEndOffset = 0;
	let cx = 0, cy = 0;
	let spx = 0, spy = 0;

	function flush(): void {
		if (!cmd) {
			return;
		}
		const sp: [number, number] = [cx, cy];
		const subStart: [number, number] = [spx, spy];
		const upper = cmd.toUpperCase();

		switch (upper) {
			case 'M':
				if (isRel) { cx += args[0]; cy += args[1]; }
				else { cx = args[0]; cy = args[1]; }
				spx = cx; spy = cy;
				break;
			case 'L': case 'T':
				if (isRel) { cx += args[0]; cy += args[1]; }
				else { cx = args[0]; cy = args[1]; }
				break;
			case 'H':
				if (isRel) { cx += args[0]; } else { cx = args[0]; }
				break;
			case 'V':
				if (isRel) { cy += args[0]; } else { cy = args[0]; }
				break;
			case 'C':
				if (isRel) { cx += args[4]; cy += args[5]; }
				else { cx = args[4]; cy = args[5]; }
				break;
			case 'S': case 'Q':
				if (isRel) { cx += args[expectedArgs - 2]; cy += args[expectedArgs - 1]; }
				else { cx = args[expectedArgs - 2]; cy = args[expectedArgs - 1]; }
				break;
			case 'A':
				if (isRel) { cx += args[5]; cy += args[6]; }
				else { cx = args[5]; cy = args[6]; }
				break;
			case 'Z':
				cx = spx; cy = spy;
				break;
		}

		segments.push({
			command: upper,
			isRelative: isRel,
			args: [...args],
			startOffset: segStartOffset,
			endOffset: segEndOffset,
			startPoint: sp,
			subpathStart: subStart,
		});
	}

	for (const tok of tokens) {
		if (tok.type === 'cmd') {
			if (args.length === expectedArgs && cmd) {
				flush();
				args = [];
			}
			cmd = tok.value;
			isRel = tok.value === tok.value.toLowerCase();
			expectedArgs = ARG_COUNTS[tok.value.toUpperCase()] ?? 0;
			segStartOffset = tok.start;
			segEndOffset = tok.end;
			args = [];

			if (expectedArgs === 0) {
				flush();
				cmd = '';
			}
		} else {
			args.push(Number(tok.value));
			segEndOffset = tok.end;
			if (args.length === 1) {
				segStartOffset = Math.min(segStartOffset, tok.start);
			}

			if (args.length === expectedArgs) {
				flush();
				args = [];
				if (cmd.toUpperCase() === 'M') {
					cmd = isRel ? 'l' : 'L';
					isRel = cmd === 'l';
					expectedArgs = 2;
				}
				segStartOffset = tok.end;
			}
		}
	}

	if (args.length === expectedArgs && cmd) {
		flush();
	}

	// Find segment at cursor
	let best: ParsedSegment | undefined;
	for (const seg of segments) {
		if (cursorPos >= seg.startOffset && cursorPos <= seg.endOffset) {
			best = seg;
		}
	}
	if (!best && segments.length > 0) {
		let minDist = Infinity;
		for (const seg of segments) {
			const dist = cursorPos < seg.startOffset
				? seg.startOffset - cursorPos
				: cursorPos - seg.endOffset;
			if (dist < minDist && dist < 5) {
				minDist = dist;
				best = seg;
			}
		}
	}

	if (!best) {
		return undefined;
	}

	return toSegmentInfo(best);
}

function toSegmentInfo(seg: ParsedSegment): PathSegmentInfo | undefined {
	const sp = seg.startPoint;
	const a = seg.args;
	const rel = seg.isRelative;

	switch (seg.command) {
		case 'M': {
			const x = rel ? sp[0] + a[0] : a[0];
			const y = rel ? sp[1] + a[1] : a[1];
			return { command: 'M', startPoint: sp, endPoint: [x, y] };
		}
		case 'L': {
			const x = rel ? sp[0] + a[0] : a[0];
			const y = rel ? sp[1] + a[1] : a[1];
			return { command: 'L', startPoint: sp, endPoint: [x, y] };
		}
		case 'H': {
			const x = rel ? sp[0] + a[0] : a[0];
			return { command: 'L', startPoint: sp, endPoint: [x, sp[1]] };
		}
		case 'V': {
			const y = rel ? sp[1] + a[0] : a[0];
			return { command: 'L', startPoint: sp, endPoint: [sp[0], y] };
		}
		case 'C': {
			const c1x = rel ? sp[0] + a[0] : a[0];
			const c1y = rel ? sp[1] + a[1] : a[1];
			const c2x = rel ? sp[0] + a[2] : a[2];
			const c2y = rel ? sp[1] + a[3] : a[3];
			const ex = rel ? sp[0] + a[4] : a[4];
			const ey = rel ? sp[1] + a[5] : a[5];
			return {
				command: 'C', startPoint: sp, endPoint: [ex, ey],
				controlPoints: [[c1x, c1y], [c2x, c2y]],
			};
		}
		case 'S': {
			const c2x = rel ? sp[0] + a[0] : a[0];
			const c2y = rel ? sp[1] + a[1] : a[1];
			const ex = rel ? sp[0] + a[2] : a[2];
			const ey = rel ? sp[1] + a[3] : a[3];
			return {
				command: 'S', startPoint: sp, endPoint: [ex, ey],
				controlPoints: [[c2x, c2y]],
			};
		}
		case 'Q': {
			const cx = rel ? sp[0] + a[0] : a[0];
			const cy = rel ? sp[1] + a[1] : a[1];
			const ex = rel ? sp[0] + a[2] : a[2];
			const ey = rel ? sp[1] + a[3] : a[3];
			return {
				command: 'Q', startPoint: sp, endPoint: [ex, ey],
				controlPoints: [[cx, cy]],
			};
		}
		case 'T': {
			const ex = rel ? sp[0] + a[0] : a[0];
			const ey = rel ? sp[1] + a[1] : a[1];
			return { command: 'L', startPoint: sp, endPoint: [ex, ey] };
		}
		case 'A': {
			const ex = rel ? sp[0] + a[5] : a[5];
			const ey = rel ? sp[1] + a[6] : a[6];
			return { command: 'L', startPoint: sp, endPoint: [ex, ey] };
		}
		case 'Z': {
			return { command: 'L', startPoint: sp, endPoint: seg.subpathStart };
		}
	}
	return undefined;
}

// ─── Utilities ──────────────────────────────────────────────────────

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
