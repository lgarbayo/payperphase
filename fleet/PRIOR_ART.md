# Prior art: Leash, Shopfront, PlanPay

Generated 2026-11-10 by `hk-prior-art` (9 researchers + head judge). Raw findings: `prior-art.findings.json`.

**Ranking:** planpay > shopfront > leash

**Recommendation:** Build PlanPay, with the pivot and a new name. Leash is red: this hackathon already has at least 15 near-clones. SafePay, Paycurb and Mandate each cover about 90% of it, and the AUTHORIZE-hold wedge is gone (Allowance, deepakkushwaha7, SafePay, Permit). PayPal judges will have seen it many times. Shopfront is yellow but squeezed from two sides: two polished in-hackathon rivals (Dukkan, Shelfie Street) and PayPal's own Store Sync. Its strongest asset, Channel3 image comps, may be thin for EU handmade goods. PlanPay has the most open space. Every PayPal medical rival handles post-visit US bills. Multi-phase, pre-treatment, pay-per-phase in EUR with Spanish Pay in 3 fitting is unclaimed. The Dentix/iDental collapses give a Spanish team an impact story that is hard to fake. Most Impactful and Bryntum can stack under the rules. Execution: rename it (it collides with Plainpay, Plainbill and PlanPilot). In hour 1, check that Spanish Pay Later renders in sandbox. Use one one-time Order per phase, not Subscriptions. Keep money and dates in a deterministic engine and the LLM to extraction and wording. Build in this order: Gantt with dependencies, then per-phase checkout, then the delay what-if, then the clinic agent invoices, then the chatbot. Say in the video that medical services need PayPal pre-approval in production, before a judge raises it. Fallback: if Pay Later ES fails in sandbox and the phase-fitting story collapses, switch to Shopfront narrowed to the Channel3 price-comp plus a stock Claude connector buying in EUR.

## leash: RED (originality 2/10)

**Win odds:** Best Use of Agentic Commerce / PayPal + AI: about 2–3%. You would be one of 15+ near-clones, and several (SafePay, Mandate, Writ) already have live demos and attack benchmarks. AG Grid sponsor: about 3–5%, because the AG Grid audit ledger is the most common pattern in the field.

**Closest prior art**

