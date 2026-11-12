"use client";
/**
 * PDF dropzone: drag and drop or file picker (PDF only, ≤10 MB) plus
 * "Probar con un ejemplo" sample buttons (SAMPLE_PDFS → POST /api/extract {sampleId}).
 */
import { useRef, useState, type DragEvent } from "react";
import type { Locale } from "@/contracts";
import type { SamplePdf } from "@data/seed";
import { cx } from "@/lib/ui";
import { Icon, MAX_PDF_BYTES, type ClinicT } from "./shared";

export type DropzoneRequest = { kind: "file"; file: File } | { kind: "sample"; sample: SamplePdf };

export interface QuoteDropzoneProps {
  samples: SamplePdf[];
  locale: Locale;
  t: ClinicT;
  busy: boolean;
  /** File name or sample label being read (shown in the loading state). */
  busyLabel?: string | null;
  /** Compact variant once a plan is on screen. */
  compact?: boolean;
  error?: string | null;
  onRequest: (req: DropzoneRequest) => void;
}

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function QuoteDropzone({ samples, locale, t, busy, busyLabel, compact, error, onRequest }: QuoteDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const accept = (file: File | undefined | null) => {
    if (!file) return;
    if (!isPdf(file)) return setLocalError(t("dropOnlyPdf"));
    if (file.size > MAX_PDF_BYTES) return setLocalError(t("dropTooBig"));
    setLocalError(null);
    onRequest({ kind: "file", file });
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    accept(e.dataTransfer?.files?.[0]);
  };

  const shownError = localError ?? error ?? null;

  if (busy) {
    return (
      <div
        data-testid="extract-loading"
        role="status"
        aria-live="polite"
        className="relative overflow-hidden rounded-[var(--ppp-radius)] border border-border bg-surface p-6"
      >
        <div className="flex items-center gap-4">
          <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary-strong">
            <Icon.File width={22} height={22} />
            <span className="absolute inset-0 animate-ping rounded-xl bg-primary/10 [animation-duration:2.2s]" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">{t("extracting")}</p>
            <p className="truncate text-sm text-muted">
              {busyLabel ? `${busyLabel} · ` : ""}
              {t("extractingHint")}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2" aria-hidden>
          {[92, 78, 85, 64].map((w, i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded-full bg-surface-2"
              style={{ width: `${w}%`, animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="quote-dropzone"
        data-dragging={dragging || undefined}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={onDrop}
        className={cx(
          "group relative flex flex-col items-center justify-center gap-3 rounded-[var(--ppp-radius)] border-2 border-dashed text-center transition-colors",
          compact ? "px-5 py-5 md:flex-row md:justify-between md:text-left" : "px-6 py-10",
          dragging ? "border-primary bg-primary/5" : "border-border bg-surface hover:border-primary/50",
        )}
      >
        <div className={cx("flex items-center gap-4", !compact && "flex-col")}>
          <span
            className={cx(
              "inline-flex items-center justify-center rounded-2xl bg-primary/10 text-primary-strong transition-transform",
              compact ? "h-10 w-10" : "h-14 w-14",
              dragging && "scale-110",
            )}
          >
            <Icon.Upload width={compact ? 18 : 24} height={compact ? 18 : 24} />
          </span>
          <div>
            <p className="font-medium text-ink">
              {dragging ? t("dropActive") : compact ? t("dropTitleCompact") : t("dropTitle")}
            </p>
            <p className="text-sm text-muted">{t("dropHint")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-10 items-center gap-2 rounded-[var(--ppp-radius-sm)] border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        >
          <Icon.File />
          {t("dropChoose")}
        </button>
        <input
          ref={inputRef}
          data-testid="quote-file-input"
          type="file"
          accept="application/pdf,.pdf"
          aria-label={t("dropInputLabel")}
          className="sr-only"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {shownError && (
        <p role="alert" data-testid="dropzone-error" className="flex items-center gap-2 text-sm text-status-overdue">
          <Icon.Alert />
          {shownError}
        </p>
      )}

      {samples.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted">{t("samplesTitle")}</span>
          {samples.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center overflow-hidden rounded-full border border-border bg-surface"
            >
              <button
                type="button"
                data-testid={`sample-${s.id}`}
                onClick={() => onRequest({ kind: "sample", sample: s })}
                className="inline-flex h-8 items-center gap-1.5 px-3 text-sm font-medium text-primary-strong transition-colors hover:bg-primary/5"
              >
                <Icon.Spark width={14} height={14} />
                {s.label[locale]}
              </button>
              <a
                href={s.path}
                download
                title={t("sampleDownload")}
                aria-label={`${t("sampleDownload")} · ${s.label[locale]}`}
                className="inline-flex h-8 items-center border-l border-border px-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Icon.Download width={14} height={14} />
              </a>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
