/**
 * Text Similarity Scoring Factor
 *
 * Weight: 0.20
 *
 * Compares text content between original and candidate elements.
 * Uses multiple similarity algorithms:
 * - Exact match
 * - Normalized comparison (lowercase, trimmed)
 * - Levenshtein distance
 * - Semantic similarity (contains, starts with)
 */

import type { ScoringFactor, CandidateElement, ElementContext } from "../types";
import { FACTOR_WEIGHTS, TEXT_SIMILARITY_CONFIG } from "../config";

/**
 * Calculate Levenshtein distance between two strings
 *
 * Uses space-optimized approach with two rows instead of full matrix.
 * Time: O(m*n), Space: O(min(m,n))
 */
function levenshteinDistance(str1: string, str2: string): number {
  // Ensure str1 is the shorter string for space optimization
  if (str1.length > str2.length) {
    [str1, str2] = [str2, str1];
  }

  const m = str1.length;
  const n = str2.length;

  // Edge cases
  if (m === 0) return n;
  if (n === 0) return m;

  // Use two rows instead of full matrix (space optimization)
  let prevRow = new Array<number>(m + 1);
  let currRow = new Array<number>(m + 1);

  // Initialize first row
  for (let i = 0; i <= m; i++) {
    prevRow[i] = i;
  }

  // Fill row by row
  for (let j = 1; j <= n; j++) {
    currRow[0] = j;

    for (let i = 1; i <= m; i++) {
      if (str1[i - 1] === str2[j - 1]) {
        currRow[i] = prevRow[i - 1]!;
      } else {
        currRow[i] = Math.min(
          prevRow[i]! + 1, // deletion
          currRow[i - 1]! + 1, // insertion
          prevRow[i - 1]! + 1, // substitution
        );
      }
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[m]!;
}

/**
 * Calculate Levenshtein similarity as a ratio (0-1)
 */
function levenshteinSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1; // Both empty = identical

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string | null): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/[^\w\s]/g, ""); // Remove punctuation
}

/**
 * Calculate semantic similarity (partial matches)
 */
function semanticSimilarity(original: string, candidate: string): number {
  if (!original || !candidate) return 0;

  // Exact match after normalization
  if (original === candidate) return 1;

  // One contains the other
  if (original.includes(candidate)) {
    return 0.8 * (candidate.length / original.length);
  }
  if (candidate.includes(original)) {
    return 0.8 * (original.length / candidate.length);
  }

  // Starts with same text
  const minLen = Math.min(original.length, candidate.length);
  let commonPrefix = 0;
  for (let i = 0; i < minLen; i++) {
    if (original[i] === candidate[i]) {
      commonPrefix++;
    } else {
      break;
    }
  }

  if (commonPrefix > 3) {
    return 0.6 * (commonPrefix / Math.max(original.length, candidate.length));
  }

  // Check for word overlap
  const originalWords = new Set(
    original.split(" ").filter((w) => w.length > 2),
  );
  const candidateWords = new Set(
    candidate.split(" ").filter((w) => w.length > 2),
  );

  if (originalWords.size === 0 || candidateWords.size === 0) return 0;

  let matchingWords = 0;
  originalWords.forEach((word) => {
    if (candidateWords.has(word)) matchingWords++;
  });

  return (
    0.7 * (matchingWords / Math.max(originalWords.size, candidateWords.size))
  );
}

/**
 * Text Similarity Factor
 */
export const textSimilarityFactor: ScoringFactor = {
  name: "textSimilarity",
  weight: FACTOR_WEIGHTS.textSimilarity,

  score(candidate: CandidateElement, original: ElementContext): number {
    const originalText = normalizeText(original.text);
    const candidateText = normalizeText(candidate.metadata.text);

    // No text to compare - return neutral score
    if (
      originalText.length < TEXT_SIMILARITY_CONFIG.minTextLength &&
      candidateText.length < TEXT_SIMILARITY_CONFIG.minTextLength
    ) {
      return 0.5;
    }

    // Only one has text - penalty
    if (originalText.length < TEXT_SIMILARITY_CONFIG.minTextLength) {
      return candidateText.length > 0 ? 0.3 : 0.5;
    }
    if (candidateText.length < TEXT_SIMILARITY_CONFIG.minTextLength) {
      return originalText.length > 0 ? 0.3 : 0.5;
    }

    // Exact match (with normalization)
    if (originalText === candidateText) {
      return 1.0;
    }

    // Calculate different similarity metrics
    const levenshtein = levenshteinSimilarity(originalText, candidateText);
    const semantic = semanticSimilarity(originalText, candidateText);

    // Take the best of the two approaches
    const bestScore = Math.max(levenshtein, semantic);

    // Apply exact match bonus if score is very high
    if (bestScore >= TEXT_SIMILARITY_CONFIG.similarityThreshold) {
      return Math.min(
        bestScore + TEXT_SIMILARITY_CONFIG.exactMatchBonus * 0.5,
        1.0,
      );
    }

    return bestScore;
  },

  // Text similarity doesn't veto - text can change legitimately
  // (e.g., "Submit" -> "Submit Order" is still the same button)

  getDetails(candidate: CandidateElement, original: ElementContext): string {
    const originalText = normalizeText(original.text);
    const candidateText = normalizeText(candidate.metadata.text);

    if (!originalText && !candidateText) {
      return "No text content";
    }

    const levenshtein = levenshteinSimilarity(originalText, candidateText);
    const semantic = semanticSimilarity(originalText, candidateText);

    return `"${original.text?.substring(0, 30) || "(empty)"}" vs "${candidate.metadata.text?.substring(0, 30) || "(empty)"}" - Levenshtein: ${levenshtein.toFixed(2)}, Semantic: ${semantic.toFixed(2)}`;
  },
};
