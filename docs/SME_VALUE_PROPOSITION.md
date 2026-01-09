# SME Value Proposition Analysis

**Created**: 2025-01-07
**Purpose**: Evaluate current product fit for SME customers and identify gaps

---

## Current Value Proposition

**"Record once, guide forever - with AI that adapts when UIs change"**

This resonates because SMEs face:
1. High employee turnover - need to train new hires on same processes repeatedly
2. Complex web-based workflows - data entry, CRM updates, invoice processing
3. Limited IT resources - can't build custom training tools
4. Tool sprawl - using 10+ SaaS apps, each with different UIs

---

## What SMEs Actually Need (vs Enterprise)

### SME Priorities (in order)
1. **Quick time-to-value** - Must work in first 30 minutes
2. **Simple pricing** - Flat rate per month, predictable costs
3. **Self-service** - No implementation consultants needed
4. **Core reliability** - Must "just work" 95%+ of the time
5. **Good enough AI** - Doesn't need to be perfect, just helpful

### Enterprise Priorities (different)
1. SSO/SAML integration
2. Audit logs and compliance
3. Advanced permissions/RBAC
4. Custom branding
5. SLAs and dedicated support
6. Advanced analytics

---

## Current Feature Assessment for SMEs

### What Works Well Today
| Feature | SME Value | Status |
|---------|-----------|--------|
| Recording workflows | Very High | ✅ Works |
| AI-generated labels | High | ✅ Works |
| Walkthrough mode | Very High | ✅ Works |
| Auto-healing | High | ✅ Works (70%+ success) |
| Invite team members | Medium | ✅ Works |
| Workflow library | Medium | ✅ Works |

### What's Missing/Broken for SMEs

#### P0 - Dealbreakers for SMEs
1. **No visibility when things break** - Admin can't see that workflow failed
   - HealthView uses mock data
   - Notification bell doesn't exist
   - *SME Impact*: "Why isn't anyone using this tool?" - they don't know it's broken

2. **Poor upload error handling** - User loses work if network fails
   - *SME Impact*: "I spent 10 minutes recording and it just disappeared"

3. **No confirmation before destructive actions** - Delete step has no confirmation
   - *SME Impact*: Accidental deletions frustrate users

#### P1 - Friction for SMEs
1. **Can't see who's on the team** - TeamView shows fake data
   - *SME Impact*: Owner doesn't know who has access

2. **No profile editing** - Can't change name or password
   - *SME Impact*: "I typo'd my name at signup, now I'm stuck with it"

3. **Browser alerts instead of toasts** - Jarring UX
   - *SME Impact*: Feels "amateur" and "like a project, not a product"

4. **No workflow completion notification**
   - *SME Impact*: User waits at dashboard not knowing if AI finished

---

## Feature Gap Analysis: What SMEs Expect

### Table Stakes (Must-Have Before Paid Launch)
These are features SMEs expect from ANY modern SaaS tool:

| Feature | Current Status | Priority |
|---------|---------------|----------|
| Toast notifications (not alerts) | ❌ Missing | P1 |
| Confirmation dialogs for destructive actions | ❌ Missing | P1 |
| Profile editing (name, password) | ❌ Missing | P1 |
| Team member visibility (real data) | ❌ Mock data | P1 |
| Workflow health visibility | ❌ Mock data | P1 |
| Error recovery (upload retry) | ❌ Missing | P1 |
| Processing complete notification | ❌ Missing | P1 |

### Differentiators (Nice-to-Have)
These would make us stand out but aren't blocking launch:

| Feature | Value | Priority |
|---------|-------|----------|
| Keyboard shortcuts in walkthrough | Medium | P3 |
| Workflow search/filter | Medium | P3 |
| Workflow templates | Medium | P3 |
| Workflow duplication | Medium | P3 |
| Step-by-step onboarding tour | High | P2 |
| In-app help/support widget | Medium | P2 |

---

## UX Gaps That Hurt Perception

