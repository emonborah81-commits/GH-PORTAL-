-- ============================================================================
-- GREEN HOUSE — SPORTS & CULTURAL PARTICIPATION PORTAL
-- School: REV. WILLIAM WARD SENIOR SECONDARY SCHOOL
-- House: GREEN HOUSE
-- Motto: UNITED IN STRENGTH. UNSTOPPABLE IN SPIRIT.
--
-- Complete Supabase PostgreSQL Schema, Row Level Security (RLS),
-- Manager Authorization Function, Student Registration RPC & Initial Events.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

-- Singleton Portal Settings Table
CREATE TABLE IF NOT EXISTS public.settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  registration_open BOOLEAN NOT NULL DEFAULT TRUE,
  academic_year TEXT NOT NULL DEFAULT '2026-2027',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Events Table (Sports & Cultural)
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  category TEXT NOT NULL CHECK (category IN ('sports', 'cultural')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique_name_category
  ON public.events (lower(trim(name)), category);

-- Student Registrations Table
CREATE TABLE IF NOT EXISTS public.registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 2 AND 100),
  roll_number TEXT NOT NULL CHECK (char_length(trim(roll_number)) BETWEEN 1 AND 30),
  roll_number_normalized TEXT NOT NULL UNIQUE,
  sports_events TEXT[] NOT NULL DEFAULT '{}',
  cultural_events TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registrations_created_at
  ON public.registrations (created_at DESC);

-- Authorized Management Accounts Table (Linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.managers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 2 AND 100),
  role TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('manager', 'house_master', 'coordinator')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. SECURITY & AUTHORIZATION FUNCTIONS
-- ----------------------------------------------------------------------------

-- Helper function: Returns TRUE only if the currently authenticated Supabase user
-- exists in public.managers with is_active = TRUE.
CREATE OR REPLACE FUNCTION public.is_verified_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.managers m
    WHERE m.user_id = auth.uid()
      AND m.is_active = TRUE
  );
$$;

-- RPC called by the frontend immediately after Supabase Auth login to confirm
-- that the user is an authorized Green House manager.
CREATE OR REPLACE FUNCTION public.verify_manager_access()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('authorized', FALSE);
  END IF;

  SELECT user_id, email, full_name, role
  INTO v_manager
  FROM public.managers
  WHERE user_id = auth.uid()
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', FALSE);
  END IF;

  RETURN jsonb_build_object(
    'authorized', TRUE,
    'user_id', v_manager.user_id,
    'email', v_manager.email,
    'full_name', v_manager.full_name,
    'role', v_manager.role
  );
END;
$$;

