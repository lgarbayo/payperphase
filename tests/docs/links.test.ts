import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SUBMISSION_DIR = join(ROOT, "docs/submission");

const docs = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  "docs/ARCHITECTURE_DECISIONS.md",
  ...readdirSync(SUBMISSION_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/submission/${f}`),
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Markdown links and images, skipping fenced code blocks. */
function relativeTargets(markdown: string): string[] {
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, "");
  const out: string[] = [];
  for (const m of withoutFences.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1] ?? "";
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    out.push((target.split("#")[0] ?? "").split("?")[0] ?? "");
  }
  return out.filter(Boolean);
}

describe("docs: relative links", () => {
  it("covers README and every submission document", () => {
    expect(docs).toContain("README.md");
    for (const f of ["devpost.md", "ai-tools.md", "video-script.md", "checklist.md"]) {
      expect(docs).toContain(`docs/submission/${f}`);
    }
  });

  for (const doc of docs) {
    it(`${doc}: every relative link points at a file that exists`, () => {
      const missing = relativeTargets(read(doc)).filter(
        (t) => !existsSync(resolve(ROOT, dirname(doc), decodeURI(t))),
      );
      expect(missing).toEqual([]);
    });
  }

  it("the README links the deploy and sandbox docs and the architecture diagram", () => {
    const targets = relativeTargets(read("README.md"));
    for (const t of ["docs/deploy.md", "docs/sandbox-setup.md", "docs/architecture/diagram.svg", "LICENSE"]) {
      expect(targets).toContain(t);
    }
  });
});

describe("docs: no secrets", () => {
  const patterns: [string, RegExp][] = [
    ["a PAYPAL_CLIENT_SECRET with a value", /PAYPAL_CLIENT_SECRET\s*[=:]\s*["'`]?[A-Za-z0-9_-]{4,}/],
    ["an Anthropic key prefix", /sk-ant-/],
    ["an access token", /access_token/i],
    ["a bearer token", /Bearer\s+[A-Za-z0-9._-]{16,}/],
  ];
  const scanned = [...docs, "docs/architecture/diagram.mmd", "docs/architecture/diagram.svg"];

  for (const file of scanned) {
    it(`${file} has no secret-looking string`, () => {
      const text = read(file);
      const hits = patterns.filter(([, re]) => re.test(text)).map(([name]) => name);
      expect(hits).toEqual([]);
    });
  }
});

describe("docs: open-source files", () => {
  it("security and conduct reports go to a private channel, never a public issue", () => {
    for (const f of ["SECURITY.md", "CODE_OF_CONDUCT.md"]) {
      const text = read(f).replace(/\*\*/g, "");
      expect(text, f).toMatch(/mailto:/);
      expect(text, f).toMatch(/do not (open|report) .*public issue/i);
    }
  });

  it("the contributing guide sets the review expectation and the project rules", () => {
    const text = read("CONTRIBUTING.md");
    expect(text).toContain("24–48 hours");
    expect(text).toContain("## The project rules");
    expect(text).toContain("## Definition of done");
    expect(text).toMatch(/Conventional Commits/);
  });

  it("the changelog keeps an Unreleased section and tells agents to update it", () => {
    const text = read("CHANGELOG.md");
    expect(text).toContain("## [Unreleased]");
    expect(text).toMatch(/AI coding agents too/);
  });
});

