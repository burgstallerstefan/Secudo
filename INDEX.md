# Testudo – Project Structure & Documentation Guide

**Quick Navigation for Developers, Agents, and Orchestrator**

---

## 📂 Core Documentation

### Strategy & Planning
1. **[Requirements.md](Requirements.md)** – Complete product requirements for MVP
2. **[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)** – Phased rollout with agent invocations
3. **[MARKET_REQUIREMENTS.md](MARKET_REQUIREMENTS.md)** – Customer feedback, competitive analysis, priorities
4. **[PROJECT_LOGS.md](PROJECT_LOGS.md)** – Central log of all decisions, timestamps, metrics

### Agent Roles & Instructions
Located in `agents/` folder:

1. **[orchestrator-agent-instructions.md](agents/orchestrator-agent-instructions.md)** – 👑 Product owner, daily reviews, priority management
2. **[code-architect-instructions.md](agents/code-architect-instructions.md)** – Database design, API structure, scalability
3. **[backend-specialist-instructions.md](agents/backend-specialist-instructions.md)** – API Routes, Auth, Business Logic
4. **[frontend-specialist-instructions.md](agents/frontend-specialist-instructions.md)** – React components, UI, State management
5. **[qa-engineer-instructions.md](agents/qa-engineer-instructions.md)** – Testing, quality, bug prevention
6. **[doc-writer-instructions.md](agents/doc-writer-instructions.md)** – Documentation, comments, ADRs
7. **[code-reviewer-instructions.md](agents/code-reviewer-instructions.md)** – Code quality, security, performance

### Master Agent Roles Overview
- **[AGENT_ROLES.md](AGENT_ROLES.md)** – Index of all 6 agents + how to use them

### Project Setup & Autonomy
- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** – Clean Next.js folder structure (src/, components/, etc.)
- **[AUTONOMOUS_WORK.md](AUTONOMOUS_WORK.md)** – How to delegate work without confirmations

---

## 🎯 Getting Started (First-Time Use)

### For Orchestrator
1. Read: [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) (overview)
2. Read: [orchestrator-agent-instructions.md](agents/orchestrator-agent-instructions.md) (detailed role)
3. Check: [PROJECT_LOGS.md](PROJECT_LOGS.md) (daily starting point)
4. Check: [MARKET_REQUIREMENTS.md](MARKET_REQUIREMENTS.md) (customer needs)
5. Action: Run morning review (see orchestrator instructions → "Täglicher Arbeitsablauf")

### For Developers/Agents
1. Read: [AGENT_ROLES.md](AGENT_ROLES.md) (which agent are you?)
2. Read: Your specific agent instructions (in `agents/` folder)
3. Wait for: [PROJECT_LOGS.md](PROJECT_LOGS.md) entry with your invocation
4. Execute: Task as described in your invocation
5. Report: Completion back (Orchestrator logs it)

### For Code Reviewers
1. Read: [code-reviewer-instructions.md](agents/code-reviewer-instructions.md)
2. Check: [PROJECT_LOGS.md](PROJECT_LOGS.md) for context on PR
3. Review: Code against checklist in instructions
4. Report: Approval/changes needed

---

## 📊 Daily Workflow

### Morning (Orchestrator)
```
09:00 → Check PROJECT_LOGS.md (what happened yesterday?)
09:05 → MARKET_CHECK (MARKET_REQUIREMENTS.md)
09:15 → STATE_CHECK (GitHub PRs, metrics)
09:30 → GAP_ANALYSIS (IST vs. SOLL)
09:45 → PRIORITY_ADJUST (update agent priorities)
10:00 → SPRINT_PLAN (which agents to invoke?)
10:00 → Log all decisions in PROJECT_LOGS.md
```

### Day (All Agents)
- Work on assigned task
- Log progress (if needed)
- Deliver by deadline mentioned in orchestrator's log entry

### Evening (Orchestrator)
```
17:00 → AGENT_STATUS_CHECK (gather completion reports)
17:30 → METRICS_UPDATE (test coverage, quality)
17:45 → DAILY_SUMMARY (what was built?)
18:00 → NEXT_DAY_PREP (adjust priorities, plan agents)
18:00 → Append summary to PROJECT_LOGS.md
```

