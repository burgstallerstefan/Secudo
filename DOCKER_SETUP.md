# Docker Setup Guide

## 🐳 Quick Start

### Prerequisites
- Docker Desktop installed ([download](https://www.docker.com/products/docker-desktop))
- Docker Compose (included with Docker Desktop)

### Development Environment

#### 1. Create `.env.local` from template
```bash
cp .env.example .env.local
```

#### 2. Start Docker containers
```bash
docker-compose up -d
```

This will:
- Create PostgreSQL 16 database container
- Build and run Next.js application
- Run Prisma migrations automatically
- Seed test data

#### 3. Access the application
- **App:** http://localhost:3000
- **Database:** localhost:5432 (use `pgAdmin` or similar to connect)

#### 4. View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f postgres
```

### Database Management

#### Run Prisma migrations
```bash
docker-compose exec app npx prisma migrate dev
```

#### Reset database
```bash
docker-compose exec app npx prisma migrate reset
```

#### Access database with psql
```bash
docker-compose exec -it postgres psql -U tusedo -d tusedo_dev
```

#### View Prisma Studio
```bash
docker-compose exec app npx prisma studio
```

### Rebuild Containers

```bash
# Rebuild without cache
docker-compose build --no-cache

# Restart services
docker-compose restart

# Full reset (removes volumes)
docker-compose down -v
docker-compose up -d
```

### Production Deployment

1. Set production environment variables in `.env.local`:
```env
NODE_ENV=production
NEXTAUTH_SECRET=<generate-secure-key>
DATABASE_URL=<production-postgres-url>
```

2. Build production image:
```bash
docker build -t tusedo:latest .
```

3. Run container:
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL=<your-db-url> \
  -e NEXTAUTH_SECRET=<your-secret> \
  tusedo:latest
```

### Troubleshooting

**Port 5432 already in use:**
```bash
# Change postgres port in docker-compose.yml
# Or stop conflicting container
docker ps
docker stop <container-id>
```

**Migrations failing:**
```bash
# Check database is healthy
docker-compose ps
docker-compose logs postgres

# Manually reset
docker-compose down -v
docker-compose up -d
```

**App not connecting to database:**
```bash
# Verify DATABASE_URL in .env.local uses 'postgres' (docker hostname)
# Not 'localhost' which won't work inside container
DATABASE_URL="postgresql://tusedo:password@postgres:5432/tusedo_dev"
```

---

**Happy Developing! 🚀**
