export interface NavigateMessage {
  type: 'navigate';
  filePath: string;
  line: number;
}

export function parseNavigateMessage(message: unknown): NavigateMessage | undefined {
  if (!message || typeof message !== 'object') {
    return undefined;
  }

  const candidate = message as Partial<NavigateMessage>;
  if (candidate.type !== 'navigate' || typeof candidate.filePath !== 'string') {
    return undefined;
  }

  if (typeof candidate.line !== 'number') {
    return undefined;
  }

  return {
    type: 'navigate',
    filePath: candidate.filePath,
    line: candidate.line,
  };
}