const INLINE_STYLE_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'font-size',
  'font-family',
  'font-weight',
  'opacity',
  'fill-opacity',
  'text-anchor',
  'transform',
] as const;

const PNG_SCALE = 2;

const GRAPH_EXPORT_STYLES = `
  .link { stroke: #888; stroke-opacity: 0.6; fill: none; }
  .link.cycle { stroke: #e74c3c; stroke-width: 2.5px; stroke-dasharray: 6 4; }
  .link.effect-dispatch { stroke-dasharray: 4 3; }
  .node circle, .node rect, .node polygon { stroke: #ccc; stroke-width: 1.5px; }
  .node text { font-size: 11px; fill: #ccc; }
  .node.cycle-node circle, .node.cycle-node rect, .node.cycle-node polygon { stroke: #e74c3c; stroke-width: 2.5px; }
  .node.dimmed { opacity: 0.15; }
`;

export async function exportSvgToPngBase64(svgElement: SVGSVGElement): Promise<string | undefined> {
  const rect = svgElement.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const viewBox = svgElement.getAttribute('viewBox');
  clone.setAttribute('viewBox', viewBox ?? `0 0 ${width} ${height}`);

  const background = resolveBackgroundColor();
  const backgroundRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  backgroundRect.setAttribute('x', '0');
  backgroundRect.setAttribute('y', '0');
  backgroundRect.setAttribute('width', String(width));
  backgroundRect.setAttribute('height', String(height));
  backgroundRect.setAttribute('fill', background);
  clone.insertBefore(backgroundRect, clone.firstChild);

  embedGraphStyles(clone);
  inlineSvgStyles(svgElement, clone);

  const svgString = new XMLSerializer().serializeToString(clone);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  const image = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = width * PNG_SCALE;
  canvas.height = height * PNG_SCALE;

  const context = canvas.getContext('2d');
  if (!context) {
    return undefined;
  }

  context.scale(PNG_SCALE, PNG_SCALE);
  context.drawImage(image, 0, 0, width, height);

  try {
    const dataUrlPng = canvas.toDataURL('image/png');
    const commaIndex = dataUrlPng.indexOf(',');
    return commaIndex >= 0 ? dataUrlPng.slice(commaIndex + 1) : undefined;
  } catch {
    return undefined;
  }
}

function resolveBackgroundColor(): string {
  const background = getComputedStyle(document.body).backgroundColor;
  if (background && background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') {
    return background;
  }
  return '#1e1e1e';
}

function embedGraphStyles(clone: SVGSVGElement): void {
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = GRAPH_EXPORT_STYLES;
  clone.insertBefore(style, clone.firstChild);
}

function inlineSvgStyles(sourceRoot: Element, targetRoot: Element): void {
  const sourceElements = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll('*'))];
  const targetElements = [targetRoot, ...Array.from(targetRoot.querySelectorAll('*'))];

  for (let index = 0; index < sourceElements.length; index++) {
    const source = sourceElements[index];
    const target = targetElements[index];
    if (!source || !target) {
      continue;
    }

    const computed = getComputedStyle(source);
    const style = INLINE_STYLE_PROPS.map((prop) => {
      const value = computed.getPropertyValue(prop);
      return value ? `${prop}:${value}` : '';
    })
      .filter(Boolean)
      .join(';');

    if (style) {
      target.setAttribute('style', style);
    }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to render SVG for PNG export.'));
    image.src = url;
  });
}