-- Secured Student Registration RPC:
-- Validates open status, cleans inputs, checks active events, prevents duplicate
-- roll numbers, inserts record, and returns only the student's own receipt.
CREATE OR REPLACE FUNCTION public.submit_student_registration(
  p_full_name TEXT,
  p_roll_number TEXT,
  p_sports_events TEXT[] DEFAULT '{}',
  p_cultural_events TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg_open BOOLEAN;
  v_clean_name TEXT;
  v_clean_roll TEXT;
  v_sports TEXT[];
  v_cultural TEXT[];
  v_invalid_count INTEGER;
  v_inserted RECORD;
BEGIN
  -- 1. Check whether registration is currently open
  SELECT registration_open INTO v_reg_open
  FROM public.settings
  WHERE id = 1;

  IF COALESCE(v_reg_open, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'Registrations are currently closed by Green House management.';
  END IF;

  -- 2. Normalize and validate student name & roll number
  v_clean_name := regexp_replace(trim(COALESCE(p_full_name, '')), '\s+', ' ', 'g');
  v_clean_roll := upper(trim(COALESCE(p_roll_number, '')));

  IF char_length(v_clean_name) < 2 OR char_length(v_clean_name) > 100 THEN
    RAISE EXCEPTION 'Please enter a valid full name (2 to 100 characters).';
  END IF;

  IF v_clean_roll !~ '^[A-Z0-9][A-Z0-9\-\/]{0,29}$' THEN
    RAISE EXCEPTION 'Please enter a valid roll number (letters, numbers, hyphens, or slashes only).';
  END IF;

  -- 3. Deduplicate selected event arrays
  SELECT COALESCE(array_agg(DISTINCT trim(e)), '{}')
  INTO v_sports
  FROM unnest(COALESCE(p_sports_events, '{}')) AS e
  WHERE trim(e) <> '';

  SELECT COALESCE(array_agg(DISTINCT trim(e)), '{}')
  INTO v_cultural
  FROM unnest(COALESCE(p_cultural_events, '{}')) AS e
  WHERE trim(e) <> '';

  IF COALESCE(array_length(v_sports, 1), 0) + COALESCE(array_length(v_cultural, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Please select at least one Sports or Cultural event.';
  END IF;

  -- 4. Verify all submitted sports events exist and are currently active
  IF COALESCE(array_length(v_sports, 1), 0) > 0 THEN
    SELECT COUNT(*)
    INTO v_invalid_count
    FROM unnest(v_sports) AS s_name
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.events ev
      WHERE ev.name = s_name
        AND ev.category = 'sports'
        AND ev.is_active = TRUE
    );

    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'One or more selected sports events are unavailable or disabled.';
    END IF;
  END IF;

  -- 5. Verify all submitted cultural events exist and are currently active
  IF COALESCE(array_length(v_cultural, 1), 0) > 0 THEN
    SELECT COUNT(*)
    INTO v_invalid_count
    FROM unnest(v_cultural) AS c_name
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.events ev
      WHERE ev.name = c_name
        AND ev.category = 'cultural'
        AND ev.is_active = TRUE
    );

    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'One or more selected cultural events are unavailable or disabled.';
    END IF;
  END IF;

  -- 6. Prevent duplicate registrations by roll number
  IF EXISTS (
    SELECT 1
    FROM public.registrations r
    WHERE r.roll_number_normalized = v_clean_roll
  ) THEN
    RAISE EXCEPTION 'Roll number % is already registered. Duplicate registrations are not permitted.', v_clean_roll;
  END IF;

  -- 7. Insert validated registration record
  INSERT INTO public.registrations (
    full_name,
    roll_number,
    roll_number_normalized,
    sports_events,
    cultural_events
  )
  VALUES (
    v_clean_name,
    v_clean_roll,
    v_clean_roll,
    v_sports,
    v_cultural
  )
  RETURNING id, full_name, roll_number, sports_events, cultural_events, created_at
  INTO v_inserted;

  RETURN jsonb_build_object(
    'registration_id', v_inserted.id,
    'full_name', v_inserted.full_name,
    'roll_number', v_inserted.roll_number,
    'sports_events', v_inserted.sports_events,
    'cultural_events', v_inserted.cultural_events,
    'submitted_at', v_inserted.created_at
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) & POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;

-- SETTINGS POLICIES
DROP POLICY IF EXISTS "Public can read registration open status" ON public.settings;
CREATE POLICY "Public can read registration open status"
  ON public.settings
  FOR SELECT
  TO anon, authenticated
  USING (id = 1);

DROP POLICY IF EXISTS "Verified managers can update settings" ON public.settings;
CREATE POLICY "Verified managers can update settings"
  ON public.settings
  FOR UPDATE
  TO authenticated
  USING (public.is_verified_manager())
  WITH CHECK (public.is_verified_manager());

-- EVENTS POLICIES
DROP POLICY IF EXISTS "Public can view active events" ON public.events;
CREATE POLICY "Public can view active events"
  ON public.events
  FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE OR public.is_verified_manager());

DROP POLICY IF EXISTS "Verified managers can insert events" ON public.events;
CREATE POLICY "Verified managers can insert events"
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_verified_manager());

DROP POLICY IF EXISTS "Verified managers can update events" ON public.events;
CREATE POLICY "Verified managers can update events"
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (public.is_verified_manager())
  WITH CHECK (public.is_verified_manager());

DROP POLICY IF EXISTS "Verified managers can delete events" ON public.events;
CREATE POLICY "Verified managers can delete events"
  ON public.events
  FOR DELETE
  TO authenticated
  USING (public.is_verified_manager());

