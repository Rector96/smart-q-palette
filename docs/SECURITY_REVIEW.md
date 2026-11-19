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


## Paystack and account-flow review (2026-11-19)

Reviewed source files: `supabase/functions/paystack-initialize/index.ts`, `paystack-verify/index.ts`, `paystack-webhook/index.ts`, `src/components/SubscriptionModal.tsx`, `src/pages/admin/AdminPayments.tsx`, and `src/pages/Profile.tsx`.

### Confirmed findings

- **Client-controlled payment amount:** the subscription modal sends `amount: 200000` and the initialize function accepts the request body's amount. The server must own the plan identifier and amount; never trust a browser-supplied amount.
- **Verification ownership gap:** `paystack-verify` verifies the supplied reference with Paystack but updates the payment row by reference without constraining it to the authenticated user's payment. It then upgrades the caller's profile by caller user ID. A caller could potentially use another user's valid reference to trigger an upgrade.
- **Verification integrity gaps:** the current verification handler checks only `verifyData.data?.status === "success"`; it does not check Paystack's top-level success flag, expected amount, currency, reference equality, or the stored pending payment's owner and plan before granting access.
- **Unsigned webhook acceptance:** `paystack-webhook` validates the signature only when the header exists. A missing signature currently does not reject the request. It must require the header and compare signatures using a constant-time comparison before processing.
- **Webhook trust in metadata:** the webhook upgrades `metadata.user_id` without first loading the pending payment row and matching its owner, expected amount, currency, and reference. It should use the stored payment row as the source of truth, with idempotent state transitions.
- **Admin payment controls are client-side:** `AdminPayments.tsx` directly updates payment status and profile subscription fields from the browser. Approval/rejection must move behind a server-side admin authorization check; UI route protection alone is insufficient.
- **Profile edits:** `Profile.tsx` only updates `full_name`, which is appropriate, but the database policy must explicitly prevent users from changing subscription and usage-control columns.

### Existing price behavior to preserve pending product confirmation

The current subscription modal describes a one-time lifetime plan priced at **₦2,000** and sends **200,000 kobo** to Paystack. Do not silently convert this into a recurring subscription or alter the price during migration. The backend should map a fixed server-side plan ID to this amount until the product owner approves a pricing change.

### Required implementation order

1. Define a server-owned plan catalogue and payment schema constraints.
2. Make payment initialization authenticate the caller and derive amount/currency from the plan ID, not request amount.
3. Make verification load the caller-owned pending payment, verify with Paystack, and compare reference, amount, currency, and status before an idempotent grant.
4. Require and securely validate Paystack webhook signatures; use the stored payment row, not untrusted metadata, to identify the account to update.
5. Move admin payment approval/rejection to an authenticated server-side admin operation.
6. Add tests for wrong owner, altered amount, wrong currency, missing/invalid signature, duplicate webhook, failed transaction, and unauthorized admin action.

**Migration safety:** these are source-code findings only. No new-project SQL, secrets, Edge Functions, Netlify variables, or production deployments were changed as part of this review.


## First independent database migration applied (2026-11-19)

Migration `20261119171145_secure_account_payment_foundation.sql` was applied to the new Supabase project `igntxwcitbjnafgrrcot` and committed to this branch.

### Tables created

- `profiles`: account display name, preferred subjects, and existing app counters/entitlement fields.
- `user_roles`: role assignments, with no client-side role mutation permissions.
- `payments`: owner-linked payment records with NGN currency, positive amount, constrained status, unique references, and plan identifier.

### Security controls

- RLS is enabled on all three tables.
- Authenticated users can read only their own profile, roles, and payment rows.
- Profile self-service updates are restricted by SQL column grants to `full_name` and `preferred_subjects`; subscription and usage counters are not client-editable.
- Payment and role writes are not granted to browser clients; privileged server-side operations are required.
- New auth users receive a profile via a trigger.
- Role lookup is isolated in a non-exposed `private` schema; the helper only answers for the calling user's own ID and has a fixed empty search path.
- No administrator account has been auto-promoted. Initial administrator assignment must be explicitly verified and performed through a trusted administrative process.

### Verification

