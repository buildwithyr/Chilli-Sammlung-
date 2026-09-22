// Logik der öffentlichen Bestellseite (bestellen.html).

(async function initOrderPublic() {
  const listEl = document.getElementById("chiliList");
  const formEl = document.getElementById("orderForm");
  const emptyEl = document.getElementById("emptyMsg");
  const statusEl = document.getElementById("statusMsg");
  const testBanner = document.getElementById("testBanner");

  if (ORDER_TEST_MODE) testBanner.hidden = false;

  let chilis = [];
  try {
    chilis = await fetchFreigegebeneChilis();
  } catch (e) {
    listEl.textContent = e.message;
    return;
  }

  if (chilis.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  for (const chili of chilis) {
    const card = document.createElement("div");
    card.className = "order-card";
    const info = document.createElement("div");
    info.className = "order-card-info";
    const h3 = document.createElement("h3");
    h3.textContent = chili.name;
    const p = document.createElement("p");
    p.textContent = [chili.sorte, chili.jahr].filter(Boolean).join(" · ");
    info.append(h3, p);

    const qty = document.createElement("input");
    qty.type = "number";
    qty.min = "0";
    qty.max = "99";
    qty.value = "0";
    qty.className = "order-qty";
    qty.dataset.chiliId = chili.id;
    qty.setAttribute("aria-label", `Menge für ${chili.name}`);

    card.append(info, qty);
    listEl.appendChild(card);
  }

  formEl.hidden = false;

  formEl.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    statusEl.textContent = "";
    statusEl.className = "order-status-msg";

    const mengen = {};
    listEl.querySelectorAll(".order-qty").forEach((input) => {
      mengen[input.dataset.chiliId] = input.value;
    });
    const positionen = sammleBestellpositionen(mengen).map((pos) => ({
      ...pos,
      chiliName: chilis.find((c) => c.id === pos.chiliId)?.name || pos.chiliId,
    }));

    const name = document.getElementById("fName").value.trim();
    const kontakt = document.getElementById("fKontakt").value.trim();
    const nachricht = document.getElementById("fNachricht").value.trim();

    if (!istGueltigeKontaktanfrage({ name, kontakt, positionen })) {
      statusEl.textContent = "Bitte Name, Kontakt angeben und mindestens eine Menge über 0 wählen.";
      statusEl.className = "order-status-msg error";
      return;
    }

    const submitBtn = formEl.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await submitBestellanfrage({ name, kontakt, nachricht, positionen });
      statusEl.textContent = "Danke! Deine Bestellanfrage wurde übermittelt.";
      statusEl.className = "order-status-msg ok";
      formEl.reset();
      listEl.querySelectorAll(".order-qty").forEach((input) => (input.value = "0"));
    } catch (e) {
      statusEl.textContent = e.message;
      statusEl.className = "order-status-msg error";
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
