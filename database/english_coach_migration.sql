-- ============================================================================
-- SkillForge AI — English Coach
-- ============================================================================
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- What is stored (and what is not):
--   english_profiles  the learner's own level, goal, interests and daily target
--   english_sessions  one row per finished conversation: the estimated level,
--                     the five skill ratings, and a few short themes
--                     (what to work on, words to try, topics)
--
--   NOT stored: recordings, transcripts, or quotes of what the learner said.
--
-- Writes come from the server (service role). The only direct access given to
-- a signed-in user is to read their own rows.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.english_profiles (
  user_id        uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  current_level  text CHECK (current_level IN ('A1','A2','B1','B2','C1','C2')),   -- NULL = "not sure yet"
  target_level   text NOT NULL CHECK (target_level IN ('A1','A2','B1','B2','C1','C2')),
  interests      text[] NOT NULL DEFAULT '{}',
  daily_minutes  integer NOT NULL DEFAULT 10 CHECK (daily_minutes BETWEEN 5 AND 60),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.english_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at       timestamptz NOT NULL,
  ended_at         timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL CHECK (duration_seconds >= 0),
  turns            integer NOT NULL CHECK (turns >= 0),
  learner_words    integer NOT NULL CHECK (learner_words >= 0),
  est_level        text NOT NULL CHECK (est_level IN ('A1','A2','B1','B2','C1','C2')),
  est_score        numeric(3,1) NOT NULL CHECK (est_score BETWEEN 1 AND 6),
  confidence       text NOT NULL CHECK (confidence IN ('low','medium','high')),
  skills           jsonb NOT NULL,
  wpm              integer,
  filler_rate      numeric(4,1),
  focus            text[] NOT NULL DEFAULT '{}',
  vocabulary       text[] NOT NULL DEFAULT '{}',
  topics           text[] NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_english_sessions_user_started
  ON public.english_sessions (user_id, started_at DESC);

ALTER TABLE public.english_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.english_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS english_profiles_select_own ON public.english_profiles;
CREATE POLICY english_profiles_select_own ON public.english_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS english_sessions_select_own ON public.english_sessions;
CREATE POLICY english_sessions_select_own ON public.english_sessions
  FOR SELECT USING (auth.uid() = user_id);
