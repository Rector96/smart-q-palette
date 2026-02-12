

# Smart CBT Question System

## Overview
A professional, modern CBT (Computer-Based Test) platform for JAMB-style exams with 14 subjects, smart question randomization, user accounts, and multiple exam modes. Clean, minimal design with responsive layout.

---

## 1. Authentication & User Profiles
- **Sign up / Login** with email and password (Supabase Auth)
- **User profile** storing name, chosen subjects, and exam history
- Dashboard showing past performance, streaks, and progress

## 2. Subject Selection Screen
- Grid of **14 subjects** with icons: English, Mathematics, Physics, Chemistry, Biology, Economics, Government, Literature, CRS, IRS, Geography, Commerce, Accounting, Agricultural Science
- Users select **4 subjects** (JAMB format) or individual subjects for practice
- Visual indicators showing progress per subject

## 3. Four Exam Modes

### Practice Mode
- Untimed, relaxed environment
- Instant feedback after each question (correct/wrong + explanation)
- "Next" / "Previous" navigation

### CBT Exam Mode
- **60 questions**, timed (mimics real JAMB — e.g., 60 minutes)
- No going back after submission
- Auto-submit when timer expires
- Score displayed at the end with breakdown

### Mock Exam Mode
- Full JAMB simulation: 4 subjects × 60 questions
- Combined timer, subject tabs to switch between
- Detailed result analysis after completion

### Revision Mode
- Focus on **previously wrong answers**
- Resurface weak topics
- Spaced repetition logic

## 4. Smart Question Engine (Core Logic)
- **Randomized selection** — no fixed order, algorithm-based
- **Topic scatter** — questions spread across all topics within a subject
- **Year diversity** — mix questions from different exam years
- **Difficulty balancing** — mix easy, medium, hard
- **No repetition** — exclude previously answered questions (tracked per user)
- **Option shuffling** — A–D options randomized each time
- **Unique session sets** — every session generates a fresh question set

## 5. English Subject — Special Structure
- **Comprehension passages**: one passage → multiple grouped questions, CBT-style layout with passage on left, questions on right
- **Cloze tests**: fill-in-the-blank passages
- Dedicated sections for: Grammar, Lexis & Structure, Synonyms, Antonyms, Oral English, Stress Patterns, Vowel Sounds, Consonants, Sentence Interpretation

## 6. Question Display & Interaction
- Clean card-based question UI with smaller, readable fonts
- Progress bar showing question number (e.g., "23 of 60")
- Question navigation panel (grid of numbered circles)
- Flag/bookmark questions for review
- Timer display (in timed modes)
- Responsive layout — works perfectly on mobile, tablet, desktop

## 7. Results & Analytics
- Score summary with percentage and grade
- Per-topic breakdown (strengths & weaknesses)
- Time spent per question analysis
- Historical performance chart (line graph over sessions)
- Comparison with previous attempts

## 8. Database (Supabase)
- **Questions table**: subject, topic, year, difficulty, passage (if any), question text, options A–D, correct answer, explanation
- **User profiles**: name, email, preferences
- **User history**: tracks every answered question per user for no-repetition logic
- **Sessions table**: mode, subject, score, date, duration
- Proper RLS policies for security

## 9. Deployment
- **Netlify config file** (`netlify.toml`) for seamless deployment with SPA redirect rules

## 10. Design & UX
- **Modern minimal** style — clean whites, subtle grays, accent color for CTAs
- Smaller font sizes for dense question content
- Smooth transitions between questions
- Mobile-first responsive design
- Loading skeletons while fetching questions
- Toast notifications for actions (submit, time warning, etc.)

