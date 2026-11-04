(() => {
  async function loadHeaderProfile() {
    const profiles = document.querySelectorAll(".topbar .profile");
    if (!profiles.length) return;

    const token = localStorage.getItem("sb-access-token");

    if (!token) {
      console.warn("Header profile: no saved access token.");
      return;
    }

    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.warn(
          "Header profile: user request failed.",
          response.status
        );
        return;
      }

      const { firstName, email } = await response.json();

      profiles.forEach((profile) => {
        const nameElement = profile.querySelector(".profile-name");
        const emailElement = profile.querySelector(".profile-email");
        const avatar = profile.querySelector(".avatar");

        const name = typeof firstName === "string"
          ? firstName.trim()
          : "";

        if (nameElement) {
          nameElement.textContent = name;
        }

        if (emailElement) {
          emailElement.textContent =
            typeof email === "string" ? email : "";
        }

        if (avatar) {
          const initial = Array.from(name)[0];

          avatar.dataset.initial = initial
            ? initial.toLocaleUpperCase()
            : "?";

          avatar.removeAttribute("aria-hidden");
          avatar.setAttribute("role", "img");
          avatar.setAttribute(
            "aria-label",
            name ? `Profile: ${name}` : "Your profile"
          );
        }
      });
    } catch (error) {
      console.warn("Header profile: unable to load user.", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadHeaderProfile);
  } else {
    loadHeaderProfile();
  }
})();