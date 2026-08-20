window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

// Progressive-enhancement scroll reveal: any element marked `.reveal`
// fades and rises into place once it's scrolled near into view (or,
// for the hero, once the page loads — it's already on screen). The
// animation-bearing CSS in components.css only applies once this script
// adds `.reveal-ready` to <body>, so if it never runs (blocked, JS off,
// error elsewhere on the page) `.reveal` content just renders normally
// instead of getting stuck invisible.
(function () {
  function init() {
    const targets = document.querySelectorAll(".reveal");
    if (!targets.length) return;
    document.body.classList.add("reveal-ready");

    if (!("IntersectionObserver" in window)) {
      targets.forEach(el => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -60px 0px" });

    targets.forEach(el => observer.observe(el));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
