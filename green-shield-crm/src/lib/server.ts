import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { createStore } from "./database.js";
import { parseBackup } from "./records.js";
import seed from "@/data/seed.json";

type Store = ReturnType<typeof createStore>;
const globalStore = globalThis as typeof globalThis & {
  greenShieldStore?: Store;
};
export function store() {
  return (globalStore.greenShieldStore ??= createStore(
    resolve(/* turbopackIgnore: true */ process.env.CRM_DATABASE_PATH || "data/crm.json"),
    parseBackup(seed),
  ));
}
export const cookieName = "gs_crm_session";
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function configured() {
  return Boolean(
    process.env.CRM_PASSWORD_HASH?.match(/^[a-f0-9]{32}:[a-f0-9]{128}$/),
  );
}
export function response(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function sessionToken(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1) || ""
  );
}
const authVersion = () => hashToken(process.env.CRM_PASSWORD_HASH || "");
export function authenticated(request: Request) {
  if (!configured()) return false;
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  return store().hasSession(hashToken(token), authVersion(), Date.now());
}
export function guard(request: Request) {
  if (!configured())
    return response(
      {
        error:
          "Setup is required. Run npm run setup on the server, then restart it.",
      },
      503,
    );
  if (!authenticated(request))
    return response({ error: "Sign in to access this workspace." }, 401);
  return null;
}
export function originGuard(request: Request) {
  const expected = process.env.CRM_PUBLIC_ORIGIN || new URL(request.url).origin;
  if (request.headers.get("origin") !== expected)
    return response(
      { error: "Request origin did not match this workspace." },
      403,
    );
  return null;
}
export async function body(request: Request) {
  const max = 4 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > max)
    throw new Error("Request is too large. Use a JSON backup under 4 MB.");
  if (!request.body) throw new Error("A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error("Request is too large. Use a JSON backup under 4 MB.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function login(password: unknown) {
  if (typeof password !== "string" || password.length > 256) return null;
  const now = Date.now();
  if (!store().loginAttempt(now)) throw new Error("RATE_LIMIT");
  const [salt, expected] = process.env.CRM_PASSWORD_HASH!.split(":");
  const actual = scryptSync(password, salt, 64);
  if (!timingSafeEqual(actual, Buffer.from(expected, "hex"))) return null;
  const token = randomBytes(32).toString("hex");
  store().addSession(hashToken(token), authVersion(), now);
  return token;
}
export function revoke(request: Request) {
  const token = sessionToken(request);
  if (token) store().removeSession(hashToken(token));
}
export function setSession(result: NextResponse, token: string) {
  result.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.CRM_COOKIE_SECURE === "true",
    path: "/",
    maxAge: token ? 12 * 60 * 60 : 0,
  });
  return result;
}
export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";
  if (message === "CONFLICT")
    return response(
      {
        error:
          "This record changed or was removed since you opened it. Reload the list before saving so you do not overwrite another edit.",
      },
      409,
    );
  if (message.includes("UNIQUE constraint"))
    return response({ error: "A record with this ID already exists." }, 409);
  return response({ error: message }, 400);
}
