# AI provider setup

ROCKCBT's AI Tutor is independent of the Lovable AI gateway. It calls providers from the Supabase Edge Function, so provider credentials stay server-side and are never shipped to the browser.

## Provider order

1. **Groq** is tried first.
2. **Gemini** is tried if Groq cannot serve the request (for example, rate limiting or an upstream outage).
3. If neither provider is configured or both fail, the function returns a service-unavailable response.

Fallback happens before a response stream is sent. An interruption after streaming has started cannot be transparently replayed through the other provider.

## Configure secrets

In the Supabase Dashboard for the project used by this repository:

1. Open **Edge Functions** and then **Secrets** (project-level Edge Function secrets).
2. Add `GROQ_API_KEY` using the API key from your Groq account.
3. Add `GEMINI_API_KEY` using the API key from Google AI Studio.
4. Save the secrets, then deploy the `ai-tutor` Edge Function.

Optional server-side model overrides:

- `GROQ_MODEL` — defaults to `llama-3.3-70b-versatile`.
- `GEMINI_MODEL` — defaults to `gemini-2.5-flash`.

Do not add these provider keys to `.env`, `.env.example`, Netlify's public `VITE_*` variables, frontend source code, or GitHub. They belong only in Supabase Edge Function secrets.

## Authentication

The `ai-tutor` function is configured with `verify_jwt = true`. The signed-in browser session sends its Supabase access token in the `Authorization` header and the project's publishable key in `apikey`. Do not replace the access token with the publishable key.

## Deployment and verification

Deploy the `ai-tutor` function to the same Supabase project configured by `VITE_SUPABASE_URL`. After deployment, sign in to ROCKCBT and send a short AI Tutor prompt. Confirm that a response streams successfully. To test fallback, temporarily remove or invalidate the Groq secret in a non-production test window and confirm Gemini responds, then restore the correct Groq secret.

The repository change does not deploy the function or set project secrets automatically. Those steps require access to the correct Supabase project.
