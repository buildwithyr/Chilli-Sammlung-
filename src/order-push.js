// Meldet dieses Gerät für Web-Push-Benachrichtigungen bei neuen
// Bestellanfragen an (nur im echten Modus, nicht im Testmodus möglich).

// Öffentlicher VAPID-Schlüssel - unbedenklich im Code, ist nicht geheim.
const ORDER_PUSH_VAPID_PUBLIC_KEY = "BOtcohu3AR5gh9UoVKAoYYtvKv8QoUCnbClX0oI6Av__7QgcORvm6N_wO2tfjKiQmAZqgP83hYjz-Qfi7fGL4mc";

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function pushWirdUnterstuetzt() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

async function pushIstAktiv() {
  if (!(await pushWirdUnterstuetzt())) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return Boolean(sub);
}

async function pushAktivieren() {
  if (ORDER_TEST_MODE) throw new Error("Push-Benachrichtigungen funktionieren nur im echten Modus, nicht im Testmodus.");
  if (!(await pushWirdUnterstuetzt())) {
    throw new Error("Dieser Browser unterstützt keine Push-Benachrichtigungen (auf dem iPhone: App über 'Teilen → Zum Home-Bildschirm' installieren und von dort öffnen).");
  }
  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== "granted") throw new Error("Benachrichtigungen wurden nicht erlaubt.");

  const reg = await navigator.serviceWorker.register("sw.js");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(ORDER_PUSH_VAPID_PUBLIC_KEY),
  });
  const json = sub.toJSON();
  const { error } = await orderSb.from("push_subscriptions").insert({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
  if (error) throw new Error(`Gerät konnte nicht registriert werden: ${error.message}`);
  return true;
}

async function pushDeaktivieren() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await orderSb.from("push_subscriptions").delete().eq("endpoint", endpoint);
}
