"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Lead } from "@/lib/types";
import {
  approvals,
  blankLead,
  channels,
  followUpState,
  organizationTypes,
  parseBackup,
  safeUrl,
  stages,
  summaryCsv,
} from "@/lib/records";

type View = "all" | "review" | "due" | "replies";
type Tab = "company" | "sources" | "draft" | "activity";
type Session = "loading" | "setup" | "login" | "ready";
function Icon({
  name,
}: {
  name:
    | "arrow"
    | "plus"
    | "search"
    | "grid"
    | "mail"
    | "clock"
    | "download"
    | "refresh"
    | "lock"
    | "close"
    | "check";
}) {
  const paths = {
    arrow: "M4 16 16 4M4 4h12v12",
    plus: "M10 3v14M3 10h14",
    search: "M14 14l4 4M16 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
    grid: "M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z",
    mail: "M2 5h16v11H2zM2 5l8 6 8-6",
    clock: "M10 5v5l4 2M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    download: "M10 2v11M6 9l4 4 4-4M3 14v4h14v-4",
    refresh: "M17 7a7 7 0 1 0 0 7M17 2v5h-5",
    lock: "M4 9h12v9H4zM6 9V6a4 4 0 0 1 8 0v3",
    close: "M4 4l12 12M16 4 4 16",
    check: "M3 10l5 5 9-10",
  };
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
function Brand() {
  return (
    <div className="brand">
      <svg viewBox="0 0 34 44" aria-hidden="true">
        <path d="M17 5C-1 15 0 32 17 39C34 32 35 15 17 5Zm0 1v32M17 7C6 17 6 29 17 37M17 7c11 10 11 22 0 30M17 5c0-2 1-3 4-4" />
      </svg>
      <span>
        <strong>Green Shield</strong>
        <small>OUTREACH WORKSPACE</small>
      </span>
    </div>
  );
}
function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span
      className={`status status-${value.toLowerCase().replaceAll(" ", "-")}`}
    >
      {value}
    </span>
  );
}
function ExternalLink({ url, label }: { url: string; label?: string }) {
  const href = safeUrl(url);
  return href ? (
    <a
      className="source-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
    >
      {label || url}
      <Icon name="arrow" />
    </a>
  ) : (
    <span className="invalid-url">{url || "No source added"}</span>
  );
}
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function shortDate(value: string) {
  if (!value) return "Not set";
  return new Date(value + "T12:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function api(path: string, options: RequestInit = {}) {
  const result = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
  });
  const data = await result.json();
  if (!result.ok)
    throw new Error(data.error || `Request failed (${result.status}).`);
  return data;
}

