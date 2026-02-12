# Testudo – Implementation Roadmap

**Document:** `IMPLEMENTATION_ROADMAP.md`  
**Version:** 1.0  
**Created:** 2026-02-11  
**Status:** Active Planning

---

## Overview

This document defines the phased implementation strategy for **Testudo** with explicit Agent invocations, market requirements tracking, and centralized logging.

### Key Principle

The **Orchestrator Agent** monitors:
- ✅ Market Requirements (what customers want)
- ✅ Current Product State (what we've built)
- ✅ Gap Analysis (IST ↔ SOLL)
- ✅ Agent Prioritization (adjust based on gaps)

---

## Phase 0: Foundation Setup (Week 1)

**Goal:** Infrastructure, database schema, auth setup  
**Duration:** 3–4 days

### Tasks

#### 0.1 Database Schema & ORM
**Agents Invoked:** `code-architect`

**Inputs:**
- Requirements.md (full)
- Tech Stack constraints

**Deliverables:**
- ✅ Prisma schema (`prisma/schema.prisma`)
- ✅ Entity-Relationship Diagram (Mermaid)
- ✅ Migration strategy
- ✅ ADR-001: Data Model Design

**Logging Entry:**
```
[2026-02-11 10:00:00] PHASE_START: Phase 0 - Foundation Setup
[2026-02-11 10:15:00] AGENT_INVOKE: code-architect
[2026-02-11 10:15:00] TASK: "Design Testudo MVP Datamodel"
[2026-02-11 11:30:00] AGENT_COMPLETE: code-architect (status: success)
[2026-02-11 11:30:00] DELIVERABLE: prisma/schema.prisma (550 lines)
[2026-02-11 11:30:00] DELIVERABLE: Architecture Document (ADR-001)
```

---

#### 0.2 Authentication Setup
**Agents Invoked:** `backend-specialist`

**Inputs:**
- Requirements (Auth section)
- Prisma schema (from 0.1)
- Next.js structure

**Deliverables:**
- ✅ Auth.js configuration
- ✅ Login & Register Routes
- ✅ Session middleware
- ✅ API tests for auth flows

**Logging Entry:**
```
[2026-02-11 12:00:00] AGENT_INVOKE: backend-specialist
[2026-02-11 12:00:00] TASK: "Implement Auth.js + Session Management"
[2026-02-11 14:30:00] AGENT_COMPLETE: backend-specialist (status: success)
[2026-02-11 14:30:00] DELIVERABLE: app/api/auth/[...nextauth].ts
[2026-02-11 14:30:00] DELIVERABLE: lib/auth.ts
```

---

#### 0.3 Project CRUD APIs
**Agents Invoked:** `backend-specialist`, `qa-engineer`

**Inputs:**
- Requirements (Project Management section)
- Auth system (from 0.2)

**Deliverables:**
- ✅ POST /api/projects (create)
- ✅ GET /api/projects (list user's projects)
- ✅ PUT /api/projects/[id] (update)
- ✅ DELETE /api/projects/[id] (delete)
- ✅ RBAC enforcement tests

**Logging Entry:**
```
[2026-02-11 15:00:00] AGENT_INVOKE: backend-specialist, qa-engineer (parallel)
[2026-02-11 15:00:00] TASK: "Project CRUD + Authorization"
[2026-02-11 17:30:00] AGENT_COMPLETE: backend-specialist (status: success)
[2026-02-11 17:35:00] AGENT_COMPLETE: qa-engineer (status: success)
[2026-02-11 17:35:00] COVERAGE: 92% (auth checks, edge cases)
```

---

#### 0.4 Documentation
**Agents Invoked:** `doc-writer`

**Inputs:**
- All completed deliverables from 0.1 – 0.3

**Deliverables:**
- ✅ Setup Guide (installation, .env, migrations)
- ✅ Architecture Overview
- ✅ API Documentation (OpenAPI spec)
- ✅ Developer Onboarding

**Logging Entry:**
```
[2026-02-11 18:00:00] AGENT_INVOKE: doc-writer
[2026-02-11 18:00:00] TASK: "Document Phase 0 Deliverables"
[2026-02-11 18:45:00] AGENT_COMPLETE: doc-writer (status: success)
```

---

**End Phase 0 Status Log:**
```
[2026-02-11 19:00:00] PHASE_END: Phase 0 - Foundation Setup
[2026-02-11 19:00:00] PHASE_DURATION: 9 hours
[2026-02-11 19:00:00] STATUS: ✅ Complete (all deliverables)
[2026-02-11 19:00:00] BLOCKERS: None
```

---

## Phase 1: Core Model Editor (Week 2–3)

**Goal:** Canonical system model with React Flow, nested components, data objects  
**Duration:** 8–10 days

### Market Requirement Check (Orchestrator)
```
[2026-02-11 09:00:00] MARKET_CHECK: Gather customer feedback
[2026-02-11 09:15:00] MARKET_REQUIREMENT: "Diagram must be intuitive & drag-droppable"
[2026-02-11 09:15:00] MARKET_REQUIREMENT: "Nested components critical – must be visual"
[2026-02-11 09:15:00] MARKET_REQUIREMENT: "Data objects on edges are nice-to-have (can defer)"
[2026-02-11 09:20:00] PRIORITY_ADJUST: Frontend-Specialist priority ↑ (intuitive UX)
[2026-02-11 09:20:00] PRIORITY_ADJUST: Code-Architect priority ↑ (hierarchy design)
```

### Tasks

#### 1.1 Graph Node/Edge API
**Agents Invoked:** `backend-specialist`

**Deliverables:**
- POST /api/projects/[id]/model/nodes (create node)
- PUT /api/projects/[id]/model/nodes/[nodeId] (update)
- DELETE /api/projects/[id]/model/nodes/[nodeId] (delete + cascade)
- GET /api/projects/[id]/model/hierarchy (get tree structure)
- POST /api/projects/[id]/model/edges (create edge)
- Cycle detection for hierarchies

---

#### 1.2 React Flow UI Components
**Agents Invoked:** `frontend-specialist`

**Deliverables:**
- ModelEditor.tsx (main canvas)
- CustomNodeComponent.tsx (hierarchy aware)
- CustomEdgeComponent.tsx (with labels)
- HierarchyPanel.tsx (tree sidebar)
- NodeDetailsPanel.tsx (edit form)
- Auto-save on changes

---

#### 1.3 Data Objects Integration
**Agents Invoked:** `backend-specialist`, `frontend-specialist` (parallel)

**Deliverables:**
- DataObject CRUD APIs
- ComponentData join table
- EdgeDataFlow join table
- DataObject UI (badges on nodes/edges)

---

#### 1.4 Testing & Code Review
**Agents Invoked:** `qa-engineer`, `code-reviewer`

**Deliverables:**
- Integration tests for hierarchy operations
- Cycle detection tests
- UI interaction tests
- Code review report (security, performance)

---

#### 1.5 Documentation
**Agents Invoked:** `doc-writer`

**Deliverables:**
- Model Editor user guide
- API documentation for graph operations
- ADR-002: Hierarchical Component Design

---

**End Phase 1 Status Log:**
```
[2026-02-?? ??:??:??] PHASE_END: Phase 1 - Core Model Editor
[2026-02-?? ??:??:??] PHASE_DURATION: ~8 days
[2026-02-?? ??:??:??] STATUS: ✅ Complete
[2026-02-?? ??:??:??] TEST_COVERAGE: 88%
```

---

## Phase 2: Asset Valuation & Questions (Week 4–5)

**Goal:** Asset generation, value assignment, normative questionnaire

### Market Requirement Check (Orchestrator)
```
[2026-??-?? ??:??:??] MARKET_CHECK: Customer priorities for Phase 2
[2026-??-?? ??:??:??] MARKET_REQUIREMENT: "Assessment flow must be fast"
[2026-??-?? ??:??:??] MARKET_REQUIREMENT: "IEC 62443 questions must be validated"
[2026-??-?? ??:??:??] MARKET_REQUIREMENT: "Multi-user answers, then conflict resolution"
```

### Tasks

#### 2.1 Asset Auto-Generation
**Agents Invoked:** `backend-specialist`

---

#### 2.2 Value Assessment UI
**Agents Invoked:** `frontend-specialist`

---

#### 2.3 Question Bank & Answering
**Agents Invoked:** `backend-specialist`, `frontend-specialist`

---

#### 2.4 Multi-User Answer Aggregation
**Agents Invoked:** `backend-specialist`, `qa-engineer`

---

#### 2.5 Testing & Code Review
**Agents Invoked:** `qa-engineer`, `code-reviewer`

---

#### 2.6 Documentation
**Agents Invoked:** `doc-writer`

---

## Phase 3: Findings, Risk & Measures (Week 6–7)

**Goal:** Automatic derivation of findings, risk calculation, measure generation

### Tasks

#### 3.1 Finding Calculation Engine
**Agents Invoked:** `backend-specialist`

---

#### 3.2 Risk Scoring Algorithm
**Agents Invoked:** `code-architect`, `backend-specialist`

---

#### 3.3 Measure Generation & Tracking
**Agents Invoked:** `backend-specialist`, `frontend-specialist`

---

#### 3.4 Testing
**Agents Invoked:** `qa-engineer`

---

#### 3.5 Documentation
**Agents Invoked:** `doc-writer`

---

## Phase 4: Report & Export (Week 8)

**Goal:** PDF report generation with all assessment data

### Tasks

#### 4.1 Report Template & PDF Generation
**Agents Invoked:** `backend-specialist`

---

#### 4.2 Report UI Component
**Agents Invoked:** `frontend-specialist`

---

#### 4.3 Testing & Optimization
**Agents Invoked:** `qa-engineer`

---

## Phase 5: KI-Assistenz (Week 9–10) [OPTIONAL MVP+]

**Goal:** Text-to-model generation using LLMs

### Tasks

#### 5.1 LLM Integration & Prompt Engineering
**Agents Invoked:** `backend-specialist`

---

#### 5.2 NLP → JSON Schema
**Agents Invoked:** `code-architect`, `backend-specialist`

---

#### 5.3 Preview & User Acceptance UI
**Agents Invoked:** `frontend-specialist`

---

## Phase 6: Polish & Security Hardening (Week 11–12)

**Goal:** Security audit, performance optimization, UX refinement

### Tasks

#### 6.1 Security Audit
**Agents Invoked:** `code-reviewer`, `backend-specialist`

---

#### 6.2 Performance Testing & Optimization
**Agents Invoked:** `qa-engineer`, `backend-specialist`

---

#### 6.3 UX Polish & Design System
**Agents Invoked:** `frontend-specialist`

---

#### 6.4 Deployment Preparation
**Agents Invoked:** `backend-specialist`, `doc-writer`

---

## Logging System Specification

All agent invocations and phase milestones must log to **`PROJECT_LOGS.md`** centralized file with timestamps.

### Log Format

```
[YYYY-MM-DD HH:MM:SS] EVENT_TYPE: Message
[YYYY-MM-DD HH:MM:SS] CONTEXT_KEY: context_value
```

### Event Types

| Type | Example | Purpose |
|------|---------|---------|
| `PHASE_START` | Begin phase | Track phase timeline |
| `PHASE_END` | Complete phase | Calculate duration |
| `AGENT_INVOKE` | Start agent | Know when agent called |
| `AGENT_COMPLETE` | Finish agent | Know results & status |
| `MARKET_CHECK` | Customer feedback | Track requirement changes |
| `PRIORITY_ADJUST` | Change agent priority | Trace priority decisions |
| `DELIVERABLE` | File created/updated | Track what was built |
| `BLOCKER` | Issue found | Track blockers |
| `COVERAGE` | Test coverage % | Track quality metrics |
| `MERGE` | PR merged | Track integration |

---

## Orchestrator Agent Responsibilities

The **Orchestrator Agent** (`orchestrator-agent-instructions.md`) continuously:

1. **Monitors Market Requirements**
   - Customer feedback
   - Competitive analysis
   - Feature priority shifting

2. **Tracks Product State**
   - Completed features
   - In-progress work
   - Quality metrics

3. **Gap Analysis: IST ↔ SOLL**
   - If customer says "better UI" → frontend-specialist priority ↑
   - If customer says "secure auth" → backend-specialist priority ↑
   - If risks found → qa-engineer priority ↑

4. **Agent Coordination**
   - Invoke agents in optimal order
   - Parallelize where possible
   - Adjust workload based on priorities

5. **Reporting & Adjustments**
   - Weekly status updates
   - Impact assessment
   - Pivot recommendations

---

## How Agent Priority Works

### Base Priorities
Each agent has a default priority:

```
Code Architect:          Medium
Frontend Specialist:     Medium
Backend Specialist:      Medium-High (auth, RBAC critical)
QA Engineer:             Medium
Doc Writer:              Low (async, can be deferred)
Code Reviewer:           Medium (gates merges)
```

### Dynamic Priority Adjustment (by Orchestrator)

**Example 1: Customer says "Beautiful UI, Dark mode needed"**
```
MARKET_REQUIREMENT: "Design System & Dark Mode critical"
PRIORITY_ADJUST: Frontend-Specialist ↑↑ (from Medium → High)
PRIORITY_ADJUST: Doc-Writer ↑ (design system docs)
PRIORITY_ADJUST: QA-Engineer ↑ (accessibility testing)
RESULT: Next sprint prioritizes frontend tasks
```

**Example 2: Security audit findings**
```
BLOCKER: "OWASP A01:2021 – Broken Access Control"
PRIORITY_ADJUST: Backend-Specialist ↑↑ (from Medium-High → Critical)
PRIORITY_ADJUST: Code-Reviewer ↑↑ (security focus)
PRIORITY_ADJUST: QA-Engineer ↑ (penetration testing)
RESULT: Security fixes immediately scheduled
```

---

## Daily Workflow

### Morning (Orchestrator Review)

```
[09:00] ORCHESTRATOR_REVIEW_START
[09:05] MARKET_CHECK: Review customer feedback / Slack
[09:15] STATE_CHECK: Review completed PRs, blockers
[09:25] GAP_ANALYSIS: Compare current state to requirements
[09:35] PRIORITY_DECISION: Adjust agent priorities based on gaps
[09:45] SPRINT_PLAN: What agents to invoke today?
[10:00] ORCHESTRATOR_REVIEW_END → Log all decisions
```

### During Day (Agent Work)

```
[10:00] AGENT_INVOKE: [list of agents with priorities]
[10:00–18:00] Agents perform work (logged per agent)
```

### Evening (Orchestrator Sync)

```
[17:00] ORCHESTRATOR_SYNC_START
[17:15] AGENT_STATUS_CHECK: Gather all agent completion logs
[17:30] METRICS_UPDATE: Test coverage, code quality, blockers
[17:45] DAILY_SUMMARY: What was built, what's blocked
[18:00] NEXT_DAY_PLAN: Adjusted priorities for tomorrow
[18:00] ORCHESTRATOR_SYNC_END → Append to PROJECT_LOGS.md
```

---

## Success Criteria

### Phase Completion Checklist

- [ ] All agents invoked in correct order
- [ ] All deliverables completed & code-reviewed
- [ ] Test coverage ≥ 80%
- [ ] No critical/high blockers
- [ ] Documentation complete
- [ ] Feature aligned with market requirements
- [ ] Logged with timestamps in PROJECT_LOGS.md

---

## Next Steps

1. ✅ **Finalize Requirements** (done via Requirements.md)
2. 🔲 **Invoke code-architect** for Phase 0.1 (Database Design)
3. 🔲 **Start PROJECT_LOGS.md** with initial entries
4. 🔲 **Create Orchestrator Agent** instructions
5. 🔲 **First daily orchestrator review** (tomorrow 09:00)

---

**Last Updated:** 2026-02-11  
**Owner:** Orchestrator Agent  
**Status:** Ready for Phase 0 Kickoff
