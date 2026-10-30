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
export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return response(store().list());
}
export async function POST(request: Request) {
  const denied = guard(request) || originGuard(request);
  if (denied) return denied;
  try {
    const input = await body(request);
    if (
      typeof input.requestId !== "string" ||
      !/^GS-[a-f0-9-]{36}$/.test(input.requestId)
    )
      throw new Error("A valid create request ID is required.");
    return response(
      store().create({ ...input.record, id: input.requestId }),
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
