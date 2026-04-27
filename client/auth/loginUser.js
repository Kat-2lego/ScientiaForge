function handleSignIn() {
  const email = document.getElementById("sf-email").value.trim();
  const password = document.getElementById("sf-pass").value;

  if (!email || !password) {
    alert("Please fill in all fields.");
    return;
  }

  if (password.length < 8) {
    alert("Password must be at least 8 characters.");
    return;
  }

  const btn = document.querySelector(".btn-primary");
  btn.textContent = "Signing in…";
  btn.disabled = true;

  fetch("http://localhost:5001/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  })
    .then((resp) => {
      if (!resp.ok) {
        return resp.json().then((err) => {
          throw new Error(err.error || "Login failed.");
        });
      }
      return resp.json();
    })
    .then((data) => {
      // Optional: store user ID (later you can use tokens / Supabase helpers)
      // localStorage.setItem("user_id", data.user.id);

      // Redirect to dashboard
      window.location.href = "../pages/Dashboard.html";
    })
    .catch((err) => {
      alert("Error: " + err.message);
      btn.textContent = "Sign In";
      btn.disabled = false;
    });
}

// Password toggle (use this in Login.html)
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