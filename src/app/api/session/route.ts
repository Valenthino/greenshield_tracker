import {
  authenticated,
  body,
  configured,
  login,
  originGuard,
  response,
  revoke,
  setSession,
} from "@/lib/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return response({
    configured: configured(),
    authenticated: authenticated(request),
  });
}
export async function POST(request: Request) {
  const denied = originGuard(request);
  if (denied) return denied;
  if (!configured())
    return response(
      { error: "Setup is required. Run npm run setup and restart the server." },
      503,
    );
  try {
    const input = await body(request);
    const token = login(input.password);
    if (!token)
      return response({ error: "The password was not accepted." }, 401);
    return setSession(response({ authenticated: true }), token);
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMIT")
      return response(
        { error: "Too many attempts. Try again in 15 minutes." },
        429,
      );
    return response({ error: "Unable to sign in." }, 400);
  }
}
export async function DELETE(request: Request) {
  const denied = originGuard(request);
  if (denied) return denied;
  revoke(request);
  return setSession(response({ authenticated: false }), "");
}
