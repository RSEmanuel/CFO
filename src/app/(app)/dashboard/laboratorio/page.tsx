import { LaboratorioPage } from "@/components/laboratorio/LaboratorioPage";
import { LaboratorioShell } from "@/components/laboratorio/LaboratorioShell";

export default function LaboratorioRoute() {
  return (
    <LaboratorioShell>
      <LaboratorioPage />
    </LaboratorioShell>
  );
}
