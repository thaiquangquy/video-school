/**
 * Normalizes a filename or lesson id/title for comparison: lowercase, strip
 * anything that isn't alphanumeric down to single '-' separators, trim edges.
 * "Math - Fractions (01).mp4" and "math_fractions_01" both become
 * "math-fractions-01".
 */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx > 0 ? filename.slice(0, idx) : filename;
}

export type MatchCandidateLesson = {
  id: string;
  title: string;
};

export type MatchResult =
  | { kind: "matched"; lesson: MatchCandidateLesson; reason: "exact-id" | "exact-title" | "segment-id" | "segment-title" }
  | { kind: "none" }
  | { kind: "ambiguous"; lessons: MatchCandidateLesson[]; reason: "segment-id" | "segment-title" };

/**
 * True if `needle` appears in `haystack` bounded by '-' separators (or the
 * string edges) — not just anywhere. Keeps "math-fractions-01" from matching
 * a lesson id "math-fractions-0" (which would otherwise be a substring), or
 * a lesson id "01" from matching every filename that happens to contain "01"
 * somewhere in the middle of another number.
 */
function containsAsSegment(haystack: string, needle: string): boolean {
  if (haystack === needle) return true;
  if (needle === "") return false;
  return (
    haystack.startsWith(`${needle}-`) ||
    haystack.endsWith(`-${needle}`) ||
    haystack.includes(`-${needle}-`)
  );
}

/**
 * Matches a normalized (extension-stripped) filename against candidate
 * lessons. Biases toward exact matches over fuzzy substring ones: tries
 * exact id, then exact title, then segment-bounded substring against id,
 * then segment-bounded substring against title — first tier with any hits
 * wins. Multiple hits within a tier are reported as ambiguous rather than
 * guessing.
 */
export function matchFileToLesson(normalizedFilename: string, lessons: MatchCandidateLesson[]): MatchResult {
  const byNormalizedId = lessons.map((l) => ({ lesson: l, normId: normalize(l.id), normTitle: normalize(l.title) }));

  const exactId = byNormalizedId.filter((l) => l.normId === normalizedFilename);
  if (exactId.length === 1) return { kind: "matched", lesson: exactId[0].lesson, reason: "exact-id" };
  if (exactId.length > 1) return { kind: "ambiguous", lessons: exactId.map((l) => l.lesson), reason: "segment-id" };

  const exactTitle = byNormalizedId.filter((l) => l.normTitle === normalizedFilename);
  if (exactTitle.length === 1) return { kind: "matched", lesson: exactTitle[0].lesson, reason: "exact-title" };
  if (exactTitle.length > 1) {
    return { kind: "ambiguous", lessons: exactTitle.map((l) => l.lesson), reason: "segment-title" };
  }

  const segmentId = byNormalizedId.filter(
    (l) => containsAsSegment(normalizedFilename, l.normId) || containsAsSegment(l.normId, normalizedFilename),
  );
  if (segmentId.length === 1) return { kind: "matched", lesson: segmentId[0].lesson, reason: "segment-id" };
  if (segmentId.length > 1) return { kind: "ambiguous", lessons: segmentId.map((l) => l.lesson), reason: "segment-id" };

  const segmentTitle = byNormalizedId.filter(
    (l) => containsAsSegment(normalizedFilename, l.normTitle) || containsAsSegment(l.normTitle, normalizedFilename),
  );
  if (segmentTitle.length === 1) return { kind: "matched", lesson: segmentTitle[0].lesson, reason: "segment-title" };
  if (segmentTitle.length > 1) {
    return { kind: "ambiguous", lessons: segmentTitle.map((l) => l.lesson), reason: "segment-title" };
  }

  return { kind: "none" };
}
