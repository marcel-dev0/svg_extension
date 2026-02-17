// @ts-check

// @ts-ignore
const svgNS = 'http://www.w3.org/2000/svg';

const container = /** @type {HTMLElement} */ (document.getElementById('svg-container'));
const content = /** @type {HTMLElement} */ (document.getElementById('svg-content'));
const zoomLevelEl = /** @type {HTMLElement} */ (document.getElementById('zoom-level'));

let scale = 1;
let translateX = 0;
let translateY = 0;

// --- Highlight overlay (element bounding box) ---

const highlightOverlay = document.createElement('div');
highlightOverlay.className = 'highlight-overlay';
container.appendChild(highlightOverlay);

/** @type {Element | null} */
let highlightedElement = null;

function updateHighlightPosition() {
	if (!highlightedElement) {
		highlightOverlay.style.display = 'none';
		return;
	}

	const elRect = highlightedElement.getBoundingClientRect();
	const containerRect = container.getBoundingClientRect();

	if (elRect.width === 0 && elRect.height === 0) {
		highlightOverlay.style.display = 'none';
		return;
	}
	highlightOverlay.style.display = 'block';
	highlightOverlay.style.left = (elRect.left - containerRect.left) + 'px';
	highlightOverlay.style.top = (elRect.top - containerRect.top) + 'px';
	highlightOverlay.style.width = elRect.width + 'px';
	highlightOverlay.style.height = elRect.height + 'px';
}

// --- Path segment highlight (green overlay inside SVG) ---

function clearSegmentHighlight() {
	const svg = content.querySelector('svg');
	if (svg) {
		svg.querySelector('.segment-highlight')?.remove();
	}
}

/**
 * @param {{ command: string; startPoint: number[]; endPoint: number[]; controlPoints?: number[][] }} seg
 */
function drawSegmentHighlight(seg) {
	clearSegmentHighlight();

	const svg = content.querySelector('svg');
	if (!svg) return;

	// Determine a reasonable stroke width based on SVG size
	const vb = svg.viewBox?.baseVal;
	const svgW = (vb && vb.width) || svg.width?.baseVal?.value || 100;
	const svgH = (vb && vb.height) || svg.height?.baseVal?.value || 100;
	const size = Math.max(svgW, svgH);
	const sw = size * 0.006;
	const pointR = size * 0.01;

	const g = document.createElementNS(svgNS, 'g');
	g.setAttribute('class', 'segment-highlight');

	const [sx, sy] = seg.startPoint;
	const [ex, ey] = seg.endPoint;

	switch (seg.command) {
		case 'M': {
			// Draw a point marker
			const circle = document.createElementNS(svgNS, 'circle');
			circle.setAttribute('cx', String(ex));
			circle.setAttribute('cy', String(ey));
			circle.setAttribute('r', String(pointR));
			circle.setAttribute('fill', 'lime');
			circle.setAttribute('stroke', '#00cc00');
			circle.setAttribute('stroke-width', String(sw * 0.5));
			circle.setAttribute('opacity', '0.85');
			g.appendChild(circle);
			break;
		}
		case 'L': {
			// Draw a line
			const line = document.createElementNS(svgNS, 'line');
			line.setAttribute('x1', String(sx));
			line.setAttribute('y1', String(sy));
			line.setAttribute('x2', String(ex));
			line.setAttribute('y2', String(ey));
			line.setAttribute('stroke', 'lime');
			line.setAttribute('stroke-width', String(sw));
			line.setAttribute('stroke-linecap', 'round');
			line.setAttribute('opacity', '0.85');
			g.appendChild(line);

			// Endpoint dot
			appendDot(g, ex, ey, pointR * 0.6, sw);
			break;
		}
		case 'C': {
			// Cubic bezier
			const cp = seg.controlPoints || [];
			const [c1x, c1y] = cp[0] || [sx, sy];
			const [c2x, c2y] = cp[1] || [ex, ey];

			// Draw the curve
			const path = document.createElementNS(svgNS, 'path');
			path.setAttribute('d',
				`M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`
			);
			path.setAttribute('stroke', 'lime');
			path.setAttribute('stroke-width', String(sw));
			path.setAttribute('fill', 'none');
			path.setAttribute('stroke-linecap', 'round');
			path.setAttribute('opacity', '0.85');
			g.appendChild(path);

			// Draw control point handles (dashed lines)
			appendHandle(g, sx, sy, c1x, c1y, sw);
			appendHandle(g, ex, ey, c2x, c2y, sw);

			// Control points
			appendDot(g, c1x, c1y, pointR * 0.5, sw, '#00ff88');
			appendDot(g, c2x, c2y, pointR * 0.5, sw, '#00ff88');

			// Endpoint dot
			appendDot(g, ex, ey, pointR * 0.6, sw);
			break;
		}
		case 'S': {
			// Smooth cubic — one control point
			const cp = seg.controlPoints || [];
			const [c2x, c2y] = cp[0] || [ex, ey];

			const path = document.createElementNS(svgNS, 'path');
			path.setAttribute('d',
				`M ${sx} ${sy} S ${c2x} ${c2y} ${ex} ${ey}`
			);
			path.setAttribute('stroke', 'lime');
			path.setAttribute('stroke-width', String(sw));
			path.setAttribute('fill', 'none');
			path.setAttribute('stroke-linecap', 'round');
			path.setAttribute('opacity', '0.85');
			g.appendChild(path);

			appendHandle(g, ex, ey, c2x, c2y, sw);
			appendDot(g, c2x, c2y, pointR * 0.5, sw, '#00ff88');
			appendDot(g, ex, ey, pointR * 0.6, sw);
			break;
		}
		case 'Q': {
			// Quadratic bezier
			const cp = seg.controlPoints || [];
			const [cx, cy] = cp[0] || [sx, sy];

			const path = document.createElementNS(svgNS, 'path');
			path.setAttribute('d',
				`M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`
			);
			path.setAttribute('stroke', 'lime');
			path.setAttribute('stroke-width', String(sw));
			path.setAttribute('fill', 'none');
			path.setAttribute('stroke-linecap', 'round');
			path.setAttribute('opacity', '0.85');
			g.appendChild(path);

			appendHandle(g, sx, sy, cx, cy, sw);
			appendHandle(g, ex, ey, cx, cy, sw);
			appendDot(g, cx, cy, pointR * 0.5, sw, '#00ff88');
			appendDot(g, ex, ey, pointR * 0.6, sw);
			break;
		}
		default:
			break;
	}

	svg.appendChild(g);
}

