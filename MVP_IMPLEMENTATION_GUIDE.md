# MVP Implementation Guide

**Status:** ✅ Phase 0 & 1 Complete (Foundation + Core APIs)  
**Date:** February 11, 2026  
**Owner:** Orchestrator Agent

---

## Quick Start

### Prerequisites
```bash
- Node.js 18+ 
- PostgreSQL 13+
- npm or yarn
```

### 1. Install Dependencies

```bash
npm install
npm install bcrypt @types/bcrypt  # Required for auth
```

### 2. Environment Setup

Create `.env.local`:
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/testudo"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"  # Run: openssl rand -base64 32

# Base URL
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
```

### 3. Database Setup

```bash
# Create database and tables
npx prisma migrate dev --name init

# (Optional) Seed demo data
npx prisma db seed
```

### 4. Start Development Server

```bash
npm run dev
```

Visit: http://localhost:3000/register

---

## Architecture Overview

### Tech Stack
- **Frontend:** Next.js 14 (React 18), Tailwind CSS, React Flow
- **Backend:** Next.js Route Handlers, Next Auth
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth v4 (Credentials Provider)

### Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/
│   │   ├── auth/register/
│   │   ├── projects/              # Project CRUD
│   │   └── projects/[projectId]/
│   │       ├── nodes/             # Graph nodes
│   │       ├── edges/             # Graph edges
│   │       ├── asset-values/      # Risk assessments
│   │       ├── questions/         # IEC 62443 questions
│   │       ├── answers/           # User responses
│   │       ├── findings/          # Auto-generated findings
│   │       └── measures/          # Remediation tasks
│   ├── dashboard/                 # Project list
│   ├── projects/[projectId]/     # Editor UI
│   ├── login/                    # Auth
│   └── register/
├── components/
│   ├── ui/                       # Radix UI wrappers
│   ├── common/                   # Button, etc.
│   └── project/                  # GraphEditor
├── lib/
│   ├── auth.ts                   # Auth utilities
│   ├── prisma.ts                 # Prisma client
│   ├── rbac.ts                   # Role-based access
│   └── utils.ts
└── types/
    └── index.ts
```

---

## API Reference

### Authentication

#### POST /api/auth/register
Create new user account

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "jobTitle": "Security Engineer",
    "companyLevel": "Enterprise"
  }'
```

#### POST /api/auth/callback/credentials
(Handled by NextAuth - use signIn() client-side)

### Projects

#### GET /api/projects
List user's projects

```bash
curl -X GET http://localhost:3000/api/projects \
  -H "Authorization: Bearer <session>"
```

#### POST /api/projects
Create project

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Manufacturing Line A",
    "description": "Safety assessment",
    "norm": "IEC 62443"
  }'
```

#### GET /api/projects/[id]
Retrieve project details

#### PUT /api/projects/[id]
Update project (Admin only)

#### DELETE /api/projects/[id]
Delete project (Admin only)

### Graph Model

#### GET /api/projects/[projectId]/nodes
List all nodes (components)

#### POST /api/projects/[projectId]/nodes
Create component node

```bash
curl -X POST http://localhost:3000/api/projects/[projectId]/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PLC Controller",
    "category": "Component",
    "subtype": "Hardware",
    "description": "Safety-critical controller"
  }'
```

#### GET /api/projects/[projectId]/nodes/[nodeId]
Get node details

#### PUT /api/projects/[projectId]/nodes/[nodeId]
Update node

#### DELETE /api/projects/[projectId]/nodes/[nodeId]
Delete node

### Edges (Interfaces)

#### GET /api/projects/[projectId]/edges
List all interfaces

#### POST /api/projects/[projectId]/edges
Create interface connection

```bash
curl -X POST http://localhost:3000/api/projects/[projectId]/edges \
  -H "Content-Type: application/json" \
  -d '{
    "sourceNodeId": "node1_id",
    "targetNodeId": "node2_id",
    "name": "Server API",
    "protocol": "REST",
    "direction": "A_TO_B"
  }'
```

### Asset Valuation

#### GET /api/projects/[projectId]/asset-values
List asset values

#### POST /api/projects/[projectId]/asset-values
Set asset criticality

```bash
curl -X POST http://localhost:3000/api/projects/[projectId]/asset-values \
  -H "Content-Type: application/json" \
  -d '{
    "assetType": "Node",
    "assetId": "node_id",
    "value": 8,
    "comment": "Critical for safety"
  }'
```

### Questions (IEC 62443)

#### GET /api/projects/[projectId]/questions
List all assessment questions

#### POST /api/projects/[projectId]/questions
Add new question

#### POST /api/projects/[projectId]/answers
Submit answer to question

### Findings & Measures

