"use client";
/**
 * OWNED BY WP-08. FDI odontogram (SVG) with per-tooth treatment marks and staggered reveal.
 *
 * Upper arch 18→11 | 21→28, lower arch 48→41 | 31→38 (patient's right on the image's left).
 * Marks are coloured by procedure category (`--ppp-cat-*`), carry the phase number as a badge,
 * and look different per treatment: extraction (cross), missing (hatch), implant (threaded post),
 * crown (cap), filling (dot), root canal (canal in the roots). Each tooth has an accessible name.
 */
import { useEffect, useId, useRef, type CSSProperties } from "react";
import { motion } from "framer-motion";
import type { FdiTooth, Locale } from "@/contracts";
import { usePrefersReducedMotion } from "@/components/motion";
import { translate, type KeyOf } from "@/i18n/core";
import { cx } from "@/lib/ui";
import {
  CATEGORY_VAR,
  KIND_CATEGORY,
  KIND_ORDER,
  marksFromLines,
  phaseBadgeText,
  summarizeTeeth,
  type MarkKind,
  type ToothMark,
  type ToothSummary,
} from "./marks";

export { marksFromLines };
export type { ToothMark };

export interface OdontogramProps {
  marks: ToothMark[];
  /** Teeth to pulse right now (e.g. the line being extracted). */
  highlight?: FdiTooth[];
  /** Stagger reveal of marks in this order (ms between teeth). 0 = no animation. */
  revealStaggerMs?: number;
  locale: Locale;
  size?: "sm" | "md" | "lg";
  /** Also draw the primary (baby) dentition, 55–85, under the permanent one. */
  primary?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Geometry. One tooth is drawn "upper" (roots up, crown down) in a 60-unit-high box and flipped
// for the lower arch. Everything is generated from the slot width so teeth fit without distortion.
// ---------------------------------------------------------------------------------------------

type ToothType = "molar" | "premolar" | "canine" | "incisor";

const BOX_H = 60;
const PAD = 10;
const MID_GAP = 10;
const GAP = 3;
const OCC_GAP = 22; // clear space between the two occlusal edges at the midline
const NUM_H = 17;
const TOP = NUM_H + 6;
const EDGE = 55; // typical occlusal edge inside a tooth box
/** Lower box top relative to upper box top at the midline: edges are OCC_GAP apart. */
const LOWER_DY = EDGE + OCC_GAP - (BOX_H - EDGE);
const CURVE = 0.16; // gentle curve of Spee: posterior teeth sit slightly outward

const PERM_WIDTHS = [29, 27, 30, 32, 32, 40, 38, 36];
const PERM_TYPES: ToothType[] = ["incisor", "incisor", "canine", "premolar", "premolar", "molar", "molar", "molar"];
const PRIM_WIDTHS = [27, 25, 28, 36, 40];
const PRIM_TYPES: ToothType[] = ["incisor", "incisor", "canine", "molar", "molar"];

interface GlyphPaths {
  crown: string;
  roots: string;
  /** y of the crown's occlusal edge (the side facing the opposite arch). */
  edge: number;
  /** y where crown and roots meet. */
  neck: number;
}

function glyph(type: ToothType, w: number): GlyphPaths {
  const c = w / 2;
  switch (type) {
    case "incisor":
      return {
        neck: 30,
        edge: 55,
        crown: `M3 34 Q3 30 7 30 H${w - 7} Q${w - 3} 30 ${w - 3} 34 V51 Q${w - 3} 55 ${w - 7} 55 H7 Q3 55 3 51 Z`,
        roots: `M${c - 4.5} 31 Q${c - 3.5} 15 ${c - 1} 3 Q${c} 0.5 ${c + 1} 3 Q${c + 3.5} 15 ${c + 4.5} 31 Z`,
      };
    case "canine":
      return {
        neck: 31,
        edge: 59,
        crown: `M3 36 Q3 31 8 31 H${w - 8} Q${w - 3} 31 ${w - 3} 36 V45 Q${w - 3} 50 ${c} 59 Q3 50 3 45 Z`,
        roots: `M${c - 5} 32 Q${c - 4} 15 ${c - 1} 2 Q${c} -0.5 ${c + 1} 2 Q${c + 4} 15 ${c + 5} 32 Z`,
      };
    case "premolar":
      return {
        neck: 30,
        edge: 55,
        crown: `M3 35 Q3 30 9 30 H${w - 9} Q${w - 3} 30 ${w - 3} 35 V48 Q${w - 3} 55 ${w - 9} 55 H9 Q3 55 3 48 Z`,
        roots: `M${c - 5.5} 31 Q${c - 4.5} 15 ${c - 1.5} 3 Q${c} 0.5 ${c + 1.5} 3 Q${c + 4.5} 15 ${c + 5.5} 31 Z`,
      };
    case "molar":
      return {
        neck: 29,
        edge: 55,
        crown: `M3 34 Q3 29 9 29 H${w - 9} Q${w - 3} 29 ${w - 3} 34 V49 Q${w - 3} 55 ${w - 9} 55 H${c + 4} Q${c + 1} 55 ${c} 51.5 Q${c - 1} 55 ${c - 4} 55 H9 Q3 55 3 49 Z`,
        roots:
          `M${c - 12} 30 Q${c - 14} 16 ${c - 11} 5 Q${c - 9} 1 ${c - 7} 5 Q${c - 4} 16 ${c - 1.5} 30 Z ` +
          `M${c + 1.5} 30 Q${c + 4} 16 ${c + 7} 5 Q${c + 9} 1 ${c + 11} 5 Q${c + 14} 16 ${c + 12} 30 Z`,
      };
  }
}

interface Placed {
  tooth: FdiTooth;
  type: ToothType;
  w: number;
  x: number;
  /** Distance from the midline, in teeth (0 = central incisor). */
  d: number;
  upper: boolean;
}

interface Layout {
  placed: Placed[];
  width: number;
  height: number;
  /** Largest curve offset, in units. */
  maxCurve: number;
}

function quadrantWidth(widths: number[]) {
  return widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1);
}

