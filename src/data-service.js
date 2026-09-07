const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const FOTOS_BUCKET = "chili-fotos";

async function fetchChilis() {
  const { data, error } = await sb.from("chilis").select("*").order("nr", { ascending: true });
  if (error) throw new Error(`Chilis konnten nicht geladen werden: ${error.message}`);
  return data;
}

async function fetchOrders() {
  const { data, error } = await sb.from("bestellungen").select("*");
  if (error) throw new Error(`Bestellungen konnten nicht geladen werden: ${error.message}`);
  return data;
}

async function upsertChiliRemote(data) {
  const { error } = await sb.from("chilis").upsert(data);
  if (error) alert("Speichern fehlgeschlagen: " + error.message);
  return !error;
}

async function updateLinkedChilisRemote(ids, data) {
  if (ids.length === 0) return true;
  const { error } = await sb.from("chilis").update(data).in("id", ids);
  if (error) alert("Verknüpfte Sorten konnten nicht gespeichert werden: " + error.message);
  return !error;
}

async function deleteChiliRemote(id) {
  const { error } = await sb.from("chilis").delete().eq("id", id);
  if (error) alert("Löschen fehlgeschlagen: " + error.message);
  return !error;
}

async function upsertOrderRemote(data) {
  const { error } = await sb.from("bestellungen").upsert(data);
  if (error) alert("Speichern fehlgeschlagen: " + error.message);
  return !error;
}

async function deleteOrderRemote(id) {
  const { error } = await sb.from("bestellungen").delete().eq("id", id);
  if (error) alert("Löschen fehlgeschlagen: " + error.message);
  return !error;
}
