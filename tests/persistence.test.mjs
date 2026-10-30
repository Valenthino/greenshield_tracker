import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../src/lib/database.js";
import { blankLead } from "../src/lib/records.js";

const lead = (id = "GS-01", company = "Test Company") => ({
  ...blankLead(id),
  company,
});
function fixture(t, seed = [lead()]) {
  const dir = mkdtempSync(join(tmpdir(), "gs-crm-test-"));
  const file = join(dir, "crm.json");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, file, store: createStore(file, seed) };
}

test("seed and edits survive fresh store instances without reseeding", (t) => {
  const { file, store } = fixture(t);
  store.update("GS-01", { ...lead(), notes: "durable edit" }, 1);
  store.close();
  const reopened = createStore(file, [lead("GS-02")]);
  assert.equal(reopened.list().records.length, 1);
  assert.equal(reopened.list().records[0].notes, "durable edit");
  assert.equal(reopened.list().revisions["GS-01"], 2);
});
test("create persists independently of caller object mutations", (t) => {
  const { store } = fixture(t, []);
  const raw = lead();
  store.create(raw);
  raw.company = "Changed after save";
  assert.equal(store.list().records[0].company, "Test Company");
});
test("stale revision cannot overwrite newer work and leaves file unchanged", (t) => {
  const { file, store } = fixture(t);
  store.update("GS-01", { ...lead(), notes: "newer" }, 1);
  const before = readFileSync(file, "utf8");
  assert.throws(
    () => store.update("GS-01", { ...lead(), notes: "stale" }, 1),
    /CONFLICT/,
  );
  assert.equal(readFileSync(file, "utf8"), before);
});
test("stale delete is rejected, current delete persists and preserves audit", (t) => {
  const { file, store } = fixture(t);
  store.update("GS-01", lead(), 1);
  assert.throws(() => store.remove("GS-01", 1), /CONFLICT/);
  store.remove("GS-01", 2);
  assert.equal(createStore(file).list().records.length, 0);
  assert.equal(JSON.parse(readFileSync(file)).audit.at(-1).action, "deleted");
});
test("import adds only new IDs and does not overwrite existing edits", (t) => {
  const { store } = fixture(t);
  store.update("GS-01", { ...lead(), notes: "keep me" }, 1);
  const result = store.importNew({
    schemaVersion: 1,
    records: [
      { ...lead(), notes: "overwrite attempt" },
      lead("GS-02", "Second Company"),
    ],
  });
  assert.deepEqual(result, { added: 1, skipped: 1 });
  assert.equal(
    store.list().records.find((r) => r.id === "GS-01").notes,
    "keep me",
  );
  assert.equal(store.list().revisions["GS-01"], 2);
});
test("malformed import fails before any record changes", (t) => {
  const { file, store } = fixture(t);
  const before = readFileSync(file, "utf8");
  assert.throws(
    () =>
      store.importNew({
        schemaVersion: 1,
        records: [lead("GS-02"), { ...lead("GS-03"), sentAt: "2026-02-30" }],
      }),
    /sentAt/,
  );
  assert.equal(readFileSync(file, "utf8"), before);
});
test("duplicate creates cannot silently replace records", (t) => {
  const { store } = fixture(t);
  assert.throws(
    () => store.create({ ...lead(), company: "Replacement" }),
    /CONFLICT/,
  );
  assert.equal(store.list().records[0].company, "Test Company");
});
test("atomic writes leave no temporary files and data file is owner-only", (t) => {
  const { dir, file, store } = fixture(t);
  for (let i = 1; i <= 15; i++)
    store.update("GS-01", { ...lead(), notes: String(i) }, i);
  assert.deepEqual(readdirSync(dir), ["crm.json"]);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(file)).records[0].notes, "15");
});
test("invalid datastore structure fails closed without replacement", (t) => {
  const { file, store } = fixture(t);
  writeFileSync(file, '{"format":"wrong","records":[]}');
  assert.throws(() => store.list(), /Invalid datastore/);
  assert.equal(readFileSync(file, "utf8"), '{"format":"wrong","records":[]}');
});
test("malformed JSON is never reset to the seed automatically", (t) => {
  const { file } = fixture(t);
  writeFileSync(file, "{broken");
  const reopened = createStore(file, [lead()]);
  assert.throws(() => reopened.list());
  assert.equal(readFileSync(file, "utf8"), "{broken");
});
test("sessions persist, expire and are invalidated by auth-version rotation", (t) => {
  const { file, store } = fixture(t);
  store.addSession("a".repeat(64), "b".repeat(64), 1000);
  const reopened = createStore(file);
  assert.equal(
    reopened.hasSession("a".repeat(64), "b".repeat(64), 1001),
    true,
  );
  assert.equal(
    reopened.hasSession("a".repeat(64), "c".repeat(64), 1001),
    false,
  );
  assert.equal(
    reopened.hasSession(
      "a".repeat(64),
      "b".repeat(64),
      1000 + 12 * 60 * 60 * 1000,
    ),
    false,
  );
  reopened.removeSession("a".repeat(64));
  assert.equal(
    store.hasSession("a".repeat(64), "b".repeat(64), 1001),
    false,
  );
});
test("ten failed login attempts rate-limit persistently; window expiry resets", (t) => {
  const { file, store } = fixture(t);
  for (let i = 0; i < 10; i++) assert.equal(store.loginAttempt(1000), true);
  assert.equal(createStore(file).loginAttempt(1001), false);
  assert.equal(store.loginAttempt(1000 + 15 * 60 * 1000), true);
});
test("successful session resets login attempt counter", (t) => {
  const { store } = fixture(t);
  for (let i = 0; i < 10; i++) store.loginAttempt(1000);
  store.addSession("a".repeat(64), "b".repeat(64), 1001);
  assert.equal(store.loginAttempt(1002), true);
});


