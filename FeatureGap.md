# Feature Gap Analysis – Secudo

This document outlines missing features and planned enhancements for the Secudo Security Assessment Tool. These features are essential for enterprise-grade security assessment and compliance management.

---

## Overview

Secudo currently provides core functionality for security assessment including:
- ✅ Canonical system modeling (graph-based)
- ✅ Asset value assessment
- ✅ IEC 62443 compliance questions
- ✅ Risk calculation and findings generation
- ✅ Measure tracking and remediation
- ✅ PDF report export

However, several critical features for enterprise deployment and advanced security analysis are missing or require enhancement.

---

## 1. Audit Trail

### Current State
- **Basic Audit Fields**: All entities include `createdAt`, `updatedAt`, and `author` fields
- **Limited Tracking**: Only creation and modification timestamps are captured
- **No Change History**: Previous values are not retained when records are updated
- **No User Actions Log**: User activities beyond CRUD operations are not tracked

### Gap Description
A comprehensive audit trail system is needed to meet enterprise security and compliance requirements (TISAX, ISO 27001, SOC 2). Organizations need to:
- Track who made what changes and when
- Review historical changes to security assessments
- Demonstrate compliance during audits
- Detect unauthorized or suspicious modifications
- Rollback changes when needed

### Required Features

#### 1.1 Change History Tracking
- **Entity Version History**: Store complete history of changes for critical entities
  - Projects (name, description, standard changes)
  - ModelNodes (name, category, subtype, parent changes)
  - ModelEdges (protocol, direction changes)
  - AssetValues (criticality score changes)
  - FinalAnswers (answer value changes)
  - Findings (severity, status changes)
  - Measures (status, priority changes)

- **Change Record Structure**:
  ```typescript
  interface AuditLog {
    id: string
    entityType: string      // "ModelNode" | "Finding" | "Measure" | etc.
    entityId: string         // ID of the modified entity
    action: string           // "CREATE" | "UPDATE" | "DELETE"
    userId: string           // Who made the change
    timestamp: DateTime      // When the change occurred
    changes: {
      field: string
      oldValue: any
      newValue: any
    }[]
    ipAddress?: string       // Source IP
    userAgent?: string       // Browser/client info
    projectId: string        // Project context
  }
  ```

#### 1.2 User Activity Logging
- Login/logout events
- Project access (view, edit attempts)
- Report generation and exports
- Failed authorization attempts
- Bulk operations (import, delete multiple)
- Role changes (ProjectMembership updates)

#### 1.3 Audit Trail UI
- **Admin Dashboard**: 
  - System-wide audit log viewer (for Admin users)
  - Filter by: user, date range, entity type, action type
  - Search by entity ID or project name
  
- **Project Audit Tab**:
  - Per-project change history
  - Timeline view of all modifications
  - User attribution for all changes
  - "Compare versions" feature to see diffs

#### 1.4 Compliance Reports
- Export audit logs to CSV/JSON for compliance audits
- Generate activity reports per user or time period
- Retention policies (configurable, e.g., 7 years for TISAX)

### Implementation Priority
**HIGH** – Required for enterprise customers and compliance certifications

### Estimated Effort
- Backend: 3-5 days (AuditLog entity, triggers, API endpoints)
- Frontend: 2-3 days (Audit viewer, timeline UI)
- Testing: 2 days (audit completeness, performance with large logs)

---

## 2. Versioning

### Current State
- **No Versioning System**: Projects and assessments exist in a single "live" state
- **No Snapshots**: Cannot create point-in-time snapshots of a project
- **No Comparison**: Cannot compare current state vs. previous versions
- **No Branching**: Cannot create alternative assessment scenarios

### Gap Description
Security assessments evolve over time. Organizations need to:
- Create baseline assessments and track changes over time
- Compare "before" and "after" states when system changes are made
- Maintain historical records for compliance audits
- Create "what-if" scenarios without affecting production assessments
- Revert to previous assessment states if needed

### Required Features

#### 2.1 Project Snapshots (Versions)
- **Manual Snapshots**: Users can create named snapshots at any time
  - "V1.0 - Initial Assessment (2024-01-15)"
  - "V2.0 - Post-Redesign Assessment (2024-06-01)"
  - "Baseline for ISO 27001 Certification"

