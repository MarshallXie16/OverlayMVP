# Auto-Healing Architecture

## Overview

The auto-healing system automatically recovers from broken workflow steps when elements move, change, or become temporarily inaccessible on a web page. Instead of immediately failing when an element isn't found by its original selector, the system intelligently searches for candidate elements, scores them based on multiple factors, and makes decisions about which element (if any) is the correct match.

**Why it matters**: Web UIs change frequently. Without auto-healing, every minor DOM change breaks workflows. With auto-healing, workflows remain resilient through layout changes, text updates, and structural modifications, dramatically reducing maintenance burden.

The system uses a three-tier approach:
1. **Deterministic scoring** (always runs) - Fast, rule-based matching using 5 weighted factors
2. **AI validation** (70-85% confidence range) - Claude Haiku validates uncertain matches
3. **User confirmation** (60-70% confidence range) - Human judgment for ambiguous cases

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         WALKTHROUGH PLAYBACK                              │
│                 (User clicks "Play" on a workflow)                        │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   Find Element by      │
                    │   Original Selector    │
                    └────────────┬───────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Found?                 │
                    └──┬──────────────────┬───┘
                  YES  │                  │ NO
                       │                  │
                       ▼                  ▼
              ┌────────────────┐   ┌──────────────────────────┐
              │  Use Element   │   │  AUTO-HEALING STARTS     │
              │  (success)     │   │  healElement()           │
              └────────────────┘   └──────────┬───────────────┘
                                              │
                                              ▼
                                   ┌───────────────────────┐
                                   │  Candidate Discovery  │
                                   │  - By tag name        │
                                   │  - By role            │
                                   │  - Interactive els    │
                                   │  - Within 500px       │
                                   │  - Max 30 candidates  │
                                   └──────────┬────────────┘
                                              │
                                              ▼
                                   ┌───────────────────────┐
                                   │  Score All Candidates │
                                   │  (Parallel)           │
                                   └──────────┬────────────┘
                                              │
                  ┌───────────────────────────┼───────────────────────────┐
                  │                           │                           │
                  ▼                           ▼                           ▼
         ┌────────────────┐       ┌────────────────────┐      ┌─────────────────┐
         │ Context (35%)  │       │ Text Sim (20%)     │      │ Role (15%)      │
         │ + Form match   │       │ + Exact match      │      │ + Tag match     │
         │ + Region match │       │ + Fuzzy match      │      │ + ARIA role     │
         │ + Landmarks    │       │ + Levenshtein      │      │                 │
         │ CAN HARD VETO  │       │                    │      │ CAN HARD VETO   │
         └────────┬───────┘       └─────────┬──────────┘      └────────┬────────┘
                  │                         │                          │
                  │              ┌──────────▼───────────┐              │
                  │              │ Attribute (15%)      │              │
                  │              │ + ID, name, classes  │              │
                  │              │ + data-* attributes  │              │
                  │              └──────────┬───────────┘              │
                  │                         │                          │
                  │              ┌──────────▼───────────┐              │
                  │              │ Position (15%)       │              │
                  │              │ + Distance from orig │              │
                  │              │ + Size similarity    │              │
                  │              │ CAN SOFT VETO        │              │
                  │              └──────────┬───────────┘              │
                  │                         │                          │
                  └─────────────────────────┼──────────────────────────┘
                                            │
                                            ▼
                                 ┌─────────────────────┐
                                 │  Combine Scores     │
                                 │  totalScore =       │
                                 │    Σ(score × weight)│
                                 │  Apply veto penalty │
                                 └──────────┬──────────┘
                                            │
                                            ▼
                                 ┌─────────────────────┐
                                 │  Check Thresholds   │
                                 └──────────┬──────────┘
                                            │
           ┌────────────────────────────────┼────────────────────────────────┐
           │                                │                                │
           ▼                                ▼                                ▼
   ┌───────────────┐             ┌──────────────────┐            ┌─────────────────┐
   │ >= 0.85       │             │ 0.70 - 0.85      │            │ 0.60 - 0.70     │
   │ AUTO-ACCEPT   │             │ AI VALIDATION    │            │ USER PROMPT     │
   └───────┬───────┘             └────────┬─────────┘            └────────┬────────┘
           │                              │                               │
           │                              ▼                               │
           │                   ┌──────────────────────┐                  │
           │                   │  Call Backend API    │                  │
           │                   │  /api/healing/       │                  │
           │                   │    validate          │                  │
           │                   └──────────┬───────────┘                  │
           │                              │                              │
           │                              ▼                              │
           │                   ┌──────────────────────┐                  │
           │                   │  Claude Haiku 4.5    │                  │
           │                   │  - Validates purpose │                  │
           │                   │  - Checks context    │                  │
           │                   │  - Returns 0-100%    │                  │
           │                   └──────────┬───────────┘                  │
           │                              │                              │
           │                              ▼                              │
           │                   ┌──────────────────────┐                  │
           │                   │  Combine Scores      │                  │
           │                   │  final = det×0.6 +   │                  │
           │                   │          ai×0.4      │                  │
           │                   └──────────┬───────────┘                  │
           │                              │                              │
           │                   ┌──────────▼───────────┐                  │
           │                   │  AI >= 0.85?         │                  │
           │                   └──┬────────────────┬──┘                  │
           │                 YES  │                │ NO                  │
           │                      │                │                     │
           └──────────────────────┘                └─────────────────────┘
                                                                          │
                                                                          ▼
                                                             ┌─────────────────────┐
                                                             │  Show Overlay       │
                                                             │  "Is this right?"   │
                                                             │  [Yes] [No]         │
                                                             └──────────┬──────────┘
                                                                        │
                                                         ┌──────────────┼──────────────┐
                                                         │                             │
                                                         ▼                             ▼
                                                    ┌─────────┐                  ┌──────────┐
                                                    │ User    │                  │ User     │
                                                    │ Accepts │                  │ Rejects  │
                                                    └────┬────┘                  └─────┬────┘
                                                         │                             │
           ┌─────────────────────────────────────────────┼─────────────────────────────┘
           │                                             │
           ▼                                             ▼
    ┌────────────────┐                          ┌────────────────┐
    │  USE ELEMENT   │                          │  MARK BROKEN   │
    │  Continue      │                          │  Log failure   │
    │  workflow      │                          │  Alert admin   │
    └───────┬────────┘                          └───────┬────────┘
            │                                           │
            ▼                                           ▼
    ┌────────────────┐                          ┌────────────────┐
    │  Log to        │                          │  Increment     │
    │  Backend       │                          │  consecutive   │
    │  /api/health   │                          │  failures      │
    │  - confidence  │                          │  >= 3? BROKEN  │
    │  - scores      │                          └────────────────┘
    │  - resolution  │
    └────────────────┘
