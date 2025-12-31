---
name: Auth, Chat History & Operational Stats
overview: Implement user authentication using Supabase, save chat history for logged-in users, and create an operational dashboard showing real-time app statistics.
todos:
  - id: db-setup
    content: Apply Supabase migrations for profiles, chat history, and stats function
    status: completed
  - id: auth-ui
    content: Add Login/Logout functionality to the UI
    status: completed
  - id: chat-save
    content: Update Chat API to persist messages to Supabase
    status: completed
  - id: chat-load
    content: Update Chat Interface to load history on login
    status: completed
  - id: stats-page
    content: Create the Operational Information page with real-time stats
    status: completed
---

# Plan: Auth, Chat History & Operational Stats

This plan adds user authentication, persists chat history to Supabase, and provides a new operational dashboard for monitoring app usage.

## 1. Database Schema Updates

We will add new tables and functions to Supabase to support user profiles, chat history, and statistics.

- Create `public.profiles` table linked to `auth.users`.
- Create `public.chat_history` table with RLS (Row Level Security) to ensure users only see their own data.
- Add a trigger to automatically create a profile when a user signs up.
- Add a secure RPC function `get_app_stats()` to fetch total message and user counts for the operational page.

## 2. Authentication Implementation

- Update `lib/supabase.ts` to support server-side and client-side auth.
- Create a `LoginButton` component for user authentication.
- Integrate authentication into `app/layout.tsx` or `components/Sidebar.tsx`.

## 3. Chat History Persistence

- Modify `app/api/chat/route.ts` to:
    - Detect the logged-in user.
    - Save user questions and AI responses to the `chat_history` table.
- Update `components/ChatInterface.tsx` to:
    - Fetch and display historical messages upon user login.
    - Ensure messages are correctly attributed to the current user.

## 4. Operational Information Page

- Create a new route `app/operational-info/page.tsx`.
- Use the `get_app_stats()` RPC to fetch real-world statistics.
- Build a clean, professional dashboard UI to display:
    - **Total AI Messages**: Count of all messages in `chat_history`.
    - **Total Users**: Count of all registered users in `profiles`.

## Implementation Todos

| ID | Task |
|---|---|
| `db-setup` | Apply Supabase migrations for profiles, chat history, and stats function |
| `auth-ui` | Add Login/Logout functionality to the UI |
| `chat-save` | Update Chat API to persist messages to Supabase |
| `chat-load` | Update Chat Interface to load history on login |
| `stats-page` | Create the Operational Information page with real-time stats |