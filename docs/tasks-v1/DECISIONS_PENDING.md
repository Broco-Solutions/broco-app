# Tareas Operativas V1 — decisiones pendientes

## Identidad MCP y permisos de aplicación

El MCP actual autentica con OAuth, allowlist y scopes, pero no mapea de forma confiable la identidad autenticada a un `AppUser` activo ni a su rol y asignaciones actuales.

Antes de exponer tareas o tiempos operativos a colaboradores por MCP se necesita decidir una de estas políticas:

1. mapear de forma obligatoria el correo verificado del token a `AppUser.email`; o
2. mantener las herramientas operativas MCP como una capacidad exclusivamente administrativa.

Hasta resolverlo, no se expondrán datos ni mutaciones operativas que puedan eludir el scope de la aplicación.
