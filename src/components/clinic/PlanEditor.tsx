"use client";
/**
 * OWNED BY WP-07. Plan editor: add a line to a phase (with the one-click "Injerto óseo (+450 €)"
 * preset = GOLDEN_BONE_GRAFT_EDIT), remove a line, and mark a phase delivered. Each change goes to
 * POST /api/plans/:id/edit (or /deliver); the engine resizes, refits and reschedules.
 */
import { useId, useState, type FormEvent } from "react";
import {
  isValidFdi,
  ProcedureCodeSchema,
  type Locale,
  type Phase,
  type Plan,
  type PlanEdit,
  type ProcedureCode,
  type QuoteLine,
} from "@/contracts";
import { GOLDEN_BONE_GRAFT_EDIT } from "@/contracts/fixtures/implantCase";
import { formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Badge, Button, cx, StatusPill } from "@/lib/ui";
import { parseEuroInput, PROCEDURE_LABEL } from "./procedureLabels";
import { Icon, Spinner, ToothChip, type ClinicT } from "./shared";

/** What is in flight right now (one change at a time keeps the version sequence linear). */
export type EditorBusy = { kind: "edit" | "deliver"; key: string } | null;

export interface PlanEditorProps {
  plan: Plan;
  locale: Locale;
  t: ClinicT;
  busy: EditorBusy;
  error?: string | null;
  onEdit: (edit: PlanEdit, key: string) => void;
  onDeliver: (phaseId: string) => void;
}

export const BONE_GRAFT_PRESET_KEY = "preset-bone-graft";

function isLocked(p: Phase): boolean {
  return p.payment.status === "paid" || p.payment.status === "processing" || p.delivery.status === "delivered";
}

/** The demo preset, narrowed once (the edit itself is posted untouched). */
const BONE_GRAFT = GOLDEN_BONE_GRAFT_EDIT.kind === "ADD_LINE" ? GOLDEN_BONE_GRAFT_EDIT : null;

/** The preset only makes sense on the hero implant case, once. */
function presetState(plan: Plan): "available" | "done" | "hidden" {
  const target = BONE_GRAFT && plan.phases.find((p) => p.id === BONE_GRAFT.phaseId);
  if (!BONE_GRAFT || plan.caseKind !== "implant" || !target) return "hidden";
  const has = plan.lines.some((l) => target.lineIds.includes(l.id) && l.code === BONE_GRAFT.line.code);
  if (has) return "done";
  return isLocked(target) ? "hidden" : "available";
}

