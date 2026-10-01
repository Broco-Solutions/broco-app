-- Vincula Tareas Operativas con los registros reales de Tiempos.
ALTER TABLE "time_entries" ADD COLUMN "operational_task_id" UUID;
CREATE INDEX "time_entries_operational_task_id_status_idx" ON "time_entries"("operational_task_id", "status");
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_operational_task_id_fkey" FOREIGN KEY ("operational_task_id") REFERENCES "operational_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
