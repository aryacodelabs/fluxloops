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
] as const;

const PNG_SCALE = 2;

export async function exportSvgToPngBase64(svgElement: SVGSVGElement): Promise<string | undefined> {
  const rect = svgElement.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const background = getComputedStyle(document.body).backgroundColor || '#1e1e1e';
  const backgroundRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  backgroundRect.setAttribute('width', '100%');
  backgroundRect.setAttribute('height', '100%');
  backgroundRect.setAttribute('fill', background);
  clone.insertBefore(backgroundRect, clone.firstChild);

  inlineSvgStyles(svgElement, clone);

  const svgString = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = width * PNG_SCALE;
    canvas.height = height * PNG_SCALE;

    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }

    context.scale(PNG_SCALE, PNG_SCALE);
    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    const commaIndex = dataUrl.indexOf(',');
    return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : undefined;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
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