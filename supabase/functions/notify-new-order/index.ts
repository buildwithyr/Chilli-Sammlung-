// Edge Function: verschickt eine Web-Push-Benachrichtigung an alle
// registrierten Geräte (Tabelle push_subscriptions), sobald eine neue
// Zeile in bestellanfragen angelegt wird.
//
// Wird über einen Datenbank-Trigger auf bestellanfragen (siehe Migration
// 20260922130000_add_notify_new_order_trigger.sql) via pg_net aufgerufen.
// verify_jwt ist bei dieser Function AUS (siehe Deploy), stattdessen prüft
// sie einen eigenen geheimen Header, der nur dem Trigger bekannt ist -
// damit kann niemand außer der Datenbank diese Function auslösen.
//
// Benötigte Secrets (Supabase Dashboard -> Edge Functions -> Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, INTERNAL_WEBHOOK_SECRET
//   SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY sind als Systemvariablen
//   in jeder Edge Function automatisch vorhanden.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:kontakt@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
  Deno.env.get("VAPID_PRIVATE_KEY") ?? ""
);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

Deno.serve(async (req) => {
  const secret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return new Response("Nicht autorisiert", { status: 401 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Ungültiger Aufruf", { status: 400 });
  }

  const neueZeile = payload?.record;
  const name = neueZeile?.name || "jemand";

  const { data: geraete, error } = await supabase.from("push_subscriptions").select("*");
  if (error) {
    return new Response(`Geräte konnten nicht geladen werden: ${error.message}`, { status: 500 });
  }

  const nachricht = JSON.stringify({
    title: "Neue Bestellanfrage",
    body: `${name} hat eine Bestellanfrage geschickt.`,
    url: "admin.html",
  });

  const ergebnisse = await Promise.allSettled(
    (geraete ?? []).map(async (g) => {
      try {
        await webpush.sendNotification(
          { endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } },
          nachricht
        );
      } catch (err) {
        // Gerät nicht mehr erreichbar (z.B. abgemeldet) -> Eintrag entfernen.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", g.endpoint);
        }
        throw err;
      }
    })
  );

  const fehlgeschlagen = ergebnisse.filter((r) => r.status === "rejected").length;
  return new Response(JSON.stringify({ versendet: ergebnisse.length - fehlgeschlagen, fehlgeschlagen }), {
    headers: { "Content-Type": "application/json" },
  });
});