```

## Scoring System

### Factor Weights

All factor weights sum to 1.0. These weights control how much each factor contributes to the final score:

| Factor | Weight | What It Measures | Can Veto? |
|--------|--------|------------------|-----------|
| **Contextual Proximity** | **0.35** | Is element in same form/region/near same landmarks? | Yes (hard) |
| Text Similarity | 0.20 | Does text content match (exact or fuzzy)? | No |
| Role Match | 0.15 | Same element type (button vs link vs input)? | Yes (hard) |
| Attribute Match | 0.15 | Same id, name, classes, data-* attributes? | No |
| Position Similarity | 0.15 | How far did element move from original position? | Yes (soft) |

**Why contextualProximity has the highest weight**: Context is the most reliable way to prevent false positives. An element in a different form or region is almost certainly the wrong element, even if the text or attributes match.

### Score Combination Formula

```javascript
// For each candidate:
factorScores = factors.map(factor => {
  score = factor.score(candidate, original)  // 0-1
  weighted = score × factor.weight
  return weighted
})

totalScore = sum(factorScores)  // 0-1

// Apply soft veto penalty (if any soft vetoes)
if (softVetoCount > 0) {
  penalty = min(softVetoCount × 0.1, 0.3)  // Max 30% penalty
  totalScore = totalScore × (1 - penalty)
}

