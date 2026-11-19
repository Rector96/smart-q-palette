# Security Review — Smart Q Palette

Review date: 2026-11-19
Review branch: `independent-platform-cleanup`
Scope: source code and checked-in Supabase migrations only. This is a static review, not a live database assessment.

## Status and safety boundary

- This review was performed against the repository's checked-in source and migration history.
- No production database, Supabase project, deployment, or user data was changed.
- The Supabase project configured in this repository is `gotqwaqemszscdpgzdxp`. The currently connected Supabase project available to the maintenance tools is a different project. Do not apply migrations or run database changes until the correct project is connected and confirmed.
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

The migrations define `has_role` as SECURITY DEFINER and use it in policies. Review function execute grants, search path, ownership, and deployed definitions. The signup trigger assigning admin based on a hard-coded email should also be replaced with a controlled bootstrap process once the authorized administrator identity is confirmed.

## Safe implementation sequence

1. Confirm the correct Supabase project reference and obtain authorized access to that project.
2. Inspect the deployed schema, grants, RLS policies, functions, triggers, and storage policies; compare them with repository migrations.
3. Design and test server-side Live Quiz operations and sanitized participant payloads.
4. Tighten profile, custom exam, result, payment, and role policies without disrupting existing product flows.
5. Add migration(s) to the repository, deploy to a test environment, and run adversarial tests using separate student/host accounts.
6. Only after successful verification, schedule production rollout and monitor errors.

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
