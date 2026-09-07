async function ensureAuthenticated() {
  const gate = document.getElementById("authGate");
  const form = document.getElementById("authForm");
  const emailInput = document.getElementById("authEmail");
  const message = document.getElementById("authMessage");
  const { data } = await sb.auth.getSession();

  if (data.session?.user) {
    gate.hidden = true;
    return true;
  }

  gate.hidden = false;

  return new Promise((resolve) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "Anmeldelink wird gesendet …";
      const { error } = await sb.auth.signInWithOtp({
        email: emailInput.value.trim(),
        options: { emailRedirectTo: location.href.split("?")[0].split("#")[0] },
      });
      message.textContent = error
        ? `Anmeldung fehlgeschlagen: ${error.message}`
        : "Anmeldelink wurde per E-Mail gesendet. Bitte dort öffnen.";
    });
  });
}
