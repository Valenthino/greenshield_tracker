import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dictionary = readFileSync("src/lib/i18n.ts", "utf8");
const keys = new Set();
for (const [, key] of dictionary.matchAll(/^\s+(?:"((?:[^"\\]|\\.)*)"|([A-Za-z]+)):/gm)) keys.add(key);
for (const [, , bare] of dictionary.matchAll(/^\s+(?:"((?:[^"\\]|\\.)*)"|([A-Za-z]+)):/gm)) if (bare) keys.add(bare);
// Multi-line entries: key on its own line followed by the French on the next.
for (const [, key] of dictionary.matchAll(/^\s+"((?:[^"\\]|\\.)*)":\s*$/gm)) keys.add(key);

test("every on-screen English string in the CRM has its French", () => {
  const source = readFileSync("src/components/crm.tsx", "utf8");
  const used = new Set();
  for (const [, text] of source.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) used.add(text);
  for (const [, text] of source.matchAll(/message\(\s*caught,\s*"((?:[^"\\]|\\.)*)"/g)) used.add(text);
  const missing = [...used].filter((text) => !keys.has(text));
  assert.deepEqual(missing, []);
});

test("every stored value shown on screen has its French", async () => {
  const records = await import("../src/lib/records.js");
  const values = [
    ...records.stages,
    ...records.approvals,
    ...records.organizationTypes,
    ...records.channels,
    ...records.commodities,
  ];
  assert.deepEqual(values.filter((value) => !keys.has(value)), []);
});

test("work order puts overdue first, then today, then by date, then undated", async () => {
  const { sortForWork, blankLead } = await import("../src/lib/records.js");
  const lead = (company, nextFollowUp = "", stage = "Draft") => ({ ...blankLead("x"), company, nextFollowUp, stage });
  const sorted = sortForWork(
    [lead("No date"), lead("Later", "2026-12-20"), lead("Today", "2026-11-23"), lead("Overdue", "2026-11-01"), lead("Soon", "2026-11-30"), lead("Closed", "2026-11-01", "Closed")],
    "2026-11-23",
  ).map((record) => record.company);
  assert.deepEqual(sorted, ["Overdue", "Today", "Soon", "Later", "Closed", "No date"]);
});

test("WhatsApp numbers keep digits only and refuse short ones", async () => {
  const { whatsappNumber } = await import("../src/lib/records.js");
  assert.equal(whatsappNumber("+44 20 1234 5678"), "442012345678");
  assert.equal(whatsappNumber("0044 20 1234 5678"), "442012345678");
  assert.equal(whatsappNumber("123"), "");
});
