# Identidad MCP

`mcp_identities` vincula `provider` (issuer OAuth normalizado) + `subject` (claim `sub`) con un único `AppUser`. La pareja externa y `app_user_id` son únicas para impedir asociaciones ambiguas.

En cada llamada se vuelve a leer el `AppUser`: si no existe o está inactivo se niega acceso; el rol no se persiste en `McpIdentity`. La primera llamada puede crear el vínculo sólo si el token aporta email marcado como verificado y coincide exactamente con un único `AppUser` activo. El email queda sólo como snapshot; después el subject es la identidad primaria.

`sessionVersion` no se replica: esa versión revoca sesiones humanas; MCP revalida directamente actividad y rol en cada request.
