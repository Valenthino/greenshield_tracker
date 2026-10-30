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
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  const denied = guard(request) || originGuard(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const input = await body(request);
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new Error("A valid record revision is required. Reload the list.");
    return response(store().update(id, input.record, input.expectedRevision));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  const denied = guard(request) || originGuard(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const input = await body(request);
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new Error("A valid record revision is required.");
    store().remove(id, input.expectedRevision);
    return response({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
