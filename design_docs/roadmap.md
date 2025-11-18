# Roadmap - Workflow Automation Platform

## Development Timeline Overview

**Total MVP Timeline:** 7 days (assuming 4 developers working full-time with AI coding assistance)

**Post-MVP to Launch:** 2-3 weeks (beta testing + refinement)

**Go-to-Market:** Week 10-12

---

## Phase 1: Foundation (Days 1-2)

**Goal:** Get basic infrastructure running end-to-end

### Day 1: Project Setup & Core Infrastructure

**Dev 1: Chrome Extension Scaffolding**
- [ ] Initialize extension project (Vite + React + TypeScript)
- [ ] Set up Manifest V3 configuration
- [ ] Create basic popup UI (login state)
- [ ] Implement content script injection
- [ ] Set up communication between content/background scripts
- [ ] Test: Extension loads, popup shows, content script injects

**Dev 2: Backend Foundation**
- [ ] Initialize Node.js + Express + TypeScript project
- [ ] Set up PostgreSQL connection (Supabase or local)
- [ ] Create database schema (run migrations)
- [ ] Implement auth endpoints (`/auth/signup`, `/auth/login`)
- [ ] Set up JWT token generation and validation
- [ ] Configure CORS for local development
- [ ] Test: Can signup, login, receive JWT token

**Dev 3: Web Dashboard Scaffolding**
- [ ] Initialize React project (Vite + TypeScript)
- [ ] Set up routing (React Router)
- [ ] Create basic layout (navbar, sidebar, main content)
- [ ] Build login/signup pages
- [ ] Implement auth state management (Zustand)
- [ ] Connect to backend auth API
- [ ] Test: Can signup, login, stay logged in

**Dev 4: DevOps & Research**
- [ ] Set up GitHub repository (monorepo structure)
- [ ] Configure development environment docs
- [ ] Set up Railway/Render deployment (staging)
- [ ] Deploy "Hello World" to production URL
- [ ] Configure S3/R2 bucket for screenshots
- [ ] Research auto-healing algorithms (document findings)
- [ ] Test: Can deploy backend + dashboard to staging

**End of Day 1 Milestone:**
✅ All three components (extension, backend, dashboard) running locally  
✅ Auth flow works (signup → login → JWT token)  
✅ Staging environment deployed  
✅ Database schema created  

---

### Day 2: Core Data Models & Basic Recording

**Dev 1: Recording Event Listeners**
- [ ] Attach event listeners (click, input, blur, change, submit)
- [ ] Implement meaningful interaction filter
- [ ] Extract element selectors (ID, CSS, XPath, data-testid)
- [ ] Build element metadata extractor
- [ ] Test recording on sample web page
- [ ] Store steps in local state (no backend yet)
- [ ] Test: Can record 5 steps, see in console

**Dev 2: Workflow API & Screenshot Upload**
- [ ] Create workflows table and steps table (if not in Day 1)
- [ ] Implement `POST /api/workflows` (create workflow with steps)
- [ ] Implement `GET /api/workflows` (list workflows)
- [ ] Implement `GET /api/workflows/:id` (get single workflow)
- [ ] Create screenshots table
- [ ] Implement `POST /api/screenshots` (upload to S3)
- [ ] Return pre-signed URLs for uploaded screenshots
- [ ] Test: Can create workflow, upload screenshot, get back URL

**Dev 3: Workflow List Page**
- [ ] Create workflows index page
- [ ] Fetch workflows from API
- [ ] Display as cards (name, description, status)
- [ ] Implement "Create Workflow" button
- [ ] Build workflow creation modal (metadata form)
- [ ] Test: Can see list of workflows, create new one

**Dev 4: Element Scoring Algorithm**
- [ ] Implement deterministic scoring function
  - Role matching (30 points)
  - Text similarity (30 points)
  - Position matching (20 points)
  - Attribute matching (20 points)
- [ ] Build candidate set builder (filter by category)
- [ ] Test scoring on sample elements
- [ ] Document algorithm in code
- [ ] Test: Can score 10 candidates, rank correctly

**End of Day 2 Milestone:**
✅ Can record a workflow (locally, not saved yet)  
✅ Workflow API endpoints working  
✅ Screenshot upload to S3 working  
✅ Dashboard shows workflow list  
✅ Auto-healing algorithm foundation ready  

