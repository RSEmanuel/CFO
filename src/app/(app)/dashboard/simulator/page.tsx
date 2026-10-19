import { notFound } from "next/navigation";

// Módulo oculto: el código de components/simulator sigue en el repo, sin uso. Para reactivarlo,
// devuelve <SimulatorPage /> aquí y vuelve a agregar la entrada en PRIMARY_NAV (src/lib/nav.ts).
export default function SimulatorRoute() {
  notFound();
}
