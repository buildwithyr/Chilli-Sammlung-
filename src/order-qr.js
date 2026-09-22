// Zeigt im Hauptmenü einen QR-Code, der zur öffentlichen Bestellseite führt.
(function initOrderQr() {
  const menuBtn = document.getElementById("menuOrderQrBtn");
  const modal = document.getElementById("orderQrModal");
  if (!menuBtn || !modal) return;

  const closeBtn = document.getElementById("orderQrCloseBtn");
  const codeEl = document.getElementById("orderQrCode");
  const linkEl = document.getElementById("orderQrLink");

  function bestellUrl() {
    const url = new URL("bestellen.html", location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  menuBtn.addEventListener("click", () => {
    const url = bestellUrl();
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    codeEl.innerHTML = "";
    const card = document.createElement("div");
    card.className = "qr-label";
    const wrap = document.createElement("div");
    wrap.className = "qr-code-canvas";
    wrap.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    card.appendChild(wrap);
    codeEl.appendChild(card);
    linkEl.textContent = url;
    modal.hidden = false;
    document.getElementById("menuDropdown")?.setAttribute("hidden", "");
  });

  closeBtn?.addEventListener("click", () => {
    modal.hidden = true;
  });
})();
