const nav = document.querySelector(".site-nav");
const toggle = document.querySelector(".nav-toggle");

if (nav && toggle) {
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();

    const isOpen = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", isOpen);
    toggle.setAttribute(
      "aria-label",
      isOpen ? "Close menu" : "Open menu"
    );

    toggle.innerHTML = isOpen
      ? '<i class="fa-solid fa-xmark"></i>'
      : '<i class="fa-solid fa-bars"></i>';
  });

  // Close when clicking outside the navbar
  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target)) {
      closeMenu();
    }
  });

  // Close after selecting a page
  nav.querySelectorAll(".tab, .nav-link, .nav-cta").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  // Close if the screen is resized back to desktop
  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) {
      closeMenu();
    }
  });
}

function closeMenu() {
  nav.classList.remove("open");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open menu");
  toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
}