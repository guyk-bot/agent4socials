# AI Writing Assistant

The app includes an **optional** AI assistant that helps users write post descriptions in the Composer. It uses your **brand context** (target audience, tone of voice, product description, etc.) so generated copy matches your voice.

## Setup

1. **Environment variable**  
   Get an API key from [OpenAI](https://platform.openai.com/api-keys) and set it in:
   - **Local:** `apps/web/.env` → `OPENAI_API_KEY=sk-proj-...`
   - **Production (Vercel):** Project → Settings → Environment Variables → add `OPENAI_API_KEY` with the same value.

   The backend uses the **OpenAI API** (default model `gpt-4o-mini`) for post descriptions, inbox reply suggestions, and reel captions/analysis. Do not commit the key; use env only. Optional: set `OPENAI_CHAT_MODEL` to use a different model.

2. **Brand context**  
   Users set their brand context once under **Dashboard → AI Assistant**: target audience, tone of voice (with examples), product description, and any extra context. This is stored per user and used when generating descriptions.

3. **Composer**  
   In **Create Post**, section **3. Content**, the optional **Generate with AI** button opens a small form: “What’s this post about?”, optional extra instructions, and optional platform. If the user hasn’t set brand context, they’re prompted to go to **Dashboard → AI Assistant** first.

## API

- **GET /api/ai/brand-context** – Returns the current user’s brand context (or `null`).
- **PUT /api/ai/brand-context** – Saves/updates brand context (JSON body: `targetAudience`, `toneOfVoice`, `toneExamples`, `productDescription`, `additionalContext`).
- **POST /api/ai/generate-description** – Generates a post description. Body: `{ topic?, prompt?, platform? }`. Requires brand context to be set; uses `OPENAI_API_KEY` and the OpenAI Chat Completions API.

All routes require authentication (Bearer token from Supabase session).

## Database

Brand context is stored in the `BrandContext` table (one row per user). Run migrations with the **direct** Supabase URL (port 5432) as in [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md) if you haven’t already.