- Supabase migration history records version `20261119171145`.
- `profiles`, `user_roles`, and `payments` exist and each reports RLS enabled.
- Security advisor returned no lints at verification time.
- Performance advisor reports three currently unused indexes. This is expected on a brand-new empty database; retain them because they support owner lookups as real user data arrives, and reassess after workload exists.

### Compatibility and rollout note

This is the account/payment foundation only. The remaining CBT, question bank, history, exam sessions, sharing, library, and live-quiz schema is not yet migrated. The current front-end and payment Edge Functions are not yet switched to the new project. Do not point production Netlify variables at this project until the remaining schema, secure payment handlers, storage, realtime, and end-to-end preview tests are complete.


### Follow-up privilege verification

A post-migration privilege test initially showed that authenticated users still inherited UPDATE capability on the subscription column. This was corrected immediately with migration `20261119171229_restrict_account_table_grants.sql`, which revokes table-level browser grants and re-grants only SELECT plus column-level profile edits.

The repeated SQL privilege test now confirms:
- Authenticated users can read their own profile (subject to RLS).
- They can update `full_name`.
- They cannot update `is_subscribed`.
- They cannot insert payment records.
- They cannot assign roles.

The security advisor remains clear after the correction. Both migration versions are recorded by the new Supabase project.


## CBT question bank and exam-history foundation (2026-11-19)

Applied and committed:
- `20261119171328_cbt_question_bank_and_exam_history.sql`
- `20261119171410_index_cbt_foreign_keys.sql`

### Tables added

- `questions` — subject/topic/year/difficulty, four options, answer key, explanation, passage, question type and exam hint.
- `exam_sessions` — practice/CBT/mock/revision session metadata and result fields.
- `user_history` — per-question answers and result history.
- `user_seen_questions` — per-user non-repetition tracking.
- `shared_exams` — share code, owner, session, mode, subjects and timer metadata.

### Access model

- RLS enabled on all five tables.
- Question-bank rows are only directly readable/writable by an authenticated administrator. This prevents ordinary students from downloading answer keys through the Data API.
- Exam sessions and answer history are owner-readable; browser clients are not granted write access to scores or history. Secure server-side session and submission handlers must be implemented before the new backend is connected to the front end.
- Seen-question tracking is owner-scoped and supports only own-row select/insert/delete.
- Shared-exam metadata is readable for link resolution; only authenticated creators can insert their own share records.
- Added indexes for common subject/history/session lookups and all flagged foreign-key columns.

### Important integration dependency

The current `questionEngine.ts` fetches `questions.select("*")` from the browser and reads `correct_answer`; `Exam.tsx` also writes session scores and answer history directly. Those old client flows will not work against the new secured policies by design. Before switching Netlify, replace them with authenticated Edge Functions that return question payloads without answer keys, grade submissions server-side, and record results atomically. Keep the current live backend unchanged until those changes are implemented and tested.

### Verification

- All five tables exist in the new Supabase project and report RLS enabled.
- Security advisor returned no lints after the CBT migration.
- Performance advisor initially identified four unindexed foreign keys; the follow-up index migration added the missing indexes.
- The performance advisor may still report unused indexes on this empty project; reassess after representative data and traffic exist.
- No questions or user records have been imported; the new tables are empty.


## First CBT Edge Function deployed (2026-11-19)

- Function: `cbt-start`
- Deployment status: ACTIVE, version 2
- JWT gateway verification: enabled
- Source: `supabase/functions/cbt-start/index.ts`
- Configuration: `[functions.cbt-start] verify_jwt = true`

The function authenticates the caller's access token, checks the server-side profile trial/subscription allowance, selects questions from the private question bank, shuffles options, creates the exam session, and increments the trial count on the server. It only includes the correct option and explanation in practice mode; timed CBT/mock/revision modes do not receive answer keys in the response.

**Not yet integrated:** `Exam.tsx` and `questionEngine.ts` still use the old direct-browser data flow. Do not change the Netlify environment or switch the app to this project yet. The next required pieces are a server-side submission/grading endpoint, idempotent/atomic result persistence, then front-end integration and preview testing. The function has been deployed but an authenticated end-to-end test with a real question-bank record is still pending because the new project currently has no imported questions or test student accounts.
