-- Sustituye el proyecto interno sintético de la migración histórica por el
-- proyecto operativo real existente de Broco Solutions, preservando sus datos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "projects" p
    JOIN "clients" c ON c."id" = p."client_id"
    WHERE p."id" = '1a93bb2a-d7c6-479b-9800-563fba75480b'
      AND p."name" = 'Operación interna'
      AND p."is_active" = true
      AND c."id" = 'f2630e5f-62f6-4dd5-8502-4a778330b855'
      AND c."name" = 'Broco Solutions'
  ) THEN
    RAISE EXCEPTION 'No se encontró el proyecto interno canónico esperado de Broco Solutions.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "projects"
    WHERE "is_active" = true
      AND "is_internal" = true
      AND "id" NOT IN ('1a93bb2a-d7c6-479b-9800-563fba75480b', '00000000-0000-0000-0000-000000000102')
  ) THEN
    RAISE EXCEPTION 'Existe otro proyecto interno activo; no se puede elegir uno arbitrariamente.';
  END IF;

  IF EXISTS (SELECT 1 FROM "project_share_links" WHERE "project_id" = '1a93bb2a-d7c6-479b-9800-563fba75480b')
     AND EXISTS (SELECT 1 FROM "project_share_links" WHERE "project_id" = '00000000-0000-0000-0000-000000000102') THEN
    RAISE EXCEPTION 'Ambos proyectos internos tienen portal público; requiere resolución manual para preservar ambos enlaces.';
  END IF;
END $$;

-- Conserva el acceso de cada colaborador al proyecto interno real sin duplicar
-- la combinación única usuario/proyecto.
INSERT INTO "user_project_access" ("id", "user_id", "project_id", "created_at")
SELECT md5(access."user_id"::text || '1a93bb2a-d7c6-479b-9800-563fba75480b')::uuid,
       access."user_id",
       '1a93bb2a-d7c6-479b-9800-563fba75480b',
       access."created_at"
FROM "user_project_access" access
WHERE access."project_id" = '00000000-0000-0000-0000-000000000102'
ON CONFLICT ("user_id", "project_id") DO NOTHING;

UPDATE "time_entries"
SET "project_id" = '1a93bb2a-d7c6-479b-9800-563fba75480b'
WHERE "project_id" = '00000000-0000-0000-0000-000000000102';

UPDATE "operational_tasks"
SET "project_id" = '1a93bb2a-d7c6-479b-9800-563fba75480b'
WHERE "project_id" = '00000000-0000-0000-0000-000000000102';

UPDATE "incomes"
SET "project_id" = '1a93bb2a-d7c6-479b-9800-563fba75480b',
    "client_id" = 'f2630e5f-62f6-4dd5-8502-4a778330b855'
WHERE "project_id" = '00000000-0000-0000-0000-000000000102';

UPDATE "incomes"
SET "client_id" = 'f2630e5f-62f6-4dd5-8502-4a778330b855'
WHERE "client_id" = '00000000-0000-0000-0000-000000000101';

UPDATE "expenses"
SET "project_id" = '1a93bb2a-d7c6-479b-9800-563fba75480b'
WHERE "project_id" = '00000000-0000-0000-0000-000000000102';

UPDATE "project_tasks"
SET "project_id" = '1a93bb2a-d7c6-479b-9800-563fba75480b'
WHERE "project_id" = '00000000-0000-0000-0000-000000000102';

UPDATE "project_phases"
SET "project_id" = '1a93bb2a-d7c6-479b-9800-563fba75480b'
WHERE "project_id" = '00000000-0000-0000-0000-000000000102';

UPDATE "project_share_links"
SET "project_id" = '1a93bb2a-d7c6-479b-9800-563fba75480b'
WHERE "project_id" = '00000000-0000-0000-0000-000000000102';

UPDATE "projects"
SET "is_internal" = true
WHERE "id" = '1a93bb2a-d7c6-479b-9800-563fba75480b';

DELETE FROM "user_project_access"
WHERE "project_id" = '00000000-0000-0000-0000-000000000102';

DELETE FROM "projects"
WHERE "id" = '00000000-0000-0000-0000-000000000102';

DELETE FROM "clients"
WHERE "id" = '00000000-0000-0000-0000-000000000101'
  AND NOT EXISTS (SELECT 1 FROM "projects" WHERE "client_id" = '00000000-0000-0000-0000-000000000101')
  AND NOT EXISTS (SELECT 1 FROM "incomes" WHERE "client_id" = '00000000-0000-0000-0000-000000000101');

CREATE UNIQUE INDEX IF NOT EXISTS "projects_one_active_internal_project_key"
ON "projects" (("is_internal"))
WHERE "is_internal" = true AND "is_active" = true;
