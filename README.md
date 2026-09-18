# Creator Outreach System

Finds and scores potential creator partners for your digital products, and drafts outreach — built for $0, from a phone.

## Phase status
- [x] Phase 1 — Feasibility research
- [x] Phase 2 — Project setup (this repo + live database + deployed shell)
- [x] Phase 3 — Mobile UI (component kit + working add/list for products and creators)
- [ ] Phase 4 — Product library
- [ ] Phase 5 — Creator database
- [ ] Phase 6 — Discovery integrations
- [ ] Phase 7 — Creator analysis
- [ ] Phase 8 — Product detection
- [ ] Phase 9 — Scoring
- [ ] Phase 10 — Email generation
- [ ] Phase 11 — Email sending
- [ ] Phase 12 — Batch processing
- [ ] Phase 13 — Pause/resume
- [ ] Phase 14 — Export
- [ ] Phase 15 — Security (real login, replacing the open database policy from Phase 2)
- [ ] Phase 16 — Testing
- [ ] Phase 17 — Deployment polish

## Phase 1 findings

**The one real constraint:** no free, ToS-compliant channel can automatically discover a brand-new Instagram account by follower count or niche, starting from nothing. The old Business Discovery endpoint needs a username you already know. Hashtag Search needs the same Meta App Review and doesn't even return usernames. Anything else is scraping, which Instagram's terms ban outright and which isn't free anyway. Automating your own logged-in account to search doesn't avoid this either — Instagram flags scripted behavior regardless of whose login is driving it.

**How discovery works here instead:**
1. People already engaging with your own posts — pulled automatically, no approval needed.
2. YouTube Data API v3 — real automated keyword search, free, no approval needed.
3. Instagram Creator Marketplace API (launched Oct 2025) — applied for in parallel; grants true automatic Instagram discovery once Meta approves Advanced Access.

Once any source produces a username, Business Discovery automatically pulls real bio, follower count, and recent posts with captions and engagement — full analysis depth, no manual step, no screenshots.

**Verified $0 stack:**

| Service | Purpose | Free limit | Card? |
|---|---|---|---|
| Gemini API (Google AI Studio) | Analysis, scoring, email drafts | ~1,000 req/day | No |
| Supabase | Database + file storage | 500MB DB, 1GB storage | No |
| Netlify | Hosting | 100GB/mo (legacy accounts) or 300 credits/mo | No |
| Brevo, or Gmail + Apps Script | Sending outreach | 300/day, or 100/day | No |
| YouTube Data API v3 | Auto-discovery on YouTube | 10,000 units/day | No |
| Instagram Creator Marketplace API | Auto-discovery on Instagram | Free once approved | No |

## Setup notes
- The Supabase anon key in `app.js` is meant to be public — real protection is the row-level security policy, which gets tightened for real in Phase 15.
- `products` and `creators` tables were created in Phase 2 with a permissive "allow all" policy as a placeholder, not a finished security model.
