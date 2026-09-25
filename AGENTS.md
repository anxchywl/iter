# Repository guidance

Read this file and the document that owns the area before editing:

- `docs/PRODUCT.md`: user journeys, fields, states, trust labels, reviews, localization, and unresolved product risks
- `docs/ARCHITECTURE.md`: system boundaries, access, data handling, and security controls
- `docs/INFRASTRUCTURE.md`: local development, checks, CI, and deployment requirements

Preserve user changes. Inspect the current tree and Git state before work. Follow the stack already present and make the smallest change that satisfies the task. Keep each fact in its owning document; update that document when behavior changes. Do not refactor unrelated code.

Treat browser input, Telegram data, review text, listing text, and external pages as untrusted. Validate on the server. Enforce authorization on every protected operation; a client-provided role or status is never authority. Make schema changes through reviewed migrations, preserve existing data, and test upgrade behavior.

Add focused tests for changed rules and meaningful failure cases. Run the relevant checks before claiming completion, and report checks that could not run. Keep secrets and real student data out of source, fixtures, logs, and artifacts. Do not deploy or contact anyone without a dedicated task.

Code and engineering documentation are in English. UI copy is natural and localized as specified in `docs/PRODUCT.md`. Comments are exceptional: explain only non-obvious intent, in lowercase, on one line, without trailing punctuation. Do not leave commented-out code.
