import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createCampaign, fetchCampaign, updateCampaign } from "../api/campaigns";
import { ApiError } from "../api/http";
import { emptyValues, errorsFromServer, STATUSES, validateValues, valuesFromCampaign, type Field, type FieldErrors, type FormValues } from "../campaigns/form";
import { formatCentsWhole } from "../lib/format";
import type { CampaignDetail } from "../types";
import { Skeleton, buttonClass } from "./states";

export type DrawerTarget = { kind: "create" } | { kind: "edit"; campaignId: string };

type Props = {
  target: DrawerTarget;
  onClose: () => void;
  onSaved: () => void;
};

const inputClass =
  "w-full rounded border border-border bg-background px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-[invalid=true]:border-negative";

export function CampaignDrawer({ target, onClose, onSaved }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<FormValues>(() => emptyValues(new Date().toISOString().slice(0, 10)));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(target.kind === "edit");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Remember the element that opened the drawer, so focus returns to it on close.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => openerRef.current?.focus();
  }, []);

  // Focus the first field once it exists (edit mode renders it only after loading).
  useEffect(() => {
    if (!loading) firstFieldRef.current?.focus();
  }, [loading]);

  // Edit mode loads the campaign once. The request is aborted if the drawer closes first.
  useEffect(() => {
    if (target.kind !== "edit") return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    fetchCampaign(target.campaignId, controller.signal)
      .then((campaign) => {
        setDetail(campaign);
        setValues(valuesFromCampaign(campaign));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : "Could not load this campaign.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [target]);

  const title = target.kind === "create" ? "New campaign" : "Edit campaign";

  const update = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || loading) return;

    const checked = validateValues(values);
    setErrors(checked.errors);
    if (!checked.body) return;

    setSubmitting(true);
    try {
      if (target.kind === "create") {
        await createCampaign(checked.body);
      } else {
        await updateCampaign(target.campaignId, checked.body);
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(errorsFromServer(err));
      } else {
        setErrors({ form: "Could not save. Check your connection and try again." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-text">
            {title}
          </h2>
          <button type="button" onClick={onClose} className={buttonClass} aria-label="Close">
            Close
          </button>
        </header>

        {loadError && (
          <div role="alert" className="m-5 rounded border border-negative/60 p-3 text-sm text-text">
            Couldn't load this campaign. {loadError}
          </div>
        )}

        {loading && !loadError && (
          <div className="flex flex-col gap-4 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {!loading && !loadError && (
          <form noValidate onSubmit={submit} className="flex flex-col gap-4 p-5">
            {errors.form && (
              <div role="alert" className="rounded border border-negative/60 p-3 text-sm text-text">
                {errors.form}
              </div>
            )}

            <TextField
              label="Name"
              field="name"
              values={values}
              errors={errors}
              onChange={update}
              inputRef={firstFieldRef}
              hint="1 to 200 characters"
            />

            <SelectField label="Status" field="status" values={values} onChange={update} />

            <TextField
              label="Budget (dollars)"
              field="budget"
              values={values}
              errors={errors}
              onChange={update}
              inputMode="decimal"
              placeholder="1250.00"
            />

            <TextField
              label="Cost per impression (micros)"
              field="costPerImpressionMicros"
              values={values}
              errors={errors}
              onChange={update}
              inputMode="numeric"
              hint="1,500 micros = 0.15 cents"
            />

            <TextField
              label="Cost per click (cents)"
              field="costPerClickCents"
              values={values}
              errors={errors}
              onChange={update}
              inputMode="numeric"
            />

            <TextAreaField
              label="Targeting (JSON object)"
              field="targetingJson"
              values={values}
              errors={errors}
              onChange={update}
            />

            <TextField
              label="Creative URL"
              field="creativeUrl"
              values={values}
              errors={errors}
              onChange={update}
              placeholder="https://example.com/creative.png"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Start date" field="startDate" values={values} errors={errors} onChange={update} type="date" />
              <TextField label="End date" field="endDate" values={values} errors={errors} onChange={update} type="date" />
            </div>

            {detail && (
              <p className="text-xs text-muted">
                Spent so far: {formatCentsWhole(detail.spentCents)} (lifetime, read only)
                {detail.budgetCents > 0 ? ` of ${formatCentsWhole(detail.budgetCents)}` : ""}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button type="button" onClick={onClose} className={buttonClass}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded border border-accent bg-accent px-4 py-1 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  field: Field;
  values: FormValues;
  errors?: FieldErrors;
  onChange: (field: Field, value: string) => void;
  type?: string;
  inputMode?: "decimal" | "numeric";
  placeholder?: string;
  hint?: string;
  inputRef?: RefObject<HTMLInputElement>;
};

function TextField({ label, field, values, errors = {}, onChange, type = "text", inputMode, placeholder, hint, inputRef }: FieldProps) {
  const id = useId();
  const message = errors[field];
  return (
    <FieldShell id={id} label={label} hint={hint} message={message}>
      <input
        id={id}
        ref={inputRef}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={values[field]}
        onChange={(event) => onChange(field, event.target.value)}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy(id, hint, message)}
        className={inputClass}
      />
    </FieldShell>
  );
}

function TextAreaField({ label, field, values, errors = {}, onChange }: FieldProps) {
  const id = useId();
  const message = errors[field];
  return (
    <FieldShell id={id} label={label} message={message}>
      <textarea
        id={id}
        rows={5}
        value={values[field]}
        onChange={(event) => onChange(field, event.target.value)}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy(id, undefined, message)}
        className={`${inputClass} font-mono`}
        spellCheck={false}
      />
    </FieldShell>
  );
}

function SelectField({ label, field, values, onChange }: Omit<FieldProps, "errors">) {
  const id = useId();
  return (
    <FieldShell id={id} label={label}>
      <select
        id={id}
        value={values[field]}
        onChange={(event) => onChange(field, event.target.value)}
        className={inputClass}
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function FieldShell({
  id,
  label,
  hint,
  message,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  message?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </label>
      {children}
      {hint && !message && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {message && (
        <p id={`${id}-error`} className="text-xs text-text">
          <span className="font-medium">Error: </span>
          {message}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: string, message?: string): string | undefined {
  if (message) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
