# Product behavior

## Purpose and journey

This is a Kazakhstan-focused directory of Summer Work Travel vacancies. A visitor opens the responsive website in an ordinary browser or as a Telegram Mini App, browses without an account, reads a vacancy and its evidence, then deliberately follows an external link to contact the employer directly. The platform publishes listings and moderated, self-reported experiences. It does not employ, represent, select, or submit a student to an employer; arrange an application; or issue visas, DS-2019 forms, Job Offers, or sponsor decisions.

There is no in-app application, chat, payment, student profile, autonomous outreach, or scraping. The platform does not request or store passports, visa documents, DS-2019 forms, CVs, application files, student phone numbers, payment data, or private employer correspondence. External employer sites have their own processes; show the destination before the visitor leaves this site. Do not attach student identifiers to outbound links.

## Vacancy record and publication

Every vacancy record has fields for season; employer legal name; official employer-controlled source and its URL; location; role and duties; work dates; wage amount, currency, and pay basis; expected hours; housing and cost; transport; direct employer contact URL; last employer confirmation time; and sponsor-route evidence. Fields without support are explicitly `unknown`, never estimated or silently translated. Preserve employer-provided English facts as source text. Record the evidence URL or a non-sensitive operator reference, check time, and operator for each claim or change. A working page or an old posting alone does not confirm that applications remain open.

Publication requires a season, legal name, employer-controlled source, role, location, direct employer contact URL, and a current employer confirmation that the exact vacancy is open. Other fields may remain unknown and appear as such. The public link must lead to the employer's own application or contact channel; the platform does not proxy, submit, or automatically open it.

Server-controlled states are `draft`, `published`, `paused`, `closed`, and `expired`. Only a published vacancy with a current confirmation appears in the current feed. An operator may publish a draft after evidence review, pause a listing under review, or close a withdrawn/filled listing. Paused or expired listings require a new employer confirmation before republishing. A closed season is not silently reused for a new season: create a new vacancy record. State changes, evidence changes, and past versions remain auditable.

**Freshness rule:** confirmation expires 14 × 24 hours after `last_confirmed_at` (UTC). At that instant the server treats the vacancy as `expired` and excludes it from current results, even if a maintenance task has not yet persisted the transition. The current feed also excludes earlier season years and jobs whose known end date has passed in UTC; publication of either is refused. Only a new check that the employer still offers the exact job and season advances `last_confirmed_at`; viewing the page, finding it online, or changing other fields does not. The 14-day interval is an initial editorial policy, not a claim about a job's actual availability.

## Four separate trust facts

Each public label names its evidence and check date. Absence of evidence means `unknown`, not a positive badge.

| Fact | Public meaning and evidence required |
| --- | --- |
| Employer identity | `identity checked` means an operator matched the legal name and employer-controlled site against a cited independent public record. Otherwise `not checked` or `disputed`. It does not confirm this vacancy. |
| Vacancy confirmation | `confirmed on [date]` means the operator found the exact job and season open on a current employer-controlled source or recorded a direct employer confirmation without retaining private correspondence. Otherwise `unconfirmed`. This drives freshness. |
| Sponsor compatibility | `employer reports a sponsor route` identifies an employer claim, its exact source, and season. Otherwise `not reported` or `employer reports no route`. It is not a sponsor decision. |
| Sponsor approval | `confirmed by [designated sponsor]` requires explicit, publicly citable sponsor evidence identifying the exact job and season, with source and date. `pending` requires equally specific sponsor evidence of review; otherwise show `unknown`. A negative decision is `not approved` only with sponsor evidence. The platform never grants approval. |

An employer identity check, vacancy confirmation, or employer statement never upgrades sponsor approval. A sponsor result for one season cannot carry to another. Do not call a listing “J-1 approved” unless the exact-job and season sponsor confirmation rule is met. Do not publish unsupported safety, visa, sponsor, or employment claims.

Conflicting identity evidence makes identity `disputed` and pauses the listing until resolved. Record both sources and the operator decision; do not preserve a positive badge through a dispute.

## Reviews and reports

