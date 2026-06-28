export function sanitizeFilenameSegment(segment: string): string {
  const cleaned = segment
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return cleaned || 'all';
}

export function formatExportDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function defaultDependenciesFilename(projectLabel: string | null | undefined): string {
  const segment = projectLabel?.trim() ? sanitizeFilenameSegment(projectLabel) : 'all';
  return `fluxloops-dependencies-${segment}-${formatExportDate()}.xlsx`;
}

export function defaultGraphPngFilename(featureLabel: string | null | undefined): string {
  const segment = featureLabel?.trim() ? sanitizeFilenameSegment(featureLabel) : 'all';
  return `fluxloops-graph-${segment}-${formatExportDate()}.png`;
}