import { guard, response, store } from "@/lib/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return response({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records: store().list().records,
  });
}