---

## 🔄 Agent Invocation Cycle

### How Orchestrator Invokes an Agent

**Step 1: Identify Need**
- Gap analysis shows frontend 50% behind
- Customers want intuitive UI
- Decision: High priority

**Step 2: Log Invocation in PROJECT_LOGS.md**
```
[2026-02-13 09:30:00] AGENT_INVOKE: frontend-specialist
Context: Model Editor UI for canonical diagram
Priority: HIGH (50% gap identified)
Deliverables: ModelEditor.tsx, HierarchyPanel.tsx
Deadline: EOD 2026-02-14
Blockers: Awaiting API spec from Backend-Specialist (in progress)
```

**Step 3: Agent Receives Invocation**
- Checks PROJECT_LOGS.md for your name
- Reads task, priority, deadline
- Gathers dependencies (APIs from backend, etc.)
- Starts work

**Step 4: Agent Completes & Reports**
- Submits code for review
- Notifies Orchestrator of completion
- Provides metrics (files changed, test coverage, etc.)

**Step 5: Orchestrator Logs Completion**
```
[2026-02-14 17:30:00] AGENT_COMPLETE: frontend-specialist
Status: success
Deliverables: ModelEditor.tsx (420 lines), HierarchyPanel.tsx (280 lines)
Test Coverage: 82%
Code Review: pending
```

---

## 📈 Key Metrics (Tracked in PROJECT_LOGS.md)

| Metric | Frequency | Owner | Target |
|---|---|---|---|
| Phase Completion % | Daily | Orchestrator | 100% per phase |
| Test Coverage % | After agent work | QA-Engineer | ≥80% |
| Build Time | After merge | CI/CD | <30s |
| Performance (P95) | Weekly | QA-Engineer | <500ms |
| Blocker Count | Daily | Orchestrator | 0 |
| Market Alignment | Weekly | Orchestrator | High |

---

## 🚨 When Priorities Change

**Scenario: Customer says "UI is too slow"**

1. Orchestrator detects issue → MARKET_CHECK entry in PROJECT_LOGS.md
2. Orchestrator analyzes gap → GAP_ANALYSIS entry
3. Orchestrator adjusts priorities:
   ```
   [timestamp] PRIORITY_ADJUST: Frontend-Specialist ↑↑ (was: Medium, now: HIGH)
   [timestamp] PRIORITY_ADJUST: Backend-Specialist → MEDIUM (performance optimization secondary)
   ```
4. Orchestrator invokes agents with new priorities
5. All logged in PROJECT_LOGS.md with timestamps

---

## 🔐 Security & Confidentiality

- **Document Access:** All team members can read (no secrets stored)
- **Code Secrets:** Never log passwords/API keys (use .env)
- **Customer Data:** Anonymize in examples
- **Sensitive Decisions:** Can be logged but marked `[CONFIDENTIAL]` if needed

---

## 📝 How to Edit Documentation

### Editing Requirements.md
- Orchestrator/Product Lead only
- Log change in PROJECT_LOGS.md: `[timestamp] REQUIREMENT_UPDATE: [what changed]`
- Notify all agents of changes

### Editing MARKET_REQUIREMENTS.md
- Orchestrator updates weekly (Fridays)
- Source: Customer feedback collected during week
- Log: `[timestamp] MARKET_REQUIREMENT: [new feedback]`

### Editing Agent Instructions
- Only update if role/process changes
- Log: `[timestamp] AGENT_INSTRUCTION_UPDATE: [agent name], [change]`
- Notify the affected agent

### Editing PROJECT_LOGS.md
- ONLY Orchestrator appends entries
- Never delete old entries (audit trail)
- Format: Use template provided in file

---

## 🧩 System Architecture (High-Level)