- **Automatic Snapshots**: System creates snapshots automatically
  - Before bulk imports (e.g., AI model generation)
  - Before major deletions (e.g., deleting 10+ nodes)
  - On schedule (e.g., monthly snapshots)

- **Snapshot Scope**: Full project state including:
  - All ModelNodes, ModelEdges, DataObjects
  - All AssetValues
  - All Questions, Answers, FinalAnswers
  - All Findings, Measures
  - Project metadata and settings

#### 2.2 Version Management UI
- **Version List**:
  - Show all snapshots with creation date, author, label
  - Mark "current" version (live state)
  - Mark "baseline" version for comparisons
  
- **Snapshot Actions**:
  - Create new snapshot (with label and description)
  - View snapshot (read-only mode)
  - Compare versions (diff view)
  - Restore from snapshot (with confirmation dialog)
  - Delete old snapshots (with permissions check)

#### 2.3 Version Comparison
- **Side-by-Side Comparison**:
  - Graph visualization showing added/removed/changed nodes and edges
  - Asset value changes highlighted
  - Answer changes (Yes→No, N/A→Yes, etc.)
  - Finding severity changes
  - Measure status changes

- **Change Summary**:
  - "12 new components added"
  - "3 interfaces removed"
  - "5 asset criticality scores increased"
  - "8 findings resolved"
  - "Risk score: 67 → 52 (improved)"

#### 2.4 Branching (Optional Advanced Feature)
- Create assessment "branches" for different scenarios
  - "Current Architecture"
  - "Proposed Architecture (Option A)"
  - "Proposed Architecture (Option B)"
- Compare branches to aid decision-making
- Merge branches back to main assessment

### Implementation Priority
**MEDIUM-HIGH** – Important for mature customers, key differentiator vs. competitors

### Estimated Effort
- Backend: 5-7 days (Snapshot storage, restore logic, comparison algorithms)
- Frontend: 4-5 days (Version management UI, diff visualization)
- Testing: 3 days (data integrity, restore correctness, large project performance)

---

## 3. Attack Paths

### Current State
- **No Attack Path Modeling**: System models components and interfaces but does not trace attack scenarios
- **No Threat Analysis**: No built-in threat modeling (STRIDE, MITRE ATT&CK)
- **Static Risk Assessment**: Risk is calculated per finding but not across attack chains
- **No Lateral Movement Analysis**: Cannot identify how an attacker might move through the system

### Gap Description
Modern security assessments require understanding how attackers might exploit interconnected vulnerabilities. Organizations need to:
- Identify realistic attack scenarios (e.g., "Internet → Firewall → HMI → PLC")
- Understand the impact of chained vulnerabilities
- Prioritize fixes based on attack likelihood and impact
- Visualize attack surfaces and critical pathways
- Align with frameworks like MITRE ATT&CK

### Required Features

#### 3.1 Threat Actor Definition
- **Threat Profile Presets**:
  - External Attacker (Low Skill) – Opportunistic, automated attacks
  - External Attacker (High Skill) – Nation-state, APT groups
  - Insider Threat (Malicious) – Disgruntled employee
  - Insider Threat (Negligent) – Accidental exposure
  - Supply Chain Attacker – Compromised vendor/partner

- **Custom Threat Profiles**:
  - Skill level (1-10)
  - Access level (None, Physical, Network, Privileged)
  - Motivation (Financial, Espionage, Sabotage, Curiosity)
  - Resources (Budget, Tools, Time)

#### 3.2 Attack Path Discovery
- **Automated Path Finding**:
  - Algorithms to discover attack paths from entry points to high-value assets
  - Entry points: Public-facing interfaces, physical access, removable media
  - Goals: High-value assets (components with AssetValue >= 8)
  
- **Attack Step Modeling**:
  - Each edge (interface) can be traversed if:
    - No authentication required (Finding: "Missing Authentication")
    - Weak authentication (Finding: "Weak Credentials")
    - Known vulnerability exists (Finding with CVE reference)
    - Physical access available (Human → Component edge)
  
