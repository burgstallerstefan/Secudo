# Market Requirements – Testudo

**Document:** `MARKET_REQUIREMENTS.md`  
**Last Updated:** 2026-02-11  
**Owner:** Orchestrator Agent

---

## Current Customer Segment Analysis

### Segment A: Manufacturing Engineers (Primary)
- Company Size: 50–500 employees
- Pain Point: Complex supply chains, multiple system integrations
- Priorities:
  1. ✅ Visual diagram editor (intuitive, no learning curve)
  2. ✅ Fast question answering (10 min survey → assessment)
  3. ✅ Clear risk visualization (red/yellow/green)

### Segment B: Consultants & System Integrators
- Company Size: 1–50 employees
- Pain Point: Managing assessments for multiple clients
- Priorities:
  1. ✅ Multi-project support
  2. ✅ Report customization
  3. ✅ Batch operations

### Segment C: Enterprise Security Teams
- Company Size: 1000+ employees
- Pain Point: IEC 62443 compliance at scale
- Priorities:
  1. ✅ Advanced RBAC & audit trails
  2. ✅ API for integration with other tools
  3. ✅ High-availability deployment options

---

## Feature Priority Matrix (MVP Release)

### 🔴 CRITICAL (Must-Have)

| Feature | Priority | Status | Rationale |
|---|---|---|---|
| Authentication & Authorization | ✅ P0 | In Design | Foundation, all features depend on it |
| Canonical Model (Graph Editor) | ✅ P0 | Planned | Core feature, customers want intuitive UI |
| Asset Valuation | ✅ P0 | Planned | Customers need to assess criticality |
| Norm Questions (IEC 62443) | ✅ P0 | Planned | Compliance requirement, market-critical |
| Findings Auto-Generation | ✅ P0 | Planned | Customers value automation |
| Risk Calculation | ✅ P0 | Planned | Key decision-making tool |
| PDF Report | ✅ P0 | Planned | Customers need exportable results |

### 🟡 HIGH (Important, but can defer post-MVP)

| Feature | Priority | Target | Rationale |
|---|---|---|---|
| Dark Mode | P1 | Week 3–4 | Consultant feedback: "long sessions cause eye strain" |
| Keyboard Shortcuts | P1 | Week 4–5 | Power users want speed |
| Data Objects on Edges | P1 | Week 2–3 | Nice for granular tracking, not blocking |
| Multi-language (EN/DE) | P2 | Post-MVP | Some customers in DE-speaking regions |

### 🟢 MEDIUM (Nice-to-Have, MTV+)

| Feature | Priority | Target | Rationale |
|---|---|---|---|
| Mobile-responsive UI | P2 | Week 10+ | Some customers use tablets, not critical |
| Advanced Filtering | P2 | Post-MVP | Can use basic filters initially |
| Bulk Import (CSV) | P2 | Post-MVP | Improves UX, not blocking |
| KI-Assistenz (Text→Model) | P3 | Post-MVP | Nice-to-have, complex implementation |
| Performance Optimization | P1 | Ongoing | <1s for 200 nodes is target |

---

## Performance Requirements

Based on customer feedback & market benchmarks:

| Metric | Target | Reasoning |
|---|---|---|
| Page Load | < 3s | Standard SaaS expectation |
| Diagram Render | < 1s for 200 nodes | Customers report lag with complex architectures |
| Model Save | < 500ms | Users don't want to wait |
| Question Load | < 2s | Assessment flow should feel snappy |
| Report Generation | < 3s | PDF export shouldn't block UI |
| Search/Filter | < 500ms | Real-time feedback needed |

**Note:** Customers complained about similar tools being "sluggish" → performance is  **competitive differentiator**.

---

## UX/Design Feedback

### What customers LIKE (competitive advantage)
- ✅ Drag-drop editor (not code-based)
- ✅ Clear hierarchy visualization
- ✅ One-click report export
- ✅ Simple assessment flow (not overwhelming)

### What customers DISLIKE (about competitors)
- ❌ Clunky, slow UI
- ❌ Too many clicks to do simple things
- ❌ Unclear data flow (where is data stored?)
- ❌ No dark mode (survey: 60% want it)
- ❌ No mobile support
- ❌ Slow PDF generation

### Design Priorities (for MVP)
1. **Visual Clarity:** Easy to understand what components do
2. **Responsive Performance:** Diagram editor feels instant
3. **Task Completion:** Assess system in < 30 min
4. **Report Quality:** Professional, printable PDFs

---

## Competitive Landscape

### Competitor A: "DiagramWorks"
- ✅ Strengths: Beautiful UI, responsive
- ❌ Weaknesses: Weak on compliance, no authority definitions
- 💰 Price: $500/month
- 📊 Market Share: 15%

