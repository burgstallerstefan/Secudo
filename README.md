# Secudo – Product Security Assessment Tool

Webbasiertes Security-Assessment-Tool für Produkt- und Systemarchitekturen.  
Kombiniert ein **kanonisches Systemmodell** mit **normbasierten Fragen**, **Risikobewertung** und **automatischer Maßnahmenableitung**.

---

## Quick Start

### Voraussetzungen

- Docker Desktop ([Download](https://www.docker.com/products/docker-desktop))
- Docker Compose (in Docker Desktop enthalten)

### 1. Environment-Datei erstellen

```bash
cp .env.example .env
```

`.env` Inhalt:
```env
DATABASE_URL="postgresql://secudo:secudo-dev-password@postgres:5432/secudo_dev"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"   # openssl rand -base64 32
NEXT_PUBLIC_API_URL="http://localhost:3000/api"
DB_USER="secudo"
DB_PASSWORD="secudo-dev-password"
DB_NAME="secudo_dev"
OLLAMA_BASE_URL="http://ollama:11434"
OLLAMA_MODEL="qwen2.5:3b"
OLLAMA_AUTO_PULL="true"
OLLAMA_STATUS_CACHE_TTL_MS="15000"
```

### 2. Docker starten

```bash
# Standard (App + PostgreSQL)
docker compose up -d

# Optional: mit Ollama Service
docker compose --profile ai up -d
```

Das startet:
- PostgreSQL 16 Datenbank
- Next.js Applikation
- Prisma Migrations automatisch

Optional mit `--profile ai`:
- Ollama AI Service
- Modell-Pull via `ollama-init` (beim ersten Start kann das mehrere Minuten dauern)

### 3. Zugriff

- **App:** http://localhost:3000
- **Datenbank:** localhost:5432
- **Ollama API:** http://localhost:11434 (nur mit `--profile ai`)

### Standard-Admin Login

| Feld | Wert |
|---|---|
| E-Mail | `admin@admin.com` |
| Passwort | `Secudo4TheWin` |

---

## Ohne Docker (lokale Entwicklung)

### Voraussetzungen
- Node.js 18+
- PostgreSQL 13+

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed          # Optional: Test-Daten
npm run dev
```

---

## Tech Stack

| Bereich | Technologie |
|---|---|
| **Frontend** | Next.js 14, React 18, Tailwind CSS, React Flow |
| **Backend** | Next.js Route Handlers, NextAuth v4 |
| **Datenbank** | PostgreSQL 16, Prisma ORM |
| **Auth** | NextAuth (Credentials), bcrypt, JWT |
| **Validierung** | Zod |
| **Deployment** | Docker / Docker Compose |
| **KI-Assistenz** | Ollama + Qwen 2.5-Coder 3B (lokal, optional) |

---

## Projektstruktur

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/    # NextAuth Handler
│   │   ├── auth/register/          # Registrierung
│   │   ├── health/                 # Health Check
│   │   └── projects/               # Projekt CRUD
│   │       └── [projectId]/
│   │           ├── nodes/          # Graph-Knoten
│   │           ├── edges/          # Graph-Kanten
│   │           ├── asset-values/   # Asset-Bewertung
│   │           ├── questions/      # IEC 62443 Fragen
│   │           ├── answers/        # Antworten
│   │           ├── findings/       # Findings
│   │           ├── measures/       # Maßnahmen
│   │           ├── auto-generate/  # Auto-Generierung
│   │           └── ai/model-from-text/  # KI-Assistent
│   ├── dashboard/                  # Projektliste
│   ├── login/                      # Login
│   ├── register/                   # Registrierung
│   └── projects/[projectId]/       # Projekt-Editor
├── components/
│   ├── common/                     # Button, etc.
│   ├── project/                    # GraphEditor, Assessment, Report, AI
│   └── ui/                         # Dialog, Tabs
├── lib/
│   ├── auth.ts                     # Auth-Utilities
│   ├── auth-options.ts             # NextAuth Config
│   ├── prisma.ts                   # Prisma Singleton
│   ├── rbac.ts                     # Rollenlogik
│   ├── llm-service.ts             # KI-Service (Mock/Ollama)
│   ├── risk-service.ts            # Risikoberechnung
│   ├── model-hierarchy.ts         # Zyklen-Prüfung
│   ├── validation.ts              # Zod Schemas
│   └── utils.ts                   # Hilfsfunktionen
├── types/                          # TypeScript Definitionen
└── constants/                      # Enums, Schwellwerte
```

---

## API-Endpunkte (27)

### Authentifizierung (3)

```
POST   /api/auth/register                    # Registrierung
GET    /api/auth/[...nextauth]               # NextAuth Handler
POST   /api/auth/[...nextauth]               # Login
```

### Projekte (5)

```
GET    /api/projects                          # Projektliste
POST   /api/projects                          # Projekt erstellen
GET    /api/projects/[id]                     # Projekt Details
PUT    /api/projects/[id]                     # Projekt aktualisieren
DELETE /api/projects/[id]                     # Projekt löschen
```

### Kanonisches Modell (8)

```
GET    /api/projects/[id]/nodes               # Alle Knoten
POST   /api/projects/[id]/nodes               # Knoten erstellen
GET    /api/projects/[id]/nodes/[nid]         # Knoten Details
PUT    /api/projects/[id]/nodes/[nid]         # Knoten aktualisieren
DELETE /api/projects/[id]/nodes/[nid]         # Knoten löschen
GET    /api/projects/[id]/edges               # Alle Kanten
POST   /api/projects/[id]/edges               # Kante erstellen
DELETE /api/projects/[id]/edges/[eid]         # Kante löschen
```

### Assessment (6)

```
GET    /api/projects/[id]/asset-values        # Asset-Bewertungen
POST   /api/projects/[id]/asset-values        # Bewertung setzen
GET    /api/projects/[id]/questions            # Fragen
POST   /api/projects/[id]/questions            # Frage erstellen
GET    /api/projects/[id]/answers              # Antworten
POST   /api/projects/[id]/answers              # Antwort abgeben
```

### Findings & Maßnahmen (4)

```
GET    /api/projects/[id]/findings             # Findings
POST   /api/projects/[id]/findings             # Finding erstellen
GET    /api/projects/[id]/measures             # Maßnahmen
POST   /api/projects/[id]/measures             # Maßnahme erstellen
```

### KI & Auto-Generierung (4)

```
POST   /api/projects/[id]/ai/model-from-text  # Modell aus Text
POST   /api/projects/[id]/auto-generate        # Findings auto-generieren
GET    /api/projects/[id]/ai/ollama/status     # Ollama Runtime-Status
POST   /api/projects/[id]/ai/ollama/pull       # Konfiguriertes Modell nachladen
```

---

## Datenbank-Schema (13 Entities)

```
User                    # Benutzer (Auth + Profil)
Project                 # Projekte (Multi-Tenant)
ProjectMembership       # Rollen pro Projekt
ModelNode               # Knoten (Component/Human/System)
ModelEdge               # Kanten/Interfaces
DataObject              # Datenobjekte (Information Assets)
ComponentData           # Join: Node ↔ DataObject (Data-at-Rest)
EdgeDataFlow            # Join: Edge ↔ DataObject (Data-in-Transit)
AssetValue              # Kritikalitätsbewertung (1–10)
Question                # IEC 62443 Fragen
Answer / FinalAnswer    # Benutzer-Antworten + finale Antworten
Finding                 # Sicherheits-Findings
Measure                 # Maßnahmen
```

---

## Rollen & Berechtigungen (RBAC)

### Systemrollen

| Rolle | Beschreibung |
|---|---|
| User | Standard-Benutzer |
| Admin | Globaler Administrator |

### Projektrollen

| Rolle | Lesen | Bearbeiten | Verwalten |
|---|---|---|---|
| Viewer | ✅ | ❌ | ❌ |
| Editor | ✅ | ✅ | ❌ |
| Admin | ✅ | ✅ | ✅ |

- Alle API-Routen prüfen serverseitig Berechtigungen
- Projekt-Isolation: Benutzer sehen nur eigene Projekte
- Kaskadiertes Löschen respektiert Isolation

---

## Security

- bcrypt Passwort-Hashing (Salt Rounds: 10)
- JWT Session-Tokens (NextAuth, secure, httpOnly)
- CSRF-Schutz (NextAuth built-in)
- Zod-Validierung auf allen Inputs
- SQL-Injection-Schutz (Prisma parametrized queries)
- Cascade Deletes (keine verwaisten Daten)

---

## Docker-Befehle

```bash
# Starten
docker compose up -d

# Logs anzeigen
docker compose logs -f
docker compose logs -f app
docker compose logs -f postgres

# Optional AI-Services starten
docker compose --profile ai up -d

# Prisma Migrations
docker compose exec app npx prisma migrate dev

# Datenbank zurücksetzen
docker compose exec app npx prisma migrate reset

# Prisma Studio (DB-Browser)
docker compose exec app npx prisma studio

# Neu bauen (ohne Cache)
docker compose build --no-cache

# Komplett zurücksetzen (inkl. Volumes)
docker compose down -v
docker compose up -d
```

### Production Build

```bash
docker build -t secudo:latest .
docker run -p 3000:3000 \
  -e DATABASE_URL=<db-url> \
  -e NEXTAUTH_SECRET=<secret> \
  secudo:latest
```

---

## User Workflows

### 1. Projekt erstellen & Modell bauen

1. Registrieren / Login
2. Dashboard → "Neues Projekt"
3. Projektname + Norm (IEC 62443) eingeben
4. Graph-Editor öffnet sich
5. **Manuell:** Nodes hinzufügen (Typ, Name), Edges ziehen
6. **KI-Assistent:** System in Freitext beschreiben → Vorschau → Import

### 2. Assessment durchführen

1. Tab "Asset-Bewertung": Kritikalität pro Asset (1–10 Slider)
2. Tab "Norm-Fragen": IEC 62443 Fragen beantworten (Ja/Nein/N.A.)
3. Tab "Findings & Maßnahmen": Auto-generierte Findings + Maßnahmen verwalten

### 3. Report exportieren

1. Tab "Bericht": Echtzeit-Risiko-Zusammenfassung
2. "Export als PDF" → Browser-Print-Dialog

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| Port 5432 belegt | `docker ps` → anderen Container stoppen |
| DB-Verbindung fehlgeschlagen | `DATABASE_URL` in `.env` prüfen (im Docker: `postgres`, nicht `localhost`) |
| Migrations fehlgeschlagen | `docker compose down -v && docker compose up -d` |
| Session undefined | Browser-Cookies löschen, neu einloggen |

---

## Metriken

| Metrik | Wert |
|---|---|
| Code | ~4.600 LOC |
| API-Endpunkte | 27 |
| UI-Komponenten | 12 |
| DB-Entities | 13 |
| Tech Stack | Next.js 14 + React 18 + PostgreSQL + TypeScript |
