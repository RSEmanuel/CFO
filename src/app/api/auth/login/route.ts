import { toErrorResponse, jsonSuccess } from "@/auth/http";
import { loginSchema } from "@/auth/schemas";
import { loginWithPassword } from "@/auth/service";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const { email, password } = loginSchema.parse(body);
    const data = await loginWithPassword(email, password);
    return jsonSuccess(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