- **Privilege Escalation**:
  - Horizontal movement: Same privilege level across components
  - Vertical escalation: From user to admin privileges
  - Track required privileges at each step

#### 3.3 Attack Path Visualization
- **Graph Overlay Mode**:
  - Toggle "Show Attack Paths" in graph editor
  - Highlight entry points in red
  - Draw attack paths with dashed red lines
  - Annotate each step with attack technique (e.g., "Brute Force", "SQL Injection")
  - Show high-value targets in orange/red glow

- **Attack Path List View**:
  - Table of all discovered paths
  - Columns: Path Name, Steps, Entry Point, Target Asset, Likelihood, Impact
  - Sort by criticality (Likelihood × Impact)
  - Expand row to see step-by-step details

- **Path Details Panel**:
  - Show each step in the attack chain
  - Display required findings/vulnerabilities
  - Show likelihood per step (product of probabilities)
  - Show cumulative impact
  - Link to relevant findings and measures

#### 3.4 Attack Path Risk Scoring
- **Path Likelihood**: Product of probabilities for each step
  - Missing authentication: 90% likelihood
  - Weak password: 70% likelihood
  - Known CVE (unpatched): 80% likelihood
  - Physical access required: 20% likelihood
  
- **Path Impact**: Maximum asset value along the path
  - If path reaches asset with value=10 (critical), impact=10
  
- **Path Risk Score**: Likelihood × Impact × 10
  - Scale: 1-100 (consistent with existing risk scoring)
  - Classify: Critical (81-100), High (51-80), Medium (21-50), Low (1-20)

#### 3.5 MITRE ATT&CK Integration (Optional)
- Map attack steps to ATT&CK techniques
  - "Brute Force" → T1110 (Brute Force)
  - "SQL Injection" → T1190 (Exploit Public-Facing Application)
  - "Lateral Movement via SSH" → T1021.004 (Remote Services: SSH)
- Generate ATT&CK Navigator JSON for export
- Filter findings by ATT&CK tactic (Initial Access, Execution, Persistence, etc.)

#### 3.6 Remediation Prioritization
- **Path-Based Prioritization**:
  - Identify "choke points" – vulnerabilities that appear in multiple critical paths
  - Suggest fixing choke points first to disrupt many attack paths
  - Show "paths blocked" metric when a finding is resolved

- **Cost-Benefit Analysis**:
  - Fixing Finding X blocks 3 critical paths and 5 high-severity paths
  - Estimated effort: 2 days
  - Risk reduction: 45 points

### Implementation Priority
**HIGH** – Strong competitive differentiator, aligns with advanced threat modeling best practices

### Estimated Effort
- Backend: 7-10 days (Graph algorithms, path finding, likelihood modeling)
- Frontend: 5-7 days (Visualization, path list, filtering)
- Integration: 3 days (Connect findings to attack steps, MITRE ATT&CK mapping)
- Testing: 4 days (Algorithm correctness, performance with large graphs, edge cases)

---

## 4. Risk Heatmap

### Current State
- **Basic Risk Scoring**: Individual findings have risk scores (1-100)
- **Risk Summary**: Report shows counts by severity (Critical/High/Medium/Low)
- **No Visual Risk Overview**: No heatmap or matrix visualization
- **No Time Series**: No historical risk tracking
- **No Comparative Analysis**: Cannot compare risk across projects or system components

### Gap Description
Security teams need intuitive visual representations of risk distribution to:
- Quickly identify the riskiest areas of the system
- Communicate risk to non-technical stakeholders
- Track risk reduction over time
- Compare risk across multiple projects or assessments
- Prioritize resources based on visual risk density

### Required Features

#### 4.1 Risk Heatmap Visualization

##### 4.1.1 Component Risk Heatmap
- **2D Grid Layout**:
  - X-axis: System hierarchy (Machine → Control → PLC → etc.)
  - Y-axis: Risk severity (Critical, High, Medium, Low)
  - Cell color intensity: Number of findings at that level
  
- **Alternative: Node Color Coding**:
  - Graph nodes colored by aggregated risk score
  - Green (0-20): Low risk
  - Yellow (21-50): Medium risk
  - Orange (51-80): High risk
  - Red (81-100): Critical risk
  