/** Place the four quadrants of one dentition. `q` = [upper-left, upper-right, lower-left, lower-right]. */
function buildLayout(q: [number, number, number, number], widths: number[], types: ToothType[]): Layout {
  const n = widths.length;
  const qw = quadrantWidth(widths);
  const placed: Placed[] = [];
  const quad = (quadrant: number, left: boolean, upper: boolean) => {
    const order = Array.from({ length: n }, (_, i) => (left ? n - 1 - i : i)); // digit-1, in drawing order
    let x = left ? PAD : PAD + qw + MID_GAP;
    for (const i of order) {
      placed.push({ tooth: quadrant * 10 + i + 1, type: types[i]!, w: widths[i]!, x, d: i, upper });
      x += widths[i]! + GAP;
    }
  };
  quad(q[0], true, true);
  quad(q[1], false, true);
  quad(q[2], true, false);
  quad(q[3], false, false);
  const maxCurve = CURVE * (n - 1) ** 2;
  const height = TOP + 2 * maxCurve + LOWER_DY + BOX_H + 20;
  return { placed, width: qw * 2 + MID_GAP + PAD * 2, height, maxCurve };
}

const PERMANENT_LAYOUT = buildLayout([1, 2, 4, 3], PERM_WIDTHS, PERM_TYPES);
const PRIMARY_LAYOUT = buildLayout([5, 6, 8, 7], PRIM_WIDTHS, PRIM_TYPES);

function rowOrigin(p: Placed, layout: Layout) {
  const curve = CURVE * p.d * p.d;
  // Upper: roots up, the curve lifts posterior teeth. Lower: mirrored.
  return p.upper ? TOP + layout.maxCurve - curve : TOP + layout.maxCurve + LOWER_DY + curve;
}

// ---------------------------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------------------------

