# MCP privado en Vercel con Auth0

> Estado: **Fase 1 implementada localmente, desactivada por defecto y sin desplegar**. La investigación confirmó que Vercel no debe actuar como Authorization Server. Vercel alojará el resource server MCP y podrá aplicar Firewall/rate limiting; Auth0 será el Authorization Server administrado.
>
> No se creó un tenant, cliente, usuario, secreto, variable de Vercel ni regla de Firewall durante esta implementación. El login existente de Broco App sigue siendo independiente.

## 1. Veredicto sobre Vercel como Authorization Server

| Requisito | Veredicto |
|---|---|
| OAuth 2.1 Authorization Code + PKCE como ChatGPT los requiere | ❌ Parcial — existe PKCE (S256), pero ligado a "Sign in with Vercel", que es un login de cuenta Vercel hacia **tu app**, no un AS general para un cliente tercero (ChatGPT). |
| Discovery RFC 8414 / OIDC (`/.well-known/oauth-authorization-server`) | ❌ No documentado para "Sign in with Vercel". El well-known de Vercel (`oidc.vercel.com`) es para **identidad de workload/proyecto** (CI/CD), no para login interactivo de ChatGPT. |
| Registro de cliente CIMD o DCR (lo usa ChatGPT) | ❌ "Sign in with Vercel" exige crear manualmente un "App" en el dashboard de Vercel; no expone CIMD ni DCR. |
| Scopes mínimos propios (ej. `mcp:read`) | ❌ Scopes fijos: `openid`, `email`, `profile`, `offline_access`. No hay scopes de recurso personalizados. |
| `resource` / audience (RFC 8707) ligado a nuestro MCP | ❌ "Sign in with Vercel" no admite `resource`. Vercel OIDC sí admite `aud` custom, pero son tokens de workload, no de un cliente ChatGPT. |
| Redirect URI de ChatGPT (`https://chatgpt.com/connector/oauth/{callback_id}`) | ❌ No verificable. Los callbacks registrables son el origen de tu app o un proyecto Vercel; no hay evidencia de que se permitan dominios terceros como `chatgpt.com`. |
| Token emitido **para** nuestro servidor MCP (aud = recurso) | ❌ Los access tokens de Vercel (`vca_…`) están pensados para la REST API de Vercel; no para nuestro resource server. |

**Conclusión histórica que determinó la arquitectura:** ninguno de los dos mecanismos de Vercel satisface el flujo completo que ChatGPT ejecuta contra un MCP remoto privado:

1. **Sign in with Vercel** = OAuth/OIDC para que personas con cuenta Vercel entren a **tu aplicación**. PKCE sí; discovery RFC 8414, scopes custom, `resource`, CIMD/DCR y redirects terceros, no (o no documentados).
2. **Vercel OIDC** (`oidc.vercel.com`) = identidad de **workload/proyecto** para trust server-side (AWS STS, etc.). Tiene well-known + JWKS + `aud` custom, pero emite tokens para identificar a *un proyecto Vercel*, no es un authorization server interactivo al que ChatGPT pueda conectarse con authorization-code + PKCE.

## 2. Evidencia por requisito

### 2.1 Requisitos de ChatGPT para un MCP remoto (fuente: OpenAI)
- El MCP server es el **resource server** (OAuth 2.1) y debe publicar **RFC 9728 Protected Resource Metadata** (`/.well-known/oauth-protected-resource` o header `WWW-Authenticate` con `resource_metadata`).
- Debe existir un **authorization server** con discovery **RFC 8414** u OIDC.
- ChatGPT actúa como **cliente OAuth**: authorization-code + **PKCE (S256)**, con **CIMD** (preferido, `none` o `private_key_jwt`) o **DCR**.
- Debe **reflejar `resource` (RFC 8707)** en authorize y token, y el AS debe copiarlo al `aud` del token.
- Con identificación de issuer, CIMD estable en `https://chatgpt.com/oauth/client.json` y redirect estable `https://chatgpt.com/connector_platform_oauth_redirect`; en otros flujos se debe usar el callback específico que muestre ChatGPT.
- El server MCP valida `iss`, `aud`, `exp` y scopes en **cada** request.
- Codex CLI admite además `bearer_token_env_var` + headers estáticos (solo para uso controlado).