// Hard vetoes set totalScore to 0 (candidate rejected)
```

### Veto System

Vetoes are checks that can override the scoring system:

**Hard Vetoes** (block the match entirely, score = 0):
- **Form context mismatch**: Original was in form "checkout", candidate is in form "newsletter"
- **Modal context mismatch**: Original was in a modal dialog, candidate is on main page
- **Role incompatibility**: Original was a button, candidate is a link (semantic difference)

**Soft Vetoes** (reduce confidence by 10% per veto, max 30%):
- **Position far away**: Element moved >300px from original position (suspicious but possible)
- **Different visual region**: Original in header, candidate in footer (concerning but not fatal)

**Why vetoes exist**: Sometimes high text or attribute similarity can create false positives. For example, "Submit" buttons exist in multiple forms on a page. Veto logic prevents matching a "Submit" button in a newsletter signup when we need the "Submit" button in a checkout form.

### Contextual Proximity Factor (Most Critical)

This factor has three sub-components:

```javascript
// Internal breakdown (within the 0.35 weight):
formScore = checkFormMatch()           // 50% of this factor
regionScore = checkVisualRegion()      // 20% of this factor
landmarkScore = checkNearbyLandmarks() // 30% of this factor

contextScore = (formScore × 0.5) + (regionScore × 0.2) + (landmarkScore × 0.3)
```

**Form matching** checks:
1. Form ID (most reliable)
2. Form name attribute
3. Form action URL
4. Form classes (weaker signal)
5. Relative position in form (e.g., 3rd field of 5)

**Visual region matching** checks:
- Is element in same region? (header/main/footer/sidebar/modal/unknown)
- Special case: Modal elements MUST stay in modal (hard veto if not)

**Landmark matching** checks:
- Same closest heading? (e.g., both near "Billing Information")
- Same closest label? (e.g., both near "Email Address")
- Same container text?
- Overlapping sibling texts?

## Decision Thresholds

The final score determines what action to take:

| Score Range | Action | Rationale |
|-------------|--------|-----------|
| **>= 0.85** | **Auto-accept** | Very high confidence - use element silently, user doesn't know healing happened |
| **0.70 - 0.85** | **AI validation** | Medium-high confidence - call Claude Haiku for second opinion |
| **0.60 - 0.70** | **User prompt** | Medium confidence - ask user to confirm with UI overlay |
| **< 0.60** | **Reject** | Low confidence - mark step as broken, don't risk wrong element |

**When AI is unavailable**, stricter thresholds are used:
- Auto-accept threshold raises to 0.90 (from 0.85)
- AI validation tier is skipped
- User prompt threshold stays at 0.60
- Reject threshold stays at 0.60

## AI Validation Flow

### When AI is Called

AI validation happens when:
- Deterministic score is in range [0.70, 0.85)
- AI is enabled (`AI_CONFIG.enabled = true`)
- Backend has `ANTHROPIC_API_KEY` configured

### Request to Backend

```typescript
POST /api/healing/validate
Authorization: Bearer <jwt-token>

{
  step_id: 123,
  workflow_id: 45,
  deterministic_score: 0.78,
  original_context: {
    tag_name: "button",
    text: "Submit Order",
    form_context: { form_id: "checkout-form" },
    visual_region: "main",
    // ... more metadata
  },
  candidate_context: {
    tag_name: "button",
    text: "Place Order",
    form_context: { form_id: "checkout-form" },
    visual_region: "main",
    // ... more metadata
  },
  factor_scores: {
    contextualProximity: 0.85,
    textSimilarity: 0.70,
    roleMatch: 1.0,
    attributeMatch: 0.60,
    positionSimilarity: 0.80
  },
  field_label: "Submit button",
  original_url: "https://app.example.com/checkout",
  page_url: "https://app.example.com/checkout",
  original_screenshot: "/screenshots/...",  // optional
  current_screenshot: "/screenshots/..."    // optional
}
```

### AI Analysis

Claude Haiku 4.5 analyzes:

**Key Questions**:
1. Do both elements serve the same **functional purpose**?
2. Are they in the same **context** (same form, same section)?
3. Would clicking/interacting accomplish the same **goal**?

**Important considerations**:
- Small text changes are OK ("Submit" → "Submit Order")
- Different forms/sections are NOT OK (checkout vs newsletter)
- Purpose matters more than exact text match

**Tool Response Format**:
```json
{
  "is_match": true,
  "confidence": 85,
  "reasoning": "Both buttons serve the same purpose (submit checkout form). Text variation ('Submit Order' vs 'Place Order') is acceptable. Same form context confirms match."
}
```

### Score Combination

```javascript
aiConfidence = response.confidence / 100  // Convert 0-100 to 0-1

