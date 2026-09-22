// Logik der geschützten Bestellverwaltung (admin.html) für Papa.

(function initOrderAdmin() {
  const loginView = document.getElementById("loginView");
  const adminView = document.getElementById("adminView");
  const loginForm = document.getElementById("loginForm");
  const loginMsg = document.getElementById("loginMsg");
  const testHint = document.getElementById("testHint");
  const testBanner = document.getElementById("testBanner");
  const logoutBtn = document.getElementById("logoutBtn");
  const tabAnfragenBtn = document.getElementById("tabAnfragenBtn");
  const tabFreigabenBtn = document.getElementById("tabFreigabenBtn");
  const anfragenView = document.getElementById("anfragenView");
  const freigabenView = document.getElementById("freigabenView");
  const pushToggleBtn = document.getElementById("pushToggleBtn");

  if (ORDER_TEST_MODE) {
    testHint.hidden = false;
    testBanner.hidden = false;
  }

  let stopWatching = null;

  async function zeigeRichtigeAnsicht() {
    const eingeloggt = await istPapaEingeloggt();
    loginView.hidden = eingeloggt;
    adminView.hidden = !eingeloggt;
    if (eingeloggt) {
      await ladeAnfragen();
      await aktualisierePushButton();
      if (!stopWatching) {
        stopWatching = watchNeueAnfragen(() => {
          ladeAnfragen();
        });
      }
    } else if (stopWatching) {
      stopWatching();
      stopWatching = null;
    }
  }

  async function aktualisierePushButton() {
    if (!(await pushWirdUnterstuetzt())) {
      pushToggleBtn.hidden = true;
      return;
    }
    pushToggleBtn.hidden = false;
    pushToggleBtn.textContent = (await pushIstAktiv())
      ? "Push-Benachrichtigungen deaktivieren"
      : "Push-Benachrichtigungen aktivieren";
  }

  pushToggleBtn.addEventListener("click", async () => {
    pushToggleBtn.disabled = true;
    try {
      if (await pushIstAktiv()) {
        await pushDeaktivieren();
      } else {
        await pushAktivieren();
      }
    } catch (e) {
      alert(e.message);
    } finally {
      await aktualisierePushButton();
      pushToggleBtn.disabled = false;
    }
  });

  loginForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    loginMsg.textContent = "";
    const email = document.getElementById("lEmail").value.trim();
    const passwort = document.getElementById("lPasswort").value;
    const ok = await papaLogin(email, passwort);
    if (ok) {
      await zeigeRichtigeAnsicht();
    } else {
      loginMsg.textContent = "Anmeldung fehlgeschlagen.";
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await papaLogout();
    await zeigeRichtigeAnsicht();
  });

  tabAnfragenBtn.addEventListener("click", () => {
    anfragenView.hidden = false;
    freigabenView.hidden = true;
    tabAnfragenBtn.className = "btn btn-primary";
    tabFreigabenBtn.className = "btn btn-secondary";
  });

  tabFreigabenBtn.addEventListener("click", async () => {
    anfragenView.hidden = true;
    freigabenView.hidden = false;
    tabFreigabenBtn.className = "btn btn-primary";
    tabAnfragenBtn.className = "btn btn-secondary";
    await ladeFreigaben();
  });

  async function ladeAnfragen() {
    anfragenView.textContent = "Lädt …";
    let anfragen;
    try {
      anfragen = await fetchBestellanfragen();
    } catch (e) {
      anfragenView.textContent = e.message;
      return;
    }
    const offenAnzahl = anfragen.filter((a) => a.status === BESTELL_STATUS.ANGEFRAGT).length;
    tabAnfragenBtn.textContent = offenAnzahl > 0 ? `Bestellanfragen (${offenAnzahl})` : "Bestellanfragen";
    anfragenView.textContent = "";
    if (anfragen.length === 0) {
      const empty = document.createElement("div");
      empty.className = "order-empty";
      empty.textContent = "Noch keine Bestellanfragen.";
      anfragenView.appendChild(empty);
      return;
    }
    for (const a of anfragen) {
      anfragenView.appendChild(renderAnfrage(a));
    }
  }

  function renderAnfrage(a) {
    const el = document.createElement("div");
    el.className = "order-anfrage";

    const head = document.createElement("div");
    head.className = "order-anfrage-head";
    const h3 = document.createElement("h3");
    h3.textContent = a.name;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = BESTELL_STATUS_LABELS[a.status] || a.status;
    head.append(h3, badge);

    const kontakt = document.createElement("p");
    kontakt.textContent = "Kontakt: " + a.kontakt;

    const ul = document.createElement("ul");
    for (const pos of a.positionen) {
      const li = document.createElement("li");
      li.textContent = `${pos.menge}x ${pos.chiliName}`;
      ul.appendChild(li);
    }

    el.append(head, kontakt, ul);

    if (a.nachricht) {
      const nachricht = document.createElement("p");
      nachricht.textContent = "Nachricht: " + a.nachricht;
      el.appendChild(nachricht);
    }

    if (a.status === BESTELL_STATUS.ANGEFRAGT) {
      const actions = document.createElement("div");
      actions.className = "order-anfrage-actions";

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "btn btn-primary";
      confirmBtn.textContent = "Bestätigen";
      confirmBtn.addEventListener("click", async () => {
        confirmBtn.disabled = true;
        try {
          await updateAnfrageStatus(a.id, BESTELL_STATUS.BESTAETIGT);
          await ladeAnfragen();
        } catch (e) {
          alert(e.message);
          confirmBtn.disabled = false;
        }
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-danger";
      cancelBtn.textContent = "Stornieren";
      cancelBtn.addEventListener("click", async () => {
        cancelBtn.disabled = true;
        try {
          await updateAnfrageStatus(a.id, BESTELL_STATUS.STORNIERT);
          await ladeAnfragen();
        } catch (e) {
          alert(e.message);
          cancelBtn.disabled = false;
        }
      });

      actions.append(confirmBtn, cancelBtn);
      el.appendChild(actions);
    }

    return el;
  }

  async function ladeFreigaben() {
    freigabenView.textContent = "Lädt …";
    let chilis;
    try {
      chilis = await fetchAlleChilisMitFreigabe();
    } catch (e) {
      freigabenView.textContent = e.message;
      return;
    }
    freigabenView.textContent = "";
    for (const chili of chilis) {
      const row = document.createElement("div");
      row.className = "order-freigabe-row";
      const label = document.createElement("span");
      label.textContent = chili.name;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = chili.freigegeben;
      checkbox.addEventListener("change", async () => {
        const neuerWert = checkbox.checked;
        checkbox.disabled = true;
        try {
          await setFreigabe(chili.ids, neuerWert);
        } catch (e) {
          alert(e.message);
          checkbox.checked = !neuerWert;
        } finally {
          checkbox.disabled = false;
        }
      });
      row.append(label, checkbox);
      freigabenView.appendChild(row);
    }
  }

  zeigeRichtigeAnsicht();
})();
