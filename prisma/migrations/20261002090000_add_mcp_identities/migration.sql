-- MCP identity V1. Producción: ejecutar exclusivamente mediante el runner controlado.
CREATE TABLE "mcp_identities" ("id" UUID NOT NULL, "provider" TEXT NOT NULL, "subject" TEXT NOT NULL, "app_user_id" UUID NOT NULL, "email_snapshot" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "mcp_identities_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "mcp_identities_provider_subject_key" ON "mcp_identities"("provider", "subject");
CREATE UNIQUE INDEX "mcp_identities_app_user_id_key" ON "mcp_identities"("app_user_id");
ALTER TABLE "mcp_identities" ADD CONSTRAINT "mcp_identities_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