// Weighted combination (60% deterministic, 40% AI)
combinedScore = (deterministicScore × 0.6) + (aiConfidence × 0.4)

// AI veto logic
if (response.is_match === false && aiConfidence > 0.7) {
  // AI strongly says NO - cap combined score at 0.50
  combinedScore = min(combinedScore, 0.50)
}
else if (response.is_match === true && aiConfidence < 0.5) {
  // AI weakly says YES - cap at 0.70 (force user prompt)
  combinedScore = min(combinedScore, 0.70)
}
```

### Final Decision

```javascript
if (combinedScore >= 0.85) {
  return "accept"  // Auto-accept
}
else if (combinedScore >= 0.50) {
  return "prompt_user"  // Ask user
}
else {
  return "reject"  // Too uncertain
}
```

## False Positive Prevention

The system has multiple layers to prevent matching the wrong element:

### 1. Form Context Veto (Most Critical)

```typescript
// Hard veto if form mismatch
if (original.formContext?.formId) {
  if (candidate.formContext?.formId !== original.formContext.formId) {
    return HARD_VETO  // Score = 0, candidate rejected
  }
}
```

**Why this matters**: Forms are the primary source of false positives. Consider a page with:
- Login form (email + password + "Submit")
- Newsletter signup (email + "Submit")

Without form context veto, we might match the newsletter "Submit" when we need the login "Submit". Form ID veto prevents this.

### 2. Visual Region Matching

```typescript
// Hard veto for modal context
if (original.visualRegion === "modal" &&
    candidate.visualRegion !== "modal") {
  return HARD_VETO
}

// Soft veto for other region mismatches
if (original.visualRegion !== candidate.visualRegion &&
    both are not "unknown") {
  return SOFT_VETO  // Reduce score by 10%
}
```

**Why this matters**: An element that moved from modal to main page, or from header to footer, is almost certainly not the same element.

### 3. Role Incompatibility

```typescript
// Hard veto for incompatible roles
const incompatiblePairs = [
  ["button", "link"],      // Semantic difference
  ["textbox", "checkbox"], // Input type difference
  ["listbox", "menu"]      // Different interaction patterns
]

if (pairIsIncompatible(original.role, candidate.role)) {
  return HARD_VETO
}
```

**Why this matters**: A button and a link might have the same text, but they serve different purposes. Matching them would break the workflow.

### 4. Landmark Proximity

```typescript
// Check if near same headings/labels
if (original.nearbyLandmarks.closestHeading?.text !==
    candidate.nearbyLandmarks.closestHeading?.text) {
  // Reduce context score
  landmarkScore -= 0.3
}
```

**Why this matters**: If the original was near heading "Billing Information" but the candidate is near "Shipping Information", they're likely in different sections serving different purposes.

### 5. AI Semantic Understanding

When deterministic scoring is uncertain (0.70-0.85), AI provides semantic validation:

```
Human thinking: "Both buttons say 'Submit' and are in forms, but one is for
checkout and one is for newsletter signup. The checkout button is what we need."

AI thinking: "Original context shows checkout form with order total. Candidate
context shows newsletter form with email only. Different purposes → NOT a match."
```

AI can catch subtle semantic differences that rule-based scoring might miss.

## Health Logging

### What Events Are Logged

Every healing attempt creates a `HealthLog` entry:

```typescript
interface HealthLog {
  workflow_id: number
  step_id: number
  user_id: number

  // Outcome
  status: 'success' | 'healed_deterministic' | 'healed_ai' |
          'user_confirmed' | 'user_rejected' | 'failed'

  // Scores
  deterministic_score: number      // 0-1
  ai_confidence: number | null     // 0-1 (null if AI not used)
  healing_confidence: number       // Final combined score

  // Context
  candidates_evaluated: number
  page_url: string
  page_state_hash: string | null   // For detecting page changes

  // Error details (if failed)
  error_type: string | null
  error_message: string | null

  // Performance
  execution_time_ms: number

  // Timestamps
  created_at: timestamp
}
```

### Workflow Health Metrics

Each workflow tracks aggregate health metrics:

```typescript
interface Workflow {
  // Usage stats
  total_uses: number

  // Health metrics
  success_rate: number             // Exponential moving average (0-1)
  consecutive_failures: number     // Resets on success

