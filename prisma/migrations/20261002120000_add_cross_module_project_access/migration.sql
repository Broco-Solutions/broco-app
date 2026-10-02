-- El acceso a proyectos es transversal a Tiempos y Tareas Operativas.
-- Renombramos la tabla existente para conservar todas las asignaciones actuales.
ALTER TABLE "hour_assignments" RENAME TO "user_project_access";
ALTER TABLE "user_project_access" RENAME CONSTRAINT "hour_assignments_pkey" TO "user_project_access_pkey";
ALTER INDEX "hour_assignments_user_id_project_id_key" RENAME TO "user_project_access_user_id_project_id_key";
ALTER INDEX "hour_assignments_project_id_idx" RENAME TO "user_project_access_project_id_idx";
ALTER TABLE "user_project_access" RENAME CONSTRAINT "hour_assignments_user_id_fkey" TO "user_project_access_user_id_fkey";
ALTER TABLE "user_project_access" RENAME CONSTRAINT "hour_assignments_project_id_fkey" TO "user_project_access_project_id_fkey";

ALTER TABLE "projects" ADD COLUMN "is_internal" BOOLEAN NOT NULL DEFAULT false;

-- Proyecto disponible para imputar trabajo interno. Los IDs fijos hacen que el
-- dato sea reconocible y evitan duplicados entre instalaciones.
INSERT INTO "clients" ("id", "name", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000101', 'Interno', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "projects" ("id", "client_id", "name", "is_active", "is_internal", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000101', 'Imputación interna', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET "is_internal" = true, "is_active" = true;

-- Quienes ya podían cargar horas conservan sus permisos y reciben además el
-- proyecto interno para imputaciones generales.
INSERT INTO "user_project_access" ("id", "user_id", "project_id", "created_at")
SELECT md5(u."id"::text || '00000000-0000-0000-0000-000000000102')::uuid,
       u."id",
       '00000000-0000-0000-0000-000000000102',
       CURRENT_TIMESTAMP
FROM "app_users" u
WHERE u."role" = 'COLLABORATOR'
ON CONFLICT ("user_id", "project_id") DO NOTHING;
