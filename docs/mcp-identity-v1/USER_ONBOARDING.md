# Conectar Broco App con ChatGPT

## Requisitos previos

1. Tu usuario debe existir en Broco App.
2. Debe estar **Activo** y tener rol `ADMIN` o `COLLABORATOR`.
3. Usá en Auth0 el mismo correo que figura en Broco App.
4. Verificá ese correo durante el inicio de sesión.

## Conexión

Usuario creado en Broco → conecta Broco App en ChatGPT → inicia sesión en Auth0 → verifica el email → vuelve a conectar si la verificación ocurrió después del primer login → la primera herramienta crea el vínculo seguro con Broco App.

Broco aplica el rol y los permisos actuales del usuario en cada solicitud.

## Acceso según rol

Un `COLLABORATOR` puede consultar sus Tareas, sus Tiempos y el contexto operativo de proyectos permitidos por sus asignaciones. No puede acceder a Finanzas, Administración ni planificación/Gantt.

Un `ADMIN` conserva el acceso correspondiente a las herramientas administrativas y financieras habilitadas.

Si el correo todavía no está verificado, MCP lo indica explícitamente y no crea el vínculo.
