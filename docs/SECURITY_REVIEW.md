# Security Review — Smart Q Palette

Review date: 2026-11-19
Review branch: `independent-platform-cleanup`
Scope: source code and checked-in Supabase migrations only. This is a static review, not a live database assessment.

## Status and safety boundary

- This review was performed against the repository's checked-in source and migration history.
- No production database, Supabase project, deployment, or user data was changed.
- The independent development branch is now linked to the new Supabase project `igntxwcitbjnafgrrcot` (`https://igntxwcitbjnafgrrcot.supabase.co`, region `eu-west-1`). The connected project was verified `ACTIVE_HEALTHY` on 2026-11-19.
- The new project currently has **zero application tables and zero migration records**. No application migrations or Edge Functions have been deployed to it.
- The old project `gotqwaqemszscdpgzdxp` remains the existing/live backend and has not been modified by this migration work.
- `supabase/config.toml` on `independent-platform-cleanup` points to the new project. This is a development-branch configuration change only; Netlify production environment variables and deployment have not been changed.
- This document does not claim that the live database currently has exactly these policies. Migration history can differ from the deployed schema.

## Critical findings

### 1. Live Quiz answer and score integrity

Evidence:
- `quiz_rooms.questions` stores question JSON including `correct_answer`, `explanation`, and `exam_hint`.
- The migration grants broad authenticated SELECT access to quiz rooms through an unrestricted SELECT policy.
- `QuizRoom.tsx` reads the room row directly, calculates correctness and points in the browser, inserts answer rows, and updates participant scores from the browser.
- The migration permits participants to update their own participant row and permits users to insert their own answer rows. It does not constrain score fields or validate answers server-side.

Impact:
- Participants may inspect answer keys before answering.
- A modified client can submit fabricated correctness/answer data or alter its score.
- Host actions such as advancing the quiz must be authorized and validated by a trusted server-side operation.

Required remediation:
- Move room creation, joining, answer validation, scoring, timer validation, and question advancement to authenticated Edge Functions or tightly controlled database RPCs.
- Do not return answer keys or explanations in participant-facing room payloads before the answer is submitted/closed.
- Restrict direct INSERT/UPDATE/DELETE privileges and RLS policies so clients cannot write authoritative scores, correctness, room state, or answer keys.
- Preserve safe realtime updates using a sanitized public representation or server-generated events.
- Make free-session quota checks atomic and server-side.

### 2. Profile self-update includes privileged subscription fields

Evidence:
- The initial profile migration creates a broad UPDATE policy with `USING (auth.uid() = user_id)` and no column-level restriction.
- Later migrations add `is_subscribed`, `free_live_quiz_used`, and AI usage counters to the same profile table.
- The client reads subscription fields to decide access.

Impact:
- Unless the deployed database has additional column grants, triggers, or policies not represented here, a user may be able to update their own subscription or usage counters directly.

Required remediation:
- Remove client ability to write privileged billing and quota columns.
- Update subscription state only from verified payment webhooks/server-side code.
- Update quotas atomically in trusted server-side operations.
- Keep user-editable profile fields separate from billing/entitlement fields where practical.

### 3. Custom exam payloads and results are publicly readable

Evidence:
- The custom exams migration creates an unrestricted SELECT policy on `custom_exams`, whose `questions` JSONB column may contain complete exam content and answer data.
- The same migration creates unrestricted SELECT and INSERT policies on `custom_exam_results`, which stores student names, scores, and submitted answers.

Impact:
- Anyone able to query the exposed tables may read shared exam payloads and result records, including personal/student information. Public read may be intentional for share-code access, but unrestricted table access is broader than a share-code workflow.

Required remediation:
- Replace unrestricted table reads with a share-code-gated server-side lookup that returns only fields needed to take the exam.
- Keep answer keys private until the attempt is submitted and graded.
- Scope result reads to the exam creator/admin and the relevant student/attempt token.
- Validate result submissions server-side and prevent arbitrary score writes.

## High-priority findings

### 4. Shared exam table has unrestricted SELECT

The shared exams migration allows anyone to select every row in `shared_exams`. If the table is intended to support share-code access, use a controlled lookup rather than exposing all share records and metadata.

### 5. Payment row creation is client-accessible

The role/payment migration allows a user to insert their own payment row. A pending payment row is not proof of payment, but the server-side payment flow must ensure that client-created rows cannot grant entitlements, overwrite trusted references, or interfere with verification. Review the complete Paystack initialize, verify, and webhook flow before changing this policy.

### 6. Admin role and security-definer functions require review