Public review submission needs no account when feedback is enabled by the operator. Until then, submission forms are hidden and the API rejects writes. A submission contains only a random client request ID for safe retries, vacancy ID, self-reported work season, a short role (at most 80 characters), a pay clarity answer (`clear`, `unclear`, or `unknown`), and bounded answers to whether pay, expected hours, housing/cost, and transport matched what was described (`yes`, `no`, `unknown`, or `not applicable`), optional text of at most 500 characters, a self-report/consent acknowledgment, and a server-generated time and receipt ID. Role and short text cannot contain digits, `@`, or URLs; structured answers carry the comparison instead. An exact retry returns the same receipt; reuse of that request ID with changed answers is rejected. No name, contact information, file, employment document, or employer message is requested. These answers are self-reported; moderation does not verify employment. Never label a reviewer a verified worker without a separately defined verification method.

Reviews enter `pending`, then an operator `approves`, `rejects`, or `removes` them. Only approved reviews appear publicly, anonymously, with their season, submission date, role, and a clear “self-reported experience” label. The listing shows the approved review count, with no employer rating or ranking inferred from a small sample. Before approval, inspect for personal data, unsupported criminal or scam accusations, threats, private messages, individual employee names, and material unrelated to the job; reject or redact rather than publish it. A moderator can redact role and text before approval or on a published review. Rejection or removal immediately replaces the stored role with `redacted` and erases free text; structured answers and the retry hash remain. Keep decisions auditable without copying removed personal data into the audit log. An exact retry may reveal only `pending`, `approved`, or `rejected`, never the submitted content or private moderation notes.

Anyone may report a published review or previously published listing using an item ID, bounded reason (`personal_data`, `inaccurate`, `harmful`, or `other`), and optional explanation of at most 300 characters, without an account or contact field. Reports enter a private operator queue. A moderator checks the item and evidence, may pause a listing, redact or remove a review, then resolves or dismisses the report with an audited reason. A report decision does not itself remove content. There is no public employer response feature in the local prototype; an employer can use the same report path to request a correction or takedown. No particular dispute outcome is promised. Do not publish private correspondence or an unreviewed response.

## Language and interface states

All platform UI text, validation, status labels, and screen-reader labels is available in Russian and Kazakh; English is also supported. Never silently invent a translation of employer-provided facts. Show source language when recorded, otherwise state that it is unknown; identify any reviewed translation. Language selection works in web and Telegram without requiring Telegram identity.

The public interface is a job finder in Telegram and ordinary browsers: a header pinned to the top, search, a filter sheet, a scan-friendly vacancy list, and a detail view. Each vacancy row opens its detail; the detail keeps the separate trust facts and reveals the destination before external contact. Changing language translates the current page in place and keeps its scroll position. While a tapped link loads, the current page stays visible and the link shows a progress indicator. The filter sheet slides up, closes by swipe, backdrop tap, or Escape, and has a centered title without a close button. Date filters open a calendar inside the sheet. On phones, a focused text field becomes the only visible field in its form until focus leaves it; the filter sheet hides its title and actions and shows a Done button that returns to all fields, while Enter still applies the filters. Reduced-motion settings disable these animations. UI copy avoids decorative dashes and dot separators. The footer links to the repository with a GitHub icon and an accessible label. Housing is listing information, not a separate marketplace; there are no favorites or student profiles.

Search offers exact state, city, category, and season filters; role/employer text search; start/end dates; minimum expected hours; known or unknown housing details; and confirmation within 3, 7, or 14 days. Minimum pay compares only records in the selected currency and pay basis. A filter for an optional field excludes records where that field is unknown; unfiltered results keep them. The server limits results to current vacancies and 12 per page in the website.

Provide distinct empty, loading, stale, unavailable, rejected, and error states. A stale listing is never styled as current. A direct link to a paused, closed, or expired listing explains that it is unavailable without exposing unpublished changes. Development fixtures or mock jobs must be visibly marked and must never appear as live production vacancies.

## Unresolved risk

Whether this directory, its moderation, and its contact design amount to regulated employment intermediation is unresolved. Wording or disclaimers do not settle that classification. A local prototype can proceed; public operation and claims about legal compliance need separate qualified review. No visa, sponsor, employment, or safety conclusion is inferred from this specification.
