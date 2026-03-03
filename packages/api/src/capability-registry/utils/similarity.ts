/**
 * String Similarity Utility
 *
 * Provides string similarity scoring for capability matching.
 * Uses a combination of token overlap and Levenshtein distance.
 */

/**
 * Calculate similarity between two strings (0-1 score).
 *
 * Uses a weighted combination of:
 * 1. Token-level Jaccard similarity (for multi-word matching)
 * 2. Normalized Levenshtein similarity (for typo tolerance)
 * 3. Substring match bonus
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  // Exact substring match bonus
  const substringScore = substringMatchScore(s1, s2);

  // Token-level Jaccard similarity
  const tokenScore = tokenJaccardSimilarity(s1, s2);

  // Character-level Levenshtein similarity
  const levenshteinScore = normalizedLevenshtein(s1, s2);

  // Weighted combination
  const score = substringScore * 0.4 + tokenScore * 0.35 + levenshteinScore * 0.25;

  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Tokenize a string into words (lowercase, no punctuation)
 */
export function tokenize(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Token-level Jaccard similarity
 */
function tokenJaccardSimilarity(s1: string, s2: string): number {
  const tokens1 = new Set(tokenize(s1));
  const tokens2 = new Set(tokenize(s2));

  if (tokens1.size === 0 && tokens2.size === 0) return 1;
  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersection++;
    }
  }

  const union = tokens1.size + tokens2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Substring match scoring.
 * Returns a higher score if one string contains the other.
 */
function substringMatchScore(s1: string, s2: string): number {
  if (s1.includes(s2)) {
    return s2.length / s1.length;
  }
  if (s2.includes(s1)) {
    return s1.length / s2.length;
  }

  // Check token-level containment
  const tokens1 = tokenize(s1);
  const tokens2 = tokenize(s2);

  let contained = 0;
  for (const t2 of tokens2) {
    for (const t1 of tokens1) {
      if (t1.includes(t2) || t2.includes(t1)) {
        contained++;
        break;
      }
    }
  }

  return tokens2.length > 0 ? contained / Math.max(tokens1.length, tokens2.length) : 0;
}

/**
 * Compute Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use single-row optimization
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) {
    row[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;

    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const current = Math.min(
        row[j] + 1,         // deletion
        row[j - 1] + 1,     // insertion
        prev + cost          // substitution
      );
      prev = row[j];
      row[j] = current;
    }
  }

  return row[n];
}

/**
 * Normalized Levenshtein similarity (0-1).
 * 1 = identical, 0 = completely different.
 */
function normalizedLevenshtein(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / maxLen;
}

/**
 * Score a capability against a search query.
 * This is the main scoring function used by CapabilitySearcher.
 *
 * @returns confidence score between 0 and 1
 */
export function scoreCapabilityMatch(
  capabilityName: string,
  capabilityDescription: string,
  tags: string[],
  query: string
): number {
  // Name match (highest weight)
  const nameScore = calculateSimilarity(capabilityName, query);

  // Description match
  const descScore = calculateSimilarity(capabilityDescription, query);

  // Tag match - check if query matches any tag
  let tagScore = 0;
  if (tags.length > 0) {
    const tagScores = tags.map((tag) => calculateSimilarity(tag, query));
    tagScore = Math.max(...tagScores);
  }

  // Weighted combination: name > description > tags
  return nameScore * 0.5 + descScore * 0.35 + tagScore * 0.15;
}
