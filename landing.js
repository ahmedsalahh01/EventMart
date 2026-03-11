(function () {
  const fallbackPrefix = "Client/";
  const images = Array.from(document.querySelectorAll("img[src]"));

  images.forEach((img) => {
    const originalSrc = img.getAttribute("src");
    if (!originalSrc || /^(https?:|data:|\/)/i.test(originalSrc)) return;

    let triedFallback = false;
    img.addEventListener("error", () => {
      if (triedFallback) return;
      triedFallback = true;
      img.src = `${fallbackPrefix}${originalSrc.replace(/^\.?\//, "")}`;
    });
  });
})();

(function () {
  const main = document.querySelector(".home-main");
  const nav = document.querySelector(".navbar");
  if (!main || !nav) return;

  function fitToViewport() {
    const navHeight = nav.offsetHeight || 88;
    document.documentElement.style.setProperty("--navbar-height", `${navHeight}px`);

    // Measure at 1:1 first, then apply the scale.
    document.documentElement.style.setProperty("--fit-scale", "1");
    const baseWidth = main.offsetWidth;
    const baseHeight = main.scrollHeight;
    const availableWidth = Math.max(0, window.innerWidth - 8);
    const availableHeight = Math.max(0, window.innerHeight - navHeight - 16);

    if (!baseWidth || !baseHeight) return;
    const fitScale = Math.min(1, availableWidth / baseWidth, availableHeight / baseHeight);
    document.documentElement.style.setProperty("--fit-scale", `${fitScale}`);
  }

  window.addEventListener("resize", fitToViewport);
  window.addEventListener("load", fitToViewport);
  requestAnimationFrame(fitToViewport);
  setTimeout(fitToViewport, 100);
})();