-- REGISTRATIONS POLICIES (Strictly private: NO anon SELECT/INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "Only verified managers can read registrations" ON public.registrations;
CREATE POLICY "Only verified managers can read registrations"
  ON public.registrations
  FOR SELECT
  TO authenticated
  USING (public.is_verified_manager());

DROP POLICY IF EXISTS "Only verified managers can insert registrations directly" ON public.registrations;
CREATE POLICY "Only verified managers can insert registrations directly"
  ON public.registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_verified_manager());

DROP POLICY IF EXISTS "Only verified managers can update registrations" ON public.registrations;
CREATE POLICY "Only verified managers can update registrations"
  ON public.registrations
  FOR UPDATE
  TO authenticated
  USING (public.is_verified_manager())
  WITH CHECK (public.is_verified_manager());

DROP POLICY IF EXISTS "Only verified managers can delete registrations" ON public.registrations;
CREATE POLICY "Only verified managers can delete registrations"
  ON public.registrations
  FOR DELETE
  TO authenticated
  USING (public.is_verified_manager());

-- MANAGERS POLICIES
DROP POLICY IF EXISTS "Verified managers can view managers list" ON public.managers;
CREATE POLICY "Verified managers can view managers list"
  ON public.managers
  FOR SELECT
  TO authenticated
  USING (public.is_verified_manager());

-- ----------------------------------------------------------------------------
-- 4. FUNCTION EXECUTION PERMISSIONS
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.submit_student_registration(TEXT, TEXT, TEXT[], TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_student_registration(TEXT, TEXT, TEXT[], TEXT[]) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.verify_manager_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_manager_access() TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. INITIAL SEED DATA (SETTINGS + 13 SPORTS + 8 CULTURAL EVENTS)
-- ----------------------------------------------------------------------------

INSERT INTO public.settings (id, registration_open, academic_year)
VALUES (1, TRUE, '2026-2027')
ON CONFLICT (id) DO NOTHING;

-- Initial Sports Events (13 Events)
INSERT INTO public.events (name, category, is_active, sort_order)
VALUES
  ('100m Sprint', 'sports', TRUE, 1),
  ('200m Sprint', 'sports', TRUE, 2),
  ('400m Race', 'sports', TRUE, 3),
  ('800m Race', 'sports', TRUE, 4),
  ('Relay Race', 'sports', TRUE, 5),
  ('Long Jump', 'sports', TRUE, 6),
  ('High Jump', 'sports', TRUE, 7),
  ('Shot Put', 'sports', TRUE, 8),
  ('Football', 'sports', TRUE, 9),
  ('Cricket', 'sports', TRUE, 10),
  ('Badminton', 'sports', TRUE, 11),
  ('Volleyball', 'sports', TRUE, 12),
  ('Chess', 'sports', TRUE, 13)
ON CONFLICT DO NOTHING;

-- Initial Cultural Events (8 Events)
INSERT INTO public.events (name, category, is_active, sort_order)
VALUES
  ('Dance', 'cultural', TRUE, 1),
  ('Singing', 'cultural', TRUE, 2),
  ('Drama', 'cultural', TRUE, 3),
  ('Poetry Recitation', 'cultural', TRUE, 4),
  ('Drawing & Painting', 'cultural', TRUE, 5),
  ('Quiz', 'cultural', TRUE, 6),
  ('Debate', 'cultural', TRUE, 7),
  ('Instrumental Music', 'cultural', TRUE, 8)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. HOW TO AUTHORIZE YOUR FIRST MANAGEMENT ACCOUNT
-- ----------------------------------------------------------------------------
-- Step A: Go to Supabase Dashboard -> Authentication -> Users -> Add user
--         Create an email + strong password account for the House Master/Coordinator.
-- Step B: Copy the new user's UUID from Authentication -> Users.
-- Step C: Run the query below in SQL Editor (replacing the sample values):
--
-- INSERT INTO public.managers (user_id, email, full_name, role, is_active)
-- VALUES (
--   'PASTE-AUTH-USER-UUID-HERE',
--   'housemaster@example.com',
--   'Green House Master',
--   'house_master',
--   TRUE
-- );
