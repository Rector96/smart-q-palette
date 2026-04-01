
## Phase 1: Database & Foundation
1. **Database migration**: Create `quiz_rooms`, `quiz_participants`, `quiz_answers` tables with RLS + realtime
2. **Add `exam_hint` column** to questions table for interactive feedback
3. **Global text update**: Replace "Set Exam" → "Set Quiz" across all files

## Phase 2: Live Quiz UI (MVP)
4. **Live Quiz entry page** with "Create Quiz Room" and "Join Quiz Room" buttons
5. **Create Quiz Room form**: subject, question count, time per question → generates room code
6. **Join Quiz Room**: input room code, validate room
7. **Short link system**: `/q/:room_code` route with validation
8. **Waiting Room**: show room code, participants list (real-time), host "Start Quiz" button
9. **Quiz Session**: one question at a time, countdown timer, auto-advance
10. **Scoring**: +10 correct + speed bonus, real-time leaderboard
11. **End screen**: final leaderboard, winner highlight

## Phase 3: Access Control & Safety
12. **Free usage limits**: 2 free live quiz sessions for non-subscribers
13. **Anti-cheating**: tab switch detection + warning
14. **Auto-submit on timeout**, disconnect recovery
15. **Error handling**: invalid room, expired quiz, network issues

## Phase 4: Smart Question Features
16. **Enhanced randomization** with ORDER BY RANDOM()
17. **Interactive feedback** with exam_hint + motivational messages
18. **Shuffle answer options** (already partially done)
19. **Non-repetitive experience** improvements

## Phase 5: Content
20. **Add 30 questions** per subject to the database
