import {
  body,
  errorResponse,
  guard,
  originGuard,
  response,
  store,
} from "@/lib/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const denied = guard(request) || originGuard(request);
  if (denied) return denied;
  try {
    return response(store().importNew(await body(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