### Current Issues
1. **Loading states are inconsistent** - Some pages show skeleton, some show nothing
2. **Empty states are generic** - Don't guide user what to do next
3. **Error messages are technical** - Don't explain how to fix
4. **No onboarding** - New user lands on empty dashboard with no guidance

### Recommendations
1. Consistent loading skeletons across all pages
2. Action-oriented empty states ("Create your first workflow" with a button)
3. User-friendly error messages with solutions
4. First-run experience with tutorial workflow

---

## Pricing Considerations for SMEs

### What SMEs Can Afford
- $29-49/month for small tools
- $99-199/month for "mission critical" tools
- Per-seat pricing scares them (unpredictable costs)

### Suggested Pricing Model
- **Starter**: $49/month - 3 users, 10 workflows, 100 runs/month
- **Professional**: $99/month - 10 users, unlimited workflows, 500 runs/month
- **Team**: $199/month - 25 users, unlimited everything
- **Enterprise**: Custom (SSO, audit logs, support)

---

## Competitive Landscape for SMEs

### Direct Competitors
- **WalkMe** - Enterprise-focused, way too expensive for SMEs ($10K+/year)
- **Whatfix** - Enterprise-focused, complex to set up
- **Pendo** - More analytics-focused than training
- **Loom** - Video-based, not interactive

### Our Advantage for SMEs
- **Simpler** - No code, no complex configuration
- **Interactive** - Step-by-step guidance, not just videos
- **Self-healing** - Reduces maintenance burden
- **Affordable** - Built for SME budgets

### Our Disadvantage
- **New/unknown** - No brand recognition
- **Not battle-tested** - Limited production usage
- **Missing polish** - UX rough edges visible

---

## Recommended Priorities for SME Launch

### Phase 1: Core Reliability (1-2 weeks)
Fix the things that would cause an SME to churn after trial:

1. ✅ Fix HealthView to show real data
2. ✅ Add notification bell UI
3. ✅ Add step delete confirmation modal
4. ✅ Replace alerts with toasts
5. ✅ Add upload error handling with retry

### Phase 2: Polish (1 week)
Fix the things that make us look "amateur":

1. ✅ Wire TeamView to real API
2. ✅ Add profile editing page
3. ✅ Add workflow completion notification
4. ✅ Consistent loading states

### Phase 3: Onboarding (1 week)
Reduce friction for new users:

1. ✅ First-run onboarding flow
2. ✅ Demo/sample workflow
3. ✅ In-app help tooltips

---

## Key Metrics for SME Success

### Activation Metrics (First 7 days)
- Created first workflow: >80% of signups
- Completed first walkthrough: >60% of signups
- Invited first team member: >40% of signups

### Engagement Metrics (Ongoing)
- Weekly active users: >50% of team
- Workflows used per week: >5
- Walkthrough completion rate: >85%

### Retention Metrics
- 30-day retention: >70%
- 90-day retention: >50%
- Paid conversion (from trial): >10%

---

## Summary: SME Readiness Assessment

### Current State: 6/10 - "Almost Ready"

**What's Great:**
- Core recording/walkthrough flow works well
- AI labeling saves significant time
- Auto-healing is a real differentiator

**What's Blocking:**
- Admin visibility broken (HealthView, notifications)
- UX rough edges (alerts, no confirmations)
- Missing table-stakes features (profile editing)

### To Reach 8/10 - "Launch Ready"
- Fix 7 P1 items listed above (~2 weeks)
- Add basic onboarding (~1 week)
- Polish loading/error states (~3 days)

### To Reach 9/10 - "Competitive"
- Add search/filter for workflows
- Add workflow templates
- Add Slack integration (already designed)
- Improved empty states

---

## Action Items

1. **Immediate**: Fix security vulnerabilities (P0)
2. **This Week**: Wire HealthView and Notifications to real data
3. **Next Week**: UX polish (toasts, confirmations, loading states)
4. **Following Week**: Onboarding and first-run experience

The product is closer to SME-ready than it might feel. The core value proposition works. The gaps are primarily in "admin visibility" and "UX polish" - both fixable in 2-3 focused weeks.
