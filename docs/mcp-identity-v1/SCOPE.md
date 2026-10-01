# MCP Identity V1

OAuth autentica una identidad externa; no autoriza datos de Broco. Cada tool resuelve un `AppUser` activo y consulta su rol actual antes de ejecutar reglas de dominio existentes.

Incluye identidad persistente `McpIdentity`, autorización de todas las tools existentes, Tareas Operativas y Tiempos. No cambia `ProjectTask`, no agrega acceso MCP a finanzas para colaboradores y no modifica OAuth, scopes ni permisos humanos.
