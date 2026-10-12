import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "@/auth/errors";
import {
  assertCanChangeUser,
  assertCanManageUsers,
  assertCanRegisterRole,
  assertCanViewIngestHistory,
  canRegisterRole,
  INGEST_HISTORY_ROLES,
  resolveScopedTenantId,
  USER_ADMIN_ROLES,
  type AuthContext,
} from "@/auth/rbac";
import { generateTemporaryPassword } from "@/auth/temporaryPassword";
import { isPendingLoad, loadStateFor } from "@/services/admin/loadStatus";

function forbiddenWith(reason?: string) {
  return (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 403);
    if (reason) {
      assert.equal(error.details?.reason, reason);
    }
    return true;
  };
}

const viewer: AuthContext = {
  userId: "u-viewer",
  email: "viewer@ejemplo.test",
  role: "CLIENT_VIEWER",
  tenantId: "t-a",
  cognitoSub: "sub-viewer",
  tokenUse: "access",
};

describe("administración de usuarios: quién entra", () => {
  it("quien solo consulta no puede listar usuarios", () => {
    assert.equal(USER_ADMIN_ROLES.includes("CLIENT_VIEWER"), false);
    assert.throws(() => assertCanManageUsers("CLIENT_VIEWER"), forbiddenWith());
  });

  it("quien solo consulta no puede ver el historial de cargas", () => {
    assert.equal(INGEST_HISTORY_ROLES.includes("CLIENT_VIEWER"), false);
    assert.throws(() => assertCanViewIngestHistory("CLIENT_VIEWER"), forbiddenWith());
  });

  it("administrador y socio sí administran usuarios y ven el historial", () => {
    for (const role of ["ADMIN", "CFO_PARTNER"] as const) {
      assert.doesNotThrow(() => assertCanManageUsers(role));
      assert.doesNotThrow(() => assertCanViewIngestHistory(role));
    }
  });

  it("quien solo consulta no puede pedir datos de otra empresa", () => {
    assert.throws(() => resolveScopedTenantId(viewer, "t-b"), forbiddenWith());
    assert.equal(resolveScopedTenantId(viewer, "t-a"), "t-a");
  });

  it("un socio puede abrir la empresa que eligió", () => {
    assert.equal(resolveScopedTenantId({ ...viewer, role: "CFO_PARTNER" }, "t-b"), "t-b");
  });
});

describe("altas", () => {
  it("un socio no puede crear un administrador", () => {
    assert.equal(canRegisterRole("CFO_PARTNER", "ADMIN"), false);
    assert.throws(() => assertCanRegisterRole("CFO_PARTNER", "ADMIN"), forbiddenWith("ROLE_NOT_ALLOWED"));
  });

  it("solo un administrador crea administradores", () => {
    assert.equal(canRegisterRole("ADMIN", "ADMIN"), true);
  });

  it("quien solo consulta no crea a nadie", () => {
    for (const role of ["ADMIN", "CFO_PARTNER", "CLIENT_VIEWER"] as const) {
      assert.equal(canRegisterRole("CLIENT_VIEWER", role), false);
    }
  });
});

describe("cambios de acceso y de rol", () => {
  const admin = { userId: "u-admin", role: "ADMIN" as const };
  const partner = { userId: "u-partner", role: "CFO_PARTNER" as const };

  it("nadie puede quitarse el acceso a sí mismo", () => {
    for (const actor of [admin, partner]) {
      assert.throws(
        () => assertCanChangeUser(actor, { id: actor.userId, role: actor.role }, { isActive: false }),
        forbiddenWith("SELF_CHANGE"),
      );
    }
  });

  it("nadie puede cambiarse su propio rol", () => {
    assert.throws(
      () => assertCanChangeUser(partner, { id: partner.userId, role: "CFO_PARTNER" }, { role: "ADMIN" }),
      forbiddenWith("SELF_CHANGE"),
    );
    assert.throws(
      () => assertCanChangeUser(admin, { id: admin.userId, role: "ADMIN" }, { role: "CLIENT_VIEWER" }),
      forbiddenWith("SELF_CHANGE"),
    );
  });

  it("un socio no puede subir a nadie a administrador", () => {
    assert.throws(
      () => assertCanChangeUser(partner, { id: "u-x", role: "CLIENT_VIEWER" }, { role: "ADMIN" }),
      forbiddenWith("ROLE_NOT_ALLOWED"),
    );
  });

  it("un socio no puede quitarle el acceso a un administrador", () => {
    assert.throws(
      () => assertCanChangeUser(partner, { id: "u-admin2", role: "ADMIN" }, { isActive: false }),
      forbiddenWith("TARGET_ABOVE"),
    );
  });

  it("un socio sí puede apagar a quien solo consulta y cambiarle el rol a socio", () => {
    const target = { id: "u-x", role: "CLIENT_VIEWER" as const };
    assert.doesNotThrow(() => assertCanChangeUser(partner, target, { isActive: false }));
    assert.doesNotThrow(() => assertCanChangeUser(partner, target, { role: "CFO_PARTNER" }));
  });

  it("un administrador puede administrar a otro administrador", () => {
    assert.doesNotThrow(() =>
      assertCanChangeUser(admin, { id: "u-admin2", role: "ADMIN" }, { role: "CFO_PARTNER" }),
    );
  });
});

describe("contraseña temporal", () => {
  it("cumple la política por defecto de Cognito y no se repite", () => {
    const first = generateTemporaryPassword();
    assert.equal(first.length, 16);
    assert.match(first, /[A-Z]/);
    assert.match(first, /[a-z]/);
    assert.match(first, /[0-9]/);
    assert.match(first, /[^A-Za-z0-9]/);
    assert.notEqual(first, generateTemporaryPassword());
  });
});

describe("Control de cargas", () => {
  it("solo COMMITTED cuenta como guardado", () => {
    assert.equal(loadStateFor("COMMITTED"), "SAVED");
    assert.equal(loadStateFor("DETECTED"), "REVIEWED_ONLY");
    assert.equal(loadStateFor("VALIDATED"), "INTERRUPTED");
    assert.equal(loadStateFor("REJECTED"), "REJECTED");
  });

  it("un archivo solo revisado queda pendiente salvo que se haya guardado en otra carga", () => {
    assert.equal(isPendingLoad("REVIEWED_ONLY", false), true);
    assert.equal(isPendingLoad("REVIEWED_ONLY", true), false);
    assert.equal(isPendingLoad("SAVED", false), false);
  });
});
