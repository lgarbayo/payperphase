# Security policy

PayPerPhase handles payment flows, so we take security reports seriously, even though it is a hackathon project that runs only against the PayPal sandbox with synthetic patients.

This policy follows the spirit of the EU Cyber Resilience Act (CRA). As non-commercial open-source software, PayPerPhase is not a "manufacturer" under the CRA; we follow its practices anyway because they are good ones.

## Supported versions
| Version | Supported |
|---|---|
| `main` (and the hosted demo built from it) | Yes |
| Anything else (old commits, forks, other branches) | No |

## Reporting a vulnerability
**Please do not open a public issue, discussion or pull request for a security problem.** Use one of these private channels:

1. **GitHub private vulnerability reporting** (preferred): the repository's **Security** tab → **Report a vulnerability**.
2. **Email** the maintainer, Luis Garbayo Fernández, at [lugarbayo@gmail.com](mailto:lugarbayo@gmail.com), with "PayPerPhase security" in the subject.

Please include:
- what an attacker could do, and why it matters;
- the steps to reproduce it, or a proof of concept;
- the commit or URL you tested, and the output of `/api/health` if relevant.

Never use real personal data or real payment accounts in a test. The sandbox is enough.

**What is especially useful to us:**
- creating or capturing a PayPal order for a phase that is not due, or for an amount that did not come from the server;
- getting a webhook applied without a valid PayPal signature;
- making the billing agent call a tool, or send an amount, that the guard should have blocked;
- making the patient chat or the quote extraction produce a figure or date that did not come from the engine;
- any way to read a secret (PayPal, Anthropic or Render credentials) from the app or the repository.

**Out of scope:** vulnerabilities in PayPal, Anthropic, Render, Bryntum or Next.js themselves (please report those to the vendor), and denial-of-service against the free demo.

## Response timelines
- **Acknowledgement within 48 hours.**
- **First assessment within 7 days.** We will tell you whether we can reproduce it, how serious we think it is and what happens next.
- **Fix:** best effort. Critical issues come first; we will keep you informed if a fix takes longer.

This project is maintained by one person in their own time, so the timelines are honest targets rather than a contractual service level.

## Known limitations
We prefer to state these openly:
- **No external security audit** has been done. The code was written in a few days during a hackathon, much of it with AI coding agents and reviewed by the maintainer.
- **The demo has no login, by design.** The clinic console, "Reset demo" and Director Mode are public so that judges can try everything. A real deployment needs clinic and patient authentication before anything else.
- **Single instance, one JSON file.** The store is a JSON file on one server's disk. It is not built for concurrent instances or for real health data.
- **Invoices for future phases are sent at plan approval.** PayPal's invoice page cannot block an early payment. The app records such a payment but does not count it as delivered care, and sending invoices on the visit day is planned.
- **Only the patient chat is rate-limited** (10 questions a minute per plan). Other public endpoints are not.
- **Dependencies have not been audited** beyond the lockfile and the CI build, and Bryntum Gantt is used as its public trial package.

## Disclosure policy
We ask for **coordinated disclosure**:
- please do not publish details until a fix is available, or until 90 days after your report, whichever comes first;
- we will agree a date with you if a fix needs more time;
- with your permission, we will credit you in the fix's release notes and in [CHANGELOG.md](CHANGELOG.md).

Thank you for helping keep PayPerPhase and its users safe.
