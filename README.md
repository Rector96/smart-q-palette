# Smart Q Palette

Smart Q Palette is a React, Vite and TypeScript CBT practice platform backed by Supabase.

## Run locally

1. Install Node.js (an LTS version) and npm.
2. Clone this repository and enter the project directory.
3. Install dependencies: `npm install`
4. Copy `.env.example` to `.env` and fill in your Supabase project URL and publishable key.
5. Start the development server: `npm run dev`

## Environment configuration

The browser app uses:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never place Supabase service-role keys, private API keys, or server secrets in browser environment variables or committed files.

## Build and test

```sh
npm run build
npm run test
npm run lint
```

## Deployment

Deploy independently to a Vite-compatible static host, including Netlify. Configure the two Vite Supabase variables in the host settings, build with `npm run build`, and publish `dist`. Netlify SPA routing is configured in `netlify.toml`.

## Backend

Supabase remains the external backend for authentication, database, realtime, and Edge Functions. Review and apply database migrations and deploy functions through Supabase tooling as needed.

## Independence

This repository is maintained independently. Lovable is not required to run, build, or deploy the project.