### Competitor B: "RiskMatrix"
- ✅ Strengths: Advanced risk calculations, audit trails
- ❌ Weaknesses: Clunky UI, steep learning curve
- 💰 Price: $2000/month (enterprise)
- 📊 Market Share: 8%

### Testudo Differentiation
- 🎯 **Best of Both:** Beautiful UI + Rigorous Compliance
- 🎯 **Speed:** 10-min assessment flows
- 🎯 **Price:** $299/month (undercut competitors, capture market)
- 🎯 **Open:** Will support custom questions (Roadmap)

---

## Customer Feedback Highlights (Q1 2026)

Direct quotes from interviews:

> **Customer 1 (Manufacturing Lead):**  
> "I need to model our 50-machine factory. If the tool is slow, I'll switch. Also, dark mode please – we work late."

> **Customer 2 (Security Consultant):**  
> "I manage 15 client assessments. I need multi-project support and fast PDF reports. I'll pay for that."

> **Customer 3 (Enterprise IT Manager):**  
> "Compliance is mandatory. Must audit who changed what. Dark mode is luxury, but must-have for our team."

---

## Market Constraints & Opportunities

### Constraints
- ⚠️ **Timeline:** Competitors already exist, need MVP in 12 weeks
- ⚠️ **Budget:** Limited R&D, must prioritize ruthlessly
- ⚠️ **Tech Debt:** Will accumulate early, plan refactor in roadmap

### Opportunities
- 💡 **Unsolved Problem:** Easy, intuitive + Compliant = unique
- 💡 **Market Growth:** IEC 62443 adoption ↑ 40% YoY
- 💡 **SME Segment:** Competitors focus on enterprise, we can own SME
- 💡 **API First:** Enablement for integrations (Slack, Jira, etc.)

---

## Launch Strategy

### MVP Launch Criteria (Week 12)
All 🔴 CRITICAL features done, ≥ 80% test coverage, <5 known bugs

**Go-to-Market:**
- Beta with 5 friendly customers
- Target 1000 sign-ups in Q2
- Measure: Conversion rate from free trial → paid

### Post-MVP Roadmap (Q2–Q3)
- Phase 1: High-priority features (dark mode, shortcuts, data objects)
- Phase 2: Performance optimization (target <500ms everywhere)
- Phase 3: KI-Assistenz (text-to-model)
- Phase 4: Enterprise features (advanced RBAC, audit)

---

## Pricing & Revenue Model

### Proposed Pricing (MVP Launch)
| Tier | Price | Limits | Target |
|---|---|---|---|
| Starter | $99/month | 2 projects, 5 team members | SMEs, startups |
| Professional | $299/month | ∞ projects, 25 team members | Mid-market, consultants |
| Enterprise | Custom | Unlimited, SSO, SLA | Enterprise teams |

**Revenue Goal:** $50k MRR by end of Q2 2026

---

## Regulatory & Compliance Notes

- ✅ GDPR: Data stored in EU (AWS Frankfurt)
- ✅ SOC 2 Type II: Plan for later, not MVP
- ✅ IEC 62443: Use as reference for question bank
- ✅ No customer data will be used for model training (privacy-first)

---

## Risk & Mitigation

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Slow diagram editor (>1s) | High | Critical | Performance testing early, optimize DB queries |
| Customers want custom questions | High | Medium | Plan API + custom question support for Q2 |
| Competitive price war | Medium | High | Differentiate on UX, not price |
| Security breach | Low | Critical | Security audit pre-launch, pen testing |

---

## Success Metrics (MVP)

Track these weekly with Orchestrator:

```
Week 1–4:   Features: % of P0 items done
Week 5–8:   Quality: Test coverage, bug count
Week 9–12:  Polish: Performance, design refinement

Launch KPIs:
- Conversion: 10% of beta sign-ups → paid
- Retention: 80% retention after 30 days
- NPS: ≥ 40 (good for SaaS)
- Issue: <5 critical bugs reported
```

---

## Decision Log

| Date | Decision | Reasoning | Owner |
|---|---|---|---|
| 2026-02-11 | MVP focuses on P0 features only | Timeline constraints, quality first | Orchestrator |
| 2026-02-11 | Dark mode deferred to Post-MVP | 60% want it, but not blocking | Orchestrator |
| 2026-02-11 | Target $299/month pricing | Capture SME + mid-market segments | Product Lead |

---

## Next Review

**Next Market Check:** 2026-02-18 (weekly)

**Action Items:**
- [ ] Get feedback from 3 more customers (by Feb 14)
- [ ] Competitive pricing analysis (by Feb 14)
- [ ] UX research with tablet users (by Feb 20)

---

**Last Updated:** 2026-02-11  
**Next Review:** 2026-02-18  
**Owner:** Orchestrator Agent
