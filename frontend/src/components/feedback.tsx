"use client";

import { useRef, useState, type FormEvent } from "react";
import { getCopy, type Locale } from "@/lib/copy";
import { useFocusMode } from "@/lib/focus-mode";
import { FocusDone } from "@/components/focus-done";

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
  const panel = useRef<HTMLElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useFocusMode(panel, panel);
  const options = [
    ["unknown", t.unknownReview],
    ["yes", t.matched],
    ["no", t.notMatched],
    ["not_applicable", t.notApplicable],
  ];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
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
      setStatus(
        result === 202
          ? t.reviewPending
          : result === 422
            ? t.invalidFeedback
            : t.submitError,
      );
      if (result === 202) {
        form.reset();
        receipt.renew();
      }
    } catch {
      setStatus(t.submitError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="feedback-panel"
      aria-labelledby="review-form-heading"
      ref={panel}
    >
      <h2 id="review-form-heading">{t.reviewSubmit}</h2>
      <p data-focus-hide>{t.reviewHint}</p>
      <form onSubmit={submit}>
        <label data-field data-morph>
          {t.roleReview}
          <input
            name="role"
            placeholder={exampleRole}
            maxLength={80}
            required
          />
        </label>
        <label data-field data-morph>
          {t.payClarity}
          <select name="pay_clarity" defaultValue="unknown">
            <option value="unknown">{t.unknownReview}</option>
            <option value="clear">{t.payClear}</option>
            <option value="unclear">{t.payUnclear}</option>
          </select>
        </label>
        {(
          [
            ["pay_match", t.payReview],
            ["hours_match", t.hoursReview],
            ["housing_match", t.housingReview],
            ["transport_match", t.transportReview],
          ] as const
        ).map(([name, label]) => (
          <label key={name} data-field data-morph>
            {label}
            <select name={name} defaultValue="unknown">
              {options.map(([value, title]) => (
                <option key={value} value={value}>
                  {title}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label data-field data-morph>
          {t.reviewMessage}
          <textarea name="text" maxLength={500} rows={3} />
        </label>
        <label className="feedback-consent" data-focus-hide data-morph>
          <input name="consent" type="checkbox" required />
          {t.reviewConsent}
        </label>
        <button type="submit" disabled={busy} data-focus-hide data-morph>
          {t.sendReview}
        </button>
        <FocusDone label={t.done} />
        <p role="status">{status}</p>
      </form>
    </section>
  );
}

export function ReportForm({
  itemType,
  itemId,
  locale,
}: {
  itemType: ItemType;
  itemId: string;
  locale: Locale;
}) {
  const t = getCopy(locale);
  const receipt = useReceipt();
  const panel = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useFocusMode(panel, panel);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      const result = await send("reports", {
        request_id: receipt.current(),
        item_type: itemType,
        item_id: itemId,
        reason: data.get("reason"),
        explanation: data.get("explanation") || null,
      });
      setStatus(
        result === 202
          ? t.reportReceived
          : result === 422
            ? t.invalidFeedback
            : t.submitError,
      );
      if (result === 202) {
        form.reset();
        receipt.renew();
      }
    } catch {
      setStatus(t.submitError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="report-form">
      <summary>{t.report}</summary>
      <form onSubmit={submit} ref={panel}>
        <label data-field data-morph>
          {t.reportReason}
          <select name="reason">
            <option value="personal_data">{t.reportPersonal}</option>
            <option value="inaccurate">{t.reportInaccurate}</option>
            <option value="harmful">{t.reportHarmful}</option>
            <option value="other">{t.reportOther}</option>
          </select>
        </label>
        <label data-field data-morph>
          {t.reportExplanation}
          <textarea name="explanation" maxLength={300} rows={2} />
        </label>
        <p data-focus-hide>{t.reviewHint}</p>
        <button type="submit" disabled={busy} data-focus-hide data-morph>
          {t.sendReport}
        </button>
        <FocusDone label={t.done} />
        <p role="status">{status}</p>
      </form>
    </details>
  );
}
