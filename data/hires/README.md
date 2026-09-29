# Historical hires — expected format

No files are here yet. Drop in one file per historical hire and re-run `npm run seed`.

**Preferred format — one `.json` file per hire:**

```json
{
  "id": "hire-01",
  "name": "Jane Doe",
  "role": "PM",
  "joinedDate": "2023-04",
  "applicationSignals": [
    "Owned dock-scheduling and carrier-integration product areas solo",
    "..."
  ],
  "interviewSignals": [
    "Walked through a specific decision made with incomplete data",
    "..."
  ],
  "outcomeRating": "Exceeds Expectations"
}
```

`outcomeRating` must be exactly one of: `"Exceeds Expectations"`, `"Meets Expectations"`, `"Below Expectations"`.

**Fallback format — `.docx` or `.txt`** with labeled sections the parser looks for
(case-insensitive): a line starting with `Role:`, a line starting with `Outcome:`
(with one of the three ratings above), and bullet lines under headings
containing the words "application" and "interview" respectively.

Until real files exist here, the historical hiring pattern engine reports
"insufficient historical evidence" and every rubric falls back to
JD-only criteria — this is intended behavior per the product spec (Section 27:
never fabricate historical data), not a bug.