export default function Crm() {
  const [session, setSession] = useState<Session>("loading");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<Lead[]>([]);
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [loadedAt, setLoadedAt] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All types");
  const [stageFilter, setStageFilter] = useState("All stages");
  const [draft, setDraft] = useState<Lead | null>(null);
  const [baseline, setBaseline] = useState("");
  const [revision, setRevision] = useState(0);
  const [isNew, setIsNew] = useState(false);
  const [tab, setTab] = useState<Tab>("company");
  const [recordError, setRecordError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const editor = useRef<HTMLDialogElement>(null);
  const dataDialog = useRef<HTMLDialogElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const dirty = Boolean(draft && JSON.stringify(draft) !== baseline);
  async function loadRecords() {
    const data = await api("/api/records/");
    setRecords(data.records);
    setRevisions(data.revisions);
    setLoadedAt(
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api("/api/session/");
        if (!active) return;
        if (!data.configured) {
          setSession("setup");
          return;
        }
        if (data.authenticated) {
          await loadRecords();
          if (active) setSession("ready");
        } else setSession("login");
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Cannot reach the server.",
          );
          setSession("login");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (draft && !editor.current?.open) editor.current?.showModal();
    if (!draft && editor.current?.open) editor.current.close();
  }, [draft]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/session/", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      await loadRecords();
      setSession("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (dirty && !window.confirm("Discard your unsaved changes and sign out?"))
      return;
    setBusy(true);
    try {
      await api("/api/session/", { method: "DELETE" });
      setDraft(null);
      setRecords([]);
      setSession("login");
      setNotice("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Sign-out was not confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await loadRecords();
      setNotice("Latest records loaded from the server.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not reload records.",
      );
    } finally {
      setBusy(false);
    }
  }
  function edit(record: Lead) {
    setDraft(structuredClone(record));
    setBaseline(JSON.stringify(record));
    setRevision(revisions[record.id] || 0);
    setIsNew(false);
    setTab("company");
    setRecordError("");
    setCopyNotice("");
  }
  function add() {
    const value = blankLead("GS-" + crypto.randomUUID());
    setDraft(value);
    setBaseline(JSON.stringify(value));
    setRevision(0);
    setIsNew(true);
    setTab("company");
    setRecordError("");
    setCopyNotice("");
  }
  function closeEditor() {
    if (busy) return;
    if (dirty && !window.confirm("Discard the unsaved changes in this record?"))
      return;
    setDraft(null);
    setRecordError("");
  }
  function update<K extends keyof Lead>(field: K, value: Lead[K]) {
    setDraft((previous) => {
      if (!previous) return previous;
      const next = { ...previous, [field]: value };
      if (
        ["emailSubject", "emailBody", "followUpDraft"].includes(field) &&
        previous.approval === "Approved" &&
        value !== previous[field]
      ) {
        next.approval = "Not reviewed";
        next.approvedAt = "";
        next.approvedBy = "";
        if (next.stage === "Approved") next.stage = "Ready for review";
      }
      return next;
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.company.trim()) {
      setRecordError("Enter a company name.");
      setTab("company");
      return;
    }
    setBusy(true);
    setRecordError("");
    try {
      const [checked] = parseBackup({ schemaVersion: 1, records: [draft] });
      const result = await api(
        isNew
          ? "/api/records/"
          : `/api/records/${encodeURIComponent(draft.id)}/`,
        {
          method: isNew ? "POST" : "PUT",
          body: JSON.stringify({
            record: checked,
            requestId: checked.id,
            expectedRevision: revision,
          }),
        },
      );
      setRecords((previous) =>
        isNew
          ? [...previous, result.record]
          : previous.map((record) =>
              record.id === result.record.id ? result.record : record,
            ),
      );
      setRevisions((previous) => ({
        ...previous,
        [result.record.id]: result.revision,
      }));
      setNotice(`${result.record.company} saved to the server datastore.`);
      setDraft(null);
      setLoadedAt(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (caught) {
      setRecordError(
        caught instanceof Error
          ? caught.message
          : "Save result is unconfirmed. Refresh the list before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!draft || isNew) return;
    if (
      !window.confirm(
        `Delete ${draft.company} from the server datastore? This cannot be undone. Export a backup first if you need a copy.`,
      )
    )
      return;
    setBusy(true);
    setRecordError("");
    try {
      await api(`/api/records/${encodeURIComponent(draft.id)}/`, {
        method: "DELETE",
        body: JSON.stringify({ expectedRevision: revision }),
      });
      setRecords((previous) =>
        previous.filter((record) => record.id !== draft.id),
      );
      setNotice(`${draft.company} deleted from the datastore.`);
      setDraft(null);
    } catch (caught) {
      setRecordError(
        caught instanceof Error
          ? caught.message
          : "Deletion was not confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(
        `Subject: ${draft.emailSubject}\n\n${draft.emailBody}`,
      );
      setCopyNotice("Copied to your clipboard. Nothing was sent.");
    } catch {
      setCopyNotice(
        "Clipboard unavailable. Select and copy the text manually.",
      );
    }
  }
  async function exportBackup() {
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/backup/");
      download(
        `green-shield-crm-${today()}.json`,
        JSON.stringify(data, null, 2),
        "application/json",
      );
      setNotice(
        "JSON backup downloaded. Keep it in a private, backed-up location.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Backup failed.");
    } finally {
      setBusy(false);
    }
  }
  async function importBackup(file: File) {
    setError("");
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Choose a JSON backup smaller than 4 MB.");
      const data = JSON.parse(await file.text());
      const incoming = parseBackup(data);
      if (
        !window.confirm(
          `Import ${incoming.length} records? New IDs will be added. Existing IDs and your edits will be left unchanged.`,
        )
      )
        return;
      setBusy(true);
      const result = await api("/api/import/", {
        method: "POST",
        body: JSON.stringify({ schemaVersion: 1, records: incoming }),
      });
      await loadRecords();
      setNotice(
        `${result.added} new records imported. ${result.skipped} existing IDs left unchanged.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setBusy(false);
      if (importInput.current) importInput.current.value = "";
    }
  }
  const date = today();
  const dueCount = records.filter((record) =>
    ["overdue", "today"].includes(followUpState(record, date)),
  ).length;
  const reviewCount = records.filter(
    (record) =>
      record.approval !== "Approved" &&
      !["Closed", "Paused"].includes(record.stage),
  ).length;
  const replyCount = records.filter(
    (record) => record.replyAt || record.stage === "Replied",
  ).length;
  const sentCount = records.filter((record) => record.sentAt).length;
  const filtered = useMemo(
    () =>
      records
        .filter((record) => {
          const search =
            `${record.company} ${record.contactName} ${record.contactEmail} ${record.geography} ${record.fit}`.toLowerCase();
          return (
            (!query || search.includes(query.toLowerCase())) &&
            (typeFilter === "All types" ||
              record.organizationType === typeFilter) &&
            (stageFilter === "All stages" || record.stage === stageFilter) &&
            (view === "all" ||
              (view === "review" &&
                record.approval !== "Approved" &&
                !["Closed", "Paused"].includes(record.stage)) ||
              (view === "due" &&
                ["overdue", "today"].includes(followUpState(record, date))) ||
              (view === "replies" &&
                Boolean(record.replyAt || record.stage === "Replied")))
          );
        })
        .sort((a, b) => a.id.localeCompare(b.id)),
    [records, query, typeFilter, stageFilter, view, date],
  );

  if (session !== "ready")
    return (
      <main className="login-page">
        <div className="login-brand">
          <Brand />
        </div>
        <section className="login-card">
          <p className="eyebrow">PRIVATE WORKSPACE</p>
          <h1>
            Your next
            <br />
            <em>conversation.</em>
          </h1>
          <p>
            One place for cocoa prospects, source notes and the follow-through.
          </p>
          {session === "loading" ? (
            <p className="login-status">Checking your session…</p>
          ) : session === "setup" ? (
            <div className="setup-note">
              <h2>Set up access first.</h2>
              <p>
                Run <code>npm run setup</code> in this project, save the
                generated password, then restart the server.
              </p>
              <p>No prospect data is available before authentication.</p>
            </div>
          ) : (
            <form onSubmit={signIn}>
              <label className="field">
                <span>Workspace password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button dark" disabled={busy}>
                {busy ? "Signing in…" : "Open workspace"}
                <Icon name="arrow" />
              </button>
            </form>
          )}
          <div className="login-footer">
            <Icon name="lock" />
            <span>
              Authenticated access · Server-side JSON datastore
              <br />
              No email sending or mailbox synchronization
            </span>
          </div>
        </section>
        <p className="login-disclaimer">
          Protected preview. Keep authentication, HTTPS and the persistent data
          volume configured before network access.
        </p>
      </main>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav aria-label="Workspace views">
          <button
            className={view === "all" ? "selected" : ""}
            onClick={() => setView("all")}
          >
            <Icon name="grid" />
            Companies<span>{records.length}</span>
          </button>
          <button
            className={view === "review" ? "selected" : ""}
            onClick={() => setView("review")}
          >
            <Icon name="mail" />
            Draft review<span>{reviewCount}</span>
          </button>
          <button
            className={view === "due" ? "selected" : ""}
            onClick={() => setView("due")}
          >
            <Icon name="clock" />
            Follow-ups<span>{dueCount}</span>
          </button>
          <button
            className={view === "replies" ? "selected" : ""}
            onClick={() => setView("replies")}
          >
            <Icon name="check" />
            Replies<span>{replyCount}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="connection-state">
            <span className="connection-dot" />
            <strong>Server datastore</strong>
            <p>Changes are saved to the server’s persistent JSON file.</p>
          </div>
          <button
            className="sidebar-link"
            onClick={() => dataDialog.current?.showModal()}
          >
            <Icon name="download" />
            Backup & workspace
          </button>
          <button className="sidebar-link" onClick={signOut} disabled={busy}>
            <Icon name="lock" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <div className="workspace-top">
          <span>
            <i /> AUTHENTICATED PREVIEW
          </span>
          <p>No mailbox connected. Nothing sends automatically.</p>
          <button
            onClick={refresh}
            disabled={busy}
            aria-label="Refresh records"
          >
            <Icon name="refresh" />
          </button>
        </div>
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">GREEN SHIELD / RELATIONSHIPS</p>
            <h1>
              {view === "all"
                ? "The next conversation."
                : view === "review"
                  ? "Ready for a closer look."
                  : view === "due"
                    ? "Keep the conversation going."
                    : "The conversation continues."}
            </h1>
            <p>
              A considered approach to cocoa outreach, one company at a time.
            </p>
          </div>
          <button className="button dark" onClick={add}>
            <Icon name="plus" />
            Add company
          </button>
        </header>
        <section className="metrics" aria-label="Outreach summary">
          <button onClick={() => setView("all")}>
            <span>Companies</span>
            <strong>{records.length.toString().padStart(2, "0")}</strong>
            <small>in your working list</small>
          </button>
          <button onClick={() => setView("review")}>
            <span>Awaiting review</span>
            <strong>{reviewCount.toString().padStart(2, "0")}</strong>
            <small>approval still to record</small>
          </button>
          <button onClick={() => setView("due")}>
            <span>Follow-ups due</span>
            <strong>{dueCount.toString().padStart(2, "0")}</strong>
            <small>based on dates you set</small>
          </button>
          <div>
            <span>Sent records</span>
            <strong>{sentCount.toString().padStart(2, "0")}</strong>
            <small>manually entered, not synced</small>
          </div>
        </section>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            <Icon name="check" />
            {notice}
            <button
              onClick={() => setNotice("")}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        )}
        <section className="list-section">
          <div className="list-title">
            <div>
              <h2>
                {view === "all"
                  ? "Your companies"
                  : view === "review"
                    ? "Drafts to review"
                    : view === "due"
                      ? "Follow-up list"
                      : "Reply records"}
              </h2>
              <span>
                {filtered.length} of {records.length} records
              </span>
            </div>
            <button
              className="text-button"
              onClick={exportBackup}
              disabled={busy}
            >
              Export backup
              <Icon name="download" />
            </button>
          </div>
          <div className="filters">
            <label className="search-field">
              <Icon name="search" />
              <input
                aria-label="Search companies"
                placeholder="Search company, contact or market…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Organization type</span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option>All types</option>
                {organizationTypes.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Stage filter</span>
              <select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value)}
              >
                <option>All stages</option>
                {stages.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Company / contact</th>
                  <th>Organization</th>
                  <th>Stage</th>
                  <th>Approval</th>
                  <th>Next follow-up</th>
                  <th>
                    <span className="sr-only">Open record</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => {
                  const due = followUpState(record, date);
                  return (
                    <tr key={record.id} onClick={() => edit(record)}>
                      <td>
                        <button
                          className="company-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            edit(record);
                          }}
                        >
                          <strong>{record.company}</strong>
                          <span>
                            {record.contactEmail ||
                              record.contactName ||
                              "Contact details to add"}
                          </span>
                        </button>
                        {record.complianceGate && (
                          <span className="gate-label">Review gate</span>
                        )}
                      </td>
                      <td>
                        <span className="organization-type">
                          {record.organizationType}
                        </span>
                        <small className="record-id">{record.id}</small>
                      </td>
                      <td>
                        <Status value={record.stage} />
                      </td>
                      <td>
                        <span
                          className={`approval-label ${record.approval === "Approved" ? "approved" : ""}`}
                        >
                          {record.approval}
                        </span>
                      </td>
                      <td>
                        <span className={due === "overdue" ? "overdue" : ""}>
                          {shortDate(record.nextFollowUp)}
                        </span>
                        {due === "overdue" && (
                          <small className="due-note">Overdue</small>
                        )}
                        {due === "today" && (
                          <small className="due-note">Today</small>
                        )}
                      </td>
                      <td>
                        <span className="row-arrow">
                          <Icon name="arrow" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="empty-state">
                <h3>No records in this view.</h3>
                <p>
                  {view === "due"
                    ? "Set a next follow-up date in a company record when it is appropriate. No dates are assumed."
                    : "Try another search or filter, or add a company."}
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    setView("all");
                    setQuery("");
                    setTypeFilter("All types");
                    setStageFilter("All stages");
                  }}
                >
                  Show all companies
                  <Icon name="arrow" />
                </button>
              </div>
            )}
          </div>
          <div className="list-footnote">
            <span>
              Last loaded {loadedAt || "—"} · Use Refresh to see changes from
              another session.
            </span>
            <span>Source notes remain research, not buyer acceptance.</span>
          </div>
        </section>
        <footer className="workspace-footer">
          <span>Green Shield · Internal outreach workspace</span>
          <button onClick={() => dataDialog.current?.showModal()}>
            About data & access
            <Icon name="arrow" />
          </button>
        </footer>
      </main>

      <dialog
        ref={editor}
        className="record-panel"
        onCancel={(event) => {
          event.preventDefault();
          closeEditor();
        }}
      >
        {draft && (
          <form onSubmit={save}>
            <header className="panel-heading">
              <div>
                <p className="eyebrow">
                  {isNew ? "NEW COMPANY" : draft.id + " / COMPANY RECORD"}
                </p>
                <h2>{draft.company || "A new relationship."}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeEditor}
                aria-label="Close record"
              >
                <Icon name="close" />
              </button>
            </header>
            <div
              className="panel-tabs"
              role="tablist"
              aria-label="Record sections"
            >
              {(["company", "sources", "draft", "activity"] as const).map(
                (value) => (
                  <button
                    type="button"
                    key={value}
                    role="tab"
                    aria-selected={tab === value}
                    className={tab === value ? "active" : ""}
                    onClick={() => setTab(value)}
                  >
                    {value === "company"
                      ? "Company"
                      : value === "sources"
                        ? "Sources & fit"
                        : value === "draft"
                          ? "Email drafts"
                          : "Activity"}
                  </button>
                ),
              )}
            </div>
            <div className="panel-content">
              {draft.complianceGate && (
                <div className="gate-warning">
                  <strong>Outreach review gate</strong>
                  <p>{draft.complianceGate}</p>
                </div>
              )}
              {tab === "company" && (
                <>
                  <div className="section-note">
                    <h3>The right people, clearly identified.</h3>
                    <p>
                      Contact details and organization type are editable. A
                      published address does not establish consent or a
                      willingness to buy.
                    </p>
                  </div>
                  <div className="field-grid">
                    <Field label="Company" wide>
                      <input
                        value={draft.company}
                        onChange={(event) =>
                          update("company", event.target.value)
                        }
                        maxLength={180}
                      />
                    </Field>
                    <Field label="Organization type">
                      <select
                        value={draft.organizationType}
                        onChange={(event) =>
                          update("organizationType", event.target.value)
                        }
                      >
                        {organizationTypes.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Planned channel">
                      <select
                        value={draft.plannedChannel}
                        onChange={(event) =>
                          update("plannedChannel", event.target.value)
                        }
                      >
                        {channels.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Contact name / team">
                      <input
                        value={draft.contactName}
                        onChange={(event) =>
                          update("contactName", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Contact email">
                      <input
                        type="email"
                        value={draft.contactEmail}
                        onChange={(event) =>
                          update("contactEmail", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Company or contact page" wide>
                      <input
                        type="url"
                        placeholder="https://…"
                        value={draft.website}
                        onChange={(event) =>
                          update("website", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Market / geography" wide>
                      <textarea
                        rows={3}
                        value={draft.geography}
                        onChange={(event) =>
                          update("geography", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label="Stage"
                      hint="A manual record, not a connected mailbox status."
                    >
                      <select
                        value={draft.stage}
                        onChange={(event) =>
                          update("stage", event.target.value)
                        }
                      >
                        {stages.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label="Next follow-up date"
                      hint="No reminders or messages are scheduled."
                    >
                      <input
                        type="date"
                        value={draft.nextFollowUp}
                        onChange={(event) =>
                          update("nextFollowUp", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Next action" wide>
                      <textarea
                        rows={3}
                        value={draft.nextAction}
                        onChange={(event) =>
                          update("nextAction", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </>
              )}
              {tab === "sources" && (
                <>
                  <div className="section-note">
                    <h3>Keep the evidence with the prospect.</h3>
                    <p>
                      These are source-backed screening leads, not confirmed
                      buyers. Official source notes were prepared on 30 October
                      2026 and have not been automatically rechecked.
                    </p>
                  </div>
                  <div className="field-grid">
                    <Field label="Fit and caveats" wide>
                      <textarea
                        rows={5}
                        value={draft.fit}
                        onChange={(event) => update("fit", event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Source URLs"
                      hint="One URL per line. Only http/https links can be opened."
                      wide
                    >
                      <textarea
                        rows={4}
                        value={draft.sources.join("\n")}
                        onChange={(event) =>
                          update("sources", event.target.value.split("\n"))
                        }
                      />
                    </Field>
                  </div>
                  <div className="source-list">
                    {draft.sources.filter(Boolean).map((url, index) => (
                      <ExternalLink key={index} url={url} />
                    ))}
                  </div>
                  <div className="field-grid">
                    <Field
                      label="What the sources establish — and do not establish"
                      wide
                    >
                      <textarea
                        rows={7}
                        value={draft.sourceNotes}
                        onChange={(event) =>
                          update("sourceNotes", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label="Outreach review gate"
                      hint="Keep any legal/consent or classification gate visible until it is specifically resolved."
                      wide
                    >
                      <textarea
                        rows={4}
                        value={draft.complianceGate}
                        onChange={(event) =>
                          update("complianceGate", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </>
              )}
              {tab === "draft" && (
                <>
                  <div className="section-note">
                    <h3>A short, human introduction.</h3>
                    <p>
                      Call-first drafts, with no tonnage in the first approach.
                      Editing an approved draft resets its approval. Nothing
                      here sends an email.
                    </p>
                  </div>
                  <div className="field-grid">
                    <Field label="Subject" wide>
                      <input
                        value={draft.emailSubject}
                        onChange={(event) =>
                          update("emailSubject", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="First email" wide>
                      <textarea
                        className="email-editor"
                        rows={14}
                        value={draft.emailBody}
                        onChange={(event) =>
                          update("emailBody", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <div className="draft-actions">
                    <button
                      type="button"
                      className="button outline"
                      onClick={copyDraft}
                      disabled={!draft.emailBody}
                    >
                      Copy subject + email
                      <Icon name="mail" />
                    </button>
                    <span role="status">
                      {copyNotice || "Clipboard only. No email integration."}
                    </span>
                  </div>
                  <div className="field-grid">
                    <Field label="Optional follow-up draft" wide>
                      <textarea
                        rows={5}
                        value={draft.followUpDraft}
                        onChange={(event) =>
                          update("followUpDraft", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Approval status">
                      <select
                        value={draft.approval}
                        onChange={(event) =>
                          update("approval", event.target.value)
                        }
                      >
                        {approvals.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Approved by">
                      <input
                        value={draft.approvedBy}
                        onChange={(event) =>
                          update("approvedBy", event.target.value)
                        }
                        placeholder="Leave blank until actually approved"
                      />
                    </Field>
                    <Field label="Approval date">
                      <input
                        type="date"
                        value={draft.approvedAt}
                        onChange={(event) =>
                          update("approvedAt", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <p className="fine-print">
                    Recording an approval is not an instruction to send. This
                    application has no send capability.
                  </p>
                </>
              )}
              {tab === "activity" && (
                <>
                  <div className="section-note">
                    <h3>Record what actually happened.</h3>
                    <p>
                      These fields are manual. Leave unknown dates and sender
                      details blank. Saving a sent date does not send a message.
                    </p>
                  </div>
                  <div className="field-grid">
                    <Field label="Actual sender">
                      <input
                        type="email"
                        value={draft.sender}
                        onChange={(event) =>
                          update("sender", event.target.value)
                        }
                        placeholder="Sender address actually used"
                      />
                    </Field>
                    <Field label="Actual sent date">
                      <input
                        type="date"
                        value={draft.sentAt}
                        onChange={(event) =>
                          update("sentAt", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Reply received date">
                      <input
                        type="date"
                        value={draft.replyAt}
                        onChange={(event) =>
                          update("replyAt", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Stage">
                      <select
                        value={draft.stage}
                        onChange={(event) =>
                          update("stage", event.target.value)
                        }
                      >
                        {stages.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Reply / conversation summary" wide>
                      <textarea
                        rows={5}
                        value={draft.replySummary}
                        onChange={(event) =>
                          update("replySummary", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label="Thread URL"
                      hint="For your reference only. This app does not read or sync the thread."
                      wide
                    >
                      <input
                        type="url"
                        value={draft.threadUrl}
                        onChange={(event) =>
                          update("threadUrl", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Next follow-up date">
                      <input
                        type="date"
                        value={draft.nextFollowUp}
                        onChange={(event) =>
                          update("nextFollowUp", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Sample status">
                      <input
                        value={draft.sampleStatus}
                        onChange={(event) =>
                          update("sampleStatus", event.target.value)
                        }
                        placeholder="Leave blank if not discussed"
                      />
                    </Field>
                    <Field label="Buyer requirements" wide>
                      <textarea
                        rows={4}
                        value={draft.requirements}
                        onChange={(event) =>
                          update("requirements", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Next action" wide>
                      <textarea
                        rows={3}
                        value={draft.nextAction}
                        onChange={(event) =>
                          update("nextAction", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Internal notes" wide>
                      <textarea
                        rows={7}
                        value={draft.notes}
                        onChange={(event) =>
                          update("notes", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </>
              )}
              {recordError && (
                <p className="form-error" role="alert">
                  {recordError}
                </p>
              )}
            </div>
            <footer className="panel-footer">
              <div>
                <span className={dirty ? "unsaved" : "saved"}>
                  {dirty
                    ? "Unsaved changes"
                    : isNew
                      ? "New record — not saved"
                      : "Saved record · revision " + revision}
                </span>
                {!isNew && (
                  <button
                    type="button"
                    className="delete-button"
                    onClick={remove}
                    disabled={busy}
                  >
                    Delete record
                  </button>
                )}
              </div>
              <div>
                <button
                  type="button"
                  className="button subtle"
                  onClick={closeEditor}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="button dark" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save record"}
                  <Icon name="check" />
                </button>
              </div>
            </footer>
          </form>
        )}
      </dialog>

      <dialog ref={dataDialog} className="data-dialog">
        <button
          className="dialog-close"
          onClick={() => dataDialog.current?.close()}
          aria-label="Close workspace information"
        >
          <Icon name="close" />
        </button>
        <p className="eyebrow">DATA & ACCESS</p>
        <h2>
          A working record.
          <br />
          Not a sending tool.
        </h2>
        <p>
          Edits are stored in a JSON file on the application server, not in this
          browser. The server must have a persistent data volume. Clearing
          browser storage does not delete the records.
        </p>
        <div className="data-facts">
          <div>
            <strong>Protected access</strong>
            <p>
              Password authentication and server-side sessions. This preview has
              one shared administrator identity, not separate user accounts or
              permissions.
            </p>
          </div>
          <div>
            <strong>Persistent, with limits</strong>
            <p>
              Atomic file writes and revision checks protect normal editing in
              one Node process. Run one instance only. A JSON file is not an
              automatic backup or a multi-node database.
            </p>
          </div>
          <div>
            <strong>No automatic activity</strong>
            <p>
              No mailbox, calendar, reminders or sending service is connected.
              Sent dates, replies, approvals and follow-ups are recorded
              manually.
            </p>
          </div>
        </div>
        <div className="backup-actions">
          <button
            className="button dark"
            onClick={exportBackup}
            disabled={busy}
          >
            Download JSON backup
            <Icon name="download" />
          </button>
          <button
            className="button outline"
            onClick={() => {
              download(
                `green-shield-summary-${today()}.csv`,
                summaryCsv(records),
                "text/csv",
              );
              setNotice(
                "CSV summary downloaded. Use JSON for a complete backup.",
              );
            }}
          >
            Download CSV summary
          </button>
          <button
            className="text-button"
            onClick={() => importInput.current?.click()}
          >
            Import new records from a JSON backup
            <Icon name="arrow" />
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
            }}
          />
        </div>
        <p className="fine-print">
          Import adds new IDs only; it does not overwrite existing records. Keep
          backups private. Use HTTPS and secure cookies before exposing the
          preview beyond localhost.
        </p>
      </dialog>
    </div>
  );
}
