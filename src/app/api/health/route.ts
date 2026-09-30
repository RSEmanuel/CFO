import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      servicio: "CFO Virtual",
      baseDeDatos: "conectada",
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        servicio: "CFO Virtual",
        baseDeDatos: "sin conexión",
      },
      { status: 503 },
    );
  }
}