- [SafePay (NovaCorpAI), PayPal AI Hackathon entry](https://github.com/NovaCorpAI/safepay): 9/10. Same product, already shipped: rules written in plain words and compiled by a model, an MCP server, authorize-a-budget then capture/void, Telegram approve/reject, an AG Grid hash-chained ledger and AG Studio. Repo pushed today, with a live demo.
- [Mandate (raunitgrey7), PayPal AI Hackathon entry](https://github.com/raunitgrey7/mandate): 9/10. Plain-English mandate compiled by an LLM that explains how it read each sentence, an MCP server, pay/ask/deny with one-tap phone approval, Vault v3 buyer-absent Orders v2, an AG Grid ledger and the official Agent Toolkit. About 90% of Leash.
- [Allowance (ParasAdlakha), PayPal AI Hackathon entry](https://github.com/ParasAdlakha/allowance): 8/10. Takes the 'AUTHORIZE hold as the guardrail' wedge that the market lens called free: plain-English rules, a typed policy cross-checked by code, an Orders v2 AUTHORIZE hold with partial capture or void, an AG Grid ledger. Its README names the same three prizes (Agentic Commerce, PayPal + AI, AG Grid).

**Differentiation**

- Hardly anything survives. The hold (deepakkushwaha7, Allowance, SafePay, Permit, rishabhcli), the NL compiler (Paycurb, Mandate, Warrant, LetAgentPay), the MCP proxy (Paycurb, Writ, PayGuard), phone approval and the AG Grid audit are all built already, often by several teams.
- Possibly still open: backtest the compiled policy on the user's real PayPal history (list_transactions), e.g. 'this rule would have blocked 4 of your last 30 payments'. No entry shows this.
- Possibly still open: a transparent proxy of the unmodified official remote MCP server (mcp.sandbox.paypal.com) that rewrites the hardcoded intent CAPTURE in create_order to AUTHORIZE, and auto-voids when an approval times out. Rivals re-implement the tool names instead.
- Possibly still open: adversarial counterexamples generated from each NL clause ('€49.99 Sunday + €1 Monday') as proof that the compiler is faithful.
- Weak: a Spanish/EUR consumer persona. deepakkushwaha7 already runs in EUR, and Mandat is EUR.

**Pivot:** Drop it. If the team insists, the only angle worth pitching is 'Policy Backtest + Faithfulness Proof for the official PayPal MCP': a transparent proxy that rewrites CAPTURE to AUTHORIZE, plus replay of every NL rule against the sandbox transaction history and LLM-generated counterexamples the user signs off on. Rename it too ('Leash'/'AgentLeash' are taken). Even with all that, it would be the 16th guardrail entry in front of PayPal judges.

**Build risks**

- Very high saturation: at least 15 near-identical entries in this hackathon, and the gallery isn't published yet, so expect more.
- Agent Toolkit create_order hardcodes intent CAPTURE, and there is no authorize/void tool. That means custom REST code plus a Vault v3 setup for buyer-absent purchases, and vaulting must be enabled in the sandbox dashboard.
- The authorize flow needs the order APPROVED before /authorize. Without the vault that means a redirect per purchase.
- Sandbox quirks: multi-unit AUTHORIZE orders were refused, and same-country payments failed for some regions. Check the ES accounts in hour 1.
- The AG Grid sponsor angle is diluted: most rival entries use AG Grid or AG Studio for the same audit ledger.
- Name collisions: AgentLeash prototype, hackquest Agent Leash, a 2016 Devpost Leash.

**Build facts**

- PayPal MCP: sandbox https://mcp.sandbox.paypal.com (/sse, /http); local npx -y @paypal/mcp --tools=all with PAYPAL_ACCESS_TOKEN + PAYPAL_ENVIRONMENT=SANDBOX (https://developer.paypal.com/ai-tools/mcp-server/).
- Toolkit payment tools are only create_order/get_order/pay_order/create_refund/get_refund. create_order hardcodes intent CAPTURE (https://github.com/paypal/agent-toolkit).
- Capture: POST /v2/payments/authorizations/{id}/capture. Void: .../void. Reauthorize: .../reauthorize. 3-day honor period, 29-day validity, capture up to 115% or +$75 (https://developer.paypal.com/docs/checkout/standard/customize/authorization/).
- Buyer-absent: Vault v3 setup-tokens → payment-tokens → payment_source.paypal.vault_id. Spain is supported (https://developer.paypal.com/docs/checkout/save-payment-methods/purchase-later/js-sdk/paypal/).
- Toolkit issue #98: PayPal-Request-Id is set per client, not per call, so set your own idempotency keys (https://github.com/paypal/agent-toolkit/issues/98).

## shopfront: YELLOW (originality 4/10)

**Win odds:** Channel3 sponsor ($1.5k, single winner): about 20–25%. Image-based price comps for sellers is the most native use of their API, though other entries use Channel3 for buyer-side search. Best Use of Agentic Commerce honorable mention: about 5–8%, given Dukkan, Shelfie and the judges' own Store Sync. Top-3: about 2%.

**Closest prior art**

- [Dukkan, PayPal AI Hackathon entry](https://devpost.com/software/dukkan): 8/10. A one-person home seller adds products with a photo plus a voice note, Claude writes a structured listing, the shop exposes an agent API (OpenAPI), and checkout runs through PayPal Orders v2 with the seller as payee (Log in with PayPal). It also logs demand. It has no MCP, no ACP/UCP feed and no price suggestions.
- [Shelfie Street, PayPal AI Hackathon entry](https://devpost.com/software/safdsf): 7/10. A shop joins from a photo of its shelf, Claude builds the catalog, and each shop gets its own MCP server, product feed and llms.txt. Shelfie is the merchant of record and pays shops through Payouts. It also targets AG Grid.
- [PayPal Store Sync / Agent Ready / WebMCP](https://developer.paypal.com/agentic-commerce-services/about): 7/10, and it is the judges' own product. Merchant catalogs go to AI surfaces with PayPal checkout. 'Store Sync for the long tail' frames Shopfront directly against it. It is gated, US/USD, and assumes an existing store.

**Differentiation**

- Price suggestions from real comparables: send the seller's actual photo to Channel3 image search (base64_image) and show a price band linked to the comparables. Neither Dukkan nor Shelfie does this, and a Channel3 engineer is on the judging panel.
- One catalog, every agent surface, validated on screen: an ACP feed checked against the 2026-04-17 JSON schema with a pass/fail agent-readiness checklist, plus /.well-known/acp.json, a /.well-known/ucp catalog profile, a remote MCP and llms.txt. Rivals ship OpenAPI only (Dukkan) or an unspecified feed (Shelfie).
- Proof with a third-party agent: a stock Claude custom connector (or ChatGPT developer mode) finds the seller's MCP and reaches a PayPal EUR approve link live, with no in-house agent. Both rivals demo their own agents.
- Handmade semantics: variants grouped from multiple photos (item_group_id), one-of-a-kind stock that auto-delists after capture, made-to-order lead times, and EU 14-day withdrawal terms plus VAT-inclusive EUR in tool responses.
- Position it as the self-serve feeder for Store Sync (it outputs feeds Store Sync could ingest), not as a rival. Store Sync is US/USD, gated and assisted onboarding only.

**Pivot:** Present it as 'the on-ramp to PayPal agentic commerce for EU makers with no store', not 'Store Sync for the long tail'. Build around three demo moments rivals lack: (1) an IG-screenshot or photo dump becomes an AG Grid catalog editor with AI-confidence flags and inline Channel3 comps; (2) a green ACP/UCP validation checklist; (3) a stock Claude connector buys a one-of-a-kind ceramic in EUR via a PayPal approve link and the item auto-delists. Drop any claim of live ChatGPT listing.

**Build risks**

- Two polished in-hackathon rivals (Dukkan, Shelfie Street) already cover photo → listing → agent → PayPal, so the demo must show the differentiators within the first 30 seconds.
- Channel3 coverage is US-retailer-heavy, so comparables for EU handmade goods may be thin or irrelevant. Test real photos in hour 1, and quote comps as a USD reference band if needed. The free tier is 1,000 searches, and the API returns 402 when they run out.
- There is no PayPal API to publish a third-party catalog into AI surfaces. Store Sync is gated and ChatGPT feed onboarding is for approved partners, so the PayPal part reduces to Orders v2 checkout plus seller ops tools. Judges may call the PayPal usage thin.
- Log in with PayPal fails for the sandbox account that owns the app and needs https return URLs (Dukkan's lesson). Use a separate sandbox business account, or keep a single merchant for the demo.
- EUR sandbox merchant needs Payment Receiving Preferences set, or payments stay pending.
- Agent Toolkit create_product is the Catalog Products API built for subscriptions, not a storefront catalog. Keep the catalog in your own DB.
- Building a remote MCP, ACP feed, UCP profile, vision pipeline, Channel3 integration and checkout in 44h is a lot. Cut UCP first if needed.

**Build facts**

- ACP spec: feed JSON schema at spec/2026-04-17/json-schema/schema.feed.json; MCP binding over Streamable HTTP at /mcp; discovery via /.well-known/acp.json (https://github.com/agentic-commerce-protocol/agentic-commerce-protocol).
- Channel3: POST https://api.trychannel3.com/v1/search with x-api-key; accepts query, image_url or base64_image; price at offers[].price.price; 402 when credits run out (https://channel3.ai/docs/api-reference/v1/search.md).
- Remote MCP commerce tools search_product/create_cart/checkout_cart are gift cards only (header x-feature-flags: commerce:true), so they are unusable for the seller's own goods (https://developer.paypal.com/ai-tools/agent-tools/).
- ChatGPT feed onboarding is for approved partners only, and in-chat Instant Checkout was wound down in March 2026. Demo through an MCP connector instead (https://developers.openai.com/commerce/guides/get-started.md, https://www.modernretail.co/technology/what-went-wrong-with-chatgpts-instant-checkout/).
- WebMCP: the buyer still approves in PayPal; 3 tool calls vs 30+ UI steps (https://developer.paypal.com/community/blog/WebMCP_PayPal_Agent_Ready).
- Best Use of Channel3 is $1,500 with one winner, judged by a Channel3 founding engineer (https://paypalaihackathon.devpost.com/).

## planpay: YELLOW (originality 6/10)

**Win odds:** Bryntum sponsor (3 × $1k): about 20–25%. A clinical-dependency Gantt where payments are milestones and patients run what-ifs is a deep, visible Bryntum use, though Tranche and pawhold compete. Most Impactful honorable mention: about 8–12%, if the Dentix/iDental pay-per-phase story and the Spain/EUR Pay Later fit land in the video. Top-3: about 3–4%.

**Closest prior art**

- [Plainbill, PayPal AI Hackathon entry](https://devpost.com/software/plainbill): 7/10. Same core loop: Claude explains a medical bill in plain language, a patient chatbot answers questions, and payment runs through PayPal Orders/Pay Later, Subscriptions 3/6-month 0% plans, Invoicing v2, the Agent Toolkit and an AG Grid dashboard. It works on post-visit US bills with no phases or schedule. Plainpay and Pre-Price are close variants.
- [Tranche (PayPal × Bryntum), PayPal AI Hackathon entry](https://github.com/dumplingdeveloper/tranche-paypal-bryntum): 4/10 on domain but the same mechanism: each PayPal Invoicing tranche is a milestone on a Bryntum Gantt, so a late payment blocks the next phase, and an AI proposes reschedules while the scheduler, not the LLM, computes the dates. It is for freelancers, not healthcare, and competes for the same Bryntum prize.
- [Enterprise DNA – Omni treatment-plan presentation agent](https://enterprisedna.co/resources/blog/medical-automate-treatment-plan-presentations): 6–7/10 in the market. It turns dental treatment plans into plain-language visual presentations with urgency phasing, monthly financing options and static 'consequences of delay'. It is a US custom build with no payment collection, no timeline UI and no PayPal.

**Differentiation**

- Pre-treatment, multi-phase plans: every PayPal medical entry (Plainbill, Plainpay, BillCheck, CareFree) works on a post-visit bill, and Pre-Price quotes a single procedure. Nobody turns a multi-visit clinic quote (implants, ortho, perio) into phases.
- Pay as you progress ('you never prepay for treatment you haven't received'): each phase is its own one-time PayPal Order, charged when its appointment comes due. This speaks directly to the Spanish Dentix/iDental/Funnydent collapses, where patients kept paying linked loans for treatment they never got. It is an impact story with an official source (dsca.gob.es), and a Spanish team can tell it credibly.
- Each phase sized to fit Spain's PayPal Pay in 3 (€20–€2,000) or installment brackets, with unedited Pay Later messaging per phase. Present this as honest phasing that makes 0% possible. Lenders (seQura, Sunbit, Cherry) finance the whole quote and have no incentive to do this.
- A live 'what if I delay phase 2?' on a Bryntum Gantt with clinical dependencies (extraction → healing → implant): dragging a phase recomputes both appointments and payment due dates, and the risk note comes from clinician-approved text. All matches show static copy or only shift dates for US insurance.
- A clinic-side agent on the Agent Toolkit that creates per-phase invoices, deposits via Invoicing partial payments and pre-appointment reminders from the approved plan, and shows a plain-language diff when the dentist edits the plan.
- Spain/EU private-pay dental: every rival is built around US insurance (EOB, CPT/CDT, Medicare prices). Spanish dental care is mostly paid out of pocket, so the Spanish-language EUR version is uncontested.

**Pivot:** Keep the idea but cut the generic 'explain + installments' framing, which Plainbill and Plainpay already own. Rename it, since PlanPay sits too close to Plainpay, Plainbill and PlanPilot; something Spanish like 'PorFases' would do. Pitch 'pay per phase, never prepay', anchored on the Dentix/iDental story. Demo arc: a synthetic Spanish presupuesto PDF goes in; a deterministic phase engine (the LLM only extracts and words things) builds phases with dependencies; a Bryntum Gantt shows each phase as a milestone with PayPal status colours; phase 1 is paid via Orders v2 with Pay in 3 (buyer-country=ES); the patient drags phase 2 and asks the chatbot what changes; the clinic agent sends the updated invoice. Stack Most Impactful with Bryntum.

**Build risks**

- Pay Later in Spain may not render in sandbox: buyer-country=ES works only in sandbox, and Pay in 3 availability is unconfirmed. Test in hour 1, and have a fallback that shows the official messaging component without claiming eligibility.
- Pay Later is excluded from Subscriptions, recurring and reference-transaction integrations. You need one one-time Order per phase; don't plan 'Pay Later installments via Subscriptions' as the brief says.
- Sandbox has no clock control for Subscriptions, and a subscription needs buyer approval (otherwise APPROVAL_PENDING). Use a labelled simulated clock that records invoice payments, as Pre-Price did.
- PayPal's AUP lists medical services as a restricted category needing pre-approval, and Pay Later may be sector-restricted. This is fine in sandbox, but say it in the pitch before PayPal judges do.
- Liability: the chatbot must answer clinical 'what if' questions only from clinician-approved notes, and the LLM must never compute money or dates (judges reward the deterministic-engine pattern).
- GDPR special-category health data: use synthetic patients only and say so.
- Bryntum competition: about 35 Bryntum+PayPal repos exist, and pawhold (vet, Bryntum Scheduler) explicitly targets Most Impactful. Tranche uses a Gantt for payment phases.
- Scope: PDF extraction, phase engine, Gantt, Orders, Invoicing, chatbot and agent is a lot for 44h. Prioritise Gantt + per-phase Orders + delay what-if, and treat the chatbot as a thin layer.

**Build facts**

- Pay Later ES: Pay in 3 at €20–€2,000; installments over 6/12/24 months at €120–€5,000 (other PayPal pages say €30 / €2,999). Requires a Spain-based merchant, EUR and a one-time integration. Not eligible on Recurring/Reference Transactions. Messaging must be shown unedited (https://developer.paypal.com/docs/checkout/pay-later/es/).
- Invoicing v2 partial payments: configuration.partial_payment.allow_partial_payment + minimum_amount_due; statuses UNPAID → PARTIALLY_PAID → PAID; INVOICING.INVOICE.PAID fires on partial payments (https://developer.paypal.com/invoicing/use-cases).
- Agent Toolkit invoice tools: create_invoice, send_invoice, send_invoice_reminder, generate_invoice_qr_code, record_payment_for_invoice, record_refund_for_invoice, create_recurring_series. Sandbox is the default, and tokens last 3–8h, so build token refresh (https://github.com/paypal/agent-toolkit).
- JS SDK: buyer-country works only in sandbox; enable-funding=paylater (https://developer.paypal.com/sdk/js/configuration/).
- PayPal invoice numbers are limited to 25 characters; the JS SDK popup can fall back to a full-page redirect, so build a reconcile path (https://github.com/AryanP3208/plainpay).
- No sandbox clock for Subscriptions; Pre-Price's workaround is a simulated clock plus POST /v2/invoicing/invoices/{id}/payments (https://github.com/christin09110-stack/pre-price).
- Rules: one Grand Prize OR one Honorable Mention, plus one Sponsor Prize, so Most Impactful + Bryntum can stack; Bryntum is 3 × $1,000 (https://paypalaihackathon.devpost.com/rules).
- Spain linked-credit context for the pitch: https://www.dsca.gob.es/ca/consumo/preguntas-frecuentes/tenia-tratamiento-dental-financiado-entidad-que-propuso-clinica-pero