  // Timestamps
  last_successful_run: timestamp | null
  last_failed_run: timestamp | null

  // Status
  status: 'active' | 'broken' | 'needs_review' | ...
}
```

**Success rate calculation** (Exponential Moving Average):
```javascript
// On each execution:
const EMA_ALPHA = 0.1  // 10% weight on new data, 90% on history

if (execution_succeeded) {
  workflow.success_rate = (0.9 × workflow.success_rate) + (0.1 × 1.0)
} else {
  workflow.success_rate = (0.9 × workflow.success_rate) + (0.1 × 0.0)
}
```

This approach gives more weight to historical performance, avoiding dramatic swings from single failures.

## Admin Notifications

### Notification Triggers

| Trigger | Condition | Severity | Action |
|---------|-----------|----------|--------|
| **Workflow Broken** | `consecutive_failures >= 3` | Error | Mark workflow as broken, alert admin |
| **Low Confidence Healing** | `healing_confidence < 0.65` | Warning | Review recommended, log for analysis |
| **Success Rate Degradation** | `success_rate < 0.60` and `total_uses >= 5` | Warning | Workflow needs attention |

### Notification Format

```typescript
interface Notification {
  company_id: number
  workflow_id: number

  type: 'workflow_broken' | 'low_confidence' | 'high_failure_rate'
  severity: 'error' | 'warning' | 'info'

  title: string
  message: string
  action_url: string  // Link to workflow detail page

  read: boolean
  created_at: timestamp
}
```

**Example notifications**:

```
[ERROR] Workflow 'Customer Onboarding' is broken
This workflow has failed 3 times consecutively.
Last error: Element not found - #submit-button
→ View workflow

[WARNING] Low confidence healing in 'Invoice Generation'
Auto-healing at step 5 completed with 62% confidence.
Review recommended to ensure correct element selection.
→ View workflow

[WARNING] High failure rate in 'Monthly Report'
Success rate has dropped to 58% (below 60% threshold).
Total uses: 12.
→ View workflow
```

## Configuration

### Adjusting Thresholds

All thresholds are in `extension/src/content/healing/config.ts`:

```typescript
// Decision thresholds
export const DEFAULT_THRESHOLDS = {
  autoAccept: 0.85,     // Increase for more conservative auto-healing
  aiValidation: 0.70,   // Widen range for more AI usage
  userPrompt: 0.60,     // Lower for fewer prompts (more rejections)
  reject: 0.50,         // Floor - anything below is rejected
}

// When AI unavailable
export const FALLBACK_THRESHOLDS = {
  autoAccept: 0.90,     // More conservative without AI safety net
  aiValidation: 0.90,   // Effectively disabled
  userPrompt: 0.60,
  reject: 0.50,
}
```

**Tuning guidance**:
- **More false negatives** (rejecting good matches): Raise `autoAccept` threshold
- **More AI calls** (higher cost): Lower `aiValidation` threshold or widen the range
- **Fewer user prompts**: Raise `userPrompt` threshold (but more rejections)
- **More aggressive healing**: Lower all thresholds (risk false positives)

### Adjusting Factor Weights

Weights are in `extension/src/content/healing/config.ts`:

```typescript
export const FACTOR_WEIGHTS = {
  contextualProximity: 0.35,  // HIGHEST - context is king
  textSimilarity: 0.20,
  roleMatch: 0.15,
  attributeMatch: 0.15,
  positionSimilarity: 0.15,
}
// MUST sum to 1.0 (validated on load)
```

**Tuning guidance**:
- **More form-aware**: Increase `contextualProximity` weight
- **More text-sensitive**: Increase `textSimilarity` weight
- **More attribute-focused**: Increase `attributeMatch` weight
- **More position-tolerant**: Decrease `positionSimilarity` weight

**Changing weights**:
```typescript
// Example: Make text matching more important
export const FACTOR_WEIGHTS = {
  contextualProximity: 0.30,  // Reduced from 0.35
  textSimilarity: 0.30,       // Increased from 0.20
  roleMatch: 0.15,
  attributeMatch: 0.15,
  positionSimilarity: 0.10,   // Reduced from 0.15
}
// Total = 1.0 ✓
```

### Adding New Scoring Factors

To add a new factor:

1. **Create the factor file** in `extension/src/content/healing/factors/`:

```typescript
// newFactor.ts
import type { ScoringFactor, CandidateElement, ElementContext } from "../types"

