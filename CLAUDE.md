# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VS Code extension ("my-test") that provides a custom SVG preview editor. When users open `.svg` files, the extension offers an interactive webview-based editor with zoom controls and background toggling.

## Build & Development Commands

- **Compile**: `npm run compile` (runs `tsc -p ./`)
- **Watch mode**: `npm run watch` (auto-recompiles on changes)
- **Lint**: `npm run lint` (ESLint on `src/`)
- **Test**: `npm run test` (runs `vscode-test`; requires `npm run compile` first)
- **Debug**: Press F5 in VS Code to launch an Extension Development Host (uses `.vscode/launch.json`)

## Architecture

- **`src/extension.ts`** — Entry point. Registers the `SvgEditorProvider` on activation.
- **`src/svgEditorProvider.ts`** — Implements `vscode.CustomTextEditorProvider`. Manages the webview lifecycle: renders SVG content inline, syncs document changes to the webview via `postMessage`, and applies edits back to the document when receiving `edit` messages from the webview.
- **`media/main.js` + `media/main.css`** — Webview frontend assets (zoom controls, background toggle, SVG rendering). Served to the webview with a nonce-based CSP.

The extension registers as a custom editor for `*.svg` files with viewType `svgPreview.editor` and priority `option` (user must explicitly choose it).

## Key Conventions

- TypeScript compiled to `out/` with `module: Node16`, `target: ES2022`, `strict: true`
- ESLint enforces: semicolons, curly braces, `eqeqeq`, no throw literals, camelCase/PascalCase imports
- VS Code engine requirement: `^1.109.0`
