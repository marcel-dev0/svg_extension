// @ts-check

// @ts-ignore
const svgNS = 'http://www.w3.org/2000/svg';

const container = /** @type {HTMLElement} */ (document.getElementById('svg-container'));
const content = /** @type {HTMLElement} */ (document.getElementById('svg-content'));

let scale = 1;
let translateX = 0;
let translateY = 0;

/** @type {Element | null} */
let highlightedElement = null;
let lastHighlightPathKey = '';

// --- Center & scale to fit highlighted element ---

/**
 * @param {Element} el
 */
function centerOnElement(el) {
	const containerRect = container.getBoundingClientRect();
	if (containerRect.width === 0 || containerRect.height === 0) return;

	const elRect = el.getBoundingClientRect();
	if (elRect.width === 0 && elRect.height === 0) return;

	// Convert element's screen rect to content-local coordinates
	const localX = (elRect.left - containerRect.left - translateX) / scale;
	const localY = (elRect.top - containerRect.top - translateY) / scale;
	const localW = elRect.width / scale;
	const localH = elRect.height / scale;

	const padding = 40;
	const availW = containerRect.width - padding * 2;
	const availH = containerRect.height - padding * 2;

	if (availW <= 0 || availH <= 0) return;

	const newScale = Math.min(availW / localW, availH / localH, 10);

	const elCenterX = localX + localW / 2;
	const elCenterY = localY + localH / 2;

	translateX = containerRect.width / 2 - elCenterX * newScale;
	translateY = containerRect.height / 2 - elCenterY * newScale;
	scale = newScale;

	applyTransform();
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

// --- Polygon / polyline point highlight (cursor-driven) ---

function clearPolygonHighlight() {
	const svg = content.querySelector('svg');
	if (svg) {
		svg.querySelector('.polygon-point-highlight')?.remove();
	}
}

/**
 * Draw highlight dots on all polygon/polyline points.
 * @param {number[][]} points - all [x,y] pairs
 * @param {number | null} activeIdx - index of the point the cursor is on (null = none)
 */
function drawPolygonPointHighlight(points, activeIdx) {
	clearPolygonHighlight();

	const svg = content.querySelector('svg');
	if (!svg || points.length === 0) return;

	const vb = svg.viewBox?.baseVal;
	const svgW = (vb && vb.width) || svg.width?.baseVal?.value || 100;
	const svgH = (vb && vb.height) || svg.height?.baseVal?.value || 100;
	const size = Math.max(svgW, svgH);
	const baseR = size * 0.008;
	const activeR = size * 0.016;
	const sw = size * 0.003;

	const g = document.createElementNS(svgNS, 'g');
	g.setAttribute('class', 'polygon-point-highlight');
	g.style.pointerEvents = 'none';

	for (let i = 0; i < points.length; i++) {
		const [px, py] = points[i];
		const isActive = i === activeIdx;
		appendDot(g, px, py, baseR, sw, isActive ? "red" : "blue");
	}

	svg.appendChild(g);
}

function applyTransform() {
	content.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

// --- Messages from extension host ---

window.addEventListener('message', (event) => {
	const message = event.data;
	switch (message.type) {
		case 'update':
			content.innerHTML = message.content;
			break;
		case 'highlight': {
			const path = message.path;
			const pathKey = path ? JSON.stringify(path) : '';

			if (!path) {
				highlightedElement = null;
				lastHighlightPathKey = '';
				clearSegmentHighlight();
				clearPolygonHighlight();
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

			const newElement = current !== content ? current : null;
			const elementChanged = pathKey !== lastHighlightPathKey;
			highlightedElement = newElement;
			lastHighlightPathKey = pathKey;

			// Center & scale when the highlighted element changes
			if (elementChanged && newElement) {
				centerOnElement(newElement);
			}

			// Path segment highlight (green)
			if (message.segment) {
				drawSegmentHighlight(message.segment);
			} else {
				clearSegmentHighlight();
			}

			// Polygon/polyline point highlight
			if (message.polygonPoints) {
				drawPolygonPointHighlight(
					message.polygonPoints.points,
					message.polygonPoints.activePointIndex
				);
			} else {
				clearPolygonHighlight();
			}
			break;
		}
	}
});
