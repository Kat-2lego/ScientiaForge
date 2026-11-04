(() => {
  function initMobileProfiles() {
    document.querySelectorAll(".topbar .profile").forEach((profile) => {
      const avatar = profile.querySelector(".avatar");
      const nameElement = profile.querySelector(".profile-name");

      if (!avatar || !nameElement) return;

      function updateInitial() {
        const name = nameElement.textContent.trim();
        const initial = Array.from(name)[0];

        avatar.dataset.initial = initial
          ? initial.toLocaleUpperCase()
          : "?";

        avatar.setAttribute("role", "img");
        avatar.setAttribute(
          "aria-label",
          name ? `Profile: ${name}` : "Your profile"
        );
      }

      updateInitial();

      const observer = new MutationObserver(updateInitial);

      observer.observe(nameElement, {
        childList: true,
        characterData: true,
        subtree: true
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileProfiles);
  } else {
    initMobileProfiles();
  }
})();
