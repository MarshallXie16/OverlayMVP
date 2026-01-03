/**
 * Auto-Healing Scorer
 *
 * Orchestrates scoring of candidate elements against the original element
 * using all scoring factors. Handles veto logic and score combination.
 */

import type {
  ScoringFactor,
  CandidateElement,
  ElementContext,
  ScoringResult,
  FactorScore,
  VetoResult,
} from "./types";
import { ALL_FACTORS } from "./factors";
import { LOGGING_CONFIG } from "./config";

/**
 * Score a single candidate against the original element
 */
export function scoreCandidate(
  candidate: CandidateElement,
  original: ElementContext,
  factors: ScoringFactor[] = ALL_FACTORS,
): ScoringResult {
  const factorScores: FactorScore[] = [];
  const vetoes: VetoResult[] = [];
  let isHardVetoed = false;
  let softVetoCount = 0;

  // Evaluate each factor
  for (const factor of factors) {
    // Check for veto first
    if (factor.canVeto) {
      const vetoResult = factor.canVeto(candidate, original);
      if (vetoResult) {
        vetoes.push(vetoResult);
        if (vetoResult.severity === "hard") {
          isHardVetoed = true;
        } else {
          softVetoCount++;
        }
      }
    }

    // Calculate score
    const score = factor.score(candidate, original);
    const weightedScore = score * factor.weight;

    factorScores.push({
      factorName: factor.name,
      score,
      weight: factor.weight,
      weightedScore,
      details: factor.getDetails?.(candidate, original),
    });
  }

  // Calculate total score
  let totalScore = 0;
  if (!isHardVetoed) {
    totalScore = factorScores.reduce((sum, fs) => sum + fs.weightedScore, 0);

    // Apply soft veto penalty (reduce score by 10% per soft veto)
    if (softVetoCount > 0) {
      const penalty = Math.min(softVetoCount * 0.1, 0.3); // Max 30% penalty
      totalScore = totalScore * (1 - penalty);
    }
  }

  return {
    candidate,
    totalScore,
    factorScores,
    vetoes,
    isVetoed: isHardVetoed,
    softVetoCount,
  };
}

/**
 * Score all candidates and return sorted results
 */
export function scoreCandidates(
  candidates: CandidateElement[],
  original: ElementContext,
  factors: ScoringFactor[] = ALL_FACTORS,
): ScoringResult[] {
  const results = candidates.map((candidate) =>
    scoreCandidate(candidate, original, factors),
  );

  // Sort by score descending, vetoed candidates last
  results.sort((a, b) => {
    // Hard vetoed candidates go to the end
    if (a.isVetoed && !b.isVetoed) return 1;
    if (!a.isVetoed && b.isVetoed) return -1;

    // Sort by score
    return b.totalScore - a.totalScore;
  });

  // Log results if configured
  if (LOGGING_CONFIG.consoleLog && results.length > 0) {
    logScoringResults(results, original);
  }

  return results;
}

/**
 * Get the best non-vetoed candidate
 */
export function getBestCandidate(
  results: ScoringResult[],
): ScoringResult | null {
  const nonVetoed = results.filter((r) => !r.isVetoed);
  const first = nonVetoed[0];
  return first ?? null;
}

/**
 * Check if there's a clear winner (significant gap between top 2)
 */
export function hasClearWinner(results: ScoringResult[]): boolean {
  const nonVetoed = results.filter((r) => !r.isVetoed);
  if (nonVetoed.length < 2) return nonVetoed.length === 1;

  const first = nonVetoed[0];
  const second = nonVetoed[1];
  if (!first || !second) return false;

  const scoreDiff = first.totalScore - second.totalScore;
  return scoreDiff >= 0.1; // 10% gap
}

/**
 * Log scoring results for debugging
 */
function logScoringResults(
  results: ScoringResult[],
  original: ElementContext,
): void {
  console.group("[Healing] Scoring Results");
  console.log(
    `Original: ${original.tagName} "${original.text?.substring(0, 30) || "(no text)"}"`,
  );
  console.log(`Candidates evaluated: ${results.length}`);

  const nonVetoed = results.filter((r) => !r.isVetoed);
  console.log(`Non-vetoed candidates: ${nonVetoed.length}`);

  // Log top 3 candidates
  const top3 = results.slice(0, 3);
  top3.forEach((result, idx) => {
    const el = result.candidate.element;
    const text =
      result.candidate.metadata.text?.substring(0, 30) || "(no text)";

    console.group(
      `#${idx + 1}: ${result.totalScore.toFixed(3)} - <${el.tagName.toLowerCase()}> "${text}"`,
    );

    if (result.isVetoed) {
      console.warn("⛔ VETOED");
    } else if (result.softVetoCount > 0) {
      console.warn(`⚠️ ${result.softVetoCount} soft veto(s)`);
    }

    if (result.vetoes.length > 0) {
      console.log(
        "Vetoes:",
        result.vetoes.map((v) => `${v.factorName}: ${v.reason}`),
      );
    }

    if (LOGGING_CONFIG.includeFactorDetails) {
      console.table(
        result.factorScores.map((fs) => ({
          Factor: fs.factorName,
          Score: fs.score.toFixed(3),
          Weight: fs.weight,
          Weighted: fs.weightedScore.toFixed(3),
          Details: fs.details,
        })),
      );
    }

    console.groupEnd();
  });

  console.groupEnd();
}
