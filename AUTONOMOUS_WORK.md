# How to Delegate Work Autonomously to Copilot

**Maximize AI Efficiency – Minimize Confirmations**

---

## Overview

You don't need to confirm every step. Here's how to set up autonomous work:

---

## Method 1: Detailed Todo List (Immediate Tasks)

### How it works
Give me a comprehensive list of tasks **with full context**. I'll execute them in order without asking for permission.

### Example

```
# Sprint: Phase 0 Foundation – Model Editor Backend (EOD 2026-02-13)

## Database Schema
- [ ] Create Prisma schema with:
  - User, Project, ProjectMembership entities
  - ModelNode with parentNodeId (hierarchical)
  - ModelEdge with source/target
  - DataObject, ComponentData, EdgeDataFlow tables
  - All with createdAt, updatedAt, author fields
  - Use UUID primary keys
- [ ] Create migration file
- [ ] Generate Prisma client
- [ ] Seed test data (3 example hierarchies)

## Backend API Routes
- [ ] POST /api/projects/[id]/model/nodes → Create node
- [ ] PUT /api/projects/[id]/model/nodes/[nodeId] → Update node
- [ ] DELETE /api/projects/[id]/model/nodes/[nodeId] → Delete + cascade
- [ ] GET /api/projects/[id]/model/hierarchy → Get full tree
- [ ] POST /api/projects/[id]/model/edges → Create edge
- [ ] Input validation with Zod
- [ ] RBAC checks (Editor+ only)
- [ ] Error handling for cycle detection

## Testing
- [ ] Unit tests for cycle detection
- [ ] Integration tests for all routes
- [ ] Authorization tests
- [ ] Edge case: self-parent prevention

## Documentation
- [ ] JSDoc comments on all functions
- [ ] API endpoint documentation
- [ ] Database schema diagram (Mermaid)

**Deadline:** EOD 2026-02-13  
**Priority:** HIGH  
**Blockers:** None known
```

Then I'll:
1. ✅ Create files in correct structure
2. ✅ Write code following best practices
3. ✅ Add tests
4. ✅ Document everything
5. ✅ Commit with meaningful messages
6. ✅ Report completion in PROJECT_LOGS.md

**No confirmations needed** – I just do it.

---

## Method 2: Agent Invocation (Complex Tasks)

### How it works
Use SubAgents for complex, multi-step work. I invoke them autonomously.

### Example

```
Orchestrator, invoke code-architect for:

"Design complete Testudo MVP datamodel

Context:
- Hierarchical components (parentNodeId approach)
- Data objects with 2 relationship types (at-rest, in-transit)
- Audit fields (createdAt, updatedAt, author)
- Performance targets: support 200 nodes, efficient queries
- PostgreSQL + Prisma

Deliverables:
1. Complete Prisma schema
2. ER diagram (Mermaid)
3. Indexes & performance notes
4. Migration strategy
5. ADR-001: Why this design

Deadline: 2026-02-12 EOD
Priority: CRITICAL
```

I'll invoke the agent, collect results, and integrate them into the project.

---

## Method 3: Async Project Board

### How it works
You update PROJECT_LOGS.md or a task file. I check it regularly and execute.

### Example in PROJECT_LOGS.md

```
### [2026-02-11 18:00:00] WORK_QUEUE

**Pending Autonomous Tasks:**
- [ ] Initialize Next.js project with src/ structure
- [ ] Create 20 component stubs (Button, Card, Modal, etc.)
- [ ] Set up Prisma + PostgreSQL
- [ ] Write 10 API route handlers
- [ ] Create GitHub CI/CD workflows

**When to execute:** Next business day  
**Priority:** HIGH  
**Autonomy:** FULL – don't ask, just do
```

I'll execute these without asking.

---

## Method 4: Standing Instructions (Recurring Tasks)

### How it works
Define rules that I follow automatically.

### Example

```
# Standing Instructions for Testudo Development

## Code Quality
- Always: Add TypeScript types (no `any`)
- Always: Include JSDoc comments on functions
- Always: Write unit tests for logic
- Always: Format with Prettier before committing

## Logging
- Always: Log agent completions to PROJECT_LOGS.md
- Always: Include timestamps (YYYY-MM-DD HH:MM:SS)
- Always: Update metrics dashboard if changed

## File Naming
- Components: PascalCase (Button.tsx)
- Hooks: camelCase with `use` prefix (useProject.ts)
- Utilities: camelCase (validateEmail.ts)

## GIT
- Always: Use conventional commits (feat:, fix:, docs:, test:, refactor:)
- Always: Create feature branch before starting
- Always: Request code review before merge

## When in doubt: Ask once, then apply to all similar cases
```

I'll follow these automatically going forward.

---

## Method 5: Context in File Headers

### How it works
Add context & instructions directly in code files.

### Example: components/ModelEditor.tsx

```typescript
/**
 * ModelEditor – Main diagram canvas for canonical system model
 * 
 * PRIORITY: P0 – Customer-critical feature
 * REQUIREMENTS: 
 *   - Drag-drop nodes & edges
 *   - Hierarchical support (expand/collapse)
 *   - Real-time validation
 *   - Auto-save to backend
 * 
 * TECH: React Flow v11, zustand for state
 * 
 * TESTING: Must test:
 *   - Cycle prevention (user tries to create parent cycle)
 *   - Drag-drop performance (200+ nodes)
 *   - Keyboard navigation
 * 
 * TODO: 
 *   - [ ] Add keyboard shortcuts (see SHORTCUTS in docs)
 *   - [ ] Optimize rendering for 500+ nodes
 *   - [ ] Add undo/redo support
 * 
 * KNOWN_ISSUES:
 *   - React Flow v11 has lag at 500+ nodes (optimize with virtualization)
 *   - Hierarchy collapse doesn't hide child edges (next sprint)
 */
```