---

## Phase 2: Core MVP Features (Days 3-5)

### Day 3: AI Labeling & Full Recording Flow

**Dev 1: Complete Recording Flow**
- [ ] Integrate screenshot capture (background script)
- [ ] Upload screenshots during recording
- [ ] Send recorded workflow to backend API
- [ ] Handle upload progress (show to user)
- [ ] Implement "Stop Recording" → redirect to review
- [ ] Add recording UI polish (step counter, pause/resume)
- [ ] Test: Record 10-step workflow, uploads successfully

**Dev 2: AI Labeling Service**
- [ ] Set up Anthropic Claude API integration
- [ ] Create AI labeling job queue (Bull + Redis)
- [ ] Implement prompt engineering for step labeling
- [ ] Build batch processing (max 5 concurrent)
- [ ] Implement fallback template labels
- [ ] Store AI labels in database
- [ ] Test: Process 10 steps, verify labels quality

**Dev 3: Workflow Review Page**
- [ ] Build step-by-step review grid
- [ ] Display screenshots + AI labels
- [ ] Show confidence badges (high/medium/low)
- [ ] Implement inline label editing
- [ ] Add step delete functionality
- [ ] Build "Save Workflow" action
- [ ] Test: Review workflow, edit 2 labels, save

**Dev 4: Multi-Signal Element Matching**
- [ ] Implement string similarity function (Levenshtein)
- [ ] Implement position normalization
- [ ] Build complete candidate scoring
- [ ] Filter candidates (<30 score removed, top 10 kept)
- [ ] Test on real UI changes (rename classes, move elements)
- [ ] Document test results
- [ ] Test: 80%+ correct matches on test cases

**End of Day 3 Milestone:**
✅ Full recording flow works end-to-end  
✅ AI generates labels for all steps  
✅ Review page allows editing and saving  
✅ Auto-healing deterministic matching implemented  

---

### Day 4: Walkthrough Mode Foundation

**Dev 1: Walkthrough Overlay UI**
- [ ] Build SpotlightOverlay component
  - Dark backdrop
  - Spotlight cutout around element
  - Glowing border animation
- [ ] Build Tooltip component (positioned dynamically)
- [ ] Build Progress indicator
- [ ] Implement smooth transitions
- [ ] Test: Overlay renders correctly on various page layouts

**Dev 2: Edit Workflow API**
- [ ] Implement `PUT /api/workflows/:id/steps/:stepId` (edit labels)
- [ ] Implement `DELETE /api/workflows/:id/steps/:stepId`
- [ ] Add workflow status management (draft → active)
- [ ] Create health_logs table
- [ ] Implement `POST /api/health-logs` (log execution)
- [ ] Test: Can edit step, delete step, log health event

**Dev 3: Walkthrough Launcher**
- [ ] Build workflow detail modal
- [ ] Add "Start Walkthrough" button
- [ ] Implement URL check (starting URL vs current)
- [ ] Build navigation prompt modal
- [ ] Send workflow data to extension
- [ ] Test: Can launch walkthrough from dashboard

**Dev 4: AI Healing Integration**
- [ ] Set up Claude API for healing
- [ ] Build screenshot comparison payload
- [ ] Implement AI candidate selection prompt
- [ ] Parse AI response and combine with deterministic score
- [ ] Implement confidence thresholds (0.8, 0.6)
- [ ] Test: AI correctly identifies moved elements

**End of Day 4 Milestone:**
✅ Walkthrough overlay looks polished  
✅ Can launch walkthrough from dashboard  
✅ Edit workflow API working  
✅ AI healing integration complete  

---

### Day 5: Walkthrough Execution & Auto-Healing

**Dev 1: Interaction Detection & Navigation**
- [ ] Implement WalkthroughController class
- [ ] Build interaction detection (correct vs wrong element)
- [ ] Implement auto-advance logic
- [ ] Add manual [Next] [Previous] buttons
- [ ] Handle navigation steps (URL changes)
- [ ] Handle dynamic content (wait for elements)
- [ ] Test: Complete 10-step walkthrough successfully

