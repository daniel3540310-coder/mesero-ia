# Mesero IA

SaaS para restaurantes: los clientes escanean un QR por mesa, ven el menú y hablan con un
asistente de IA (Gemini) que responde únicamente con la información que el restaurante
configuró. Ver [claude.md](./claude.md) para la especificación completa del producto.

## Stack

- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Supabase (Postgres + Auth + Storage + Edge Functions)
- IA: Google Gemini (llamada desde una Edge Function, nunca desde el navegador)
- Deploy: Vercel (frontend) + Supabase (backend)

## Estado del código

Todo el código de la aplicación está implementado: login, panel Owner, panel del
restaurante (info, menú, ingredientes, políticas, info para la IA, mesas con QR/PDF,
pedidos en tiempo real) y el flujo del cliente (menú, chat con IA, carrito, confirmar
pedido).

Lo que **falta antes de que funcione contra datos reales** es exclusivamente
configuración de tu propio proyecto de Supabase — no falta código.

## Pasos pendientes (uso obligatorio antes de operar con datos reales)

1. **Credenciales del frontend** — en `.env`, reemplaza:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key
   ```
   (Dashboard de Supabase → Settings → API)

2. **Ejecutar la migración SQL** — copia y corre el contenido de
   `supabase/migrations/0001_init.sql` en el SQL Editor de tu proyecto Supabase
   (o `supabase db push` si usas la CLI vinculada a tu proyecto). Crea todas las
   tablas, RLS y el bucket de Storage `menu-images`.

3. **Desplegar las Edge Functions**:
   ```
   supabase functions deploy gemini-chat
   supabase functions deploy admin-restaurants
   ```

4. **Configurar el secret de Gemini** (la Edge Function lo usa, no el frontend):
   ```
   supabase secrets set GEMINI_API_KEY=tu-gemini-api-key-desde-.env
   ```

5. **Crear al usuario Owner** (no existe registro público, este es el único mecanismo):
   ```
   SUPABASE_URL=https://tu-proyecto.supabase.co ^
   SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key ^
   OWNER_USERNAME=admin ^
   OWNER_PASSWORD=una-contraseña-segura ^
   npm run create-owner
   ```
   (`SUPABASE_SERVICE_ROLE_KEY` está en Settings → API → service_role. Nunca la pongas
   en `.env` del frontend ni la subas a git.)

6. Inicia sesión en `/login` con ese usuario/contraseña → entrarás al panel Owner, desde
   donde puedes crear restaurantes (eso crea su usuario/contraseña automáticamente vía
   `admin-restaurants`).

## Desarrollo local

```
npm install
npm run dev
```

Antes de completar los pasos 1-5, la app carga y navega, pero cualquier operación
contra Supabase (login, menú, pedidos, chat) fallará con un error de credenciales o red
— es esperado hasta configurar el proyecto real.

## Notas de arquitectura

- **Autenticación sin email real**: Owner y Restaurante usan Supabase Auth con un email
  interno `usuario@mesero.local`. El usuario nunca ve ni usa ese email, solo su
  username.
- **Gemini nunca se llama desde el navegador**: la Edge Function `gemini-chat` arma el
  contexto del restaurante (menú, políticas, info autorizada) y llama a Gemini
  server-side, para no exponer la API key en el bundle público.
- **El chat no se persiste en base de datos** en este MVP: vive en memoria del cliente
  durante la sesión, para mantener el alcance simple.
- **El QR de cada mesa** codifica una URL `/menu/:qrToken`; el token actúa como
  capability-token (no hay forma de enumerar mesas sin conocerlo).