The migrations define `has_role` as SECURITY DEFINER and use it in policies. Review function execute grants, search path, ownership, and deployed definitions. The signup trigger assigning admin based on a hard-coded email (`peteroche53@gmail.com`) should be replaced with a controlled bootstrap process after confirming the intended application administrator. Do not infer that the Supabase project login email must automatically be the platform's administrator identity.

### 7. Paystack verification does not adequately bind the transaction to the user

Source review of `supabase/functions/paystack-verify/index.ts` found that it verifies a Paystack reference and then activates the profile for the currently authenticated `userId`, but it does not first prove that the referenced payment row belongs to that same user. It also does not validate the expected amount/currency against the stored payment record before activating the subscription.

Source review of `supabase/functions/paystack-webhook/index.ts` found that the handler only rejects an invalid signature when a signature header is present; a missing signature is not rejected. It trusts `metadata.user_id` when upgrading a profile and does not first bind the successful transaction to a matching pending payment row and expected amount/currency.

Required remediation:
- Require a valid Paystack signature on every webhook event (except CORS preflight).
- Match the Paystack reference to an existing pending payment record; verify ownership, amount in kobo, currency, and successful status.
- Make entitlement activation idempotent and derive the account to upgrade from the trusted payment record, not arbitrary webhook metadata or a client-supplied user ID.
- Ensure the initialize endpoint accepts only server-defined plan amounts or validates requested plans against a server-side price catalogue.
- Add tests for missing/invalid signatures, wrong user, wrong amount/currency, unknown reference, duplicate webhook, and valid payment.

## Safe implementation sequence

1. Correct project is confirmed: `igntxwcitbjnafgrrcot`; inspect the new project's Data API exposure/default grants before schema creation.
2. Complete the source-to-schema dependency map, including every page, hook, admin screen, Edge Function, storage bucket, and realtime subscription.
3. Design and test server-side Live Quiz operations and sanitized participant payloads.
4. Tighten profile, custom exam, result, payment, and role policies without disrupting existing product flows.
5. Build a reproducible migration set and database tests. Do not copy the legacy SQL policies blindly.
6. Deploy the backend to a non-production preview and run adversarial tests using separate student, host, and admin accounts.
7. Only after successful verification and explicit approval, switch the Netlify preview environment, validate the app end-to-end, and then plan production rollout.

## Verification still required

- Confirm deployed policies and grants for every affected table.
- Test that one student cannot read another student's private results.
- Test that participants cannot retrieve answer keys before answering.
- Test that a participant cannot alter their own score or another participant's score.
- Test that a non-host cannot start, advance, or end a room.
- Test that users cannot change subscription/quota fields from the client.
- Test valid and invalid Paystack callbacks and webhook replay behavior.

## Important limitation

This document records code-level risks and remediation requirements. It is not a security certification and does not establish the state of the live Supabase database.


## Additional migration dependency map (2026-11-19)

The following client access patterns were traced from the current branch. This is the compatibility checklist for the independent schema and APIs:

| Feature | Current client-side dependencies | Migration requirement |
|---|---|---|
| CBT practice | `questions`, `exam_sessions`, `user_history`, `user_seen_questions`, `profiles` | Preserve subject/question selection and session history; move trial/quota writes to trusted atomic operations. |
| Custom exam builder/taker | `custom_exams`, `custom_exam_results`, `profiles`, `ai-tutor` Edge Function | Preserve share-code workflow; use server-side exam retrieval/grading so answer keys and student results are not exposed. |
| Live quiz | `quiz_rooms`, `quiz_participants`, `quiz_answers`, `online_presence`, Realtime | Server-authoritative room lifecycle, answer validation, scores and quota; publish only safe room state to participants. |
| Billing/admin | `payments`, `profiles`, `user_roles`, Paystack initialize/verify/webhook | Server-verified payment ownership, amount/currency checks, idempotent subscription updates; admin-only management. |
| Digital library | `digital_library`, private Storage bucket `library` | Preserve private object access and add explicit Storage policies for intended subscribers/admins. |
| Admin content | `questions`, `digital_library`, `profiles`, `payments` | Gate all writes through a trusted admin-role check; do not rely on client route guards alone. |
| Presence | `online_presence`, `profiles`, Realtime | Keep user identity immutable and scope reads to the minimum presence information needed by the UI. |

## Current migration gate

The next implementation unit is **the auth/profile/roles and core CBT schema**, but it must not be applied until its full client compatibility and RLS tests are ready. The current empty Supabase project is an intentional clean starting point, not a completed migration. The new project's clean advisor output is only a baseline and is not evidence that the application schema has passed security review.