### 2.2 Lo que Vercel ofrece
- **Sign in with Vercel**: `authorize` en `vercel.com/oauth/authorize`, token en `api.vercel.com/login/oauth/token`, PKCE `S256`, scopes fijos, callback `{origin}/api/auth/callback`. Es un IdP para loguear usuarios Vercel en tu app.
- **Vercel OIDC**: `https://oidc.vercel.com[/TEAM_SLUG]/.well-known/openid-configuration` y `/.well-known/jwks`; claims `sub=owner:[team]:project:[proj]:environment:[env]`, `aud=https://vercel.com/[team]` (o `aud` custom vía exchange). Emitidos a funciones Vercel, no a clientes OAuth externos.

### 2.3 Gaps críticos (bloqueo)
1. **Discovery**: ChatGPT descubre el AS por well-known. "Sign in with Vercel" no documenta `/.well-known/oauth-authorization-server`; el well-known que existe es el de OIDC de workload (identidad equivocada para este caso).
2. **Scopes**: no hay scopes de recurso (`mcp:read`); solo identidad de cuenta Vercel.
3. **Audience/resource**: los tokens de "Sign in with Vercel" no se emiten para nuestro MCP como audience; no hay `resource` en el flujo.
4. **Cliente ChatGPT**: no hay CIMD/DCR para que ChatGPT se registre como cliente; el "App" de Vercel es manual y dirigido a apps propias.
5. **Redirect de ChatGPT**: no es registrable con certeza.

Por todo esto, **no puede probarse que Vercel cumpla**; la regla de seguridad exige no implementar autenticación sobre una base no verificable.

## 3. Firewall / rate limiting (evidencia)

Esto **sí** es factible con Vercel WAF, con matices de plan:

| Capacidad | Hobby | Pro | Enterprise |
|---|---|---|---|
| Regla de rate limit por path (ej. `/api/mcp`) | 1 regla | 40 reglas | 1000 |
| Clave de conteo `ip` / `ja4` | ✅ | ✅ | ✅ |
| Clave de conteo por `header:` (ej. por subject/principal) | ❌ | ❌ | ✅ (Enterprise) |
| Algoritmo | Fixed window | Fixed window | Fixed window / Token bucket |

- Una regla **por IP** sobre `/api/mcp` es posible en Pro. El **bucketing por principal OAuth** (header) requiere **Enterprise**.
- `@vercel/firewall` (SDK) permite `checkRateLimit` con `rateLimitKey` custom dentro del código, sujeto a las mismas limitaciones de plan.
- Las reglas se aplican sin redeploy (dashboard/CLI `vercel firewall`).

Implicación: el rate limiting de red (por IP) es viable; el rate limiting fino por identidad OAuth no lo es sin Enterprise. **No se aprovisionó ni publicó ninguna regla.**

## 4. Arquitectura implementada

```text
ChatGPT ── OAuth Authorization Code + PKCE ──> Auth0
   │                                           │
   │         access token (aud = MCP)          │
   └───────────────────────────────────────────┘
   │
   └── Bearer JWT ──> Vercel /api/mcp ──> consultas Prisma acotadas
```

El endpoint publica RFC 9728 Protected Resource Metadata en `/.well-known/oauth-protected-resource`. Cada request requiere un JWT Auth0 RS256 válido según JWKS, `iss`, `aud`, `exp`/`nbf` y el scope `mcp:read`. Una segunda barrera aplica una allowlist propia por `sub` o email verificado: una cuenta válida del tenant no da acceso automáticamente.

Fuentes actuales:

