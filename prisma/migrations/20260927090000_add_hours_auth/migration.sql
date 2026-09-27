-- Horas v1: aplicar únicamente en la base local/test o mediante un runner
-- controlado con pre-checks en producción. No contiene credenciales.
CREATE TYPE "AppUserRole" AS ENUM ('ADMIN', 'COLLABORATOR');
CREATE TABLE "app_users" ("id" UUID NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL, "password_hash" TEXT NOT NULL, "role" "AppUserRole" NOT NULL DEFAULT 'COLLABORATOR', "is_active" BOOLEAN NOT NULL DEFAULT false, "session_version" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "app_users_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");
CREATE INDEX "app_users_role_is_active_idx" ON "app_users"("role", "is_active");
CREATE TABLE "access_tokens" ("id" UUID NOT NULL, "user_id" UUID NOT NULL, "token_hash" TEXT NOT NULL, "purpose" TEXT NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL, "used_at" TIMESTAMP(3), "revoked_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "access_tokens_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "access_tokens_token_hash_key" ON "access_tokens"("token_hash");
CREATE INDEX "access_tokens_user_id_purpose_expires_at_idx" ON "access_tokens"("user_id", "purpose", "expires_at");
CREATE TABLE "hour_assignments" ("id" UUID NOT NULL, "user_id" UUID NOT NULL, "project_id" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "hour_assignments_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "hour_assignments_user_id_project_id_key" ON "hour_assignments"("user_id", "project_id");
CREATE INDEX "hour_assignments_project_id_idx" ON "hour_assignments"("project_id");
CREATE TABLE "time_entries" ("id" UUID NOT NULL, "user_id" UUID NOT NULL, "project_id" UUID NOT NULL, "work_date" DATE NOT NULL, "minutes" INTEGER NOT NULL, "description" TEXT NOT NULL, "reference_url" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "created_by_id" UUID NOT NULL, "modified_by_id" UUID, "void_reason" TEXT, "idempotency_key" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id"));
CREATE TABLE "time_entry_audits" ("id" UUID NOT NULL, "entry_id" UUID NOT NULL, "actor_id" UUID NOT NULL, "action" TEXT NOT NULL, "reason" TEXT, "before_json" JSONB, "after_json" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "time_entry_audits_pkey" PRIMARY KEY ("id"));
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hour_assignments" ADD CONSTRAINT "hour_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hour_assignments" ADD CONSTRAINT "hour_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_modified_by_id_fkey" FOREIGN KEY ("modified_by_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "time_entry_audits" ADD CONSTRAINT "time_entry_audits_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_entry_audits" ADD CONSTRAINT "time_entry_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "time_entries_user_id_work_date_status_idx" ON "time_entries"("user_id", "work_date", "status");
CREATE INDEX "time_entries_project_id_work_date_status_idx" ON "time_entries"("project_id", "work_date", "status");
CREATE UNIQUE INDEX "time_entries_idempotency_key_key" ON "time_entries"("idempotency_key");
CREATE INDEX "time_entry_audits_entry_id_created_at_idx" ON "time_entry_audits"("entry_id", "created_at");
