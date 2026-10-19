# Talonario digital

Talonario digital para que varias personas elijan números del **00 al 100** y el organizador controle quién tiene cada uno.
**No hay pagos**: solo registro de números elegidos.

- **Módulo público** (`/`): cuadrícula de números, selección múltiple, "seleccionar al azar", datos de contacto y ticket digital.
- **Módulo de administración** (`/admin`): mapa de números, asignar/liberar a mano, lista de participantes con buscador, descarga en CSV, configuración (título, descripción, imagen, fecha, límite por persona, abrir/cerrar) y reinicio.
- **Sin base de datos externa**: usa Netlify Blobs (viene incluido en Netlify). Dos personas no pueden quedarse con el mismo número aunque pulsen al mismo tiempo.

## Estructura

```
public/                    Páginas y estilos (HTML/CSS/JS sin build)
netlify/functions/api.mjs  API (Netlify Function) conectada a Netlify Blobs
netlify/functions/lib/     Lógica de la API (se prueba sin Netlify)
test/                      Pruebas automáticas
netlify.toml               Configuración de Netlify
```

## Publicar en Netlify (con GitHub)

1. Sube esta carpeta a un repositorio de GitHub:
   ```bash
   git init
   git add .
   git commit -m "Talonario digital"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```
2. En Netlify: **Add new site → Import an existing project → GitHub** y elige el repositorio.
   No cambies nada: `netlify.toml` ya trae la configuración (publica `public/`, funciones en `netlify/functions`).
3. **Antes o justo después del primer deploy**, define la contraseña del administrador:
   **Site configuration → Environment variables → Add a variable**
   - Clave: `ADMIN_PASSWORD`
   - Valor: la contraseña que quieras (larga y difícil de adivinar)

   Luego haz **Deploys → Trigger deploy** para que la tome.
4. Entra a `https://TU-SITIO.netlify.app/admin`, inicia sesión y, en **Configuración**, pon el título, la descripción y la fecha.
   Comparte con la gente el enlace principal `https://TU-SITIO.netlify.app/`.

> Sin `ADMIN_PASSWORD` el panel queda deshabilitado (por seguridad).

## Correrlo en tu computador

Requiere [Node.js 18+](https://nodejs.org).

```bash
npm install
cp .env.example .env      # y cambia ADMIN_PASSWORD (en Windows: copy .env.example .env)
npm run dev               # abre http://localhost:8888
```

`npm run dev` usa Netlify CLI (se descarga con `npx`) para emular funciones y Blobs en local.
Los datos locales son de prueba y no se mezclan con los del sitio publicado.

Pruebas automáticas de la API: `npm test`

## Notas

- Los datos (nombre y teléfono) solo los ve el administrador. El público únicamente ve qué números están tomados.
- Tras iniciar sesión, el panel conserva la sesión 12 horas (o hasta cerrar la pestaña).
- Para otro talonario nuevo, usa **Configuración → Reiniciar talonario** (descarga antes el CSV si quieres conservar el registro).
- Si cambias la contraseña en Netlify, las sesiones abiertas dejan de funcionar y toca entrar otra vez.