**Dev 2: Health Logging & Monitoring**
- [ ] Build health log creation logic
- [ ] Implement workflow success rate calculation
- [ ] Create health check background job
- [ ] Build notification creation logic
- [ ] Implement email alerts (SendGrid)
- [ ] Test: Workflow failure triggers alert

**Dev 3: Health Dashboard Page**
- [ ] Build workflow health overview page
- [ ] Show success rate, recent logs
- [ ] Display broken steps
- [ ] Add screenshot comparison (original vs current)
- [ ] Build notifications UI
- [ ] Test: Can see health status, broken workflows

**Dev 4: Complete Auto-Healing Pipeline**
- [ ] Integrate deterministic + AI scoring
- [ ] Implement tiered healing approach
- [ ] Add selector update logic (for high-confidence heals)
- [ ] Build "needs review" flagging
- [ ] Log healing events to health_logs
- [ ] Test: Auto-healing works on 10 test cases

**End of Day 5 Milestone:**
✅ Walkthrough mode fully functional  
✅ Auto-healing works with 70%+ success rate  
✅ Health monitoring tracks workflow status  
✅ Admin alerts trigger on failures  

---

## Phase 3: Polish & Alpha Release (Day 6)

**Goal:** Bug fixes, edge cases, UI polish, basic admin tools

### Day 6: Integration & Edge Cases

**Dev 1: Extension Edge Cases**
- [ ] Handle iframes (if time permits)
- [ ] Handle SPAs (detect route changes)
- [ ] Handle element visibility (behind modals)
- [ ] Add error recovery (walkthrough crash → clean restart)
- [ ] Polish recording UI (better visual feedback)
- [ ] Test on 5 different web apps

**Dev 2: API Polish & Error Handling**
- [ ] Add comprehensive error handling
- [ ] Implement rate limiting (100/min general, 5/min AI)
- [ ] Add request validation (Joi schema)
- [ ] Optimize database queries (add indexes)
- [ ] Implement logging (Winston or Pino)
- [ ] Test: API handles errors gracefully

**Dev 3: Dashboard Polish**
- [ ] Add loading states (skeletons)
- [ ] Add empty states (no workflows)
- [ ] Improve error messages
- [ ] Add success notifications (toast)
- [ ] Polish responsive design (mobile)
- [ ] Test: Dashboard feels polished

**Dev 4: Admin Repair Mode**
- [ ] Build workflow repair UI
- [ ] Implement "Fix Workflow" flow
  - Admin clicks broken element
  - System captures new selectors
  - Updates workflow
- [ ] Add "Test Workflow" mode
- [ ] Build admin notification center
- [ ] Test: Can repair broken workflow in <2 minutes

**End of Day 6 Milestone:**
✅ All major bugs fixed  
✅ Edge cases handled gracefully  
✅ UI feels polished and professional  
✅ Admin tools functional  

---

## Phase 4: Testing & Beta Release (Day 7)

**Goal:** End-to-end testing, deployment, documentation

### Day 7: Final Testing & Deployment

**All Devs: End-to-End Testing**
- [ ] Test complete user journey (signup → record → review → walkthrough)
- [ ] Test on 3+ different web applications
- [ ] Test all error scenarios
- [ ] Test auto-healing on real UI changes
- [ ] Load test (simulate 10 concurrent users)
- [ ] Security review (basic checklist)

**Deployment Tasks:**
- [ ] Deploy to production (Railway/Render)
- [ ] Configure production database
- [ ] Set up production S3 bucket
- [ ] Configure environment variables
- [ ] Set up monitoring (Sentry for errors)
- [ ] Create deployment documentation
- [ ] Set up automated backups

**Documentation:**
- [ ] User guide (how to record workflow)
- [ ] Admin guide (how to fix broken workflows)
- [ ] Developer README (setup instructions)
- [ ] API documentation (basic)

**Pre-Launch Checklist:**
- [ ] All core features working
- [ ] No critical bugs
- [ ] Performance acceptable (<2s page load)
- [ ] Mobile-responsive dashboard
- [ ] Chrome extension published (or ready to publish)

**End of Day 7 Milestone:**
✅ MVP fully functional  
✅ Deployed to production  
✅ Ready for beta users  

---

## Phase 5: Beta Testing (Weeks 2-3)

**Week 2: Onboard Beta Users**

