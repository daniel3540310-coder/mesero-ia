// Script de un solo uso para crear al único usuario Owner de la plataforma.
// No hay registro público: este es el único mecanismo para crear ese usuario.
//
// Uso:
//   SUPABASE_URL=https://tu-proyecto.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key \
//   OWNER_USERNAME=admin \
//   OWNER_PASSWORD=una-contraseña-segura \
//   npx tsx scripts/create-owner.ts

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const username = process.env.OWNER_USERNAME;
const password = process.env.OWNER_PASSWORD;

if (!supabaseUrl || !serviceRoleKey || !username || !password) {
  console.error(
    "Faltan variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_USERNAME, OWNER_PASSWORD"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const email = `${username!.trim().toLowerCase()}@mesero.local`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "owner" },
  });

  if (error) {
    console.error("Error creando el Owner:", error.message);
    process.exit(1);
  }

  console.log(`Owner creado correctamente. Usuario: ${username}, id: ${data.user.id}`);
}

main();
