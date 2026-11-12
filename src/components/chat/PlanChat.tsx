"use client";
/**
 * OWNED BY WP-11. Patient chat panel: POST /api/chat, suggested questions, citation chips
 * "Aprobado por Dra. … · Fase n", the "Enviar mensaje a mi clínica" referral and the "Ver en el calendario"
 * ghost toggle (calls onGhostPreview(shifts) / onGhostPreview(null); WP-06 draws the Gantt ghost).
 * Renders inside the patient page's chat aside (which owns the header and the close button).
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChatResponseSchema, type ChatMessage as ApiMessage, type ChatResponse, type Locale, type PhaseShift } from "@/contracts";
import { useT } from "@/i18n";
import { Button, cx } from "@/lib/ui";
import { useToast } from "@/lib/ui/Toast";
import { AssistantTurn, UserBubble } from "./ChatMessage";
import { SendIcon } from "./icons";

export interface PlanChatProps {
  planId: string;
  locale: Locale;
  /** "Ver en el calendario" toggle: the parent (WP-06) draws these shifts as Gantt ghostShifts; null clears. */
  onGhostPreview?: (shifts: PhaseShift[] | null) => void;
}

type Item =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; response: ChatResponse }
  | { id: number; role: "error"; kind: "rate" | "generic"; question: string };

const MAX_HISTORY = 20;

