import * as vscode from 'vscode';

export class SvgFormattingProvider implements vscode.DocumentFormattingEditProvider {

	provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
		const text = document.getText();
		const formatted = formatSvg(text);
		if (formatted === text) {
			return [];
		}
		const fullRange = new vscode.Range(
			document.positionAt(0),
			document.positionAt(text.length),
		);
		return [vscode.TextEdit.replace(fullRange, formatted)];
	}
}

function formatSvg(text: string): string {
	// Process path d="" and polygon/polyline points="" attributes.
	// The replace callback receives the match offset as the last numeric arg before the source string.
	let result = text;

	// Format element attributes (each on its own line)
	result = formatElementAttributes(result);

	// path d="..."
	result = result.replace(
		/(<path\b[^>]*?\bd\s*=\s*")([^"]*?)(")/gi,
		(full, before: string, d: string, after: string, offset: number) =>
			before + formatPathD(d, getIndent(result, offset)) + after
	);
	result = result.replace(
		/(<path\b[^>]*?\bd\s*=\s*')([^']*?)(')/gi,
		(full, before: string, d: string, after: string, offset: number) =>
			before + formatPathD(d, getIndent(result, offset)) + after
	);

	// polygon/polyline points="..."
	result = result.replace(
		/(<(?:polygon|polyline)\b[^>]*?\bpoints\s*=\s*")([^"]*?)(")/gi,
		(full, before: string, pts: string, after: string, offset: number) =>
			before + formatPoints(pts, getIndent(result, offset)) + after
	);
	result = result.replace(
		/(<(?:polygon|polyline)\b[^>]*?\bpoints\s*=\s*')([^']*?)(')/gi,
		(full, before: string, pts: string, after: string, offset: number) =>
			before + formatPoints(pts, getIndent(result, offset)) + after
	);

	return result;
}

function parseAttributes(attrsStr: string): string[] {
	const attrs: string[] = [];
	const re = /([\w:.-]+)\s*(?:=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]*))?/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(attrsStr)) !== null) {
		const attr = m[0].trim();
		if (attr) {
			attrs.push(attr);
		}
	}
	return attrs;
}

function formatElementAttributes(text: string): string {
	return text.replace(
		/<([a-zA-Z][\w:.-]*)(\s[^>]*?)(\s*\/?>)/g,
		(full: string, tagName: string, attrsRaw: string, close: string, offset: number) => {
			const lineStart = text.lastIndexOf('\n', offset) + 1;
			const lineText = text.substring(lineStart, offset);
			const indentMatch = lineText.match(/^(\s*)/);
			const tagIndent = indentMatch?.[1] ?? '';
			const attrIndent = tagIndent + '\t';

			const attrs = parseAttributes(attrsRaw);
			if (attrs.length <= 1) {
				return full;
			}

			const closeTrimmed = close.trim();
			return `<${tagName}\n${attrs.map(a => attrIndent + a).join('\n')}\n${tagIndent}${closeTrimmed}`;
		}
	);
}

function getIndent(text: string, matchIndex: number): string {
	const lineStart = text.lastIndexOf('\n', matchIndex) + 1;
	const lineText = text.substring(lineStart, matchIndex);
	const indentMatch = lineText.match(/^(\s*)/);
	return (indentMatch?.[1] ?? '') + '\t';
}

function formatPathD(d: string, indent: string): string {
	const trimmed = d.trim();
	if (!trimmed) {
		return d;
	}

	const segments = trimmed.split(/(?=[MmLlHhVvCcSsQqTtAaZz])/).map(s => s.trim()).filter(Boolean);
	if (segments.length <= 1) {
		return d;
	}

	return '\n' + segments.map(seg => indent + seg).join('\n') + '\n' + indent.slice(0, -1);
}

function formatPoints(points: string, indent: string): string {
	const trimmed = points.trim();
	if (!trimmed) {
		return points;
	}

	const nums = trimmed.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/g);
	if (!nums || nums.length < 4) {
		return points;
	}

	const pairs: string[] = [];
	for (let i = 0; i + 1 < nums.length; i += 2) {
		pairs.push(`${nums[i]},${nums[i + 1]}`);
	}

	return '\n' + pairs.map(p => indent + p).join('\n') + '\n' + indent.slice(0, -1);
}
