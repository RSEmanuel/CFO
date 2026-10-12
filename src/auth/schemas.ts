import { z } from "zod";
import { UserRole } from "@/generated/prisma/enums";

export const loginSchema = z.object({
  email: z.string().email("El correo no es válido."),
  password: z.string().min(1, "La contraseña es obligatoria."),
});

export const registerUserSchema = z.object({
  email: z.string().trim().email("El correo no es válido."),
  // Opcional: si no llega, el servidor genera una temporal y la devuelve una sola vez.
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(256, "La contraseña es demasiado larga.")
    .optional(),
  role: z.enum(UserRole),
  tenantId: z.string().min(1, "El tenantId es obligatorio."),
});

export const createTenantSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres.")
    .max(120, "El nombre es demasiado largo."),
  rfc: z
    .string()
    .trim()
    .min(8, "El RFC debe tener al menos 8 caracteres.")
    .max(20, "El RFC es demasiado largo.")
    .regex(/^[A-Za-z0-9]+$/, "El RFC solo admite letras y números."),
});

export const tenantQuerySchema = z.object({
  tenantId: z.string().min(1, "El tenantId es obligatorio."),
});

export const changeUserSchema = z
  .object({
    tenantId: z.string().min(1, "El tenantId es obligatorio."),
    userId: z.string().min(1, "El userId es obligatorio."),
    isActive: z.boolean().optional(),
    role: z.enum(UserRole).optional(),
  })
  .refine((value) => value.isActive !== undefined || value.role !== undefined, {
    message: "Indica si cambias el acceso o el rol.",
  });
