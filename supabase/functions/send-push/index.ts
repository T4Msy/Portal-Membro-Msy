/**
 * MSY Portal — Edge Function send-push
 * Envia Web Push (VAPID) usando subscriptions em push_subscriptions.
 *
 * Deploy: supabase functions deploy send-push --no-verify-jwt
 * (ou com JWT se quiser restringir; o browser usa anon + CORS.)
 *
 * Secrets obrigatórios (além dos que o Supabase já injeta):
 *   supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..."
 * Opcional: VAPID_SUBJECT="mailto:seu@email.com"
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SubRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@portalmsy.site";

  if (!vapidPublic || !vapidPrivate) {
    return new Response(
      JSON.stringify({
        error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configurados (secrets da função)",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  let body: {
    userId?: string | null;
    all?: boolean;
    title?: string;
    body?: string;
    url?: string;
    icon?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const broadcast = body.all === true;
  const targetUserId = body.userId;

  if (!broadcast && (targetUserId === undefined || targetUserId === null || targetUserId === "")) {
    return new Response(JSON.stringify({ error: "Informe userId ou all: true" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const title = body.title ?? "MSY Portal";
  const text = body.body ?? "";
  const openUrl = body.url ?? "/dashboard.html";
  const icon = body.icon;

  const payload = JSON.stringify({
    title,
    body: text,
    url: openUrl,
    icon,
  });

  let rows: SubRow[] = [];

  if (broadcast) {
    const { data: prefs } = await supabase.from("profiles").select("id").eq("notif_push", true);
    const ids = (prefs ?? []).map((p: { id: string }) => p.id);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: "Nenhum perfil com push ativo" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", ids);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    rows = (data ?? []) as SubRow[];
  } else {
    const { data: prof } = await supabase
      .from("profiles")
      .select("notif_push")
      .eq("id", targetUserId as string)
      .maybeSingle();

    if (prof && prof.notif_push === false) {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: "notif_push desligado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .eq("user_id", targetUserId as string);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    rows = (data ?? []) as SubRow[];
  }

  let sent = 0;
  const errors: string[] = [];

  for (const sub of rows) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth_key,
      },
    };

    try {
      await webpush.sendNotification(pushSub, payload, { TTL: 86_400 });
      sent++;
    } catch (e: unknown) {
      const statusCode = typeof e === "object" && e !== null && "statusCode" in e
        ? (e as { statusCode?: number }).statusCode
        : undefined;
      if (statusCode === 410 || statusCode === 404) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      sent,
      attempted: rows.length,
      errors: errors.length ? errors.slice(0, 5) : undefined,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
