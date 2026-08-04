import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_EMAIL_DOMAIN = "mesero.local";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "No autorizado." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente con el JWT del caller, solo para verificar quién es.
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await callerClient.auth.getUser();

    if (!user || user.user_metadata?.role !== "owner") {
      return jsonResponse({ error: "Solo el Owner puede realizar esta acción." }, 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { name, slug, username, password } = body;
      if (!name || !slug || !username || !password) {
        return jsonResponse({ error: "Faltan campos requeridos." }, 400);
      }

      const email = `${String(username).trim().toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: "restaurant" },
      });
      if (createError) return jsonResponse({ error: createError.message }, 400);

      const { data: restaurant, error: insertError } = await admin
        .from("restaurants")
        .insert({ auth_user_id: created.user.id, name, slug })
        .select()
        .single();

      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return jsonResponse({ error: insertError.message }, 400);
      }

      return jsonResponse({ restaurant });
    }

    if (action === "update") {
      const { id, name, slug } = body;
      const { data: restaurant, error } = await admin
        .from("restaurants")
        .update({ ...(name && { name }), ...(slug && { slug }) })
        .eq("id", id)
        .select()
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ restaurant });
    }

    if (action === "suspend" || action === "reactivate") {
      const { id } = body;
      const status = action === "suspend" ? "suspended" : "active";
      const { data: restaurant, error } = await admin
        .from("restaurants")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ restaurant });
    }

    if (action === "delete") {
      const { id } = body;
      const { data: restaurant } = await admin
        .from("restaurants")
        .select("auth_user_id")
        .eq("id", id)
        .maybeSingle();

      const { error } = await admin.from("restaurants").delete().eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 400);

      if (restaurant?.auth_user_id) {
        await admin.auth.admin.deleteUser(restaurant.auth_user_id);
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Acción no reconocida." }, 400);
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Error interno." }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