export function PlanChat({ planId, locale, onGhostPreview }: PlanChatProps) {
  const t = useT("chat");
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [ghostId, setGhostId] = useState<number | null>(null);
  const [referralSent, setReferralSent] = useState<Set<number>>(new Set());
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  // A new answer scrolls to its first line (so reading starts at the top); the patient's own message and
  // the thinking dots scroll to the bottom, above the pinned composer.
  useEffect(() => {
    const last = items[items.length - 1];
    if (endRef.current) endRef.current.style.scrollMarginBottom = `${(formRef.current?.offsetHeight ?? 0) + 8}px`;
    if (last?.role === "assistant" && !busy) {
      document.querySelector(`[data-item-id="${last.id}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    } else {
      endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
    }
  }, [items, busy]);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || busy) return;
      const history: ApiMessage[] = [
        ...itemsRef.current.flatMap((i): ApiMessage[] =>
          i.role === "user" ? [{ role: "user", text: i.text }] : i.role === "assistant" ? [{ role: "assistant", text: i.response.text.slice(0, 2000) }] : [],
        ),
        { role: "user" as const, text: question.slice(0, 2000) },
      ].slice(-MAX_HISTORY);
      const userId = nextId.current++;
      setItems((cur) => [...cur.filter((i) => i.role !== "error"), { id: userId, role: "user", text: question }]);
      setDraft("");
      setBusy(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ planId, locale, messages: history }),
        });
        if (!res.ok) {
          setItems((cur) => [...cur, { id: nextId.current++, role: "error", kind: res.status === 429 ? "rate" : "generic", question }]);
          return;
        }
        const parsed = ChatResponseSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error("bad response");
        const id = nextId.current++;
        setItems((cur) => [...cur, { id, role: "assistant", response: parsed.data }]);
        // The server also publishes CHAT_PREVIEW over SSE; calling it here keeps the toggle in step without it.
        if (parsed.data.whatIf) {
          setGhostId(id);
          onGhostPreview?.(parsed.data.whatIf.shifts);
        }
      } catch {
        setItems((cur) => [...cur, { id: nextId.current++, role: "error", kind: "generic", question }]);
      } finally {
        setBusy(false);
        inputRef.current?.focus({ preventScroll: true });
      }
    },
    [busy, locale, onGhostPreview, planId],
  );

  const toggleGhost = useCallback(
    (id: number, shifts: PhaseShift[]) => {
      if (ghostId === id) {
        setGhostId(null);
        onGhostPreview?.(null);
      } else {
        setGhostId(id);
        onGhostPreview?.(shifts);
      }
    },
    [ghostId, onGhostPreview],
  );

  const sendReferral = useCallback(
    (id: number) => {
      setReferralSent((cur) => new Set(cur).add(id));
      toast(t("referralToast"), "success");
    },
    [t, toast],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void ask(draft);
    }
  };

  const empty = items.length === 0 && !busy;

  return (
    <div data-testid="plan-chat" className="flex min-h-full flex-col">
      <div className="flex-1">
        {empty ? (
          <Welcome locale={locale} onPick={(q) => void ask(q)} disabled={busy} />
        ) : (
          <ol aria-live="polite" aria-label={t("title")} className="flex flex-col gap-4 pb-4">
            {items.map((item) =>
              item.role === "user" ? (
                <UserBubble key={item.id} text={item.text} />
              ) : item.role === "assistant" ? (
                <AssistantTurn
                  key={item.id}
                  itemId={item.id}
                  response={item.response}
                  locale={locale}
                  ghostActive={ghostId === item.id}
                  onToggleGhost={(shifts) => toggleGhost(item.id, shifts)}
                  referralSent={referralSent.has(item.id)}
                  onReferral={() => sendReferral(item.id)}
                />
              ) : (
                <ErrorTurn
                  key={item.id}
                  kind={item.kind}
                  onRetry={() => void ask(item.question)}
                  onReferral={() => sendReferral(item.id)}
                  referralSent={referralSent.has(item.id)}
                />
              ),
            )}
            {busy && <Thinking />}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer: pinned to the bottom of the scrolling panel. */}
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="sticky -bottom-4 -mx-4 -mb-4 mt-2 border-t border-border bg-surface/95 px-4 pb-4 pt-3 backdrop-blur"
      >
        {!empty && items.length > 0 && !busy && items[items.length - 1]?.role !== "user" && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            <SuggestionChip label={t("suggestedDelay")} onClick={() => void ask(t("suggestedDelay"))} compact />
            <SuggestionChip label={t("suggestedMedication")} onClick={() => void ask(t("suggestedMedication"))} compact />
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-1.5 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <label htmlFor="plan-chat-input" className="sr-only">
            {t("inputLabel")}
          </label>
          <textarea
            id="plan-chat-input"
            ref={inputRef}
            data-testid="chat-input"
            rows={1}
            value={draft}
            maxLength={2000}
            disabled={busy}
            placeholder={t("placeholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted disabled:opacity-60"
          />
          <Button
            type="submit"
            size="sm"
            disabled={busy || draft.trim() === ""}
            aria-label={t("send")}
            data-testid="chat-send"
            className="h-9 w-9 shrink-0 !px-0"
          >
            <SendIcon />
          </Button>
        </div>
      </form>
    </div>
  );
}

function Welcome({ locale, onPick, disabled }: { locale: Locale; onPick: (q: string) => void; disabled: boolean }) {
  void locale;
  const t = useT("chat");
  return (
    <div data-testid="chat-empty" className="flex flex-col gap-5 pt-2">
      <div>
        <h3 className="text-base font-semibold tracking-tight text-ink">{t("emptyTitle")}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t("emptyBody")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("suggestedLabel")}</p>
        <SuggestionChip label={t("suggestedDelay")} onClick={() => onPick(t("suggestedDelay"))} disabled={disabled} />
        <SuggestionChip label={t("suggestedMedication")} onClick={() => onPick(t("suggestedMedication"))} disabled={disabled} />
      </div>
    </div>
  );
}

function SuggestionChip({
  label,
  onClick,
  disabled,
  compact,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid="chat-suggestion"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "rounded-xl border border-border bg-surface text-left text-ink transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50",
        compact ? "rounded-full px-3 py-1 text-xs text-muted hover:text-ink" : "px-3.5 py-2.5 text-sm font-medium",
      )}
    >
      {label}
    </button>
  );
}

function Thinking() {
  const t = useT("chat");
  return (
    <li data-testid="chat-thinking" role="status" className="flex items-center gap-2.5 text-xs font-medium text-muted">
      <span aria-hidden className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
      {t("thinking")}
    </li>
  );
}

function ErrorTurn({
  kind,
  onRetry,
  onReferral,
  referralSent,
}: {
  kind: "rate" | "generic";
  onRetry: () => void;
  onReferral: () => void;
  referralSent: boolean;
}) {
  const t = useT("chat");
  return (
    <li data-testid="chat-error" role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-status-overdue/30 bg-status-overdue/5 p-3">
      <p className="text-sm text-ink">{kind === "rate" ? t("errorRateLimited") : t("errorGeneric")}</p>
      <div className="flex flex-wrap gap-2">
        {kind === "generic" && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            {t("errorRetry")}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onReferral} disabled={referralSent} data-testid="chat-referral">
          {referralSent ? t("referralSent") : t("referralButton")}
        </Button>
      </div>
    </li>
  );
}
