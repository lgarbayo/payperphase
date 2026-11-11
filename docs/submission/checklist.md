# Submission checklist

Checked against [`fleet/hackathon.json`](../../fleet/hackathon.json) on 2026-11-11 by WP-15. `[x]` = done and verifiable in the repo. `[ ]` **HUMAN** = only a person can do it. Deadline: Thu 12 Nov 2026, 21:00 CET (12:00 PT). Plan to submit by 18:00 CET.

Stage 1 is pass/fail: fits the theme and reasonably uses PayPal. Stage 2 scores five equal criteria: Technological Implementation, Design, Potential Impact, Quality of the Idea, Presentation.

## Repo
- [ ] **HUMAN** Public repo, all code and assets. The repo is `lgarbayo/payperphase`: set it to public and check in an incognito window.
- [x] Licence file present: [`LICENSE`](../../LICENSE) (MIT).
- [ ] **HUMAN** Licence detected by GitHub and shown in the repo "About" box (check after the repo is public).
- [x] README has the pitch, the problem with its source, the architecture, PayPal and Bryntum usage, the AI components, quick start, env table, testing and compliance.
- [ ] **HUMAN** README placeholders filled: hosted URL, video link, sandbox buyer login (search for `TODO(human)` in `README.md` and `docs/submission/`).
- [x] [`.env.example`](../../.env.example) is complete and holds no values.
- [x] No secrets in the repository or in git history. Scanned on 2026-11-11 for Anthropic keys, PayPal secrets and bearer tokens; the only hit is a fake token constant in a test fixture. `tests/docs/links.test.ts` re-checks the docs on every run.

## Demo
- [ ] **HUMAN** Hosted URL works from an incognito window (see [`docs/deploy.md`](../deploy.md); then `npx tsx scripts/demo-check.ts https://<service>.onrender.com`).
- [ ] **HUMAN** Sandbox accounts in the README work and stay live until **15 Dec 2026** (judging window 1–15 Dec). Do not delete or reset them; the hosted service must stay always-on.
- [ ] **HUMAN** The PayPal webhook is registered at `https://<render-url>/api/paypal/webhook` ([`docs/sandbox-setup.md`](../sandbox-setup.md)) and `GET /api/health` reports `modes.paypal: live`.
- [x] Seed data loads on boot and "Reset demo" returns to the seeded state (`/demo`).
- [ ] **HUMAN** The demo path works from a clean state on the hosted URL (Reset demo, then `/clinic`, `/p/demo`).

## Video ([`video-script.md`](video-script.md))
- [x] Script written: 2:52, under the 180-second limit.
- [ ] **HUMAN** Record, edit and upload. Public on YouTube, 3:00 or less.
- [ ] **HUMAN** Shows the real product end to end on a laptop; no copyrighted music or third-party trademarks; no secrets on screen.
- [ ] **HUMAN** English audio (or English subtitles).

## Devpost form ([`devpost.md`](devpost.md), [`ai-tools.md`](ai-tools.md))
- [x] Title, tagline (56 characters), all story sections and built-with tags drafted, in English.
- [x] Text description of features drafted.
- [x] AI tools statement drafted: every model and tool and what it did, where the LLM is not used, and that the agent ran on the Agent Toolkit (not a REST fallback).
- [x] Prize categories: Most Impactful (category) and Best Use of Bryntum (sponsor). One category prize and one sponsor prize can stack.
- [x] "What changed after the start date": new project, first commit 10 Nov 2026.
- [ ] **HUMAN** Paste into the Devpost form, add the video link, repo URL, hosted URL and test credentials.
- [ ] **HUMAN** All teammates added and eligible (Spain is eligible; one representative submits).
- [ ] **HUMAN** If the patient chat or the odontogram merges before the freeze, update the README ("Not in this build yet"), [`ai-tools.md`](ai-tools.md) and the video script.

## Final hour
- [ ] **HUMAN** Submit at least 2 hours before the deadline (by 18:00 CET). Edits are usually allowed until the deadline.
