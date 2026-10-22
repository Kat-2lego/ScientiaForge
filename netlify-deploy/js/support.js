async function loadUserGreeting() {
  // Get the token saved after login
  const token = localStorage.getItem("sb-access-token");
  if (!token) return window.location.href = "/pages/LogIn.html";

  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return window.location.href = "/pages/LogIn.html";

    const { firstName, email } = await res.json();

    document.querySelector(".profile-name").textContent = `${firstName}`;
    document.querySelector(".profile-email").textContent = email;
  } catch (err) {
    console.error("Failed to load user:", err);
  }
}

loadUserGreeting();