- [Autenticación de servidores MCP en OpenAI](https://developers.openai.com/plugins/build/auth)
- [Registro de aplicaciones Auth0 con CIMD](https://auth0.com/docs/get-started/auth0-overview/create-applications/register-applications-with-cimd)
- [Resource Parameter Compatibility Profile de Auth0](https://auth0.com/ai/docs/mcp/guides/resource-param-compatibility-profile)
- [Scopes de APIs Auth0](https://auth0.com/docs/get-started/apis/scopes/api-scopes)
- [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)

El servidor registra nueve herramientas de lectura:

| Herramienta | Resultado | Límites |
|---|---|---|
| `resumen_financiero` | Totales agregados cobrados, pagados, pendientes y vencidos | Rango de hasta 366 días |
| `consultar_clientes` | ID, nombre y cantidad de proyectos | 1–50 filas por página; búsqueda de hasta 100 caracteres |
| `consultar_proyectos` | Identidad, cliente, estado, fechas, importes acordados y conteos | 1–50 filas por página; filtros estrictos |
| `flujo_fondos` | Ingresos y gastos pendientes con tipo/categoría, estado, vencimiento, fecha efectiva, moneda original, USD, cliente y proyecto disponibles | Rango de hasta 366 días y 1–50 filas por lado/página |
| `consultar_ingresos` | Movimientos individuales y sus relaciones de negocio | Filtros por fechas, proyecto, cliente, estado y tipo; 1–50 filas por página |
| `consultar_gastos` | Movimientos individuales y sus relaciones de negocio | Filtros por fechas, proyecto, categoría, estado y tipo; 1–50 filas por página |
| `detalle_proyecto` | Contrato, resumen financiero, ingresos por tipo y movimientos del proyecto | UUID estricto y hasta 50 movimientos por lado/página |
| `planificacion_proyecto` | Fases, tareas e hitos con fechas, estado, descripción, orden y avance derivado | UUID estricto y 1–50 tareas por página |
| `resumen_proyectos` | Portafolio con contrato, totales financieros y avance derivado | 1–50 proyectos por página; filtros estrictos |

Las fechas deben existir en el calendario y usar `YYYY-MM-DD`. Los filtros financieros admiten como máximo 366 días. El estado vencido se deriva únicamente para movimientos pendientes cuya fecha de vencimiento ya pasó; el avance se calcula sobre tareas y excluye hitos. No se exponen notas de clientes, proyectos o movimientos, contactos, enlaces privados, visibilidad del portal, credenciales de acceso, contraseñas, hashes, cookies, tokens, secretos ni URLs de conexión. El modelo no contiene responsables, horas, prioridades, dependencias ni comentarios de tareas, por lo que esos datos no se inventan. No hay SQL, Prisma genérico, ejecución arbitraria ni herramientas de mutación.

## 5. Flags y configuración

`BROCO_MCP_ENABLED` debe valer exactamente `true`; cualquier otro valor oculta el endpoint y su metadata con 404. `BROCO_MCP_KILL=true` prevalece sobre todo y los oculta en el deployment que ya recibió ese valor. En Vercel, cambiar una variable de entorno requiere un nuevo deployment: no es un kill switch instantáneo sobre el deployment activo. Una configuración incompleta falla cerrada con 503 genérico.

Configuración prevista, con marcadores y sin valores reales:

```text
BROCO_MCP_ENABLED=false
BROCO_MCP_KILL=true
BROCO_MCP_AUTH0_ISSUER=https://TENANT_REGION.auth0.com/
BROCO_MCP_RESOURCE_URL=https://APP_DOMAIN/api/mcp
BROCO_MCP_AUTH0_AUDIENCE=https://APP_DOMAIN/api/mcp
BROCO_MCP_ALLOWED_SUBJECTS=AUTH0_SUB_1,AUTH0_SUB_2
BROCO_MCP_ALLOWED_EMAILS=
BROCO_MCP_AUTH0_EMAIL_CLAIM=https://APP_DOMAIN/claims/email
BROCO_MCP_AUTH0_EMAIL_VERIFIED_CLAIM=https://APP_DOMAIN/claims/email_verified
```

El audience debe ser idéntico al resource URL. Conviene cargar la configuración con el kill switch activo y retirarlo como último paso operativo.

### Runbook de emergencia

1. Como contención inmediata, si Vercel Firewall está disponible, bloquear manualmente el path exacto `/api/mcp`. Esta regla se aplica sin redeploy y no se cambia desde este repositorio.
2. Establecer `BROCO_MCP_KILL=true` en Vercel y hacer redeploy. Verificar que tanto `/api/mcp` como `/.well-known/oauth-protected-resource` respondan 404.
3. Mantener el bloqueo de Firewall hasta investigar, revisar logs sin exponer tokens ni datos y decidir la recuperación.

Un kill switch realmente instantáneo requeriría en el futuro una fuente de configuración dinámica, con su propio diseño de disponibilidad, autorización y auditoría. Esta Fase 1 no agrega proveedores, base de datos ni otra fuente dinámica para ello.

## 6. Guía manual para un tenant Auth0 gratuito

Los nombres exactos de las pantallas pueden variar. Antes de habilitar producción, comparar las opciones del tenant con la documentación oficial enlazada arriba.

1. **Crear la API del MCP.** En **Applications → APIs → Create API**, usar como Identifier la URL HTTPS pública exacta del MCP, por ejemplo `https://APP_DOMAIN/api/mcp`. Ese mismo valor será audience y parámetro OAuth `resource`. Mantener firma **RS256**. En Permissions, agregar solamente `mcp:read`.

2. **Habilitar Resource Parameter Compatibility Profile.** En **Settings → Advanced** del tenant, activar este perfil para que Auth0 acepte `resource` y lo refleje como audience. Activar también **Include Issuer in Authorization Responses**, que permite a ChatGPT identificar de manera estable el issuer que respondió.

3. **Habilitar CIMD.** En la misma configuración avanzada, activar **CIMD Registration**. ChatGPT publica el documento estable `https://chatgpt.com/oauth/client.json`. En **Applications → Create Application**, importar desde esa URL y revisar lo mostrado antes de confirmar. Debe ser un cliente público con Authorization Code, PKCE S256 y `token_endpoint_auth_method=none`; no requiere guardar un client secret. Con identificación de issuer, el redirect estable es `https://chatgpt.com/connector_platform_oauth_redirect`.

4. **Limitar grants y scopes.** Autorizar a ese cliente solo para la API MCP y `mcp:read`. No conceder scopes de escritura ni Management API. Confirmar que el token emitido tenga `iss` igual al issuer del tenant, `aud` igual a la URL MCP y `scope` o `permissions` con `mcp:read`.

5. **Configurar la allowlist.** La opción preferida es copiar el claim inmutable `sub` de cada usuario autorizado a `BROCO_MCP_ALLOWED_SUBJECTS`. Si se necesita autorizar por email, agregar con una Auth0 Post Login Action dos claims personalizados y namespaced: email y email verificado. Configurar esos nombres en las variables correspondientes. El servidor ignora el email cuando su claim de verificación no es verdadero.

6. **Configurar issuer y conector.** Copiar el `issuer` de discovery de Auth0, con HTTPS y slash final, a `BROCO_MCP_AUTH0_ISSUER`. En ChatGPT, registrar `https://APP_DOMAIN/api/mcp` y verificar que el consentimiento solicite solo `mcp:read`. No copiar tokens ni secretos al repositorio.

Si el tenant gratuito no ofrece CIMD, detener la habilitación y revisar el plan o registrar el cliente público manualmente con los mismos metadatos y el redirect que muestre ChatGPT para esa conexión. No sustituir este flujo por la cookie web, `APP_PASSWORD`, una API key compartida ni credenciales existentes.

## 7. Habilitación futura

1. Crear y revisar el tenant, API, scope y cliente CIMD en Auth0.
2. Mantener `BROCO_MCP_KILL=true` mientras se cargan las variables.
3. Verificar metadata, desafío 401, token válido y todos los rechazos previstos.
4. Configurar y observar Firewall/rate limiting en Vercel.
5. Cambiar `BROCO_MCP_ENABLED=true` y retirar el kill switch como último paso, seguido de redeploy.
6. Ante cualquier anomalía, bloquear primero `/api/mcp` manualmente con Vercel Firewall si está disponible; luego restaurar `BROCO_MCP_KILL=true` y redeploy.

No se hizo push, deploy, configuración externa ni acceso a producción en esta fase.
