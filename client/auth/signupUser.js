async function handleSignUp() {
  const firstNames = document.getElementById("sf-names").value.trim();
  const email = document.getElementById("sf-email").value.trim();
  const password = document.getElementById("sf-pass").value;

  if (!firstNames || !email || !password) {
    alert("Please fill in all fields.");
    return;
  }

  if (password.length < 8) {
    alert("Password must be at least 8 characters.");
    return;
  }

  const btn = document.querySelector(".secure-submit");
  btn.querySelector(".btn-inner-text").textContent = "Signing up…";
  btn.disabled = true;

  try {
    const resp = await fetch("http://localhost:5001/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        firstNames,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Sign‑up failed.");
    }

    const data = await resp.json();

    // Optional: store user_id or log in silently (if you want)
    // localStorage.setItem("user_id", data.user.id);

    alert("Account created! Please log in.");
    window.location.href = "Login.html";
  } catch (err) {
    alert("Error: " + err.message);
    btn.querySelector(".btn-inner-text").textContent = "Sign Up";
    btn.disabled = false;
  }
}

// Password eye‑toggle (reuse from Login)
function togglePw() {
  const inp = document.getElementById("sf-pass");
  const btn = document.getElementById("sf-eye-icon-btn");
  const icon = btn?.querySelector("i");

  if (!icon) return;

  if (inp.type === "password") {
    inp.type = "text";
    icon.classList.add("fa-eye-slash");
    icon.classList.remove("fa-eye");
  } else {
    inp.type = "password";
    icon.classList.add("fa-eye");
    icon.classList.remove("fa-eye-slash");
  }
}