import { jsonSuccess } from "@/auth/http";
import { getMeByCognitoSub } from "@/auth/service";
import { withAuth } from "@/middleware/auth";

export const GET = withAuth(async (_request, auth) => {
  const me = await getMeByCognitoSub(auth.cognitoSub);
  return jsonSuccess(me);
});
