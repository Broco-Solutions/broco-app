# Acción requerida en Auth0 para auto-link MCP

## Causa

El recurso MCP valida correctamente el access token de Auth0, pero Broco sólo puede crear el primer vínculo `McpIdentity` si ese access token incluye un email verificado. En producción están configurados `BROCO_MCP_AUTH0_ISSUER`, `BROCO_MCP_RESOURCE_URL` y `BROCO_MCP_AUTH0_AUDIENCE`, pero no los nombres de claims de email/verificación. Con los defaults (`email`, `email_verified`), Auth0 no está entregando esos datos al resource server MCP.

## Cambio mínimo

Agregar una Action de Auth0 que copie el email y su verificación al access token de la API MCP como custom claims namespaced.

1. Ir a Auth0 Dashboard.
2. Abrir **Actions -> Library -> Build Custom**.
3. Nombre sugerido: `Broco MCP identity claims`.
4. Trigger: **Login / Post Login**.
5. Código conceptual:

```js
exports.onExecutePostLogin = async (event, api) => {
  const audience = event.resource_server?.identifier || event.request?.query?.audience;
  if (audience !== "https://app.brocosolutions.com/api/mcp") return;

  const namespace = "https://app.brocosolutions.com/claims/";
  if (event.user.email) {
    api.accessToken.setCustomClaim(`${namespace}email`, event.user.email);
  }
  api.accessToken.setCustomClaim(
    `${namespace}email_verified`,
    event.user.email_verified === true,
  );
};
```

6. Deployar la Action.
7. En **Actions -> Flows -> Login**, agregar la Action al flujo y aplicar cambios.
8. Configurar en Vercel Production:

```text
BROCO_MCP_AUTH0_EMAIL_CLAIM=https://app.brocosolutions.com/claims/email
BROCO_MCP_AUTH0_EMAIL_VERIFIED_CLAIM=https://app.brocosolutions.com/claims/email_verified
```

9. Redeployar producción para que Vercel aplique las variables.

## Validación

Con `BROCO_MCP_DIAGNOSTIC_LOGGING=true`, una llamada MCP autenticada debería registrar sólo banderas sanitizadas:

```text
oauth_subject_present=true
oauth_email_present=true
oauth_email_verified=true
auto_link_attempted=true
auto_link_result=created
```

No se deben registrar tokens, subjects completos ni emails completos.