const NEUTRAL_STROKE = "color-mix(in srgb, var(--ppp-muted) 55%, white)";
const NEUTRAL_ROOT = "var(--ppp-surface-2)";
const MISSING_STROKE = "color-mix(in srgb, var(--ppp-tooth-missing) 60%, var(--ppp-muted))";

const mix = (color: string, pct: number, base = "white") => `color-mix(in srgb, ${color} ${pct}%, ${base})`;
const kindColor = (k: MarkKind) => CATEGORY_VAR[KIND_CATEGORY[k]];

const stroke = (color: string, width = 1.25, extra?: CSSProperties) =>
  ({ stroke: color, strokeWidth: width, vectorEffect: "non-scaling-stroke", ...extra }) as CSSProperties;

/** Kinds that tint the crown (the rest draw their own shapes). */
const TINT_KINDS: readonly MarkKind[] = [
  "filling",
  "endodontic",
  "adjustment",
  "periodontal",
  "orthodontic",
  "impression",
  "preventive",
  "diagnostic",
  "other",
];

// ---------------------------------------------------------------------------------------------
// One tooth
// ---------------------------------------------------------------------------------------------

interface ToothProps {
  p: Placed;
  layout: Layout;
  summary?: ToothSummary;
  highlighted: boolean;
  label: string;
  hatchId: string;
  reduce: boolean;
  skipEntry: boolean;
  delayMs: number;
}