**Targets:**
- 10-20 beta companies
- 50+ end users total
- 100+ workflows created

**Beta User Acquisition:**
- [ ] Week 1: Friends & family (5 companies)
- [ ] Week 2: LinkedIn outreach (10 companies)
- [ ] Week 3: Content marketing (5 companies)

**Beta Activities:**
- [ ] Schedule onboarding calls with each company
- [ ] Provide white-glove support
- [ ] Collect feedback (weekly surveys)
- [ ] Track usage metrics
- [ ] Fix bugs reported by beta users

**Feedback Collection:**
- Weekly check-ins with power users
- In-app feedback widget
- Monthly NPS survey
- Usage analytics (PostHog)

---

**Week 3: Iterate Based on Feedback**

**Expected Feedback Areas:**
- AI labeling accuracy
- Auto-healing reliability
- UI/UX improvements
- Bug reports

**Iteration Plan:**
- [ ] Daily bug fixes (high priority)
- [ ] Weekly feature tweaks
- [ ] Improve AI prompts based on user edits
- [ ] Optimize auto-healing thresholds

**Success Criteria for Beta:**
- ✅ 70% of workflows used at least once
- ✅ 85%+ walkthrough completion rate
- ✅ <10 critical bugs reported
- ✅ NPS >30
- ✅ 50% of beta users willing to pay

---

## Phase 6: Launch Preparation (Week 4)

**Pre-Launch Tasks:**

**Product:**
- [ ] Polish top 3 pain points from beta
- [ ] Optimize performance (page load <2s)
- [ ] Add basic analytics dashboard
- [ ] Implement payment (Stripe integration)

**Marketing:**
- [ ] Create landing page (conversion-optimized)
- [ ] Write launch blog post
- [ ] Prepare Product Hunt launch
- [ ] Create demo video (90 seconds)
- [ ] Set up email sequences (onboarding, activation)

**Pricing:**
- [ ] Finalize pricing ($99/month Professional)
- [ ] Build billing UI
- [ ] Test payment flow
- [ ] Create invoice templates

**Support:**
- [ ] Set up support email (support@)
- [ ] Create help center (basic FAQ)
- [ ] Prepare canned responses for common questions
- [ ] Set up in-app chat (Intercom or Crisp)

---

## Success Metrics

### Foundation Phase (Days 1-2)
- ✅ All systems deployable
- ✅ Auth works end-to-end
- ✅ Can record and save a workflow
- ✅ Screenshot upload functional

### MVP Phase (Days 3-5)
- ✅ Core loop works (record → review → walkthrough)
- ✅ AI labeling >75% accuracy
- ✅ Auto-healing >65% success rate
- ✅ Can complete 10-step workflow

### Alpha Phase (Day 6)
- ✅ 5 internal users active daily
- ✅ 20+ workflows created internally
- ✅ <5 critical bugs
- ✅ No crashes or data loss

### Beta Phase (Weeks 2-3)
- ✅ 20+ beta companies onboarded
- ✅ 100+ workflows created
- ✅ 50% weekly active users
- ✅ NPS >30
- ✅ Auto-healing success rate >70%

### Launch Readiness (Week 4)
- ✅ Payment flow working
- ✅ Landing page live
- ✅ Demo video created
- ✅ Product Hunt submission ready
- ✅ <100ms p95 API latency
- ✅ <2s page load time

### Post-Launch (Month 1)
- ✅ 100 signups
- ✅ 50 active companies
- ✅ 10 paying customers
- ✅ $1k MRR
- ✅ 50% weekly retention

### Month 3 Targets
- ✅ 500 signups
- ✅ 100 companies
- ✅ 50 paying customers
- ✅ $5k MRR
- ✅ <5% monthly churn

---

## Post-MVP Vision

### V1.1: Polish & Quick Wins (Month 2)

**User-Requested Features (Top 3):**
- [ ] Workflow templates (pre-built common workflows)
- [ ] Screenshot annotations (admin can add arrows/highlights)
- [ ] Workflow duplication (copy and modify existing)
- [ ] Workflow sharing (public links for demos)

**Quality of Life:**
- [ ] Keyboard shortcuts in walkthrough mode
- [ ] Better mobile dashboard experience
- [ ] Workflow search and filtering
- [ ] Batch workflow operations (archive, delete multiple)

