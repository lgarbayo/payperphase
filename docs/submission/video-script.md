# Demo video script (2:50, hard cap 3:00)

> **Final cut: https://youtu.be/M7eus5cVwbo (2:35).** It was recorded from this script; the timings below are the plan, and the edit came out 15 seconds shorter.

Required by the rules: public on YouTube, **180 seconds at most**, shows the project working on its target device, no unlicensed music, no third-party trademarks or logos, no secrets on screen. This script runs **2:50**, leaving 10 seconds of margin.

The voice-over is in English, and every screen is recorded in English (`?lang=en`, which the app remembers). The quote PDF itself stays Spanish, because it is a real Spanish quote. The sandbox stays visible throughout.

The shape follows the judging-panel review:
- open cold on the punchline (the closure modal);
- show the real PayPal sandbox and Claude, never a mock badge;
- close the arc on the same button.

## How to record
- **Where:** the hosted URL (`https://payperphase.onrender.com`), where PayPal and Claude are live. Retake any shot that shows a "Mock", "Cached" or "Playbook" badge.
- **Order of recording ≠ order of the cut.** Record the beats in this order:
  1. the clinic (beat 4);
  2. the patient payment (beat 5);
  3. the closure modal, now with phase 1 really paid (beats 1 and 9);
  4. the drag (beat 6);
  5. the chat (beat 7);
  6. the agent (beat 8);
  7. the title cards.

  Press **Reset demo** on `/demo` before the clinic take.
- **Director Mode:** open `/demo?director=1`.
  - Keys: **R** reset · **1–6** jump to a beat state · **C** clock +7 weeks · **G** guard test · **H** hide the overlay. Press **H** after each beat key.
  - Every clock state is labelled "Simulated" on screen.
  - Beat key **3** (phase 1 paid) is only a fallback if the real payment take fails. Say so in the edit notes; the VO must not claim a live payment for that take.
- **Capture:**
  - Use OBS display capture (the PayPal window is a separate window) at 1920×1080, with browser zoom 125%.
  - Use a clean browser profile, with the sandbox buyer already logged in at sandbox.paypal.com so no password appears.
  - Show one shot with the address bar on the onrender.com URL.
- **Voice:** record it separately at about 140 words a minute, normalised to −14 LUFS. Optional: a licensed YouTube Audio Library bed at about −25 dB. Burn in English captions and upload the SRT.
- **VO rules:**
  - Say "sandbox", "synthetic" and "illustrative" where the screen says them.
  - Never promise Pay in 3 eligibility: say "sized for Pay in 3", because PayPal decides.
  - Read figures from the screen, never from memory.