export const newFactor: ScoringFactor = {
  name: "newFactor",
  weight: 0.0,  // Will be set in config

  score(candidate: CandidateElement, original: ElementContext): number {
    // Return 0-1 score
    // 1.0 = perfect match
    // 0.0 = no match

    // Example: Check placeholder text
    const originalPlaceholder = original.placeholder
    const candidatePlaceholder = candidate.metadata.placeholder

    if (originalPlaceholder === candidatePlaceholder) {
      return 1.0
    }
    return 0.0
  },

  // Optional: Can this factor veto?
  canVeto(candidate: CandidateElement, original: ElementContext) {
    // Return VetoResult or null
    return null
  },

  // Optional: Debugging details
  getDetails(candidate: CandidateElement, original: ElementContext): string {
    return `Placeholder: ${candidate.metadata.placeholder}`
  }
}
```

2. **Export from index**:

```typescript
// factors/index.ts
export { newFactor } from "./newFactor"

export const ALL_FACTORS: ScoringFactor[] = [
  contextualProximityFactor,
  textSimilarityFactor,
  roleMatchFactor,
  attributeMatchFactor,
  positionSimilarityFactor,
  newFactor,  // Add here
]
```

3. **Update weights** (must sum to 1.0):

```typescript
// config.ts
export const FACTOR_WEIGHTS = {
  contextualProximity: 0.30,  // Reduced
  textSimilarity: 0.20,
  roleMatch: 0.15,
  attributeMatch: 0.15,
  positionSimilarity: 0.10,   // Reduced
  newFactor: 0.10,            // New weight
}
```

### AI Configuration

```typescript
export const AI_CONFIG = {
  enabled: true,         // Toggle AI validation on/off
  weight: 0.4,          // 40% weight in combined score
  timeout: 10000,       // 10 second timeout for API call
  vetoThreshold: 0.5,   // AI confidence below this caps score
}
```

**Cost optimization**:
- Set `enabled: false` to disable AI entirely (use stricter deterministic thresholds)
- Narrow the AI validation range (raise `aiValidation` threshold)
- Current cost: ~$0.0001 per validation call (Haiku pricing)

## Troubleshooting

### Common Issues

**Issue**: Too many false positives (wrong elements accepted)

**Diagnosis**:
```bash
# Check healing logs for low-confidence auto-accepts
SELECT * FROM health_logs
WHERE status = 'healed_deterministic'
AND deterministic_score < 0.90
ORDER BY deterministic_score ASC
LIMIT 20
```

**Solutions**:
- Raise `autoAccept` threshold (0.85 → 0.90)
- Increase `contextualProximity` weight (0.35 → 0.40)
- Add more hard veto conditions in `contextualProximity.ts`
- Enable AI validation if disabled

---

**Issue**: Too many false negatives (good elements rejected)

**Diagnosis**:
```bash
# Check failed healings with high runner-up scores
# (indicates close matches being rejected)
SELECT * FROM health_logs
WHERE status = 'failed'
AND deterministic_score BETWEEN 0.50 AND 0.70
ORDER BY deterministic_score DESC
LIMIT 20
```

**Solutions**:
- Lower `autoAccept` threshold (0.85 → 0.80)
- Widen AI validation range (0.70 → 0.65)
- Reduce veto penalties (soft veto 10% → 5%)
- Decrease `positionSimilarity` weight (elements moved more than expected)

---

**Issue**: AI validation timing out

**Diagnosis**:
```bash
# Check backend logs for timeout errors
grep "healing validation" backend/logs/app.log | grep -i timeout
```

**Solutions**:
- Increase `AI_CONFIG.timeout` (10000 → 15000 ms)
- Check network latency to Anthropic API
- Fall back to deterministic-only mode temporarily
- Consider caching AI responses for identical requests

---

**Issue**: Workflow marked as broken after UI change

**Diagnosis**:
```bash
# Check consecutive failures and healing attempts
SELECT
  w.name,
  w.consecutive_failures,
  h.status,
  h.deterministic_score,
  h.error_message