describe("docs: submission requirements", () => {
  it("the README keeps the milestone list with the AI-to-PayPal milestone ticked", () => {
    const readme = read("README.md");
    expect(readme).toContain("## Hackathon milestones");
    expect(readme).toMatch(/- \[x\] AI core connected to PayPal/);
    expect(readme).toMatch(/- \[x\] End-to-end flow on the hosted URL/);
  });

  it("the first screenful carries the positioning against the rivals", () => {
    const top = read("README.md").split("\n").slice(0, 12).join("\n").toLowerCase();
    for (const phrase of ["pre-treatment", "multi-phase", "healing", "per phase", "€0", "spain", "eur"]) {
      expect(top, phrase).toContain(phrase);
    }
  });

  it("states the compliance line, GDPR and the licence", () => {
    const readme = read("README.md");
    expect(readme).toContain("Sandbox only · synthetic patients · medical services require PayPal pre-approval in production");
    expect(readme).toMatch(/GDPR/);
    expect(readme).toMatch(/\[MIT\]\(LICENSE\)/);
  });

  it("the hosted demo and the video are real links, and the buyer login is kept out of the repo", () => {
    const readme = read("README.md");
    expect(readme).toMatch(/Hosted demo\*\* \| \[payperphase\.onrender\.com\]\(https:\/\/payperphase\.onrender\.com\/\?lang=en\)/);
    expect(readme).toMatch(/Demo video \([0-9]:[0-5][0-9]\)\*\* \| https:\/\/youtu\.be\/M8x4rEFkYV0/);
    expect(readme).toMatch(/test credentials field of the Devpost submission/);
    expect(readme).not.toMatch(/Buyer password \|/);
  });

  it("the Devpost tagline fits Devpost's 60 characters and the copy has every section", () => {
    const devpost = read("docs/submission/devpost.md");
    const tagline = (devpost.split("## Tagline\n")[1] ?? "").split("\n")[0]?.trim() ?? "";
    expect(tagline.length).toBeGreaterThan(0);
    expect(tagline.length).toBeLessThanOrEqual(60);
    for (const h of ["Inspiration", "What it does", "How we built it", "Challenges we ran into", "Accomplishments that we're proud of", "What we learned", "What's next", "Built with", "Prize categories"]) {
      expect(devpost, h).toContain(`## ${h}`);
    }
    expect(devpost).toMatch(/Most Impactful/);
    expect(devpost).toMatch(/Best Use of Bryntum/);
    expect(devpost).toMatch(/Best Use of Render/);
  });

  it("the AI tools statement names every model and says where the LLM is not used", () => {
    const ai = read("docs/submission/ai-tools.md");
    for (const s of ["Claude Sonnet 5.5", "Claude Haiku 5.5", "Agent Toolkit", "Claude Code", "Where the LLM is not used"]) {
      expect(ai, s).toContain(s);
    }
    expect(ai).toMatch(/not on a REST fallback/);
  });

  it("the video script stays within the 180-second limit of fleet/hackathon.json", () => {
    const limit = (JSON.parse(read("fleet/hackathon.json")) as { submission: { video: { maxSeconds: number } } }).submission.video.maxSeconds;
    const script = read("docs/submission/video-script.md");
    const toSeconds = (t: string | undefined) => {
      const [m = 0, s = 0] = (t ?? "").split(":").map(Number);
      return m * 60 + s;
    };
    const beats = [...script.matchAll(/^## \d+\. .*?· (\d:\d\d)–(\d:\d\d)/gm)].map(
      (m): [number, number] => [toSeconds(m[1]), toSeconds(m[2])],
    );
    expect(beats.length).toBeGreaterThanOrEqual(8);
    let prevEnd = 0;
    for (const [start, end] of beats) {
      expect(start).toBe(prevEnd);
      expect(end).toBeGreaterThan(start);
      prevEnd = end;
    }
    expect(prevEnd).toBeLessThanOrEqual(limit);
    expect(prevEnd).toBeLessThanOrEqual(175);
  });

  it("no doc calls the shipped odontogram or patient chat unbuilt, and none overclaims the invoice rail", () => {
    for (const doc of docs) {
      const text = read(doc);
      expect(text, doc).not.toMatch(/not in this build/i);
      expect(text, doc).not.toMatch(/provably €0/i);
    }
  });

  it("no doc says phase invoices are still sent at approval; the README states the visit-day rule", () => {
    // Current behaviour: a phase invoice is created and sent only once the phase is due (ADR-8).
    // Released CHANGELOG sections are history, so only its Unreleased section is checked.
    const current = (doc: string): string => {
      const text = read(doc);
      return doc === "CHANGELOG.md" ? (text.split(/^## \[\d/m)[0] ?? "") : text;
    };
    const stale: RegExp[] = [
      /\b(are|is) (sent|issued)( and sent)? (at|on) (plan )?approval/i,
      /\b(are|is) (sent|issued)( and sent)? when the plan is approved/i,
      /^- issue and send every phase invoice/im,
      /we issue the invoice at approval/i,
      /invoice rail cannot/i,
      /sending (each )?invoices? on (its|the) visit day (instead )?is (planned|the next step)/i,
      /send each phase invoice on its visit day instead of at approval/i,
      /reminders? (follow|when|for) (the )?upcoming/i,
    ];
    for (const doc of docs) {
      const text = current(doc);
      for (const re of stale) expect(text, `${doc}: ${re}`).not.toMatch(re);
    }

    const readme = read("README.md");
    expect(readme).toMatch(/invoice is issued on its visit day/i);
    expect(readme).toMatch(/PHASE_NOT_DUE/);
    expect(readme).toMatch(/SCHEDULED/);
    expect(readme).toMatch(/422/);
    expect(readme).not.toMatch(/A known limit, stated plainly/);
  });

  it("the checklist flags the items that need a human", () => {
    const checklist = read("docs/submission/checklist.md");
    expect(checklist.match(/\*\*HUMAN\*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
    expect(checklist).toMatch(/180/);
  });
});
