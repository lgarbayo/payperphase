# Contributing to PayPerPhase

Thank you so much for taking the time to read this. It genuinely means a lot. PayPerPhase is a small project born at [Build What's Next with PayPal and AI](https://paypalaihackathon.devpost.com/) (the PayPal AI Hackathon 2026), and the fact that you are here considering contributing to it is something we do not take for granted.

This guide covers how to set up the project, the rules the code follows, how to test it, and what happens after you open a pull request.

## How long a review takes
- **First response to an issue or pull request: within 24–48 hours.** Usually a comment, a question or a review.
- **Merging** takes longer if a change needs discussion or more tests. We say so in the pull request rather than going quiet.
- **During the hackathon judging window (until 15 Dec 2026)** the `main` branch deploys the demo the judges are using. We will review contributions in that window, but we will hold merges that change how the hosted demo behaves until judging ends.

The maintainer is Luis Garbayo Fernández ([lugarbayo@gmail.com](mailto:lugarbayo@gmail.com)).

## Ways to contribute
- **Report a bug.** Open an issue with what you did, what you expected and what happened. Include the URL, the language (ES/EN) and, if you can, the output of `/api/health`.
- **Suggest an idea.** Open an issue that starts with the problem, not the solution. Examples: "a patient cannot tell which phase is next", or "aligner plans need batch milestones".
- **Improve the docs.** Typos, unclear steps and missing troubleshooting entries are all welcome.
- **Send code.** Read the rest of this page first, especially [the project rules](#the-project-rules).

Security problems are different: please **do not** open a public issue. Follow [SECURITY.md](SECURITY.md).

## Set up your environment
You need Node 22 and npm. Nothing else is required: every external service has a labelled mock mode.

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-user>/payperphase.git
cd payperphase

# 2. Install the exact dependency versions
npm ci

# 3. Create your local config; every secret is optional
cp .env.example .env

# 4. Run it
npm run dev        # http://localhost:3000, in labelled mock mode without keys
```

To work against the real PayPal sandbox and Claude, fill in the keys as described in [`docs/sandbox-setup.md`](docs/sandbox-setup.md). Never commit `.env`.

To run the browser tests once, install the browser:

```bash
npx playwright install chromium
```

## Make a change
1. **Create a branch with a descriptive name** from `main`, prefixed with the commit type: for example `fix/agent-reminder-date`, `feat/gantt-aligner-batches` or `docs/troubleshooting-webhooks`.
2. **Make the change**, following the project rules and coding standards below.
3. **Build it cleanly** before you push:

   ```bash
   npm run check      # typecheck + every Vitest suite
   npm run build      # production build
   npm run e2e        # optional but welcome: Playwright demo path and Gantt drag (mock mode)
   ```

4. **Update [CHANGELOG.md](CHANGELOG.md)** under "Unreleased", in a sentence that says what changed and why.
5. **Open a pull request against `main`.** Explain the problem, the change, and how you tested it. Screenshots help for anything visual.
6. **At least one maintainer reviews and merges it.** Nobody merges their own pull request without a review, and nothing is pushed straight to `main`.

## The project rules
These rules are the design of the product, not style preferences. A pull request that breaks one will be asked to change, however small it is.

- **Money is integer euro cents, produced only by the phase engine** (`src/engine`). No floats, and no amounts from the browser: the server reads them from the store.
- **Dates are date-only values, produced only by the engine.** Bryntum draws them and never computes them; every task stays `manuallyScheduled`.
- **An LLM never decides money or dates.** Model output that a patient reads is a slot template filled from engine values, and a dentist approves it. Chat answers must pass the numeric grounding check.
- **The billing agent stays behind the guard.** Every tool call is checked for amount, currency, invoice number and recipient. Sending after a plan edit needs a human Approve on the exact stored payload. New agent tools must be added to the allowlist in `src/contracts/agent.ts` and covered by guard tests.
- **No payment before the visit, on either rail.** The server creates a PayPal order only for a phase that is due, and the billing agent creates and sends a phase's invoice only from its visit day. "Due" is always recomputed from the engine's dates at the simulated clock's today (`src/engine/payments.ts`), never read from a stored status. The guard enforces it for invoices: `create_invoice` and `send_invoice` for a phase that is not due are rejected with `PHASE_NOT_DUE`. Do not reintroduce future-dated invoices: PayPal makes them `SCHEDULED`, and the sandbox then refuses to cancel or remind them.
- **Every integration keeps a labelled mock mode.** If you add a call to an external service, the app must still run without its key and must show a visible badge when it is mocked or cached.
- **Every user-facing string exists in Spanish and English.** The i18n parity test fails otherwise.
- **Sandbox only, synthetic patients.** Never add real patient data, real PayPal accounts or production credentials, and never commit a secret.

## Coding standards
There is no formatter or linter configured yet, so follow the style of the code around you:
- TypeScript in `strict` mode, with zod schemas in `src/contracts` for anything that crosses a boundary (API, store, model output).
- Two-space indentation, double quotes, semicolons and trailing commas.
- Small pure functions in `src/engine`, with no I/O.
- Comments that explain *why*, not *what*.

If you want to add a formatter, propose [Prettier](https://prettier.io/) with its defaults and a wider `printWidth` (the code uses long lines) in its own pull request, applied in one formatting-only commit. That is the closest match to the existing code.

## Tests
- **Engine changes** need Vitest tests, and property tests (fast-check) where an invariant exists. Examples: "the phases always sum to the quote total" or "a delay never breaks a healing minimum".
- **Gantt changes** must keep [`tests/gantt/parity.test.ts`](tests/gantt/parity.test.ts) green: a real Bryntum ProjectModel must agree with the engine day for day.
- **PayPal and agent changes** need tests against the scripted clients in `tests/paypal` and `tests/agent`. Tests never call the real sandbox.
- **Visible changes to the demo path** should keep `npm run e2e` green.

## Commit messages
We use [Conventional Commits](https://www.conventionalcommits.org/). The format is:

```
<type>(<optional scope>): <description>

<optional body: why the change, and how it differs from before>

<optional footer: issue references, BREAKING CHANGE>
```

**Types:**

| Type | Use it for |
|---|---|
| `feat` | Adding, adjusting or removing a feature of the API or UI |
| `fix` | Fixing a bug in an API or UI feature |
| `refactor` | Restructuring code without changing behaviour |
| `perf` | A refactor that improves performance |
| `style` | Formatting or visual style only, with no change in behaviour |
| `test` | Adding or correcting tests |
| `docs` | Documentation only |
| `build` | Build tools, dependencies, project version |
| `ops` | Deployment, CI/CD, infrastructure |
| `chore` | Anything else, such as `.gitignore` |

**Scopes** are optional and name the area you touched. The most used ones in the history are `agent`, `gantt`, `server`, `chat`, `clinic`, `pay`, `paypal`, `patient`, `ui`, `extract`, `deploy`, `impact`, `engine` and `odontogram`. Do not use issue numbers as scopes.

**The description:**
- Use the imperative mood: "add", not "added" or "adds".
- Start with a lowercase letter.
- Do not end it with a full stop.

A breaking change gets a `!` before the colon and a `BREAKING CHANGE:` footer.

Examples from this repository's style:

```
feat(gantt): shade the healing zone while a visit is dragged
fix(agent): record a checkout capture as an external invoice payment
test(engine): property-test that a delay never breaks a healing minimum
docs: explain the invoice-rail limit in the README
feat(api)!: require a plan id on /api/chat

BREAKING CHANGE: the "demo" alias is no longer accepted by /api/chat.
```

## Definition of done
A contribution is ready to merge when all of these are true:
- [ ] It solves the problem described in the pull request, and nothing unrelated.
- [ ] `npm run check` and `npm run build` pass locally and in CI.
- [ ] New behaviour has tests, and the project rules above still hold.
- [ ] New user-facing text exists in Spanish and English.
- [ ] Mock mode still works without keys, with its badge.
- [ ] Docs are updated where behaviour changed (README, `docs/`, `.env.example`).
- [ ] [CHANGELOG.md](CHANGELOG.md) has an entry under "Unreleased" that says what changed and why.
- [ ] The commits follow Conventional Commits.
- [ ] A maintainer has reviewed and approved it.

## Working with AI coding agents
Much of this project was written with Claude Code. If you use an AI agent too, you are responsible for its output exactly as if you had typed it. Make sure the agent follows the project rules, runs the tests and updates CHANGELOG.md, and read every line before you open the pull request.

## Code of conduct and licence
Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you agree that your contribution is licensed under the [MIT licence](LICENSE) of this project.