FROM workflows w
JOIN health_logs h ON h.workflow_id = w.id
WHERE w.status = 'broken'
ORDER BY h.created_at DESC
LIMIT 10
```

**Solutions**:
- Review the failing step's element metadata
- Check if page structure changed significantly
- Manually update step selectors if UI redesign occurred
- Adjust `BROKEN_THRESHOLD` (3 → 5) for more tolerance
- Re-record the workflow if change is permanent

---

**Issue**: High AI costs

**Diagnosis**:
```bash
# Check AI validation frequency
SELECT
  COUNT(*) as ai_validations,
  AVG(ai_confidence) as avg_confidence
FROM health_logs
WHERE ai_confidence IS NOT NULL
AND created_at > NOW() - INTERVAL '7 days'
```

**Solutions**:
- Narrow AI validation range (0.70-0.85 → 0.75-0.85)
- Improve deterministic scoring to reduce uncertainty
- Cache AI responses for similar contexts
- Disable AI for low-value workflows
- Use stricter fallback thresholds

---

**Issue**: User prompts appearing too frequently

**Diagnosis**:
```bash
# Check user prompt frequency
SELECT
  COUNT(*) as prompts,
  SUM(CASE WHEN status = 'user_confirmed' THEN 1 ELSE 0 END) as confirmed,
  SUM(CASE WHEN status = 'user_rejected' THEN 1 ELSE 0 END) as rejected
FROM health_logs
WHERE healing_confidence BETWEEN 0.60 AND 0.70
```

**Solutions**:
- If users mostly confirm: Lower `userPrompt` threshold (0.60 → 0.55)
- If users mostly reject: Raise `userPrompt` threshold (0.60 → 0.65)
- Enable AI validation to reduce uncertain cases
- Improve factor scoring to increase confidence

---

**Issue**: Elements in dynamic content not found

**Diagnosis**:
```javascript
// Check if elements are being excluded
console.log("Candidates found:", candidates.length)
console.log("Visible candidates:", candidates.filter(isElementVisible).length)
```

**Solutions**:
- Increase `maxPositionDistance` (500 → 800 px)
- Adjust `isElementVisible` logic for your app's patterns
- Add delay before candidate discovery (for animations)
- Review `excludeSelectors` - might be too aggressive

---

### Debugging Tools

**Enable verbose logging**:
```typescript
// config.ts
export const LOGGING_CONFIG = {
  consoleLog: true,
  includeFactorDetails: true,  // Show detailed scoring breakdown
  sendToBackend: true,
}
```

**View scoring breakdown in console**:
```
[Healing] Scoring Results
Original: button "Submit Order"
Candidates evaluated: 8
Non-vetoed candidates: 5

#1: 0.847 - <button> "Place Order"
  ⚠️ 1 soft veto(s)
  Vetoes: positionSimilarity: Element moved 350px from original
  Factor               Score   Weight  Weighted  Details
  contextualProximity  0.900   0.35    0.315     Form: Same form by ID
  textSimilarity       0.850   0.20    0.170     Fuzzy match: 85%
  roleMatch            1.000   0.15    0.150     Exact role match
  attributeMatch       0.700   0.15    0.105     2 of 3 classes match
  positionSimilarity   0.600   0.15    0.090     350px away (soft veto)
```

**Check backend health logs**:
```bash
# Recent healing attempts
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/health/logs?workflow_id=45

# Workflow health summary
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/workflows/45/health
```

**Inspect element metadata**:
```javascript
// In browser console during recording/playback
import { extractMetadata } from './utils/metadata'
const element = document.querySelector('#target')
const metadata = extractMetadata(element)
console.log(JSON.stringify(metadata, null, 2))
```

This shows exactly what metadata is being captured and compared during healing.

---

## Summary

The auto-healing system provides resilient workflow playback through:

1. **Multi-factor scoring** that balances context, text, role, attributes, and position
2. **Veto system** that blocks obviously wrong matches (form mismatch, role incompatibility)
3. **AI validation** for uncertain cases, providing semantic understanding
4. **User confirmation** for ambiguous matches, keeping humans in the loop
5. **Health logging** for monitoring, alerting, and continuous improvement

The key to preventing false positives is the **contextualProximity** factor with form context vetoes. The key to handling edge cases is **AI validation**. Together, they create a robust system that heals through UI changes while avoiding dangerous mismatches.