| Beat | Time | Screen / Director key |
|---|---|---|
| 1. Cold open | 0:00–0:07 | `/p/demo?lang=en#closure`, after the real payment |
| 2. Hook | 0:07–0:15 | `/demo/title?lang=en&rec=1`, card 1 |
| 3. Title | 0:15–0:22 | `/demo/title?lang=en&rec=1`, title card |
| 4. Quote → plan | 0:22–0:46 | key **1** → `/clinic` |
| 5. Patient pays phase 1 | 0:46–1:14 | key **2** → `/p/demo` |
| 6. Biology vetoes the schedule | 1:14–1:36 | key **4** → `/p/demo#gantt` |
| 7. Ask the plan | 1:36–1:48 | `/p/demo`, "Ask about your plan" |
| 8. Clinic agent | 1:48–2:20 | key **5** (clock on phase 2's visit day) → `/clinic#plan-editor`, then **G** |
| 9. The button | 2:20–2:40 | `/p/demo#closure` |
| 10. Close | 2:40–2:50 | `/demo/closing?lang=en&rec=1` |

---

## 1. Cold open · 0:00–0:07
**Screen:** the settled "What if the clinic closes today?" modal, with phase 1 really paid: red "Yours to claim back €3,710.00 for treatment you never received" next to green "€0.00". Start on the numbers, already settled.
**VO:** "The clinic just closed. Same patient, same treatment. Left: the loan the clinic offered. Right: PayPerPhase."

## 2. Hook · 0:07–0:15
**Screen:** hook card 1: "2020: a big dental chain closes overnight. 101,481 patients had paid-for treatments left unfinished; 65% of them with a linked loan." The source line stays on screen. No chain names or logos.
**VO:** "In 2020 a Spanish dental chain closed overnight. More than a hundred thousand patients had paid for treatment they never got."

## 3. Title · 0:15–0:22
**Screen:** the PayPerPhase title card.
**VO:** "PayPerPhase. Pay for each phase of dental treatment on the day you get it. Never in advance."

## 4. Clinic: quote to plan · 0:22–0:46
**Screen:** `/clinic`.
1. Under "Try a sample", choose the synthetic Clínica Dental Ribera presupuesto: 12 lines, €4,070.
2. Jump-cut the wait for the live call. Punch in 2× on the odontogram lighting up as the lines arrive.
3. Punch in on the check bar: Σ lines = printed total.
4. Press "Create plan": the Gantt assembles with healing windows.
5. Tick "Approve notes", then press "Approve & send to patient": the link and the QR code appear.

**Lower third:** "Claude Sonnet 5.5 reads. A tested engine decides phases, dates and cents."
**VO:** "María's clinic uploads her Spanish quote. Claude reads every line and tooth, and the odontogram lights up as it reads. Code, not the model, re-checks the sum. A tested engine builds four phases with the healing time between them, each sized for Pay in 3. The dentist approves every note and sends María a link."
**Director:** key **1**. If the live extraction fails, retake; use the cached one only with its badge visible.

## 5. Patient: pay phase 1 · 0:46–1:14
**Screen:** `/p/demo`.
1. Toggle EN → ES → EN once (2 s).
2. Point at phase 1 (€360, due today). The PayPal buttons sit there with PayPal's official Pay Later message under them, unedited; phases 2–4 show a disabled pay button, "Paid on the day of your visit".
3. Click "Paga a plazos". Show 3 s of the PayPal sandbox window with "Paga en 3 plazos · 3 pagos sin intereses. 120,00 EUR al mes a partir de hoy." selected, then jump-cut past the DNI step.
4. Back on the page, the phase-1 diamond turns green and the capture id line appears.
5. Cut for 3 s to the clinic's **PayPal trail** for phase 1: capture `COMPLETED` and the two webhooks with "✓ signature verified".

**Lower third:** "PayPal Orders v2 + Pay in 3 · sandbox · webhooks signature-verified"
**VO:** "Only today's phase can be paid; the server refuses anything earlier. María chooses Pay in 3 in the PayPal sandbox. The clinic is paid in full today, and PayPal carries the instalments. The milestone turns green, and PayPal's webhooks confirm it, signature verified."

## 6. Biology vetoes the schedule · 1:14–1:36
**Screen:** the Gantt close up.
1. Drag phase 3 slowly to the left. The chart shades "Healing · not before 7 Apr 2027" and the green "Safe window". Hold the tooltip with the dentist's note for 1.5 s.
2. Drop: it snaps back, and the reason appears under the chart.
3. Then drag phase 2 six weeks to the right: phases 3 and 4 and their payment diamonds glide, and the approved plan stays as a ghost.

**Lower third:** "Bryntum TaskDrag validatorFn → our engine · baseline = approved plan"
**VO:** "Life happens, but biology sets the dates. Move the abutments too early and the plan snaps back, in the dentist's own words. Move the implant later, and every phase and payment follows. Bryntum draws it; our engine computes every date."
**Director:** key **4**.

## 7. Ask the plan · 1:36–1:48
**Screen:** "Ask about your plan" → type "What if I wait three months for the implant?". The answer gives the new dates. Two citation chips "Dra. Lucía Ruiz" and the Gantt preview ghost appear.
**VO:** "María can ask her plan. Claude answers from her dentist's approved notes, and every date comes from the engine."

## 8. Clinic agent · 1:48–2:20
**Screen:** `/clinic#plan-editor`, with the simulated clock on phase 2's visit day (12 Jan 2027, labelled "Simulated"). Punch in 1.6× on the agent feed throughout.
1. Hold 2 s on the feed: phase 2's invoice (€1,500) was created and sent that morning, with its QR code, and the notes say phases 3 and 4 will be invoiced on their visit days.
2. The dentist presses the "+ Bone graft (+€450)" preset on phase 2. A plain-language diff appears.
3. The agent feed, with "Claude" and "PayPal sandbox · Agent Toolkit" badges, streams `cancel_sent_invoice` → `create_invoice` (€1,950).
4. Press **G**: the guard rejects a wrong amount, shown as a red line labelled "guard test". Hold it for 2 s.
5. Click **Approve**: `send_invoice` → `generate_invoice_qr_code`.
6. Cut for 3 s to the sandbox invoice page with its QR code.

**Lower third:** "Claude Sonnet 5.5 → PayPal Agent Toolkit · invoiced on the visit day · every call guarded"
**VO:** "Implant day: the invoice went out today, never earlier. The dentist finds thin bone and adds a graft. Claude cancels it through PayPal's Agent Toolkit and drafts a new one. The guard blocks a wrong amount. One approval sends it, with its QR code."
**Director:** key **5** (phase 1 paid, clock on phase 2's visit day, phase 2 invoiced), then **G**. Read the amounts and the date from the screen. Blur the invoice email if it is on screen.

## 9. The button · 2:20–2:40
**Screen:** `/p/demo#closure`. Press "What if the clinic closes today?". The counters settle at €3,710.00 vs €0.00. Then hold 3 s on the "Phases the clinic would never deliver" list and the source line.
**Lower third:** "Illustrative. Computed by the engine from undelivered phases. Source: dsca.gob.es"
**VO:** "María has paid three hundred and sixty euros, for care she has received. If her clinic closes today, with a linked loan, three thousand seven hundred and ten euros are hers to claim back. With PayPerPhase: nothing."

## 10. Close · 2:40–2:50
**Screen:** the closing card: the tagline large, the hosted URL, and the compliance line small, all in English.
**VO:** "PayPerPhase. Pay for the care you receive."
Leave the compliance line on screen; do not read it.

---

## Checks before upload
- The length is 2:50 or less after YouTube processing; never above 3:00.
- Public on YouTube, with English audio and captions. Use a custom thumbnail of the closure numbers.
- The video shows the project running, not mock-ups. No "Mock", "Cached" or "Playbook" badge appears.
- No secrets, emails or real accounts on screen. The sandbox buyer is logged in beforehand, and any invoice email is blurred.
- No music unless licensed. No third-party logos other than what the product itself shows inside PayPal's own sandbox pages.
