export const PROJECT_NORMS = ['IEC 62443', 'IEC 61508', 'ISO 27001', 'NIST CSF', 'None'] as const;

export type ProjectNorm = (typeof PROJECT_NORMS)[number];

const PROJECT_NORM_SET = new Set<ProjectNorm>(PROJECT_NORMS);
const PROJECT_NORM_DELIMITER = ' | ';

export function parseProjectNorms(rawNorm: string | null | undefined): string[] {
  const normalized = (rawNorm || '').trim();
  if (!normalized) {
    return [];
  }

  const parts = normalized.includes(PROJECT_NORM_DELIMITER)
    ? normalized.split(PROJECT_NORM_DELIMITER)
    : [normalized];

  return Array.from(
    new Set(
      parts
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    )
  );
}

export function normalizeSelectableProjectNorms(
  norms: string[] | null | undefined,
  fallbackNorm?: string | null
): ProjectNorm[] {
  const source = norms && norms.length > 0 ? norms : fallbackNorm ? [fallbackNorm] : ['IEC 62443'];

  const sanitized = Array.from(
    new Set(
      source
        .map((norm) => norm.trim())
        .filter((norm): norm is ProjectNorm => PROJECT_NORM_SET.has(norm as ProjectNorm))
    )
  );

  if (sanitized.length === 0) {
    return ['IEC 62443'];
  }

  const withoutNone = sanitized.filter((norm) => norm !== 'None');
  return withoutNone.length > 0 ? withoutNone : ['None'];
}

export function serializeProjectNorms(norms: readonly string[]): string {
  const normalized = normalizeSelectableProjectNorms([...norms]);
  return normalized.join(PROJECT_NORM_DELIMITER);
}

export function isNoneOnlyProjectNorm(rawNorm: string | null | undefined): boolean {
  const parsed = parseProjectNorms(rawNorm);
  return parsed.length === 1 && parsed[0] === 'None';
}

export function getPrimaryProjectNorm(rawNorm: string | null | undefined, fallback = 'Custom'): string {
  const parsed = parseProjectNorms(rawNorm);
  const primary = parsed.find((norm) => norm !== 'None');
  return primary || fallback;
}

