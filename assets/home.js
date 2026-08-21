(() => {
  const carousel = document.querySelector("[data-carousel]");
  if (carousel) (async () => {
    const viewport = carousel.querySelector(".carousel-viewport");
    const curated = new Set([...viewport.querySelectorAll("[data-song]")].map((slide) => slide.dataset.song));
    const fallbackImages = [
      "assets/seo/bloody-hopes-remembrance-1200x900.jpg",
      "assets/article-images/austerlitz/russian-troops-1802-1805-nypl.jpg",
      "assets/article-images/behind-the-army/city-point-wagon-park-1863.jpg",
    ];
    try {
      const response = await fetch("critical-catalog.json");
      if (!response.ok) throw new Error("Catalog unavailable");
      const catalog = await response.json();
      catalog.songs.filter((song) => !curated.has(song.slug)).forEach((song, index) => {
        const slide = document.createElement("article");
        slide.className = "carousel-slide";
        slide.dataset.song = song.slug;
        slide.style.setProperty("--slide-image", `url('${fallbackImages[index % fallbackImages.length]}')`);
        slide.setAttribute("aria-roledescription", "slide");
        slide.setAttribute("aria-hidden", "true");
        const copy = document.createElement("div"); copy.className = "carousel-copy";
        const era = document.createElement("span"); era.className = "carousel-era"; era.textContent = "From the complete archive";
        const title = document.createElement("h3"); title.textContent = song.title;
        const description = document.createElement("p"); description.textContent = song.description;
        const actions = document.createElement("div"); actions.className = "carousel-actions";
        const link = document.createElement("a"); link.href = `songs/${song.slug}`; link.textContent = "Lyrics & history →";
        actions.append(link); copy.append(era, title, description, actions); slide.append(copy); viewport.append(slide);
      });
    } catch (error) { console.warn(error.message); }

    const slides = [...carousel.querySelectorAll(".carousel-slide")];
    const count = carousel.querySelector("[data-carousel-count]");
    const progress = carousel.querySelector("[data-carousel-progress]");
    const toggle = carousel.querySelector("[data-carousel-toggle]");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let current = 0;
    let timer = null;
    let manuallyPaused = reducedMotion.matches;

    function show(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === current;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", String(!active));
      });
      slides[current].setAttribute("aria-label", `${current + 1} of ${slides.length}`);
      count.textContent = `${String(current + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
      progress.style.width = `${((current + 1) / slides.length) * 100}%`;
    }

    function stop() { clearInterval(timer); timer = null; }
    function start() {
      stop();
      if (!manuallyPaused && !reducedMotion.matches) timer = setInterval(() => show(current + 1), 3000);
    }
    function restart() { if (!manuallyPaused) start(); }
    function syncToggle() {
      toggle.textContent = manuallyPaused ? "Play" : "Pause";
      toggle.setAttribute("aria-pressed", String(manuallyPaused));
      toggle.setAttribute("aria-label", manuallyPaused ? "Start automatic rotation" : "Pause automatic rotation");
    }

    carousel.querySelector("[data-carousel-prev]").addEventListener("click", () => { show(current - 1); restart(); });
    carousel.querySelector("[data-carousel-next]").addEventListener("click", () => { show(current + 1); restart(); });
    toggle.addEventListener("click", () => { manuallyPaused = !manuallyPaused; syncToggle(); manuallyPaused ? stop() : start(); });
    carousel.addEventListener("mouseenter", stop);
    carousel.addEventListener("mouseleave", restart);
    carousel.addEventListener("focusin", stop);
    carousel.addEventListener("focusout", (event) => { if (!carousel.contains(event.relatedTarget)) restart(); });
    reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) stop(); else restart(); });
    show(0); syncToggle(); start();
  })();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add("is-visible"); });
  }, { threshold: 0.12 });
  document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
})();
