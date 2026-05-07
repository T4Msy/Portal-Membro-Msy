/**
 * MSY Portal — Edge Function send-push
 * Envia Web Push (VAPID) usando subscriptions em push_subscriptions.
 *
 * Deploy: supabase functions deploy send-push --no-verify-jwt
 *
 * Secrets obrigatórios (além dos que o Supabase injeta):
 *   supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..."
 * Opcional: VAPID_SUBJECT="mailto:seu@email.com"
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SubRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

function err(status: number, msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return err(405, "Method not allowed");
  }

  // ── Verificar JWT do chamador ──────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return err(401, "Token de autenticação ausente");
  }
  const token = authHeader.slice(7);

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: { user }, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !user) {
    return err(401, "Token inválido ou expirado");
  }

  // ── Verificar se o chamador é diretoria ───────────────
  const { data: prof } = await serviceClient
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .single();

  if (prof?.tier !== "diretoria") {
    return err(403, "Acesso restrito à diretoria");
  }

  // ── Verificar VAPID ───────────────────────────────────
  const vapidPublic  = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@portalmsy.site";

  if (!vapidPublic || !vapidPrivate) {
    return err(500, "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configurados");
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  // ── Parsear e validar body ─────────────────────────────
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
    return err(400, "JSON inválido");
  }

  const broadcast     = body.all === true;
  const targetUserId  = body.userId;

  if (!broadcast && (targetUserId === undefined || targetUserId === null || targetUserId === "")) {
    return err(400, "Informe userId ou all: true");
  }

  if (!broadcast && !UUID_RE.test(targetUserId as string)) {
    return err(400, "userId deve ser um UUID válido");
  }

  const title   = body.title ?? "MSY Portal";
  const text    = body.body  ?? "";
  const openUrl = body.url   ?? "/dashboard.html";
  const icon    = body.icon;

  const payload = JSON.stringify({ title, body: text, url: openUrl, icon });

  // ── Buscar subscriptions ───────────────────────────────
  let rows: SubRow[] = [];

  if (broadcast) {
    const { data: prefs } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("notif_push", true);

    const ids = (prefs ?? []).map((p: { id: string }) => p.id);
    if (ids.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, message: "Nenhum perfil com push ativo" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data, error: subErr } = await serviceClient
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", ids);

    if (subErr) return err(500, subErr.message);
    rows = (data ?? []) as SubRow[];
  } else {
    const { data: profPush } = await serviceClient
      .from("profiles")
      .select("notif_push")
      .eq("id", targetUserId as string)
      .maybeSingle();

    if (profPush?.notif_push === false) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, skipped: "notif_push desligado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data, error: subErr } = await serviceClient
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .eq("user_id", targetUserId as string);

    if (subErr) return err(500, subErr.message);
    rows = (data ?? []) as SubRow[];
  }

  // ── Enviar ─────────────────────────────────────────────
  let sent = 0;
  const errors: string[] = [];

  for (const sub of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload,
        { TTL: 86_400 },
      );
      sent++;
    } catch (e: unknown) {
      const statusCode =
        typeof e === "object" && e !== null && "statusCode" in e
          ? (e as { statusCode?: number }).statusCode
          : undefined;
      if (statusCode === 410 || statusCode === 404) {
        await serviceClient.from("push_subscriptions").delete().eq("id", sub.id);
      }
      errors.push(e instanceof Error ? e.message : String(e));
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
