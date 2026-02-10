# Agent4Socials

Agent4Socials is a social media scheduling platform for **Instagram**, **YouTube**, and **TikTok**. Built with Next.js, NestJS, Prisma, and BullMQ.

## Project Structure

- `apps/web`: Next.js frontend (Tailwind CSS, Lucide Icons, Axios).
- `apps/api`: NestJS backend (Prisma, Passport, BullMQ, S3-compatible storage).

## Tech Stack

- **Frontend**: Next.js 16, Tailwind CSS, Axios, Lucide React.
- **Backend**: NestJS, Prisma, BullMQ, Redis, PostgreSQL (Supabase).
- **Infrastructure**: Docker Compose (local), Supabase, S3/R2.

## Setup

1. **Install** (from repo root):
   ```bash
   npm install
   ```

2. **Environment**:
   Copy `.env.example` to `.env` and `apps/api/.env`. Set `DATABASE_URL` (Supabase pooler URL with `?pgbouncer=true`).

3. **Database** (first time):
   ```bash
   cd apps/api && npx prisma migrate deploy
   ```
   (Use pooler URL in `.env` for the app; use direct URL for migrations if pooler fails.)

4. **Redis** (for scheduling): Run locally with `docker-compose up -d` or use Upstash in production.

5. **Run**:
   ```bash
   npm run dev:api   # backend at http://localhost:3001
   npm run dev:web   # frontend at http://localhost:3000
   ```

## Documentation

See [SETUP.md](./SETUP.md) for production deployment (Vercel, domain, OAuth, R2).
