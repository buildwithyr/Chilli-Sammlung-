// Edge Function: benachrichtigt den Kunden per E-Mail, wenn seine
// Bestellanfrage bestätigt oder storniert wurde.
//
// Wird über einen Datenbank-Trigger auf bestellanfragen ausgelöst
// (siehe Migration 20260923100000_add_notify_order_status_trigger.sql).
// Feuert nur, wenn status von 'angefragt' auf 'bestaetigt' oder
// 'storniert' wechselt.
//
// Benötigte Secrets (Supabase Dashboard -> Edge Functions -> Secrets):
//   INTERNAL_WEBHOOK_SECRET – dasselbe wie für notify-new-order
//   RESEND_API_KEY           – API-Key von resend.com (kostenfreies Tier reicht)
//   FROM_EMAIL               – verifizierte Absenderadresse (z. B. bestellungen@ihre-domain.de)

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

  const anfrage = payload?.record;
  if (!anfrage) {
    return new Response("Kein Datensatz im Payload", { status: 400 });
  }

  const { name, kontakt, status } = anfrage;

  // Nur weiter wenn kontakt eine E-Mail-Adresse enthält.
  if (!kontakt || !kontakt.includes("@")) {
    return new Response(JSON.stringify({ info: "Kein E-Mail-Kontakt, kein Versand." }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const bestaetigt = status === "bestaetigt";
  const betreff = bestaetigt
    ? "Deine Bestellanfrage wurde bestätigt"
    : "Deine Bestellanfrage wurde leider storniert";

  const html = bestaetigt
    ? `<p>Hallo ${escHtml(name)},</p>
<p>deine Bestellanfrage bei <strong>Opa Reiters Chili Sammlung</strong> wurde bestätigt. 🌶️</p>
<p>Wir melden uns bei dir, um die weiteren Details (Abholung / Versand) zu klären.</p>
<p>Vielen Dank für dein Interesse!</p>`
    : `<p>Hallo ${escHtml(name)},</p>
<p>leider müssen wir deine Bestellanfrage bei <strong>Opa Reiters Chili Sammlung</strong> stornieren.</p>
<p>Bei Fragen kannst du dich gerne direkt melden.</p>`;

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL") ?? "bestellungen@example.com";

  if (!apiKey) {
    console.error("RESEND_API_KEY nicht gesetzt");
    return new Response("Konfigurationsfehler", { status: 500 });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [kontakt],
      subject: betreff,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend-Fehler:", err);
    return new Response(`E-Mail-Versand fehlgeschlagen: ${err}`, { status: 502 });
  }

  return new Response(JSON.stringify({ versendet: 1, an: kontakt }), {
    headers: { "Content-Type": "application/json" },
  });
});

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