**Performance:**
- [ ] Faster AI labeling (fine-tuned model)
- [ ] Better screenshot compression
- [ ] Cached API responses

**Target Metrics:**
- Reduce AI costs by 30%
- Improve auto-healing to 75%+
- Increase workflow creation speed by 20%

---

### V1.2: Automation & Advanced Features (Month 3-4)

**Execution Mode (MVP 2.0):**
- [ ] Parameter extraction from workflows
- [ ] Execution UI (fill parameters → run)
- [ ] Form validation during execution
- [ ] Error handling for failed executions

**Cross-App Workflows:**
- [ ] Multi-tab navigation support
- [ ] Session/cookie management
- [ ] Cross-domain workflows (e.g., ERP → SharePoint)

**Advanced Auto-Healing:**
- [ ] Proactive UI change detection
- [ ] Suggest healing before users encounter failures
- [ ] Machine learning for better matching (long-term)

**Analytics Dashboard:**
- [ ] Workflow usage reports
- [ ] Team productivity metrics
- [ ] Time saved calculations
- [ ] ROI reporting for managers

**Target Metrics:**
- 30% of workflows use execution mode
- 10% of workflows span multiple apps
- Admin time to fix workflows reduced 50%

---

### V2.0: Platform Expansion (Month 5-6)

**Enterprise Features:**
- [ ] SSO integration (Google, Microsoft, SAML)
- [ ] Role-based permissions (granular access control)
- [ ] Audit logs (compliance)
- [ ] Custom branding (white-label)
- [ ] Advanced security (SOC 2 readiness)

**Integrations:**
- [ ] Slack notifications (workflow broken alerts)
- [ ] API for third-party apps
- [ ] Zapier integration
- [ ] Salesforce, HubSpot connectors

**Mobile App:**
- [ ] iOS/Android app for viewing workflows
- [ ] Push notifications
- [ ] Offline mode (read-only)

**Marketplace:**
- [ ] Community workflow library
- [ ] Share workflows across companies
- [ ] Workflow ratings and reviews

**Target Metrics:**
- $50k MRR
- 500 paying customers
- 20% enterprise customers
- 5 integrations live

---

## Risk Mitigation Checkpoints

**Week 1 (MVP Build):**
- Daily standups to catch blockers
- If auto-healing not working → Simplify to deterministic-only
- If AI labeling poor → Focus on template-based fallback

**Week 2 (Beta Testing):**
- If <5 beta users → Pivot acquisition strategy
- If churn >50% → Deep dive on product issues
- If auto-healing <50% → Reduce confidence thresholds

**Week 4 (Launch Prep):**
- If beta NPS <20 → Delay launch, fix core issues
- If technical debt high → Allocate 1 week for refactoring
- If costs >$200/month → Optimize AI usage

**Month 3 (Growth):**
- If <20 paying customers → Revisit pricing or target segment
- If churn >10% → Focus on retention over acquisition
- If support burden high → Build better self-serve resources

---

## Go/No-Go Decision Points

**After Week 1 (MVP Complete):**
- ✅ GO: All core features work, ready for beta
- ❌ NO-GO: Critical features broken, need 1 more week

**After Week 3 (Beta Testing):**
- ✅ GO: NPS >20, <20% churn, users love it
- ⚠️ MAYBE: NPS 10-20, fixable issues identified
- ❌ NO-GO: NPS <10, fundamental product issues

**After Month 3 (Market Validation):**
- ✅ GO: >20 paying customers, clear PMF signals
- ⚠️ PIVOT: <10 paying, but strong user love (pricing issue?)
- ❌ STOP: <5 paying, no engagement, market doesn't care

---

## Team Responsibilities Summary

**Dev 1: Extension Expert**
- Recording mechanism
- Walkthrough UI
- Interaction detection
- Extension deployment

**Dev 2: Backend Expert**
- API design and implementation
- Database optimization
- AI integration
- Infrastructure deployment

**Dev 3: Frontend Expert**
- Dashboard UI
- User flows
- Design system implementation
- Responsive design

**Dev 4: Integration & Quality**
- Auto-healing system
- End-to-end testing
- Health monitoring
- DevOps & deployment

---

**End of Roadmap**
