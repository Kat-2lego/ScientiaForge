(() => {
  function initAppSidebar() {
    const body = document.body;

    if (!body.classList.contains("app-sidebar-page")) return;
    if (body.dataset.appSidebarReady === "true") return;

    const sidebar = document.getElementById("sidebar");
    const button =
      document.getElementById("menuBtn") ||
      document.getElementById("toggle-sidebar");

    if (!sidebar || !button) return;

    body.dataset.appSidebarReady = "true";

    const tablet = window.matchMedia("(max-width: 900px)");

    let overlay = document.getElementById("sidebarOverlay");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "sidebarOverlay";
      body.appendChild(overlay);
    }

    overlay.classList.add("sidebar-overlay");
    overlay.setAttribute("aria-hidden", "true");

    button.setAttribute("type", "button");
    button.setAttribute("aria-controls", sidebar.id);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Open navigation");

    function isOpen() {
      return body.classList.contains("app-sidebar-open");
    }

    function setOpen(open, restoreFocus = false) {
      open = Boolean(open && tablet.matches);

      body.classList.toggle("app-sidebar-open", open);

      /* Clear legacy drawer state; this controller owns navigation. */
      sidebar.classList.remove("open");
      overlay.classList.remove("visible");

      button.setAttribute("aria-expanded", String(open));
      button.setAttribute(
        "aria-label",
        open ? "Close navigation" : "Open navigation"
      );

      sidebar.inert = tablet.matches && !open;

      if (tablet.matches) {
        sidebar.setAttribute("aria-hidden", String(!open));
      } else {
        sidebar.removeAttribute("aria-hidden");
      }

      if (open) {
        sidebar.querySelector("a[href], button")?.focus();
      } else if (restoreFocus) {
        button.focus();
      }
    }

    /*
      Capture these specific clicks before older page-level
      sidebar handlers can toggle the drawer a second time.
    */
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest("#menuBtn, #toggle-sidebar") === button) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(!isOpen(), isOpen());
        return;
      }

      if (target === overlay && tablet.matches) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false, true);
        return;
      }

      if (target.closest("#sidebar a") && tablet.matches) {
        setOpen(false);
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      if (!isOpen()) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false, true);
        return;
      }

      if (event.key === "Tab") {
        const controls = [
          button,
          ...sidebar.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), ' +
            'select:not([disabled]), textarea:not([disabled]), ' +
            '[tabindex]:not([tabindex="-1"])'
          )
        ].filter((element) => element.getClientRects().length > 0);

        const current = controls.indexOf(document.activeElement);
        const next = event.shiftKey
          ? (current <= 0 ? controls.length - 1 : current - 1)
          : (current + 1) % controls.length;

        event.preventDefault();
        controls[next]?.focus();
      }
    });

    tablet.addEventListener("change", () => setOpen(false));
    setOpen(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAppSidebar);
  } else {
    initAppSidebar();
  }
})();