# Demo video script (2:52, hard cap 3:00)

Required by the rules: public on YouTube, **180 seconds at most**, shows the project working on its target device, no unlicensed music, no third-party trademarks or logos, no secrets on screen. This script runs **2:52**, leaving 8 seconds of margin. English voice-over; the UI is Spanish with the ES→EN toggle shown once. The sandbox stays visible throughout.

How to record: each beat is recorded on its own from a Director Mode deep link (`/demo?director=1`), then cut together. Director keys: **R** reset · **1–6** jump to a beat state · **C** clock +7 weeks · **G** guard test. Every clock state is labelled "Simulated" on screen. Record the live Claude and PayPal calls first, and use the labelled cached state only where a take fails (the badge must stay visible).

Ground rules for the voice-over (about 150 words a minute, so each block below fits its time):
- Say "sandbox", "synthetic patients" and "illustrative" where the screen says them.
- Never promise that a patient will be eligible for Pay in 3. Say "sized for Pay in 3": PayPal decides.
- Do not mention anything that is not on the screen.

| Beat | Time | Director key / link |
|---|---|---|
| 1. Hook | 0:00–0:12 | `/demo/title` (title cards) |
| 2. Title | 0:12–0:20 | `/demo/title` |
| 3. Quote → plan | 0:20–0:50 | **1** → `/clinic` |
| 4. Patient pays phase 1 | 0:50–1:18 | **2** → `/p/demo` (then **3** if the take needs the paid state) |
| 5. Delay what-if | 1:18–1:52 | **4** → `/p/demo#gantt` |
| 6. Clinic agent | 1:52–2:28 | **5** → `/clinic#plan-editor`, keys **G** and **C** |
| 7. The button | 2:28–2:44 | **6** → `/p/demo#closure` |
| 8. Close | 2:44–2:52 | `/demo/closing` |

---

## 1. Hook · 0:00–0:12
**Screen:** dark title cards. The text of the Spanish consumer authority's guidance (dsca.gob.es) appears as text only, no logos.
**Lower third:** "Source: dsca.gob.es, official consumer guidance"
**VO:** "In 2020 one of Spain's biggest dental chains closed overnight. Thousands of patients kept paying loans for implants they never received."
**Director:** the hook card from `/demo/title`.

## 2. Title · 0:12–0:20
**Screen:** the PayPerPhase wordmark, then the positioning line.
**Lower third:** "Pre-treatment Spanish quote · clinical healing windows · pay per phase · €0 exposure"
**VO:** "PayPerPhase. Pay for dental treatment phase by phase, as you receive it. Never in advance."
**Director:** the title card from `/demo/title`.

## 3. Clinic: quote to plan · 0:20–0:50 (wow moment 5)
**Screen:** `/clinic`. Choose the synthetic Clínica Dental Ribera presupuesto from "Probar con un ejemplo" (12 lines, €4,070). The lines stream in with tooth chips (36, 37, 46). The check bar reads "Σ lines = printed total", with the number of invalid teeth and lines to review. The Gantt assembles with healing windows and "within Pay in 3 range" badges. The dentist ticks the note approvals, then clicks "Approve & send to patient": the link and QR code appear and the invoice table lists four invoices.
**Lower third:** "Claude Sonnet 5.5 extracts. A tested rules engine groups phases, healing times and amounts in cents."
**VO:** "The clinic drops in a Spanish quote. Claude reads the lines. Code checks every sum and every tooth number. A tested engine builds the phases, with the healing time bone needs between them. The dentist approves every note, and the patient gets a link."
**Director:** key **1**. Say aloud in the take which extraction is on screen: a live call (badge "Live") or the labelled cached one.
**Sandbox shot:** none.

## 4. Patient: pay phase 1 · 0:50–1:18 (wow moment 2)
**Screen:** `/p/demo` on a laptop. Show the ES→EN toggle once, then back to the language of the take. Point at the Gantt and the €360 phase. The official PayPal Pay Later message sits under the button, untouched. Click PayPal, approve in the sandbox window (the sandbox URL stays visible) and return. The phase-1 diamond turns green with a ripple. The ledger reads "Paid €360 · received €360" and the exposure meter stays at €0,00.
**Lower third:** "PayPal Orders v2 · one order per phase · sandbox"
**VO:** "The patient sees the whole plan. Phase one is due today, so that is the only thing they can pay. PayPal's own Pay Later message sits under the button. They approve in the sandbox, and the milestone turns green. Paid, received, and nothing paid in advance."
**Director:** key **2**; key **3** if a take needs the paid state without the PayPal round trip (then use the real take for the sandbox shot).
**Sandbox shot:** the approval window of the PayPal sandbox. Record the Pay in 3 flow once by hand if you want it in the cut: it asks for the test DNI 12345678Z, a card and the contract checkbox.

