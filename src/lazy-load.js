// Große Spezialbibliotheken werden erst geladen, wenn die Funktion geöffnet wird.
const FEATURE_SCRIPTS = {
  chart: "vendor/chart.umd.min.js",
  ocr: "vendor/tesseract.min.js",
  excel: "vendor/xlsx.core.min.js",
};
const featureLoads = new Map();

function loadFeature(name) {
  if (!FEATURE_SCRIPTS[name]) return Promise.reject(new Error(`Unbekannte Funktion: ${name}`));
  if (featureLoads.has(name)) return featureLoads.get(name);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = FEATURE_SCRIPTS[name];
    script.onload = resolve;
    script.onerror = () => reject(new Error(`${name} konnte nicht geladen werden.`));
    document.head.appendChild(script);
  });
  featureLoads.set(name, promise);
  return promise;
}
