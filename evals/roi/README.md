# ROI eval harness (V1)

Scores V1 report text against strong reference reports. Goes with V1 (LYR-241).

## Redaction

- Commit only redacted or synthetic client material.
- No real client names, emails or confidential numbers.

## Layout

- `rubric.json`: scoring weights and shared checks
- `run.mjs`: loads every case and prints scores
- `scoreReport.mjs`: the scoring
- `cases/<case-id>/case.json`: company name, required sections and anchors
- `cases/<case-id>/reference.md`: the strong reference report
- `cases/<case-id>/actual.md`: optional, today's output for the same company

## Running

```bash
npm run eval:roi
node evals/roi/run.mjs --case sample-redacted   # one case
```

## case.json

```json
{
  "id": "sample-redacted",
  "title": "Redacted legal ops company reference case",
  "companyName": "Northstar Legal Ops",
  "recipientNames": ["Maya Chen"],
  "requiredSections": ["Executive Summary", "Profit Uplift", "Next Steps"],
  "positiveAnchors": ["Dubai", "managed legal services", "Salesforce"],
  "workflowAnchors": ["Contract intake triage", "Matter status reporting"],
  "riskAnchors": ["privilege", "jurisdictional"]
}
```