I'll read these comments and incorporate requirements into my work.

---

## Method 6: Use Cases / Scenarios

### How it works
Describe a user flow, I implement it end-to-end.

### Example

```
# Use Case: User Creates Project with Components

**Actor:** Manufacturing Engineer (User)  
**Precondition:** User logged in, at dashboard

**Flow:**
1. Click "New Project"
2. Modal opens: Name, Description, Norm (IEC 62443)
3. User enters: "Factory 2024", "Metal stamping...", "IEC 62443"
4. Click "Create"
5. Project opens in Model Editor
6. User drags "Component" onto canvas
7. Renames to "Hydraulic Press"
8. Right-click → "Add as parent"
9. Drags another component under it
10. Names it "Control Unit"
11. System auto-saves (visible checkmark)
12. User refreshes page
13. Hierarchy is persisted ✅

**What to implement:**
- [ ] Project creation flow (API + UI)
- [ ] Model Editor with drag-drop
- [ ] Parent-child UI (indent, collapsible)
- [ ] Auto-save with visual feedback
- [ ] Persistence check (refresh test)

**Testing:** Manually test flow 2x (Chrome + Firefox)
```

I'll implement the entire flow autonomously.

---

## Method 7: Specification-Driven Development

### How it works
Give me a detailed spec, I build to it without asking for clarification.

### Example: spec-model-editor.md

```markdown
# Specification: Model Editor Component

## Component Props
```typescript
interface ModelEditorProps {
  projectId: string
  readonly?: boolean
  onSave?: (model: ModelSnapshot) => void
  autoSaveIntervalMs?: number
}
```

## Behavior
- **Render:** React Flow canvas with custom nodes/edges
- **Interactions:**
  - Left-click node → Select (highlight, show details panel)
  - Right-click node → Context menu (edit, delete, add child)
  - Drag node → Move position (throttled 16ms)
  - Shift+drag → Create edge
  - Delete key → Delete selected
  - Ctrl+S → Manual save
- **Auto-save:** Save to API every 5s if changed (debounced)
- **Hierarchy:** Indent child nodes, show parent breadcrumb on hover
- **Performance:** Virtualize rendering for 200+ nodes

## State Management
- Use zustand store (modelStore)
- Optimistic updates (update UI immediately, sync backend)
- Undo/redo queue (max 20 actions)

## Testing Required
- [ ] All interactions work as specified
- [ ] Auto-save triggers correctly
- [ ] Performance: <100ms for 500 nodes
- [ ] Accessibility: Tab navigation, ARIA labels

## Definition of Done
- ✅ All interactions working
- ✅ 90%+ test coverage
- ✅ JSDoc documented
- ✅ Code review approved
- ✅ Merged to main
```

I'll implement exactly to spec without asking questions.

---

## Summary: Autonomy Levels

| Level | Instructions | Confirmation | Best For |
|---|---|---|---|
| 1. Manual | "Do X" | Yes, after each step | Simple, well-defined tasks |
| 2. Todo List | Comprehensive list | No | Week-long sprints |
| 3. Agents | "Invoke architect for Y" | No | Complex multi-step work |
| 4. Async Board | Tasks on shared board | No | Ongoing work queue |
| 5. Standing Rules | "Always follow X" | No | Recurring patterns |
| 6. Specifications | Detailed spec doc | No | Feature implementation |
| 7. Use Cases | User flow + impl steps | No | End-to-end features |

---

## Recommendation for Testudo

### Optimal Setup:
1. **Daily:** You update MARKET_REQUIREMENTS.md (customer feedback)
2. **Daily morning:** I run Orchestrator review → log to PROJECT_LOGS.md
3. **Agents & Specs:** You write detailed task specs (like "spec-model-editor.md")
4. **Autonomous:** I implement without asking (agents, code, tests, docs)
5. **Weekly:** Code review + merge
6. **Weekly:** You review PROJECT_LOGS.md for decisions & blockers

### Zero-Confirmation Workflow:

```
You:
├─ Update MARKET_REQUIREMENTS.md (Monday morning)
└─ Write detailed specifications (Monday morning)

Me (Copilot):
├─ Run 09:00 Orchestrator review
├─ Invoke agents (code-architect, backend-specialist, etc.)
├─ Implement code (no asking, just building)
├─ Write tests & documentation
├─ Commit with meaningful messages
└─ Update PROJECT_LOGS.md with completion

You:
└─ Review progress Friday afternoon, adjust next week's priorities
```

---

## Key: Clarity in Initial Request

The **less ambiguous** your initial request, the more autonomously I can work.

### ❌ Ambiguous
"Build the model editor"

### ✅ Clear
"Build ModelEditor.tsx with:
- React Flow canvas
- Drag-drop nodes (HierarchyComponent type)
- Right-click context menu (add child, delete, edit)
- Auto-save every 5s
- Keyboard: Delete key removes, Ctrl+S manual save
- Performance: <100ms for 500 nodes
- Tests: interaction tests + performance bench
- Target: LOC < 500 (break into subcomponents)
- Deadline: EOD 2026-02-14"

---

## Start Today

Give me any of these and I'll execute **immediately without confirmation**:

1. ✅ A detailed todo list (tasks w/ full context)
2. ✅ A specification document (how it should work)
3. ✅ An agent invocation (complex task delegation)
4. ✅ Use case scenario (user flow + impl requirements)
5. ✅ Standing instructions (recurring rules)

No "Can I...?" questions. Just execution.

---

**Your move:** Pick a task, describe it clearly, and let me build. 🚀
