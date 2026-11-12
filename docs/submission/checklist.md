# Submission checklist

Checked against [`fleet/hackathon.json`](../../fleet/hackathon.json) on 2026-11-11, updated on 2026-11-12 after the live rehearsal on the hosted URL. `[x]` = done and verifiable in the repo. `[ ]` **HUMAN** = only a person can do it. Deadline: Thu 12 Nov 2026, 21:00 CET (12:00 PT). Plan to submit by 18:00 CET.

Stage 1 is pass/fail: fits the theme and reasonably uses PayPal. Stage 2 scores five equal criteria: Technological Implementation, Design, Potential Impact, Quality of the Idea, Presentation.

## Repo
- [x] Public repo, all code and assets: https://github.com/lgarbayo/payperphase
- [x] Licence file present: [`LICENSE`](../../LICENSE) (MIT).
- [x] Licence detected by GitHub (MIT) and shown in the repo "About" box.
- [x] README has the pitch, the problem with its sources, proof on the PayPal sandbox, the architecture, PayPal, Bryntum and Render usage, the AI components, install, configuration, compatibility, troubleshooting, testing and compliance.
- [x] README and Devpost screenshots recaptured in English on the dark theme, in labelled mock mode (`FORCE_MOCKS=1`, so they show "Mock"/"Cached" badges); `paypal-pay-in-3.png` is the real PayPal sandbox window.
- [x] Hosted URL filled in: https://payperphase.onrender.com/?lang=en
- [x] README placeholders filled: the video link is in; the sandbox buyer login goes only in Devpost's test credentials field, not in the public repo.
- [x] [`.env.example`](../../.env.example) is complete and holds no secrets (only safe defaults such as the model names).
- [x] No secrets in the repository or in git history. Scanned on 2026-11-11 for Anthropic keys, PayPal secrets and bearer tokens; the only hit is a fake token constant in a test fixture. `tests/docs/links.test.ts` re-checks the docs on every run.

## Demo
- [x] Hosted URL works: `npx tsx scripts/demo-check.ts https://payperphase.onrender.com --browser` passed 8/8 on commit 809f234 (11 Nov 2026).
- [ ] **HUMAN** Open it once more from an incognito window on the day of submission.
- [ ] **HUMAN** Sandbox accounts in the README work and stay live **until the winners are announced (expected around 21 Dec 2026)** (judging window 1–15 Dec). Do not delete or reset them; the hosted service must stay always-on.
- [x] The PayPal webhook is registered at `https://payperphase.onrender.com/api/paypal/webhook` and `GET /api/health` reports `paypal`, `paypalWebhooks` and `anthropic` live and `agent: llm`.
- [x] In-app Pay in 3 payment on the hosted URL, with both webhooks signature-verified and the invoice closed by the agent (IDs in the README, "Proof on the PayPal sandbox").
- [x] Seed data loads on boot and "Reset demo" returns to the seeded state (`/demo`).
- [ ] **HUMAN** After the visit-day invoice change is deployed, run the demo check on the hosted URL again and rehearse Director key **5** live: phase 2's invoice is issued on its visit day, then the bone-graft preset cancels and reissues it.
- [ ] **HUMAN** Just before recording and again before submitting, press **Reset demo** on the hosted URL so judges start from the seeded state.

## Video ([`video-script.md`](video-script.md))
- [x] Script rewritten after the judging-panel review: cold open on the closure modal, English screens, live PayPal and Claude only, 2:50, under the 180-second limit.
- [x] Beat 8 rewritten for invoices issued on the visit day: key **5** puts the clock on phase 2's visit day, and the bone graft reissues that day's invoice.
- [x] **HUMAN** Record, edit and upload. Public on YouTube, 3:00 or less: https://youtu.be/M7eus5cVwbo (2:35).
- [ ] **HUMAN** Shows the real product end to end on a laptop; no copyrighted music or third-party trademarks; no secrets on screen.
- [ ] **HUMAN** English audio (or English subtitles).

## Devpost form ([`devpost.md`](devpost.md), [`ai-tools.md`](ai-tools.md))
- [x] Title, tagline (58 characters), all story sections and built-with tags drafted, in English.
- [x] Text description of features drafted.
- [x] AI tools statement drafted: every model and tool and what it did, where the LLM is not used, and that the agent ran on the Agent Toolkit (not a REST fallback).
- [x] Prize categories: Most Impactful, Best Use of PayPal + AI and Best Demo Delivery (categories); Best Use of Bryntum and Best Use of Render (sponsors). At most one category prize and one sponsor prize can be won, so entering several only adds chances.
- [x] "What changed after the start date": new project, first commit 10 Nov 2026.
- [ ] **HUMAN** Paste into the Devpost form, add the video link, repo URL, hosted URL and test credentials.
- [ ] **HUMAN** All teammates added and eligible (Spain is eligible; one representative submits).
- [x] The odontogram and the patient chat are documented as shipped in the README, [`ai-tools.md`](ai-tools.md), [`devpost.md`](devpost.md) and the video script.
- [ ] **HUMAN** Set a monthly spend limit on the Anthropic key, and keep Render, the key and the sandbox accounts alive until the winners are announced (expected around 21 Dec 2026).
- [ ] **HUMAN** After submitting, consider turning off auto-deploy on Render so the judged build stays put.

## Final hour
- [ ] **HUMAN** Submit at least 2 hours before the deadline (by 18:00 CET). Edits are usually allowed until the deadline.