function Tooth({ p, layout, summary, highlighted, label, hatchId, reduce, skipEntry, delayMs }: ToothProps) {
  const g = glyph(p.type, p.w);
  const y0 = rowOrigin(p, layout);
  const has = summary?.has ?? new Set<MarkKind>();
  const implant = has.has("implant") || has.has("abutment");
  const crown = has.has("crown");
  const extractionPending = !!summary?.extractionPending;
  const missing = !!summary?.missing;
  const done = !!summary?.allDone;
  const cx = p.w / 2;

  const tintKind = summary?.entries.map((e) => e.kind).find((k) => TINT_KINDS.includes(k));
  const tint = tintKind ? kindColor(tintKind) : undefined;
  const fillPct = done ? 80 : 20;

  const baseOpacity = implant ? 0 : extractionPending ? 0.5 : missing ? 0.9 : 1;
  const sig = summary ? [...summary.has].sort().join("+") + (done ? "!" : "") : "";
  const tr = { duration: reduce ? 0 : 0.35 };

  const phases = summary?.phases ?? [];
  const badge = phaseBadgeText(phases);
  const badgeW = badge ? Math.max(18, badge.length * 6.4 + 9) : 0;
  // The badge straddles the occlusal edge; on a bare implant it sits on the healing cap instead.
  const badgeAt = implant && !crown ? g.neck + 14 : g.edge + 1;
  const badgeY = p.upper ? badgeAt : BOX_H - badgeAt;

  const flip = p.upper ? undefined : `translate(0 ${BOX_H}) scale(1 -1)`;
  const entry = skipEntry ? false : { opacity: 0, scale: 0.86 };
  const overlayTr = { duration: reduce ? 0 : 0.4, delay: delayMs / 1000, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <g
      data-tooth={p.tooth}
      data-marked={summary ? "true" : undefined}
      data-highlight={highlighted ? "true" : undefined}
      data-reveal-delay={summary ? Math.round(delayMs) : undefined}
      transform={`translate(${p.x} ${y0})`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>

      {highlighted && (
        <motion.rect
          data-testid="tooth-highlight"
          x={-2}
          y={-3}
          width={p.w + 4}
          height={BOX_H + 6}
          rx={10}
          fill={mix("var(--ppp-primary)", 10, "transparent")}
          style={stroke("var(--ppp-primary)", 2)}
          initial={{ opacity: reduce ? 1 : 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: [0.95, 0.4, 0.95] }}
          transition={reduce ? { duration: 0 } : { duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <g transform={flip}>
        {/* The natural tooth. It fades out when an implant replaces it. */}
        <motion.g initial={false} animate={{ opacity: baseOpacity }} transition={tr}>
          <path d={g.roots} fill={NEUTRAL_ROOT} style={stroke(NEUTRAL_STROKE)} strokeLinejoin="round" />
          <path d={g.crown} fill="var(--ppp-surface)" style={stroke(NEUTRAL_STROKE)} strokeLinejoin="round" />
        </motion.g>

        {summary && (
          <motion.g
            key={sig}
            initial={entry}
            animate={{ opacity: 1, scale: 1 }}
            transition={overlayTr}
            style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
          >
            {/* Crown tint for tooth-level treatments (filling, root canal, …) */}
            {tint && !implant && !crown && (
              <path
                d={g.crown}
                fill={mix(tint, fillPct)}
                strokeLinejoin="round"
                style={stroke(tint, 1.6)}
              />
            )}

            {has.has("endodontic") && !implant && (
              <>
                <path d={g.roots} fill={mix(kindColor("endodontic"), done ? 55 : 16)} style={stroke(kindColor("endodontic"), 1.3)} strokeLinejoin="round" />
                <path
                  d={`M${cx} ${g.neck + 2} L${cx} 8`}
                  fill="none"
                  strokeLinecap="round"
                  style={stroke(kindColor("endodontic"), 1.6)}
                />
              </>
            )}

            {has.has("filling") && !implant && (
              <rect x={cx - 5.5} y={g.neck + 9} width={11} height={9} rx={3} fill={kindColor("filling")} />
            )}

            {has.has("orthodontic") && !implant && (
              <>
                <line x1={3} x2={p.w - 3} y1={g.neck + 13} y2={g.neck + 13} style={stroke(kindColor("orthodontic"), 1.2)} />
                <rect x={cx - 4.5} y={g.neck + 8.5} width={9} height={9} rx={2} fill="var(--ppp-surface)" style={stroke(kindColor("orthodontic"), 1.6)} />
              </>
            )}

            {has.has("periodontal") && !implant && (
              <path
                d={`M2 ${g.neck} Q${cx} ${g.neck + 7} ${p.w - 2} ${g.neck}`}
                fill="none"
                strokeLinecap="round"
                style={stroke(kindColor("periodontal"), 2.2)}
              />
            )}

            {has.has("graft") && (
              <g fill={kindColor("graft")}>
                {[-6, 0, 6].map((dx, i) => (
                  <circle key={i} cx={cx + dx} cy={i === 1 ? 11 : 16} r={1.9} />
                ))}
              </g>
            )}

            {/* Implant: threaded titanium post, plus a healing cap until the crown is placed. */}
            {implant && (
              <g>
                <path
                  d={`M${cx - 6} ${g.neck + 2} L${cx - 4.6} 8 Q${cx} 2.5 ${cx + 4.6} 8 L${cx + 6} ${g.neck + 2} Z`}
                  fill={mix(kindColor("implant"), done ? 90 : 78)}
                  strokeLinejoin="round"
                  style={stroke(kindColor("implant"), 1.4)}
                />
                {[12, 16, 20, 24, 28].map((y) => {
                  const hw = 4.8 + ((y - 8) / (g.neck - 6)) * 1.3;
                  return <line key={y} x1={cx - hw} x2={cx + hw} y1={y} y2={y} strokeLinecap="round" style={stroke("white", 1.3, { opacity: 0.85 })} />;
                })}
                {!crown && (
                  <rect x={cx - 8.5} y={g.neck - 1} width={17} height={10} rx={3.5} fill={kindColor("implant")} />
                )}
              </g>
            )}

            {/* Crown cap */}
            {crown && (
              <g>
                <path
                  d={g.crown}
                  fill={mix(kindColor("crown"), done ? 90 : 72)}
                  strokeLinejoin="round"
                  style={stroke(kindColor("crown"), 1.8)}
                />
                <path
                  d={`M7 ${g.neck + 8} L7 ${g.edge - 8}`}
                  fill="none"
                  strokeLinecap="round"
                  style={stroke("white", 2, { opacity: 0.6 })}
                />
              </g>
            )}

            {/* Extraction pending: a cross over the tooth. Delivered / missing: hatch. */}
            {extractionPending && (
              <g fill="none" strokeLinecap="round" style={stroke(kindColor("extraction"), 2.4)}>
                <line x1={5} y1={7} x2={p.w - 5} y2={g.edge - 1} />
                <line x1={p.w - 5} y1={7} x2={5} y2={g.edge - 1} />
              </g>
            )}
            {missing && (
              <g>
                <path d={g.roots} fill={`url(#${hatchId})`} strokeDasharray="3 2.5" style={stroke(MISSING_STROKE, 1.2)} strokeLinejoin="round" />
                <path d={g.crown} fill={`url(#${hatchId})`} strokeDasharray="3 2.5" style={stroke(MISSING_STROKE, 1.2)} strokeLinejoin="round" />
              </g>
            )}
          </motion.g>
        )}
      </g>

      {/* Tooth number, on the outer side of the root. */}
      <text
        aria-hidden
        x={cx}
        y={p.upper ? -5 : BOX_H + 14}
        textAnchor="middle"
        style={{ fontSize: 17, fontFamily: "var(--ppp-font)", fontVariantNumeric: "tabular-nums" }}
        fill={summary ? "var(--ppp-ink)" : "var(--ppp-muted)"}
        fontWeight={summary ? 700 : 500}
      >
        {p.tooth}
      </text>

      {badge && (
        <g aria-hidden data-testid={`phase-badge-${p.tooth}`} transform={`translate(${cx} ${badgeY})`}>
          <rect x={-badgeW / 2} y={-8} width={badgeW} height={16} rx={8} fill="var(--ppp-ink)" stroke="white" strokeWidth={1.5} />
          <text y={4} textAnchor="middle" fill="white" fontWeight={700} style={{ fontSize: 11.5, fontFamily: "var(--ppp-font)" }}>
            {badge}
          </text>
        </g>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// Chart + legend
// ---------------------------------------------------------------------------------------------

type Key = KeyOf<"odontogram">;
type T = (key: Key, vars?: Record<string, string | number>) => string;

function toothLabel(tooth: FdiTooth, summary: ToothSummary | undefined, t: T): string {
  if (!summary) return t("toothName", { tooth });
  const parts = summary.entries.map((e) => {
    const name = t(`kind_${e.kind}` as Key);
    const bits: string[] = [];
    if (e.phases.length === 1) bits.push(t("phase", { n: e.phases[0]! }));
    else if (e.phases.length > 1) bits.push(t("phases", { n: e.phases.join(", ") }));
    if (e.done) bits.push(t("stateDone"));
    return bits.length ? `${name} (${bits.join(", ")})` : name;
  });
  if (summary.missing && !summary.has.has("extraction")) parts.unshift(t("stateMissing"));
  return t("toothNameWith", { tooth, marks: parts.join(", ") });
}

interface ChartProps {
  layout: Layout;
  summaries: Map<FdiTooth, ToothSummary>;
  highlight: ReadonlySet<FdiTooth>;
  t: T;
  groupLabel: string;
  reduce: boolean;
  skipEntry: boolean;
  delays: Map<FdiTooth, number>;
  hatchId: string;
  style?: CSSProperties;
  testId: string;
}

function Chart({ layout, summaries, highlight, t, groupLabel, reduce, skipEntry, delays, hatchId, style, testId }: ChartProps) {
  const mid = layout.width / 2;
  return (
    <svg
      data-testid={testId}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="group"
      aria-label={groupLabel}
      className="block h-auto w-full select-none"
      style={style}
      overflow="visible"
    >
      <defs>
        <pattern id={hatchId} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={5} stroke={MISSING_STROKE} strokeWidth={1.4} />
        </pattern>
      </defs>
      <line
        aria-hidden
        x1={mid}
        x2={mid}
        y1={4}
        y2={layout.height - 4}
        stroke="var(--ppp-border)"
        strokeWidth={1}
        strokeDasharray="2 4"
        vectorEffect="non-scaling-stroke"
      />
      {layout.placed.map((p) => (
        <Tooth
          key={p.tooth}
          p={p}
          layout={layout}
          summary={summaries.get(p.tooth)}
          highlighted={highlight.has(p.tooth)}
          label={toothLabel(p.tooth, summaries.get(p.tooth), t)}
          hatchId={hatchId}
          reduce={reduce}
          skipEntry={skipEntry}
          delayMs={delays.get(p.tooth) ?? 0}
        />
      ))}
    </svg>
  );
}

const MAX_WIDTH: Record<NonNullable<OdontogramProps["size"]>, number> = { sm: 340, md: 540, lg: 720 };

export function Odontogram({
  marks,
  highlight = [],
  revealStaggerMs = 0,
  locale,
  size = "md",
  primary = false,
}: OdontogramProps) {
  const reduce = usePrefersReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const t: T = (key, vars) => translate("odontogram", locale, key, vars);

  const summaries = summarizeTeeth(marks);
  const highlightSet = new Set(highlight);

  // Stagger: teeth that are new in this render fade in one after the other, in mark order.
  // First paint with no stagger (or reduced motion) shows existing marks without any entry animation.
  const firstRender = useRef(true);
  const known = useRef<Set<FdiTooth>>(new Set());
  const order = [...summaries.keys()];
  const fresh = order.filter((tooth) => !known.current.has(tooth));
  const staggered = !reduce && revealStaggerMs > 0;
  const delays = new Map<FdiTooth, number>(fresh.map((tooth, i) => [tooth, staggered ? i * revealStaggerMs : 0]));
  const skipEntry = reduce || (firstRender.current && revealStaggerMs <= 0);
  useEffect(() => {
    firstRender.current = false;
    known.current = new Set(order);
  });

  const present = KIND_ORDER.filter((k) => [...summaries.values()].some((s) => s.entries.some((e) => e.kind === k)));
  const showLegend = size !== "sm";
  const maxWidth = MAX_WIDTH[size];

  const chartProps = { summaries, highlight: highlightSet, t, reduce, skipEntry, delays };

  return (
    <div
      data-testid="odontogram"
      data-size={size}
      data-reveal={staggered ? "staggered" : "instant"}
      className={cx("mx-auto flex w-full flex-col gap-2")}
      style={{ maxWidth }}
    >
      <Chart
        {...chartProps}
        layout={PERMANENT_LAYOUT}
        groupLabel={t("groupLabel")}
        hatchId={`${uid}-hatch`}
        testId="odontogram-permanent"
      />

      {primary && (
        <div data-testid="odontogram-primary-block" className="mt-1 flex flex-col items-center gap-1">
          <p className="text-xs font-medium text-muted">{t("primaryTitle")}</p>
          <Chart
            {...chartProps}
            layout={PRIMARY_LAYOUT}
            groupLabel={t("primaryTitle")}
            hatchId={`${uid}-hatch-p`}
            testId="odontogram-primary"
            style={{ width: `${Math.round((PRIMARY_LAYOUT.width / PERMANENT_LAYOUT.width) * 100)}%`, margin: "0 auto" }}
          />
        </div>
      )}

      {showLegend &&
        (present.length > 0 ? (
          <ul aria-label={t("legend")} data-testid="odontogram-legend" className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-1 text-[11px] text-muted">
            {present.map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: kindColor(k) }} />
                {t(`kind_${k}` as Key)}
              </li>
            ))}
          </ul>
        ) : (
          <p data-testid="odontogram-empty" className="pt-1 text-center text-[11px] text-muted">
            {t("empty")}
          </p>
        ))}
    </div>
  );
}