export function PlanEditor({ plan, locale, t, busy, error, onEdit, onDeliver }: PlanEditorProps) {
  const [openForm, setOpenForm] = useState<string | null>(null);
  const lineById = new Map(plan.lines.map((l) => [l.id, l]));
  const preset = presetState(plan);
  const presetPhase = BONE_GRAFT ? plan.phases.find((p) => p.id === BONE_GRAFT.phaseId) : undefined;
  const presetAmount = BONE_GRAFT ? formatCents(BONE_GRAFT.line.unitPriceCents, locale, { whole: true }) : "";
  const anyBusy = busy !== null;

  return (
    <div data-testid="plan-editor-body" className="flex flex-col gap-4">
      {preset !== "hidden" && presetPhase && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--ppp-radius)] border border-primary/20 bg-primary/5 px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-strong">{t("presetLabel")}</span>
          {preset === "available" ? (
            <Button
              size="sm"
              data-testid="preset-bone-graft"
              disabled={anyBusy}
              onClick={() => onEdit(GOLDEN_BONE_GRAFT_EDIT, BONE_GRAFT_PRESET_KEY)}
            >
              {busy?.key === BONE_GRAFT_PRESET_KEY ? <Spinner /> : <Icon.Plus width={14} height={14} />}
              {t("presetBoneGraft", { amount: presetAmount })}
            </Button>
          ) : (
            <Badge tone="paid" data-testid="preset-bone-graft-done">
              <Icon.Check width={12} height={12} />
              {t("presetDone")}
            </Badge>
          )}
          <span className="text-sm text-muted">
            {t("presetTarget", { n: presetPhase.n })} · {presetPhase.title[locale]}
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-status-overdue">
          <Icon.Alert />
          {error}
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {plan.phases.map((phase) => {
          const locked = isLocked(phase);
          const lines = phase.lineIds.map((id) => lineById.get(id)).filter((l): l is QuoteLine => !!l);
          const delivering = busy?.kind === "deliver" && busy.key === phase.id;
          return (
            <li
              key={phase.id}
              data-testid={`editor-phase-${phase.id}`}
              className="rounded-[var(--ppp-radius)] border border-border bg-surface shadow-[var(--ppp-shadow)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-strong">
                    {t("phaseLabel", { n: phase.n })} · {formatIsoDate(phase.startDate, locale)}
                  </p>
                  <p className="truncate font-medium text-ink">{phase.title[locale]}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums text-ink" data-testid={`editor-amount-${phase.id}`}>
                    {formatCents(phase.amountCents, locale)}
                  </span>
                  <StatusPill status={phase.payment.status} locale={locale} />
                  {phase.delivery.status === "delivered" ? (
                    <Badge tone="paid" data-testid={`delivered-${phase.id}`}>
                      <Icon.Check width={12} height={12} />
                      {t("delivered", {
                        date: phase.delivery.deliveredOn ? formatIsoDate(phase.delivery.deliveredOn, locale) : "",
                      })}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid={`deliver-${phase.id}`}
                      disabled={anyBusy}
                      onClick={() => onDeliver(phase.id)}
                    >
                      {delivering ? <Spinner /> : <Icon.Check width={14} height={14} />}
                      {t("deliver")}
                    </Button>
                  )}
                </div>
              </div>

              <ul className="divide-y divide-border">
                {lines.map((line) => {
                  const removing = busy?.kind === "edit" && busy.key === `remove-${line.id}`;
                  return (
                    <li
                      key={line.id}
                      data-testid={`editor-line-${line.id}`}
                      className={cx(
                        "flex items-center gap-3 px-4 py-2 text-sm",
                        line.source === "clinic_edit" && "bg-primary/5",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink" title={line.description}>
                          {line.description}
                        </span>
                        {line.teeth.length > 0 && (
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            {line.teeth.map((tooth) => (
                              <ToothChip key={tooth} tooth={tooth} category={line.category} />
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">{formatCents(line.totalCents, locale)}</span>
                      {!locked && (
                        <button
                          type="button"
                          data-testid={`remove-${line.id}`}
                          aria-label={t("removeLine", { line: line.description })}
                          title={t("removeLine", { line: line.description })}
                          disabled={anyBusy}
                          onClick={() => onEdit({ kind: "REMOVE_LINE", lineId: line.id }, `remove-${line.id}`)}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-status-overdue/10 hover:text-status-overdue disabled:opacity-40"
                        >
                          {removing ? <Spinner /> : <Icon.Trash width={14} height={14} />}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="px-4 py-2.5">
                {locked ? (
                  <span className="text-xs text-muted">{t("phaseLocked")}</span>
                ) : openForm === phase.id ? (
                  <AddLineForm
                    phase={phase}
                    locale={locale}
                    t={t}
                    busy={busy?.kind === "edit" && busy.key === `add-${phase.id}`}
                    disabled={anyBusy}
                    onCancel={() => setOpenForm(null)}
                    onSubmit={(edit) => {
                      onEdit(edit, `add-${phase.id}`);
                      setOpenForm(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    data-testid={`add-line-${phase.id}`}
                    disabled={anyBusy}
                    onClick={() => setOpenForm(phase.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline disabled:opacity-50"
                  >
                    <Icon.Plus width={14} height={14} />
                    {t("addLine")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AddLineForm({
  phase,
  locale,
  t,
  busy,
  disabled,
  onSubmit,
  onCancel,
}: {
  phase: Phase;
  locale: Locale;
  t: ClinicT;
  busy: boolean;
  disabled: boolean;
  onSubmit: (edit: PlanEdit) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [description, setDescription] = useState("");
  const [code, setCode] = useState<ProcedureCode>("OTHER");
  const [teeth, setTeeth] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const teethList = teeth
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map(Number);
    const qtyN = Number(qty);
    const unitPriceCents = parseEuroInput(price);
    const ok =
      description.trim().length > 0 &&
      teethList.every(isValidFdi) &&
      Number.isInteger(qtyN) &&
      qtyN >= 1 &&
      unitPriceCents !== null &&
      unitPriceCents > 0;
    if (!ok || unitPriceCents === null) return setInvalid(true);
    setInvalid(false);
    onSubmit({
      kind: "ADD_LINE",
      phaseId: phase.id,
      line: { description: description.trim(), code, teeth: [...new Set(teethList)], qty: qtyN, unitPriceCents },
    });
  };

  const field = "h-9 w-full rounded-[var(--ppp-radius-sm)] border border-border bg-surface px-2.5 text-sm text-ink";
  const label = "flex flex-col gap-1 text-xs font-medium text-muted";
  return (
    <form data-testid={`add-line-form-${phase.id}`} onSubmit={submit} className="flex flex-col gap-3 py-1" noValidate>
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
        <label className={label} htmlFor={`${id}-desc`}>
          {t("lineDescription")}
          <input id={`${id}-desc`} className={field} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className={label} htmlFor={`${id}-code`}>
          {t("lineCode")}
          <select
            id={`${id}-code`}
            className={field}
            value={code}
            onChange={(e) => setCode(e.target.value as ProcedureCode)}
          >
            {ProcedureCodeSchema.options.map((c) => (
              <option key={c} value={c}>
                {PROCEDURE_LABEL[c][locale]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className={label} htmlFor={`${id}-teeth`}>
          {t("lineTeeth")}
          <input
            id={`${id}-teeth`}
            className={field}
            inputMode="numeric"
            placeholder={t("lineTeethHint")}
            value={teeth}
            onChange={(e) => setTeeth(e.target.value)}
          />
        </label>
        <label className={label} htmlFor={`${id}-qty`}>
          {t("lineQty")}
          <input
            id={`${id}-qty`}
            className={field}
            type="number"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>
        <label className={label} htmlFor={`${id}-price`}>
          {t("lineUnitPrice")}
          <input
            id={`${id}-price`}
            className={field}
            inputMode="decimal"
            placeholder="0,00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
      </div>
      {invalid && (
        <p role="alert" className="text-xs text-status-overdue">
          {t("lineInvalid")}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" type="submit" disabled={disabled} data-testid={`add-line-submit-${phase.id}`}>
          {busy ? <Spinner /> : <Icon.Plus width={14} height={14} />}
          {t("lineSave")}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          {t("lineCancel")}
        </Button>
      </div>
    </form>
  );
}
