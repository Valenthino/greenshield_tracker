import test from "node:test";
import assert from "node:assert/strict";
import {
  blankLead,
  parseBackup,
  safeUrl,
  validDate,
  csvCell,
  summaryCsv,
  followUpState,
} from "../src/lib/records.js";
const lead = (id = "GS-01") => ({ ...blankLead(id), company: "A Company" });
const envelope = (records) => ({ schemaVersion: 1, records });

test("backup normalizes known fields and drops unexpected properties", () => {
  const [r] = parseBackup(
    envelope([
      {
        ...lead(),
        company: "  A Company  ",
        sources: [" https://example.com/ ", ""],
        unexpected: "not copied",
      },
    ]),
  );
  assert.equal(r.company, "A Company");
  assert.deepEqual(r.sources, ["https://example.com/"]);
  assert.equal("unexpected" in r, false);
});
test("empty valid backup is accepted", () =>
  assert.deepEqual(parseBackup(envelope([])), []));
test("wrong schema, duplicate IDs and incomplete records rejected", () => {
  for (const value of [
    null,
    [],
    {},
    envelope([lead(), lead()]),
    envelope([{ id: "GS-01" }]),
  ])
    assert.throws(() => parseBackup(value));
});
test("enum and field types validated", () => {
  for (const patch of [
    { stage: "Automatically sent" },
    { approval: "Assumed" },
    { contactEmail: 123 },
    { sources: [{}] },
    { organizationType: "Unrecognized" },
  ])
    assert.throws(() => parseBackup(envelope([{ ...lead(), ...patch }])));
});
test("source and field size limits enforced", () => {
  assert.throws(() =>
    parseBackup(
      envelope([
        { ...lead(), sources: Array(101).fill("https://example.com") },
      ]),
    ),
  );
  assert.throws(() =>
    parseBackup(envelope([{ ...lead(), notes: "x".repeat(60001) }])),
  );
});
test("safe links reject executable and non-web protocols", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///etc/passwd",
    "mailto:test@example.com",
    "//example.com",
    null,
    "",
  ])
    assert.equal(safeUrl(value), null);
  assert.equal(safeUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(safeUrl("http://example.com"), "http://example.com/");
});
test("dates accept real calendar dates, including leap years, or blanks", () => {
  for (const value of ["", "2024-02-29", "2026-10-30"])
    assert.equal(validDate(value), true);
  for (const value of [
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "30/10/2026",
    "2026-10-30T00:00:00Z",
  ])
    assert.equal(validDate(value), false);
});
test("CSV formula prefixes and embedded quotes are neutralized", () => {
  for (const value of [
    "=SUM(A1)",
    "+123",
    "-2",
    "@command",
    "  =cmd",
    "\t=cmd",
  ])
    assert.equal(csvCell(value).startsWith("\"'"), true);
  assert.equal(csvCell('Normal "text"'), '"Normal ""text"""');
  const csv = summaryCsv([{ ...lead(), company: '=HYPERLINK("bad")' }]);
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
});
test("follow-up state distinguishes overdue, due, future and inactive", () => {
  assert.equal(
    followUpState({ ...lead(), nextFollowUp: "2026-10-29" }, "2026-10-30"),
    "overdue",
  );
  assert.equal(
    followUpState({ ...lead(), nextFollowUp: "2026-10-30" }, "2026-10-30"),
    "today",
  );
  assert.equal(
    followUpState({ ...lead(), nextFollowUp: "2026-10-31" }, "2026-10-30"),
    "upcoming",
  );
  for (const stage of ["Closed", "Paused"])
    assert.equal(
      followUpState(
        { ...lead(), stage, nextFollowUp: "2026-10-29" },
        "2026-10-30",
      ),
      "none",
    );
});


test("reserved, unsafe and oversized IDs are rejected", () => {
  for (const id of ["__proto__", "constructor", "prototype", "../escape", "has space", "<script>", "x".repeat(81), ""]) {
    assert.throws(() => parseBackup(envelope([lead(id)])), /ID/);
  }
  for (const id of ["GS-01", "GS_abc123", "a".repeat(80)]) {
    assert.equal(parseBackup(envelope([lead(id)]))[0].id, id);
  }
});
