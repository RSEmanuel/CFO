import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createT } from "@/i18n/translate";
import { mergeActivity, type LoadActivity, type UserActivity } from "./activityFeed";
import { describeActivity } from "./activitySentence";

const NOW = new Date("2026-11-04T12:00:00");

const roleChange: UserActivity = {
  kind: "user",
  id: "u1",
  at: "2026-11-03T15:00:00.000Z",
  action: "ROLE_CHANGED",
  actor: "persona-a@ejemplo.com",
  target: "persona-b@ejemplo.com",
  fromRole: "CLIENT_VIEWER",
  toRole: "CFO_PARTNER",
};

const rejected: LoadActivity = {
  kind: "load",
  id: "f1",
  at: "2026-11-02T15:00:00.000Z",
  actor: "persona-a@ejemplo.com",
  fileName: "balanza-ejemplo.xlsx",
  periodo: 10,
  anio: 2026,
  state: "REJECTED",
};

describe("Qué pasó", () => {
  it("junta personas y cargas, la más reciente arriba, y corta en el límite", () => {
    const later: LoadActivity = { ...rejected, id: "f2", at: "2026-11-04T09:00:00.000Z", state: "SAVED" };
    const view = mergeActivity([roleChange], [rejected, later], 2);
    assert.deepEqual(view.items.map((item) => item.id), ["f2", "u1"]);
    assert.equal(view.truncated, true);
  });

  it("lee un cambio de perfil en una frase, sin códigos internos", () => {
    const es = describeActivity(roleChange, createT("es"), "es", NOW);
    assert.equal(es, "persona-a@ejemplo.com cambió a persona-b@ejemplo.com de cliente a socio el 3 de noviembre.");
    assert.doesNotMatch(es, /CFO_PARTNER|CLIENT_VIEWER|ROLE_CHANGED/);
    const en = describeActivity(roleChange, createT("en"), "en", NOW);
    assert.equal(en, "persona-a@ejemplo.com changed persona-b@ejemplo.com from client to partner on November 3.");
  });

  it("dice archivo, periodo y si se aceptó o se rechazó", () => {
    assert.equal(
      describeActivity(rejected, createT("es"), "es", NOW),
      "persona-a@ejemplo.com subió balanza-ejemplo.xlsx (octubre de 2026) el 2 de noviembre y se rechazó.",
    );
    const noPeriod = describeActivity({ ...rejected, periodo: null, state: "SAVED" }, createT("es"), "es", NOW);
    assert.match(noPeriod, /\(sin periodo\).*y se aceptó\.$/);
  });

  it("nunca muestra el nombre de un proceso interno como autor", () => {
    const sentence = describeActivity({ ...roleChange, action: "USER_CREATED", actor: "script:alta-inicial" }, createT("es"), "es", NOW);
    assert.match(sentence, /^Cifra dio de alta a persona-b@ejemplo.com como socio el 3 de noviembre\.$/);
  });

  it("agrega el año cuando el movimiento es de otro año", () => {
    const old = describeActivity({ ...roleChange, at: "2025-03-10T15:00:00.000Z" }, createT("es"), "es", NOW);
    assert.match(old, /el 10 de marzo de 2025\.$/);
  });
});
