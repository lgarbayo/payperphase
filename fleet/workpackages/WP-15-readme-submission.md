---
id: WP-15
title: Write the README (pitch, video, hosted URL, sandbox logins, quick start, compliance and GDPR notes), AI tools statement, Devpost copy, architecture diagram
deps: [WP-13]
owns:
  - README.md
  - docs/submission/**
  - docs/architecture/**
  - tests/docs/**
status: todo
hours: 1.5
criteria: [Presentation, Potential Impact]
---

## Goal
A judge who opens the repo understands the problem, the product and how to try it in 60 seconds. Everything Devpost asks for is drafted and ready to paste: the text description, the AI tools statement, the built-with tags and the video script. The architecture diagram explains the core design rule: Claude reads, code decides money and dates, the dentist approves every word.

## Consumes
- `fleet/SPEC.md`, `fleet/IDEA.md`, `fleet/PRIOR_ART.md` (positioning), `fleet/hackathon.json` (submission requirements), `docs/deploy.md` + `docs/sandbox-setup.md` (WP-13, the only dep: the README links them), and whatever spike docs in `docs/spikes/` have merged. Re-read `docs/spikes/agent-toolkit.md` before the final pass, because the AI tools statement must say honestly whether the agent ran on the toolkit or on the REST fallback.

## Provides
- `README.md`:
  - a one-line pitch and the Dentix/iDental problem with the dsca.gob.es source;
  - the video link (placeholder until it's uploaded) and the hosted URL;
  - "Try it in 60 seconds": `/demo`, the Reset demo button, `/p/demo`, `/clinic`;
  - sandbox buyer login (filled in by the human, valid until 15 Dec);
  - features mapped to the 5 wow moments;
  - architecture (the diagram plus the deterministic-engine rule);
  - PayPal APIs used and why (Orders v2 per phase, JS SDK Pay Later messaging, Webhooks, Invoicing via Agent Toolkit);
  - Bryntum features used;
  - AI components;
  - quick start (`npm ci`, `.env`, `npm run dev`, `npm test`), env table, project layout, testing;
  - compliance ("Sandbox only · synthetic patients · medical services require PayPal pre-approval in production"), a GDPR note (synthetic data only), the licence (MIT).
- `docs/submission/devpost.md`: title, tagline, Inspiration / What it does / How we built it / Challenges / Accomplishments / What we learned / What's next, built-with tags, and the prize categories to opt into (Most Impactful + Best Use of Bryntum).
- `docs/submission/ai-tools.md`: every model and tool and what it did. Claude Sonnet 5.5 (extraction, wording, agent), Claude Haiku 5.5 (chat), the PayPal Agent Toolkit, and Claude Code (used to build the project). Note where the LLM is **not** used (money, dates).
- `docs/submission/video-script.md`: the final 2:50 beat script with VO text, the on-screen lower thirds (e.g. beat 3's "Claude Sonnet 5.5 extracts. A tested rules engine groups phases, healing times and amounts in cents."), and the Director key for each beat.
- `docs/architecture/diagram.mmd` plus a rendered SVG (use the `diagram` skill if available).

## Acceptance criteria
- [ ] The README renders cleanly on GitHub and has every section above. `tests/docs/links.test.ts` checks that every relative link in `README.md` and `docs/submission/*.md` points at a file that exists, and that no secret-looking string appears (`PAYPAL_CLIENT_SECRET=` with a value, `sk-ant-`, `access_token`).
- [ ] Rival positioning appears in the first screenful: pre-treatment, multi-phase, clinical healing windows, pay per phase, €0 exposure, Spain/EUR. That sets it apart from post-visit bill explainers and freelancer milestone tools.
- [ ] The AI tools statement is complete and honest. If the agent ran on the REST fallback instead of the toolkit, say so.
- [ ] The Devpost copy fits Devpost's field limits, and the description is in English.
- [ ] `fleet/hackathon.json` submission requirements are checked off in `docs/submission/checklist.md` (copy `~/hackathon-fleet/templates/SUBMISSION_CHECKLIST.md` and tick it). Items needing a human (video upload, Devpost form, sandbox logins) are flagged.

## Notes
- Finish it after the feature freeze. Draft early, then update the hosted URL and video link at the end.
- No third-party logos in the README or the diagram.

## Contract change requests
_None yet._
