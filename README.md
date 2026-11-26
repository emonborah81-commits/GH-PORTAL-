# GREEN HOUSE — SPORTS & CULTURAL PARTICIPATION PORTAL

**School:** Rev. William Ward Senior Secondary School  
**House:** Green House  
**Motto:** *UNITED IN STRENGTH. UNSTOPPABLE IN SPIRIT.*

---

## Overview

The **Green House Sports & Cultural Participation Portal** is a mobile-first, responsive web application built for students and authorized house management at **Rev. William Ward Senior Secondary School**.

- **Students** can view open sports and cultural events, enter their full name and school roll number, select multiple events across both categories, and receive an instant confirmation receipt.
- **Authorized House Management** can sign in securely via **Supabase Auth** (verified against the `public.managers` table), view live participation analytics, search and filter student entries, export participant rosters to CSV, manage events (add, rename, enable/disable, delete), toggle registration open/closed status, and download or restore JSON backups.

---

## Project Structure

```text
GREEN_HOUSE_COMPLETE_PORTAL/
├── index.html             # Main portal (Student Registration + Management Dashboard)
├── styles.css             # Forest green, emerald, cream & gold responsive styling
├── config.js              # Supabase URL & Publishable Key configuration
├── app.js                 # Complete frontend & Supabase integration logic
├── privacy.html           # School student privacy & data protection policy
├── manifest.json          # Android Progressive Web App (PWA) manifest
├── sw.js                  # Service worker for static shell caching
├── favicon.svg            # Scalable Green House crest emblem
├── icon-192.png           # Android PWA home screen icon (192x192)
├── icon-512.png           # Android PWA splash icon (512x512)
├── supabase_setup.sql     # Complete database tables, RLS policies, RPCs & seed events
├── INTEGRATION_GUIDE.txt  # Step-by-step Supabase, GitHub & Vercel deployment guide
└── README.md              # Project documentation
```

---

## Security & Privacy Architecture

1. **No Public Access to Student Records:** Row Level Security (RLS) is enabled on `public.registrations`. Anonymous visitors cannot query, list, or export any student data.
2. **Validated Registration RPC:** Student submissions pass through `public.submit_student_registration(...)`, which checks that registrations are open, verifies selected events exist and are active, and prevents duplicate roll numbers.
3. **Database-Verified Management Access:** Management sign-in uses Supabase Auth (`signInWithPassword`) followed by `public.verify_manager_access()`, ensuring only active managers listed in `public.managers` can access administrative data.
4. **Zero Hardcoded Secrets:** Only the Supabase Publishable (anon) key belongs in `config.js`. Never place a `service_role` key in frontend files.

---

## Quick Start

1. Open your Supabase project (`https://xrhcuzwagxlncyerfpui.supabase.co`) and run `supabase_setup.sql` in the **SQL Editor**.
2. Create a manager account under **Authentication → Users** and insert their `user_id` into `public.managers`.
3. Paste your Supabase **Publishable (anon) Key** into `config.js`.
4. Upload the project folder to **GitHub** and deploy on **Vercel**.
5. Test with dummy student entries (e.g., `Test Student`, Roll `TEST-01`) and delete test records before sharing the portal link with students.

See `INTEGRATION_GUIDE.txt` for full step-by-step instructions.
