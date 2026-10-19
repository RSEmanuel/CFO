"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Las personas con acceso ahora se administran por cliente, en Clientes. */
export default function UsuariosRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/clientes");
  }, [router]);
  return null;
}
