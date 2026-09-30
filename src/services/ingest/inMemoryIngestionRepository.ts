import type { IngestionRepository } from "@/services/ingest/ingestionRepository";
import type { MasterWorkbook } from "@/services/ingestionTypes";

export class InMemoryIngestionRepository implements IngestionRepository {
  readonly balances = new Map<string, MasterWorkbook["balanza"]>();
  readonly preserved = { ventas: ["venta"], egresos: ["egreso"], tesoreria: ["flujo"] };
  failAfterDelete = false;

  async replaceBalance(tenantId: string, periodo: number, anio: number, workbook: MasterWorkbook): Promise<void> {
    const snapshot = new Map(this.balances);
    const key = `${tenantId}:${anio}:${periodo}`;
    try {
      this.balances.delete(key);
      if (this.failAfterDelete) throw new Error("Fallo simulado");
      this.balances.set(key, structuredClone(workbook.balanza));
    } catch (error) {
      this.balances.clear();
      for (const [snapshotKey, rows] of snapshot) this.balances.set(snapshotKey, rows);
      throw error;
    }
  }
}
