# Cron Job Setup for Insero Social Hub

The `/api/publish` endpoint needs to run every 15 minutes to check for and publish scheduled posts. Choose one of these options:

---

## Option 1: Vercel Cron Jobs (Recommended if deploying on Vercel)

Already configured in `vercel.json`. When you deploy to Vercel, the cron will run automatically.

To secure the endpoint, set a `CRON_SECRET` environment variable in Vercel and the route will validate it via the `Authorization: Bearer <CRON_SECRET>` header that Vercel sends automatically.

---

## Option 2: Supabase pg_cron + Edge Function

1. Enable the `pg_cron` extension in Supabase (Database > Extensions > search "pg_cron" > Enable)

2. Create a Supabase Edge Function that calls your publish endpoint:

```sql
-- In the Supabase SQL Editor:
SELECT cron.schedule(
  'publish-posts',
  '*/15 * * * *',
  $$
  SELECT net.http_get(
    'https://YOUR_APP_URL/api/publish',
    headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  );
  $$
);
```

Note: This requires the `pg_net` extension to be enabled as well.

---

## Option 3: External Cron Service (cron-job.org)

1. Go to https://cron-job.org and create a free account
2. Create a new cron job:
   - **URL**: `https://YOUR_APP_URL/api/publish`
   - **Schedule**: Every 15 minutes (`*/15 * * * *`)
   - **Request Method**: GET
   - **Headers**: Add `Authorization: Bearer YOUR_CRON_SECRET`
3. Enable the job

---

## Security

Add `CRON_SECRET` to your `.env.local` (and production environment):

```
CRON_SECRET=your_random_secret_string_here
```

The `/api/publish` route checks for this header. If `CRON_SECRET` is not set in the environment, the auth check is skipped (useful for local development).