/**
 * @param {SVGGElement} g
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {number} sw
 * @param {string} [fill]
 */
function appendDot(g, x, y, r, sw, fill) {
	const c = document.createElementNS(svgNS, 'circle');
	c.setAttribute('cx', String(x));
	c.setAttribute('cy', String(y));
	c.setAttribute('r', String(r));
	c.setAttribute('fill', fill || 'lime');
	c.setAttribute('stroke', '#00cc00');
	c.setAttribute('stroke-width', String(sw * 0.4));
	c.setAttribute('opacity', '0.9');
	g.appendChild(c);
}

/**
 * @param {SVGGElement} g
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} sw
 */
function appendHandle(g, x1, y1, x2, y2, sw) {
	const line = document.createElementNS(svgNS, 'line');
	line.setAttribute('x1', String(x1));
	line.setAttribute('y1', String(y1));
	line.setAttribute('x2', String(x2));
	line.setAttribute('y2', String(y2));
	line.setAttribute('stroke', '#00ff88');
	line.setAttribute('stroke-width', String(sw * 0.5));
	line.setAttribute('stroke-dasharray', `${sw} ${sw}`);
	line.setAttribute('opacity', '0.7');
	g.appendChild(line);
}

function applyTransform() {
	content.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
	zoomLevelEl.textContent = `${Math.round(scale * 100)}%`;
	updateHighlightPosition();
}

// --- Messages from extension host ---

window.addEventListener('message', (event) => {
	const message = event.data;
	switch (message.type) {
		case 'update':
			content.innerHTML = message.content;
			updateHighlightPosition();
			break;
		case 'highlight': {
			// Element highlight (blue box)
			const path = message.path;
			if (!path) {
				highlightedElement = null;
				updateHighlightPosition();
				clearSegmentHighlight();
				break;
			}

			/** @type {Element} */
			let current = content;
			for (const idx of path) {
				if (!current.children[idx]) {
					current = content;
					break;
				}
				current = current.children[idx];
			}

			highlightedElement = current !== content ? current : null;
			updateHighlightPosition();

			// Path segment highlight (green)
			if (message.segment) {
				drawSegmentHighlight(message.segment);
			} else {
				clearSegmentHighlight();
			}
			break;
		}
	}
});
