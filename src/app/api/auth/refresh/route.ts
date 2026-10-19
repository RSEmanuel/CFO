import { toErrorResponse, jsonSuccess } from "@/auth/http";
import { refreshSchema } from "@/auth/schemas";
import { refreshSession } from "@/auth/service";
import { NextRequest } from "next/server";

/** El access token vencido llega en Authorization (opcional): de ahí sale el username del SECRET_HASH. */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const { refreshToken } = refreshSchema.parse(body);
    const header = request.headers.get("authorization");
    const previousAccessToken = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    const data = await refreshSession(refreshToken, previousAccessToken);
    return jsonSuccess(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
