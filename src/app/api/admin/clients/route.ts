import { jsonSuccess } from "@/auth/http";
import { USER_ADMIN_ROLES } from "@/auth/rbac";
import { withAuth } from "@/middleware/auth";
import { listClients } from "@/services/admin/clientDesk";

export const GET = withAuth(async () => jsonSuccess(await listClients()), { roles: USER_ADMIN_ROLES });
