-- Tareas Operativas V1. Producción: ejecutar exclusivamente mediante el runner controlado.
CREATE TYPE "OperationalTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'DONE');
CREATE TABLE "operational_tasks" ("id" UUID NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "status" "OperationalTaskStatus" NOT NULL DEFAULT 'PENDING', "creator_id" UUID NOT NULL, "assignee_id" UUID NOT NULL, "project_id" UUID, "due_date" DATE, "blocked_reason" TEXT, "completed_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "operational_tasks_pkey" PRIMARY KEY ("id"));
CREATE INDEX "operational_tasks_assignee_id_status_due_date_idx" ON "operational_tasks"("assignee_id", "status", "due_date");
CREATE INDEX "operational_tasks_project_id_status_idx" ON "operational_tasks"("project_id", "status");
CREATE INDEX "operational_tasks_status_due_date_idx" ON "operational_tasks"("status", "due_date");
CREATE INDEX "operational_tasks_updated_at_idx" ON "operational_tasks"("updated_at");
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