```
MARKET SIGNALS
    ↓
ORCHESTRATOR (daily review)
    ├─ MARKET_CHECK → MARKET_REQUIREMENTS.md
    ├─ STATE_CHECK → GitHub PRs, metrics
    ├─ GAP_ANALYSIS → IST vs. SOLL
    ├─ PRIORITY_ADJUST → Dynamic agent priorities
    └─ Logs all to PROJECT_LOGS.md
        ↓
AGENTS (invoked with priorities)
    ├─ Code-Architect (schema, APIs)
    ├─ Backend-Specialist (business logic)
    ├─ Frontend-Specialist (UI)
    ├─ QA-Engineer (testing)
    ├─ Code-Reviewer (quality gate)
    └─ Doc-Writer (documentation)
        ↓
DELIVERABLES
    └─ Merged code, tests, docs
        ↓
BACK TO ORCHESTRATOR
    └─ Review, log, adjust priorities
```

---

## ❓ FAQ

### Q: How do I know if I should work on something?
**A:** Check [PROJECT_LOGS.md](PROJECT_LOGS.md) for `AGENT_INVOKE` entries with your name. That's your task.

### Q: Customer demands something new. What do I do?
**A:** Tell Orchestrator. They log it as `MARKET_REQUIREMENT` and adjust priorities.

### Q: I'm blocked on something. What do I do?
**A:** Post in PROJECT_LOGS.md: `[timestamp] BLOCKER: [description]`  
Orchestrator will see it next review and adjust.

### Q: How do I know priorities?
**A:** Check your AGENT_INVOKE entry in PROJECT_LOGS.md. It says "Priority: HIGH" (or whatever).

### Q: When should I parallelize work?
**A:** If no data dependencies, parallel is fine. Orchestrator decides & logs for coordination.

### Q: How often does Orchestrator review?
**A:** Daily (morning 09:00, evening 17:00) + ad-hoc if blocker emerges.

---

## 📞 Contacts & Escalation

| Role | Responsibility | Escalate If |
|---|---|---|
| Orchestrator | Overall coordination | Customer demands shift, major blocker |
| Code-Architect | System design | Design decision needed |
| Backend-Specialist | APIs, databases | Performance/security issue |
| Frontend-Specialist | UI/UX | Design/usability question |
| QA-Engineer | Testing, quality | Quality threshold at risk |
| Code-Reviewer | Code gates merges | Quality issue in PR |
| Doc-Writer | Documentation | Missing documentation |

---

## 📅 Timeline at a Glance

| Week | Phase | Focus | Agents |
|---|---|---|---|
| 1 | Phase 0 | Foundation (Auth, Schema, CRUD) | Architect, Backend, QA, Reviewer, Doc |
| 2–3 | Phase 1 | Core Model Editor | Architect, Frontend, Backend, QA, Reviewer |
| 4–5 | Phase 2 | Asset Valuation & Questions | Backend, Frontend, QA, Reviewer |
| 6–7 | Phase 3 | Findings & Risk Measures | Backend, Frontend, QA, Reviewer |
| 8 | Phase 4 | Reports & Export | Backend, Frontend, QA, Reviewer |
| 9–10 | Phase 5 | KI-Assistenz (optional) | Architect, Backend, Frontend, QA |
| 11–12 | Phase 6 | Polish & Hardening | Code-Reviewer, Backend, Frontend, QA |

---

## ✅ Success Indicators (by EOD Week 12)

- ✅ All Phase 0–4 features implemented
- ✅ Test coverage ≥ 85%
- ✅ Zero critical/high blockers
- ✅ Customer feedback: NPS ≥ 7/10
- ✅ Performance: <1s for 200-node diagram
- ✅ Ready for MVP beta launch

---

## 🎓 Learning Resources

- [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) – How phases are structured
- [orchestrator-agent-instructions.md](agents/orchestrator-agent-instructions.md) – See examples of gap analysis, priority shifts
- [PROJECT_LOGS.md](PROJECT_LOGS.md) – Real examples of decision-making & logging

---

**Last Updated:** 2026-02-11  
**Version:** 1.0  
**Owner:** Orchestrator Agent

---

*This guide ensures everyone understands: What we're building, Why, Who does what, When, and How we measure success.*
