"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { fill, getCopy, type Copy, type Locale } from "@/lib/copy";
import { morph } from "@/lib/motion";
import { FocusDone } from "@/components/focus-done";
import { Sheet, useSheet, type SheetControl } from "@/components/sheet";

type ItemType = "listing" | "review";

function useReceipt() {
  const [requestId, setRequestId] = useState<string | null>(null);
  function current() {
    if (requestId) return requestId;
    const id = crypto.randomUUID();
    setRequestId(id);
    return id;
  }
  return { current, renew: () => setRequestId(null) };
}

async function send(kind: "reviews" | "reports", payload: object) {
  const response = await fetch(`/api/feedback/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.status;
}

function useSteps(
  sheet: SheetControl,
  form: React.RefObject<HTMLFormElement | null>,
) {
  const [step, setStep] = useState(0);
  const [sent, setSent] = useState(false);

  function change(update: () => void) {
    morph(sheet.ref.current, () => flushSync(update));
    sheet.ref.current
      ?.querySelector<HTMLElement>(
        ".step:not([hidden]) .step-title, .sent-panel h3",
      )
      ?.focus();
  }

  function valid() {
    const current = form.current?.querySelector<HTMLFieldSetElement>(
      ".step:not([hidden])",
    );
    const fields = Array.from(current?.elements ?? []) as HTMLInputElement[];
    return fields.every((field) => field.reportValidity());
  }

  function next() {
    if (valid()) change(() => setStep((value) => value + 1));
  }

  function back(): boolean {
    if (sent || step === 0) return false;
    change(() => setStep((value) => value - 1));
    return true;
  }

  function reset() {
    form.current?.reset();
    setStep(0);
    setSent(false);
  }

  return {
    step,
    sent,
    valid,
    next,
    back,
    reset,
    finish: () => change(() => setSent(true)),
  };
}

function StepHead({
  t,
  step,
  total,
}: {
  t: Copy;
  step: number;
  total: number;
}) {
  return (
    <div className="steps-head" data-focus-hide data-morph>
      <span>{fill(t.stepOf, { n: step + 1, total })}</span>
      <div className="step-bar" aria-hidden="true">
        <span style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>
    </div>
  );
}

function Step({
  index,
  step,
  title,
  children,
}: {
  index: number;
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="step" hidden={index !== step} data-morph>
      <legend className="sr-only">{title}</legend>
      <h3 className="step-title" tabIndex={-1} data-focus-hide>
        {title}
      </h3>
      {children}
    </fieldset>
  );
}

function Chips({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: [string, string][];
}) {
  return (
    <fieldset className="chip-group" data-focus-hide>
      <legend>{label}</legend>
      <div className="chips">
        {options.map(([value, title]) => (
          <label className="chip" key={value}>
            <input
              type="radio"
              name={name}
              value={value}
              defaultChecked={value === "unknown"}
            />
            <span>{title}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SentPanel({
  message,
  label,
  done,
}: {
  message: string;
  label: string;
  done: () => void;
}) {
  return (
    <div className="sent-panel" data-morph>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.7 2.7L16.5 9.5" />
      </svg>
      <h3 tabIndex={-1} role="status">
        {message}
      </h3>
      <button type="button" className="primary-button" onClick={done}>
        {label}
      </button>
    </div>
  );
}

export function ReviewForm({
  listingId,
  seasonYear,
  exampleRole,
  locale,
}: {
  listingId: string;
  seasonYear: number;
  exampleRole: string;
  locale: Locale;
}) {
  const t = getCopy(locale);
  const receipt = useReceipt();
  const sheet = useSheet();
  const form = useRef<HTMLFormElement>(null);
  const steps = useSteps(sheet, form);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [textLength, setTextLength] = useState(0);
  const titleId = `review-sheet-${listingId}`;
  const matches: [string, string][] = [
    ["yes", t.matched],
    ["no", t.notMatched],
    ["unknown", t.unknownReview],
    ["not_applicable", t.notApplicable],
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (steps.step < 2) {
      steps.next();
      return;
    }
    if (!steps.valid()) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await send("reviews", {
        request_id: receipt.current(),
        listing_id: listingId,
        season_year: seasonYear,
        role: data.get("role"),
        pay_match: data.get("pay_match"),
        pay_clarity: data.get("pay_clarity"),
        hours_match: data.get("hours_match"),
        housing_match: data.get("housing_match"),
        transport_match: data.get("transport_match"),
        text: data.get("text") || null,
        self_report_consent: data.get("consent") === "on",
      });
      if (result === 202) {
        receipt.renew();
        setStatus("");
        steps.finish();
      } else setStatus(result === 422 ? t.invalidFeedback : t.submitError);
    } catch {
      setStatus(t.submitError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="primary-button sheet-trigger"
        onClick={sheet.open}
      >
        {t.reviewSubmit}
      </button>
      <Sheet
        sheet={sheet}
        title={t.reviewSubmit}
        titleId={titleId}
        className="feedback-sheet"
        onEscape={steps.back}
        onClosed={() => {
          steps.reset();
          setStatus("");
          setTextLength(0);
        }}
      >
        {steps.sent ? (
          <SentPanel
            message={t.reviewPending}
            label={t.done}
            done={sheet.close}
          />
        ) : (
          <StepHead t={t} step={steps.step} total={3} />
        )}
        <form ref={form} onSubmit={submit} hidden={steps.sent} noValidate>
          <Step index={0} step={steps.step} title={t.stepRole}>
            <label className="step-field" data-field data-morph>
              {t.roleReview}
              <input
                name="role"
                placeholder={exampleRole}
                maxLength={80}
                required
              />
            </label>
            <Chips
              name="pay_clarity"
              label={t.payClarity}
              options={[
                ["clear", t.payClear],
                ["unclear", t.payUnclear],
                ["unknown", t.unknownReview],
              ]}
            />
          </Step>
          <Step index={1} step={steps.step} title={t.stepMatch}>
            {(
              [
                ["pay_match", t.payReview],
                ["hours_match", t.hoursReview],
                ["housing_match", t.housingReview],
                ["transport_match", t.transportReview],
              ] as const
            ).map(([name, label]) => (
              <Chips key={name} name={name} label={label} options={matches} />
            ))}
          </Step>
          <Step index={2} step={steps.step} title={t.stepStory}>
            <label className="step-field" data-field data-morph>
              {t.reviewMessage}
              <textarea
                name="text"
                maxLength={500}
                rows={4}
                onChange={(event) => setTextLength(event.target.value.length)}
              />
              <span className="character-counter" aria-live="polite">
                {textLength} / 500
              </span>
            </label>
            <p className="step-hint" data-focus-hide>
              {t.reviewHint}
            </p>
            <label className="feedback-consent" data-focus-hide>
              <input name="consent" type="checkbox" required />
              {t.reviewConsent}
            </label>
            <p className="step-status" role="status">
              {status}
            </p>
          </Step>
          <StepActions
            t={t}
            step={steps.step}
            last={2}
            busy={busy}
            submitLabel={t.sendReview}
            back={steps.back}
          />
          <FocusDone label={t.done} className="filter-actions" />
        </form>
      </Sheet>
    </>
  );
}

function StepActions({
  t,
  step,
  last,
  busy,
  submitLabel,
  back,
}: {
  t: Copy;
  step: number;
  last: number;
  busy: boolean;
  submitLabel: string;
  back: () => boolean;
}) {
  return (
    <div className="filter-actions" data-focus-hide data-morph>
      {step > 0 ? (
        <button type="button" className="secondary-button" onClick={back}>
          {t.stepBack}
        </button>
      ) : (
        <span />
      )}
      <button type="submit" disabled={busy}>
        {step === last ? submitLabel : t.nextStep}
      </button>
    </div>
  );
}

function OptionList({
  name,
  options,
  onChange,
}: {
  name: string;
  options: [string, string][];
  onChange?: (value: string) => void;
}) {
  return (
    <div className="option-list">
      {options.map(([value, label], index) => (
        <label key={value}>
          <input
            type="radio"
            name={name}
            value={value}
            defaultChecked={index === 0}
            onChange={(event) => onChange?.(event.target.value)}
          />
          <span>{label}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </label>
      ))}
    </div>
  );
}

export function ReportForm({
  itemType,
  itemId,
  locale,
  reviews = [],
}: {
  itemType: ItemType;
  itemId: string;
  locale: Locale;
  reviews?: { id: string; label: string }[];
}) {
  const t = getCopy(locale);
  const receipt = useReceipt();
  const sheet = useSheet();
  const form = useRef<HTMLFormElement>(null);
  const steps = useSteps(sheet, form);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [explanationLength, setExplanationLength] = useState(0);
  const titleId = `report-sheet-${itemId}`;
  const offset = reviews.length ? 1 : 0;
  const subjects: [string, string][] = [
    [`${itemType}:${itemId}`, t.reportListing],
    ...reviews.map((review): [string, string] => [
      `review:${review.id}`,
      review.label,
    ]),
  ];
  const [subject, setSubject] = useState(`${itemType}:${itemId}`);
  const reasons: [string, string][] = subject.startsWith("review:")
    ? [
        ["personal_data", t.reviewReasonPersonal],
        ["inaccurate", t.reviewReasonFalse],
        ["harmful", t.reviewReasonHarmful],
        ["off_topic", t.reviewReasonOffTopic],
        ["other", t.reportOther],
      ]
    : [
        ["closed", t.listingReasonClosed],
        ["inaccurate", t.listingReasonInaccurate],
        ["suspicious", t.listingReasonSuspicious],
        ["personal_data", t.listingReasonPersonal],
        ["other", t.reportOther],
      ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (steps.step < 1 + offset) {
      steps.next();
      return;
    }
    if (!steps.valid()) return;
    const data = new FormData(event.currentTarget);
    const [subjectType, subjectId] = String(
      data.get("subject") ?? `${itemType}:${itemId}`,
    ).split(":");
    setBusy(true);
    try {
      const result = await send("reports", {
        request_id: receipt.current(),
        item_type: subjectType,
        item_id: subjectId,
        reason: data.get("reason"),
        explanation: data.get("explanation") || null,
      });
      if (result === 202) {
        receipt.renew();
        setStatus("");
        steps.finish();
      } else setStatus(result === 422 ? t.invalidFeedback : t.submitError);
    } catch {
      setStatus(t.submitError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="report-trigger" onClick={sheet.open}>
        {t.report}
      </button>
      <Sheet
        sheet={sheet}
        title={t.report}
        titleId={titleId}
        className="feedback-sheet"
        onEscape={steps.back}
        onClosed={() => {
          steps.reset();
          setStatus("");
          setSubject(`${itemType}:${itemId}`);
          setExplanationLength(0);
        }}
      >
        {steps.sent ? (
          <SentPanel
            message={t.reportReceived}
            label={t.done}
            done={sheet.close}
          />
        ) : (
          <StepHead t={t} step={steps.step} total={2 + offset} />
        )}
        <form ref={form} onSubmit={submit} hidden={steps.sent} noValidate>
          {offset > 0 && (
            <Step index={0} step={steps.step} title={t.reportSubject}>
              <OptionList
                name="subject"
                options={subjects}
                onChange={setSubject}
              />
            </Step>
          )}
          <Step index={offset} step={steps.step} title={t.reportReason}>
            <OptionList
              key={subject.split(":")[0]}
              name="reason"
              options={reasons}
            />
          </Step>
          <Step
            index={1 + offset}
            step={steps.step}
            title={t.reportExplanation}
          >
            <label className="step-field" data-field data-morph>
              <span className="sr-only">{t.reportExplanation}</span>
              <textarea
                name="explanation"
                maxLength={300}
                rows={4}
                onChange={(event) =>
                  setExplanationLength(event.target.value.length)
                }
              />
              <span className="character-counter" aria-live="polite">
                {explanationLength} / 300
              </span>
            </label>
            <p className="step-hint" data-focus-hide>
              {t.reviewHint}
            </p>
            <p className="step-status" role="status">
              {status}
            </p>
          </Step>
          <StepActions
            t={t}
            step={steps.step}
            last={1 + offset}
            busy={busy}
            submitLabel={t.sendReport}
            back={steps.back}
          />
          <FocusDone label={t.done} className="filter-actions" />
        </form>
      </Sheet>
    </>
  );
}
