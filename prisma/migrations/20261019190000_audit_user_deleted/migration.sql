-- Borrado de usuarios desde Clientes: queda en la bitácora de administración.
ALTER TYPE "AdminAuditAction" ADD VALUE 'USER_DELETED';
