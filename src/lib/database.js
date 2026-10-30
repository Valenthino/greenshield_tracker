import {
  mkdirSync,
  existsSync,
  readFileSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { parseBackup } from "./records.js";

/** Single-process datastore. Each mutation is synchronous read-check-write,
 * fsync and atomic rename in the same directory. Run ONE application replica.
 * @param {string} file @param {import('./types').Lead[]} [seed] */
export function createStore(file, seed = []) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  function read() {
    const value = JSON.parse(readFileSync(file, "utf8"));
    const invalid = () => {
      throw new Error(
        "Invalid datastore. Restore a known backup; the file was not overwritten.",
      );
    };
    if (
      value.format !== "green-shield-crm-v1" ||
      !Array.isArray(value.records) ||
      !value.revisions ||
      Array.isArray(value.revisions) ||
      typeof value.revisions !== "object" ||
      !Array.isArray(value.sessions) ||
      !Array.isArray(value.loginAttempts) ||
      !Array.isArray(value.audit)
    )
      invalid();
    const records = parseBackup({ schemaVersion: 1, records: value.records });
    if (
      Object.keys(value.revisions).length !== records.length ||
      records.some(
        (record) =>
          !Number.isInteger(value.revisions[record.id]) ||
          value.revisions[record.id] < 1,
      )
    )
      invalid();
    if (
      value.sessions.some(
        (session) =>
          !session ||
          typeof session !== "object" ||
          !/^[a-f0-9]{64}$/.test(session.hash) ||
          !/^[a-f0-9]{64}$/.test(session.authVersion) ||
          !Number.isSafeInteger(session.expiresAt),
      )
    )
      invalid();
    if (value.loginAttempts.some((at) => !Number.isSafeInteger(at))) invalid();
    if (
      value.audit.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          typeof item.recordId !== "string" ||
          typeof item.action !== "string" ||
          typeof item.at !== "string" ||
          !Number.isInteger(item.revision),
      )
    )
      invalid();
    return value;
  }
  /** @param {any} value */
  function write(value) {
    const temp = file + "." + process.pid + "." + randomUUID() + ".tmp";
    let fd;
    try {
      fd = openSync(temp, "wx", 0o600);
      writeFileSync(fd, JSON.stringify(value, null, 2) + "\n", "utf8");
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(temp, file);
      const dir = openSync(dirname(file), "r");
      try {
        fsyncSync(dir);
      } finally {
        closeSync(dir);
      }
    } catch (error) {
      if (fd !== undefined) closeSync(fd);
      if (existsSync(temp)) unlinkSync(temp);
      throw error;
    }
  }
  /** @param {(data:any)=>any} action */
  function mutate(action) {
    const data = read();
    const result = action(data);
    write(data);
    return result;
  }
  if (!existsSync(file)) {
    const records = parseBackup({ schemaVersion: 1, records: seed });
    write({
      format: "green-shield-crm-v1",
      records,
      revisions: Object.fromEntries(records.map((record) => [record.id, 1])),
      sessions: [],
      loginAttempts: [],
      audit: [],
      createdAt: new Date().toISOString(),
    });
  }
  function note(data, recordId, action, revision) {
    data.audit.push({
      recordId,
      action,
      revision,
      at: new Date().toISOString(),
    });
    if (data.audit.length > 5000) data.audit = data.audit.slice(-5000);
  }
  return {
    list() {
      const data = read();
      return { records: data.records, revisions: data.revisions };
    },
    /** @param {import('./types').Lead} raw */
    create(raw) {
      const [record] = parseBackup({ schemaVersion: 1, records: [raw] });
      record.updatedAt = new Date().toISOString();
      return mutate((data) => {
        if (data.records.some((item) => item.id === record.id))
          throw new Error("CONFLICT");
        if (data.records.length >= 2000)
          throw new Error("This workspace supports up to 2,000 records. Remove a record before adding another.");
        data.records.push(record);
        data.revisions[record.id] = 1;
        note(data, record.id, "created", 1);
        return { record, revision: 1 };
      });
    },
    /** @param {string} id @param {import('./types').Lead} raw @param {number} expectedRevision */
    update(id, raw, expectedRevision) {
      const [record] = parseBackup({
        schemaVersion: 1,
        records: [{ ...raw, id }],
      });
      record.updatedAt = new Date().toISOString();
      return mutate((data) => {
        const index = data.records.findIndex((item) => item.id === id);
        if (index < 0 || data.revisions[id] !== expectedRevision)
          throw new Error("CONFLICT");
        const previous = data.records[index];
        if(previous.approval === 'Approved' && ['emailSubject','emailBody','followUpDraft'].some(key => previous[key] !== record[key])) {
          record.approval = 'Not reviewed'; record.approvedAt = ''; record.approvedBy = '';
          if(record.stage === 'Approved') record.stage = 'Ready for review';
        }
        data.records[index] = record;
        data.revisions[id]++;
        note(data, id, "updated", data.revisions[id]);
        return { record, revision: data.revisions[id] };
      });
    },
    /** @param {string} id @param {number} expectedRevision */
    remove(id, expectedRevision) {
      return mutate((data) => {
        const index = data.records.findIndex((item) => item.id === id);
        if (index < 0 || data.revisions[id] !== expectedRevision)
          throw new Error("CONFLICT");
        data.records.splice(index, 1);
        delete data.revisions[id];
        note(data, id, "deleted", expectedRevision);
      });
    },
    /** @param {unknown} envelope */
    importNew(envelope) {
      const records = parseBackup(envelope);
      return mutate((data) => {
        const existingIds = new Set(data.records.map((record) => record.id));
        const incomingCount = records.filter((record) => !existingIds.has(record.id)).length;
        if (data.records.length + incomingCount > 2000)
          throw new Error("This import would exceed the workspace limit of 2,000 records. No records were imported.");
        let added = 0;
        let skipped = 0;
        for (const record of records) {
          if (data.records.some((item) => item.id === record.id)) {
            skipped++;
            continue;
          }
          record.updatedAt = new Date().toISOString();
          data.records.push(record);
          data.revisions[record.id] = 1;
          note(data, record.id, "imported", 1);
          added++;
        }
        return { added, skipped };
      });
    },
    /** @param {string} hash @param {string} authVersion @param {number} now */
    hasSession(hash, authVersion, now) {
      return read().sessions.some(
        (session) =>
          session.hash === hash &&
          session.authVersion === authVersion &&
          session.expiresAt > now,
      );
    },
    /** @param {string} hash @param {string} authVersion @param {number} now */
    addSession(hash, authVersion, now) {
      mutate((data) => {
        data.sessions = data.sessions.filter(
          (session) =>
            session.expiresAt > now && session.authVersion === authVersion,
        );
        data.sessions.push({
          hash,
          authVersion,
          expiresAt: now + 12 * 60 * 60 * 1000,
        });
        data.loginAttempts = [];
      });
    },
    /** @param {string} hash */
    removeSession(hash) {
      mutate((data) => {
        data.sessions = data.sessions.filter(
          (session) => session.hash !== hash,
        );
      });
    },
    /** @param {number} now */
    loginAttempt(now) {
      return mutate((data) => {
        data.loginAttempts = data.loginAttempts.filter(
          (at) => at > now - 15 * 60 * 1000,
        );
        if (data.loginAttempts.length >= 10) return false;
        data.loginAttempts.push(now);
        return true;
      });
    },
    close() {},
  };
}
