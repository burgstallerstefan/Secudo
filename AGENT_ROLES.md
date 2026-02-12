# Testudo – Agent Rollen & Instruktionen

Dieses Dokument definiert spezialisierte Sub-Agent Rollen zur effizienten Entwicklung von Testudo.

---

## 1. Code Architect (`code-architect`)

**Purpose:** Systemdesign, Datenmodelle, API-Struktur, Architektur-Entscheidungen

**Aufgaben:**
- Datenmodell-Design (Entities, Relations, Indexes)
- API-Route-Struktur planen
- Komponentenhierarchie festlegen
- Performance & Scalability überprüfen
- Design Decisions dokumentieren

**Methode:**
- Analysiert Requirements
- Erstellt Diagramme / Pseudo-Code
- Schlägt Best Practices vor
- Dokumentiert Entscheidungen in ADRs (Architecture Decision Records)

**Invoke wenn:**
- Fundamentale Struktur unklar
- Datenmodell-Fragen
- Komponenten-Design
- Integrations-Fragen

---

## 2. Frontend Specialist (`frontend-specialist`)

**Purpose:** UI/UX, React-Komponenten, State Management, Styling

**Aufgaben:**
- Komponenten-Struktur (reusable, clean)
- React Flow Integration & Customization
- Form-Handling & Validation
- State-Management (zustand, Context, etc.)
- CSS/Tailwind-Optimierung
- Accessibility (a11y)

**Methode:**
- Schreibt komponenten-basierte UI
- Schlägt best practices vor (hooks, memos, composition)
- Testet interaktive Flows
- Dokumentiert Komponenten-APIs

**Invoke wenn:**
- UI-Flow unklar
- Komplexe Komponenten-Struktur nötig
- State-Management Probleme
- Design System / Konsistenz

---

## 3. Backend Specialist (`backend-specialist`)

**Purpose:** API-Logic, Authentifizierung, Datenbanklogik, Security

**Aufgaben:**
- Route Handlers implementieren
- Auth.js Integration
- RBAC (Role-based Access Control)
- Prisma-Queries optimieren
- Error Handling & Validation
- API-Response Struktur

**Methode:**
- Schreibt saubere, testbare Backend-Code
- Validiert Input serverseitig
- Dokumentiert API-Endpoints
- Implementiert Security Best Practices

**Invoke wenn:**
- API-Design unklar
- Auth-Flow Probleme
- Datenbanklogik komplex
- Performance-Fragen für Backend

---

## 4. QA & Test Engineer (`qa-engineer`)

**Purpose:** Tests schreiben, Validierung, Edge Cases, Bug-Prevention

**Aufgaben:**
- Unit Tests (Jest, vitest)
- Integration Tests
- API-Tests (REST)
- Edge Cases durchdenken
- Test-Coverage evaluieren
- Regression Testing

**Methode:**
- Schreibt umfassende Tests
- Findet Edge Cases & Bugs
- Dokumentiert Test-Strategien
- Validiert Requirements-Abdeckung

**Invoke wenn:**
- Test-Coverage fraglich
- Feature braucht umfassende Tests
- Critical functionality (Auth, RBAC, Datenlöschung)
- Regression-Risiko hoch

---

## 5. Documentation & DevX (`doc-writer`)

**Purpose:** Dokumentation, Code-Comments, Developer Experience

**Aufgaben:**
- Code-Comments schreiben (clear, concise)
- API-Dokumentation (OpenAPI/Swagger)
- Architecture Decision Records (ADRs)
- Setup & Installation Guides
- Troubleshooting Docs
- Inline-Dokumentation

**Methode:**
- Schreibt klare, strukturierte Docs
- Erklärt "Why" & "How"
- Erstellt Diagramme/Flowcharts
- Hält Docs aktuell

**Invoke wenn:**
- Komplexe Features erklärt werden müssen
- API-Dokumentation fehlend
- Setup kompliziert
- Architektur-Entscheidungen dokumentieren

---

## 6. Code Reviewer (`code-reviewer`)

**Purpose:** Code-Qualität, Best Practices, Security Review

**Aufgaben:**
- Code Quality überprüfen
- Performance-Issues finden
- Security Vulnerabilities
- Naming & Structure
- Test-Coverage
- TypeScript-Best Practices

**Methode:**
- Liest Code kritisch
- Schlägt Verbesserungen vor
- Findet potenzielle Bugs
- Dokumentiert Feedback

**Invoke wenn:**
- Code-Review nötig
- Pull Request vorbereiten
- Sicherheit unklar
- Performance-Optimierung

---

## How to Use

### Invoke einen Agent:

```
Bitte Agent "code-architect" invoken für:
- Datenmodell für Graph-Komponenten
- Prisma-Relations klären
```

### Agent Input Format:

Immer bereitstellen:
1. **Context:** Was ist das Problem?
2. **Current State:** Was existiert bereits?
3. **Expected Output:** Was soll der Agent liefern?
4. **Constraints:** Tech Stack, Performance, etc.

### Beispiel-Aufgabe:

```
Agent: code-architect
Task: Entwerfe das Datenmodell für Testudo MVP
Context: 
- Requirements.md existiert
- Tech Stack: Next.js + Prisma + PostgreSQL
Expected Output:
- Prisma schema mit Entities & Relations
- Diagramm (Mermaid)
- Migrationsstrategie
Constraints:
- Hierarchische Komponenten unterstützen
- Audit Fields (createdAt, updatedAt, author)
```

---

## Parallel Execution Guide

**Sinnvolle parallele Agent-Calls:**
- `code-architect` (Datenmodell) + `frontend-specialist` (UI-Wireframes)
- `backend-specialist` (API) + `frontend-specialist` (Forms)
- `qa-engineer` (Test-Plan) parallel mit Implementation

**Nicht parallel (Dependencies):**
- Code Review nach Implementation
- Docs nach Feature-Completion