- **Interactive Features**:
  - Hover over component: Show risk score, finding count, top 3 findings
  - Click component: Navigate to findings list filtered for that component
  - Toggle layers: Show/hide different risk types (confidentiality, integrity, availability)

##### 4.1.2 Likelihood vs. Impact Matrix
- **Classic Risk Matrix**:
  - X-axis: Impact (1-10, derived from asset value)
  - Y-axis: Likelihood (1-10, derived from finding exploitability)
  - Scatter plot: Each finding as a dot
  - Quadrants: 
    - High Likelihood + High Impact (red zone): Immediate action
    - High Likelihood + Low Impact (orange): Monitor closely
    - Low Likelihood + High Impact (orange): Contingency planning
    - Low Likelihood + Low Impact (green): Accept risk

- **Drill-Down**:
  - Click on any dot to see finding details
  - Select multiple dots to bulk-assign measures
  - Filter by component, interface, data object

##### 4.1.3 Risk Heatmap by Data Class
- Show which data types have the highest risk exposure:
  - Credentials: 12 high-risk findings
  - Safety-Relevant: 8 high-risk findings
  - Personal Data: 5 medium-risk findings
  - Intellectual Property: 3 high-risk findings
  - Telemetry: 2 low-risk findings

- Useful for prioritizing data protection efforts

##### 4.1.4 Interface Risk Heatmap
- Visualize risk across system interfaces:
  - Show all edges (interfaces) as rows
  - Color by risk level (aggregated findings for that interface)
  - Sort by risk score descending
  - Highlight trust boundaries (e.g., Internet ↔ Internal Network)

#### 4.2 Risk Trends Over Time

##### 4.2.1 Historical Risk Dashboard
- **Line Chart**: Risk score trend over time
  - Total risk score (sum of all finding risk scores)
  - Average risk per finding
  - Count of critical/high/medium/low findings
  
- **Time Range Selector**: Last 7 days, 30 days, 90 days, 1 year, All time

- **Annotations**: Mark significant events
  - "System redesign implemented (2024-03-15)"
  - "Security patch applied (2024-04-20)"
  - "New assessment snapshot created"

##### 4.2.2 Risk Velocity Metrics
- **Risk Increase Rate**: New findings added per week
- **Risk Reduction Rate**: Findings resolved per week
- **Net Risk Change**: Overall trend (improving vs. deteriorating)
- **Burn-Down Chart**: Visualize progress toward zero critical/high findings

#### 4.3 Comparative Risk Analysis

##### 4.3.1 Multi-Project Risk Comparison
- **Portfolio View** (for users with access to multiple projects):
  - Bar chart: Risk score per project
  - Sort by: Total risk, Critical finding count, Average asset criticality
  - Filter: By standard (IEC 62443, ISO 27001), by team, by status
  
- **Use Cases**:
  - Identify which product lines have the highest security debt
  - Allocate security resources to highest-risk projects
  - Report to leadership on portfolio-wide risk posture

##### 4.3.2 Before/After Comparison
- **Side-by-Side Heatmaps**:
  - Compare two versions of the same project
  - Highlight improvements (green) and regressions (red)
  - Show "risk delta" (e.g., -15 points)
  
- **Use Cases**:
  - Validate that security improvements had desired effect
  - Communicate ROI of security initiatives
  - Justify security budgets

#### 4.4 Heatmap Export & Sharing

##### 4.4.1 Static Export
- Export heatmap as PNG/SVG for presentations
- Include in PDF reports (automatically)
- Embed in external dashboards (via image URL)

##### 4.4.2 Live Dashboard (Optional)
- Public or team-shared read-only dashboard URL
- Auto-refresh every 5 minutes (for NOC/SOC displays)
- Single-sign-on (SSO) integration for secure access

#### 4.5 Risk Heatmap Configuration

##### 4.5.1 Customizable Thresholds
- Allow admins to configure risk score thresholds:
  - Critical: >= 80 (default) or custom value
  - High: >= 50 (default) or custom value
  - Medium: >= 20 (default) or custom value
  - Low: < 20
  
- Align with organizational risk appetite