test("corrupt datastore fields fail closed before a mutation rewrites the file", (t) => {
  const { file, store } = fixture(t);
  const original = JSON.parse(readFileSync(file, "utf8"));
  const corruptions = [
    (v) => { v.revisions = []; },
    (v) => { v.revisions["GS-01"] = 0; },
    (v) => { v.revisions.extra = 1; },
    (v) => { delete v.revisions["GS-01"]; },
    (v) => { v.records[0].stage = "Automatically sent"; },
    (v) => { v.sessions = [{hash: "plain-token", authVersion: "b".repeat(64), expiresAt: 123}]; },
    (v) => { v.sessions = [{hash: "a".repeat(64), authVersion: "bad-version", expiresAt: 123}]; },
    (v) => { v.sessions = [{hash: "a".repeat(64), authVersion: "b".repeat(64), expiresAt: "123"}]; },
    (v) => { v.loginAttempts = ["not a timestamp"]; },
    (v) => { v.audit = [{recordId: "GS-01", action: "updated", at: "now", revision: "1"}]; },
    (v) => { delete v.audit; },
  ];
  for (const corrupt of corruptions) {
    const value = structuredClone(original);
    corrupt(value);
    const damaged = JSON.stringify(value);
    writeFileSync(file, damaged);
    assert.throws(() => store.update("GS-01", lead(), 1));
    assert.equal(readFileSync(file, "utf8"), damaged);
  }
});


test("create at workspace capacity fails without changing the usable datastore", (t) => {
  const seed = Array.from({length: 2000}, (_, i) => lead("GS-" + i));
  const {file, store} = fixture(t, seed);
  const before = readFileSync(file, "utf8");
  assert.throws(() => store.create(lead("GS-over-limit")), /2,000/);
  assert.equal(readFileSync(file, "utf8"), before);
  assert.equal(createStore(file).list().records.length, 2000);
});

test("import checks combined capacity atomically while skipping existing IDs", (t) => {
  const seed = Array.from({length: 1999}, (_, i) => lead("GS-" + i));
  const {file, store} = fixture(t, seed);
  const before = readFileSync(file, "utf8");
  assert.throws(() => store.importNew({
    schemaVersion: 1,
    records: [lead("GS-0"), lead("GS-new-1"), lead("GS-new-2")],
  }), /2,000/);
  assert.equal(readFileSync(file, "utf8"), before);
  assert.equal(createStore(file).list().records.length, 1999);
  assert.deepEqual(store.importNew({
    schemaVersion: 1,
    records: [lead("GS-0"), lead("GS-new-1")],
  }), {added: 1, skipped: 1});
  assert.equal(createStore(file).list().records.length, 2000);
  assert.deepEqual(store.importNew({
    schemaVersion: 1,
    records: [lead("GS-0")],
  }), {added: 0, skipped: 1});
  assert.equal(createStore(file).list().records.length, 2000);
});