#### GET /api/projects/[projectId]/findings
List security findings

#### POST /api/projects/[projectId]/findings
Create finding

#### GET /api/projects/[projectId]/measures
List remediation measures

#### POST /api/projects/[projectId]/measures
Create measure (action item)

---

## User Workflows

### Scenario 1: Create First Assessment

1. Register account at `/register`
2. Login at `/login`
3. View dashboard at `/dashboard`
4. Click "New Project"
5. Fill project details (name, norm=IEC 62443)
6. Enter Graph Editor
7. Add nodes (PLC, HMI, Backend, etc.)
8. Connect with edges (REST, MQTT, etc.)
9. Set asset values (criticality 1-10)
10. Answer norm questions
11. Review auto-generated findings & measures
12. Export PDF report

### Scenario 2: Collaborate on Assessment

1. Project Admin invites team members
   - (Future: /api/projects/[id]/members)
2. Editors can modify model & add answers
3. Viewers can only read
4. Findings update automatically based on answers
5. Admin reviews & finalizes findings
6. Team reviews measures in Priority order

---

## Role-Based Access Control (RBAC)

### System Roles
- **User:** Basic authenticated user
- **Admin:** Can create projects

### Project Roles
- **Admin:** Can edit project, invite members, delete
- **Editor:** Can modify model, answer questions
- **Viewer:** Read-only access

### Enforcement
- All APIs check `ProjectMembership.role`
- Editor routes verify role in middleware
- Cascading deletes respect project isolation

---

## Testing the MVP

### Test Coverage Goals
- ✅ Auth (register, login, logout)
- ✅ Project CRUD
- ✅ Node/Edge creation + hierarchy
- ✅ Asset valuation
- ✅ Question answering
- ⏳ Finding auto-generation
- ⏳ Risk calculation
- ⏳ PDF export
- ⏳ Multi-user collaboration

### Manual Test Checklist

```bash
# 1. Registration & Login
[ ] Register new user
[ ] Login with credentials
[ ] Redirect to /dashboard

# 2. Project Creation
[ ] Create new project
[ ] See project in list
[ ] Open project editor

# 3. Graph Editor
[ ] Add component node
[ ] Add human node
[ ] Add system node
[ ] Create edge between nodes
[ ] Update node name
[ ] Delete node (cascade)

# 4. Asset Valuation
[ ] Set asset value (1-10)
[ ] Update value
[ ] View all asset values

# 5. Questions
[ ] View IEC 62443 questions
[ ] Answer question (Yes/No)
[ ] Add comment
[ ] See answer history

# 6. RBAC
[ ] Login as Admin → can delete
[ ] Login as Editor → cannot delete project
[ ] Invite Editor → can edit nodes
[ ] Invite Viewer → cannot edit
```

---

## Deployment (Docker)

```dockerfile
# See Dockerfile in root
docker build -t testudo:latest .
docker run -e DATABASE_URL="postgresql://..." -p 3000:3000 testudo:latest
```

---

## Known Limitations & Next Steps

### Phase 2 (Findings & Measures Auto-Generation)
- [ ] Implement automatic finding generation from answers
- [ ] Risk calculation: value × severity
- [ ] Measure templates per norm question
- [ ] Batch measure creation

### Phase 3 (AI Assistant)
- [ ] LLM integration for "Model from Text"
- [ ] Structured JSON output parsing
- [ ] User review + confirmation UI
- [ ] Rollback capability

### Phase 4 (Reports & Export)
- [ ] PDF template design
- [ ] HTML → PDF generation (Playwright)
- [ ] Email delivery
- [ ] Report scheduling

### Phase 5 (Advanced Features)
- [ ] Dark mode toggle
- [ ] Mobile responsiveness
- [ ] Bulk imports/exports (CSV)
- [ ] API rate limiting
- [ ] Audit log UI
- [ ] Data object management (data-at-rest/in-transit)

---

## Support & Debugging

### Check logs
```bash
npm run dev
# Watch for errors in terminal
```

### Reset database
```bash
npx prisma migrate reset
# Equivalent to DROP + recreate schema
```

### View database state
```bash
npx prisma studio
# Opens web UI to browse tables
```

### Common Issues

**Q: "Database connection failed"**  
A: Check `DATABASE_URL` in `.env.local`, ensure PostgreSQL running

**Q: "Session undefined"**  
A: Clear browser cookies, logout and log back in

**Q: "Node creation fails"**  
A: Check project membership & role in database

---

## Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [NextAuth Docs](https://next-auth.js.org)
- [React Flow Docs](https://reactflow.dev)
- [IEC 62443 Standard](https://www.iec.ch/publications-and-standards/standards/iec-62443)

---

**Last Updated:** 2026-02-11  
**Status:** Ready for local testing