##### 4.5.2 Color Scheme Options
- Color-blind friendly palettes
- Light mode / Dark mode variants
- Corporate branding colors (customizable)

### Implementation Priority
**HIGH** – Essential for executive dashboards, strong visual impact, improves user experience

### Estimated Effort
- Backend: 4-5 days (Risk aggregation APIs, time-series data, comparative queries)
- Frontend: 6-8 days (Heatmap components, D3.js charts, interactive features)
- Design: 2-3 days (Color schemes, layout, responsive design)
- Testing: 3 days (Visual regression, accessibility, performance with large datasets)

---

## 5. Additional Feature Gaps (Brief Summary)

### 5.1 Advanced RBAC
- **Current**: Basic 3-tier roles (Admin, Editor, Viewer)
- **Gap**: No fine-grained permissions (e.g., "can edit findings but not assets")
- **Priority**: MEDIUM

### 5.2 API Tokens & Integrations
- **Current**: No API authentication outside of web sessions
- **Gap**: Cannot integrate with CI/CD pipelines, external tools
- **Priority**: MEDIUM

### 5.3 Compliance Mapping
- **Current**: IEC 62443 questions hardcoded
- **Gap**: No support for ISO 27001, NIST CSF, CIS Controls, TISAX
- **Priority**: MEDIUM

### 5.4 AI Enhancements
- **Current**: Mock LLM with pattern-based extraction
- **Gap**: No real LLM integration (GPT-4, Claude, Ollama)
- **Priority**: MEDIUM (already planned)

### 5.5 Collaboration Features
- **Current**: Multi-user answers supported but no real-time collaboration
- **Gap**: No comments, @mentions, notifications, activity feed
- **Priority**: LOW-MEDIUM

### 5.6 Mobile App
- **Current**: Responsive web design (basic)
- **Gap**: No native mobile apps (iOS, Android)
- **Priority**: LOW (MVP+)

---

## Implementation Roadmap

### Phase 1 (Q1 2024) – MVP Completion
- ✅ Core modeling, assessment, reporting
- ✅ Basic audit fields
- 🚧 Ollama AI integration (in progress)

### Phase 2 (Q2 2024) – Enterprise Readiness
- **Audit Trail** (4 weeks)
- **Risk Heatmap** (3 weeks)
- Advanced RBAC (2 weeks)
- API tokens (1 week)

### Phase 3 (Q3 2024) – Advanced Security Features
- **Attack Paths** (6 weeks)
- **Versioning** (4 weeks)
- Compliance mapping (3 weeks)

### Phase 4 (Q4 2024) – Collaboration & Scale
- Real-time collaboration (4 weeks)
- Performance optimization (2 weeks)
- Multi-tenancy for SaaS (3 weeks)

---

## Success Metrics

For each feature, we will track:
- **Adoption Rate**: % of active projects using the feature
- **User Satisfaction**: Feature-specific NPS scores
- **Business Impact**: 
  - Audit Trail: Time saved in compliance audits (target: 40% reduction)
  - Versioning: Frequency of version comparisons (target: 2+ per project)
  - Attack Paths: % of projects with documented attack scenarios (target: 60%)
  - Risk Heatmap: Executive dashboard views (target: 3+ per week)

---

## Conclusion

These four features – **Audit Trail**, **Versioning**, **Attack Paths**, and **Risk Heatmap** – represent critical gaps in Secudo's current functionality. Implementing them will:

1. ✅ Meet enterprise compliance requirements (TISAX, ISO 27001, SOC 2)
2. ✅ Enable advanced threat modeling and risk analysis
3. ✅ Provide clear visual communication of security posture
4. ✅ Differentiate Secudo from competitors
5. ✅ Support larger customers (500+ employees, multi-project environments)

**Recommended Priority Order:**
1. **Risk Heatmap** (quick win, high visual impact, improves all user personas)
2. **Audit Trail** (table stakes for enterprise sales, compliance requirement)
3. **Attack Paths** (strong differentiator, aligns with modern threat modeling)
4. **Versioning** (important for mature customers, enables longitudinal analysis)

---

**Last Updated**: 2026-02-13  
**Owner**: Product Team  
**Next Review**: Q2 2024 Planning Session
