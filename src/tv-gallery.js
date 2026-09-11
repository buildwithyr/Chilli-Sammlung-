(function () {
  "use strict";

  const SLIDE_DURATION_MS = 12000;

  function create(options) {
    const root = document.getElementById("tvGallery");
    const stage = document.getElementById("tvGalleryStage");
    const empty = document.getElementById("tvGalleryEmpty");
    const image = document.getElementById("tvGalleryImage");
    const backdrop = document.getElementById("tvGalleryBackdrop");
    const name = document.getElementById("tvGalleryName");
    const variety = document.getElementById("tvGalleryVariety");
    const number = document.getElementById("tvGalleryNumber");
    const origin = document.getElementById("tvGalleryOrigin");
    const year = document.getElementById("tvGalleryYear");
    const heat = document.getElementById("tvGalleryHeat");
    const scoville = document.getElementById("tvGalleryScoville");
    const status = document.getElementById("tvGalleryStatus");
    const description = document.getElementById("tvGalleryDescription");
    const counter = document.getElementById("tvGalleryCounter");
    const playButton = document.getElementById("tvGalleryPlayBtn");
    const fullscreenButton = document.getElementById("tvGalleryFullscreenBtn");

    let slides = [];
    let index = 0;
    let timer = null;
    let playing = true;
    let touchStartX = null;

    function setOptionalText(element, value, prefix) {
      const text = String(value || "").trim();
      element.textContent = text ? `${prefix || ""}${text}` : "";
      element.hidden = !text;
    }

    function firstPhoto(chili) {
      return Array.isArray(chili.fotos) ? chili.fotos.find(Boolean) : "";
    }

    function scheduleNext() {
      clearTimeout(timer);
      timer = null;
      if (!playing || slides.length < 2 || root.hidden) return;
      timer = setTimeout(() => show(index + 1), SLIDE_DURATION_MS);
    }

    function renderHeat(value) {
      const numeric = Math.max(0, Math.min(10, Number.parseFloat(String(value || "").replace(",", ".")) || 0));
      heat.textContent = numeric ? `Schärfe ${String(value).trim()} / 10` : "Schärfe unbekannt";
    }

    function show(nextIndex) {
      if (!slides.length) return;
      index = (nextIndex + slides.length) % slides.length;
      const chili = slides[index];
      const photo = firstPhoto(chili);

      root.classList.remove("slide-visible");
      image.src = photo;
      image.alt = `${chili.name || "Chili"} in der Chili-Sammlung`;
      backdrop.style.backgroundImage = `url(${JSON.stringify(photo)})`;
      name.textContent = chili.name || "Unbenannte Chili";
      setOptionalText(variety, chili.sorte || chili.art);
      setOptionalText(number, chili.nr, "Nr. ");
      setOptionalText(origin, chili.herkunft);
      setOptionalText(year, chili.jahr);
      renderHeat(chili.sg);
      setOptionalText(scoville, chili.scoville, "Scoville: ");
      setOptionalText(status, chili.status);
      setOptionalText(description, chili.geschmack || chili.erntenotizen || chili.notizen);
      counter.textContent = `${index + 1} / ${slides.length}`;

      requestAnimationFrame(() => root.classList.add("slide-visible"));
      scheduleNext();
    }

    function setPlaying(nextPlaying) {
      playing = nextPlaying;
      playButton.textContent = playing ? "Pause" : "Weiter";
      playButton.setAttribute("aria-label", playing ? "Diashow pausieren" : "Diashow fortsetzen");
      scheduleNext();
    }

    function open() {
      slides = (options.getSlides() || []).filter(firstPhoto);
      index = 0;
      root.hidden = false;
      root.setAttribute("aria-hidden", "false");
      document.body.classList.add("tv-gallery-open");
      stage.hidden = slides.length === 0;
      empty.hidden = slides.length !== 0;
      counter.hidden = slides.length === 0;
      setPlaying(true);
      if (slides.length) show(0);
      document.getElementById("tvGalleryCloseBtn").focus();
    }

    async function close() {
      clearTimeout(timer);
      timer = null;
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      document.body.classList.remove("tv-gallery-open");
      if (document.fullscreenElement === root) await document.exitFullscreen().catch(() => {});
      options.onClose?.();
    }

    async function toggleFullscreen() {
      try {
        if (document.fullscreenElement === root) {
          await document.exitFullscreen();
        } else {
          await root.requestFullscreen();
        }
      } catch (_) {
        // Manche Browser erlauben Fullscreen bei Spiegelung nicht. Die Galerie
        // selbst bedeckt trotzdem immer den gesamten sichtbaren Bildschirm.
      }
    }

    function handleKeydown(event) {
      if (root.hidden) return;
      if (event.key === "ArrowLeft") show(index - 1);
      if (event.key === "ArrowRight" || event.key === " ") show(index + 1);
      if (event.key === "Escape" && document.fullscreenElement !== root) close();
      if (event.key.toLowerCase() === "p") setPlaying(!playing);
    }

    document.getElementById("tvGalleryCloseBtn").addEventListener("click", close);
    document.getElementById("tvGalleryPrevBtn").addEventListener("click", () => show(index - 1));
    document.getElementById("tvGalleryNextBtn").addEventListener("click", () => show(index + 1));
    playButton.addEventListener("click", () => setPlaying(!playing));
    fullscreenButton.addEventListener("click", toggleFullscreen);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("fullscreenchange", () => {
      fullscreenButton.textContent = document.fullscreenElement === root ? "Vollbild aus" : "Vollbild";
    });

    root.addEventListener("touchstart", (event) => {
      touchStartX = event.changedTouches[0]?.clientX ?? null;
    }, { passive: true });
    root.addEventListener("touchend", (event) => {
      if (touchStartX === null) return;
      const distance = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
      touchStartX = null;
      if (Math.abs(distance) < 50) return;
      show(index + (distance < 0 ? 1 : -1));
    }, { passive: true });

    return { open, close };
  }

  window.ChiliTvGallery = { create };
})();
