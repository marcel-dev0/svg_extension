# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VS Code extension ("svg1-alluneed") for working on SVG files as text. SVGs open in the normal text editor, and a webview preview panel opens beside it. The preview follows the active SVG editor, updates as the document changes, and highlights (and zooms to) the element, path segment, or polygon point under the cursor. The extension also provides an SVG formatter and a command to insert an empty `<path>`.

## Build & Development Commands

- **Compile**: `npm run compile` (runs `tsc -p ./`)
- **Watch mode**: `npm run watch` (auto-recompiles on changes)
- **Lint**: `npm run lint` (ESLint on `src/`)
- **Test**: `npm run test` (runs `vscode-test`; requires `npm run compile` first)
- **Debug**: Press F5 in VS Code to launch an Extension Development Host (uses `.vscode/launch.json`)

## Architecture

- **`src/extension.ts`**: Entry point. On activation it:
  - auto-opens the preview beside the first text editor shown for each SVG (controlled by the `svgPreview.autoOpen` setting),
  - registers the `svgPreview.open` and `svgPreview.insertEmptyPath` commands,
  - registers `SvgFormattingProvider` for `**/*.svg` (language `xml`),
  - reopens SVGs as text if VS Code opens them in the built-in image preview (`imagePreview.previewEditor`). This is a fallback for the editor association below. It only runs when no `*.svg` entry exists in `workbench.editorAssociations`, and only once per file per session, so users can still choose the image preview with "Open With…".
- **`src/svgPreviewPanel.ts`**: `SvgPreviewPanel`, a single `WebviewPanel` (a singleton held in `currentPanel`). It tracks the active SVG document, sends `update` messages with the full text when the document changes, and sends `highlight` messages on cursor moves. A `highlight` message carries the child-index path of the element at the cursor, plus segment info for `<path d>` or point info for `<polygon>`/`<polyline>` `points`. The text parsing for these (`findElementAtOffset`, path/points tokenizers) lives in this file.
- **`src/svgFormatter.ts`**: `SvgFormattingProvider` puts element attributes on separate lines and reformats `path d` and `polygon`/`polyline` `points` data.
- **`media/main.js` + `media/main.css`**: Webview frontend. Renders the SVG with `innerHTML`, handles pan/zoom (`scale`/`translate`), centers on the highlighted element, and draws segment/point overlays. Served to the webview with a nonce-based CSP.

### Default editor

`package.json` contributes `configurationDefaults` → `workbench.editorAssociations: { "*.svg": "default" }` so SVGs open in the text editor rather than VS Code's image preview. The runtime fallback in `extension.ts` covers cases where that default is not applied. The extension does **not** register a custom editor.

Activation events: `onLanguage:xml`, `onLanguage:svg`, `workspaceContains:**/*.svg`.

## Key Conventions

- TypeScript compiled to `out/` with `module: Node16`, `target: ES2022`, `strict: true`
- ESLint enforces: semicolons, curly braces, `eqeqeq`, no throw literals, camelCase/PascalCase imports
- VS Code engine requirement: `^1.109.0`