## 5. Patient: delay what-if · 1:18–1:52 (wow moment 3)
**Screen:** scroll to the Gantt. Drag phase 2 (implants) six weeks to the right: phases 3 and 4 and their payment diamonds follow, the baseline ghost shows the original plan, and the due dates change. Then drag it left past the healing minimum: it snaps back and the dentist's note appears ("bone needs at least 8 weeks to heal"). Drag far to the right, past six months: the deadline turns red.
**Lower third:** "Bryntum draws it. The engine computes every date."
**VO:** "Life happens. Drag the implants six weeks later, and the crowns and their payments follow. The original plan stays visible. Drag them too early and the plan snaps back, with the reason from the dentist. Wait too long and the clinical deadline turns red. Bryntum draws it, and our tested engine computes every date."
**Director:** key **4**.

## 6. Clinic agent · 1:52–2:28 (wow moment 6)
**Screen:** `/clinic#plan-editor`. The dentist presses the "Injerto óseo (+450 €)" shortcut on phase 2. A plain-language diff appears ("+€450, phase 2 still within Pay in 3 range"). The agent feed streams the calls: `cancel_sent_invoice` then `create_invoice`. Press **G**: the guard rejects a stale amount, labelled "guard test". Click **Approve**: `send_invoice` then `generate_invoice_qr_code` run. Cut to the sandbox invoice and its QR code. Press **C**: phase 2 turns amber ("upcoming") and the feed shows `send_invoice_reminder`.
**Lower third:** "Claude Sonnet 5.5 drives the PayPal Agent Toolkit. A deterministic guard checks every call."
**VO:** "The dentist adds a bone graft. The agent cancels the old invoice and prepares a new one for the new amount. The guard checks the amount, the currency and the recipient, and here it rejects a wrong amount. After one approval the invoice is sent, with its QR code. Weeks pass on the simulated clock, and the agent sends the reminder."
**Director:** key **5**, then **G**, then **C** (the clock jump is labelled "Simulated").
**Sandbox shot:** the invoice page and QR code in the PayPal sandbox.

## 7. The button · 2:28–2:44 (wow moment 4)
**Screen:** `/p/demo#closure`. Press "¿Y si la clínica cierra hoy?". The counters animate: "Linked loan: you still owe …" against "PayPerPhase: €0". The source (dsca.gob.es) and the "illustrative" label are on screen.
**Lower third:** "Illustrative. Computed by the engine from undelivered phases."
**VO:** "What if the clinic closes today? With a linked loan, you still owe for treatment you never got. With PayPerPhase, nothing."
**Director:** key **6**. Read the loan figure from the screen; do not say a number that the screen does not show.

## 8. Close · 2:44–2:52
**Screen:** closing card with the compliance line, the tagline and the hosted URL (`TODO(human)`: put the final Render URL on the card).
**On screen:** "Sandbox only · synthetic patients · medical services require PayPal pre-approval in production."
**VO:** "PayPerPhase. Sandbox only, synthetic patients, and in production medical services need PayPal's pre-approval. Pay for the treatment you receive."
**Director:** `/demo/closing`.

---

## Optional insert: "Ask the plan" (only if the patient chat is merged before the freeze)
The patient chat is not part of the current build, so it is not in the cut above. If it merges, add it between beats 5 and 6 as a 12-second insert (for example 1:52–2:04) and free the time by trimming beats 3, 5 and 6 by 4 seconds each, so the total stays at 2:52:
"If I wait 3 months for the implant, what changes?" The answer shows dates from the engine and a chip "Approved by Dra. Ruiz · Phase 2". "Can I take ibuprofen?" gets a polite refusal and a "Message my clinic" button.
Update `docs/submission/ai-tools.md` and the README at the same time.

## Checks before upload
- Length 2:52 or less; never above 3:00.
- Public on YouTube; English audio (or English subtitles).
- The video shows the project running on a laptop, not mock-ups.
- No secrets, emails or real accounts on screen: hide the sandbox buyer's password, and blur the invoice email if it is shown.
- No music unless licensed; no third-party logos other than what the product itself shows inside PayPal's own sandbox pages.
